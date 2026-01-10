"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const schema = z.object({
  name: z.string().optional(),
  message: z.string().min(3, "Please enter a prayer request."),
});

export default function PrayerForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
    reset,
  } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: any) => {
    await fetch("/api/prayer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    reset();
  };

  return (
    <div className="relative max-w-lg mx-auto my-10 p-[0px] rounded-lg bg-gradient-to-br from-purple-500/60 to-purple-300/40 shadow-[0_0_25px_rgba(187,134,252,0.6)] animate-purplePulse">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-neutral-800 p-6 rounded-lg shadow-lg text-left"
      >
        {isSubmitSuccessful && (
          <p className="text-green-400 mb-4">
            🙏 Your prayer request has been sent!
          </p>
        )}

        <div className="mb-4">
          <label className="block mb-1 text-gray-300">
            Your Name (optional)
          </label>
          <input
            {...register("name")}
            className="w-full px- py-2 rounded bg-neutral-900 border border-neutral-700 text-white"
            placeholder=" e.g., Joe Smith"
          />
        </div>

        <div className="mb-6">
          <label className="block mb-1 text-gray-300">Prayer Request</label>
          <textarea
            {...register("message")}
            className="w-full h-32 px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-white"
            placeholder="Share your request..."
          />
          {errors.message && (
            <p className="text-red-400 text-sm mt-1">
              {String(errors.message.message)}
            </p>
          )}
        </div>

        <button
          disabled={isSubmitting}
          type="submit"
          className="bg-accent text-white px-6 py-2 rounded font-medium transition-all duration-300 shadow-[0_0_15px_rgba(187,134,252,0.5)] hover:shadow-[0_0_25px_rgba(187,134,252,0.8)] hover:bg-[#CF9FFF] active:scale-95"
        >
          {isSubmitting ? "Sending..." : "Send Prayer Request"}
        </button>
      </form>
    </div>
  );
}
