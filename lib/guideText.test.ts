import { describe, expect, it } from "vitest";
import { parseGuideBody, parseSpans } from "./guideText";
import { DEFAULT_GUIDE } from "./defaultGuide";

describe("parseSpans", () => {
  it("keeps plain text as one span", () => {
    expect(parseSpans("who is singing, at what shruti")).toEqual([
      { kind: "text", text: "who is singing, at what shruti" },
    ]);
  });

  it("reads bold and the text around it", () => {
    expect(parseSpans("Open a date and you get the **shruti** they sing at")).toEqual([
      { kind: "text", text: "Open a date and you get the " },
      { kind: "bold", text: "shruti" },
      { kind: "text", text: " they sing at" },
    ]);
  });

  it("reads a link", () => {
    expect(parseSpans("go to [the roster](/roster) now")).toEqual([
      { kind: "text", text: "go to " },
      { kind: "link", text: "the roster", href: "/roster" },
      { kind: "text", text: " now" },
    ]);
  });

  it("reads a link inside bold without stranding asterisks", () => {
    expect(parseSpans("**[Admin](/admin)**")).toEqual([{ kind: "bold", text: "[Admin](/admin)" }]);
  });

  it("reads italic without tripping over bold", () => {
    expect(parseSpans("correct _which bhajan_ is **there**")).toEqual([
      { kind: "text", text: "correct " },
      { kind: "italic", text: "which bhajan" },
      { kind: "text", text: " is " },
      { kind: "bold", text: "there" },
    ]);
  });

  it("leaves an unclosed ** as typed", () => {
    expect(parseSpans("2 ** 3 is not eight")).toEqual([
      { kind: "text", text: "2 ** 3 is not eight" },
    ]);
  });

  it("leaves a bracket that is not a link as typed", () => {
    expect(parseSpans("the shruti [as written] on the sheet")).toEqual([
      { kind: "text", text: "the shruti [as written] on the sheet" },
    ]);
  });

  /*
   * The one security-shaped case. A section body is typed by the owner and
   * rendered into an href, so a scheme that executes must not survive the
   * parser — it stays literal text instead.
   */
  it("refuses a javascript: href", () => {
    expect(parseSpans("[tap](javascript:alert(1))")).toEqual([
      { kind: "text", text: "[tap](javascript:alert(1))" },
    ]);
  });

  it("allows http and mailto", () => {
    expect(parseSpans("[site](https://example.com)")).toEqual([
      { kind: "link", text: "site", href: "https://example.com" },
    ]);
    expect(parseSpans("[write](mailto:a@b.com)")).toEqual([
      { kind: "link", text: "write", href: "mailto:a@b.com" },
    ]);
  });
});

describe("parseGuideBody", () => {
  it("splits paragraphs on a blank line and joins soft wraps", () => {
    expect(parseGuideBody("one line\nwrapped\n\nsecond")).toEqual([
      { kind: "paragraph", spans: [{ kind: "text", text: "one line wrapped" }] },
      { kind: "paragraph", spans: [{ kind: "text", text: "second" }] },
    ]);
  });

  it("gathers consecutive bullets into one list", () => {
    const blocks = parseGuideBody("- first\n- second\n\nafter");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      kind: "list",
      items: [[{ kind: "text", text: "first" }], [{ kind: "text", text: "second" }]],
    });
  });

  it("starts a list straight after a paragraph without a blank line", () => {
    const blocks = parseGuideBody("lead in:\n- a\n- b");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "list"]);
  });

  it("reads an aside", () => {
    expect(parseGuideBody("> quietly")).toEqual([
      { kind: "aside", spans: [{ kind: "text", text: "quietly" }] },
    ]);
  });

  it("returns nothing for an empty body", () => {
    expect(parseGuideBody("")).toEqual([]);
    expect(parseGuideBody("   \n\n  ")).toEqual([]);
  });
});

describe("the shipped guide text", () => {
  it("has unique keys and consecutive positions", () => {
    const keys = DEFAULT_GUIDE.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DEFAULT_GUIDE.map((s) => s.position)).toEqual(
      DEFAULT_GUIDE.map((_, i) => i + 1),
    );
  });

  it("parses to at least one block per card, with nothing left as literal markup", () => {
    for (const section of DEFAULT_GUIDE) {
      const blocks = parseGuideBody(section.body);
      expect(blocks.length, section.key).toBeGreaterThan(0);

      const literal = JSON.stringify(blocks);
      expect(literal, section.key).not.toMatch(/\*\*/);
      expect(literal, section.key).not.toMatch(/\]\(/);
      expect(literal, section.key).not.toMatch(/_/);
    }
  });

  it("links only to paths this app serves", () => {
    for (const section of DEFAULT_GUIDE) {
      if (section.href) expect(section.href, section.key).toMatch(/^\//);
    }
  });
});
