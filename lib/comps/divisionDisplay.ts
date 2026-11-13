import { COMP_TYPE_LABEL } from "@/lib/comps/hubTypes";

/** Public list line: division name + comp type (e.g. "Newcomer (Jack & Jill)"). */
export function formatDivisionListLabel(
  name: string,
  compType: string
): string {
  const trimmed = name.trim() || "Division";
  const typeLabel =
    COMP_TYPE_LABEL[compType] ??
    compType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `${trimmed} (${typeLabel})`;
}
