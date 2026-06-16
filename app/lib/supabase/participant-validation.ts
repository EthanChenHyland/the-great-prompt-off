import "server-only";

import { normalizeParticipantCode } from "@/app/lib/participant-codes";
import { createSupabaseAdminClient } from "./admin";

export type ParticipantValidationResult =
  | {
      source: "supabase";
      valid: true;
      participantCode: string;
      participantId: string;
      fallbackReason: null;
      message: string;
    }
  | {
      source: "supabase";
      valid: false;
      participantCode: string;
      participantId: null;
      fallbackReason: null;
      message: string;
    }
  | {
      source: "mock-file-fallback";
      valid: true;
      participantCode: string;
      participantId: null;
      fallbackReason: string;
      message: string;
    };

type ParticipantRow = {
  id: string;
  participant_code: string;
};

export async function validateParticipantCode(
  participantCode: string,
): Promise<ParticipantValidationResult> {
  const normalizedCode = normalizeParticipantCode(participantCode);

  if (!normalizedCode) {
    return {
      source: "supabase",
      valid: false,
      participantCode: "",
      participantId: null,
      fallbackReason: null,
      message: "Enter a participant code before continuing.",
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("participants")
      .select("id, participant_code")
      .eq("participant_code", normalizedCode)
      .maybeSingle<ParticipantRow>();

    if (error) {
      throw new Error(`Participant lookup failed: ${error.message}`);
    }

    if (!data) {
      return {
        source: "supabase",
        valid: false,
        participantCode: normalizedCode,
        participantId: null,
        fallbackReason: null,
        message:
          "Participant code not found. Use a seeded workshop code from P001 through P050.",
      };
    }

    return {
      source: "supabase",
      valid: true,
      participantCode: data.participant_code,
      participantId: data.id,
      fallbackReason: null,
      message: "Participant code validated.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      source: "mock-file-fallback",
      valid: true,
      participantCode: normalizedCode,
      participantId: null,
      fallbackReason: message,
      message:
        "Supabase participant validation is unavailable, so local mock mode accepted this code.",
    };
  }
}
