import { useState, type FormEvent } from "react";
import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { PLATFORM } from "../../config/platform";
import { login } from "../../services/auth";
import { errorMessage } from "./utils";
import "./admin.css";

/**
 * Real authentication gate. Replaces the hardcoded MOCK_ADMIN identity: the
 * browser holds nothing until the backend issues a bearer session.
 */
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
      // Success re-renders App past the gate via the auth store subscription.
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0c0f0a",
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 400,
          border: "1px solid #232a1e",
          borderRadius: 10,
          background: "#11150e",
          padding: "28px 26px",
          color: "#e8ecdf",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: PLATFORM.primary_color,
              color: "#0c0f0a",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            C
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em" }}>{PLATFORM.name} · OPERATIONS</div>
            <div style={{ fontSize: 10.5, color: "#9aa28d" }}>{PLATFORM.subtitle}</div>
          </div>
        </div>

        <p style={{ fontSize: 11.5, color: "#9aa28d", margin: "14px 0 18px" }}>
          <ShieldCheck size={12} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Sign in with a workspace account. Sessions are issued by the backend; nothing is
          trusted from the client.
        </p>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", fontSize: 9.5, letterSpacing: "0.12em", color: "#9aa28d", marginBottom: 6 }}>
            EMAIL
          </span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@core.local"
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #232a1e",
              borderRadius: 6,
              background: "#0c0f0a",
              color: "#e8ecdf",
              fontSize: 12.5,
              padding: "9px 11px",
            }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 9.5, letterSpacing: "0.12em", color: "#9aa28d", marginBottom: 6 }}>
            <KeyRound size={10} style={{ verticalAlign: "-1px", marginRight: 5 }} />
            PASSWORD
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #232a1e",
              borderRadius: 6,
              background: "#0c0f0a",
              color: "#e8ecdf",
              fontSize: 12.5,
              padding: "9px 11px",
            }}
          />
        </label>

        {error && (
          <div
            role="alert"
            style={{
              fontSize: 11.5,
              color: "#f0b9b9",
              background: "#2a1512",
              border: "1px solid #56241f",
              borderRadius: 6,
              padding: "8px 10px",
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: PLATFORM.primary_color,
            color: "#0c0f0a",
            border: "none",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          <LogIn size={13} />
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p style={{ fontSize: 10, color: "#6f7663", marginTop: 16, lineHeight: 1.5 }}>
          Seeded demo accounts (see README / SECURITY.md):
          <br />
          platform admin — <code>admin@core.local</code>
          <br />
          tenant admin — <code>admin@&lt;slug&gt;.example</code>
        </p>
      </form>
    </div>
  );
}
