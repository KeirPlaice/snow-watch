import base64, io, subprocess, tarfile
subprocess.run(["python3", "scripts/snow_fetch.py", "out"], check=True)
b = io.BytesIO()
with tarfile.open(fileobj=b, mode="w:gz") as t:
    t.add("out")
s = base64.b64encode(b.getvalue()).decode()
for i in range(0, len(s), 8000):
    print("B64:" + s[i:i + 8000])
