// The selection pipeline, kept free of React so it can be tested directly.
import {
  fetchCollisionsNear, fetchCollisionsInBbox, fetchCollisionsByGeoIds,
  pointInPolygon, polygonBbox, mergeFeatures, buildOutOfAreaIds,
  applyFilters, featureKey, featureKeysInLocations, distanceM,
} from "./utils.js";

// Given the records spatially inside the area, also fetch every other record citywide that shares a
// Geo_ID with one of them. Those extras are flagged out-of-area (returned as an array of featureKeys).
export async function expandWithSameLocations(spatialFeatures) {
  const geoIds = [...new Set(
    spatialFeatures
      .map(f => f.properties?.Geo_ID)
      .filter(id => id != null && String(id).trim() !== "")
      .map(id => String(id).trim())
  )];
  if (geoIds.length === 0) return { features: spatialFeatures, outOfAreaIds: [] };
  const extra = await fetchCollisionsByGeoIds(geoIds);
  return {
    features: mergeFeatures(spatialFeatures, extra),
    outOfAreaIds: buildOutOfAreaIds(spatialFeatures, extra),
  };
}

export async function selectInRadius(lat, lng, km) {
  return expandWithSameLocations(await fetchCollisionsNear(lat, lng, km));
}

export async function selectInPolygon(poly) {
  const { minLat, maxLat, minLng, maxLng } = polygonBbox(poly);
  const bbox = await fetchCollisionsInBbox(minLng, minLat, maxLng, maxLat);
  const spatial = bbox.filter(f => {
    const c = f.geometry?.coordinates;
    return c && pointInPolygon([c[1], c[0]], poly);
  });
  return expandWithSameLocations(spatial);
}

// What the user sees / counts / exports: filters first, then excluded locations removed.
// `excludedKeys` is a Set of canonical location keys (see ownLocationKey).
export function visibleCollisions(collisions, filters, excludedKeys) {
  const filtered = applyFilters(collisions, filters);
  if (!excludedKeys || excludedKeys.size === 0) return filtered;
  const drop = featureKeysInLocations(collisions, excludedKeys);
  return filtered.filter(f => !drop.has(featureKey(f)));
}

// Ignore results from a request that has been superseded by a newer one.
export function makeLatestGuard() {
  let n = 0;
  return () => { const mine = ++n; return () => mine === n; };
}

// Is this record inside the boundary currently drawn on the map?
// boundary: {type:"radius", lat, lng, radiusKm} | {type:"polygon", vertices:[[lat,lng],...]} | null
export function insideBoundary(feature, boundary) {
  const c = feature?.geometry?.coordinates;
  if (!c || !boundary) return false;
  if (boundary.type === "radius") return distanceM(boundary.lat, boundary.lng, c[1], c[0]) <= boundary.radiusKm * 1000;
  if (boundary.type === "polygon") return pointInPolygon([c[1], c[0]], boundary.vertices);
  return false;
}

// Keys of records shown OUTSIDE the drawn boundary (they are only here because they share a location ID
// with a record inside). Decided from the boundary on screen, so the yellow dashed marker can never
// disagree with the circle/polygon the user is looking at.
export function outOfAreaKeys(collisions, boundary) {
  const out = new Set();
  if (!boundary) return out;
  collisions.forEach(f => { if (!insideBoundary(f, boundary)) out.add(featureKey(f)); });
  return out;
}
