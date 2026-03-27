interface Event {
  id: number;
  title: string;
  starts_at: string;
  location: string;
  description: string;
  signupLink?: string;
  signup_link?: string;
  time_zone?: string | null;
  price?: number;
}

export default function EventCard({ event }: { event: Event }) {
  const tz = event.time_zone || "America/Chicago";
  const tzAbbrev = (() => {
    try {
      const parts = new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        timeZoneName: "short",
        hour: "numeric",
      }).formatToParts(new Date(event.starts_at));
      return parts.find((p) => p.type === "timeZoneName")?.value || "";
    } catch {
      return "";
    }
  })();

  return (
    <div className="border border-neutral-700 rounded-lg p-5 hover:border-primary transition">
      <h3 className="text-xl font-bold text-primary mb-1">{event.title}</h3>
      <p className="text-gray-400 text-sm">
        📅 {new Date(event.starts_at).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: tz,
            })}
            {event.starts_at
              ? ` • ${new Date(event.starts_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: tz,
                })}${tzAbbrev ? ` ${tzAbbrev}` : ""}`
              : ""}{" "}
            — 📍 {event.location}
      </p>
      {event.price && (
        <p className="text-yellow-400 font-semibold text-sm mt-1">
          Price: ${event.price.toFixed(2)}
        </p>
      )}
      <p className="mt-3 text-gray-300">{event.description}</p>
      {(event.signupLink || event.signup_link) && (
        <div className="flex justify-center mt-4">
          <a
            href={event.signupLink || event.signup_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-primary text-black px-4 py-2 rounded hover:bg-yellow-400 font-medium"
          >
            Sign Up
          </a>
        </div>
      )}
    </div>
  );
}
