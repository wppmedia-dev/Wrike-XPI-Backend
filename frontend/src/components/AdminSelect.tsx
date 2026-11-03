import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { registerFloatingPanel } from "../lib/floatingPanels";
import "./AdminSelect.css";

export interface AdminSelectOption {
  value: string;
  label: string;
}

interface AdminSelectProps {
  id?: string;
  icon?: string;
  options: AdminSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  /** Hide the search box for genuinely short lists (a handful of fixed
      options) where typing to filter adds a step rather than saving one.
      Defaults on — most lists here (environments) grow over time. */
  searchable?: boolean;
}

interface Position {
  top: number;
  left: number;
  width: number;
  direction: "down" | "up";
}

const GAP = 6;
const EDGE = 12;

/**
 * A dropdown styled to the admin shell's own tokens (accent/card/border),
 * not a native <select>. The native element's own option list can't be
 * restyled in any browser — its font, spacing and colours come straight
 * from the OS, which is exactly why a plain <select> reads as un-designed
 * next to everything else on the page. This renders its own panel instead,
 * so it's the same visual system as every other control here — search
 * included, once a list is long enough that scanning beats scrolling.
 *
 * The panel is portaled onto <body> and measured from the trigger, the same
 * approach RowMenu.tsx and FilterPopover.tsx use, rather than the
 * `position: absolute` a plain sibling panel would need. That matters here
 * specifically because AdminSelect gets used *inside* those popovers (the
 * Client field in the Activity Log's Filters/Export panels, the
 * Environment field in the Sessions table's filter popup) — a
 * non-portaled panel would be confined and clipped by that ancestor's own
 * scroll container instead of floating freely above it.
 *
 * frontend/src/components/SearchableSelect.tsx already solves the same
 * interaction problem, but it's styled for the dark glass login hero — a
 * white-on-white mismatch on this shell — so this is a sibling for the
 * light app-shell context rather than a retrofit of that one.
 */
export default function AdminSelect({
  id,
  icon,
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  ariaLabel,
  searchable = true,
}: AdminSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const close = () => setOpen(false);

  // Measure after paint but before the browser shows the frame, so the panel
  // never appears at the wrong spot for one visible frame — same approach as
  // RowMenu and FilterPopover, and for the same reason: it's what lets the
  // direction (open below vs. flip above) reflect how much room is actually
  // left rather than a fixed guess.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const anchor = trigger.getBoundingClientRect();
    const { height } = panel.getBoundingClientRect();

    const spaceBelow = window.innerHeight - anchor.bottom - GAP - EDGE;
    const spaceAbove = anchor.top - GAP - EDGE;

    const direction: "down" | "up" =
      height > spaceBelow && spaceAbove > spaceBelow ? "up" : "down";

    const top =
      direction === "down"
        ? Math.max(EDGE, Math.min(anchor.bottom + GAP, window.innerHeight - height - EDGE))
        : Math.max(EDGE, anchor.top - height - GAP);

    const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - anchor.width - EDGE));

    setPosition({ top, left, width: anchor.width, direction });
  }, [open]);

  // Clear any stale measurement the moment the panel closes, so the next
  // open starts hidden again instead of flashing at yesterday's position.
  useEffect(() => {
    if (!open) setPosition(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || rootRef.current?.contains(target)) return;
      close();
    };
    // A resize, or the page scrolling under the panel, invalidates the
    // measured position. Scroll events don't bubble, only capture (hence
    // `true` here), which also means this fires for a scroll confined
    // entirely inside the panel's own option list — that must not close it,
    // so anything whose target is inside the panel is left alone.
    const onScroll = (e: Event) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    const onResize = () => close();

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    // Registered so an ancestor floating panel this AdminSelect happens to
    // be rendered inside of (a FilterPopover's field, the Sessions table's
    // filter popup) can recognise a scroll/click inside this dropdown as
    // "one of mine" too, even though portaling both onto <body> makes them
    // siblings rather than ancestor/descendant in the DOM. See
    // src/lib/floatingPanels.ts.
    const unregister = panelRef.current ? registerFloatingPanel(panelRef.current) : undefined;

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      unregister?.();
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      const i = options.findIndex((o) => o.value === value);
      setHighlighted(i >= 0 ? i : 0);
      if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing narrows the list — keep the highlight on a row that still matches
  // rather than pointing at whatever used to be in that position.
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  const commit = (v: string) => {
    onChange(v);
    close();
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) commit(filtered[highlighted].value);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    }
  };

  // Once open and searchable, the search input owns key handling (focus
  // moves there). Otherwise the trigger button stays focused throughout, so
  // it has to handle both "open the panel" and "navigate inside it" itself.
  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (!searchable) onListKeyDown(e);
  };

  return (
    <div className="adsel" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="adsel-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        {icon && <i className={`fa-solid ${icon} adsel-icon`} aria-hidden="true" />}
        <span className={`adsel-value${selected ? "" : " adsel-placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <i className={`fa-solid fa-chevron-down adsel-caret${open ? " open" : ""}`} aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={`adsel-panel adsel-${position?.direction ?? "down"}`}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: position?.width,
              // Hidden until measured, so it never flashes in the wrong spot
              // (or the wrong direction) before the layout pass runs.
              visibility: position ? "visible" : "hidden",
            }}
          >
            {searchable && (
              <input
                ref={searchRef}
                type="text"
                className="adsel-search"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKeyDown}
              />
            )}
            <div className="adsel-options" role="listbox">
              {filtered.length === 0 && <div className="adsel-empty">No matches</div>}
              {filtered.map((opt, i) => (
                <div
                  key={opt.value || "__empty"}
                  role="option"
                  aria-selected={opt.value === value}
                  className={`adsel-option${i === highlighted ? " highlighted" : ""}${
                    opt.value === value ? " selected" : ""
                  }`}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => commit(opt.value)}
                >
                  {opt.value === value && <i className="fa-solid fa-check" aria-hidden="true" />}
                  {opt.label}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
