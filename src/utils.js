export const OTTAWA_CENTER = { lat: 45.4215, lng: -75.6972 };

export const SEVERITY_COLORS = {
  "Fatal": "#e74c3c",
  "Personal Injury": "#e67e22",
  "Property Damage Only": "#3498db",
  "Unknown": "#95a5a6",
};

export const CHART_PALETTE = [
  "#00b4d8", "#0077b6", "#48cae4",
  "#023e8a", "#90e0ef", "#ade8f4",
];

// Build ArcGIS query URL — tries multiple known Ottawa service endpoints
const ENDPOINTS = [
  "https://services.arcgis.com/G6F8XLCl5KtAlZ2G/arcgis/rest/services/Traffic_Collisions_2017_to_Current/FeatureServer/0",
  "https://services1.arcgis.com/G6F8XLCl5KtAlZ2G/arcgis/rest/services/Traffic_Collisions/FeatureServer/0",
  "https://utility.arcgis.com/usrsvcs/servers/146fb790d2ce4357b8f9651b797dd7d3/rest/services/Traffic_Collisions/FeatureServer/0",
];

export async function fetchCollisionsNear(lat, lng, km) {
  const radiusDeg = km / 111;
  const envelope = JSON.stringify({
    xmin: lng - radiusDeg,
    ymin: lat - radiusDeg,
    xmax: lng + radiusDeg,
    ymax: lat + radiusDeg,
    spatialReference: { wkid: 4326 },
  });

  const params = new URLSearchParams({
    where: "1=1",
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    resultRecordCount: "2000",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });

  let lastError;
  for (const base of ENDPOINTS) {
    try {
      const res = await fetch(`${base}/query?${params}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;
      if (Array.isArray(data.features)) return data.features;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All API endpoints failed");
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
  if (v.includes("FATAL") || v === "1") return "Fatal";
  if (v.includes("INJURY") || v.includes("PERSONAL") || v === "2") return "Personal Injury";
  if (v.includes("PROPERTY") || v.includes("PDO") || v === "3") return "Property Damage Only";
  return "Unknown";
}

export function collisionTypeLabel(val) {
  if (!val) return "Unknown";
  const map = {
    "REAREND": "Rear-End", "REAR END": "Rear-End", "REAR-END": "Rear-End",
    "SIDESWIPE": "Sideswipe",
    "ANGLE": "Angle",
    "TURNING MOVEMENT": "Turning Movement", "TURNING": "Turning Movement",
    "HEAD ON": "Head-On", "HEADON": "Head-On",
    "PEDESTRIAN": "Pedestrian",
    "CYCLIST": "Cyclist", "BICYCLE": "Cyclist",
    "ROLLOVER": "Rollover",
    "FIXED OBJECT": "Fixed Object",
  };
  const upper = String(val).toUpperCase();
  for (const [k, v] of Object.entries(map)) {
    if (upper.includes(k)) return v;
  }
  return String(val);
}

export function extractYear(attributes) {
  const raw = attributes.COLLISION_DATE || attributes.DATE || attributes.YEAR || "";
  const match = String(raw).match(/\b(201[7-9]|202[0-4])\b/);
  return match ? match[1] : null;
}
