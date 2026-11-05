import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { PageInfo, type PageHelp } from "./PageInfo";
import "./PageHeader.css";

/* A page's header, shown in the top bar instead of at the top of the page.
 *
 * Every console page used to open with its own title, a one-line description
 * and its action buttons, directly under a top bar that already showed the same
 * title and the refresh button. This moves all of it up into that bar:
 *
 *     ≡  Environments ⓘ │ Manage Wrike API credentials…      [Add Environment] ↻
 *        Admin / Environments
 *
 * The page still declares its header where it always did, next to the state and
 * handlers its buttons use (the Cache page's bulk delete, for one), so nothing
 * had to be lifted into the shell. <PageHeader /> renders nothing in the page
 * body; it portals its three parts into slots the shell puts in the top bar:
 *
 *   title extra   the ⓘ and any badge, right after the title the bar already shows
 *   description   the one-line subtitle
 *   actions       the page's buttons, to the left of the refresh button
 *
 * The title text itself is the bar's own (the page's name in the sidebar), so it
 * is not repeated here; `title` is only used by the fallback below.
 *
 * Pages stay mounted while hidden, so a header only renders when its page is the
 * one showing. The shell provides that through <TopbarProvider />.
 */

interface TopbarSlots {
  /** The page on screen. A header for any other page renders nothing. */
  activePage: string;
  titleExtra: HTMLElement | null;
  description: HTMLElement | null;
  actions: HTMLElement | null;
}

const TopbarContext = createContext<TopbarSlots | null>(null);

export const TopbarProvider = TopbarContext.Provider;

/**
 * For the shell: the slot elements to put in the top bar (`refs`, passed as
 * `ref={...}`), and the value to give <TopbarProvider />. Call it with the
 * other hooks, before any early return.
 */
export function useTopbar(activePage: string) {
  const [titleExtra, setTitleExtra] = useState<HTMLElement | null>(null);
  const [description, setDescription] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);

  const value = useMemo<TopbarSlots>(
    () => ({ activePage, titleExtra, description, actions }),
    [activePage, titleExtra, description, actions],
  );

  return {
    value,
    refs: {
      titleExtra: setTitleExtra,
      description: setDescription,
      actions: setActions,
    },
  };
}

export interface PageHeaderProps {
  /** The page's id in the shell (the value of its `activePage`). */
  page: string;
  /** Used only when there is no top bar to render into (see below). */
  title: ReactNode;
  description?: ReactNode;
  /** The text behind the ⓘ. */
  help?: PageHelp;
  /** Shown beside the title, before the ⓘ (for example a "Beta" tag). */
  badge?: ReactNode;
  /** The page's buttons. Give each icon-and-label button a `.btn-text` span so
      the label can drop away on a phone. */
  actions?: ReactNode;
}

export function PageHeader({
  page,
  title,
  description,
  help,
  badge,
  actions,
}: PageHeaderProps) {
  const slots = useContext(TopbarContext);

  // Rendered outside a shell that provides a top bar: fall back to the header
  // the pages used to have, so nothing is ever left without a title.
  if (!slots) {
    return (
      <div className="section-header">
        <div>
          <div className="section-title">
            {title}
            {badge}
            {help && (
              <>
                {" "}
                <PageInfo help={help} />
              </>
            )}
          </div>
          {description && <div className="section-subtitle">{description}</div>}
        </div>
        {actions}
      </div>
    );
  }

  if (slots.activePage !== page) return null;

  return (
    <>
      {slots.titleExtra &&
        (badge || help) &&
        createPortal(
          <>
            {badge}
            {help && <PageInfo help={help} />}
          </>,
          slots.titleExtra,
        )}
      {slots.description &&
        description &&
        createPortal(
          <span
            className="topbar-desc-text"
            // The line is cut with an ellipsis when the bar is narrow.
            title={typeof description === "string" ? description : undefined}
          >
            {description}
          </span>,
          slots.description,
        )}
      {slots.actions && actions && createPortal(actions, slots.actions)}
    </>
  );
}
