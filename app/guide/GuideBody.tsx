import Link from "next/link";
import { parseGuideBody, type GuideBlock, type GuideSpan } from "@/lib/guideText";

/**
 * A section body, rendered.
 *
 * Real React elements built from the parsed tree — no `dangerouslySetInnerHTML`
 * anywhere, so nothing typed into a body can become markup. The classes are the
 * ones the guide carried as JSX, so the page looks exactly as it did before the
 * words moved into the database.
 *
 * No hooks and no "use client", so both the page and the owner's live preview
 * render the same component.
 */
export function GuideBody({ body }: { body: string }) {
  const blocks = parseGuideBody(body);
  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </>
  );
}

function Block({ block }: { block: GuideBlock }) {
  if (block.kind === "list") {
    return (
      <ul className="grid list-disc gap-1 ps-5">
        {block.items.map((spans, i) => (
          <li key={i}>
            <Spans spans={spans} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className={block.kind === "aside" ? "text-on-surface-muted" : undefined}>
      <Spans spans={block.spans} />
    </p>
  );
}

function Spans({ spans }: { spans: GuideSpan[] }) {
  return (
    <>
      {spans.map((span, i) => {
        if (span.kind === "bold") return <strong key={i}>{span.text}</strong>;
        if (span.kind === "italic") return <em key={i}>{span.text}</em>;
        if (span.kind === "link") {
          /*
           * Internal links go through next/link so the app does not reload;
           * anything else is a plain anchor opened away from the page, because
           * a guide read on a phone at the back of a hall should not lose its
           * place to an off-site tap.
           */
          return span.href.startsWith("/") ? (
            <Link
              key={i}
              href={span.href}
              className="text-brass-ink underline underline-offset-2"
            >
              {span.text}
            </Link>
          ) : (
            <a
              key={i}
              href={span.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-brass-ink underline underline-offset-2"
            >
              {span.text}
            </a>
          );
        }
        return <span key={i}>{span.text}</span>;
      })}
    </>
  );
}
