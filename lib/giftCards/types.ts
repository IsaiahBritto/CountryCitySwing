export type GiftCardStatus = "pending_payment" | "active" | "depleted" | "void";

export type GiftCardTransactionType = "purchase" | "redeem" | "refund" | "adjust" | "void";

export type GiftCardReferenceType = "signup" | "comp_signup" | "merch_order" | "gift_card";

export type GiftCardRow = {
  id: string;
  code: string | null;
  initial_amount: number;
  balance_remaining: number;
  status: GiftCardStatus;
  payment_method: "stripe" | "cash" | null;
  paid: boolean;
  purchased_for_self: boolean;
  buyer_email: string;
  recipient_email: string | null;
  recipient_email_status: string;
  deliver_at: string | null;
  personal_message: string | null;
  recipient_name: string | null;
  buyer_name: string | null;
  deliver_timezone: string | null;
};