import { useEffect, useState, type FormEvent } from "react";
import {
  getPortalRole,
  getPortalToken,
  portalHomeFor,
  portalLogin,
  setPortalSession,
} from "../lib/portalAuthApi";
import xtendIcon from "../assets/xtend-logo-icon.png";
import "./PortalLogin.css";

// Faithful React port of views/portal/login.ejs.
export default function PortalLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getPortalToken();
    const role = getPortalRole();
    if (token && role) {
      window.location.replace(portalHomeFor(role));
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !password) return;

    setError(null);
    setLoading(true);

    try {
      const result = await portalLogin(username.trim(), password);
      setPortalSession(result.accessToken, result.role);

      if (result.mustChangePassword) {
        window.location.replace("/portal/change-password");
      } else {
        window.location.replace(portalHomeFor(result.role));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="portal-login-page">
      <div className="login-card">
        <div className="card-brand">
          <div className="logo-lockup">
            <div className="logo-mark">
              <img src={xtendIcon} alt="Xtend" />
            </div>
            <span className="logo-name">WrikeXPI</span>
          </div>
          <span className="card-subtitle">Portal</span>
        </div>

        <div className="form-heading">Sign in to your account</div>

        <div className={`error-box${error ? " visible" : ""}`}>
          <i className="fa-solid fa-circle-exclamation" />
          <span>{error}</span>
        </div>

        <form autoComplete="off" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <div className="input-wrap">
              <i className="fa-solid fa-user input-icon" />
              <input
                className="form-control"
                type="text"
                id="username"
                name="username"
                placeholder="Enter your username"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <div className="input-wrap">
              <i className="fa-solid fa-lock input-icon" />
              <input
                className="form-control"
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="toggle-pass"
                aria-label="Toggle password visibility"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
              >
                <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
              </button>
            </div>
          </div>

          <button type="submit" className={`btn-primary${loading ? " loading" : ""}`} disabled={loading}>
            <div className="spinner" />
            <span className="btn-label">Sign In</span>
          </button>
        </form>
      </div>
    </div>
  );
}
