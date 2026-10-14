import type { RepresentEachOtherWellContent } from "@/lib/team/teamMemberResources";

export default function TeamExpectationsSection({
  intro,
  groups,
  footnote,
  scripture,
}: RepresentEachOtherWellContent) {
  return (
    <section id="team-expectations" aria-label="Represent Each Other Well">
      <h2 className="gold-wave text-3xl font-extrabold text-center mb-6 pb-1">
        Represent Each Other Well!
      </h2>

      <p className="text-gray-300 text-center max-w-3xl mx-auto mb-10">{intro}</p>

      <div className="grid gap-8 md:grid-cols-2 md:gap-x-12 md:gap-y-10">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="text-primary font-semibold text-lg mb-3">{group.title}</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-300">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-gray-400 italic text-sm mt-10 max-w-3xl">{footnote}</p>
      <blockquote className="text-gray-300 italic text-center mt-6 max-w-2xl mx-auto">
        {scripture}
      </blockquote>
    </section>
  );
}
