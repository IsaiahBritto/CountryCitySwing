import { isTestCompSignup } from "@/lib/comps/testRegistrants";
import type { CompSignupRow } from "@/lib/comps/types";
import { formatCompSignupLabel } from "@/lib/utils/signupDisplayName";

export type CommunityCompSignupListItem = {
  id: string;
  label: string;
  divisions: string[];
  paid: boolean;
  isTest: boolean;
  createdAt: string | null;
};

export function compSignupDivisionTags(signup: CompSignupRow): string[] {
  const tags: string[] = [];
  if (signup.strictly_selected) tags.push("Strictly");
  if (signup.jnj_selected) tags.push("Jack & Jill");
  if (signup.all_american_selected) tags.push("All American");
  return tags;
}

export function toCommunityCompSignupListItem(
  signup: CompSignupRow & { created_at?: string | null }
): CommunityCompSignupListItem {
  return {
    id: signup.id,
    label: formatCompSignupLabel(signup),
    divisions: compSignupDivisionTags(signup),
    paid: !!signup.paid,
    isTest: isTestCompSignup(signup),
    createdAt: signup.created_at ?? null,
  };
}