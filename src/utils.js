export const OTTAWA_CENTER = { lat: 45.4215, lng: -75.6972 };

export const SEVERITY_COLORS = {
  "Fatal": "#e74c3c",
  "Non-fatal Injury": "#e67e22",
  "Property Damage Only": "#3498db",
  "Non-Reportable": "#8e44ad",
  "Unknown": "#95a5a6",
};

export const CHART_PALETTE = [
  "#00b4d8", "#0077b6", "#48cae4",
  "#023e8a", "#90e0ef", "#ade8f4",
];

const PROXY = "/api/collisions";

// The service caps how many records one request returns (about 1,000). We keep paging until the
// server says there is nothing more. MAX_PAGES is only a runaway guard: hitting it is an ERROR, never a
// silent truncation, because a silently incomplete result set would look like a valid one.
const PAGE_SIZE = 2000;
const MAX_PAGES = 500;

// Parse a proxy response, turning non-JSON replies (e.g. a plain-text "Bad Request"
// from ArcGIS when the service is missing or renamed) into a readable error.
async function parseArcgisResponse(res) {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
    throw new Error(`Data service returned an unexpected response (HTTP ${res.status}): ${snippet || "empty"}`);
  }
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return data;
}

// Make sure every feature has WGS84 [lng, lat] geometry. If the geometry is missing or
// looks projected (Web Mercator values are far outside +/-180), rebuild it from the
// layer's own Lat / Long attributes.
function normalizeFeature(f) {
  const c = f?.geometry?.coordinates;
  const valid = Array.isArray(c) && c.length >= 2 &&
    Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
  if (valid) return f;
  const p = f?.properties || {};
  const lat = parseFloat(p.Lat);
  const lng = parseFloat(p.Long);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { ...f, geometry: { type: "Point", coordinates: [lng, lat] } };
  }
  return f;
}

// Run one query, following pagination until the server reports no more results.
// Rows are ordered by OBJECTID so that resultOffset paging is stable (without an explicit order the
// service may return pages in a different order each time, which can skip or repeat rows).
async function queryCollisions(baseParams) {
  const byKey = new Map();
  let offset = 0;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      throw new Error("The selection returned too many records to load safely. Please choose a smaller area.");
    }
    const params = new URLSearchParams(baseParams);
    params.set("orderByFields", "OBJECTID");
    if (offset > 0) params.set("resultOffset", String(offset));
    const res = await fetch(`${PROXY}?${params.toString()}`);
    const data = await parseArcgisResponse(res);
    const feats = data.features || [];
    feats.forEach(f => byKey.set(featureKey(f), f));
    const more = data.exceededTransferLimit || data.properties?.exceededTransferLimit;
    if (!more || feats.length === 0) break;
    offset += feats.length;
  }
  return [...byKey.values()].map(normalizeFeature);
}

// Same sphere Leaflet uses to draw L.circle, so "inside the circle on screen" == "selected".
const EARTH_R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function distanceM(lat1, lng1, lat2, lng2) {
  return haversineM([lat1, lng1], [lat2, lng2]);
}

// Fetch every collision whose location is within `km` of (lat, lng).
// The service is queried with a box that fully contains the circle (the box is wider in degrees of
// longitude than latitude, by 1/cos(lat)), then points are kept only if they are truly inside the circle.
export async function fetchCollisionsNear(lat, lng, km) {
  const meters = km * 1000;
  const delta = meters / EARTH_R;                                   // angular radius (radians)
  const dLat = (delta * 180) / Math.PI;
  const ratio = Math.sin(delta) / Math.cos(rad(lat));
  const dLng = ratio >= 1 ? 180 : (Math.asin(ratio) * 180) / Math.PI;   // exact max longitude reach of the circle
  const pad = 1e-6;
  const box = await fetchCollisionsInBbox(lng - dLng - pad, lat - dLat - pad, lng + dLng + pad, lat + dLat + pad);
  return box.filter(f => {
    const c = f.geometry?.coordinates;
    return c && distanceM(lat, lng, c[1], c[0]) <= meters;
  });
}

// Fetch collisions within a bounding box (used by both radius and polygon modes)
export async function fetchCollisionsInBbox(xmin, ymin, xmax, ymax) {
  return queryCollisions({
    where: "1=1",
    geometry: `${xmin},${ymin},${xmax},${ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    resultRecordCount: String(PAGE_SIZE),
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
}

// Fetch all collisions citywide that share a Geo_ID with any feature in the given set.
export async function fetchCollisionsByGeoIds(geoIds) {
  if (!geoIds || geoIds.length === 0) return [];

  // Batch in chunks of 50 to stay within URL length limits
  const CHUNK = 50;
  const chunks = [];
  for (let i = 0; i < geoIds.length; i += CHUNK) {
    chunks.push(geoIds.slice(i, i + CHUNK));
  }

  const results = await Promise.all(chunks.map((chunk) => {
    // Geo_ID is a text field with leading zeros ("0002250") and alphanumeric
    // values ("__3Z094A"), so every ID must be sent as a quoted string.
    const list = chunk.map(id => `'${String(id).replace(/'/g, "''")}'`).join(",");
    return queryCollisions({
      where: `Geo_ID IN (${list})`,
      outFields: "*",
      resultRecordCount: String(PAGE_SIZE),
      returnGeometry: "true",
      outSR: "4326",
      f: "geojson",
    });
  }));

  return results.flat();
}

// Stable identity for a record. Prefers OBJECTID (any casing), then the GeoJSON feature id, then the
// layer's own ID field; only as a last resort falls back to position + date so that records are never
// all collapsed into one "undefined" key.
export function featureKey(f) {
  const p = f?.properties || {};
  const id = p.OBJECTID ?? p.objectid ?? p.ObjectID ?? p.ObjectId ?? f?.id ?? p.ID;
  if (id != null && id !== "") return String(id);
  const c = f?.geometry?.coordinates || [];
  return `pos:${c[0]},${c[1]}|${p.Accident_Date ?? ""}|${p.Classification_Of_Accident ?? ""}`;
}

// Merge two feature arrays, deduplicating by OBJECTID
export function mergeFeatures(primary, extra) {
  const seen = new Set(primary.map(f => featureKey(f)));
  const unique = extra.filter(f => !seen.has(featureKey(f)));
  return [...primary, ...unique];
}

// Build an array of out-of-area OBJECTIDs (as strings): those in extra that aren't in primary
export function buildOutOfAreaIds(primary, extra) {
  const spatialIds = new Set(primary.map(f => featureKey(f)));
  return extra
    .filter(f => !spatialIds.has(featureKey(f)))
    .map(f => featureKey(f));
}
// polygon: [[lat, lng], ...], point: [lat, lng]
// Leaflet draws polygon edges as straight lines on the Web Mercator map, so the inside/outside test
// is done in that same space (a straight edge is NOT straight in raw lat/lng). Even-odd rule, which is
// also how Leaflet fills a polygon, so a self-crossing outline selects what it visibly shades.
function mercatorXY(lat, lng) {
  const phi = rad(Math.max(-89.9, Math.min(89.9, lat)));
  return [6378137 * rad(lng), 6378137 * Math.log(Math.tan(Math.PI / 4 + phi / 2))];
}

export function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const [px, py] = mercatorXY(point[0], point[1]);
  const V = polygon.map(([la, ln]) => mercatorXY(la, ln));
  let inside = false;
  for (let i = 0, j = V.length - 1; i < V.length; j = i++) {
    const [ix, iy] = V[i];
    const [jx, jy] = V[j];
    if ((iy > py) !== (jy > py) && px < ((jx - ix) * (py - iy)) / (jy - iy) + ix) inside = !inside;
  }
  return inside;
}

export function polygonBbox(polygon) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  polygon.forEach(([lat, lng]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });
  return { minLat, maxLat, minLng, maxLng };
}

export async function geocodeAddress(address) {
  const q = encodeURIComponent(address + ", Ottawa, Ontario, Canada");
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
    { headers: { "Accept-Language": "en" } }
  );
  const data = await res.json();
  if (!data.length) throw new Error("Address not found");
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    label: data[0].display_name.split(",").slice(0, 3).join(","),
  };
}

export function severityLabel(val) {
  if (!val) return "Unknown";
  const v = String(val).toUpperCase();
  if (v.startsWith("01") || (v.includes("FATAL") && !v.includes("NON"))) return "Fatal";
  if (v.startsWith("02") || v.includes("NON-FATAL") || v.includes("NON FATAL") || v.includes("INJURY")) return "Non-fatal Injury";
  if (v.startsWith("03") || v.includes("P.D") || v.includes("PROPERTY") || v.includes("PDO")) return "Property Damage Only";
  if (v.startsWith("04") || v.includes("NON-REPORT") || v.includes("NON REPORT") || v.includes("NONREPORT")) return "Non-Reportable";
  return "Unknown";
}

export function collisionTypeLabel(val) {
  if (!val) return "Unknown";
  const stripped = String(val).replace(/^\d+\s*-\s*/, "").trim();
  const map = {
    "approaching": "Head-On",
    "angle": "Angle",
    "rear end": "Rear-End",
    "sideswipe": "Sideswipe",
    "turning movement": "Turning Movement",
    "smv other": "Single Vehicle",
    "smv unattended": "Unattended Vehicle",
    "other": "Other",
  };
  const lower = stripped.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (lower.includes(k)) return v;
  }
  return stripped || "Unknown";
}

export function extractYear(props) {
  if (props.Accident_Year) return String(props.Accident_Year);
  const raw = props.Accident_Date || "";
  const match = String(raw).match(/\b(201[7-9]|202[0-9])\b/);
  return match ? match[1] : null;
}

export function getLatLng(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  return { lat: coords[1], lng: coords[0] };
}

// Get all unique years from a feature list
export function getUniqueYears(features) {
  const years = new Set();
  features.forEach(f => {
    const yr = extractYear(f.properties || {});
    if (yr) years.add(yr);
  });
  return Array.from(years).sort();
}

// Get all unique collision types from a feature list
export function getUniqueTypes(features) {
  const types = new Set();
  features.forEach(f => {
    const t = collisionTypeLabel((f.properties || {}).Initial_Impact_Type);
    if (t && t !== "Unknown") types.add(t);
  });
  return Array.from(types).sort();
}

// Check if a collision involves a pedestrian or cyclist
// Find a property by case-insensitive pattern (field naming has varied between releases)
function findCount(props, exact, loose) {
  const keys = Object.keys(props || {});
  const key = keys.find(k => exact.test(k)) || keys.find(k => loose.test(k));
  return key ? parseInt(props[key]) : NaN;
}

export function involvementFlags(props) {
  const ped = findCount(props, /^num_?of_?pedestrians?$/i, /pedestrian/i) > 0;
  const cyc = findCount(props, /^num_?of_?(bicycles?|cyclists?)$/i, /bicycl|cyclist/i) > 0;
  return { ped, cyc };
}

// The weather/environment field was renamed from Environment_Condition_1 to Environment_Condition
export function environmentCondition(props) {
  return props?.Environment_Condition ?? props?.Environment_Condition_1 ?? null;
}

export function involvementLabel(props) {
  const { ped, cyc } = involvementFlags(props);
  if (ped && cyc) return "Pedestrian + Cyclist";
  if (ped) return "Pedestrian";
  if (cyc) return "Cyclist";
  return null;
}

// Apply filters to a feature list
export function applyFilters(features, filters) {
  return features.filter(f => {
    const p = f.properties || {};
    if (filters.years.length > 0) {
      const yr = extractYear(p);
      if (!filters.years.includes(yr)) return false;
    }
    if (filters.types.length > 0) {
      const t = collisionTypeLabel(p.Initial_Impact_Type);
      if (!filters.types.includes(t)) return false;
    }
    if (filters.severity.length > 0) {
      const s = severityLabel(p.Classification_Of_Accident);
      if (!filters.severity.includes(s)) return false;
    }
    if (filters.involvement && filters.involvement.length > 0) {
      const { ped, cyc } = involvementFlags(p);
      const match = filters.involvement.some(v => (v === "pedestrian" && ped) || (v === "cyclist" && cyc));
      if (!match) return false;
    }
    return true;
  });
}

// Haversine distance in metres between two [lat, lng] points
function haversineM([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Compute centroid [lat, lng] of all coordinate-bearing features in a location group
function centroid(features) {
  let latSum = 0, lngSum = 0, n = 0;
  features.forEach(f => {
    const c = f.geometry?.coordinates;
    if (c) { lngSum += c[0]; latSum += c[1]; n++; }
  });
  return n ? [latSum / n, lngSum / n] : null;
}

// The one canonical location key. Grouping (Locations tab / report), exclusion and highlight all use
// it, so a checkbox, a highlight and the map can never disagree about which records belong together.
export function ownLocationKey(p) {
  const locName = String(p?.Location ?? "").trim();
  const geoId = p?.Geo_ID != null ? String(p.Geo_ID).trim() : "";
  return geoId ? `gid:${geoId}` : locName ? `loc:${locName}` : null;
}

// Settings files saved by older versions stored plain Geo_IDs; give them the canonical prefix.
export function normalizeLocationKey(k) {
  const t = String(k);
  return t.startsWith("gid:") || t.startsWith("loc:") ? t : `gid:${t}`;
}

// Group features by named location — the single source of truth for all counts.
// Unnamed records (no Geo_ID, no Location) are proximity-snapped to the closest
// named location within SNAP_M metres. If nothing is within range they are omitted
// from location groups but still count toward collision totals.
const SNAP_M = 30;

export function getAllLocations(features) {
  const locationMap = {};
  const unnamed = [];  // collect unnamed records for second pass

  // ── Pass 1: build named location groups ──────────────────────────
  features.forEach(f => {
    const p = f.properties || {};
    const locName = String(p.Location ?? "").trim();
    const geoId   = p.Geo_ID != null && String(p.Geo_ID).trim() !== ""
      ? String(p.Geo_ID).trim() : "";

    const key = ownLocationKey(p);
    if (!key) { unnamed.push(f); return; }

    if (!locationMap[key]) {
      locationMap[key] = { key, name: locName || `Geo_ID: ${geoId}`, geoId: geoId || null, features: [], nearbyCount: 0, fatal: 0, injury: 0, pdo: 0 };
    }
    if (locName) locationMap[key].name = locName;

    locationMap[key].features.push(f);
    const sev = severityLabel(p.Classification_Of_Accident);
    if (sev === "Fatal") locationMap[key].fatal++;
    else if (sev === "Non-fatal Injury") locationMap[key].injury++;
    else locationMap[key].pdo++;
  });

  // ── Pass 2: snap unnamed records to closest named location ────────
  if (unnamed.length > 0) {
    // Pre-compute centroids for all named locations
    const located = Object.values(locationMap).map(loc => ({
      loc,
      center: centroid(loc.features),
    })).filter(e => e.center !== null);

    unnamed.forEach(f => {
      const coords = f.geometry?.coordinates;
      if (!coords) return;
      const pt = [coords[1], coords[0]];  // [lat, lng]

      // Find closest named location
      let bestLoc = null, bestDist = Infinity;
      located.forEach(({ loc, center }) => {
        const d = haversineM(pt, center);
        if (d < bestDist) { bestDist = d; bestLoc = loc; }
      });

      if (bestLoc && bestDist <= SNAP_M) {
        bestLoc.features.push(f);
        bestLoc.nearbyCount++;
        const sev = severityLabel((f.properties || {}).Classification_Of_Accident);
        if (sev === "Fatal") bestLoc.fatal++;
        else if (sev === "Non-fatal Injury") bestLoc.injury++;
        else bestLoc.pdo++;
      }
      // else: truly isolated — omitted from location groups
    });
  }

  return Object.values(locationMap)
    .sort((a, b) => b.features.length - a.features.length);
}


// Keys (featureKey) of every record belonging to any of the given locations, INCLUDING records that
// were attached to the location by the nearby-match rule.
export function featureKeysInLocations(features, locationKeys) {
  const out = new Set();
  if (!locationKeys || locationKeys.size === 0) return out;
  getAllLocations(features).forEach(loc => {
    if (locationKeys.has(loc.key)) loc.features.forEach(f => out.add(featureKey(f)));
  });
  return out;
}

// Same, for a single location (used to highlight a location on the map)
export function locationFeatureKeys(features, locationKey) {
  return featureKeysInLocations(features, new Set([locationKey]));
}

// Count of distinct named locations — consistent across sidebar, print button, and report header
export function namedLocationCount(features) {
  const keys = new Set();
  features.forEach(f => {
    const k = ownLocationKey(f.properties || {});
    if (k) keys.add(k);
  });
  return keys.size;
}

// Convenience: only repeat locations (2+)
export function getRepeatLocations(features) {
  return getAllLocations(features).filter(l => l.features.length > 1);
}

// Export all raw API fields as-is
// Build CSV text for the given records: one row per record, every property column across all records.
export function buildCSV(features) {
  const rawKeys = [];
  const seenKeys = new Set();
  features.forEach(f => {
    Object.keys(f.properties || {}).forEach(k => {
      if (!seenKeys.has(k)) { seenKeys.add(k); rawKeys.push(k); }
    });
  });

  const escapeCell = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = features.map(f => {
    const p = f.properties || {};
    return rawKeys.map(k => escapeCell(p[k])).join(",");
  });
  return [rawKeys.join(","), ...rows].join("\n");
}

// Ask the user where to save the CSV (a "Save as" dialog) when the browser supports it
// (Chrome, Edge, Opera). Other browsers (Safari, Firefox) can't show that dialog from a web page, so
// they fall back to a normal download into the Downloads folder (unless the browser is set to
// "ask where to save each file"). Returns "saved", "cancelled" or "downloaded".
export async function exportToCSV(features, filename = "ottawa-collisions.csv") {
  if (!features.length) return "cancelled";
  // The leading BOM makes Excel read accented street names (e.g. French names) correctly.
  const blob = new Blob(["\uFEFF" + buildCSV(features)], { type: "text/csv;charset=utf-8;" });

  if (typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";   // user closed the dialog: do nothing
      // anything else (e.g. blocked inside an iframe): fall through to a normal download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
