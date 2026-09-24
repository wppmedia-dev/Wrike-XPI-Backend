import { useEffect, useRef, useState, type FormEvent } from "react";
import { clearTotpToken, getTotpToken, setAccessToken, verifyTotp } from "../lib/authApi";
import xtendLogo from "../assets/xtend-logo.png";
import "./AdminTotp.css";

// Faithful React port of views/admin/totp.ejs — same markup/CSS/copy;
// numeric filtering, auto-submit-on-6-digits, and session-guard are all
// state/effect driven instead of manual DOM event wiring.
export default function AdminTotp() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!getTotpToken()) {
      window.location.href = "/admin/login";
      return;
    }
    inputRef.current?.focus();
  }, []);

  const submit = async (totpCode: string) => {
    if (submittingRef.current) return;

    setError(null);

    if (!/^\d{6}$/.test(totpCode)) {
      setError("Please enter a valid 6-digit code.");
      return;
    }

    const totpToken = getTotpToken();
    if (!totpToken) {
      setError("Session expired. Please login again.");
      window.location.href = "/admin/login";
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      const accessToken = await verifyTotp(totpToken, totpCode);
      setAccessToken(accessToken);
      clearTotpToken();
      window.location.href = "/admin/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "TOTP verification failed");
      setLoading(false);
      submittingRef.current = false;
      setCode("");
      inputRef.current?.focus();
    }
  };

  const handleChange = (value: string) => {
    const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 6);
    setCode(digitsOnly);
    if (digitsOnly.length === 6) {
      submit(digitsOnly);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(code);
  };

  const handleBack = () => {
    clearTotpToken();
    window.location.href = "/admin/login";
  };

  return (
    <div className="totp-page">
      <div className="totp-card">
        <div className="card-brand">
          <img className="wrike-logo" src={xtendLogo} alt="Xtend logo" />
          <span className="brand-sub">XPI &middot; Admin Portal</span>
        </div>

        <div className="shield-icon">
          <i className="fa-solid fa-shield-halved" />
        </div>
        <div className="card-title">Two-Factor Auth</div>
        <div className="card-sub">Enter the 6-digit code from your authenticator app</div>

        <div className={`alert-error${error ? " show" : ""}`}>
          <i className="fa-solid fa-circle-exclamation" />
          <span>{error}</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="totpCode">
              Authentication Code
            </label>
            <input
              ref={inputRef}
              className="otp-input"
              type="text"
              id="totpCode"
              name="totpCode"
              placeholder="••••••"
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => handleChange(e.target.value)}
            />
          </div>

          <button type="submit" className={`btn-verify${loading ? " loading" : ""}`} disabled={loading}>
            <i className="fa-solid fa-check" />
            <span>Verify Code</span>
          </button>

          <button type="button" className="btn-back" onClick={handleBack}>
            <i className="fa-solid fa-arrow-left" style={{ fontSize: 11 }} />
            Back to Login
          </button>
        </form>

        <div className="info-row">
          Open Google Authenticator, Authy, or Microsoft Authenticator
          <br />
          and enter the 6-digit code shown for this account.
        </div>
      </div>
    </div>
  );
}
