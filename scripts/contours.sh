#!/usr/bin/env bash
# 20 m contour lines for a bbox from the Copernicus GLO-30 DEM, as a vector .pmtiles:
# layer "contours", attributes ele (metres) and idx (1 on every 100 m index line), zoom 11-14.
# Zoom 11-12 carry only the index lines; 13-14 carry all of them.
#   scripts/contours.sh <west,south,east,north> <out.pmtiles>
set -euo pipefail
bbox=$1
out=$2
IFS=, read -r west south east north <<< "$bbox"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# 1° x 1° tiles named by their south-west corner, e.g. Copernicus_DSM_COG_10_N32_00_E077_00_DEM.
lat0=$(python3 -c "import math; print(math.floor($south))")
lat1=$(python3 -c "import math; print(math.ceil($north) - 1)")
lon0=$(python3 -c "import math; print(math.floor($west))")
lon1=$(python3 -c "import math; print(math.ceil($east) - 1)")
count=0
for lat in $(seq "$lat0" "$lat1"); do
  for lon in $(seq "$lon0" "$lon1"); do
    ns=$([[ $lat -ge 0 ]] && echo N || echo S)
    ew=$([[ $lon -ge 0 ]] && echo E || echo W)
    name=$(printf 'Copernicus_DSM_COG_10_%s%02d_00_%s%03d_00_DEM' "$ns" "${lat#-}" "$ew" "${lon#-}")
    # Public bucket, no sign-in. Tiles that are all sea do not exist; skip them.
    if curl -fsSL -o "$work/$name.tif" "https://copernicus-dem-30m.s3.amazonaws.com/$name/$name.tif"; then
      count=$((count + 1))
    else
      echo "no DEM tile $name (sea or missing), skipped"
      rm -f "$work/$name.tif"
    fi
  done
done
echo "DEM: $count tiles"
[[ $count -gt 0 ]] || { echo "no DEM tiles for $bbox" >&2; exit 1; }

gdalbuildvrt -q -te "$west" "$south" "$east" "$north" "$work/dem.vrt" "$work"/*.tif
gdal_contour -q -i 20 -a ele -f GPKG "$work/dem.vrt" "$work/raw.gpkg"
rm -f "$work"/*.tif

# Integer elevations, an index flag, and ~8 m simplification (the DEM is 30 m anyway).
ogr2ogr -f GeoJSONSeq "$work/contours.geojsons" "$work/raw.gpkg" -dialect SQLite -sql \
  "SELECT ST_SimplifyPreserveTopology(geom, 0.00008) AS geom,
          CAST(ROUND(ele) AS INTEGER) AS ele,
          CASE WHEN CAST(ROUND(ele) AS INTEGER) % 100 = 0 THEN 1 ELSE 0 END AS idx
     FROM contour WHERE ele > 0"
rm -f "$work/raw.gpkg"
ls -la "$work/contours.geojsons"

tippecanoe -q -P -f -o "$work/contours.mbtiles" -l contours -Z11 -z14 \
  -j '{ "contours": [ "any", [ ">=", "$zoom", 13 ], [ "==", "idx", 1 ] ] }' \
  --no-feature-limit --no-tile-size-limit --simplification=2 \
  --attribution='<a href="https://dataspace.copernicus.eu">Copernicus DEM GLO-30</a>' \
  "$work/contours.geojsons"
pmtiles convert "$work/contours.mbtiles" "$out"
pmtiles show "$out" > "$out.info" && sed -n 1,20p "$out.info" && rm -f "$out.info"
