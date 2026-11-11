import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { QuotationDocument, quoteCalc } from "../components/Documents";
import FitPreview from "../components/FitPreview";
import { Empty, Field, Icon, Loading, Pill, useAction, useLoad } from "../components/ui";
import { inr } from "../format";
import type { Client, Invoice, PaymentStage, Project, Quotation, QuotationItem, Term } from "../types";

const UNITS = ["Project", "Fixed", "Per day", "Per hour", "Per month", "Per year", "Per user", "Per student", "Per session", "Per page", "Per unit", "As Applicable"];
const STATUSES = ["draft", "sent", "approved", "rejected", "invoiced"];

const PRESETS: Record<string, [string, number, string][]> = {
  "3 stages · 20 / 20 / 60": [
    ["Advance / Approval", 20, "Payable on approval of this quotation and the design/scope direction."],
    ["Work Completed", 20, "Payable on completion of the work, ready for client review."],
    ["Final Delivery & Go-Live", 60, "Payable on final delivery and go-live."],
  ],
  "2 stages · 50 / 50": [
    ["Advance", 50, "Payable on approval of this quotation."],
    ["Final Delivery", 50, "Payable on final delivery and handover."],
  ],
  "100% advance": [["Advance", 100, "Payable in full on approval of this quotation."]],
};

const n = (v: unknown) => { const x = parseFloat(String(v)); return isNaN(x) ? 0 : x; };

export default function QuotationEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { settings } = useApp();
  const [q, setQ] = useState<Quotation | null>(null);
  const [dirty, setDirty] = useState(false);
  const { data: clients } = useLoad(() => api.get<Client[]>("/clients"));
  const { run, busy } = useAction();
  const nav = useNavigate();

  useEffect(() => {
    setQ(null);
    if (id) {
      api.get<Quotation>(`/quotations/${id}`).then((d) => { setQ(d); setDirty(false); });
    } else {
      const clientId = params.get("client");
      Promise.all([api.get<Quotation>("/quotations/blank"), clientId ? api.get<Client>(`/clients/${clientId}`) : Promise.resolve(null)])
        .then(([blank, c]) => {
          setQ(c ? { ...blank, client_id: c.id, to_company: c.company, to_name: c.contact_name, to_email: c.email, to_phone: c.phone, to_website: c.website } : blank);
          setDirty(false);
        });
    }
  }, [id, params]);

  if (!q) return <Loading />;
  const calc = quoteCalc(q);

  const patch = (p: Partial<Quotation>) => { setQ({ ...q, ...p }); setDirty(true); };
  const set = (k: keyof Quotation) => (e: { target: { value: string } }) => patch({ [k]: e.target.value } as Partial<Quotation>);
  const setItem = (i: number, p: Partial<QuotationItem>) => patch({ items: q.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });
  const setStage = (i: number, p: Partial<PaymentStage>) => patch({ stages: q.stages.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const setTerm = (i: number, p: Partial<Term>) => patch({ terms: q.terms.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  const moveItem = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= q.items.length) return;
    const items = [...q.items];
    [items[i], items[j]] = [items[j], items[i]];
    patch({ items });
  };

  const pickClient = (cid: string) => {
    const c = clients?.find((x) => x.id === Number(cid));
    if (!c) { patch({ client_id: null }); return; }
    patch({ client_id: c.id, to_company: c.company, to_name: c.contact_name, to_email: c.email, to_phone: c.phone, to_website: c.website });
  };

  const body = () => ({
    number: q.number, client_id: q.client_id, issue_date: q.issue_date, validity_days: Math.max(1, Math.round(n(q.validity_days))),
    project: q.project, to_name: q.to_name, to_company: q.to_company, to_email: q.to_email, to_phone: q.to_phone,
    to_website: q.to_website, salutation: q.salutation, intro: q.intro, closing: q.closing, show_signature: q.show_signature,
    gst_mode: q.gst_mode, gst_rate: n(q.gst_rate), discount: n(q.discount), status: q.status,
    items: q.items.map((it) => ({ title: it.title, description: it.description, unit: it.unit, qty: n(it.qty), rate: n(it.rate), quoted_on_selection: it.quoted_on_selection })),
    stages: q.stages.map((s) => ({ milestone: s.milestone, description: s.description, share: n(s.share) })),
    terms: q.terms.map((t) => ({ title: t.title, text: t.text, included: t.included, auto: t.auto })),
  });

  const save = async (silent = false): Promise<Quotation | undefined> => {
    const out = await run(() => (q.id ? api.put<Quotation>(`/quotations/${q.id}`, body()) : api.post<Quotation>("/quotations", body())), silent ? undefined : "Quotation saved");
    if (out) {
      setQ(out);
      setDirty(false);
      if (!q.id) nav(`/quotations/${out.id}`, { replace: true });
    }
    return out;
  };
  const ensureSaved = async () => (dirty || !q.id ? save(true) : q);

  const pdf = async () => {
    const saved = await ensureSaved();
    if (saved?.id) window.open(`/print/quotation/${saved.id}`, "_blank");
  };
  const markSent = async () => { patch({ status: "sent" }); const s = await run(() => api.put<Quotation>(`/quotations/${q.id}`, { ...body(), status: "sent" }), "Marked as sent"); if (s) { setQ(s); setDirty(false); } };
  const toInvoice = async () => {
    const saved = await ensureSaved();
    if (!saved?.id) return;
    const inv = await run(() => api.post<Invoice>(`/quotations/${saved.id}/invoice`), "Invoice created");
    if (inv) nav(`/invoices/${inv.id}`);
  };
  const toProject = async () => {
    const saved = await ensureSaved();
    if (!saved?.id) return;
    if (await run(() => api.post<Project>(`/quotations/${saved.id}/project`), "Project created")) nav("/projects");
  };
  const duplicate = async () => {
    const saved = await ensureSaved();
    if (!saved?.id) return;
    const copy = await run(() => api.post<Quotation>(`/quotations/${saved.id}/duplicate`), "Copy created");
    if (copy) nav(`/quotations/${copy.id}`);
  };
  const remove = async () => {
    if (!q.id || !confirm(`Delete quotation ${q.number}?`)) return;
    if (await run(() => api.del(`/quotations/${q.id}`).then(() => true), "Quotation deleted")) nav("/quotations");
  };

  return (
    <>
      <div className="top">
        <div className="titles">
          <div className="row"><h1>{q.id ? q.number : "New quotation"}</h1><Pill status={q.status} />{dirty && <span className="small muted">Unsaved changes</span>}</div>
          <p>Add any work, product or service — the quotation updates live in the Manima template.</p>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={pdf} disabled={busy}>Download PDF</button>
          {q.id && q.status === "draft" && <button className="btn ghost" onClick={markSent} disabled={busy}>Mark as sent</button>}
          <button className="btn orange" onClick={toInvoice} disabled={busy || calc.taxable <= 0}>Convert to invoice</button>
          <button className="btn" onClick={() => save()} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>

      <div className="split">
        <div className="left stack" style={{ flexBasis: 420 }}>
          <section className="card stack" style={{ gap: 12 }}>
            <span className="section-title">Quotation details</span>
            <div className="form-grid">
              <Field label="Quotation no."><input value={q.number} onChange={set("number")} /></Field>
              <Field label="Date"><input type="date" value={q.issue_date} onChange={set("issue_date")} /></Field>
              <Field label="Valid for (days)"><input type="number" min={1} value={q.validity_days} onChange={set("validity_days")} /></Field>
              <Field label="Status"><select value={q.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></Field>
            </div>
            <Field label="Project name"><input value={q.project} onChange={set("project")} placeholder="e.g. Mobile app, ERP rollout, AI chatbot" /></Field>
          </section>

          <section className="card stack" style={{ gap: 12 }}>
            <span className="section-title">Quotation to</span>
            <Field label="Existing client (optional)">
              <select value={q.client_id ?? ""} onChange={(e) => pickClient(e.target.value)}>
                <option value="">— New / not saved yet —</option>
                {clients?.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Contact name"><input value={q.to_name} onChange={set("to_name")} /></Field>
              <Field label="Company"><input value={q.to_company} onChange={set("to_company")} /></Field>
              <Field label="Email"><input type="email" value={q.to_email} onChange={set("to_email")} /></Field>
              <Field label="Phone"><input value={q.to_phone} onChange={set("to_phone")} /></Field>
              <Field label="Website"><input value={q.to_website} onChange={set("to_website")} /></Field>
              <Field label="Salutation"><select value={q.salutation} onChange={set("salutation")}><option value="Sir">Sir</option><option value="Madam">Madam</option><option value="">None</option></select></Field>
            </div>
            <Field label="Opening paragraph"><textarea rows={3} value={q.intro} onChange={set("intro")} /></Field>
            <span className="small muted">Tip: write {"{client}"} and it becomes the company name.</span>
          </section>

          <section className="card stack" style={{ gap: 12 }}>
            <div className="row"><span className="section-title" style={{ flex: 1 }}>Work, products &amp; services</span><span className="small muted">{q.items.length} items</span></div>
            {q.items.length === 0 && <Empty>No items yet. Add any work, product or service with its own price.</Empty>}
            {q.items.map((it, i) => (
              <div key={i} className="editor-block">
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <b className="small" style={{ flex: 1 }}>Item {i + 1}</b>
                  <button className="btn ghost sm" aria-label="Move item up" onClick={() => moveItem(i, -1)}><Icon name="up" size={15} /></button>
                  <button className="btn ghost sm" aria-label="Move item down" onClick={() => moveItem(i, 1)}><Icon name="down" size={15} /></button>
                  <button className="btn danger sm" onClick={() => patch({ items: q.items.filter((_, j) => j !== i) })}>Remove</button>
                </div>
                <Field label="Work / product / service"><input value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Name of the work, product or service" /></Field>
                <Field label="Description"><textarea rows={2} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="What is included" /></Field>
                <div className="form-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  <Field label="Unit"><select value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
                  <Field label="Qty"><input type="number" min={0} value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value as unknown as number })} /></Field>
                  <Field label="Price (₹)"><input type="number" min={0} value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value as unknown as number })} /></Field>
                </div>
                <div className="row">
                  <label className="check"><input type="checkbox" checked={it.quoted_on_selection} onChange={(e) => setItem(i, { quoted_on_selection: e.target.checked })} />Quoted on selection (not added to total)</label>
                  <span className="spacer" /><b>{it.quoted_on_selection ? "On selection" : inr(n(it.qty) * n(it.rate))}</b>
                </div>
              </div>
            ))}
            <button className="btn ghost block" style={{ borderStyle: "dashed" }} onClick={() => patch({ items: [...q.items, { title: "", description: "", unit: "Project", qty: 1, rate: 0, quoted_on_selection: false }] })}>+ Add item</button>
          </section>

          <section className="card stack" style={{ gap: 12 }}>
            <span className="section-title">Tax &amp; total</span>
            <div className="form-grid">
              <Field label="GST"><select value={q.gst_mode} onChange={set("gst_mode")}><option value="excl">Exclusive — add a note</option><option value="add">Add GST to the total</option><option value="none">No GST mention</option></select></Field>
              <Field label="GST rate (%)"><input type="number" min={0} value={q.gst_rate} onChange={set("gst_rate")} /></Field>
              <Field label="Discount (₹)"><input type="number" min={0} value={q.discount} onChange={set("discount")} /></Field>
            </div>
            <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, fontSize: 20, fontWeight: 700 }}><span>Total</span><span className="spacer" /><span>{inr(calc.total)}</span></div>
          </section>

          <section className="card stack" style={{ gap: 12 }}>
            <div className="row"><span className="section-title" style={{ flex: 1 }}>Payment schedule</span>
              <span className="small strong" style={{ color: q.stages.length && calc.shareTotal !== 100 ? "var(--pink-ink)" : "var(--muted)" }}>{q.stages.length ? `Shares add up to ${calc.shareTotal}%` : "Optional"}</span></div>
            <div className="row">
              {Object.entries(PRESETS).map(([k, v]) => <button key={k} className="btn ghost sm" onClick={() => patch({ stages: v.map(([milestone, share, description]) => ({ milestone, share, description })) })}>{k}</button>)}
              <button className="btn ghost sm" onClick={() => patch({ stages: [] })}>No schedule</button>
            </div>
            {q.stages.map((s, i) => (
              <div key={i} className="editor-block">
                <div className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
                  <Field label={`Stage ${i + 1} milestone`}><input value={s.milestone} onChange={(e) => setStage(i, { milestone: e.target.value })} /></Field>
                  <div style={{ width: 96, flexShrink: 0 }}><Field label="Share %"><input type="number" min={0} max={100} value={s.share} onChange={(e) => setStage(i, { share: e.target.value as unknown as number })} /></Field></div>
                  <button className="btn danger sm" style={{ height: 42 }} aria-label="Remove stage" onClick={() => patch({ stages: q.stages.filter((_, j) => j !== i) })}><Icon name="trash" size={15} /></button>
                </div>
                <Field label="When it is payable"><input value={s.description} onChange={(e) => setStage(i, { description: e.target.value })} /></Field>
              </div>
            ))}
            <button className="btn ghost block" style={{ borderStyle: "dashed" }} onClick={() => patch({ stages: [...q.stages, { milestone: "", description: "", share: 0 }] })}>+ Add stage</button>
          </section>

          <section className="card stack" style={{ gap: 12 }}>
            <div className="row"><span className="section-title" style={{ flex: 1 }}>Terms &amp; conditions</span><span className="small muted">{q.terms.filter((t) => t.included).length} included</span></div>
            {q.terms.map((t, i) => (
              <div key={i} className="editor-block" style={{ background: t.included ? "#FBFBF8" : "#fff" }}>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input type="checkbox" aria-label="Include this term" checked={t.included} onChange={(e) => setTerm(i, { included: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--orange-deep)" }} />
                  <input className="input" aria-label="Term title" value={t.title} onChange={(e) => setTerm(i, { title: e.target.value })} style={{ fontWeight: 600, height: 38 }} />
                  <button className="btn danger sm" aria-label="Delete term" onClick={() => patch({ terms: q.terms.filter((_, j) => j !== i) })}><Icon name="trash" size={15} /></button>
                </div>
                {t.auto ? <span className="small muted">Written automatically from your payment schedule.</span>
                  : <textarea className="input" rows={2} aria-label="Term text" value={t.text} onChange={(e) => setTerm(i, { text: e.target.value })} />}
              </div>
            ))}
            <button className="btn ghost block" style={{ borderStyle: "dashed" }} onClick={() => patch({ terms: [...q.terms, { title: "New term", text: "", included: true, auto: false }] })}>+ Add term</button>
          </section>

          <section className="card stack" style={{ gap: 12 }}>
            <span className="section-title">Closing</span>
            <Field label="Closing line"><textarea rows={2} value={q.closing} onChange={set("closing")} /></Field>
            <label className="check"><input type="checkbox" checked={q.show_signature} onChange={(e) => patch({ show_signature: e.target.checked })} />Show signature</label>
          </section>

          {q.id && (
            <section className="card row">
              <button className="btn ghost sm" onClick={toProject} disabled={busy}>Create project from quote</button>
              <button className="btn ghost sm" onClick={duplicate} disabled={busy}>Duplicate</button>
              <span className="spacer" />
              <button className="btn danger sm" onClick={remove} disabled={busy}>Delete</button>
            </section>
          )}
        </div>

        <div className="right" style={{ position: "sticky", top: 20 }}>
          <div className="small strong muted" style={{ marginBottom: 8 }}>LIVE PREVIEW</div>
          <FitPreview><QuotationDocument q={q} company={settings} /></FitPreview>
        </div>
      </div>
    </>
  );
}
