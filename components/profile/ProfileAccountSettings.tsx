"use client";

export default function ProfileAccountSettings({
  profile,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  passwordUpdating,
  passwordMessage,
  onPasswordSubmit,
  newEmail,
  setNewEmail,
  confirmNewEmail,
  setConfirmNewEmail,
  emailUpdating,
  emailMessage,
  onEmailSubmit,
  testNewsletterSending,
  testNewsletterMessage,
  onTestNewsletter,
  onSignOut,
}: {
  profile: { email: string; role: string };
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  passwordUpdating: boolean;
  passwordMessage: { type: "success" | "error"; text: string } | null;
  onPasswordSubmit: (e: React.FormEvent) => void;
  newEmail: string;
  setNewEmail: (v: string) => void;
  confirmNewEmail: string;
  setConfirmNewEmail: (v: string) => void;
  emailUpdating: boolean;
  emailMessage: { type: "success" | "error"; text: string } | null;
  onEmailSubmit: (e: React.FormEvent) => void;
  testNewsletterSending: boolean;
  testNewsletterMessage: { type: "success" | "error"; text: string } | null;
  onTestNewsletter: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="space-y-8">
      {(profile.role ?? "").toLowerCase() === "admin" && (
        <div className="pb-4 border-b border-neutral-600">
          <p className="text-gray-400 text-sm mb-2">
            Send a test copy of the weekly newsletter to your email.
          </p>
          <button
            type="button"
            disabled={testNewsletterSending}
            onClick={onTestNewsletter}
            className="px-4 py-2 rounded-md bg-neutral-600 hover:bg-neutral-500 text-white text-sm disabled:opacity-50"
          >
            {testNewsletterSending ? "Sending…" : "Send test newsletter"}
          </button>
          {testNewsletterMessage && (
            <p
              className={`text-sm mt-2 ${testNewsletterMessage.type === "success" ? "text-green-400" : "text-red-400"}`}
            >
              {testNewsletterMessage.text}
            </p>
          )}
        </div>
      )}

      <div>
        <h4 className="text-base font-semibold text-primary mb-3">Change password</h4>
        <form onSubmit={onPasswordSubmit} className="space-y-4 max-w-md">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            autoComplete="new-password"
            minLength={6}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            autoComplete="new-password"
            minLength={6}
          />
          {passwordMessage && (
            <p
              className={`text-sm ${passwordMessage.type === "success" ? "text-green-400" : "text-red-400"}`}
            >
              {passwordMessage.text}
            </p>
          )}
          <button
            type="submit"
            disabled={passwordUpdating}
            className="btn-signup py-2 px-4 rounded-md"
          >
            {passwordUpdating ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>

      <div>
        <h4 className="text-base font-semibold text-primary mb-3">Change email</h4>
        <form onSubmit={onEmailSubmit} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Current email</label>
            <input
              type="email"
              value={profile.email ?? ""}
              readOnly
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-gray-400 cursor-not-allowed"
            />
          </div>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="New email address"
            className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            autoComplete="email"
          />
          <input
            type="email"
            value={confirmNewEmail}
            onChange={(e) => setConfirmNewEmail(e.target.value)}
            placeholder="Confirm new email address"
            className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
            autoComplete="email"
          />
          {emailMessage && (
            <p
              className={`text-sm ${emailMessage.type === "success" ? "text-green-400" : "text-red-400"}`}
            >
              {emailMessage.text}
            </p>
          )}
          <button
            type="submit"
            disabled={emailUpdating}
            className="btn-signup py-2 px-4 rounded-md"
          >
            {emailUpdating ? "Sending…" : "Send confirmation email"}
          </button>
        </form>
      </div>

      <div className="text-center pt-4">
        <button
          type="button"
          onClick={onSignOut}
          className="w-full py-2 rounded-md font-semibold transition-all duration-300
             bg-transparent border border-red-500 text-red-400
             shadow-[0_0_15px_rgba(239,68,68,0.4)]
             hover:bg-red-500 hover:text-black
             hover:shadow-[0_0_25px_rgba(239,68,68,0.8)]"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
