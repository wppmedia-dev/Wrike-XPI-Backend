import type { ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import "./Tooltip.css";

/**
 * A hover/focus tooltip for icon-only controls — the label an icon button
 * loses when its text is dropped in favour of the icon (the toolbar's
 * Filters/Export buttons, and the same treatment on the Sessions table's
 * Filters button).
 *
 * Built on @radix-ui/react-tooltip rather than the console's own InfoTip
 * (frontend/src/components/ui/InfoTip.tsx): InfoTip is click-triggered and
 * portal-measured by hand for annotating dense table rows — exactly right
 * there, but the wrong interaction for "what does this toolbar button do",
 * which wants the standard hover/focus reveal with no click consumed. Radix
 * gives us that, plus correct keyboard/screen-reader behaviour and
 * viewport-aware flipping, for free; only the visual skin here is ours.
 *
 * One Provider per app would be more conventional, but every render of this
 * component already mounts its own Provider — Radix's Provider is stateless
 * config (delay durations), so nesting many is harmless, and it keeps this
 * component a drop-in wrapper with no root-level setup required.
 */
export function Tooltip({
  children,
  label,
  side = "bottom",
}: {
  /** The single focusable/hoverable element the tooltip describes. */
  children: ReactNode;
  /** The tooltip's text. */
  label: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={100}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className="ui-tooltip" side={side} sideOffset={8} collisionPadding={8}>
            {label}
            <RadixTooltip.Arrow className="ui-tooltip-arrow" width={10} height={5} />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

export default Tooltip;
