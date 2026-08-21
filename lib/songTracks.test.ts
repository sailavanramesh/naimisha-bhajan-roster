import { describe, it, expect } from "vitest";
import { resolveItemTracks, originalOf, karaokeOf, pairOf } from "./songTracks";

const track = (n: string) => ({
  trackFile: `${n}.mp3`,
  trackName: `${n} sung.mp3`,
  trackBytes: 100,
  trackUploadedBy: "Sailavan",
});
const karaoke = (n: string) => ({
  karaokeTrackFile: `${n}-k.mp3`,
  karaokeTrackName: `${n} karaoke.mp3`,
  karaokeTrackBytes: 90,
  karaokeTrackUploadedBy: "Sailavan",
});

describe("pulling the halves out of a row", () => {
  it("reads the original", () => {
    expect(originalOf(track("a"))).toEqual({
      file: "a.mp3", name: "a sung.mp3", bytes: 100, uploadedBy: "Sailavan",
    });
  });
  it("reads the karaoke", () => {
    expect(karaokeOf(karaoke("a"))?.file).toBe("a-k.mp3");
  });
  it("is null, not a half-built object, when the file is missing", () => {
    expect(originalOf({ trackName: "orphan.mp3" })).toBeNull();
    expect(karaokeOf({ karaokeTrackName: "orphan.mp3" })).toBeNull();
    expect(originalOf(null)).toBeNull();
    expect(karaokeOf(undefined)).toBeNull();
  });
  it("gives both halves together", () => {
    const p = pairOf({ ...track("a"), ...karaoke("a") });
    expect([p.original?.file, p.karaoke?.file]).toEqual(["a.mp3", "a-k.mp3"]);
  });
});

/**
 * The rule that matters: a recording chosen for ONE NIGHT must never be silently
 * replaced by the catalogue's default.
 */
describe("resolveItemTracks", () => {
  it("plays the item's own recording when it has one", () => {
    const r = resolveItemTracks(track("item"), { ...track("song"), ...karaoke("song") });
    expect(r.play?.file).toBe("item.mp3");
    expect(r.source).toBe("item");
  });

  it("does NOT pair the item's recording with the song's karaoke", () => {
    // They are two different recordings; a toggle between them would land in the
    // wrong bar. Better no toggle than a misleading one.
    const r = resolveItemTracks(track("item"), { ...track("song"), ...karaoke("song") });
    expect(r.karaoke).toBeNull();
    expect(r.canToggle).toBe(false);
  });

  it("falls back to the song's pair when the item has nothing", () => {
    const r = resolveItemTracks({}, { ...track("song"), ...karaoke("song") });
    expect(r.play?.file).toBe("song.mp3");
    expect(r.karaoke?.file).toBe("song-k.mp3");
    expect(r.source).toBe("song");
    expect(r.canToggle).toBe(true);
  });

  it("toggles on the item's own pair when the item has both halves", () => {
    const r = resolveItemTracks({ ...track("item"), ...karaoke("item") }, null);
    expect(r.source).toBe("item");
    expect(r.canToggle).toBe(true);
    expect(r.karaoke?.file).toBe("item-k.mp3");
  });

  it("plays the song's original with no toggle when the song has no karaoke", () => {
    const r = resolveItemTracks(null, track("song"));
    expect(r.play?.file).toBe("song.mp3");
    expect(r.canToggle).toBe(false);
  });

  it("reports nothing when there is nothing anywhere", () => {
    const r = resolveItemTracks(null, null);
    expect(r).toEqual({ play: null, karaoke: null, source: "none", canToggle: false });
  });

  it("ignores a song karaoke with no original to pair it with", () => {
    // A karaoke on its own is not a practice pair and must not play as if it
    // were the song.
    const r = resolveItemTracks(null, karaoke("song"));
    expect(r.play).toBeNull();
    expect(r.source).toBe("none");
  });
});
