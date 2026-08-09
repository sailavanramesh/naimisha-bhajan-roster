// lib/pitchSuggestions.ts
import { prisma } from "@/lib/db";
import { tablaPitchOf } from "@/lib/pitch";

export type PitchSuggestions = {
  pitches: string[];
  // Keep as string (not null) to avoid TS headaches in your props.
  // If tablaPitch is unknown, we store "".
  pitchToTabla: Record<string, string>;
};

export async function getPitchSuggestions(): Promise<PitchSuggestions> {
  const rows = await prisma.pitchLabel.findMany({
    orderBy: [{ step: "asc" }, { series: "asc" }],
  });

  const pitches: string[] = [];
  const pitchToTabla: Record<string, string> = {};

  for (const r of rows) {
    const label = (r.label ?? "").trim();
    if (!label) continue;

    pitches.push(label);
    // Tabla is always Sa + 7, so derive it rather than trusting the stored
    // column; the stored value is kept only to verify the source.
    pitchToTabla[label] = tablaPitchOf(label) ?? (r.tablaPitch ?? "").trim();
  }

  return { pitches, pitchToTabla };
}

export default getPitchSuggestions;
