import { useCallback, useEffect, useState } from "react";
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

const CACHE_TTL_MS = 2 * 60 * 1000;
const viewportCache = new Map<string, CacheEntry>();
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function usePlaces({ bounds, enabled, filter, userLocation, travelMode }: UsePlacesArgs) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setRetryNonce((nonce) => nonce + 1);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    if (!bounds || !enabled) {
      setPlaces([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      pruneExpiredEntries();
      const cacheKey = getCacheKey(bounds, filter, travelMode);
      const cached = viewportCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setPlaces(cached.places);
        setIsLoading(false);
        setError(null);
        return;
      }

      setError(null);
      setIsLoading(true);

      const params = new URLSearchParams({
        north: String(bounds.north),
        south: String(bounds.south),
        east: String(bounds.east),
        west: String(bounds.west),
        type: filter,
        userLat: String(userLocation.lat),
        userLng: String(userLocation.lng),
        mode: travelMode
      });

      try {
        const response = await fetch(`${API_BASE_URL}/api/places?${params}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Places request failed (${response.status})`);
        }

        const data = (await response.json()) as { places: Place[] };
        console.info("FoodFinder places", data.places);
        viewportCache.set(cacheKey, {
          places: data.places,
          timestamp: Date.now()
        });
        setPlaces(data.places);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setError((requestError as Error).message);
          setPlaces([]);
        }
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bounds, enabled, filter, retryNonce, travelMode, userLocation.lat, userLocation.lng]);

  useEffect(() => {
    if (!error) {
      return;
    }

    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  return { places, isLoading, error, clearError, retry };
}

function getCacheKey(bounds: Bounds, type: ServerPlaceType, travelMode: "drive" | "walk") {
  return [
    Math.round(bounds.north * 100),
    Math.round(bounds.south * 100),
    Math.round(bounds.east * 100),
    Math.round(bounds.west * 100),
    type,
    travelMode
  ].join(",");
}

function pruneExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of viewportCache) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      viewportCache.delete(key);
    }
  }
}
