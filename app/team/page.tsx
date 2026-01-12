import Image from "next/image";

const team = [
  {
    name: "Isaiah",
    role: "Owner & Head Instructor",
    image: "/media/Isaiah_CCS.jpg",
  },
  {
    name: "Malissa",
    role: "Head Instructor",
    image: "/media/Malissa_CCS.jpg",
  },
  {
    name: "Brandon Haas",
    role: "Assistant Instructor",
    image: "/media/Malissa_CCS.jpg",
  },
  {
    name: "Brittney McGetrick",
    role: "Assistant Instructor",
    image: "/media/Brittney_McGetrick_CCS.jpg",
  },
  {
    name: "Catherine Cerroni",
    role: "Assistant Instructor",
    image: "/media/Malissa_CCS.jpg",
  },
  {
    name: "Catherine Husman",
    role: "Assistant Instructor",
    image: "/media/Catherine_Husman_CCS.jpg",
  },
  {
    name: "Corrine DeRosa",
    role: "Assistant Instructor",
    image: "/media/Malissa_CCS.jpg",
  },
  {
    name: "Dakota Kimble",
    role: "Assistant Instructor",
    image: "/media/Malissa_CCS.jpg",
  },
  {
    name: "Davis Schmidt",
    role: "Assistant Instructor",
    image: "/media/Malissa_CCS.jpg",
  },
  {
    name: "Emma Eagle",
    role: "Assistant Instructor",
    image: "/media/Emma_Eagle_CCS.jpg",
  },
  {
    name: "Joey Becks",
    role: "Assistant Instructor",
    image: "/media/Malissa_CCS.jpg",
  },
  {
    name: "Jacob Meiland",
    role: "Assistant Instructor",
    image: "/media/Jacob_Meiland_CCS.jpg",
  },
  {
    name: "Mike Reich",
    role: "Assistant Instructor",
    image: "/media/Mike_Reich_CCS.jpg",
  },
  {
    name: "Nicole Maxson",
    role: "Assistant Instructor",
    image: "/media/Nicole_Maxson_CCS.jpg",
  },
  {
    name: "Rhi Goodman",
    role: "Assistant Instructor",
    image: "/media/Rhi_Goodman_CCS.jpg",
  },
  {
    name: "Seth Vink",
    role: "Assistant Instructor",
    image: "/media/Malissa_CCS.jpg",
  }
];

export default function Team() {
  // split team array: first two vs. rest
  const firstRow = team.slice(0, 2);
  const remaining = team.slice(2);

  return (
    <section className="max-w-5xl mx-auto px-4">
      <h2 className="text-3xl font-semibold text-primary mb-8 text-center">
        Meet Our Team
      </h2>

      {/* --- First Row: 2 Cards, Centered --- */}
      <div className="flex flex-wrap justify-center gap-8 mb-10">
        {firstRow.map((person) => (
          <div
            key={person.name}
            className="text-center bg-neutral-800 rounded-lg p-6 shadow-[0_0_20px_rgba(242,201,76,0.25)] hover:shadow-[0_0_25px_rgba(242,201,76,0.5)] transition-all duration-300 w-56 h-[20rem] flex flex-col items-center justify-start"
          >
            <div className="relative w-36 h-36 mb-4">
              <Image
                src={person.image}
                alt={person.name}
                fill
                sizes="(max-width: 768px) 140px, 180px"
                className="rounded-full object-cover"
                priority
              />
            </div>
            <div className="flex flex-col items-center flex-grow">
              <h3 className="text-lg font-bold text-primary">{person.name}</h3>
              <p className="text-gray-400 mt-1 text-center text-sm">
                {person.role}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* --- Remaining Rows: 3 per Row --- */}
      {remaining.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 justify-items-center">
          {remaining.map((person) => (
            <div
              key={person.name}
              className="text-center bg-neutral-800 rounded-lg p-6 shadow-[0_0_20px_rgba(242,201,76,0.25)] hover:shadow-[0_0_25px_rgba(242,201,76,0.5)] transition-all duration-300 w-56 h-[20rem] flex flex-col items-center justify-start"
            >
              <div className="relative w-36 h-36 mb-4">
                <Image
                  src={person.image}
                  alt={person.name}
                  fill
                  sizes="(max-width: 768px) 140px, 180px"
                  className="rounded-full object-cover"
                />
              </div>
              <div className="flex flex-col items-center flex-grow">
                <h3 className="text-lg font-bold text-primary">{person.name}</h3>
                <p className="text-gray-400 mt-1 text-center text-sm">
                  {person.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
