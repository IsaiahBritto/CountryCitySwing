export interface MeCompStaffEvent {
  id: string;
  title: string;
  starts_at: string;
}

export interface MeProfile {
  id: string;
  role?: string | null;
}

export interface MeResponse {
  profile?: MeProfile | null;
  comp_staff_events?: MeCompStaffEvent[];
}

export function isCompAdminRole(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase() === "admin";
}

export function canAccessCompEventOps(
  me: MeResponse | null | undefined,
  eventId: string
): boolean {
  if (!me?.profile) return false;
  if (isCompAdminRole(me.profile.role)) return true;
  return (me.comp_staff_events ?? []).some((e) => e.id === eventId);
}

export function canManageCompEventStaff(
  me: MeResponse | null | undefined
): boolean {
  return isCompAdminRole(me?.profile?.role);
}
