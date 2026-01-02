// lib/pitchSuggestions.ts
import { prisma } from "@/lib/db";

export type PitchSuggestions = {
  pitches: string[];
  // Keep as string (not null) to avoid TS headaches in your props.
  // If tablaPitch is unknown, we store "".
  pitchToTabla: Record<string, string>;
};

export async function getPitchSuggestions(): Promise<PitchSuggestions> {
  const rows = await prisma.pitchLookup.findMany({
    orderBy: [{ value: "asc" }, { label: "asc" }],
  });

  const pitches: string[] = [];
  const pitchToTabla: Record<string, string> = {};

  for (const r of rows) {
    const label = (r.label ?? "").trim();
    if (!label) continue;

    pitches.push(label);
    pitchToTabla[label] = (r.tablaPitch ?? "").trim();
  }

  return { pitches, pitchToTabla };
}

export default getPitchSuggestions;
