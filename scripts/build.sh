#!/usr/bin/env bash
# Builds the files of the given regions into dist/<id>/, plus the shared dist/assets.zip.
#   scripts/build.sh "in-manali-demo,in-himachal"     (empty = every region in regions.json)
set -euo pipefail
ids=${1:-}
if [[ -z "${ids// /}" ]]; then
  ids=$(node -e "console.log(require('./regions.json').regions.map(r => r.id).join(','))")
fi

mkdir -p dist
: > dist/timings.tsv
step() {
  local id=$1 kind=$2 t0=$SECONDS
  shift 2
  echo "::group::${id} ${kind}"
  "$@"
  echo "::endgroup::"
  printf '%s\t%s\t%s\n' "$id" "$kind" "$((SECONDS - t0))" >> dist/timings.tsv
}

for id in ${ids//,/ }; do
  info=$(node -e "
    const r = require('./regions.json').regions.find(r => r.id === process.argv[1]);
    if (!r) { console.error('unknown region: ' + process.argv[1]); process.exit(1); }
    console.log(r.bbox.join(',') + ' ' + (r.contours ? 1 : 0));" "$id")
  read -r bbox contours <<< "$info"
  mkdir -p "dist/$id"
  step "$id" base scripts/base.sh "$bbox" "dist/$id/$id-base.pmtiles"
  if [[ "$contours" == 1 ]]; then
    step "$id" contours scripts/contours.sh "$bbox" "dist/$id/$id-contours.pmtiles"
  fi
  step "$id" helppack node scripts/helppack.mjs "$bbox" "dist/$id/$id-helppack.geojson"
done
step "(all)" assets scripts/assets.sh dist/assets.zip
