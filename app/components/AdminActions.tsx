"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function logout() {
    setIsPending(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
    setIsPending(false);
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isPending}
      className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100"
    >
      {isPending ? "Logging out..." : "Logout"}
    </button>
  );
}

export function AdminResetPanel() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function resetWorkshopData() {
    setIsPending(true);
    setMessage("");

    const response = await fetch("/api/admin/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirmation }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(body?.error || "Reset failed.");
      setIsPending(false);
      return;
    }

    setConfirmation("");
    setMessage("Workshop run/submission data reset.");
    router.refresh();
    setIsPending(false);
  }

  return (
    <section className="rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
        Admin reset
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        Reset run data
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Deletes only prompt run items, submissions, and prompt runs. Participants,
        access codes, reports, answer keys, and challenges are preserved.
      </p>
      <input
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        placeholder="Type RESET"
        className="mt-4 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100"
      />
      <button
        type="button"
        onClick={resetWorkshopData}
        disabled={confirmation !== "RESET" || isPending}
        className="mt-3 h-10 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isPending ? "Resetting..." : "Reset workshop run data"}
      </button>
      {message ? (
        <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function AdminParticipantActions({
  displayName,
  email,
  isActive,
  participantCode,
}: {
  displayName: string | null;
  email: string | null;
  isActive: boolean;
  participantCode: string;
}) {
  const router = useRouter();
  const [draftDisplayName, setDraftDisplayName] = useState(displayName || "");
  const [draftEmail, setDraftEmail] = useState(email || "");
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function postAction(url: string, body: Record<string, unknown>) {
    setIsPending(true);
    setMessage("");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const responseBody = (await response.json().catch(() => null)) as {
      accessCode?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(responseBody?.error || "Admin action failed.");
      setIsPending(false);
      return null;
    }

    router.refresh();
    setIsPending(false);
    return responseBody;
  }

  async function regenerateAccessCode() {
    const confirmation = window.prompt(
      `Regenerate access code for ${participantCode}? The old code will stop working. Type ${participantCode} to confirm.`,
    );

    if (confirmation !== participantCode) {
      return;
    }

    const result = await postAction("/api/admin/participants/regenerate-access-code", {
      participantCode,
      confirmation,
    });

    if (result?.accessCode) {
      setMessage(`New code: ${result.accessCode}`);
    }
  }

  async function clearParticipantData() {
    const confirmation = window.prompt(
      `Clear attempts and final submission for ${participantCode}? Type ${participantCode} to confirm.`,
    );

    if (confirmation !== participantCode) {
      return;
    }

    const result = await postAction("/api/admin/participants/clear-data", {
      participantCode,
      confirmation,
    });

    if (result) {
      setMessage("Participant run data cleared.");
    }
  }

  async function toggleActive() {
    const verb = isActive ? "Deactivate" : "Reactivate";

    if (!window.confirm(`${verb} ${participantCode}?`)) {
      return;
    }

    const result = await postAction("/api/admin/participants/set-active", {
      participantCode,
      isActive: !isActive,
    });

    if (result) {
      setMessage(isActive ? "Participant deactivated." : "Participant reactivated.");
    }
  }

  async function saveIdentity() {
    const result = await postAction("/api/admin/participants/update-identity", {
      participantCode,
      displayName: draftDisplayName,
      email: draftEmail,
    });

    if (result) {
      setIsEditing(false);
      setMessage("Participant identity updated.");
    }
  }

  function cancelIdentityEdit() {
    setDraftDisplayName(displayName || "");
    setDraftEmail(email || "");
    setIsEditing(false);
    setMessage("");
  }

  return (
    <div className="grid min-w-[180px] gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setIsEditing((current) => !current);
            setMessage("");
          }}
          disabled={isPending}
          className="h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={regenerateAccessCode}
          disabled={isPending}
          className="h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          New code
        </button>
        <button
          type="button"
          onClick={clearParticipantData}
          disabled={isPending}
          className="h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:border-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          Clear data
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending}
          className="h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          {isActive ? "Deactivate" : "Reactivate"}
        </button>
      </div>
      {isEditing ? (
        <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Display name
            <input
              value={draftDisplayName}
              onChange={(event) => setDraftDisplayName(event.target.value)}
              maxLength={80}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 font-normal text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Email
            <input
              type="email"
              value={draftEmail}
              onChange={(event) => setDraftEmail(event.target.value)}
              maxLength={254}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 font-normal text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveIdentity}
              disabled={isPending}
              className="h-8 rounded-md bg-teal-700 px-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelIdentityEdit}
              disabled={isPending}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {message ? <p className="text-xs leading-5 text-slate-500">{message}</p> : null}
    </div>
  );
}
