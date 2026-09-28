import type {
  HubPastCompetition,
  HubPastEvent,
} from "@/lib/comps/hubTypes";

export const TN_STATE_LEVEL = "TN State";

export type TnStateWinnerRow = {
  event: HubPastEvent;
  comp: HubPastCompetition;
};

function eventStartMs(event: HubPastEvent): number {
  return event.starts_at ? new Date(event.starts_at).getTime() : 0;
}

function compPublishedMs(comp: HubPastCompetition): number {
  return comp.latestPublishedAt
    ? new Date(comp.latestPublishedAt).getTime()
    : 0;
}

/** True when this division on the event is configured as TN State. */
export function isTnStateCompetition(
  event: HubPastEvent,
  comp: HubPastCompetition
): boolean {
  if (comp.comp_type === "strictly") {
    return event.strictly_level === TN_STATE_LEVEL;
  }
  if (comp.comp_type === "jack_and_jill") {
    return event.jnj_level === TN_STATE_LEVEL;
  }
  return false;
}

/** All TN State divisions that appear in the hub past payload. */
export function collectTnStateWinners(past: HubPastEvent[]): TnStateWinnerRow[] {
  const rows: TnStateWinnerRow[] = [];
  for (const event of past) {
    for (const comp of event.competitions) {
      if (isTnStateCompetition(event, comp)) {
        rows.push({ event, comp });
      }
    }
  }
  return rows;
}

/** Newest comp event that has at least one TN State division with published results. */
export function featuredTnStateEvent(
  past: HubPastEvent[]
): HubPastEvent | null {
  let best: HubPastEvent | null = null;
  let bestMs = -1;

  for (const event of past) {
    const hasTn = event.competitions.some((c) =>
      isTnStateCompetition(event, c)
    );
    if (!hasTn) continue;
    const ms = eventStartMs(event);
    if (ms > bestMs) {
      bestMs = ms;
      best = event;
    }
  }

  return best;
}

/** TN State divisions on the featured event, for display cards. */
export function featuredTnStateCompetitions(
  event: HubPastEvent
): HubPastCompetition[] {
  return event.competitions.filter((c) => isTnStateCompetition(event, c));
}

/** Past hub payload with TN State divisions removed from each event. */
export function pastExcludingTnState(past: HubPastEvent[]): HubPastEvent[] {
  const out: HubPastEvent[] = [];
  for (const event of past) {
    const competitions = event.competitions.filter(
      (c) => !isTnStateCompetition(event, c)
    );
    if (competitions.length === 0) continue;
    out.push({ ...event, competitions });
  }
  return out;
}

/** TN State rows for one comp type, newest event first. */
export function tnStateByCompType(
  past: HubPastEvent[],
  compType: "strictly" | "jack_and_jill"
): TnStateWinnerRow[] {
  const rows = collectTnStateWinners(past).filter(
    ({ comp }) => comp.comp_type === compType
  );
  rows.sort((a, b) => {
    const eventDiff = eventStartMs(b.event) - eventStartMs(a.event);
    if (eventDiff !== 0) return eventDiff;
    return compPublishedMs(b.comp) - compPublishedMs(a.comp);
  });
  return rows;
}
