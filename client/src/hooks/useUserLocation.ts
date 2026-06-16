import { useEffect, useState } from "react";
import type { Coordinates } from "../types";

const AUSTIN: Coordinates = { lat: 30.2672, lng: -97.7431 };

export function useUserLocation() {
  const [location, setLocation] = useState<Coordinates>(AUSTIN);
  const [isLocating, setIsLocating] = useState(true);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setUsedFallback(true);
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setIsLocating(false);
      },
      () => {
        setUsedFallback(true);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60_000
      }
    );
  }, []);

  return { location, isLocating, usedFallback };
}
