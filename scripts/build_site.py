#!/usr/bin/env python3
"""Builds the Traça website into one folder ready for GitHub Pages.

  python3 scripts/build_site.py --daily out --out _site

page/index.html and page/app.js are the dashboard page (built elsewhere); web/ holds the standalone
runtime, styles, icons and service worker; fixed/ holds terrain and other data that never changes;
--daily is the folder snow_fetch.py just wrote.
"""
import argparse, hashlib, json, os, shutil
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAILY = ["stations_daily", "danger_history", "bulletins", "problems", "outlook", "wind_summary",
         "wind_rose", "avalanche_reports", "regional_forecasts", "snow_grid", "mountain_forecast"]
OPTIONAL = ["snow_grid", "mountain_forecast"]

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="Avalanche danger, snowpack, slope maps and a GPX route check for Rogers Pass, Rossland to Kootenay Pass, Vallter, Innsbruck, Rocky Mountain National Park and Chamonix (Mont Blanc).">
<meta name="theme-color" content="#F5F4EF">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Traça">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<title>Traça</title>
<link rel="stylesheet" href="site.css?v={css_v}">
<script src="d3.min.js"></script>
<script src="runtime.js?v={rt_v}"></script>
</head>
<body>
<div class="sw-site-top"><span class="sw-updated"></span><a href="about.html">About, sources &amp; limits</a></div>
<div id="dash-root">
"""
FOOT = """
</div>
<footer class="sw-site-foot">
  <p><strong>A planning aid, not a go/no-go decision.</strong> The terrain check reads slope models and public bulletins; it can be wrong or out of date. Read the official avalanche bulletin, carry rescue gear, and make your own judgement on the day.</p>
  <p><a href="about.html">About, data sources &amp; licences</a></p>
</footer>
<div class="sw-gate" hidden>
  <div class="sw-gate-box" role="dialog" aria-modal="true" aria-labelledby="sw-gate-h">
    <h2 id="sw-gate-h">Before you use this</h2>
    <p>Traça is a personal planning aid shared among friends. It flags terrain from elevation models and summarises public avalanche bulletins and weather data. It does not know the snowpack, can miss or misplace hazards, and is never a substitute for the official bulletin, avalanche training, rescue gear and your own judgement on the day.</p>
    <p>Nothing here says a slope or route is safe.</p>
    <button type="button" class="sw-gate-ok">I understand</button>
  </div>
</div>
<script>
(() => {
  const g = document.querySelector('.sw-gate');
  let ok = false;
  try { ok = localStorage.getItem('sw-gate-v1') === '1'; } catch (e) { ok = false; }
  if (!ok) { g.hidden = false; document.querySelector('.sw-gate-ok').focus(); }
  document.querySelector('.sw-gate-ok').addEventListener('click', () => { try { localStorage.setItem('sw-gate-v1', '1'); } catch (e) {} g.hidden = true; });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
</script>
</body>
</html>
"""


def h(path):
    return hashlib.sha1(open(path, "rb").read()).hexdigest()[:10]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--daily", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = a.out
    if os.path.exists(out):
        shutil.rmtree(out)
    shutil.copytree(os.path.join(ROOT, "web"), out)
    shutil.copy(os.path.join(ROOT, "page", "app.js"), os.path.join(out, "app.js"))
    page = open(os.path.join(ROOT, "page", "index.html"), encoding="utf-8").read()
    page = page.replace('<meta name="dash-one-writer">', '')
    page = page.replace('<script src="app.js"></script>', f'<script src="app.js?v={h(os.path.join(out, "app.js"))}"></script>')
    html = (HEAD.replace("{css_v}", h(os.path.join(out, "site.css"))).replace("{rt_v}", h(os.path.join(out, "runtime.js")))
            + page + FOOT)
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)
    # data: the fixed files plus today's
    dd = os.path.join(out, "data")
    os.makedirs(dd)
    files = {}
    for src in (os.path.join(ROOT, "fixed"), a.daily):
        for f in sorted(os.listdir(src)):
            if not f.endswith(".json"):
                continue
            ident = f[:-5]
            if src == a.daily and ident not in DAILY:
                continue
            shutil.copy(os.path.join(src, f), os.path.join(dd, f))
            files[ident] = h(os.path.join(dd, f))
    for d in OPTIONAL:  # model files that can be missing on a day the model service is down: ship an empty list
        if d not in files:
            open(os.path.join(dd, d + ".json"), "w").write("[]")
            files[d] = h(os.path.join(dd, d + ".json"))
    missing = [d for d in DAILY if d not in files]
    if missing:
        raise SystemExit(f"missing daily files: {missing}")
    json.dump({"built": datetime.now(timezone.utc).isoformat(timespec="seconds"), "files": files},
              open(os.path.join(dd, "index.json"), "w"))
    # the service worker caches by this version
    sw = os.path.join(out, "sw.js")
    s = open(sw, encoding="utf-8").read().replace("__VERSION__", h(os.path.join(out, "index.html")))
    open(sw, "w", encoding="utf-8").write(s)
    print(f"built {out}: {len(files)} datasets")


if __name__ == "__main__":
    main()
