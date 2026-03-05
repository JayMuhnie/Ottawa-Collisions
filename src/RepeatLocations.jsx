import { useState } from "react";
import { severityLabel, collisionTypeLabel, extractYear } from "./utils";

const border = "rgba(255,255,255,0.08)";
const accent = "#00b4d8";

function LocationCard({ loc, i, isSelected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const years = [...new Set(loc.features.map(f => extractYear(f.properties || {})).filter(Boolean))].sort();
  const isRepeat = loc.features.length > 1;

  return (
    <div style={{
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
          if (isRepeat) setExpanded(e => !e);
        }}
        style={{ padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
      >
        {/* Rank */}
        <div style={{ fontSize: 10, color: "#7f8c8d", width: 18, textAlign: "center", flexShrink: 0 }}>
          #{i + 1}
        </div>

        {/* Count badge */}
        <div style={{
          background: loc.fatal > 0 ? "#e74c3c" : loc.injury > 0 ? "#e67e22" : isRepeat ? "#3498db" : "rgba(255,255,255,0.1)",
          borderRadius: 4,
          padding: "2px 7px",
          fontSize: 12,
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
          fontFamily: "'Space Mono', monospace",
          minWidth: 24,
          textAlign: "center",
        }}>
          {loc.features.length}
        </div>

        {/* Location name */}
        <div style={{ fontSize: 11, color: "#ecf0f1", flex: 1, lineHeight: 1.4 }}>
          {loc.name.replace(/\s*\([^)]*\)\s*$/, "")}
        </div>

        {/* Expand arrow — only for repeat locations */}
        {isRepeat && (
          <div style={{ color: "#7f8c8d", fontSize: 10 }}>{expanded ? "▲" : "▼"}</div>
        )}
      </div>

      {/* Severity pills */}
      <div style={{ padding: "0 10px 8px 36px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {loc.fatal > 0 && <span style={{ fontSize: 10, background: "rgba(231,76,60,0.2)", color: "#e74c3c", padding: "1px 6px", borderRadius: 3 }}>{loc.fatal} fatal</span>}
        {loc.injury > 0 && <span style={{ fontSize: 10, background: "rgba(230,126,34,0.2)", color: "#e67e22", padding: "1px 6px", borderRadius: 3 }}>{loc.injury} injury</span>}
        {loc.pdo > 0 && <span style={{ fontSize: 10, background: "rgba(52,152,219,0.2)", color: "#3498db", padding: "1px 6px", borderRadius: 3 }}>{loc.pdo} PDO</span>}
        <span style={{ fontSize: 10, color: "#7f8c8d" }}>{years.join(", ")}</span>
      </div>

      {/* Expanded detail — only for repeat locations */}
      {isRepeat && expanded && (
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
}

export default function RepeatLocations({ allLocations, onSelect, selectedGeoId }) {
  const [repeatOnly, setRepeatOnly] = useState(false);

  const displayed = repeatOnly
    ? allLocations.filter(l => l.features.length > 1)
    : allLocations;

  const repeatCount = allLocations.filter(l => l.features.length > 1).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7f8c8d", fontFamily: "'Space Mono', monospace", flex: 1 }}>
          {displayed.length.toLocaleString()} location{displayed.length !== 1 ? "s" : ""}
          {repeatOnly && ` · ${repeatCount} repeat`}
        </div>
        <button
          onClick={() => setRepeatOnly(r => !r)}
          style={{
            background: repeatOnly ? accent : "rgba(255,255,255,0.06)",
            border: `1px solid ${repeatOnly ? accent : border}`,
            borderRadius: 4,
            color: repeatOnly ? "#000" : "#bdc3c7",
            padding: "3px 9px",
            fontSize: 10,
            cursor: "pointer",
            fontWeight: repeatOnly ? 700 : 400,
            fontFamily: "'IBM Plex Sans', sans-serif",
            whiteSpace: "nowrap",
            transition: "all 0.15s",
          }}
        >
          🔁 Repeats only
        </button>
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {displayed.length === 0 ? (
          <div style={{ padding: "24px 0", color: "#7f8c8d", fontSize: 12, textAlign: "center" }}>
            {repeatOnly ? "No repeat collision locations found." : "No locations found."}
          </div>
        ) : (
          displayed.map((loc, i) => (
            <LocationCard
              key={loc.key}
              loc={loc}
              i={i}
              isSelected={selectedGeoId === (loc.geoId || loc.key)}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
