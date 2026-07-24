import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const unpaidCashSignup = {
  id: "signup-001",
  event_id: "event-123",
  event_title: "Test Social",
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  payment_method: "Cash",
  amount_owed: 20,
  paid: false,
  is_ccs_team: false,
};

let signupRow: typeof unpaidCashSignup | null = unpaidCashSignup;

vi.mock("@/lib/mailer", () => ({
  sendHtmlEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/qrCodeAttachment", () => ({
  makeQrCodeInlineAttachment: vi.fn(async () => ({
    contentId: "qr",
    attachments: [],
  })),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => {
  const supabaseServer = {
    from: (table: string) => {
      if (table === "signups") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => {
                if (!signupRow) {
                  return { data: null, error: { code: "PGRST116", message: "not found" } };
                }
                return { data: signupRow, error: null };
              },
            }),
          }),
        };
      }

      if (table === "events") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  price: 25,
                  price_changes: [{ effective_date: "2020-01-01", price: 30 }],
                  ccs_team_price: null,
                  ccs_team_price_changes: [],
                  time_zone: "America/Chicago",
                  type: "Workshop",
                },
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
  };

  return { supabaseServer };
});

import { GET } from "@/app/api/event-signup/pay/route";

describe("GET /api/event-signup/pay", () => {
  beforeEach(() => {
    signupRow = { ...unpaidCashSignup };
  });

  it("returns signup and current effective eventPrice (not frozen amount_owed)", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/event-signup/pay?signupId=signup-001"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signup.id).toBe("signup-001");
    expect(data.eventPrice).toBe(30);
    expect(data.dueNow).toBe(30);
    expect(data.registeredAt).toBe(20);
  });

  it("returns 404 when signup is missing", async () => {
    signupRow = null;
    const req = new NextRequest(
      "http://localhost:3000/api/event-signup/pay?signupId=missing"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Signup not found");
  });

  it("returns 400 when signup is already paid", async () => {
    signupRow = { ...unpaidCashSignup, paid: true };
    const req = new NextRequest(
      "http://localhost:3000/api/event-signup/pay?signupId=signup-001"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("already been paid");
  });

  it("returns 400 when payment method is not eligible", async () => {
    signupRow = { ...unpaidCashSignup, payment_method: "Stripe" };
    const req = new NextRequest(
      "http://localhost:3000/api/event-signup/pay?signupId=signup-001"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("not eligible");
  });

  it("returns 400 when signupId is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/event-signup/pay");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Signup ID is required");
  });
});
