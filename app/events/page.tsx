import events from "../../lib/events.json";
import EventCard from "../../components/EventCard";

import Calendar from "../../components/Calendar";
import EventCarousel from "../../components/EventCarousel";
import WorkshopSpotlight from "../../components/WorkshopSpotlight";


export default function EventsPage() {
  return (
    <section className="max-w-5xl mx-auto text-center">
      <h2 className="text-3xl font-semibold text-primary mb-6">
        Upcoming Events
      </h2>
      <p className="text-gray-300 mb-8">
        Browse our latest events and sign up to join the fun!
      </p>

      <WorkshopSpotlight events={events} />

      <Calendar events={events} />

      <EventCarousel events={events} />
    </section>
  );
  // return (
  //   <><section>
  //     {/* Upcoming Events Carousel */}
  //     <EventCarousel events={events} />
  //     {/* <h2 className="text-3xl font-semibold text-primary mb-6 text-center">Upcoming Events</h2>
  //     <div className="grid gap-6 md:grid-cols-2">
  //       {events.map((event) => (
  //         <EventCard key={event.id} event={event} />
  //       ))}
  //     </div> */}
  //   </section><section className="max-w-5xl mx-auto text-center">
  //       <h2 className="text-3xl font-semibold text-primary mb-6">Full Events Calendar</h2>
  //       <p className="text-gray-300 mb-8">
  //         Click on highlighted dates to see event details.
  //       </p>
  //       <Calendar events={events} />
  //     </section></>
  // );
}