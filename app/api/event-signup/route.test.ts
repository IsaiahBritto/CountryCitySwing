import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { sendHtmlEmailMock, makeQrCodeInlineAttachmentMock } = vi.hoisted(() => ({
  sendHtmlEmailMock: vi.fn(async () => undefined),
  makeQrCodeInlineAttachmentMock: vi.fn(async () => ({
    contentId: "qr-content-id",
    attachments: [],
  })),
}));

const canonicalEvent = {
  id: "event-123",
  title: "Canonical Workshop Title",
  type: "Workshop",
  starts_at: "2026-04-20T19:00:00.000Z",
  location: "Main Hall",
  time_zone: "America/Chicago",
  price: 25,
  price_changes: [],
  ccs_team_price: null,
  ccs_team_price_changes: [],
  refund_statement: null as string | null,
};

let insertedSignupRows: Record<string, unknown>[] = [];

vi.mock("@/lib/mailer", () => ({
  sendHtmlEmail: sendHtmlEmailMock,
}));

vi.mock("@/lib/qrCodeAttachment", () => ({
  makeQrCodeInlineAttachment: makeQrCodeInlineAttachmentMock,
}));

vi.mock("@/lib/utils/qrCheckIn", () => ({
  eventSignupToken: () => "ccs:s:test-signup-id",
}));

vi.mock("@/lib/stripePromo", () => ({
  getDiscountedAmountForPromotion: vi.fn(async () => null),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  }),
}));

vi.mock("@/lib/supabaseServer", () => {
  const supabaseServer = {
    from: (table: string) => {
      if (table === "events") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: canonicalEvent, error: null }),
            }),
          }),
        };
      }

      if (table === "signups") {
        return {
          select: () => ({
            eq() {
              return this;
            },
            ilike() {
              return this;
            },
            maybeSingle: async () => ({ data: null, error: null }),
          }),
          insert: (rows: Record<string, unknown>[]) => {
            insertedSignupRows = rows;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "signup-001", ...rows[0] },
                  error: null,
                }),
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table access in test: ${table}`);
    },
  };

  return { supabaseServer };
});

import { POST } from "@/app/api/event-signup/route";

describe("POST /api/event-signup canonical event hardening", () => {
  beforeEach(() => {
    insertedSignupRows = [];
    sendHtmlEmailMock.mockClear();
    makeQrCodeInlineAttachmentMock.mockClear();
  });

  it("uses canonical event title in DB and email when payload event title is tampered", async () => {
    const tamperedPayload = {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      beenBefore: "I've been before!",
      heardAboutUs: "Social Media",
      paymentMethod: "Cash",
      acceptLiability: true,
      acceptPayment: true,
      event: {
        id: canonicalEvent.id,
        title: "WRONG CLASS TITLE FROM CLIENT",
        type: "Comp",
        starts_at: "1999-01-01T00:00:00.000Z",
        location: "Wrong Location",
        price: 999,
      },
    };

    const req = new NextRequest("http://localhost:3000/api/event-signup", {
      method: "POST",
      body: JSON.stringify(tamperedPayload),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    expect(insertedSignupRows).toHaveLength(1);
    expect(insertedSignupRows[0]?.event_id).toBe(canonicalEvent.id);
    expect(insertedSignupRows[0]?.event_title).toBe(canonicalEvent.title);
    expect(insertedSignupRows[0]?.event_title).not.toBe(tamperedPayload.event.title);

    expect(sendHtmlEmailMock).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendHtmlEmailMock.mock.calls[0];
    expect(to).toBe("jane@example.com");
    expect(subject).toContain(canonicalEvent.title);
    expect(subject).not.toContain("WRONG CLASS TITLE FROM CLIENT");
    expect(String(html)).toContain(canonicalEvent.title);
    expect(String(html)).toContain(canonicalEvent.location);
    expect(String(html)).not.toContain("Wrong Location");
  });

  it("rejects signup when refund statement is set and acceptRefund is missing", async () => {
    canonicalEvent.refund_statement = "No refunds within 7 days of the event.";

    const payload = {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      beenBefore: "I've been before!",
      paymentMethod: "Cash",
      acceptLiability: true,
      acceptPayment: true,
      event: { id: canonicalEvent.id },
    };

    const req = new NextRequest("http://localhost:3000/api/event-signup", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/refund/i);
    expect(insertedSignupRows).toHaveLength(0);

    canonicalEvent.refund_statement = null;
  });

  it("allows signup when refund statement is set and acceptRefund is true", async () => {
    canonicalEvent.refund_statement = "No refunds within 7 days of the event.";

    const payload = {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      beenBefore: "I've been before!",
      paymentMethod: "Cash",
      acceptLiability: true,
      acceptPayment: true,
      acceptRefund: true,
      event: { id: canonicalEvent.id },
    };

    const req = new NextRequest("http://localhost:3000/api/event-signup", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(insertedSignupRows).toHaveLength(1);

    canonicalEvent.refund_statement = null;
  });
});
