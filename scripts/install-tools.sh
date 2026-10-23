#!/usr/bin/env bash
# Installs pinned go-pmtiles (checksum-checked), GDAL and tippecanoe on an Ubuntu runner.
set -euo pipefail

PMTILES_VERSION=1.31.2
PMTILES_SHA256=3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f
TIPPECANOE_TAG=2.79.0

tmp=$(mktemp -d)
curl -fsSL -o "$tmp/pmtiles.tar.gz" \
  "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz"
echo "${PMTILES_SHA256}  $tmp/pmtiles.tar.gz" | sha256sum -c -
tar -xzf "$tmp/pmtiles.tar.gz" -C "$tmp" pmtiles
sudo install -m 0755 "$tmp/pmtiles" /usr/local/bin/pmtiles
pmtiles version

sudo apt-get update -qq
sudo apt-get install -y -qq gdal-bin zip > /dev/null
gdalinfo --version

# tippecanoe: the Ubuntu package if there is one, else the pinned source tag.
if ! sudo apt-get install -y -qq tippecanoe > /dev/null 2>&1; then
  echo "tippecanoe is not packaged here; building ${TIPPECANOE_TAG} from source"
  sudo apt-get install -y -qq build-essential libsqlite3-dev zlib1g-dev > /dev/null
  git clone --depth 1 --branch "${TIPPECANOE_TAG}" https://github.com/felt/tippecanoe.git "$tmp/tippecanoe"
  make -C "$tmp/tippecanoe" -j"$(nproc)" > /dev/null
  sudo make -C "$tmp/tippecanoe" install > /dev/null
fi
tippecanoe --version 2>&1 | head -1
rm -rf "$tmp"
