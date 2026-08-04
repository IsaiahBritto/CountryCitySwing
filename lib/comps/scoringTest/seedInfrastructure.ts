import { supabaseServer } from "@/lib/supabaseServer";
import {
  JNJ_JUDGE_SPECS,
  LEGACY_FIXTURE_CJ_EMAIL,
  STRICTLY_JUDGE_EMAILS,
  TEST_COMP_CJ_EMAIL,
  TEST_JNJ_NAME,
  TEST_STRICTLY_NAME,
} from "./constants";
import type { CompetitionRow } from "@/lib/comps/types";

export interface TestCompPair {
  strictly: CompetitionRow;
  jnj: CompetitionRow;
}

async function ensureProfile(email: string, firstName: string, lastName: string) {
  const { data: existing } = await supabaseServer
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: authData, error: authError } =
    await supabaseServer.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });
  if (authError || !authData.user) {
    throw new Error(
      `Failed to create auth user ${email}: ${authError?.message ?? "unknown"}`
    );
  }
  const userId = authData.user.id;
  await supabaseServer.from("profiles").upsert({
    id: userId,
    email,
    first_name: firstName,
    last_name: lastName,
    role: "judge",
  });
  return userId;
}

async function lookupProfileId(email: string, label: string): Promise<string> {
  const { data: existing } = await supabaseServer
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (!existing) {
    throw new Error(
      `${label} (${email}) must have an account before ensuring test judges`
    );
  }
  return existing.id;
}

async function removeAssignmentByEmail(competitionId: string, email: string) {
  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (!profile) return;
  await supabaseServer
    .from("comp_judge_assignments")
    .delete()
    .eq("competition_id", competitionId)
    .eq("profile_id", profile.id);
}

async function assignJudge(
  competitionId: string,
  profileId: string,
  judgeRole: "judge" | "chief_judge",
  scoringScope: "lead" | "follow" | "both",
  dropsFinals: boolean
) {
  const { data: existing } = await supabaseServer
    .from("comp_judge_assignments")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing) {
    await supabaseServer
      .from("comp_judge_assignments")
      .update({
        judge_role: judgeRole,
        scoring_scope: scoringScope,
        drops_finals: dropsFinals,
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await supabaseServer
    .from("comp_judge_assignments")
    .insert([
      {
        competition_id: competitionId,
        profile_id: profileId,
        judge_role: judgeRole,
        scoring_scope: scoringScope,
        drops_finals: dropsFinals,
      },
    ])
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to assign judge: ${error?.message}`);
  }
  return data.id as string;
}

/** Demote any existing CJ rows, then assign the test comp chief judge. */
async function assignChiefJudge(
  competitionId: string,
  profileId: string,
  scoringScope: "lead" | "follow" | "both",
  dropsFinals: boolean
) {
  await supabaseServer
    .from("comp_judge_assignments")
    .update({ judge_role: "judge" })
    .eq("competition_id", competitionId)
    .eq("judge_role", "chief_judge");

  await assignJudge(
    competitionId,
    profileId,
    "chief_judge",
    scoringScope,
    dropsFinals
  );
}

export async function findTestCompetitions(): Promise<TestCompPair> {
  const { data, error } = await supabaseServer
    .from("competitions")
    .select("*")
    .eq("test_comp", true)
    .in("name", [TEST_STRICTLY_NAME, TEST_JNJ_NAME]);
  if (error) throw new Error(`Failed to load test comps: ${error.message}`);

  const strictly = (data ?? []).find(
    (c) => c.name === TEST_STRICTLY_NAME && c.comp_type === "strictly"
  );
  const jnj = (data ?? []).find(
    (c) => c.name === TEST_JNJ_NAME && c.comp_type === "jack_and_jill"
  );
  if (!strictly) {
    throw new Error(
      `Test competition "${TEST_STRICTLY_NAME}" not found (test_comp=true)`
    );
  }
  if (!jnj) {
    throw new Error(
      `Test competition "${TEST_JNJ_NAME}" not found (test_comp=true)`
    );
  }
  return { strictly: strictly as CompetitionRow, jnj: jnj as CompetitionRow };
}

export async function ensureStrictlyJudges(competitionId: string) {
  await supabaseServer
    .from("competitions")
    .update({ cj_in_panel: false })
    .eq("id", competitionId);

  for (let i = 0; i < STRICTLY_JUDGE_EMAILS.length; i++) {
    const email = STRICTLY_JUDGE_EMAILS[i];
    const profileId = await ensureProfile(email, "Test", `Strictly Judge ${i + 1}`);
    await assignJudge(competitionId, profileId, "judge", "both", false);
  }
  await ensureTestCompChiefJudge(competitionId);
}

async function ensureTestCompChiefJudge(competitionId: string) {
  const cjId = await lookupProfileId(
    TEST_COMP_CJ_EMAIL,
    "Test comp chief judge"
  );
  await assignChiefJudge(competitionId, cjId, "both", false);
  await removeAssignmentByEmail(competitionId, LEGACY_FIXTURE_CJ_EMAIL);
}

export async function ensureJnJJudges(competitionId: string) {
  await supabaseServer
    .from("competitions")
    .update({ cj_in_panel: false })
    .eq("id", competitionId);

  for (let i = 0; i < JNJ_JUDGE_SPECS.length; i++) {
    const spec = JNJ_JUDGE_SPECS[i];
    const profileId = await ensureProfile(
      spec.email,
      "Test",
      `JnJ Judge ${i + 1}`
    );
    await assignJudge(
      competitionId,
      profileId,
      "judge",
      spec.scope,
      spec.dropsFinals
    );
  }
  await ensureTestCompChiefJudge(competitionId);
}

export async function validateTestInfrastructure(
  dryRun: boolean
): Promise<string[]> {
  const errors: string[] = [];
  try {
    await findTestCompetitions();
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return errors;
  }
  if (!dryRun) return errors;
  return errors;
}
