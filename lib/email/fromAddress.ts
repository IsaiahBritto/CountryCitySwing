/** Format a From address with a display name (quoted for spaces/special chars). */
export function formatFromAddress(displayName: string, email: string): string {
  const safeName = displayName.replace(/"/g, "").trim() || "Country City Swing";
  return `"${safeName}" <${email}>`;
}
