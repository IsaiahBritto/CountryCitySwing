import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { computeCheckInArrivalBuckets } from "@/lib/utils/checkInArrivalBuckets";
import {
  assertRegistrationEventMutateAccess,
  assertRegistrationEventViewAccess,
  loadRegistrationEvent,
  requireRegistrationAuth,
  type RegistrationEventRow,
} from "@/lib/registrationAuth";
import {
  normalizePriceChanges,
  resolveDueNowForSignup,
  resolvePaidAmountOptions,
} from "@/lib/utils/workshopPricing";
import { DEFAULT_TIME_ZONE } from "@/lib/utils/dateHelpers";
import { roundCurrency } from "@/lib/utils/paymentHelpers";
import {
  buildPrincipalRefundedMap,
  withNetPaidAmount,
} from "@/lib/utils/signupNetPaid";
import { computeClassLevelSummary, PLANNED_CLASS_LEVELS, applyClassSignupCounts, normalizeSignupEmail, isPlannedClassLevel, type PlannedClassLevel } from "@/lib/classLevels";
import { loadClassSignupCountsByEmail } from "@/lib/utils/classCheckInCounts";
import { canViewClassLevelBreakdown } from "@/lib/classLevelRegistrationAccess";
import {
  computeUpperLevelBreakdown,
  countUpperLevelTowardCapacity,
  isDanceRole,
  isUpperLevelRoleFull,
  validatePlannedClassAndRole,
  type DanceRole,
} from "@/lib/upperLevelRegistration";

const COMP_SIGNUPS_SELECT =
  "id,event_id,event_title,strictly_selected,strictly_lead_first_name,strictly_lead_last_name,strictly_lead_email,strictly_follow_first_name,strictly_follow_last_name,strictly_follow_email,jnj_selected,jnj_lead_first_name,jnj_lead_last_name,jnj_lead_email,jnj_follow_first_name,jnj_follow_last_name,jnj_follow_email,payment_method,amount_owed,paid,checked_in,checked_in_at,created_at,is_ccs_team,stripe_tax_amount,stripe_processing_fee,stripe_session_id,stripe_payment_intent_id,refunded_or_cancelled";

const SIGNUPS_SELECT =
  "id,event_id,event_title,first_name,last_name,email,payment_method,paid,checked_in,checked_in_at,created_at,is_ccs_team,amount_owed,amount_due,amount_paid,stripe_tax_amount,stripe_processing_fee,stripe_session_id,stripe_payment_intent_id,refunded_or_cancelled,free_via_promotion_code,used_promotion_code,planned_class_level,planned_dance_role";

const EVENT_PRICING_SELECT =
  "id,type,starts_at,ends_at,time_zone,price,price_changes,ccs_team_price,ccs_team_price_changes,all_three_classes,upper_level_lead_capacity,upper_level_follow_capacity";

const EVENT_META_CACHE_TTL_MS = 60_000; // 60 seconds
const eventMetaCache = new Map<
  string,
  { event: RegistrationEventRow; ts: number }
>();

function getCachedEventMeta(eventId: string): RegistrationEventRow | null {
  const entry = eventMetaCache.get(eventId);
  if (!entry) return null;
  if (Date.now() - entry.ts > EVENT_META_CACHE_TTL_MS) {
    eventMetaCache.delete(eventId);
    return null;
  }
  return entry.event;
}

function setCachedEventMeta(eventId: string, event: RegistrationEventRow) {
  eventMetaCache.set(eventId, { event, ts: Date.now() });
}

async function getEventMetaForAccess(
  eventId: string
): Promise<{ event: RegistrationEventRow | null; error?: NextResponse }> {
  let eventMeta = getCachedEventMeta(eventId);
  if (eventMeta) return { event: eventMeta };

  const loaded = await loadRegistrationEvent(eventId);
  if (!loaded.event) return loaded;
  setCachedEventMeta(eventId, loaded.event);
  return { event: loaded.event };
}

async function principalRefundedBySignupIds(
  signupIds: string[],
  isComp: boolean
): Promise<Map<string, number>> {
  if (signupIds.length === 0) return new Map();
  const col = isComp ? "comp_signup_id" : "signup_id";
  const { data, error } = await supabaseServer
    .from("signup_refunds")
    .select(`${col},principal_refunded`)
    .in(col, signupIds)
    .eq("refunded_or_cancelled_result", "partial");
  if (error) {
    console.error("signups: load principal refunds", error);
    return new Map();
  }
  return buildPrincipalRefundedMap(
    (data ?? []) as { signup_id?: string; comp_signup_id?: string; principal_refunded?: number }[],
    col
  );
}

// GET - Fetch signups for an event (admin, instructor, or social registration viewer)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireRegistrationAuth(req);
    if (!auth.ok) return auth.response;

    // Get event_id from query params
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id");
    const filter = searchParams.get("filter") || "all"; // all, not_checked_in, checked_in

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing event_id parameter" },
        { status: 400 }
      );
    }

    const { event: eventMeta, error: eventError } = await getEventMetaForAccess(eventId);
    if (eventError) return eventError;
    if (!eventMeta) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const accessErr = assertRegistrationEventViewAccess(auth.access.level, eventMeta);
    if (accessErr) return accessErr;

    const eventStartsAt = eventMeta.starts_at;
    const isComp = (eventMeta.type ?? "").toLowerCase() === "comp";

    if (isComp) {
      const { data: compList, error: compError } = await supabaseServer
        .from("comp_signups")
        .select(COMP_SIGNUPS_SELECT)
        .eq("event_id", eventId)
        .neq("refunded_or_cancelled", "cancelled")
        .order("created_at", { ascending: false });

      if (compError) {
        console.error("Error fetching comp signups:", compError);
        return NextResponse.json(
          {
            error: "Failed to fetch comp signups",
            details: compError.message,
          },
          { status: 500 }
        );
      }

      const list = compList || [];
      const refundedPrincipal = await principalRefundedBySignupIds(
        list.map((c: { id: string | number }) => String(c.id)),
        true
      );
      const enrichedList = withNetPaidAmount(list, refundedPrincipal);
      const compCheckedIn = enrichedList.filter((c) => c.checked_in === true).length;
      const check_in_arrival_buckets = computeCheckInArrivalBuckets(
        enrichedList,
        eventStartsAt
      );
      let compSignups = enrichedList;
      if (filter === "not_checked_in") {
        compSignups = enrichedList.filter((c) => c.checked_in !== true);
      } else if (filter === "checked_in") {
        compSignups = enrichedList.filter((c) => c.checked_in === true);
      }

      return NextResponse.json({
        signups: [],
        compSignups,
        isComp: true,
        total: enrichedList.length,
        checked_in: compCheckedIn,
        check_in_arrival_buckets,
      });
    }

    // Regular event: fetch from signups table
    const { data: allSignups, error } = await supabaseServer
      .from("signups")
      .select(SIGNUPS_SELECT)
      .eq("event_id", eventId)
      .neq("refunded_or_cancelled", "cancelled")
      .order("first_name", { ascending: true });

    if (error) {
      console.error("Error fetching signups:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch signups",
          details: error.message,
        },
        { status: 500 }
      );
    }

    const list = allSignups || [];
    const refundedPrincipal = await principalRefundedBySignupIds(
      list.map((s: { id: string | number }) => String(s.id)),
      false
    );
    const enrichedList = withNetPaidAmount(list, refundedPrincipal);
    const total = enrichedList.length;
    const checked_in = enrichedList.filter((s) => s.checked_in === true).length;
    const check_in_arrival_buckets = computeCheckInArrivalBuckets(
      enrichedList,
      eventStartsAt
    );

    // Apply filter to list
    let signups = enrichedList;
    if (filter === "not_checked_in") {
      signups = enrichedList.filter((s) => s.checked_in !== true);
    } else if (filter === "checked_in") {
      signups = enrichedList.filter((s) => s.checked_in === true);
    }

    const eventPricing = await loadEventPricing(eventId);
    const allThreeClasses = eventPricing?.all_three_classes === true;
    const showClassLevelBreakdown = canViewClassLevelBreakdown(
      auth.access.userId,
      auth.access.level,
      eventMeta
    );
    let classLevelSummary =
      allThreeClasses && showClassLevelBreakdown
        ? computeClassLevelSummary(enrichedList)
        : null;
    if (classLevelSummary) {
      const rosterEmails = PLANNED_CLASS_LEVELS.flatMap((level) =>
        classLevelSummary!.roster[level].map((entry) => entry.email)
      );
      const classSignupCounts = await loadClassSignupCountsByEmail(rosterEmails);
      classLevelSummary = applyClassSignupCounts(classLevelSummary, classSignupCounts);
    }

    const upperLevelBreakdown =
      allThreeClasses && showClassLevelBreakdown && eventPricing
        ? computeUpperLevelBreakdown(enrichedList, {
            upper_level_lead_capacity:
              eventPricing.upper_level_lead_capacity ?? null,
            upper_level_follow_capacity:
              eventPricing.upper_level_follow_capacity ?? null,
          })
        : null;
    if (upperLevelBreakdown) {
      const rosterEmails = [
        ...upperLevelBreakdown.public.lead.roster,
        ...upperLevelBreakdown.public.follow.roster,
        ...upperLevelBreakdown.ccsTeam.lead.roster,
        ...upperLevelBreakdown.ccsTeam.follow.roster,
      ].map((entry) => entry.email);
      const classSignupCounts = await loadClassSignupCountsByEmail(rosterEmails);
      for (const section of [
        upperLevelBreakdown.public,
        upperLevelBreakdown.ccsTeam,
        upperLevelBreakdown.totals,
      ]) {
        for (const role of ["lead", "follow"] as const) {
          section[role].roster = section[role].roster.map((entry) => ({
            ...entry,
            class_signup_count:
              classSignupCounts.get(normalizeSignupEmail(entry.email) ?? "") ?? 0,
          }));
        }
      }
    }

    return NextResponse.json({
      signups,
      compSignups: [],
      isComp: false,
      total,
      checked_in,
      check_in_arrival_buckets,
      eventPricing,
      all_three_classes: allThreeClasses,
      class_level_summary: classLevelSummary,
      upper_level_breakdown: upperLevelBreakdown,
    });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function loadEventPricing(eventId: string) {
  const { data } = await supabaseServer
    .from("events")
    .select(EVENT_PRICING_SELECT)
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    type: data.type,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    time_zone: data.time_zone || DEFAULT_TIME_ZONE,
    price: data.price != null ? Number(data.price) : 0,
    price_changes: normalizePriceChanges(data.price_changes),
    ccs_team_price: data.ccs_team_price != null ? Number(data.ccs_team_price) : null,
    ccs_team_price_changes: normalizePriceChanges(data.ccs_team_price_changes),
    all_three_classes: data.all_three_classes === true,
    upper_level_lead_capacity:
      data.upper_level_lead_capacity != null
        ? Number(data.upper_level_lead_capacity)
        : null,
    upper_level_follow_capacity:
      data.upper_level_follow_capacity != null
        ? Number(data.upper_level_follow_capacity)
        : null,
  };
}

// PATCH - Update signup status (admin and instructor only)
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireRegistrationAuth(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { signupId, field, value, isComp } = body;

    if (!signupId || !field || value === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: signupId, field, value" },
        { status: 400 }
      );
    }

    if (isComp) {
      if (field !== "paid" && field !== "checked_in") {
        return NextResponse.json(
          { error: "Comp signups can only update 'paid' or 'checked_in'" },
          { status: 400 }
        );
      }

      const { data: existingComp, error: existingCompError } = await supabaseServer
        .from("comp_signups")
        .select("event_id,refunded_or_cancelled")
        .eq("id", signupId)
        .single();
      if (existingCompError || !existingComp?.event_id) {
        return NextResponse.json({ error: "Registration not found" }, { status: 404 });
      }
      if (String(existingComp.refunded_or_cancelled || "active") === "cancelled") {
        return NextResponse.json(
          { error: "Cannot update a cancelled registration." },
          { status: 409 }
        );
      }

      const { event: eventMeta, error: eventError } = await getEventMetaForAccess(
        String(existingComp.event_id)
      );
      if (eventError) return eventError;
      if (!eventMeta) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      const accessErr = assertRegistrationEventMutateAccess(auth.access.level, eventMeta);
      if (accessErr) return accessErr;

      const updatePayload: {
        paid?: boolean;
        checked_in?: boolean;
        checked_in_at?: string | null;
        updated_at: string;
      } = {
        updated_at: new Date().toISOString(),
      };
      if (field === "paid") {
        updatePayload.paid = !!value;
      } else {
        updatePayload.checked_in = !!value;
        if (value === true) {
          updatePayload.paid = true;
          updatePayload.checked_in_at = new Date().toISOString();
        } else {
          updatePayload.checked_in_at = null;
        }
      }
      const { data, error } = await supabaseServer
        .from("comp_signups")
        .update(updatePayload)
        .eq("id", signupId)
        .select()
        .single();
      if (error) {
        console.error("Error updating comp signup:", error);
        return NextResponse.json(
          { error: "Failed to update comp signup", details: error.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, signup: data });
    }

    if (!["paid", "checked_in", "amount_due", "planned_class_level", "planned_dance_role"].includes(field)) {
      return NextResponse.json(
        {
          error:
            "Invalid field. Must be 'paid', 'checked_in', 'amount_due', 'planned_class_level', or 'planned_dance_role'",
        },
        { status: 400 }
      );
    }

    const { data: existingSignup, error: existingSignupError } = await supabaseServer
      .from("signups")
      .select(
        "id,event_id,payment_method,paid,checked_in,amount_owed,amount_due,amount_paid,is_ccs_team,refunded_or_cancelled,planned_class_level,planned_dance_role"
      )
      .eq("id", signupId)
      .single();
    if (existingSignupError || !existingSignup?.event_id) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }
    if (String(existingSignup.refunded_or_cancelled || "active") === "cancelled") {
      return NextResponse.json(
        { error: "Cannot update a cancelled registration." },
        { status: 409 }
      );
    }

    const { event: eventMeta, error: eventError } = await getEventMetaForAccess(
      String(existingSignup.event_id)
    );
    if (eventError) return eventError;
    if (!eventMeta) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const accessErr = assertRegistrationEventMutateAccess(auth.access.level, eventMeta);
    if (accessErr) return accessErr;

    if (field === "planned_class_level" || field === "planned_dance_role") {
      if (auth.access.level !== "admin") {
        return NextResponse.json(
          { error: "Only admins can change class level or role." },
          { status: 403 }
        );
      }

      const pricing = await loadEventPricing(String(existingSignup.event_id));
      if (!pricing?.all_three_classes) {
        return NextResponse.json(
          { error: "This event does not use class level selection." },
          { status: 400 }
        );
      }

      const nextLevel: PlannedClassLevel | null =
        field === "planned_class_level"
          ? isPlannedClassLevel(value)
            ? value
            : null
          : isPlannedClassLevel(existingSignup.planned_class_level)
            ? existingSignup.planned_class_level
            : null;

      if (field === "planned_class_level" && !nextLevel) {
        return NextResponse.json(
          { error: "Invalid planned class level." },
          { status: 400 }
        );
      }

      let nextRole: DanceRole | null = null;
      if (field === "planned_dance_role") {
        if (!isDanceRole(value)) {
          return NextResponse.json(
            { error: "Invalid dance role. Must be lead or follow." },
            { status: 400 }
          );
        }
        nextRole = value;
      } else if (body.plannedDanceRole !== undefined) {
        nextRole = isDanceRole(body.plannedDanceRole) ? body.plannedDanceRole : null;
      } else if (nextLevel === "upper_level") {
        nextRole = isDanceRole(existingSignup.planned_dance_role)
          ? existingSignup.planned_dance_role
          : null;
      }

      const levelValidation = validatePlannedClassAndRole({
        allThreeClasses: true,
        plannedClassLevel: nextLevel,
        plannedDanceRole: nextLevel === "upper_level" ? nextRole : null,
      });
      if (!levelValidation.ok) {
        return NextResponse.json({ error: levelValidation.error }, { status: 400 });
      }

      const isCcsTeamSignup = existingSignup.is_ccs_team === true;
      if (
        !isCcsTeamSignup &&
        nextLevel === "upper_level" &&
        nextRole
      ) {
        const { data: capacityRows, error: capacityError } = await supabaseServer
          .from("signups")
          .select(
            "id,planned_class_level,planned_dance_role,is_ccs_team,refunded_or_cancelled"
          )
          .eq("event_id", existingSignup.event_id)
          .eq("planned_class_level", "upper_level")
          .neq("refunded_or_cancelled", "cancelled");
        if (capacityError) {
          return NextResponse.json(
            { error: "Failed to verify Upper Level availability." },
            { status: 500 }
          );
        }
        const currentCount = countUpperLevelTowardCapacity(capacityRows ?? [], nextRole, {
          excludeSignupId: existingSignup.id,
        });
        if (
          pricing &&
          isUpperLevelRoleFull(pricing, currentCount, nextRole)
        ) {
          const roleLabel = nextRole === "lead" ? "Lead" : "Follow";
          return NextResponse.json(
            { error: `Upper Level ${roleLabel} spots are full for this event.` },
            { status: 409 }
          );
        }
      }

      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        planned_class_level: nextLevel,
        planned_dance_role: nextLevel === "upper_level" ? nextRole : null,
      };

      const { data, error } = await supabaseServer
        .from("signups")
        .update(updatePayload)
        .eq("id", signupId)
        .select(SIGNUPS_SELECT)
        .single();

      if (error) {
        console.error("Error updating signup class level:", error);
        return NextResponse.json(
          { error: "Failed to update signup", details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, signup: data });
    }

    const pm = String(existingSignup.payment_method || "").trim().toLowerCase();
    const isStripe = pm === "stripe";
    const isCcsTeamFree = pm === "ccs team";
    const alreadyPaid = existingSignup.paid === true;

    // Stripe Paid is locked — cannot uncheck
    if (field === "paid" && value === false && isStripe && alreadyPaid) {
      return NextResponse.json(
        { error: "Stripe payments cannot be unmarked as unpaid." },
        { status: 400 }
      );
    }

    const pricing = await loadEventPricing(String(existingSignup.event_id));
    const isCcsTeam = existingSignup.is_ccs_team === true || isCcsTeamFree;
    const currentPrice = resolveDueNowForSignup(pricing, existingSignup);

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (field === "amount_due") {
      if (alreadyPaid) {
        return NextResponse.json(
          { error: "Cannot edit Due now after the signup is marked paid." },
          { status: 400 }
        );
      }
      if (value === null || value === "") {
        updateData.amount_due = null;
      } else if (Number.isFinite(Number(value)) && Number(value) >= 0) {
        updateData.amount_due = roundCurrency(Number(value));
      } else {
        return NextResponse.json(
          { error: "amount_due must be a non-negative number or null" },
          { status: 400 }
        );
      }
    } else if (field === "paid") {
      if (value === true) {
        updateData.paid = true;
        if (isCcsTeamFree) {
          updateData.amount_paid = 0;
        } else if (body.amount_paid != null && Number.isFinite(Number(body.amount_paid))) {
          updateData.amount_paid = roundCurrency(Number(body.amount_paid));
        } else if (existingSignup.amount_paid == null) {
          updateData.amount_paid = roundCurrency(currentPrice);
        }
      } else {
        updateData.paid = false;
        if (!isStripe) {
          updateData.amount_paid = null;
        }
      }
    } else if (field === "checked_in") {
      if (value === true) {
        updateData.checked_in = true;
        updateData.checked_in_at = new Date().toISOString();
        if (!alreadyPaid) {
          updateData.paid = true;
          if (isCcsTeamFree) {
            updateData.amount_paid = 0;
          } else if (existingSignup.amount_paid == null) {
            updateData.amount_paid = roundCurrency(currentPrice);
          }
        }
        // Already paid: attendance only — do not change amounts
      } else {
        updateData.checked_in = false;
        updateData.checked_in_at = null;
        // Un-check-in clears amount_paid unless Stripe (accident recovery)
        if (!isStripe) {
          updateData.paid = false;
          updateData.amount_paid = null;
        }
      }
    }

    const { data, error } = await supabaseServer
      .from("signups")
      .update(updateData)
      .eq("id", signupId)
      .select(SIGNUPS_SELECT)
      .single();

    if (error) {
      console.error("Error updating signup:", error);
      return NextResponse.json(
        { error: "Failed to update signup", details: error.message },
        { status: 500 }
      );
    }

    const dueNow = resolveDueNowForSignup(pricing, {
      ...existingSignup,
      amount_due:
        field === "amount_due"
          ? (updateData.amount_due as number | null)
          : existingSignup.amount_due,
    });
    const paidOptions = pricing
      ? resolvePaidAmountOptions(pricing, { isCcsTeam })
      : [];

    return NextResponse.json({
      success: true,
      signup: data,
      dueNow,
      paidAmountOptions: paidOptions,
    });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
