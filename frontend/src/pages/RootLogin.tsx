import { useEffect, useState } from "react";
import { fetchEnvironments, fetchRedirectUrl } from "../lib/rootLoginApi";
import SearchableSelect from "../components/SearchableSelect";
import "./RootLogin.css";

// Faithful React port of the inline HTML in src/index.js's GET / handler,
// with one deliberate improvement over the original: the buttons' target
// URLs now stay in sync as the dropdown changes (verified against the full
// git history — the original only ever resolved the URL at click time, so
// this is a new behavior, not a restored one) instead of only resolving on
// click. Environment list / selected env / redirect URLs are fetched
// client-side (GET /environments, GET /get-redirect-url) — redirectUri/
// accountId are plain pass-through query params, read straight from the
// current URL, same as any other page.
const searchParams = new URLSearchParams(window.location.search);
const initialRedirectUri = searchParams.get("redirectUri") || "";
const initialAccountId = searchParams.get("accountId") || "";

/**
 * The two sign-ins this page offers, as two buttons.
 *
 * The main one mints the ordinary token: 180 days, named after this page, for
 * the REST API or an MCP client. The outline one under it mints the token a
 * calendar integration needs, which is the same credential in every other
 * respect — only the purpose the server signs into the request differs, which
 * is why both buttons are built from the same environment and differ by one
 * query parameter (see src/utils/tokenPurpose.js).
 *
 * Neither button says anything about how long its token lasts. The caption
 * below the second one says what it is for, which is all this page claims.
 */
type SignInKind = "login" | "calendar_sync";

export default function RootLogin() {
  const [environments, setEnvironments] = useState<string[]>([]);
  const [environment, setEnvironment] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [calendarSyncUrl, setCalendarSyncUrl] = useState("");
  const [envLoading, setEnvLoading] = useState(true);
  const [urlResolving, setUrlResolving] = useState(false);
  // Which button was pressed, so only that one spins.
  const [loading, setLoading] = useState<SignInKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEnvironments().then((init) => {
      if (cancelled) return;
      setEnvironments(init.environments);
      setEnvironment(init.selectedEnvironment);
      setEnvLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep both buttons' target URLs in sync with whichever environment is
  // currently selected — covers the initial selection and every subsequent
  // dropdown change with one effect. The two differ by nothing but the purpose
  // they carry, so they are resolved together and stored apart: one request
  // each, both signed, neither able to be edited into the other.
  useEffect(() => {
    if (!environment) return;
    let cancelled = false;
    setUrlResolving(true);

    const shared = {
      environment,
      redirectUri: initialRedirectUri,
      accountId: initialAccountId,
    };

    Promise.all([
      fetchRedirectUrl({ ...shared, purpose: "login" }),
      fetchRedirectUrl({ ...shared, purpose: "calendar_sync" }),
    ]).then(([loginUrl, calendarUrl]) => {
      if (cancelled) return;
      if (loginUrl) setRedirectUrl(loginUrl);
      if (calendarUrl) setCalendarSyncUrl(calendarUrl);
      setUrlResolving(false);
    });

    return () => {
      cancelled = true;
    };
  }, [environment]);

  useEffect(() => {
    // Reset buttons if the browser restores this page from bfcache after a redirect.
    const onPageShow = () => setLoading(null);
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const handleLogin = (
    event: React.MouseEvent<HTMLAnchorElement>,
    target: string,
    kind: SignInKind,
  ) => {
    event.preventDefault();

    if (environments.length === 0) {
      alert(
        "No environments configured. Please contact your administrator to configure Wrike environments.",
      );
      return;
    }
    if (!environment) {
      alert("Please select an environment from the dropdown to proceed.");
      return;
    }
    if (urlResolving || !target) return;

    setLoading(kind);
    setTimeout(() => {
      window.location.href = target;
    }, 600);
  };

  // The ordinary sign-in spins while the URLs are still being resolved, as it
  // always has; the second button only spins once it has been pressed itself.
  const primaryBusy = loading === "login" || urlResolving;
  const calendarBusy = loading === "calendar_sync";

  return (
    <div className="root-login-page">
      <div className="top-nav">
        <a href="/docs/mcp">MCP Docs</a>
        <a href="/docs/api">API Docs</a>
        <a href="/docs/calendar">Calendar Sync Docs</a>
      </div>

      <div className="card">
        <div className="logo">
          <span>W</span>
        </div>
        <h1>Connect Your Wrike Account</h1>

        <div className="env-select-wrapper">
          <label htmlFor="envSelect" className="env-select-label">
            Choose Environment
          </label>
          <SearchableSelect
            id="envSelect"
            options={environments}
            value={environment}
            onChange={setEnvironment}
            disabled={envLoading}
            placeholder="Search environments…"
          />
        </div>

        <p>To continue, please log in using your Wrike credentials.</p>

        <div className="login-actions">
          <a
            href={redirectUrl || undefined}
            className="button"
            onClick={(event) => handleLogin(event, redirectUrl, "login")}
          >
            {primaryBusy ? (
              <div className="loader" />
            ) : (
              <>
                <svg
                  className="stroke-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <path d="M10 17l5-5-5-5" />
                  <path d="M15 12H3" />
                </svg>
                <span>Login with Wrike</span>
              </>
            )}
          </a>

          <a
            href={calendarSyncUrl || undefined}
            className="button outline"
            onClick={(event) =>
              handleLogin(event, calendarSyncUrl, "calendar_sync")
            }
          >
            {calendarBusy ? (
              <div className="loader" />
            ) : (
              <>
                <svg
                  className="stroke-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                >
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M8 3v4M16 3v4M3 11h18" />
                </svg>
                <span>Calendar Sync Login</span>
              </>
            )}
          </a>
        </div>

        <p style={{ marginTop: 30, marginBottom: 0, fontSize: "0.95rem", color: "#dddddd" }}>
          Do you want to verify your token?
          <a
            href="/api/v1/wrikexpi/token/evaluate"
            className="secondary-link"
            style={{ color: "#9ae6b4", fontWeight: 600, textDecoration: "underline", marginLeft: 4 }}
          >
            Click here
          </a>
        </p>

        <p style={{ marginTop: 10, marginBottom: 0, fontSize: "0.95rem", color: "#dddddd" }}>
          Want to see all your tokens?
          <a
            href="/api/v1/wrikexpi/token/view"
            className="secondary-link"
            style={{ color: "#9ae6b4", fontWeight: 600, textDecoration: "underline", marginLeft: 4 }}
          >
            View Tokens
          </a>
        </p>
      </div>
    </div>
  );
}
