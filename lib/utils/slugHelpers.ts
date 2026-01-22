/**
 * Generate a URL-friendly slug from a name
 * Example: "Isaiah Britto" -> "Isaiah-Britto"
 */
export function nameToSlug(firstName: string, lastName: string): string {
  return `${firstName.trim()}-${lastName.trim()}`;
}

/**
 * Parse a slug back into first and last name
 * Example: "Isaiah-Britto" -> { firstName: "Isaiah", lastName: "Britto" }
 */
export function slugToName(slug: string): { firstName: string; lastName: string } | null {
  const parts = slug.split("-");
  if (parts.length < 2) return null;
  
  // Handle names with multiple parts (e.g., "Mary-Jane Watson" -> firstName: "Mary-Jane", lastName: "Watson")
  // For simplicity, we'll assume the last part is the last name
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join("-");
  
  return { firstName, lastName };
}
