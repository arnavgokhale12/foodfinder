import { useCallback, useState } from "react";
import { DetailSheet } from "./components/DetailSheet";
import { FilterBar } from "./components/FilterBar";
import { Map } from "./components/Map";
import { usePlaces } from "./hooks/usePlaces";
import { useUserLocation } from "./hooks/useUserLocation";
import type { Bounds, Place, PlaceType } from "./types";

export default function App() {
  const { location, isLocating, usedFallback } = useUserLocation();
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [filter, setFilter] = useState<PlaceType>("all");
  const [isZoomedIn, setIsZoomedIn] = useState(true);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const { places, isLoading, error, retry } = usePlaces({ bounds, enabled: isZoomedIn, filter, userLocation: location });

  const handleFilterChange = useCallback((nextFilter: PlaceType) => {
    setFilter(nextFilter);
    setSelectedPlace(null);
  }, []);

  const handleZoomGateChange = useCallback((nextIsZoomedIn: boolean) => {
    setIsZoomedIn(nextIsZoomedIn);
    if (!nextIsZoomedIn) {
      setSelectedPlace(null);
    }
  }, []);

  const visiblePlaces = isZoomedIn && !isLoading ? places : [];

  return (
    <main className="relative h-screen overflow-hidden bg-black">
      <Map
        onBoundsChange={setBounds}
        onPlaceSelect={setSelectedPlace}
        onZoomGateChange={handleZoomGateChange}
        places={visiblePlaces}
        showUserLocation={!usedFallback && !isLocating}
        userLocation={location}
      />
      <FilterBar activeFilter={filter} onChange={handleFilterChange} />

      {isLoading && isZoomedIn ? (
        <div className="pointer-events-none fixed inset-0 z-10 bg-black/30 ff-loading-wash" />
      ) : null}

      <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+5rem)] z-20 -translate-x-1/2">
        {isLoading && isZoomedIn ? <StatusPill>Updating...</StatusPill> : null}
        {!isZoomedIn ? <StatusPill>Zoom in to see what's open</StatusPill> : null}
      </div>

      {!isLoading && isZoomedIn && bounds && places.length === 0 ? (
        <div className="pointer-events-none fixed inset-0 z-10 grid place-items-center px-6">
          <div className="rounded-[1.75rem] border border-white/10 bg-black/55 px-6 py-5 text-center shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-xl">☾</div>
            <p className="text-base font-black text-white">Nothing open here right now</p>
          </div>
        </div>
      ) : null}

      {isZoomedIn && !isLoading && places.length > 0 ? (
        <div className={`pointer-events-none fixed inset-x-0 z-20 flex justify-center transition-[bottom] ${
          selectedPlace ? "bottom-[calc(env(safe-area-inset-bottom)+20rem)]" : "bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        }`}>
          <StatusPill>{places.length} open nearby</StatusPill>
        </div>
      ) : null}

      <div className="pointer-events-none fixed left-4 top-[calc(env(safe-area-inset-top)+5rem)] z-20 space-y-2">
        {isLocating ? <StatusPill>Finding your location...</StatusPill> : null}
        {usedFallback ? <StatusPill>Using Austin fallback</StatusPill> : null}
      </div>

      {error ? (
        <button
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-50 mx-auto w-max rounded-full border border-red-300/35 bg-red-950/90 px-4 py-3 text-xs font-black text-red-50 shadow-2xl backdrop-blur-xl transition hover:bg-red-900"
          onClick={retry}
          type="button"
        >
          Couldn't load places - tap to retry
        </button>
      ) : null}

      <DetailSheet onClose={() => setSelectedPlace(null)} place={selectedPlace} />
    </main>
  );
}

function StatusPill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "error" }) {
  return (
    <div className={`rounded-full border px-3 py-2 text-xs font-bold shadow-2xl backdrop-blur ${
      tone === "error" ? "border-red-400/40 bg-red-950/70 text-red-100" : "border-white/10 bg-black/55 text-white/80"
    }`}>
      {children}
    </div>
  );
}
