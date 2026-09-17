import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  getTokenPermissionCatalog,
  getTokenPermissions,
  grantedCount,
  setTokenPermissions,
  type ActionName,
  type ModuleDef,
  type PermissionCatalog,
  type PermissionMatrix,
  type TokenPermissionEntry,
} from "../lib/tokenPermissionsApi";
import { progress, toast } from "../lib/notify";
import "./TokenPermissions.css";

const ACTION_LABEL: Record<ActionName, string> = {
  read: "Read",
  create: "Create",
  update: "Update",
  delete: "Delete",
};

/** Column order used until the catalogue lands (and if it never does). The
    catalogue's own `actions` list is what actually decides the columns once
    it arrives. See `actions` below. */
const DEFAULT_ACTIONS: ActionName[] = ["read", "create", "update", "delete"];

const actionLabel = (action: ActionName) => ACTION_LABEL[action] || action;

/**
 * Every action every module declares, granted.
 *
 * This is not a preset the admin can pick. It is what a token with no stored
 * matrix can actually do right now, so it is what its grid has to open with.
 * Showing an empty grid instead read as "this token can do nothing" while the
 * API happily answered every call, which is the one thing the popup must never
 * appear to say.
 */
const fullMatrix = (modules: ModuleDef[]): PermissionMatrix =>
  Object.fromEntries(
    modules.map((mod) => {
      const row: Record<ActionName, boolean> = {
        read: false,
        create: false,
        update: false,
        delete: false,
      };
      for (const action of mod.actions) row[action] = true;
      return [mod.key, row];
    }),
  );

const MODULE_ICON: Record<string, string> = {
  campaign: "fa-bullhorn",
  channel: "fa-diagram-project",
  task: "fa-list-check",
  master: "fa-table-list",
  amoeba: "fa-shapes",
};

/**
 * Where the editor reads and writes.
 *
 * Injectable because the same widget serves two surfaces: the admin console,
 * whose data comes from /api/v1/admin/tokens, and the portal, whose data comes
 * from /api/v1/portal/api-tokens and is scoped server-side to the caller's own
 * environments. The default is the admin API, so the console is unchanged,
 * and there is still one matrix editor rather than two that drift.
 *
 * The object must be stable across renders (a module-scope constant): the load
 * effect deliberately does not depend on it, or an inline literal would refetch
 * on every render.
 */
export interface TokenPermissionsApi {
  loadCatalog: () => Promise<PermissionCatalog>;
  load: (tokenId: string) => Promise<TokenPermissionEntry>;
  save: (
    tokenId: string,
    permissions: PermissionMatrix,
  ) => Promise<TokenPermissionEntry>;
}

const ADMIN_API: TokenPermissionsApi = {
  loadCatalog: getTokenPermissionCatalog,
  load: getTokenPermissions,
  save: setTokenPermissions,
};

interface Props {
  tokenId: string | null;
  /** Human-readable identification for the header, e.g. "PROD · IEAC7PRT". */
  tokenLabel: string | null;
  open: boolean;
  onClose: () => void;
  /**
   * Called after a matrix is stored. The list behind this popup shows an Access
   * badge derived from that matrix, and nothing else would refresh it: without
   * this, saving a token's permissions left its row still reading "Unrestricted"
   * until the page was reloaded, so the row and the popup disagreed.
   */
  onSaved?: () => void;
  /** Defaults to the admin console's API. */
  api?: TokenPermissionsApi;
  /**
   * Show the matrix without letting it be changed.
   *
   * A caller with read but not update (the portal, where those are separate
   * grants) still needs to see what a token is allowed to do: that is the
   * question the token list raises. Hidden actions and disabled controls both
   * say "you cannot do this"; only the second one answers "so what can it do?"
   * at the same time. Nothing here is a security boundary either way: the
   * write is refused by requirePortalPermission on the server, not by this
   * component declining to send it.
   */
  readOnly?: boolean;
}

/**
 * Module-permission editor for one API token: Read, Create, Update and Delete per
 * module, opened from that token's row. Sibling of PortalUserPermissions and
 * deliberately the same widget: same grid, same quick-set, same read-implies
 * rules, so an admin who has used one has used both.
 *
 * The one thing it has to do that the portal version doesn't is represent the
 * default honestly. An unconfigured token is *unrestricted*, so its grid opens
 * with every box ticked, which is the access it really has, and a notice
 * explains why, because an empty grid would read as "this token can do nothing"
 * while the API went on answering every call.
 */
export default function TokenPermissions({
  tokenId,
  tokenLabel,
  open,
  onClose,
  onSaved,
  api = ADMIN_API,
  readOnly = false,
}: Props) {
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [original, setOriginal] = useState<PermissionMatrix | null>(null);
  const [draft, setDraft] = useState<PermissionMatrix | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    // Re-fetched on EVERY open, not just the first: the catalogue is the
    // server's (src/utils/tokenPermissionCatalog.js) and can gain a module
    // while this dashboard is already loaded, and the token's own matrix can
    // be changed by another admin. Holding either in state for the life of
    // the page would show a matrix that is no longer true.
    api
      .loadCatalog()
      .then(setCatalog)
      .catch(() => {});

    if (!tokenId) return;
    setLoading(true);

    (async () => {
      // The catalogue first: an unconfigured token's grid is built from it, so
      // the two can no longer be fetched independently.
      const cat = await api.loadCatalog().catch(() => null);
      if (cat) setCatalog(cat);

      const data = await api.load(tokenId);

      // `configured: false` means nothing is stored, which means the token is
      // unrestricted, so the grid opens fully ticked, matching what the API
      // will actually do. Saving then stores exactly that, or whatever the
      // admin changes it to.
      const shown = data.configured ? data.matrix : fullMatrix(cat?.modules || []);

      setConfigured(data.configured);
      setOriginal(shown);
      setDraft(shown);
    })()
      .catch((err) => {
        toast(err?.message || "Could not load token permissions", "error");
        setOriginal(null);
        setDraft(null);
        setConfigured(null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tokenId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const modules = catalog?.modules || [];

  /* The columns ARE the server's action vocabulary, not a second copy of it.
     If the catalogue ever adds or reorders an action, the grid follows with
     no edit here. DEFAULT_ACTIONS only covers the moment before it arrives. */
  const actions: ActionName[] = catalog?.actions?.length ? catalog.actions : DEFAULT_ACTIONS;

  const counts = useMemo(
    () => (draft ? grantedCount(draft, modules) : { granted: 0, total: 0 }),
    [draft, modules],
  );

  const dirty = useMemo(() => {
    if (!draft || !original) return false;
    return JSON.stringify(draft) !== JSON.stringify(original);
  }, [draft, original]);

  const toggleCell = (moduleKey: string, action: ActionName) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [moduleKey]: { ...prev[moduleKey] } };
      const turningOn = !next[moduleKey][action];
      next[moduleKey][action] = turningOn;

      // Read is the floor, for the same reason it is in the portal: a caller
      // that cannot read a module has no business updating or deleting in it,
      // so granting a write implies read and taking read away takes the
      // writes with it. A combination the console can't produce is one the
      // gate never has to explain.
      if (turningOn && action !== "read") next[moduleKey].read = true;
      if (!turningOn && action === "read") {
        next[moduleKey].create = false;
        next[moduleKey].update = false;
        next[moduleKey].delete = false;
      }

      return next;
    });
  };

  // Per-row shortcut: everything this module supports, or nothing.
  const toggleModuleRow = (moduleKey: string, allOn: boolean) => {
    const mod = modules.find((m) => m.key === moduleKey);
    if (!mod) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const row: Record<ActionName, boolean> = {
        read: false,
        create: false,
        update: false,
        delete: false,
      };
      if (!allOn) for (const a of mod.actions) row[a] = true;
      return { ...prev, [moduleKey]: row };
    });
  };

  /**
   * One switch for every module at once: No access, Read only, or Full
   * access. "Full" means each module's own maximum, not literally every
   * action on every module. Channel and Task have no create endpoint, so
   * "Full" gives them read/update/delete, which is all a token could use.
   */
  const applyGlobalPreset = (preset: "off" | "read" | "full") => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next: PermissionMatrix = {};
      for (const mod of modules) {
        const row: Record<ActionName, boolean> = {
          read: false,
          create: false,
          update: false,
          delete: false,
        };
        if (preset === "read") row.read = true;
        if (preset === "full") for (const a of mod.actions) row[a] = true;
        next[mod.key] = row;
      }
      return next;
    });
  };

  /**
   * Which global preset the whole matrix currently matches exactly, or null
   * when modules disagree, which is the common case once an admin starts
   * customising. Null means no segment lights up, rather than guessing at the
   * closest one.
   */
  const globalPreset = useMemo((): "off" | "read" | "full" | null => {
    if (!draft || !modules.length) return null;

    const matches = (want: "off" | "read" | "full") =>
      modules.every((mod) => {
        const row = draft[mod.key];
        if (!row) return want === "off";
        if (want === "off") return mod.actions.every((a) => !row[a]);
        if (want === "read") {
          return mod.actions.every((a) => (a === "read" ? row[a] : !row[a]));
        }
        return mod.actions.every((a) => row[a]);
      });

    if (matches("off")) return "off";
    if (matches("read")) return "read";
    if (matches("full")) return "full";
    return null;
  }, [draft, modules]);

  const save = async () => {
    if (!tokenId || !draft) return;
    setSaving(true);
    progress.start();
    try {
      const saved = await api.save(tokenId, draft);
      setOriginal(saved.matrix);
      setDraft(saved.matrix);
      setConfigured(saved.configured);
      toast(`Permissions saved${tokenLabel ? ` for ${tokenLabel}` : ""}`, "success");
      // After the toast, so a slow reload can never delay the confirmation of
      // the save itself.
      onSaved?.();
    } catch (err: any) {
      toast(err?.message || "Could not save permissions", "error");
    } finally {
      setSaving(false);
      progress.done();
    }
  };

  return (
    <div
      className={`tkp-backdrop${open ? " open" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tkp-modal" role="dialog" aria-modal="true" aria-label="Token permissions">
        <div className="tkp-head">
          <div className="tkp-head-title">
            <span className="tkp-head-icon" aria-hidden="true">
              <i className="fa-solid fa-key" />
            </span>
            <div>
              <div className="tkp-head-name">API Token Permissions</div>
              <div className="tkp-head-token">{tokenLabel || tokenId || "—"}</div>
            </div>
          </div>
          <button type="button" className="tkp-close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="tkp-body">
          {loading && (
            <div className="tkp-skeleton-stack">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="tkp-skeleton" key={i} />
              ))}
            </div>
          )}

          {!loading && (
            <>
              {readOnly ? (
                <div className="tkp-notice" role="note">
                  <i className="fa-solid fa-eye" aria-hidden="true" />
                  <div>
                    <strong>Read-only.</strong> These are the modules this token may call, and
                    with which verb. Changing them needs the update permission on API Tokens,
                    which your account does not have.
                  </div>
                </div>
              ) : (
                <p className="tkp-hint">
                  Which API modules this token may call, and with which verb. A module it can write
                  to needs read as well. The checkboxes keep that pair consistent.
                </p>
              )}

              {configured === false && (
                <div className="tkp-notice" role="note">
                  <i className="fa-solid fa-unlock" aria-hidden="true" />
                  <div>
                    <strong>Every module is allowed by default.</strong> Nothing is stored for
                    this token yet, so it can call all of them, which is why every box starts
                    {readOnly ? " ticked." : (
                      <>
                        {" "}ticked. Saving stores this as its matrix: untick what it must not do,
                        or set every row to <em>No access</em> to switch it off completely.
                      </>
                    )}
                  </div>
                </div>
              )}

              {!readOnly && (
              <div className="tkp-global" role="group" aria-label="Set access for every module">
                <span className="tkp-global-label">Quick set, all modules</span>
                <div className="tkp-global-switch">
                  <button
                    type="button"
                    className="tkp-global-seg"
                    aria-pressed={globalPreset === "off"}
                    onClick={() => applyGlobalPreset("off")}
                  >
                    <i className="fa-solid fa-ban" aria-hidden="true" />
                    No access
                  </button>
                  <button
                    type="button"
                    className="tkp-global-seg"
                    aria-pressed={globalPreset === "read"}
                    onClick={() => applyGlobalPreset("read")}
                  >
                    <i className="fa-solid fa-eye" aria-hidden="true" />
                    Read only
                  </button>
                  <button
                    type="button"
                    className="tkp-global-seg"
                    aria-pressed={globalPreset === "full"}
                    onClick={() => applyGlobalPreset("full")}
                  >
                    <i className="fa-solid fa-pen" aria-hidden="true" />
                    Full access
                  </button>
                </div>
              </div>
              )}

              <div
                className="tkp-matrix"
                style={{ "--tkp-action-cols": actions.length } as CSSProperties}
              >
                <div className="tkp-matrix-head" aria-hidden="true">
                  <span className="tkp-matrix-head-module" />
                  {actions.map((action) => (
                    <span className="tkp-matrix-head-cell" key={action}>
                      {actionLabel(action)}
                    </span>
                  ))}
                  <span className="tkp-matrix-head-all" />
                </div>

                {modules.map((mod) => {
                  const row = draft?.[mod.key];
                  const allOn = mod.actions.every((a) => row?.[a]);

                  return (
                    <div className="tkp-matrix-row" key={mod.key}>
                      <div className="tkp-module">
                        <span className="tkp-module-icon" aria-hidden="true">
                          <i className={`fa-solid ${MODULE_ICON[mod.key] || "fa-cube"}`} />
                        </span>
                        <span className="tkp-module-text">
                          <span className="tkp-module-label">{mod.label}</span>
                          <span className="tkp-module-desc">{mod.description}</span>
                        </span>
                      </div>

                      {actions.map((action) => {
                        const supported = mod.actions.includes(action);
                        const checked = !!row?.[action];

                        return (
                          <div className="tkp-matrix-cell" key={action}>
                            {supported ? (
                              <label className="tkp-tick-wrap">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={readOnly}
                                  onChange={() => toggleCell(mod.key, action)}
                                  aria-label={`${actionLabel(action)} on ${mod.label}`}
                                />
                                <span className="tkp-tick" aria-hidden="true">
                                  <i className="fa-solid fa-check" />
                                </span>
                              </label>
                            ) : (
                              <span
                                className="tkp-na"
                                title={`${mod.label} does not support ${actionLabel(action).toLowerCase()}`}
                                aria-hidden="true"
                              >
                                —
                              </span>
                            )}
                          </div>
                        );
                      })}

                      <div className="tkp-matrix-cell">
                        {/* No bulk switch for a read-only viewer: an All/None
                            button that does nothing is worse than no button. */}
                        {!readOnly && (
                          <button
                            type="button"
                            className="tkp-rowtoggle"
                            onClick={() => toggleModuleRow(mod.key, allOn)}
                          >
                            {allOn ? "None" : "All"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="tkp-footer">
          <span className="tkp-footer-count">
            {counts.granted} of {counts.total} granted
          </span>
          <div className="tkp-footer-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!dirty || saving || loading}
                onClick={save}
              >
                <i
                  className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-check"}`}
                  aria-hidden="true"
                />
                &nbsp;Save permissions
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
