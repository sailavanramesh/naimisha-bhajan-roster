import { redirect } from "next/navigation";

/**
 * The front door opens on the roster.
 *
 * Sailavan: the roster is what people come for. The dashboard is a
 * coordinator's overview — session counts, fairness loads, what needs building
 * — and members do not even see it in the nav any more, so landing them there
 * meant a page they could not act on.
 *
 * A redirect rather than moving the roster to "/": every session link, the
 * calendar and the PWA all already point at /roster, and a redirect keeps one
 * address for one thing.
 */
export default function Home() {
  redirect("/roster");
}
