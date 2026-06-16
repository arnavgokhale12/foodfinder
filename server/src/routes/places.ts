import { Router } from "express";
import OpeningHours from "opening_hours";

type PlaceType = "all" | "restaurant" | "bar" | "cafe" | "late-night";
type Amenity = "restaurant" | "bar" | "cafe";

interface OverpassElement {
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string | undefined>;
}

interface CleanPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  photo: null;
  rating: null;
  closingMinutes: number;
  driveMinutes: number | null;
  distanceKm: number;
  address: string | null;
  phone: string | null;
  type: Amenity;
  tags: Record<string, string>;
}

const router = Router();
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OSRM_TABLE_URL = "https://router.project-osrm.org/table/v1/driving";
const MAX_RESULTS = 40;
const DETAIL_TAG_KEYS = [
  "cuisine",
  "diet:vegan",
  "diet:vegetarian",
  "diet:gluten_free",
  "outdoor_seating",
  "takeaway",
  "delivery",
  "wheelchair",
  "website"
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
      .filter((place) => (parsed.value.type === "late-night" ? place.closingMinutes >= minutesUntilMidnight() : true))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_RESULTS);
    const placesWithDriveTimes = await attachDriveTimes(places, parsed.value.userLat, parsed.value.userLng);

    response.json({ places: placesWithDriveTimes });
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "Unable to fetch places" });
  }
});

function parseQuery(query: Record<string, unknown>):
  | { ok: true; value: { north: number; south: number; east: number; west: number; type: PlaceType; userLat: number; userLng: number } }
  | { ok: false; error: string } {
  const north = Number(query.north);
  const south = Number(query.south);
  const east = Number(query.east);
  const west = Number(query.west);
  const userLat = Number(query.userLat);
  const userLng = Number(query.userLng);
  const type = String(query.type ?? "all") as PlaceType;

  if (![north, south, east, west, userLat, userLng].every(Number.isFinite)) {
    return { ok: false, error: "Bounds and user location are required" };
  }

  if (!["all", "restaurant", "bar", "cafe", "late-night"].includes(type)) {
    return { ok: false, error: "Invalid place type" };
  }

  return { ok: true, value: { north, south, east, west, type, userLat, userLng } };
}

async function fetchPlaces(params: { north: number; south: number; east: number; west: number; type: PlaceType }) {
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
  return data.elements ?? [];
}

function buildOverpassQuery(params: { north: number; south: number; east: number; west: number; type: PlaceType }) {
  const bbox = `${params.south},${params.west},${params.north},${params.east}`;
  const nodeQueries = AMENITIES_BY_TYPE[params.type]
    .map((amenity) => `  node["amenity"="${amenity}"]["opening_hours"](${bbox});`)
    .join("\n");

  return `[out:json][timeout:20];
(
${nodeQueries}
);
out body ${MAX_RESULTS};`;
}

function cleanPlace(element: OverpassElement, userLat: number, userLng: number): CleanPlace[] {
  const tags = element.tags ?? {};
  const lat = element.lat;
  const lng = element.lon;
  const id = element.id;
  const amenity = tags.amenity;

  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng) || !isAmenity(amenity) || !tags.opening_hours) {
    return [];
  }

  const closingMinutes = getClosingMinutes(tags.opening_hours);
  if (closingMinutes === undefined || closingMinutes <= 0) {
    return [];
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
      distanceKm: haversineKm(userLat, userLng, lat!, lng!)
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

async function attachDriveTimes(places: CleanPlace[], userLat: number, userLng: number): Promise<CleanPlace[]> {
  if (!places.length) {
    return places;
  }

  const coordinates = [
    `${userLng},${userLat}`,
    ...places.map((place) => `${place.lng},${place.lat}`)
  ].join(";");
  const destinations = places.map((_place, index) => index + 1).join(";");
  const url = `${OSRM_TABLE_URL}/${coordinates}?sources=0&destinations=${destinations}&annotations=duration`;

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
