import { useEffect, useState, type FormEvent } from "react";
import { getAccessToken, login, setAccessToken, setTotpToken } from "../lib/authApi";
import xtendLogo from "../assets/xtend-logo.png";
import loginBackgroundVideo from "../assets/video/login-background.mp4";
import "./Login.css";

// Faithful React port of the original views/admin/login.ejs design — same
// markup/classes/copy, but interactivity (password visibility, loading,
// error) is driven by React state instead of direct DOM manipulation.
export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getAccessToken()) {
      window.location.replace("/admin/dashboard");
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setLoading(true);
    try {
      const result = await login(username.trim(), password);

      if (result.totpRequired && result.totpToken) {
        setTotpToken(result.totpToken);
        window.location.href = "/admin/totp";
        return;
      }

      if (result.accessToken) {
        setAccessToken(result.accessToken);
        window.location.href = "/admin/dashboard";
        return;
      }

      throw new Error("Login failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <video
        className="login-bg-video"
        src={loginBackgroundVideo}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      <div className="login-card">
        <div className="card-brand">
          <img className="wrike-logo" src={xtendLogo} alt="Xtend logo" />
          <span className="brand-sub">XPI &middot; Admin Portal</span>
        </div>

        <div className="card-title">Admin Sign In</div>
        <div className="card-sub">Enter your credentials to access the dashboard</div>

        <div className={`alert-error${error ? " show" : ""}`}>
          <i className="fa-solid fa-circle-exclamation" />
          <span>{error}</span>
        </div>

        <form autoComplete="off" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <div className="input-wrap">
              <div className="input-prefix">
                <i className="fa-solid fa-user" />
              </div>
              <input
                className="form-control"
                type="text"
                id="username"
                placeholder="your-username"
                required
                autoComplete="off"
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
              <div className="input-prefix">
                <i className="fa-solid fa-lock" />
              </div>
              <input
                className="form-control"
                type={showPassword ? "text" : "password"}
                id="password"
                placeholder="••••••••••"
                required
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="pw-toggle"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <i className={`fa-regular ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
              </button>
            </div>
          </div>

          <button type="submit" className={`btn-submit${loading ? " loading" : ""}`} disabled={loading}>
            <i className="fa-solid fa-arrow-right-to-bracket" />
            <span>Sign In</span>
          </button>
        </form>

        <div className="trust-row">
          <i className="fa-solid fa-shield-halved" style={{ color: "var(--success)", fontSize: 11 }} />
          <span>Secure connection</span>
          <span className="trust-dot" />
          <span>2FA enabled</span>
          <span className="trust-dot" />
          <span>Encrypted storage</span>
        </div>
      </div>
    </div>
  );
}
