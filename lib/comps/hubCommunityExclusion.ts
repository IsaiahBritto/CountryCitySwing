/** Hub live list: community comps never appear on /comps. */
export function isCcsHubLiveCompetition(eventHostKind: string | null | undefined): boolean {
  return (eventHostKind ?? "ccs") !== "community";
}