"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  challenge,
  findingKeys,
  findingLabels,
} from "../lib/challenge-constants";
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
  prediction: AnswerKey;
  score: ScoringResult;
};

type ChallengeWorkspaceProps = {
  initialParticipantId: string;
  reports: SampleReport[];
};

const initialPrompt = "";

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
  const [participantId, setParticipantId] = useState(initialParticipantId);
  const savedParticipantId = useSavedParticipantId();
  const submissionStore = useSubmissionStore();
  const [activeReportId, setActiveReportId] = useState(reports[0]?.id ?? "");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [results, setResults] = useState<ReportResult[]>([]);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "sample" | "public" | "final" | null
  >(null);
  const activeParticipantId = participantId || savedParticipantId;
  const participantHistory = activeParticipantId
    ? getParticipantHistory(submissionStore, activeParticipantId)
    : { publicSubmissions: [], finalSubmission: null };
  const remainingPublicSubmissions =
    getRemainingPublicSubmissions(participantHistory);
  const finalSubmissionUsed = Boolean(participantHistory.finalSubmission);

  useEffect(() => {
    if (initialParticipantId) {
      saveParticipantId(initialParticipantId);
    }
  }, [initialParticipantId]);

  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0];
  const summary = useMemo(() => summarizeResults(results), [results]);
  const currentRows = useMemo(() => {
    return getLocalLeaderboardRows(submissionStore);
  }, [submissionStore]);

  async function runSampleReports() {
    setSubmissionMessage("");
    setPendingAction("sample");

    try {
      const response = await postPrompt<RunSampleResponse>("/api/run-sample", prompt);
      setResults(response.results);
    } catch {
      setSubmissionMessage("Sample test failed. Please try again.");
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

    setPendingAction(kind);

    try {
      const score = await postPrompt<SubmitScoreResponse>(
        kind === "public" ? "/api/submit-public" : "/api/submit-final",
        prompt,
      );
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
      setSubmissionMessage("Final submission has already been used for this participant.");
      return;
    }

    setSubmissionMessage(
      `${kind === "public" ? "Public" : "Final"} submission saved: ${Math.round(
          score.score,
        )}% across ${score.reportCount} reports.`,
    );
    } catch {
      setSubmissionMessage(
        `${kind === "public" ? "Public" : "Final"} submission failed. Please try again.`,
      );
    } finally {
      setPendingAction(null);
    }
  }

  function handleParticipantChange(value: string) {
    setParticipantId(value);
    const trimmed = value.trim();

    if (trimmed) {
      saveParticipantId(trimmed);
    } else {
      clearParticipantId();
    }
  }

  function resetParticipant() {
    clearParticipantId();
    setParticipantId("");
    router.push("/");
  }

  const activeResult = results.find((result) => result.reportId === activeReport?.id);

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
            onClick={resetParticipant}
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
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current participant
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {activeParticipantId || "Not set"}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-sm font-semibold text-slate-600" htmlFor="participant">
                Participant
              </label>
              <input
                id="participant"
                value={activeParticipantId}
                onChange={(event) => handleParticipantChange(event.target.value)}
                placeholder="RAD-021"
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              />
            </div>
            <button
              type="button"
              onClick={resetParticipant}
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
            <ResultsPanel results={results} summary={summary} />
            <SubmissionPanel
              finalSubmission={participantHistory.finalSubmission}
              finalSubmissionUsed={finalSubmissionUsed}
              message={submissionMessage}
              onSubmitFinal={submitFinal}
              onSubmitPublic={submitPublic}
              pendingAction={pendingAction}
              participantReady={Boolean(activeParticipantId)}
              publicSubmissions={participantHistory.publicSubmissions}
              remainingPublicSubmissions={remainingPublicSubmissions}
            />
            <Leaderboard
              participantId={activeParticipantId}
              rows={currentRows}
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
        <h3 className="text-sm font-semibold text-slate-800">MVP boundaries</h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          <li>Local mock data only</li>
          <li>No authentication</li>
          <li>No model provider calls</li>
          <li>No database writes</li>
        </ul>
      </div>
    </aside>
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
          Static run
        </span>
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
  results,
  summary,
}: {
  results: ReportResult[];
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
      <div className="mt-5 grid gap-2">
        {results.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Run the sample reports to populate local mock scoring.
          </p>
        ) : (
          results.map((result, index) => (
            <div
              key={result.reportId}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
            >
              <span className="text-sm font-semibold text-slate-700">
                Report {String(index + 1).padStart(3, "0")}
              </span>
              <span className="text-sm text-slate-600">
                {countCorrectFields(result.score)}/{findingKeys.length}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function SubmissionPanel({
  finalSubmission,
  finalSubmissionUsed,
  message,
  onSubmitFinal,
  onSubmitPublic,
  pendingAction,
  participantReady,
  publicSubmissions,
  remainingPublicSubmissions,
}: {
  finalSubmission: StoredSubmission | null;
  finalSubmissionUsed: boolean;
  message: string;
  onSubmitFinal: () => void;
  onSubmitPublic: () => void;
  pendingAction: "sample" | "public" | "final" | null;
  participantReady: boolean;
  publicSubmissions: StoredSubmission[];
  remainingPublicSubmissions: number;
}) {
  const latestPublicSubmission =
    publicSubmissions[publicSubmissions.length - 1] ?? null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Submissions
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        Public and final
      </h2>
      <div className="mt-4 grid gap-3">
        <div className="rounded-md border border-slate-200 px-3 py-3">
          <p className="text-sm font-semibold text-slate-700">
            Public submissions remaining
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">
            {remainingPublicSubmissions}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {publicSubmissions.length} of 5 attempts used
          </p>
          {latestPublicSubmission ? (
            <p className="mt-2 text-sm text-slate-600">
              Latest public score: {Math.round(latestPublicSubmission.score)}%
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
          {finalSubmission ? (
            <p className="mt-2 text-sm text-slate-600">
              Final score: {Math.round(finalSubmission.score)}%
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
    </section>
  );
}

function Leaderboard({
  participantId,
  rows,
}: {
  participantId: string;
  rows: LeaderboardRow[];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Leaderboard
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        Local final scores
      </h2>
      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        {rows.length === 0 ? (
          <p className="bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Final submissions saved in this browser will appear here.
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

async function postPrompt<TResponse>(url: string, prompt: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

type RunSampleResponse = {
  results: ReportResult[];
  summary: ScoreSummary;
};

type SubmitScoreResponse = {
  kind: SubmissionKind;
  score: number;
  correctFields: number;
  totalFields: number;
  reportCount: number;
  summary: ScoreSummary;
};
