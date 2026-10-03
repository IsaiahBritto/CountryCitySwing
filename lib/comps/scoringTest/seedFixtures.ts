import { supabaseServer } from "@/lib/supabaseServer";
import { assignBibNumbers, findOrCreateBibRecord } from "@/lib/comps/bibs";
import type { CompetitionRow, DanceRole } from "@/lib/comps/types";
import {
  FIXTURE_JNJ_PER_ROLE,
  FIXTURE_STRICTLY_COUPLES,
  TEST_EVENT_TITLE,
  TEST_JNJ_NAME,
  TEST_STRICTLY_NAME,
} from "./constants";
import {
  fixtureBibNumber,
  fixtureJnJFollowEmail,
  fixtureJnJLeadEmail,
  fixtureStrictlyFollowEmail,
  fixtureStrictlyLeadEmail,
  isFixtureEmail,
  padFixtureIndex,
} from "./fixtureEmails";
import {
  ensureJnJJudges,
  ensureStrictlyJudges,
} from "./seedInfrastructure";
import { resetTestComp } from "./resetTestComp";

export interface EnsureMockOptions {
  seedEntries?: boolean;
  ensureJudges?: boolean;
  resetRounds?: boolean;
}

export interface EnsureMockResult {
  eventId: string;
  strictly: CompetitionRow;
  jnj: CompetitionRow;
  counts: {
    strictlyCouples: number;
    jnjLeads: number;
    jnjFollows: number;
    strictlyJudges: number;
    jnjJudges: number;
  };
}

function sandboxStartsAt(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCMonth(0, 1);
  d.setUTCHours(18, 0, 0, 0);
  return d.toISOString();
}

function sandboxEndsAt(startsAt: string): string {
  const d = new Date(startsAt);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export async function ensureTestEvent(): Promise<string> {
  const { data: existing, error: findError } = await supabaseServer
    .from("events")
    .select("id, test_event, signup_link")
    .eq("title", TEST_EVENT_TITLE)
    .eq("test_event", true)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(`Failed to look up sandbox event: ${findError.message}`);
  }

  if (existing?.id) {
    await supabaseServer
      .from("events")
      .update({
        test_event: true,
        signup_link: null,
        type: "Comp",
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const starts_at = sandboxStartsAt();
  const { data: created, error: insertError } = await supabaseServer
    .from("events")
    .insert([
      {
        title: TEST_EVENT_TITLE,
        starts_at,
        ends_at: sandboxEndsAt(starts_at),
        location: "CCS Admin Sandbox (not public)",
        type: "Comp",
        test_event: true,
        signup_link: null,
        time_zone: "America/Chicago",
        description:
          "Admin-only mock event for judging drills. Hidden from public comps hub.",
      },
    ])
    .select("id")
    .single();

  if (insertError || !created) {
    throw new Error(
      `Failed to create sandbox event: ${insertError?.message ?? "unknown"}`
    );
  }
  return created.id as string;
}

async function ensureTestCompetition(
  eventId: string,
  compType: "strictly" | "jack_and_jill",
  name: string
): Promise<CompetitionRow> {
  const { data: existing, error: findError } = await supabaseServer
    .from("competitions")
    .select("*")
    .eq("event_id", eventId)
    .eq("name", name)
    .eq("test_comp", true)
    .maybeSingle();

  if (findError) {
    throw new Error(`Failed to look up ${name}: ${findError.message}`);
  }
  if (existing) return existing as CompetitionRow;

  const { data: created, error: insertError } = await supabaseServer
    .from("competitions")
    .insert([
      {
        event_id: eventId,
        comp_type: compType,
        name,
        test_comp: true,
        status: "setup",
        cj_in_panel: false,
      },
    ])
    .select("*")
    .single();

  if (insertError || !created) {
    throw new Error(
      `Failed to create ${name}: ${insertError?.message ?? "unknown"}`
    );
  }
  return created as CompetitionRow;
}

async function countJudges(competitionId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from("comp_judge_assignments")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", competitionId);
  if (error) throw new Error(`Failed to count judges: ${error.message}`);
  return count ?? 0;
}

async function countEntries(
  competitionId: string,
  filters?: { entry_kind?: string; role?: DanceRole }
): Promise<number> {
  let q = supabaseServer
    .from("comp_entries")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", competitionId);
  if (filters?.entry_kind) q = q.eq("entry_kind", filters.entry_kind);
  if (filters?.role) q = q.eq("role", filters.role);
  const { count, error } = await q;
  if (error) throw new Error(`Failed to count entries: ${error.message}`);
  return count ?? 0;
}

/** Remove walk-up fixture rows (by synthetic email) for one competition. */
export async function deleteFixtureEntries(competitionId: string): Promise<number> {
  const { data: rows, error } = await supabaseServer
    .from("comp_entries")
    .select("id, lead_email, follow_email")
    .eq("competition_id", competitionId);

  if (error) {
    throw new Error(`Failed to load entries for cleanup: ${error.message}`);
  }

  const fixtureIds = (rows ?? [])
    .filter(
      (r) =>
        isFixtureEmail(r.lead_email as string | null) ||
        isFixtureEmail(r.follow_email as string | null)
    )
    .map((r) => r.id as string);

  if (fixtureIds.length === 0) return 0;

  const { error: deleteError } = await supabaseServer
    .from("comp_entries")
    .delete()
    .in("id", fixtureIds);

  if (deleteError) {
    throw new Error(
      `Failed to delete fixture entries (reset test comp rounds first if scores exist): ${deleteError.message}`
    );
  }
  return fixtureIds.length;
}

async function assignBibForPerson(
  eventId: string,
  person: { firstName: string; lastName: string; email: string },
  bibNumber: number
): Promise<void> {
  const bibId = await findOrCreateBibRecord(eventId, {
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
  });
  if (!bibId) return;
  const result = await assignBibNumbers(eventId, [{ bibId, bibNumber }]);
  if ("error" in result) {
    throw new Error(`Bib ${bibNumber} for ${person.email}: ${result.error}`);
  }
}

export async function seedStrictlyCouples(
  competitionId: string,
  eventId: string,
  count: number = FIXTURE_STRICTLY_COUPLES
): Promise<number> {
  for (let i = 1; i <= count; i++) {
    const label = padFixtureIndex(i);
    const leadEmail = fixtureStrictlyLeadEmail(i);
    const followEmail = fixtureStrictlyFollowEmail(i);
    const leadFirst = "Test";
    const leadLast = `Strictly Lead ${label}`;
    const followFirst = "Test";
    const followLast = `Strictly Follow ${label}`;

    const leadBibId = await findOrCreateBibRecord(eventId, {
      firstName: leadFirst,
      lastName: leadLast,
      email: leadEmail,
    });

    const { error } = await supabaseServer.from("comp_entries").insert([
      {
        competition_id: competitionId,
        entry_kind: "couple",
        role: null,
        lead_first_name: leadFirst,
        lead_last_name: leadLast,
        lead_email: leadEmail,
        follow_first_name: followFirst,
        follow_last_name: followLast,
        follow_email: followEmail,
        lead_bib_id: leadBibId,
        follow_bib_id: null,
      },
    ]);

    if (error) {
      throw new Error(`Failed to insert strictly couple ${label}: ${error.message}`);
    }

    await assignBibForPerson(
      eventId,
      { firstName: leadFirst, lastName: leadLast, email: leadEmail },
      fixtureBibNumber("strictly_lead", i)
    );
  }
  return count;
}

export async function seedJnJIndividuals(
  competitionId: string,
  eventId: string,
  role: DanceRole,
  count: number = FIXTURE_JNJ_PER_ROLE
): Promise<number> {
  const pool = role === "lead" ? "jnj_lead" : "jnj_follow";
  for (let i = 1; i <= count; i++) {
    const label = padFixtureIndex(i);
    const email =
      role === "lead" ? fixtureJnJLeadEmail(i) : fixtureJnJFollowEmail(i);
    const first = "Test";
    const last = role === "lead" ? `JnJ Lead ${label}` : `JnJ Follow ${label}`;

    const bibId = await findOrCreateBibRecord(eventId, {
      firstName: first,
      lastName: last,
      email,
    });

    const row: Record<string, unknown> = {
      competition_id: competitionId,
      entry_kind: "individual",
      role,
      lead_first_name: "",
      lead_last_name: "",
      lead_email: null,
      follow_first_name: "",
      follow_last_name: "",
      follow_email: null,
    };

    if (role === "lead") {
      row.lead_first_name = first;
      row.lead_last_name = last;
      row.lead_email = email;
      row.lead_bib_id = bibId;
    } else {
      row.follow_first_name = first;
      row.follow_last_name = last;
      row.follow_email = email;
      row.follow_bib_id = bibId;
    }

    const { error } = await supabaseServer.from("comp_entries").insert([row]);
    if (error) {
      throw new Error(`Failed to insert JnJ ${role} ${label}: ${error.message}`);
    }

    await assignBibForPerson(
      eventId,
      { firstName: first, lastName: last, email },
      fixtureBibNumber(pool, i)
    );
  }
  return count;
}

export async function ensureMockCompetitionPair(
  options: EnsureMockOptions = {}
): Promise<EnsureMockResult> {
  const seedEntries = options.seedEntries !== false;
  const ensureJudges = options.ensureJudges !== false;
  const resetRounds = options.resetRounds === true;

  const eventId = await ensureTestEvent();
  const strictly = await ensureTestCompetition(
    eventId,
    "strictly",
    TEST_STRICTLY_NAME
  );
  const jnj = await ensureTestCompetition(
    eventId,
    "jack_and_jill",
    TEST_JNJ_NAME
  );

  if (resetRounds) {
    await resetTestComp(strictly.id);
    await resetTestComp(jnj.id);
  }

  if (seedEntries) {
    await deleteFixtureEntries(strictly.id);
    await deleteFixtureEntries(jnj.id);
    await seedStrictlyCouples(strictly.id, eventId);
    await seedJnJIndividuals(jnj.id, eventId, "lead");
    await seedJnJIndividuals(jnj.id, eventId, "follow");
  }

  if (ensureJudges) {
    await ensureStrictlyJudges(strictly.id);
    await ensureJnJJudges(jnj.id);
  }

  return {
    eventId,
    strictly,
    jnj,
    counts: {
      strictlyCouples: await countEntries(strictly.id, { entry_kind: "couple" }),
      jnjLeads: await countEntries(jnj.id, {
        entry_kind: "individual",
        role: "lead",
      }),
      jnjFollows: await countEntries(jnj.id, {
        entry_kind: "individual",
        role: "follow",
      }),
      strictlyJudges: await countJudges(strictly.id),
      jnjJudges: await countJudges(jnj.id),
    },
  };
}
