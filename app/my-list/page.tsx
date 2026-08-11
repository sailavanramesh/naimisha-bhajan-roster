import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSignedInSinger } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * "My list" is now a door, not a room.
 *
 * A singer's list belongs to the singer, so it lives on their page alongside
 * their pitch profile and their history — see components/LearningList.tsx.
 * This route stays because it is in the nav, in bookmarks and in the WhatsApp
 * message that went to the group, and because "my list" is the thing people
 * actually want to say. It just resolves to whose list that is.
 */
export default async function MyListPage() {
  const me = await getSignedInSinger();
  if (me) redirect(`/singers/${me.id}#list`);

  // Not signed in — a shared link cannot tell members apart, so the honest
  // answer is the list of people rather than a guess at which one you are.
  const anySinger = await prisma.singer.count();
  redirect(anySinger > 0 ? "/singers" : "/");
}
