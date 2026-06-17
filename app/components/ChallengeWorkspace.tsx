"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  challenge,
  findingKeys,
  findingLabels,
} from "../lib/challenge-constants";
import { normalizeParticipantCode } from "../lib/participant-codes";
import {
  clearParticipantId,
  saveParticipantId,
  useSavedParticipantId,
} from "../lib/participant-session";
import { countCorrectFields } from "../lib/mock-evaluation";
import {
  createSubmissionId,
  getLocalLeaderboardRows,
  getParticipantHistory,
  getRemainingPublicSubmissions,
  saveSubmission,
  useSubmissionStore,
} from "../lib/submissions";
import type {
  AnswerKey,
  FindingValue,
  SampleReport,
  ScoreSummary,
  ScoringResult,
  StoredSubmission,
  SubmissionKind,
} from "../lib/types";

type LeaderboardRow = {
  rank: number;
  participant: string;
  score: number;
  final: boolean;
  submittedAt?: string;
};

type ReportResult = {
  reportId: string;
  prediction: Partial<AnswerKey>;
  score: ScoringResult;
  modelOutput?: string;
  error?: string | null;
};

type SampleRunDebug = {
  promptHash: string;
  promptLength: number;
  promptPreview: string;
};

type PromptDebug = SampleRunDebug;

type SubmissionPromptDebug = PromptDebug & {
  kind: SubmissionKind;
};

type ChallengeWorkspaceProps = {
  initialParticipantId: string;
  reports: SampleReport[];
};

type ChallengeDataStatus = {
  source: "supabase" | "mock-file-fallback";
  fallbackReason: string | null;
  challenge: {
    title: string;
  } | null;
  reportCounts: {
    sample: number;
    public: number;
    private: number;
  };
  participantCount: number;
};

type SubmissionSource = "supabase" | "mock-file-fallback";

type SubmissionStatus = {
  source: SubmissionSource;
  fallbackReason: string | null;
  publicSubmissionLimit: number;
  publicSubmissionsUsed: number;
  remainingPublicSubmissions: number;
  latestPublicScore: number | null;
  finalSubmissionUsed: boolean;
  finalScore: number | null;
};

type LeaderboardResponse = {
  source: SubmissionSource;
  fallbackReason: string | null;
  rows: LeaderboardRow[];
};

type ParticipantValidationResponse = {
  source: "supabase" | "mock-file-fallback";
  valid: boolean;
  participantCode: string;
  message: string;
};

const initialPrompt = "";
const workspaceBuildMarker = "workflow-polish-v1";

const examplePrompt = `You are extracting structured findings from a knee MRI report.

Return only valid JSON with these exact keys:
{
  "acl_tear": "present | absent | uncertain",
  "mcl_injury": "present | absent | uncertain",
  "meniscus_tear": "present | absent | uncertain",
  "fracture": "present | absent | uncertain",
  "osteoarthritis": "present | absent | uncertain",
  "effusion": "present | absent | uncertain"
}

Use "uncertain" only when the report does not provide enough evidence.`;

export function ChallengeWorkspace({
  initialParticipantId,
  reports,
}: ChallengeWorkspaceProps) {
  const router = useRouter();
  const [participantId, setParticipantId] = useState(
    normalizeParticipantCode(initialParticipantId),
  );
  const savedParticipantId = useSavedParticipantId();
  const submissionStore = useSubmissionStore();
  const [activeReportId, setActiveReportId] = useState(reports[0]?.id ?? "");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [results, setResults] = useState<ReportResult[]>([]);
  const [sampleRunMode, setSampleRunMode] = useState<{
    mode: "mock" | "real_llm" | null;
    model: string | null;
  }>({ mode: null, model: null });
  const [sampleRunDebug, setSampleRunDebug] = useState<SampleRunDebug | null>(
    null,
  );
  const [pendingSamplePromptPreview, setPendingSamplePromptPreview] =
    useState("");
  const [sampleRunError, setSampleRunError] = useState("");
  const [lastSubmissionPromptDebug, setLastSubmissionPromptDebug] =
    useState<SubmissionPromptDebug | null>(null);
  const [challengeDataStatus, setChallengeDataStatus] =
    useState<ChallengeDataStatus | null>(null);
  const [challengeDataError, setChallengeDataError] = useState("");
  const [participantValidation, setParticipantValidation] =
    useState<ParticipantValidationResponse | null>(null);
  const [participantValidationError, setParticipantValidationError] =
    useState("");
  const [submissionStatus, setSubmissionStatus] =
    useState<SubmissionStatus | null>(null);
  const [leaderboardResponse, setLeaderboardResponse] =
    useState<LeaderboardResponse | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "sample" | "public" | "final" | null
  >(null);
  const activeParticipantId = normalizeParticipantCode(
    participantId || savedParticipantId,
  );
  const localParticipantHistory = activeParticipantId
    ? getParticipantHistory(submissionStore, activeParticipantId)
    : { publicSubmissions: [], finalSubmission: null };
  const usingSupabaseSubmissions = submissionStatus?.source === "supabase";
  const remainingPublicSubmissions =
    usingSupabaseSubmissions && submissionStatus
      ? submissionStatus.remainingPublicSubmissions
      : getRemainingPublicSubmissions(localParticipantHistory);
  const finalSubmissionUsed =
    usingSupabaseSubmissions && submissionStatus
      ? submissionStatus.finalSubmissionUsed
      : Boolean(localParticipantHistory.finalSubmission);

  useEffect(() => {
    if (!activeParticipantId) {
      return;
    }

    let ignore = false;

    async function validateCurrentParticipant() {
      try {
        const validation = await validateParticipantCode(activeParticipantId);

        if (!ignore) {
          setParticipantValidation(validation);
          setParticipantValidationError("");

          if (validation.valid) {
            saveParticipantId(validation.participantCode);
            setParticipantId(validation.participantCode);
          } else {
            clearParticipantId();
          }
        }
      } catch (error) {
        if (!ignore) {
          setParticipantValidationError(
            error instanceof Error
              ? error.message
              : "Could not validate this participant code.",
          );
        }
      }
    }

    validateCurrentParticipant();

    return () => {
      ignore = true;
    };
  }, [activeParticipantId]);

  useEffect(() => {
    let ignore = false;

    async function loadChallengeDataStatus() {
      try {
        const response = await fetch("/api/challenge-data");

        if (!response.ok) {
          throw new Error(`Status request failed with ${response.status}.`);
        }

        const data = (await response.json()) as ChallengeDataStatus;

        if (!ignore) {
          setChallengeDataStatus(data);
          setChallengeDataError("");
        }
      } catch (error) {
        if (!ignore) {
          setChallengeDataError(
            error instanceof Error
              ? error.message
              : "Challenge data status is unavailable.",
          );
        }
      }
    }

    loadChallengeDataStatus();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!activeParticipantId || participantValidation?.valid !== true) {
      return;
    }

    let ignore = false;

    async function loadSubmissionData() {
      const [status, leaderboard] = await Promise.all([
        getSubmissionStatus(activeParticipantId),
        getLeaderboard(),
      ]);

      if (!ignore) {
        setSubmissionStatus(status);
        setLeaderboardResponse(leaderboard);
      }
    }

    loadSubmissionData();

    return () => {
      ignore = true;
    };
  }, [activeParticipantId, participantValidation?.valid]);

  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0];
  const summary = useMemo(() => summarizeResults(results), [results]);
  const currentRows = useMemo(() => {
    if (leaderboardResponse?.source === "supabase") {
      return leaderboardResponse.rows;
    }

    return getLocalLeaderboardRows(submissionStore);
  }, [leaderboardResponse, submissionStore]);

  async function runSampleReports() {
    const runPrompt = prompt;

    setSubmissionMessage("");
    setSampleRunError("");
    setResults([]);
    setSampleRunMode({ mode: null, model: null });
    setSampleRunDebug(null);
    setPendingSamplePromptPreview(previewPrompt(runPrompt));
    setPendingAction("sample");

    try {
      const response = await postPrompt<RunSampleResponse>(
        "/api/run-sample",
        runPrompt,
      );
      setResults(response.results);
      setSampleRunMode({
        mode: response.mode,
        model: response.model,
      });
      setSampleRunDebug(response.promptDebug ?? response.debug ?? null);
      setPendingSamplePromptPreview("");
    } catch (error) {
      setResults([]);
      setSampleRunMode({ mode: null, model: null });
      setSampleRunDebug(null);
      setSampleRunError(
        error instanceof Error
          ? error.message
          : "Sample test failed. Please try again.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  function submitPublic() {
    submitMockScore("public");
  }

  function submitFinal() {
    submitMockScore("final");
  }

  async function submitMockScore(kind: SubmissionKind) {
    if (!activeParticipantId) {
      setSubmissionMessage("Enter a participant ID before submitting.");
      return;
    }

    if (pendingAction !== null) {
      return;
    }

    if (kind === "public") {
      const confirmed = window.confirm(
        `Use 1 public attempt for this prompt? You have ${remainingPublicSubmissions} public attempt${remainingPublicSubmissions === 1 ? "" : "s"} remaining.`,
      );

      if (!confirmed) {
        return;
      }
    }

    if (kind === "final") {
      const confirmed = window.confirm(
        "Final submission can only be used once and will be locked. Continue?",
      );

      if (!confirmed) {
        return;
      }
    }

    setPendingAction(kind);

    try {
      const promptDebug = await createPromptDebug(prompt);
      const score = await postSubmission(
        kind === "public"
          ? "/api/submissions/public"
          : "/api/submissions/final",
        activeParticipantId,
        prompt,
      );

      if (score.source === "supabase") {
        setSubmissionStatus(score);
        setLeaderboardResponse(await getLeaderboard());
      } else {
        const submission: StoredSubmission = {
          id: createSubmissionId(kind),
          participantId: activeParticipantId,
          kind,
          createdAt: new Date().toISOString(),
          promptSnapshot: prompt,
          score: score.score,
          correctFields: score.correctFields,
          totalFields: score.totalFields,
          reportCount: score.reportCount,
        };
        const result = saveSubmission(submission);

        if (!result.ok && result.reason === "public_limit_reached") {
          setSubmissionMessage("Public submission limit reached for this participant.");
          return;
        }

        if (!result.ok && result.reason === "final_already_used") {
          setSubmissionMessage(
            "Final submission has already been used for this participant.",
          );
          return;
        }
      }

      setLastSubmissionPromptDebug({
        ...promptDebug,
        kind,
      });
      setSubmissionMessage(
        `${kind === "public" ? "Public" : "Final"} submission saved: ${Math.round(
          score.score,
        )}% across ${score.reportCount} reports${
          score.source === "supabase" ? " in Supabase" : " in this browser"
        }.`,
      );
    } catch (error) {
      setSubmissionMessage(
        error instanceof Error
          ? error.message
          : `${kind === "public" ? "Public" : "Final"} submission failed. Please try again.`,
      );
    } finally {
      setPendingAction(null);
    }
  }

  function saveAndExit() {
    if (activeParticipantId) {
      saveParticipantId(activeParticipantId);
    }

    router.push("/");
  }

  function switchParticipant() {
    clearParticipantId();
    setParticipantId("");
    window.location.assign("/");
  }

  function exitToHome() {
    router.push("/");
  }

  const activeResult = results.find((result) => result.reportId === activeReport?.id);

  if (!activeParticipantId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 text-slate-950">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Participant required
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            Enter a participant ID before opening the challenge.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            The home page is the participant check-in point for this local mock
            workshop. Return home, enter your assigned ID, then continue to the
            workspace.
          </p>
          <button
            type="button"
            onClick={exitToHome}
            className="mt-5 h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Return home
          </button>
        </section>
      </main>
    );
  }

  if (participantValidationError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 text-slate-950">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Participant check unavailable
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            We could not validate this participant code.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Return home and try again. If Supabase is unavailable, local mock
            fallback will accept a local participant code.
          </p>
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {participantValidationError}
          </p>
          <button
            type="button"
            onClick={exitToHome}
            className="mt-5 h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Return home
          </button>
        </section>
      </main>
    );
  }

  if (!participantValidation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 text-slate-950">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Checking participant
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            Validating your participant code...
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            This keeps the challenge workspace limited to registered workshop
            participants when Supabase is available.
          </p>
        </section>
      </main>
    );
  }

  if (!participantValidation.valid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 text-slate-950">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Participant not found
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            This participant code is not registered.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Use one of the seeded workshop codes, P001 through P050, then return
            to the workspace.
          </p>
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {participantValidation.message}
          </p>
          <button
            type="button"
            onClick={exitToHome}
            className="mt-5 h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Return home
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f9f8] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-10 lg:hidden">
        <Link href="/" className="text-sm font-semibold text-teal-700 hover:text-teal-800">
          The Great Prompt-Off
        </Link>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Laptop recommended
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            This workshop platform is designed for desktop use.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Radiology reports, prompt editing, result comparisons, and
            leaderboard panels need more horizontal space than most mobile
            screens can comfortably provide.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Please switch to a laptop or desktop browser for the full challenge
            workspace.
          </p>
          <button
            type="button"
            onClick={exitToHome}
            className="mt-5 h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Exit to home
          </button>
        </div>
      </section>

      <div className="mx-auto hidden w-full max-w-[1500px] flex-col gap-4 px-4 py-4 lg:flex lg:px-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-teal-700 hover:text-teal-800">
              The Great Prompt-Off
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">
              {challenge.title}
            </h1>
            <p className="mt-2 w-fit rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
              Sample runs can use live LLM mode; public and final scoring are not live LLM yet
            </p>
            <p className="mt-2 w-fit rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
              Build: {workspaceBuildMarker}
            </p>
            <DataSourceStatus
              error={challengeDataError}
              status={challengeDataStatus}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current participant
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {activeParticipantId}
              </p>
            </div>
            <button
              type="button"
              onClick={saveAndExit}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
            >
              Exit challenge
            </button>
            <button
              type="button"
              onClick={switchParticipant}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
            >
              Switch participant
            </button>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <TaskSidebar />

          <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <PromptEditor
              onRun={runSampleReports}
              prompt={prompt}
              remainingPublicSubmissions={remainingPublicSubmissions}
              setPrompt={setPrompt}
              onSubmitFinal={submitFinal}
              onSubmitPublic={submitPublic}
              finalSubmissionUsed={finalSubmissionUsed}
              participantReady={Boolean(activeParticipantId)}
              pendingAction={pendingAction}
            />
            {activeReport ? (
              <ReportViewer
                activeReport={activeReport}
                activeResult={activeResult}
                reports={reports}
                setActiveReportId={setActiveReportId}
              />
            ) : null}
          </section>

          <aside className="grid gap-4">
            <ResultsPanel
              isRunning={pendingAction === "sample"}
              pendingPromptPreview={pendingSamplePromptPreview}
              results={results}
              sampleRunDebug={sampleRunDebug}
              sampleRunError={sampleRunError}
              sampleRunMode={sampleRunMode}
              summary={summary}
            />
            <SubmissionPanel
              finalSubmissionUsed={finalSubmissionUsed}
              finalScore={
                usingSupabaseSubmissions
                  ? submissionStatus?.finalScore ?? null
                  : localParticipantHistory.finalSubmission?.score ?? null
              }
              latestPublicScore={
                usingSupabaseSubmissions
                  ? submissionStatus?.latestPublicScore ?? null
                  : localParticipantHistory.publicSubmissions.at(-1)?.score ?? null
              }
              message={submissionMessage}
              promptDebug={lastSubmissionPromptDebug}
              onSubmitFinal={submitFinal}
              onSubmitPublic={submitPublic}
              pendingAction={pendingAction}
              participantReady={Boolean(activeParticipantId)}
              publicSubmissionLimit={
                usingSupabaseSubmissions && submissionStatus
                  ? submissionStatus.publicSubmissionLimit
                  : 5
              }
              publicSubmissionsUsed={
                usingSupabaseSubmissions && submissionStatus
                  ? submissionStatus.publicSubmissionsUsed
                  : localParticipantHistory.publicSubmissions.length
              }
              remainingPublicSubmissions={remainingPublicSubmissions}
              source={usingSupabaseSubmissions ? "supabase" : "mock-file-fallback"}
            />
            <Leaderboard
              participantId={activeParticipantId}
              rows={currentRows}
              source={
                leaderboardResponse?.source === "supabase"
                  ? "supabase"
                  : "mock-file-fallback"
              }
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

function TaskSidebar() {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Active task
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        Structured MRI findings
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Write a prompt that converts each synthetic knee MRI report into a JSON
        object. Each field must use one of: present, absent, uncertain.
      </p>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-800">Output schema</h3>
        <div className="mt-3 grid gap-2">
          {findingKeys.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
            >
              <span className="font-mono text-xs text-slate-700">{key}</span>
              <span className="text-xs text-slate-500">{findingLabels[key]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-800">Workflow</h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          <li>Sample: practice on 5 reports; does not count.</li>
          <li>Public: counted attempts with a limited allowance.</li>
          <li>Final: one locked submission for final scoring.</li>
        </ul>
      </div>
    </aside>
  );
}

function DataSourceStatus({
  error,
  status,
}: {
  error: string;
  status: ChallengeDataStatus | null;
}) {
  if (error) {
    return (
      <div className="mt-2 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Challenge metadata status is using the local demo view for now.
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mt-2 w-fit rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
        Loading challenge metadata...
      </div>
    );
  }

  const sourceLabel =
    status.source === "supabase" ? "Supabase" : "Local mock fallback";

  return (
    <div className="mt-2 max-w-3xl rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`font-semibold ${
            status.source === "supabase" ? "text-teal-700" : "text-amber-700"
          }`}
        >
          Data source: {sourceLabel}
        </span>
        <span className="font-semibold text-slate-800">
          {status.challenge?.title || challenge.title}
        </span>
        <span>
          Reports: {status.reportCounts.sample} sample /{" "}
          {status.reportCounts.public} public / {status.reportCounts.private} private
        </span>
        <span>Participants: {status.participantCount}</span>
      </div>
      {status.source === "mock-file-fallback" && status.fallbackReason ? (
        <p className="mt-1 leading-5 text-slate-500">
          Local demo data is being used because {status.fallbackReason}
        </p>
      ) : null}
    </div>
  );
}

function PromptEditor({
  finalSubmissionUsed,
  onRun,
  onSubmitFinal,
  onSubmitPublic,
  participantReady,
  pendingAction,
  prompt,
  remainingPublicSubmissions,
  setPrompt,
}: {
  finalSubmissionUsed: boolean;
  onRun: () => void;
  onSubmitFinal: () => void;
  onSubmitPublic: () => void;
  participantReady: boolean;
  pendingAction: "sample" | "public" | "final" | null;
  prompt: string;
  remainingPublicSubmissions: number;
  setPrompt: (value: string) => void;
}) {
  const [showExample, setShowExample] = useState(false);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Prompt editor
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Extraction prompt
          </h2>
        </div>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          Workspace prompt
        </span>
      </div>
      <div className="mt-4 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
        <p>
          <span className="font-semibold text-slate-800">Sample</span> is practice:
          5 sample reports, unlimited runs, no counted attempts.
        </p>
        <p>
          <span className="font-semibold text-slate-800">Public</span> uses counted
          attempts. Do not click repeatedly; real LLM public mode may take longer
          and may incur API cost once enabled.
        </p>
        <p>
          <span className="font-semibold text-slate-800">Final</span> can only be
          used once and is locked after submission.
        </p>
      </div>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Write your extraction prompt here..."
        spellCheck={false}
        className="mt-4 h-[470px] w-full resize-none rounded-md border border-slate-300 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-50 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
      />
      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => setShowExample((current) => !current)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:text-teal-700"
          aria-expanded={showExample}
        >
          <span>Example prompt</span>
          <span className="text-xs text-slate-500">
            {showExample ? "Hide" : "Need help?"}
          </span>
        </button>
        {showExample ? (
          <div className="border-t border-slate-200 p-4">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 font-mono text-xs leading-5 text-slate-700">
              {examplePrompt}
            </pre>
            <button
              type="button"
              onClick={() => setPrompt(examplePrompt)}
              className="mt-3 h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Use this example
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRun}
          disabled={pendingAction !== null}
          className="h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        >
          {pendingAction === "sample" ? "Running..." : "Run sample test"}
        </button>
        <button
          type="button"
          onClick={onSubmitPublic}
          disabled={
            !participantReady ||
            remainingPublicSubmissions === 0 ||
            pendingAction !== null
          }
          className="h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {pendingAction === "public" ? "Submitting..." : "Submit public"}
        </button>
        <button
          type="button"
          onClick={onSubmitFinal}
          disabled={!participantReady || finalSubmissionUsed || pendingAction !== null}
          className="h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {pendingAction === "final" ? "Submitting..." : "Submit final"}
        </button>
      </div>
    </section>
  );
}

function ReportViewer({
  activeReport,
  activeResult,
  reports,
  setActiveReportId,
}: {
  activeReport: SampleReport;
  activeResult?: ReportResult;
  reports: SampleReport[];
  setActiveReportId: (id: string) => void;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Sample reports
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        {challenge.sampleRange}
      </h2>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {reports.map((report, index) => (
          <button
            key={report.id}
            type="button"
            onClick={() => setActiveReportId(report.id)}
            className={`h-10 rounded-md border text-sm font-semibold ${
              activeReport.id === report.id
                ? "border-teal-700 bg-teal-50 text-teal-800"
                : "border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            {String(index + 1).padStart(3, "0")}
          </button>
        ))}
      </div>
      <article className="mt-4 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-6 text-slate-800">
        {activeReport.text}
      </article>
      <div className="mt-4 rounded-md border border-slate-200">
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Field</span>
          <span>Mock output</span>
          <span>Answer key</span>
        </div>
        {findingKeys.map((key) => (
          <div
            key={key}
            className="grid grid-cols-3 items-center border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
          >
            <span className="font-mono text-xs text-slate-700">{key}</span>
            <ValueBadge value={activeResult?.prediction[key]} />
            <ValueBadge value={activeReport.answer_key[key]} quiet />
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultsPanel({
  isRunning,
  pendingPromptPreview,
  results,
  sampleRunDebug,
  sampleRunError,
  sampleRunMode,
  summary,
}: {
  isRunning: boolean;
  pendingPromptPreview: string;
  results: ReportResult[];
  sampleRunDebug: SampleRunDebug | null;
  sampleRunError: string;
  sampleRunMode: {
    mode: "mock" | "real_llm" | null;
    model: string | null;
  };
  summary: ScoreSummary;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Results
      </p>
      <div className="mt-2 flex items-end justify-between">
        <h2 className="text-xl font-semibold text-slate-950">Sample score</h2>
        <p className="text-3xl font-semibold text-slate-950">
          {Math.round(summary.accuracy)}%
        </p>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        {summary.correct} of {summary.total} fields correct
      </p>
      {isRunning ? (
        <div className="mt-3 rounded-md border border-teal-100 bg-teal-50 p-3 text-sm leading-6 text-teal-900">
          <p className="font-semibold">Running sample test...</p>
          {pendingPromptPreview ? (
            <p className="mt-1 text-xs">Prompt: {pendingPromptPreview}</p>
          ) : null}
        </div>
      ) : null}
      {sampleRunMode.mode ? (
        <p className="mt-2 w-fit rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {sampleRunMode.mode === "real_llm"
            ? `Real LLM mode${sampleRunMode.model ? `: ${sampleRunMode.model}` : ""}`
            : "Mock mode"}
        </p>
      ) : null}
      {sampleRunDebug ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p className="font-semibold text-slate-800">Last run prompt</p>
          <p className="mt-1 break-words">{sampleRunDebug.promptPreview}</p>
          <p className="mt-1 font-mono">
            hash {sampleRunDebug.promptHash} - {sampleRunDebug.promptLength} chars
          </p>
        </div>
      ) : null}
      <div className="mt-5 grid gap-2">
        {results.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {sampleRunError ||
              (isRunning
                ? "Waiting for the current sample run to finish."
                : "Run the sample reports to populate local scoring.")}
          </p>
        ) : (
          results.map((result, index) => (
            <div
              key={result.reportId}
              className="rounded-md border border-slate-200 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">
                  Report {String(index + 1).padStart(3, "0")}
                </span>
                <span className="text-sm text-slate-600">
                  {countCorrectFields(result.score)}/{findingKeys.length}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`rounded-md px-2 py-1 text-xs font-semibold ${
                    result.score.valid_json
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-red-50 text-red-800"
                  }`}
                >
                  {result.score.valid_json ? "Valid JSON" : "Invalid JSON"}
                </span>
                {result.score.missing_fields.length > 0 ? (
                  <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                    Missing fields
                  </span>
                ) : null}
                {result.score.invalid_fields.length > 0 ? (
                  <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                    Invalid values
                  </span>
                ) : null}
              </div>
              {result.error ? (
                <p className="mt-2 text-xs leading-5 text-red-700">
                  {result.error}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function SubmissionPanel({
  finalSubmissionUsed,
  finalScore,
  latestPublicScore,
  message,
  onSubmitFinal,
  onSubmitPublic,
  pendingAction,
  participantReady,
  promptDebug,
  publicSubmissionLimit,
  publicSubmissionsUsed,
  remainingPublicSubmissions,
  source,
}: {
  finalSubmissionUsed: boolean;
  finalScore: number | null;
  latestPublicScore: number | null;
  message: string;
  onSubmitFinal: () => void;
  onSubmitPublic: () => void;
  pendingAction: "sample" | "public" | "final" | null;
  participantReady: boolean;
  promptDebug: SubmissionPromptDebug | null;
  publicSubmissionLimit: number;
  publicSubmissionsUsed: number;
  remainingPublicSubmissions: number;
  source: SubmissionSource;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Submissions
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        Public and final
      </h2>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        {source === "supabase"
          ? "Submission source: Supabase"
          : "Submission source: local browser fallback"}
      </p>
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
        Public attempts are counted. Final submission can only be used once.
        Real LLM public/final evaluation is not enabled yet; once enabled, it may
        take longer and may incur API cost.
      </div>
      <div className="mt-4 grid gap-3">
        <div className="rounded-md border border-slate-200 px-3 py-3">
          <p className="text-sm font-semibold text-slate-700">
            Public submissions remaining
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">
            {remainingPublicSubmissions}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {publicSubmissionsUsed} of {publicSubmissionLimit} attempts used
          </p>
          {latestPublicScore !== null ? (
            <p className="mt-2 text-sm text-slate-600">
              Latest public score: {Math.round(latestPublicScore)}%
            </p>
          ) : null}
          <button
            type="button"
            onClick={onSubmitPublic}
            disabled={
              !participantReady ||
              remainingPublicSubmissions === 0 ||
              pendingAction !== null
            }
            className="mt-3 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            {pendingAction === "public" ? "Submitting..." : "Submit public"}
          </button>
        </div>
        <div className="rounded-md border border-slate-200 px-3 py-3">
          <p className="text-sm font-semibold text-slate-700">
            Final submission
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {finalSubmissionUsed ? "Already used" : "Available"}
          </p>
          {finalScore !== null ? (
            <p className="mt-2 text-sm text-slate-600">
              Final score: {Math.round(finalScore)}%
            </p>
          ) : null}
          <button
            type="button"
            onClick={onSubmitFinal}
            disabled={!participantReady || finalSubmissionUsed || pendingAction !== null}
            className="mt-3 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            {pendingAction === "final" ? "Submitting..." : "Submit final"}
          </button>
        </div>
      </div>
      {message ? (
        <p className="mt-4 rounded-md bg-teal-50 p-3 text-sm leading-6 text-teal-900">
          {message}
        </p>
      ) : null}
      {promptDebug ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p className="font-semibold text-slate-800">
            Last {promptDebug.kind === "public" ? "public" : "final"} prompt
          </p>
          <p className="mt-1 break-words">{promptDebug.promptPreview}</p>
          <p className="mt-1 font-mono">
            hash {promptDebug.promptHash} - {promptDebug.promptLength} chars
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Leaderboard({
  participantId,
  rows,
  source,
}: {
  participantId: string;
  rows: LeaderboardRow[];
  source: SubmissionSource;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Leaderboard
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        {source === "supabase" ? "Supabase final scores" : "Local final scores"}
      </h2>
      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        {rows.length === 0 ? (
          <p className="bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {source === "supabase"
              ? "Final submissions will appear here after participants submit."
              : "Final submissions saved in this browser will appear here."}
          </p>
        ) : rows.map((row) => (
          <div
            key={row.participant}
            className={`grid grid-cols-[46px_minmax(0,1fr)_60px] items-center border-b border-slate-100 px-3 py-3 text-sm last:border-b-0 ${
              row.participant === participantId ? "bg-teal-50" : "bg-white"
            }`}
          >
            <span className="font-semibold text-slate-500">#{row.rank}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">
                {row.participant}
              </p>
              <p className="text-xs text-slate-500">
                {row.final ? "Final submitted" : "Mock draft"}
              </p>
            </div>
            <span className="text-right font-semibold text-slate-950">
              {row.score}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ValueBadge({
  quiet = false,
  value,
}: {
  quiet?: boolean;
  value?: FindingValue;
}) {
  if (!value) {
    return <span className="text-sm text-slate-400">Not run</span>;
  }

  const colors: Record<FindingValue, string> = {
    present: quiet
      ? "bg-amber-50 text-amber-800"
      : "bg-amber-100 text-amber-900",
    absent: quiet ? "bg-emerald-50 text-emerald-800" : "bg-emerald-100 text-emerald-900",
    uncertain: quiet
      ? "bg-slate-100 text-slate-700"
      : "bg-slate-200 text-slate-800",
  };

  return (
    <span className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ${colors[value]}`}>
      {value}
    </span>
  );
}

function summarizeResults(results: ReportResult[]): ScoreSummary {
  const correct = results.reduce(
    (sum, result) => sum + countCorrectFields(result.score),
    0,
  );
  const total = results.length * findingKeys.length;

  return {
    correct,
    total,
    accuracy: total === 0 ? 0 : (correct / total) * 100,
  };
}

function previewPrompt(prompt: string) {
  return prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt;
}

async function createPromptDebug(prompt: string): Promise<PromptDebug> {
  return {
    promptHash: await hashPrompt(prompt),
    promptLength: prompt.length,
    promptPreview: previewPrompt(prompt),
  };
}

async function hashPrompt(prompt: string) {
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(prompt);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);
  }

  let hash = 0;

  for (let index = 0; index < prompt.length; index += 1) {
    hash = (hash * 31 + prompt.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0").slice(0, 12);
}

async function postPrompt<TResponse>(url: string, prompt: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    throw new Error(
      errorBody?.error || `Request failed with status ${response.status}`,
    );
  }

  return (await response.json()) as TResponse;
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

async function getSubmissionStatus(participantCode: string) {
  const response = await fetch(
    `/api/submissions/status?participantCode=${encodeURIComponent(participantCode)}`,
  );

  if (!response.ok) {
    return {
      source: "mock-file-fallback",
      fallbackReason: `Status request failed with ${response.status}.`,
      publicSubmissionLimit: 5,
      publicSubmissionsUsed: 0,
      remainingPublicSubmissions: 5,
      latestPublicScore: null,
      finalSubmissionUsed: false,
      finalScore: null,
    } satisfies SubmissionStatus;
  }

  return (await response.json()) as SubmissionStatus;
}

async function getLeaderboard() {
  const response = await fetch("/api/leaderboard");

  if (!response.ok) {
    return {
      source: "mock-file-fallback",
      fallbackReason: `Leaderboard request failed with ${response.status}.`,
      rows: [],
    } satisfies LeaderboardResponse;
  }

  return (await response.json()) as LeaderboardResponse;
}

async function postSubmission(
  url: string,
  participantCode: string,
  prompt: string,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ participantCode, prompt }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    throw new Error(
      errorBody?.error || `Submission failed with status ${response.status}`,
    );
  }

  return (await response.json()) as SubmitScoreResponse;
}

type RunSampleResponse = {
  mode: "mock" | "real_llm";
  model: string | null;
  promptDebug?: SampleRunDebug;
  debug?: SampleRunDebug;
  results: ReportResult[];
  summary: ScoreSummary;
};

type SubmitScoreResponse = SubmissionStatus & {
  kind: SubmissionKind;
  score: number;
  correctFields: number;
  totalFields: number;
  reportCount: number;
  summary: ScoreSummary;
};
