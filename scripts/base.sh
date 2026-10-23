#!/usr/bin/env bash
# Cuts the OpenStreetMap base map for a bbox out of the newest Protomaps daily build.
#   scripts/base.sh <west,south,east,north> <out.pmtiles>
set -euo pipefail
bbox=$1
out=$2

build=""
for days in 0 1 2 3 4 5 6 7; do
  day=$(date -u -d "-${days} day" +%Y%m%d)
  # A 2-byte Range request: 206 means the build exists and is complete enough to serve.
  code=$(curl -s -o /dev/null -w '%{http_code}' -r 0-1 "https://build.protomaps.com/${day}.pmtiles" || true)
  if [[ "$code" == "206" || "$code" == "200" ]]; then
    build="https://build.protomaps.com/${day}.pmtiles"
    break
  fi
done
if [[ -z "$build" ]]; then
  echo "No Protomaps daily build found for the last 8 days" >&2
  exit 1
fi
echo "Base map from ${build}"
echo "$build" > "${out}.source"

pmtiles extract "$build" "$out" --bbox="$bbox" --download-threads=8 --quiet
pmtiles show "$out" | head -20
