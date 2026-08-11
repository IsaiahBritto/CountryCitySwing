import { supabaseServer } from "@/lib/supabaseServer";
import { countClassSignupsByEmail, normalizeSignupEmail } from "@/lib/classLevels";

const PAGE_SIZE = 1000;
const CLASS_EVENT_TYPE = "Class";

type ClassSignupRow = {
  email: string | null;
  refunded_or_cancelled: string | null;
};

function isActiveSignup(refundedOrCancelled: string | null | undefined): boolean {
  return String(refundedOrCancelled ?? "active") !== "cancelled";
}

async function loadClassEventIds(): Promise<string[]> {
  const { data: classEvents, error } = await supabaseServer
    .from("events")
    .select("id")
    .eq("type", CLASS_EVENT_TYPE);

  if (error) {
    console.error("classSignupCounts: load class events", error);
    return [];
  }

  return (classEvents ?? []).map((row) => String(row.id));
}

async function loadAllClassSignupRows(): Promise<ClassSignupRow[]> {
  const classEventIds = await loadClassEventIds();
  if (classEventIds.length === 0) return [];

  const rows: ClassSignupRow[] = [];
  const chunkSize = 40;

  for (let i = 0; i < classEventIds.length; i += chunkSize) {
    const eventChunk = classEventIds.slice(i, i + chunkSize);
    let offset = 0;

    while (true) {
      const { data, error } = await supabaseServer
        .from("signups")
        .select("email, refunded_or_cancelled")
        .in("event_id", eventChunk)
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error("classSignupCounts: load signups by event chunk", error);
        break;
      }

      const batch = (data ?? []) as ClassSignupRow[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return rows;
}

/** Total class event signups per email across the database (non-cancelled only). */
export async function loadClassSignupCountsByEmail(
  emails: string[]
): Promise<Map<string, number>> {
  const targetEmails = [
    ...new Set(
      emails
        .map((email) => normalizeSignupEmail(email))
        .filter((email): email is string => email != null)
    ),
  ];
  if (targetEmails.length === 0) return new Map();

  const rows = await loadAllClassSignupRows();
  const activeRows = rows.filter((row) => isActiveSignup(row.refunded_or_cancelled));

  return countClassSignupsByEmail(activeRows, targetEmails);
}

/** @deprecated Use loadClassSignupCountsByEmail */
export const loadClassCheckInCountsByEmail = loadClassSignupCountsByEmail;
