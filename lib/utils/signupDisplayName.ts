type SocialSignupLike = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type CompSignupLike = {
  strictly_lead_first_name?: string | null;
  strictly_lead_last_name?: string | null;
  strictly_follow_first_name?: string | null;
  strictly_follow_last_name?: string | null;
  strictly_lead_email?: string | null;
  strictly_follow_email?: string | null;
  jnj_lead_first_name?: string | null;
  jnj_lead_last_name?: string | null;
  jnj_follow_first_name?: string | null;
  jnj_follow_last_name?: string | null;
  jnj_lead_email?: string | null;
  jnj_follow_email?: string | null;
};

function joinNameParts(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

export function formatSocialSignupLabel(signup: SocialSignupLike): string {
  const name = joinNameParts(signup.first_name, signup.last_name);
  if (name) return name;
  const email = signup.email?.trim();
  if (email) return email;
  return "Unknown registrant";
}

function compNameParts(c: CompSignupLike): string[] {
  const parts: string[] = [];
  const strictlyLead = joinNameParts(c.strictly_lead_first_name, c.strictly_lead_last_name);
  const strictlyFollow = joinNameParts(
    c.strictly_follow_first_name,
    c.strictly_follow_last_name
  );
  if (strictlyLead) parts.push(strictlyLead);
  if (strictlyFollow && strictlyFollow !== strictlyLead) parts.push(strictlyFollow);

  const jnjLead = joinNameParts(c.jnj_lead_first_name, c.jnj_lead_last_name);
  const jnjFollow = joinNameParts(c.jnj_follow_first_name, c.jnj_follow_last_name);
  if (jnjLead && !parts.includes(jnjLead)) parts.push(jnjLead);
  if (jnjFollow && jnjFollow !== jnjLead && !parts.includes(jnjFollow)) {
    parts.push(jnjFollow);
  }

  return parts;
}

export function formatCompSignupLabel(compSignup: CompSignupLike): string {
  const joined = compNameParts(compSignup).join(" / ");
  if (joined) return joined;

  const emails = [
    compSignup.strictly_lead_email,
    compSignup.strictly_follow_email,
    compSignup.jnj_lead_email,
    compSignup.jnj_follow_email,
  ]
    .map((e) => e?.trim())
    .filter(Boolean);
  const uniqueEmails = [...new Set(emails)];
  if (uniqueEmails.length === 1) return uniqueEmails[0]!;
  if (uniqueEmails.length > 1) return uniqueEmails.join(" / ");

  return "Comp registration";
}
