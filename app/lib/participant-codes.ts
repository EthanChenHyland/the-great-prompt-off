export function normalizeParticipantCode(participantCode: string) {
  return participantCode.trim().toUpperCase();
}

export function normalizeParticipantAccessCode(accessCode: string) {
  return accessCode.trim().toUpperCase();
}

export function isLocalMockParticipantCode(participantCode: string) {
  return normalizeParticipantCode(participantCode).length > 0;
}
