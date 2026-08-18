/**
 * The guide as written in code — the text /guide was seeded from.
 *
 * Three jobs, and it is worth being clear about all three because they are why
 * this file still exists after the page became database rows:
 *
 *   1. The SEED. `npm run db:guide` upserts these into GuideSection, and
 *      creates only what is missing — a card Sailavan has since rewritten is
 *      never quietly reverted by a deploy.
 *   2. The FALLBACK. /guide renders these when the table is empty, so a fresh
 *      clone, a restored database or a forgotten seed shows the guide rather
 *      than an empty page.
 *   3. The UNDO. Each card offers "restore the original text", which reads its
 *      body from here. An edit that goes wrong is one press to put back, with
 *      no database work.
 *
 * The words are the ones the page has carried since it was JSX, moved across
 * rather than rewritten — including the group's own (bhajan, shruti, Gents and
 * Ladies) per CLAUDE.md's glossary.
 *
 * The body markup is documented in lib/guideText.ts.
 */

export type DefaultGuideSection = {
  key: string;
  position: number;
  title: string;
  /** The screen the heading links to. Null for a card not about one page. */
  href: string | null;
  blurb: string | null;
  body: string;
  coordinatorOnly: boolean;
};

export const DEFAULT_GUIDE: DefaultGuideSection[] = [
  {
    key: "start-here",
    position: 1,
    title: "Start here",
    href: null,
    blurb: null,
    coordinatorOnly: false,
    body: `**Sign in with Google** using the email address the coordinator has on file for you. That is how the app knows which singer you are, so it can show you your own list, your own pitches, and take you straight to whatever you are doing on a given night.

**Add it to your home screen.** On an iPhone: Share → Add to Home Screen. On Android: the browser menu → Install. It then opens like an app, full screen, which matters when you are reading words off it.

> Everything works on a phone. The screens that hold a lot — the roster grid, the desk — turn into cards on a small screen rather than shrinking.`,
  },
  {
    key: "roster",
    position: 2,
    title: "Roster",
    href: "/roster",
    blurb: "What we are singing, and who is singing it.",
    coordinatorOnly: false,
    body: `The roster is the heart of it. Open a date and you get that session's slots: the singer, the bhajan, and the **shruti** they are singing it at.

- **Calendar or list** — whichever you prefer. Set it once on your own page and it stays that way.
- **Recommended** is what the masterlist says for a Gents or Ladies voice. **Confirmed** is what the singer is actually singing it at. They differ more often than not, and the confirmed one is the one that matters.
- The small brass chip under a pitch is a suggestion — either what you have sung that bhajan at before, or a shruti saved on your list. Tap it to take it. Nothing is ever filled in for you behind your back.
- **Chorus mics** sit beside each bhajan: who is on the chorus and which coloured cushion they have. Anybody signed in can set these — it is who has picked up a mic tonight, not a rostered part. Set the first bhajan, then press **copy down** to put the same people and cushions on the bhajans below that have none; anything already answered is left alone.

> Anybody signed in can correct _which bhajan_ is in a slot. Adding, removing and reordering slots, and changing who is singing, is a coordinator's job.`,
  },
  {
    key: "my-list",
    position: 3,
    title: "My list",
    href: "/my-list",
    blurb: "What you want to learn, what you are learning, what you know.",
    coordinatorOnly: false,
    body: `Three stages. Move a bhajan between them in one tap. When something reaches **Know it**, the session builder starts suggesting it for you — that is the whole point of keeping it up to date.

- **Shruti you want** — the pitch you would like to sing it at. Save it once and it comes in as your pitch when that bhajan is put on a roster for you.
- Above that field the app shows its own answer — _you have sung it here_, _predicted for you_, or _the masterlist reference_. A saved shruti shows as **your shruti · saved**, so a decision never looks like a guess.
- **Notes** for what is tricky, where you heard it, who taught it.

> Your list lives on your singer page, under your pitch profile and your history.`,
  },
  {
    key: "bhajans-and-explore",
    position: 4,
    title: "Bhajans and Explore",
    href: "/bhajans",
    blurb: "The 3,600-bhajan masterlist, and a way into it.",
    coordinatorOnly: false,
    body: `[Bhajans](/bhajans) is the whole masterlist with filters — deity, raga, language, beat, tempo, level. A bhajan's own page has its reference pitches, its words where we have them, who has sung it and when.

[Explore](/explore) is for when you want something new rather than something particular: a varied handful, weighted so fresher and less-sung bhajans float up. Add anything you like to your list from there.

> Filters and your place in the list are remembered — going into a bhajan and coming back returns you to where you were.`,
  },
  {
    key: "singers",
    position: 5,
    title: "Singers",
    href: "/singers",
    blurb: "Everybody's pitch profile, history and list.",
    coordinatorOnly: false,
    body: `Each singer's page shows how their voice sits against the masterlist reference — usually a semitone or so up or down — the ragas they sing most, their history, and their list. It is how the app predicts a pitch for a bhajan somebody has never sung.`,
  },
  {
    key: "live-view",
    position: 6,
    title: "The live view",
    href: "/roster",
    blurb: "The screen on the stand during a session.",
    coordinatorOnly: false,
    body: `Open a session and press **Live**. It fills the screen — no menu, no editing — and shows each bhajan with its **shruti**, its raga and which tabla to tune. Press the × in the left-hand rail to come back.

- It **keeps itself up to date**. If somebody changes a bhajan or a pitch while the screen is on a stand, the line changes underneath you and glows for a moment so you can see which one moved.
- If the session runs past the bottom of the screen, a small arrow appears in the corner — and brightens when something has changed down there.
- **Mic cushions are live.** Tap a coloured dot beside a singer to say which cushion they are on, and it reaches every other device within a few seconds. Anybody signed in can set one; it is live sound-desk state, not the record of the night.

The button under the × switches to the **mic view**: the desk drawn as strips, the way it looks on the metal, with each singer already on the channel their cushion is on.

- **Every bhajan of the night, one desk each**, down the page. The picture changes from one to the next because the singer does, and because a chorus cushion belongs to the bhajan rather than to the night.
- Nothing is allocated by hand. The cushions sit on fixed channels, so tapping a blue dot on the board has already said who is on channel 1.
- A strip lights up when somebody is singing on it, in that person's cushion colour. The **lead** singer's strip says so under their name, because with a lead and two chorus mics three strips light up at once and the colours alone cannot say which one is singing the bhajan. Two people on the same cushion, or a cushion this desk has no channel for, is called out under that bhajan rather than quietly resolved — both are things to fix before the session starts.
- **Tap a bhajan to say the room is on it.** It takes the brass ring, and every other screen follows within a few seconds — the desk, the stage and anybody watching stay on the same one. Tap it again to go back to not started.

> Everyone can open the mic view. Changing **which desk** the session is on is for editors and for whoever is down as sound engineer or mic coordinator; the desk itself is described in **Admin → Sound desks**.`,
  },
  {
    key: "programmes",
    position: 7,
    title: "Music programmes",
    href: "/program",
    blurb:
      "Janmashtami, Guru Poornima, Swami's birthday — a running order rather than a bhajan list.",
    coordinatorOnly: false,
    body: `A programme is a different thing from an ordinary session, and has its own screens.

- **Running order** — every song and reading in order, who is singing it, what note it is in. Guests who are not roster singers can be named here without being added to the roster.
- **Words** — the link beside each song opens its page: the script, the transliteration and the meaning, line by line where they line up, and each layer can be turned on and off. Paste a whole song in once and the app splits it into verses for you to check.
- **Mics and channels** — which mics are open for each song and who is on them.
- **Printable sheet** for the folder on the night.`,
  },
  {
    key: "desk-view",
    position: 8,
    title: "The desk view",
    href: "/program",
    blurb: "For the night itself — the sound desk, the running order and the words on one screen.",
    coordinatorOnly: false,
    body: `Open a programme and press **Desk view**. The desk is drawn as strips, the way it looks on the metal: the number on top, the name below, and the mic cushion's own colour behind it, so channel 1 reads as the blue cushion at a glance.

- **All songs** shows every song's mic layout at once, with the song the room is on ringed in brass. Tap any song to move the whole room to it — the current item is shared, so the desk, the stage and anybody watching are on the same one.
- **Words** shows the lyrics for the song you are on.
- A mic can change hands between songs — a singer's mic on the mridangam for one piece — and two people can share one mic. The desk view says who, per song.

> Setting the desk up — choosing which desk a programme is on, and taking its strips again after the desk has changed — is for editors and for whoever is down as **sound engineer** or **mic coordinator**. Channels are named in one place, **Admin → Sound desks**, reached from **Set up the desk** beside the grid.`,
  },
  {
    key: "alerts",
    position: 9,
    title: "Alerts",
    href: "/notifications",
    blurb: "Being told, rather than remembering to look.",
    coordinatorOnly: false,
    body: `Turn notifications on per device — your phone and your laptop are separate, so turn it on wherever you actually want to be told. You will hear when:

- you are put on a roster, or taken off one;
- the roster for a session you are on is settled;
- if you play harmonium: when every bhajan and shruti for a rostered day is set, and about each change after that.`,
  },
  {
    key: "for-coordinators",
    position: 10,
    title: "For coordinators",
    href: "/build",
    blurb: "Building sessions, fairness, and the admin lists.",
    coordinatorOnly: true,
    body: `- **Build** suggests a set for a date — shaped so it works as a session, not just a list that passes the filters. Re-roll, swap individual slots, then save.
- **Dashboard** is the overview: what is coming, what still needs building.
- **Fairness** shows how the singing is spread across the group.
- **Admin** holds the lists the app runs on — singers and their access, instruments, kinds of session, who plays what, and the notification rules.
- **Admin → Sound desks** is where a desk and its strips are described: the channel numbers, what each carries, the cushion colours and which mic is on each strip. A programme takes a copy when it picks a desk, so tidying the desk later never rewrites what an old programme says was on channel 6.
- **Admin → Access** is also where the two sound jobs are set. Ticking somebody as **sound engineer** or **mic coordinator** lets them keep the desks right without making them an editor, and lands them on the desk when they open a session.

Removing a session or a programme does not delete it. It goes out of every list, every calendar and every history, and waits in **Admin → Archive**, where the owner can put it back exactly as it was or delete it for good. A session holding confirmed pitches can never be deleted for good while they are on it — that is a record of what somebody actually sang, and it exists nowhere else.`,
  },
  {
    key: "something-wrong",
    position: 11,
    title: "If something looks wrong",
    href: null,
    blurb: null,
    coordinatorOnly: false,
    body: `Tell Sailavan. Most of what is here came from somebody saying "this should work differently" — including a good deal of it more than once.

> One thing the app will not do, ever: overwrite a confirmed pitch with a guess. If a pitch is recorded against a singer and a bhajan, that is what they sang, and it stays.`,
  },
];

/** The written-in-code text for one card, for the "restore" button. */
export function defaultGuideSection(key: string): DefaultGuideSection | null {
  return DEFAULT_GUIDE.find((s) => s.key === key) ?? null;
}
