import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { ensureBib } from "@/lib/comps/bibs";

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
  | { competition: any; rows: PreviewRow[] }
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
      .select("comp_signup_id, lead_email, follow_email")
      .eq("competition_id", competitionId),
    supabaseServer
      .from("comp_judge_assignments")
      .select("profile:profiles(email)")
      .eq("competition_id", competitionId),
  ]);

  const importedSignupIds = new Set(
    (entriesRes.data ?? []).map((e) => e.comp_signup_id).filter(Boolean)
  );
  const existingEmails = new Set<string>();
  for (const e of entriesRes.data ?? []) {
    if (e.lead_email) existingEmails.add(norm(e.lead_email));
    if (e.follow_email) existingEmails.add(norm(e.follow_email));
  }
  const judgeEmails = new Set(
    ((judgesRes.data ?? []) as any[])
      .map((row) => norm(row.profile?.email))
      .filter(Boolean)
  );

  const rows: PreviewRow[] = (signupsRes.data ?? []).map((s: any) => {
    const leadFirst = s[`${prefix}_lead_first_name`] ?? "";
    const leadLast = s[`${prefix}_lead_last_name`] ?? "";
    const leadEmail = s[`${prefix}_lead_email`] ?? null;
    const followFirst = s[`${prefix}_follow_first_name`] ?? "";
    const followLast = s[`${prefix}_follow_last_name`] ?? "";
    const followEmail = s[`${prefix}_follow_email`] ?? null;

    const warnings: string[] = [];
    if (s.refunded_or_cancelled) {
      warnings.push(`Signup is ${s.refunded_or_cancelled}`);
    }
    if (!s.paid) warnings.push("Not paid");
    const hasLead = !!(leadFirst || leadLast || leadEmail);
    const hasFollow = !!(followFirst || followLast || followEmail);
    if (!isJnJ && (!hasLead || !hasFollow)) {
      warnings.push("Missing partner info (Strictly requires both)");
    }
    if (isJnJ && !hasLead && !hasFollow) {
      warnings.push("No competitor info on signup");
    }
    for (const email of [leadEmail, followEmail]) {
      if (email && existingEmails.has(norm(email))) {
        warnings.push(`${email} already has an entry in this competition`);
      }
      if (email && judgeEmails.has(norm(email))) {
        warnings.push(`${email} is a judge for this competition`);
      }
    }

    return {
      signupId: s.id,
      leadName: `${leadFirst} ${leadLast}`.trim(),
      leadEmail,
      followName: `${followFirst} ${followLast}`.trim(),
      followEmail,
      warnings,
      alreadyImported: importedSignupIds.has(s.id),
    };
  });

  return { competition, rows };
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
  const signupIds: string[] = Array.isArray(body.signup_ids)
    ? body.signup_ids
    : [];
  if (signupIds.length === 0) {
    return NextResponse.json(
      { error: "signup_ids is required" },
      { status: 400 }
    );
  }

  const preview = await buildPreview(competitionId);
  if ("error" in preview) {
    return NextResponse.json({ error: preview.error }, { status: preview.status });
  }
  const { competition } = preview;
  const isJnJ = competition.comp_type === "jack_and_jill";
  const prefix = isJnJ ? "jnj" : "strictly";

  // Judge conflicts are a hard block even if the admin selected the row.
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
  for (const s of (signups ?? []) as any[]) {
    if (alreadyImported.has(s.id)) continue;
    const leadFirst = s[`${prefix}_lead_first_name`] ?? "";
    const leadLast = s[`${prefix}_lead_last_name`] ?? "";
    const leadEmail = s[`${prefix}_lead_email`] ?? null;
    const followFirst = s[`${prefix}_follow_first_name`] ?? "";
    const followLast = s[`${prefix}_follow_last_name`] ?? "";
    const followEmail = s[`${prefix}_follow_email`] ?? null;
    const hasLead = !!(leadFirst || leadLast || leadEmail);
    const hasFollow = !!(followFirst || followLast || followEmail);

    if (isJnJ) {
      // JnJ: one individual entry per person; both roles wear bibs.
      // Every row must include all name columns: bulk insert aligns keys across
      // rows, and omitted fields become null (violates NOT NULL on comp_entries).
      if (hasLead) {
        inserts.push({
          competition_id: competitionId,
          entry_kind: "individual",
          role: "lead",
          lead_first_name: leadFirst,
          lead_last_name: leadLast,
          lead_email: leadEmail,
          follow_first_name: "",
          follow_last_name: "",
          follow_email: null,
          lead_bib_id: await ensureBib(competition.event_id, {
            firstName: leadFirst,
            lastName: leadLast,
            email: leadEmail,
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
          follow_first_name: followFirst,
          follow_last_name: followLast,
          follow_email: followEmail,
          lead_bib_id: null,
          follow_bib_id: await ensureBib(competition.event_id, {
            firstName: followFirst,
            lastName: followLast,
            email: followEmail,
          }),
          comp_signup_id: s.id,
        });
      }
    } else {
      // Strictly: one couple entry; only the lead wears a bib.
      inserts.push({
        competition_id: competitionId,
        entry_kind: "couple",
        lead_first_name: leadFirst,
        lead_last_name: leadLast,
        lead_email: leadEmail,
        follow_first_name: followFirst,
        follow_last_name: followLast,
        follow_email: followEmail,
        lead_bib_id: hasLead
          ? await ensureBib(competition.event_id, {
              firstName: leadFirst,
              lastName: leadLast,
              email: leadEmail,
            })
          : null,
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
