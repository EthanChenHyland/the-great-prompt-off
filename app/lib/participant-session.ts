"use client";

import { useSyncExternalStore } from "react";
import { participantStorageKey } from "./challenge-constants";

const participantSessionEvent = "great-prompt-off-participant-session";

function emitParticipantSessionChange() {
  window.dispatchEvent(new Event(participantSessionEvent));
}

function getParticipantSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(participantStorageKey) ?? "";
}

function getServerSnapshot() {
  return "";
}

function subscribeToParticipantSession(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(participantSessionEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(participantSessionEvent, onStoreChange);
  };
}

export function useSavedParticipantId() {
  return useSyncExternalStore(
    subscribeToParticipantSession,
    getParticipantSnapshot,
    getServerSnapshot,
  );
}

export function saveParticipantId(participantId: string) {
  window.localStorage.setItem(participantStorageKey, participantId);
  emitParticipantSessionChange();
}

export function clearParticipantId() {
  window.localStorage.removeItem(participantStorageKey);
  emitParticipantSessionChange();
}
