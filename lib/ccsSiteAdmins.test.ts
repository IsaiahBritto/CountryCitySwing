import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseServer", () => ({
  supabaseServer: { from: vi.fn() },
}));

import { formatCcsSiteAdminDisplayName } from "@/lib/ccsSiteAdmins";

describe("formatCcsSiteAdminDisplayName", () => {
  it("joins first and last name", () => {
    expect(formatCcsSiteAdminDisplayName("Alex", "Admin")).toBe("Alex Admin");
  });

  it("trims whitespace", () => {
    expect(formatCcsSiteAdminDisplayName("  Alex  ", " Admin ")).toBe("Alex Admin");
  });

  it("falls back when names missing", () => {
    expect(formatCcsSiteAdminDisplayName("", null)).toBe("CCS admin");
    expect(formatCcsSiteAdminDisplayName("Solo", "")).toBe("Solo");
  });
});
