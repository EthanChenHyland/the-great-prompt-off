"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveParticipantId, useSavedParticipantId } from "../lib/participant-session";

export function LandingPage() {
  const router = useRouter();
  const [participantId, setParticipantId] = useState("");
  const savedParticipantId = useSavedParticipantId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = participantId.trim();

    if (!trimmed) {
      return;
    }

    saveParticipantId(trimmed);
    router.push(`/challenge?participant=${encodeURIComponent(trimmed)}`);
  }

  function continueSavedParticipant() {
    router.push(`/challenge?participant=${encodeURIComponent(savedParticipantId)}`);
  }

  return (
    <main className="min-h-screen bg-[#f8faf8] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <nav className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
              The Great Prompt-Off
            </p>
            <p className="mt-1 text-sm text-slate-500">Static MVP preview</p>
          </div>
          <Link
            href="/challenge"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
          >
            View challenge
          </Link>
        </nav>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
              Knee MRI extraction
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] text-slate-950 md:text-6xl">
              Prompt engineering challenge platform
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Participants write prompts that extract six structured findings
              from synthetic, non-PHI knee MRI reports. This MVP uses only local
              mock reports and answer keys.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            {savedParticipantId ? (
              <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 p-4">
                <p className="text-sm font-semibold text-teal-900">
                  Current participant
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-teal-950">
                  {savedParticipantId}
                </p>
                <button
                  type="button"
                  onClick={continueSavedParticipant}
                  className="mt-4 h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Continue workspace
                </button>
              </div>
            ) : null}

            <form onSubmit={handleSubmit}>
              <label
                htmlFor="participant-id"
                className="text-sm font-semibold text-slate-700"
              >
                Participant ID
              </label>
              <input
                id="participant-id"
                value={participantId}
                onChange={(event) => setParticipantId(event.target.value)}
                placeholder="Example: RAD-021"
                className="mt-3 h-12 w-full rounded-md border border-slate-300 px-4 text-base outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              />
              <button
                type="submit"
                className="mt-4 h-12 w-full rounded-md bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!participantId.trim()}
              >
                Enter workspace
              </button>
            </form>

            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-200 pt-5 text-center">
              <div>
                <p className="text-2xl font-semibold text-slate-950">5</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                  Samples
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-950">6</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                  Fields
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-950">0</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                  APIs
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
