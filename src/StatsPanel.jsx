import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { SEVERITY_COLORS, CHART_PALETTE, severityLabel, collisionTypeLabel, extractYear, getAllLocations, exportToCSV, involvementFlags } from "./utils";
import RepeatLocations from "./RepeatLocations";

const S = {
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "14px 16px",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#9aa8b8",
    marginBottom: 10,
    fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
  },
};

const tooltipStyle = {
  contentStyle: { background: "#0d1b2e", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, fontSize: 11 },
  labelStyle: { color: "#dce4f0" },
  itemStyle: { color: "#c8d4e0" },
};

const accent = "#00b4d8";
const border = "rgba(255,255,255,0.08)";

const TABS = ["Stats", "Locations"];

export default function StatsPanel({ collisions, allCollisions, loading, onHighlightLocation, highlightGeoId, onExcludedChange, excludedGeoIds }) {
  const [tab, setTab] = useState("Stats");

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, color: "#9aa8b8" }}>
        <div style={{ width:28, height:28, border:"3px solid rgba(255,255,255,0.1)", borderTop:"3px solid #9aa8b8", borderRadius:"50%", animation:"spin 1s linear infinite" }} />
        <div style={{ fontSize: 12 }}>Loading collision data…</div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  if (!collisions.length) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 24 }}>
        <div style={{ textAlign: "center", color: "#9aa8b8" }}>
          <svg width="36" height="44" viewBox="0 0 36 44" fill="#9aa8b8" style={{ marginBottom: 14 }}><path d="M18 0C11 0 5 6 5 13c0 10 13 27 13 27s13-17 13-27C31 6 25 0 18 0zm0 18a5 5 0 110-10 5 5 0 010 10z"/></svg>
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>Click anywhere on the map<br />or search an address to load<br />collision data for that area.</div>
        </div>
      </div>
    );
  }

  const props = collisions.map((f) => f.properties || {});
  // allLocations uses the pre-exclusion list so excluded cards stay visible
  const allLocations = getAllLocations(allCollisions || collisions);
  const repeatCount = allLocations.filter(l => l.features.length > 1).length;

  // Involvement counts
  let pedCount = 0, cycCount = 0, pedFatal = 0, cycFatal = 0;
  props.forEach(p => {
    const { ped, cyc } = involvementFlags(p);
    const sev = severityLabel(p.Classification_Of_Accident);
    if (ped) { pedCount++; if (sev === "Fatal") pedFatal++; }
    if (cyc) { cycCount++; if (sev === "Fatal") cycFatal++; }
  });

  // Severity
  const severityCounts = {};
  props.forEach((p) => {
    const s = severityLabel(p.Classification_Of_Accident);
    severityCounts[s] = (severityCounts[s] || 0) + 1;
  });
  const severityData = Object.entries(severityCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Year
  const yearCounts = {};
  props.forEach((p) => {
    const yr = extractYear(p);
    if (yr) yearCounts[yr] = (yearCounts[yr] || 0) + 1;
  });
  const yearData = Object.entries(yearCounts)
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year.localeCompare(b.year));

  // Collision type
  const typeCounts = {};
  props.forEach((p) => {
    const t = collisionTypeLabel(p.Initial_Impact_Type);
    if (t && t !== "Unknown") typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const typeData = Object.entries(typeCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Road surface
  const roadCounts = {};
  props.forEach((p) => {
    const raw = p.Road_1_Surface_Condition;
    if (raw) {
      const label = String(raw).replace(/^\d+\s*-\s*/, "").trim();
      if (label) roadCounts[label] = (roadCounts[label] || 0) + 1;
    }
  });
  const roadData = Object.entries(roadCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  // Weather
  const envCounts = {};
  props.forEach((p) => {
    const raw = p.Environment_Condition_1;
    if (raw) {
      const label = String(raw).replace(/^\d+\s*-\s*/, "").trim();
      if (label) envCounts[label] = (envCounts[label] || 0) + 1;
    }
  });
  const envData = Object.entries(envCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  const fatal = severityCounts["Fatal"] || 0;
  const injury = severityCounts["Non-fatal Injury"] || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tabs + Export */}
      <div style={{ display: "flex", borderBottom: `1px solid ${border}`, marginBottom: 12, flexShrink: 0, alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none",
            border: "none",
            borderBottom: tab === t ? `2px solid ${accent}` : "2px solid transparent",
            color: tab === t ? accent : "#9aa8b8",
            padding: "6px 14px",
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
            letterSpacing: "0.06em",
            marginBottom: -1,
          }}>
            {t}
            {t === "Locations" && allLocations.length > 0 && (
              <span style={{ marginLeft: 5, background: accent, color: "#000", borderRadius: 10, padding: "0 5px", fontSize: 10 }}>
                {allLocations.length}
              </span>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => exportToCSV(collisions)}
          title="Export to CSV"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${border}`,
            borderRadius: 4,
            color: "#c8d4e0",
            padding: "3px 9px",
            fontSize: 10,
            cursor: "pointer",
            fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
            marginBottom: 2,
          }}
        >
          Export CSV
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
        {tab === "Stats" ? (
          <>
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[
                { label: "Total", value: collisions.length, color: "#dce4f0" },
                { label: "Fatal", value: fatal, color: "#e74c3c" },
                { label: "Injury", value: injury, color: "#e67e22" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ ...S.card, padding: "12px 10px", marginBottom: 0, textAlign: "center" }}>
                  <div style={{ ...S.sectionTitle, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif" }}>
                    {value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Pedestrian / Cyclist KPIs */}
            {(pedCount > 0 || cycCount > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                {[
                  { label: "Pedestrian", value: pedCount, fatal: pedFatal, color: "#2ecc71" },
                  { label: "Cyclist", value: cycCount, fatal: cycFatal, color: "#2ecc71" },
                ].map(({ label, value, fatal: f, color }) => (
                  <div key={label} style={{ ...S.card, padding: "10px 12px", marginBottom: 0 }}>
                    <div style={{ ...S.sectionTitle, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif" }}>
                      {value.toLocaleString()}
                    </div>
                    {f > 0 && (
                      <div style={{ fontSize: 10, color: "#e74c3c", marginTop: 2 }}>{f} fatal</div>
                    )}
                    <div style={{ fontSize: 10, color: "#9aa8b8", marginTop: 2 }}>
                      {collisions.length > 0 ? `${((value / collisions.length) * 100).toFixed(1)}% of total` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Severity pie */}
            <div style={S.card}>
              <div style={S.sectionTitle}>Severity Breakdown</div>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <Pie data={severityData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={60} paddingAngle={2}>
                    {severityData.map((entry) => (
                      <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || "#95a5a6"} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#c8d4e0" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Year trend */}
            {yearData.length > 1 && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Year-over-Year Trend</div>
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={yearData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#9aa8b8" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#9aa8b8" }} />
                    <Tooltip {...tooltipStyle} />
                    <Line type="monotone" dataKey="count" stroke={accent} strokeWidth={2} dot={{ fill: accent, r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Collision type */}
            {typeData.length > 0 && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Collision Type</div>
                <ResponsiveContainer width="100%" height={Math.max(100, typeData.length * 26)}>
                  <BarChart data={typeData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#9aa8b8" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#c8d4e0" }} width={120} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                      {typeData.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Road surface */}
            {roadData.length > 0 && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Road Surface Conditions</div>
                <ResponsiveContainer width="100%" height={Math.max(80, roadData.length * 24)}>
                  <BarChart data={roadData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#9aa8b8" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#c8d4e0" }} width={120} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="value" fill="#48cae4" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Weather */}
            {envData.length > 0 && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Weather Conditions</div>
                <ResponsiveContainer width="100%" height={Math.max(80, envData.length * 24)}>
                  <BarChart data={envData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#9aa8b8" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#c8d4e0" }} width={120} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="value" fill="#0077b6" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div style={{ fontSize: 10, color: "#4a5568", textAlign: "center", paddingBottom: 16, lineHeight: 1.7 }}>
              Source: City of Ottawa Open Data · Traffic Collisions 2017–present
              {collisions.length >= 2000 && <><br /><span style={{ color: "#e67e22" }}>Map shows first 2,000 results</span></>}
            </div>
          </>
        ) : (
          <RepeatLocations
            allLocations={allLocations}
            onHighlight={onHighlightLocation}
            highlightedGeoId={highlightGeoId}
            excludedGeoIds={excludedGeoIds}
            onExcludedChange={onExcludedChange}
          />
        )}
      </div>
    </div>
  );
}
