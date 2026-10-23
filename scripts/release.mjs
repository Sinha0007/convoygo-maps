// Publishes dist/ as a GitHub release with manifest.json. Uses the workflow's GITHUB_TOKEN.
//   node scripts/release.mjs
// The release is created as a draft, filled, then published, so "latest" always points
// at a complete release. Regions not rebuilt this run are copied from the previous one.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, openAsBlob } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { checkLimits, nextManifest, releaseTag } from './lib/manifest.mjs';

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');

const api = async (method, path, body) => {
  const res = await fetch(path.startsWith('https://') ? path : `https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
};

async function md5(path) {
  const hash = createHash('md5');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function describe(path) {
  return { asset: basename(path), sizeBytes: (await stat(path)).size, md5: await md5(path) };
}

const KIND = /^(.+)-(base|contours|helppack)\.(pmtiles|geojson)$/;

// What this run built: dist/<id>/<id>-<kind>.<ext> and dist/assets.zip
const built = {};
for (const entry of await readdir('dist', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const files = [];
  for (const name of (await readdir(join('dist', entry.name))).sort()) {
    const m = KIND.exec(name);
    if (m && m[1] === entry.name) files.push({ kind: m[2], ...(await describe(join('dist', entry.name, name))) });
  }
  const order = { base: 0, contours: 1, helppack: 2 };
  if (files.length) built[entry.name] = files.sort((a, b) => order[a.kind] - order[b.kind]);
}
const assets = await describe('dist/assets.zip');

const config = JSON.parse(await readFile('regions.json', 'utf8'));
const latest = await api('GET', '/releases/latest');
let previous;
if (latest) {
  const m = latest.assets.find((a) => a.name === 'manifest.json');
  if (m) previous = await (await fetch(m.browser_download_url)).json();
  console.log(`Previous release: ${latest.tag_name}${previous ? '' : ' (no manifest.json)'}`);
}

const now = new Date();
const tags = new Set((await api('GET', '/releases?per_page=100')).map((r) => r.tag_name));
const tag = releaseTag(now, tags);
const { manifest, carry, warnings } = nextManifest({ previous, config, built, assets, release: tag, now });
for (const w of warnings) console.warn(`warning: ${w}`);
const problems = checkLimits(manifest);
if (problems.length) throw new Error(`Not releasing:\n  ${problems.join('\n  ')}`);

const table = manifest.regions
  .flatMap((r) => r.files.filter((f) => f.kind !== 'assets').map((f) => `| ${r.id} | ${r.version} | ${f.asset} | ${(f.sizeBytes / 1e6).toFixed(1)} MB |`))
  .join('\n');
const body = `Offline maps for ConvoyGo.

| Region | Version | File | Size |
| --- | --- | --- | --- |
${table}
| (all) | | assets.zip | ${(assets.sizeBytes / 1e6).toFixed(1)} MB |

Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).
Contours from the Copernicus DEM GLO-30. Fonts: SIL Open Font License.`;

const release = await api('POST', '/releases', {
  tag_name: tag,
  target_commitish: process.env.GITHUB_SHA,
  name: tag,
  body,
  draft: true,
});
const uploadUrl = release.upload_url.replace(/\{.*\}$/, '');

async function upload(path, name = basename(path)) {
  const started = Date.now();
  const res = await fetch(`${uploadUrl}?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/octet-stream',
    },
    body: await openAsBlob(path),
  });
  if (!res.ok) throw new Error(`upload ${name} → ${res.status} ${await res.text()}`);
  console.log(`uploaded ${name} in ${Math.round((Date.now() - started) / 1000)} s`);
}

for (const [id, files] of Object.entries(built)) {
  if (!manifest.regions.some((r) => r.id === id)) continue;
  for (const f of files) await upload(join('dist', id, f.asset));
}
await upload('dist/assets.zip');

// Carry-over: copy unchanged regions' files so the latest release is always complete.
await mkdir('carry', { recursive: true });
for (const name of carry) {
  const asset = latest.assets.find((a) => a.name === name);
  if (!asset) throw new Error(`${name} is in the previous manifest but not in release ${latest.tag_name}`);
  const path = join('carry', name);
  const res = await fetch(asset.browser_download_url);
  if (!res.ok) throw new Error(`download ${name} → ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(path));
  const expected = previous.regions.flatMap((r) => r.files).find((f) => f.asset === name).md5;
  if ((await md5(path)) !== expected) throw new Error(`${name}: md5 differs from the previous manifest`);
  await upload(path);
}

await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2));
await upload('dist/manifest.json');
await api('PATCH', `/releases/${release.id}`, { draft: false, make_latest: 'true' });
console.log(`Published ${tag}: https://github.com/${repo}/releases/tag/${tag}`);
