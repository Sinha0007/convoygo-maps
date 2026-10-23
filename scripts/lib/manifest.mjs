// manifest.json: what the ConvoyGo server reads to build its region catalogue.
// {
//   release: 'maps-2026-10-23',            // the tag these assets belong to
//   generatedAt: ISO time,
//   regions: [{ id, name, bbox: [w, s, e, n], version, files: [{ kind, asset, sizeBytes, md5 }] }]
// }

export const MAX_ASSET_BYTES = 2 * 1024 ** 3;
export const DEMO_MAX_BYTES = 25 * 1024 ** 2;

/** Release tag for a UTC day; a second release that day gets '.2', then '.3'. */
export function releaseTag(now, existingTags) {
  const base = `maps-${now.toISOString().slice(0, 10)}`;
  if (!existingTags.has(base)) return base;
  for (let n = 2; ; n++) if (!existingTags.has(`${base}.${n}`)) return `${base}.${n}`;
}

/**
 * Next manifest from the previous one and what this run built.
 *   built:  { [regionId]: [{ kind, asset, sizeBytes, md5 }] } (without assets.zip)
 *   assets: { asset: 'assets.zip', sizeBytes, md5 } built this run (shared by every region)
 * Rebuilt regions get version + 1 (or 1); the others carry over unchanged, and their
 * files are listed in `carry` so the caller copies them into the new release.
 */
export function nextManifest({ previous, config, built, assets, release, now }) {
  const prev = new Map((previous?.regions ?? []).map((r) => [r.id, r]));
  const regions = [];
  const carry = new Set();
  const warnings = [];

  for (const c of config.regions) {
    const assetsFile = { kind: 'assets', ...assets };
    if (built[c.id]) {
      regions.push({
        id: c.id,
        name: c.name,
        bbox: c.bbox,
        version: (prev.get(c.id)?.version ?? 0) + 1,
        files: [...built[c.id], assetsFile],
      });
    } else if (prev.has(c.id)) {
      const p = prev.get(c.id);
      const files = p.files.filter((f) => f.kind !== 'assets');
      for (const f of files) carry.add(f.asset);
      // The bbox the files were built with, not a newer one from regions.json.
      regions.push({ id: c.id, name: c.name, bbox: p.bbox, version: p.version, files: [...files, assetsFile] });
    } else {
      warnings.push(`${c.id} was not built and is not in the previous release; it is left out`);
    }
  }
  for (const id of prev.keys()) {
    if (!config.regions.some((c) => c.id === id)) warnings.push(`${id} is no longer in regions.json; dropped`);
  }
  return { manifest: { release, generatedAt: now.toISOString(), regions }, carry: [...carry].sort(), warnings };
}

/** Problems that must stop a release. */
export function checkLimits(manifest) {
  const problems = [];
  for (const r of manifest.regions) {
    for (const f of r.files) {
      if (f.sizeBytes > MAX_ASSET_BYTES) problems.push(`${f.asset} is ${f.sizeBytes} bytes; a release asset can be at most 2 GB`);
      if (f.sizeBytes <= 0) problems.push(`${f.asset} is empty`);
    }
    if (r.id === 'in-manali-demo') {
      const own = r.files.filter((f) => f.kind !== 'assets').reduce((s, f) => s + f.sizeBytes, 0);
      if (own > DEMO_MAX_BYTES) problems.push(`in-manali-demo is ${own} bytes; keep it under 25 MB`);
    }
  }
  return problems;
}
