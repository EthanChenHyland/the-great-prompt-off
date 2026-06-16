"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  challenge,
  findingKeys,
  findingLabels,
  valueOptions,
} from "../lib/challenge-constants";
import type { AnswerKey, FindingKey, FindingValue, SampleReport, ScoreSummary } from "../lib/types";

type LeaderboardRow = {
  rank: number;
  participant: string;
  score: number;
  final: boolean;
};

type ReportResult = {
  reportId: string;
  prediction: AnswerKey;
  score: ScoreSummary;
};

type ChallengeWorkspaceProps = {
  initialParticipantId: string;
  leaderboard: LeaderboardRow[];
  reports: SampleReport[];
};

const defaultPrompt = `You are extracting structured findings from a knee MRI report.

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
  leaderboard,
  reports,
}: ChallengeWorkspaceProps) {
  const [participantId, setParticipantId] = useState(initialParticipantId);
  const [activeReportId, setActiveReportId] = useState(reports[0]?.id ?? "");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [results, setResults] = useState<ReportResult[]>([]);
  const [finalSubmitted, setFinalSubmitted] = useState(false);

  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0];
  const summary = useMemo(() => summarizeResults(results), [results]);
  const currentRows = useMemo(() => {
    if (!participantId) {
      return leaderboard;
    }

    const withoutParticipant = leaderboard.filter(
      (row) => row.participant !== participantId,
    );

    return [
      ...withoutParticipant,
      {
        rank: withoutParticipant.length + 1,
        participant: participantId,
        score: finalSubmitted ? Math.round(summary.accuracy) : Math.round(summary.accuracy * 0.92),
        final: finalSubmitted,
      },
    ].sort((a, b) => b.score - a.score).map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [finalSubmitted, leaderboard, participantId, summary.accuracy]);

  function runSampleReports() {
    setFinalSubmitted(false);
    setResults(
      reports.map((report) => {
        const prediction = createMockPrediction(prompt, report.answer_key);

        return {
          reportId: report.id,
          prediction,
          score: scorePrediction(prediction, report.answer_key),
        };
      }),
    );
  }

  function submitFinal() {
    if (results.length === 0) {
      runSampleReports();
    }

    setFinalSubmitted(true);
  }

  const activeResult = results.find((result) => result.reportId === activeReport?.id);

  return (
    <main className="min-h-screen bg-[#f7f9f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 lg:px-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-teal-700 hover:text-teal-800">
              The Great Prompt-Off
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">
              {challenge.title}
            </h1>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm font-semibold text-slate-600" htmlFor="participant">
              Participant
            </label>
            <input
              id="participant"
              value={participantId}
              onChange={(event) => setParticipantId(event.target.value)}
              placeholder="RAD-021"
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
            />
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <TaskSidebar />

          <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <PromptEditor
              onRun={runSampleReports}
              onSubmitFinal={submitFinal}
              prompt={prompt}
              setPrompt={setPrompt}
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
            <Leaderboard
              participantId={participantId}
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
  onRun,
  onSubmitFinal,
  prompt,
  setPrompt,
}: {
  onRun: () => void;
  onSubmitFinal: () => void;
  prompt: string;
  setPrompt: (value: string) => void;
}) {
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
        spellCheck={false}
        className="mt-4 h-[470px] w-full resize-none rounded-md border border-slate-300 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-50 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
      />
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRun}
          className="h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Run sample reports
        </button>
        <button
          type="button"
          onClick={onSubmitFinal}
          className="h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
        >
          Submit final mock score
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
                {result.score.correct}/{result.score.total}
              </span>
            </div>
          ))
        )}
      </div>
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
        Private final scores
      </h2>
      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        {rows.map((row) => (
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

function createMockPrediction(prompt: string, answerKey: AnswerKey): AnswerKey {
  const quality = promptQuality(prompt);

  return findingKeys.reduce((prediction, key, index) => {
    if (quality === "strong") {
      prediction[key] = answerKey[key];
      return prediction;
    }

    if (quality === "medium" && index !== 4) {
      prediction[key] = answerKey[key];
      return prediction;
    }

    prediction[key] = fallbackValue(key, answerKey[key]);
    return prediction;
  }, {} as AnswerKey);
}

function promptQuality(prompt: string) {
  const lower = prompt.toLowerCase();
  const mentionsAllFields = findingKeys.every((key) => lower.includes(key));
  const asksForJson = lower.includes("json");
  const constrainsValues = valueOptions.every((value) => lower.includes(value));

  if (mentionsAllFields && asksForJson && constrainsValues) {
    return "strong";
  }

  if (asksForJson && (mentionsAllFields || constrainsValues)) {
    return "medium";
  }

  return "weak";
}

function fallbackValue(key: FindingKey, correct: FindingValue): FindingValue {
  if (key === "effusion" && correct === "present") {
    return "uncertain";
  }

  if (correct === "present") {
    return "absent";
  }

  return correct;
}

function scorePrediction(prediction: AnswerKey, answerKey: AnswerKey): ScoreSummary {
  const correct = findingKeys.filter((key) => prediction[key] === answerKey[key]).length;

  return {
    correct,
    total: findingKeys.length,
    accuracy: (correct / findingKeys.length) * 100,
  };
}

function summarizeResults(results: ReportResult[]): ScoreSummary {
  const correct = results.reduce((sum, result) => sum + result.score.correct, 0);
  const total = results.reduce((sum, result) => sum + result.score.total, 0);

  return {
    correct,
    total,
    accuracy: total === 0 ? 0 : (correct / total) * 100,
  };
}
