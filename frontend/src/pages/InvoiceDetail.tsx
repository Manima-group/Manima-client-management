import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { InvoiceDocument } from "../components/Documents";
import FitPreview from "../components/FitPreview";
import { Field, Icon, Loading, Pill, useAction, useLoad } from "../components/ui";
import { inr, shortDate, todayIso } from "../format";
import type { Invoice } from "../types";
import { InvoiceModal } from "./Invoices";

export default function InvoiceDetail() {
  const { id } = useParams();
  const { settings } = useApp();
  const { data: inv, setData, reload } = useLoad(() => api.get<Invoice>(`/invoices/${id}`), [id]);
  const [pay, setPay] = useState({ amount: "", paid_on: todayIso(), method: "Bank transfer", note: "" });
  const [editing, setEditing] = useState(false);
  const { run, busy } = useAction();
  const nav = useNavigate();
  if (!inv) return <Loading />;

  const record = async (full: boolean) => {
    const body = { ...pay, amount: full ? null : Number(pay.amount) || null };
    const out = await run(() => api.post<Invoice>(`/invoices/${inv.id}/payments`, body), "Payment recorded");
    if (out) { setData(out); setPay({ ...pay, amount: "", note: "" }); }
  };
  const removePayment = async (pid: number) => {
    if (!confirm("Remove this payment?")) return;
    const out = await run(() => api.del(`/invoices/${inv.id}/payments/${pid}`).then(() => api.get<Invoice>(`/invoices/${inv.id}`)));
    if (out) setData(out);
  };
  const setStatus = async (status: string) => {
    const out = await run(() => api.put<Invoice>(`/invoices/${inv.id}`, { status }), "Invoice updated");
    if (out) setData(out);
  };
  const remove = async () => {
    if (!confirm(`Delete ${inv.number}?`)) return;
    if (await run(() => api.del(`/invoices/${inv.id}`).then(() => true), "Invoice deleted")) nav("/invoices");
  };

  return (
    <>
      <div className="top">
        <div className="titles">
          <div className="row"><h1>{inv.number}</h1><Pill status={inv.effective_status} /></div>
          <p>{inv.client_name} · issued {shortDate(inv.issue_date)} · due {shortDate(inv.due_date)}</p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => window.open(`/print/invoice/${inv.id}`, "_blank")}>Download PDF</button>
          <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
          {inv.status === "draft" && <button className="btn" onClick={() => setStatus("sent")}>Mark as sent</button>}
        </div>
      </div>
      <div className="split">
        <div className="left stack" style={{ flexBasis: 340 }}>
          <section className="card stack" style={{ gap: 12 }}>
            <div className="mini-stats">
              <div><span>Total</span><b>{inr(inv.total)}</b></div>
              <div><span>Received</span><b>{inr(inv.paid)}</b></div>
              <div><span>Balance</span><b style={{ color: inv.balance ? "var(--pink-ink)" : undefined }}>{inr(inv.balance)}</b></div>
            </div>
            {inv.client_id && <Link className="small" to={`/clients/${inv.client_id}`}>Open client</Link>}
            {inv.quotation_id && <Link className="small" to={`/quotations/${inv.quotation_id}`}>Open quotation</Link>}
            {inv.training_id && <Link className="small" to={`/training?id=${inv.training_id}`}>Open training</Link>}
          </section>
          {inv.balance > 0 && inv.status !== "cancelled" && (
            <section className="card stack" style={{ gap: 12 }}>
              <span className="section-title">Record a payment</span>
              <div className="form-grid">
                <Field label="Amount (₹)"><input type="number" min={0} placeholder={String(Math.round(inv.balance))} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
                <Field label="Date"><input type="date" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} /></Field>
                <Field label="Method"><select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option>Bank transfer</option><option>UPI</option><option>Cheque</option><option>Cash</option><option>Card</option></select></Field>
                <Field label="Note"><input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Reference no." /></Field>
              </div>
              <div className="row">
                <button className="btn ghost" disabled={busy || !pay.amount} onClick={() => record(false)}>Record amount</button>
                <button className="btn" disabled={busy} onClick={() => record(true)}>Mark fully paid</button>
              </div>
            </section>
          )}
          <section className="card stack" style={{ gap: 8 }}>
            <span className="section-title">Payments</span>
            {inv.payments.length === 0 && <span className="muted small">No payments yet.</span>}
            {inv.payments.map((p) => (
              <div key={p.id} className="row" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <span className="small muted" style={{ width: 92 }}>{shortDate(p.paid_on)}</span>
                <span className="small">{p.method}{p.note ? ` · ${p.note}` : ""}</span>
                <span className="spacer" /><b>{inr(p.amount)}</b>
                <button className="icon-btn" aria-label="Remove payment" onClick={() => removePayment(p.id)}><Icon name="trash" size={15} /></button>
              </div>
            ))}
          </section>
          <section className="card row">
            {inv.status !== "cancelled" ? <button className="btn ghost sm" onClick={() => setStatus("cancelled")}>Cancel invoice</button> : <button className="btn ghost sm" onClick={() => setStatus("sent")}>Restore</button>}
            <span className="spacer" />
            <button className="btn danger sm" onClick={remove}>Delete</button>
          </section>
        </div>
        <div className="right">
          <FitPreview><InvoiceDocument inv={inv} company={settings} /></FitPreview>
        </div>
      </div>
      {editing && <InvoiceModal invoice={inv} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </>
  );
}
