import { useEffect, useId, useRef, useState } from "react";
import "./PageInfo.css";

/**
 * What a page is for, behind an info icon next to its title.
 *
 * Click rather than hover, on purpose: these explain a page somebody is about
 * to work on, so the panel stays open while they read it, can be selected from,
 * and is reachable by keyboard and on a touch screen — none of which a hover
 * tooltip does. Escape or a click anywhere else closes it.
 *
 * Placement matters: put it inside the title element, immediately after the
 * words, so it reads as part of the heading ("Environments ⓘ") rather than as
 * another control in the header's action area, where it would sit next to the
 * buttons that DO things.
 */
export interface PageHelp {
  /** What the page is for, in one or two sentences. */
  summary: string;
  /** What somebody comes here to do, one line each. */
  points: string[];
  /** The thing that is easy to get wrong. Optional. */
  note?: string;
}

export function PageInfo({
  help,
  label = "What's this page for?",
}: {
  help: PageHelp;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      // `target === wrapRef.current` is the phone scrim: it is a pseudo-element
      // of the wrapper, so a tap on it is reported against the wrapper itself.
      // The wrapper is otherwise only the icon button, whose own taps land on
      // the button or its icon, so this cannot swallow a press on the icon.
      if (target === wrapRef.current || !wrapRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span className="pi-wrap" ref={wrapRef}>
      <button
        type="button"
        className="pi-btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        title={label}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <i className="fa-solid fa-circle-info" aria-hidden="true" />
      </button>

      {open && (
        <div className="pi-panel" id={panelId} role="dialog" aria-label={label}>
          <div className="pi-head">{label}</div>
          <p className="pi-summary">{help.summary}</p>

          {help.points.length > 0 && (
            <>
              <div className="pi-label">What you can do here</div>
              <ul className="pi-list">
                {help.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </>
          )}

          {help.note && (
            <p className="pi-note">
              <i className="fa-solid fa-lightbulb" aria-hidden="true" />
              <span>{help.note}</span>
            </p>
          )}
        </div>
      )}
    </span>
  );
}

export default PageInfo;
