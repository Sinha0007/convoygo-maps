// Prints a Markdown table of every built file, its size and how long its step took.
//   node scripts/summary.mjs >> "$GITHUB_STEP_SUMMARY"
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const mb = (b) => `${(b / 1e6).toFixed(1)} MB`;
const time = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);

const timings = new Map();
for (const line of readFileSync('dist/timings.tsv', 'utf8').trim().split('\n').filter(Boolean)) {
  const [id, kind, seconds] = line.split('\t');
  timings.set(`${id}/${kind}`, Number(seconds));
}

const rows = [];
let total = 0;
for (const id of readdirSync('dist').filter((d) => statSync(join('dist', d)).isDirectory()).sort()) {
  let regionBytes = 0;
  let regionSeconds = 0;
  for (const name of readdirSync(join('dist', id)).filter((n) => /\.(pmtiles|geojson)$/.test(n)).sort()) {
    const kind = name.slice(id.length + 1).split('.')[0];
    const bytes = statSync(join('dist', id, name)).size;
    const seconds = timings.get(`${id}/${kind}`) ?? 0;
    regionBytes += bytes;
    regionSeconds += seconds;
    rows.push(`| ${id} | ${name} | ${mb(bytes)} | ${time(seconds)} |`);
  }
  rows.push(`| **${id}** | **total** | **${mb(regionBytes)}** | **${time(regionSeconds)}** |`);
  total += regionSeconds;
}
if (existsSync('dist/assets.zip')) {
  const seconds = timings.get('(all)/assets') ?? 0;
  rows.push(`| (all) | assets.zip | ${mb(statSync('dist/assets.zip').size)} | ${time(seconds)} |`);
  total += seconds;
}

console.log(`## Map build

| Region | File | Size | Time |
| --- | --- | --- | --- |
${rows.join('\n')}

Total build time: ${time(total)}
`);
