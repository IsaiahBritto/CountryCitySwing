export function musicApiExtraHeaders(input: {
  appleMusic?: boolean;
  musicUserToken?: string | null;
  storefrontId?: string | null;
}): Record<string, string> {
  if (!input.appleMusic) return {};
  const headers: Record<string, string> = {};
  if (input.musicUserToken?.trim()) {
    headers["Music-User-Token"] = input.musicUserToken.trim();
  }
  if (input.storefrontId?.trim()) {
    headers["X-Apple-Music-Storefront"] = input.storefrontId.trim();
  }
  return headers;
}
