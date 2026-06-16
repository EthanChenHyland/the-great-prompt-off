import { ChallengeWorkspace } from "../components/ChallengeWorkspace";
import { getAnswerKeyItems, getSampleReports } from "../lib/challenge-data";

export default async function ChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ participant?: string }>;
}) {
  const { participant } = await searchParams;
  const reports = await getSampleReports();
  const answerKeys = getAnswerKeyItems();

  return (
    <ChallengeWorkspace
      initialParticipantId={participant ?? ""}
      privateAnswerKeys={answerKeys.filter((item) => item.split === "private")}
      publicAnswerKeys={answerKeys.filter((item) => item.split === "public")}
      reports={reports}
    />
  );
}
