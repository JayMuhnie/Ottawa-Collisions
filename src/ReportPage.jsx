import { useMemo } from "react";
import { severityLabel, collisionTypeLabel, extractYear, involvementFlags } from "./utils";

// ── Data helpers ────────────────────────────────────────────────────

function buildLocationStats(features) {
  const years = {}, types = {}, severity = {};
  let pedTotal = 0, cycTotal = 0, pedFatal = 0, cycFatal = 0;

  features.forEach(f => {
    const p = f.properties || {};
    const yr  = extractYear(p) || "Unknown";
    const typ = collisionTypeLabel(p.Initial_Impact_Type);
    const sev = severityLabel(p.Classification_Of_Accident);
    const { ped, cyc } = involvementFlags(p);

    years[yr]     = (years[yr]     || 0) + 1;
    types[typ]    = (types[typ]    || 0) + 1;
    severity[sev] = (severity[sev] || 0) + 1;

    if (ped) { pedTotal++; if (sev === "Fatal") pedFatal++; }
    if (cyc) { cycTotal++; if (sev === "Fatal") cycFatal++; }
  });

  return { years, types, severity, pedTotal, cycTotal, pedFatal, cycFatal };
}

// ── Shared table styles ─────────────────────────────────────────────

const T = {
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    marginBottom: 0,
  },
  th: {
    background: "#1a1f2e",
    color: "#8b9cc8",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    padding: "8px 12px",
    textAlign: "left",
    borderBottom: "2px solid #2a3050",
    whiteSpace: "nowrap",
  },
  thRight: {
    textAlign: "right",
  },
  td: {
    padding: "7px 12px",
    color: "#c8d0e8",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    verticalAlign: "middle",
  },
  tdRight: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontFamily: "'Space Mono', monospace",
    fontSize: 12,
  },
  tdMono: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 12,
  },
};

// ── Mini bar inside a table cell ────────────────────────────────────
function Bar({ value, max, color = "#3d7de8" }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 6, background: "rgba(255,255,255,0.06)",
        borderRadius: 3, overflow: "hidden", minWidth: 60,
      }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ ...T.tdRight, minWidth: 28, color: "#c8d0e8" }}>{value}</span>
    </div>
  );
}

// ── Severity badge ───────────────────────────────────────────────────
const SEV_COLORS = {
  "Fatal":                 { bg: "rgba(231,76,60,0.18)",  text: "#e74c3c" },
  "Non-fatal Injury":      { bg: "rgba(230,126,34,0.18)", text: "#e67e22" },
  "Property Damage Only":  { bg: "rgba(52,152,219,0.18)", text: "#5dade2" },
};

function SevBadge({ label, count }) {
  const c = SEV_COLORS[label] || { bg: "rgba(255,255,255,0.08)", text: "#8b9cc8" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: c.bg, color: c.text,
      borderRadius: 4, padding: "2px 8px", fontSize: 11,
      fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {count} {label}
    </span>
  );
}

// ── Summary table (all locations) ───────────────────────────────────
function SummaryTable({ locations }) {
  const maxCount = Math.max(...locations.map(l => l.features.length), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={T.table}>
        <thead>
          <tr>
            <th style={{ ...T.th, width: 28 }}>#</th>
            <th style={T.th}>Location</th>
            <th style={{ ...T.th, ...T.thRight }}>Total</th>
            <th style={{ ...T.th, ...T.thRight }}>Fatal</th>
            <th style={{ ...T.th, ...T.thRight }}>Injury</th>
            <th style={{ ...T.th, ...T.thRight }}>PDO</th>
            <th style={{ ...T.th, ...T.thRight }}>🚶 Ped</th>
            <th style={{ ...T.th, ...T.thRight }}>🚲 Cyc</th>
            <th style={{ ...T.th }}>Collisions</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc, i) => {
            const { pedTotal, cycTotal } = buildLocationStats(loc.features);
            const isEven = i % 2 === 0;
            return (
              <tr key={loc.key} style={{ background: isEven ? "transparent" : "rgba(255,255,255,0.015)" }}>
                <td style={{ ...T.td, color: "#4a5578", fontSize: 11 }}>{i + 1}</td>
                <td style={{ ...T.td, fontWeight: 500, color: "#e8ecf8", maxWidth: 220 }}>
                  {loc.name.replace(/\s*\([^)]*\)\s*$/, "")}
                </td>
                <td style={{ ...T.td, ...T.tdRight, color: "#e8ecf8", fontWeight: 700 }}>{loc.features.length}</td>
                <td style={{ ...T.td, ...T.tdRight, color: loc.fatal > 0 ? "#e74c3c" : "#4a5578" }}>{loc.fatal || "—"}</td>
                <td style={{ ...T.td, ...T.tdRight, color: loc.injury > 0 ? "#e67e22" : "#4a5578" }}>{loc.injury || "—"}</td>
                <td style={{ ...T.td, ...T.tdRight, color: loc.pdo > 0 ? "#5dade2" : "#4a5578" }}>{loc.pdo || "—"}</td>
                <td style={{ ...T.td, ...T.tdRight, color: pedTotal > 0 ? "#a78bfa" : "#4a5578" }}>{pedTotal || "—"}</td>
                <td style={{ ...T.td, ...T.tdRight, color: cycTotal > 0 ? "#a78bfa" : "#4a5578" }}>{cycTotal || "—"}</td>
                <td style={{ ...T.td, minWidth: 120 }}>
                  <Bar value={loc.features.length} max={maxCount} color={loc.fatal > 0 ? "#e74c3c" : loc.injury > 0 ? "#e67e22" : "#3d7de8"} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Per-location detail section ─────────────────────────────────────
function LocationDetail({ loc, index }) {
  const { years, types, severity, pedTotal, cycTotal, pedFatal, cycFatal } = buildLocationStats(loc.features);
  const total = loc.features.length;

  const yearRows = Object.entries(years).sort(([a],[b]) => a.localeCompare(b));
  const typeRows = Object.entries(types).sort(([,a],[,b]) => b - a);
  const sevRows  = Object.entries(severity).sort(([,a],[,b]) => b - a);
  const maxYear  = Math.max(...yearRows.map(([,v]) => v), 1);
  const maxType  = Math.max(...typeRows.map(([,v]) => v), 1);

  const name = loc.name.replace(/\s*\([^)]*\)\s*$/, "");

  return (
    <div style={{ marginBottom: 40, pageBreakInside: "avoid" }}>
      {/* Location header */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 14,
        borderBottom: "2px solid #2a3050", paddingBottom: 10, marginBottom: 18,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#3d7de8",
          fontFamily: "'Space Mono', monospace",
          background: "rgba(61,125,232,0.12)",
          borderRadius: 4, padding: "3px 8px",
        }}>#{index + 1}</span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#e8ecf8", flex: 1 }}>{name}</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {sevRows.map(([sev, cnt]) => <SevBadge key={sev} label={sev} count={cnt} />)}
        </div>
      </div>

      {/* Involvement callout */}
      {(pedTotal > 0 || cycTotal > 0) && (
        <div style={{
          display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap",
        }}>
          {pedTotal > 0 && (
            <div style={{
              background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)",
              borderRadius: 8, padding: "10px 16px", display: "flex", gap: 12, alignItems: "center",
            }}>
              <span style={{ fontSize: 20 }}>🚶</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", fontFamily: "'Space Mono', monospace" }}>{pedTotal}</div>
                <div style={{ fontSize: 10, color: "#8b7dd4", letterSpacing: "0.08em" }}>
                  PEDESTRIAN{pedTotal !== 1 ? "S" : ""}
                  {pedFatal > 0 && <span style={{ color: "#e74c3c", marginLeft: 6 }}>{pedFatal} FATAL</span>}
                </div>
              </div>
            </div>
          )}
          {cycTotal > 0 && (
            <div style={{
              background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)",
              borderRadius: 8, padding: "10px 16px", display: "flex", gap: 12, alignItems: "center",
            }}>
              <span style={{ fontSize: 20 }}>🚲</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", fontFamily: "'Space Mono', monospace" }}>{cycTotal}</div>
                <div style={{ fontSize: 10, color: "#8b7dd4", letterSpacing: "0.08em" }}>
                  CYCLIST{cycTotal !== 1 ? "S" : ""}
                  {cycFatal > 0 && <span style={{ color: "#e74c3c", marginLeft: 6 }}>{cycFatal} FATAL</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Three breakdown tables side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr", gap: 14 }}>

        {/* By Year */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontSize: 10, letterSpacing: "0.12em", color: "#8b9cc8", fontWeight: 700 }}>BY YEAR</div>
          <table style={{ ...T.table, marginBottom: 0 }}>
            <tbody>
              {yearRows.map(([yr, cnt]) => (
                <tr key={yr}>
                  <td style={{ ...T.td, ...T.tdMono, color: "#8b9cc8", paddingRight: 6 }}>{yr}</td>
                  <td style={{ ...T.td, paddingLeft: 4 }}>
                    <Bar value={cnt} max={maxYear} color="#3d7de8" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* By Type */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontSize: 10, letterSpacing: "0.12em", color: "#8b9cc8", fontWeight: 700 }}>BY COLLISION TYPE</div>
          <table style={{ ...T.table, marginBottom: 0 }}>
            <tbody>
              {typeRows.map(([typ, cnt]) => (
                <tr key={typ}>
                  <td style={{ ...T.td, color: "#c8d0e8", fontSize: 12 }}>{typ}</td>
                  <td style={{ ...T.td, paddingLeft: 4, minWidth: 100 }}>
                    <Bar value={cnt} max={maxType} color="#0891b2" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* By Severity */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontSize: 10, letterSpacing: "0.12em", color: "#8b9cc8", fontWeight: 700 }}>BY SEVERITY</div>
          <table style={{ ...T.table, marginBottom: 0 }}>
            <tbody>
              {sevRows.map(([sev, cnt]) => {
                const c = SEV_COLORS[sev] || { text: "#8b9cc8" };
                return (
                  <tr key={sev}>
                    <td style={{ ...T.td, color: c.text, fontSize: 12 }}>{sev}</td>
                    <td style={{ ...T.td, ...T.tdRight, ...T.tdMono, color: c.text }}>{cnt}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <td style={{ ...T.td, color: "#8b9cc8", fontWeight: 600, fontSize: 11 }}>Total</td>
                <td style={{ ...T.td, ...T.tdRight, ...T.tdMono, color: "#e8ecf8", fontWeight: 700 }}>{total}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Individual collision list for this location */}
      {loc.features.length > 1 && (
        <div style={{ marginTop: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontSize: 10, letterSpacing: "0.12em", color: "#8b9cc8", fontWeight: 700 }}>INDIVIDUAL COLLISIONS</div>
          <table style={{ ...T.table }}>
            <thead>
              <tr>
                <th style={T.th}>Date</th>
                <th style={T.th}>Severity</th>
                <th style={T.th}>Type</th>
                <th style={{ ...T.th, ...T.thRight }}>🚶</th>
                <th style={{ ...T.th, ...T.thRight }}>🚲</th>
                <th style={T.th}>Conditions</th>
              </tr>
            </thead>
            <tbody>
              {loc.features
                .slice()
                .sort((a, b) => (a.properties?.Accident_Date || "").localeCompare(b.properties?.Accident_Date || ""))
                .map((f, j) => {
                  const p = f.properties || {};
                  const sev = severityLabel(p.Classification_Of_Accident);
                  const { ped, cyc } = involvementFlags(p);
                  const c = SEV_COLORS[sev] || { text: "#8b9cc8" };
                  return (
                    <tr key={j} style={{ background: j % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                      <td style={{ ...T.td, ...T.tdMono, color: "#8b9cc8", whiteSpace: "nowrap" }}>{p.Accident_Date || "N/A"}</td>
                      <td style={{ ...T.td }}>
                        <span style={{ color: c.text, fontWeight: 600, fontSize: 12 }}>{sev}</span>
                      </td>
                      <td style={{ ...T.td, color: "#c8d0e8" }}>{collisionTypeLabel(p.Initial_Impact_Type)}</td>
                      <td style={{ ...T.td, ...T.tdRight, color: ped ? "#a78bfa" : "#2a3050" }}>{ped ? parseInt(p.num_of_pedestrians) : "—"}</td>
                      <td style={{ ...T.td, ...T.tdRight, color: cyc ? "#a78bfa" : "#2a3050" }}>{cyc ? parseInt(p.num_of_bicycles) : "—"}</td>
                      <td style={{ ...T.td, color: "#6b7a9f", fontSize: 11 }}>
                        {[p.Light, p.Road_1_Surface_Condition].filter(Boolean).map(v => v.replace(/^\d+\s*-\s*/, "")).join(" · ") || "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main report page ─────────────────────────────────────────────────
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

  const totalFatal   = collisions.filter(f => severityLabel((f.properties || {}).Classification_Of_Accident) === "Fatal").length;
  const totalInjury  = collisions.filter(f => severityLabel((f.properties || {}).Classification_Of_Accident) === "Non-fatal Injury").length;
  const totalPed     = collisions.filter(f => involvementFlags(f.properties || {}).ped).length;
  const totalCyc     = collisions.filter(f => involvementFlags(f.properties || {}).cyc).length;
  const generated    = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d1117",
      fontFamily: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
      color: "#c8d0e8",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        @media print {
          .no-print { display: none !important; }
          body { background: #0d1117 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>

      {/* Sticky toolbar */}
      <div className="no-print" style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(13,17,23,0.95)", backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "10px 32px", display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 6, color: "#8b9cc8", padding: "6px 14px",
          fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
        }}>← Back to Map</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#4a5578", fontFamily: "'Space Mono', monospace" }}>
          {collisions.length} collisions · {locations.length} locations
        </span>
        <button onClick={() => window.print()} style={{
          background: "#3d7de8", border: "none",
          borderRadius: 6, color: "#fff", padding: "6px 18px",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 7,
        }}>⎙ Print / Save PDF</button>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px" }}>

        {/* Report header */}
        <div style={{ marginBottom: 40, paddingBottom: 32, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{
            fontSize: 10, letterSpacing: "0.2em", color: "#3d7de8",
            fontFamily: "'Space Mono', monospace", marginBottom: 10,
            textTransform: "uppercase",
          }}>Ottawa Collision Analysis · Generated {generated}</div>
          <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: "#e8ecf8", lineHeight: 1.2 }}>
            Collision Summary Report
          </h1>
          {locationLabel && (
            <div style={{ fontSize: 14, color: "#4a5578" }}>📍 {locationLabel}</div>
          )}

          {/* Top-level KPIs */}
          <div style={{ display: "flex", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
            {[
              { label: "Total Collisions", value: collisions.length, color: "#e8ecf8" },
              { label: "Fatal",            value: totalFatal,         color: "#e74c3c" },
              { label: "Injury",           value: totalInjury,        color: "#e67e22" },
              { label: "Locations",        value: locations.length,   color: "#3d7de8" },
              { label: "🚶 Pedestrian",    value: totalPed,           color: "#a78bfa" },
              { label: "🚲 Cyclist",       value: totalCyc,           color: "#a78bfa" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "14px 20px", minWidth: 110,
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>
                  {value.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: "#4a5578", letterSpacing: "0.1em", marginTop: 3, textTransform: "uppercase" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary table */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#8b9cc8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16, marginTop: 0 }}>
            All Locations — Summary
          </h2>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
            <SummaryTable locations={locations} />
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginBottom: 40 }} />

        {/* Per-location detail */}
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#8b9cc8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 28, marginTop: 0 }}>
          Location Breakdown
        </h2>
        {locations.map((loc, i) => (
          <LocationDetail key={loc.key} loc={loc} index={i} />
        ))}
      </div>
    </div>
  );
}
