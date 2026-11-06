#!/usr/bin/env python3
"""Snow & avalanche dashboard: fetch all feeds and write the dashboard's CSV files.

Zones: Rogers Pass (Glacier National Park, BC), Rossland (Rossland Range, BC), Vallter / Ulldeter (Ter-Freser, Catalonia), Innsbruck (Tirol, Euregio),
Rocky Mountain NP (Colorado) and Chamonix (Mont Blanc massif: Météo-France, SLF, Aosta Valley).
Usage: python3 snow_fetch.py OUTDIR [--prev-danger PREVIOUS_danger_history.json] [--prev-stations PREVIOUS_stations_daily.json]
(Innsbruck station history is rebuilt from hourly archives; with --prev-stations only the last few days are re-read.)
Writes: stations_daily.json, danger_history.json, bulletins.json, problems.json, outlook.json
"""
import csv, json, math, re, sys, html, statistics, urllib.request, urllib.parse
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

SEASON_START = date(2026, 10, 1)
UA = {"User-Agent": "snow-dashboard/1.0"}

ROGERS = "Rogers Pass"
VALLTER = "Vallter / Ulldeter"
ROSS = "Rossland"  # the Rossland Range map (Red Mountain to Nancy Greene)
WW = "Whitewater"  # Whitewater and Ymir Mountain, south-east of Nelson
KP = "Kootenay Pass"  # Kootenay Pass and Stagleap on Highway 3
TZ = {ROGERS: ZoneInfo("America/Vancouver"), VALLTER: ZoneInfo("Europe/Madrid"), ROSS: ZoneInfo("America/Vancouver"),
      WW: ZoneInfo("America/Vancouver"), KP: ZoneInfo("America/Vancouver")}

AVCAN_STATIONS = [  # (id, name, elevation m)
    (98, "Rogers Pass", 1315),
    (93, "Fidelity", 1905),
    (96, "MacDonald West Shoulder", 1930),
    (91, "Mt. Abbott", 2130),
    (97, "Rockfall", 2240),  # north of the pass, above the Beaver valley side
    (165, "Klotz", 1975),  # Clachnacudainn Range, west of the pass toward Revelstoke
    (92, "Asulkan", 2025),  # wind and temperature only
    (99, "Round Hill", 2100),  # wind and temperature only, west of Fidelity
]
KOOTENAY_STATIONS = {  # BC MoTI highway avalanche-program stations, via Avalanche Canada
    ROSS: [(75, "Strawberry Pass", 1575), (76, "Paulson Summit", 1535)],
    WW: [(22, "Southridge", 1990), (148, "Hall Creek", 860)],
    KP: [(41, "Kootenay Pass", 1780), (42, "Stagleap", 2140), (88, "Crags Ridge", 2054)],
}
XEMA_STATIONS = [("DG", "Núria", 1971), ("ZC", "Ulldeter", 2413)]
XEMA_VARS = {"38": "depth", "32": "temp", "50": "gust_ms", "35": "precip"}

AVCAN_LEVEL = {"low": 1, "moderate": 2, "considerable": 3, "high": 4, "extreme": 5}
ICGC_LABEL = {1: "Low", 2: "Moderate", 3: "Considerable", 4: "High", 5: "Very high"}


def get(url, params=None):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except (OSError, ValueError):
            if attempt == 3:
                raise
            import time
            time.sleep(3 * (attempt + 1))


def clean(text):
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>|</p>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return re.sub(r"\n\s*\n+", "\n", text).strip()


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


# ---------- station observations, aggregated to local days ----------
def daily_rows(zone, station, elev, obs):
    """obs: list of (local_date, depth, temp, gust_kmh, precip[, mean_wind_kmh])."""
    by_day = {}
    for o in obs:
        d, depth, temp, gust, precip = o[:5]
        wind = o[5] if len(o) > 5 else None
        b = by_day.setdefault(d, {"depth": [], "temp": [], "gust": [], "precip": [], "wind": []})
        for k, v in (("depth", depth), ("temp", temp), ("gust", gust), ("precip", precip), ("wind", wind)):
            if v is not None:
                b[k].append(v)
    rows, prev_depth = [], None
    for d in sorted(by_day):
        b = by_day[d]
        depth = round(statistics.median(b["depth"])) if b["depth"] else None
        change = depth - prev_depth if depth is not None and prev_depth is not None else None
        if depth is not None:
            prev_depth = depth
        rows.append({
            "zone": zone, "station": station, "elevation_m": elev, "date": d.isoformat(),
            "snow_depth_cm": "" if depth is None else depth,
            "depth_change_cm": "" if change is None else change,
            "temp_min_c": round(min(b["temp"]), 1) if b["temp"] else "",
            "temp_max_c": round(max(b["temp"]), 1) if b["temp"] else "",
            "gust_max_kmh": round(max(b["gust"])) if b["gust"] else "",
            "precip_mm": round(sum(b["precip"]), 1) if b["precip"] else "",
            "wind_max_kmh": round(max(b["wind"])) if b["wind"] else "",  # strongest hourly mean wind
            "readings": len(b["temp"]) or len(b["depth"]),
        })
    return rows


def avcan_station(sid, name, elev, today_utc, zone=ROGERS):
    tz, seen, start = TZ[zone], {}, datetime.combine(SEASON_START, datetime.min.time(), timezone.utc)
    while start < today_utc:
        end = min(start + timedelta(days=30), today_utc)
        data = get(f"https://weather.prod.avalanche.ca/stations/{sid}/measurements",
                   {"fromDate": start.strftime("%Y-%m-%dT%H:%M:%SZ"), "toDate": end.strftime("%Y-%m-%dT%H:%M:%SZ")})
        for r in data:  # keyed by timestamp, so chunk boundaries don't double-count
            t = datetime.fromisoformat(r["measurementDateTime"].replace("Z", "+00:00")).astimezone(tz)
            if t.date() >= SEASON_START:
                ta = num(r.get("airTempAvg"))
                ta = ta if ta is not None and -45 <= ta <= 40 and sid not in NO_TEMP else None  # drops sensor faults
                seen[t] = (t.date(), num(r.get("snowHeight")), ta,
                           num(r.get("windSpeedGust")), num(r.get("hourlyPrecip")), num(r.get("windSpeedAvg")))
        start = end
    return daily_rows(zone, name, elev, list(seen.values()))


def xema_station(code, name, elev):
    tz, vals = TZ[VALLTER], {}
    offset = 0
    while True:
        page = get("https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json", {
            "$select": "codi_variable,data_lectura,valor_lectura",
            "$where": f"codi_estacio='{code}' AND data_lectura>='{SEASON_START.isoformat()}T00:00:00' "
                      f"AND codi_variable in('38','32','50','35')",
            "$order": "data_lectura", "$limit": 50000, "$offset": offset})
        for r in page:
            # XEMA timestamps are UTC
            t = datetime.fromisoformat(r["data_lectura"][:19]).replace(tzinfo=timezone.utc).astimezone(tz)
            vals.setdefault(t, {})[XEMA_VARS[r["codi_variable"]]] = num(r["valor_lectura"])
        if len(page) < 50000:
            break
        offset += 50000
    obs = []
    for t, v in vals.items():
        gust = v.get("gust_ms")
        obs.append((t.date(), v.get("depth"), v.get("temp"), None if gust is None else gust * 3.6, v.get("precip")))
    return daily_rows(VALLTER, name, elev, obs)


# ---------- wind: what has been moving snow, and which slopes it loads ----------
WIND_STATIONS = {ROGERS: ("avcan", 96, "MacDonald West Shoulder", 1930), VALLTER: ("xema", "ZC", "Ulldeter", 2413),
                 ROSS: ("avcan", 75, "Strawberry Pass", 1575), WW: ("avcan", 22, "Southridge", 1990),
                 KP: ("avcan", 42, "Stagleap", 2140)}
WIND_HOURS = 72
TRANSPORT_KMH = 15  # hourly mean wind that can start moving loose snow
STRONG_KMH = 30
OCT = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
COMPASS16 = {d: i * 22.5 for i, d in enumerate("N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW".split())}


# extra 72-hour wind cards: (zone, Avalanche Canada station id, name, elevation); each gets a summary under "<zone> · <name>"
EXTRA_WIND = [(KP, 88, "Crags Ridge", 2054), (KP, 41, "Kootenay Pass", 1780),
              (ROGERS, 97, "Rockfall", 2240), (ROGERS, 92, "Asulkan", 2025), (ROGERS, 99, "Round Hill", 2100)]
NO_TEMP = {92}  # Asulkan: its temperature sensor reads -118 °C this autumn and sat at -38 °C for days in October
LAST_OBS = {}  # station name -> time of its newest wind reading (Parks Canada stations reach the feed about a day late)


def wind_obs(zone, now, station=None):
    """[(time_utc, mean_kmh, from_deg, gust_kmh)] over the last WIND_HOURS."""
    kind, sid, name, elev = station or WIND_STATIONS[zone]
    t0 = now - timedelta(hours=WIND_HOURS)
    out = {}
    if kind == "avcan":
        # Parks Canada stations arrive in a daily batch, so the window is the 72 hours up to the newest reading
        recs = get(f"https://weather.prod.avalanche.ca/stations/{sid}/measurements",
                   {"fromDate": (t0 - timedelta(hours=36)).strftime("%Y-%m-%dT%H:%M:%SZ"), "toDate": now.strftime("%Y-%m-%dT%H:%M:%SZ")})
        times = [r["measurementDateTime"] for r in recs if num(r.get("windSpeedAvg")) is not None]
        if times:
            last = datetime.fromisoformat(max(times).replace("Z", "+00:00"))
            LAST_OBS[name] = last
            t0 = last - timedelta(hours=WIND_HOURS)
        for r in recs:
            sp, dr = num(r.get("windSpeedAvg")), COMPASS16.get(r.get("windDirCompass"))
            if sp is not None and dr is not None and datetime.fromisoformat(r["measurementDateTime"].replace("Z", "+00:00")) > t0:
                out[r["measurementDateTime"]] = (sp, dr, num(r.get("windSpeedGust")))
    else:
        rows = {}
        for r in get("https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json", {
                "$select": "codi_variable,data_lectura,valor_lectura",
                "$where": f"codi_estacio='{sid}' AND data_lectura>='{t0.strftime('%Y-%m-%dT%H:%M:%S')}' AND codi_variable in('30','31','50')",
                "$limit": 5000}):
            rows.setdefault(r["data_lectura"], {})[r["codi_variable"]] = num(r["valor_lectura"])
        for t, v in rows.items():
            if v.get("30") is not None and v.get("31") is not None:
                out[t] = (v["30"] * 3.6, v["31"], None if v.get("50") is None else v["50"] * 3.6)
    return [v for _, v in sorted(out.items())], name, elev


def wind_summary(zone, now, stations_rows, given=None):
    obs, name, elev = given if given else wind_obs(zone, now)
    step_h = 0.5 if zone in (VALLTER, "Chamonix · Le Portalet") else 1.0
    rose = {o: {"hours": 0.0, "transport": 0.0, "sum": 0.0} for o in OCT}
    vx = vy = tr_h = strong_h = tr_sum = 0.0
    gust = None
    for sp, dr, g in obs:
        o = OCT[int(((dr + 22.5) % 360) // 45)]
        rose[o]["hours"] += step_h
        rose[o]["sum"] += sp * step_h
        if g is not None:
            gust = g if gust is None else max(gust, g)
        if sp >= TRANSPORT_KMH:
            rose[o]["transport"] += step_h
            tr_h += step_h
            tr_sum += sp * step_h
            # transport rises steeply with speed: weight the direction by (speed - threshold)^2
            w = (sp - TRANSPORT_KMH + 1) ** 2
            vx += w * math.sin(math.radians(dr))
            vy += w * math.cos(math.radians(dr))
        if sp >= STRONG_KMH:
            strong_h += step_h
    from_deg = (math.degrees(math.atan2(vx, vy)) + 360) % 360 if tr_h else None
    loaded = []
    if from_deg is not None:
        lee = (from_deg + 180) % 360
        i = int(((lee + 22.5) % 360) // 45)
        loaded = [OCT[(i - 1) % 8], OCT[i], OCT[(i + 1) % 8]]
    zr = [r for r in stations_rows if r["zone"] == zone]
    last = max((r["date"] for r in zr), default=None)
    recent = [r for r in zr if last and r["date"] > (date.fromisoformat(last) - timedelta(days=3)).isoformat()]
    per_station = {}
    for r in recent:  # new snow in 3 days at the station that gained most (not the zone's stations added together)
        if isinstance(r.get("depth_change_cm"), (int, float)):
            per_station[r["station"]] = per_station.get(r["station"], 0) + max(0, r["depth_change_cm"])
    new3 = max(per_station.values(), default=0)
    depth = max((r["snow_depth_cm"] for r in zr if r["date"] == last and isinstance(r.get("snow_depth_cm"), (int, float))), default=None)
    summary = {
        "zone": zone, "station": name, "elevation_m": elev, "period_hours": WIND_HOURS, "readings": len(obs),
        "transport_hours": round(tr_h, 1), "strong_hours": round(strong_h, 1),
        "mean_transport_kmh": round(tr_sum / tr_h, 1) if tr_h else None,
        "max_gust_kmh": None if gust is None else round(gust),
        "max_wind_kmh": round(max(o[0] for o in obs)) if obs else None,
        "from_deg": None if from_deg is None else round(from_deg),
        "from_dir": None if from_deg is None else OCT[int(((from_deg + 22.5) % 360) // 45)],
        "loaded_aspects": ",".join(loaded), "snow_depth_cm": depth, "new_snow_3d_cm": new3,
        "until": LAST_OBS.get(name, now).strftime("%Y-%m-%dT%H:%MZ"),
    }
    rose_rows = [{"zone": zone, "from_dir": o, "hours": round(v["hours"], 1), "transport_hours": round(v["transport"], 1),
                  "mean_kmh": round(v["sum"] / v["hours"], 1) if v["hours"] else None} for o, v in rose.items()]
    return summary, rose_rows


# ---------- recent avalanche reports: Avalanche Canada Mountain Information Network ----------
MIN_BBOX = "-119.0,50.75,-116.85,51.75"  # Glacier & Mount Revelstoke national parks, Revelstoke, Eagle Pass and the Gorge
MIN_DAYS = 30
PASS = (51.3004, -117.5155)
COUNT = {"1": 1, "2-5": 2, "6-10": 6, "11-50": 11, "51-100": 51}
SIGN = {"avalancheConditionSlab": "recent slab avalanches", "avalancheConditionSound": "whumpfing or shooting cracks",
        "avalancheConditionSnow": "30 cm+ new snow or rain", "avalancheConditionTemp": "rapid warming",
        "recentAvalanches": "recent avalanches", "shootingCracks": "shooting cracks", "whumpfing": "whumpfing",
        "collapsing": "collapsing", "cracking": "cracking", "rapidWarming": "rapid warming"}
TRIG = {"natural": "natural", "skier": "skier", "snowmobile": "snowmobiler", "other": "other", "explosive": "explosives",
        "na": "natural", "s": "skier", "x": "explosives", "skierAccidental": "skier", "skierIntentional": "skier (intentional)",
        "skierRemote": "skier (remote)", "human": "human", "humanAccidental": "human", "unknown": "unknown"}
BAND = {"alp": "alpine", "tln": "treeline", "btl": "below treeline", "alpine": "alpine", "treeline": "treeline", "belowTreeline": "below treeline"}


def _hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def _words(v, table):
    vals = v if isinstance(v, list) else ([v] if v else [])
    return [table.get(x, re.sub(r"(?<!^)(?=[A-Z])", " ", str(x)).lower()) for x in vals]


ROSS_HOME = (49.0781, -117.8000)  # Rossland
# field reports: each map's box plus about 10 km around it, and the point distances are measured from
KOOT_MIN = {ROSS: ("-118.08,48.97,-117.65,49.35", ROSS_HOME), WW: ("-117.35,49.31,-116.95,49.56", (49.4433, -117.1450)),
            KP: ("-117.26,48.95,-116.73,49.26", (49.0581, -117.0400))}


def min_reports(today, zone=ROGERS, bbox=MIN_BBOX, home=PASS):
    items = get("https://avcan-services-api.prod.avalanche.ca/min/submissions",
                {"fromdate": (today - timedelta(days=MIN_DAYS)).isoformat(), "todate": today.isoformat(), "bbox": bbox}).get("items", [])
    rows = []
    for x in items:
        loc = x.get("location") or {}
        lat, lon = loc.get("latitude"), loc.get("longitude")
        if lat is None or lon is None:
            continue
        obs = x.get("observations") or {}
        avs, signs, caught = [], [], None
        # newest form (data_3): sawAvalanche / avalanches[] / instability[] / caught
        for a in x.get("avalanches") or []:
            avs.append({"n": 1, "size": num(a.get("size")), "trigger": _words(a.get("startedBy"), TRIG),
                        "aspect": a.get("aspect") or [], "elev": _words(a.get("elevation"), BAND),
                        "type": _words(a.get("problem"), {}), "when": a.get("date")})
        signs += [SIGN.get(s, s) for s in (x.get("instability") or []) if s and s != "none"]
        if x.get("caught") == "yes":
            caught = "someone caught"
        # older forms (data_1 / data_2): observations.avalanche / quick / incident
        a = obs.get("avalanche")
        if a:
            avs.append({"n": COUNT.get(str(a.get("numberOfAvalanches")), 1), "label": str(a.get("numberOfAvalanches") or "1").replace("-", "–"), "size": num(a.get("avalancheSize")),
                        "trigger": _words(a.get("triggerType"), TRIG) + _words(a.get("triggerSubType"), TRIG)[:0],
                        "aspect": a.get("startZoneAspect") or [], "elev": _words(a.get("startZoneElevationBand"), BAND),
                        "elev_m": a.get("startZoneElevation"), "type": _words(a.get("avalancheCharacter"), {}),
                        "when": (a.get("avalancheOccurrenceDatetime") or "")[:10] or None})
        q = obs.get("quick") or {}
        signs += [SIGN.get(s, s) for s in (q.get("avalancheConditions") or [])]
        signs += [SIGN.get(s, s) for s in (q.get("signsOfInstability") or []) if s != "none"]
        if q.get("avalancheObservation") in ("sawAvalancheDebris", "sawAvalancheInMotion") and not avs:
            avs.append({"n": 1, "size": None, "trigger": [], "aspect": [], "elev": [], "type": [], "when": None})
        inc = obs.get("incident")
        if inc and (inc.get("numberInvolved") or inc.get("numberCaughtOnly") or inc.get("numberFullyBuried")):
            caught = f"incident: {inc.get('numberInvolved') or inc.get('numberCaughtOnly')} involved, {inc.get('numberFullyBuried') or 0} fully buried"
        date_s = (x.get("date") or x.get("datetime") or x.get("submissionDatetime") or "")[:10]
        comment = ""
        for c in [x.get("comments")] + [o.get("comment") for o in obs.values() if isinstance(o, dict)]:
            if c:
                comment = re.sub(r"\s+", " ", c).strip()
                break
        sizes = [a["size"] for a in avs if a["size"] is not None]
        uniq = lambda xs: sorted(set(xs), key=xs.index)
        kind = "incident" if caught else "avalanche" if avs else "signs" if signs else "report"
        rows.append({
            "zone": zone, "id": x.get("submissionID"), "date": date_s, "title": (x.get("title") or "").strip(),
            "lat": round(lat, 5), "lon": round(lon, 5), "dist_km": round(_hav(home, (lat, lon)), 1), "kind": kind,
            "avalanches": sum(a["n"] for a in avs), "max_size": max(sizes) if sizes else None,
            "count_label": next((str(a.get("label")) for a in avs if a.get("label")), None) or (str(sum(a["n"] for a in avs)) if avs else None),
            "triggers": ", ".join(uniq([t for a in avs for t in a["trigger"]])),
            "aspects": ", ".join(uniq([s for a in avs for s in a["aspect"]])),
            "elevations": ", ".join(uniq([e for a in avs for e in a["elev"]])),
            "elev_m": next((a.get("elev_m") for a in avs if a.get("elev_m")), None),
            "types": ", ".join(uniq([t for a in avs for t in a["type"]])),
            "avalanche_date": next((a["when"] for a in avs if a.get("when")), None),
            "signs": ", ".join(uniq(signs)), "caught": caught,
            "comment": comment[:600] + ("…" if len(comment) > 600 else ""),
            "url": f"https://avalanche.ca/mountain-information-network/submissions/{x.get('submissionID')}",
        })
    rows.sort(key=lambda r: r["date"], reverse=True)
    if not rows:  # one blank row keeps the file readable
        rows = [{"zone": zone, "id": None, "date": today.isoformat()}]
    return rows


# ---------- every avalanche forecast that covers part of the Rogers Pass map ----------
MAP_BOUNDS = (-118.90, 50.81, -117.15, 51.53)
KOOT_BOUNDS = {ROSS: (-117.9388, 49.0563, -117.7927, 49.2562), KP: (-117.1162, 49.0148, -116.8720, 49.1710),
               WW: (-117.2077, 49.3998, -117.0880, 49.4754)}  # the three slope maps
KOOT_POINT = {ROSS: (49.10, -117.84), WW: (49.4433, -117.1450), KP: (49.0581, -117.0400)}  # Red Mountain, Whitewater, the pass


def regional_forecasts(zone=ROGERS, bounds=MAP_BOUNDS):
    from shapely.geometry import shape, box
    areas = get("https://avcan-services-api.prod.avalanche.ca/forecasts/en/areas")["features"]
    prods = {p["area"]["id"]: p for p in get("https://avcan-services-api.prod.avalanche.ca/forecasts/en/products") if p.get("area")}
    B = box(*bounds)
    rows = []
    for a in areas:
        aid = a.get("id") or (a.get("properties") or {}).get("id")
        g = shape(a["geometry"])
        if not g.intersects(B) or aid not in prods:
            continue
        p = prods[aid]
        r = p["report"]
        clip = g.intersection(B.buffer(0.05)).simplify(0.002)
        polys = list(clip.geoms) if clip.geom_type == "MultiPolygon" else [clip] if clip.geom_type == "Polygon" else []
        rings = [[[round(x, 4), round(y, 4)] for x, y in pg.exterior.coords] for pg in polys]
        title = (r.get("title") or "").strip()
        name = title if len(title) <= 60 else f"{r.get('forecaster') or 'Regional'} forecast (combined off-season product)"
        ratings = []
        for d in r.get("dangerRatings") or []:
            day = datetime.fromisoformat(d["date"]["value"].replace("Z", "+00:00")).astimezone(TZ[zone]).date().isoformat()
            for key, band, label in (("alp", "upper", "Alpine"), ("tln", "middle", "Treeline"), ("btl", "lower", "Below treeline")):
                rt = d["ratings"][key]["rating"]
                ratings.append({"date": day, "band": band, "band_label": label, "level": AVCAN_LEVEL.get(rt["value"], 0), "rating": rt["display"]})
        probs = []
        for pr in r.get("problems") or []:
            data = pr.get("data") or {}
            probs.append({"problem": (pr.get("type") or {}).get("display", ""),
                          "aspects": ", ".join(x.get("display", "") for x in data.get("aspects") or []),
                          "elevations": ", ".join(x.get("display", "") for x in data.get("elevations") or [])})
        today = [x for x in ratings if x["date"] == min((y["date"] for y in ratings), default=None)]
        rows.append({
            "zone": zone, "area_id": aid, "name": name, "forecaster": r.get("forecaster") or "",
            "issued": (r.get("dateIssued") or "")[:10], "valid_until": (r.get("validUntil") or "")[:10],
            "max_level": max((x["level"] for x in today), default=0),
            "today": ", ".join(f"{x['band_label'].lower()} {x['rating'].lower()}" for x in today),
            "ratings": json.dumps(ratings), "problems": json.dumps(probs, ensure_ascii=False),
            "highlights": clean(r.get("highlights"))[:600], "url": p.get("url", ""),
            "rings": json.dumps(rings, separators=(",", ":")),
        })
    rows.sort(key=lambda x: (x["forecaster"] != "Parks Canada", x["name"]))
    return rows


# ---------- bulletins ----------
def avcan_bulletin(zone=ROGERS, lat=51.30, lon=-117.52):
    p = get("https://avcan-services-api.prod.avalanche.ca/forecasts/en/products/point", {"lat": lat, "long": lon})
    r = p["report"]
    title = (r.get("title") or "").strip()
    if len(title) > 60:  # the off-season product lists every region
        title = f"{r.get('forecaster') or 'Avalanche Canada'} (combined off-season product)"
    summaries = {s["type"]["value"]: clean(s.get("content")) for s in (r.get("summaries") or [])}
    bull = {
        "zone": zone, "region": title, "forecaster": r.get("forecaster") or "",
        "issued": (r.get("dateIssued") or "")[:10], "valid_until": (r.get("validUntil") or "")[:10],
        "headline": clean(r.get("highlights")), "snowpack": summaries.get("snowpack-summary", ""),
        "detail": summaries.get("avalanche-summary", ""), "trend": "",
        "confidence": ((r.get("confidence") or {}).get("rating") or {}).get("display", ""),
        "language": "en", "url": p.get("url", ""),
    }
    danger = []
    for d in r.get("dangerRatings") or []:
        day = datetime.fromisoformat(d["date"]["value"].replace("Z", "+00:00")).astimezone(TZ[zone]).date()
        for key, band, label in (("alp", "upper", "Alpine"), ("tln", "middle", "Treeline"), ("btl", "lower", "Below treeline")):
            rt = d["ratings"][key]["rating"]
            danger.append({"zone": zone, "date": day.isoformat(), "band": band, "band_label": label,
                           "level": AVCAN_LEVEL.get(rt["value"], 0), "rating": rt["display"],
                           "kind": "forecast", "issued": bull["issued"]})
    problems = []
    for pr in r.get("problems") or []:
        data = pr.get("data") or {}
        size = data.get("expectedSize") or {}
        problems.append({
            "zone": zone, "problem": (pr.get("type") or {}).get("display", ""),
            "likelihood": (data.get("likelihood") or {}).get("display", ""),
            "size": f"{size.get('min', '')}–{size.get('max', '')}".strip("–"),
            "elevations": ", ".join(e.get("display", "") for e in data.get("elevations") or []),
            "aspects": ", ".join(a.get("display", "") for a in data.get("aspects") or []),
            "issued": bull["issued"],
        })
    return bull, danger, problems


def icgc_day(day, lang=1):
    zones = get("https://bpa.icgc.cat/api/apiext/butlletiglobal", {"id": 512, "values": f"{day.isoformat()};{lang}"})
    return next(z for z in zones if z["id_zona"] == "7")  # Ter-Freser


def icgc_danger_rows(z):
    lvl1 = int(z.get("grau_perill_primari") or 0)
    lvl2 = z.get("grau_perill_secundari")
    lvl2 = int(lvl2) if lvl2 not in (None, "") else lvl1
    m = re.search(r"(\d[\d.]*)\s*m", z.get("perill_text") or "")
    thr = m.group(1).replace(".", "") if m else ""
    day = z["databutlleti"]
    rows = []
    for band, lvl, label in (("upper", lvl1, f"Above {thr} m" if thr else "Upper"),
                             ("lower", lvl2, f"Below {thr} m" if thr else "Lower")):
        rows.append({"zone": VALLTER, "date": day, "band": band, "band_label": label, "level": lvl,
                     "rating": ICGC_LABEL.get(lvl, "No bulletin"), "kind": "bulletin", "issued": day})
    return rows


def icgc_bulletin(today):
    z = icgc_day(today)
    en = icgc_day(today, 3)
    in_season = int(z.get("grau_perill_primari") or 0) > 0
    bull = {
        "zone": VALLTER, "region": "Ter-Freser", "forecaster": "ICGC",
        "issued": z.get("databutlleti", ""), "valid_until": z.get("datavalidesabutlleti", ""),
        "headline": clean(z.get("perill_text")) if in_season else clean(z.get("nota_text")),
        "snowpack": clean(z.get("text_estat_mantell")), "detail": clean(z.get("text_distribucio")),
        "trend": clean(z.get("text_tendencia")), "confidence": "", "language": "ca",
        "url": "https://bpa.icgc.cat/",
    }
    en_names = {p["id_problema"]: p["tipus_situacio"] for p in en.get("problems") or []}
    problems = [{
        "zone": VALLTER, "problem": en_names.get(p["id_problema"], p["tipus_situacio"]),
        "likelihood": "", "size": p.get("mida") or "", "elevations": "", "aspects": "",
        "issued": z.get("databutlleti", ""),
    } for p in sorted(z.get("problems") or [], key=lambda p: int(p.get("priority") or 9))]
    if not in_season:  # out of season the feed still carries last spring's problems
        problems = []
    return bull, in_season, problems


# ---------- forecast outlook (Open-Meteo) ----------
def outlook(zone, lat, lon, elev, tzname, point=None):
    d = get("https://api.open-meteo.com/v1/forecast", {
        "latitude": lat, "longitude": lon, "elevation": elev, "timezone": tzname, "forecast_days": 7,
        "daily": "snowfall_sum,precipitation_sum,temperature_2m_max,temperature_2m_min,wind_gusts_10m_max",
        "hourly": "freezing_level_height"})
    fl = {}
    for t, v in zip(d["hourly"]["time"], d["hourly"]["freezing_level_height"]):
        if v is not None:
            fl[t[:10]] = max(fl.get(t[:10], -1e9), v)
    dl = d["daily"]
    return [{
        "zone": zone, "point": point or zone, "elevation_m": elev, "date": t,
        "snowfall_cm": dl["snowfall_sum"][i], "precip_mm": dl["precipitation_sum"][i],
        "temp_max_c": dl["temperature_2m_max"][i], "temp_min_c": dl["temperature_2m_min"][i],
        "gust_max_kmh": dl["wind_gusts_10m_max"][i], "freezing_level_max_m": round(fl[t]) if t in fl else "",
    } for i, t in enumerate(dl["time"])]


# ---------- forecast by elevation band, from Canada's GEM models (HRDPS 2.5 km for 48 h, then RDPS, then GDPS) ----------
LEVELS = (900, 850, 800, 750, 700)  # hPa; roughly 1,000 / 1,500 / 2,000 / 2,500 / 3,000 m
KOOT_BANDS = [("btl", "Below treeline", 1300), ("tl", "Treeline", 1800), ("alp", "Alpine", 2200)]
MTN_BANDS = {ROGERS: (51.30, -117.52, "America/Vancouver",
                      [("btl", "Below treeline", 1300), ("tl", "Treeline", 1900), ("alp", "Alpine", 2500)]),
             ROSS: (49.15, -117.88, "America/Vancouver", KOOT_BANDS),  # between Old Glory and Granite Mountain
             WW: (49.4433, -117.1450, "America/Vancouver", KOOT_BANDS),
             KP: (49.0716, -117.0839, "America/Vancouver", KOOT_BANDS)}  # Stagleap
RIDGE_HPA = 750  # free-air wind near the alpine band and most ridge crests
RIDGE_MOVES_KMH = 20  # ridge-top wind that can move loose snow


def _at_height(zs, vals, h):
    """Linear interpolation (or extrapolation off the ends) of vals at height h, zs ascending."""
    if h <= zs[0]:
        i = 0
    elif h >= zs[-1]:
        i = len(zs) - 2
    else:
        i = next(k for k in range(len(zs) - 1) if zs[k] <= h <= zs[k + 1])
    z0, z1, v0, v1 = zs[i], zs[i + 1], vals[i], vals[i + 1]
    return v0 + (v1 - v0) * (h - z0) / (z1 - z0) if z1 != z0 else v0


def _freezing_level(zs, ts):
    """Top of the above-freezing air: the highest height where temperature crosses 0 °C going up.
    Returns (height, flag): flag 'below' when it is freezing at every level, 'above' when it is above 0 °C to 3,000 m."""
    if all(t <= 0 for t in ts):  # below the lowest level: extend down at a standard 6.5 °C per km
        return max(0, round(zs[0] + ts[0] / 0.0065)), "below"
    if ts[-1] > 0:
        return round(zs[-1] + ts[-1] / 0.0065), "above"
    flag = "warm layer aloft" if ts[0] <= 0 else ""  # freezing low down under above-freezing air: rain or freezing rain on cold snow
    for k in range(len(zs) - 1, 0, -1):
        if ts[k] <= 0 < ts[k - 1]:
            return round(zs[k - 1] + (zs[k] - zs[k - 1]) * ts[k - 1] / (ts[k - 1] - ts[k])), flag
    return round(zs[0]), flag


def _snow_share(t):
    """Share of precipitation falling as snow at air temperature t (°C): all snow at 0 °C or colder, all rain from +2 °C."""
    return 1.0 if t <= 0 else 0.0 if t >= 2 else 1 - t / 2


def _gem_label(i):
    return "HRDPS 2.5 km" if i < 48 else "RDPS 10 km" if i < 84 else "GDPS 15 km"


# model, pressure levels (hPa), ridge-wind level and per-hour model label for each zone; GEM (Canada) unless listed
MTN_MODEL = {}
GEM_CFG = {"model": "gem_seamless", "levels": LEVELS, "ridge": RIDGE_HPA, "label": _gem_label}


def mountain_forecast(zone):
    lat, lon, tzname, bands = MTN_BANDS[zone]
    cfg = MTN_MODEL.get(zone, GEM_CFG)
    levels, ridge = cfg["levels"], cfg["ridge"]
    hv = ",".join(f"{v}_{p}hPa" for p in levels for v in ("temperature", "geopotential_height"))
    d = get("https://api.open-meteo.com/v1/forecast", {
        "latitude": lat, "longitude": lon, "timezone": tzname, "forecast_days": 7, "models": cfg["model"],
        "hourly": f"precipitation,{hv},wind_speed_{ridge}hPa,wind_direction_{ridge}hPa"})
    h = d["hourly"]
    hours, days = [], {}
    for i, t in enumerate(h["time"]):
        # a level can be missing in one of the blended runs (the 2 km ICON-D2 has fewer levels): use those present
        lv = [(h[f"geopotential_height_{p}hPa"][i], h[f"temperature_{p}hPa"][i]) for p in levels]
        lv = [(z, tt) for z, tt in lv if z is not None and tt is not None]
        if len(lv) < 3:
            continue
        lv.sort()
        zs, ts = [z for z, _ in lv], [tt for _, tt in lv]
        fl, flag = _freezing_level(zs, ts)
        pr = h["precipitation"][i] or 0.0
        ws, wd = h[f"wind_speed_{ridge}hPa"][i], h[f"wind_direction_{ridge}hPa"][i]
        row = {"zone": zone, "kind": "hour", "time": t, "model": cfg["label"](i),
               "precip_mm": round(pr, 1), "freezing_level_m": fl, "freezing_flag": flag,
               "ridge_kmh": None if ws is None else round(ws), "ridge_from_deg": wd}
        for key, _, elev in bands:
            tb = _at_height(zs, ts, elev)
            share = _snow_share(tb)
            row[f"t_{key}_c"] = round(tb, 1)
            row[f"snow_{key}_cm"] = round(pr * share, 1)  # about 1 cm of snow per mm of water
            row[f"rain_{key}_mm"] = round(pr * (1 - share), 1)
        hours.append(row)
        day = days.setdefault(t[:10], {"rows": []})
        day["rows"].append(row)
    daily = []
    for day, v in days.items():
        rs = v["rows"]
        if len(rs) < 20:  # a partial day at the end of the run
            continue
        out = {"zone": zone, "kind": "day", "time": day, "model": rs[0]["model"] if rs[0]["model"] == rs[-1]["model"] else f'{rs[0]["model"]} then {rs[-1]["model"]}',
               "precip_mm": round(sum(r["precip_mm"] for r in rs), 1),
               "freezing_level_min_m": min(r["freezing_level_m"] for r in rs), "freezing_level_max_m": max(r["freezing_level_m"] for r in rs)}
        for key, _, _ in bands:
            out[f"t_{key}_min_c"] = min(r[f"t_{key}_c"] for r in rs)
            out[f"t_{key}_max_c"] = max(r[f"t_{key}_c"] for r in rs)
            out[f"snow_{key}_cm"] = round(sum(r[f"snow_{key}_cm"] for r in rs))
            out[f"rain_{key}_mm"] = round(sum(r[f"rain_{key}_mm"] for r in rs), 1)
        w = [r for r in rs if r["ridge_kmh"] is not None and r["ridge_from_deg"] is not None]
        out["ridge_mean_kmh"] = round(sum(r["ridge_kmh"] for r in w) / len(w)) if w else None
        out["ridge_max_kmh"] = max((r["ridge_kmh"] for r in w), default=None)
        mv = [r for r in w if r["ridge_kmh"] >= RIDGE_MOVES_KMH]
        out["ridge_moving_hours"] = len(mv)
        vx = sum((r["ridge_kmh"] - RIDGE_MOVES_KMH + 1) ** 2 * math.sin(math.radians(r["ridge_from_deg"])) for r in mv)
        vy = sum((r["ridge_kmh"] - RIDGE_MOVES_KMH + 1) ** 2 * math.cos(math.radians(r["ridge_from_deg"])) for r in mv)
        if mv:
            frm = (math.degrees(math.atan2(vx, vy)) + 360) % 360
            i = int((((frm + 180) % 360 + 22.5) % 360) // 45)
            out["ridge_from_dir"] = OCT[int(((frm + 22.5) % 360) // 45)]
            out["loads"] = ",".join([OCT[(i - 1) % 8], OCT[i], OCT[(i + 1) % 8]])
        else:
            allw = [(r["ridge_kmh"] + 1) ** 2 for r in w]
            if w:
                frm = (math.degrees(math.atan2(sum(a * math.sin(math.radians(r["ridge_from_deg"])) for a, r in zip(allw, w)),
                                               sum(a * math.cos(math.radians(r["ridge_from_deg"])) for a, r in zip(allw, w)))) + 360) % 360
                out["ridge_from_dir"] = OCT[int(((frm + 22.5) % 360) // 45)]
            else:
                out["ridge_from_dir"] = None
            out["loads"] = ""
        daily.append(out)
    now_local = datetime.now(ZoneInfo(tzname)).replace(tzinfo=None).isoformat(timespec="minutes")
    hours = [r for r in hours if r["time"] >= now_local[:13]][:72]
    return hours + daily


# ---------- Innsbruck (Euregio Tirol – South Tyrol – Trentino) ----------
IBK = "Innsbruck"
TZ[IBK] = ZoneInfo("Europe/Vienna")
IBK_HOME = (47.2683, 11.3933)
IBK_BOUNDS = (10.95, 46.93, 11.75, 47.36)
EAWS = "https://static.avalanche.report"
# Euregio micro-regions that cover part of the Innsbruck map: id -> name, share of the map, outline (lon, lat)
IBK_REGIONS = json.loads(r"""{"AT-07-15":{"name":"Tuxer Alps West","share":0.162,"rings":[[[11.418,47.279],[11.452,47.267],[11.529,47.278],[11.552,47.285],[11.571,47.299],[11.601,47.301],[11.632,47.311],[11.65,47.296],[11.654,47.287],[11.692,47.261],[11.698,47.229],[11.711,47.22],[11.716,47.2],[11.712,47.188],[11.724,47.18],[11.731,47.167],[11.746,47.16],[11.722,47.151],[11.717,47.141],[11.703,47.134],[11.693,47.121],[11.677,47.109],[11.674,47.098],[11.643,47.083],[11.632,47.084],[11.612,47.104],[11.603,47.106],[11.556,47.074],[11.488,47.064],[11.454,47.113],[11.457,47.139],[11.449,47.146],[11.447,47.157],[11.432,47.175],[11.417,47.183],[11.419,47.191],[11.405,47.196],[11.399,47.209],[11.39,47.215],[11.389,47.238],[11.404,47.248],[11.407,47.27],[11.418,47.279]]]},"AT-07-04-01":{"name":"Karwendel Mountains West","share":0.115,"rings":[[[11.642,47.408],[11.646,47.401],[11.755,47.398],[11.77,47.385],[11.708,47.355],[11.706,47.342],[11.693,47.328],[11.646,47.317],[11.604,47.301],[11.571,47.299],[11.552,47.285],[11.529,47.278],[11.452,47.267],[11.406,47.281],[11.373,47.254],[11.343,47.253],[11.32,47.265],[11.262,47.267],[11.242,47.263],[11.227,47.274],[11.187,47.283],[11.202,47.294],[11.196,47.302],[11.2,47.311],[11.197,47.32],[11.189,47.326],[11.188,47.333],[11.197,47.344],[11.224,47.359],[11.241,47.384],[11.264,47.39],[11.266,47.398],[11.281,47.401],[11.29,47.41],[11.642,47.408]]]},"AT-07-20":{"name":"Weißkugel Group","share":0.013,"rings":[[[10.902,46.988],[10.943,46.98],[10.956,46.997],[10.978,46.994],[11.012,46.997],[11.01,46.962],[11.015,46.952],[11.027,46.946],[11.027,46.939],[10.993,46.923],[10.942,46.881],[10.931,46.884],[10.915,46.895],[10.902,46.915],[10.902,46.988]]]},"AT-07-14-04":{"name":"Kalkkögel","share":0.074,"rings":[[[11.292,47.103],[11.284,47.103],[11.277,47.139],[11.268,47.145],[11.26,47.143],[11.259,47.138],[11.227,47.136],[11.188,47.11],[11.163,47.107],[11.159,47.113],[11.171,47.125],[11.169,47.149],[11.182,47.176],[11.152,47.195],[11.193,47.205],[11.239,47.227],[11.263,47.247],[11.264,47.267],[11.32,47.265],[11.34,47.254],[11.371,47.254],[11.402,47.279],[11.418,47.279],[11.407,47.27],[11.404,47.248],[11.389,47.237],[11.39,47.215],[11.412,47.193],[11.375,47.172],[11.339,47.14],[11.329,47.123],[11.292,47.103]]]},"AT-07-16":{"name":"Tuxer Alps East","share":0.033,"rings":[[[11.691,47.327],[11.705,47.34],[11.708,47.355],[11.764,47.385],[11.792,47.388],[11.8,47.36],[11.8,47.15],[11.778,47.151],[11.731,47.167],[11.724,47.18],[11.712,47.188],[11.716,47.2],[11.711,47.22],[11.698,47.229],[11.692,47.261],[11.654,47.287],[11.65,47.296],[11.632,47.311],[11.691,47.327]]]},"AT-07-03":{"name":"Mieming Mountains","share":0.049,"rings":[[[10.97,47.404],[10.978,47.398],[11.006,47.394],[11.024,47.397],[11.029,47.393],[11.116,47.396],[11.124,47.399],[11.126,47.41],[11.233,47.41],[11.222,47.397],[11.266,47.397],[11.264,47.39],[11.241,47.384],[11.224,47.359],[11.197,47.344],[11.188,47.333],[11.189,47.326],[11.197,47.32],[11.2,47.311],[11.196,47.302],[11.202,47.294],[11.187,47.283],[11.16,47.285],[11.11,47.311],[10.98,47.285],[10.956,47.275],[10.923,47.272],[10.9,47.265],[10.9,47.365],[10.906,47.384],[10.918,47.399],[10.935,47.408],[10.971,47.41],[10.97,47.404]]]},"AT-07-22":{"name":"Stubai Alps Central","share":0.129,"rings":[[[11.231,47.046],[11.276,47.086],[11.291,47.075],[11.327,47.073],[11.333,47.081],[11.35,47.076],[11.372,47.077],[11.382,47.084],[11.404,47.079],[11.469,47.092],[11.488,47.067],[11.48,47.037],[11.499,47.026],[11.508,47.006],[11.479,47.011],[11.471,47.003],[11.469,46.995],[11.453,46.993],[11.443,46.977],[11.401,46.965],[11.382,46.97],[11.358,46.991],[11.346,46.991],[11.337,46.985],[11.321,46.993],[11.308,46.984],[11.263,46.981],[11.257,46.974],[11.221,46.969],[11.207,46.963],[11.195,46.971],[11.175,46.963],[11.164,46.966],[11.162,46.95],[11.167,46.942],[11.138,46.928],[11.115,46.931],[11.11,46.926],[11.109,46.916],[11.098,46.914],[11.098,46.908],[11.045,46.925],[11.027,46.938],[11.027,46.946],[11.015,46.952],[11.01,46.962],[11.013,46.986],[11.011,47.001],[11.043,47.008],[11.062,47.007],[11.074,47.012],[11.083,47.029],[11.116,47.038],[11.118,47.046],[11.151,47.049],[11.163,47.044],[11.214,47.057],[11.224,47.047],[11.231,47.046]]]},"AT-07-09":{"name":"Grieskogel Mountains","share":0.068,"rings":[[[10.97,47.282],[11.113,47.311],[11.126,47.3],[11.16,47.285],[11.21,47.279],[11.231,47.273],[11.242,47.263],[11.264,47.267],[11.266,47.259],[11.259,47.242],[11.237,47.226],[11.196,47.206],[11.159,47.194],[11.106,47.202],[11.085,47.208],[11.074,47.219],[11.056,47.222],[11.003,47.212],[10.978,47.225],[10.959,47.229],[10.9,47.222],[10.9,47.265],[10.925,47.272],[10.953,47.274],[10.97,47.282]]]},"AT-07-14-05":{"name":"Serles Ridge","share":0.036,"rings":[[[11.276,47.086],[11.292,47.101],[11.329,47.123],[11.339,47.14],[11.38,47.176],[11.412,47.193],[11.419,47.191],[11.417,47.183],[11.432,47.175],[11.447,47.157],[11.449,47.146],[11.457,47.139],[11.454,47.113],[11.469,47.092],[11.404,47.079],[11.382,47.084],[11.372,47.077],[11.35,47.076],[11.333,47.081],[11.327,47.073],[11.291,47.075],[11.276,47.086]]]},"AT-07-14-03":{"name":"Sellrain - Alpein Mountains","share":0.096,"rings":[[[11.01,47.003],[10.987,47.036],[10.964,47.049],[10.965,47.07],[10.988,47.074],[11.028,47.069],[11.036,47.091],[11.022,47.101],[11.026,47.106],[11.033,47.108],[11.047,47.105],[11.062,47.11],[11.058,47.135],[11.065,47.142],[11.051,47.153],[11.045,47.166],[11.046,47.176],[11.039,47.194],[11.078,47.215],[11.085,47.208],[11.106,47.202],[11.145,47.198],[11.182,47.176],[11.169,47.149],[11.171,47.125],[11.159,47.113],[11.163,47.107],[11.188,47.11],[11.227,47.136],[11.259,47.138],[11.26,47.143],[11.268,47.145],[11.277,47.139],[11.284,47.103],[11.292,47.103],[11.231,47.046],[11.224,47.047],[11.214,47.057],[11.163,47.044],[11.151,47.049],[11.127,47.048],[11.118,47.046],[11.116,47.038],[11.083,47.029],[11.074,47.012],[11.062,47.007],[11.01,47.003]]]},"AT-07-14-02":{"name":"Kühtai - Geigen Ridge","share":0.05,"rings":[[[10.9,47.222],[10.959,47.229],[10.978,47.225],[11.003,47.212],[11.056,47.222],[11.078,47.215],[11.039,47.194],[11.046,47.176],[11.045,47.166],[11.051,47.153],[11.065,47.142],[11.058,47.135],[11.062,47.11],[11.047,47.105],[11.033,47.108],[11.026,47.106],[11.022,47.101],[11.036,47.091],[11.028,47.069],[10.988,47.074],[10.965,47.07],[10.964,47.049],[10.987,47.036],[11.012,46.997],[10.978,46.994],[10.956,46.997],[10.943,46.98],[10.9,46.989],[10.9,47.222]]]},"AT-07-23-02":{"name":"Zillertal Alps Northwest","share":0.078,"rings":[[[11.8,46.99],[11.782,46.992],[11.765,46.973],[11.747,46.969],[11.727,46.973],[11.711,46.993],[11.664,46.992],[11.635,47.003],[11.627,47.013],[11.59,47.005],[11.578,46.996],[11.538,46.984],[11.508,47.006],[11.499,47.026],[11.48,47.037],[11.488,47.064],[11.556,47.074],[11.603,47.106],[11.612,47.104],[11.632,47.084],[11.654,47.087],[11.674,47.098],[11.677,47.109],[11.693,47.121],[11.703,47.134],[11.717,47.141],[11.722,47.151],[11.736,47.159],[11.758,47.16],[11.778,47.151],[11.8,47.15],[11.8,46.99]]]}}""")
IBK_STATIONS = [("ISEE2", "Seegrube", 1921), ("ISEE1", "Hafelekar", 2270), ("AXLIZ1", "Axamer Lizum", 2103),
                ("NFRA2", "Franz-Senn-Hütte", 2503), ("NSGE2", "Eissee (Stubai Glacier)", 2620)]
IBK_WIND = "ISEE1"
EU_LEVEL = {"low": 1, "moderate": 2, "considerable": 3, "high": 4, "very_high": 5}
EU_PROBLEM = {"new_snow": "New snow", "wind_slab": "Wind slab", "persistent_weak_layers": "Persistent weak layers",
              "wet_snow": "Wet snow", "gliding_snow": "Gliding snow", "cornices": "Cornices",
              "no_distinct_avalanche_problem": "No distinct avalanche problem"}
EU_FREQ = {"few": "isolated", "some": "some", "many": "many", "none": ""}


def get_raw(url):
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 404, b""
            if attempt == 2:
                raise
        except OSError:
            if attempt == 2:
                raise
        import time
        time.sleep(3 * (attempt + 1))


def eu_bound(e, side):
    v = (e or {}).get(side)
    if v is None:
        return None
    return "the treeline" if v == "treeline" else f"{int(v):,} m"


def eu_bands(b):
    """[(band, band_label, level, rating)] from one CAAMLv6 bulletin; am/pm ratings keep the higher."""
    best = {}
    # morning and afternoon ratings (Aosta, the Euregio in spring): use the more dangerous half of the day as a whole,
    # since the two halves can split the heights differently
    periods = {}
    for d in b.get("dangerRatings") or []:
        periods.setdefault(d.get("validTimePeriod") or "all_day", []).append(d)
    if len(periods) > 1:
        worst = max(periods.items(), key=lambda kv: (max(EU_LEVEL.get(x.get("mainValue"), 0) for x in kv[1]), kv[0] == "later"))
        b = dict(b, dangerRatings=worst[1])
    for d in b.get("dangerRatings") or []:
        lvl = EU_LEVEL.get(d.get("mainValue"), 0)
        e = d.get("elevation") or {}
        lo, hi = eu_bound(e, "lowerBound"), eu_bound(e, "upperBound")
        key = ("upper", f"Above {lo}") if lo else ("lower", f"Below {hi}") if hi else ("upper", "All elevations")
        if lvl >= best.get(key, -1):
            best[key] = lvl
    return [(k[0], k[1], v, ICGC_LABEL.get(v, "No rating")) for k, v in sorted(best.items())]


def eu_problems(b):
    out = []
    for p in b.get("avalancheProblems") or []:
        e = p.get("elevation") or {}
        lo, hi = eu_bound(e, "lowerBound"), eu_bound(e, "upperBound")
        elev = f"above {lo}" if lo else f"below {hi}" if hi else "all elevations"
        if lo and hi:
            elev = f"{lo} to {hi}"
        out.append({"problem": EU_PROBLEM.get(p.get("problemType"), str(p.get("problemType", "")).replace("_", " ").capitalize()),
                    "aspects": ", ".join(p.get("aspects") or []), "elevations": elev,
                    "size": str(p.get("avalancheSize") or ""), "likelihood": EU_FREQ.get(p.get("frequency"), p.get("frequency") or ""),
                    "when": {"earlier": "morning", "later": "afternoon"}.get(p.get("validTimePeriod"), "")})
    return out


def euregio(today):
    """bulletin row, danger rows, problem rows, regional rows for the Innsbruck map."""
    day = today.isoformat()
    st, raw = get_raw(f"{EAWS}/eaws_bulletins/{day}/{day}-AT-07.json")
    bulls = json.loads(raw)["bulletins"] if st == 200 and raw else []
    by_region = {}
    for b in bulls:
        for r in b.get("regions") or []:
            by_region[r["regionID"]] = b
    regional = []
    for rid, info in sorted(IBK_REGIONS.items(), key=lambda kv: -kv[1]["share"]):
        b = by_region.get(rid)
        bands = eu_bands(b) if b else []
        ratings = [{"date": day, "band": k, "band_label": lab, "level": lvl, "rating": rt} for k, lab, lvl, rt in bands]
        probs = [{k: p[k] for k in ("problem", "aspects", "elevations")} for p in (eu_problems(b) if b else [])]
        regional.append({
            "zone": IBK, "area_id": rid, "name": info["name"], "forecaster": "Avalanche Warning Service Tirol",
            "issued": (b or {}).get("publicationTime", "")[:10], "valid_until": ((b or {}).get("validTime") or {}).get("endTime", "")[:10],
            "max_level": max((x["level"] for x in ratings), default=0),
            "today": ", ".join(f"{x['band_label'].lower()} {x['rating'].lower()}" for x in ratings),
            "ratings": json.dumps(ratings), "problems": json.dumps(probs, ensure_ascii=False),
            "highlights": clean(((b or {}).get("avalancheActivity") or {}).get("highlights"))[:600],
            "url": f"https://avalanche.report/bulletin/{day}" if b else "https://avalanche.report/",
            "rings": json.dumps(info["rings"], separators=(",", ":")),
        })
    if not bulls:
        bull = {"zone": IBK, "region": "Tirol (Euregio)", "forecaster": "Avalanche Warning Service Tirol", "issued": "", "valid_until": "",
                "headline": "No avalanche bulletin today. The Euregio bulletin runs daily through the winter season; until it starts, check avalanche.report for any early-season notes.",
                "snowpack": "", "detail": "", "trend": "", "confidence": "", "language": "en", "url": "https://avalanche.report/"}
        return bull, [], [], regional, False
    # headline: the highest-rated bulletin on the map; ties go to the one covering more of the map
    cover = {}
    for rid, info in IBK_REGIONS.items():
        b = by_region.get(rid)
        if b:
            cover.setdefault(b["bulletinID"], [b, 0.0, []])
            cover[b["bulletinID"]][1] += info["share"]
            cover[b["bulletinID"]][2].append(info["name"])
    b, _, names = max(cover.values(), key=lambda v: (max((x[2] for x in eu_bands(v[0])), default=0), v[1]))
    tend = (b.get("tendency") or [{}])[0]
    bull = {
        "zone": IBK, "region": ", ".join(names[:3]) + (f" and {len(names) - 3} more" if len(names) > 3 else ""),
        "forecaster": "Avalanche Warning Service Tirol", "issued": b.get("publicationTime", "")[:10],
        "valid_until": (b.get("validTime") or {}).get("endTime", "")[:10],
        "headline": clean((b.get("avalancheActivity") or {}).get("highlights")),
        "snowpack": clean((b.get("snowpackStructure") or {}).get("comment")),
        "detail": clean((b.get("avalancheActivity") or {}).get("comment")),
        "trend": clean(tend.get("highlights")), "confidence": "", "language": "en",
        "url": f"https://avalanche.report/bulletin/{day}",
    }
    danger = [{"zone": IBK, "date": day, "band": k, "band_label": lab, "level": lvl, "rating": rt, "kind": "bulletin", "issued": bull["issued"]}
              for k, lab, lvl, rt in eu_bands(b)]
    probs = [{"zone": IBK, "problem": p["problem"] + (f" ({p['when']})" if p["when"] else ""), "likelihood": p["likelihood"],
              "size": p["size"], "elevations": p["elevations"], "aspects": p["aspects"], "issued": bull["issued"]} for p in eu_problems(b)]
    return bull, danger, probs, regional, True


# stations: hourly snapshots of every Euregio station, archived by avalanche.report
def ibk_snapshots(start_utc, end_utc):
    """{station shortName: {iso time: properties}} from hourly archives between start and end (UTC)."""
    from concurrent.futures import ThreadPoolExecutor
    hours, t = [], start_utc.replace(minute=0, second=0, microsecond=0)
    while t <= end_utc:
        hours.append(t)
        t += timedelta(hours=1)
    want = {s[0] for s in IBK_STATIONS}

    def one(h):
        url = f"{EAWS}/eaws_weather_stations/{h:%Y-%m-%d}/{h:%Y-%m-%d_%H}-00_linea.geojson.gz"
        try:
            st, raw = get_raw(url)
        except OSError:
            return []
        if st != 200 or not raw:
            return []
        import gzip
        feats = json.loads(gzip.decompress(raw))["features"]
        return [f["properties"] for f in feats if f["properties"].get("shortName") in want and f["properties"].get("date")]

    out = {}
    with ThreadPoolExecutor(12) as ex:
        for props in ex.map(one, hours):
            for p in props:
                rec = out.setdefault(p["shortName"], {})
                if len(p) > len(rec.get(p["date"], {})):
                    rec[p["date"]] = p
    return out


def ibk_stations(now, prev_rows):
    tz = TZ[IBK]
    prev = [r for r in prev_rows if r.get("zone") == IBK]
    last = max((r["date"] for r in prev), default=None)
    start_day = max(SEASON_START, date.fromisoformat(last) - timedelta(days=1)) if last else SEASON_START
    start_day = min(start_day, (now - timedelta(hours=80)).astimezone(tz).date())  # the wind needs the last 72 h too
    start = datetime.combine(start_day, datetime.min.time(), tz).astimezone(timezone.utc)
    snaps = ibk_snapshots(start, now)
    rows = []
    k = lambda v, f=1.0, o=0.0: None if v is None else v * f + o
    for code, name, elev in IBK_STATIONS:
        obs = []
        for t, p in snaps.get(code, {}).items():
            d = datetime.fromisoformat(t.replace("Z", "+00:00")).astimezone(tz).date()
            hs = p.get("HS")
            obs.append((d, None if hs is None else hs * 100, k(p.get("TA"), 1, -273.15), k(p.get("VW_MAX"), 3.6), None, k(p.get("VW"), 3.6)))
        fresh = [r for r in daily_rows(IBK, name, elev, obs) if r["date"] >= start_day.isoformat()]
        old = [r for r in prev if r["station"] == name and r["date"] < start_day.isoformat()]
        merged = sorted(old + fresh, key=lambda r: r["date"])
        pd_ = None
        for r in merged:  # depth change across the join
            dv = r.get("snow_depth_cm")
            if isinstance(dv, (int, float)):
                r["depth_change_cm"] = "" if pd_ is None else dv - pd_
                pd_ = dv
        rows += merged
    wind = []
    for t, p in sorted(snaps.get(IBK_WIND, {}).items()):
        tt = datetime.fromisoformat(t.replace("Z", "+00:00"))
        if tt >= now - timedelta(hours=WIND_HOURS) and p.get("VW") is not None and p.get("DW") is not None:
            wind.append((p["VW"] * 3.6, p["DW"], k(p.get("VW_MAX"), 3.6)))
    return rows, wind


# field reports: LAWIS incidents and the Euregio observation feed
def ibk_reports(today):
    lo0, la0, lo1, la1 = IBK_BOUNDS
    near = lambda lat, lon: lat is not None and lon is not None and la0 - 0.1 <= lat <= la1 + 0.1 and lo0 - 0.1 <= lon <= lo1 + 0.1
    since = (today - timedelta(days=MIN_DAYS)).isoformat()
    rows = []
    try:
        st, raw = get_raw(f"{EAWS}/lawis.at/incident/?sort=time&order=desc")
        ids = re.findall(r'href="\./(\d+)\.json"', raw.decode("utf-8", "replace"))[:80] if st == 200 else []
    except OSError:
        ids = []
    for i in ids:
        try:
            st, raw = get_raw(f"{EAWS}/lawis.at/incident/{i}.json")
            x = json.loads(raw) if st == 200 else None
        except (OSError, ValueError):
            x = None
        if not x:
            continue
        loc, av, inv = x.get("location") or {}, x.get("avalanche") or {}, x.get("involved") or {}
        lat, lon, d = loc.get("latitude"), loc.get("longitude"), (x.get("date") or "")[:10]
        if not near(lat, lon) or d < since:
            continue
        size = re.match(r"(\d)", ((av.get("size") or {}).get("text") or ""))
        caught = sum(int(inv.get(k) or 0) for k in ("buried_total", "buried_partial", "sweeped", "injured", "dead"))
        bits = []
        if inv.get("buried_total"): bits.append(f"{inv['buried_total']} fully buried")
        if inv.get("injured"): bits.append(f"{inv['injured']} injured")
        if inv.get("dead"): bits.append(f"{inv['dead']} killed")
        rows.append({
            "zone": IBK, "id": f"lawis-{x['id']}", "date": d, "title": loc.get("name") or "Avalanche incident",
            "lat": round(lat, 5), "lon": round(lon, 5), "dist_km": round(_hav(IBK_HOME, (lat, lon)), 1),
            "kind": "incident" if caught else "avalanche", "avalanches": 1, "count_label": "1",
            "max_size": int(size.group(1)) if size else None,
            "triggers": {"künstliche Zusatzbelastung": "human", "spontan": "natural"}.get((av.get("release") or {}).get("text"), ""),
            "aspects": ((loc.get("aspect") or {}).get("text") or "").replace("O", "E"),
            "elevations": "", "elev_m": loc.get("elevation"), "types": "slab" if "Schneebrett" in ((av.get("type") or {}).get("text") or "") else "",
            "avalanche_date": d, "signs": "", "caught": ("people involved: " + ", ".join(bits)) if bits else ("someone caught" if caught else None),
            "comment": re.sub(r"\s+", " ", x.get("comments") or "").strip()[:600], "url": "https://lawis.at/incident/",
        })
    try:
        st, raw = get_raw(f"{EAWS}/snobs.json")
        obs = json.loads(raw) if st == 200 else []
    except (OSError, ValueError):
        obs = []
    for o in obs:
        lat, lon, d = o.get("latitude"), o.get("longitude"), (o.get("eventDate") or "")[:10]
        if not near(lat, lon) or d < since or o.get("$type") not in ("Avalanche", "SimpleObservation", "Evaluation"):
            continue
        av = o.get("$type") == "Avalanche"
        signs = [str(s).replace("_", " ").lower() for s in (o.get("importantObservations") or [])]
        if o.get("stability") in ("poor", "very_poor"):
            signs.append(f"stability {o['stability'].replace('_', ' ')}")
        rows.append({
            "zone": IBK, "id": f"obs-{o.get('$id')}", "date": d, "title": (o.get("locationName") or o.get("region") or "Observation").strip(),
            "lat": round(lat, 5), "lon": round(lon, 5), "dist_km": round(_hav(IBK_HOME, (lat, lon)), 1),
            "kind": "avalanche" if av else "signs" if signs else "report", "avalanches": 1 if av else 0, "count_label": "1" if av else None,
            "max_size": None, "triggers": "", "aspects": o.get("aspect") or "", "elevations": "", "elev_m": o.get("elevation"),
            "types": "", "avalanche_date": d if av else None, "signs": ", ".join(signs), "caught": None,
            "comment": re.sub(r"\s+", " ", o.get("content") or "").strip()[:600], "url": o.get("$externalURL") or "https://avalanche.report/",
        })
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows or [{"zone": IBK, "id": None, "date": today.isoformat()}]


# ---------- forecast new snow and freezing level on a coarse grid over each map (Open-Meteo) ----------
GRID = {  # zone: (west, south, east, north, columns, rows, time zone)
    ROGERS: (-118.85, 50.84, -117.20, 51.50, 9, 6, "America/Vancouver"),
    ROSS: (-117.9388, 49.0563, -117.7927, 49.2562, 3, 5, "America/Vancouver"),
    WW: (-117.2077, 49.3998, -117.0880, 49.4754, 3, 3, "America/Vancouver"),
    KP: (-117.1162, 49.0148, -116.8720, 49.1710, 4, 4, "America/Vancouver"),
    VALLTER: (2.07, 42.34, 2.34, 42.46, 6, 4, "Europe/Madrid"),  # Núria and Puigmal to Vallter
    IBK: (10.98, 46.95, 11.72, 47.34, 8, 5, "Europe/Vienna"),
    "Rocky Mountain NP": (-105.95, 40.16, -105.48, 40.55, 6, 6, "America/Denver"),
    "Chamonix": (6.74, 45.76, 7.16, 46.04, 6, 5, "Europe/Paris"),
    "Andermatt": (8.37, 46.54, 8.71, 46.69, 6, 4, "Europe/Zurich"),
}


def snow_grid():
    rows = []
    for zone, (w, so, e, n, nc, nr, tzname) in GRID.items():
        pts = [(so + (n - so) * (j + 0.5) / nr, w + (e - w) * (i + 0.5) / nc) for j in range(nr) for i in range(nc)]
        try:
            res = get("https://api.open-meteo.com/v1/forecast", {
                "latitude": ",".join(f"{a:.4f}" for a, b in pts), "longitude": ",".join(f"{b:.4f}" for a, b in pts),
                "daily": "snowfall_sum,precipitation_sum", "hourly": "freezing_level_height",
                "forecast_days": 3, "timezone": tzname})
        except (OSError, ValueError) as ex:
            print("snow grid unavailable for", zone, ex)
            continue
        res = res if isinstance(res, list) else [res]
        for (lat, lon), d in zip(pts, res):
            fl = {}
            for t, v in zip(d["hourly"]["time"], d["hourly"]["freezing_level_height"]):
                if v is not None:
                    fl[t[:10]] = max(fl.get(t[:10], -1e9), v)
            for k, day in enumerate(d["daily"]["time"]):
                rows.append({"zone": zone, "lat": round(lat, 4), "lon": round(lon, 4), "model_elev_m": d.get("elevation"),
                             "day": day, "d": k, "snow_cm": d["daily"]["snowfall_sum"][k], "precip_mm": d["daily"]["precipitation_sum"][k],
                             "freezing_level_m": round(fl[day]) if day in fl else None})
    return rows


# ---------- Rocky Mountain National Park, Colorado ----------
RMNP = "Rocky Mountain NP"
TZ[RMNP] = ZoneInfo("America/Denver")
RMNP_BOUNDS = (-105.97, 40.14, -105.46, 40.57)
RMNP_HOME = (40.3118, -105.6448)  # Bear Lake
RMNP_SNOTEL = [("322:CO:SNTL", "Bear Lake", 2893), ("870:CO:SNTL", "Willow Park", 3264), ("565:CO:SNTL", "Lake Irene", 3255),
               ("1042:CO:SNTL", "Wild Basin", 2868), ("688:CO:SNTL", "Phantom Valley", 2752), ("1031:CO:SNTL", "Never Summer", 3139),
               ("412:CO:SNTL", "Copeland Lake", 2612)]
RMNP_WIND = (40.3000, -105.6900, 3700, "Continental Divide above Bear Lake (model)")  # no public ridge-top wind station
CAIC = "https://avalanche.state.co.us/avid"
CAIC_LEVEL = {"low": 1, "moderate": 2, "considerable": 3, "high": 4, "extreme": 5}
CAIC_BANDS = (("alp", "upper", "Above treeline"), ("tln", "middle", "Near treeline"), ("btl", "lower", "Below treeline"))
CAIC_PROBLEM = {"windSlab": "Wind slab", "stormSlab": "Storm slab", "persistentSlab": "Persistent slab",
                "deepPersistentSlab": "Deep persistent slab", "wetSlab": "Wet slab", "wetLoose": "Wet loose",
                "looseDry": "Dry loose", "dryLoose": "Dry loose", "cornice": "Cornice", "glide": "Glide avalanches"}
CAIC_LIKELY = {"unlikely": "Unlikely", "possible": "Possible", "likely": "Likely", "veryLikely": "Very likely", "certain": "Almost certain"}
CAIC_ASP = {"n": "N", "ne": "NE", "e": "E", "se": "SE", "s": "S", "sw": "SW", "w": "W", "nw": "NW"}
CAIC_ELEV = {"alp": "Above treeline", "tln": "Near treeline", "btl": "Below treeline"}


def rmnp_stations(now):
    """SNOTEL daily rows since the season start: depth (in -> cm), temps (F -> C), precipitation from the season total."""
    d = get("https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data", {
        "stationTriplets": ",".join(t for t, n, e in RMNP_SNOTEL), "elements": "SNWD,TMAX,TMIN,PREC",
        "duration": "DAILY", "beginDate": (SEASON_START - timedelta(days=1)).isoformat(), "endDate": now.astimezone(TZ[RMNP]).date().isoformat()})
    meta = {t: (n, e) for t, n, e in RMNP_SNOTEL}
    rows = []
    for st in d:
        name, elev = meta[st["stationTriplet"]]
        by = {}
        for el in st.get("data") or []:
            code = el["stationElement"]["elementCode"]
            for v in el.get("values") or []:
                by.setdefault(v["date"][:10], {})[code] = v.get("value")
        prev_depth, prev_prec = None, None
        for day in sorted(by):
            v = by[day]
            depth = None if v.get("SNWD") is None else round(v["SNWD"] * 2.54)
            prec = v.get("PREC")
            daily_p = None if prec is None or prev_prec is None else max(0.0, (prec - prev_prec) * 25.4)
            if prec is not None:
                prev_prec = prec
            change = depth - prev_depth if depth is not None and prev_depth is not None else None
            if depth is not None:
                prev_depth = depth
            if date.fromisoformat(day) < SEASON_START:
                continue
            f2c = lambda x: "" if x is None else round((x - 32) * 5 / 9, 1)
            rows.append({"zone": RMNP, "station": name, "elevation_m": elev, "date": day,
                         "snow_depth_cm": "" if depth is None else depth, "depth_change_cm": "" if change is None else change,
                         "temp_min_c": f2c(v.get("TMIN")), "temp_max_c": f2c(v.get("TMAX")), "gust_max_kmh": "",
                         "precip_mm": "" if daily_p is None else round(daily_p, 1), "wind_max_kmh": "", "readings": 1})
    return rows


def rmnp_wind(now):
    """Modelled hourly wind on the Divide above Bear Lake, last WIND_HOURS (Open-Meteo)."""
    lat, lon, elev, name = RMNP_WIND
    d = get("https://api.open-meteo.com/v1/forecast", {"latitude": lat, "longitude": lon, "elevation": elev, "past_days": 3,
                                                       "forecast_days": 1, "timezone": "UTC",
                                                       "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m"})
    h = d["hourly"]
    t0 = now - timedelta(hours=WIND_HOURS)
    obs = []
    for t, sp, dr, g in zip(h["time"], h["wind_speed_10m"], h["wind_direction_10m"], h["wind_gusts_10m"]):
        tt = datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
        if t0 <= tt <= now and sp is not None and dr is not None:
            obs.append((sp, dr, g))
    return obs, name, elev


def caic(today):
    """CAIC forecast for the zone over Bear Lake, plus every rated CAIC zone on the map."""
    from shapely.geometry import shape, box, Point
    prods = [p for p in get(f"{CAIC}/products/all", {"productType": "avalancheforecast", "includeExpired": "true"})
             if p.get("type") == "avalancheforecast"]
    areas = {f["id"]: f for f in get(f"{CAIC}/products/all/area", {"productType": "avalancheforecast", "includeExpired": "true"})["features"]}
    B, home = box(*RMNP_BOUNDS), Point(RMNP_HOME[1], RMNP_HOME[0])
    by_area = {}
    for p in prods:  # the newest product for each area
        if p["areaId"] in areas and (p["areaId"] not in by_area or p["issueDateTime"] > by_area[p["areaId"]]["issueDateTime"]):
            by_area[p["areaId"]] = p
    def day_of(iso):
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(TZ[RMNP]).date().isoformat()
    def ratings(p):
        out = []
        for d in (p.get("dangerRatings") or {}).get("days") or []:
            for key, band, label in CAIC_BANDS:
                v = d.get(key) or ""
                lv = CAIC_LEVEL.get(v, 0)
                out.append({"date": day_of(d["date"]), "band": band, "band_label": label, "level": lv,
                            "rating": v[:1].upper() + v[1:] if lv else ("No forecast" if v == "noForecast" else "No rating")})
        return out
    def problems(p):
        out = []
        days = (p.get("avalancheProblems") or {}).get("days") or []
        for pr in (days[0] if days else []):
            ae = pr.get("aspectElevations") or []
            asp = [a for a in CAIC_ASP if any(x.split("_")[0] == a for x in ae)]
            elv = [e for e in CAIC_ELEV if any(x.endswith("_" + e) for x in ae)]
            sz = pr.get("expectedSize") or {}
            out.append({"problem": CAIC_PROBLEM.get(pr.get("type"), pr.get("type") or ""),
                        "likelihood": CAIC_LIKELY.get(pr.get("likelihood"), pr.get("likelihood") or ""),
                        "size": f"{sz.get('min', '')}–{sz.get('max', '')}".strip("–"),
                        "aspects": ", ".join(CAIC_ASP[a] for a in asp), "elevations": ", ".join(CAIC_ELEV[e] for e in elv)})
        return out
    def summary(p):
        days = (p.get("avalancheSummary") or {}).get("days") or []
        return clean(days[0].get("content")) if days else ""
    main_id = next((a for a, f in areas.items() if a in by_area and shape(f["geometry"]).contains(home)), None)
    rf = []
    for aid, p in by_area.items():
        g = shape(areas[aid]["geometry"])
        if not g.intersects(B):
            continue
        rt = ratings(p)
        today_r = [x for x in rt if x["date"] == min((y["date"] for y in rt), default=None)]
        if not any(x["level"] for x in today_r):
            continue
        clip = g.intersection(B.buffer(0.05)).simplify(0.002)
        polys = list(clip.geoms) if clip.geom_type == "MultiPolygon" else [clip] if clip.geom_type == "Polygon" else []
        rf.append({"zone": RMNP, "area_id": aid, "name": "Front Range" if aid == main_id else "Neighbouring CAIC zone",
                   "forecaster": "CAIC", "issued": day_of(p["issueDateTime"]), "valid_until": day_of(p["expiryDateTime"]),
                   "max_level": max((x["level"] for x in today_r), default=0),
                   "today": ", ".join(f"{x['band_label'].lower()} {x['rating'].lower()}" for x in today_r),
                   "ratings": json.dumps(rt), "problems": json.dumps(problems(p), ensure_ascii=False),
                   "highlights": summary(p)[:600], "url": "https://avalanche.state.co.us/",
                   "rings": json.dumps([[[round(x, 4), round(y, 4)] for x, y in pg.exterior.coords] for pg in polys], separators=(",", ":"))})
    p = by_area.get(main_id)
    issued = day_of(p["issueDateTime"]) if p else ""
    bull = {"zone": RMNP, "region": "Front Range", "forecaster": "Colorado Avalanche Information Center (CAIC)",
            "issued": issued, "valid_until": day_of(p["expiryDateTime"]) if p else "",
            "headline": summary(p) if p else "No CAIC forecast for the Front Range today.", "snowpack": "", "detail": "",
            "trend": "", "confidence": "", "language": "en", "url": "https://avalanche.state.co.us/"}
    danger = [dict(r, zone=RMNP, kind="forecast", issued=issued) for r in (ratings(p) if p else []) if r["level"]]
    probs = [dict(x, zone=RMNP, issued=issued) for x in (problems(p) if p else [])]
    return bull, danger, probs, rf

# ---------- Chamonix: the whole Mont Blanc massif (France, Italy, Switzerland) ----------
CHX = "Chamonix"
TZ[CHX] = ZoneInfo("Europe/Paris")
CHX_BOUNDS = (6.72, 45.74, 7.18, 46.06)
# EAWS micro-regions covering part of the map: id -> name, share of the map, outline (lon, lat)
CHX_REGIONS = json.loads(r"""{"FR-06":{"name":"Haute-Tarentaise","share":0.012,"rings":[[[6.723,45.695],[6.739,45.75],[6.801,45.781],[6.806,45.767],[6.806,45.748],[6.817,45.74],[6.809,45.725],[6.828,45.705],[6.841,45.7],[6.847,45.69],[6.729,45.69],[6.723,45.695]]]},"FR-01":{"name":"Chablais","share":0.105,"rings":[[[6.894,46.11],[6.884,46.095],[6.891,46.085],[6.889,46.078],[6.891,46.074],[6.881,46.069],[6.873,46.056],[6.873,46.052],[6.878,46.045],[6.809,45.941],[6.729,45.935],[6.691,45.907],[6.67,45.914],[6.67,46.065],[6.676,46.084],[6.688,46.099],[6.701,46.106],[6.72,46.11],[6.894,46.11]]]},"FR-03":{"name":"Mont-Blanc","share":0.348,"rings":[[[6.878,46.046],[6.89,46.043],[6.895,46.048],[6.909,46.051],[6.923,46.064],[6.933,46.066],[6.937,46.064],[6.936,46.055],[6.943,46.051],[6.95,46.052],[6.963,46.031],[6.98,46.02],[6.986,46.005],[7.009,45.998],[7.013,45.988],[7.022,45.98],[7.022,45.977],[7.011,45.973],[7.01,45.969],[7.019,45.96],[7.037,45.955],[7.036,45.938],[7.045,45.922],[7.019,45.915],[7.004,45.899],[7.007,45.888],[6.999,45.873],[6.99,45.868],[6.975,45.868],[6.953,45.861],[6.942,45.849],[6.923,45.847],[6.915,45.842],[6.874,45.845],[6.864,45.833],[6.85,45.839],[6.818,45.836],[6.808,45.819],[6.812,45.806],[6.812,45.796],[6.805,45.793],[6.801,45.781],[6.739,45.75],[6.67,45.788],[6.67,45.914],[6.691,45.907],[6.729,45.935],[6.809,45.941],[6.878,46.046]]]},"CH-4111":{"name":"Emosson","share":0.018,"rings":[[[7.065,46.089],[7.019,46.045],[6.995,46.03],[6.976,46.022],[6.968,46.031],[6.961,46.032],[6.948,46.051],[6.943,46.05],[6.935,46.055],[6.934,46.064],[6.92,46.061],[6.91,46.052],[6.89,46.043],[6.87,46.048],[6.877,46.063],[6.891,46.075],[6.885,46.094],[6.896,46.11],[7.067,46.11],[7.065,46.089]]]},"CH-4112":{"name":"Génépi","share":0.046,"rings":[[[7.1,46.031],[7.103,46.022],[7.099,46.019],[7.043,45.986],[7.022,45.981],[7.014,45.987],[7.013,45.999],[6.997,45.999],[6.984,46.004],[6.984,46.016],[6.976,46.022],[6.995,46.03],[7.019,46.045],[7.065,46.089],[7.07,46.085],[7.082,46.086],[7.118,46.093],[7.123,46.096],[7.141,46.092],[7.158,46.082],[7.1,46.031]]]},"CH-4113":{"name":"Val d'Entremont-Val Ferret","share":0.149,"rings":[[[7.23,46.011],[7.23,45.89],[7.217,45.887],[7.203,45.876],[7.2,45.87],[7.201,45.863],[7.193,45.859],[7.176,45.863],[7.164,45.871],[7.163,45.876],[7.155,45.877],[7.14,45.873],[7.12,45.86],[7.105,45.859],[7.098,45.863],[7.092,45.875],[7.08,45.886],[7.076,45.893],[7.065,45.9],[7.064,45.911],[7.048,45.921],[7.036,45.938],[7.038,45.954],[7.018,45.959],[7.01,45.968],[7.01,45.971],[7.022,45.981],[7.043,45.986],[7.099,46.019],[7.103,46.022],[7.1,46.031],[7.158,46.082],[7.183,46.06],[7.192,46.038],[7.23,46.011]]]},"IT-23-AO-01":{"name":"Saint-Pierre and Saint-Nicholas","share":0.012,"rings":[[[7.225,45.721],[7.217,45.721],[7.215,45.718],[7.18,45.717],[7.158,45.712],[7.116,45.721],[7.107,45.726],[7.106,45.735],[7.108,45.745],[7.121,45.756],[7.23,45.797],[7.23,45.735],[7.225,45.721]]]},"IT-23-AO-17":{"name":"La Salle Morgex","share":0.063,"rings":[[[7.049,45.748],[7.024,45.759],[6.986,45.765],[6.968,45.781],[7.058,45.817],[7.091,45.821],[7.11,45.803],[7.141,45.799],[7.157,45.793],[7.173,45.78],[7.188,45.781],[7.121,45.756],[7.108,45.745],[7.107,45.726],[7.09,45.739],[7.075,45.74],[7.062,45.753],[7.046,45.755],[7.049,45.748]]]},"IT-23-AO-15":{"name":"La Thuile Valley","share":0.038,"rings":[[[6.841,45.7],[6.828,45.705],[6.809,45.725],[6.817,45.74],[6.855,45.76],[6.901,45.764],[6.961,45.783],[6.968,45.782],[6.986,45.765],[7.024,45.759],[7.045,45.752],[7.057,45.738],[7.066,45.732],[7.089,45.721],[7.108,45.716],[7.106,45.71],[7.097,45.7],[7.083,45.691],[7.075,45.69],[6.847,45.69],[6.841,45.7]]]},"IT-23-AO-14":{"name":"Ferret Valley","share":0.085,"rings":[[[6.946,45.834],[6.935,45.847],[6.942,45.849],[6.953,45.861],[6.975,45.868],[6.99,45.868],[6.999,45.873],[7.007,45.888],[7.004,45.899],[7.019,45.915],[7.041,45.923],[7.062,45.912],[7.065,45.9],[7.076,45.895],[7.081,45.885],[7.094,45.877],[7.093,45.872],[7.102,45.859],[7.092,45.834],[7.091,45.821],[7.058,45.817],[6.968,45.782],[6.967,45.802],[6.961,45.809],[6.968,45.825],[6.964,45.829],[6.946,45.834]]]},"IT-23-AO-18":{"name":"Gran San Bernardo Ollomont","share":0.041,"rings":[[[7.188,45.781],[7.173,45.78],[7.157,45.793],[7.141,45.799],[7.11,45.803],[7.091,45.821],[7.092,45.834],[7.102,45.859],[7.118,45.86],[7.136,45.873],[7.154,45.879],[7.163,45.877],[7.163,45.871],[7.173,45.864],[7.191,45.859],[7.2,45.863],[7.2,45.874],[7.215,45.884],[7.218,45.889],[7.23,45.891],[7.23,45.797],[7.188,45.781]]]},"IT-23-AO-22":{"name":"Veny Valley","share":0.081,"rings":[[[6.935,45.847],[6.946,45.834],[6.964,45.829],[6.968,45.825],[6.961,45.809],[6.967,45.802],[6.968,45.782],[6.957,45.783],[6.901,45.764],[6.855,45.76],[6.817,45.74],[6.806,45.748],[6.806,45.767],[6.801,45.781],[6.805,45.793],[6.812,45.796],[6.812,45.806],[6.808,45.819],[6.818,45.836],[6.85,45.839],[6.864,45.833],[6.874,45.845],[6.915,45.842],[6.923,45.847],[6.935,45.847]]]}}""")
CHX_FEEDS = ("FR", "CH", "IT-23")  # one EAWS file per service and day

# forecast by elevation outside Canada: DWD's ICON (2 km ICON-D2 over the Alps for about two days, then the 7 km
# ICON-EU and the 13 km global run) and NOAA's GFS blended with its 3 km runs for Colorado
_icon_label = lambda i: "ICON-D2 2 km" if i < 48 else "ICON-EU 7 km" if i < 120 else "ICON 13 km"
_noaa_label = lambda i: "HRRR/RRFS 3 km" if i < 48 else "GFS 13 km"
MTN_BANDS[IBK] = (47.19, 11.30, "Europe/Vienna",  # Axamer Lizum / Kalkkögel
                  [("btl", "Below treeline", 1500), ("tl", "Treeline", 2000), ("alp", "Alpine", 2700)])
MTN_BANDS[CHX] = (45.92, 6.88, "Europe/Paris",  # the Chamonix valley under the Aiguille du Midi
                  [("btl", "Below treeline", 1500), ("tl", "Treeline", 2400), ("alp", "Alpine", 3500)])
MTN_BANDS[RMNP] = (40.31, -105.68, "America/Denver",  # Bear Lake and the Divide above it
                   [("btl", "Below treeline", 2900), ("tl", "Treeline", 3400), ("alp", "Alpine", 3900)])
MTN_MODEL[IBK] = {"model": "icon_seamless", "levels": (950, 900, 850, 800, 750, 700, 650, 600), "ridge": 700, "label": _icon_label}
MTN_MODEL[CHX] = {"model": "icon_seamless", "levels": (850, 800, 750, 700, 650, 600, 550, 500), "ridge": 700, "label": _icon_label}
MTN_MODEL[RMNP] = {"model": "gfs_seamless", "levels": (750, 700, 650, 600, 550, 500), "ridge": 650, "label": _noaa_label}
CHX_SERVICE = {  # region prefix -> (forecaster, bulletin page, language of its text in the feed)
    "FR": ("Météo-France", "https://meteofrance.com/meteo-montagne", "fr"),
    "CH": ("SLF", "https://www.slf.ch/en/", "en"),
    "IT": ("Aosta Valley avalanche office", "https://www.avalanches.org/", "en"),
}
CHX_HOME = "FR-03"  # Mont-Blanc (Météo-France): the bulletin for Chamonix itself
CHX_WIND = (45.8800, 6.9000, 3300, "Col du Midi / Vallée Blanche (model)")  # modelled until station data is reachable
# Météo-France puts no avalanche-problem codes in the EAWS feed; these are read off its text (in French)
FR_PROBLEM_WORDS = [("New snow", r"neige fra[iî]che|neige r[ée]cente"),
                    ("Wind slab", r"plaques?[^.]{0,60}vent|vent[^.]{0,60}plaques?|neige vent[ée]e|accumulations"),
                    ("Persistent weak layers", r"persistant|sous-couche fragile|couche fragile"),
                    ("Wet snow", r"neige humide|neige mouill[ée]e|avalanches? humides?"),
                    ("Gliding snow", r"avalanches? de fond|glissement"),
                    ("Cornices", r"corniche")]


def fr_text(t):
    """Météo-France text in the feed loses its line breaks: put a space back after a full stop or colon."""
    return re.sub(r"([.:])(?=[A-ZÀ-ÖØ-Ý])", r"\1 ", clean(t))


def chx_service(rid):
    return CHX_SERVICE["FR" if rid.startswith("FR") else "CH" if rid.startswith("CH") else "IT"]


def fr_problems(b):
    """Problems named in a Météo-France bulletin's text, with the aspects and heights of its danger ratings."""
    txt = " ".join(clean(((b.get(k) or {}).get("comment")) or "") for k in ("avalancheActivity", "snowpackStructure")).lower()
    asp, lo, hi = [], None, None
    for d in b.get("dangerRatings") or []:
        asp += [a for a in d.get("aspects") or [] if a not in asp]
    elev = "all elevations"
    for d in b.get("dangerRatings") or []:
        e = d.get("elevation") or {}
        if EU_LEVEL.get(d.get("mainValue"), 0) == max(EU_LEVEL.get(x.get("mainValue"), 0) for x in b["dangerRatings"]) and e.get("lowerBound"):
            elev = f"above {eu_bound(e, 'lowerBound')}"
    order = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return [{"problem": name + " (from the text)", "aspects": ", ".join(a for a in order if a in asp), "elevations": elev,
             "size": "", "likelihood": "", "when": ""} for name, rx in FR_PROBLEM_WORDS if re.search(rx, txt)]


def chx_problems(rid, b):
    return fr_problems(b) if rid.startswith("FR") else eu_problems(b)


def chx_bulletins(today):
    """bulletin row, danger rows, problem rows and regional rows for the Mont Blanc map (three services)."""
    day = today.isoformat()
    by_region = {}
    for feed in CHX_FEEDS:
        st, raw = get_raw(f"{EAWS}/eaws_bulletins/{day}/{day}-{feed}.json")
        for b in (json.loads(raw).get("bulletins") or [] if st == 200 and raw else []):
            for r in b.get("regions") or []:
                if r["regionID"] in CHX_REGIONS:
                    by_region[r["regionID"]] = b
    regional = []
    for rid, info in sorted(CHX_REGIONS.items(), key=lambda kv: -kv[1]["share"]):
        b = by_region.get(rid)
        who, url, lang = chx_service(rid)
        bands = eu_bands(b) if b else []
        ratings = [{"date": day, "band": k, "band_label": lab, "level": lvl, "rating": rt} for k, lab, lvl, rt in bands]
        probs = [{k: p[k] for k in ("problem", "aspects", "elevations")} for p in (chx_problems(rid, b) if b else [])]
        tx = fr_text if rid.startswith("FR") else clean
        hl = tx(((b or {}).get("avalancheActivity") or {}).get("highlights")) or tx(((b or {}).get("avalancheActivity") or {}).get("comment"))
        regional.append({
            "zone": CHX, "area_id": rid, "name": info["name"], "forecaster": who,
            "issued": (b or {}).get("publicationTime", "")[:10], "valid_until": ((b or {}).get("validTime") or {}).get("endTime", "")[:10],
            "max_level": max((x["level"] for x in ratings), default=0),
            "today": ", ".join(f"{x['band_label'].lower()} {x['rating'].lower()}" for x in ratings),
            "ratings": json.dumps(ratings), "problems": json.dumps(probs, ensure_ascii=False),
            "highlights": hl[:600], "url": url,
            "rings": json.dumps(info["rings"], separators=(",", ":")),
        })
    b = by_region.get(CHX_HOME)
    if not b:
        names = sorted({chx_service(r)[0] for r in by_region})
        bull = {"zone": CHX, "region": "Mont-Blanc", "forecaster": "Météo-France", "issued": "", "valid_until": "",
                "headline": "No Météo-France bulletin for the Mont-Blanc massif today. It runs daily from about mid-December to spring; "
                            "until then check meteofrance.com/meteo-montagne for early-season notes."
                            + (f" Bulletins in force today on the map: {', '.join(names)} (see the regional map)." if names else ""),
                "snowpack": "", "detail": "", "trend": "", "confidence": "", "language": "en", "url": CHX_SERVICE["FR"][1]}
        return bull, [], [], regional
    act, snow = b.get("avalancheActivity") or {}, b.get("snowpackStructure") or {}
    issued = b.get("publicationTime", "")[:10]
    head = fr_text(act.get("highlights")) or fr_text(act.get("comment")).split("\n")[0]
    detail = fr_text(act.get("comment"))
    if detail.startswith(head):
        detail = detail[len(head):].strip()
    bull = {"zone": CHX, "region": "Mont-Blanc", "forecaster": "Météo-France", "issued": issued,
            "valid_until": (b.get("validTime") or {}).get("endTime", "")[:10],
            "headline": head, "snowpack": fr_text(snow.get("comment")), "detail": detail,
            "trend": clean(((b.get("tendency") or [{}])[0]).get("highlights")), "confidence": "", "language": "fr",
            "url": CHX_SERVICE["FR"][1]}
    danger = [{"zone": CHX, "date": day, "band": k, "band_label": lab, "level": lvl, "rating": rt, "kind": "bulletin", "issued": issued}
              for k, lab, lvl, rt in eu_bands(b)]
    probs = [{"zone": CHX, "problem": p["problem"], "likelihood": p["likelihood"], "size": p["size"],
              "elevations": p["elevations"], "aspects": p["aspects"], "issued": issued} for p in fr_problems(b)]
    return bull, danger, probs, regional


CHX_IMIS = [("FOU2", "Glacier de l'Evole", 2800), ("FOU1", "Le Portalet", 3344)]  # SLF IMIS, above La Fouly (Swiss Val Ferret)
CHX_IMIS_WIND = "FOU1"
SLF_API = "https://measurement-api.slf.ch/public/api/imis"


def chx_stations(now, prev_rows):
    return slf_stations(CHX, CHX_IMIS, (CHX_IMIS_WIND,), now, prev_rows)[0], slf_stations.last_wind.get(CHX_IMIS_WIND, [])


def slf_stations(zone, imis, wind_codes, now, prev_rows):
    """SLF IMIS stations: the API gives the last 7 days of half-hourly readings, so earlier days carry over from
    yesterday's file. Returns (daily rows, {code: half-hourly wind for the last WIND_HOURS} for the wind_codes stations)."""
    tz = TZ[zone]
    prev = [r for r in prev_rows if r.get("zone") == zone]
    start_day = (now - timedelta(days=6)).astimezone(tz).date()
    rows, winds = [], {}
    k = lambda v, f=1.0: None if v is None else v * f
    for code, name, elev in imis:
        try:
            data = get(f"{SLF_API}/station/{code}/measurements", {"period_in_days": 7})
        except (OSError, ValueError) as e:
            print("SLF station unavailable:", code, e)
            rows += [r for r in prev if r["station"] == name]
            continue
        obs = []
        for p in data:
            t = datetime.fromisoformat(p["measure_date"].replace("Z", "+00:00"))
            obs.append((t.astimezone(tz).date(), p.get("HS"), p.get("TA_30MIN_MEAN"), k(p.get("VW_30MIN_MAX"), 3.6), None, k(p.get("VW_30MIN_MEAN"), 3.6)))
            if code in wind_codes and t >= now - timedelta(hours=WIND_HOURS) and p.get("VW_30MIN_MEAN") is not None and p.get("DW_30MIN_MEAN") is not None:
                winds.setdefault(code, []).append((p["VW_30MIN_MEAN"] * 3.6, p["DW_30MIN_MEAN"], k(p.get("VW_30MIN_MAX"), 3.6)))
        fresh = [r for r in daily_rows(zone, name, elev, obs) if r["date"] > start_day.isoformat()]  # the first day is partial
        old = [r for r in prev if r["station"] == name and r["date"] <= start_day.isoformat()]
        merged = sorted(old + fresh, key=lambda r: r["date"])
        pd_ = None
        for r in merged:
            dv = r.get("snow_depth_cm")
            if isinstance(dv, (int, float)):
                r["depth_change_cm"] = "" if pd_ is None else dv - pd_
                pd_ = dv
        rows += merged
    slf_stations.last_wind = winds
    return rows, winds


slf_stations.last_wind = {}


MF_HOR = "https://files.data.gouv.fr/meteofrance/data/synchro_ftp/BASE/HOR/"
CHX_MF = [("74056001", "Chamonix", 1042), ("74056005", "Le Tour", 1500), ("74056405", "Aiguilles Rouges", 2365),
          ("74056421", "Couvercle", 2758), ("74056006", "Aiguille du Midi", 3845)]  # Météo-France; the two Nivose stations are 2,365 and 2,758 m
CHX_MF_WIND = "74056006"


def chx_mf_stations(now):
    """Météo-France hourly observations for Haute-Savoie (open data, updated daily): daily rows since the season start,
    and the last WIND_HOURS of hourly wind at the Aiguille du Midi."""
    import gzip, io
    st, raw = 404, b""
    for y in (now.year + 1, now.year, now.year - 1):  # the "latest" file is named for the years it spans, and renamed each January
        st, raw = get_raw(f"{MF_HOR}H_74_latest-{y - 1}-{y}.csv.gz")
        if st == 200 and raw:
            break
    if st != 200 or not raw:
        raise ValueError("no Météo-France hourly file for Haute-Savoie")
    rdr = csv.reader(io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(raw)), encoding="latin-1"), delimiter=";")
    head = next(rdr)
    ix = {k: i for i, k in enumerate(head)}
    meta = {c: (n, e) for c, n, e in CHX_MF}
    tz = TZ[CHX]
    since = (SEASON_START - timedelta(days=1)).strftime("%Y%m%d00")
    obs, wind = {c: [] for c in meta}, []
    f = lambda row, k, m=1.0: None if row[ix[k]] == "" else float(row[ix[k]]) * m
    for row in rdr:
        if row[0] not in meta or row[ix["AAAAMMJJHH"]] < since:
            continue
        t = datetime.strptime(row[ix["AAAAMMJJHH"]], "%Y%m%d%H").replace(tzinfo=timezone.utc)
        ff, dd, fx = f(row, "FF", 3.6), f(row, "DD"), f(row, "FXI", 3.6)
        obs[row[0]].append((t.astimezone(tz).date(), f(row, "NEIGETOT"), f(row, "T"), fx, f(row, "RR1"), ff))
        if row[0] == CHX_MF_WIND and t >= now - timedelta(hours=WIND_HOURS) and ff is not None and dd is not None:
            wind.append((t, ff, dd, fx))
    rows = []
    for c, (name, elev) in meta.items():
        rows += [r for r in daily_rows(CHX, name, elev, obs[c]) if r["date"] >= SEASON_START.isoformat()]
    return rows, [w[1:] for w in sorted(wind)]


def chx_wind(now):
    """Modelled hourly wind high in the massif, last WIND_HOURS (Open-Meteo)."""
    lat, lon, elev, name = CHX_WIND
    d = get("https://api.open-meteo.com/v1/forecast", {"latitude": lat, "longitude": lon, "elevation": elev, "past_days": 3,
                                                       "forecast_days": 1, "timezone": "UTC",
                                                       "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m"})
    h = d["hourly"]
    t0 = now - timedelta(hours=WIND_HOURS)
    obs = []
    for t, sp, dr, g in zip(h["time"], h["wind_speed_10m"], h["wind_direction_10m"], h["wind_gusts_10m"]):
        tt = datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
        if t0 <= tt <= now and sp is not None and dr is not None:
            obs.append((sp, dr, g))
    return obs, name, elev


# ---------- Andermatt / Urseren (SLF bulletin and IMIS stations) ----------
AND = "Andermatt"
TZ[AND] = ZoneInfo("Europe/Zurich")
AND_BOUNDS = (8.355, 46.53, 8.72, 46.695)
AND_REGIONS = json.loads(r"""{"CH-1246":{"name":"Gadmertal","share":0.048,"rings":[[[8.455,46.695],[8.452,46.689],[8.441,46.687],[8.413,46.691],[8.401,46.691],[8.399,46.675],[8.411,46.655],[8.374,46.632],[8.364,46.643],[8.315,46.682],[8.305,46.685],[8.305,46.745],[8.45,46.745],[8.45,46.729],[8.454,46.707],[8.455,46.695]]]},"CH-1247":{"name":"Grimsel Pass","share":0.011,"rings":[[[8.369,46.627],[8.362,46.6],[8.361,46.588],[8.362,46.585],[8.367,46.584],[8.344,46.564],[8.305,46.547],[8.305,46.624],[8.364,46.643],[8.374,46.632],[8.369,46.627]]]},"CH-2221":{"name":"Meiental","share":0.035,"rings":[[[8.692,46.704],[8.658,46.708],[8.591,46.708],[8.552,46.702],[8.449,46.672],[8.415,46.659],[8.411,46.655],[8.399,46.675],[8.401,46.691],[8.413,46.691],[8.437,46.687],[8.452,46.689],[8.455,46.695],[8.454,46.707],[8.45,46.729],[8.45,46.745],[8.681,46.745],[8.692,46.704]]]},"CH-2223":{"name":"Northern Urseren","share":0.31,"rings":[[[8.644,46.655],[8.559,46.617],[8.473,46.586],[8.463,46.589],[8.454,46.588],[8.414,46.575],[8.422,46.629],[8.411,46.655],[8.415,46.659],[8.449,46.672],[8.552,46.702],[8.591,46.708],[8.658,46.708],[8.692,46.704],[8.694,46.701],[8.671,46.66],[8.659,46.659],[8.644,46.655]]]},"CH-2224":{"name":"Southern Urseren","share":0.259,"rings":[[[8.652,46.637],[8.651,46.634],[8.66,46.625],[8.676,46.616],[8.68,46.595],[8.68,46.579],[8.57,46.562],[8.475,46.527],[8.427,46.547],[8.414,46.575],[8.454,46.588],[8.463,46.589],[8.473,46.586],[8.559,46.617],[8.644,46.655],[8.659,46.659],[8.671,46.66],[8.652,46.637]]]},"CH-4243":{"name":"Northern Obergoms","share":0.089,"rings":[[[8.414,46.575],[8.427,46.547],[8.4,46.552],[8.354,46.54],[8.305,46.511],[8.305,46.547],[8.344,46.564],[8.362,46.579],[8.367,46.584],[8.362,46.585],[8.361,46.588],[8.362,46.6],[8.369,46.627],[8.374,46.632],[8.411,46.655],[8.422,46.629],[8.414,46.575]]]},"CH-4244":{"name":"Southern Obergoms","share":0.027,"rings":[[[8.475,46.527],[8.466,46.508],[8.449,46.498],[8.417,46.492],[8.405,46.492],[8.394,46.487],[8.391,46.48],[8.305,46.48],[8.305,46.511],[8.354,46.54],[8.4,46.552],[8.427,46.547],[8.475,46.527]]]},"CH-5211":{"name":"Northern Tujetsch","share":0.035,"rings":[[[8.76,46.674],[8.675,46.64],[8.657,46.643],[8.671,46.66],[8.694,46.701],[8.711,46.7],[8.77,46.721],[8.77,46.675],[8.76,46.674]]]},"CH-5212":{"name":"Southern Tujetsch","share":0.067,"rings":[[[8.77,46.551],[8.701,46.558],[8.692,46.562],[8.68,46.579],[8.68,46.595],[8.676,46.616],[8.66,46.625],[8.651,46.634],[8.652,46.637],[8.657,46.643],[8.675,46.64],[8.754,46.672],[8.77,46.675],[8.77,46.551]]]},"CH-6111":{"name":"Bedretto Valley","share":0.029,"rings":[[[8.659,46.48],[8.391,46.48],[8.394,46.487],[8.405,46.492],[8.417,46.492],[8.449,46.498],[8.466,46.508],[8.475,46.527],[8.57,46.562],[8.597,46.525],[8.605,46.516],[8.636,46.49],[8.651,46.482],[8.659,46.48]]]},"CH-6112":{"name":"Upper Leventina","share":0.089,"rings":[[[8.696,46.559],[8.77,46.551],[8.77,46.51],[8.709,46.48],[8.659,46.48],[8.651,46.482],[8.636,46.49],[8.605,46.516],[8.597,46.525],[8.57,46.562],[8.68,46.579],[8.692,46.562],[8.696,46.559]]]}}""")
AND_HOME = "CH-2223"  # Northern Urseren: the SLF region that holds Andermatt
AND_IMIS = [("GOS3", "Gütsch", 2209), ("URS2", "Giltnasen", 2169), ("VAL2", "Vallascia", 2268),
            ("URS1", "Gross Schijen", 2784), ("BED1", "Lucendro", 2963)]  # SLF IMIS
AND_IMIS_WIND = ("URS1", "BED1")  # Gross Schijen above Andermatt; Lucendro on the Gotthard as a second card
AND_WIND = (46.6560, 8.6060, 2500, "Gütsch ridge (model)")  # stand-in if the SLF API is down
MTN_BANDS[AND] = (46.62, 8.58, "Europe/Zurich",  # the Urseren valley between Andermatt and Hospental
                  [("btl", "Below treeline", 1600), ("tl", "Treeline", 2200), ("alp", "Alpine", 2900)])
MTN_MODEL[AND] = {"model": "icon_seamless", "levels": (850, 800, 750, 700, 650, 600, 550), "ridge": 700, "label": _icon_label}
SLF_URL = "https://www.slf.ch/en/avalanche-bulletin-and-snow-situation/"


def and_bulletins(today):
    """bulletin row, danger rows, problem rows and regional rows for the Andermatt map (all SLF)."""
    day = today.isoformat()
    by_region = {}
    st, raw = get_raw(f"{EAWS}/eaws_bulletins/{day}/{day}-CH.json")
    for b in (json.loads(raw).get("bulletins") or [] if st == 200 and raw else []):
        for r in b.get("regions") or []:
            if r["regionID"] in AND_REGIONS:
                by_region[r["regionID"]] = b
    regional = []
    for rid, info in sorted(AND_REGIONS.items(), key=lambda kv: -kv[1]["share"]):
        b = by_region.get(rid)
        bands = eu_bands(b) if b else []
        ratings = [{"date": day, "band": k, "band_label": lab, "level": lvl, "rating": rt} for k, lab, lvl, rt in bands]
        probs = [{k: p[k] for k in ("problem", "aspects", "elevations")} for p in (eu_problems(b) if b else [])]
        act = (b or {}).get("avalancheActivity") or {}
        regional.append({
            "zone": AND, "area_id": rid, "name": info["name"], "forecaster": "SLF",
            "issued": (b or {}).get("publicationTime", "")[:10], "valid_until": ((b or {}).get("validTime") or {}).get("endTime", "")[:10],
            "max_level": max((x["level"] for x in ratings), default=0),
            "today": ", ".join(f"{x['band_label'].lower()} {x['rating'].lower()}" for x in ratings),
            "ratings": json.dumps(ratings), "problems": json.dumps(probs, ensure_ascii=False),
            "highlights": (clean(act.get("highlights")) or clean(act.get("comment")))[:600], "url": SLF_URL,
            "rings": json.dumps(info["rings"], separators=(",", ":")),
        })
    b = by_region.get(AND_HOME)
    if not b:
        bull = {"zone": AND, "region": "Northern Urseren", "forecaster": "SLF", "issued": "", "valid_until": "",
                "headline": "No SLF bulletin for the Urseren valley today. SLF issues bulletins for the whole Swiss Alps from about "
                            "November to May, and only snow notes before the season starts; check slf.ch."
                            + (" Bulletins in force today for parts of the map are on the regional map." if by_region else ""),
                "snowpack": "", "detail": "", "trend": "", "confidence": "", "language": "en", "url": SLF_URL}
        return bull, [], [], regional
    act, snow = b.get("avalancheActivity") or {}, b.get("snowpackStructure") or {}
    issued = b.get("publicationTime", "")[:10]
    head = clean(act.get("highlights")) or clean(act.get("comment")).split("\n")[0]
    detail = clean(act.get("comment"))
    if detail.startswith(head):
        detail = detail[len(head):].strip()
    bull = {"zone": AND, "region": "Northern Urseren", "forecaster": "SLF", "issued": issued,
            "valid_until": (b.get("validTime") or {}).get("endTime", "")[:10],
            "headline": head, "snowpack": clean(snow.get("comment")), "detail": detail,
            "trend": clean(((b.get("tendency") or [{}])[0]).get("highlights")), "confidence": "", "language": "en", "url": SLF_URL}
    danger = [{"zone": AND, "date": day, "band": k, "band_label": lab, "level": lvl, "rating": rt, "kind": "bulletin", "issued": issued}
              for k, lab, lvl, rt in eu_bands(b)]
    probs = [{"zone": AND, "problem": p["problem"], "likelihood": p["likelihood"], "size": p["size"],
              "elevations": p["elevations"], "aspects": p["aspects"], "issued": issued} for p in eu_problems(b)]
    return bull, danger, probs, regional


def and_wind(now):
    """Modelled hourly wind on the Gütsch ridge, last WIND_HOURS (Open-Meteo), if the SLF stations can't be read."""
    lat, lon, elev, name = AND_WIND
    d = get("https://api.open-meteo.com/v1/forecast", {"latitude": lat, "longitude": lon, "elevation": elev, "past_days": 3,
                                                       "forecast_days": 1, "timezone": "UTC",
                                                       "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m"})
    h = d["hourly"]
    t0 = now - timedelta(hours=WIND_HOURS)
    obs = [(sp, dr, g) for t, sp, dr, g in zip(h["time"], h["wind_speed_10m"], h["wind_direction_10m"], h["wind_gusts_10m"])
           if t0 <= datetime.fromisoformat(t).replace(tzinfo=timezone.utc) <= now and sp is not None and dr is not None]
    return obs, name, elev


def write_csv(path, rows, fields):
    """Writes PATH as JSON rows (path ends .json); blanks become null, numbers stay numbers."""
    def val(v):
        if v == "" or v is None:
            return None
        if isinstance(v, str) and re.fullmatch(r"-?\d+(\.\d+)?", v) and not path.endswith("danger_history.json"):
            return float(v) if "." in v else int(v)
        return v
    out = [{k: val(r.get(k)) for k in fields} for r in rows]
    if path.endswith("danger_history.json"):
        for r in out:
            r["level"] = int(r["level"]) if r["level"] is not None else 0
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)


def main():
    out = sys.argv[1]
    prev = sys.argv[sys.argv.index("--prev-danger") + 1] if "--prev-danger" in sys.argv else None
    prev_st = sys.argv[sys.argv.index("--prev-stations") + 1] if "--prev-stations" in sys.argv else None
    prev_bull = {}
    if "--prev-bulletins" in sys.argv:  # yesterday's bulletin text, kept for a zone whose service is down this morning
        try:
            with open(sys.argv[sys.argv.index("--prev-bulletins") + 1], encoding="utf-8") as f:
                prev_bull = {r["zone"]: r for r in json.load(f) if r.get("issued") and "couldn't be fetched" not in (r.get("headline") or "")}
        except (OSError, ValueError, IndexError):
            prev_bull = {}
    now = datetime.now(timezone.utc)
    today_cat = now.astimezone(TZ[VALLTER]).date()
    today_ibk = now.astimezone(TZ[IBK]).date()
    prev_rows = []
    if prev_st:
        try:
            with open(prev_st, encoding="utf-8") as f:
                prev_rows = json.load(f)
        except (OSError, ValueError):
            prev_rows = []

    stations = []
    for sid, name, elev in AVCAN_STATIONS:
        stations += avcan_station(sid, name, elev, now)
    for zname, sts in KOOTENAY_STATIONS.items():
        for sid, name, elev in sts:
            stations += avcan_station(sid, name, elev, now, zname)
    for code, name, elev in XEMA_STATIONS:
        stations += xema_station(code, name, elev)
    ibk_rows, ibk_wind = ibk_stations(now, prev_rows)
    stations += ibk_rows
    try:
        stations += rmnp_stations(now)
    except (OSError, ValueError, KeyError) as e:  # keep yesterday's Colorado rows if SNOTEL is down
        print("SNOTEL unavailable:", e)
        stations += [r for r in prev_rows if r.get("zone") == RMNP]
    chx_rows, chx_ridge = chx_stations(now, prev_rows)
    try:
        mf_rows, chx_midi = chx_mf_stations(now)
    except (OSError, ValueError, KeyError, IndexError) as e:  # keep yesterday's French rows
        print("Météo-France stations unavailable:", e)
        mf_names = {n for c, n, e in CHX_MF}
        mf_rows, chx_midi = [r for r in prev_rows if r.get("zone") == CHX and r.get("station") in mf_names], []
    stations += mf_rows + chx_rows
    and_rows, and_wind_obs = slf_stations(AND, AND_IMIS, AND_IMIS_WIND, now, prev_rows)
    stations += and_rows
    write_csv(f"{out}/stations_daily.json", stations, list(stations[0].keys()))

    ws, wr = [], []
    wname = next(n for c, n, e in IBK_STATIONS if c == IBK_WIND)
    welev = next(e for c, n, e in IBK_STATIONS if c == IBK_WIND)
    for zname in (ROGERS, VALLTER, IBK, ROSS, WW, KP):
        a, b = wind_summary(zname, now, stations, (ibk_wind, wname, welev) if zname == IBK else None)
        ws.append(a)
        wr += b
    try:
        a, b = wind_summary(RMNP, now, stations, rmnp_wind(now))
        ws.append(a)
        wr += b
    except (OSError, ValueError, KeyError) as e:
        print("Colorado wind unavailable:", e)
    try:
        midi = next((n, e) for c, n, e in CHX_MF if c == CHX_MF_WIND)
        ridge = next((n, e) for c, n, e in CHX_IMIS if c == CHX_IMIS_WIND)
        # the Aiguille du Midi loads the Chamonix side; Le Portalet (Swiss side) is a second card and the stand-in
        main = (chx_midi, midi[0], midi[1]) if len(chx_midi) >= 36 else (chx_ridge, ridge[0], ridge[1]) if len(chx_ridge) >= 72 else chx_wind(now)
        a, b = wind_summary(CHX, now, stations, main)
        ws.append(a)
        wr += b
        if chx_ridge:
            key = f"{CHX} · {ridge[0]}"
            a, b = wind_summary(key, now, stations, (chx_ridge, ridge[0], ridge[1]))
            a["zone"] = key
            ws.append(a)
            wr += b
    except (OSError, ValueError, KeyError) as e:
        print("Chamonix wind unavailable:", e)
    try:
        meta = {c: (n, e) for c, n, e in AND_IMIS}
        c0 = AND_IMIS_WIND[0]
        main_w = (and_wind_obs[c0], *meta[c0]) if len(and_wind_obs.get(c0, [])) >= 72 else and_wind(now)
        a, b = wind_summary(AND, now, stations, main_w)
        ws.append(a)
        wr += b
        for c in AND_IMIS_WIND[1:]:
            if len(and_wind_obs.get(c, [])) >= 72:
                key = f"{AND} · {meta[c][0]}"
                a, b = wind_summary(key, now, stations, (and_wind_obs[c], *meta[c]))
                a["zone"] = key
                for x in b:
                    x["zone"] = key
                ws.append(a)
                wr += b
    except (OSError, ValueError, KeyError) as e:
        print("Andermatt wind unavailable:", e)
    for zname, sid, name, elev in EXTRA_WIND:
        try:
            a, b = wind_summary(zname, now, stations, wind_obs(zname, now, ("avcan", sid, name, elev)))
        except (OSError, ValueError) as e:
            print("wind unavailable at", name, e)
            continue
        key = f"{zname} · {name}"
        a["zone"] = key
        for x in b:
            x["zone"] = key
        ws.append(a)
        wr += b
    write_csv(f"{out}/wind_summary.json", ws, list(ws[0].keys()))
    write_csv(f"{out}/wind_rose.json", wr, list(wr[0].keys()))

    try:
        ib, idanger, iprob, irf, ibk_in = euregio(today_ibk)
    except (OSError, ValueError) as e:
        print("Euregio bulletin unavailable:", e)
        ib = {"zone": IBK, "region": "Tirol (Euregio)", "forecaster": "Avalanche Warning Service Tirol", "issued": "", "valid_until": "",
              "headline": "The Euregio bulletin couldn't be fetched this morning; check avalanche.report.", "snowpack": "", "detail": "",
              "trend": "", "confidence": "", "language": "en", "url": "https://avalanche.report/"}
        idanger, iprob, irf, ibk_in = [], [], [], False
    try:
        cb, cdanger, cprob, crf = caic(now.astimezone(TZ[RMNP]).date())
    except (OSError, ValueError, KeyError) as e:
        print("CAIC unavailable:", e)
        cb = dict(prev_bull[RMNP]) if RMNP in prev_bull else {
            "zone": RMNP, "region": "Front Range", "forecaster": "Colorado Avalanche Information Center (CAIC)", "issued": "", "valid_until": "",
            "headline": "The CAIC forecast couldn't be fetched this morning; check avalanche.state.co.us.", "snowpack": "", "detail": "",
            "trend": "", "confidence": "", "language": "en", "url": "https://avalanche.state.co.us/"}
        cdanger, cprob, crf = [], [], []
    try:
        xb, xdanger, xprob, xrf = chx_bulletins(now.astimezone(TZ[CHX]).date())
    except (OSError, ValueError, KeyError) as e:
        print("Mont Blanc bulletins unavailable:", e)
        xb = dict(prev_bull[CHX]) if CHX in prev_bull else {
            "zone": CHX, "region": "Mont-Blanc", "forecaster": "Météo-France", "issued": "", "valid_until": "",
            "headline": "The Mont Blanc bulletins couldn't be fetched this morning; check meteofrance.com/meteo-montagne.", "snowpack": "",
            "detail": "", "trend": "", "confidence": "", "language": "en", "url": CHX_SERVICE["FR"][1]}
        xdanger, xprob, xrf = [], [], []
    try:
        ab, adanger, aprob, arf = and_bulletins(now.astimezone(TZ[AND]).date())
    except (OSError, ValueError, KeyError) as e:
        print("SLF bulletin unavailable:", e)
        ab = dict(prev_bull[AND]) if AND in prev_bull else {
            "zone": AND, "region": "Northern Urseren", "forecaster": "SLF", "issued": "", "valid_until": "",
            "headline": "The SLF bulletin couldn't be fetched this morning; check slf.ch.", "snowpack": "",
            "detail": "", "trend": "", "confidence": "", "language": "en", "url": SLF_URL}
        adanger, aprob, arf = [], [], []
    rf = regional_forecasts() + sum((regional_forecasts(z, b) for z, b in KOOT_BOUNDS.items()), []) + irf + crf + xrf + arf
    write_csv(f"{out}/regional_forecasts.json", rf, list(rf[0].keys()))

    today_bc = now.astimezone(TZ[ROGERS]).date()
    reps = min_reports(today_bc) + sum((min_reports(today_bc, z, bb, home) for z, (bb, home) in KOOT_MIN.items()), []) + ibk_reports(today_ibk)
    write_csv(f"{out}/avalanche_reports.json", reps, ["zone", "id", "date", "title", "lat", "lon", "dist_km", "kind", "avalanches", "count_label",
              "max_size", "triggers", "aspects", "elevations", "elev_m", "types", "avalanche_date", "signs", "caught", "comment", "url"])

    # danger history: keep previous rows, add/overwrite with what is current
    hist = {}
    if prev:
        with open(prev, encoding="utf-8") as f:
            for r in json.load(f):
                hist[(r["zone"], r["date"], r["band"])] = r
    rb, rdanger, rprob = avcan_bulletin()
    koot = {z: avcan_bulletin(z, *pt) for z, pt in KOOT_POINT.items()}  # the forecast covering each map's home point
    sb, sdanger, sprob = koot[ROSS]
    kdanger = [r for z in (WW, KP) for r in koot[z][1]]
    for r in rdanger + sdanger + kdanger + idanger + cdanger + xdanger + adanger:
        hist[(r["zone"], r["date"], r["band"])] = r
    vb = None
    for attempt in range(3):  # the ICGC server sometimes drops connections for a while; give it a few minutes
        try:
            vb, in_season, vprob = icgc_bulletin(today_cat)
            break
        except (OSError, ValueError, StopIteration) as e:
            print("ICGC bulletin unavailable:", e)
            if attempt < 2:
                import time
                time.sleep(60)
    if vb is None and VALLTER in prev_bull:  # keep the last bulletin we had, marked as such
        vb = dict(prev_bull[VALLTER])
        vb["trend"] = ((vb.get("trend") or "") + " (Last bulletin we could fetch; the ICGC service didn't answer this morning.)").strip()
        in_season, vprob = False, []
    elif vb is None:
        vb = {"zone": VALLTER, "region": "Ter-Freser", "forecaster": "ICGC", "issued": "", "valid_until": "",
              "headline": "The ICGC bulletin couldn't be fetched this morning; check bpa.icgc.cat.", "snowpack": "", "detail": "",
              "trend": "", "confidence": "", "language": "en", "url": "https://bpa.icgc.cat/"}
        in_season, vprob = False, []
    if in_season:
        # backfill any missing ICGC days since 1 Nov (cheap: one request per missing day)
        d = max(date(2026, 11, 1), SEASON_START)
        while d <= today_cat:
            if (VALLTER, d.isoformat(), "upper") not in hist:
                z = icgc_day(d)
                if int(z.get("grau_perill_primari") or 0) > 0 and z["databutlleti"] == d.isoformat():
                    for r in icgc_danger_rows(z):
                        hist[(r["zone"], r["date"], r["band"])] = r
            d += timedelta(days=1)
    fields = ["zone", "date", "band", "band_label", "level", "rating", "kind", "issued"]
    write_csv(f"{out}/danger_history.json", sorted(hist.values(), key=lambda r: (r["zone"], r["date"], r["band"])), fields)

    write_csv(f"{out}/bulletins.json", [rb, vb, ib, sb, koot[WW][0], koot[KP][0], cb, xb, ab], list(rb.keys()))
    probs = rprob + vprob + iprob + sprob + koot[WW][2] + koot[KP][2] + cprob + xprob + aprob
    for zname, issued in ((ROGERS, rb["issued"]), (VALLTER, vb["issued"]), (IBK, ib["issued"]), (ROSS, sb["issued"]), (WW, koot[WW][0]["issued"]),
                          (KP, koot[KP][0]["issued"]), (RMNP, cb["issued"]), (CHX, xb["issued"]), (AND, ab["issued"])):
        if not any(p["zone"] == zname for p in probs):  # one blank row keeps each zone (and the file) readable
            probs.append({"zone": zname, "problem": None, "issued": issued})
    write_csv(f"{out}/problems.json", probs,
              ["zone", "problem", "likelihood", "size", "elevations", "aspects", "issued"])

    ol = outlook(ROGERS, 51.30, -117.52, 1900, "America/Vancouver", "Rogers Pass") + \
         outlook(VALLTER, 42.42, 2.25, 2400, "Europe/Madrid", "Vallter") + \
         outlook(VALLTER, 42.385, 2.135, 2400, "Europe/Madrid", "Núria / Puigmal") + \
         outlook(IBK, 47.15, 11.25, 2300, "Europe/Vienna", "Sellrain–Stubai") + \
         outlook(ROSS, 49.2044, -117.8966, 1575, "America/Vancouver", "Strawberry Pass") + \
         outlook(WW, 49.4433, -117.1450, 1700, "America/Vancouver", "Whitewater") + \
         outlook(KP, 49.0581, -117.0400, 1780, "America/Vancouver", "Kootenay Pass") + \
         outlook(RMNP, 40.3118, -105.6448, 2900, "America/Denver", "Bear Lake") + \
         outlook(RMNP, 40.4206, -105.8162, 3280, "America/Denver", "Milner Pass") + \
         outlook(CHX, 45.9030, 6.8880, 2300, "Europe/Paris", "Plan de l'Aiguille (Chamonix)") + \
         outlook(CHX, 45.8330, 6.9350, 2200, "Europe/Paris", "Pavillon (Courmayeur)") + \
         outlook(CHX, 46.0100, 7.0900, 2200, "Europe/Paris", "Val Ferret / Champex") + \
         outlook(AND, 46.6440, 8.6050, 2200, "Europe/Zurich", "Gütsch / Nätschen (Andermatt)") + \
         outlook(AND, 46.5590, 8.5640, 2100, "Europe/Zurich", "Gotthard Pass")
    write_csv(f"{out}/outlook.json", ol, list(ol[0].keys()))
    mf = []
    for zname in MTN_BANDS:
        try:
            mf += mountain_forecast(zname)
        except (OSError, ValueError, KeyError) as e:
            print("mountain forecast unavailable for", zname, e)
    if mf:
        fields = []
        for r in mf:
            fields += [k for k in r if k not in fields]
        write_csv(f"{out}/mountain_forecast.json", mf, fields)
    sg = snow_grid()
    if sg:
        write_csv(f"{out}/snow_grid.json", sg, list(sg[0].keys()))
    print("ok", len(stations), "station-days,", len(hist), "danger rows,", len(probs), "problems,", len(ol), "outlook days,",
          "Euregio bulletin" if ibk_in else "no Euregio bulletin today")


if __name__ == "__main__":
    main()
