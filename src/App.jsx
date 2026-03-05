import { useState, useCallback, useMemo } from "react";
import CollisionMap from "./CollisionMap";
import StatsPanel from "./StatsPanel";
import FilterBar from "./FilterBar";
import { fetchCollisionsNear, geocodeAddress, getUniqueYears, getUniqueTypes, applyFilters } from "./utils";

const accent = "#00b4d8";
const border = "rgba(255,255,255,0.08)";

const RADIUS_OPTIONS = [
  { label: "250m", km: 0.25 },
  { label: "500m", km: 0.5 },
  { label: "1km", km: 1 },
  { label: "2km", km: 2 },
];

export default function App() {
  const [collisions, setCollisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchMarker, setSearchMarker] = useState(null);
  const [radiusKm, setRadiusKm] = useState(0.5);
  const [addressInput, setAddressInput] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [highlightGeoId, setHighlightGeoId] = useState(null);
  const [filters, setFilters] = useState({ years: [], types: [], severity: [] });

  // Derived: available filter options from raw data
  const allYears = useMemo(() => getUniqueYears(collisions), [collisions]);
  const allTypes = useMemo(() => getUniqueTypes(collisions), [collisions]);

  // Derived: filtered collisions
  const filteredCollisions = useMemo(() => applyFilters(collisions, filters), [collisions, filters]);

  const loadCollisions = useCallback(async (lat, lng, km) => {
    setLoading(true);
    setError(null);
    setFilters({ years: [], types: [], severity: [] });
    setHighlightGeoId(null);
    try {
      const features = await fetchCollisionsNear(lat, lng, km);
      setCollisions(features);
    } catch (err) {
      setError(`Failed to load data: ${err.message}`);
      setCollisions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMapClick = useCallback((lat, lng) => {
    setSearchMarker({ lat, lng });
    setLocationLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    loadCollisions(lat, lng, radiusKm);
  }, [radiusKm, loadCollisions]);

  const handleSearch = useCallback(async () => {
    if (!addressInput.trim()) return;
    setGeocoding(true);
    setError(null);
    try {
      const { lat, lng, label } = await geocodeAddress(addressInput);
      setSearchMarker({ lat, lng });
      setLocationLabel(label);
      loadCollisions(lat, lng, radiusKm);
    } catch {
      setError("Address not found. Try a more specific Ottawa address or intersection.");
    } finally {
      setGeocoding(false);
    }
  }, [addressInput, radiusKm, loadCollisions]);

  const handleRadiusChange = (km) => {
    setRadiusKm(km);
    if (searchMarker) loadCollisions(searchMarker.lat, searchMarker.lng, km);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0d0d1a" }}>
      {/* ── Header ── */}
      <header style={{
        background: "#111124",
        borderBottom: `1px solid ${border}`,
        padding: "10px 18px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <div style={{ marginRight: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.07em", color: accent }}>
            OTTAWA COLLISION ANALYSIS
          </div>
          <div style={{ fontSize: 10, color: "#7f8c8d", letterSpacing: "0.08em" }}>
            Traffic Safety Intelligence · 2017–present
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search address or intersection…"
            style={{
              background: "rgba(255,255,255,0.06)", border: `1px solid ${border}`,
              borderRadius: 6, color: "#ecf0f1", padding: "7px 12px",
              fontSize: 13, width: 280, outline: "none", transition: "border-color 0.2s",
            }}
            onFocus={(e) => (e.target.style.borderColor = accent)}
            onBlur={(e) => (e.target.style.borderColor = border)}
          />
          <button onClick={handleSearch} disabled={geocoding || loading} style={{
            background: accent, border: "none", borderRadius: 6, color: "#000",
            padding: "7px 16px", fontSize: 12, fontWeight: 700,
            cursor: geocoding ? "wait" : "pointer", letterSpacing: "0.06em",
            opacity: geocoding ? 0.7 : 1, transition: "opacity 0.2s",
          }}>
            {geocoding ? "…" : "SEARCH"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#7f8c8d" }}>
          <span style={{ letterSpacing: "0.1em" }}>RADIUS</span>
          {RADIUS_OPTIONS.map(({ label, km }) => (
            <button key={km} onClick={() => handleRadiusChange(km)} style={{
              background: radiusKm === km ? accent : "rgba(255,255,255,0.06)",
              border: "none", borderRadius: 4,
              color: radiusKm === km ? "#000" : "#bdc3c7",
              padding: "5px 9px", fontSize: 11, cursor: "pointer",
              fontWeight: radiusKm === km ? 700 : 400, transition: "all 0.15s",
            }}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Error Banner ── */}
      {error && (
        <div style={{
          background: "rgba(231,76,60,0.12)", borderBottom: "1px solid rgba(231,76,60,0.25)",
          padding: "8px 18px", fontSize: 12, color: "#e74c3c",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── Location bar ── */}
      {locationLabel && (
        <div style={{
          background: "rgba(0,180,216,0.07)", borderBottom: "1px solid rgba(0,180,216,0.15)",
          padding: "5px 18px", fontSize: 11, color: accent,
          display: "flex", gap: 12,
        }}>
          <span>📍 {locationLabel}</span>
          <span style={{ color: "rgba(0,180,216,0.5)" }}>·</span>
          <span>{radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km`} radius</span>
          <span style={{ color: "rgba(0,180,216,0.5)" }}>·</span>
          <span><b>{filteredCollisions.length.toLocaleString()}</b> collisions</span>
        </div>
      )}

      {/* ── Filter Bar (only when data loaded) ── */}
      {collisions.length > 0 && (
        <FilterBar
          allYears={allYears}
          allTypes={allTypes}
          filters={filters}
          onFiltersChange={setFilters}
          showHeatmap={showHeatmap}
          onHeatmapToggle={() => setShowHeatmap(h => !h)}
          filteredCount={filteredCollisions.length}
          totalCount={collisions.length}
        />
      )}

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Map */}
        <div style={{ flex: 1, position: "relative" }}>
          <CollisionMap
            collisions={filteredCollisions}
            onMapClick={handleMapClick}
            searchMarker={searchMarker}
            radiusKm={radiusKm}
            showHeatmap={showHeatmap}
            highlightGeoId={highlightGeoId}
          />

          {/* Legend — hide when heatmap active */}
          {!showHeatmap && (
            <div style={{
              position: "absolute", bottom: 24, left: 12,
              background: "rgba(13,13,26,0.92)", border: `1px solid ${border}`,
              borderRadius: 8, padding: "10px 14px", fontSize: 11,
              backdropFilter: "blur(4px)", zIndex: 1000,
            }}>
              {[["Fatal","#e74c3c"],["Non-fatal Injury","#e67e22"],["Property Damage Only","#3498db"],["Unknown","#95a5a6"]].map(([label, color]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ color: "#bdc3c7" }}>{label}</span>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${border}`, marginTop: 7, paddingTop: 7, color: "#7f8c8d", fontSize: 10 }}>
                🟡 Search point · click map to query
              </div>
            </div>
          )}

          {/* Heatmap legend */}
          {showHeatmap && (
            <div style={{
              position: "absolute", bottom: 24, left: 12,
              background: "rgba(13,13,26,0.92)", border: `1px solid ${border}`,
              borderRadius: 8, padding: "10px 14px", fontSize: 11,
              backdropFilter: "blur(4px)", zIndex: 1000,
            }}>
              <div style={{ fontSize: 10, color: "#7f8c8d", letterSpacing: "0.1em", marginBottom: 8 }}>COLLISION DENSITY</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 80, height: 8, borderRadius: 4, background: "linear-gradient(to right, #023e8a, #0077b6, #f1c40f, #e67e22, #e74c3c)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7f8c8d", marginTop: 3 }}>
                <span>Low</span><span>High</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 9, color: "#7f8c8d" }}>Fatal weighted higher</div>
            </div>
          )}

          {/* Empty state */}
          {!searchMarker && (
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(13,13,26,0.88)", border: `1px solid ${border}`,
              borderRadius: 12, padding: "18px 24px", fontSize: 13,
              color: "#7f8c8d", textAlign: "center",
              pointerEvents: "none", lineHeight: 1.8, zIndex: 1000,
            }}>
              Click anywhere on the map<br />or search an address above
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside style={{
          width: 340, background: "#111124",
          borderLeft: `1px solid ${border}`,
          padding: "14px 12px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}>
          <StatsPanel
            collisions={filteredCollisions}
            loading={loading}
            onHighlightLocation={setHighlightGeoId}
            highlightGeoId={highlightGeoId}
          />
        </aside>
      </div>
    </div>
  );
}
