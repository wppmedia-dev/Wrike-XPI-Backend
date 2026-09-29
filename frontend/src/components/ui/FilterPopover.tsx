import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconToolbarButton } from "./IconToolbarButton";
import { isInsideAnyFloatingPanel, registerFloatingPanel } from "../../lib/floatingPanels";
import "./FilterPopover.css";

/**
 * A trigger button that opens a floating panel of filter controls — the
 * "Advanced filters" popover on the Activity Log pages (admin and portal).
 *
 * Positioning follows the same measure-after-paint, flip-if-clipped approach
 * as RowMenu.tsx (frontend/src/components/ui/RowMenu.tsx): the panel prefers
 * to open below the trigger, but flips above when the trigger sits too low
 * in the viewport for the panel to fit underneath it. Rendered through a
 * portal on <body> so a table's overflow/scroll container can never clip it.
 */

export interface FilterPopoverProps {
  /** The trigger's label, e.g. "Filters" or "Export". */
  label: string;
  icon: string;
  /** Shown as a small badge on the trigger — the active-filter count. */
  badge?: number;
  children: ReactNode;
  /** Rendered pinned to the bottom of the panel, outside the scrollable
      filter list — Apply/Clear or Cancel/Download, depending on the caller. */
  footer?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Panel width in px. Defaults to a size that comfortably fits two
      controls per row without feeling like a modal. */
  width?: number;
}

interface Position {
  top: number;
  left: number;
  /** Which edge the panel grew from, so its entrance animation and the
      little pointer caret read as anchored to the trigger either way. */
  direction: "down" | "up";
}

const GAP = 8;
const EDGE = 12;

export function FilterPopover({
  label,
  icon,
  badge,
  children,
  footer,
  open,
  onOpenChange,
  width = 360,
}: FilterPopoverProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => onOpenChange(false);

  // Measure after paint but before the browser shows the frame, so the panel
  // never appears at the wrong spot for one visible frame — and so it can
  // pick top vs. bottom based on how much room is actually left, not a fixed
  // guess.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const anchor = trigger.getBoundingClientRect();
    // The panel's own CSS caps its height (max-height: min(70vh, 560px)), so
    // this is already the clamped height when the content overflows — not
    // the content's full, unclamped size.
    const { height } = panel.getBoundingClientRect();

    const spaceBelow = window.innerHeight - anchor.bottom - GAP - EDGE;
    const spaceAbove = anchor.top - GAP - EDGE;

    // Prefer below; flip above only when below can't fit it but above can.
    // Screen height, not a fixed threshold, decides the direction — a short
    // viewport (or a trigger near the bottom of a tall page) opens upward.
    const direction: "down" | "up" =
      height > spaceBelow && spaceAbove > spaceBelow ? "up" : "down";

    // Neither direction is guaranteed to fully fit (a viewport shorter than
    // the panel's own max-height fits in neither), so clamp `top` into the
    // viewport either way — this is what keeps the footer from landing
    // below the fold instead of just capping the direction choice. The
    // outer Math.max keeps `top` from going negative when the panel is
    // taller than the viewport has room for even pinned to the very top.
    const top =
      direction === "down"
        ? Math.max(EDGE, Math.min(anchor.bottom + GAP, window.innerHeight - height - EDGE))
        : Math.max(EDGE, anchor.top - height - GAP);

    const left = Math.max(
      EDGE,
      Math.min(anchor.right - width, window.innerWidth - width - EDGE),
    );

    setPosition({ top, left, direction });
  }, [open, width]);

  // Clear any stale measurement the moment the panel closes, so the next
  // open starts hidden again instead of flashing at yesterday's position for
  // one frame before the layout effect above re-measures it.
  useEffect(() => {
    if (!open) setPosition(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // A target inside this panel, or inside a floating panel nested inside
    // it (AdminSelect's own dropdown for the Environment/Client fields) —
    // registered separately since portaling both onto <body> makes them
    // siblings in the DOM, not ancestor/descendant. See
    // src/lib/floatingPanels.ts for why `.contains()` alone isn't enough.
    const isInsideThisOrNested = (target: Node) =>
      !!panelRef.current?.contains(target) || isInsideAnyFloatingPanel(target);

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (isInsideThisOrNested(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };
    // A resize, or the page/table scrolling under the panel, invalidates the
    // measured position — closing is steadier than re-measuring on every
    // frame while that happens.
    const onReflow = () => close();

    // Scroll events don't bubble, only capture, which is why this listens on
    // window with `true` in the first place — but that means it also fires
    // for a scroll confined entirely inside a nested widget, like the
    // Client field's own AdminSelect dropdown list. That scroll never
    // reaches outside the panel, so it must not close it.
    const onScroll = (e: Event) => {
      const target = e.target as Node;
      if (isInsideThisOrNested(target)) return;
      close();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onScroll, true);

    // Registered for the same reason AdminSelect registers itself: a
    // FilterPopover can itself be nested inside another floating panel in
    // principle, and this keeps the registry symmetric regardless of nesting
    // depth.
    const unregister = panelRef.current ? registerFloatingPanel(panelRef.current) : undefined;

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onScroll, true);
      unregister?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <IconToolbarButton
        ref={triggerRef}
        icon={icon}
        label={label}
        badge={badge}
        active={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      />

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={`fpop-panel fpop-${position?.direction ?? "down"}`}
            role="dialog"
            aria-label={label}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width,
              // Hidden until measured, so it never flashes in the wrong spot
              // (or the wrong direction) before the layout pass runs.
              visibility: position ? "visible" : "hidden",
            }}
          >
            <div className="fpop-body">{children}</div>
            {footer && <div className="fpop-footer">{footer}</div>}
          </div>,
          document.body,
        )}
    </>
  );
}
