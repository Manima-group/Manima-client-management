import { fill, longDate, rs, addDays, shortDate } from "../format";
import type { CompanySettings, Invoice, Quotation } from "../types";

export type Company = Pick<CompanySettings, "brand_name" | "company_name" | "owner_name" | "website" | "email" | "phone" | "linkedin" | "gstin" | "address" | "bank_details">;

type QuoteLike = Pick<Quotation, "number" | "issue_date" | "validity_days" | "project" | "to_name" | "to_company" | "to_email" | "to_phone" | "to_website" | "salutation" | "intro" | "closing" | "show_signature" | "gst_mode" | "gst_rate" | "discount" | "items" | "stages" | "terms"> & { status?: string; signed_by?: string; signed_at?: string | null };

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
};

export function quoteCalc(q: QuoteLike) {
  const subtotal = q.items.filter((i) => !i.quoted_on_selection).reduce((a, i) => a + num(i.qty) * num(i.rate), 0);
  const discount = Math.min(num(q.discount), subtotal);
  const taxable = subtotal - discount;
  const gst = q.gst_mode === "add" ? (taxable * num(q.gst_rate)) / 100 : 0;
  const total = taxable + gst;
  const shareTotal = q.stages.reduce((a, s) => a + num(s.share), 0);
  const hasTbd = q.items.some((i) => i.quoted_on_selection);
  return { subtotal, discount, taxable, gst, total, shareTotal, hasTbd };
}

function DocHeader({ company }: { company: Company }) {
  return (
    <>
      <div className="logo"><img src="/manima-logo.png" alt={company.company_name} /></div>
      <div className="brandline"><b>{company.brand_name}</b><span>|&nbsp; {company.website}</span></div>
    </>
  );
}

function FromBlock({ company }: { company: Company }) {
  return (
    <>
      <span style={{ fontWeight: 700 }}>From: {company.company_name} ({company.owner_name})</span>
      <span className="grey">{company.website}</span>
      <span className="grey">{company.email}</span>
      <span className="grey">{company.phone}</span>
      {company.linkedin && <span className="grey">{company.linkedin}</span>}
      {company.gstin && <span className="grey">GSTIN: {company.gstin}</span>}
    </>
  );
}

export function QuotationDocument({ q, company }: { q: QuoteLike; company: Company }) {
  const c = quoteCalc(q);
  const clientName = q.to_company.trim() || "the client";
  const ClientName = q.to_company.trim() || "The client";
  const first = q.to_name.trim().split(" ")[0] || "";
  const greetName = first ? first.charAt(0).toUpperCase() + first.slice(1) : "[Client name]";
  const excl: string[] = [];
  if (c.hasTbd) excl.push("items quoted on selection");
  if (q.gst_mode === "excl") excl.push("taxes");
  const showSubRows = c.discount > 0 || q.gst_mode === "add";
  const payText = q.stages.length
    ? `Payment is in ${q.stages.length} ${q.stages.length === 1 ? "stage" : "stages"}: ` +
      q.stages.map((s) => `${num(s.share)}% on ${(s.milestone || "milestone").toLowerCase()}`).join(", ") + "."
    : "As mutually agreed.";
  const notes: string[] = [];
  if (c.hasTbd) notes.push("items quoted on selection");
  if (q.gst_mode === "excl") notes.push("applicable taxes");
  const noteText = notes.length ? notes.join(" and ") : "";

  return (
    <div className="doc">
      <DocHeader company={company} />
      <h1>QUOTATION</h1>
      <div className="parties">
        <div>
          <span className="to-label">Quotation To:</span>
          <span style={{ fontWeight: 700 }} className={q.to_name ? "" : "ph"}>{q.to_name || "[Client name]"}</span>
          <span className={q.to_company ? "" : "ph"}>{q.to_company || "[Company]"}</span>
          {q.to_email && <span className="grey">{q.to_email}</span>}
          {q.to_phone && <span className="grey">{q.to_phone}</span>}
          {q.to_website && <span className="grey">{q.to_website}</span>}
          {q.project && <span className="grey">Project: {q.project}</span>}
        </div>
        <div className="r">
          <span style={{ fontWeight: 700 }}>Quotation No: {q.number}</span>
          <span style={{ fontWeight: 700 }}>Date: {longDate(q.issue_date)}</span>
          <span style={{ fontWeight: 700 }}>Validity: {q.validity_days} days (till {longDate(addDays(q.issue_date, num(q.validity_days)))})</span>
          <FromBlock company={company} />
        </div>
      </div>

      <p style={{ marginTop: 6 }}>Dear {greetName}{q.salutation ? ` ${q.salutation}` : ""},</p>
      <p>{fill(q.intro, clientName)}</p>

      <table>
        <thead>
          <tr><th style={{ width: 40, textAlign: "center" }}>#</th><th>Description of Work</th><th style={{ width: 130 }}>Unit</th><th style={{ width: 150, textAlign: "right" }}>Amount</th></tr>
        </thead>
        <tbody>
          {q.items.length === 0 && (
            <tr><td colSpan={4} style={{ textAlign: "center", fontStyle: "italic", color: "#777", padding: 18 }}>No items yet — add work, products or services.</td></tr>
          )}
          {q.items.map((it, i) => {
            const qty = num(it.qty);
            const showQty = !it.quoted_on_selection && (qty !== 1 || !["Project", "Fixed", "As Applicable"].includes(it.unit));
            return (
              <tr key={i} className={i % 2 ? "alt" : ""}>
                <td style={{ textAlign: "center" }}>{i + 1}</td>
                <td><div className={`t${it.title ? "" : " ph"}`}>{it.title || "[Item name]"}</div>{it.description && <div className="d">{it.description}</div>}</td>
                <td>{it.unit}{showQty && <div className="d">{qty} × {rs(num(it.rate))}</div>}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{it.quoted_on_selection ? "Quoted on selection" : rs(qty * num(it.rate))}</td>
              </tr>
            );
          })}
          {showSubRows && <tr className="sub"><td colSpan={3} style={{ textAlign: "right" }}>Subtotal</td><td style={{ textAlign: "right" }}>{rs(c.subtotal)}</td></tr>}
          {c.discount > 0 && <tr className="sub"><td colSpan={3} style={{ textAlign: "right" }}>Discount</td><td style={{ textAlign: "right" }}>- {rs(c.discount)}</td></tr>}
          {q.gst_mode === "add" && <tr className="sub"><td colSpan={3} style={{ textAlign: "right" }}>GST @ {num(q.gst_rate)}%</td><td style={{ textAlign: "right" }}>{rs(c.gst)}</td></tr>}
          <tr className="total">
            <td colSpan={3} style={{ textAlign: "right" }}>Total Estimate{excl.length ? ` (excl. ${excl.join(" & ")})` : ""}</td>
            <td style={{ textAlign: "right" }}>{rs(c.total)}</td>
          </tr>
        </tbody>
      </table>
      {q.gst_mode === "excl" && <p className="note">Note: Prices above are exclusive of applicable taxes. GST/other taxes, if applicable, will be added at actuals.</p>}
      {q.gst_mode === "add" && <p className="note">Note: GST @ {num(q.gst_rate)}% is included in the total above.</p>}

      {q.stages.length > 0 && (
        <>
          <h2>Payment Schedule{q.project ? ` (${q.project})` : ""} — {rs(c.total)}</h2>
          <table>
            <thead><tr><th style={{ width: 54, textAlign: "center" }}>Stage</th><th>Milestone</th><th style={{ width: 70, textAlign: "center" }}>Share</th><th style={{ width: 150, textAlign: "right" }}>Amount</th></tr></thead>
            <tbody>
              {q.stages.map((s, i) => (
                <tr key={i} className={i % 2 ? "alt" : ""}>
                  <td style={{ textAlign: "center" }}>{i + 1}</td>
                  <td><div className={`t${s.milestone ? "" : " ph"}`}>{s.milestone || "[Milestone]"}</div>{s.description && <div className="d">{s.description}</div>}</td>
                  <td style={{ textAlign: "center" }}>{num(s.share)}%</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{rs((c.total * num(s.share)) / 100)}</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={2} style={{ textAlign: "right" }}>Total</td><td style={{ textAlign: "center" }}>{c.shareTotal}%</td><td style={{ textAlign: "right" }}>{rs((c.total * c.shareTotal) / 100)}</td></tr>
            </tbody>
          </table>
          {noteText && <p className="note" style={{ marginTop: 0 }}>{noteText.charAt(0).toUpperCase() + noteText.slice(1)} are billed separately at actuals.</p>}
        </>
      )}

      <div className="page-break">
        <h2 style={{ margin: 0 }}>Terms &amp; Conditions</h2>
        <ul>
          {q.terms.filter((t) => t.included).map((t, i) => (
            <li key={i}><strong>{t.title}:</strong> {t.auto ? payText : fill(t.text, ClientName)}</li>
          ))}
        </ul>
        <p style={{ marginTop: 8 }}>{fill(q.closing, clientName)}</p>
        <p>Warm regards,</p>
        {q.show_signature && <div className="sig"><img src="/signature.png" alt={`Signature of ${company.owner_name}`} /></div>}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ color: "var(--doc-blue)" }}>{company.owner_name}</span>
          <span className="grey" style={{ fontSize: 12 }}>{company.company_name} · {company.website}</span>
        </div>
        {q.signed_by && (
          <p style={{ marginTop: 10 }}><span className="stamp">Accepted by {q.signed_by}{q.signed_at ? ` · ${shortDate(q.signed_at)}` : ""}</span></p>
        )}
      </div>
      <div className="foot">{company.company_name} | {company.website}</div>
    </div>
  );
}

export function InvoiceDocument({ inv, company }: { inv: Invoice; company: Company }) {
  const c = inv.client;
  const billTo = inv.bill_to || c?.company || "";
  const status = inv.effective_status;
  return (
    <div className="doc">
      <DocHeader company={company} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <h1>TAX INVOICE</h1>
        {status === "paid" && <span className="stamp">PAID</span>}
      </div>
      <div className="parties">
        <div>
          <span className="to-label">Bill To:</span>
          <span style={{ fontWeight: 700 }}>{c?.contact_name || billTo}</span>
          {c?.contact_name && <span>{billTo}</span>}
          {c?.email && <span className="grey">{c.email}</span>}
          {c?.phone && <span className="grey">{c.phone}</span>}
          {c?.city && <span className="grey">{c.city}</span>}
          {c?.gstin && <span className="grey">GSTIN: {c.gstin}</span>}
        </div>
        <div className="r">
          <span style={{ fontWeight: 700 }}>Invoice No: {inv.number}</span>
          <span style={{ fontWeight: 700 }}>Date: {longDate(inv.issue_date)}</span>
          <span style={{ fontWeight: 700 }}>Due: {longDate(inv.due_date)}</span>
          <FromBlock company={company} />
        </div>
      </div>
      {inv.notes && <p>{inv.notes}</p>}
      <table>
        <thead><tr><th style={{ width: 40, textAlign: "center" }}>#</th><th>Description</th><th style={{ width: 120 }}>Unit</th><th style={{ width: 60, textAlign: "right" }}>Qty</th><th style={{ width: 110, textAlign: "right" }}>Rate</th><th style={{ width: 130, textAlign: "right" }}>Amount</th></tr></thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={i} className={i % 2 ? "alt" : ""}>
              <td style={{ textAlign: "center" }}>{i + 1}</td>
              <td><div className="t">{it.title}</div>{it.description && <div className="d">{it.description}</div>}</td>
              <td>{it.unit}</td>
              <td style={{ textAlign: "right" }}>{it.qty}</td>
              <td style={{ textAlign: "right" }}>{rs(it.rate)}</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{rs(it.qty * it.rate)}</td>
            </tr>
          ))}
          <tr className="sub"><td colSpan={5} style={{ textAlign: "right" }}>Subtotal</td><td style={{ textAlign: "right" }}>{rs(inv.subtotal)}</td></tr>
          {inv.gst_rate > 0 && <>
            <tr className="sub"><td colSpan={5} style={{ textAlign: "right" }}>CGST @ {inv.gst_rate / 2}%</td><td style={{ textAlign: "right" }}>{rs(inv.gst / 2)}</td></tr>
            <tr className="sub"><td colSpan={5} style={{ textAlign: "right" }}>SGST @ {inv.gst_rate / 2}%</td><td style={{ textAlign: "right" }}>{rs(inv.gst / 2)}</td></tr>
          </>}
          <tr className="total"><td colSpan={5} style={{ textAlign: "right" }}>Total</td><td style={{ textAlign: "right" }}>{rs(inv.total)}</td></tr>
          {inv.paid > 0 && <>
            <tr className="sub"><td colSpan={5} style={{ textAlign: "right" }}>Received</td><td style={{ textAlign: "right" }}>{rs(inv.paid)}</td></tr>
            <tr className="sub"><td colSpan={5} style={{ textAlign: "right" }}>Balance due</td><td style={{ textAlign: "right" }}>{rs(inv.balance)}</td></tr>
          </>}
        </tbody>
      </table>
      {company.bank_details && (
        <div><h2 style={{ fontSize: 15 }}>Payment details</h2><p style={{ whiteSpace: "pre-line" }}>{company.bank_details}</p></div>
      )}
      <p style={{ marginTop: 10 }}>Thank you for your business.</p>
      <div className="sig"><img src="/signature.png" alt={`Signature of ${company.owner_name}`} /></div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ color: "var(--doc-blue)" }}>{company.owner_name}</span>
        <span className="grey" style={{ fontSize: 12 }}>{company.company_name} · {company.website}</span>
      </div>
      <div className="foot">{company.company_name} | {company.website}</div>
    </div>
  );
}
