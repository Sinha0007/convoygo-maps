import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkLimits, nextManifest, releaseTag } from './manifest.mjs';

const config = {
  regions: [
    { id: 'in-manali-demo', name: 'Manali (demo)', bbox: [77.08, 32.15, 77.3, 32.34] },
    { id: 'in-himachal', name: 'Himachal Pradesh', bbox: [75.5, 30.3, 79.05, 33.3] },
  ],
};
const assets = { asset: 'assets.zip', sizeBytes: 8_000_000, md5: 'a'.repeat(32) };
const file = (id, kind, ext = 'pmtiles') => ({ kind, asset: `${id}-${kind}.${ext}`, sizeBytes: 1000, md5: 'b'.repeat(32) });
const now = new Date('2026-10-23T08:00:00Z');

test('first release: every built region is version 1 with the shared assets.zip', () => {
  const { manifest, carry } = nextManifest({
    previous: undefined,
    config,
    built: { 'in-manali-demo': [file('in-manali-demo', 'base')], 'in-himachal': [file('in-himachal', 'base')] },
    assets,
    release: 'maps-2026-10-23',
    now,
  });
  assert.equal(manifest.release, 'maps-2026-10-23');
  assert.deepEqual(manifest.regions.map((r) => [r.id, r.version]), [['in-manali-demo', 1], ['in-himachal', 1]]);
  assert.deepEqual(manifest.regions[0].files.at(-1), { kind: 'assets', ...assets });
  assert.deepEqual(carry, []);
});

test('rebuilt regions go up by one; unchanged ones carry over with their files', () => {
  const previous = {
    release: 'maps-2026-09-20',
    regions: [
      { id: 'in-manali-demo', name: 'Manali', bbox: [77, 32, 77.3, 32.3], version: 4, files: [file('in-manali-demo', 'base'), { kind: 'assets', ...assets }] },
      { id: 'in-himachal', name: 'HP', bbox: [75.5, 30.3, 79, 33.3], version: 2, files: [file('in-himachal', 'base'), file('in-himachal', 'helppack', 'geojson'), { kind: 'assets', ...assets }] },
      { id: 'in-old', name: 'Old', bbox: [1, 1, 2, 2], version: 1, files: [file('in-old', 'base')] },
    ],
  };
  const { manifest, carry, warnings } = nextManifest({
    previous,
    config,
    built: { 'in-manali-demo': [file('in-manali-demo', 'base')] },
    assets,
    release: 'maps-2026-10-23',
    now,
  });
  assert.deepEqual(manifest.regions.map((r) => [r.id, r.version]), [['in-manali-demo', 5], ['in-himachal', 2]]);
  assert.deepEqual(manifest.regions[1].bbox, [75.5, 30.3, 79, 33.3]);
  assert.deepEqual(carry, ['in-himachal-base.pmtiles', 'in-himachal-helppack.geojson']);
  assert.match(warnings.join('\n'), /in-old is no longer in regions.json/);
});

test('release tags are per UTC day, numbered when repeated', () => {
  assert.equal(releaseTag(now, new Set()), 'maps-2026-10-23');
  assert.equal(releaseTag(now, new Set(['maps-2026-10-23'])), 'maps-2026-10-23.2');
  assert.equal(releaseTag(now, new Set(['maps-2026-10-23', 'maps-2026-10-23.2'])), 'maps-2026-10-23.3');
});

test('limits: 2 GB per asset, demo under 25 MB, no empty files', () => {
  const big = { regions: [{ id: 'in-x', files: [{ asset: 'x', sizeBytes: 3 * 1024 ** 3 }] }] };
  assert.match(checkLimits(big)[0], /2 GB/);
  const demo = { regions: [{ id: 'in-manali-demo', files: [{ asset: 'b', kind: 'base', sizeBytes: 30 * 1024 ** 2 }, { asset: 'assets.zip', kind: 'assets', sizeBytes: 9e6 }] }] };
  assert.match(checkLimits(demo)[0], /25 MB/);
  assert.deepEqual(checkLimits({ regions: [{ id: 'in-manali-demo', files: [{ asset: 'b', kind: 'base', sizeBytes: 20e6 }] }] }), []);
});
