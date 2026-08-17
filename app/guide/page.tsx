import Link from "next/link";
import { getRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * How to use this app — the page to send somebody who has just been given the
 * link.
 *
 * Sailavan asked for "a quick readme doc or something to run through the basic
 * features … for all the users to easily know how to use the app". Written as a
 * page rather than a document because a document is a second thing to keep, and
 * it goes out of date on somebody's laptop while the app moves on. This sits in
 * the nav, on the phone, next to the thing it describes.
 *
 * ONE PAGE FOR EVERYBODY, with the coordinator-only parts marked rather than
 * hidden. Two versions would be two things to keep true, and a member who can
 * see that a Build screen exists is better placed to ask for it than one who
 * cannot. What is actually permitted is decided by lib/capabilities.ts, not here.
 *
 * Written in the group's own words — bhajan, shruti, Gents and Ladies — for the
 * same reason the rest of the app is (CLAUDE.md, the glossary).
 */
export default async function GuidePage() {
  const role = await getRole();
  const coordinator = role === "editor" || role === "owner";

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">How to use this app</h1>
        <p className="max-w-2xl text-sm text-on-surface-muted">
          Everything the Naimisha bhajan group used to keep in the spreadsheet — who is singing,
          at what shruti, what we sang last time — plus the words to the songs and the sound
          desk. Here is what each part is for.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start here</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p>
            <strong>Sign in with Google</strong> using the email address the coordinator has on
            file for you. That is how the app knows which singer you are, so it can show you your
            own list, your own pitches, and take you straight to whatever you are doing on a
            given night.
          </p>
          <p>
            <strong>Add it to your home screen.</strong> On an iPhone: Share → Add to Home
            Screen. On Android: the browser menu → Install. It then opens like an app, full
            screen, which matters when you are reading words off it standing up in the hall.
          </p>
          <p className="text-on-surface-muted">
            Everything works on a phone. The screens that hold a lot — the roster grid, the
            desk — turn into cards on a small screen rather than shrinking.
          </p>
        </CardContent>
      </Card>

      <Section
        title="Roster"
        href="/roster"
        blurb="What we are singing, and who is singing it."
      >
        <p>
          The roster is the heart of it. Open a date and you get that session&rsquo;s slots: the
          singer, the bhajan, and the <strong>shruti</strong> they are singing it at.
        </p>
        <ul className="grid list-disc gap-1 ps-5">
          <li>
            <strong>Calendar or list</strong> — whichever you prefer. Set it once on your own
            page and it stays that way.
          </li>
          <li>
            <strong>Recommended</strong> is what the masterlist says for a Gents or Ladies
            voice. <strong>Confirmed</strong> is what the singer is actually singing it at. They
            differ more often than not, and the confirmed one is the one that matters.
          </li>
          <li>
            The small brass chip under a pitch is a suggestion — either what you have sung that
            bhajan at before, or a shruti saved on your list. Tap it to take it. Nothing is ever
            filled in for you behind your back.
          </li>
          <li>
            <strong>Chorus mics</strong> sit beside each bhajan: who is on the chorus and which
            coloured cushion they have.
          </li>
        </ul>
        <p className="text-on-surface-muted">
          Anybody signed in can correct <em>which bhajan</em> is in a slot. Adding, removing and
          reordering slots, and changing who is singing, is a coordinator&rsquo;s job.
        </p>
      </Section>

      <Section
        title="My list"
        href="/my-list"
        blurb="What you want to learn, what you are learning, what you know."
      >
        <p>
          Three stages. Move a bhajan between them in one tap. When something reaches{" "}
          <strong>Know it</strong>, the session builder starts suggesting it for you — that is
          the whole point of keeping it up to date.
        </p>
        <ul className="grid list-disc gap-1 ps-5">
          <li>
            <strong>Shruti you want</strong> — the pitch you would like to sing it at. Save it
            once and it comes in as your pitch when that bhajan is put on a roster for you.
          </li>
          <li>
            Above that field the app shows its own answer — <em>you have sung it here</em>,{" "}
            <em>predicted for you</em>, or <em>the masterlist reference</em>. A saved shruti
            shows as <strong>your shruti · saved</strong>, so a decision never looks like a
            guess.
          </li>
          <li>
            <strong>Notes</strong> for what is tricky, where you heard it, who taught it.
          </li>
        </ul>
        <p className="text-on-surface-muted">
          Your list lives on your singer page, under your pitch profile and your history.
        </p>
      </Section>

      <Section
        title="Bhajans and Explore"
        href="/bhajans"
        blurb="The 3,600-bhajan masterlist, and a way into it."
      >
        <p>
          <Link href="/bhajans" className="text-brass-ink underline underline-offset-2">
            Bhajans
          </Link>{" "}
          is the whole masterlist with filters — deity, raga, language, beat, tempo, level. A
          bhajan&rsquo;s own page has its reference pitches, its words where we have them, who
          has sung it and when.
        </p>
        <p>
          <Link href="/explore" className="text-brass-ink underline underline-offset-2">
            Explore
          </Link>{" "}
          is for when you want something new rather than something particular: a varied handful,
          weighted so fresher and less-sung bhajans float up. Add anything you like to your list
          from there.
        </p>
        <p className="text-on-surface-muted">
          Filters and your place in the list are remembered — going into a bhajan and coming back
          returns you to where you were.
        </p>
      </Section>

      <Section
        title="Singers"
        href="/singers"
        blurb="Everybody's pitch profile, history and list."
      >
        <p>
          Each singer&rsquo;s page shows how their voice sits against the masterlist reference —
          usually a semitone or so up or down — the ragas they sing most, their history, and
          their list. It is how the app predicts a pitch for a bhajan somebody has never sung.
        </p>
      </Section>

      <Section
        title="Music programmes"
        href="/program"
        blurb="Janmashtami, Guru Poornima, Swami's birthday — a running order rather than a bhajan list."
      >
        <p>A programme is a different thing from an ordinary session, and has its own screens.</p>
        <ul className="grid list-disc gap-1 ps-5">
          <li>
            <strong>Running order</strong> — every song and reading in order, who is singing it,
            what note it is in. Guests who are not roster singers can be named here without being
            added to the roster.
          </li>
          <li>
            <strong>Words</strong> — the link beside each song opens its page: the script, the
            transliteration and the meaning, line by line where they line up, and each layer can
            be turned on and off. Paste a whole song in once and the app splits it into verses
            for you to check.
          </li>
          <li>
            <strong>Mics and channels</strong> — which mics are open for each song and who is on
            them.
          </li>
          <li>
            <strong>Printable sheet</strong> for the folder on the night.
          </li>
        </ul>
      </Section>

      <Section
        title="The desk view"
        href="/program"
        blurb="For the night itself — the sound desk, the running order and the words on one screen."
      >
        <p>
          Open a programme and press <strong>Desk view</strong>. The desk is drawn as strips, the
          way it looks on the metal: the number on top, the name below, and the mic cushion&rsquo;s
          own colour behind it, so channel 1 reads as the blue cushion at a glance.
        </p>
        <ul className="grid list-disc gap-1 ps-5">
          <li>
            <strong>All songs</strong> shows every song&rsquo;s mic layout at once, with the song
            the room is on ringed in brass. Tap any song to move the whole room to it — the
            current item is shared, so the desk, the stage and anybody watching are on the same
            one.
          </li>
          <li>
            <strong>Words</strong> shows the lyrics for the song you are on.
          </li>
          <li>
            A mic can change hands between songs — a singer&rsquo;s mic on the mridangam for one
            piece — and two people can share one mic. The desk view says who, per song.
          </li>
        </ul>
        <p className="text-on-surface-muted">
          Setting the desk up — choosing which desk a programme is on and editing its channels —
          is for editors and for whoever is down as <strong>sound engineer</strong> or{" "}
          <strong>mic coordinator</strong> under &ldquo;Who is running it&rdquo;.
        </p>
      </Section>

      <Section
        title="Alerts"
        href="/notifications"
        blurb="Being told, rather than remembering to look."
      >
        <p>
          Turn notifications on per device — your phone and your laptop are separate, so turn it
          on wherever you actually want to be told. You will hear when:
        </p>
        <ul className="grid list-disc gap-1 ps-5">
          <li>you are put on a roster, or taken off one;</li>
          <li>the roster for a session you are on is settled;</li>
          <li>
            if you play harmonium: when every bhajan and shruti for a rostered day is set, and
            about each change after that.
          </li>
        </ul>
      </Section>

      {coordinator ? (
        <Section
          title="For coordinators"
          href="/build"
          blurb="Building sessions, fairness, and the admin lists."
          badge="coordinator"
        >
          <ul className="grid list-disc gap-1 ps-5">
            <li>
              <strong>Build</strong> suggests a set for a date — shaped so it works as a session,
              not just a list that passes the filters. Re-roll, swap individual slots, then save.
            </li>
            <li>
              <strong>Dashboard</strong> is the overview: what is coming, what still needs
              building.
            </li>
            <li>
              <strong>Fairness</strong> shows how the singing is spread across the group.
            </li>
            <li>
              <strong>Admin</strong> holds the lists the app runs on — singers and their access,
              instruments, kinds of session, who plays what, and the notification rules.
            </li>
            <li>
              <strong>Admin → Sound desks</strong> is where a desk and its strips are described:
              the channel numbers, what each carries, the cushion colours and which mic is on
              each strip. A programme takes a copy when it picks a desk, so tidying the desk
              later never rewrites what an old programme says was on channel 6.
            </li>
          </ul>
        </Section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>If something looks wrong</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            Tell Sailavan. Most of what is here came from somebody saying &ldquo;this should
            work differently&rdquo; — including a good deal of it more than once.
          </p>
          <p className="text-on-surface-muted">
            One thing the app will not do, ever: overwrite a confirmed pitch with a guess. If a
            pitch is recorded against a singer and a bhajan, that is what they sang, and it stays.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  title,
  href,
  blurb,
  badge,
  children,
}: {
  title: string;
  href: string;
  blurb: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>
            <Link href={href} className="underline-offset-4 hover:underline">
              {title}
            </Link>
          </CardTitle>
          {badge ? <Badge tone="warn">{badge}</Badge> : null}
        </div>
        <p className="text-sm text-on-surface-muted">{blurb}</p>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">{children}</CardContent>
    </Card>
  );
}
