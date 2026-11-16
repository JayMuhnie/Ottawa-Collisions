// Seeded synthetic collision data shaped like the City of Ottawa layer
// (string Geo_IDs with leading zeros, "__3Z..." ids, same-ID points scattered around an
// intersection, records with no Geo_ID / no Location, name-only records, heavy-tailed counts).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const EARTH_R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// Destination point on a sphere: start, bearing (deg clockwise from north), distance (m)
export function destination(lat, lng, bearingDeg, distM) {
  const d = distM / EARTH_R, b = toRad(bearingDeg), p1 = toRad(lat), l1 = toRad(lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: toDeg(p2), lng: ((toDeg(l2) + 540) % 360) - 180 };
}

const SEV = ["01 - Fatal injury", "02 - Non-fatal injury", "03 - P.D. only", "04 - Non-reportable"];
const SEV_W = [0.004, 0.17, 0.78, 0.046];
const TYPES = ["01 - Approaching", "02 - Angle", "03 - Rear end", "04 - Sideswipe", "05 - Turning movement",
  "06 - SMV unattended vehicle", "07 - SMV other", "99 - Other"];
const SURF = ["01 - Dry", "02 - Wet", "03 - Loose snow", "04 - Slush", "05 - Packed snow", "06 - Ice"];
const ENV = ["01 - Clear", "02 - Rain", "03 - Snow", "04 - Freezing Rain", "05 - Drifting Snow", "06 - Strong wind"];
const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2024];

function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function weighted(rnd, arr, w) {
  let r = rnd(), s = 0;
  for (let i = 0; i < arr.length; i++) { s += w[i]; if (r < s) return arr[i]; }
  return arr[arr.length - 1];
}

export function makeFeature(oid, lat, lng, extra = {}) {
  const year = extra.Accident_Year ?? 2020;
  return {
    type: "Feature",
    id: oid,
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      OBJECTID: oid,
      ID: `${year}--${oid}`,
      Geo_ID: null,
      Accident_Year: year,
      Accident_Date: `${year}-06-15`,
      Location: null,
      Classification_Of_Accident: "03 - P.D. only",
      Initial_Impact_Type: "02 - Angle",
      Road_1_Surface_Condition: "01 - Dry",
      Environment_Condition: "01 - Clear",
      num_of_vehicles: 2,
      num_of_pedestrians: null,
      num_of_bicycles: null,
      Lat: lat,
      Long: lng,
      ...extra,
    },
  };
}

// Big realistic dataset. Deterministic for a given seed.
export function makeDataset(seed = 42, nLocations = 500) {
  const rnd = mulberry32(seed);
  const features = [];
  const locations = [];
  let oid = 1;

  for (let i = 0; i < nLocations; i++) {
    const lat = 45.20 + rnd() * 0.40;
    const lng = -76.00 + rnd() * 0.55;
    const style = rnd();
    const geoId = style < 0.7
      ? String(Math.floor(rnd() * 19999)).padStart(7, "0")
      : "__3Z" + Math.floor(rnd() * 46656).toString(36).toUpperCase().padStart(4, "0");
    const name = (i % 37 === 0 ? "O'CONNOR ST" : `STREET${i} ST`) + (style < 0.7 ? ` @ AVE${i}` : ` btwn A${i} & B${i}`) + ` (${geoId})`;
    // heavy-tailed number of collisions per location
    const r = rnd();
    const n = r < 0.55 ? 1 + Math.floor(rnd() * 4) : r < 0.9 ? 5 + Math.floor(rnd() * 25) : r < 0.99 ? 40 + Math.floor(rnd() * 120) : 300 + Math.floor(rnd() * 200);
    locations.push({ geoId, lat, lng, n });
    const scatter = rnd() < 0.25 ? 150 : 25; // some locations have widely scattered points
    for (let k = 0; k < n; k++) {
      const p = destination(lat, lng, rnd() * 360, rnd() * scatter);
      features.push(makeFeature(oid++, p.lat, p.lng, {
        Geo_ID: geoId,
        Location: name,
        Accident_Year: pick(rnd, YEARS),
        Classification_Of_Accident: weighted(rnd, SEV, SEV_W),
        Initial_Impact_Type: pick(rnd, TYPES),
        Road_1_Surface_Condition: pick(rnd, SURF),
        Environment_Condition: pick(rnd, ENV),
        num_of_pedestrians: rnd() < 0.02 ? 1 : (rnd() < 0.5 ? 0 : null),
        num_of_bicycles: rnd() < 0.02 ? 1 : null,
      }));
    }
  }

  // name-only records (Location text but no Geo_ID) and totally unnamed records
  const base = locations.length;
  for (let k = 0; k < 120; k++) {
    const L = locations[Math.floor(rnd() * base)];
    const p = destination(L.lat, L.lng, rnd() * 360, rnd() * 60);
    features.push(makeFeature(oid++, p.lat, p.lng, {
      Location: k % 2 ? `NAME ONLY RD ${k % 9}` : "",
      Geo_ID: k % 3 ? null : "",
      Accident_Year: pick(rnd, YEARS),
      Classification_Of_Accident: weighted(rnd, SEV, SEV_W),
      Initial_Impact_Type: pick(rnd, TYPES),
    }));
  }
  for (let k = 0; k < 150; k++) {
    // unnamed: some within 30 m of a known location, some isolated
    let lat, lng;
    if (k % 2) { const L = locations[Math.floor(rnd() * base)]; const p = destination(L.lat, L.lng, rnd() * 360, rnd() * 25); lat = p.lat; lng = p.lng; }
    else { lat = 45.2 + rnd() * 0.4; lng = -76 + rnd() * 0.55; }
    features.push(makeFeature(oid++, lat, lng, {
      Accident_Year: pick(rnd, YEARS),
      Classification_Of_Accident: weighted(rnd, SEV, SEV_W),
      Initial_Impact_Type: pick(rnd, TYPES),
    }));
  }
  return { features, locations };
}
