import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  sendHtmlEmailMock,
  makeQrCodeInlineAttachmentMock,
  constructEventMock,
} = vi.hoisted(() => ({
  sendHtmlEmailMock: vi.fn(async () => undefined),
  makeQrCodeInlineAttachmentMock: vi.fn(async () => ({
    contentId: "qr-content-id",
    attachments: [],
  })),
  constructEventMock: vi.fn(),
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
  compSignupToken: () => "ccs:c:test-comp-id",
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: constructEventMock,
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
            eq: () => ({
              single: async () => ({
                data: null,
                error: { code: "PGRST116", message: "not found" },
              }),
            }),
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

import { POST } from "@/app/api/stripe/webhook/route";

describe("POST /api/stripe/webhook canonical event hardening", () => {
  beforeEach(() => {
    insertedSignupRows = [];
    sendHtmlEmailMock.mockClear();
    makeQrCodeInlineAttachmentMock.mockClear();
    constructEventMock.mockReset();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("uses canonical event title in DB and email when stripe metadata event_title is tampered", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          payment_status: "paid",
          amount_total: 3000,
          amount_subtotal: 3000,
          total_details: { amount_tax: 0, amount_discount: 0 },
          client_reference_id: "signup-client-ref-123",
          payment_intent: "pi_test_abc123",
          metadata: {
            payment_type: "stripe_checkout",
            signup_id: "signup-client-ref-123",
            event_id: canonicalEvent.id,
            event_title: "TAMPERED TITLE FROM STRIPE METADATA",
            first_name: "John",
            last_name: "Smith",
            email: "john@example.com",
            been_before: "I've been before!",
            heard_about_us: "Friend",
            accept_liability: "true",
            accept_payment: "true",
            subtotal: "25",
            processing_fee: "5",
          },
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({ any: "payload" }),
      headers: {
        "stripe-signature": "test_signature",
        "content-type": "application/json",
      },
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);

    expect(insertedSignupRows).toHaveLength(1);
    expect(insertedSignupRows[0]?.event_id).toBe(canonicalEvent.id);
    expect(insertedSignupRows[0]?.event_title).toBe(canonicalEvent.title);
    expect(insertedSignupRows[0]?.event_title).not.toBe("TAMPERED TITLE FROM STRIPE METADATA");
    expect(insertedSignupRows[0]?.stripe_session_id).toBe("cs_test_123");
    expect(insertedSignupRows[0]?.stripe_payment_intent_id).toBe("pi_test_abc123");

    expect(sendHtmlEmailMock).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendHtmlEmailMock.mock.calls[0];
    expect(to).toBe("john@example.com");
    expect(subject).toContain(canonicalEvent.title);
    expect(subject).not.toContain("TAMPERED TITLE FROM STRIPE METADATA");
    expect(String(html)).toContain(canonicalEvent.title);
    expect(String(html)).toContain(canonicalEvent.location);
  });
});
