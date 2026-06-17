import { ChallengeWorkspace } from "../components/ChallengeWorkspace";
import { getSampleReports } from "../lib/challenge-data";

export default async function ChallengePage() {
  const reports = await getSampleReports();

  return <ChallengeWorkspace initialParticipantId="" reports={reports} />;
}
