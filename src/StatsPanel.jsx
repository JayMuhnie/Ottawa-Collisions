import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  SEVERITY_COLORS, CHART_PALETTE,
  severityLabel, collisionTypeLabel, extractYear,
} from "./utils";

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
    color: "#7f8c8d",
    marginBottom: 10,
    fontFamily: "'Space Mono', monospace",
  },
};

const tooltipStyle = {
  contentStyle: {
    background: "#1a1a2e",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    fontSize: 11,
    fontFamily: "'IBM Plex Sans', sans-serif",
  },
  labelStyle: { color: "#ecf0f1" },
  itemStyle: { color: "#bdc3c7" },
};

export default function StatsPanel({ collisions, loading }) {
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, color: "#7f8c8d" }}>
        <div style={{ fontSize: 28, animation: "spin 1s linear infinite" }}>⟳</div>
        <div style={{ fontSize: 12 }}>Loading collision data…</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!collisions.length) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 24 }}>
        <div style={{ textAlign: "center", color: "#7f8c8d" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>📍</div>
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            Click anywhere on the map<br />or search an address to load<br />collision data for that area.
          </div>
        </div>
      </div>
    );
  }

  const attrs = collisions.map((c) => c.attributes || {});

  // Severity
  const severityCounts = {};
  attrs.forEach((a) => {
    const s = severityLabel(a.COLLISION_CLASSIFICATION || a.SEVERITY);
    severityCounts[s] = (severityCounts[s] || 0) + 1;
  });
  const severityData = Object.entries(severityCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Year
  const yearCounts = {};
  attrs.forEach((a) => {
    const yr = extractYear(a);
    if (yr) yearCounts[yr] = (yearCounts[yr] || 0) + 1;
  });
  const yearData = Object.entries(yearCounts)
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year.localeCompare(b.year));

  // Collision type
  const typeCounts = {};
  attrs.forEach((a) => {
    const t = collisionTypeLabel(a.COLLISION_TYPE || a.IMPACT_TYPE);
    if (t && t !== "Unknown") typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const typeData = Object.entries(typeCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Conditions
  const envCounts = {};
  attrs.forEach((a) => {
    const e = a.ENVIRONMENT || a.WEATHER || a.ROAD_SURFACE;
    if (e && String(e).trim() && String(e).trim() !== "Unknown") {
      const key = String(e).trim();
      envCounts[key] = (envCounts[key] || 0) + 1;
    }
  });
  const envData = Object.entries(envCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  const fatal = severityCounts["Fatal"] || 0;
  const injury = severityCounts["Personal Injury"] || 0;

  return (
    <div style={{ overflowY: "auto", height: "100%", paddingRight: 2 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[
          { label: "Total", value: collisions.length, color: "#ecf0f1" },
          { label: "Fatal", value: fatal, color: "#e74c3c" },
          { label: "Injury", value: injury, color: "#e67e22" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...S.card, padding: "12px 10px", marginBottom: 0, textAlign: "center" }}>
            <div style={{ ...S.sectionTitle, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>
              {value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Severity pie */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Severity Breakdown</div>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={severityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} paddingAngle={2}>
              {severityData.map((entry) => (
                <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || "#95a5a6"} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 10, color: "#bdc3c7", fontFamily: "'IBM Plex Sans',sans-serif" }} />
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
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#7f8c8d" }} />
              <YAxis tick={{ fontSize: 10, fill: "#7f8c8d" }} />
              <Tooltip {...tooltipStyle} />
              <Line
                type="monotone" dataKey="count" stroke="#00b4d8"
                strokeWidth={2} dot={{ fill: "#00b4d8", r: 3 }}
                activeDot={{ r: 5 }}
              />
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
              <XAxis type="number" tick={{ fontSize: 10, fill: "#7f8c8d" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#bdc3c7" }} width={105} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {typeData.map((_, i) => (
                  <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Conditions */}
      {envData.length > 0 && (
        <div style={S.card}>
          <div style={S.sectionTitle}>Road / Weather Conditions</div>
          <ResponsiveContainer width="100%" height={Math.max(80, envData.length * 24)}>
            <BarChart data={envData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#7f8c8d" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#bdc3c7" }} width={105} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="value" fill="#48cae4" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ fontSize: 10, color: "#4a5568", textAlign: "center", paddingBottom: 16, lineHeight: 1.7 }}>
        Source: City of Ottawa Open Data<br />
        Traffic Collisions 2017–2024
        {collisions.length >= 2000 && (
          <>
            <br />
            <span style={{ color: "#e67e22" }}>Map shows first 2,000 results</span>
          </>
        )}
      </div>
    </div>
  );
}
