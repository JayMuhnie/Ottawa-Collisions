import { useMemo } from "react";
import { severityLabel, collisionTypeLabel, extractYear, involvementFlags } from "./utils";

// ── Constants ───────────────────────────────────────────────────────
const SEV_ORDER   = ["Fatal", "Non-fatal Injury", "Property Damage Only", "Unknown"];
const SEV_COLORS  = { "Fatal": "#e74c3c", "Non-fatal Injury": "#e67e22", "Property Damage Only": "#5dade2", "Unknown": "#7f8c8d" };

// ── Helpers ─────────────────────────────────────────────────────────

// Collect all unique collision types across a list of features
function getTypes(features) {
  const s = new Set();
  features.forEach(f => s.add(collisionTypeLabel((f.properties || {}).Initial_Impact_Type)));
  // Sort alphabetically, keep Unknown last
  return [...s].filter(t => t !== "Unknown").sort().concat([...s].filter(t => t === "Unknown"));
}

// Build severity × type matrix + year breakdown + involvement totals
function buildStats(features) {
  const matrix = {};   // matrix[sev][type] = count
  const years  = {};
  let pedTotal = 0, cycTotal = 0, pedFatal = 0, cycFatal = 0;

  SEV_ORDER.forEach(s => { matrix[s] = {}; });

  features.forEach(f => {
    const p   = f.properties || {};
    const sev = severityLabel(p.Classification_Of_Accident);
    const typ = collisionTypeLabel(p.Initial_Impact_Type);
    const yr  = extractYear(p) || "Unknown";
    const { ped, cyc } = involvementFlags(p);

    if (!matrix[sev]) matrix[sev] = {};
    matrix[sev][typ] = (matrix[sev][typ] || 0) + 1;
    years[yr] = (years[yr] || 0) + 1;

    if (ped) { pedTotal++; if (sev === "Fatal") pedFatal++; }
    if (cyc) { cycTotal++; if (sev === "Fatal") cycFatal++; }
  });

  return { matrix, years, pedTotal, cycTotal, pedFatal, cycFatal };
}

// ── Shared styles ────────────────────────────────────────────────────
const css = {
  th: {
    background: "#141920",
    color: "#8b9cc8",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    padding: "7px 10px",
    textAlign: "center",
    border: "1px solid #1e2535",
    whiteSpace: "nowrap",
  },
  thLeft: { textAlign: "left" },
  td: {
    padding: "6px 10px",
    color: "#c8d0e8",
    border: "1px solid #1a2030",
    fontSize: 12,
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
    fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
  },
  tdLabel: {
    textAlign: "left",
    fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  tdTotal: {
    fontWeight: 700,
    background: "#141920",
  },
  zero: { color: "#2a3350" },
};

// ── Cross-tab matrix table ───────────────────────────────────────────
// Rows = severity, columns = collision type
// Extra columns: 🚶 Ped, 🚲 Cyc, Year breakdown, Row total
function CrossTab({ features }) {
  const types = getTypes(features);
  const { matrix, years, pedTotal, cycTotal } = buildStats(features);

  const activeSevs = SEV_ORDER.filter(s =>
    features.some(f => severityLabel((f.properties || {}).Classification_Of_Accident) === s)
  );

  const yearKeys = Object.keys(years).sort();

  // Column totals (by type)
  const colTotals = {};
  types.forEach(t => {
    colTotals[t] = activeSevs.reduce((sum, s) => sum + (matrix[s]?.[t] || 0), 0);
  });
  const grandTotal = features.length;

  // Ped/cyc per severity
  const pedBySev = {}, cycBySev = {};
  features.forEach(f => {
    const p = f.properties || {};
    const sev = severityLabel(p.Classification_Of_Accident);
    const { ped, cyc } = involvementFlags(p);
    if (ped) pedBySev[sev] = (pedBySev[sev] || 0) + 1;
    if (cyc) cycBySev[sev] = (cycBySev[sev] || 0) + 1;
  });

  const cellBg = (val, rowTotal) => {
    if (!val || !rowTotal) return "transparent";
    const pct = val / rowTotal;
    if (pct > 0.5) return "rgba(61,125,232,0.18)";
    if (pct > 0.25) return "rgba(61,125,232,0.09)";
    return "transparent";
  };

  const yearLabel = yearKeys.length === 0 ? "All years"
    : yearKeys.length === 1 ? yearKeys[0]
    : `${yearKeys[0]}–${yearKeys[yearKeys.length - 1]}` + (yearKeys.length < (parseInt(yearKeys[yearKeys.length-1]) - parseInt(yearKeys[0]) + 1) ? ` (filtered: ${yearKeys.join(", ")})` : "");

  return (
    <div>
      <div style={{ fontSize: 11, color: "#4a5578", marginBottom: 8 }}>
        Data period: <span style={{ color: "#8b9cc8", fontWeight: 600 }}>{yearLabel}</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...css.th, ...css.thLeft, minWidth: 150 }}>Severity</th>
            {types.map(t => (
              <th key={t} style={{ ...css.th, maxWidth: 90, fontSize: 9 }}>
                {t.replace(" Collision", "").replace("Turning Movement", "Turning")}
              </th>
            ))}
            <th style={{ ...css.th, borderLeft: "2px solid #2a3350" }}>🚶 Ped</th>
            <th style={css.th}>🚲 Cyc</th>
            <th style={{ ...css.th, borderLeft: "2px solid #2a3350", background: "#111620" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {activeSevs.map((sev, si) => {
            const rowTotal = features.filter(f => severityLabel((f.properties || {}).Classification_Of_Accident) === sev).length;
            return (
              <tr key={sev} style={{ background: si % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}>
                <td style={{ ...css.td, ...css.tdLabel, color: SEV_COLORS[sev] || "#c8d0e8" }}>{sev}</td>
                {types.map(t => {
                  const val = matrix[sev]?.[t] || 0;
                  return (
                    <td key={t} style={{ ...css.td, background: cellBg(val, rowTotal), color: val ? "#e8ecf8" : css.zero.color }}>
                      {val || "—"}
                    </td>
                  );
                })}
                <td style={{ ...css.td, borderLeft: "2px solid #2a3350", color: pedBySev[sev] ? "#2ecc71" : css.zero.color }}>
                  {pedBySev[sev] || "—"}
                </td>
                <td style={{ ...css.td, color: cycBySev[sev] ? "#2ecc71" : css.zero.color }}>
                  {cycBySev[sev] || "—"}
                </td>
                <td style={{ ...css.td, ...css.tdTotal, borderLeft: "2px solid #2a3350", color: SEV_COLORS[sev] || "#e8ecf8" }}>{rowTotal}</td>
              </tr>
            );
          })}
          <tr style={{ borderTop: "2px solid #2a3350" }}>
            <td style={{ ...css.td, ...css.tdLabel, ...css.tdTotal, color: "#8b9cc8" }}>Total</td>
            {types.map(t => (
              <td key={t} style={{ ...css.td, ...css.tdTotal, color: "#e8ecf8" }}>{colTotals[t] || "—"}</td>
            ))}
            <td style={{ ...css.td, ...css.tdTotal, borderLeft: "2px solid #2a3350", color: pedTotal ? "#2ecc71" : css.zero.color }}>{pedTotal || "—"}</td>
            <td style={{ ...css.td, ...css.tdTotal, color: cycTotal ? "#2ecc71" : css.zero.color }}>{cycTotal || "—"}</td>
            <td style={{ ...css.td, ...css.tdTotal, borderLeft: "2px solid #2a3350", color: "#e8ecf8", fontSize: 13, fontWeight: 700 }}>{grandTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Summary overview table (one row per location) ───────────────────
function SummaryTable({ locations }) {
  const allFeatures = locations.flatMap(l => l.features);
  const types = getTypes(allFeatures);
  const activeSevs = SEV_ORDER.filter(s =>
    allFeatures.some(f => severityLabel((f.properties || {}).Classification_Of_Accident) === s)
  );

  const yearKeys = [...new Set(allFeatures.map(f => extractYear(f.properties || {})).filter(Boolean))].sort();
  const yearLabel = yearKeys.length === 0 ? "All years"
    : yearKeys.length === 1 ? yearKeys[0]
    : `${yearKeys[0]}–${yearKeys[yearKeys.length - 1]}` + (yearKeys.length < (parseInt(yearKeys[yearKeys.length-1]) - parseInt(yearKeys[0]) + 1) ? ` (filtered: ${yearKeys.join(", ")})` : "");

  return (
    <div>
      <div style={{ fontSize: 11, color: "#4a5578", marginBottom: 8 }}>
        Data period: <span style={{ color: "#8b9cc8", fontWeight: 600 }}>{yearLabel}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...css.th, width: 24, padding: "7px 6px" }}>#</th>
            <th style={{ ...css.th, ...css.thLeft, minWidth: 160 }}>Location</th>
            {activeSevs.map(s => (
              <th key={s} style={{ ...css.th, color: SEV_COLORS[s], fontSize: 9, maxWidth: 70 }}>
                {s === "Property Damage Only" ? "PDO" : s === "Non-fatal Injury" ? "Injury" : s}
              </th>
            ))}
            <th style={{ ...css.th, borderLeft: "2px solid #2a3350", fontSize: 9 }}>🚶 Ped</th>
            <th style={{ ...css.th, fontSize: 9 }}>🚲 Cyc</th>
            <th style={{ ...css.th, borderLeft: "2px solid #2a3350", background: "#111620" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc, i) => {
            const { pedTotal, cycTotal } = buildStats(loc.features);
            const sevCounts = {};
            loc.features.forEach(f => {
              const s = severityLabel((f.properties || {}).Classification_Of_Accident);
              sevCounts[s] = (sevCounts[s] || 0) + 1;
            });
            return (
              <tr key={loc.key} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}>
                <td style={{ ...css.td, color: "#4a5578", fontSize: 10, padding: "6px" }}>{i + 1}</td>
                <td style={{ ...css.td, ...css.tdLabel, color: "#e8ecf8" }}>
                  {loc.name.replace(/\s*\([^)]*\)\s*$/, "")}
                </td>
                {activeSevs.map(s => (
                  <td key={s} style={{ ...css.td, color: sevCounts[s] ? SEV_COLORS[s] : css.zero.color }}>
                    {sevCounts[s] || "—"}
                  </td>
                ))}
                <td style={{ ...css.td, borderLeft: "2px solid #2a3350", color: pedTotal ? "#2ecc71" : css.zero.color }}>{pedTotal || "—"}</td>
                <td style={{ ...css.td, color: cycTotal ? "#2ecc71" : css.zero.color }}>{cycTotal || "—"}</td>
                <td style={{ ...css.td, ...css.tdTotal, borderLeft: "2px solid #2a3350", color: "#e8ecf8" }}>{loc.features.length}</td>
              </tr>
            );
          })}
          {/* Totals */}
          <tr style={{ borderTop: "2px solid #2a3350" }}>
            <td style={{ ...css.td, ...css.tdTotal }} />
            <td style={{ ...css.td, ...css.tdLabel, ...css.tdTotal, color: "#8b9cc8" }}>Total</td>
            {activeSevs.map(s => {
              const n = allFeatures.filter(f => severityLabel((f.properties || {}).Classification_Of_Accident) === s).length;
              return <td key={s} style={{ ...css.td, ...css.tdTotal, color: n ? SEV_COLORS[s] : css.zero.color }}>{n || "—"}</td>;
            })}
            <td style={{ ...css.td, ...css.tdTotal, borderLeft: "2px solid #2a3350", color: "#2ecc71" }}>
              {allFeatures.filter(f => involvementFlags(f.properties || {}).ped).length || "—"}
            </td>
            <td style={{ ...css.td, ...css.tdTotal, color: "#2ecc71" }}>
              {allFeatures.filter(f => involvementFlags(f.properties || {}).cyc).length || "—"}
            </td>
            <td style={{ ...css.td, ...css.tdTotal, borderLeft: "2px solid #2a3350", color: "#e8ecf8", fontWeight: 700, fontSize: 13 }}>{allFeatures.length}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ── Per-location section ─────────────────────────────────────────────
function LocationDetail({ loc, index }) {
  const name = loc.name.replace(/\s*\([^)]*\)\s*$/, "");
  const { pedTotal, cycTotal, pedFatal, cycFatal } = buildStats(loc.features);

  return (
    <div style={{ marginBottom: 36, pageBreakInside: "avoid" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        borderBottom: "2px solid #1e2535", paddingBottom: 8, marginBottom: 14,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#3d7de8",
          fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
          background: "rgba(61,125,232,0.12)", borderRadius: 4, padding: "2px 7px",
        }}>#{index + 1}</span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e8ecf8", flex: 1 }}>{name}</h3>
        {(pedTotal > 0 || cycTotal > 0) && (
          <div style={{ display: "flex", gap: 10 }}>
            {pedTotal > 0 && (
              <span style={{ fontSize: 11, color: "#2ecc71", background: "rgba(46,204,113,0.1)", borderRadius: 4, padding: "2px 8px" }}>
                🚶 {pedTotal} ped{pedFatal > 0 ? `, ${pedFatal} fatal` : ""}
              </span>
            )}
            {cycTotal > 0 && (
              <span style={{ fontSize: 11, color: "#2ecc71", background: "rgba(46,204,113,0.1)", borderRadius: 4, padding: "2px 8px" }}>
                🚲 {cycTotal} cyc{cycFatal > 0 ? `, ${cycFatal} fatal` : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Cross-tab matrix */}
      <CrossTab features={loc.features} compact={false} />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────
export default function ReportPage({ collisions, locationLabel, onBack }) {
  const locations = useMemo(() => {
    const map = {};
    collisions.forEach(f => {
      const p = f.properties || {};
      const key = p.Geo_ID || p.Location;
      if (!key) return;
      if (!map[key]) map[key] = { key, name: p.Location || String(key), geoId: p.Geo_ID, features: [], fatal: 0, injury: 0, pdo: 0 };
      map[key].features.push(f);
      const sev = severityLabel(p.Classification_Of_Accident);
      if (sev === "Fatal") map[key].fatal++;
      else if (sev === "Non-fatal Injury") map[key].injury++;
      else map[key].pdo++;
    });
    return Object.values(map).sort((a, b) => b.features.length - a.features.length);
  }, [collisions]);

  const totalFatal  = collisions.filter(f => severityLabel((f.properties || {}).Classification_Of_Accident) === "Fatal").length;
  const totalInjury = collisions.filter(f => severityLabel((f.properties || {}).Classification_Of_Accident) === "Non-fatal Injury").length;
  const totalPed    = collisions.filter(f => involvementFlags(f.properties || {}).ped).length;
  const totalCyc    = collisions.filter(f => involvementFlags(f.properties || {}).cyc).length;
  const generated   = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d1117",
      fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
      color: "#c8d0e8",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        body { font-family: 'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif !important; }
        @media print {
          .no-print { display: none !important; }
          body { background: #0d1117 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #c8d0e8 !important; }
          @page { margin: 12mm 14mm; size: letter landscape; }
          h1 { font-size: 18pt !important; }
          h2 { font-size: 12pt !important; }
          h3 { font-size: 10pt !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(13,17,23,0.96)", backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "10px 28px", display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 6, color: "#8b9cc8", padding: "6px 14px",
          fontSize: 12, cursor: "pointer",
        }}>← Back to Map</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#4a5578", fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif" }}>
          {collisions.length} collisions · {locations.length} locations
        </span>
        <button onClick={() => window.print()} style={{
          background: "#3d7de8", border: "none", borderRadius: 6,
          color: "#fff", padding: "6px 18px", fontSize: 12,
          fontWeight: 600, cursor: "pointer",
        }}>⎙ Print / Save PDF</button>
      </div>

      {/* Page content — constrained to letter landscape printable width */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 28px" }}>

        {/* Report title */}
        <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #1e2535" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3d7de8", fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif", marginBottom: 6, textTransform: "uppercase" }}>
            Ottawa Collision Analysis · {generated}
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#e8ecf8" }}>
            Collision Summary Report
          </h1>
          {locationLabel && <div style={{ fontSize: 13, color: "#4a5578" }}>📍 {locationLabel}</div>}

          {/* KPI row */}
          <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            {[
              { label: "Total",     value: collisions.length, color: "#e8ecf8" },
              { label: "Fatal",     value: totalFatal,         color: "#e74c3c" },
              { label: "Injury",    value: totalInjury,        color: "#e67e22" },
              { label: "Locations", value: locations.length,   color: "#3d7de8" },
              { label: "🚶 Ped",   value: totalPed,            color: "#2ecc71" },
              { label: "🚲 Cyc",   value: totalCyc,            color: "#2ecc71" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid #1e2535",
                borderRadius: 8, padding: "10px 16px", minWidth: 90,
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif" }}>{value}</div>
                <div style={{ fontSize: 9, color: "#4a5578", letterSpacing: "0.1em", marginTop: 2, textTransform: "uppercase" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 1: All-locations summary ── */}
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "#8b9cc8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12, marginTop: 0 }}>
            All Locations — Summary
          </h2>
          <div style={{ border: "1px solid #1e2535", borderRadius: 8, overflow: "hidden" }}>
            <SummaryTable locations={locations} />
          </div>
        </div>

        <div style={{ borderTop: "1px solid #1e2535", marginBottom: 32 }} />

        {/* ── Section 2: Per-location cross-tabs ── */}
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "#8b9cc8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 24, marginTop: 0 }}>
          Location Breakdown
        </h2>
        {locations.map((loc, i) => (
          <LocationDetail key={loc.key} loc={loc} index={i} />
        ))}

      </div>
    </div>
  );
}
