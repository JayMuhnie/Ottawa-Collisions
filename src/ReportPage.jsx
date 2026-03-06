import { useMemo } from "react";
import { severityLabel, collisionTypeLabel, extractYear, involvementFlags, getAllLocations, namedLocationCount } from "./utils";

// ── Constants ───────────────────────────────────────────────────────
const SEV_ORDER   = ["Fatal", "Non-fatal Injury", "Property Damage Only", "Non-Reportable", "Unknown"];
const SEV_COLORS  = { "Fatal": "#e74c3c", "Non-fatal Injury": "#e67e22", "Property Damage Only": "#5dade2", "Non-Reportable": "#8e44ad", "Unknown": "#7f8c8d" };

// ── Monochromatic SVG icons ──────────────────────────────────────────
const Icon = {
  pedestrian: (
    <svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor" style={{ display: "inline", verticalAlign: "middle" }}>
      <circle cx="5.5" cy="1.5" r="1.5"/>
      <path d="M3 4.5h5l-1 3H8l1 4H6.5l-.5-2-.5 2H4L5 7.5H4L3 4.5z"/>
      <path d="M3 8l-1 3M8 8l1 3" stroke="currentColor" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
    </svg>
  ),
  cyclist: (
    <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ display: "inline", verticalAlign: "middle" }}>
      <circle cx="2.5" cy="8" r="2.5"/>
      <circle cx="11.5" cy="8" r="2.5"/>
      <path d="M2.5 8 L5 4 L8 5.5 L6 2.5 L9 2.5" strokeWidth="1.1"/>
      <path d="M9 2.5 L11.5 8"/>
      <circle cx="9" cy="2" r="0.9" fill="currentColor" stroke="none"/>
    </svg>
  ),
  print: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }}>
      <rect x="2" y="5" width="9" height="6" rx="1"/>
      <path d="M4 5V2h5v3"/>
      <path d="M4 9h5M4 11h3"/>
      <rect x="9" y="6" width="1.2" height="1.2" fill="currentColor" stroke="none"/>
    </svg>
  ),
  back: (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}>
      <path d="M7 5H3M3 5L5 3M3 5L5 7"/>
    </svg>
  ),
};

// ── Helpers ─────────────────────────────────────────────────────────

// Collect all unique collision types across a list of features
function getTypes(features) {
  const s = new Set();
  features.forEach(f => s.add(collisionTypeLabel((f.properties || {}).Initial_Impact_Type)));
  return [...s].filter(t => t !== "Unknown").sort().concat([...s].filter(t => t === "Unknown"));
}

// Build severity × type matrix + year breakdown + involvement totals
function buildStats(features) {
  const matrix = {};
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

// Shorten type labels for column headers
function shortType(t) {
  return t
    .replace(" Collision", "")
    .replace("Turning Movement", "Turning Mvmt")
    .replace("Cyclist Collisions", "Cyclist")
    .replace("Pedestrian Collisions", "Pedestrian");
}

// ── Shared styles ────────────────────────────────────────────────────
const css = {
  th: {
    background: "#141920",
    color: "#a8b8cc",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    padding: "6px 5px",
    textAlign: "center",
    border: "1px solid #1e2535",
    // Allow wrapping ONLY at spaces/hyphens, never mid-word
    whiteSpace: "normal",
    wordBreak: "keep-all",
    overflowWrap: "normal",
    hyphens: "none",
    verticalAlign: "bottom",
    lineHeight: 1.3,
  },
  thLeft: { textAlign: "left" },
  td: {
    padding: "6px 6px",
    color: "#dce4f0",
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
  zero: { color: "#4a5a6a" },
};

// ── Cross-tab matrix table ───────────────────────────────────────────
// globalTypes: fixed column set derived from the entire report dataset
function CrossTab({ features, globalTypes }) {
  const types = globalTypes || getTypes(features);
  const { matrix, years, pedTotal, cycTotal } = buildStats(features);

  const activeSevs = SEV_ORDER.filter(s =>
    features.some(f => severityLabel((f.properties || {}).Classification_Of_Accident) === s)
  );

  const yearKeys = Object.keys(years).sort();

  const colTotals = {};
  types.forEach(t => {
    colTotals[t] = activeSevs.reduce((sum, s) => sum + (matrix[s]?.[t] || 0), 0);
  });
  const grandTotal = features.length;

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
      <div style={{ fontSize: 11, color: "#7a8fa8", marginBottom: 8 }}>
        Data period: <span style={{ color: "#a8b8cc", fontWeight: 600 }}>{yearLabel}</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "auto" }}>
        <thead>
          <tr>
            <th style={{ ...css.th, ...css.thLeft, width: 130, whiteSpace: "nowrap" }}>Severity</th>
            {types.map(t => (
              <th key={t} style={{ ...css.th, width: 56 }}>
                {shortType(t)}
              </th>
            ))}
            <th style={{ ...css.th, borderLeft: "2px solid #2a3350", width: 44, color: "#2ecc71" }}>
              {Icon.pedestrian} Ped
            </th>
            <th style={{ ...css.th, width: 44, color: "#2ecc71" }}>
              {Icon.cyclist} Cyc
            </th>
            <th style={{ ...css.th, borderLeft: "2px solid #2a3350", background: "#111620", width: 48, whiteSpace: "nowrap" }}>Total</th>
            <th style={{ ...css.th, background: "#111620", width: 40, fontStyle: "italic", color: "#7a8fa8", whiteSpace: "nowrap" }}>%</th>
          </tr>
        </thead>
        <tbody>
          {activeSevs.map((sev, si) => {
            const rowTotal = features.filter(f => severityLabel((f.properties || {}).Classification_Of_Accident) === sev).length;
            const rowPct = grandTotal ? Math.round(rowTotal / grandTotal * 100) : 0;
            return (
              <tr key={sev} style={{ background: si % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}>
                <td style={{ ...css.td, ...css.tdLabel, color: SEV_COLORS[sev] || "#dce4f0" }}>{sev}</td>
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
                <td style={{ ...css.td, color: "#9aa8b8", fontSize: 10, fontStyle: "italic" }}>{rowPct ? `${rowPct}%` : "—"}</td>
              </tr>
            );
          })}
          <tr style={{ borderTop: "2px solid #2a3350" }}>
            <td style={{ ...css.td, ...css.tdLabel, ...css.tdTotal, color: "#a8b8cc" }}>Total</td>
            {types.map(t => (
              <td key={t} style={{ ...css.td, ...css.tdTotal, color: colTotals[t] ? "#e8ecf8" : css.zero.color }}>{colTotals[t] || "—"}</td>
            ))}
            <td style={{ ...css.td, ...css.tdTotal, borderLeft: "2px solid #2a3350", color: pedTotal ? "#2ecc71" : css.zero.color }}>{pedTotal || "—"}</td>
            <td style={{ ...css.td, ...css.tdTotal, color: cycTotal ? "#2ecc71" : css.zero.color }}>{cycTotal || "—"}</td>
            <td style={{ ...css.td, ...css.tdTotal, borderLeft: "2px solid #2a3350", color: "#e8ecf8", fontSize: 13, fontWeight: 700 }}>{grandTotal}</td>
            <td style={{ ...css.td, ...css.tdTotal, color: "#9aa8b8", fontSize: 10, fontStyle: "italic" }}>100%</td>
          </tr>
          <tr>
            <td style={{ ...css.td, ...css.tdLabel, color: "#7a8fa8", fontSize: 10, fontStyle: "italic" }}>% of total</td>
            {types.map(t => {
              const pct = grandTotal ? Math.round((colTotals[t] || 0) / grandTotal * 100) : 0;
              return (
                <td key={t} style={{ ...css.td, color: pct ? "#9aa8b8" : css.zero.color, fontSize: 10, fontStyle: "italic" }}>
                  {pct ? `${pct}%` : "—"}
                </td>
              );
            })}
            <td style={{ ...css.td, borderLeft: "2px solid #2a3350", color: pedTotal ? "#9aa8b8" : css.zero.color, fontSize: 10, fontStyle: "italic" }}>
              {pedTotal && grandTotal ? `${Math.round(pedTotal / grandTotal * 100)}%` : "—"}
            </td>
            <td style={{ ...css.td, color: cycTotal ? "#9aa8b8" : css.zero.color, fontSize: 10, fontStyle: "italic" }}>
              {cycTotal && grandTotal ? `${Math.round(cycTotal / grandTotal * 100)}%` : "—"}
            </td>
            <td style={{ ...css.td, borderLeft: "2px solid #2a3350", color: "#9aa8b8", fontSize: 10, fontStyle: "italic" }}>—</td>
            <td style={{ ...css.td, color: css.zero.color, fontSize: 10 }}>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Summary overview table (one row per location) ───────────────────
function SummaryTable({ locations, globalTypes }) {
  const allFeatures = locations.flatMap(l => l.features);
  const types = globalTypes;
  const activeSevs = SEV_ORDER.filter(s =>
    allFeatures.some(f => severityLabel((f.properties || {}).Classification_Of_Accident) === s)
  );

  const yearKeys = [...new Set(allFeatures.map(f => extractYear(f.properties || {})).filter(Boolean))].sort();
  const yearLabel = yearKeys.length === 0 ? "All years"
    : yearKeys.length === 1 ? yearKeys[0]
    : `${yearKeys[0]}–${yearKeys[yearKeys.length - 1]}` + (yearKeys.length < (parseInt(yearKeys[yearKeys.length-1]) - parseInt(yearKeys[0]) + 1) ? ` (filtered: ${yearKeys.join(", ")})` : "");

  return (
    <div>
      <div style={{ fontSize: 11, color: "#7a8fa8", marginBottom: 8 }}>
        Data period: <span style={{ color: "#a8b8cc", fontWeight: 600 }}>{yearLabel}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...css.th, width: 24, padding: "7px 6px", whiteSpace: "nowrap" }}>#</th>
            <th style={{ ...css.th, ...css.thLeft, minWidth: 160, whiteSpace: "nowrap" }}>Location</th>
            {activeSevs.map(s => (
              <th key={s} style={{ ...css.th, color: SEV_COLORS[s], width: 56 }}>
                {s === "Property Damage Only" ? "PDO" : s === "Non-fatal Injury" ? "Injury" : s}
              </th>
            ))}
            <th style={{ ...css.th, borderLeft: "2px solid #2a3350", width: 44, color: "#2ecc71" }}>
              {Icon.pedestrian} Ped
            </th>
            <th style={{ ...css.th, width: 44, color: "#2ecc71" }}>
              {Icon.cyclist} Cyc
            </th>
            <th style={{ ...css.th, borderLeft: "2px solid #2a3350", background: "#111620", whiteSpace: "nowrap" }}>Total</th>
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
                <td style={{ ...css.td, color: "#7a8fa8", fontSize: 10, padding: "6px" }}>{i + 1}</td>
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
          <tr style={{ borderTop: "2px solid #2a3350" }}>
            <td style={{ ...css.td, ...css.tdTotal }} />
            <td style={{ ...css.td, ...css.tdLabel, ...css.tdTotal, color: "#a8b8cc" }}>Total</td>
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
function LocationDetail({ loc, index, globalTypes }) {
  const name = loc.name.replace(/\s*\([^)]*\)\s*$/, "");
  const { pedTotal, cycTotal, pedFatal, cycFatal } = buildStats(loc.features);

  return (
    <div className="location-block" style={{ marginBottom: 36 }}>
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
                {Icon.pedestrian} {pedTotal} ped{pedFatal > 0 ? `, ${pedFatal} fatal` : ""}
              </span>
            )}
            {cycTotal > 0 && (
              <span style={{ fontSize: 11, color: "#2ecc71", background: "rgba(46,204,113,0.1)", borderRadius: 4, padding: "2px 8px" }}>
                {Icon.cyclist} {cycTotal} cyc{cycFatal > 0 ? `, ${cycFatal} fatal` : ""}
              </span>
            )}
          </div>
        )}
      </div>
      <CrossTab features={loc.features} globalTypes={globalTypes} />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────
export default function ReportPage({ collisions, locationLabel, boundary, onBack }) {
  const locations = useMemo(() => getAllLocations(collisions), [collisions]);
  const groupedCount = useMemo(() => locations.reduce((sum, l) => sum + l.features.length, 0), [locations]);

  // Compute a single global type list from ALL collisions — used by every table
  const globalTypes = useMemo(() => getTypes(collisions), [collisions]);

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
      color: "#dce4f0",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: 'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif !important; }
        @media print {
          .no-print { display: none !important; }
          html, body, #root {
            overflow: visible !important;
            height: auto !important;
            background: #0d1117 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color: #dce4f0 !important;
          }
          @page { 
            size: letter landscape; 
            margin: 15mm 12mm 18mm 12mm;
          }
          h1 { font-size: 16pt !important; }
          h2 { font-size: 11pt !important; }
          h3 { font-size: 9pt !important; }
          /* Force content to fit page width */
          .report-content { max-width: 100% !important; padding: 0 !important; }
          /* Tables: allow page breaks between rows, repeat header on each page */
          table { 
            width: 100% !important;
            page-break-inside: auto !important;
            table-layout: auto !important;
            font-size: 9pt !important;
          }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          /* Keep each location block together where possible */
          .location-block { page-break-inside: avoid; }
          /* Reduce padding in print to fit more columns */
          td, th { padding: 4px 4px !important; font-size: 9pt !important; }
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
          borderRadius: 6, color: "#a8b8cc", padding: "6px 14px",
          fontSize: 12, cursor: "pointer",
        }}>{Icon.back} Back to Map</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#7a8fa8" }}>
          {collisions.length} collisions · {locations.length} locations
        </span>
        <button onClick={() => window.print()} style={{
          background: "#3d7de8", border: "none", borderRadius: 6,
          color: "#fff", padding: "6px 18px", fontSize: 12,
          fontWeight: 600, cursor: "pointer",
        }}>{Icon.print} Print / Save PDF</button>
      </div>

      {/* Page content */}
      <div className="report-content" style={{ maxWidth: 960, margin: "0 auto", padding: "32px 28px" }}>

        {/* Report title */}
        <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #1e2535" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3d7de8", marginBottom: 6, textTransform: "uppercase" }}>
            Ottawa Collision Analysis · {generated}
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#e8ecf8" }}>
            Collision Summary Report
          </h1>

          {/* KPI row */}
          <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            {[
              { label: "Total",     value: collisions.length, color: "#e8ecf8" },
              { label: "Fatal",     value: totalFatal,         color: "#e74c3c" },
              { label: "Injury",    value: totalInjury,        color: "#e67e22" },
              { label: "Locations", value: locations.length,   color: "#3d7de8" },
              { label: "Ped",       value: totalPed,            color: "#2ecc71" },
              { label: "Cyc",       value: totalCyc,            color: "#2ecc71" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid #1e2535",
                borderRadius: 8, padding: "10px 16px", minWidth: 90,
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 9, color: "#7a8fa8", letterSpacing: "0.1em", marginTop: 2, textTransform: "uppercase" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Data integrity notice */}
          <div style={{ marginTop: 14, fontSize: 11, color: "#7a8fa8" }}>
            {collisions.length} collision{collisions.length !== 1 ? "s" : ""} across {locations.length} named location{locations.length !== 1 ? "s" : ""}
            {groupedCount < collisions.length && (
              <span style={{ color: "#e67e22" }}> · {collisions.length - groupedCount} without location data (included in totals only)</span>
            )}
          </div>
          </div>
        </div>

        {/* ── Section 1: All locations combined cross-tab ── */}
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "#a8b8cc", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12, marginTop: 0 }}>
            All Locations — Summary
          </h2>
          <div style={{ border: "1px solid #1e2535", borderRadius: 8, overflow: "hidden", padding: "12px 14px" }}>
            <CrossTab features={collisions} globalTypes={globalTypes} />
          </div>
        </div>

        <div style={{ borderTop: "1px solid #1e2535", marginBottom: 32 }} />

        {/* ── Section 2: Per-location cross-tabs ── */}
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "#a8b8cc", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 24, marginTop: 0 }}>
          Location Breakdown
        </h2>
        {locations.map((loc, i) => (
          <LocationDetail key={loc.key} loc={loc} index={i} globalTypes={globalTypes} />
        ))}

      </div>
    </div>
  );
}
