import { describe, expect, it } from "vitest";
import {
  checkDuplicateCommunityCompSignupByEmailFromRows,
  normalizeCompSignupEmail,
  resolveGuestCommunityCompSignup,
} from "@/lib/communityCompSignupGuest";

describe("communityCompSignupGuest", () => {
  it("normalizes email case", () => {
    expect(normalizeCompSignupEmail("  Test@Mail.COM ")).toBe("test@mail.com");
  });

  it("resolves guest strictly + jnj", () => {
    const resolved = resolveGuestCommunityCompSignup(
      {
        registrant: {
          first_name: "Alex",
          last_name: "Lead",
          email: "alex@example.com",
        },
        strictly_selected: true,
        strictly_role: "lead",
        strictly_partner: {
          first_name: "Sam",
          last_name: "Follow",
          email: "sam@example.com",
        },
        jnj_selected: true,
        jnj_role: "lead",
      },
      { strictlySelected: true, jnjSelected: true }
    );
    expect("error" in resolved).toBe(false);
    if ("error" in resolved) return;
    expect(resolved.registrant_profile_id).toBeNull();
    expect(resolved.strictly_lead_email).toBe("alex@example.com");
    expect(resolved.strictly_follow_email).toBe("sam@example.com");
    expect(resolved.jnj_lead_email).toBe("alex@example.com");
  });

  it("detects duplicate registrant email case-insensitive", () => {
    const resolved = resolveGuestCommunityCompSignup(
      {
        registrant: {
          first_name: "A",
          last_name: "B",
          email: "Dup@Example.com",
        },
        jnj_selected: true,
        jnj_role: "follow",
      },
      { strictlySelected: false, jnjSelected: true }
    );
    expect("error" in resolved).toBe(false);
    if ("error" in resolved) return;

    const dup = checkDuplicateCommunityCompSignupByEmailFromRows(
      [
        {
          jnj_selected: true,
          jnj_follow_email: "dup@example.com",
        },
      ],
      resolved,
      { strictlySelected: false, jnjSelected: true }
    );
    expect(dup).toBe(true);
  });

  it("allows new email on same event when not registered", () => {
    const resolved = resolveGuestCommunityCompSignup(
      {
        registrant: {
          first_name: "New",
          last_name: "Person",
          email: "new@example.com",
        },
        jnj_selected: true,
        jnj_role: "lead",
      },
      { strictlySelected: false, jnjSelected: true }
    );
    expect("error" in resolved).toBe(false);
    if ("error" in resolved) return;

    const dup = checkDuplicateCommunityCompSignupByEmailFromRows(
      [
        {
          jnj_selected: true,
          jnj_lead_email: "other@example.com",
        },
      ],
      resolved,
      { strictlySelected: false, jnjSelected: true }
    );
    expect(dup).toBe(false);
  });
});
