import type { PinTone, Place } from "../types";

export interface OpeningPeriod {
  open?: { day?: number; hour?: number; minute?: number };
  close?: { day?: number; hour?: number; minute?: number };
}

export function pinToneForClosingMinutes(closingMinutes: Place["closingMinutes"]): PinTone {
  if (closingMinutes === null || closingMinutes > 60) {
    return "green";
  }

  return "yellow";
}

export function formatClosingTime(closingMinutes: Place["closingMinutes"]): string {
  if (closingMinutes === null) {
    return "Open 24 hours";
  }

  const closingAt = new Date(Date.now() + closingMinutes * 60_000);
  return `Open until ${closingAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

export function formatDistance(distanceKm?: number): string {
  if (distanceKm === undefined) {
    return "Distance unavailable";
  }

  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}

export function formatDriveTime(driveMinutes?: number | null): string {
  if (driveMinutes === null || driveMinutes === undefined) {
    return "Drive unavailable";
  }

  return `${driveMinutes} min`;
}

export function categoryLabel(type: Place["type"]): string {
  if (type === "bar") {
    return "Bar";
  }

  if (type === "cafe") {
    return "Coffee";
  }

  if (type === "restaurant") {
    return "Restaurant";
  }

  return "Place";
}

export function categoryEmoji(type: Place["type"]): string {
  if (type === "bar") {
    return "🍺";
  }

  if (type === "cafe") {
    return "☕";
  }

  if (type === "restaurant") {
    return "🍽";
  }

  return "📍";
}

export function splitCuisines(cuisine?: string): string[] {
  if (!cuisine) {
    return [];
  }

  return cuisine
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function titleCaseCuisine(cuisine: string): string {
  return cuisine
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " "))
    .join(", ");
}

export function closingMinutesFromOpeningPeriods(periods?: OpeningPeriod[]): number | null | undefined {
  if (!periods?.length) {
    return undefined;
  }

  if (periods.length === 1 && !periods[0].close) {
    return null;
  }

  const now = new Date();
  const nowMinutesOfWeek = now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
  const futureCloses = periods
    .map((period) => {
      if (!period.close || period.close.day === undefined || period.close.hour === undefined) {
        return null;
      }

      let closeMinutesOfWeek = period.close.day * 1440 + period.close.hour * 60 + (period.close.minute ?? 0);
      if (closeMinutesOfWeek <= nowMinutesOfWeek) {
        closeMinutesOfWeek += 7 * 1440;
      }

      return closeMinutesOfWeek - nowMinutesOfWeek;
    })
    .filter((minutes): minutes is number => minutes !== null && minutes >= 0);

  return futureCloses.length ? Math.min(...futureCloses) : undefined;
}
