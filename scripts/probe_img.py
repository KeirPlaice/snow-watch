import json, urllib.request, io
from PIL import Image
import numpy as np
for z, k, u in json.load(open("scripts/urls.json")):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=90)
        b = r.read(); ct = r.headers.get("Content-Type")
        if ct.startswith("image"):
            a = np.array(Image.open(io.BytesIO(b)).convert("RGBA"))
            print("RES", z, k, ct, a.shape[:2], "transp", round(float((a[:, :, 3] == 0).mean()), 2), "mean", round(float(a[:, :, :3].mean()), 1), "std", round(float(a[:, :, :3].std()), 1))
        else:
            print("RES", z, k, ct, b[:200])
    except Exception as e:
        print("RES", z, k, "ERR", e)
