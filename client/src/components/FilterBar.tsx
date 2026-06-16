import type { PlaceType } from "../types";

const filters: Array<{ value: PlaceType; label: string }> = [
  { value: "all", label: "All" },
  { value: "restaurant", label: "Restaurants" },
  { value: "bar", label: "Bars" },
  { value: "cafe", label: "Coffee" },
  { value: "late-night", label: "Late Night" },
  { value: "last-call", label: "Last Call" },
  { value: "outdoor", label: "Outdoor" },
  { value: "vegan", label: "Vegan" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "saved", label: "Saved" }
];

interface FilterBarProps {
  activeFilter: PlaceType;
  onChange: (filter: PlaceType) => void;
}

export function FilterBar({ activeFilter, onChange }: FilterBarProps) {
  return (
    <div className="ff-filter-scroll fixed left-0 right-0 top-0 z-20 overflow-x-auto px-4 pb-4">
      <div className="relative z-10 mx-auto flex w-max max-w-full gap-2 rounded-full border border-white/10 bg-black/45 p-1.5 shadow-2xl backdrop-blur-xl">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.value;

          return (
            <button
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300 ease-out ${
                isActive
                  ? "bg-lime-300 text-black shadow-glow"
                  : "bg-white/8 text-white/80 hover:bg-white/15 hover:text-white"
              }`}
              key={filter.value}
              onClick={() => onChange(filter.value)}
              type="button"
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
