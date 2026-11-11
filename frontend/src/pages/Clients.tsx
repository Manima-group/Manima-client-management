import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Empty, Field, Icon, Loading, Modal, PageHead, Pill, useAction, useLoad, useToast } from "../components/ui";
import { initials, inr, shortDate } from "../format";
import type { Client, ClientDetail } from "../types";

export default function Clients() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const { data: clients, reload } = useLoad(() => api.get<Client[]>("/clients"));
  const [edit, setEdit] = useState<Partial<Client> | null>(null);
  const nav = useNavigate();

  if (!clients) return <Loading />;
  const list = clients.filter((c) => !q || `${c.company} ${c.contact_name} ${c.city} ${c.industry}`.toLowerCase().includes(q.toLowerCase()));
  const selectedId = id ? Number(id) : list[0]?.id;

  return (
    <>
      <PageHead title="Clients" sub="One profile per client with their full history.">
        <button className="btn" onClick={() => setEdit({ company: "" })}>+ New client</button>
      </PageHead>
      <div className="split">
        <div className="left card" style={{ padding: 8 }}>
          <div className="search" style={{ width: "100%", height: 42, marginBottom: 6 }}>
            <Icon name="search" size={16} />
            <input aria-label="Search clients" placeholder="Search clients" value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} />
          </div>
          {list.length === 0 && <Empty>No clients match.</Empty>}
          {list.map((c) => (
            <button key={c.id} type="button" className={`list-btn${c.id === selectedId ? " on" : ""}`} onClick={() => nav(`/clients/${c.id}${q ? `?q=${encodeURIComponent(q)}` : ""}`)}>
              <span className="avatar sm">{initials(c.company)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block" }}>{c.company}</b>
                <span className="small muted">{[c.industry, c.city].filter(Boolean).join(" · ") || c.contact_name}</span>
              </span>
              <span className="small strong">{inr(c.billed)}</span>
            </button>
          ))}
        </div>
        <div className="right">
          {selectedId ? <ClientPanel key={selectedId} id={selectedId} onEdit={setEdit} onChanged={reload} /> : <Empty>Add your first client.</Empty>}
        </div>
      </div>
      {edit && <ClientModal client={edit} onClose={() => setEdit(null)} onSaved={(c) => { setEdit(null); reload(); nav(`/clients/${c.id}`); }} />}
    </>
  );
}

function ClientPanel({ id, onEdit, onChanged }: { id: number; onEdit: (c: Client) => void; onChanged: () => void }) {
  const { data: c, reload } = useLoad(() => api.get<ClientDetail>(`/clients/${id}`), [id]);
  const [tab, setTab] = useState("history");
  const toast = useToast();
  const { run } = useAction();
  const nav = useNavigate();
  if (!c) return <Loading />;
  const portalUrl = `${location.origin}/portal/${c.portal_token}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(portalUrl); toast("Portal link copied"); } catch { toast(portalUrl); }
  };
  const remove = async () => {
    if (!confirm(`Delete ${c.company}? Their quotations and invoices stay but lose the link.`)) return;
    if (await run(() => api.del(`/clients/${c.id}`).then(() => true), "Client deleted")) { onChanged(); nav("/clients"); }
  };
  const resetLink = async () => {
    if (await run(() => api.post(`/clients/${c.id}/portal-link`), "New portal link created")) reload();
  };

  const tabs: [string, string, number][] = [
    ["history", "History", c.history.length], ["quotations", "Quotations", c.quotations.length],
    ["invoices", "Invoices", c.invoices.length], ["projects", "Projects", c.projects.length],
    ["trainings", "Training", c.trainings.length],
  ];

  return (
    <section className="card stack" style={{ gap: 20 }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 240px" }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>{c.company}</h2>
          <div className="small muted" style={{ marginTop: 4 }}>{[c.contact_name, c.email, c.phone].filter(Boolean).join(" · ")}</div>
          {c.website && <div className="small muted">{c.website}</div>}
        </div>
        <div className="row">
          <button className="btn ghost sm" onClick={() => onEdit(c)}>Edit</button>
          <Link className="btn ghost sm" to={`/invoices?new=1&client=${c.id}`}>New invoice</Link>
          <Link className="btn sm" to={`/quotations/new?client=${c.id}`}>New quotation</Link>
        </div>
      </div>
      <div className="mini-stats">
        <div><span>Projects</span><b>{c.projects_count}</b></div>
        <div><span>Billed</span><b>{inr(c.billed)}</b></div>
        <div><span>Outstanding</span><b style={{ color: c.outstanding ? "var(--pink-ink)" : undefined }}>{inr(c.outstanding)}</b></div>
      </div>
      <div className="editor-block">
        <div className="row"><b className="small">Client portal</b><span className="spacer" /><Pill status={c.portal_enabled ? "active" : "cancelled"} text={c.portal_enabled ? "On" : "Off"} /></div>
        <div className="row">
          <input className="input" readOnly value={portalUrl} aria-label="Portal link" style={{ flex: 1, minWidth: 0 }} />
          <button className="btn ghost sm" onClick={copy}><Icon name="copy" size={15} />Copy</button>
          <a className="btn ghost sm" href={portalUrl} target="_blank" rel="noreferrer">Open</a>
          <button className="btn ghost sm" onClick={resetLink}>New link</button>
        </div>
        <span className="small muted">Share this link with the client to let them see progress, sign quotations and download invoices.</span>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l} · {n}</button>)}
      </div>
      {tab === "history" && (c.history.length ? c.history.map((h, i) => (
        <div key={i} className="row" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10, flexWrap: "nowrap" }}>
          <span className="small muted" style={{ width: 92, flexShrink: 0 }}>{shortDate(h.date)}</span>
          <span className="chip" style={{ flexShrink: 0 }}>{h.kind}</span>
          <span>{h.text}</span>
        </div>
      )) : <Empty>No activity yet.</Empty>)}
      {tab === "quotations" && <DocTable rows={c.quotations.map((q) => ({ key: q.id, a: q.number, b: q.project, s: q.status, amt: q.total, to: `/quotations/${q.id}` }))} />}
      {tab === "invoices" && <DocTable rows={c.invoices.map((i) => ({ key: i.id, a: i.number, b: shortDate(i.issue_date), s: i.effective_status, amt: i.total, to: `/invoices/${i.id}` }))} />}
      {tab === "projects" && <DocTable rows={c.projects.map((p) => ({ key: p.id, a: p.name, b: `${p.progress}% done`, s: p.status, amt: null, to: "/projects" }))} />}
      {tab === "trainings" && <DocTable rows={c.trainings.map((t) => ({ key: t.id, a: t.programme || t.name, b: `${t.days_done}/${t.days} days`, s: t.status, amt: t.fee, to: `/training?id=${t.id}` }))} />}
      {c.notes && <p className="small muted" style={{ whiteSpace: "pre-line" }}>{c.notes}</p>}
      <div><button className="btn danger sm" onClick={remove}>Delete client</button></div>
    </section>
  );
}

function DocTable({ rows }: { rows: { key: number; a: string; b: string; s: string; amt: number | null; to: string }[] }) {
  const nav = useNavigate();
  if (!rows.length) return <Empty>Nothing here yet.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="click" onClick={() => nav(r.to)}>
              <td><b>{r.a}</b></td><td className="muted">{r.b}</td><td><Pill status={r.s} /></td>
              <td className="r"><b>{r.amt === null ? "" : inr(r.amt)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClientModal({ client, onClose, onSaved }: { client: Partial<Client>; onClose: () => void; onSaved: (c: Client) => void }) {
  const [f, setF] = useState<Partial<Client>>(client);
  const { run, busy } = useAction();
  const set = (k: keyof Client) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const out = await run(() => (client.id ? api.put<Client>(`/clients/${client.id}`, f) : api.post<Client>("/clients", f)), "Client saved");
    if (out) onSaved(out);
  };
  return (
    <Modal title={client.id ? "Edit client" : "New client"} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !f.company} onClick={save}>Save client</button></>}>
      <div className="form-grid">
        <Field label="Company"><input value={f.company || ""} onChange={set("company")} /></Field>
        <Field label="Contact name"><input value={f.contact_name || ""} onChange={set("contact_name")} /></Field>
        <Field label="Email"><input type="email" value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="Phone"><input value={f.phone || ""} onChange={set("phone")} /></Field>
        <Field label="Website"><input value={f.website || ""} onChange={set("website")} /></Field>
        <Field label="Industry"><input value={f.industry || ""} onChange={set("industry")} /></Field>
        <Field label="City"><input value={f.city || ""} onChange={set("city")} /></Field>
        <Field label="Client GSTIN"><input value={f.gstin || ""} onChange={set("gstin")} /></Field>
        <Field label="Notes" wide><textarea rows={3} value={f.notes || ""} onChange={set("notes")} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.portal_enabled ?? true} onChange={(e) => setF({ ...f, portal_enabled: e.target.checked })} />Client portal on</label>
    </Modal>
  );
}
