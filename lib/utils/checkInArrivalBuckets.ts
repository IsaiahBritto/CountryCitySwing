export type CheckInArrivalBuckets = {
  m0_30: number;
  m30_35: number;
  m35_40: number;
  m40_45: number;
  m45plus: number;
  beforeStart: number;
  unknownTime: number;
};

export const EMPTY_CHECK_IN_ARRIVAL_BUCKETS: CheckInArrivalBuckets = {
  m0_30: 0,
  m30_35: 0,
  m35_40: 0,
  m40_45: 0,
  m45plus: 0,
  beforeStart: 0,
  unknownTime: 0,
};

/** Half-open minute windows after event start: [0,30), [30,35), … plus before-start and unknown. */
export function computeCheckInArrivalBuckets(
  rows: Array<{ checked_in?: boolean; checked_in_at?: string | null | undefined }>,
  startsAt: string | null | undefined
): CheckInArrivalBuckets {
  if (!startsAt) return { ...EMPTY_CHECK_IN_ARRIVAL_BUCKETS };
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) return { ...EMPTY_CHECK_IN_ARRIVAL_BUCKETS };

  const buckets = { ...EMPTY_CHECK_IN_ARRIVAL_BUCKETS };
  for (const row of rows) {
    if (!row.checked_in) continue;
    if (!row.checked_in_at) {
      buckets.unknownTime += 1;
      continue;
    }
    const atMs = Date.parse(row.checked_in_at);
    if (!Number.isFinite(atMs)) {
      buckets.unknownTime += 1;
      continue;
    }
    const m = (atMs - startMs) / 60_000;
    if (m < 0) buckets.beforeStart += 1;
    else if (m < 30) buckets.m0_30 += 1;
    else if (m < 35) buckets.m30_35 += 1;
    else if (m < 40) buckets.m35_40 += 1;
    else if (m < 45) buckets.m40_45 += 1;
    else buckets.m45plus += 1;
  }

  return buckets;
}
