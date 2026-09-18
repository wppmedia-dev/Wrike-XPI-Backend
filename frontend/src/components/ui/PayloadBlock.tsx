import { useEffect, useState } from "react";

/**
 * One request or response payload in the call-details drawer.
 *
 * The raw view is JSON, and that is right for almost every row: the payload is
 * small and what an administrator wants is the exact bytes that went over the
 * wire. The exception is an HTML error page. The token surface renders those,
 * so the captured body is a couple of kilobytes of markup with every newline
 * escaped into `\n` and every quote into `\"`, which as a wall of JSON tells
 * nobody anything. An HTML body therefore opens as a rendered preview, with the
 * raw JSON one click away for the times when the exact bytes are the point.
 *
 * The preview is an iframe with `sandbox` and no permissions granted. Whatever
 * ends up in a captured body, the console must never let it run a script, post
 * a form or reach this origin. The body may also have been truncated when it was
 * recorded, and a truncated page renders oddly, so that is said out loud rather
 * than left to be discovered.
 *
 * Styling lives with the activity log (frontend/src/pages/ActivityLog.css,
 * `.al-payload-*`), which is the only place this is used today.
 */

/** Pretty-print a JSON value (objects become 2-space indented JSON). */
const prettyJson = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/**
 * The HTML body inside a payload snapshot, or null when there is not one.
 *
 * A snapshot is `{ status_code, body }`, and a body that was not JSON comes
 * back from the server as `{ raw: "<the text>" }` (src/utils/capture.js), so
 * that is where a rendered page hides. A body that is a plain string is
 * checked too, because a JSON body can legitimately be one.
 */
export const htmlInPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;

  const body = (payload as { body?: unknown }).body;
  const text =
    typeof body === "string"
      ? body
      : body &&
          typeof body === "object" &&
          typeof (body as { raw?: unknown }).raw === "string"
        ? (body as { raw: string }).raw
        : null;

  if (!text) return null;
  // Only a body that starts with markup: a JSON body containing a "<" in a
  // string somewhere must not be treated as a page.
  return text.trimStart().startsWith("<") ? text : null;
};

export function PayloadBlock({
  title,
  payload,
}: {
  title: string;
  payload: unknown;
}) {
  const [copied, setCopied] = useState(false);
  const html = htmlInPayload(payload);
  const [view, setView] = useState<"preview" | "raw">(
    html ? "preview" : "raw",
  );

  // Another row's body may not be HTML, or may be, so the view follows the
  // payload rather than being kept from whichever row was open before.
  useEffect(() => {
    setView(html ? "preview" : "raw");
  }, [html]);

  const text =
    payload === null || payload === undefined ? "" : prettyJson(payload);
  const truncated = Boolean(html && html.includes("[truncated]"));
  const preview = Boolean(html) && view === "preview";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <div className="al-payload-block">
      <div className="al-payload-head">
        <span>{title}</span>
        <div className="al-payload-actions">
          {html ? (
            <div
              className="al-payload-tabs"
              role="group"
              aria-label={`${title} view`}
            >
              <button
                type="button"
                className="al-payload-tab"
                aria-pressed={preview}
                onClick={() => setView("preview")}
              >
                Preview
              </button>
              <button
                type="button"
                className="al-payload-tab"
                aria-pressed={!preview}
                onClick={() => setView("raw")}
              >
                Raw
              </button>
            </div>
          ) : null}

          {text ? (
            <button type="button" className="al-copy-btn" onClick={copy}>
              <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} />{" "}
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
        </div>
      </div>

      {text ? (
        preview ? (
          <>
            <iframe
              className="al-payload-frame"
              title={`${title} preview`}
              // Empty sandbox: no scripts, no forms, no same-origin access.
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={html ?? ""}
            />
            {truncated ? (
              <div className="al-payload-note">
                <i
                  className="fa-solid fa-triangle-exclamation"
                  aria-hidden="true"
                />
                Only the beginning of this page was recorded, so the preview
                stops where the capture did. Raw has the same text.
              </div>
            ) : null}
          </>
        ) : (
          <pre className="al-json">{text}</pre>
        )
      ) : (
        <div className="al-no-payload">No {title.toLowerCase()} captured.</div>
      )}
    </div>
  );
}

export default PayloadBlock;
