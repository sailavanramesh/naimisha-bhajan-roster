# Tanpura recordings

The shruti play control (`components/ShrutiPlayer.tsx`) sounds a real drone
recording, retuned to the shruti being played. These are those recordings.
`npm run check:tanpura` reports what is present and what is missing.

## What is here

Six files. The two tunings do **not** cover the same pitches — see below.

| Series  | Sa | File | Source sound |
|---------|----|------|--------------|
| Pancham | A  | `pancham-a.wav` | [155494](https://freesound.org/people/sankalp/sounds/155494/) |
| Pancham | C  | `pancham-c.wav` | [155491](https://freesound.org/people/sankalp/sounds/155491/) |
| Pancham | E  | `pancham-e.wav` | [155485](https://freesound.org/people/sankalp/sounds/155485/) |
| Pancham | F# | `pancham-f-sharp.wav` | [155489](https://freesound.org/people/sankalp/sounds/155489/) |
| Madhyam | F# | `madhyam-f-sharp.wav` | [155493](https://freesound.org/people/sankalp/sounds/155493/) |
| Madhyam | A  | `madhyam-a.wav` | [155496](https://freesound.org/people/sankalp/sounds/155496/) |

The list the app expects comes from `TANPURA_BASE_NOTES` in `lib/tanpura.ts`;
`lib/tanpuraAssets.test.ts` fails if this table and that constant disagree.

## Licence — attribution is required

All six come from the **Electronic Tanpura** pack by **sankalp** on Freesound,
released under **CC BY 4.0**. That licence permits commercial use and
redistribution, including of these edited versions, on condition that the
author, source and licence are credited wherever the work appears.

That credit is rendered in `app/layout.tsx`, in the footer on every page. **It
is a licence condition, not decoration — do not remove it.** If the recordings
are ever replaced with the centre's own, remove the credit in the same commit.

The same author's *Acoustic* tanpura pack is mostly CC0 and needs no credit, but
it is a plucked instrument that loops far less cleanly, and its Madhyam tuning
exists at only two pitches as well.

## The uneven coverage, and why

The recordings are of a Raagini electronic tanpura — effectively a shruti box,
which is both what the group actually uses and far easier to loop than a plucked
tanpura, whose four strings are struck in sequence and never repeat.

Its author recorded the Pancham tuning (`pa SA SA sa`) at four pitches but the
Madhyam tuning (`ma SA SA sa`) at only two. So:

- **Pancham** — recordings at A, C, E, F#; worst-case correction **2 semitones**.
- **Madhyam** — recordings at F# and A only; worst-case correction **4 semitones**,
  on targets around C# and D.

This is an acceptable trade only because the group's own usage leans the same
way: of 688 sung pitches on record, **626 are Pancham and 62 Madhyam**. The
common case is the accurate one, and a Madhyam shruti at the far side of the
circle still sounds the right Sa — it just sounds more obviously stretched.

Recording the centre's own box in Madhyam near **C** and **D#** would bring that
series to 2 semitones as well. It is a one-line change to `TANPURA_BASE_NOTES`
plus the files, and the bound asserted in `lib/tanpura.test.ts`.

## Choosing between takes: Sa has to be the loudest thing in it

The pack holds several takes at some pitches, recorded with the box's equaliser
in different positions, and they are NOT interchangeable. A drone whose
companion string outweighs Sa does not sound like the pitch it claims — the ear
takes the loudest note as the tonic.

Measured as total energy at Sa against total energy at the companion drone,
summed across octaves (`scripts/verifyTanpuraTuning.py` does the tuning check;
the ratio below was measured the same way):

| take | setting | Sa / drone |
|---|---|---:|
| 155491 | equaliser fully towards gents, high bass | **3.12** |
| 155497 | middle | 1.80 |
| 155499 | middle | 1.48 (very quiet overall) |
| 155498 | middle | 0.96 — **Pa louder than Sa** |
| 155500 | fully towards ladies, high treble | 0.64 |

`pancham-c.wav` was 155498 until 2026-08-20, which is why C sounded more like
G than C. It is now 155491. The high-bass setting favours the fundamental,
which is exactly what a reference pitch needs.

The other five files have only one take each at their pitch and tuning, so
there was nothing to choose between. `madhyam-a.wav` is the weakest of them —
its Ma sits close under its Sa — and would be the one to replace first if
better material turns up.

## How these were prepared

From the public 128 kbps preview of each sound (the full-quality downloads need
a Freesound login), then:

1. decoded to 16-bit mono 22.05 kHz with `afconvert`;
2. an 8-second segment taken from 40% of the way in, past the onset;
3. the segment's tail crossfaded into its head with equal-power weights, so the
   wrap is a real continuation of the recording and cannot click;
4. levels matched across all six to the same RMS, peak-limited below clipping.

Measured fundamentals were checked against the stated pitches before use: all
six landed within 6 cents of equal temperament at A4 = 440.

## Why WAV and not MP3

MP3 and AAC both carry encoder delay and padding, and browsers disagree about
trimming it on decode — which puts a gap in the one place a drone must not have
one. WAV has no such framing, so the loop is sample-exact everywhere. Each file
is about 350 KB, fetched once per shruti and then cached.

## If these are ever replaced

Any replacement must be a **seamless loop** (or be built the same way), in tune
at **A4 = 440**, tuned to the Sa in its filename, **mono**, and even in level
with no fade of its own — the player fades in and out itself, and a fade baked
into the file would fade again on every repeat.
