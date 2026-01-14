export default function About() {
  return (
    <section className="max-w-4xl mx-auto px-6 py-16 text-neutral-100">
      {/* Header */}
      <div className="text-center mb-10">
        <h2 className="text-4xl font-bold text-primary mb-2 tracking-wide">
          About Country City Swing
        </h2>
        <div className="mt-4 flex justify-center">
        <div className="w-100 h-[1px] bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full"></div>
      </div>
      </div>

      {/* Main content */}
      <div className="space-y-6 text-lg leading-relaxed text-gray-300">
        <p>
          Founded in the heart of Nashville, Tennessee,{" "}
          <span className="text-primary font-semibold">Country City Swing</span>{" "}
          blends the energy of modern country music with the timeless joy of
          partner dancing.
        </p>

        <p>
          Our mission is to create a{" "}
          <span className="text-yellow-400 font-medium">
            welcoming, faith-driven community
          </span>{" "}
          where dancers of all levels — from curious beginners to experienced
          performers — can learn, grow, and connect through movement, music, and
          joy.
        </p>

        <p>
          We believe dancing is more than just steps — it’s a celebration of
          fellowship, gratitude, and expression. Every event, class, and workshop
          we host is designed to help people experience the connection between
          rhythm, relationship, and renewal.
        </p>
      </div>

      {/* Logo Story */}
      <div className="mt-16 pt-10 border-t border-neutral-800">
        <h3 className="text-3xl font-semibold text-primary mb-4 text-center">
          The CCS Logo
        </h3>

        <div className="text-lg leading-relaxed text-gray-300 space-y-5">
          <p>
            From the very beginning, our goal was clear —{" "}
            <span className="text-yellow-400 font-medium">
              the eyes should never be on us
            </span>
            , but always on Him. That conviction guided every step of our journey,
            including the creation of the{" "}
            <strong className="text-primary">Country City Swing logo</strong>.
          </p>

          <p>
            The logo`s design is intentional —{" "}
            <span className="text-yellow-400 font-medium">
              keeping Christ first
            </span>{" "}
            as a reminder of the One who makes it all possible. At its heart, the
            focal point is <strong>The Cross</strong>, representing our mission to
            bring joy, unity, and purpose through dance that honors Him.
          </p>

          <p>
            A special thanks to{" "}
            <a
              href="https://www.instagram.com/dancewithgabe?igsh=eGwycmI6NWI2Z2g1"
              target="_blank"
              rel="noopener noreferrer"
              className="!text-white underline decoration-1 underline-offset-2 hover:!text-white hover:shadow-[0_0_8px_rgba(242,201,76,0.8)] transition-all duration-300"
            >
              Gabe Sebastian
            </a>{" "}
            for providing the original inspiration for the design — his vision helped
            spark the logo we know and love today, a symbol of praise for
            <strong className="text-primary"> Him</strong> with dance
            and a community rooted in faith.
          </p>
        </div>
      </div>
      <p className="text-center italic text-yellow-300 mt-10 text-xl">
          “Dance for joy, dance for connection, dance for His glory.”
      </p>
      {/* Decorative accent footer */}
      <div className="mt-8 flex justify-center">
        <div className="w-100 h-[1px] bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full"></div>
      </div>
    </section>
  );
}
