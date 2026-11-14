# ConvoyGo maps

Offline map files for [ConvoyGo](https://github.com/Sinha0007), an offline-first group navigator for bike convoys and trekkers in India. Each region is published as assets of a GitHub release. The ConvoyGo server reads `manifest.json` from the latest release and serves the files to the app.

## Map data and licences

**© OpenStreetMap contributors.** Base maps and Help Pack points are made from [OpenStreetMap](https://www.openstreetmap.org/copyright) data. The data is available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The `*-base.pmtiles` and `*-helppack.geojson` files are derived databases under the ODbL. You may use, share and adapt them if you credit OpenStreetMap contributors and share adapted databases under the same licence.

- **Base maps** are cut from the [Protomaps](https://protomaps.com) daily builds of OpenStreetMap.
- **Contours** come from the [Copernicus DEM GLO-30](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) (© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA), read from the public `copernicus-dem-30m` AWS bucket.
- **Fonts and sprites** in `assets.zip` come from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets). The Noto Sans fonts are under the SIL Open Font License (`fonts/OFL.txt` in the zip).

Any map that shows these files must display "© OpenStreetMap contributors".

## What a release contains

| Asset | What |
| --- | --- |
| `<id>-base.pmtiles` | OpenStreetMap vector tiles (Protomaps basemap schema) |
| `<id>-contours.pmtiles` | 20 m contour lines, layer `contours`, attributes `ele` (m) and `idx` (1 on 100 m index lines). Zoom 11–12 holds only the index lines; zoom 13–14 holds all of them. Only for regions with `"contours": true` (trek regions, not cities). |
| `<id>-helppack.geojson` | Points: hospital, clinic, police, fuel, water, mechanic, shelter, peak, viewpoint |
| `assets.zip` | Fonts and sprites for the map style; one file shared by every region |
| `manifest.json` | Every region with id, name, bbox, version and files (asset, kind, sizeBytes, md5) |

Regions are listed in [`regions.json`](regions.json).

## Building

Everything runs in GitHub Actions; nothing needs to be installed locally.

1. Go to **Actions → Build maps → Run workflow**.
2. Set `regions` to the ids to build, comma-separated (empty means all of them).
3. Tick `release` to publish.
   - Leave it unticked for a test build. Its files are kept as a workflow artifact for 3 days.

A release is named `maps-YYYY-MM-DD`.
- A rebuilt region's `version` goes up by 1.
- Regions not built in that run are copied from the previous release, so the latest release is always complete.

Run the script tests locally with `node --test "scripts/**/*.test.mjs"`.
