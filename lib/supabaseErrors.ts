/** True when PostgREST reports a table/relation that is not migrated yet. */
export function isMissingRelationError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
}
