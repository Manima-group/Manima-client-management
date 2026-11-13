import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { Empty, Field, Icon, Kpi, Loading, Modal, Pill, Progress, useAction, useLoad } from "../components/ui";
import { dayMonth, greeting, inr, label, longDate, shortDate, timeOf, todayIso, weekday } from "../format";
import type { Client, Dashboard } from "../types";

/* ---------- earnings period filter ---------- */
type PeriodId = "this_month" | "last_month" | "last_3_months" | "this_fy" | "last_fy" | "all" | "custom";
const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "this_fy", label: "This FY" },
  { id: "last_fy", label: "Last FY" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];
const PERIOD_KEY = "manima_dashboard_period";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Indian financial year runs 1 April – 31 March. */
function periodRange(id: PeriodId, custom: { start: string; end: string }): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const fyStart = m >= 3 ? y : y - 1;
  switch (id) {
    case "last_month": return { start: ymd(new Date(y, m - 1, 1)), end: ymd(new Date(y, m, 0)) };
    case "last_3_months": return { start: ymd(new Date(y, m - 2, 1)), end: todayIso() };
    case "this_fy": return { start: `${fyStart}-04-01`, end: todayIso() };
    case "last_fy": return { start: `${fyStart - 1}-04-01`, end: `${fyStart}-03-31` };
    case "all": return { start: "2000-01-01", end: todayIso() };
    case "custom": return { start: custom.start || todayIso(), end: custom.end || todayIso() };
    default: return { start: ymd(new Date(y, m, 1)), end: todayIso() };
  }
}

function periodLabel(id: PeriodId, r: { start: string; end: string }): string {
  if (id === "custom") return `${shortDate(r.start)} – ${shortDate(r.end)}`;
  if (id === "this_fy" || id === "last_fy") {
    const y = Number(r.start.slice(0, 4));
    return `${id === "this_fy" ? "This" : "Last"} FY ${y}-${String(y + 1).slice(2)}`;
  }
  return PERIODS.find((p) => p.id === id)!.label;
}

function loadPeriod(): { id: PeriodId; start: string; end: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(PERIOD_KEY) || "null");
    if (saved && PERIODS.some((p) => p.id === saved.id)) return saved;
  } catch { /* storage unavailable */ }
  return { id: "this_month", start: "", end: "" };
}

export default function DashboardPage() {
  const { user } = useApp();
  const [period, setPeriodState] = useState(loadPeriod);
  const setPeriod = (p: { id: PeriodId; start: string; end: string }) => {
    setPeriodState(p);
    try { localStorage.setItem(PERIOD_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  };
  const range = periodRange(period.id, period);
  const { data, reload } = useLoad(() => api.get<Dashboard>(`/dashboard?start=${range.start}&end=${range.end}`), [range.start, range.end]);
  const [q, setQ] = useState("");
  const [meeting, setMeeting] = useState(false);
  const nav = useNavigate();

  if (!data) return <Loading />;
  const k = data.kpis;
  const max = Math.max(1, ...data.revenue.flatMap((r) => [r.services, r.training]));
  const pLabel = periodLabel(period.id, range);
  const dense = data.revenue.length > 12;
  const barW = data.revenue.length > 12 ? 8 : data.revenue.length > 8 ? 12 : 18;
  const periodNote = k.collected
    ? `Services ${inr(k.period_services)} · Training ${inr(k.period_training)}`
    : "No payments received in this period";

  return (
    <>
      <div className="top">
        <div className="titles">
          <h1>{greeting()}, {user.name.split(" ")[0]}</h1>
          <p>{weekday(todayIso())}, {longDate(todayIso())} · Here's how Manima is doing.</p>
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

      <div className="card row" style={{ padding: "12px 16px", gap: 12 }}>
        <span className="small strong muted">Earnings period</span>
        <div className="tabs" role="tablist" aria-label="Earnings period">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={period.id === p.id} className={`tab${period.id === p.id ? " on" : ""}`}
              style={{ height: 36, padding: "0 14px", fontSize: 13 }}
              onClick={() => setPeriod({ ...period, id: p.id, ...(p.id === "custom" && !period.start ? periodRange("this_month", period) : {}) })}>
              {p.label}
            </button>
          ))}
        </div>
        {period.id === "custom" && (
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input type="date" className="input" aria-label="From" style={{ height: 36, width: 150 }} value={range.start} max={range.end}
              onChange={(e) => e.target.value && setPeriod({ ...period, start: e.target.value, end: range.end })} />
            <span className="muted">to</span>
            <input type="date" className="input" aria-label="To" style={{ height: 36, width: 150 }} value={range.end} min={range.start}
              onChange={(e) => e.target.value && setPeriod({ ...period, start: range.start, end: e.target.value })} />
          </div>
        )}
        <span className="spacer" />
        <span className="small muted">{range.start === "2000-01-01" ? `Up to ${shortDate(range.end)}` : `${shortDate(range.start)} – ${shortDate(range.end)}`}</span>
      </div>

      <div className="kpis">
        <Kpi highlight dot="#1F2A2E" label={`Earnings · ${pLabel}`} value={inr(k.collected)} note={periodNote} />
        <Kpi dot="var(--orange)" label="Total earnings" value={inr(k.total_earnings)}
          note={`All time · Services ${inr(k.total_services)} · Training ${inr(k.total_training)}`} />
        <Kpi dot="var(--pink)" label="Outstanding" value={inr(k.outstanding)}
          note={k.overdue_count ? <><span style={{ color: "var(--pink-ink)", fontWeight: 600 }}>{k.overdue_count} overdue</span> invoice{k.overdue_count === 1 ? "" : "s"}</> : "Nothing overdue"} />
        <Kpi dot="var(--orange)" label="Active projects" value={k.active_projects} note={`Across ${k.active_project_clients} client${k.active_project_clients === 1 ? "" : "s"}`} />
        <Kpi dot="var(--yellow)" label="Open pipeline" value={inr(k.pipeline)} note={`${k.pipeline_count} leads in progress`} />
        <Kpi dot="var(--muted)" label="Training days left" value={k.training_days_left} note={`${inr(k.training_due)} still to collect`} />
      </div>

      <div className="grid2">
        <section className="card">
          <h2>Revenue — services vs training<small>{pLabel}</small></h2>
          <div className="row small muted" style={{ marginTop: -8, marginBottom: 14 }}>
            <span>Received <b style={{ color: "var(--ink)" }}>{inr(k.collected)}</b></span>
            <span>·</span>
            <span>Invoiced <b style={{ color: "var(--ink)" }}>{inr(k.billed)}</b></span>
            <span>·</span>
            <span>{k.collected_count} payment{k.collected_count === 1 ? "" : "s"}</span>
          </div>
          <div className="chart" aria-label="Revenue chart" style={{ gap: dense ? 6 : 22 }}>
            {data.revenue.map((r) => (
              <div className="col" key={r.label} title={`${r.label}: services ${inr(r.services)}, training ${inr(r.training)}`} style={{ gap: dense ? 2 : 5 }}>
                <div className="bar" style={{ height: `${(r.services / max) * 92}%`, width: barW }} />
                <div className="bar t" style={{ height: `${(r.training / max) * 92}%`, width: barW }} />
              </div>
            ))}
          </div>
          <div className="chart-months" style={{ gap: dense ? 6 : 22, fontSize: dense ? 10.5 : 12 }}>
            {data.revenue.map((r, i) => <span key={r.label}>{!dense || i % 2 === data.revenue.length % 2 ? r.label : ""}</span>)}
          </div>
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

      <div className="grid2">
        <section className="card">
          <h2>Earnings by client<small>{pLabel}</small></h2>
          {data.top_clients.length === 0 ? <Empty>No payments received in this period.</Empty> : (
            <div className="stack" style={{ gap: 14 }}>
              {data.top_clients.map((c) => (
                <div key={c.name} className="ti">
                  <div className="s" style={{ fontSize: 14, color: "var(--ink)" }}>
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <b>{inr(c.amount)} <span className="muted" style={{ fontWeight: 500 }}>· {c.share}%</span></b>
                  </div>
                  <Progress value={c.share} yellow />
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <h2>Needs attention</h2>
          {data.attention.length === 0 && <Empty>All clear — nothing needs attention.</Empty>}
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
      </div>

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
