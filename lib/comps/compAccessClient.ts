import type { EventApprovalStatus } from "@/lib/communityEvents";

export interface MeCompStaffEvent {
  id: string;
  title: string;
  starts_at: string;
}

export interface MeOrganizedEvent {
  id: string;
  title: string;
  starts_at: string;
  approval_status: EventApprovalStatus;
}

export interface MeProfile {
  id: string;
  role?: string | null;
}

export interface MeResponse {
  profile?: MeProfile | null;
  comp_staff_events?: MeCompStaffEvent[];
  organized_events?: MeOrganizedEvent[];
}

export function isCompAdminRole(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase() === "admin";
}

export function isEventOrganizer(
  me: MeResponse | null | undefined,
  eventId: string
): boolean {
  if (!me?.profile?.id) return false;
  return (me.organized_events ?? []).some(
    (e) => e.id === eventId && e.approval_status === "approved"
  );
}

export function canAccessCompEventOps(
  me: MeResponse | null | undefined,
  eventId: string
): boolean {
  if (!me?.profile) return false;
  if (isCompAdminRole(me.profile.role)) return true;
  if (isEventOrganizer(me, eventId)) return true;
  return (me.comp_staff_events ?? []).some((e) => e.id === eventId);
}

export function canManageCompEvent(
  me: MeResponse | null | undefined,
  eventId: string
): boolean {
  if (!me?.profile) return false;
  if (isCompAdminRole(me.profile.role)) return true;
  return isEventOrganizer(me, eventId);
}

export type EventHostKindUi = "ccs" | "community" | string | null | undefined;

/** Back link for comp event tools (admin index vs host operate hub). */
export function compEventBackHref(
  me: MeResponse | null | undefined,
  eventId: string,
  hostKind: EventHostKindUi
): { href: string; label: string } {
  if (isCompAdminRole(me?.profile?.role)) {
    if (hostKind === "community") {
      return {
        href: `/host/comps/${eventId}/operate`,
        label: "Operate Non-CCS event",
      };
    }
    return { href: "/admin/comps", label: "All competitions" };
  }
  if (hostKind === "community" && isEventOrganizer(me, eventId)) {
    return {
      href: `/host/comps/${eventId}/operate`,
      label: "My event",
    };
  }
  return { href: "/host/comps", label: "My events" };
}

export function canManageCompEventStaff(
  me: MeResponse | null | undefined,
  eventId?: string
): boolean {
  if (!me?.profile) return false;
  if (isCompAdminRole(me.profile.role)) return true;
  if (eventId) return isEventOrganizer(me, eventId);
  return (me.organized_events ?? []).some(
    (e) => e.approval_status === "approved"
  );
}
