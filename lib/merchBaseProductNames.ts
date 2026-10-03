export const BASE_CCS_MERCH_PRODUCT_NAMES = [
  "Black CCS Shirt",
  "Black CCS Crop",
  "Desert Pink Crop",
] as const;

export type BaseCcsMerchProductName =
  (typeof BASE_CCS_MERCH_PRODUCT_NAMES)[number];

export function baseCcsMerchProductNameSet(): Set<string> {
  return new Set(BASE_CCS_MERCH_PRODUCT_NAMES);
}
