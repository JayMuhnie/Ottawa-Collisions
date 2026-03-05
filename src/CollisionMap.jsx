import { useEffect, useRef } from "react";
import L from "leaflet";
import { OTTAWA_CENTER, SEVERITY_COLORS, severityLabel, collisionTypeLabel, getLatLng, involvementLabel } from "./utils";

export default function CollisionMap({
  collisions, onMapClick, searchMarker, radiusKm,
  showHeatmap, highlightGeoId,
  drawMode, onPolygonComplete, polygon,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const heatLayerRef = useRef(null);
  const searchLayerRef = useRef(null);
  const highlightLayerRef = useRef(null);
  const drawLayerRef = useRef(null);      // committed polygon display
  const sketchLayerRef = useRef(null);    // in-progress vertices/lines

  // Keep mutable draw state in refs (not state, to avoid re-renders mid-draw)
  const drawModeRef = useRef(drawMode);
  const verticesRef = useRef([]);
  const guideLineRef = useRef(null);

  // Keep latest callbacks in refs so map event handlers stay current
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
      doubleClickZoom: false,   // we use dblclick to close polygon
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

    // Single click
    map.on("click", (e) => {
      if (drawModeRef.current) {
        addVertex(map, e.latlng.lat, e.latlng.lng);
      } else {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    // Double-click closes the polygon
    map.on("dblclick", (e) => {
      L.DomEvent.stopPropagation(e);
      if (!drawModeRef.current) return;
      const verts = verticesRef.current;
      if (verts.length < 3) return;
      finishPolygon(map);
    });

    // Mouse move: rubber-band guide line from last vertex to cursor
    map.on("mousemove", (e) => {
      if (!drawModeRef.current || verticesRef.current.length === 0) return;
      if (guideLineRef.current) sketchLayerRef.current.removeLayer(guideLineRef.current);
      const last = verticesRef.current[verticesRef.current.length - 1];
      guideLineRef.current = L.polyline(
        [last, [e.latlng.lat, e.latlng.lng]],
        { color: "#f1c40f", weight: 1.5, opacity: 0.5, dashArray: "4 4" }
      );
      sketchLayerRef.current.addLayer(guideLineRef.current);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line

  // Helpers (need map reference, defined as inner functions)
  const addVertex = (map, lat, lng) => {
    verticesRef.current = [...verticesRef.current, [lat, lng]];
    refreshSketch(map);
  };

  const refreshSketch = (map) => {
    const layer = sketchLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    guideLineRef.current = null;
    const verts = verticesRef.current;
    if (verts.length === 0) return;

    // Lines between placed vertices
    if (verts.length >= 2) {
      layer.addLayer(L.polyline(verts, {
        color: "#f1c40f", weight: 2, dashArray: "5 4", opacity: 0.85,
      }));
    }

    // Vertex dots
    verts.forEach(([lat, lng], i) => {
      const dot = L.circleMarker([lat, lng], {
        radius: i === 0 ? 7 : 5,
        fillColor: i === 0 ? "#2ecc71" : "#f1c40f",
        color: "#fff", weight: 1.5, fillOpacity: 1,
      });
      if (i === 0 && verts.length >= 3) {
        dot.bindTooltip("Double-click to finish", { permanent: true, direction: "top", className: "draw-tip" });
      }
      layer.addLayer(dot);
    });
  };

  const finishPolygon = (map) => {
    const verts = verticesRef.current;
    verticesRef.current = [];
    sketchLayerRef.current?.clearLayers();
    guideLineRef.current = null;
    onPolygonCompleteRef.current(verts);
  };

  // ── Cursor + reset sketch when draw mode toggles ──────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.cursor = drawMode ? "crosshair" : "";
    if (!drawMode) {
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
      color: "#f1c40f",
      fillColor: "#f1c40f",
      fillOpacity: 0.07,
      weight: 2,
      dashArray: "6 4",
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
        const w = sev === "Fatal" ? 1.0 : sev === "Non-fatal Injury" ? 0.6 : 0.3;
        pts.push([pos.lat, pos.lng, w]);
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

        let marker;
        if (hasPed || hasCyc) {
          const emoji = hasPed && hasCyc ? "🚶🚲" : hasPed ? "🚶" : "🚲";
          marker = L.marker([pos.lat, pos.lng], {
            icon: L.divIcon({
              html: `<div style="font-size:${isFatal ? 18 : 14}px;line-height:1;filter:drop-shadow(0 0 3px ${color});">${emoji}</div>`,
              iconSize: [isFatal ? 22 : 18, isFatal ? 22 : 18],
              iconAnchor: [isFatal ? 11 : 9, isFatal ? 11 : 9],
              className: "",
            })
          });
        } else {
          marker = L.circleMarker([pos.lat, pos.lng], {
            radius: isFatal ? 7 : 4,
            fillColor: color, color: isFatal ? "#fff" : color,
            weight: isFatal ? 1.5 : 0.8, opacity: 0.9, fillOpacity: 0.75,
          });
        }
        const involveLine = involvement
          ? `<div style="color:#9b59b6;font-weight:700">👤 ${involvement}</div>` : "";
        marker.bindPopup(`
          <div style="font-family:'Space Mono',monospace;font-size:12px;min-width:200px;line-height:1.8">
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
      <style>{`
        .draw-tip { background: rgba(13,13,26,0.9) !important; border: 1px solid rgba(241,196,15,0.4) !important; color: #f1c40f !important; font-size: 11px !important; }
        .draw-tip::before { border-top-color: rgba(241,196,15,0.4) !important; }
      `}</style>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </>
  );
}
