import math, urllib.request, io
from PIL import Image
import numpy as np
def xyz(lat, lon, z):
    n = 2 ** z; x = int((lon + 180) / 360 * n); y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n); return x, y
S = {
 "esri": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
 "icgc": "https://geoserveis.icgc.cat/icc_mapesmultibase/noutm/wmts/orto/GRID3857/{z}/{x}/{y}.jpeg",
 "ign": "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg",
 "swisstopo": "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg",
 "basemapat": "https://maps.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg",
 "usgs": "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
}
T = [("esri", 51.30, -117.52, 16), ("icgc", 42.58, 1.0, 17), ("icgc", 42.45, 2.30, 17), ("icgc", 42.47, 2.30, 15),
     ("ign", 45.92, 6.88, 17), ("ign", 42.47, 2.30, 17), ("ign", 42.40, 2.20, 17), ("swisstopo", 46.64, 8.60, 17), ("swisstopo", 45.85, 6.95, 17),
     ("basemapat", 47.15, 11.25, 17), ("basemapat", 46.96, 11.30, 17), ("usgs", 40.31, -105.68, 16), ("usgs", 40.31, -105.68, 17),
     ("esri", 62.49, 7.80, 17), ("esri", 45.85, 6.95, 18)]
import time
for k, lat, lon, z in T:
    x, y = xyz(lat, lon, z); u = S[k].format(x=x, y=y, z=z)
    t0 = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://keirplaice.github.io/"}), timeout=60)
        b = r.read(); ct = r.headers.get("Content-Type")
        info = ""
        if ct and ct.startswith("image"):
            a = np.array(Image.open(io.BytesIO(b)).convert("RGBA")); info = f"{a.shape[:2]} transp {round(float((a[:,:,3]==0).mean()),2)} white {round(float((a[:,:,:3].min(2)>250).mean()),2)} std {round(float(a[:,:,:3].std()),1)}"
        print("RES", k, lat, lon, z, r.status, ct, len(b), info, "cache:", r.headers.get("Cache-Control"), "acao:", r.headers.get("Access-Control-Allow-Origin"), f"{time.time()-t0:.2f}s")
    except Exception as e:
        print("RES", k, lat, lon, z, "ERR", e, f"{time.time()-t0:.2f}s")
