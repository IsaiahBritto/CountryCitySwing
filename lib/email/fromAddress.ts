/** Format a From address with a display name (Resend: Name <email>, no surrounding quotes). */
export function formatFromAddress(displayName: string, email: string): string {
  const safeName = displayName.replace(/"/g, "").trim() || "Country City Swing";
  return `${safeName} <${email}>`;
}
