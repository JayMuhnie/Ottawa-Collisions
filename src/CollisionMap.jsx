import { useEffect, useRef } from "react";
import L from "leaflet";
import { OTTAWA_CENTER, SEVERITY_COLORS, severityLabel, collisionTypeLabel, getLatLng } from "./utils";

export default function CollisionMap({ collisions, onMapClick, searchMarker, radiusKm }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const searchLayerRef = useRef(null);

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
    map.on("click", (e) => onMapClick(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!layerGroupRef.current) return;
    layerGroupRef.current.clearLayers();
    collisions.slice(0, 2000).forEach((feature) => {
      const pos = getLatLng(feature);
      if (!pos) return;
      const p = feature.properties || {};
      const sev = severityLabel(p.Classification_Of_Accident);
      const color = SEVERITY_COLORS[sev] || "#95a5a6";
      const isFatal = sev === "Fatal";
      const marker = L.circleMarker([pos.lat, pos.lng], {
        radius: isFatal ? 7 : 4,
        fillColor: color,
        color: isFatal ? "#fff" : color,
        weight: isFatal ? 1.5 : 0.8,
        opacity: 0.9,
        fillOpacity: 0.75,
      });
      marker.bindPopup(`
        <div style="font-family:'Space Mono',monospace;font-size:12px;min-width:200px;line-height:1.8">
          <div style="color:${color};font-weight:700;font-size:13px;margin-bottom:4px">${sev}</div>
          <div>📅 ${p.Accident_Date || "N/A"}</div>
          <div>🛣 ${p.Location || "N/A"}</div>
          <div>💥 ${collisionTypeLabel(p.Initial_Impact_Type)}</div>
          <div>🌧 ${p.Environment_Condition_1 || "N/A"}</div>
          <div>🛤 ${p.Road_1_Surface_Condition || "N/A"}</div>
        </div>
      `);
      layerGroupRef.current.addLayer(marker);
    });
  }, [collisions]);

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
