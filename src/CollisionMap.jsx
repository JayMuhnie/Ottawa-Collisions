import { useEffect, useRef } from "react";
import L from "leaflet";
import { OTTAWA_CENTER, SEVERITY_COLORS, severityLabel, collisionTypeLabel } from "./utils";

export default function CollisionMap({ collisions, onMapClick, searchMarker, radiusKm }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const searchLayerRef = useRef(null);

  // Init map once
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [OTTAWA_CENTER.lat, OTTAWA_CENTER.lng],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    searchLayerRef.current = L.layerGroup().addTo(map);

    map.on("click", (e) => onMapClick(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line

  // Update collision markers
  useEffect(() => {
    if (!layerGroupRef.current) return;
    layerGroupRef.current.clearLayers();

    collisions.slice(0, 2000).forEach((c) => {
      const lat = c.geometry?.y ?? c.attributes?.LATITUDE;
      const lng = c.geometry?.x ?? c.attributes?.LONGITUDE;
      if (!lat || !lng) return;

      const a = c.attributes || {};
      const sev = severityLabel(a.COLLISION_CLASSIFICATION || a.SEVERITY);
      const color = SEVERITY_COLORS[sev] || "#95a5a6";
      const isFatal = sev === "Fatal";

      const marker = L.circleMarker([lat, lng], {
        radius: isFatal ? 7 : 4,
        fillColor: color,
        color: isFatal ? "#fff" : color,
        weight: isFatal ? 1.5 : 0.8,
        opacity: 0.9,
        fillOpacity: 0.75,
      });

      const date = a.COLLISION_DATE || a.DATE || "N/A";
      const road = a.LOCATION || a.ROAD_NAME || a.STREET1 || "N/A";
      const type = collisionTypeLabel(a.COLLISION_TYPE || a.IMPACT_TYPE);
      const env = a.ENVIRONMENT || a.WEATHER || a.ROAD_SURFACE || "N/A";

      marker.bindPopup(`
        <div style="font-family:'Space Mono',monospace;font-size:12px;min-width:190px;line-height:1.7">
          <div style="color:${color};font-weight:700;font-size:13px;margin-bottom:6px">${sev}</div>
          <div>📅 ${date}</div>
          <div>🛣 ${road}</div>
          <div>💥 ${type}</div>
          <div>🌧 ${env}</div>
        </div>
      `);

      layerGroupRef.current.addLayer(marker);
    });
  }, [collisions]);

  // Update search marker + radius circle
  useEffect(() => {
    if (!searchLayerRef.current) return;
    searchLayerRef.current.clearLayers();

    if (!searchMarker) return;
    const { lat, lng } = searchMarker;

    const pulseIcon = L.divIcon({
      html: `<div style="width:14px;height:14px;background:#f1c40f;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px 3px rgba(241,196,15,0.5)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      className: "",
    });
    L.marker([lat, lng], { icon: pulseIcon }).addTo(searchLayerRef.current);

    L.circle([lat, lng], {
      radius: radiusKm * 1000,
      color: "#f1c40f",
      fillColor: "#f1c40f",
      fillOpacity: 0.04,
      weight: 1.5,
      dashArray: "6 5",
    }).addTo(searchLayerRef.current);

    mapRef.current?.setView([lat, lng], Math.max(mapRef.current.getZoom(), 14), { animate: true });
  }, [searchMarker, radiusKm]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
