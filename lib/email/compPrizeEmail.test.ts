import { describe, expect, it } from "vitest";
import {
  buildCompPrizeEmailSubject,
  createCompPrizeEmailHtml,
  createCompPrizeEmailText,
} from "@/lib/email/compPrizeEmail";

describe("compPrizeEmail", () => {
  const args = {
    recipientFirstName: "Alice",
    competitionName: "Novice J&J",
    compType: "jack_and_jill",
    placement: 2,
    prizes: [
      { description: "Gift card", redemptionCode: "SAVE10" },
      { description: "Free entry", redemptionCode: null },
    ],
  };

  it("builds subject with placement and comp name", () => {
    expect(buildCompPrizeEmailSubject(args)).toBe(
      "Congratulations — 2nd place, Novice J&J (Jack & Jill)"
    );
  });

  it("escapes HTML in body", () => {
    const html = createCompPrizeEmailHtml({
      ...args,
      recipientFirstName: "Al<script>",
      competitionName: "A & B",
      prizes: [{ description: "Prize <1>", redemptionCode: "C&D" }],
    });
    expect(html).toContain("Hi Al&lt;script&gt;,");
    expect(html).toContain("A &amp; B");
    expect(html).toContain("Prize &lt;1&gt;");
    expect(html).toContain("C&amp;D");
  });

  it("omits redemption code line when empty", () => {
    const html = createCompPrizeEmailHtml({
      ...args,
      prizes: [{ description: "Trophy only", redemptionCode: "" }],
    });
    expect(html).toContain("Trophy only");
    expect(html).not.toContain("Redemption code");
  });

  it("includes redemption code when present", () => {
    const html = createCompPrizeEmailHtml(args);
    expect(html).toContain("SAVE10");
    expect(html).toContain("Redemption code");
  });

  it("builds plain text fallback", () => {
    const text = createCompPrizeEmailText(args);
    expect(text).toContain("Hi Alice,");
    expect(text).toContain("2nd");
    expect(text).toContain("Gift card");
    expect(text).toContain("Redemption code: SAVE10");
    expect(text).not.toContain("Redemption code: null");
  });
});
