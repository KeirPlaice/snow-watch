import base64, json, os, urllib.request, urllib.parse
cid = os.environ.get("FROST_CLIENT_ID", "")
print("client id set:", bool(cid))
auth = "Basic " + base64.b64encode((cid + ":").encode()).decode()
def get(path, **q):
    url = "https://frost.met.no/" + path + "?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"Authorization": auth, "User-Agent": "snow-watch/1.0"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, url[:160]); return {}
Z = {"Romsdal": (7.2, 62.25, 8.3, 62.8), "Jotunheimen": (7.9, 61.3, 9.2, 61.9), "Hemsedal": (8.0, 60.6, 9.1, 61.15)}
EL = "wind_speed,wind_from_direction,max(wind_speed_of_gust PT1H),air_temperature,surface_snow_thickness"
for z, (w, s, e, n) in Z.items():
    poly = f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
    src = get("sources/v0.jsonld", types="SensorSystem", geometry=poly, validtime="now", fields="id,name,masl,geometry").get("data", [])
    print(f"\n== {z}: {len(src)} stations")
    if not src: continue
    ids = ",".join(x["id"] for x in src)
    ts = get("observations/availableTimeSeries/v0.jsonld", sources=ids, elements=EL, referencetime="2026-11-01/2026-11-12").get("data", [])
    have = {}
    for t in ts:
        have.setdefault(t["sourceId"].split(":")[0], set()).add(t["elementId"] + "@" + t.get("timeResolution", ""))
    for x in sorted(src, key=lambda x: -(x.get("masl") or 0)):
        h = have.get(x["id"])
        if h:
            c = x.get("geometry", {}).get("coordinates", [None, None])
            print(x["id"], x["name"], x.get("masl"), c, sorted(h))
