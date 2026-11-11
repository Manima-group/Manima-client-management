import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { Empty, Field, Icon, Kpi, Loading, Modal, Pill, Progress, useAction, useLoad } from "../components/ui";
import { dayMonth, greeting, inr, label, longDate, timeOf, todayIso, weekday } from "../format";
import type { Client, Dashboard } from "../types";

export default function DashboardPage() {
  const { user } = useApp();
  const { data, reload } = useLoad(() => api.get<Dashboard>("/dashboard"));
  const [q, setQ] = useState("");
  const [meeting, setMeeting] = useState(false);
  const nav = useNavigate();

  if (!data) return <Loading />;
  const k = data.kpis;
  const max = Math.max(1, ...data.revenue.flatMap((r) => [r.services, r.training]));

  return (
    <>
      <div className="top">
        <div className="titles">
          <h1>{greeting()}, {user.name.split(" ")[0]}</h1>
          <p>{weekday(todayIso())}, {longDate(todayIso())} · Here's how Manima is doing this month.</p>
        </div>
        <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); nav(`/clients?q=${encodeURIComponent(q)}`); }}>
          <Icon name="search" size={16} />
          <input aria-label="Search clients" placeholder="Search clients, invoices, colleges" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="actions">
          <Link className="btn pink" to="/leads?new=1">+ New lead</Link>
          <Link className="btn" to="/quotations/new">+ New quotation</Link>
        </div>
      </div>

      <div className="kpis">
        <Kpi highlight dot="#1F2A2E" label="Collected this month" value={inr(k.collected)} note={`From ${k.collected_count} payment${k.collected_count === 1 ? "" : "s"}`} />
        <Kpi dot="var(--pink)" label="Outstanding" value={inr(k.outstanding)}
          note={k.overdue_count ? <><span style={{ color: "var(--pink-ink)", fontWeight: 600 }}>{k.overdue_count} overdue</span> invoice{k.overdue_count === 1 ? "" : "s"}</> : "Nothing overdue"} />
        <Kpi dot="var(--orange)" label="Active projects" value={k.active_projects} note={`Across ${k.active_project_clients} client${k.active_project_clients === 1 ? "" : "s"}`} />
        <Kpi dot="var(--yellow)" label="Open pipeline" value={inr(k.pipeline)} note={`${k.pipeline_count} leads in progress`} />
        <Kpi dot="var(--muted)" label="Training days left" value={k.training_days_left} note={`${inr(k.training_due)} still to collect`} />
      </div>

      <div className="grid2">
        <section className="card">
          <h2>Revenue — services vs training<small>Last 6 months</small></h2>
          <div className="chart" aria-label="Revenue chart">
            {data.revenue.map((r) => (
              <div className="col" key={r.label} title={`${r.label}: services ${inr(r.services)}, training ${inr(r.training)}`}>
                <div className="bar" style={{ height: `${(r.services / max) * 92}%` }} />
                <div className="bar t" style={{ height: `${(r.training / max) * 92}%` }} />
              </div>
            ))}
          </div>
          <div className="chart-months">{data.revenue.map((r) => <span key={r.label}>{r.label}</span>)}</div>
          <div className="legend">
            <span><i style={{ background: "var(--yellow-strong)" }} />Client services</span>
            <span><i style={{ background: "var(--pink)" }} />College &amp; corporate training</span>
          </div>
        </section>

        <section className="card">
          <h2>Training in progress<Link className="link-btn" to="/training" style={{ marginLeft: "auto" }}>Colleges · Corporate</Link></h2>
          <div className="stack" style={{ gap: 14 }}>
            {data.trainings.length === 0 && <Empty>No trainings yet.</Empty>}
            {data.trainings.map((t) => (
              <Link key={t.id} to={`/training?id=${t.id}`} className="ti" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="h">{t.name} <Pill status={t.status} /></div>
                <div className="s">
                  <span>{t.programme}{t.timing ? ` · ${t.timing}` : ""}</span>
                  <b>{t.status === "proposal" ? inr(t.fee) : `${t.days_done} / ${t.days} days${t.days_left ? ` · ${t.days_left} left` : ""}`}</b>
                </div>
                <Progress value={(100 * t.days_done) / t.days} yellow={t.status === "proposal"} />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="grid2">
        <section className="card">
          <h2>Recent quotations &amp; invoices<Link className="link-btn" to="/invoices" style={{ marginLeft: "auto" }}>View all</Link></h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Number</th><th>Client</th><th>Status</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {data.documents.map((d) => (
                  <tr key={d.type + d.id} className="click" onClick={() => nav(d.type === "quotation" ? `/quotations/${d.id}` : `/invoices/${d.id}`)}>
                    <td><b>{d.number}</b></td>
                    <td>{d.client}</td>
                    <td><Pill status={d.type === "quotation" && d.status === "sent" ? "quote sent" : d.status} text={d.type === "quotation" && d.status === "sent" ? "Quote sent" : label(d.status)} /></td>
                    <td className="r"><b>{inr(d.amount)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2>Upcoming<button type="button" className="link-btn" style={{ marginLeft: "auto" }} onClick={() => setMeeting(true)}>+ Add meeting</button></h2>
          {data.upcoming.length === 0 && <Empty>Nothing scheduled in the next 3 weeks.</Empty>}
          {data.upcoming.map((u, i) => {
            const dm = dayMonth(u.at);
            return (
              <div className="meet" key={i}>
                <div className="date-tile"><span>{dm.mon}</span><b>{dm.day}</b></div>
                <div>
                  <div className="t">{u.title}</div>
                  <div className="w">{[weekday(u.at), timeOf(u.at), u.where].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {data.attention.length > 0 && (
        <section className="card">
          <h2>Needs attention</h2>
          <div className="stack" style={{ gap: 8 }}>
            {data.attention.map((a, i) => (
              <Link key={i} to={a.link} className="attn">
                <span className={`pill ${a.tone}`}>{a.tag}</span>
                <span className="text">{a.text}</span>
                <span className="small muted">Open</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {meeting && <MeetingModal onClose={() => setMeeting(false)} onSaved={() => { setMeeting(false); reload(); }} />}
    </>
  );
}

function MeetingModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: clients } = useLoad(() => api.get<Client[]>("/clients"));
  const [f, setF] = useState({ title: "", date: todayIso(), time: "11:00", location: "Google Meet", client_id: "" });
  const { run, busy } = useAction();
  const save = async () => {
    const out = await run(() => api.post("/meetings", {
      title: f.title, starts_at: `${f.date}T${f.time}:00`, location: f.location,
      client_id: f.client_id ? Number(f.client_id) : null,
    }), "Meeting added");
    if (out) onSaved();
  };
  return (
    <Modal title="Add meeting" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !f.title} onClick={save}>Save meeting</button></>}>
      <div className="form-grid">
        <Field label="Title" wide><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Proposal walkthrough" /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Time"><input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
        <Field label="Where"><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        <Field label="Client">
          <select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>
            <option value="">—</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
