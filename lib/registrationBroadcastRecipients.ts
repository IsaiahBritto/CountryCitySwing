export type BroadcastAudience = "all" | "unpaid";

export type BroadcastRecipient = {
  email: string;
  firstName: string;
  lastName: string;
  signupId: string;
};

type SignupRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  paid: boolean | null;
  refunded_or_cancelled?: string | null;
};

type CompSignupRow = {
  id: string;
  paid: boolean | null;
  refunded_or_cancelled?: string | null;
  strictly_lead_first_name?: string | null;
  strictly_lead_last_name?: string | null;
  strictly_lead_email?: string | null;
  strictly_follow_first_name?: string | null;
  strictly_follow_last_name?: string | null;
  strictly_follow_email?: string | null;
  jnj_lead_first_name?: string | null;
  jnj_lead_last_name?: string | null;
  jnj_lead_email?: string | null;
  jnj_follow_first_name?: string | null;
  jnj_follow_last_name?: string | null;
  jnj_follow_email?: string | null;
};

function isActiveSignup(refundedOrCancelled: string | null | undefined): boolean {
  return String(refundedOrCancelled || "active") !== "cancelled";
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}

function addRecipient(
  map: Map<string, BroadcastRecipient>,
  input: {
    email: string | null | undefined;
    firstName?: string | null;
    lastName?: string | null;
    signupId: string;
  }
) {
  const email = normalizeEmail(input.email);
  if (!email || map.has(email)) return;
  map.set(email, {
    email,
    firstName: (input.firstName ?? "").trim(),
    lastName: (input.lastName ?? "").trim(),
    signupId: input.signupId,
  });
}

export function collectSignupRecipients(
  signups: SignupRow[],
  audience: BroadcastAudience
): BroadcastRecipient[] {
  const map = new Map<string, BroadcastRecipient>();
  for (const signup of signups) {
    if (!isActiveSignup(signup.refunded_or_cancelled)) continue;
    if (audience === "unpaid" && signup.paid) continue;
    addRecipient(map, {
      email: signup.email,
      firstName: signup.first_name,
      lastName: signup.last_name,
      signupId: signup.id,
    });
  }
  return [...map.values()].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
  );
}

export function collectCompSignupRecipients(
  compSignups: CompSignupRow[],
  audience: BroadcastAudience
): BroadcastRecipient[] {
  const map = new Map<string, BroadcastRecipient>();
  for (const signup of compSignups) {
    if (!isActiveSignup(signup.refunded_or_cancelled)) continue;
    if (audience === "unpaid" && signup.paid) continue;

    const people: Array<{
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    }> = [
      {
        email: signup.strictly_lead_email,
        firstName: signup.strictly_lead_first_name,
        lastName: signup.strictly_lead_last_name,
      },
      {
        email: signup.strictly_follow_email,
        firstName: signup.strictly_follow_first_name,
        lastName: signup.strictly_follow_last_name,
      },
      {
        email: signup.jnj_lead_email,
        firstName: signup.jnj_lead_first_name,
        lastName: signup.jnj_lead_last_name,
      },
      {
        email: signup.jnj_follow_email,
        firstName: signup.jnj_follow_first_name,
        lastName: signup.jnj_follow_last_name,
      },
    ];

    for (const person of people) {
      addRecipient(map, {
        email: person.email,
        firstName: person.firstName,
        lastName: person.lastName,
        signupId: signup.id,
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
  );
}
