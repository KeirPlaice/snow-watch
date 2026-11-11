import base64, io, os, subprocess, tarfile, urllib.request
os.makedirs("prev", exist_ok=True); os.makedirs("out", exist_ok=True)
args = []
for f, flag in (("danger_history", "--prev-danger"), ("stations_daily", "--prev-stations"), ("bulletins", "--prev-bulletins")):
    try:
        open(f"prev/{f}.json", "wb").write(urllib.request.urlopen(f"https://keirplaice.github.io/snow-watch/data/{f}.json", timeout=60).read())
        args += [flag, f"prev/{f}.json"]
    except Exception as e:
        print("no prev", f, e)
subprocess.run(["python3", "scripts/snow_fetch.py", "out"] + args, check=True)
b = io.BytesIO()
with tarfile.open(fileobj=b, mode="w:gz") as t:
    t.add("out")
s = base64.b64encode(b.getvalue()).decode()
for i in range(0, len(s), 8000):
    print("B64:" + s[i:i + 8000])
