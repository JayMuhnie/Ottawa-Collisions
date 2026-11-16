import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { makeDataset, makeFeature, destination, mulberry32 } from "./helpers/dataset.js";
import { installFakeArcgis } from "./helpers/fakeArcgis.js";
import { expectedRadius, expectedPolygon, chordDistanceM, insidePolygonMercator, idSet, setDiff, distanceToPolygonEdgeM } from "./helpers/oracle.js";
import { selectInRadius, selectInPolygon, visibleCollisions, outOfAreaKeys } from "../src/selection.js";
import { buildCSV, exportToCSV, getAllLocations, featureKeysInLocations, featureKey, ownLocationKey, applyFilters, pointInPolygon } from "../src/utils.js";

const ids = (fs) => idSet(fs);
const data = makeDataset(42, 500).features;
beforeEach(() => { installFakeArcgis(data); });

function expectSame(actualFeatures, actualOut, exp) {
  expect(setDiff(ids(actualFeatures), exp.finalIds)).toEqual([]);   // nothing extra
  expect(setDiff(exp.finalIds, ids(actualFeatures))).toEqual([]);   // nothing missing
  expect(actualFeatures.length).toBe(exp.finalIds.size);            // no duplicates
  const out = new Set(actualOut.map(Number));
  expect(setDiff(out, exp.outOfAreaIds)).toEqual([]);
  expect(setDiff(exp.outOfAreaIds, out)).toEqual([]);
}

describe("radius selection vs independent oracle", () => {
  const rnd = mulberry32(7);
  const cases = [];
  for (let i = 0; i < 40; i++) {
    const f = data[Math.floor(rnd() * data.length)];
    const [lng, lat] = f.geometry.coordinates;
    cases.push([lat + (rnd() - 0.5) * 0.004, lng + (rnd() - 0.5) * 0.004, [0.25, 0.5, 1, 2, 5][i % 5]]);
  }
  it.each(cases)("random centre %#", async (lat, lng, km) => {
    const r = await selectInRadius(lat, lng, km);
    expectSame(r.features, r.outOfAreaIds, expectedRadius(data, lat, lng, km));
  });

  it("corner points of the old square box are excluded, points just inside are kept", async () => {
    const lat = 45.4215, lng = -75.6972, km = 1;
    const inside = destination(lat, lng, 45, 995), outside = destination(lat, lng, 45, 1005);
    const mine = [makeFeature(900001, inside.lat, inside.lng), makeFeature(900002, outside.lat, outside.lng),
      makeFeature(900003, ...Object.values(destination(lat, lng, 0, 999.5))), makeFeature(900004, ...Object.values(destination(lat, lng, 90, 1000.5)))];
    installFakeArcgis(mine);
    const r = await selectInRadius(lat, lng, km);
    expect([...ids(r.features)].sort()).toEqual([900001, 900003]);
  });
});

describe("polygon selection vs independent Mercator oracle", () => {
  const rnd = mulberry32(11);
  const polys = [];
  for (let i = 0; i < 30; i++) {
    const f = data[Math.floor(rnd() * data.length)];
    const [lng, lat] = f.geometry.coordinates;
    const n = 3 + Math.floor(rnd() * 6);
    const poly = [];
    for (let k = 0; k < n; k++) { const d = destination(lat, lng, (360 / n) * k + rnd() * 30, 150 + rnd() * 1500); poly.push([d.lat, d.lng]); }
    polys.push(poly);
  }
  it.each(polys)("random polygon %#", async (...poly) => {
    const r = await selectInPolygon(poly);
    expectSame(r.features, r.outOfAreaIds, expectedPolygon(data, poly));
  });

  it("concave (L-shaped) polygon excludes the notch", async () => {
    const poly = [[45.40, -75.70], [45.40, -75.68], [45.41, -75.68], [45.41, -75.69], [45.42, -75.69], [45.42, -75.70]];
    const pts = [[45.405, -75.695, true], [45.415, -75.695, true], [45.415, -75.685, false], [45.405, -75.685, true], [45.43, -75.695, false]];
    installFakeArcgis(pts.map(([la, ln], i) => makeFeature(i + 1, la, ln)));
    const r = await selectInPolygon(poly);
    expect([...ids(r.features)].sort()).toEqual(pts.map((p, i) => p[2] ? i + 1 : null).filter(Boolean));
  });

  it("long edge: point just either side of the on-screen line (Mercator, not lat/lng)", async () => {
    const poly = [[45.0, -76.0], [45.9, -75.0], [45.0, -75.0]]; // long diagonal edge
    const rnd2 = mulberry32(3), feats = [];
    for (let i = 0; i < 400; i++) feats.push(makeFeature(i + 1, 45 + rnd2() * 0.9, -76 + rnd2()));
    installFakeArcgis(feats);
    const r = await selectInPolygon(poly);
    const exp = feats.filter(f => insidePolygonMercator(poly, f.geometry.coordinates[1], f.geometry.coordinates[0]));
    expect(setDiff(ids(r.features), ids(exp))).toEqual([]);
    expect(setDiff(ids(exp), ids(r.features))).toEqual([]);
    // sanity: the lat/lng shortcut WOULD have disagreed for some points
    expect(feats.some(f => {
      const [x, y] = f.geometry.coordinates; return distanceToPolygonEdgeM(poly, y, x) < 5000;
    })).toBe(true);
  });

  it("self-crossing (bow-tie) uses even-odd, like the shading", () => {
    const bow = [[45.40, -75.70], [45.42, -75.68], [45.42, -75.70], [45.40, -75.68]];
    for (let i = 0; i < 200; i++) {
      const la = 45.39 + (i % 20) * 0.0015, ln = -75.71 + Math.floor(i / 20) * 0.003;
      const P = [la, ln];
      // even-odd count of crossings in Mercator done by hand via oracle winding: bow-tie lobes have winding +1/-1, so winding!=0 == even-odd here
      expect(pointInPolygon(P, bow)).toBe(insidePolygonMercator(bow, la, ln));
    }
  });
});

describe("out-of-area (same Geo_ID) records", () => {
  it("includes same-ID points outside the circle, flags them, includes none of other IDs", async () => {
    const c = { lat: 45.42, lng: -75.7 };
    const a1 = destination(c.lat, c.lng, 10, 100), a2 = destination(c.lat, c.lng, 20, 2500), a3 = destination(c.lat, c.lng, 200, 5000);
    const b1 = destination(c.lat, c.lng, 90, 3000);
    const mine = [
      makeFeature(1, a1.lat, a1.lng, { Geo_ID: "0002250", Location: "A" }),
      makeFeature(2, a2.lat, a2.lng, { Geo_ID: "0002250", Location: "A" }),
      makeFeature(3, a3.lat, a3.lng, { Geo_ID: "0002250", Location: "A" }),
      makeFeature(4, b1.lat, b1.lng, { Geo_ID: "0002251", Location: "B" }),
      makeFeature(5, a1.lat, a1.lng, { Geo_ID: "__3ZAAAA", Location: "C" }),
    ];
    installFakeArcgis(mine);
    const r = await selectInRadius(c.lat, c.lng, 0.5);
    expect([...ids(r.features)].sort()).toEqual([1, 2, 3, 5]);
    expect(r.outOfAreaIds.map(Number).sort()).toEqual([2, 3]);
  });

  it("works in polygon mode and leading-zero IDs are preserved", async () => {
    const poly = [[45.41, -75.71], [45.41, -75.69], [45.43, -75.69], [45.43, -75.71]];
    const mine = [makeFeature(1, 45.42, -75.70, { Geo_ID: "0000042" }), makeFeature(2, 45.50, -75.50, { Geo_ID: "0000042" }),
      makeFeature(3, 45.50, -75.50, { Geo_ID: "42" })];
    installFakeArcgis(mine);
    const r = await selectInPolygon(poly);
    expect([...ids(r.features)].sort()).toEqual([1, 2]);
    expect(r.outOfAreaIds.map(Number)).toEqual([2]);
  });

  it("more than 1000 / more than 10,000 records are all loaded (no silent truncation)", async () => {
    const feats = [];
    for (let i = 0; i < 12500; i++) feats.push(makeFeature(i + 1, 45.42 + (i % 100) * 1e-5, -75.7 + Math.floor(i / 100) * 1e-5));
    installFakeArcgis(feats);
    const r = await selectInRadius(45.42, -75.7, 2);
    expect(r.features.length).toBe(12500);
    expect(ids(r.features).size).toBe(12500);
  });

  it("a failed request surfaces as an error instead of partial data", async () => {
    globalThis.fetch = async () => new Response("Bad Request", { status: 400 });
    await expect(selectInRadius(45.4, -75.7, 1)).rejects.toThrow();
  });
});

describe("filters, exclusion and export", () => {
  let sel;
  beforeEach(async () => {
    const f = data[1000]; const [lng, lat] = f.geometry.coordinates;
    sel = await selectInRadius(lat, lng, 3);
  });

  it("excluding a location removes exactly its records, including nearby-matched and name-only ones", () => {
    const locs = getAllLocations(sel.features);
    const withNearby = locs.find(l => l.nearbyCount > 0) || locs[0];
    const nameOnly = locs.find(l => l.key.startsWith("loc:"));
    const keys = new Set([withNearby.key, nameOnly?.key].filter(Boolean));
    const expectedDrop = new Set();
    locs.filter(l => keys.has(l.key)).forEach(l => l.features.forEach(f => expectedDrop.add(featureKey(f))));
    const vis = visibleCollisions(sel.features, { years: [], types: [], severity: [], involvement: [] }, keys);
    expect(sel.features.length - vis.length).toBe(expectedDrop.size);
    vis.forEach(f => expect(expectedDrop.has(featureKey(f))).toBe(false));
    expect(featureKeysInLocations(sel.features, keys).size).toBe(expectedDrop.size);
  });

  it("filters match a brute-force reference", () => {
    const filters = { years: ["2020", "2021"], types: [], severity: ["Fatal", "Non-fatal Injury"], involvement: [] };
    const got = applyFilters(sel.features, filters);
    const ref = sel.features.filter(f => [2020, 2021].includes(Number(f.properties.Accident_Year)) &&
      /^0[12]/.test(f.properties.Classification_Of_Accident));
    expect(setDiff(ids(got), ids(ref))).toEqual([]);
    expect(setDiff(ids(ref), ids(got))).toEqual([]);
  });

  it("CSV has one row per visible record, correct IDs, and survives a round trip", () => {
    const rows = visibleCollisions(sel.features, { years: ["2019"], types: [], severity: [], involvement: [] }, new Set());
    const withNasty = [...rows.slice(0, 3)].map((f, i) => ({ ...f, properties: { ...f.properties, Location: ['A "quoted", St', "line\nbreak", "café ÉCOLE\r\n"][i] } }));
    const csv = buildCSV([...rows, ...withNasty]);
    // minimal RFC4180 parser
    const out = []; let row = [], cell = "", q = false;
    for (let i = 0; i < csv.length; i++) {
      const ch = csv[i];
      if (q) { if (ch === '"') { if (csv[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); out.push(row); row = []; cell = ""; } else cell += ch;
    }
    row.push(cell); out.push(row);
    const head = out[0], body = out.slice(1);
    expect(body.length).toBe(rows.length + withNasty.length);
    const oi = head.indexOf("OBJECTID"), li = head.indexOf("Location");
    body.slice(0, rows.length).forEach((r, i) => expect(r[oi]).toBe(String(rows[i].properties.OBJECTID)));
    body.slice(rows.length).forEach((r, i) => expect(r[li]).toBe(withNasty[i].properties.Location));
  });

  it("featureKey never collapses distinct records", () => {
    expect(new Set(sel.features.map(featureKey)).size).toBe(sel.features.length);
    expect(featureKey({ properties: {}, geometry: { coordinates: [1, 2] } })).not.toBe(featureKey({ properties: {}, geometry: { coordinates: [1, 3] } }));
  });
});

describe("unnamed records (nearby match) and exclusion", () => {
  const A = { lat: 45.42, lng: -75.70 };
  const mk = () => {
    const a1 = destination(A.lat, A.lng, 0, 0);
    const near = destination(A.lat, A.lng, 90, 20);   // 20 m from A  -> snaps
    const far = destination(A.lat, A.lng, 270, 45);   // 45 m west, >100 m from B -> isolated
    const B = destination(A.lat, A.lng, 90, 60);      // location B 60 m away
    const mid = destination(A.lat, A.lng, 90, 35);    // 35 m from A, 25 m from B -> must pick B (closest), not A (first)
    return [
      makeFeature(1, a1.lat, a1.lng, { Geo_ID: "0000001", Location: "A" }),
      makeFeature(2, B.lat, B.lng, { Geo_ID: "0000002", Location: "B" }),
      makeFeature(3, near.lat, near.lng),
      makeFeature(4, far.lat, far.lng),
      makeFeature(5, mid.lat, mid.lng),
    ];
  };
  it("snaps to the CLOSEST named location within 30 m, leaves others alone", () => {
    const locs = getAllLocations(mk());
    const a = locs.find(l => l.key === "gid:0000001"), b = locs.find(l => l.key === "gid:0000002");
    expect(a.features.map(f => f.properties.OBJECTID).sort()).toEqual([1, 3]);
    expect(b.features.map(f => f.properties.OBJECTID).sort()).toEqual([2, 5]);
    expect(a.nearbyCount).toBe(1);
  });
  it("excluding a location also removes its nearby-matched records, and nothing else", () => {
    const f = mk();
    const vis = visibleCollisions(f, { years: [], types: [], severity: [], involvement: [] }, new Set(["gid:0000001"]));
    expect(vis.map(x => x.properties.OBJECTID).sort()).toEqual([2, 4, 5]);
  });
  it("name-only location can be excluded by its own key", () => {
    const f = [makeFeature(1, 45.4, -75.7, { Location: "MAIN ST" }), makeFeature(2, 45.4, -75.7, { Location: "MAIN ST" }), makeFeature(3, 45.5, -75.6, { Location: "OTHER" })];
    expect(ownLocationKey(f[0].properties)).toBe("loc:MAIN ST");
    const vis = visibleCollisions(f, { years: [], types: [], severity: [], involvement: [] }, new Set(["loc:MAIN ST"]));
    expect(vis.map(x => x.properties.OBJECTID)).toEqual([3]);
  });
});

describe("yellow 'outside area' flag always agrees with the drawn boundary", () => {
  const rnd = mulberry32(99);
  it.each(Array.from({ length: 25 }, (_, i) => i))("radius case %i: flagged == outside the circle", async (i) => {
    const f = data[Math.floor(rnd() * data.length)];
    const [lng, lat] = f.geometry.coordinates;
    const km = [0.25, 0.5, 1, 2][i % 4];
    const r = await selectInRadius(lat, lng, km);
    const flagged = outOfAreaKeys(r.features, { type: "radius", lat, lng, radiusKm: km });
    r.features.forEach(x => {
      const [px, py] = x.geometry.coordinates;
      const outside = chordDistanceM(lat, lng, py, px) > km * 1000;
      expect(flagged.has(featureKey(x))).toBe(outside);
    });
    expect(flagged.size).toBe(r.outOfAreaIds.length);   // same answer as the query-based list
  });
  it.each(Array.from({ length: 15 }, (_, i) => i))("polygon case %i", async (i) => {
    const f = data[Math.floor(rnd() * data.length)];
    const [lng, lat] = f.geometry.coordinates;
    const poly = [0, 1, 2, 3, 4].map(k => { const d = destination(lat, lng, k * 72 + rnd() * 30, 300 + rnd() * 900); return [d.lat, d.lng]; });
    const r = await selectInPolygon(poly);
    const flagged = outOfAreaKeys(r.features, { type: "polygon", vertices: poly });
    r.features.forEach(x => {
      const [px, py] = x.geometry.coordinates;
      expect(flagged.has(featureKey(x))).toBe(!insidePolygonMercator(poly, py, px));
    });
    expect(flagged.size).toBe(r.outOfAreaIds.length);
  });
});

describe("exportToCSV save dialog", () => {
  const feats = [makeFeature(1, 45.4, -75.7, { Location: "A" })];
  const read = async (blob) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blob.arrayBuffer());
  afterEach(() => { delete globalThis.window; delete globalThis.document; });

  it("uses the Save-as dialog when available and writes the exact CSV", async () => {
    let written, opts;
    globalThis.window = { showSaveFilePicker: async (o) => { opts = o; return { createWritable: async () => ({ write: async (b) => { written = b; }, close: async () => {} }) }; } };
    expect(await exportToCSV(feats)).toBe("saved");
    expect(opts.suggestedName).toBe("ottawa-collisions.csv");
    expect(await read(written)).toBe("﻿" + buildCSV(feats));
  });
  it("does nothing (and no download) if the user cancels", async () => {
    let downloaded = false;
    globalThis.window = { showSaveFilePicker: async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); } };
    globalThis.document = { createElement: () => { downloaded = true; return {}; } };
    expect(await exportToCSV(feats)).toBe("cancelled");
    expect(downloaded).toBe(false);
  });
  it("falls back to a normal download when the browser has no Save-as dialog", async () => {
    let clicked = false;
    globalThis.window = {};
    globalThis.document = { createElement: () => ({ click: () => { clicked = true; } }) };
    globalThis.URL.createObjectURL = () => "blob:x"; globalThis.URL.revokeObjectURL = () => {};
    expect(await exportToCSV(feats)).toBe("downloaded");
    expect(clicked).toBe(true);
  });
});
