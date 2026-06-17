import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeParticipantCode } from "@/app/lib/participant-codes";

type ParticipantSessionPayload = {
  participantCode: string;
  iat: number;
};

function getParticipantSessionSecret() {
  return (
    process.env.PARTICIPANT_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "local-mock-participant-session-secret"
  );
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getParticipantSessionSecret())
    .update(value)
    .digest("base64url");
}

export function createParticipantSessionToken(participantCode: string) {
  const payload: ParticipantSessionPayload = {
    participantCode: normalizeParticipantCode(participantCode),
    iat: Math.floor(Date.now() / 1000),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyParticipantSessionToken(token: string) {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);

  if (
    signatureBytes.length !== expectedBytes.length ||
    !timingSafeEqual(signatureBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<ParticipantSessionPayload>;
    const participantCode = normalizeParticipantCode(payload.participantCode || "");

    return participantCode ? { participantCode } : null;
  } catch {
    return null;
  }
}
