import { useCallback, useEffect, useRef, useState } from "react";
import type { Bounds, Coordinates, Place, ServerPlaceType } from "../types";

interface UsePlacesArgs {
  bounds: Bounds | null;
  enabled: boolean;
  filter: ServerPlaceType;
  userLocation: Coordinates;
  travelMode: "drive" | "walk";
}

interface CacheEntry {
  places: Place[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const EXPAND_FACTOR = 1.25;
const viewportCache = new Map<string, CacheEntry>();
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

function expandBounds(b: Bounds): Bounds {
  const dLat = (b.north - b.south) * (EXPAND_FACTOR - 1) / 2;
  const dLng = (b.east - b.west) * (EXPAND_FACTOR - 1) / 2;
  return { north: b.north + dLat, south: b.south - dLat, east: b.east + dLng, west: b.west - dLng };
}

function quantizeBounds(b: Bounds): Bounds {
  return {
    north: Math.ceil(b.north * 100) / 100,
    south: Math.floor(b.south * 100) / 100,
    east: Math.ceil(b.east * 100) / 100,
    west: Math.floor(b.west * 100) / 100,
  };
}

function withinBbox(vp: Bounds, bbox: Bounds): boolean {
  return (
    vp.north <= bbox.north + 0.005 &&
    vp.south >= bbox.south - 0.005 &&
    vp.east <= bbox.east + 0.005 &&
    vp.west >= bbox.west - 0.005
  );
}

function makeCacheKey(b: Bounds, type: ServerPlaceType, travelMode: string, userLat: number, userLng: number) {
  // Quantize user location to ~1 km so minor GPS jitter reuses the cache
  const uLat = Math.round(userLat * 100) / 100;
  const uLng = Math.round(userLng * 100) / 100;
  return `${b.north},${b.south},${b.east},${b.west},${type},${travelMode},${uLat},${uLng}`;
}

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of viewportCache) {
    if (now - v.timestamp >= CACHE_TTL_MS) viewportCache.delete(k);
  }
}

export function usePlaces({ bounds, enabled, filter, userLocation, travelMode }: UsePlacesArgs) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const lastFetchRef = useRef<{
    expandedBounds: Bounds;
    filter: ServerPlaceType;
    travelMode: string;
    userLat: number;
    userLng: number;
  } | null>(null);
  const hasDataRef = useRef(false);
  const forceRef = useRef(false);

  const retry = useCallback(() => {
    setError(null);
    forceRef.current = true;
    setRetryNonce((n) => n + 1);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!bounds || !enabled) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const force = forceRef.current;
    forceRef.current = false;

    // Skip refetch if still inside the last expanded bbox with the same params
    const lf = lastFetchRef.current;
    if (
      !force &&
      lf &&
      lf.filter === filter &&
      lf.travelMode === travelMode &&
      Math.abs(lf.userLat - userLocation.lat) < 0.005 &&
      Math.abs(lf.userLng - userLocation.lng) < 0.005 &&
      withinBbox(bounds, lf.expandedBounds)
    ) {
      return;
    }

    const expanded = expandBounds(bounds);
    const quantized = quantizeBounds(expanded);
    const cacheKey = makeCacheKey(quantized, filter, travelMode, userLocation.lat, userLocation.lng);

    pruneCache();
    const cached = viewportCache.get(cacheKey);

    // Fresh cache hit — no network call needed
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setPlaces(cached.places);
      if (cached.places.length > 0) hasDataRef.current = true;
      lastFetchRef.current = {
        expandedBounds: expanded,
        filter,
        travelMode,
        userLat: userLocation.lat,
        userLng: userLocation.lng,
      };
      setIsLoading(false);
      setIsRefreshing(false);
      setError(null);
      return;
    }

    // Show stale data immediately while background-fetching
    if (cached && cached.places.length > 0) {
      setPlaces(cached.places);
      hasDataRef.current = true;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (!hasDataRef.current) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      const params = new URLSearchParams({
        north: String(quantized.north),
        south: String(quantized.south),
        east: String(quantized.east),
        west: String(quantized.west),
        type: filter,
        userLat: String(userLocation.lat),
        userLng: String(userLocation.lng),
        mode: travelMode,
      });

      try {
        const response = await fetch(`${API_BASE_URL}/api/places?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Places request failed (${response.status})`);

        const data = (await response.json()) as { places: Place[] };
        viewportCache.set(cacheKey, { places: data.places, timestamp: Date.now() });
        lastFetchRef.current = {
          expandedBounds: expanded,
          filter,
          travelMode,
          userLat: userLocation.lat,
          userLng: userLocation.lng,
        };
        setPlaces(data.places);
        if (data.places.length > 0) hasDataRef.current = true;
        setError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
          // Keep stale places visible — don't clear
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bounds, enabled, filter, retryNonce, travelMode, userLocation.lat, userLocation.lng]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  return { places, isLoading, isRefreshing, error, clearError, retry };
}
