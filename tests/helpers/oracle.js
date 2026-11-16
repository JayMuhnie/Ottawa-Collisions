// Independent "answer key". Deliberately uses DIFFERENT math from the app:
//  - circle: 3-D chord distance on the sphere (the app uses haversine)
//  - polygon: winding number computed in Web Mercator, i.e. the space the map actually draws in
//    (the app uses ray casting in raw lat/lng)
// plus brute-force set logic for "same Geo_ID" expansion.

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

function unit(lat, lng) {
  const p = rad(lat), l = rad(lng);
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

export function chordDistanceM(aLat, aLng, bLat, bLng) {
  const u = unit(aLat, aLng), v = unit(bLat, bLng);
  const c = Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  return R * 2 * Math.asin(Math.min(1, c / 2));
}

// Spherical Web Mercator (what Leaflet draws with). Returns metres.
export function mercator(lat, lng) {
  const Rm = 6378137;
  return { x: Rm * rad(lng), y: Rm * Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2)) };
}

// winding number of polygon [[lat,lng],...] around point, in Mercator space
export function insidePolygonMercator(poly, lat, lng) {
  const P = mercator(lat, lng);
  const V = poly.map(([a, b]) => mercator(a, b));
  let wn = 0;
  for (let i = 0; i < V.length; i++) {
    const a = V[i], b = V[(i + 1) % V.length];
    const isLeft = (b.x - a.x) * (P.y - a.y) - (P.x - a.x) * (b.y - a.y);
    if (a.y <= P.y) { if (b.y > P.y && isLeft > 0) wn++; }
    else if (b.y <= P.y && isLeft < 0) wn--;
  }
  return wn !== 0;
}

// ground distance (m) from a point to the nearest polygon edge, measured in Mercator then scaled to ground metres
export function distanceToPolygonEdgeM(poly, lat, lng) {
  const P = mercator(lat, lng);
  const V = poly.map(([a, b]) => mercator(a, b));
  let best = Infinity;
  for (let i = 0; i < V.length; i++) {
    const a = V[i], b = V[(i + 1) % V.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((P.x - a.x) * dx + (P.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(P.x - (a.x + t * dx), P.y - (a.y + t * dy)));
  }
  return best * Math.cos(rad(lat));
}

const geoIdOf = (p) => (p.Geo_ID == null ? "" : String(p.Geo_ID).trim());

// Brute-force expected result of a selection + "same location" expansion.
// `isInside(feature)` decides the spatial selection.
export function expectedSelection(dataset, isInside) {
  const spatial = dataset.filter(isInside);
  const ids = new Set(spatial.map((f) => geoIdOf(f.properties)).filter(Boolean));
  const spatialSet = new Set(spatial.map((f) => f.properties.OBJECTID));
  const final = dataset.filter((f) => spatialSet.has(f.properties.OBJECTID) || ids.has(geoIdOf(f.properties)));
  const outOfArea = final.filter((f) => !spatialSet.has(f.properties.OBJECTID));
  return {
    spatialIds: spatialSet,
    finalIds: new Set(final.map((f) => f.properties.OBJECTID)),
    outOfAreaIds: new Set(outOfArea.map((f) => f.properties.OBJECTID)),
  };
}

export const expectedRadius = (dataset, lat, lng, km) =>
  expectedSelection(dataset, (f) => {
    const [x, y] = f.geometry.coordinates;
    return chordDistanceM(lat, lng, y, x) <= km * 1000;
  });

export const expectedPolygon = (dataset, poly) =>
  expectedSelection(dataset, (f) => {
    const [x, y] = f.geometry.coordinates;
    return insidePolygonMercator(poly, y, x);
  });

export const idSet = (features) => new Set(features.map((f) => f.properties.OBJECTID));
export const setDiff = (a, b) => [...a].filter((x) => !b.has(x));
