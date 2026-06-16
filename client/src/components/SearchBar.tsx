import { useEffect, useRef, useState } from "react";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export interface GeoResult {
  name: string;
  lat: number;
  lng: number;
}

interface SearchBarProps {
  onClose: () => void;
  onSelect: (result: GeoResult) => void;
}

export function SearchBar({ onClose, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ format: "json", q, limit: "6", addressdetails: "0" });
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          headers: { "Accept-Language": "en" }
        });
        const data = (await res.json()) as NominatimResult[];
        setResults(
          data.map((r) => ({
            name: r.display_name
              .split(", ")
              .filter((p) => !/^\d+$/.test(p))
              .slice(0, 3)
              .join(", "),
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          }))
        );
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSelect(result: GeoResult) {
    onSelect(result);
    onClose();
  }

  const showEmpty = !isLoading && query.trim().length > 0 && results.length === 0;

  return (
    <>
      <button
        aria-label="Close search"
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+1rem)] z-40 mx-auto max-w-lg">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <svg
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-white/40"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-sm text-white placeholder-white/35 outline-none"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search neighborhood, city, address…"
              type="text"
              value={query}
            />
            {isLoading ? (
              <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
            ) : query.length > 0 ? (
              <button
                className="text-white/35 transition hover:text-white/70"
                onClick={() => setQuery("")}
                type="button"
                aria-label="Clear search"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>

          {results.length > 0 && (
            <ul className="border-t border-white/10">
              {results.map((result, i) => (
                <li key={i}>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/[0.08] hover:text-white"
                    onClick={() => handleSelect(result)}
                    type="button"
                  >
                    <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-white/35" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                    </svg>
                    <span className="truncate">{result.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showEmpty && (
            <p className="border-t border-white/10 px-4 py-3 text-sm text-white/35">
              No places found
            </p>
          )}
        </div>
      </div>
    </>
  );
}
