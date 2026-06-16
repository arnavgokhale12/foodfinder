import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailSheet } from "./components/DetailSheet";
import { FilterBar } from "./components/FilterBar";
import { ListView, type SortMode } from "./components/ListView";
import { Map } from "./components/Map";
import { usePlaces } from "./hooks/usePlaces";
import { useUserLocation } from "./hooks/useUserLocation";
import type { Bounds, Place, PlaceType, ServerPlaceType } from "./types";
import { splitCuisines, titleCaseCuisine } from "./utils/timeUtils";

const SAVED_PLACES_KEY = "foodfinder:savedPlaces";

export default function App() {
  const { location, isLocating, usedFallback } = useUserLocation();
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [filter, setFilter] = useState<PlaceType>("all");
  const [cuisineFilter, setCuisineFilter] = useState("all");
  const [isZoomedIn, setIsZoomedIn] = useState(true);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [sortMode, setSortMode] = useState<SortMode>("nearest");
  const [savedPlaces, setSavedPlaces] = useState<Place[]>(loadSavedPlaces);
  const [focusedPlace, setFocusedPlace] = useState<Place | null>(null);
  const [pickedPlaceId, setPickedPlaceId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const serverFilter = getServerFilter(filter);
  const shouldFetch = isZoomedIn && filter !== "saved";
  const { places, isLoading, error, retry } = usePlaces({
    bounds,
    enabled: shouldFetch,
    filter: serverFilter,
    userLocation: location
  });

  const savedPlaceIds = useMemo(() => savedPlaces.map((place) => place.id), [savedPlaces]);
  const basePlaces = filter === "saved" ? savedPlaces : places;
  const cuisineOptions = useMemo(() => getCuisineOptions(places), [places]);
  const filteredPlaces = useMemo(
    () => applyClientFilters(basePlaces, filter, cuisineFilter),
    [basePlaces, cuisineFilter, filter]
  );
  const canShowPlaces = filter === "saved" || isZoomedIn;
  const visiblePlaces = canShowPlaces && !isLoading ? filteredPlaces : [];

  const handleFilterChange = useCallback((nextFilter: PlaceType) => {
    setFilter(nextFilter);
    setCuisineFilter("all");
    setSelectedPlace(null);
  }, []);

  const handleZoomGateChange = useCallback((nextIsZoomedIn: boolean) => {
    setIsZoomedIn(nextIsZoomedIn);
    if (!nextIsZoomedIn) {
      setSelectedPlace(null);
    }
  }, []);

  const handleToggleSaved = useCallback((place: Place) => {
    setSavedPlaces((currentPlaces) => {
      const exists = currentPlaces.some((savedPlace) => savedPlace.id === place.id);
      const nextPlaces = exists
        ? currentPlaces.filter((savedPlace) => savedPlace.id !== place.id)
        : [{ ...place }, ...currentPlaces];

      window.localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(nextPlaces));
      return nextPlaces;
    });
  }, []);

  const handlePickForMe = useCallback(() => {
    if (!visiblePlaces.length) {
      setToastMessage("Nothing open here - pan around.");
      return;
    }

    const nextPlace = visiblePlaces[Math.floor(Math.random() * visiblePlaces.length)];
    setViewMode("map");
    setFocusedPlace(nextPlace);
    setPickedPlaceId(nextPlace.id);
    setSelectedPlace(nextPlace);
    window.setTimeout(() => setPickedPlaceId(null), 1400);
  }, [visiblePlaces]);

  const handleToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timer = window.setTimeout(() => setToastMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "p" || e.key === "P") handlePickForMe();
      else if (e.key === "l" || e.key === "L") setViewMode((m) => (m === "map" ? "list" : "map"));
      else if (e.key === "Escape") setSelectedPlace(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePickForMe]);

  const showCuisineFilters = filter === "restaurant" && cuisineOptions.length > 0;
  const hasEmptyPlaces = !isLoading && canShowPlaces && (bounds || filter === "saved") && visiblePlaces.length === 0;
  const emptyCopy = filter === "saved" ? "Nothing saved yet." : "Nothing open here right now";

  return (
    <main className="relative h-screen overflow-hidden bg-black">
      {viewMode === "map" ? (
        <Map
          focusedPlace={focusedPlace}
          onBoundsChange={setBounds}
          onPlaceSelect={setSelectedPlace}
          onToggleSaved={handleToggleSaved}
          onZoomGateChange={handleZoomGateChange}
          pickedPlaceId={pickedPlaceId}
          places={visiblePlaces}
          recenterTrigger={recenterKey}
          savedPlaceIds={savedPlaceIds}
          showUserLocation={!usedFallback && !isLocating}
          userLocation={location}
        />
      ) : (
        <ListView
          onPlaceSelect={setSelectedPlace}
          onSortChange={setSortMode}
          places={visiblePlaces}
          sortMode={sortMode}
        />
      )}
      <FilterBar activeFilter={filter} onChange={handleFilterChange} />

      {showCuisineFilters ? (
        <CuisineFilterBar
          activeCuisine={cuisineFilter}
          cuisines={cuisineOptions}
          onChange={setCuisineFilter}
        />
      ) : null}

      <button
        className="fixed right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-30 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-sm font-black text-white shadow-2xl backdrop-blur-xl transition hover:bg-white/15"
        onClick={() => setViewMode((mode) => (mode === "map" ? "list" : "map"))}
        type="button"
      >
        {viewMode === "map" ? "List" : "Map"}
      </button>

      {isLoading && isZoomedIn ? (
        <div className="pointer-events-none fixed inset-0 z-10 bg-black/30 ff-loading-wash" />
      ) : null}

      <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+5rem)] z-20 -translate-x-1/2">
        {isLoading && isZoomedIn ? <StatusPill>Updating...</StatusPill> : null}
        {!isZoomedIn ? <StatusPill>Zoom in to see what's open</StatusPill> : null}
      </div>

      {hasEmptyPlaces ? (
        <div className="pointer-events-none fixed inset-0 z-10 grid place-items-center px-6">
          <div className="rounded-[1.75rem] border border-white/10 bg-black/55 px-6 py-5 text-center shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-xl">☾</div>
            <p className="text-base font-black text-white">{emptyCopy}</p>
          </div>
        </div>
      ) : null}

      {isZoomedIn && !isLoading && visiblePlaces.length > 0 && viewMode === "map" ? (
        <div className={`pointer-events-none fixed inset-x-0 z-20 flex justify-center transition-[bottom] ${
          selectedPlace ? "bottom-[calc(env(safe-area-inset-bottom)+20rem)]" : "bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        }`}>
          <StatusPill>{visiblePlaces.length} open nearby</StatusPill>
        </div>
      ) : null}

      {viewMode === "map" && !selectedPlace ? (
        <button
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-20 mx-auto w-max rounded-full border border-lime-200/25 bg-lime-300 px-5 py-3 text-sm font-black text-black shadow-2xl transition hover:bg-lime-200"
          onClick={handlePickForMe}
          type="button"
        >
          Pick for me
        </button>
      ) : null}

      {viewMode === "map" && !usedFallback && !isLocating ? (
        <button
          aria-label="Re-center on my location"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] left-4 z-20 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/60 text-white shadow-2xl backdrop-blur-xl transition hover:bg-white/15"
          onClick={() => setRecenterKey((k) => k + 1)}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
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

      {toastMessage ? (
        <button
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-50 mx-auto w-max rounded-full border border-white/10 bg-black/80 px-4 py-3 text-xs font-black text-white shadow-2xl backdrop-blur-xl transition hover:bg-white/15"
          onClick={() => setToastMessage(null)}
          type="button"
        >
          {toastMessage}
        </button>
      ) : null}

      <DetailSheet
        isSaved={selectedPlace ? savedPlaceIds.includes(selectedPlace.id) : false}
        onClose={() => setSelectedPlace(null)}
        onShareResult={handleToast}
        onToggleSaved={handleToggleSaved}
        place={selectedPlace}
      />
    </main>
  );
}

function getServerFilter(filter: PlaceType): ServerPlaceType {
  if (filter === "vegan" || filter === "vegetarian" || filter === "saved") {
    return "all";
  }

  return filter;
}

function applyClientFilters(places: Place[], filter: PlaceType, cuisineFilter: string) {
  return places.filter((place) => {
    if (filter === "vegan" && place.tags?.["diet:vegan"] !== "yes") {
      return false;
    }

    if (filter === "vegetarian" && place.tags?.["diet:vegetarian"] !== "yes") {
      return false;
    }

    if (cuisineFilter !== "all" && !splitCuisines(place.tags?.cuisine).includes(cuisineFilter)) {
      return false;
    }

    return true;
  });
}

function getCuisineOptions(places: Place[]) {
  return Array.from(
    new Set(
      places
        .filter((place) => place.type === "restaurant")
        .flatMap((place) => splitCuisines(place.tags?.cuisine))
    )
  ).sort((a, b) => a.localeCompare(b));
}

function loadSavedPlaces() {
  try {
    const rawPlaces = window.localStorage.getItem(SAVED_PLACES_KEY);
    if (!rawPlaces) {
      return [];
    }

    const parsedPlaces = JSON.parse(rawPlaces);
    return Array.isArray(parsedPlaces) ? (parsedPlaces as Place[]) : [];
  } catch {
    return [];
  }
}

function CuisineFilterBar({
  activeCuisine,
  cuisines,
  onChange
}: {
  activeCuisine: string;
  cuisines: string[];
  onChange: (cuisine: string) => void;
}) {
  return (
    <div className="ff-cuisine-scroll fixed left-0 right-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 overflow-x-auto px-4 pb-3">
      <div className="mx-auto flex w-max max-w-full gap-2 rounded-full border border-white/10 bg-black/45 p-1.5 shadow-2xl backdrop-blur-xl">
        <CuisineButton active={activeCuisine === "all"} onClick={() => onChange("all")}>
          All cuisines
        </CuisineButton>
        {cuisines.map((cuisine) => (
          <CuisineButton active={activeCuisine === cuisine} key={cuisine} onClick={() => onChange(cuisine)}>
            {titleCaseCuisine(cuisine)}
          </CuisineButton>
        ))}
      </div>
    </div>
  );
}

function CuisineButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black transition-colors ${
        active ? "bg-orange-400 text-black" : "bg-white/8 text-white/75 hover:bg-white/15 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
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
