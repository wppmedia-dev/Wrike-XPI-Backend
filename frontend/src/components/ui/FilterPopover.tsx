import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconToolbarButton } from "./IconToolbarButton";
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
    const { height } = panel.getBoundingClientRect();

    const spaceBelow = window.innerHeight - anchor.bottom - GAP - EDGE;
    const spaceAbove = anchor.top - GAP - EDGE;

    // Prefer below; flip above only when below can't fit it but above can.
    // Screen height, not a fixed threshold, decides the direction — a short
    // viewport (or a trigger near the bottom of a tall page) opens upward.
    const direction: "down" | "up" =
      height > spaceBelow && spaceAbove > spaceBelow ? "up" : "down";

    const top =
      direction === "down"
        ? anchor.bottom + GAP
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

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };
    // A scroll/resize invalidates the measured position — closing is steadier
    // than re-measuring on every frame while the page moves.
    const onReflow = () => close();

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
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
