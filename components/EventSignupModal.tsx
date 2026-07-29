"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  DEFAULT_TIME_ZONE,
  formatEventScheduleSubtitle,
} from "@/lib/utils/dateHelpers";
import {
  formatPriceChangeDateLabel,
  resolveNextPriceChangeDate,
  resolveSignupListPrice,
} from "@/lib/utils/workshopPricing";
import SignupModalShell from "@/components/SignupModalShell";
import ChoiceCards from "@/components/ChoiceCards";
import {
  PLANNED_CLASS_LEVELS,
  PLANNED_CLASS_LEVEL_DESCRIPTIONS,
  PLANNED_CLASS_LEVEL_LABELS,
  PLANNED_CLASS_LEVEL_NOTE,
} from "@/lib/classLevels";

/* ---------- Validation Schema ---------- */
const REQUIRED_FIELD = "The above is a required field.";

const baseSchema = z.object({
  firstName: z.string().min(1, REQUIRED_FIELD),
  lastName: z.string().min(1, REQUIRED_FIELD),
  email: z
    .string()
    .min(1, REQUIRED_FIELD)
    .email("Please enter a valid email address."),
  beenBefore: z.enum(["First time EVER!", "I've been before!"], {
    errorMap: () => ({ message: REQUIRED_FIELD }),
  }),
  heardAboutUs: z
    .enum(
      [
        "Nashville Palace",
        "Social Media",
        "A friend invited me",
        "Church",
      ],
      { errorMap: () => ({ message: REQUIRED_FIELD }) }
    )
    .optional(),
  paymentMethod: z.enum(["Stripe", "Cash", "CCS TEAM"], {
    errorMap: () => ({ message: REQUIRED_FIELD }),
  }),
  acceptLiability: z.literal(true, {
    errorMap: () => ({ message: REQUIRED_FIELD }),
  }),
  acceptPayment: z.literal(true, {
    errorMap: () => ({ message: REQUIRED_FIELD }),
  }),
  cashPriceAck: z.boolean().optional(),
  acceptRefund: z.boolean().optional(),
  plannedClassLevel: z
    .enum(PLANNED_CLASS_LEVELS, {
      errorMap: () => ({ message: REQUIRED_FIELD }),
    })
    .optional(),
});

function buildSignupSchema(
  requireRefundAck: boolean,
  requirePlannedClass: boolean,
  requireCashPriceAck: boolean
) {
  return baseSchema.superRefine((data, ctx) => {
    if (data.beenBefore === "First time EVER!" && !data.heardAboutUs) {
      ctx.addIssue({
        path: ["heardAboutUs"],
        message: REQUIRED_FIELD,
        code: z.ZodIssueCode.custom,
      });
    }
    if (
      requireCashPriceAck &&
      data.paymentMethod === "Cash" &&
      data.cashPriceAck !== true
    ) {
      ctx.addIssue({
        path: ["cashPriceAck"],
        message: REQUIRED_FIELD,
        code: z.ZodIssueCode.custom,
      });
    }
    if (requireRefundAck && data.acceptRefund !== true) {
      ctx.addIssue({
        path: ["acceptRefund"],
        message: REQUIRED_FIELD,
        code: z.ZodIssueCode.custom,
      });
    }
    if (requirePlannedClass && !data.plannedClassLevel) {
      ctx.addIssue({
        path: ["plannedClassLevel"],
        message: REQUIRED_FIELD,
        code: z.ZodIssueCode.custom,
      });
    }
  });
}

/* ---------- Component ---------- */
export default function EventSignupModal({ event, open, onClose, isInstructor: isInstructorProp }: {
  event: any;
  open: boolean;
  onClose: () => void;
  /** When true, hide "Been before?" and use CCS TEAM when price is $0. Pass from parent when available. */
  isInstructor?: boolean;
}) {
  const refundStatement =
    (typeof event?.refund_statement === "string" && event.refund_statement.trim()) ||
    (typeof event?.refundStatement === "string" && event.refundStatement.trim()) ||
    "";
  const hasRefundStatement = Boolean(refundStatement);
  const requiresPlannedClass =
    event?.all_three_classes === true ||
    event?.allThreeClasses === true ||
    event?.all_three_classes === "true";
  const isWorkshopType =
    (event?.type || "").toString().trim().toLowerCase() === "workshop";
  const schema = useMemo(
    () =>
      buildSignupSchema(
        hasRefundStatement,
        requiresPlannedClass,
        isWorkshopType
      ),
    [hasRefundStatement, requiresPlannedClass, isWorkshopType]
  );

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
  const [hasLoggedInUser, setHasLoggedInUser] = useState(false);
  const [alreadySubscribedToNewsletter, setAlreadySubscribedToNewsletter] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ promotionCodeId: string; code: string; discountedSubtotal?: number } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const beenBefore = watch("beenBefore");
  const paymentMethod = watch("paymentMethod");
  const plannedClassLevel = watch("plannedClassLevel");
  const acceptLiability = watch("acceptLiability");
  const acceptPayment = watch("acceptPayment");
  const acceptRefund = watch("acceptRefund");

  const fieldErrorClass = (hasError: boolean) =>
    hasError
      ? "border-red-500 ring-1 ring-red-500"
      : "border-neutral-700";

  // Use isInstructor from parent when provided (reliable); otherwise from profile fetch in modal
  const isInstructorFromRole = (userRole ?? "").toLowerCase().trim() === "instructor";
  const isInstructor = isInstructorProp ?? isInstructorFromRole;
  // Workshop schedule pricing (public vs CCS team)
  const effectivePrice =
    event != null
      ? resolveSignupListPrice(event, { isCcsTeam: !!isInstructor })
      : undefined;
  const nextPriceChangeDate =
    event != null
      ? resolveNextPriceChangeDate(event, { isCcsTeam: !!isInstructor })
      : null;
  const nextPriceChangeLabel = nextPriceChangeDate
    ? formatPriceChangeDateLabel(nextPriceChangeDate)
    : null;

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
            setHasLoggedInUser(true);
            // Fetch user profile (include role for instructor pricing)
            const { data: profile } = await supabaseBrowser
              .from("profiles")
              .select("first_name, last_name, email, role, newsletter_opt_in")
              .eq("id", user.id)
              .single();

            setUserRole(profile?.role ?? "");
            setAlreadySubscribedToNewsletter(profile?.newsletter_opt_in === true);

            // Build default values object
            const defaultValues: any = {};
            defaultValues.firstName = profile?.first_name || user.user_metadata?.first_name || "";
            defaultValues.lastName = profile?.last_name || user.user_metadata?.last_name || "";
            defaultValues.email = profile?.email || user.email || "";
            const roleLower = (profile?.role ?? "").toLowerCase().trim();
            if (roleLower === "instructor") {
              defaultValues.beenBefore = "I've been before!";
              const teamEffective = resolveSignupListPrice(event ?? {}, { isCcsTeam: true });
              if (teamEffective === 0) defaultValues.paymentMethod = "CCS TEAM";
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
      setHasLoggedInUser(false);
      setAlreadySubscribedToNewsletter(false);
      setNewsletterOptIn(false);
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
      setValue("cashPriceAck", true, { shouldValidate: false });
    }
  }, [amountDueIsZero, setValue]);

  // Cash price ack: Workshop-only (price schedules). Auto-ack otherwise so validation passes.
  useEffect(() => {
    const needsAck =
      isWorkshopType &&
      paymentMethod === "Cash" &&
      !amountDueIsZero &&
      effectivePrice != null &&
      effectivePrice > 0;
    if (!needsAck) {
      setValue("cashPriceAck", true, { shouldValidate: false });
    } else {
      setValue("cashPriceAck", false, { shouldValidate: false });
    }
  }, [isWorkshopType, paymentMethod, amountDueIsZero, effectivePrice, setValue]);

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

      // If user opted into newsletter, update profile (fire-and-forget)
      if (newsletterOptIn && hasLoggedInUser) {
        supabaseBrowser.auth.getSession().then(({ data }) => {
          const token = data.session?.access_token;
          if (token) {
            fetch("/api/profile", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ newsletter_opt_in: true }),
            }).catch(() => {});
          }
        });
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
            <strong>When:</strong>{" "}
            {event.starts_at
              ? formatEventScheduleSubtitle(
                  event.starts_at,
                  (event as any).ends_at,
                  (event as any).time_zone || DEFAULT_TIME_ZONE,
                  (event as any).type
                )
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
                className={`w-1/2 px-3 py-2 rounded bg-neutral-800 border ${fieldErrorClass(!!errors.firstName)}`}
              />
              <input
                {...register("lastName")}
                placeholder="Last Name"
                className={`w-1/2 px-3 py-2 rounded bg-neutral-800 border ${fieldErrorClass(!!errors.lastName)}`}
              />
            </div>

            {/* Email */}
            <input
              {...register("email")}
              type="email"
              placeholder="Email"
              className={`w-full px-3 py-2 rounded bg-neutral-800 border ${fieldErrorClass(!!errors.email)}`}
            />

            {requiresPlannedClass && (
              <div>
                <p className="font-medium mb-2">
                  Which class do you plan on taking? <span className="text-red-400">*</span>
                </p>
                <ChoiceCards
                  name="plannedClassLevel"
                  aria-label="Which class do you plan on taking?"
                  hasError={!!errors.plannedClassLevel}
                  value={plannedClassLevel}
                  onChange={(next) =>
                    setValue("plannedClassLevel", next as typeof plannedClassLevel, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  options={PLANNED_CLASS_LEVELS.map((level) => ({
                    value: level,
                    label: PLANNED_CLASS_LEVEL_LABELS[level],
                    description: PLANNED_CLASS_LEVEL_DESCRIPTIONS[level],
                  }))}
                />
                <input type="hidden" {...register("plannedClassLevel")} />
                {errors.plannedClassLevel && (
                  <p className="text-red-400 text-sm mt-2">
                    {String(errors.plannedClassLevel.message)}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  {PLANNED_CLASS_LEVEL_NOTE}
                </p>
              </div>
            )}

            {hasLoggedInUser && !alreadySubscribedToNewsletter && (
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={newsletterOptIn}
                  onChange={(e) => setNewsletterOptIn(e.target.checked)}
                  className="w-4 h-4 accent-yellow-400"
                />
                Add me to the weekly newsletter (schedule + workshop highlights, Sundays)
              </label>
            )}

            {/* Been before — hidden for instructors (auto "I've been before!") */}
            {!isInstructor && (
              <div>
                <p className="font-medium mb-2">
                  Have you been to a CCS event before?
                </p>
                <ChoiceCards
                  name="beenBefore"
                  aria-label="Have you been to a CCS event before?"
                  hasError={!!errors.beenBefore}
                  value={beenBefore}
                  onChange={(next) =>
                    setValue("beenBefore", next as typeof beenBefore, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  options={[
                    { value: "First time EVER!", label: "First time EVER!" },
                    { value: "I've been before!", label: "I've been before!" },
                  ]}
                />
                <input type="hidden" {...register("beenBefore")} />
                {errors.beenBefore && (
                  <p className="text-red-400 text-sm mt-2">
                    {String(errors.beenBefore.message)}
                  </p>
                )}

                {beenBefore === "First time EVER!" && (
                  <div className="mt-3 ml-1 border-l-2 border-yellow-400 pl-3">
                    <p className="text-sm mb-2 font-medium text-yellow-300">
                      How did you hear about us?
                    </p>
                    <ChoiceCards
                      name="heardAboutUs"
                      aria-label="How did you hear about us?"
                      hasError={!!errors.heardAboutUs}
                      value={watch("heardAboutUs")}
                      onChange={(next) =>
                        setValue("heardAboutUs", next as any, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                      options={[
                        { value: "Nashville Palace", label: "Nashville Palace" },
                        { value: "Social Media", label: "Social Media" },
                        { value: "A friend invited me", label: "A friend invited me" },
                        { value: "Church", label: "Church" },
                      ]}
                    />
                    <input type="hidden" {...register("heardAboutUs")} />
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
                <p className="font-medium mb-2">
                  Payment Method
                  {amountDue != null && effectivePrice != null && effectivePrice > 0 && (
                    <span key={`amount-${amountDue}-${appliedPromo?.discountedSubtotal ?? "full"}`}>
                      : ${amountDue.toFixed(2)}
                      {typeof appliedPromo?.discountedSubtotal === "number" && " (after discount)"}
                    </span>
                  )}
                </p>
                <ChoiceCards
                  name="paymentMethod"
                  aria-label="Payment Method"
                  hasError={!!errors.paymentMethod}
                  value={paymentMethod}
                  onChange={(next) =>
                    setValue("paymentMethod", next as typeof paymentMethod, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  options={[
                    { value: "Stripe", label: "Stripe (Credit/Debit Card)" },
                    { value: "Cash", label: "Cash" },
                  ]}
                />
                <input type="hidden" {...register("paymentMethod")} />
                {errors.paymentMethod && (
                  <p className="text-red-400 text-sm mt-2">
                    {String(errors.paymentMethod.message)}
                  </p>
                )}
                {paymentMethod === "Stripe" && effectivePrice != null && effectivePrice > 0 && (
                  <p className="text-sm text-gray-300 mt-2">
                    With Stripe, the amount charged is fixed at checkout and will not change if the event price changes later.
                  </p>
                )}
                {isWorkshopType &&
                  paymentMethod === "Cash" &&
                  effectivePrice != null &&
                  effectivePrice > 0 && (
                  <div
                    className={`mt-3 rounded border p-3 text-sm text-yellow-100 ${
                      errors.cashPriceAck
                        ? "border-red-500 ring-1 ring-red-500 bg-red-500/10"
                        : "border-yellow-500/60 bg-yellow-500/15"
                    }`}
                  >
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        {...register("cashPriceAck")}
                        className="mt-1"
                      />
                      <span>
                        {nextPriceChangeLabel
                          ? `Cash must be paid before the next price change on ${nextPriceChangeLabel}, or the amount owed will change regardless of when you registered. Contact CCS with any questions.`
                          : "Cash is settled at the current event price when you pay (at the door or via the email payment link), which may differ from the price shown at registration. Contact CCS with any questions."}
                      </span>
                    </label>
                    {errors.cashPriceAck && (
                      <p className="text-red-400 text-sm mt-1">{errors.cashPriceAck.message}</p>
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
            <div
              className={`bg-neutral-800 p-3 rounded text-sm max-h-40 overflow-y-auto ${
                errors.acceptLiability ? "ring-2 ring-red-500" : ""
              }`}
            >
              <p>
                <strong>Liability Release and Assumption of Risk:</strong> I, the undersigned
                participant, understand and voluntarily accept the risks associated with participating
                in dance classes provided by Country City Swing at Dance Nashville, 630 Rundle Ave. I 
                acknowledge that dance activities involve physical exertion and may pose
                inherent risks, including but not limited to falls, collisions, and other unforeseen
                accidents. In consideration for being allowed to participate in the dance class, I hereby
                release and discharge Dance Nashville and Country City Swing,
                its instructors, employees, and any affiliated individuals from any and all claims,
                liabilities, demands, actions, or causes of action that may arise out of, or in connection with,
                my participation in the event.
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

            <button
              type="button"
              aria-pressed={acceptLiability === true}
              onClick={() =>
                setValue(
                  "acceptLiability",
                  acceptLiability === true ? (undefined as unknown as true) : true,
                  { shouldValidate: true, shouldDirty: true }
                )
              }
              className={`mt-2 w-full rounded-lg border px-4 py-3.5 text-left text-base font-semibold transition-colors ${
                acceptLiability === true
                  ? "border-green-500 bg-green-500/10 text-green-300 ring-1 ring-green-500"
                  : "border-red-500 bg-red-500/10 text-red-200 ring-1 ring-red-500 hover:bg-red-500/15"
              }`}
            >
              {acceptLiability === true ? "Agreed" : "I Agree"}
            </button>
            {errors.acceptLiability && (
              <p className="text-red-400 text-sm mt-1">{String(errors.acceptLiability.message)}</p>
            )}

            <button
              type="button"
              aria-pressed={acceptPayment === true}
              onClick={() =>
                setValue(
                  "acceptPayment",
                  acceptPayment === true ? (undefined as unknown as true) : true,
                  { shouldValidate: true, shouldDirty: true }
                )
              }
              className={`mt-2 w-full rounded-lg border px-4 py-3.5 text-left text-base font-medium transition-colors ${
                acceptPayment === true
                  ? "border-green-500 bg-green-500/10 text-green-200 ring-1 ring-green-500"
                  : "border-red-500 bg-red-500/10 text-red-100 ring-1 ring-red-500 hover:bg-red-500/15"
              }`}
            >
              <span className="block">
                I understand that I will need to complete payment (via Stripe or cash at the door) and show confirmation of form completion.
              </span>
              {acceptPayment === true && (
                <span className="mt-2 block font-semibold text-green-300">
                  Confirmed ✅
                </span>
              )}
            </button>
            {errors.acceptPayment && (
              <p className="text-red-400 text-sm mt-1">{String(errors.acceptPayment.message)}</p>
            )}

            {hasRefundStatement && (
              <div
                className={`mt-3 rounded-lg border bg-gradient-to-b from-red-500/10 to-transparent p-4 ${
                  errors.acceptRefund
                    ? "border-red-500 ring-2 ring-red-500"
                    : "border-red-500/50"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-2">
                  Refund policy
                </p>
                <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto pr-1">
                  {refundStatement}
                </div>
                <button
                  type="button"
                  aria-pressed={acceptRefund === true}
                  onClick={() =>
                    setValue("acceptRefund", acceptRefund === true ? false : true, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  className={`mt-4 w-full rounded-lg border px-4 py-3.5 text-left text-base font-medium transition-colors ${
                    acceptRefund === true
                      ? "border-green-500 bg-green-500/10 text-green-200 ring-1 ring-green-500"
                      : "border-red-500 bg-red-500/10 text-red-100 ring-1 ring-red-500 hover:bg-red-500/15"
                  }`}
                >
                  <span className="block">
                    I have read and agree to the refund policy.
                  </span>
                  {acceptRefund === true && (
                    <span className="mt-2 block font-semibold text-green-300">
                      Confirmed ✅
                    </span>
                  )}
                </button>
                {errors.acceptRefund && (
                  <p className="text-red-400 text-sm mt-1">{errors.acceptRefund.message}</p>
                )}
              </div>
            )}

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
