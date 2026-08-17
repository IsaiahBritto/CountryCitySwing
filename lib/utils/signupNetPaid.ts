import { roundCurrency } from "@/lib/utils/paymentHelpers";

export type SignupNetPaidInput = {
  id: string | number;
  amount_paid?: number | null;
  amount_owed?: number | null;
};

export type SignupWithNetPaid<T extends SignupNetPaidInput> = T & {
  principal_refunded_total: number;
  net_amount_paid: number;
};

export function buildPrincipalRefundedMap(
  rows: { signup_id?: string | null; comp_signup_id?: string | null; principal_refunded?: number | null }[],
  idKey: "signup_id" | "comp_signup_id"
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const id = String(row[idKey] ?? "");
    if (!id) continue;
    const amt = Number(row.principal_refunded) || 0;
    map.set(id, (map.get(id) ?? 0) + amt);
  }
  return map;
}

export function withNetPaidAmount<T extends SignupNetPaidInput>(
  rows: T[],
  refundedPrincipal: Map<string, number>
): SignupWithNetPaid<T>[] {
  return rows.map((row) => {
    const id = String(row.id);
    const principalRefunded = refundedPrincipal.get(id) ?? 0;
    const collected =
      row.amount_paid != null && Number.isFinite(Number(row.amount_paid))
        ? Number(row.amount_paid)
        : Number(row.amount_owed ?? 0);
    return {
      ...row,
      principal_refunded_total: principalRefunded,
      net_amount_paid: roundCurrency(Math.max(0, collected - principalRefunded)),
    };
  });
}
