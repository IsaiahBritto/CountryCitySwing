"use client";

import Image from "next/image";
import { CcsButton } from "@/components/ccs";

export type WeeklyPhoto = {
  id: string;
  name: string;
  link: string;
};

type Props = {
  photoLoading: boolean;
  weeklyPhoto: WeeklyPhoto | null;
  emailChangeMessage: string | null;
  onDismissEmailMessage: () => void;
};

export default function HomeHero({
  photoLoading,
  weeklyPhoto,
  emailChangeMessage,
  onDismissEmailMessage,
}: Props) {
  return (
    <section className="text-center pb-12">
      {emailChangeMessage && (
        <div className="max-w-2xl mx-auto mb-6 p-4 rounded-lg bg-primary/20 border border-primary text-left flex items-start gap-3">
          <p className="text-gray-200 text-sm flex-1">
            <strong className="text-primary">Email change (step 1 of 2):</strong> This link is
            confirmed. To finish changing your email, check the inbox of your{" "}
            <strong>previous email address</strong> and click the link in that message.
          </p>
          <button
            type="button"
            onClick={onDismissEmailMessage}
            className="text-gray-400 hover:text-white shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <Image
        src="/media/logo-dark.jpg"
        alt="Country City Swing Logo"
        width={150}
        height={150}
        className="mx-auto mb-6 drop-shadow-[0_0_12px_rgba(242,201,76,0.45)]"
        priority
      />

      <h1 className="ccs-text-gold-wave gold-wave text-3xl sm:text-4xl font-extrabold mb-6 pb-2">
        Welcome to Country City Swing
      </h1>

      <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
        Nashville&apos;s home for joyful Country Swing partner dancing — where faith, community, and
        fun meet on the dance floor!
      </p>

      {photoLoading ? (
        <div className="relative max-w-3xl mx-auto mb-10 w-full" style={{ aspectRatio: "4/3" }}>
          <div className="w-full h-full bg-neutral-800/50 rounded-lg animate-pulse" />
        </div>
      ) : (
        weeklyPhoto && (
          <div className="relative max-w-3xl mx-auto mb-10 w-full">
            <div
              className="ccs-gold-glow gold-glow rounded-lg p-[0px] bg-gradient-to-br from-yellow-400/70 to-yellow-200/40 relative w-full"
              style={{ aspectRatio: "4/3" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={weeklyPhoto.link}
                alt={weeklyPhoto.name}
                className="absolute inset-0 w-full h-full object-contain rounded-lg"
              />
              <div className="absolute bottom-0 left-0 w-full bg-black/50 text-yellow-300 text-sm sm:text-base font-medium py-2 text-center backdrop-blur-[2px]">
                {weeklyPhoto.name}
              </div>
            </div>
          </div>
        )
      )}

      <div className="flex justify-center flex-wrap gap-4">
        <CcsButton href="/prayer" variant="solidPink">
          Prayer Requests
        </CcsButton>
        <CcsButton href="/media" variant="solidGold">
          Group Pics
        </CcsButton>
      </div>
    </section>
  );
}
