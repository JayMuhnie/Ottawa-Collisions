import { useEffect, useRef } from "react";
import L from "leaflet";
import { OTTAWA_CENTER, SEVERITY_COLORS, severityLabel, collisionTypeLabel, getLatLng, involvementLabel } from "./utils";

export default function CollisionMap({
  collisions, onMapClick, searchMarker, radiusKm,
  showHeatmap, highlightGeoId,
  drawMode, onPolygonComplete, polygon,
  outOfAreaIds,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const heatLayerRef = useRef(null);
  const searchLayerRef = useRef(null);
  const highlightLayerRef = useRef(null);
  const drawLayerRef = useRef(null);
  const sketchLayerRef = useRef(null);

  // Draw state — all in refs to avoid stale closures in map event handlers
  const drawModeRef = useRef(drawMode);
  const verticesRef = useRef([]);
  const guideLineRef = useRef(null);
  const clickTimerRef = useRef(null);   // debounce single vs double click

  const onPolygonCompleteRef = useRef(onPolygonComplete);
  const onMapClickRef = useRef(onMapClick);

  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { onPolygonCompleteRef.current = onPolygonComplete; }, [onPolygonComplete]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  // ── Init map once ─────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [OTTAWA_CENTER.lat, OTTAWA_CENTER.lng],
      zoom: 13,
      doubleClickZoom: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap © CARTO",
      maxZoom: 19,
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    searchLayerRef.current = L.layerGroup().addTo(map);
    highlightLayerRef.current = L.layerGroup().addTo(map);
    drawLayerRef.current = L.layerGroup().addTo(map);
    sketchLayerRef.current = L.layerGroup().addTo(map);

    // ── Click: debounced so dblclick can cancel it ─────────────────
    map.on("click", (e) => {
      if (!drawModeRef.current) {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
        return;
      }
      // Debounce: wait 220ms — if dblclick fires, this timer gets cleared
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        verticesRef.current = [...verticesRef.current, [lat, lng]];
        refreshSketch(map, sketchLayerRef.current, verticesRef.current, guideLineRef);
      }, 220);
    });

    // ── Double-click: cancel pending single click, close polygon ───
    map.on("dblclick", (e) => {
      L.DomEvent.stopPropagation(e);
      if (!drawModeRef.current) return;
      // Cancel the pending single-click vertex add
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      const verts = verticesRef.current;
      if (verts.length < 3) return;
      // Clear sketch
      sketchLayerRef.current.clearLayers();
      guideLineRef.current = null;
      const completed = [...verts];
      verticesRef.current = [];
      onPolygonCompleteRef.current(completed);
    });

    // ── Mouse move: guide line from last vertex to cursor ──────────
    map.on("mousemove", (e) => {
      if (!drawModeRef.current || verticesRef.current.length === 0) return;
      const sketch = sketchLayerRef.current;
      if (guideLineRef.current) sketch.removeLayer(guideLineRef.current);
      const last = verticesRef.current[verticesRef.current.length - 1];
      guideLineRef.current = L.polyline(
        [last, [e.latlng.lat, e.latlng.lng]],
        { color: "#f1c40f", weight: 1.5, opacity: 0.45, dashArray: "4 5" }
      );
      sketch.addLayer(guideLineRef.current);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line

  // ── Cursor + reset when draw mode changes ─────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.cursor = drawMode ? "crosshair" : "";
    if (!drawMode) {
      if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
      verticesRef.current = [];
      sketchLayerRef.current?.clearLayers();
      guideLineRef.current = null;
    }
  }, [drawMode]);

  // ── Committed polygon display ─────────────────────────────────────
  useEffect(() => {
    if (!drawLayerRef.current) return;
    drawLayerRef.current.clearLayers();
    if (!polygon || polygon.length < 3) return;
    drawLayerRef.current.addLayer(L.polygon(polygon, {
      color: "#f1c40f", fillColor: "#f1c40f",
      fillOpacity: 0.07, weight: 2, dashArray: "6 4",
    }));
    polygon.forEach(([lat, lng]) => {
      drawLayerRef.current.addLayer(L.circleMarker([lat, lng], {
        radius: 4, fillColor: "#f1c40f", color: "#fff", weight: 1.5, fillOpacity: 1,
      }));
    });
  }, [polygon]);

  // ── Leaflet.heat ──────────────────────────────────────────────────
  useEffect(() => {
    if (window.L?.heatLayer) return;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js";
    document.head.appendChild(s);
  }, []);

  // ── Collision markers / heatmap ───────────────────────────────────
  useEffect(() => {
    if (!layerGroupRef.current || !mapRef.current) return;
    layerGroupRef.current.clearLayers();
    if (heatLayerRef.current) { mapRef.current.removeLayer(heatLayerRef.current); heatLayerRef.current = null; }

    if (showHeatmap) {
      const pts = [];
      collisions.forEach(f => {
        const pos = getLatLng(f);
        if (!pos) return;
        const sev = severityLabel((f.properties || {}).Classification_Of_Accident);
        pts.push([pos.lat, pos.lng, sev === "Fatal" ? 1.0 : sev === "Non-fatal Injury" ? 0.6 : 0.3]);
      });
      const buildHeat = () => {
        if (window.L?.heatLayer && pts.length > 0) {
          heatLayerRef.current = window.L.heatLayer(pts, {
            radius: 22, blur: 18, maxZoom: 17,
            gradient: { 0.2: "#023e8a", 0.4: "#0077b6", 0.6: "#f1c40f", 0.8: "#e67e22", 1.0: "#e74c3c" },
          }).addTo(mapRef.current);
        }
      };
      buildHeat();
      if (!heatLayerRef.current) setTimeout(buildHeat, 1000);
    } else {
      collisions.slice(0, 2000).forEach((feature) => {
        const pos = getLatLng(feature);
        if (!pos) return;
        const p = feature.properties || {};
        const sev = severityLabel(p.Classification_Of_Accident);
        const color = SEVERITY_COLORS[sev] || "#95a5a6";
        const isFatal = sev === "Fatal";
        const involvement = involvementLabel(p);
        const hasPed = involvement?.includes("Pedestrian");
        const hasCyc = involvement?.includes("Cyclist");
        const isOutOfArea = outOfAreaIds?.has(p.OBJECTID);

        let marker;
        if (hasPed || hasCyc) {
          const emoji = hasPed && hasCyc ? "🚶🚲" : hasPed ? "🚶" : "🚲";
          marker = L.marker([pos.lat, pos.lng], {
            icon: L.divIcon({
              html: `<div style="font-size:${isFatal ? 18 : 14}px;line-height:1;filter:drop-shadow(0 0 3px ${color});opacity:${isOutOfArea ? 0.5 : 1};">${emoji}</div>`,
              iconSize: [isFatal ? 22 : 18, isFatal ? 22 : 18],
              iconAnchor: [isFatal ? 11 : 9, isFatal ? 11 : 9],
              className: "",
            })
          });
        } else {
          marker = L.circleMarker([pos.lat, pos.lng], {
            radius: isFatal ? 7 : 4,
            fillColor: color,
            color: isOutOfArea ? "#f1c40f" : (isFatal ? "#fff" : color),
            weight: isOutOfArea ? 1.5 : (isFatal ? 1.5 : 0.8),
            opacity: isOutOfArea ? 0.7 : 0.9,
            fillOpacity: isOutOfArea ? 0.3 : 0.75,
            dashArray: isOutOfArea ? "3 3" : null,
          });
        }
        const outOfAreaLine = isOutOfArea
          ? `<div style="color:#f1c40f;font-size:10px;margin-bottom:2px">⚠ Outside selected area</div>` : "";
        const involveLine = involvement
          ? `<div style="color:#9b59b6;font-weight:700">👤 ${involvement}</div>` : "";
        marker.bindPopup(`
          <div style="font-family:'Space Mono',monospace;font-size:12px;min-width:200px;line-height:1.8">
            ${outOfAreaLine}
            <div style="color:${color};font-weight:700;font-size:13px;margin-bottom:4px">${sev}</div>
            <div>📅 ${p.Accident_Date || "N/A"}</div>
            <div>🛣 ${p.Location || "N/A"}</div>
            <div>💥 ${collisionTypeLabel(p.Initial_Impact_Type)}</div>
            ${involveLine}
            <div>🌧 ${p.Environment_Condition_1 || "N/A"}</div>
            <div>🛤 ${p.Road_1_Surface_Condition || "N/A"}</div>
          </div>
        `);
        layerGroupRef.current.addLayer(marker);
      });
    }
  }, [collisions, showHeatmap]);

  // ── Highlight repeat location ─────────────────────────────────────
  useEffect(() => {
    if (!highlightLayerRef.current) return;
    highlightLayerRef.current.clearLayers();
    if (!highlightGeoId || !mapRef.current) return;
    const matching = collisions.filter(f => {
      const p = f.properties || {};
      return p.Geo_ID === highlightGeoId || p.Location === highlightGeoId;
    });
    matching.forEach(f => {
      const pos = getLatLng(f);
      if (!pos) return;
      const sev = severityLabel((f.properties || {}).Classification_Of_Accident);
      L.circleMarker([pos.lat, pos.lng], {
        radius: 10, fillColor: SEVERITY_COLORS[sev] || "#95a5a6",
        color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.95,
      }).addTo(highlightLayerRef.current);
    });
    if (matching.length > 0) {
      const pos = getLatLng(matching[0]);
      if (pos) mapRef.current.setView([pos.lat, pos.lng], 16, { animate: true });
    }
  }, [highlightGeoId, collisions]);

  // ── Search marker + radius circle ─────────────────────────────────
  useEffect(() => {
    if (!searchLayerRef.current) return;
    searchLayerRef.current.clearLayers();
    if (!searchMarker) return;
    const { lat, lng } = searchMarker;
    L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div style="width:14px;height:14px;background:#f1c40f;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px 3px rgba(241,196,15,0.5)"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7], className: "",
      })
    }).addTo(searchLayerRef.current);
    L.circle([lat, lng], {
      radius: radiusKm * 1000,
      color: "#f1c40f", fillColor: "#f1c40f",
      fillOpacity: 0.04, weight: 1.5, dashArray: "6 5",
    }).addTo(searchLayerRef.current);
    mapRef.current?.setView([lat, lng], Math.max(mapRef.current.getZoom(), 14), { animate: true });
  }, [searchMarker, radiusKm]);

  return (
    <>
      <style>{`.draw-tip { background: rgba(13,13,26,0.9) !important; border: 1px solid rgba(241,196,15,0.4) !important; color: #f1c40f !important; font-size: 11px !important; }`}</style>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </>
  );
}

// ── Pure helper: redraw in-progress sketch ────────────────────────────
function refreshSketch(map, layer, verts, guideLineRef) {
  if (!layer) return;
  // Remove everything except the guide line
  layer.eachLayer(l => {
    if (l !== guideLineRef.current) layer.removeLayer(l);
  });

  if (verts.length === 0) return;

  // Lines between placed vertices
  if (verts.length >= 2) {
    layer.addLayer(L.polyline(verts, {
      color: "#f1c40f", weight: 2, dashArray: "5 4", opacity: 0.85,
    }));
  }

  // Vertex dots
  verts.forEach(([lat, lng], i) => {
    const isFirst = i === 0;
    const dot = L.circleMarker([lat, lng], {
      radius: isFirst ? 7 : 5,
      fillColor: isFirst ? "#2ecc71" : "#f1c40f",
      color: "#fff", weight: 1.5, fillOpacity: 1,
    });
    if (isFirst && verts.length >= 3) {
      dot.bindTooltip("Double-click to finish", {
        permanent: true, direction: "top", className: "draw-tip",
      });
    }
    layer.addLayer(dot);
  });
}
