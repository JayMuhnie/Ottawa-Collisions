import { useEffect, useRef } from "react";
import L from "leaflet";
import { OTTAWA_CENTER, SEVERITY_COLORS, severityLabel, collisionTypeLabel, getLatLng, involvementLabel } from "./utils";

export default function CollisionMap({
  collisions, onMapClick, searchMarker, radiusKm,
  showHeatmap, highlightGeoId
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const heatLayerRef = useRef(null);
  const searchLayerRef = useRef(null);
  const highlightLayerRef = useRef(null);

  // Init map once
  useEffect(() => {
    if (mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [OTTAWA_CENTER.lat, OTTAWA_CENTER.lng],
      zoom: 12,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    layerGroupRef.current = L.layerGroup().addTo(map);
    searchLayerRef.current = L.layerGroup().addTo(map);
    highlightLayerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e) => onMapClick(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line

  // Load Leaflet.heat plugin dynamically
  useEffect(() => {
    if (window.L && window.L.heatLayer) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js";
    document.head.appendChild(script);
  }, []);

  // Update collision markers or heatmap
  useEffect(() => {
    if (!layerGroupRef.current || !mapRef.current) return;
    layerGroupRef.current.clearLayers();
    if (heatLayerRef.current) {
      mapRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (showHeatmap) {
      // Build heatmap — weight fatal higher
      const points = [];
      collisions.forEach(f => {
        const pos = getLatLng(f);
        if (!pos) return;
        const sev = severityLabel((f.properties || {}).Classification_Of_Accident);
        const weight = sev === "Fatal" ? 1.0 : sev === "Non-fatal Injury" ? 0.6 : 0.3;
        points.push([pos.lat, pos.lng, weight]);
      });

      if (window.L && window.L.heatLayer && points.length > 0) {
        heatLayerRef.current = window.L.heatLayer(points, {
          radius: 22,
          blur: 18,
          maxZoom: 17,
          gradient: { 0.2: "#023e8a", 0.4: "#0077b6", 0.6: "#f1c40f", 0.8: "#e67e22", 1.0: "#e74c3c" },
        }).addTo(mapRef.current);
      } else {
        // Retry after plugin loads
        setTimeout(() => {
          if (window.L && window.L.heatLayer && points.length > 0) {
            heatLayerRef.current = window.L.heatLayer(points, {
              radius: 22, blur: 18, maxZoom: 17,
              gradient: { 0.2: "#023e8a", 0.4: "#0077b6", 0.6: "#f1c40f", 0.8: "#e67e22", 1.0: "#e74c3c" },
            }).addTo(mapRef.current);
          }
        }, 1000);
      }
    } else {
      // Dot markers
      collisions.slice(0, 2000).forEach((feature) => {
        const pos = getLatLng(feature);
        if (!pos) return;
        const p = feature.properties || {};
        const sev = severityLabel(p.Classification_Of_Accident);
        const color = SEVERITY_COLORS[sev] || "#95a5a6";
        const isFatal = sev === "Fatal";
        const involvement = involvementLabel(p);
        const hasPed = involvement && involvement.includes("Pedestrian");
        const hasCyc = involvement && involvement.includes("Cyclist");

        // Use a special icon for pedestrian/cyclist collisions
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
            fillColor: color,
            color: isFatal ? "#fff" : color,
            weight: isFatal ? 1.5 : 0.8,
            opacity: 0.9,
            fillOpacity: 0.75,
          });
        }
        const involveLine = involvement
          ? `<div style="color:#9b59b6;font-weight:700">👤 ${involvement}</div>`
          : "";
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

  // Highlight a specific repeat location
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
      const p = f.properties || {};
      const sev = severityLabel(p.Classification_Of_Accident);
      const color = SEVERITY_COLORS[sev] || "#95a5a6";
      L.circleMarker([pos.lat, pos.lng], {
        radius: 10,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95,
      }).addTo(highlightLayerRef.current);
    });

    if (matching.length > 0) {
      const pos = getLatLng(matching[0]);
      if (pos) mapRef.current.setView([pos.lat, pos.lng], 16, { animate: true });
    }
  }, [highlightGeoId, collisions]);

  // Search marker + radius circle
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

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
