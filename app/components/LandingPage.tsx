"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeParticipantCode } from "../lib/participant-codes";
import {
  clearParticipantId,
  saveParticipantId,
  useSavedParticipantId,
} from "../lib/participant-session";

type ParticipantValidationResponse = {
  source: "supabase" | "mock-file-fallback";
  valid: boolean;
  participantCode: string;
  message: string;
};

export function LandingPage() {
  const router = useRouter();
  const [participantId, setParticipantId] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const savedParticipantId = useSavedParticipantId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeParticipantCode(participantId);

    if (!normalized) {
      return;
    }

    await validateAndEnter(normalized);
  }

  async function continueSavedParticipant() {
    await validateAndEnter(savedParticipantId);
  }

  async function validateAndEnter(rawCode: string) {
    const normalized = normalizeParticipantCode(rawCode);

    if (!normalized) {
      return;
    }

    setIsValidating(true);
    setValidationMessage("");

    try {
      const validation = await validateParticipantCode(normalized);

      if (!validation.valid) {
        setValidationMessage(validation.message);
        clearParticipantId();
        return;
      }

      saveParticipantId(validation.participantCode);
      router.push(
        `/challenge?participant=${encodeURIComponent(validation.participantCode)}`,
      );
    } catch {
      setValidationMessage("Could not validate this participant code. Please try again.");
    } finally {
      setIsValidating(false);
    }
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
          <button
            type="button"
            onClick={continueSavedParticipant}
            disabled={!savedParticipantId}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            {savedParticipantId ? "Continue challenge" : "Enter ID to continue"}
          </button>
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
                  disabled={isValidating}
                  className="mt-4 h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isValidating ? "Checking..." : "Continue workspace"}
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
                placeholder="Example: P001"
                className="mt-3 h-12 w-full rounded-md border border-slate-300 px-4 text-base outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              />
              {validationMessage ? (
                <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                  {validationMessage}
                </p>
              ) : null}
              <button
                type="submit"
                className="mt-4 h-12 w-full rounded-md bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!participantId.trim() || isValidating}
              >
                {isValidating ? "Checking..." : "Enter workspace"}
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

async function validateParticipantCode(participantCode: string) {
  const response = await fetch(
    `/api/participants/validate?participantCode=${encodeURIComponent(
      participantCode,
    )}`,
  );

  if (!response.ok) {
    throw new Error(`Participant validation failed with ${response.status}.`);
  }

  return (await response.json()) as ParticipantValidationResponse;
}
