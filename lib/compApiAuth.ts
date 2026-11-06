import type { NextRequest } from "next/server";
import {
  requireCompetitionManageAuth,
  requireCompEventManageAuth,
  requireRoundManageAuth,
} from "@/lib/compEventAccess";

/** Use at start of `[competitionId]` route handlers after `await params`. */
export function authCompetitionManage(
  req: NextRequest,
  competitionId: string
) {
  return requireCompetitionManageAuth(req, competitionId);
}

/** Use at start of `[eventId]` manage route handlers. */
export function authCompEventManage(req: NextRequest, eventId: string) {
  return requireCompEventManageAuth(req, eventId);
}

/** Use at start of `[roundId]` manage route handlers. */
export function authRoundManage(req: NextRequest, roundId: string) {
  return requireRoundManageAuth(req, roundId);
}
