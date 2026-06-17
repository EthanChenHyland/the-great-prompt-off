import { ChallengeWorkspace } from "../components/ChallengeWorkspace";
import { getPublicChallengeReports } from "../lib/challenge-data";

export default async function ChallengePage() {
  const reports = await getPublicChallengeReports();

  return <ChallengeWorkspace initialParticipantId="" reports={reports} />;
}
