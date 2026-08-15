export function profileDisplayName(p: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return name || p.email || "Unknown";
}

export function profileHasCompleteName(p: {
  first_name?: string | null;
  last_name?: string | null;
}): boolean {
  return Boolean(p.first_name?.trim() && p.last_name?.trim());
}
