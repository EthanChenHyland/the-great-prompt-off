"use client";

import { useMemo, useState } from "react";
import { AdminTable, formatDate, score } from "./AdminLayout";

type ProgressStatus = "inactive" | "no_activity" | "practicing" | "final_submitted";

export type AdminProgressParticipant = {
  participantCode: string;
  displayName: string | null;
  isActive: boolean;
  extraPublicAttempts: number;
  testAttemptsUsed: number;
  testAttemptsRemaining: number;
  latestTestScore: number | null;
  bestTestScore: number | null;
  finalSubmitted: boolean;
  finalScore: number | null;
  latestActivityAt: string | null;
  progressStatus: ProgressStatus;
};

type StatusFilter = "all" | ProgressStatus;
type SortMode =
  | "default"
  | "participant_code"
  | "latest_activity"
  | "test_attempts_used"
  | "best_test_score"
  | "final_score";

const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: "All", value: "all" },
  { label: "No activity", value: "no_activity" },
  { label: "Practicing", value: "practicing" },
  { label: "Final submitted", value: "final_submitted" },
  { label: "Inactive", value: "inactive" },
];

const sortOptions: Array<{ label: string; value: SortMode }> = [
  { label: "Default live order", value: "default" },
  { label: "Participant code", value: "participant_code" },
  { label: "Latest activity", value: "latest_activity" },
  { label: "Test attempts used", value: "test_attempts_used" },
  { label: "Best test score", value: "best_test_score" },
  { label: "Final score", value: "final_score" },
];

export function AdminProgressMonitor({
  participants,
}: {
  participants: AdminProgressParticipant[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");

  const filteredParticipants = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return participants
      .filter((participant) => {
        if (statusFilter !== "all" && participant.progressStatus !== statusFilter) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return (
          participant.participantCode.toLowerCase().includes(normalizedSearch) ||
          (participant.displayName || "").toLowerCase().includes(normalizedSearch)
        );
      })
      .sort((left, right) => compareParticipants(left, right, sortMode));
  }, [participants, search, sortMode, statusFilter]);

  return (
    <section className="grid gap-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_240px]">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search code or display name"
              className="h-10 rounded-md border border-slate-300 px-3 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Sort by
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Showing {filteredParticipants.length} of {participants.length} participants.
        </p>
      </div>

      {filteredParticipants.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 shadow-sm">
          No participants match the current search and filter.
        </p>
      ) : null}

      <AdminTable
        title="Participant progress monitor"
        columns={[
          "Status",
          "Participant",
          "Display name",
          "Active",
          "Tests used",
          "Tests left",
          "Extra tests",
          "Best test",
          "Latest test",
          "Final",
          "Final score",
          "Latest activity",
        ]}
        rows={filteredParticipants.map((participant) => [
          <ProgressStatusBadge
            key={`${participant.participantCode}-status`}
            status={participant.progressStatus}
          />,
          participant.participantCode,
          participant.displayName || "",
          participant.isActive ? "Yes" : "No",
          String(participant.testAttemptsUsed),
          String(participant.testAttemptsRemaining),
          participant.extraPublicAttempts > 0
            ? `+${participant.extraPublicAttempts}`
            : "",
          score(participant.bestTestScore),
          score(participant.latestTestScore),
          participant.finalSubmitted ? "Yes" : "No",
          score(participant.finalScore),
          formatDate(participant.latestActivityAt),
        ])}
      />
    </section>
  );
}

function compareParticipants(
  left: AdminProgressParticipant,
  right: AdminProgressParticipant,
  sortMode: SortMode,
) {
  switch (sortMode) {
    case "participant_code":
      return left.participantCode.localeCompare(right.participantCode);
    case "latest_activity":
      return compareNullableNumbersDesc(
        timestamp(left.latestActivityAt),
        timestamp(right.latestActivityAt),
      );
    case "test_attempts_used":
      return (
        right.testAttemptsUsed - left.testAttemptsUsed ||
        left.participantCode.localeCompare(right.participantCode)
      );
    case "best_test_score":
      return compareNullableNumbersDesc(left.bestTestScore, right.bestTestScore);
    case "final_score":
      return compareNullableNumbersDesc(left.finalScore, right.finalScore);
    case "default":
      return (
        progressStatusRank(right.progressStatus) -
          progressStatusRank(left.progressStatus) ||
        compareNullableNumbersDesc(
          timestamp(left.latestActivityAt),
          timestamp(right.latestActivityAt),
        ) ||
        left.participantCode.localeCompare(right.participantCode)
      );
  }
}

function compareNullableNumbersDesc(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right - left;
}

function timestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function ProgressStatusBadge({ status }: { status: ProgressStatus }) {
  const label = progressStatusLabel(status);
  const className = {
    final_submitted: "border-teal-200 bg-teal-50 text-teal-800",
    inactive: "border-slate-200 bg-slate-100 text-slate-600",
    no_activity: "border-amber-200 bg-amber-50 text-amber-800",
    practicing: "border-cyan-200 bg-cyan-50 text-cyan-800",
  }[status];

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function progressStatusLabel(status: ProgressStatus) {
  switch (status) {
    case "final_submitted":
      return "Final submitted";
    case "inactive":
      return "Inactive";
    case "no_activity":
      return "No activity";
    case "practicing":
      return "Practicing";
  }
}

function progressStatusRank(status: ProgressStatus) {
  switch (status) {
    case "final_submitted":
      return 4;
    case "practicing":
      return 3;
    case "no_activity":
      return 2;
    case "inactive":
      return 1;
  }
}
