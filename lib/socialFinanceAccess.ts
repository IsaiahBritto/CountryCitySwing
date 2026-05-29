export const SOCIAL_FINANCE_VIEWER_IDS = new Set([
  "1f87df67-d95d-4550-a974-43e6710fea5b",
  "f742f43a-c267-4148-8075-03c774b81641",
]);

export function isSocialFinanceViewer(userId: string): boolean {
  return SOCIAL_FINANCE_VIEWER_IDS.has(userId);
}
