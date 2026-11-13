import { supabaseServer } from "@/lib/supabaseServer";

export type CcsSiteAdminContact = {
  id: string;
  displayName: string;
};

/** Build a display label for profiles.role === admin (testable without DB). */
export function formatCcsSiteAdminDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || "CCS admin";
}

export async function loadCcsSiteAdminDisplayNames(): Promise<CcsSiteAdminContact[]> {
  const { data, error } = await supabaseServer
    .from("profiles")
    .select("id, first_name, last_name, role")
    .ilike("role", "admin")
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });

  if (error) {
    console.error("[ccsSiteAdmins] load failed", error);
    return [];
  }

  const admins = (data ?? []).filter(
    (row) => (row.role ?? "").toLowerCase() === "admin"
  );

  return admins.map((row) => ({
    id: row.id as string,
    displayName: formatCcsSiteAdminDisplayName(
      row.first_name as string | null,
      row.last_name as string | null
    ),
  }));
}
