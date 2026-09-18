/* Throwaway probe: renders the real activity-table markup (same classes, same
   row animation, same card and scroll wrapper) so the InfoTip can be driven in
   a browser without an admin session. Delete after use. */
import { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import "./pages/AdminDashboard.css";
import "./pages/EnvironmentAccess.css";
import "./pages/ActivityLog.css";
import { InfoTip } from "./components/ui/InfoTip";

const NOTE =
  "No caller was identified: the request's token was rejected before anything could be attributed, so this row is a rejected call rather than an anonymous one.";

const rows = [
  { id: 1, allowed: false, email: null, note: NOTE },
  { id: 2, allowed: true, email: "someone@wppmedia.com", note: NOTE },
  { id: 3, allowed: false, email: null, note: "Short note." },
  { id: 4, allowed: false, email: null, note: NOTE },
  { id: 5, allowed: true, email: "other@wppmedia.com", note: NOTE },
];

function App() {
  const [rowClicks, setRowClicks] = useState<number[]>([]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 8, fontSize: 20 }}>InfoTip probe</h1>
      <p style={{ marginBottom: 16, fontSize: 13 }}>
        Row clicks fired: <b data-testid="row-clicks">{rowClicks.length}</b>{" "}
        {rowClicks.join(", ")}
      </p>

      <div className="ea-table-card">
        <div className="ea-scroll">
          <table className="al-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Caller</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={`al-row-in al-row-clickable ${row.allowed ? "al-row-allowed" : "al-row-denied"}`}
                  style={{ "--row-index": Math.min(i, 12) } as CSSProperties}
                  title="View call details"
                  tabIndex={0}
                  onClick={() => setRowClicks((was) => [...was, row.id])}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setRowClicks((was) => [...was, row.id]);
                    }
                  }}
                >
                  <td className="al-time">Sep 18, 14:20:11</td>
                  <td className="al-caller">
                    {row.email || (
                      <span className="al-unresolved">
                        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                        Unresolved
                        <InfoTip text={row.note} label="Why is this row unresolved?" />
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="al-result">
                      <span
                        className={`al-result-icon ${row.allowed ? "al-result-allow" : "al-result-deny"}`}
                      >
                        <i
                          className={`fa-solid ${row.allowed ? "fa-check" : "fa-xmark"}`}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="al-result-text">
                        {row.allowed ? "Allowed" : "Denied"}
                        <span className="al-status">401</span>
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tall filler so a row can be pushed near the bottom of the viewport,
            which is where the tip has to flip above the icon. */}
        <div style={{ height: 400 }} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
