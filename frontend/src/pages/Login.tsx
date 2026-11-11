import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { Field } from "../components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const out = await api.post<{ token: string }>("/auth/login", { email, password });
      setToken(out.token);
      nav(loc.state?.from || "/", { replace: true });
      location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="brand">
          <div className="logo"><img src="/manima-logo.png" alt="" /></div>
          <div><b>Manima Hub</b><span>Client workspace</span></div>
        </div>
        <h1 style={{ fontSize: 24 }}>Sign in</h1>
        <Field label="Email"><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn block" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
