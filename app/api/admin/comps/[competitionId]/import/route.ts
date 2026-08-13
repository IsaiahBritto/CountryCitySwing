import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { findOrCreateBibRecord } from "@/lib/comps/bibs";

const norm = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

interface PreviewRow {
  signupId: string;
  leadName: string;
  leadEmail: string | null;
  followName: string;
  followEmail: string | null;
  warnings: string[];
  alreadyImported: boolean;
}

async function buildPreview(competitionId: string): Promise<
  | { error: string; status: number }
  | { competition: { id: string; event_id: string; comp_type: string }; rows: PreviewRow[] }
> {
  const { data: competition } = await supabaseServer
    .from("competitions")
    .select("id, event_id, comp_type")
    .eq("id", competitionId)
    .maybeSingle();
  if (!competition) return { error: "Competition not found", status: 404 };

  const isJnJ = competition.comp_type === "jack_and_jill";
  const prefix = isJnJ ? "jnj" : "strictly";

  const [signupsRes, entriesRes, judgesRes] = await Promise.all([
    supabaseServer
      .from("comp_signups")
      .select("*")
      .eq("event_id", competition.event_id)
      .eq(`${prefix}_selected`, true),
    supabaseServer
      .from("comp_entries")
      .select("comp_signup_id, lead_email, follow_email, lead_profile_id, follow_profile_id")
      .eq("competition_id", competitionId),
    supabaseServer
      .from("comp_judge_assignments")
      .select("profile_id, profile:profiles(email)")
      .eq("competition_id", competitionId),
  ]);

  const importedSignupIds = new Set(
    (entriesRes.data ?? []).map((e) => e.comp_signup_id).filter(Boolean)
  );
  const existingEmails = new Set<string>();
  const existingProfileIds = new Set<string>();
  for (const e of entriesRes.data ?? []) {
    if (e.lead_email) existingEmails.add(norm(e.lead_email));
    if (e.follow_email) existingEmails.add(norm(e.follow_email));
    if (e.lead_profile_id) existingProfileIds.add(e.lead_profile_id);
    if (e.follow_profile_id) existingProfileIds.add(e.follow_profile_id);
  }
  const judgeEmails = new Set<string>();
  const judgeProfileIds = new Set<string>();
  for (const row of (judgesRes.data ?? []) as {
    profile_id?: string;
    profile?: { email?: string | null };
  }[]) {
    const email = norm(row.profile?.email);
    if (email) judgeEmails.add(email);
    if (row.profile_id) judgeProfileIds.add(row.profile_id);
  }

  const rows: PreviewRow[] = (signupsRes.data ?? []).map((s: Record<string, unknown>) => {
    const leadFirst = String(s[`${prefix}_lead_first_name`] ?? "");
    const leadLast = String(s[`${prefix}_lead_last_name`] ?? "");
    const leadEmail = (s[`${prefix}_lead_email`] as string | null) ?? null;
    const followFirst = String(s[`${prefix}_follow_first_name`] ?? "");
    const followLast = String(s[`${prefix}_follow_last_name`] ?? "");
    const followEmail = (s[`${prefix}_follow_email`] as string | null) ?? null;
    const leadProfileId = (s[`${prefix}_lead_profile_id`] as string | null) ?? null;
    const followProfileId = (s[`${prefix}_follow_profile_id`] as string | null) ?? null;

    const warnings: string[] = [];
    if (s.refunded_or_cancelled) {
      warnings.push(`Signup is ${s.refunded_or_cancelled}`);
    }
    if (!s.paid) warnings.push("Not paid");
    const hasLead = !!(leadFirst || leadLast || leadEmail || leadProfileId);
    const hasFollow = !!(followFirst || followLast || followEmail || followProfileId);
    if (!isJnJ && (!hasLead || !hasFollow)) {
      warnings.push("Missing partner info (Strictly requires both)");
    }
    if (isJnJ && !hasLead && !hasFollow) {
      warnings.push("No competitor info on signup");
    }
    if (!leadProfileId && !followProfileId && !s.registrant_profile_id) {
      warnings.push("Missing profile link (legacy signup)");
    }
    for (const email of [leadEmail, followEmail]) {
      if (email && existingEmails.has(norm(email))) {
        warnings.push(`${email} already has an entry in this competition`);
      }
      if (email && judgeEmails.has(norm(email))) {
        warnings.push(`${email} is a judge for this competition`);
      }
    }
    for (const profileId of [leadProfileId, followProfileId]) {
      if (profileId && existingProfileIds.has(profileId)) {
        warnings.push(`${profileId} already has an entry in this competition`);
      }
      if (profileId && judgeProfileIds.has(profileId)) {
        warnings.push(`Profile ${profileId} is a judge for this competition`);
      }
    }

    return {
      signupId: String(s.id),
      leadName: `${leadFirst} ${leadLast}`.trim(),
      leadEmail,
      followName: `${followFirst} ${followLast}`.trim(),
      followEmail,
      warnings,
      alreadyImported: importedSignupIds.has(s.id as string),
    };
  });

  return { competition, rows };
}

/** Signups that can still be imported (skips already imported and judges). */
function importableSignupIds(rows: PreviewRow[]): string[] {
  return rows
    .filter(
      (r) =>
        !r.alreadyImported &&
        !r.warnings.some((w) => w.includes("is a judge"))
    )
    .map((r) => r.signupId);
}

/** GET: import preview with per-row warnings; nothing is written. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;

  const preview = await buildPreview(competitionId);
  if ("error" in preview) {
    return NextResponse.json({ error: preview.error }, { status: preview.status });
  }
  return NextResponse.json({ rows: preview.rows });
}

/** POST: import the selected signups as entries (with per-event bibs). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return auth.response;
  const { competitionId } = await params;
  const body = await req.json();
  const preview = await buildPreview(competitionId);
  if ("error" in preview) {
    return NextResponse.json({ error: preview.error }, { status: preview.status });
  }

  let signupIds: string[] = [];
  if (body.import_all === true) {
    signupIds = importableSignupIds(preview.rows);
  } else if (Array.isArray(body.signup_ids)) {
    signupIds = body.signup_ids;
  }
  if (signupIds.length === 0) {
    return NextResponse.json(
      { error: "No signups to import" },
      { status: 400 }
    );
  }

  const { competition } = preview;
  const isJnJ = competition.comp_type === "jack_and_jill";
  const prefix = isJnJ ? "jnj" : "strictly";

  const blocked = preview.rows.filter(
    (r) =>
      signupIds.includes(r.signupId) &&
      r.warnings.some((w) => w.includes("is a judge"))
  );
  if (blocked.length > 0) {
    return NextResponse.json(
      {
        error:
          "Some selected signups belong to judges of this competition and cannot compete: " +
          blocked.map((b) => b.leadName || b.followName).join(", "),
      },
      { status: 409 }
    );
  }

  const { data: signups, error: signupsError } = await supabaseServer
    .from("comp_signups")
    .select("*")
    .in("id", signupIds)
    .eq("event_id", competition.event_id);
  if (signupsError) {
    return NextResponse.json({ error: "Failed to load signups" }, { status: 500 });
  }

  const alreadyImported = new Set(
    preview.rows.filter((r) => r.alreadyImported).map((r) => r.signupId)
  );

  const inserts: Record<string, unknown>[] = [];
  for (const s of (signups ?? []) as Record<string, unknown>[]) {
    if (alreadyImported.has(String(s.id))) continue;
    const leadFirst = String(s[`${prefix}_lead_first_name`] ?? "");
    const leadLast = String(s[`${prefix}_lead_last_name`] ?? "");
    const leadEmail = (s[`${prefix}_lead_email`] as string | null) ?? null;
    const followFirst = String(s[`${prefix}_follow_first_name`] ?? "");
    const followLast = String(s[`${prefix}_follow_last_name`] ?? "");
    const followEmail = (s[`${prefix}_follow_email`] as string | null) ?? null;
    const leadProfileId = (s[`${prefix}_lead_profile_id`] as string | null) ?? null;
    const followProfileId = (s[`${prefix}_follow_profile_id`] as string | null) ?? null;
    const hasLead = !!(leadFirst || leadLast || leadEmail || leadProfileId);
    const hasFollow = !!(followFirst || followLast || followEmail || followProfileId);

    if (isJnJ) {
      if (hasLead) {
        inserts.push({
          competition_id: competitionId,
          entry_kind: "individual",
          role: "lead",
          lead_first_name: leadFirst,
          lead_last_name: leadLast,
          lead_email: leadEmail,
          lead_profile_id: leadProfileId,
          follow_first_name: "",
          follow_last_name: "",
          follow_email: null,
          follow_profile_id: null,
          lead_bib_id: await findOrCreateBibRecord(competition.event_id, {
            firstName: leadFirst,
            lastName: leadLast,
            email: leadEmail,
            profileId: leadProfileId,
          }),
          follow_bib_id: null,
          comp_signup_id: s.id,
        });
      }
      if (hasFollow) {
        inserts.push({
          competition_id: competitionId,
          entry_kind: "individual",
          role: "follow",
          lead_first_name: "",
          lead_last_name: "",
          lead_email: null,
          lead_profile_id: null,
          follow_first_name: followFirst,
          follow_last_name: followLast,
          follow_email: followEmail,
          follow_profile_id: followProfileId,
          lead_bib_id: null,
          follow_bib_id: await findOrCreateBibRecord(competition.event_id, {
            firstName: followFirst,
            lastName: followLast,
            email: followEmail,
            profileId: followProfileId,
          }),
          comp_signup_id: s.id,
        });
      }
    } else {
      inserts.push({
        competition_id: competitionId,
        entry_kind: "couple",
        lead_first_name: leadFirst,
        lead_last_name: leadLast,
        lead_email: leadEmail,
        lead_profile_id: leadProfileId,
        follow_first_name: followFirst,
        follow_last_name: followLast,
        follow_email: followEmail,
        follow_profile_id: followProfileId,
        lead_bib_id: hasLead
          ? await findOrCreateBibRecord(competition.event_id, {
              firstName: leadFirst,
              lastName: leadLast,
              email: leadEmail,
              profileId: leadProfileId,
            })
          : null,
        follow_bib_id: null,
        comp_signup_id: s.id,
      });
    }
  }

  if (inserts.length === 0) {
    return NextResponse.json({ imported: 0 });
  }

  const { error: insertError } = await supabaseServer
    .from("comp_entries")
    .insert(inserts);
  if (insertError) {
    console.error("[admin/comps/import] insert failed", insertError);
    return NextResponse.json({ error: "Failed to import entries" }, { status: 500 });
  }
  return NextResponse.json({ imported: inserts.length });
}
