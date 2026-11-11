import { useState } from "react";
import { api } from "../api";
import { useApp } from "../App";
import { Field, Icon, PageHead, useAction } from "../components/ui";
import type { CompanySettings, Term } from "../types";

export default function Settings() {
  const { settings, refreshSettings, user } = useApp();
  const [f, setF] = useState<CompanySettings>(settings);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const { run, busy } = useAction();
  const owner = user.role === "owner";
  const set = (k: keyof CompanySettings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const setTerm = (i: number, p: Partial<Term>) => setF({ ...f, default_terms: f.default_terms.map((t, j) => (j === i ? { ...t, ...p } : t)) });

  const save = async () => {
    const body = { ...f, quotation_next: Number(f.quotation_next), invoice_next: Number(f.invoice_next), default_gst_rate: Number(f.default_gst_rate), invoice_due_days: Number(f.invoice_due_days) };
    if (await run(() => api.put("/settings", body), "Settings saved")) refreshSettings();
  };
  const changePw = async () => {
    if (await run(() => api.post("/auth/password", pw), "Password changed")) setPw({ current_password: "", new_password: "" });
  };

  return (
    <>
      <PageHead title="Settings" sub="Your details on every quotation and invoice.">
        {owner && <button className="btn" disabled={busy} onClick={save}>Save settings</button>}
      </PageHead>
      <div className="grid3">
        <section className="card stack" style={{ gap: 12 }}>
          <span className="section-title">Company</span>
          <div className="form-grid">
            <Field label="Brand (header)"><input value={f.brand_name} onChange={set("brand_name")} disabled={!owner} /></Field>
            <Field label="Company name"><input value={f.company_name} onChange={set("company_name")} disabled={!owner} /></Field>
            <Field label="Your name"><input value={f.owner_name} onChange={set("owner_name")} disabled={!owner} /></Field>
            <Field label="Website"><input value={f.website} onChange={set("website")} disabled={!owner} /></Field>
            <Field label="Email"><input value={f.email} onChange={set("email")} disabled={!owner} /></Field>
            <Field label="Phone"><input value={f.phone} onChange={set("phone")} disabled={!owner} /></Field>
            <Field label="LinkedIn"><input value={f.linkedin} onChange={set("linkedin")} disabled={!owner} /></Field>
            <Field label="GSTIN"><input value={f.gstin} onChange={set("gstin")} disabled={!owner} /></Field>
            <Field label="Address" wide><textarea rows={2} value={f.address} onChange={set("address")} disabled={!owner} /></Field>
            <Field label="Bank / UPI details (printed on invoices)" wide><textarea rows={3} value={f.bank_details} onChange={set("bank_details")} disabled={!owner} placeholder={"Bank: …\nA/c no: …\nIFSC: …\nUPI: …"} /></Field>
          </div>
        </section>
        <section className="card stack" style={{ gap: 12 }}>
          <span className="section-title">Numbering &amp; tax</span>
          <div className="form-grid">
            <Field label="Quotation prefix ({year} allowed)"><input value={f.quotation_prefix} onChange={set("quotation_prefix")} disabled={!owner} /></Field>
            <Field label="Next quotation no."><input type="number" min={1} value={f.quotation_next} onChange={set("quotation_next")} disabled={!owner} /></Field>
            <Field label="Invoice prefix"><input value={f.invoice_prefix} onChange={set("invoice_prefix")} disabled={!owner} /></Field>
            <Field label="Next invoice no."><input type="number" min={1} value={f.invoice_next} onChange={set("invoice_next")} disabled={!owner} /></Field>
            <Field label="Default GST (%)"><input type="number" min={0} value={f.default_gst_rate} onChange={set("default_gst_rate")} disabled={!owner} /></Field>
            <Field label="Invoice due in (days)"><input type="number" min={0} value={f.invoice_due_days} onChange={set("invoice_due_days")} disabled={!owner} /></Field>
          </div>
          <span className="section-title" style={{ marginTop: 8 }}>Change your password</span>
          <div className="form-grid">
            <Field label="Current password"><input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New password (6+ characters)"><input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          </div>
          <div><button className="btn ghost" disabled={busy || pw.new_password.length < 6 || !pw.current_password} onClick={changePw}>Change password</button></div>
        </section>
      </div>
      <section className="card stack" style={{ gap: 12 }}>
        <div className="row"><span className="section-title" style={{ flex: 1 }}>Default terms for new quotations</span><span className="small muted">Use {"{client}"} for the company name</span></div>
        {f.default_terms.map((t, i) => (
          <div key={i} className="editor-block">
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input type="checkbox" aria-label="Included by default" checked={t.included !== false} onChange={(e) => setTerm(i, { included: e.target.checked })} disabled={!owner} style={{ width: 18, height: 18, accentColor: "var(--orange-deep)" }} />
              <input className="input" aria-label="Term title" value={t.title} onChange={(e) => setTerm(i, { title: e.target.value })} disabled={!owner} style={{ fontWeight: 600, height: 38 }} />
              {owner && <button className="btn danger sm" aria-label="Delete term" onClick={() => setF({ ...f, default_terms: f.default_terms.filter((_, j) => j !== i) })}><Icon name="trash" size={15} /></button>}
            </div>
            {t.auto ? <span className="small muted">Written automatically from each quotation's payment schedule.</span>
              : <textarea className="input" rows={2} aria-label="Term text" value={t.text} onChange={(e) => setTerm(i, { text: e.target.value })} disabled={!owner} />}
          </div>
        ))}
        {owner && <button className="btn ghost" style={{ borderStyle: "dashed" }} onClick={() => setF({ ...f, default_terms: [...f.default_terms, { title: "New term", text: "", included: true, auto: false }] })}>+ Add term</button>}
      </section>
    </>
  );
}
