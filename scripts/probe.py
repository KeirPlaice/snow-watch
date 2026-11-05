import json, sys
sys.path.insert(0, "scripts")
import snow_fetch as sf
rows = sf.mountain_forecast(sf.ROGERS)
h = [r for r in rows if r["kind"] == "hour"]; d = [r for r in rows if r["kind"] == "day"]
print("hours", len(h), "days", len(d))
for r in h[:72:6]: print(json.dumps(r))
for r in d: print(json.dumps(r))
print("bytes", len(json.dumps(rows)))
