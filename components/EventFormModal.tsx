"use client";

import { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface Event {
  id?: number;
  title: string;
  starts_at: string;
  location: string;
  description?: string;
  signupLink?: string;
  signup_link?: string; // Database column name
  price?: number | null;
  strictly_price?: number | null;
  jnj_price?: number | null;
  ccs_team_price?: number | null;
  type?: string;
}

interface EventFormModalProps {
  open: boolean;
  onClose: () => void;
  event?: Event | null;
  onSuccess: () => void;
}

export default function EventFormModal({
  open,
  onClose,
  event,
  onSuccess,
}: EventFormModalProps) {
  const [formData, setFormData] = useState<Event>({
    title: "",
    starts_at: "",
    location: "",
    description: "",
    signupLink: "",
    price: undefined,
    strictly_price: undefined,
    jnj_price: undefined,
    ccs_team_price: undefined,
    type: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEditMode = !!event;

  useEffect(() => {
    if (open) {
      if (event) {
        // Format starts_at for datetime-local input (YYYY-MM-DDTHH:mm)
        const startsAtStr = event.starts_at
          ? new Date(event.starts_at).toISOString().slice(0, 16)
          : "";

        setFormData({
          title: event.title || "",
          starts_at: startsAtStr,
          location: event.location || "",
          description: event.description || "",
          signupLink: event.signupLink || event.signup_link || "",
          price: event.price ?? undefined,
          strictly_price: event.strictly_price ?? undefined,
          jnj_price: event.jnj_price ?? undefined,
          ccs_team_price: event.ccs_team_price ?? undefined,
          type: event.type || "",
        });
      } else {
        // Reset form for new event
        setFormData({
          title: "",
          starts_at: "",
          location: "",
          description: "",
          signupLink: "",
          price: undefined,
          strictly_price: undefined,
          jnj_price: undefined,
          ccs_team_price: undefined,
          type: "",
        });
      }
      setError("");
    }
  }, [open, event]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const url = isEditMode
        ? `/api/events/${event.id}`
        : "/api/events";
      const method = isEditMode ? "PUT" : "POST";

      // Prepare data
      const submitData: any = {
        title: formData.title,
        starts_at: formData.starts_at ? new Date(formData.starts_at).toISOString() : "",
        location: formData.location,
      };

      if (formData.description !== undefined) submitData.description = formData.description || "";
      if (formData.signupLink !== undefined) submitData.signupLink = formData.signupLink || "";
      if (formData.price !== undefined) submitData.price = formData.price != null ? Number(formData.price) : null;
      if (formData.strictly_price !== undefined) submitData.strictly_price = formData.strictly_price != null ? Number(formData.strictly_price) : null;
      if (formData.jnj_price !== undefined) submitData.jnj_price = formData.jnj_price != null ? Number(formData.jnj_price) : null;
      if (formData.ccs_team_price !== undefined) submitData.ccs_team_price = formData.ccs_team_price != null ? Number(formData.ccs_team_price) : null;
      if (formData.type !== undefined) submitData.type = formData.type || "";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.details 
          ? `${result.error}: ${result.details}` 
          : result.error || "Failed to save event";
        throw new Error(errorMsg);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save event");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/60">
      <div className="bg-neutral-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto text-white shadow-xl border border-neutral-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-primary">
            {isEditMode ? "Edit Event" : "Add New Event"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Date & time *
              </label>
              <input
                type="datetime-local"
                required
                value={formData.starts_at}
                onChange={(e) =>
                  setFormData({ ...formData, starts_at: e.target.value })
                }
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Location *
              </label>
              <input
                type="text"
                required
                value={formData.location}
                onChange={(e) =>
                  setFormData({ ...formData, location: e.target.value })
                }
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={4}
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Type (e.g., "Class", "Workshop")
            </label>
            <input
              type="text"
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value })
              }
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formData.type === "Comp" ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Price ($) — optional
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="Leave blank to hide"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Strictly Price ($) — optional
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.strictly_price ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        strictly_price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="Leave blank to hide"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    JnJ Price ($) — optional
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.jnj_price ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        jnj_price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="Leave blank to hide"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    CCS Team Price ($) — optional, shown to instructors
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.ccs_team_price ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ccs_team_price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="Leave blank to use regular price"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    CCS Team Price ($) — optional, shown to instructors
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.ccs_team_price ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ccs_team_price: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="Leave blank to use regular price"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Signup Link
            </label>
            <input
              type="url"
              value={formData.signupLink}
              onChange={(e) =>
                setFormData({ ...formData, signupLink: e.target.value })
              }
              placeholder="https://..."
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

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
              disabled={loading}
              className="px-4 py-2 rounded-md btn-signup disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Saving..."
                : isEditMode
                ? "Update Event"
                : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
