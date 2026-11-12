import urllib.request, io
u = ("https://gis.tirol.gv.at/arcgis/services/Service_Public/orthofoto/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Image_Aktuell_RGB&STYLES=&CRS=EPSG:32632"
     "&BBOX=650000,5195000,700000,5215000&WIDTH=500&HEIGHT=200&FORMAT=image/png&TRANSPARENT=TRUE")
b = urllib.request.urlopen(u, timeout=60).read()
from PIL import Image
import numpy as np
a = np.array(Image.open(io.BytesIO(b)).convert("RGBA"))
print("RES tirol", a.shape, "transparent", round(float((a[:, :, 3] == 0).mean()), 3), "white", round(float((a[:, :, :3].min(2) > 250).mean()), 3), "black", round(float((a[:, :, :3].max(2) < 5).mean()), 3))
