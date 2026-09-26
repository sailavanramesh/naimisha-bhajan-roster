import Link from "next/link";
import { isAbhishekam, ashtottaraLinks } from "@/lib/abhishekamChants";

/**
 * The ashtottara links on a session page.
 *
 * A server component that decides for itself whether it belongs on the page:
 * it renders nothing at all unless the session is an Abhishekam and there are
 * ashtottaras to link to, so the two callers say `<AshtottaraLinks ... />` and
 * do not each repeat the test. See lib/abhishekamChants.ts.
 */
export async function AshtottaraLinks({ categoryName }: { categoryName: string | null }) {
  if (!isAbhishekam(categoryName)) return null;
  const chants = await ashtottaraLinks();
  if (chants.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-on-surface-muted">Ashtottaras:</span>
      {chants.map((chant) => (
        <Link
          key={chant.id}
          href={`/songs/${chant.id}`}
          className="whitespace-nowrap rounded-full border border-brass/40 bg-brass/[0.08] px-3 py-1 text-xs hover:border-brass/70"
        >
          {chant.title}
        </Link>
      ))}
    </div>
  );
}
