const accent = "#00b4d8";
const border = "rgba(255,255,255,0.08)";

function MultiSelect({ options, selected, onChange, placeholder }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {options.map(opt => {
        const active = selected.includes(opt);
        return (
          <button key={opt} onClick={() => {
            onChange(active ? selected.filter(s => s !== opt) : [...selected, opt]);
          }} style={{
            background: active ? accent : "rgba(255,255,255,0.06)",
            border: `1px solid ${active ? accent : border}`,
            borderRadius: 4,
            color: active ? "#000" : "#bdc3c7",
            padding: "3px 8px",
            fontSize: 11,
            cursor: "pointer",
            fontWeight: active ? 700 : 400,
            transition: "all 0.15s",
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export default function FilterBar({
  allYears, allTypes,
  filters, onFiltersChange,
  showHeatmap, onHeatmapToggle,
  filteredCount, totalCount,
}) {
  const S = {
    group: { display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" },
    label: { fontSize: 10, letterSpacing: "0.1em", color: "#7f8c8d", textTransform: "uppercase", whiteSpace: "nowrap", paddingTop: 4, fontFamily: "'Space Mono', monospace" },
    divider: { width: 1, background: border, alignSelf: "stretch", margin: "0 4px" },
  };

  const hasFilters = filters.years.length > 0 || filters.types.length > 0 || filters.severity.length > 0;

  return (
    <div style={{
      background: "#0e0e20",
      borderBottom: `1px solid ${border}`,
      padding: "8px 18px",
      display: "flex",
      alignItems: "center",
      gap: 16,
      flexWrap: "wrap",
      flexShrink: 0,
    }}>
      {/* Year filter */}
      <div style={S.group}>
        <span style={S.label}>Year</span>
        <MultiSelect
          options={allYears}
          selected={filters.years}
          onChange={v => onFiltersChange({ ...filters, years: v })}
        />
      </div>

      <div style={S.divider} />

      {/* Severity filter */}
      <div style={S.group}>
        <span style={S.label}>Severity</span>
        <MultiSelect
          options={["Fatal", "Non-fatal Injury", "Property Damage Only"]}
          selected={filters.severity}
          onChange={v => onFiltersChange({ ...filters, severity: v })}
        />
      </div>

      <div style={S.divider} />

      {/* Type filter */}
      <div style={S.group}>
        <span style={S.label}>Type</span>
        <MultiSelect
          options={allTypes}
          selected={filters.types}
          onChange={v => onFiltersChange({ ...filters, types: v })}
        />
      </div>

      <div style={S.divider} />

      {/* Heatmap toggle */}
      <button onClick={onHeatmapToggle} style={{
        background: showHeatmap ? "#e67e22" : "rgba(255,255,255,0.06)",
        border: `1px solid ${showHeatmap ? "#e67e22" : border}`,
        borderRadius: 4,
        color: showHeatmap ? "#000" : "#bdc3c7",
        padding: "4px 10px",
        fontSize: 11,
        cursor: "pointer",
        fontWeight: showHeatmap ? 700 : 400,
        fontFamily: "'IBM Plex Sans', sans-serif",
        whiteSpace: "nowrap",
      }}>
        🔥 Heatmap
      </button>

      {/* Clear filters */}
      {hasFilters && (
        <button onClick={() => onFiltersChange({ years: [], types: [], severity: [] })} style={{
          background: "none",
          border: `1px solid ${border}`,
          borderRadius: 4,
          color: "#7f8c8d",
          padding: "4px 10px",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "'IBM Plex Sans', sans-serif",
          whiteSpace: "nowrap",
        }}>
          ✕ Clear
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* Filter count */}
      {hasFilters && (
        <div style={{ fontSize: 11, color: accent, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap" }}>
          {filteredCount.toLocaleString()} / {totalCount.toLocaleString()} shown
        </div>
      )}
    </div>
  );
}
