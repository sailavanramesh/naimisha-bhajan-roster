import { prisma } from "@/lib/db";
import { recommendTabla, ASHRAM_TABLA_PC, ASHRAM_TABLAS } from "@/lib/tabla";
import { ragaScale } from "@/lib/ragaScales";
import { NOTE_NAMES } from "@/lib/pitch";

/**
 * Every tabla decision a coordinator has made by hand, with what the rule would
 * have said.
 *
 * Sailavan, 2026-08-11: rather than hand-coding the ragas the rule cannot
 * resolve, pick them as they come up and collect the answers to refine the
 * algorithm later. This is where that collection becomes visible.
 *
 * The point of showing the rule's answer beside the human one is that the gap
 * is the finding. A row where they AGREE says the rule is right and the raga's
 * notes are probably fine. A row where they differ is either a raga whose notes
 * I have wrong, or a case the degree order gets wrong — and which of those it
 * is becomes obvious once a few have accumulated.
 */
export async function TablaDecisions() {
  const overrides = await prisma.tablaOverride.findMany({
    orderBy: [{ updatedAt: "desc" }],
  });

  if (overrides.length === 0) {
    return (
      <p className="text-sm text-on-surface-muted">
        None yet. Choosing a tabla by hand on a roster page records it here, along with what
        the rule would have said — the disagreements are what will sharpen it.
      </p>
    );
  }

  const rows = overrides.map((o) => {
    const scale = ragaScale(o.raga);
    const computed = recommendTabla({
      sa: o.sa,
      ragaSemitones: scale,
      available: ASHRAM_TABLA_PC,
    });
    return {
      ...o,
      saNote: NOTE_NAMES[((o.sa % 12) + 12) % 12],
      ruleSaid: computed.note,
      ruleConfidence: computed.confidence,
      ragaKnown: scale !== null,
      agrees: computed.note === o.note,
    };
  });

  const disagreements = rows.filter((r) => !r.agrees).length;

  return (
    <div className="grid gap-2">
      <p className="text-sm text-on-surface-muted">
        {rows.length} decision{rows.length === 1 ? "" : "s"} recorded
        {disagreements > 0 ? (
          <>
            {" "}— <strong className="text-on-surface">{disagreements}</strong> disagree with the
            rule. Those are the ones worth looking at: either the raga&rsquo;s notes are wrong,
            or the order of preference is.
          </>
        ) : (
          " — all agree with the rule, which so far confirms it."
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm">
          <thead>
            <tr className="border-b border-rule-surface text-left text-xs text-on-surface-muted">
              <th className="py-1.5 pr-3 font-semibold">Raga</th>
              <th className="py-1.5 pr-3 font-semibold">Sa</th>
              <th className="py-1.5 pr-3 font-semibold">Chosen</th>
              <th className="py-1.5 pr-3 font-semibold">Rule said</th>
              <th className="py-1.5 pr-3 font-semibold">Raga notes</th>
              <th className="py-1.5 font-semibold">By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-rule-surface/60">
                <td className="py-1.5 pr-3">{r.raga || <em>any raga</em>}</td>
                <td className="py-1.5 pr-3 font-mono">{r.saNote}</td>
                <td className="py-1.5 pr-3 font-mono font-semibold">{r.note ?? "none fits"}</td>
                <td className="py-1.5 pr-3">
                  <span className={r.agrees ? "font-mono text-on-surface-muted" : "font-mono text-warn"}>
                    {r.ruleSaid ?? "none"}
                  </span>
                  {r.ruleConfidence === "assumed" ? (
                    <span className="ml-1 text-[10px] text-on-surface-muted">assumed</span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-3 text-xs text-on-surface-muted">
                  {r.ragaKnown ? "known" : "not recorded"}
                </td>
                <td className="py-1.5 text-xs text-on-surface-muted">{r.setByName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-on-surface-muted">
        Ashram tablas: {ASHRAM_TABLAS.join(", ")}. A decision applies to that raga at that Sa
        wherever it comes up again.
      </p>
    </div>
  );
}
