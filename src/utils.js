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

// Check if a collision involves a pedestrian or cyclist
export function involvementFlags(props) {
  const ped = parseInt(props.num_of_pedestrians) > 0;
  const cyc = parseInt(props.num_of_bicycles) > 0;
  return { ped, cyc };
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

// Group features by location — returns all locations sorted by count
export function getAllLocations(features) {
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
    .sort((a, b) => b.features.length - a.features.length);
}

// Convenience: only repeat locations (2+)
export function getRepeatLocations(features) {
  return getAllLocations(features).filter(l => l.features.length > 1);
}

// Export filtered collisions to CSV and trigger download
export function exportToCSV(features, filename = "ottawa-collisions.csv") {
  const headers = [
    "Date", "Year", "Location", "Geo_ID",
    "Severity", "Collision_Type", "Road_Surface",
    "Weather", "Light", "Traffic_Control",
    "Num_Vehicles", "Num_Pedestrians", "Num_Bicycles",
    "Involves_Pedestrian", "Involves_Cyclist",
    "Num_Injuries", "Num_Fatal",
    "Latitude", "Longitude",
  ];

  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/^\d+\s*-\s*/, "").trim();
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = features.map(f => {
    const p = f.properties || {};
    const coords = f.geometry?.coordinates || [];
    const { ped, cyc } = involvementFlags(p);
    return [
      escape(p.Accident_Date),
      escape(p.Accident_Year),
      escape(p.Location),
      escape(p.Geo_ID),
      escape(severityLabel(p.Classification_Of_Accident)),
      escape(collisionTypeLabel(p.Initial_Impact_Type)),
      escape(p.Road_1_Surface_Condition),
      escape(p.Environment_Condition_1),
      escape(p.Light),
      escape(p.Traffic_Control),
      escape(p.num_of_vehicles),
      escape(p.num_of_pedestrians),
      escape(p.num_of_bicycles),
      ped ? "Yes" : "No",
      cyc ? "Yes" : "No",
      escape(p.num_of_injuries),
      escape(p.num_of_fatal),
      escape(coords[1]),
      escape(coords[0]),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
