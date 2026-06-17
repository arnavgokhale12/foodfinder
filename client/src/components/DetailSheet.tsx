import { useEffect } from "react";
import type { Place } from "../types";
import { categoryLabel, formatClosingTime, formatDistance, formatTravelTime, isOpenLate, pinToneForClosingMinutes } from "../utils/timeUtils";

interface DetailSheetProps {
  place: Place | null;
  isSaved: boolean;
  travelMode: "drive" | "walk";
  onClose: () => void;
  onShareResult: (message: string) => void;
  onToggleSaved: (place: Place) => void;
}

export function DetailSheet({ place, isSaved, travelMode, onClose, onShareResult, onToggleSaved }: DetailSheetProps) {
  const tone = place ? pinToneForClosingMinutes(place.closingMinutes, place.hoursKnown) : "green";

  useEffect(() => {
    if (!place?.id || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [place?.id]);
  const directionsUrl = place
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.lat},${place.lng}`)}`
    : "#";
  const tagBadges = place ? getTagBadges(place.tags, place.closingMinutes, place.hoursKnown) : [];

  async function handleShare() {
    if (!place) {
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: place.name,
          text: `${place.name} is open now on FoodFinder.`,
          url: directionsUrl
        });
        return;
      }

      await navigator.clipboard.writeText(directionsUrl);
      onShareResult("Map link copied");
    } catch {
      onShareResult("Share canceled");
    }
  }

  return (
    <>
      <button
        aria-label="Dismiss details"
        className={`fixed inset-0 z-30 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${
          place ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        type="button"
      />
      <section
        className={`ff-sheet fixed inset-x-0 bottom-0 z-40 mx-auto max-w-3xl rounded-t-[2rem] border border-white/10 bg-zinc-950/95 px-5 pb-5 pt-3 shadow-2xl backdrop-blur-xl transition-transform duration-500 ${
          place ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {place ? (
          <div className="space-y-4">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-white/20" />
            <ClosingStatus closingMinutes={place.closingMinutes} hoursKnown={place.hoursKnown} />
            {place.isHappyHour ? (
              <div className="rounded-2xl border border-amber-300/40 bg-amber-300/15 px-4 py-3 text-sm font-black text-amber-100">
                Happy hour is on right now
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-lime-200/80">{categoryLabel(place.type)}</p>
                <h2 className="mt-1 text-2xl font-black leading-tight text-white">{place.name}</h2>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className={`grid h-10 w-10 place-items-center rounded-full text-lg font-black transition ${
                    isSaved ? "bg-rose-400 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}
                  onClick={() => onToggleSaved(place)}
                  type="button"
                  aria-label={isSaved ? `Remove ${place.name} from saved` : `Save ${place.name}`}
                >
                  {isSaved ? "♥" : "♡"}
                </button>
                <button
                  className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white/80 hover:bg-white/20"
                  onClick={onClose}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <InfoCard label="Hours" tone={place.hoursKnown === false ? undefined : tone} value={formatClosingTime(place.closingMinutes, place.hoursKnown)} />
              <InfoCard label={travelMode === "walk" ? "Walk" : "Drive"} value={formatTravelTime(place.driveMinutes, travelMode)} />
              <InfoCard label="Source" value="OpenStreetMap" />
            </div>

            <div className="space-y-2 text-sm text-white/75">
              {place.distanceKm !== undefined ? <p>{formatDistance(place.distanceKm)} away</p> : null}
              {place.address ? <p>{place.address}</p> : null}
              {place.phone ? <p>{place.phone}</p> : null}
            </div>

            {tagBadges.length ? (
              <div className="flex flex-wrap gap-2">
                {tagBadges.map((badge) => (
                  <span className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-xs font-black text-white/75" key={badge}>
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <a
                className="flex-1 rounded-2xl bg-lime-300 px-5 py-3 text-center text-base font-black text-black transition hover:bg-lime-200"
                href={directionsUrl}
                rel="noreferrer"
                target="_blank"
              >
                Get Directions
              </a>
              {place.tags?.website ? (
                <a
                  className="rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-3 text-center text-base font-black text-white transition hover:bg-white/[0.14]"
                  href={place.tags.website}
                  rel="noreferrer"
                  target="_blank"
                >
                  Website
                </a>
              ) : null}
              <button
                className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-base font-black text-white transition hover:bg-white/[0.14]"
                onClick={handleShare}
                type="button"
                aria-label={`Share ${place.name}`}
              >
                Share
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

function getTagBadges(tags?: Record<string, string>, closingMinutes?: Place["closingMinutes"], hoursKnown?: boolean) {
  const badges: string[] = [];

  if (isOpenLate(closingMinutes ?? null, hoursKnown)) badges.push("Open Late");
  if (!tags) return badges;

  if (tags.outdoor_seating === "yes") badges.push("Outdoor seating");
  if (tags.takeaway === "yes") badges.push("Takeout");
  if (tags.delivery === "yes") badges.push("Delivery");
  if (tags["diet:vegetarian"] === "yes") badges.push("Vegetarian options");
  if (tags["diet:vegan"] === "yes") badges.push("Vegan options");
  if (tags["diet:gluten_free"] === "yes") badges.push("Gluten-free options");
  if (tags.wheelchair === "yes") badges.push("Accessible");
  if (tags.internet_access === "wlan" || tags.internet_access === "yes") badges.push("Wi-Fi");
  if (tags["payment:contactless"] === "yes") badges.push("Contactless");
  if (tags["payment:cash_only"] === "yes") badges.push("Cash only");
  if (tags.microbrewery === "yes") badges.push("Microbrewery");
  const stars = parseInt(tags.stars ?? "");
  if (!isNaN(stars) && stars > 0) badges.push(`${stars}★`);
  const reservation = tags.reservation;
  if (reservation === "required") badges.push("Reservations required");
  else if (reservation === "yes" || reservation === "recommended") badges.push("Reservations");

  return badges;
}

function ClosingStatus({ closingMinutes, hoursKnown }: { closingMinutes: Place["closingMinutes"]; hoursKnown?: boolean }) {
  if (!hoursKnown || closingMinutes === null || closingMinutes > 60) {
    return null;
  }

  const isUrgent = closingMinutes <= 20;
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${
      isUrgent
        ? "border-red-300/40 bg-red-500/18 text-red-100"
        : "border-yellow-300/40 bg-yellow-300/15 text-yellow-100"
    }`}>
      {isUrgent ? `Closing in ${closingMinutes} min` : `Closing in ${closingMinutes} min - leave soon`}
    </div>
  );
}

function InfoCard({ label, value, tone }: { label: string; value: string; tone?: "green" | "yellow" | "grey" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/45">{label}</p>
      <p className={`mt-1 text-sm font-black ${tone === "yellow" ? "text-yellow-300" : tone === "green" ? "text-lime-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
