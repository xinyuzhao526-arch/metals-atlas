"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";
import type { PublicProject } from "@/lib/public-data";

type LeafletMap = {
  remove: () => void;
  fitBounds: (points: Array<[number, number]>, options?: Record<string, unknown>) => void;
  setView: (point: [number, number], zoom: number) => void;
};
type LeafletLayer = { addTo: (map: LeafletMap) => LeafletLayer; clearLayers: () => void };
type LeafletMarker = {
  addTo: (layer: LeafletLayer) => LeafletMarker;
  bindTooltip: (html: string, options?: Record<string, unknown>) => LeafletMarker;
  on: (name: string, callback: () => void) => LeafletMarker;
};
type LeafletRuntime = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, options: Record<string, unknown>) => { addTo: (map: LeafletMap) => void };
  layerGroup: () => LeafletLayer;
  circleMarker: (point: [number, number], options: Record<string, unknown>) => LeafletMarker;
};

declare global { interface Window { L?: LeafletRuntime } }

const statusColor: Record<PublicProject["status"], string> = {
  operating: "#357d72",
  development: "#b56f44",
  suspended: "#8f342f",
  closed: "#4f4c48",
  unknown: "#8c8a82",
};

export function ProjectMap({
  projects,
  selectedProjectId,
  eventProjectIds,
  onSelect,
}: {
  projects: PublicProject[];
  selectedProjectId: string | null;
  eventProjectIds: string[];
  onSelect: (projectId: string) => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LeafletLayer | null>(null);

  const renderMarkers = useCallback(() => {
    const runtime = window.L;
    const map = mapRef.current;
    if (!runtime || !map) return;
    markerLayerRef.current?.clearLayers();
    const layer = runtime.layerGroup();
    layer.addTo(map);
    markerLayerRef.current = layer;
    const points: Array<[number, number]> = [];
    projects.forEach((project) => {
      const { latitude, longitude } = project.location;
      if (latitude === null || longitude === null) return;
      const point: [number, number] = [latitude, longitude];
      points.push(point);
      const selected = project.id === selectedProjectId;
      const hasEvent = eventProjectIds.includes(project.id);
      runtime.circleMarker(point, {
        radius: selected ? 8 : 5.5,
        weight: hasEvent ? 4 : selected ? 3 : 1.5,
        color: hasEvent ? "#b34a3d" : selected ? "#202926" : "#f2eee5",
        fillColor: statusColor[project.status],
        fillOpacity: selected ? 1 : 0.88,
        opacity: 1,
      }).addTo(layer)
        .bindTooltip(`<strong>${project.name}</strong><br>${project.country.name_zh} · ${project.location.precision === "approximate" ? "近似定位" : "已定位"}`, { direction: "top" })
        .on("click", () => onSelect(project.id));
    });
    if (selectedProjectId) {
      const selected = projects.find((item) => item.id === selectedProjectId);
      if (selected?.location.latitude != null && selected.location.longitude != null) {
        map.setView([selected.location.latitude, selected.location.longitude], 5);
        return;
      }
    }
    if (points.length > 1) map.fitBounds(points, { padding: [24, 24], maxZoom: 3 });
    else if (points.length === 1) map.setView(points[0], 4);
  }, [eventProjectIds, onSelect, projects, selectedProjectId]);

  const initialize = useCallback(() => {
    if (!window.L || !elementRef.current) return;
    if (!mapRef.current) {
      mapRef.current = window.L.map(elementRef.current, { scrollWheelZoom: false, zoomControl: true });
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(mapRef.current);
    }
    renderMarkers();
  }, [renderMarkers]);

  useEffect(() => { initialize(); }, [initialize]);
  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return <>
    <Script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js" strategy="afterInteractive" onReady={initialize} />
    <div ref={elementRef} className="terminal-map" aria-label={`全球铜项目地图，共 ${projects.length} 个筛选结果`}>
      <div className="map-loading">正在加载公开底图…</div>
    </div>
  </>;
}
