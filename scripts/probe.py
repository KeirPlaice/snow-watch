import json, urllib.request
base = "https://api.open-meteo.com/v1/forecast?latitude=51.30&longitude=-117.52&timezone=America/Vancouver&forecast_days=7"
lv = [900, 850, 800, 750, 700]
hv = ",".join(f"{v}_{p}hPa" for p in lv for v in ("temperature", "geopotential_height", "wind_speed", "wind_direction"))
for m in ("gem_seamless", "gem_hrdps_continental", "gem_regional", "gem_global", "best_match"):
    u = f"{base}&models={m}&hourly=precipitation,snowfall,freezing_level_height,temperature_2m,{hv}"
    try:
        d = json.load(urllib.request.urlopen(u, timeout=60))
    except Exception as e:
        print(m, "ERR", e); continue
    h = d["hourly"]
    print("==", m, "grid elev", d.get("elevation"), "hours", len(h["time"]))
    for k, v in h.items():
        if k == "time": continue
        n = [i for i, x in enumerate(v) if x is not None]
        print(f"  {k}: {len(n)} values, last at hour {n[-1] if n else None}, sample {v[12]}")
