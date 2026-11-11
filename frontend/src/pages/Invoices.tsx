import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { Empty, Field, Icon, Kpi, Loading, Modal, PageHead, Pill, useAction, useLoad } from "../components/ui";
import { addDays, inr, shortDate, todayIso } from "../format";
import type { Client, Invoice, InvoiceItem, InvoiceSummary } from "../types";

const FILTERS = ["all", "sent", "overdue", "paid", "draft"];

export default function Invoices() {
  const { data, reload } = useLoad(() => api.get<InvoiceSummary[]>("/invoices"));
  const [filter, setFilter] = useState("all");
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState<number | null | undefined>(undefined);
  const nav = useNavigate();

  useEffect(() => {
    if (params.get("new")) {
      setCreating(params.get("client") ? Number(params.get("client")) : null);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  if (!data) return <Loading />;
  const list = data.filter((i) => filter === "all" || i.effective_status === filter);
  const total = (st: string[]) => data.filter((i) => st.includes(i.effective_status));

  return (
    <>
      <PageHead title="Invoices" sub="GST invoices and payment tracking.">
        <button className="btn" onClick={() => setCreating(null)}>+ New invoice</button>
      </PageHead>
      <div className="kpis">
        <Kpi highlight dot="#1F2A2E" label="Received" value={inr(data.reduce((a, i) => a + i.paid, 0))} note="All time" />
        <Kpi dot="var(--pink)" label="Outstanding" value={inr(total(["sent", "overdue"]).reduce((a, i) => a + i.balance, 0))} note={`${total(["sent", "overdue"]).length} unpaid`} />
        <Kpi dot="var(--pink)" label="Overdue" value={inr(total(["overdue"]).reduce((a, i) => a + i.balance, 0))} note={`${total(["overdue"]).length} invoices`} />
        <Kpi dot="var(--muted)" label="Drafts" value={total(["draft"]).length} />
      </div>
      <section className="card">
        <div className="tabs" style={{ marginBottom: 14 }}>
          {FILTERS.map((f) => <button key={f} className={`tab${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}</button>)}
        </div>
        {list.length === 0 ? <Empty>No invoices here.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Client</th><th>Type</th><th>Issued</th><th>Due</th><th>Status</th><th className="r">Total</th><th className="r">Balance</th></tr></thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} className="click" onClick={() => nav(`/invoices/${i.id}`)}>
                    <td><b>{i.number}</b></td>
                    <td>{i.client_name}</td>
                    <td className="muted">{i.kind === "training" ? "Training" : "Service"}</td>
                    <td className="muted">{shortDate(i.issue_date)}</td>
                    <td className="muted">{shortDate(i.due_date)}</td>
                    <td><Pill status={i.effective_status} /></td>
                    <td className="r"><b>{inr(i.total)}</b></td>
                    <td className="r">{i.balance ? inr(i.balance) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {creating !== undefined && (
        <InvoiceModal clientId={creating} onClose={() => setCreating(undefined)} onSaved={(inv) => { setCreating(undefined); reload(); nav(`/invoices/${inv.id}`); }} />
      )}
    </>
  );
}

export function InvoiceModal({ invoice, clientId, onClose, onSaved }: { invoice?: Invoice; clientId?: number | null; onClose: () => void; onSaved: (inv: Invoice) => void }) {
  const { settings } = useApp();
  const { data: clients } = useLoad(() => api.get<Client[]>("/clients"));
  const [f, setF] = useState({
    client_id: invoice?.client_id ?? clientId ?? null as number | null,
    bill_to: invoice?.bill_to ?? "",
    issue_date: invoice?.issue_date ?? todayIso(),
    due_date: invoice?.due_date ?? addDays(todayIso(), settings.invoice_due_days),
    gst_rate: String(invoice?.gst_rate ?? settings.default_gst_rate),
    status: invoice?.status ?? "sent",
    notes: invoice?.notes ?? "",
  });
  const [items, setItems] = useState<InvoiceItem[]>(invoice?.items ?? [{ title: "", description: "", unit: "Project", qty: 1, rate: 0 }]);
  const { run, busy } = useAction();
  const setItem = (i: number, p: Partial<InvoiceItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const sub = items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  const gst = (sub * (Number(f.gst_rate) || 0)) / 100;

  const save = async () => {
    const body = {
      ...f, client_id: f.client_id || null, gst_rate: Number(f.gst_rate) || 0,
      items: items.filter((it) => it.title.trim()).map((it) => ({ title: it.title, description: it.description, unit: it.unit, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0 })),
    };
    const out = await run(() => (invoice ? api.put<Invoice>(`/invoices/${invoice.id}`, body) : api.post<Invoice>("/invoices", body)), "Invoice saved");
    if (out) onSaved(out);
  };

  return (
    <Modal wide title={invoice ? `Edit ${invoice.number}` : "New invoice"} onClose={onClose}
      footer={<><span className="strong" style={{ marginRight: "auto" }}>Total {inr(sub + gst)}</span><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || (!f.client_id && !f.bill_to)} onClick={save}>Save invoice</button></>}>
      <div className="form-grid">
        <Field label="Client">
          <select value={f.client_id ?? ""} onChange={(e) => setF({ ...f, client_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— Not a saved client —</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </select>
        </Field>
        <Field label="Bill to (if not a saved client)"><input value={f.bill_to} onChange={(e) => setF({ ...f, bill_to: e.target.value })} /></Field>
        <Field label="Issue date"><input type="date" value={f.issue_date} onChange={(e) => setF({ ...f, issue_date: e.target.value })} /></Field>
        <Field label="Due date"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        <Field label="GST rate (%)"><input type="number" min={0} value={f.gst_rate} onChange={(e) => setF({ ...f, gst_rate: e.target.value })} /></Field>
        <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="draft">Draft</option><option value="sent">Sent</option><option value="cancelled">Cancelled</option></select></Field>
        <Field label="Note on invoice" wide><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. As per quotation MNM/2026/003" /></Field>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <b>Items</b>
        {items.map((it, i) => (
          <div key={i} className="editor-block">
            <div className="form-grid" style={{ gridTemplateColumns: "minmax(0,2fr) repeat(3, minmax(0,1fr)) auto", alignItems: "end" }}>
              <Field label="Item"><input value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} /></Field>
              <Field label="Unit"><input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></Field>
              <Field label="Qty"><input type="number" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value as unknown as number })} /></Field>
              <Field label="Rate (₹)"><input type="number" value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value as unknown as number })} /></Field>
              <button className="btn danger sm" style={{ height: 42 }} aria-label="Remove item" onClick={() => setItems(items.filter((_, j) => j !== i))}><Icon name="trash" size={15} /></button>
            </div>
            <Field label="Description"><input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></Field>
          </div>
        ))}
        <button className="btn ghost" style={{ borderStyle: "dashed" }} onClick={() => setItems([...items, { title: "", description: "", unit: "Project", qty: 1, rate: 0 }])}>+ Add item</button>
        <div className="small muted">Subtotal {inr(sub)} · GST {inr(gst)}</div>
      </div>
    </Modal>
  );
}
