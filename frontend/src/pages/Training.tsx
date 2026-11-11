import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Empty, Field, Icon, Kpi, Loading, Modal, PageHead, Pill, Progress, useAction, useLoad } from "../components/ui";
import { inr, label, shortDate, todayIso } from "../format";
import type { Invoice, Training, TrainingSession } from "../types";

const priceLabel = (t: Training) =>
  t.pricing_model === "per_head" ? `${inr(t.rate)} per ${t.kind === "college" ? "student" : "participant"}`
    : t.pricing_model === "per_day" ? `${inr(t.rate)} per day` : `${inr(t.rate)} fixed`;

export default function TrainingPage() {
  const { data, setData, reload } = useLoad(() => api.get<Training[]>("/trainings"));
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"college" | "corporate">("college");
  const [edit, setEdit] = useState<Partial<Training> | null>(null);
  const selectedParam = params.get("id") ? Number(params.get("id")) : null;

  useEffect(() => {
    if (data && selectedParam) {
      const t = data.find((x) => x.id === selectedParam);
      if (t) setTab(t.kind);
    }
  }, [data, selectedParam]);

  if (!data) return <Loading />;
  const live = data.filter((t) => !["proposal", "cancelled"].includes(t.status));
  const fee = live.reduce((a, t) => a + t.fee, 0);
  const paid = live.reduce((a, t) => a + t.paid, 0);
  const daysLeft = live.filter((t) => t.status !== "completed").reduce((a, t) => a + t.days_left, 0);
  const order: Record<string, number> = { ongoing: 0, confirmed: 1, proposal: 2, completed: 3, cancelled: 4 };
  const list = data.filter((t) => t.kind === tab).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
  const selected = list.find((t) => t.id === selectedParam) || list[0];
  const replace = (t: Training) => setData(data.map((x) => (x.id === t.id ? t : x)));

  return (
    <>
      <PageHead title="Training" sub="College tie-ups and corporate trainings — days, content and payments.">
        <button className="btn" onClick={() => setEdit(blank(tab))}>{tab === "college" ? "+ New college tie-up" : "+ New corporate training"}</button>
      </PageHead>
      <div className="kpis">
        <Kpi dot="var(--orange)" label="Colleges tied up" value={live.filter((t) => t.kind === "college").length}
          note={`${data.filter((t) => t.kind === "college" && t.status === "proposal").length} proposal pending`} />
        <Kpi dot="var(--pink)" label="Corporate trainings" value={live.filter((t) => t.kind === "corporate").length}
          note={`${data.filter((t) => t.kind === "corporate" && t.status === "proposal").length} proposal pending`} />
        <Kpi highlight dot="#1F2A2E" label="Training revenue" value={inr(fee)} note={`${inr(paid)} received · ${inr(fee - paid)} due`} />
        <Kpi dot="var(--muted)" label="Days left to teach" value={daysLeft} note="Across ongoing & confirmed" />
      </div>
      <div className="tabs">
        {(["college", "corporate"] as const).map((k) => (
          <button key={k} className={`tab${tab === k ? " on" : ""}`} onClick={() => { setTab(k); setParams({}); }}>
            {k === "college" ? "Colleges" : "Corporate"} · {data.filter((t) => t.kind === k).length}
          </button>
        ))}
      </div>
      <div className="split">
        <div className="left stack" style={{ gap: 10, flexBasis: 300 }}>
          {list.length === 0 && <Empty>Nothing here yet.</Empty>}
          {list.map((t) => (
            <button key={t.id} type="button" className={`select-card${selected?.id === t.id ? " on" : ""}`} onClick={() => setParams({ id: String(t.id) })}>
              <span className="row" style={{ width: "100%", flexWrap: "nowrap" }}><b style={{ flex: 1 }}>{t.name}</b><Pill status={t.status} /></span>
              <span className="small muted">{t.programme}</span>
              <span style={{ width: "100%" }}><Progress value={(100 * t.days_done) / t.days} yellow={t.status === "proposal"} /></span>
              <span className="row small muted" style={{ width: "100%" }}>{t.days_done} of {t.days} days · {t.days_left} left<span className="spacer" /><b style={{ color: "var(--ink)" }}>{inr(t.fee)}</b></span>
            </button>
          ))}
        </div>
        <div className="right">
          {selected ? <TrainingPanel key={selected.id} id={selected.id} onChange={replace} onEdit={setEdit} onDeleted={() => { setParams({}); reload(); }} /> : <Empty>Add a {tab === "college" ? "college" : "company"} to get started.</Empty>}
        </div>
      </div>
      {edit && <TrainingModal t={edit} onClose={() => setEdit(null)} onSaved={(t) => { setEdit(null); reload(); setTab(t.kind); setParams({ id: String(t.id) }); }} />}
    </>
  );
}

function blank(kind: "college" | "corporate"): Partial<Training> {
  return kind === "college"
    ? { kind, name: "", area: "", programme: "Python + AI tools bootcamp", topics: ["Python", "ChatGPT", "Claude"], days: 7, timing: "10:00 AM – 12:00 PM", people: 60, pricing_model: "per_head", rate: 600, status: "proposal" }
    : { kind, name: "", area: "", programme: "AI tools for teams", topics: ["ChatGPT", "n8n"], days: 2, timing: "10:00 AM – 1:00 PM", people: 20, pricing_model: "per_day", rate: 15000, status: "proposal" };
}

function TrainingPanel({ id, onChange, onEdit, onDeleted }: { id: number; onChange: (t: Training) => void; onEdit: (t: Training) => void; onDeleted: () => void }) {
  const { data: t, setData } = useLoad(() => api.get<Training>(`/trainings/${id}`), [id]);
  const [paying, setPaying] = useState(false);
  const { run, busy } = useAction();
  const nav = useNavigate();
  if (!t) return <Loading />;
  const update = (out?: Training) => { if (out) { setData(out); onChange(out); } };
  const live = !["proposal", "cancelled"].includes(t.status);

  const confirmTieUp = async () => update(await run(() => api.put<Training>(`/trainings/${t.id}`, { status: "confirmed" }), `${t.name} confirmed`));
  const teach = async () => update(await run(() => api.post<Training>(`/trainings/${t.id}/teach-next`), `Day ${t.days_done + 1} taught · ${t.days_left - 1} days left`));
  const invoice = async () => {
    const inv = await run(() => api.post<Invoice>(`/trainings/${t.id}/invoice`), "GST invoice raised");
    if (inv) nav(`/invoices/${inv.id}`);
  };
  const setSession = async (s: TrainingSession, p: Partial<TrainingSession>) => update(await run(() => api.put<Training>(`/trainings/${t.id}/sessions/${s.id}`, p)));
  const removePayment = async (pid: number) => {
    if (!confirm("Remove this payment?")) return;
    update(await run(() => api.del(`/trainings/${t.id}/payments/${pid}`).then(() => api.get<Training>(`/trainings/${t.id}`))));
  };
  const remove = async () => {
    if (!confirm(`Delete ${t.name}?`)) return;
    if (await run(() => api.del(`/trainings/${t.id}`).then(() => true), "Training deleted")) onDeleted();
  };

  return (
    <section className="card stack" style={{ gap: 20 }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 240px" }}>
          <div className="small muted strong">{t.kind === "college" ? "COLLEGE" : "CORPORATE"} · {[t.area, t.contact_name, t.contact_phone].filter(Boolean).join(" · ")}</div>
          <h2 style={{ margin: "4px 0", fontSize: 22 }}>{t.name}</h2>
          <div>{t.programme}</div>
        </div>
        <Pill status={t.status} />
        <button className="btn ghost sm" onClick={() => onEdit(t)}>Edit</button>
      </div>
      {t.topics.length > 0 && <div className="row">{t.topics.map((x) => <span key={x} className="chip">{x}</span>)}</div>}
      <div className="mini-stats">
        <div><span>Start date</span><b>{t.start_date ? shortDate(t.start_date) : "To be fixed"}</b></div>
        <div><span>Timing</span><b>{t.timing || "To be fixed"}</b></div>
        <div><span>Trainees</span><b>{t.people} {t.kind === "college" ? "students" : "employees"}</b></div>
        <div><span>Pricing</span><b>{priceLabel(t)}</b></div>
      </div>
      <div className="split" style={{ gap: 12 }}>
        <div className="editor-block" style={{ flex: "1 1 240px", background: "#fff" }}>
          <span className="small strong muted">Teaching days</span>
          <div className="row" style={{ alignItems: "baseline" }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{t.days_done} / {t.days}</span><span className="muted">taught</span>
            <span className="spacer" /><b style={{ color: "var(--orange-ink)" }}>{t.days_left} days left</b>
          </div>
          <Progress value={(100 * t.days_done) / t.days} />
          {t.next_topic !== null && live && <span className="small muted">Next: Day {t.days_done + 1}{t.next_topic ? ` — ${t.next_topic}` : ""}</span>}
        </div>
        <div className="editor-block" style={{ flex: "1 1 240px", background: "#fff" }}>
          <span className="small strong muted">Payment</span>
          <div className="row" style={{ alignItems: "baseline" }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{inr(t.fee)}</span>
            <span className="spacer" /><b style={{ color: t.balance ? "var(--pink-ink)" : "var(--yellow-ink)" }}>{t.balance ? `${inr(t.balance)} due` : "Fully paid"}</b>
          </div>
          <Progress value={t.fee ? (100 * t.paid) / t.fee : 0} yellow />
          <span className="small muted">{inr(t.paid)} received · {inr(t.invoiced)} invoiced</span>
        </div>
      </div>
      <div className="row">
        {t.status === "proposal" && <button className="btn orange" disabled={busy} onClick={confirmTieUp}>Mark tie-up confirmed</button>}
        {live && t.days_left > 0 && <button className="btn" disabled={busy} onClick={teach}>Mark today's session taught</button>}
        {live && t.balance > 0 && <button className="btn ghost" disabled={busy} onClick={() => setPaying(true)}>Record payment</button>}
        {live && t.uninvoiced > 0 && <button className="btn ghost" disabled={busy} onClick={invoice}>Raise GST invoice</button>}
        {t.invoiced > 0 && t.uninvoiced <= 0 && <span className="pill yellow">Invoiced</span>}
      </div>

      <div className="stack" style={{ gap: 0 }}>
        <h3>Session plan — what we teach each day</h3>
        {t.sessions?.map((s) => (
          <div key={s.id} className="row" style={{ flexWrap: "nowrap", borderBottom: "1px solid var(--line)", padding: "6px 0" }}>
            <input type="checkbox" aria-label={`Day ${s.day_no} taught`} checked={s.done} disabled={!live && !s.done} onChange={(e) => setSession(s, { done: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--orange-deep)" }} />
            <span className="small strong muted" style={{ width: 52, flexShrink: 0 }}>Day {s.day_no}</span>
            <SessionTopic s={s} onSave={(topic) => setSession(s, { topic })} />
            <input type="date" className="input" aria-label={`Day ${s.day_no} date`} style={{ width: 150, height: 36 }} value={s.session_date || ""} onChange={(e) => setSession(s, { session_date: e.target.value || null })} />
            {s.done ? <span className="small strong" style={{ color: "var(--yellow-ink)", width: 46 }}>Taught</span>
              : live && s.day_no === t.days_done + 1 ? <span className="pill orange">Next</span> : <span style={{ width: 46 }} />}
          </div>
        ))}
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <h3>Payments received</h3>
        {(t.payments || []).length === 0 && <span className="small muted">No payments yet.</span>}
        {t.payments?.map((p) => (
          <div key={p.id} className="row" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
            <span className="small muted" style={{ width: 92 }}>{shortDate(p.paid_on)}</span>
            <span className="small">{p.method}{p.note ? ` · ${p.note}` : ""}</span>
            <span className="spacer" /><b>{inr(p.amount)}</b>
            <button className="icon-btn" aria-label="Remove payment" onClick={() => removePayment(p.id)}><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
      {t.notes && <p className="small muted" style={{ whiteSpace: "pre-line", margin: 0 }}>{t.notes}</p>}
      <div><button className="btn danger sm" onClick={remove}>Delete</button></div>
      {paying && <PaymentModal t={t} onClose={() => setPaying(false)} onSaved={(out) => { setPaying(false); update(out); }} />}
    </section>
  );
}

function SessionTopic({ s, onSave }: { s: TrainingSession; onSave: (topic: string) => void }) {
  const [v, setV] = useState(s.topic);
  useEffect(() => setV(s.topic), [s.topic]);
  return (
    <input className="input" aria-label={`Day ${s.day_no} topic`} value={v} placeholder="Topic for this day"
      onChange={(e) => setV(e.target.value)} onBlur={() => v !== s.topic && onSave(v)}
      style={{ height: 36, border: "1px solid transparent", background: "transparent", textDecoration: s.done && v ? "line-through" : "none", color: s.done ? "var(--muted)" : undefined }} />
  );
}

function PaymentModal({ t, onClose, onSaved }: { t: Training; onClose: () => void; onSaved: (t: Training) => void }) {
  const [f, setF] = useState({ amount: String(Math.round(t.balance)), paid_on: todayIso(), method: "Bank transfer", note: "" });
  const { run, busy } = useAction();
  const save = async () => {
    const out = await run(() => api.post<Training>(`/trainings/${t.id}/payments`, { ...f, amount: Number(f.amount) }), `Recorded ${inr(Number(f.amount))} from ${t.name}`);
    if (out) onSaved(out);
  };
  return (
    <Modal title={`Payment from ${t.name}`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !Number(f.amount)} onClick={save}>Record payment</button></>}>
      <div className="form-grid">
        <Field label={`Amount (₹) — ${inr(t.balance)} due`}><input type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Field>
        <Field label="Method"><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option>Bank transfer</option><option>UPI</option><option>Cheque</option><option>Cash</option></select></Field>
        <Field label="Note"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Instalment 1, cheque no…" /></Field>
      </div>
    </Modal>
  );
}

function TrainingModal({ t, onClose, onSaved }: { t: Partial<Training>; onClose: () => void; onSaved: (t: Training) => void }) {
  const [f, setF] = useState({
    kind: t.kind || "college", name: t.name || "", area: t.area || "", contact_name: t.contact_name || "",
    contact_phone: t.contact_phone || "", contact_email: t.contact_email || "", programme: t.programme || "",
    topics: (t.topics || []).join(", "), days: String(t.days ?? 7), timing: t.timing || "", start_date: t.start_date || "",
    people: String(t.people ?? 0), pricing_model: t.pricing_model || "per_head", rate: String(t.rate ?? 0),
    status: t.status || "proposal", notes: t.notes || "",
    session_topics: t.sessions ? t.sessions.map((s) => s.topic).join("\n") : "",
  });
  const { run, busy } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const fee = f.pricing_model === "per_head" ? Number(f.rate) * Number(f.people) : f.pricing_model === "per_day" ? Number(f.rate) * Number(f.days) : Number(f.rate);
  const save = async () => {
    const body = {
      ...f, topics: f.topics.split(",").map((x) => x.trim()).filter(Boolean), days: Math.max(1, Number(f.days) || 1),
      people: Number(f.people) || 0, rate: Number(f.rate) || 0, start_date: f.start_date || null,
      session_topics: f.session_topics ? f.session_topics.split("\n").map((x) => x.trim()) : undefined,
    };
    const out = await run(() => (t.id ? api.put<Training>(`/trainings/${t.id}`, body) : api.post<Training>("/trainings", body)), "Training saved");
    if (out) onSaved(out);
  };
  const isCollege = f.kind === "college";
  return (
    <Modal wide title={t.id ? `Edit ${t.name}` : isCollege ? "New college tie-up" : "New corporate training"} onClose={onClose}
      footer={<><span className="strong" style={{ marginRight: "auto" }}>Fee {inr(fee)}</span><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !f.name} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Type"><select value={f.kind} onChange={set("kind")}><option value="college">College</option><option value="corporate">Corporate</option></select></Field>
        <Field label={isCollege ? "College name" : "Company name"}><input value={f.name} onChange={set("name")} /></Field>
        <Field label={isCollege ? "Area" : "Team / department"}><input value={f.area} onChange={set("area")} /></Field>
        <Field label="Status"><select value={f.status} onChange={set("status")}>{["proposal", "confirmed", "ongoing", "completed", "cancelled"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
        <Field label="Contact person"><input value={f.contact_name} onChange={set("contact_name")} /></Field>
        <Field label="Contact phone"><input value={f.contact_phone} onChange={set("contact_phone")} /></Field>
        <Field label="Contact email"><input value={f.contact_email} onChange={set("contact_email")} /></Field>
        <Field label="Programme"><input value={f.programme} onChange={set("programme")} /></Field>
        <Field label="Tools / content (comma separated)" wide><input value={f.topics} onChange={set("topics")} placeholder="Python, ChatGPT, Claude, n8n, Lovable…" /></Field>
        <Field label="Number of days"><input type="number" min={1} value={f.days} onChange={set("days")} /></Field>
        <Field label="Timing"><input value={f.timing} onChange={set("timing")} placeholder="10:00 AM – 12:00 PM" /></Field>
        <Field label="Start date"><input type="date" value={f.start_date} onChange={set("start_date")} /></Field>
        <Field label={isCollege ? "Students" : "Participants"}><input type="number" min={0} value={f.people} onChange={set("people")} /></Field>
        <Field label="Pricing"><select value={f.pricing_model} onChange={set("pricing_model")}><option value="per_head">{isCollege ? "Per student" : "Per participant"}</option><option value="per_day">Per day</option><option value="fixed">Fixed fee</option></select></Field>
        <Field label="Price (₹)"><input type="number" min={0} value={f.rate} onChange={set("rate")} /></Field>
        <Field label="Day-by-day topics (one per line)" wide><textarea rows={5} value={f.session_topics} onChange={set("session_topics")} placeholder={"Python basics & setup\nData structures\n…"} /></Field>
        <Field label="Notes" wide><textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>
      </div>
    </Modal>
  );
}
