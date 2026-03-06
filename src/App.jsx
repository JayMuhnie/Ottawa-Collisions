import { useState, useCallback, useMemo } from "react";
import CollisionMap from "./CollisionMap";
import StatsPanel from "./StatsPanel";
import FilterBar from "./FilterBar";
import ReportPage from "./ReportPage";
import {
  fetchCollisionsNear, fetchCollisionsInBbox, geocodeAddress,
  getUniqueYears, getUniqueTypes, applyFilters,
  pointInPolygon, polygonBbox,
  fetchCollisionsByGeoIds, mergeFeatures, buildOutOfAreaIds,
} from "./utils";

const accent = "#00b4d8";
const border = "rgba(255,255,255,0.08)";

const RADIUS_PRESETS = [
  { label: "250m", km: 0.25 },
  { label: "500m", km: 0.5 },
  { label: "1km", km: 1 },
  { label: "2km", km: 2 },
  { label: "5km", km: 5 },
];

// Selection mode: "radius" or "polygon"
export default function App() {
  const [collisions, setCollisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Radius mode state
  const [searchMarker, setSearchMarker] = useState(null);
  const [radiusKm, setRadiusKm] = useState(0.5);
  const [radiusInput, setRadiusInput] = useState("500");
  const [addressInput, setAddressInput] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");

  // Polygon mode state
  const [selectionMode, setSelectionMode] = useState("radius"); // "radius" | "polygon"
  const [drawMode, setDrawMode] = useState(false);   // actively drawing
  const [polygon, setPolygon] = useState(null);      // committed polygon [[lat,lng],...]

  // Shared UI state
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [highlightGeoId, setHighlightGeoId] = useState(null);
  const [filters, setFilters] = useState({ years: [], types: [], severity: [], involvement: [] });
  const [outOfAreaIds, setOutOfAreaIds] = useState([]);
  const [excludedGeoIds, setExcludedGeoIds] = useState(new Set());
  const [showReport, setShowReport] = useState(false);
  const [savedMsg, setSavedMsg] = useState(""); // "" | "saved" | "loaded" | "error"

  const allYears = useMemo(() => getUniqueYears(collisions), [collisions]);
  const allTypes = useMemo(() => getUniqueTypes(collisions), [collisions]);
  const filteredCollisions = useMemo(() => {
    const filtered = applyFilters(collisions, filters);
    if (excludedGeoIds.size === 0) return filtered;
    return filtered.filter(f => {
      const p = f.properties || {};
      const key = p.Geo_ID || p.Location;
      return !excludedGeoIds.has(key);
    });
  }, [collisions, filters, excludedGeoIds]);

  const resetState = () => {
    setFilters({ years: [], types: [], severity: [], involvement: [] });
    setHighlightGeoId(null);
    setOutOfAreaIds([]);
    setExcludedGeoIds(new Set());
  };

  // After a spatial query, fetch any out-of-area collisions that share a Geo_ID
  // with something already in the result set, then merge them in.
  const expandWithSameLocations = useCallback(async (spatialFeatures) => {
    const geoIds = [...new Set(
      spatialFeatures.map(f => f.properties?.Geo_ID).filter(id => id != null && id !== "")
    )];
    if (geoIds.length === 0) return { features: spatialFeatures, outOfAreaIds: new Set() };
    const extra = await fetchCollisionsByGeoIds(geoIds);
    const outOfAreaIds = buildOutOfAreaIds(spatialFeatures, extra);
    const merged = mergeFeatures(spatialFeatures, extra);
    return { features: merged, outOfAreaIds };
  }, []);

  // ── Load via radius ───────────────────────────────────────────────
  const loadCollisions = useCallback(async (lat, lng, km, restore = null) => {
    setLoading(true);
    setError(null);
    if (restore) {
      // Restoring from saved settings — apply saved state instead of resetting
      setFilters(restore.filters || { years: [], types: [], severity: [], involvement: [] });
      setExcludedGeoIds(new Set(restore.excludedGeoIds || []));
      setHighlightGeoId(null);
      setOutOfAreaIds([]);
    } else {
      resetState();
    }
    try {
      const spatial = await fetchCollisionsNear(lat, lng, km);
      const { features, outOfAreaIds } = await expandWithSameLocations(spatial);
      setCollisions(features);
      setOutOfAreaIds(outOfAreaIds);
    } catch (err) {
      setError(`Failed to load data: ${err.message}`);
      setCollisions([]);
      setOutOfAreaIds([]);
    } finally {
      setLoading(false);
    }
  }, [expandWithSameLocations]); // eslint-disable-line

  // ── Load via polygon ──────────────────────────────────────────────
  const loadCollisionsInPolygon = useCallback(async (poly, restore = null) => {
    setLoading(true);
    setError(null);
    if (restore) {
      setFilters(restore.filters || { years: [], types: [], severity: [], involvement: [] });
      setExcludedGeoIds(new Set(restore.excludedGeoIds || []));
      setHighlightGeoId(null);
      setOutOfAreaIds([]);
    } else {
      resetState();
    }
    try {
      const { minLat, maxLat, minLng, maxLng } = polygonBbox(poly);
      const bbox = await fetchCollisionsInBbox(minLng, minLat, maxLng, maxLat);
      const spatial = bbox.filter(f => {
        const coords = f.geometry?.coordinates;
        if (!coords) return false;
        return pointInPolygon([coords[1], coords[0]], poly);
      });
      const { features, outOfAreaIds } = await expandWithSameLocations(spatial);
      setCollisions(features);
      setOutOfAreaIds(outOfAreaIds);
    } catch (err) {
      setError(`Failed to load data: ${err.message}`);
      setCollisions([]);
      setOutOfAreaIds([]);
    } finally {
      setLoading(false);
    }
  }, [expandWithSameLocations]); // eslint-disable-line

  // ── Save / load settings ─────────────────────────────────────────
  const saveSettings = useCallback(() => {
    try {
      const settings = {
        version: 1,
        savedAt: new Date().toISOString(),
        selectionMode,
        filters,
        excludedGeoIds: [...excludedGeoIds],
        ...(selectionMode === "radius" && searchMarker
          ? { boundary: { type: "radius", lat: searchMarker.lat, lng: searchMarker.lng, radiusKm } }
          : selectionMode === "polygon" && polygon
          ? { boundary: { type: "polygon", vertices: polygon } }
          : {}),
      };
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ottawa-collisions-settings-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSavedMsg("saved");
      setTimeout(() => setSavedMsg(""), 2000);
    } catch { setSavedMsg("error"); setTimeout(() => setSavedMsg(""), 2000); }
  }, [selectionMode, filters, excludedGeoIds, searchMarker, radiusKm, polygon]);

  const loadSettings = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const s = JSON.parse(ev.target.result);
          const restore = {
            filters: s.filters || { years: [], types: [], severity: [], involvement: [] },
            excludedGeoIds: s.excludedGeoIds || [],
          };
          if (s.boundary?.type === "radius") {
            const { lat, lng, radiusKm: km } = s.boundary;
            setSelectionMode("radius");
            setDrawMode(false);
            setPolygon(null);
            setSearchMarker({ lat, lng });
            setRadiusKm(km);
            setRadiusInput(String(Math.round(km * 1000)));
            setLocationLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
            loadCollisions(lat, lng, km, restore);
          } else if (s.boundary?.type === "polygon") {
            const verts = s.boundary.vertices;
            setSelectionMode("polygon");
            setDrawMode(false);
            setPolygon(verts);
            setSearchMarker(null);
            setLocationLabel(`Polygon · ${verts.length} vertices`);
            loadCollisionsInPolygon(verts, restore);
          } else {
            // No boundary — just restore filters/exclusions to current data
            if (s.filters) setFilters(s.filters);
            if (s.excludedGeoIds) setExcludedGeoIds(new Set(s.excludedGeoIds));
          }
          setSavedMsg("loaded");
          setTimeout(() => setSavedMsg(""), 2000);
        } catch { setSavedMsg("error"); setTimeout(() => setSavedMsg(""), 2000); }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [loadCollisions, loadCollisionsInPolygon]); // eslint-disable-line

  // ── Polygon drawn callback ────────────────────────────────────────
  const handlePolygonComplete = useCallback((verts) => {
    setPolygon(verts);
    setDrawMode(false);
    setSearchMarker(null);
    setLocationLabel(`Polygon · ${verts.length} vertices`);
    loadCollisionsInPolygon(verts);
  }, [loadCollisionsInPolygon]);

  const handlePolygonChange = useCallback((verts) => {
    setPolygon(verts);
    setLocationLabel(`Polygon · ${verts.length} vertices`);
    loadCollisionsInPolygon(verts);
  }, [loadCollisionsInPolygon]);

  // ── Switch selection modes ────────────────────────────────────────
  const switchToRadius = () => {
    setSelectionMode("radius");
    setDrawMode(false);
    setPolygon(null);
    setCollisions([]);
    setLocationLabel("");
  };

  const switchToPolygon = () => {
    setSelectionMode("polygon");
    setSearchMarker(null);
    setPolygon(null);
    setCollisions([]);
    setLocationLabel("");
    setDrawMode(true);  // start drawing immediately
  };

  const clearPolygon = () => {
    setPolygon(null);
    setCollisions([]);
    setLocationLabel("");
    setDrawMode(true);  // let them draw a new one
  };

  // Clear mid-draw or committed polygon, reset to blank draw state
  const clearDraw = () => {
    setPolygon(null);
    setCollisions([]);
    setLocationLabel("");
    setDrawMode(false);
    // Brief timeout so drawMode=false clears sketch, then re-enable
    setTimeout(() => setDrawMode(true), 50);
  };

  // ── Radius helpers ────────────────────────────────────────────────
  const applyRadius = (km) => {
    setRadiusKm(km);
    setRadiusInput(String(Math.round(km * 1000)));
    if (searchMarker) loadCollisions(searchMarker.lat, searchMarker.lng, km);
  };

  const handleRadiusCommit = () => {
    const n = parseFloat(radiusInput);
    if (isNaN(n) || n <= 0) { setRadiusInput(String(Math.round(radiusKm * 1000))); return; }
    const km = Math.min(Math.max(n / 1000, 0.05), 20);
    setRadiusKm(km);
    if (searchMarker) loadCollisions(searchMarker.lat, searchMarker.lng, km);
  };

  const handleMapClick = useCallback((lat, lng) => {
    if (selectionMode !== "radius") return;
    setSearchMarker({ lat, lng });
    setLocationLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    loadCollisions(lat, lng, radiusKm);
  }, [selectionMode, radiusKm, loadCollisions]);

  const handleSearch = useCallback(async () => {
    if (!addressInput.trim()) return;
    setGeocoding(true);
    setError(null);
    try {
      const { lat, lng, label } = await geocodeAddress(addressInput);
      setSearchMarker({ lat, lng });
      setLocationLabel(label);
      setSelectionMode("radius");
      setPolygon(null);
      loadCollisions(lat, lng, radiusKm);
    } catch {
      setError("Address not found. Try a more specific Ottawa address or intersection.");
    } finally {
      setGeocoding(false);
    }
  }, [addressInput, radiusKm, loadCollisions]);

  const isCustomRadius = !RADIUS_PRESETS.some(p => p.km === radiusKm);
  const radiusLabel = radiusKm < 1 ? `${Math.round(radiusKm * 1000)}m` : `${radiusKm % 1 === 0 ? radiusKm : radiusKm.toFixed(2)}km`;

  if (showReport) {
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";
    document.getElementById("root").style.overflow = "auto";
    document.getElementById("root").style.height = "auto";

    const boundary = selectionMode === "radius" && searchMarker
      ? { type: "radius", lat: searchMarker.lat, lng: searchMarker.lng, radiusKm }
      : selectionMode === "polygon" && polygon
      ? { type: "polygon", vertices: polygon }
      : null;

    return (
      <ReportPage
        collisions={filteredCollisions}
        locationLabel={locationLabel}
        boundary={boundary}
        onBack={() => {
          document.body.style.overflow = "";
          document.documentElement.style.overflow = "";
          document.getElementById("root").style.overflow = "";
          document.getElementById("root").style.height = "";
          setShowReport(false);
        }}
      />
    );
  }
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  document.getElementById("root").style.overflow = "";
  document.getElementById("root").style.height = "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0d0d1a" }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <header style={{
        background: "#111124", borderBottom: `1px solid ${border}`,
        padding: "10px 18px", display: "flex", alignItems: "center",
        gap: 14, flexShrink: 0, flexWrap: "wrap",
      }}>
        {/* Brand */}
        <div style={{ marginRight: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.07em", color: accent }}>
            CITY OF OTTAWA COLLISIONS (OPEN DATA)
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            value={addressInput}
            onChange={e => setAddressInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Search address or intersection…"
            style={{
              background: "rgba(255,255,255,0.06)", border: `1px solid ${border}`,
              borderRadius: 6, color: "#dce4f0", padding: "7px 12px",
              fontSize: 13, width: 240, outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = accent}
            onBlur={e => e.target.style.borderColor = border}
          />
          <button onClick={handleSearch} disabled={geocoding || loading} style={{
            background: accent, border: "none", borderRadius: 6, color: "#000",
            padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.06em", opacity: geocoding ? 0.7 : 1,
          }}>{geocoding ? "…" : "SEARCH"}</button>

          {/* Save / Load settings */}
          <button onClick={saveSettings} title="Save current boundary, filters and exclusions to browser storage" style={{
            background: "rgba(255,255,255,0.05)", border: `1px solid ${border}`,
            borderRadius: 6, color: savedMsg === "saved" ? "#2ecc71" : "#c8d4e0",
            padding: "6px 12px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
          }}>{savedMsg === "saved" ? "Saved" : "Save Settings"}</button>
          <button onClick={loadSettings} title="Open a saved settings file to restore boundary, filters and exclusions" style={{
            background: "rgba(255,255,255,0.05)", border: `1px solid ${border}`,
            borderRadius: 6, color: savedMsg === "loaded" ? "#2ecc71" : savedMsg === "error" ? "#e74c3c" : "#c8d4e0",
            padding: "6px 12px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
          }}>{savedMsg === "loaded" ? "Loaded" : savedMsg === "error" ? "✕ Invalid file" : "Load Settings"}</button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "3px 4px", border: `1px solid ${border}` }}>
          <button onClick={switchToRadius} style={{
            background: selectionMode === "radius" ? accent : "none",
            border: "none", borderRadius: 4, color: selectionMode === "radius" ? "#000" : "#c8d4e0",
            padding: "4px 10px", fontSize: 11, cursor: "pointer",
            fontWeight: selectionMode === "radius" ? 700 : 400,
          }}>( ) Radius</button>
          <button onClick={selectionMode === "polygon" ? (drawMode ? undefined : clearPolygon) : switchToPolygon} style={{
            background: selectionMode === "polygon" ? (drawMode ? "#2ecc71" : "#f1c40f") : "none",
            border: "none", borderRadius: 4,
            color: selectionMode === "polygon" ? "#000" : "#c8d4e0",
            padding: "4px 10px", fontSize: 11, cursor: "pointer",
            fontWeight: selectionMode === "polygon" ? 700 : 400,
          }}>
            {selectionMode === "polygon" && drawMode ? "+ Drawing…" : "[ ] Polygon"}
          </button>
        </div>

        {/* Radius controls — only in radius mode */}
        {selectionMode === "radius" && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "#9aa8b8", fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif" }}>RADIUS</span>
            {RADIUS_PRESETS.map(({ label, km }) => (
              <button key={km} onClick={() => applyRadius(km)} style={{
                background: !isCustomRadius && radiusKm === km ? accent : "rgba(255,255,255,0.06)",
                border: "none", borderRadius: 4,
                color: !isCustomRadius && radiusKm === km ? "#000" : "#c8d4e0",
                padding: "5px 8px", fontSize: 11, cursor: "pointer",
                fontWeight: !isCustomRadius && radiusKm === km ? 700 : 400,
              }}>{label}</button>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <input
                value={radiusInput}
                onChange={e => setRadiusInput(e.target.value)}
                onBlur={handleRadiusCommit}
                onKeyDown={e => e.key === "Enter" && handleRadiusCommit()}
                placeholder="e.g. 750"
                title="Custom radius in metres"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${isCustomRadius ? accent : border}`,
                  borderRadius: 4, color: "#dce4f0",
                  padding: "4px 6px", fontSize: 11, width: 58,
                  outline: "none", textAlign: "right",
                  fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif",
                }}
                onFocus={e => e.target.style.borderColor = accent}
              />
              <span style={{ fontSize: 10, color: "#9aa8b8" }}>m</span>
            </div>
          </div>
        )}

        {/* Polygon hint + controls */}
        {selectionMode === "polygon" && drawMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 11, color: "#2ecc71", fontFamily: "'Franklin Gothic Book', 'Franklin Gothic Medium', 'ITC Franklin Gothic', 'Arial Narrow', Arial, sans-serif" }}>
              Click to add points · Double-click to finish
            </div>
            <button onClick={clearDraw} style={{
              background: "rgba(231,76,60,0.15)", border: "1px solid rgba(231,76,60,0.4)",
              borderRadius: 4, color: "#e74c3c", padding: "4px 10px",
              fontSize: 11, cursor: "pointer",
            }}>✕ Clear</button>
          </div>
        )}
        {selectionMode === "polygon" && !drawMode && polygon && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={clearDraw} style={{
              background: "none", border: `1px solid ${border}`, borderRadius: 4,
              color: "#c8d4e0", padding: "4px 10px", fontSize: 11, cursor: "pointer",
            }}>~ Redraw</button>
            <button onClick={clearDraw} style={{
              background: "rgba(231,76,60,0.12)", border: "1px solid rgba(231,76,60,0.35)",
              borderRadius: 4, color: "#e74c3c", padding: "4px 10px",
              fontSize: 11, cursor: "pointer",
            }}>✕ Clear</button>
          </div>
        )}
      </header>

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          background: "rgba(231,76,60,0.12)", borderBottom: "1px solid rgba(231,76,60,0.25)",
          padding: "8px 18px", fontSize: 12, color: "#e74c3c",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── Location bar ─────────────────────────────────────────── */}
      {locationLabel && (
        <div style={{
          background: "rgba(0,180,216,0.07)", borderBottom: "1px solid rgba(0,180,216,0.15)",
          padding: "5px 18px", fontSize: 11, color: accent, display: "flex", gap: 12,
        }}>
          <span style={{display:"flex",alignItems:"center",gap:5}}><svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor"><path d="M4 0C2.3 0 1 1.3 1 3c0 2.5 3 6.5 3 6.5s3-4 3-6.5C7 1.3 5.7 0 4 0zm0 4.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>{locationLabel}</span>
          <span style={{ color: "rgba(0,180,216,0.5)" }}>·</span>
          {selectionMode === "radius" && <span>{radiusLabel} radius ·</span>}
          <span><b>{filteredCollisions.length.toLocaleString()}</b> collisions</span>
          {excludedGeoIds.size > 0 && (
            <>
              <span style={{ color: "rgba(0,180,216,0.5)" }}>·</span>
              <span style={{ color: "#e74c3c" }}>{excludedGeoIds.size} location{excludedGeoIds.size !== 1 ? "s" : ""} excluded</span>
            </>
          )}
          {outOfAreaIds.length > 0 && (
            <>
              <span style={{ color: "rgba(0,180,216,0.5)" }}>·</span>
              <span style={{ color: "#f1c40f" }} title="Collisions outside the selected area sharing a location ID with one inside it">
                +{outOfAreaIds.length} out-of-area (same location)
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────────────────── */}
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

      {/* ── Main ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <CollisionMap
            collisions={filteredCollisions}
            onMapClick={handleMapClick}
            searchMarker={selectionMode === "radius" ? searchMarker : null}
            radiusKm={radiusKm}
            showHeatmap={showHeatmap}
            highlightGeoId={highlightGeoId}
            drawMode={drawMode}
            onPolygonComplete={handlePolygonComplete}
            onPolygonChange={handlePolygonChange}
            polygon={selectionMode === "polygon" ? polygon : null}
            outOfAreaIds={new Set(outOfAreaIds)}
          />

          {/* Dot legend */}
          {!showHeatmap && (
            <div style={{
              position: "absolute", bottom: 24, left: 12,
              background: "rgba(13,13,26,0.92)", border: `1px solid ${border}`,
              borderRadius: 8, padding: "10px 14px", fontSize: 11,
              backdropFilter: "blur(4px)", zIndex: 1000,
            }}>
              {[["Fatal","#e74c3c"],["Non-fatal Injury","#e67e22"],["Property Damage Only","#3498db"],["Non-Reportable","#8e44ad"],["Unknown","#95a5a6"]].map(([label, color]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ color: "#c8d4e0" }}>{label}</span>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${border}`, marginTop: 6, paddingTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                  <svg width="11" height="14" viewBox="0 0 11 14" fill="#2ecc71" style={{display:"inline",verticalAlign:"middle",marginRight:6}}><circle cx="5.5" cy="1.5" r="1.5"/><path d="M3 4.5h5l-1 3H8l1 4H6.5l-.5-2-.5 2H4L5 7.5H4L3 4.5z"/></svg><span style={{ color: "#2ecc71" }}>Pedestrian involved</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                  <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="#2ecc71" strokeWidth="1.2" strokeLinecap="round" style={{display:"inline",verticalAlign:"middle",marginRight:6}}><circle cx="2.5" cy="8" r="2.5"/><circle cx="11.5" cy="8" r="2.5"/><path d="M2.5 8 L5 4 L8 5.5 L6 2.5 L9 2.5" strokeWidth="1.1"/><path d="M9 2.5 L11.5 8"/><circle cx="9" cy="2" r="0.9" fill="#2ecc71" stroke="none"/></svg><span style={{ color: "#2ecc71" }}>Cyclist involved</span>
                </div>
                {outOfAreaIds.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                    <div style={{ width: 9, height: 9, borderRadius: "50%", border: "1.5px dashed #f1c40f", flexShrink: 0, opacity: 0.7 }} />
                    <span style={{ color: "#f1c40f" }}>Outside area (same location)</span>
                  </div>
                )}
                <div style={{ color: "#9aa8b8", fontSize: 10 }}>
                  {selectionMode === "radius" ? "Search point · click map to query" : "[ ] Polygon mode active"}
                </div>
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
              <div style={{ fontSize: 10, color: "#9aa8b8", letterSpacing: "0.1em", marginBottom: 8 }}>COLLISION DENSITY</div>
              <div style={{ width: 80, height: 8, borderRadius: 4, background: "linear-gradient(to right, #023e8a, #0077b6, #f1c40f, #e67e22, #e74c3c)", marginBottom: 3 }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#9aa8b8" }}>
                <span>Low</span><span>High</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 9, color: "#9aa8b8" }}>Fatal weighted higher</div>
            </div>
          )}

          {/* Empty state */}
          {!searchMarker && !polygon && !loading && (
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(13,13,26,0.88)", border: `1px solid ${border}`,
              borderRadius: 12, padding: "18px 28px", fontSize: 13,
              color: "#9aa8b8", textAlign: "center", pointerEvents: "none", lineHeight: 2, zIndex: 1000,
            }}>
              {selectionMode === "radius"
                ? <>Click anywhere on the map<br />or search an address above</>
                : <>Click on the map to start drawing<br />Double-click to close the polygon</>
              }
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside style={{
          width: 340, background: "#111124",
          borderLeft: `1px solid ${border}`,
          padding: "14px 12px",
          overflow: "hidden",
          display: "flex", flexDirection: "column", flexShrink: 0,
        }}>
          {filteredCollisions.length > 0 && (
            <button onClick={() => setShowReport(true)} style={{
              background: "linear-gradient(135deg, #1a4fa8, #0d8a6e)",
              border: "none", borderRadius: 7, color: "#fff",
              padding: "9px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", marginBottom: 12, flexShrink: 0,
              letterSpacing: "0.04em", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8,
              boxShadow: "0 2px 12px rgba(29,107,187,0.3)",
            }}>
              Print Report
              <span style={{ opacity: 0.7, fontWeight: 400, fontSize: 11 }}>
                {filteredCollisions.length} collisions · {[...new Set(filteredCollisions.map(f => f.properties?.Geo_ID || f.properties?.Location).filter(Boolean))].length} locations
              </span>
            </button>
          )}
          <StatsPanel
            collisions={filteredCollisions}
            allCollisions={collisions}
            loading={loading}
            onHighlightLocation={setHighlightGeoId}
            highlightGeoId={highlightGeoId}
            excludedGeoIds={excludedGeoIds}
            onExcludedChange={setExcludedGeoIds}
            boundary={
              selectionMode === "radius" && searchMarker
                ? { type: "radius", lat: searchMarker.lat, lng: searchMarker.lng, radiusKm }
                : selectionMode === "polygon" && polygon
                ? { type: "polygon", vertices: polygon }
                : null
            }
          />
        </aside>
      </div>
    </div>
  );
}
