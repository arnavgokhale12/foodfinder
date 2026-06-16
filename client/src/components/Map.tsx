import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { Bounds, Coordinates, Place } from "../types";
import { createPlacePin } from "./PlacePin";

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

interface MapProps {
  places: Place[];
  showUserLocation: boolean;
  userLocation: Coordinates;
  focusedPlace: Place | null;
  pickedPlaceId: string | null;
  recenterTrigger: number;
  savedPlaceIds: string[];
  searchTarget: SearchTarget | null;
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

export function Map({
  places,
  showUserLocation,
  userLocation,
  focusedPlace,
  pickedPlaceId,
  recenterTrigger,
  savedPlaceIds,
  searchTarget,
  travelMode,
  onBoundsChange,
  onPlaceSelect,
  onToggleSaved,
  onZoomGateChange
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const userMarkerRef = useRef<MapLibreMarker | null>(null);
  const initCenterRef = useRef<[number, number]>([userLocation.lng, userLocation.lat]);
  // Always up-to-date ref so the load handler can read the current location
  // without being a dep of the init effect.
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

    const emitBounds = () => {
      const isZoomedIn = map.getZoom() >= MIN_FETCH_ZOOM;
      onZoomGateChange(isZoomedIn);

      if (!isZoomedIn) {
        onBoundsChange(null);
        return;
      }

      const bounds = map.getBounds();
      if (!bounds) {
        return;
      }

      onBoundsChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      });
    };

    map.on("load", () => {
      emitBounds();
      // If real location resolved before the style finished loading,
      // fly there now that the map is ready.
      const loc = userLocationRef.current;
      const [initLng, initLat] = initCenterRef.current;
      if (loc.lat !== initLat || loc.lng !== initLng) {
        map.flyTo({ center: [loc.lng, loc.lat], essential: true, zoom: 13 });
      }
    });
    map.on("moveend", emitBounds);
    map.on("zoomend", emitBounds);

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      userMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
    };
  }, [onBoundsChange, onZoomGateChange]);

  useEffect(() => {
    const map = mapRef.current;
    // Only fly once the style is loaded — calling flyTo on an unready map
    // can throw in MapLibre 5.x and crash the React tree in React 19.
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    try {
      map.flyTo({
        center: [userLocation.lng, userLocation.lat],
        essential: true,
        zoom: Math.max(map.getZoom(), 13)
      });
    } catch {
      // Silently swallow; the load-handler fallback will center the map.
    }
  }, [userLocation.lat, userLocation.lng]);

  useEffect(() => {
    if (recenterTrigger === 0) return; // skip the initial mount value
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
    const map = mapRef.current;
    if (!map || !window.maplibregl) {
      return;
    }

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
  }, [showUserLocation, userLocation.lat, userLocation.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedPlace) {
      return;
    }

    map.flyTo({
      center: [focusedPlace.lng, focusedPlace.lat],
      essential: true,
      zoom: Math.max(map.getZoom(), 15)
    });
  }, [focusedPlace?.id, focusedPlace?.lat, focusedPlace?.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.maplibregl) {
      return;
    }

    const maplibregl = window.maplibregl;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = places.map((place) => {
      const markerElement = createPlacePin(place, {
        isPicked: pickedPlaceId === place.id,
        isSaved: savedPlaceIds.includes(place.id),
        travelMode,
        onSelect: onPlaceSelect,
        onToggleSaved
      });

      return new maplibregl.Marker({ element: markerElement, anchor: "center" })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
    });
  }, [onPlaceSelect, onToggleSaved, pickedPlaceId, places, savedPlaceIds, travelMode]);

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
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">Loading map...</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/55">
            Finding nearby places that are confirmed open right now.
          </p>
        </div>
      </div>
    );
  }

  return <div className="h-full w-full" ref={containerRef} />;
}
