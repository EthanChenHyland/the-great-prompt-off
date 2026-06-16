import { ChallengeWorkspace } from "../components/ChallengeWorkspace";
import { getSampleReports } from "../lib/challenge-data";

export default async function ChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ participant?: string }>;
}) {
  const { participant } = await searchParams;
  const reports = await getSampleReports();

  return (
    <ChallengeWorkspace
      initialParticipantId={participant ?? ""}
      reports={reports}
    />
  );
}
