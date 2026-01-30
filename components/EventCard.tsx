interface Event {
  id: number;
  title: string;
  date: string;
  location: string;
  description: string;
  signupLink?: string;
  signup_link?: string;
  start_time?: string;
  price?: number;
}

export default function EventCard({ event }: { event: Event }) {
  return (
    <div className="border border-neutral-700 rounded-lg p-5 hover:border-primary transition">
      <h3 className="text-xl font-bold text-primary mb-1">{event.title}</h3>
      <p className="text-gray-400 text-sm">
        📅 {new Date(event.date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            {event.start_time
              ? ` • ${new Date(event.start_time).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}`
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
