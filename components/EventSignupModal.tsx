"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";

/* ---------- Validation Schema ---------- */
const baseSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
  beenBefore: z.enum(["First time EVER!", "I've been before!"]),
  heardAboutUs: z
    .enum([
      "Nashville Palace",
      "Social Media",
      "A friend invited me",
      "Church",
    ])
    .optional(),
  paymentMethod: z.enum([
    "Venmo @CountryCitySwing",
    "Cash",
    "A friend paid for me",
    "Class Voucher",
    "Volunteer",
  ]),
  acceptLiability: z.literal(true, {
    errorMap: () => ({ message: "You must accept the liability release" }),
  }),
  acceptPayment: z.literal(true, {
    errorMap: () => ({
      message:
        "You must acknowledge Venmo or pay-at-door confirmation requirement",
    }),
  }),
});

// ✅ superRefine for cross-field validation
const schema = baseSchema.superRefine((data, ctx) => {
  if (data.beenBefore === "First time EVER!" && !data.heardAboutUs) {
    ctx.addIssue({
      path: ["heardAboutUs"],
      message: "Please tell us how you heard about us.",
      code: z.ZodIssueCode.custom,
    });
  }
});

/* ---------- Component ---------- */
export default function EventSignupModal({ event, open, onClose }: any) {
  const {
    register,
    watch,
    unregister,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
    reset,
  } = useForm({ resolver: zodResolver(schema) });

  const beenBefore = watch("beenBefore");

  // Unregister "heardAboutUs" when hidden
  useEffect(() => {
    if (beenBefore !== "First time EVER!") {
      unregister("heardAboutUs");
    }
  }, [beenBefore, unregister]);

  // Close with ESC key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSubmit = async (data: any) => {
    await fetch("/api/event-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, event }),
    });
    reset();
    onClose();
  };

  if (!open || !event) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/60"
      onClick={onClose}                       // 👈 close when background clicked
    >
      <div
        onClick={(e) => e.stopPropagation()}  // 👈 ignore clicks inside the modal
        className="bg-neutral-900 text-white max-w-lg w-full mx-4 rounded-lg shadow-[0_0_25px_rgba(187,134,252,0.6)] overflow-y-auto max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-neutral-700">
          <h3 className="text-2xl font-bold text-primary">{event.title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 text-left space-y-4">
          <p className="text-gray-300 text-sm">
            <strong>Date:</strong>{" "}
            {new Date(event.date).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            {event.time && `• ${event.time}`} <br />
            <strong>Location:</strong> {event.location}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Names */}
            <div className="flex gap-2">
              <input
                {...register("firstName")}
                placeholder="First Name"
                className="w-1/2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
              />
              <input
                {...register("lastName")}
                placeholder="Last Name"
                className="w-1/2 px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
              />
            </div>

            {/* Email */}
            <input
              {...register("email")}
              type="email"
              placeholder="Email"
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
            />

            {/* Been before */}
            <div>
              <p className="font-medium mb-1">
                Have you been to a CCS event before?
              </p>
              {["First time EVER!", "I've been before!"].map((opt) => (
                <label key={opt} className="block text-sm">
                  <input
                    {...register("beenBefore")}
                    type="radio"
                    value={opt}
                    className="mr-2"
                  />
                  {opt}
                </label>
              ))}

              {/* 👇 Conditional "How did you hear about us?" section */}
              {beenBefore === "First time EVER!" && (
                <div className="mt-3 ml-4 border-l-2 border-yellow-400 pl-3">
                  <p className="text-sm mb-1 font-medium text-yellow-300">
                    How did you hear about us?
                  </p>
                  {[
                    "Nashville Palace",
                    "Social Media",
                    "A friend invited me",
                    "Church",
                  ].map((opt) => (
                    <label key={opt} className="block text-sm">
                      <input
                        {...register("heardAboutUs")}
                        type="radio"
                        value={opt}
                        className="mr-2"
                      />
                      {opt}
                    </label>
                  ))}
                  {errors.heardAboutUs && (
                    <p className="text-red-400 text-sm mt-1">
                      {String(errors.heardAboutUs.message)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Payment */}
            <div>
              <p className="font-medium mb-1">
                Payment Method: ${event.cost}
              </p>
              {[
                {
                  label: "Venmo @CountryCitySwing",
                  value: "Venmo @CountryCitySwing",
                  link: "https://www.venmo.com/u/CountryCitySwing",
                },
                { label: "Cash", value: "Cash" },
                { label: "A friend paid for me", value: "A friend paid for me" },
                { label: "Class Voucher", value: "Class Voucher" },
                { label: "Volunteer", value: "Volunteer" },
              ].map(({ label, value, link }) => (
                <label key={value} className="block text-sm">
                  <input
                    {...register("paymentMethod")}
                    type="radio"
                    value={value}
                    className="mr-2"
                  />
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      className="text-accent underline hover:text-[#CF9FFF]"
                    >
                      {label}
                    </a>
                  ) : (
                    label
                  )}
                </label>
              ))}
            </div>

            {/* Liability release */}
            <div className="bg-neutral-800 p-3 rounded text-sm max-h-40 overflow-y-auto">
              <p>
                <strong>Liability Release and Assumption of Risk:</strong> I, the undersigned
                participant, understand and voluntarily accept the risks associated with participating
                in dance classes provided by Country City Swing at Clearbrook Hospitality, LLC dba Events
                at 1900. I acknowledge that dance activities involve physical exertion and may pose
                inherent risks, including but not limited to falls, collisions, and other unforeseen
                accidents. In consideration for being allowed to participate in the dance class, I hereby
                release and discharge Clearbrook Hospitality, LLC dba Events at 1900 and Country City Swing,
                its instructors, employees, and any affiliated individuals from any and all claims,
                liabilities, demands, actions, or causes of action that may arise out of, or in connection with,
                my participation in the dance class.
                <strong> Medical Information: </strong>
                I certify that I am physically fit to participate in the dance class. In case of injury or medical
                emergency, I authorize Country City Swing and its members to obtain necessary medical treatment for me.
                <strong> Email Subscription: </strong>
                I understand I will be subscribed to the email list to receive non-spammy emails.
                <strong> Photography and Publicity: </strong>
                I grant permission to Country City Swing and their members to use photographs or videos of me taken during
                the dance class for promotional or educational purposes.
              </p>
            </div>

            <label className="block text-sm mt-2">
              <input
                type="checkbox"
                {...register("acceptLiability")}
                className="mr-2"
              />
              I accept
            </label>

            <label className="block text-sm mt-2">
              <input
                type="checkbox"
                {...register("acceptPayment")}
                className="mr-2"
              />
              I understand that I will have to show Venmo payment confirmation
              or pay at the door as well as confirmation of form completion.
            </label>

            {Object.values(errors).length > 0 && (
              <p className="text-red-400 text-sm">
                Please fill in all required fields.
              </p>
            )}

            <button
              disabled={isSubmitting}
              type="submit"
              className="bg-accent text-white px-6 py-2 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] hover:shadow-[0_0_25px_rgba(187,134,252,0.8)]"
            >
              {isSubmitting ? "Submitting..." : "Submit Signup"}
            </button>

            {isSubmitSuccessful && (
              <p className="text-green-400 mt-2">
                ✅ Your signup has been submitted!
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
