// Builds <out> (Help Pack GeoJSON) for a bbox from OpenStreetMap via the public Overpass API.
//   node scripts/helppack.mjs <west,south,east,north> <out.geojson>
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { overpassQuery, toHelpPack } from './lib/helppack.mjs';

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const USER_AGENT = 'convoygo-maps (+https://github.com/Sinha0007/convoygo-maps)';
const MAX_TRIES = 6;

const [bboxArg, out] = process.argv.slice(2);
if (!bboxArg || !out) {
  console.error('usage: node scripts/helppack.mjs <west,south,east,north> <out.geojson>');
  process.exit(2);
}
const bbox = bboxArg.split(',').map(Number);

async function query(q) {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const endpoint = ENDPOINTS[(attempt - 1) % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
        body: new URLSearchParams({ data: q }),
        signal: AbortSignal.timeout(15 * 60_000),
      });
      if (res.ok) return await res.json();
      // 429 = too many requests, 504 = server busy: back off and retry, as Overpass asks.
      if (res.status !== 429 && res.status !== 504 && res.status < 500) {
        throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      console.warn(`Overpass ${res.status} from ${endpoint} (try ${attempt}/${MAX_TRIES})`);
    } catch (err) {
      if (attempt === MAX_TRIES || /^Overpass 4/.test(err.message)) throw err;
      console.warn(`Overpass request failed (try ${attempt}/${MAX_TRIES}): ${err.message}`);
    }
    await sleep(Math.min(30_000 * 2 ** (attempt - 1), 5 * 60_000));
  }
  throw new Error('Overpass: out of retries');
}

const started = Date.now();
const raw = await query(overpassQuery(bbox));
if (raw.remark) console.warn(`Overpass remark: ${raw.remark}`);
if (/runtime error|timed out/i.test(raw.remark ?? '')) throw new Error(`Overpass did not finish: ${raw.remark}`);
const pack = toHelpPack(raw);
await writeFile(out, JSON.stringify(pack));

const counts = {};
for (const f of pack.features) counts[f.properties.kind] = (counts[f.properties.kind] ?? 0) + 1;
console.log(`Help Pack: ${pack.features.length} points in ${Math.round((Date.now() - started) / 1000)} s`, counts);
