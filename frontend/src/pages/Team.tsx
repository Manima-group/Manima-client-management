import { useState } from "react";
import { api } from "../api";
import { useApp } from "../App";
import { Empty, Field, Kpi, Loading, Modal, PageHead, useAction, useLoad } from "../components/ui";
import { initials, inr, shortDate, todayIso } from "../format";
import type { TeamMember } from "../types";

export default function Team() {
  const { user } = useApp();
  const { data, reload } = useLoad(() => api.get<TeamMember[]>("/team"));
  const [adding, setAdding] = useState(false);
  const [earn, setEarn] = useState<TeamMember | null>(null);
  const [history, setHistory] = useState<TeamMember | null>(null);
  const { run } = useAction();
  if (!data) return <Loading />;
  const owner = user.role === "owner";

  const settle = async (m: TeamMember) => {
    if (!confirm(`Record ${inr(m.owed)} paid to ${m.name}?`)) return;
    if (await run(() => api.post(`/team/${m.id}/entries`, { kind: "paid" }), `Recorded ${inr(m.owed)} payment to ${m.name}`)) reload();
  };

  return (
    <>
      <PageHead title="Team" sub="Who is working on what, and what you owe them.">
        {owner && <button className="btn" onClick={() => setAdding(true)}>+ Add team member</button>}
      </PageHead>
      <div className="kpis">
        <Kpi highlight dot="#1F2A2E" label="Owed to team" value={inr(data.reduce((a, m) => a + m.owed, 0))} />
        <Kpi dot="var(--orange)" label="Paid to team" value={inr(data.reduce((a, m) => a + m.paid, 0))} note="All time" />
        <Kpi dot="var(--muted)" label="Members" value={data.filter((m) => m.active).length} />
      </div>
      <section className="card">
        {data.length === 0 ? <Empty>No team members yet.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Member</th><th>Role</th><th>Projects</th><th className="r">Earned</th><th className="r">Paid</th><th className="r">Owed</th><th /></tr></thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id}>
                    <td><span className="row" style={{ flexWrap: "nowrap" }}><span className="avatar sm">{initials(m.name)}</span><span><b>{m.name}</b><br /><span className="small muted">{m.email}{m.has_login ? " · can sign in" : ""}</span></span></span></td>
                    <td className="muted">{m.role}</td>
                    <td className="small">{m.projects.join(", ") || "—"}</td>
                    <td className="r">{inr(m.earned)}</td>
                    <td className="r">{inr(m.paid)}</td>
                    <td className="r"><b style={{ color: m.owed ? "var(--orange-ink)" : undefined }}>{inr(m.owed)}</b></td>
                    <td className="r">
                      <span className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <button className="btn ghost sm" onClick={() => setHistory(m)}>History</button>
                        {owner && <button className="btn ghost sm" onClick={() => setEarn(m)}>Add earning</button>}
                        {owner && m.owed > 0 && <button className="btn sm" onClick={() => settle(m)}>Record payment</button>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {adding && <MemberModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {earn && <EarnModal m={earn} onClose={() => setEarn(null)} onSaved={() => { setEarn(null); reload(); }} />}
      {history && (
        <Modal title={`${history.name} — history`} onClose={() => setHistory(null)}>
          {history.entries.length === 0 && <Empty>No entries yet.</Empty>}
          {history.entries.map((e) => (
            <div key={e.id} className="row" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <span className="small muted" style={{ width: 92 }}>{shortDate(e.entry_date)}</span>
              <span className={`pill ${e.kind === "paid" ? "yellow" : "orange"}`}>{e.kind === "paid" ? "Paid" : "Earned"}</span>
              <span className="small">{e.note}</span>
              <span className="spacer" /><b>{inr(e.amount)}</b>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}

function MemberModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "", create_login: false, password: "" });
  const { run, busy } = useAction();
  const save = async () => { if (await run(() => api.post("/team", f), `${f.name} added`)) onSaved(); };
  return (
    <Modal title="Add team member" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !f.name} onClick={save}>Add member</button></>}>
      <div className="form-grid">
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Role"><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Developer, Designer, Trainer…" /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.create_login} onChange={(e) => setF({ ...f, create_login: e.target.checked })} />Let them sign in to Manima Hub</label>
      {f.create_login && <Field label="Temporary password (share it with them)"><input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>}
    </Modal>
  );
}

function EarnModal({ m, onClose, onSaved }: { m: TeamMember; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ amount: "", entry_date: todayIso(), note: "" });
  const { run, busy } = useAction();
  const save = async () => { if (await run(() => api.post(`/team/${m.id}/entries`, { kind: "earned", ...f, amount: Number(f.amount) }), "Earning added")) onSaved(); };
  return (
    <Modal title={`Add earning for ${m.name}`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !Number(f.amount)} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Amount (₹)"><input type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></Field>
        <Field label="For" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. HYDFIT checkout module" /></Field>
      </div>
    </Modal>
  );
}
