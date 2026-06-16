import type { Place } from "../types";
import { categoryLabel, formatClosingTime, formatDistance, formatDriveTime, pinToneForClosingMinutes } from "../utils/timeUtils";

interface DetailSheetProps {
  place: Place | null;
  onClose: () => void;
}

export function DetailSheet({ place, onClose }: DetailSheetProps) {
  const tone = place ? pinToneForClosingMinutes(place.closingMinutes) : "green";
  const directionsUrl = place
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.lat},${place.lng}`)}&destination_place_id=${encodeURIComponent(place.id)}`
    : "#";

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
            <ClosingStatus closingMinutes={place.closingMinutes} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-lime-200/80">{categoryLabel(place.type)}</p>
                <h2 className="mt-1 text-2xl font-black leading-tight text-white">{place.name}</h2>
              </div>
              <button
                className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white/80 hover:bg-white/20"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <InfoCard label="Hours" tone={tone} value={formatClosingTime(place.closingMinutes)} />
              <InfoCard label="Drive" value={formatDriveTime(place.driveMinutes)} />
              <InfoCard label="Source" value="OpenStreetMap" />
            </div>

            <div className="space-y-2 text-sm text-white/75">
              {place.distanceKm !== undefined ? <p>{formatDistance(place.distanceKm)} away</p> : null}
              {place.address ? <p>{place.address}</p> : null}
              {place.phone ? <p>{place.phone}</p> : null}
            </div>

            <a
              className="block rounded-2xl bg-lime-300 px-5 py-3 text-center text-base font-black text-black transition hover:bg-lime-200"
              href={directionsUrl}
              rel="noreferrer"
              target="_blank"
            >
              Get Directions
            </a>
          </div>
        ) : null}
      </section>
    </>
  );
}

function ClosingStatus({ closingMinutes }: { closingMinutes: Place["closingMinutes"] }) {
  if (closingMinutes === null || closingMinutes > 60) {
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

function InfoCard({ label, value, tone }: { label: string; value: string; tone?: "green" | "yellow" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/45">{label}</p>
      <p className={`mt-1 text-sm font-black ${tone === "yellow" ? "text-yellow-300" : tone === "green" ? "text-lime-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
