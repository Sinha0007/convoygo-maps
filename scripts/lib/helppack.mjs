// OpenStreetMap (Overpass) elements → Help Pack GeoJSON, exactly the contract's HelpPackProperties:
//   { kind, name?, phone?, ele?, osmId }   kind: hospital | clinic | police | fuel | water |
//                                                mechanic | shelter | peak | viewpoint |
//                                                place (towns, villages; for offline search) | pass

/** OSM tag → Help Pack kind. The first matching rule wins. */
const RULES = [
  ['amenity', 'hospital', 'hospital'],
  ['amenity', 'clinic', 'clinic'],
  ['amenity', 'police', 'police'],
  ['amenity', 'fuel', 'fuel'],
  ['amenity', 'drinking_water', 'water'],
  ['amenity', 'shelter', 'shelter'],
  ['shop', 'car_repair', 'mechanic'],
  ['shop', 'motorcycle_repair', 'mechanic'],
  ['tourism', 'alpine_hut', 'shelter'],
  ['tourism', 'wilderness_hut', 'shelter'],
  ['tourism', 'viewpoint', 'viewpoint'],
  ['natural', 'peak', 'peak'],
  ['mountain_pass', 'yes', 'pass'],
  ['place', 'city', 'place'],
  ['place', 'town', 'place'],
  ['place', 'village', 'place'],
  ['place', 'hamlet', 'place'],
];

/** Kinds that carry an elevation (contract: "for peaks and shelters"). */
const WITH_ELE = new Set(['peak', 'shelter', 'pass']);

/** Overpass QL for every Help Pack kind in a bbox [w, s, e, n]. Ways come with geometry for a true centroid. */
export function overpassQuery([w, s, e, n], timeoutS = 600) {
  const b = `(${s},${w},${n},${e})`;
  const filters = [
    `["amenity"~"^(hospital|clinic|police|fuel|drinking_water|shelter)$"]`,
    `["shop"~"^(car_repair|motorcycle_repair)$"]`,
    `["tourism"~"^(alpine_hut|wilderness_hut|viewpoint)$"]`,
    `["natural"="peak"]`,
    `["mountain_pass"="yes"]`,
    `["place"~"^(city|town|village|hamlet)$"]`,
  ];
  const nw = filters.flatMap((f) => [`node${f}${b};`, `way${f}${b};`]).join('\n  ');
  const rel = filters.map((f) => `relation${f}${b};`).join('\n  ');
  return `[out:json][timeout:${timeoutS}];
(
  ${nw}
)->.nw;
.nw out tags geom;
(
  ${rel}
)->.r;
.r out tags center;`;
}

export function kindOf(tags = {}) {
  for (const [key, value, kind] of RULES) if (tags[key] === value) return kind;
  return undefined;
}

/** "3978", "3,978 m", "12,300 ft" → metres (rounded), or undefined. */
export function parseEle(raw) {
  if (raw === undefined || raw === null) return undefined;
  const m = /^\s*(-?[\d,]+(?:\.\d+)?)\s*(m|ft|feet|')?\s*$/i.exec(String(raw));
  if (!m) return undefined;
  const value = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return undefined;
  const metres = /^(ft|feet|')$/i.test(m[2] ?? '') ? value * 0.3048 : value;
  return metres > -500 && metres < 9000 ? Math.round(metres) : undefined;
}

/** First phone number in phone / contact:phone, as written in OSM (often several, ';'-separated). */
export function parsePhone(tags = {}) {
  const raw = tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile'] ?? tags.mobile;
  if (!raw) return undefined;
  const first = String(raw).split(/[;,]/)[0].trim();
  return /\d{5,}/.test(first.replace(/[\s()-]/g, '')) ? first : undefined;
}

/** Area-weighted centroid of a closed ring, or the mean of the points for an open way. */
export function centroid(points) {
  if (points.length === 0) return undefined;
  const closed =
    points.length >= 4 && points[0].lon === points.at(-1).lon && points[0].lat === points.at(-1).lat;
  if (closed) {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const { lon: x0, lat: y0 } = points[i];
      const { lon: x1, lat: y1 } = points[i + 1];
      const f = x0 * y1 - x1 * y0;
      a += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    if (Math.abs(a) > 1e-12) return [cx / (3 * a), cy / (3 * a)];
  }
  const n = closed ? points.length - 1 : points.length;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += points[i].lon;
    y += points[i].lat;
  }
  return [x / n, y / n];
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

/** One Overpass element → a GeoJSON Point feature, or undefined if it is not a Help Pack kind. */
export function toFeature(el) {
  const kind = kindOf(el.tags);
  if (!kind) return undefined;
  let point;
  if (el.type === 'node') point = [el.lon, el.lat];
  else if (el.type === 'way' && Array.isArray(el.geometry)) point = centroid(el.geometry.filter(Boolean));
  else if (el.center) point = [el.center.lon, el.center.lat];
  if (!point || !point.every(Number.isFinite)) return undefined;

  const tags = el.tags ?? {};
  const name = (tags['name:en'] ?? tags.name)?.trim();
  const phone = parsePhone(tags);
  const ele = WITH_ELE.has(kind) ? parseEle(tags.ele) : undefined;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [round6(point[0]), round6(point[1])] },
    properties: {
      kind,
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      ...(ele !== undefined ? { ele } : {}),
      osmId: `${el.type}/${el.id}`,
    },
  };
}

/** Overpass JSON → FeatureCollection, de-duplicated by osmId and sorted for stable output. */
export function toHelpPack(overpass) {
  const byId = new Map();
  for (const el of overpass.elements ?? []) {
    const f = toFeature(el);
    if (f) byId.set(f.properties.osmId, f);
  }
  const features = [...byId.values()].sort((a, b) => a.properties.osmId.localeCompare(b.properties.osmId));
  return { type: 'FeatureCollection', features };
}
