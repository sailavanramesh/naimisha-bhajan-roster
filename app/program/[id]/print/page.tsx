import { prisma } from "@/lib/db";
import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { sortChannels, stripNumber } from "@/lib/deskChannels";
import { instrumentsLabel, performersLabel, songNumbers } from "@/lib/program";
import { micColourLabel } from "@/lib/micCushion";

export const dynamic = "force-dynamic";

/**
 * The programme on paper, for the desk.
 *
 * On an analog desk this is the whole of what the app can give: a channel list
 * that matches the strips, and a grid saying which channels are open on each
 * item. It exists because paper does not go to sleep, run out of battery, or
 * need somebody to have signed in, and the person mixing has both hands busy.
 *
 * Black on white and no interaction. Everything a screen adds — tints, live
 * colours, links — costs ink and reads worse under hall lighting.
 */
export default async function ProgramPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole();
  if (role === "viewer" && !can(role, "viewAllPages")) {
    return <NoAccess what="This programme" role={role} />;
  }

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      category: { select: { name: true } },
      desk: { select: { name: true } },
      channels: {
        include: { singer: { select: { name: true } }, instrument: { select: { name: true } } },
      },
      programItems: {
        orderBy: { position: "asc" },
        include: {
          performers: { orderBy: { order: "asc" }, include: { singer: { select: { name: true } } } },
          instruments: {
            orderBy: { order: "asc" },
            include: {
              instrument: { select: { name: true } },
              singer: { select: { name: true } },
            },
          },
          channels: { select: { channelId: true, open: true } },
        },
      },
    },
  });

  if (!session || session.format !== "program") {
    return <p className="p-6">Not found.</p>;
  }

  const channels = sortChannels(session.channels);
  const numbers = songNumbers(session.programItems);

  const when = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(session.date);

  /*
   * Who is on sound, for the folder on the night.
   *
   * The centre's sound engineers, read off the singer rows — the job moved from
   * the session to the person on 2026-08-18, so this is no longer a fact about
   * this programme and is queried rather than included.
   */
  const sound = (
    await prisma.singer.findMany({
      where: { soundEngineer: true },
      orderBy: { name: "asc" },
      select: { name: true },
    })
  )
    .map((s) => s.name)
    .join(", ");

  return (
    <div className="mx-auto max-w-[1000px] bg-white p-6 text-black print:p-0">
      <style>{`@media print { @page { size: A4 landscape; margin: 12mm; } }`}</style>

      <header className="mb-4">
        <h1 className="text-xl font-bold">
          {session.topic?.trim() || session.category?.name || "Music programme"}
        </h1>
        <p className="text-sm">
          {when}
          {session.location ? ` · ${session.location}` : ""}
          {session.desk?.name ? ` · ${session.desk.name}` : ""}
          {sound ? ` · sound: ${sound}` : ""}
        </p>
      </header>

      {channels.length === 0 ? (
        <p className="text-sm">No channels set up for this programme.</p>
      ) : (
        <>
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide">Channels</h2>
          <ul className="mb-5 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[12px] sm:grid-cols-3">
            {channels.map((c) => {
              const who = c.singer?.name ?? c.person ?? c.instrument?.name ?? null;
              return (
                <li key={c.id} className="flex gap-2 border-b border-black/15 py-0.5">
                  <span className="w-9 shrink-0 text-right font-mono font-bold">{stripNumber(c.number, c.stereo)}</span>
                  <span className="min-w-0 flex-1">
                    {c.label}
                    {who && who !== c.label ? ` (${who})` : ""}
                  </span>
                  {/* The cushion by NAME, never by colour alone — this sheet is
                      printed in black and white more often than not. */}
                  {c.colour ? (
                    <span className="shrink-0 text-[11px]">{micColourLabel(c.colour)}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide">
            Open channels, item by item
          </h2>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="border border-black/30 px-1 py-0.5 text-left">Item</th>
                <th className="w-10 border border-black/30 px-1 py-0.5">Scene</th>
                {channels.map((c) => (
                  <th key={c.id} className="w-6 border border-black/30 px-0.5 py-0.5 font-mono">
                    {stripNumber(c.number, c.stereo)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {session.programItems.map((item) => {
                const open = new Set(item.channels.filter((c) => c.open).map((c) => c.channelId));
                return (
                  <tr key={item.id}>
                    <td className="border border-black/30 px-1 py-0.5">
                      <span className="mr-1 font-mono">
                        {item.kind === "narration" ? "read" : numbers.get(item.position)}
                      </span>
                      {item.title || (item.kind === "narration" ? "Reading" : "—")}
                      {item.pitchNote ? (
                        <span className="ml-1 font-mono font-bold">{item.pitchNote}</span>
                      ) : null}
                    </td>
                    <td className="border border-black/30 px-1 py-0.5 text-center font-mono">
                      {item.sceneNumber ?? ""}
                    </td>
                    {channels.map((c) => (
                      <td
                        key={c.id}
                        className={`border border-black/30 px-0.5 py-0.5 text-center ${
                          open.has(c.id) ? "bg-black/10 font-bold" : ""
                        }`}
                      >
                        {open.has(c.id) ? "●" : ""}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <h2 className="mb-1 mt-5 text-sm font-bold uppercase tracking-wide">Running order</h2>
      <ol className="grid gap-1 text-[12px]">
        {session.programItems.map((item) => (
          <li key={item.id} className="border-b border-black/15 py-0.5">
            <span className="mr-1.5 font-mono font-bold">
              {item.kind === "narration" ? "read" : numbers.get(item.position)}
            </span>
            <span className="font-semibold">
              {item.title || (item.kind === "narration" ? "Reading" : "—")}
            </span>
            {item.pitchNote ? <span className="ml-2 font-mono">{item.pitchNote}</span> : null}
            {item.bpm ? <span className="ml-2">{item.bpm} bpm</span> : null}
            <div className="text-[11px]">
              {performersLabel(
                item.performers.map((p) => ({
                  singerName: p.singer?.name ?? null,
                  name: p.name,
                  part: p.part,
                })),
              )}
              {item.instruments.length > 0
                ? ` · ${instrumentsLabel(
                    item.instruments.map((i) => ({
                      instrumentName: i.instrument.name,
                      singerName: i.singer?.name ?? null,
                      person: i.person,
                    })),
                  )}`
                : ""}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
