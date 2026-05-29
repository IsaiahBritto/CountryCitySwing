export const SOCIAL_REGISTRATION_VIEWER_IDS = new Set([
  "f742f43a-c267-4148-8075-03c774b81641",
]);

export function isSocialRegistrationViewer(userId: string): boolean {
  return SOCIAL_REGISTRATION_VIEWER_IDS.has(userId);
}
