import { useState } from "react";
import { severityLabel, collisionTypeLabel, extractYear } from "./utils";

const border = "rgba(255,255,255,0.08)";
const accent = "#00b4d8";

export default function RepeatLocations({ locations, onSelect, selectedGeoId }) {
  const [expanded, setExpanded] = useState(null);

  if (!locations.length) return (
    <div style={{ padding: "16px 0", color: "#7f8c8d", fontSize: 12, textAlign: "center" }}>
      No repeat collision locations found in this area.
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7f8c8d", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>
        Repeat Collision Locations · Top {Math.min(locations.length, 20)}
      </div>
      {locations.slice(0, 20).map((loc, i) => {
        const isSelected = selectedGeoId === (loc.geoId || loc.key);
        const isExpanded = expanded === loc.key;
        const years = [...new Set(loc.features.map(f => extractYear(f.properties || {})).filter(Boolean))].sort();

        return (
          <div key={loc.key} style={{
            background: isSelected ? "rgba(0,180,216,0.08)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${isSelected ? "rgba(0,180,216,0.3)" : border}`,
            borderRadius: 6,
            marginBottom: 6,
            overflow: "hidden",
            transition: "all 0.15s",
          }}>
            {/* Header row */}
            <div
              onClick={() => {
                onSelect(isSelected ? null : (loc.geoId || loc.key));
                setExpanded(isExpanded ? null : loc.key);
              }}
              style={{ padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >
              {/* Rank */}
              <div style={{ fontSize: 10, color: "#7f8c8d", width: 18, textAlign: "center", flexShrink: 0 }}>
                #{i + 1}
              </div>

              {/* Count badge */}
              <div style={{
                background: loc.fatal > 0 ? "#e74c3c" : loc.injury > 0 ? "#e67e22" : "#3498db",
                borderRadius: 4,
                padding: "2px 7px",
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
                fontFamily: "'Space Mono', monospace",
              }}>
                {loc.features.length}
              </div>

              {/* Location name */}
              <div style={{ fontSize: 11, color: "#ecf0f1", flex: 1, lineHeight: 1.4 }}>
                {loc.name.replace(/\s*\([^)]*\)\s*$/, "")}
              </div>

              {/* Expand arrow */}
              <div style={{ color: "#7f8c8d", fontSize: 10 }}>{isExpanded ? "▲" : "▼"}</div>
            </div>

            {/* Severity pills */}
            <div style={{ padding: "0 10px 8px 36px", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {loc.fatal > 0 && <span style={{ fontSize: 10, background: "rgba(231,76,60,0.2)", color: "#e74c3c", padding: "1px 6px", borderRadius: 3 }}>{loc.fatal} fatal</span>}
              {loc.injury > 0 && <span style={{ fontSize: 10, background: "rgba(230,126,34,0.2)", color: "#e67e22", padding: "1px 6px", borderRadius: 3 }}>{loc.injury} injury</span>}
              {loc.pdo > 0 && <span style={{ fontSize: 10, background: "rgba(52,152,219,0.2)", color: "#3498db", padding: "1px 6px", borderRadius: 3 }}>{loc.pdo} PDO</span>}
              <span style={{ fontSize: 10, color: "#7f8c8d" }}>{years.join(", ")}</span>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${border}`, padding: "8px 10px" }}>
                {loc.features.map((f, j) => {
                  const p = f.properties || {};
                  const sev = severityLabel(p.Classification_Of_Accident);
                  const sevColors = { "Fatal": "#e74c3c", "Non-fatal Injury": "#e67e22", "Property Damage Only": "#3498db" };
                  return (
                    <div key={j} style={{
                      display: "flex", gap: 8, alignItems: "center",
                      padding: "4px 0",
                      borderBottom: j < loc.features.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none",
                      fontSize: 11,
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: sevColors[sev] || "#95a5a6", flexShrink: 0 }} />
                      <span style={{ color: "#7f8c8d", width: 70, flexShrink: 0 }}>{p.Accident_Date || "N/A"}</span>
                      <span style={{ color: "#bdc3c7" }}>{collisionTypeLabel(p.Initial_Impact_Type)}</span>
                      <span style={{ color: sevColors[sev] || "#95a5a6", marginLeft: "auto", flexShrink: 0 }}>{sev}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
