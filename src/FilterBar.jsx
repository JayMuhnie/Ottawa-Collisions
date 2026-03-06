const accent = "#0078C8";
const border = "rgba(0,0,0,0.10)";

function MultiSelect({ options, selected, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {options.map(opt => {
        const active = selected.includes(opt);
        return (
          <button key={opt} onClick={() => onChange(active ? selected.filter(s => s !== opt) : [...selected, opt])} style={{
            background: active ? accent : "#F3F4F6",
            border: `1px solid ${active ? accent : border}`,
            borderRadius: 4,
            color: active ? "#fff" : "#374151",
            padding: "3px 8px", fontSize: 11, cursor: "pointer",
            fontWeight: active ? 700 : 400, transition: "all 0.15s",
            fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

function ToggleButton({ active, onClick, children, color }) {
  const bg = active ? (color || accent) : "#F3F4F6";
  const bc = active ? (color || accent) : border;
  return (
    <button onClick={onClick} style={{
      background: bg, border: `1px solid ${bc}`, borderRadius: 4,
      color: active ? "#fff" : "#374151",
      padding: "4px 10px", fontSize: 11, cursor: "pointer",
      fontWeight: active ? 700 : 400, fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
      whiteSpace: "nowrap", transition: "all 0.15s",
    }}>{children}</button>
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
    label: { fontSize: 10, letterSpacing: "0.1em", color: "#6B7280", textTransform: "uppercase", whiteSpace: "nowrap", paddingTop: 4, fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif" },
    divider: { width: 1, background: border, alignSelf: "stretch", margin: "0 4px" },
  };

  const hasFilters = filters.years.length > 0 || filters.types.length > 0 || filters.severity.length > 0 || filters.involvement.length > 0;

  return (
    <div style={{
      background: "#FFFFFF", borderBottom: `1px solid rgba(0,0,0,0.10)`,
      padding: "8px 18px", display: "flex", alignItems: "center",
      gap: 16, flexWrap: "wrap", flexShrink: 0,
    }}>
      {/* Year */}
      <div style={S.group}>
        <span style={S.label}>Year</span>
        <MultiSelect options={allYears} selected={filters.years} onChange={v => onFiltersChange({ ...filters, years: v })} />
      </div>

      <div style={S.divider} />

      {/* Severity */}
      <div style={S.group}>
        <span style={S.label}>Severity</span>
        <MultiSelect options={["Fatal", "Non-fatal Injury", "Property Damage Only", "Non-Reportable"]} selected={filters.severity} onChange={v => onFiltersChange({ ...filters, severity: v })} />
      </div>

      <div style={S.divider} />

      {/* Type */}
      <div style={S.group}>
        <span style={S.label}>Type</span>
        <MultiSelect options={allTypes} selected={filters.types} onChange={v => onFiltersChange({ ...filters, types: v })} />
      </div>

      <div style={S.divider} />

      {/* Involvement */}
      <div style={S.group}>
        <span style={S.label}>Involves</span>
        <div style={{ display: "flex", gap: 4 }}>
          {[["Pedestrian", "pedestrian"], ["Cyclist", "cyclist"]].map(([label, val]) => {
            const active = filters.involvement.includes(val);
            return (
              <button key={val} onClick={() => {
                const next = active ? filters.involvement.filter(v => v !== val) : [...filters.involvement, val];
                onFiltersChange({ ...filters, involvement: next });
              }} style={{
                background: active ? "#2ecc71" : "rgba(0,0,0,0.06)",
                border: `1px solid ${active ? "#2ecc71" : border}`,
                borderRadius: 4, color: active ? "#fff" : "#374151",
                padding: "3px 8px", fontSize: 11, cursor: "pointer",
                fontWeight: active ? 700 : 400, transition: "all 0.15s",
                fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
              }}>{label}</button>
            );
          })}
        </div>
      </div>

      <div style={S.divider} />

      {/* Heatmap */}
      <ToggleButton active={showHeatmap} onClick={onHeatmapToggle} color="#e67e22">Heatmap</ToggleButton>

      {/* Clear */}
      {hasFilters && (
        <button onClick={() => onFiltersChange({ years: [], types: [], severity: [], involvement: [] })} style={{
          background: "none", border: `1px solid ${border}`, borderRadius: 4,
          color: "#6B7280", padding: "4px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif", whiteSpace: "nowrap",
        }}>✕ Clear</button>
      )}

      <div style={{ flex: 1 }} />

      {hasFilters && (
        <div style={{ fontSize: 11, color: accent, fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif", whiteSpace: "nowrap" }}>
          {filteredCount.toLocaleString()} / {totalCount.toLocaleString()} shown
        </div>
      )}
    </div>
  );
}
