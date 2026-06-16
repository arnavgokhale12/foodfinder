import type { Place } from "../types";
import {
  categoryLabel,
  formatClosingTime,
  formatDriveTime,
  pinToneForClosingMinutes,
  titleCaseCuisine
} from "../utils/timeUtils";

export type SortMode = "nearest" | "closing";

interface ListViewProps {
  places: Place[];
  sortMode: SortMode;
  onSortChange: (sortMode: SortMode) => void;
  onPlaceSelect: (place: Place) => void;
}

export function ListView({ places, sortMode, onSortChange, onPlaceSelect }: ListViewProps) {
  const sortedPlaces = [...places].sort((a, b) => {
    if (sortMode === "closing") {
      return (a.closingMinutes ?? Number.MAX_SAFE_INTEGER) - (b.closingMinutes ?? Number.MAX_SAFE_INTEGER);
    }

    return (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER);
  });

  return (
    <section className="fixed inset-0 z-10 overflow-y-auto bg-zinc-950 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+7.25rem)]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/70">Open now</p>
            <h1 className="text-2xl font-black text-white">{places.length} nearby</h1>
          </div>
          <div className="flex rounded-full border border-white/10 bg-white/[0.06] p-1">
            <SortButton active={sortMode === "nearest"} onClick={() => onSortChange("nearest")}>
              Nearest
            </SortButton>
            <SortButton active={sortMode === "closing"} onClick={() => onSortChange("closing")}>
              Closing Soon
            </SortButton>
          </div>
        </div>

        <div className="space-y-2">
          {sortedPlaces.map((place) => {
            const tone = pinToneForClosingMinutes(place.closingMinutes);

            return (
              <button
                className="flex w-full items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.055] p-3 text-left shadow-xl transition hover:border-white/20 hover:bg-white/[0.085]"
                key={place.id}
                onClick={() => onPlaceSelect(place)}
                type="button"
              >
                <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${categoryDotClass(place.type)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-black text-white">{place.name}</span>
                  <span className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-white/55">
                    <span>{categoryLabel(place.type)}</span>
                    {place.tags?.cuisine ? <span>{titleCaseCuisine(place.tags.cuisine)}</span> : null}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-black text-white">{formatDriveTime(place.driveMinutes)}</span>
                  <span className={tone === "yellow" ? "text-xs font-black text-yellow-300" : "text-xs font-bold text-lime-300"}>
                    {formatClosingTime(place.closingMinutes)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SortButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className={`rounded-full px-3 py-1.5 text-xs font-black transition-colors ${
        active ? "bg-lime-300 text-black" : "text-white/65 hover:bg-white/10 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function categoryDotClass(type: Place["type"]) {
  if (type === "bar") {
    return "bg-[#7C3AED]";
  }

  if (type === "cafe") {
    return "bg-[#92400E]";
  }

  if (type === "restaurant") {
    return "bg-[#F97316]";
  }

  return "bg-slate-500";
}
