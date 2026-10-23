#!/usr/bin/env bash
# assets.zip: the Protomaps fonts and sprites the app's map style uses, from
# protomaps/basemaps-assets at a pinned commit. Byte-for-byte reproducible, so its md5
# only changes when the pinned commit or the file list changes (the phone then skips it).
#   scripts/assets.sh <out.zip>
set -euo pipefail
out=$(realpath -m "$1")

COMMIT=028c18f713baecad011301ff7a69acc39bcc2ae7
FONTS=("Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic" "Noto Sans Devanagari Regular v1")
SPRITES=(light dark)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsSL "https://codeload.github.com/protomaps/basemaps-assets/tar.gz/${COMMIT}" | tar -xz -C "$work"
src="$work/basemaps-assets-${COMMIT}"

mkdir -p "$work/zip/fonts" "$work/zip/sprites/v4"
for f in "${FONTS[@]}"; do cp -r "$src/fonts/$f" "$work/zip/fonts/"; done
cp "$src/fonts/OFL.txt" "$work/zip/fonts/"
for s in "${SPRITES[@]}"; do cp "$src/sprites/v4/$s".{json,png} "$src/sprites/v4/$s@2x".{json,png} "$work/zip/sprites/v4/"; done
echo "basemaps-assets ${COMMIT}" > "$work/zip/SOURCE.txt"

# Fixed timestamps and a sorted file list → identical zip every run.
cd "$work/zip"
find . -exec touch -h -d '2020-01-01T00:00:00Z' {} +
rm -f "$out"
find . -type f | LC_ALL=C sort | zip -q -X -D "$out" -@
cd - > /dev/null
ls -la "$out"
