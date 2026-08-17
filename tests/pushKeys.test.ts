import { describe, it, expect } from "vitest";
import { base64UrlToBytes, sameApplicationServerKey } from "../lib/pushKeys";

/** A real-shaped VAPID public key: 65 bytes, base64url, 87 characters. */
const KEY_A =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUAn2sM5-w3v0h4ZfEo";

describe("base64UrlToBytes", () => {
  it("decodes a VAPID public key to its 65 raw bytes", () => {
    const bytes = base64UrlToBytes(KEY_A);
    expect(bytes).toHaveLength(65);
    // An uncompressed P-256 point always starts 0x04.
    expect(bytes[0]).toBe(0x04);
  });

  it("handles the base64url alphabet and missing padding", () => {
    // "-" and "_" stand in for "+" and "/", and the padding is left off.
    expect(base64UrlToBytes("-_8")).toEqual(new Uint8Array([0xfb, 0xff]));
  });
});

describe("sameApplicationServerKey", () => {
  it("matches a subscription made against the same key", () => {
    const buf = base64UrlToBytes(KEY_A).slice().buffer;
    expect(sameApplicationServerKey(buf, KEY_A)).toBe(true);
  });

  /*
   * The case that leaves a device silent forever: the pair was rotated, so the
   * subscription is undeliverable and Apple says VapidPkHashMismatch — a 400,
   * which nothing prunes and nothing retries into working.
   */
  it("does not match a subscription made against a different key", () => {
    const other = base64UrlToBytes(KEY_A).slice();
    other[10] = other[10] ^ 0xff;
    expect(sameApplicationServerKey(other.buffer, KEY_A)).toBe(false);
  });

  it("does not match a key of a different length", () => {
    expect(sameApplicationServerKey(new Uint8Array([4, 5, 6]).buffer, KEY_A)).toBe(false);
  });

  /*
   * Not knowing is not the same as knowing it is wrong. A browser that does not
   * report the key keeps what it has, rather than re-subscribing on every load.
   */
  it("treats an unreported key as a match", () => {
    expect(sameApplicationServerKey(null, KEY_A)).toBe(true);
    expect(sameApplicationServerKey(undefined, KEY_A)).toBe(true);
  });

  it("treats a missing server key as a match, having nothing to compare", () => {
    expect(sameApplicationServerKey(base64UrlToBytes(KEY_A).slice().buffer, "")).toBe(true);
  });
});
