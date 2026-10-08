import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";

export default function Lock({ onUnlock }: { onUnlock: () => void }) {
  const [hasUser, setHasUser] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.hasUser().then(setHasUser).catch((e) => setErr(String(e))); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (!hasUser) await api.register(email, pass);
      else await api.login(email, pass);
      onUnlock();
    } catch (x) {
      setErr(String(x));
    } finally {
      setBusy(false);
    }
  };

  if (hasUser === null) return <div className="lock" />;
  return (
    <div className="lock">
      <span className="ram ghost" />
      <form className="lock-card" onSubmit={submit}>
        <span className="label">{hasUser ? "bloqueado" : "primer inicio"}</span>
        <h1>{hasUser ? "Bienvenido de vuelta." : "Crea tu cuenta."}</h1>
        <p>{hasUser ? "Ingresa para abrir tus páginas." : "Solo tú la usarás. Tus datos quedan en este equipo."}</p>
        <label className="field">
          <span className="label">email</span>
          <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span className="label">contraseña</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required minLength={hasUser ? 1 : 6} />
        </label>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy}>{hasUser ? "Entrar" : "Crear cuenta"}</button>
      </form>
    </div>
  );
}
