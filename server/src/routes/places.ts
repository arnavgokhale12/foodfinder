import { Router } from "express";
import OpeningHours from "opening_hours";

type PlaceType = "all" | "restaurant" | "bar" | "cafe" | "late-night";
type Amenity = "restaurant" | "bar" | "cafe";

interface OverpassElement {
  id?: number;
  type?: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string | undefined>;
}

interface CleanPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  photo: null;
  rating: null;
  closingMinutes: number | null;
  hoursKnown: boolean;
  driveMinutes: number | null;
  distanceKm: number;
  address: string | null;
  phone: string | null;
  type: Amenity;
  tags: Record<string, string>;
  isHappyHour: boolean;
}

const router = Router();
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OSRM_BASE_URL = "https://router.project-osrm.org/table/v1";
const OVERPASS_LIMIT = 150;
const MAX_RESULTS = 50;

const OVERPASS_CACHE_TTL = 5 * 60 * 1000;
const OVERPASS_CACHE_MAX = 100;
const overpassCache = new Map<string, { elements: OverpassElement[]; ts: number }>();

function overpassCacheKey(params: { north: number; south: number; east: number; west: number; type: PlaceType }) {
  const q = (n: number, up: boolean) => Math[up ? "ceil" : "floor"](n * 100) / 100;
  return `${q(params.north, true)},${q(params.south, false)},${q(params.east, true)},${q(params.west, false)},${params.type}`;
}
const DETAIL_TAG_KEYS = [
  "cuisine",
  "diet:vegan",
  "diet:vegetarian",
  "diet:gluten_free",
  "outdoor_seating",
  "takeaway",
  "delivery",
  "wheelchair",
  "website",
  "internet_access",
  "payment:contactless",
  "payment:cash_only",
  "microbrewery",
  "reservation",
  "stars"
] as const;
const AMENITIES_BY_TYPE: Record<PlaceType, Amenity[]> = {
  all: ["restaurant", "bar", "cafe"],
  restaurant: ["restaurant"],
  bar: ["bar"],
  cafe: ["cafe"],
  "late-night": ["bar"]
};

router.get("/", async (request, response) => {
  const parsed = parseQuery(request.query);
  if (!parsed.ok) {
    response.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const elements = await fetchPlaces(parsed.value);
    const places = elements
      .flatMap((element) => cleanPlace(element, parsed.value.userLat, parsed.value.userLng))
      .filter((place) => (parsed.value.type === "late-night" ? place.closingMinutes !== null && place.closingMinutes >= minutesUntilMidnight() : true))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_RESULTS);
    const placesWithDriveTimes = await attachDriveTimes(places, parsed.value.userLat, parsed.value.userLng, parsed.value.mode);

    response.json({ places: placesWithDriveTimes });
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "Unable to fetch places" });
  }
});

function parseQuery(query: Record<string, unknown>):
  | { ok: true; value: { north: number; south: number; east: number; west: number; type: PlaceType; userLat: number; userLng: number; mode: "drive" | "walk" } }
  | { ok: false; error: string } {
  const north = Number(query.north);
  const south = Number(query.south);
  const east = Number(query.east);
  const west = Number(query.west);
  const userLat = Number(query.userLat);
  const userLng = Number(query.userLng);
  const type = String(query.type ?? "all") as PlaceType;
  const mode: "drive" | "walk" = String(query.mode ?? "drive") === "walk" ? "walk" : "drive";

  if (![north, south, east, west, userLat, userLng].every(Number.isFinite)) {
    return { ok: false, error: "Bounds and user location are required" };
  }

  if (!["all", "restaurant", "bar", "cafe", "late-night"].includes(type)) {
    return { ok: false, error: "Invalid place type" };
  }

  return { ok: true, value: { north, south, east, west, type, userLat, userLng, mode } };
}

async function fetchPlaces(params: { north: number; south: number; east: number; west: number; type: PlaceType }) {
  const key = overpassCacheKey(params);
  const cached = overpassCache.get(key);
  if (cached && Date.now() - cached.ts < OVERPASS_CACHE_TTL) {
    return cached.elements;
  }

  const body = new URLSearchParams({ data: buildOverpassQuery(params) });
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "FoodFinder/0.1 local-dev"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Overpass failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { elements?: OverpassElement[] };
  const elements = data.elements ?? [];

  if (overpassCache.size >= OVERPASS_CACHE_MAX) {
    const oldest = [...overpassCache.entries()].sort(([, a], [, b]) => a.ts - b.ts)[0];
    overpassCache.delete(oldest[0]);
  }
  overpassCache.set(key, { elements, ts: Date.now() });

  return elements;
}

function buildOverpassQuery(params: { north: number; south: number; east: number; west: number; type: PlaceType }) {
  const bbox = `${params.south},${params.west},${params.north},${params.east}`;
  const queries = AMENITIES_BY_TYPE[params.type]
    .flatMap((amenity) => [
      `  node["amenity"="${amenity}"]["name"](${bbox});`,
      `  way["amenity"="${amenity}"]["name"](${bbox});`
    ])
    .join("\n");

  return `[out:json][timeout:25];
(
${queries}
);
out center ${OVERPASS_LIMIT};`;
}

function cleanPlace(element: OverpassElement, userLat: number, userLng: number): CleanPlace[] {
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  const id = element.id;
  const amenity = tags.amenity;

  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng) || !isAmenity(amenity)) {
    return [];
  }

  let closingMinutes: number | null = null;
  let hoursKnown = false;

  if (tags.opening_hours) {
    const parsed = getClosingMinutes(tags.opening_hours);
    if (parsed === undefined) {
      hoursKnown = false;
    } else if (parsed <= 0) {
      return [];
    } else {
      closingMinutes = parsed;
      hoursKnown = true;
    }
  }

  return [
    {
      id: String(id),
      name: tags.name ?? "Unnamed",
      lat: lat!,
      lng: lng!,
      photo: null,
      rating: null,
      driveMinutes: null,
      address: buildAddress(tags),
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      type: amenity,
      tags: pickDetailTags(tags),
      closingMinutes,
      hoursKnown,
      distanceKm: haversineKm(userLat, userLng, lat!, lng!),
      isHappyHour: getHappyHourState(tags.happy_hours)
    }
  ];
}

function pickDetailTags(tags: Record<string, string | undefined>) {
  return DETAIL_TAG_KEYS.reduce<Record<string, string>>((selectedTags, key) => {
    const value = tags[key];
    if (value) {
      selectedTags[key] = value;
    }

    return selectedTags;
  }, {});
}

function getHappyHourState(happyHours: string | undefined): boolean {
  if (!happyHours) return false;
  try {
    const oh = new OpeningHours(happyHours);
    return oh.getState();
  } catch {
    return false;
  }
}

function getClosingMinutes(openingHours: string) {
  try {
    const oh = new OpeningHours(openingHours);
    if (!oh.getState()) {
      return undefined;
    }

    const nextChange = oh.getNextChange();
    if (!nextChange) {
      return 999;
    }

    return Math.max(0, Math.round((nextChange.getTime() - Date.now()) / 60_000));
  } catch {
    return undefined;
  }
}

function buildAddress(tags: Record<string, string | undefined>) {
  if (tags["addr:full"]) {
    return tags["addr:full"];
  }

  const street = tags["addr:street"];
  const houseNumber = tags["addr:housenumber"];
  const city = tags["addr:city"];
  const state = tags["addr:state"];
  const postcode = tags["addr:postcode"];
  const streetAddress = [houseNumber, street].filter(Boolean).join(" ");
  const locality = [city, state, postcode].filter(Boolean).join(", ");
  const address = [streetAddress, locality].filter(Boolean).join(", ");

  return address || null;
}

async function attachDriveTimes(places: CleanPlace[], userLat: number, userLng: number, mode: "drive" | "walk"): Promise<CleanPlace[]> {
  if (!places.length) {
    return places;
  }

  const profile = mode === "walk" ? "foot" : "driving";
  const coordinates = [
    `${userLng},${userLat}`,
    ...places.map((place) => `${place.lng},${place.lat}`)
  ].join(";");
  const destinations = places.map((_place, index) => index + 1).join(";");
  const url = `${OSRM_BASE_URL}/${profile}/${coordinates}?sources=0&destinations=${destinations}&annotations=duration`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "FoodFinder/0.1 local-dev"
      }
    });

    if (!response.ok) {
      throw new Error(`OSRM failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { durations?: Array<Array<number | null>> };
    const durations = data.durations?.[0];
    if (!durations) {
      return places;
    }

    return places.map((place, index) => {
      const seconds = durations[index];

      return {
        ...place,
        driveMinutes: seconds === null || seconds === undefined ? null : Math.max(1, Math.round(seconds / 60))
      };
    });
  } catch (error) {
    console.warn("Drive time unavailable", error);
    return places;
  }
}

function isAmenity(value: string | undefined): value is Amenity {
  return value === "restaurant" || value === "bar" || value === "cafe";
}

function minutesUntilMidnight() {
  const now = new Date();
  return 24 * 60 - (now.getHours() * 60 + now.getMinutes());
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Number((earthRadiusKm * c).toFixed(1));
}

function toRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}

export default router;
