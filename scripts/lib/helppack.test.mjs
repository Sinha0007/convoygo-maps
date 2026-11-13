import assert from 'node:assert/strict';
import { test } from 'node:test';

import { centroid, kindOf, overpassQuery, parseEle, parsePhone, toFeature, toHelpPack } from './helppack.mjs';

test('maps every OSM tag to its Help Pack kind', () => {
  assert.equal(kindOf({ amenity: 'hospital' }), 'hospital');
  assert.equal(kindOf({ amenity: 'clinic' }), 'clinic');
  assert.equal(kindOf({ amenity: 'police' }), 'police');
  assert.equal(kindOf({ amenity: 'fuel' }), 'fuel');
  assert.equal(kindOf({ amenity: 'drinking_water' }), 'water');
  assert.equal(kindOf({ amenity: 'shelter' }), 'shelter');
  assert.equal(kindOf({ shop: 'car_repair' }), 'mechanic');
  assert.equal(kindOf({ shop: 'motorcycle_repair' }), 'mechanic');
  assert.equal(kindOf({ tourism: 'alpine_hut' }), 'shelter');
  assert.equal(kindOf({ tourism: 'wilderness_hut' }), 'shelter');
  assert.equal(kindOf({ tourism: 'viewpoint' }), 'viewpoint');
  assert.equal(kindOf({ natural: 'peak' }), 'peak');
  assert.equal(kindOf({ mountain_pass: 'yes', natural: 'saddle' }), 'pass');
  assert.equal(kindOf({ place: 'town' }), 'place');
  assert.equal(kindOf({ place: 'hamlet' }), 'place');
  assert.equal(kindOf({ place: 'locality' }), undefined);
  assert.equal(kindOf({ amenity: 'restaurant' }), undefined);
});

test('a node becomes a point with exactly the contract properties', () => {
  const f = toFeature({
    type: 'node',
    id: 123,
    lat: 32.3716,
    lon: 77.2466,
    tags: { natural: 'peak', name: 'Rohtang Peak', ele: '3,978 m', phone: '+91 1902 252 100; +91 98160 00000', wikidata: 'Q1' },
  });
  assert.deepEqual(f, {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [77.2466, 32.3716] },
    properties: { kind: 'peak', name: 'Rohtang Peak', phone: '+91 1902 252 100', ele: 3978, osmId: 'node/123' },
  });
});

test('elevation only for peaks and shelters; feet are converted', () => {
  const fuel = toFeature({ type: 'node', id: 1, lat: 32, lon: 77, tags: { amenity: 'fuel', ele: '2000' } });
  assert.equal(fuel.properties.ele, undefined);
  assert.equal(parseEle('12300 ft'), 3749);
  assert.equal(parseEle('about 3000'), undefined);
  assert.equal(parseEle(undefined), undefined);
});

test('a way uses its area centroid, a relation its center', () => {
  const square = [
    { lon: 77.0, lat: 32.0 },
    { lon: 77.2, lat: 32.0 },
    { lon: 77.2, lat: 32.2 },
    { lon: 77.0, lat: 32.2 },
    { lon: 77.0, lat: 32.0 },
  ];
  const way = toFeature({ type: 'way', id: 9, geometry: square, tags: { amenity: 'hospital', name: 'Mission Hospital' } });
  assert.deepEqual(way.geometry.coordinates, [77.1, 32.1]);
  assert.equal(way.properties.osmId, 'way/9');
  const rel = toFeature({ type: 'relation', id: 5, center: { lat: 32.5, lon: 77.5 }, tags: { amenity: 'police' } });
  assert.deepEqual(rel.geometry.coordinates, [77.5, 32.5]);
  assert.deepEqual(centroid([{ lon: 1, lat: 1 }, { lon: 3, lat: 3 }]), [2, 2]);
});

test('prefers name:en, drops junk phones and unknown kinds, de-duplicates', () => {
  const pack = toHelpPack({
    elements: [
      { type: 'node', id: 2, lat: 32, lon: 77, tags: { amenity: 'police', name: 'पुलिस', 'name:en': 'Police Post', phone: 'n/a' } },
      { type: 'node', id: 2, lat: 32, lon: 77, tags: { amenity: 'police', name: 'dup' } },
      { type: 'node', id: 3, lat: 32, lon: 77, tags: { amenity: 'bench' } },
      { type: 'node', id: 1, lat: 32, lon: 77, tags: { amenity: 'drinking_water' } },
    ],
  });
  assert.deepEqual(
    pack.features.map((f) => f.properties),
    [
      { kind: 'water', osmId: 'node/1' },
      { kind: 'police', name: 'dup', osmId: 'node/2' },
    ],
  );
  assert.equal(parsePhone({ 'contact:phone': '01902-252100' }), '01902-252100');
  assert.equal(parsePhone({ phone: 'n/a' }), undefined);
});

test('the query asks for every kind inside the bbox (south, west, north, east)', () => {
  const q = overpassQuery([75.5, 30.3, 79.05, 33.3]);
  assert.match(q, /\(30\.3,75\.5,33\.3,79\.05\)/);
  for (const v of ['hospital', 'clinic', 'police', 'fuel', 'drinking_water', 'shelter', 'car_repair', 'motorcycle_repair', 'alpine_hut', 'wilderness_hut', 'viewpoint', '"natural"="peak"', '"mountain_pass"="yes"', 'city|town|village|hamlet']) {
    assert.ok(q.includes(v), v);
  }
  assert.match(q, /out tags geom/);
  assert.match(q, /out tags center/);
});

test('passes keep their elevation; places are searchable names', () => {
  const pass = toFeature({ type: 'node', id: 7, lat: 32.3712, lon: 77.2479, tags: { mountain_pass: 'yes', name: 'Rohtang Pass', ele: '3978' } });
  assert.deepEqual(pass.properties, { kind: 'pass', name: 'Rohtang Pass', ele: 3978, osmId: 'node/7' });
  const town = toFeature({ type: 'node', id: 8, lat: 32.2432, lon: 77.1892, tags: { place: 'town', name: 'Manali', ele: '2050' } });
  assert.deepEqual(town.properties, { kind: 'place', name: 'Manali', osmId: 'node/8' });
});
