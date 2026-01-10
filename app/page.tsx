"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";


interface WeeklyPhoto {
  id: string;
  name: string;
  link: string;
}


export default function Home() {
  const [weeklyPhoto, setWeeklyPhoto] = useState<WeeklyPhoto | null>(null);

  useEffect(() => {
    async function loadPhoto() {
      try {
        const res = await fetch("/api/weekly-photo");
        const data = await res.json();
        if (data.file || data.link) {
          setWeeklyPhoto(data.file ? data.file : data);
        }
      } catch (err) {
        console.error("Error loading weekly photo:", err);
      }
    }
    loadPhoto();
  }, []);

  return (
    <section className="text-center">
      <Image
        src="/media/logo-dark.png"   // 👈 Always dark logo
        alt="Country City Swing Logo"
        width={150}
        height={150}
        className="mx-auto mb-6 drop-shadow-[0_0_12px_rgba(242,201,76,0.45)]"
      />

      <h1 className="gold-wave text-4xl font-extrabold mb-6 pb-2">
        Welcome to Country City Swing
      </h1>

      <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
        Nashville’s home for joyful Country Swing partner dancing —
        where faith, community, and fun meet on the dance floor!
      </p>

       {/* --- NEW weekly class photo --- */}
      {weeklyPhoto && (
        <div className="relative max-w-3xl mx-auto mb-10">
          {/* --- Gold-glow wrapper --- */}
          <div className="gold-glow rounded-lg p-[0px] bg-gradient-to-br from-yellow-400/70 to-yellow-200/40">
            <img
              src={weeklyPhoto.link}
              alt={weeklyPhoto.name}
              className="w-full h-auto object-contain rounded-lg"
            />

            {/* --- Caption overlay --- */}
            <div className="absolute bottom-0 left-0 w-full bg-black/50 text-yellow-300 text-sm sm:text-base font-medium py-2 text-center backdrop-blur-[2px]">
              {weeklyPhoto.name}
            </div>
          </div>
        </div>
      )}


      <div className="flex justify-center flex-wrap gap-4">
        <Link href="/events">
          <button className="btn btn-primary home-events-btn">See Upcoming Events</button>
        </Link>
        <Link href="/prayer">
          <button className="btn btn-accent">Prayer Request🙏</button>
        </Link>
      </div>
    </section>
  );
}
