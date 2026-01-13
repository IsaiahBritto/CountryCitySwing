export default function About() {
  return (
    <section className="max-w-4xl mx-auto px-6 py-16 text-neutral-100">
      {/* Header */}
      <div className="text-center mb-10">
        <h2 className="text-4xl font-bold text-primary mb-2 tracking-wide">
          About Country City Swing
        </h2>
        <div className="w-24 h-[2px] bg-gradient-to-r from-yellow-400 via-primary to-yellow-400 mx-auto rounded-full"></div>
      </div>

      {/* Content */}
      <div className="space-y-6 text-lg leading-relaxed text-gray-300">
        <p>
          Founded in the heart of Nashville, Tennessee,{" "}
          <span className="text-primary font-semibold">Country City Swing</span>{" "}
          blends the energy of modern country music with the timeless joy of
          partner dancing.
        </p>

        <p>
          Our mission is to create a <span className="text-yellow-400 font-medium">welcoming, faith-driven community</span>{" "}
          where dancers of all levels — from curious beginners to experienced
          performers — can learn, grow, and connect through movement, music, and joy.
        </p>

        <p>
          We believe dancing is more than just steps — it’s a celebration of
          fellowship, gratitude, and expression. Every event, class, and workshop
          we host is designed to help people experience the connection between
          rhythm, relationship, and renewal.
        </p>

        <p className="text-center italic text-yellow-300 mt-10 text-xl">
          “Dance for joy, dance for connection, dance for His glory.”
        </p>
      </div>

      {/* Decorative accent footer */}
      <div className="mt-12 flex justify-center">
        <div className="w-32 h-[1px] bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full"></div>
      </div>
    </section>
  );
}
