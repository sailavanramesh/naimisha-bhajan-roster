# Tanpura recordings

The shruti play control (`components/ShrutiPlayer.tsx`) sounds a real tanpura
recording, pitch-corrected to the shruti being played. This directory holds
those recordings. **Until the files below exist, the control renders but fails
on click** — run `npm run check:tanpura` to see what is missing.

## What is needed

Eight files. Two tunings × four base pitches:

| Series  | Sa | File |
|---------|----|------|
| Madhyam | C  | `madhyam-c.mp3` |
| Madhyam | D# | `madhyam-d-sharp.mp3` |
| Madhyam | F# | `madhyam-f-sharp.mp3` |
| Madhyam | A  | `madhyam-a.mp3` |
| Pancham | C  | `pancham-c.mp3` |
| Pancham | D# | `pancham-d-sharp.mp3` |
| Pancham | F# | `pancham-f-sharp.mp3` |
| Pancham | A  | `pancham-a.mp3` |

The list is generated from `TANPURA_BASE_NOTES` in `lib/tanpura.ts`. Adding
base pitches there narrows the worst-case correction; nothing else changes.

## Why these eight and not twenty-four

A recording is tuned to its exact shruti by playing it back faster or slower,
which shifts pitch and length together and starts to smear the jivari buzz once
pushed far. Four base pitches three semitones apart mean nothing is ever
corrected by more than 1.5 semitones — under 10% of playback rate, which a
drone carries cleanly.

The two series are genuinely different recordings, not the same one relabelled:
a Pancham tanpura sounds Pa against Sa, a Madhyam one sounds Ma. That is the
whole reason the group writes the series on a pitch. Sa itself is identical
between them — `1 Madhyam / F` and `3.5 Pancham / F` are the same Sa, per
CLAUDE.md rule 2, and the code never converts one series to the other.

## What each file must be

- **A seamless loop.** It is played on repeat with no crossfade, so the last
  sample must meet the first without a click. Trim on a zero crossing.
- **8–20 seconds.** Long enough to cover a full cycle of the four strings,
  short enough to download on a phone in a hall.
- **In tune with A4 = 440 Hz**, and tuned to the Sa in the filename. Everything
  downstream trusts the filename: a recording that is actually a quartertone
  flat will play a quartertone flat at every shruti derived from it.
- **Mono, 96–128 kbps MP3.** A drone has little stereo information and this is
  loaded over mobile data. Keep each file under about 300 KB.
- **Even in level, with no fade of its own.** The player does its own fade in
  and out; a fade baked into the file would fade again on every loop.

## Where they can come from

Recording the centre's own tanpura or shruti box is the surest route — it is
then unambiguously the group's own material, and it will match what people hear
in the hall. Record eight takes, one per row above, or record one take per
series at C and let someone re-tune between takes.

If a purchased or downloaded sample library is used instead, check the licence
covers redistribution: these files are served publicly to every visitor, which
most "personal use only" sample licences do not permit.
