export type MerchOrderLineItem = {
  productId?: string;
  productName?: string;
  productType?: string;
  size?: string;
  quantity?: number;
};

export type MerchOrderForStats = {
  paid: boolean;
  status: string;
  items?: MerchOrderLineItem[] | unknown;
};

export type HoodieCatalogEntry = {
  id: string;
  name: string;
};

function isHoodieProductType(productType: string | undefined): boolean {
  return (productType ?? "").trim().toLowerCase() === "hoodie";
}

const HOODIE_PREORDER_NAME_PATTERN = /hoodie\s*\(preorder\)/i;

export function normalizeMerchProductName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function isMerchOrderEligibleForHoodiePreorderStats(
  order: MerchOrderForStats
): boolean {
  return order.status !== "cancelled";
}

export function isMerchOrderEligibleForStats(order: MerchOrderForStats): boolean {
  return order.paid === true && order.status !== "cancelled";
}

export function normalizeMerchOrderItems(items: unknown): MerchOrderLineItem[] {
  let parsed: unknown = items;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object") return {};
    const row = entry as Record<string, unknown>;
    return {
      productId:
        typeof row.productId === "string" ? row.productId : undefined,
      productName:
        typeof row.productName === "string" ? row.productName : undefined,
      productType:
        typeof row.productType === "string" ? row.productType : undefined,
      size: typeof row.size === "string" ? row.size : undefined,
      quantity:
        typeof row.quantity === "number"
          ? row.quantity
          : typeof row.quantity === "string"
            ? Number(row.quantity)
            : undefined,
    };
  });
}

function resolveHoodieCanonicalName(
  item: MerchOrderLineItem,
  idToName: Map<string, string>,
  nameSet: Set<string>,
  normalizedNameToCatalogName: Map<string, string>
): string | null {
  const productId = item.productId?.trim();
  if (productId && idToName.has(productId)) {
    return idToName.get(productId)!;
  }

  const productName = item.productName?.trim();
  if (productName && nameSet.has(productName)) {
    return productName;
  }

  if (productName) {
    const normalized = normalizeMerchProductName(productName);
    const fromCatalog = normalizedNameToCatalogName.get(normalized);
    if (fromCatalog) return fromCatalog;

    if (HOODIE_PREORDER_NAME_PATTERN.test(normalized)) {
      return fromCatalog ?? normalized;
    }
  }

  if (isHoodieProductType(item.productType)) {
    return productName
      ? normalizeMerchProductName(productName)
      : "Unknown hoodie";
  }

  return null;
}

export function aggregateHoodieByProductAndSize(
  orders: MerchOrderForStats[],
  catalog: HoodieCatalogEntry[]
): ProductSizeAggregate {
  const idToName = new Map(catalog.map((p) => [p.id, p.name]));
  const nameSet = new Set(catalog.map((p) => p.name));
  const normalizedNameToCatalogName = new Map(
    catalog.map((p) => [normalizeMerchProductName(p.name), p.name])
  );

  const byProduct: Record<string, Record<string, number>> = {};
  let grandTotal = 0;

  for (const order of orders) {
    if (!isMerchOrderEligibleForHoodiePreorderStats(order)) continue;
    for (const item of normalizeMerchOrderItems(order.items)) {
      const canonicalName = resolveHoodieCanonicalName(
        item,
        idToName,
        nameSet,
        normalizedNameToCatalogName
      );
      if (!canonicalName) continue;

      const size = item.size?.trim() || "—";
      const qty = Math.max(0, item.quantity ?? 0);
      if (qty === 0) continue;

      if (!byProduct[canonicalName]) byProduct[canonicalName] = {};
      byProduct[canonicalName][size] =
        (byProduct[canonicalName][size] ?? 0) + qty;
      grandTotal += qty;
    }
  }

  return { byProduct, grandTotal };
}

export type ProductSizeAggregate = {
  byProduct: Record<string, Record<string, number>>;
  grandTotal: number;
};

export function aggregateByProductAndSize(
  orders: MerchOrderForStats[],
  productNames: Set<string>
): ProductSizeAggregate {
  const byProduct: Record<string, Record<string, number>> = {};
  let grandTotal = 0;

  for (const order of orders) {
    if (!isMerchOrderEligibleForStats(order)) continue;
    for (const item of normalizeMerchOrderItems(order.items)) {
      const name = item.productName;
      if (!name || !productNames.has(name)) continue;
      const size = item.size?.trim() || "—";
      const qty = Math.max(0, item.quantity ?? 0);
      if (qty === 0) continue;

      if (!byProduct[name]) byProduct[name] = {};
      byProduct[name][size] = (byProduct[name][size] ?? 0) + qty;
      grandTotal += qty;
    }
  }

  return { byProduct, grandTotal };
}

const DEFAULT_SIZE_ORDER = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "2XL",
  "3XL",
];

export function sortSizes(sizes: string[], preferredOrder?: string[]): string[] {
  const order = preferredOrder?.length ? preferredOrder : DEFAULT_SIZE_ORDER;
  const rank = new Map(order.map((s, i) => [s, i]));

  return [...new Set(sizes)].sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return String(a).localeCompare(String(b));
  });
}

export type SizeShare = {
  key: string;
  share: number;
};

export function computeSizeShares(
  byProduct: Record<string, Record<string, number>>,
  grandTotal: number
): SizeShare[] {
  if (grandTotal <= 0) return [];

  const shares: SizeShare[] = [];
  for (const [productName, bySize] of Object.entries(byProduct)) {
    for (const [size, qty] of Object.entries(bySize)) {
      shares.push({
        key: `${productName}\0${size}`,
        share: qty / grandTotal,
      });
    }
  }
  return shares;
}

export function computeSizeSharesForProductRows(
  productNames: readonly string[],
  byProduct: Record<string, Record<string, number>>,
  sizesByProductName: Map<string, string[]>,
  grandTotal: number
): SizeShare[] {
  if (grandTotal <= 0) return [];

  const shares: SizeShare[] = [];
  for (const productName of productNames) {
    const bySize = byProduct[productName] ?? {};
    const sizes = sortSizes(
      [...(sizesByProductName.get(productName) ?? []), ...Object.keys(bySize)],
      sizesByProductName.get(productName)
    );
    for (const size of sizes) {
      const qty = bySize[size] ?? 0;
      shares.push({
        key: `${productName}\0${size}`,
        share: qty / grandTotal,
      });
    }
  }
  return shares;
}

/** Largest-remainder rounding so integer counts sum exactly to targetTotal. */
export function computeRecommendedCounts(
  shares: SizeShare[],
  targetTotal: number
): Map<string, number> {
  const result = new Map<string, number>();
  if (targetTotal <= 0 || shares.length === 0) {
    for (const s of shares) result.set(s.key, 0);
    return result;
  }

  const raw = shares.map((s) => ({
    key: s.key,
    exact: s.share * targetTotal,
    floor: Math.floor(s.share * targetTotal),
    remainder: s.share * targetTotal - Math.floor(s.share * targetTotal),
  }));

  let assigned = raw.reduce((sum, r) => sum + r.floor, 0);
  for (const r of raw) {
    result.set(r.key, r.floor);
  }

  let leftover = targetTotal - assigned;
  if (leftover <= 0) {
    return result;
  }

  const byRemainder = [...raw].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.key.localeCompare(b.key);
  });

  for (let i = 0; leftover > 0; i++) {
    const entry = byRemainder[i % byRemainder.length];
    result.set(entry.key, (result.get(entry.key) ?? 0) + 1);
    leftover -= 1;
  }

  return result;
}

export function parseShareKey(key: string): { productName: string; size: string } {
  const idx = key.indexOf("\0");
  if (idx === -1) return { productName: key, size: "—" };
  return {
    productName: key.slice(0, idx),
    size: key.slice(idx + 1),
  };
}

export type BaseMerchOrderPlan = {
  targetInHandTotal: number;
  idealByKey: Map<string, number>;
  orderByKey: Map<string, number>;
  orderTotal: number;
  onHandTotal: number;
};

function normalizeShareWeights(subset: SizeShare[]): SizeShare[] {
  if (subset.length === 0) return [];
  const sum = subset.reduce((a, s) => a + s.share, 0);
  return subset.map((s) => ({
    key: s.key,
    share: sum > 0 ? s.share / sum : 1 / subset.length,
  }));
}

/** Allocate exactly `budget` units; cap each key at `roomByKey` when set, redistributing overflow. */
function allocateOrderBudgetWithRoomCaps(
  shares: SizeShare[],
  budget: number,
  roomByKey: Map<string, number>
): Map<string, number> {
  const orderByKey = new Map<string, number>();
  for (const s of shares) orderByKey.set(s.key, 0);
  if (budget <= 0 || shares.length === 0) return orderByKey;

  const shareByKey = new Map(shares.map((s) => [s.key, s.share]));

  const keysWithRoom = shares.filter(
    (s) => (roomByKey.get(s.key) ?? 0) > 0
  );

  let pool = keysWithRoom.length > 0 ? keysWithRoom : shares;
  let draft = computeRecommendedCounts(normalizeShareWeights(pool), budget);

  for (const s of shares) {
    orderByKey.set(s.key, draft.get(s.key) ?? 0);
  }

  for (let pass = 0; pass < shares.length + 2; pass++) {
    let overflow = 0;
    for (const s of shares) {
      const room = roomByKey.get(s.key) ?? 0;
      const current = orderByKey.get(s.key) ?? 0;
      if (room <= 0) {
        if (current !== 0) overflow += current;
        orderByKey.set(s.key, 0);
        continue;
      }
      if (current > room) {
        overflow += current - room;
        orderByKey.set(s.key, room);
      }
    }

    if (overflow === 0) break;

    const receivers = shares.filter((s) => {
      const room = roomByKey.get(s.key) ?? 0;
      const current = orderByKey.get(s.key) ?? 0;
      return room > 0 && current < room;
    });

    if (receivers.length === 0) {
      const extra = computeRecommendedCounts(
        normalizeShareWeights(shares),
        overflow
      );
      for (const s of shares) {
        orderByKey.set(s.key, (orderByKey.get(s.key) ?? 0) + (extra.get(s.key) ?? 0));
      }
      break;
    }

    const weighted: SizeShare[] = receivers.map((s) => ({
      key: s.key,
      share:
        (shareByKey.get(s.key) ?? 0) *
        ((roomByKey.get(s.key) ?? 0) - (orderByKey.get(s.key) ?? 0)),
    }));
    const add = computeRecommendedCounts(
      normalizeShareWeights(weighted),
      overflow
    );
    for (const s of receivers) {
      orderByKey.set(
        s.key,
        (orderByKey.get(s.key) ?? 0) + (add.get(s.key) ?? 0)
      );
    }
  }

  let sum = 0;
  for (const v of orderByKey.values()) sum += v;
  let fix = budget - sum;
  if (fix !== 0) {
    const sorted = [...shares].sort((a, b) => a.key.localeCompare(b.key));
    for (const s of sorted) {
      if (fix === 0) break;
      const room = roomByKey.get(s.key) ?? 0;
      const current = orderByKey.get(s.key) ?? 0;
      if (fix > 0) {
        const cap = room > 0 ? room - current : 0;
        if (cap <= 0 && room === 0) continue;
        const step = cap > 0 ? Math.min(fix, cap) : fix;
        orderByKey.set(s.key, current + step);
        fix -= step;
      } else {
        const step = Math.min(current, -fix);
        if (step <= 0) continue;
        orderByKey.set(s.key, current - step);
        fix += step;
      }
    }
  }

  return orderByKey;
}

export function computeBaseMerchOrderPlan({
  shares,
  onHandByKey,
  orderBudget,
}: {
  shares: SizeShare[];
  onHandByKey: Map<string, number>;
  orderBudget: number;
}): BaseMerchOrderPlan {
  const emptyIdeal = new Map<string, number>();
  const emptyOrder = new Map<string, number>();
  for (const s of shares) {
    emptyIdeal.set(s.key, 0);
    emptyOrder.set(s.key, 0);
  }

  let onHandTotal = 0;
  for (const v of onHandByKey.values()) {
    onHandTotal += Math.max(0, v);
  }

  if (orderBudget <= 0 || shares.length === 0) {
    return {
      targetInHandTotal: onHandTotal,
      idealByKey: emptyIdeal,
      orderByKey: emptyOrder,
      orderTotal: 0,
      onHandTotal,
    };
  }

  const targetInHandTotal = onHandTotal + orderBudget;
  const idealByKey = computeRecommendedCounts(shares, targetInHandTotal);

  const roomByKey = new Map<string, number>();
  for (const s of shares) {
    const onHand = Math.max(0, onHandByKey.get(s.key) ?? 0);
    const ideal = idealByKey.get(s.key) ?? 0;
    roomByKey.set(s.key, onHand >= ideal ? 0 : ideal - onHand);
  }

  const orderByKey = allocateOrderBudgetWithRoomCaps(
    shares,
    orderBudget,
    roomByKey
  );

  let orderTotal = 0;
  for (const v of orderByKey.values()) orderTotal += v;

  return {
    targetInHandTotal,
    idealByKey,
    orderByKey,
    orderTotal,
    onHandTotal,
  };
}
