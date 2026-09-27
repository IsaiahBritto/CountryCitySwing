const LEGACY_8CC_PREORDER_NAMES = new Set([
  "Black CCS x 8CC Shirt (Preorder)",
  "Black CCS x 8CC Crop (Preorder)",
]);

export function isLegacy8ccPreorderProductName(productName: string): boolean {
  return LEGACY_8CC_PREORDER_NAMES.has(productName);
}

export function isMerchPreorderClosed(
  preorderEndAt: string | null | undefined
): boolean {
  if (!preorderEndAt) return false;
  const endMs = new Date(preorderEndAt).getTime();
  return !Number.isNaN(endMs) && endMs <= Date.now();
}

export function isMerchProductPubliclyVisible(
  preorderEndAt: string | null | undefined
): boolean {
  return !isMerchPreorderClosed(preorderEndAt);
}

export function formatMerchPreorderEnd(
  preorderEndAt: string,
  timeZone = "America/Chicago"
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(preorderEndAt));
}

/** datetime-local input value from ISO string (local browser time). */
export function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse datetime-local as local time → ISO UTC. */
export function datetimeLocalValueToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
