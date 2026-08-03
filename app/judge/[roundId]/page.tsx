"use client";

import { Suspense, use, useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authedFetch, apiError } from "@/lib/comps/clientAuth";
import type { JudgeRoundApiResponse } from "@/lib/comps/judgeRoundViews";
import {
  activeJudgeRoundView,
  bundleNeedsCheckinPoll,
  parseJudgeRoundBundle,
  showJudgeRoleToggle,
  type JudgeRoundBundle,
} from "@/lib/comps/judgeRoundViews";
import type { JudgeRoundViewPayload } from "@/lib/comps/judgeRoundPayload";
import CallbackSheet from "@/components/comps/judge/CallbackSheet";
import FinalsSheet from "@/components/comps/judge/FinalsSheet";
import JudgeRoleToggle from "@/components/comps/judge/JudgeRoleToggle";
import type { DanceRole } from "@/lib/comps/types";

const ROUND_LABEL: Record<string, string> = {
  prelims: "Prelims",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

export default function JudgeRoundPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-12">
          <p className="text-center text-neutral-400">Loading round…</p>
        </div>
      }
    >
      <JudgeRoundInner params={params} />
    </Suspense>
  );
}

function JudgeRoundInner({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = use(params);
  const searchParams = useSearchParams();
  const asAssignment = searchParams.get("as");

  const [bundle, setBundle] = useState<JudgeRoundBundle | null>(null);
  const [activeRole, setActiveRole] = useState<DanceRole>("lead");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (resetRole = false) => {
    const url = asAssignment
      ? `/api/judge/rounds/${roundId}?judge_assignment_id=${asAssignment}`
      : `/api/judge/rounds/${roundId}`;
    const res = await authedFetch(url);
    if (!res.ok) {
      setError(await apiError(res));
      return;
    }
    const data = (await res.json()) as JudgeRoundApiResponse;
    const parsed = parseJudgeRoundBundle(data, roundId);
    setBundle(parsed.bundle);
    if (resetRole) setActiveRole(parsed.activeRole);
    setError(null);
  }, [roundId, asAssignment]);

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    if (!bundle || !bundleNeedsCheckinPoll(bundle)) return;
    const interval = setInterval(() => load(false), 7000);
    return () => clearInterval(interval);
  }, [bundle, load]);

  if (error) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-xl border border-neutral-700 bg-neutral-800/50 p-8 text-center">
        <p className="mb-4 text-red-300">{error}</p>
        <Link href="/judge" className="text-sm text-primary">
          ← Back to my rounds
        </Link>
      </div>
    );
  }
  if (!bundle) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-center text-neutral-400">Loading round…</p>
      </div>
    );
  }

  const roleToggleVisible = showJudgeRoleToggle(bundle);
  const activeView = activeJudgeRoundView(bundle, activeRole);
  if (!activeView) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-center text-neutral-400">Loading round…</p>
      </div>
    );
  }

  const { competition } = bundle;
  const title = `${competition.name} · ${ROUND_LABEL[activeView.round.round_type] ?? activeView.round.round_type}${
    activeView.round.judged_role && !roleToggleVisible
      ? ` — ${activeView.round.judged_role === "lead" ? "Leads" : "Follows"}`
      : ""
  }`;

  const roleToggle = roleToggleVisible ? (
    <JudgeRoleToggle activeRole={activeRole} onRoleChange={setActiveRole} />
  ) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:py-6">
      <div className="mb-4">
        <Link href="/judge" className="text-xs text-neutral-500 hover:text-primary">
          ← My rounds
        </Link>
        <h1 className="text-base font-bold leading-snug text-white sm:text-lg">{title}</h1>
        {asAssignment && (
          <p className="text-xs text-amber-400">
            Entering scores on a judge&apos;s behalf (admin)
          </p>
        )}
      </div>

      {activeView.round.status === "checkin" && (
        <CheckinBanner checkin={activeView.checkin} />
      )}

      {["closed", "tabulated", "published"].includes(activeView.round.status) &&
        activeView.sheet.status !== "submitted" && (
          <div className="mb-3 rounded-md border border-neutral-600 bg-neutral-800/60 p-3 text-sm text-neutral-300">
            Scoring is closed for this round.
          </div>
        )}

      {roleToggleVisible && bundle.leadView && bundle.followView ? (
        activeView.round.scoring_mode === "callback" ? (
          <>
            <RoleCallbackSheet
              view={bundle.leadView}
              visible={activeRole === "lead"}
              judgeAssignmentId={bundle.judgeAssignmentId}
              isOverride={!!asAssignment}
              onSubmitted={() => load(false)}
              stickyHeaderExtra={roleToggle}
            />
            <RoleCallbackSheet
              view={bundle.followView}
              visible={activeRole === "follow"}
              judgeAssignmentId={bundle.judgeAssignmentId}
              isOverride={!!asAssignment}
              onSubmitted={() => load(false)}
              stickyHeaderExtra={roleToggle}
            />
          </>
        ) : (
          <>
            <RoleFinalsSheet
              view={bundle.leadView}
              visible={activeRole === "lead"}
              judgeAssignmentId={bundle.judgeAssignmentId}
              isOverride={!!asAssignment}
              onSubmitted={() => load(false)}
              stickyHeaderExtra={roleToggle}
            />
            <RoleFinalsSheet
              view={bundle.followView}
              visible={activeRole === "follow"}
              judgeAssignmentId={bundle.judgeAssignmentId}
              isOverride={!!asAssignment}
              onSubmitted={() => load(false)}
              stickyHeaderExtra={roleToggle}
            />
          </>
        )
      ) : (
        activeView.round.status !== "checkin" &&
        activeView.round.status !== "pending" &&
        activeView.entries.length > 0 &&
        (activeView.round.scoring_mode === "callback" ? (
          <RoleCallbackSheet
            view={activeView}
            visible
            judgeAssignmentId={bundle.judgeAssignmentId}
            isOverride={!!asAssignment}
            onSubmitted={() => load(false)}
            stickyHeaderExtra={roleToggle}
          />
        ) : (
          <RoleFinalsSheet
            view={activeView}
            visible
            judgeAssignmentId={bundle.judgeAssignmentId}
            isOverride={!!asAssignment}
            onSubmitted={() => load(false)}
            stickyHeaderExtra={roleToggle}
          />
        ))
      )}
    </div>
  );
}

function CheckinBanner({
  checkin,
}: {
  checkin: JudgeRoundViewPayload["checkin"];
}) {
  return (
    <div
      className={
        "rounded-xl border p-6 text-center " +
        (checkin.complete
          ? "border-primary/40 bg-primary/10"
          : "border-amber-500/40 bg-amber-500/10")
      }
    >
      {checkin.complete ? (
        <>
          <p className="font-medium text-primary">Check-in complete</p>
          <p className="mt-1 text-sm text-neutral-400">
            Waiting for the director to open scoring. Your sheet will appear
            here as soon as the floor opens.
          </p>
        </>
      ) : (
        <>
          <p className="font-medium text-amber-300">Check-in in progress</p>
          <p className="mt-1 text-sm text-neutral-400">
            Your sheet will appear once every competitor is checked in and the
            director opens the floor.
          </p>
        </>
      )}
    </div>
  );
}

function RoleCallbackSheet({
  view,
  visible,
  judgeAssignmentId,
  isOverride,
  onSubmitted,
  stickyHeaderExtra,
}: {
  view: JudgeRoundViewPayload;
  visible: boolean;
  judgeAssignmentId: string;
  isOverride: boolean;
  onSubmitted: () => void;
  stickyHeaderExtra?: ReactNode;
}) {
  if (
    view.round.status === "checkin" ||
    view.round.status === "pending" ||
    view.entries.length === 0
  ) {
    return null;
  }

  const sheetStatus =
    view.round.status === "open" ? view.sheet.status : "submitted";

  return (
    <div className={visible ? "" : "hidden"}>
      <CallbackSheet
        key={`${view.round.id}-${judgeAssignmentId}-${view.sheet.status}`}
        roundId={view.round.id}
        judgeAssignmentId={judgeAssignmentId}
        isOverride={isOverride}
        callbackCount={view.round.callback_count ?? 0}
        alternateCount={view.round.alternate_count ?? 0}
        entries={view.entries}
        initialScores={view.scores}
        sheetStatus={sheetStatus as "draft" | "submitted"}
        onSubmitted={onSubmitted}
        stickyHeaderExtra={stickyHeaderExtra}
      />
    </div>
  );
}

function RoleFinalsSheet({
  view,
  visible,
  judgeAssignmentId,
  isOverride,
  onSubmitted,
  stickyHeaderExtra,
}: {
  view: JudgeRoundViewPayload;
  visible: boolean;
  judgeAssignmentId: string;
  isOverride: boolean;
  onSubmitted: () => void;
  stickyHeaderExtra?: ReactNode;
}) {
  if (
    view.round.status === "checkin" ||
    view.round.status === "pending" ||
    view.entries.length === 0
  ) {
    return null;
  }

  const sheetStatus =
    view.round.status === "open" ? view.sheet.status : "submitted";

  return (
    <div className={visible ? "" : "hidden"}>
      <FinalsSheet
        key={`${view.round.id}-${judgeAssignmentId}-${view.sheet.status}`}
        roundId={view.round.id}
        judgeAssignmentId={judgeAssignmentId}
        isOverride={isOverride}
        entries={view.entries}
        initialScores={view.scores}
        sheetStatus={sheetStatus as "draft" | "submitted"}
        onSubmitted={onSubmitted}
        stickyHeaderExtra={stickyHeaderExtra}
      />
    </div>
  );
}
