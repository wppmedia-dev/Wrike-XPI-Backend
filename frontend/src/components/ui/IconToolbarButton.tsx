import { forwardRef } from "react";
import { Tooltip } from "./Tooltip";
import "./IconToolbarButton.css";

/* Note on refs: RadixTooltip.Trigger's `asChild` clones this component's
   <button> and composes its own internal ref with whatever `ref` the button
   already carries (Radix's Slot primitive does this composition itself), so
   forwarding the external `ref` straight onto the <button> below is enough —
   both the popover's own position math and Radix's trigger measurement land
   on the same node without any manual merging here. */

/**
 * An icon-only toolbar trigger with an optional count badge and a hover
 * tooltip carrying the label the icon dropped — the Filters/Export buttons
 * on the Activity Log toolbars and the Sessions table's Filters button.
 *
 * Kept generic rather than baked into FilterPopover: FilterPopover owns the
 * open panel, this owns only the trigger's look, so a plain icon button (no
 * popover at all) can use the same visual language.
 */
export const IconToolbarButton = forwardRef<
  HTMLButtonElement,
  {
    icon: string;
    label: string;
    /** Shown as a small badge on the button — an active-filter count. Hidden
        entirely when 0/undefined, rather than shown as a zero. */
    badge?: number;
    active?: boolean;
    onClick?: () => void;
    "aria-expanded"?: boolean;
    "aria-haspopup"?: React.AriaAttributes["aria-haspopup"];
  }
>(function IconToolbarButton(
  { icon, label, badge, active, onClick, ...aria },
  ref,
) {
  return (
    <Tooltip label={label}>
      <button
        ref={ref}
        type="button"
        className={`itb${active ? " itb-active" : ""}`}
        aria-label={label}
        onClick={onClick}
        {...aria}
      >
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
        {!!badge && <span className="itb-badge">{badge}</span>}
      </button>
    </Tooltip>
  );
});

export default IconToolbarButton;
