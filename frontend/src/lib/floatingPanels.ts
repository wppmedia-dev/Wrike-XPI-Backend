/**
 * A registry of the DOM nodes for currently-open portaled panels (AdminSelect's
 * dropdown, FilterPopover's panel, RowMenu's menu — anything rendered onto
 * <body> rather than as a normal child) — so one panel can tell whether a
 * document-level event actually came from *another* open panel nested
 * visually inside it, even though a portal makes them siblings in the DOM
 * rather than ancestor/descendant.
 *
 * Why this exists: FilterPopover and AdminSelect both close on an outside
 * scroll/click, checked by `panelRef.current.contains(target)`. That works
 * fine when everything is a normal child — but AdminSelect's own panel is
 * portaled onto <body> too (so a scrollable ancestor, like FilterPopover's
 * own body, can't clip or confine it — see AdminSelect.tsx). Once both
 * panels live as siblings under <body>, a scroll inside the AdminSelect
 * dropdown that's nested *visually* inside an open FilterPopover no longer
 * passes FilterPopover's `.contains()` check, so FilterPopover would close
 * out from under it. Registering here is how FilterPopover learns "that
 * scroll/click came from a panel I should treat as part of me" without the
 * two components needing to know about each other directly.
 */

const openPanels = new Set<HTMLElement>();

/** Called by a portaled panel while it's open; returns the matching
    unregister function to call on close/unmount. */
export function registerFloatingPanel(node: HTMLElement): () => void {
  openPanels.add(node);
  return () => {
    openPanels.delete(node);
  };
}

/** True when `target` is inside any currently-registered floating panel —
    not just the caller's own. */
export function isInsideAnyFloatingPanel(target: Node): boolean {
  for (const node of openPanels) {
    if (node.contains(target)) return true;
  }
  return false;
}
