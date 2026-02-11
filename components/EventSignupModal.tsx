"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { formatEventDateInChicago, formatEventTimeInChicago } from "@/lib/utils/dateHelpers";
import SignupModalShell from "@/components/SignupModalShell";

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
    "Stripe",
    "Cash",
    "A friend paid for me",
    "Class Voucher",
    "CCS TEAM",
  ]),
  /** When payment method is "A friend paid for me", how did they pay? */
  friendPaidHow: z.enum(["Cash", "Stripe"]).optional(),
  acceptLiability: z.literal(true, {
    errorMap: () => ({ message: "You must accept the liability release" }),
  }),
  acceptPayment: z.literal(true, {
    errorMap: () => ({
      message:
        "You must acknowledge payment confirmation requirement",
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
  if (data.paymentMethod === "A friend paid for me" && !data.friendPaidHow) {
    ctx.addIssue({
      path: ["friendPaidHow"],
      message: "Please select how they paid.",
      code: z.ZodIssueCode.custom,
    });
  }
});

/* ---------- Component ---------- */
export default function EventSignupModal({ event, open, onClose, isInstructor: isInstructorProp }: {
  event: any;
  open: boolean;
  onClose: () => void;
  /** When true, hide "Been before?" and use CCS TEAM when price is $0. Pass from parent when available. */
  isInstructor?: boolean;
}) {
  const {
    register,
    watch,
    unregister,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
    reset,
    setValue,
  } = useForm({ resolver: zodResolver(schema) });

  const [loadingUser, setLoadingUser] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ promotionCodeId: string; code: string; discountedSubtotal?: number } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const beenBefore = watch("beenBefore");
  const paymentMethod = watch("paymentMethod");

  // Use isInstructor from parent when provided (reliable); otherwise from profile fetch in modal
  const isInstructorFromRole = (userRole ?? "").toLowerCase().trim() === "instructor";
  const isInstructor = isInstructorProp ?? isInstructorFromRole;
  const effectivePrice =
    event != null
      ? isInstructor && event.ccs_team_price != null
        ? Number(event.ccs_team_price)
        : event.price != null
          ? Number(event.price)
          : undefined
      : undefined;

  // Price shown next to Payment Method: updates live when the code is validated (Apply), not on form submit
  const amountDue =
    effectivePrice != null && typeof appliedPromo?.discountedSubtotal === "number"
      ? appliedPromo.discountedSubtotal
      : effectivePrice;

  // Fetch and prefill user information when modal opens
  useEffect(() => {
    if (open) {
      async function loadUserInfo() {
        setLoadingUser(true);
        try {
          const { data: { user } } = await supabaseBrowser.auth.getUser();
          
          if (user) {
            // Fetch user profile (include role for instructor pricing)
            const { data: profile } = await supabaseBrowser
              .from("profiles")
              .select("first_name, last_name, email, role")
              .eq("id", user.id)
              .single();

            setUserRole(profile?.role ?? "");

            // Build default values object
            const defaultValues: any = {};
            defaultValues.firstName = profile?.first_name || user.user_metadata?.first_name || "";
            defaultValues.lastName = profile?.last_name || user.user_metadata?.last_name || "";
            defaultValues.email = profile?.email || user.email || "";
            const roleLower = (profile?.role ?? "").toLowerCase().trim();
            if (roleLower === "instructor") {
              defaultValues.beenBefore = "I've been before!";
              const teamPrice = event?.ccs_team_price != null ? Number(event.ccs_team_price) : undefined;
              if (teamPrice === 0) defaultValues.paymentMethod = "CCS TEAM";
            }

            // Use reset to set all values at once - this properly updates the form (include instructor defaults so reset doesn't clear them)
            if (Object.keys(defaultValues).length > 0) {
              reset(defaultValues);
            }
          }
        } catch (err) {
          console.error("Error loading user info:", err);
        } finally {
          setLoadingUser(false);
        }
      }
      
      // Small delay to ensure form is ready
      const timer = setTimeout(() => {
        loadUserInfo();
      }, 50);
      
      return () => clearTimeout(timer);
    } else {
      setUserRole("");
      // Reset form and promo state when modal closes
      reset();
      setPromoCodeInput("");
      setAppliedPromo(null);
      setPromoError("");
      setSubmitSuccessMessage("");
      setAlreadyRegistered(null);
    }
  }, [open, reset]);

  // Unregister "heardAboutUs" when hidden
  useEffect(() => {
    if (beenBefore !== "First time EVER!") {
      unregister("heardAboutUs");
    }
  }, [beenBefore, unregister]);

  // When promo brings total to $0, payment method is not required (server will set Cash)
  const amountDueIsZero =
    !(isInstructor && effectivePrice === 0) &&
    appliedPromo?.discountedSubtotal != null &&
    appliedPromo.discountedSubtotal <= 0.5;

  // When promo brings total to $0, set paymentMethod to Cash so required field is filled for validation
  useEffect(() => {
    if (amountDueIsZero) {
      setValue("paymentMethod", "Cash", { shouldValidate: false });
    }
  }, [amountDueIsZero, setValue]);

  // Instructor: keep hidden fields filled so validation passes (beenBefore + paymentMethod when $0)
  useEffect(() => {
    if (!open || !isInstructor) return;
    setValue("beenBefore", "I've been before!", { shouldValidate: false });
    if (effectivePrice === 0) {
      setValue("paymentMethod", "CCS TEAM", { shouldValidate: false });
    }
  }, [open, isInstructor, effectivePrice, setValue]);

  // Close with ESC key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [submitError, setSubmitError] = useState("");
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState<{
    eventTitle: string;
    eventDate: string;
  } | null>(null);

  const applyPromo = async () => {
    const code = promoCodeInput.trim();
    if (!code) {
      setPromoError("Please enter a promotion code.");
      return;
    }
    setPromoError("");
    setPromoLoading(true);
    try {
      // Validate code and get discounted amount; UI price updates live when this returns (not on submit)
      const res = await fetch("/api/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          effectivePrice != null && Number.isFinite(effectivePrice)
            ? JSON.stringify({ code, subtotal: effectivePrice })
            : JSON.stringify({ code }),
      });
      const result = await res.json();
      if (result.valid && result.promotionCodeId) {
        const raw = result.discountedSubtotal ?? result.discounted_subtotal;
        const discounted =
          typeof raw === "number" && Number.isFinite(raw)
            ? raw
            : typeof raw === "string"
              ? (() => {
                  const n = parseFloat(raw);
                  return Number.isFinite(n) ? n : undefined;
                })()
              : undefined;
        // Update state immediately so Payment Method price updates live (no form submit)
        setAppliedPromo({
          promotionCodeId: result.promotionCodeId,
          code: result.code ?? code,
          discountedSubtotal: discounted,
        });
      } else {
        setAppliedPromo(null);
        setPromoError(result.message || "Invalid promotion code.");
      }
    } catch {
      setAppliedPromo(null);
      setPromoError("Could not validate code.");
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromo = () => {
    setAppliedPromo(null);
    setPromoCodeInput("");
    setPromoError("");
  };

  const onSubmit = async (data: any) => {
    setSubmitError("");
    setAlreadyRegistered(null);
    try {
      // Ensure event and price are always sent so server can apply promo for Cash (use effective price for instructors)
      const eventPayload = event
        ? { ...event, price: effectivePrice ?? event.price ?? (event as Record<string, unknown>).price }
        : undefined;
      const body: Record<string, unknown> = { ...data, event: eventPayload };
      if (isInstructor) {
        body.beenBefore = "I've been before!";
        body.is_ccs_team = true;
        if (effectivePrice === 0) body.paymentMethod = "CCS TEAM";
      }
      // Send promo when applied (for any payment method) so server can apply discount / set paid when $0
      if (appliedPromo) {
        body.promotionCodeId = appliedPromo.promotionCodeId;
        body.discountedSubtotal =
          appliedPromo.discountedSubtotal !== undefined && appliedPromo.discountedSubtotal !== null
            ? appliedPromo.discountedSubtotal
            : undefined;
      }
      // When discount brings total to $0, payment method was not required; set to Cash for server
      const amountDue = appliedPromo?.discountedSubtotal != null ? appliedPromo.discountedSubtotal : effectivePrice;
      if (amountDue != null && amountDue <= 0.5 && appliedPromo) {
        body.paymentMethod = "Cash";
      }
      if (data.paymentMethod === "A friend paid for me" && data.friendPaidHow) {
        body.friendPaidHow = data.friendPaidHow;
      }
      const response = await fetch("/api/event-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.alreadyRegistered && result.eventTitle) {
          setAlreadyRegistered({
            eventTitle: result.eventTitle,
            eventDate: result.eventDate || "",
          });
          return;
        }
        const errorMsg = result.error || "Failed to submit signup";
        const details = result.details ? ` (${result.details})` : "";
        setSubmitError(errorMsg + details);
        throw new Error(errorMsg);
      }

      if (result.noRedirect) {
        setSubmitError("");
        setSubmitSuccessMessage(result.message || "Your signup has been submitted!");
        reset();
        setTimeout(() => {
          setSubmitSuccessMessage("");
          onClose();
        }, 2500);
        return;
      }
      const effectivePaymentMethod = isInstructor && effectivePrice === 0 ? "CCS TEAM" : data.paymentMethod;
      if (effectivePaymentMethod === "Stripe" && result.redirect) {
        window.location.href = result.redirect;
        return;
      }

      reset();
      onClose();
    } catch (error: any) {
      console.error("Signup error:", error);
      // Error is already set in setSubmitError above
    }
  };

  if (!open || !event) return null;

  return (
    <SignupModalShell title={event.title} onClose={onClose}>
      <p className="text-gray-300 text-sm">
            <strong>Date:</strong>{" "}
            {formatEventDateInChicago(event.starts_at)}
            {event.starts_at
              ? ` • ${formatEventTimeInChicago(event.starts_at)}`
              : ""}{" "}
            <br />
            <strong>Location:</strong> {event.location}
            {effectivePrice != null && (
              <>
                <br />
                <strong>Price:</strong>{" "}
                {amountDue != null && typeof appliedPromo?.discountedSubtotal === "number" ? (
                  <>
                    <span className="text-gray-400 line-through">${effectivePrice.toFixed(2)}</span>{" "}
                    ${amountDue.toFixed(2)}
                    <span className="text-green-400 text-sm ml-1">(after discount)</span>
                  </>
                ) : (
                  <>${effectivePrice.toFixed(2)}</>
                )}
                {isInstructor && event?.ccs_team_price != null && (
                  <span className="text-yellow-400 text-sm ml-1">(CCS Team)</span>
                )}
              </>
            )}
          </p>

          {alreadyRegistered && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/60 bg-amber-950/40 p-4 text-amber-100 shadow-lg"
            >
              <p className="font-semibold text-amber-200">
                You&apos;re already registered for this event
              </p>
              <p className="mt-2 text-sm">
                <span className="font-medium">{alreadyRegistered.eventTitle}</span>
                {alreadyRegistered.eventDate && (
                  <>
                    <br />
                    <span className="text-amber-200/90">{alreadyRegistered.eventDate}</span>
                  </>
                )}
              </p>
              <p className="mt-2 text-sm text-amber-200/80">
                No need to sign up again — we&apos;ll see you there!
              </p>
              <button
                type="button"
                onClick={() => setAlreadyRegistered(null)}
                className="mt-3 rounded-md bg-amber-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                OK
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Hidden fields for instructors so validation receives values (no visible "Been before?" / "Payment" sections) */}
            {isInstructor && (
              <>
                <input type="hidden" {...register("beenBefore", { value: "I've been before!" })} />
                {effectivePrice === 0 && (
                  <input type="hidden" {...register("paymentMethod", { value: "CCS TEAM" })} />
                )}
              </>
            )}

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

            {/* Been before — hidden for instructors (auto "I've been before!") */}
            {!isInstructor && (
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
            )}

            {/* Promotion code — always above Payment Method when there is a price */}
            {effectivePrice != null && effectivePrice > 0 && (
              <div>
                <p className="font-medium mb-1">Promotion code</p>
                {appliedPromo ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-green-400 text-sm">
                        Applied: {appliedPromo.code}
                        {appliedPromo.discountedSubtotal != null && (
                          <span className="text-gray-300 ml-1">
                            — Amount due: ${appliedPromo.discountedSubtotal.toFixed(2)}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={removePromo}
                        className="text-sm text-gray-400 hover:text-white underline"
                      >
                        Remove
                      </button>
                    </div>
                    {appliedPromo.discountedSubtotal != null && appliedPromo.discountedSubtotal <= 0.5 && (
                      <p className="text-green-400 text-sm">
                        Your total after discount is $0. No payment required.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="text"
                      value={promoCodeInput}
                      onChange={(e) => {
                        setPromoCodeInput(e.target.value);
                        setPromoError("");
                      }}
                      placeholder="Enter code"
                      className="flex-1 min-w-[120px] px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
                      disabled={promoLoading}
                    />
                    <button
                      type="button"
                      onClick={applyPromo}
                      disabled={promoLoading}
                      className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm font-medium disabled:opacity-50"
                    >
                      {promoLoading ? "Checking…" : "Apply"}
                    </button>
                  </div>
                )}
                {promoError && (
                  <p className="text-red-400 text-sm mt-1">{promoError}</p>
                )}
              </div>
            )}

            {/* Payment Method — hidden for instructors when CCS team price is $0; hidden when promo brings total to $0 */}
            {!(isInstructor && effectivePrice === 0) && !(appliedPromo?.discountedSubtotal != null && appliedPromo.discountedSubtotal <= 0.5) && (
              <div>
                <p className="font-medium mb-1">
                  Payment Method
                  {amountDue != null && effectivePrice != null && effectivePrice > 0 && (
                    <span key={`amount-${amountDue}-${appliedPromo?.discountedSubtotal ?? "full"}`}>
                      : ${amountDue.toFixed(2)}
                      {typeof appliedPromo?.discountedSubtotal === "number" && " (after discount)"}
                    </span>
                  )}
                </p>
                {[
                  { label: "Stripe (Credit/Debit Card)", value: "Stripe" },
                  { label: "Cash", value: "Cash" },
                  { label: "A friend paid for me", value: "A friend paid for me" },
                  { label: "Class Voucher", value: "Class Voucher" },
                ].map(({ label, value }) => (
                  <label key={value} className="block text-sm">
                    <input
                      {...register("paymentMethod")}
                      type="radio"
                      value={value}
                      className="mr-2"
                    />
                    {label}
                  </label>
                ))}
                {paymentMethod === "A friend paid for me" && (
                  <div className="mt-3 ml-4 border-l-2 border-yellow-400 pl-3">
                    <p className="text-sm mb-1 font-medium text-yellow-300">
                      How did they pay?
                    </p>
                    {[
                      { label: "Cash", value: "Cash" as const },
                      { label: "Stripe (card online)", value: "Stripe" as const },
                    ].map(({ label, value }) => (
                      <label key={value} className="block text-sm">
                        <input
                          {...register("friendPaidHow")}
                          type="radio"
                          value={value}
                          className="mr-2"
                        />
                        {label}
                      </label>
                    ))}
                    {errors.friendPaidHow && (
                      <p className="text-red-400 text-sm mt-1">
                        {String(errors.friendPaidHow.message)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* When discount brings total to $0: no payment radios shown; hidden input fills required paymentMethod with Cash */}
            {amountDueIsZero && (
              <input type="hidden" {...register("paymentMethod")} value="Cash" readOnly />
            )}

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
              I understand that I will need to complete payment (via Stripe or cash at the door) and show confirmation of form completion.
            </label>

            {Object.values(errors).length > 0 && (
              <p className="text-red-400 text-sm">
                Please fill in all required fields.
              </p>
            )}

            {submitSuccessMessage && (
              <div className="bg-green-900/20 border border-green-500 rounded-lg p-3">
                <p className="text-green-400 text-sm">{submitSuccessMessage}</p>
              </div>
            )}
            {submitError && (
              <div className="bg-red-900/20 border border-red-500 rounded-lg p-3">
                <p className="text-red-400 text-sm">{submitError}</p>
              </div>
            )}

            <div className="flex justify-center">
              <button
                disabled={isSubmitting}
                type="submit"
                className="bg-accent text-white px-6 py-2 rounded-md font-semibold hover:bg-[#CF9FFF] transition-all shadow-[0_0_15px_rgba(187,134,252,0.5)] hover:shadow-[0_0_25px_rgba(187,134,252,0.8)]"
              >
                {isSubmitting ? "Submitting..." : "Submit Signup"}
              </button>
            </div>

            {isSubmitSuccessful && (
              <p className="text-green-400 mt-2">
                ✅ Your signup has been submitted!
              </p>
            )}
          </form>
    </SignupModalShell>
  );
}
