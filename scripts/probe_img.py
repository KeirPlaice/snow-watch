import urllib.request, re
T = {
 "swisstopo": "https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&STYLES=&CRS=EPSG:32632&BBOX=445000,5160000,449000,5164000&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg",
 "naip": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox=440000,4460000,444000,4464000&bboxSR=32613&imageSR=32613&size=512,512&format=jpg&f=image",
 "nib": "https://wms.geonorge.no/skwms1/wms.nib?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ortofoto&STYLES=&CRS=EPSG:32632&BBOX=440000,6900000,444000,6904000&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg",
 "tirol": "https://gis.tirol.gv.at/arcgis/services/Service_Public/orthofoto/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Image_Aktuell_RGB&STYLES=&CRS=EPSG:32632&BBOX=680000,5230000,684000,5234000&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg",
 "esri": "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=430000,5680000,434000,5684000&bboxSR=32611&imageSR=32611&size=512,512&format=jpg&f=image",
 "italy_pcn": "http://wms.pcn.minambiente.it/ogc?map=/ms_ogc/WMS_v1.3/raster/ortofoto_colore_12.map&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.ORTOIMMAGINI.2012.32&STYLES=&CRS=EPSG:32632&BBOX=340000,5070000,344000,5074000&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg",
 "eox_s2_3857": "https://tiles.maps.eox.at/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=s2cloudless-2023&STYLES=&SRS=EPSG:32611&BBOX=430000,5680000,434000,5684000&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg",
 "bc_imagex": "https://openmaps.gov.bc.ca/imagex/ecw_wms.dll?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=bc_bc_bc_xc1m_bcalb_2015_2017&STYLES=&SRS=EPSG:32611&BBOX=430000,5680000,434000,5684000&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg",
}
for k, u in T.items():
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "snow-watch/1.0"}), timeout=60)
        b = r.read()
        print("RES", k, r.status, r.headers.get("Content-Type"), len(b), b[:120] if not r.headers.get("Content-Type", "").startswith("image") else "", "ACAO:", r.headers.get("Access-Control-Allow-Origin"))
    except Exception as e:
        print("RES", k, "ERR", e)
for k, u in {"eox_caps": "https://tiles.maps.eox.at/wms?service=WMS&request=GetCapabilities&version=1.1.1",
             "nib_caps": "https://wms.geonorge.no/skwms1/wms.nib?service=WMS&request=GetCapabilities",
             "bc_caps": "https://openmaps.gov.bc.ca/imagex/ecw_wms.dll?service=WMS&request=GetCapabilities&version=1.1.1",
             "tirol_caps": "https://gis.tirol.gv.at/arcgis/services/Service_Public/orthofoto/MapServer/WMSServer?service=WMS&request=GetCapabilities"}.items():
    try:
        t = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "snow-watch/1.0"}), timeout=60).read().decode("utf-8", "replace")
        print("CAP", k, sorted(set(re.findall(r"<(?:SRS|CRS)>([^<]+)<", t)))[:40])
        print("CAP", k, "layers", re.findall(r"<Name>([^<]+)</Name>", t)[:40])
    except Exception as e:
        print("CAP", k, "ERR", e)
