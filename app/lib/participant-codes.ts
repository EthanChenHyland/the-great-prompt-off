export function normalizeParticipantCode(participantCode: string) {
  return participantCode.trim().toUpperCase();
}

export function normalizeParticipantAccessCode(accessCode: string) {
  const compact = accessCode
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");

  if (!/^GPO[A-Z0-9]{8}$/.test(compact)) {
    return "";
  }

  return `GPO-${compact.slice(3, 7)}-${compact.slice(7, 11)}`;
}

export function formatParticipantAccessCodeInput(accessCode: string) {
  const compact = accessCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 11);
  const groups = [
    compact.slice(0, 3),
    compact.slice(3, 7),
    compact.slice(7, 11),
  ].filter(Boolean);

  return groups.join("-");
}

export function isLocalMockParticipantCode(participantCode: string) {
  return normalizeParticipantCode(participantCode).length > 0;
}
