import type { GeoJSONSource, Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Bounds, Coordinates, Place } from "../types";
import { createPlacePin, type PlacePinHandle } from "./PlacePin";

declare global {
  interface Window {
    maplibregl: typeof import("maplibre-gl");
  }
}

interface SearchTarget {
  lat: number;
  lng: number;
  seq: number;
}

interface EasyFindTarget {
  coords: Array<[number, number]>;
  seq: number;
}

interface MapProps {
  places: Place[];
  showUserLocation: boolean;
  userLocation: Coordinates;
  focusedPlace: Place | null;
  isZoomedIn: boolean;
  pickedPlaceId: string | null;
  recenterTrigger: number;
  savedPlaceIds: string[];
  searchTarget: SearchTarget | null;
  easyFindTarget: EasyFindTarget | null;
  travelMode: "drive" | "walk";
  onBoundsChange: (bounds: Bounds | null) => void;
  onPlaceSelect: (place: Place) => void;
  onToggleSaved: (place: Place) => void;
  onZoomGateChange: (isZoomedIn: boolean) => void;
}

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const hasMapTilerKey = Boolean(MAPTILER_KEY && MAPTILER_KEY !== "placeholder");
const mapStyle = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY ?? ""}`;

const MIN_FETCH_ZOOM = 13;
const CLUSTER_LAYERS = ["ff-cluster-bg", "ff-cluster-count", "ff-cluster-dot"] as const;

export function Map({
  places,
  showUserLocation,
  userLocation,
  focusedPlace,
  isZoomedIn,
  pickedPlaceId,
  recenterTrigger,
  savedPlaceIds,
  searchTarget,
  easyFindTarget,
  travelMode,
  onBoundsChange,
  onPlaceSelect,
  onToggleSaved,
  onZoomGateChange
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // globalThis.Map avoids shadowing by the exported Map component
  const markerHandleMapRef = useRef<globalThis.Map<string, { marker: MapLibreMarker; handle: PlacePinHandle }>>(new globalThis.Map());
  const lastKnownPlacesRef = useRef<Place[]>([]);
  const userMarkerRef = useRef<MapLibreMarker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const initCenterRef = useRef<[number, number]>([userLocation.lng, userLocation.lat]);
  // Always up-to-date so the load handler can read current location without being a dep of the init effect.
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasMapTilerKey || !window.maplibregl) {
      return;
    }

    const maplibregl = window.maplibregl;
    const map = new maplibregl.Map({
      center: initCenterRef.current,
      container: containerRef.current,
      style: mapStyle,
      zoom: 13
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;
    setMapReady(true);

    const emitBounds = () => {
      const zoomed = map.getZoom() >= MIN_FETCH_ZOOM;
      onZoomGateChange(zoomed);

      if (!zoomed) {
        onBoundsChange(null);
        return;
      }

      const bounds = map.getBounds();
      if (!bounds) return;

      onBoundsChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      });
    };

    map.on("load", () => {
      emitBounds();

      // Fly to real location if GPS resolved before style loaded.
      const loc = userLocationRef.current;
      const [initLng, initLat] = initCenterRef.current;
      if (loc.lat !== initLat || loc.lng !== initLng) {
        map.flyTo({ center: [loc.lng, loc.lat], essential: true, zoom: 13 });
      }

      // GeoJSON cluster source for low-zoom density view
      map.addSource("ff-clusters", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 12
      });

      map.addLayer({
        id: "ff-cluster-bg",
        type: "circle",
        source: "ff-clusters",
        filter: ["has", "point_count"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": "#22c55e",
          "circle-opacity": 0.6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(34,197,94,0.25)",
          "circle-radius": ["step", ["get", "point_count"], 18, 5, 26, 20, 36]
        }
      });

      map.addLayer({
        id: "ff-cluster-count",
        type: "symbol",
        source: "ff-clusters",
        filter: ["has", "point_count"],
        layout: {
          visibility: "none",
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"]
        },
        paint: { "text-color": "#000" }
      });

      map.addLayer({
        id: "ff-cluster-dot",
        type: "circle",
        source: "ff-clusters",
        filter: ["!", ["has", "point_count"]],
        layout: { visibility: "none" },
        paint: {
          "circle-color": "#22c55e",
          "circle-opacity": 0.55,
          "circle-radius": 5
        }
      });
    });

    map.on("moveend", emitBounds);
    map.on("zoomend", emitBounds);

    return () => {
      for (const { marker } of markerHandleMapRef.current.values()) {
        marker.remove();
      }
      markerHandleMapRef.current.clear();
      userMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      setMapReady(false);
    };
  }, [onBoundsChange, onZoomGateChange]);

  // Recenter on user location when it first resolves
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      map.flyTo({ center: [userLocation.lng, userLocation.lat], essential: true, zoom: Math.max(map.getZoom(), 13) });
    } catch { /* style not loaded yet — load handler will fly */ }
  }, [userLocation.lat, userLocation.lng]);

  useEffect(() => {
    if (recenterTrigger === 0) return;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      map.flyTo({ center: [userLocation.lng, userLocation.lat], essential: true, zoom: Math.max(map.getZoom(), 13) });
    } catch { /* ignore */ }
  }, [recenterTrigger, userLocation.lat, userLocation.lng]);

  useEffect(() => {
    if (!searchTarget) return;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      map.flyTo({ center: [searchTarget.lng, searchTarget.lat], essential: true, zoom: 14 });
    } catch { /* ignore */ }
  }, [searchTarget]);

  useEffect(() => {
    if (!easyFindTarget) return;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const lngs = easyFindTarget.coords.map((c) => c[0]);
    const lats = easyFindTarget.coords.map((c) => c[1]);
    try {
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: { top: 80, bottom: 320, left: 60, right: 60 }, maxZoom: 15, essential: true }
      );
    } catch { /* ignore */ }
  }, [easyFindTarget]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.maplibregl) return;

    if (!showUserLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    if (!userMarkerRef.current) {
      const dot = document.createElement("span");
      dot.className = "ff-user-location-dot";
      userMarkerRef.current = new window.maplibregl.Marker({ element: dot, anchor: "center" })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [mapReady, showUserLocation, userLocation.lat, userLocation.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedPlace) return;
    map.flyTo({ center: [focusedPlace.lng, focusedPlace.lat], essential: true, zoom: Math.max(map.getZoom(), 15) });
  }, [focusedPlace?.id, focusedPlace?.lat, focusedPlace?.lng]);

  // Marker diff: add new, update existing, remove stale — no wholesale teardown
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.maplibregl) return;

    const currentIds = new Set(places.map((p) => p.id));

    // Remove markers no longer in the result set
    for (const [id, { marker }] of markerHandleMapRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        markerHandleMapRef.current.delete(id);
      }
    }

    // Add or update
    for (const place of places) {
      const state = {
        isPicked: pickedPlaceId === place.id,
        isSaved: savedPlaceIds.includes(place.id),
        travelMode
      };

      const existing = markerHandleMapRef.current.get(place.id);
      if (existing) {
        existing.handle.update(place, state);
      } else {
        const handle = createPlacePin(place, { ...state, onSelect: onPlaceSelect, onToggleSaved });
        const marker = new window.maplibregl.Marker({ element: handle.element, anchor: "center" })
          .setLngLat([place.lng, place.lat])
          .addTo(map);
        markerHandleMapRef.current.set(place.id, { marker, handle });
      }
    }

    // Keep last-known places for the cluster layer (persists when zoomed out)
    if (places.length > 0) lastKnownPlacesRef.current = places;

    const source = map.isStyleLoaded() ? (map.getSource("ff-clusters") as GeoJSONSource | undefined) : undefined;
    if (source) {
      source.setData({
        type: "FeatureCollection",
        features: lastKnownPlacesRef.current.map((p) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
          properties: {}
        }))
      });
    }
  }, [onPlaceSelect, onToggleSaved, pickedPlaceId, places, savedPlaceIds, travelMode]);

  // Toggle cluster layer visibility based on zoom level
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = isZoomedIn ? "none" : "visible";
    for (const layerId of CLUSTER_LAYERS) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", vis);
      }
    }
  }, [isZoomedIn, mapReady]);

  if (!hasMapTilerKey) {
    return (
      <div className="relative grid h-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_28%,rgba(190,242,100,0.16),transparent_34%),radial-gradient(circle_at_10%_80%,rgba(34,197,94,0.08),transparent_30%),linear-gradient(145deg,#030406,#0d1117_54%,#020304)] px-6 text-center">
        <div className="absolute inset-x-10 top-1/4 h-px bg-gradient-to-r from-transparent via-lime-200/20 to-transparent" />
        <div className="absolute -bottom-32 h-72 w-72 rounded-full border border-lime-200/10 bg-lime-300/5 blur-3xl" />
        <div className="relative flex max-w-md flex-col items-center">
          <div className="relative mb-8 grid h-24 w-24 place-items-center">
            <div className="absolute inset-0 rounded-full border border-lime-200/25 bg-lime-300/10 animate-splash-pulse" />
            <div className="absolute inset-4 rounded-full border border-white/10 bg-black/50 backdrop-blur-xl" />
            <div className="relative h-4 w-4 rounded-full bg-lime-300 shadow-[0_0_34px_rgba(190,242,100,0.72)]" />
          </div>
          <p className="text-sm font-black uppercase tracking-[0.32em] text-lime-200/80">FoodFinder</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">Map not configured</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/55">
            A MapTiler API key is required. Set <code className="rounded bg-white/10 px-1 font-mono text-white/80">VITE_MAPTILER_KEY</code> and redeploy.
          </p>
        </div>
      </div>
    );
  }

  return <div className="h-full w-full" ref={containerRef} />;
}
