export const OTTAWA_CENTER = { lat: 45.4215, lng: -75.6972 };

export const SEVERITY_COLORS = {
  "Fatal": "#e74c3c",
  "Non-fatal Injury": "#e67e22",
  "Property Damage Only": "#3498db",
  "Unknown": "#95a5a6",
};

export const CHART_PALETTE = [
  "#00b4d8", "#0077b6", "#48cae4",
  "#023e8a", "#90e0ef", "#ade8f4",
];

const PROXY = "/api/collisions";

export async function fetchCollisionsNear(lat, lng, km) {
  const radiusDeg = km / 111;
  const xmin = lng - radiusDeg;
  const ymin = lat - radiusDeg;
  const xmax = lng + radiusDeg;
  const ymax = lat + radiusDeg;

  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${xmin},${ymin},${xmax},${ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    resultRecordCount: "2000",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });

  const res = await fetch(`${PROXY}?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.features || [];
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
    return true;
  });
}

// Group features by location name/ID and find repeat locations
export function getRepeatLocations(features) {
  const locationMap = {};
  features.forEach(f => {
    const p = f.properties || {};
    const key = p.Geo_ID || p.Location;
    if (!key) return;
    if (!locationMap[key]) {
      locationMap[key] = {
        key,
        name: p.Location || key,
        geoId: p.Geo_ID,
        features: [],
        fatal: 0,
        injury: 0,
        pdo: 0,
      };
    }
    locationMap[key].features.push(f);
    const sev = severityLabel(p.Classification_Of_Accident);
    if (sev === "Fatal") locationMap[key].fatal++;
    else if (sev === "Non-fatal Injury") locationMap[key].injury++;
    else locationMap[key].pdo++;
  });

  return Object.values(locationMap)
    .filter(l => l.features.length > 1)
    .sort((a, b) => b.features.length - a.features.length);
}
