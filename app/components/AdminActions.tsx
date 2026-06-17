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
