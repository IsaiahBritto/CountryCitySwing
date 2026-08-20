/** Client-safe types and helpers for payments due (no server imports). */

export type MarkPaidRoute =
  | "nashville-night-finances"
  | "class-event-finances"
  | "the-social-finances"
  | "workshop-finances"
  | "comp-finances";

export type PaymentDueRow = {
  id: string;
  eventId: string;
  payeeName: string;
  amount: number;
  roleLabel?: string;
  markPaid: {
    route: MarkPaidRoute;
    body: Record<string, unknown>;
  };
};

export type PaymentsDueByEvent = {
  eventId: string;
  eventTitle: string;
  eventStart: string | null;
  rows: PaymentDueRow[];
};

export type PaymentsDueResult = {
  events: PaymentsDueByEvent[];
  totalOutstanding: number;
};

export function guestInstructorNameFromEventTitle(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  const match = /^workshop\s+by\s+(.+)$/i.exec(t);
  if (match?.[1]?.trim()) return match[1].trim();
  return "Guest instructor";
}
