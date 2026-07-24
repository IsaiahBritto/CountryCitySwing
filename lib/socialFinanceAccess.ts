/** Empty — Brandon/Kyler special-case Social access revoked. Admins + instructor window only. */
export const SOCIAL_FINANCE_VIEWER_IDS = new Set<string>([]);

export function isSocialFinanceViewer(userId: string): boolean {
  return SOCIAL_FINANCE_VIEWER_IDS.has(userId);
}
