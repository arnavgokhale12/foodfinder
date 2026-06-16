import type { Place } from "../types";
import { pinToneForClosingMinutes } from "../utils/timeUtils";

export function createPlacePin(place: Place): HTMLButtonElement {
  const tone = pinToneForClosingMinutes(place.closingMinutes);
  const element = document.createElement("button");
  element.type = "button";
  element.className = "group ff-pin-shell flex -translate-x-1/2 -translate-y-1/2 flex-col items-center border-0 bg-transparent p-0";
  element.setAttribute("aria-label", place.name);

  const image = document.createElement("span");
  image.className = [
    "ff-pin-token transition duration-200 group-hover:scale-105",
    `ff-pin-${place.type}`,
    tone === "green" ? "ff-pin-green" : "ff-pin-yellow"
  ].join(" ");

  image.innerHTML = categoryIcon(place.type);

  const label = document.createElement("span");
  label.className = "mt-1 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold text-white shadow-lg backdrop-blur";
  label.textContent = place.driveMinutes ? `${place.driveMinutes} min` : "-- min";

  element.append(image, label);
  return element;
}

function categoryIcon(type: Place["type"]) {
  if (type === "bar") {
    return `<svg aria-hidden="true" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h9a4 4 0 0 1 0 8h-1"/><path d="M6 8h8v7a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4Z"/><path d="M8 5h7"/><path d="M9 19h2"/><path d="M8 11h4"/></svg>`;
  }

  if (type === "cafe") {
    return `<svg aria-hidden="true" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5Z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 4v1"/><path d="M12 4v1"/><path d="M4 20h15"/></svg>`;
  }

  return `<svg aria-hidden="true" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v8"/><path d="M4.5 3v5.5a2.5 2.5 0 0 0 5 0V3"/><path d="M7 11v10"/><path d="M17 3v18"/><path d="M14.5 3h5v8a2.5 2.5 0 0 1-2.5 2.5"/></svg>`;
}
