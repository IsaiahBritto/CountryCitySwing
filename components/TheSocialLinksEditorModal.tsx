"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { emitCcsSuccessToast } from "@/lib/ccsSuccessToastBus";
import type { ExternalPlaylistLink } from "@/lib/bioLinks";

type EditableLink = {
  id?: string;
  label: string;
  href: string;
};

interface TheSocialLinksEditorModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function createEmptyLink(): EditableLink {
  return { label: "", href: "" };
}

export default function TheSocialLinksEditorModal({
  open,
  onClose,
  onSuccess,
}: TheSocialLinksEditorModalProps) {
  const [links, setLinks] = useState<EditableLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/the-social-playlist-links");
      if (!res.ok) {
        throw new Error("Failed to load playlist links");
      }
      const data = await res.json();
      const loaded = (data.links as ExternalPlaylistLink[] | undefined) ?? [];
      setLinks(
        loaded.length > 0
          ? loaded.map((link) => ({
              id: link.id,
              label: link.label,
              href: link.href,
            }))
          : [createEmptyLink()]
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load playlist links");
      setLinks([createEmptyLink()]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadLinks();
    }
  }, [open, loadLinks]);

  const updateLink = (index: number, patch: Partial<EditableLink>) => {
    setLinks((current) =>
      current.map((link, i) => (i === index ? { ...link, ...patch } : link))
    );
  };

  const addLink = () => {
    setLinks((current) => [...current, createEmptyLink()]);
  };

  const removeLink = (index: number) => {
    setLinks((current) => current.filter((_, i) => i !== index));
  };

  const moveLink = (index: number, direction: -1 | 1) => {
    setLinks((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const updated = [...current];
      [updated[index], updated[nextIndex]] = [updated[nextIndex], updated[index]];
      return updated;
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        throw new Error("You must be logged in as an admin to save changes");
      }

      const res = await fetch("/api/the-social-playlist-links", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ links }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save playlist links");
      }

      emitCcsSuccessToast("The Social playlist links updated.");
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save playlist links");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/60">
      <div className="bg-neutral-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto text-white shadow-xl border border-neutral-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-primary">Edit Link Tree</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Manage The Social playlist links shown on the{" "}
          <span className="text-gray-300">/links</span> page.
        </p>

        {loading ? (
          <p className="text-gray-400 py-8 text-center">Loading links...</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-4">
              {links.map((link, index) => (
                <div
                  key={link.id ?? `new-${index}`}
                  className="rounded-lg border border-neutral-700 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-300">
                      Link {index + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moveLink(index, -1)}
                        disabled={index === 0}
                        className="p-1 rounded text-gray-400 hover:text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Move link up"
                      >
                        <ArrowUpIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLink(index, 1)}
                        disabled={index === links.length - 1}
                        className="p-1 rounded text-gray-400 hover:text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Move link down"
                      >
                        <ArrowDownIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLink(index)}
                        className="px-2 py-1 text-xs rounded bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Label *
                    </label>
                    <input
                      type="text"
                      required
                      value={link.label}
                      onChange={(e) => updateLink(index, { label: e.target.value })}
                      placeholder="Country Swing Playlist"
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      URL *
                    </label>
                    <input
                      type="url"
                      required
                      value={link.href}
                      onChange={(e) => updateLink(index, { href: e.target.value })}
                      placeholder="https://open.spotify.com/playlist/..."
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addLink}
              className="w-full px-4 py-2 rounded-md border border-neutral-600 text-gray-300 hover:bg-neutral-700 transition-colors"
            >
              Add link
            </button>

            {error && (
              <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 text-red-200">
                {error}
              </div>
            )}

            <div className="flex justify-center gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || links.length === 0}
                className="px-4 py-2 rounded-md btn-signup disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Links"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
