import { describe, expect, it } from "vitest";
import {
  aggregateByProductAndSize,
  aggregateHoodieByProductAndSize,
  computeBaseMerchOrderPlan,
  computeRecommendedCounts,
  computeSizeShares,
  isMerchOrderEligibleForHoodiePreorderStats,
  isMerchOrderEligibleForStats,
  normalizeMerchOrderItems,
} from "./merchAdminAggregates";

describe("isMerchOrderEligibleForStats", () => {
  it("includes paid non-cancelled orders", () => {
    expect(
      isMerchOrderEligibleForStats({ paid: true, status: "pending" })
    ).toBe(true);
  });

  it("excludes unpaid and cancelled", () => {
    expect(
      isMerchOrderEligibleForStats({ paid: false, status: "pending" })
    ).toBe(false);
    expect(
      isMerchOrderEligibleForStats({ paid: true, status: "cancelled" })
    ).toBe(false);
  });
});

describe("aggregateByProductAndSize", () => {
  const names = new Set(["Black CCS Shirt", "Black CCS Crop"]);

  it("sums quantities by product and size for eligible orders only", () => {
    const orders = [
      {
        paid: true,
        status: "processing",
        items: [
          { productName: "Black CCS Shirt", size: "M", quantity: 2 },
          { productName: "Black CCS Crop", size: "S", quantity: 1 },
        ],
      },
      {
        paid: false,
        status: "pending",
        items: [{ productName: "Black CCS Shirt", size: "L", quantity: 99 }],
      },
      {
        paid: true,
        status: "cancelled",
        items: [{ productName: "Black CCS Shirt", size: "L", quantity: 99 }],
      },
    ];

    const { byProduct, grandTotal } = aggregateByProductAndSize(orders, names);
    expect(grandTotal).toBe(3);
    expect(byProduct["Black CCS Shirt"]).toEqual({ M: 2 });
    expect(byProduct["Black CCS Crop"]).toEqual({ S: 1 });
  });

  it("returns zero grand total when no matching items", () => {
    const { grandTotal, byProduct } = aggregateByProductAndSize(
      [{ paid: true, status: "pending", items: [] }],
      names
    );
    expect(grandTotal).toBe(0);
    expect(byProduct).toEqual({});
  });
});

describe("isMerchOrderEligibleForHoodiePreorderStats", () => {
  it("includes unpaid non-cancelled orders", () => {
    expect(
      isMerchOrderEligibleForHoodiePreorderStats({
        paid: false,
        status: "pending",
      })
    ).toBe(true);
  });

  it("excludes cancelled orders", () => {
    expect(
      isMerchOrderEligibleForHoodiePreorderStats({
        paid: true,
        status: "cancelled",
      })
    ).toBe(false);
  });
});

describe("normalizeMerchOrderItems", () => {
  it("parses JSON string arrays", () => {
    const items = normalizeMerchOrderItems(
      JSON.stringify([
        { productName: "Brown Hoodie (Preorder)", size: "L", quantity: 1 },
      ])
    );
    expect(items).toHaveLength(1);
    expect(items[0].productName).toBe("Brown Hoodie (Preorder)");
    expect(items[0].quantity).toBe(1);
  });
});

describe("aggregateHoodieByProductAndSize", () => {
  const catalog = [
    { id: "brown-id", name: "Brown Hoodie (Preorder)" },
    { id: "black-id", name: "Black Hoodie (Preorder)" },
  ];

  it("counts line matched by productId when productName differs", () => {
    const { byProduct, grandTotal } = aggregateHoodieByProductAndSize(
      [
        {
          paid: true,
          status: "pending",
          items: [
            {
              productId: "brown-id",
              productName: "Wrong Name",
              productType: "hoodie",
              size: "M",
              quantity: 2,
            },
          ],
        },
      ],
      catalog
    );
    expect(grandTotal).toBe(2);
    expect(byProduct["Brown Hoodie (Preorder)"]).toEqual({ M: 2 });
  });

  it("counts unpaid non-cancelled hoodie preorder lines", () => {
    const { byProduct, grandTotal } = aggregateHoodieByProductAndSize(
      [
        {
          paid: false,
          status: "pending",
          items: [
            {
              productName: "Brown Hoodie (Preorder)",
              size: "S",
              quantity: 1,
            },
          ],
        },
      ],
      catalog
    );
    expect(grandTotal).toBe(1);
    expect(byProduct["Brown Hoodie (Preorder)"]).toEqual({ S: 1 });
  });

  it("excludes cancelled orders", () => {
    const { grandTotal } = aggregateHoodieByProductAndSize(
      [
        {
          paid: true,
          status: "cancelled",
          items: [
            {
              productName: "Brown Hoodie (Preorder)",
              size: "S",
              quantity: 1,
            },
          ],
        },
      ],
      catalog
    );
    expect(grandTotal).toBe(0);
  });

  it("matches catalog name when line name has extra whitespace", () => {
    const { byProduct, grandTotal } = aggregateHoodieByProductAndSize(
      [
        {
          paid: false,
          status: "pending",
          items: [
            {
              productName: "Brown  Hoodie (Preorder)",
              size: "S",
              quantity: 1,
            },
          ],
        },
      ],
      catalog
    );
    expect(grandTotal).toBe(1);
    expect(byProduct["Brown Hoodie (Preorder)"]).toEqual({ S: 1 });
  });

  it("counts line with productType hoodie and odd name", () => {
    const { byProduct, grandTotal } = aggregateHoodieByProductAndSize(
      [
        {
          paid: true,
          status: "pending",
          items: [
            {
              productName: "Custom Brown Hoodie Label",
              productType: "hoodie",
              size: "XL",
              quantity: 1,
            },
          ],
        },
      ],
      catalog
    );
    expect(grandTotal).toBe(1);
    expect(byProduct["Custom Brown Hoodie Label"]).toEqual({ XL: 1 });
  });
});

describe("computeBaseMerchOrderPlan", () => {
  const shares = [
    { key: "Black CCS Shirt\0M", share: 0.5 },
    { key: "Black CCS Shirt\0L", share: 0.5 },
  ];

  it("with zero on-hand, order total equals budget and matches ideals", () => {
    const plan = computeBaseMerchOrderPlan({
      shares,
      onHandByKey: new Map(),
      orderBudget: 10,
    });
    expect(plan.onHandTotal).toBe(0);
    expect(plan.targetInHandTotal).toBe(10);
    expect(plan.orderTotal).toBe(10);
    expect(plan.orderByKey.get("Black CCS Shirt\0M")).toBe(5);
    expect(plan.orderByKey.get("Black CCS Shirt\0L")).toBe(5);
  });

  it("does not order sizes already at or above ideal in-hand target", () => {
    const plan = computeBaseMerchOrderPlan({
      shares,
      onHandByKey: new Map([
        ["Black CCS Shirt\0M", 10],
        ["Black CCS Shirt\0L", 0],
      ]),
      orderBudget: 10,
    });
    expect(plan.targetInHandTotal).toBe(20);
    expect(plan.idealByKey.get("Black CCS Shirt\0M")).toBe(10);
    expect(plan.orderByKey.get("Black CCS Shirt\0M")).toBe(0);
    expect(plan.orderByKey.get("Black CCS Shirt\0L")).toBe(10);
    expect(plan.orderTotal).toBe(10);
  });

  it("always sums order qty to the batch budget", () => {
    const plan = computeBaseMerchOrderPlan({
      shares,
      onHandByKey: new Map([
        ["Black CCS Shirt\0M", 100],
        ["Black CCS Shirt\0L", 0],
      ]),
      orderBudget: 25,
    });
    expect(plan.orderTotal).toBe(25);
    expect(plan.orderByKey.get("Black CCS Shirt\0M")).toBe(0);
  });

  it("returns zero orders when order budget is zero", () => {
    const plan = computeBaseMerchOrderPlan({
      shares,
      onHandByKey: new Map([
        ["Black CCS Shirt\0M", 5],
        ["Black CCS Shirt\0L", 5],
      ]),
      orderBudget: 0,
    });
    expect(plan.orderTotal).toBe(0);
  });
});

describe("computeRecommendedCounts", () => {
  it("rounds to integers that sum to targetTotal", () => {
    const byProduct = {
      A: { M: 1, L: 1 },
      B: { S: 2 },
    };
    const shares = computeSizeShares(byProduct, 4);
    const counts = computeRecommendedCounts(shares, 10);
    const sum = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(10);
  });

  it("returns all zeros when target is zero", () => {
    const shares = computeSizeShares({ A: { M: 5 } }, 5);
    const counts = computeRecommendedCounts(shares, 0);
    expect([...counts.values()]).toEqual([0]);
  });
});
