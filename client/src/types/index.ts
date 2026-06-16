export type PlaceType = "all" | "restaurant" | "bar" | "cafe" | "late-night" | "last-call" | "outdoor" | "vegan" | "vegetarian" | "saved";

export type ServerPlaceType = Exclude<PlaceType, "vegan" | "vegetarian" | "saved" | "last-call" | "outdoor">;

export type PinTone = "green" | "yellow";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  photo?: string;
  rating?: number;
  closingMinutes: number | null;
  driveMinutes?: number | null;
  distanceKm?: number;
  address?: string;
  phone?: string;
  type: "restaurant" | "bar" | "cafe" | "place";
  tags?: Record<string, string>;
  isHappyHour?: boolean;
}
