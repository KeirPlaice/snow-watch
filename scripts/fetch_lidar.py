#!/usr/bin/env python3
"""One-off: fetch an open lidar terrain model for a map and crop it (run in GitHub Actions; see .github/workflows/lidar.yml).

  python3 scripts/fetch_lidar.py innsbruck OUTDIR

innsbruck: Land Tirol "Gelände Tirol" digital terrain model (open data, CC BY 4.0) from data.gv.at,
cropped to the Innsbruck slope map and written as a compressed GeoTIFF in its own CRS.
Prints every resource it finds, so a failed run still shows where the files are.
"""
import json, os, sys, urllib.request, zipfile

AREAS = {"innsbruck": {"bbox": (10.93, 46.91, 11.77, 47.38), "query": "Gelände Tirol",
                       # the slope map's 5 m grid (UTM 32N, one-cell margin): x0, y0 of the 90 m overview, its size, and the fine cell
                       "grid": {"crs": "EPSG:32632", "x0": 648450.0, "y0": 5247000.0, "width": 657, "height": 510, "f": 18, "cell": 5.0}}}
UA = {"User-Agent": "snow-watch-terrain/1.0"}


def get(url, path=None, timeout=600):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if path is None:
            return r.read()
        with open(path, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
    return path


def main():
    area, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    cfg = AREAS[area]
    q = urllib.parse.quote(cfg["query"])
    cands = []
    # data.gv.at has run both a CKAN catalogue and a piveau hub; try each
    for url in (f"https://www.data.gv.at/katalog/api/3/action/package_search?q={q}&rows=20",
                f"https://www.data.gv.at/api/3/action/package_search?q={q}&rows=20",
                f"https://www.data.gv.at/api/hub/search/search?q={q}&filter=dataset&limit=20"):
        try:
            res = json.loads(get(url, timeout=60))
        except Exception as e:
            print("catalogue", url, "->", e)
            continue
        print("catalogue", url, "-> ok")
        if "result" in res and "results" in res["result"] and res["result"]["results"] and "resources" in res["result"]["results"][0]:
            for p in res["result"]["results"]:
                print("PACKAGE", p["name"], "|", p["title"])
                for r in p.get("resources", []):
                    print("   ", r.get("format"), r.get("name"), r["url"])
                    cands.append((p["name"], r.get("name") or "", r["url"], (r.get("format") or "").lower()))
        else:  # piveau: result.results[].distributions[]
            for p in (res.get("result") or {}).get("results") or []:
                t = p.get("title")
                t = t.get("de") or next(iter(t.values()), "") if isinstance(t, dict) else t
                print("DATASET", p.get("id"), "|", t)
                for r in p.get("distributions") or []:
                    nm = r.get("title")
                    nm = (nm.get("de") or next(iter(nm.values()), "")) if isinstance(nm, dict) else (nm or "")
                    for u in (r.get("download_url") or []) + ([r["access_url"]] if isinstance(r.get("access_url"), str) else r.get("access_url") or []):
                        fmt = ((r.get("format") or {}).get("id") or "") if isinstance(r.get("format"), dict) else (r.get("format") or "")
                        print("   ", fmt, nm, u)
                        cands.append((p.get("id"), nm, u, fmt.lower()))
        if cands:
            break
    json.dump(cands, open(os.path.join(out, "resources.json"), "w"), ensure_ascii=False, indent=1)
    # the finest whole-Tirol raster offered as a download: prefer 5 m, then 10 m
    pick = None
    for want in ("5m", "5 m", "10m", "10 m"):
        for pkg, name, url, fmt in cands:
            s = (name + " " + url).lower().replace("_", " ")
            if want in s and ("tif" in s or "zip" in s or fmt in ("tif", "geotiff", "zip")) and "dom" not in s.split():
                pick = (name, url)
                break
        if pick:
            break
    if not pick:
        raise SystemExit("no terrain-model download found; see the resources listed above")
    print("PICK", pick)
    src = os.path.join(out, "src" + (".zip" if pick[1].lower().endswith(".zip") else ".tif"))
    get(pick[1], src, timeout=3000)
    print("downloaded", os.path.getsize(src))
    if src.endswith(".zip"):
        with zipfile.ZipFile(src) as z:
            tifs = [n for n in z.namelist() if n.lower().endswith((".tif", ".tiff"))]
            print("in zip:", z.namelist()[:20])
            z.extract(tifs[0], out)
            tif = os.path.join(out, tifs[0])
    else:
        tif = src
    import rasterio
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds
    with rasterio.open(tif) as d:
        print("source", d.crs, d.res, d.width, d.height, d.nodata)
        b = transform_bounds("EPSG:4326", d.crs, *cfg["bbox"])
        win = from_bounds(*b, d.transform).round_offsets().round_lengths()
        a = d.read(1, window=win)
        prof = d.profile
        prof.update(width=a.shape[1], height=a.shape[0], transform=d.window_transform(win), compress="deflate", predictor=3,
                    tiled=True, blockxsize=512, blockysize=512, BIGTIFF="IF_SAFER")
        if a.dtype.kind == "f":
            prof.update(predictor=3)
        else:
            prof.update(predictor=2)
    with rasterio.open(os.path.join(out, f"{area}_dtm.tif"), "w", **prof) as w:
        w.write(a, 1)
    for f in (src, tif):
        if os.path.exists(f) and f != os.path.join(out, f"{area}_dtm.tif"):
            os.remove(f)
    print("written", a.shape, os.path.getsize(os.path.join(out, f"{area}_dtm.tif")))
    g = cfg.get("grid")
    if g:  # also resample onto the slope map's grid, as decimetres in uint16 (0 = no data), in parts small enough for git
        import gzip
        import numpy as np
        from affine import Affine
        from rasterio.warp import reproject, Resampling
        H2, W2 = g["height"] * g["f"] + 2, g["width"] * g["f"] + 2
        dst = np.full((H2, W2), np.nan, "float32")
        with rasterio.open(os.path.join(out, f"{area}_dtm.tif")) as d:
            reproject(rasterio.band(d, 1), dst, src_nodata=d.nodata, dst_transform=Affine(g["cell"], 0, g["x0"] - g["cell"], 0, -g["cell"], g["y0"] + g["cell"]),
                      dst_crs=g["crs"], dst_nodata=np.nan, resampling=Resampling.bilinear)
        dm = np.where(np.isfinite(dst) & (dst > 0), np.round(dst * 10), 0).astype("<u2")
        print("grid", dm.shape, "covered", round(float((dm > 0).mean()), 3))
        rows = 1000
        os.makedirs(os.path.join(out, "grid"), exist_ok=True)
        for k, r0 in enumerate(range(0, H2, rows)):
            with gzip.open(os.path.join(out, "grid", f"{area}_dm_{k:02d}.u2.gz"), "wb", 6) as f:
                f.write(dm[r0:r0 + rows].tobytes())
        json.dump({"shape": [H2, W2], "rows_per_part": rows, "dtype": "<u2", "unit": "dm", "nodata": 0, **g},
                  open(os.path.join(out, "grid", f"{area}_grid.json"), "w"))
        os.remove(os.path.join(out, f"{area}_dtm.tif"))


if __name__ == "__main__":
    import urllib.parse
    main()
