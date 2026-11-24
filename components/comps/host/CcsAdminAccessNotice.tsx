"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/comps/clientAuth";

type AdminContact = { id: string; displayName: string };

const NOTICE =
  "Country City Swing admins can view this event’s details and may assist with running competitions during your event.";

export default function CcsAdminAccessNotice() {
  const [admins, setAdmins] = useState<AdminContact[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await authedFetch("/api/non-ccs-events/ccs-admins");
      if (cancelled) return;
      if (!res.ok) {
        setFailed(true);
        setAdmins([]);
        return;
      }
      const data = await res.json();
      setAdmins((data.ccs_site_admins ?? []) as AdminContact[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside
      className="mt-6 rounded-lg border border-neutral-700 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-400"
      aria-labelledby="ccs-admin-access-heading"
    >
      <h2
        id="ccs-admin-access-heading"
        className="text-xs font-medium uppercase tracking-wide text-neutral-500"
      >
        CCS admin access
      </h2>
      <p className="mt-2 text-neutral-300">{NOTICE}</p>
      <p className="mt-3 text-xs font-medium uppercase text-neutral-500">
        People with this access
      </p>
      {admins === null ? (
        <p className="mt-1 text-neutral-500">Loading…</p>
      ) : failed ? (
        <p className="mt-1 text-neutral-500">CCS admin team</p>
      ) : admins.length === 0 ? (
        <p className="mt-1 text-neutral-500">CCS admin team</p>
      ) : (
        <ul className="mt-1 list-inside list-disc text-neutral-200">
          {admins.map((a) => (
            <li key={a.id}>{a.displayName}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
