#!/usr/bin/env python3
"""Snow & avalanche dashboard: fetch all feeds and write the dashboard's CSV files.

Zones: Rogers Pass (Glacier National Park, BC), Rossland (Rossland Range, BC), Vallter / Ulldeter (Ter-Freser, Catalonia) and Innsbruck (Tirol, Euregio).
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
ROSS = "Rossland"
TZ = {ROGERS: ZoneInfo("America/Vancouver"), VALLTER: ZoneInfo("Europe/Madrid"), ROSS: ZoneInfo("America/Vancouver")}

AVCAN_STATIONS = [  # (id, name, elevation m)
    (98, "Rogers Pass", 1315),
    (93, "Fidelity", 1905),
    (96, "MacDonald West Shoulder", 1930),
    (91, "Mt. Abbott", 2130),
]
ROSS_STATIONS = [(75, "Strawberry Pass", 1575), (76, "Paulson Summit", 1535), (22, "Southridge", 1990),
                 (41, "Kootenay Pass", 1780), (42, "Stagleap", 2140)]  # BC MoTI highway avalanche-program stations
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
                seen[t] = (t.date(), num(r.get("snowHeight")), num(r.get("airTempAvg")),
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
                 ROSS: ("avcan", 42, "Stagleap", 2140)}
WIND_HOURS = 72
TRANSPORT_KMH = 15  # hourly mean wind that can start moving loose snow
STRONG_KMH = 30
OCT = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
COMPASS16 = {d: i * 22.5 for i, d in enumerate("N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW".split())}


# extra 72-hour wind cards: (zone, Avalanche Canada station id, name, elevation); each gets a summary under "<zone> · <name>"
EXTRA_WIND = [(ROSS, 75, "Strawberry Pass", 1575), (ROSS, 41, "Kootenay Pass", 1780)]


def wind_obs(zone, now, station=None):
    """[(time_utc, mean_kmh, from_deg, gust_kmh)] over the last WIND_HOURS."""
    kind, sid, name, elev = station or WIND_STATIONS[zone]
    t0 = now - timedelta(hours=WIND_HOURS)
    out = {}
    if kind == "avcan":
        for r in get(f"https://weather.prod.avalanche.ca/stations/{sid}/measurements",
                     {"fromDate": t0.strftime("%Y-%m-%dT%H:%M:%SZ"), "toDate": now.strftime("%Y-%m-%dT%H:%M:%SZ")}):
            sp, dr = num(r.get("windSpeedAvg")), COMPASS16.get(r.get("windDirCompass"))
            if sp is not None and dr is not None:
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
    step_h = 0.5 if zone == VALLTER else 1.0
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
        "until": now.strftime("%Y-%m-%dT%H:%MZ"),
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
ROSS_BBOX = "-118.25,48.95,-116.85,49.88"


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
ROSS_BOUNDS = (-118.13, 49.00, -116.95, 49.80)


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
    ROSS: (-118.08, 49.03, -117.00, 49.77, 7, 7, "America/Vancouver"),
    VALLTER: (2.20, 42.38, 2.34, 42.46, 4, 3, "Europe/Madrid"),
    IBK: (10.98, 46.95, 11.72, 47.34, 8, 5, "Europe/Vienna"),
    "Rocky Mountain NP": (-105.95, 40.16, -105.48, 40.55, 6, 6, "America/Denver"),
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
    for sid, name, elev in ROSS_STATIONS:
        stations += avcan_station(sid, name, elev, now, ROSS)
    for code, name, elev in XEMA_STATIONS:
        stations += xema_station(code, name, elev)
    ibk_rows, ibk_wind = ibk_stations(now, prev_rows)
    stations += ibk_rows
    try:
        stations += rmnp_stations(now)
    except (OSError, ValueError, KeyError) as e:  # keep yesterday's Colorado rows if SNOTEL is down
        print("SNOTEL unavailable:", e)
        stations += [r for r in prev_rows if r.get("zone") == RMNP]
    write_csv(f"{out}/stations_daily.json", stations, list(stations[0].keys()))

    ws, wr = [], []
    wname = next(n for c, n, e in IBK_STATIONS if c == IBK_WIND)
    welev = next(e for c, n, e in IBK_STATIONS if c == IBK_WIND)
    for zname in (ROGERS, VALLTER, IBK, ROSS):
        a, b = wind_summary(zname, now, stations, (ibk_wind, wname, welev) if zname == IBK else None)
        ws.append(a)
        wr += b
    try:
        a, b = wind_summary(RMNP, now, stations, rmnp_wind(now))
        ws.append(a)
        wr += b
    except (OSError, ValueError, KeyError) as e:
        print("Colorado wind unavailable:", e)
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
    rf = regional_forecasts() + regional_forecasts(ROSS, ROSS_BOUNDS) + irf + crf
    write_csv(f"{out}/regional_forecasts.json", rf, list(rf[0].keys()))

    today_bc = now.astimezone(TZ[ROGERS]).date()
    reps = min_reports(today_bc) + min_reports(today_bc, ROSS, ROSS_BBOX, ROSS_HOME) + ibk_reports(today_ibk)
    write_csv(f"{out}/avalanche_reports.json", reps, ["zone", "id", "date", "title", "lat", "lon", "dist_km", "kind", "avalanches", "count_label",
              "max_size", "triggers", "aspects", "elevations", "elev_m", "types", "avalanche_date", "signs", "caught", "comment", "url"])

    # danger history: keep previous rows, add/overwrite with what is current
    hist = {}
    if prev:
        with open(prev, encoding="utf-8") as f:
            for r in json.load(f):
                hist[(r["zone"], r["date"], r["band"])] = r
    rb, rdanger, rprob = avcan_bulletin()
    sb, sdanger, sprob = avcan_bulletin(ROSS, 49.10, -117.84)  # Red Mountain
    for r in rdanger + sdanger + idanger + cdanger:
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

    write_csv(f"{out}/bulletins.json", [rb, vb, ib, sb, cb], list(rb.keys()))
    probs = rprob + vprob + iprob + sprob + cprob
    for zname, issued in ((ROGERS, rb["issued"]), (VALLTER, vb["issued"]), (IBK, ib["issued"]), (ROSS, sb["issued"]), (RMNP, cb["issued"])):
        if not any(p["zone"] == zname for p in probs):  # one blank row keeps each zone (and the file) readable
            probs.append({"zone": zname, "problem": None, "issued": issued})
    write_csv(f"{out}/problems.json", probs,
              ["zone", "problem", "likelihood", "size", "elevations", "aspects", "issued"])

    ol = outlook(ROGERS, 51.30, -117.52, 1900, "America/Vancouver", "Rogers Pass") + \
         outlook(VALLTER, 42.42, 2.25, 2400, "Europe/Madrid", "Vallter") + \
         outlook(IBK, 47.15, 11.25, 2300, "Europe/Vienna", "Sellrain–Stubai") + \
         outlook(ROSS, 49.2044, -117.8966, 1575, "America/Vancouver", "Strawberry Pass") + \
         outlook(ROSS, 49.0581, -117.0400, 1780, "America/Vancouver", "Kootenay Pass") + \
         outlook(RMNP, 40.3118, -105.6448, 2900, "America/Denver", "Bear Lake") + \
         outlook(RMNP, 40.4206, -105.8162, 3280, "America/Denver", "Milner Pass")
    write_csv(f"{out}/outlook.json", ol, list(ol[0].keys()))
    sg = snow_grid()
    if sg:
        write_csv(f"{out}/snow_grid.json", sg, list(sg[0].keys()))
    print("ok", len(stations), "station-days,", len(hist), "danger rows,", len(probs), "problems,", len(ol), "outlook days,",
          "Euregio bulletin" if ibk_in else "no Euregio bulletin today")


if __name__ == "__main__":
    main()
