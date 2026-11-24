import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { DEFAULT_TIME_ZONE } from "@/lib/utils/dateHelpers";

dayjs.extend(utc);
dayjs.extend(timezone);

const MAX_MONTHS_AHEAD = 12;
const PERSONAL_MESSAGE_MAX = 1000;

export function clampPersonalMessage(msg: string | null | undefined): string | null {
  if (!msg?.trim()) return null;
  return msg.trim().slice(0, PERSONAL_MESSAGE_MAX);
}

export function parseDeliverAtLocal(
  dateYmd: string,
  hourLocal: number,
  timeZone: string = DEFAULT_TIME_ZONE
): { ok: true; iso: string } | { ok: false; message: string } {
  const hour = Math.floor(hourLocal);
  if (hour < 0 || hour > 23) {
    return { ok: false, message: "Invalid delivery hour." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return { ok: false, message: "Invalid delivery date." };
  }

  const localStr = `${dateYmd}T${String(hour).padStart(2, "0")}:00:00`;
  const dt = dayjs.tz(localStr, timeZone);
  if (!dt.isValid()) {
    return { ok: false, message: "Invalid delivery date/time." };
  }
  const iso = dt.toDate().toISOString();
  const now = Date.now();
  const target = new Date(iso).getTime();
  if (target < now - 5 * 60 * 1000) {
    return { ok: false, message: "Delivery time must be in the future." };
  }
  const max = dayjs().add(MAX_MONTHS_AHEAD, "month");
  if (dt.isAfter(max)) {
    return { ok: false, message: `Schedule within ${MAX_MONTHS_AHEAD} months.` };
  }
  return { ok: true, iso };
}

export function formatDeliverAtForEmail(
  deliverAtIso: string,
  timeZone?: string | null
): string {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(deliverAtIso));
}