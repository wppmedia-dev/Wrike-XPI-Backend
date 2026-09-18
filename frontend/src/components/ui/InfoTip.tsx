import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./InfoTip.css";

/**
 * The closer of whichever tip is currently open, so opening one shuts the last.
 *
 * Module scope rather than context on purpose: these are annotations on a dense
 * table, a reader opens one at a time, and two tips at once means neither is
 * the one being read. A tiny registry beats threading a provider through every
 * page that happens to show a caller column.
 */
let closeOpenTip: (() => void) | null = null;

/**
 * One sentence of explanation behind an info icon, opened by click.
 *
 * Click rather than hover, for the same reason PageInfo does it: a hover
 * tooltip cannot be reached on a touch screen, cannot be selected from, and
 * vanishes the moment the pointer moves, and what these explain ("why is this
 * cell empty?") is exactly the thing a reader wants to finish reading.
 *
 * Drawn in a fixed layer on document.body rather than inside the caller, and
 * that is not a detail. The place this is used is table rows, and those rows
 * animate in (`.al-row-in` / `.pal-row-in`, opacity and a translateY with
 * `animation-fill-mode: both`). A finished animation leaves the row with a
 * computed transform of the identity matrix rather than `none`, and any
 * transform at all makes the row the containing block for its fixed
 * descendants, so viewport coordinates measured off the icon would be
 * interpreted from the row's own origin, putting the tip hundreds of pixels
 * away from the icon (in practice: nowhere anyone can see). A portal takes the
 * tip out of that subtree, and out of the table's horizontal scroll container
 * as well.
 *
 * The anchor is therefore measured from the icon, flipped above when there is
 * no room below, and clamped to the viewport horizontally.
 * Everything closes it: clicking the icon again, clicking anywhere else,
 * Escape, a scroll (the row it points at has moved, so the tip would be
 * pointing at nothing), or a resize.
 */
export function InfoTip({
  text,
  label = "What does this mean?",
}: {
  /** The explanation. Shown as-is, so keep it to a sentence or two. */
  text: string;
  /** The icon's accessible name, for a reader who cannot see where it sits. */
  label?: string;
}) {
  const [anchor, setAnchor] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const open = anchor !== null;

  const show = useCallback(() => {
    // Shut any other one before measuring: two open at once would both survive
    // a click that never touched them.
    closeOpenTip?.();

    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;

    // 160px is roughly the tallest a two-line tip gets: below it unless the
    // viewport has at least that much room to spare.
    const below = window.innerHeight - rect.bottom > 160;
    const width = Math.min(320, window.innerWidth - 24);

    setAnchor({
      ...(below
        ? { top: rect.bottom + 8 }
        : { bottom: window.innerHeight - rect.top + 8 }),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    const close = () => setAnchor(null);
    closeOpenTip = close;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      // The icon itself is excluded: its own click handler toggles, and closing
      // here first would make a second click reopen instead of shut. The tip is
      // excluded so selecting its text with a drag does not dismiss it.
      if (btnRef.current?.contains(target) || tipRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      if (closeOpenTip === close) closeOpenTip = null;
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span className="it-wrap">
      <button
        type="button"
        ref={btnRef}
        className="it-btn"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        // Swallowed, because this sits inside rows that are themselves
        // clickable (the activity tables open a call-details modal from a row
        // click, and from Enter or Space on a focused row). Without this, a
        // press on the icon would open the modal as well, and the row's own
        // key handler would fire alongside the button's.
        onClick={(event) => {
          event.stopPropagation();
          if (open) setAnchor(null);
          else show();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") event.stopPropagation();
        }}
      >
        <i className="fa-solid fa-circle-info" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <span
            ref={tipRef}
            className="it-tip"
            id={id}
            role="tooltip"
            // Reading the tip must not count as clicking whatever is visually
            // underneath it. A portal bubbles events through the React tree, so
            // without this a click on the tip would reach the table row it was
            // opened from and open that row's detail modal.
            onClick={(event) => event.stopPropagation()}
            style={{
              top: anchor.top,
              bottom: anchor.bottom,
              left: anchor.left,
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

export default InfoTip;
