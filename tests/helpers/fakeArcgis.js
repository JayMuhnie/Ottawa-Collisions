// A simulated ArcGIS FeatureServer behind /api/collisions, written from the documented behaviour of
// the real service: envelope queries, `Geo_ID IN (...)` on a TEXT field, a per-request record cap,
// resultOffset paging and exceededTransferLimit. It is deliberately strict so wrong requests fail loudly.

export function installFakeArcgis(features, { maxRecordCount = 1000 } = {}) {
  const log = [];
  const err = (code, message) =>
    new Response(JSON.stringify({ error: { code, message, details: [] } }), { status: 200, headers: { "Content-Type": "application/json" } });

  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname !== "/api/collisions") return new Response("Not Found", { status: 404 });
    const q = url.searchParams;
    log.push(Object.fromEntries(q.entries()));

    if (q.get("f") !== "geojson") return err(400, "test server only supports f=geojson");
    if (q.get("outSR") && q.get("outSR") !== "4326") return err(400, "test server only supports outSR=4326");

    let rows = features;

    const where = (q.get("where") || "1=1").trim();
    if (where !== "1=1") {
      const m = /^Geo_ID IN \((.*)\)$/.exec(where);
      if (!m) return err(400, `Unsupported where: ${where}`);
      const tokens = m[1].match(/'(?:[^']|'')*'|[^,]+/g) || [];
      const wanted = new Set();
      for (const t of tokens) {
        // Geo_ID is a string field: unquoted values are a type error on the real service too
        if (!/^'.*'$/s.test(t.trim())) return err(400, "Unable to complete operation.");
        wanted.add(t.trim().slice(1, -1).replace(/''/g, "'"));
      }
      rows = rows.filter((f) => wanted.has(f.properties.Geo_ID));
    }

    if (q.get("geometry")) {
      if (q.get("geometryType") !== "esriGeometryEnvelope" || q.get("inSR") !== "4326") return err(400, "bad geometry params");
      const [xmin, ymin, xmax, ymax] = q.get("geometry").split(",").map(Number);
      if (![xmin, ymin, xmax, ymax].every(Number.isFinite) || xmin > xmax || ymin > ymax) return err(400, "bad envelope");
      rows = rows.filter((f) => {
        const [x, y] = f.geometry.coordinates;
        return x >= xmin && x <= xmax && y >= ymin && y <= ymax;
      });
    }

    // Like the real service: without an explicit sort, page order is not guaranteed (we reverse/rotate it
    // per request to prove the app does not depend on it). With orderByFields=OBJECTID it is stable.
    if (q.get("orderByFields") === "OBJECTID") {
      rows = [...rows].sort((a, b) => a.properties.OBJECTID - b.properties.OBJECTID);
    } else {
      const k = log.length % Math.max(1, rows.length);
      rows = [...rows.slice(k), ...rows.slice(0, k)].reverse();
    }

    const offset = parseInt(q.get("resultOffset") || "0", 10);
    const want = parseInt(q.get("resultRecordCount") || String(maxRecordCount), 10);
    const limit = Math.min(want, maxRecordCount);
    const page = rows.slice(offset, offset + limit);
    const body = { type: "FeatureCollection", features: page };
    if (offset + limit < rows.length) body.properties = { exceededTransferLimit: true };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { log };
}
