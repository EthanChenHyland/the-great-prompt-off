import { ChallengeWorkspace } from "../components/ChallengeWorkspace";
import { getLeaderboardRows, getSampleReports } from "../lib/challenge-data";

export default async function ChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ participant?: string }>;
}) {
  const { participant } = await searchParams;
  const reports = await getSampleReports();
  const leaderboard = getLeaderboardRows(participant);

  return (
    <ChallengeWorkspace
      initialParticipantId={participant ?? ""}
      leaderboard={leaderboard}
      reports={reports}
    />
  );
}
