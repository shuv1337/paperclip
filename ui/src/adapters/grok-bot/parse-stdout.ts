import type { TranscriptEntry } from "../types";

export function parseGrokBotStdoutLine(line: string, ts: string): TranscriptEntry[] {
  return [{ kind: "stdout", ts, text: line }];
}
