import * as Speech from 'expo-speech';

let enabled = true;

export function setSoundEnabled(value: boolean) {
  enabled = value;
}

/** Reads an English word, phrase or sentence aloud. Never blocks a flow. */
export function speak(text: string | null | undefined) {
  if (!enabled || !text) return;
  try {
    Speech.stop();
    Speech.speak(text, { language: 'en-US', rate: 0.88 });
  } catch {
    // Speech is a nicety; a device without a voice must not break studying.
  }
}
