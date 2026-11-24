import { describe, expect, it } from "vitest";
import {
  buildMarketingEmailFooterHtml,
  buildMarketingEmailFooterText,
} from "./legalFooter";

describe("buildMarketingEmailFooterHtml", () => {
  it("includes unsubscribe and privacy links", () => {
    const html = buildMarketingEmailFooterHtml({
      unsubscribeUrl: "https://countrycityswing.dance/api/newsletter/unsubscribe?email=a&token=b",
    });
    expect(html).toContain("Unsubscribe from weekly emails");
    expect(html).toContain("/privacy");
    expect(html).toContain("unsubscribe?email=");
  });
});

describe("buildMarketingEmailFooterText", () => {
  it("includes unsubscribe URL in plain text", () => {
    const lines = buildMarketingEmailFooterText({
      unsubscribeUrl: "https://example.com/unsub",
    });
    expect(lines.join("\n")).toContain("Unsubscribe: https://example.com/unsub");
  });
});
