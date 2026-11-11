import { ReactNode, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { Company, InvoiceDocument, QuotationDocument } from "../components/Documents";
import FitPreview from "../components/FitPreview";
import { Empty, Field, Loading, Modal, Pill, Progress, useAction, useLoad } from "../components/ui";
import { initials, inr, shortDate } from "../format";
import type { Invoice, Project, Quotation } from "../types";

type PortalData = {
  company: Company;
  client: { company: string; contact_name: string };
  projects: Project[];
  quotations: Quotation[];
  invoices: Invoice[];
};

export default function Portal() {
  const { token } = useParams();
  const { data, error, reload } = useLoad(() => api.get<PortalData>(`/portal/${token}`), [token]);
  const [tab, setTab] = useState("progress");
  const [viewQ, setViewQ] = useState<Quotation | null>(null);
  const [viewI, setViewI] = useState<Invoice | null>(null);
  const [signing, setSigning] = useState<Quotation | null>(null);

  if (error) return <div className="login"><div className="card"><h1 style={{ fontSize: 22 }}>Link not valid</h1><p className="muted">Please ask Manima for a new portal link.</p></div></div>;
  if (!data) return <Loading />;
  const c = data.company;
  const toSign = data.quotations.filter((q) => q.status === "sent");

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid var(--border)" }} className="no-print">
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 24px" }} className="row">
          <div className="brand"><div className="logo"><img src="/manima-logo.png" alt="" /></div><div><b>{c.company_name}</b><span>{c.website}</span></div></div>
          <span className="spacer" />
          <span className="small muted">Signed in as <b style={{ color: "var(--ink)" }}>{data.client.contact_name || data.client.company}</b></span>
          <span className="avatar">{initials(data.client.contact_name || data.client.company)}</span>
        </div>
      </header>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px 56px" }} className="stack no-print">
        <div>
          <div className="small strong muted">{data.client.company.toUpperCase()}</div>
          <h1 style={{ fontSize: 30, marginTop: 4 }}>Your work with {c.company_name}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>Progress, documents and invoices in one place.</p>
        </div>
        {toSign.length > 0 && (
          <section className="card row" style={{ background: "var(--yellow)", borderColor: "var(--yellow)" }}>
            <b style={{ flex: 1 }}>{toSign.length === 1 ? `Quotation ${toSign[0].number} is waiting for your approval.` : `${toSign.length} quotations are waiting for your approval.`}</b>
            <button className="btn ghost" onClick={() => setTab("quotations")}>Review &amp; sign</button>
          </section>
        )}
        <div className="tabs" role="tablist">
          {[["progress", "Progress"], ["quotations", "Quotations"], ["invoices", "Invoices"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === "progress" && (data.projects.length === 0 ? <Empty>No projects yet.</Empty> : (
          <div className="grid3">
            {data.projects.map((p) => (
              <section key={p.id} className="card stack" style={{ gap: 14 }}>
                <div className="row"><h2 style={{ margin: 0, flex: 1 }}>{p.name}</h2><b style={{ fontSize: 22 }}>{p.progress}%</b></div>
                <Progress value={p.progress} />
                {p.due_date && <span className="small muted">Target date {shortDate(p.due_date)}</span>}
                <div className="stack" style={{ gap: 0 }}>
                  {p.tasks.map((t) => (
                    <div key={t.id} className="row" style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--ink)", background: t.done ? "var(--ink)" : "#fff" }} aria-hidden="true" />
                      <span style={{ flex: 1 }}>{t.title}</span>
                      <span className={`pill ${t.done ? "yellow" : "grey"}`}>{t.done ? "Done" : "In progress"}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ))}

        {tab === "quotations" && (
          <section className="card">
            {data.quotations.length === 0 ? <Empty>No quotations yet.</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Quotation</th><th>Project</th><th>Date</th><th>Status</th><th className="r">Total</th><th /></tr></thead>
                <tbody>
                  {data.quotations.map((q) => (
                    <tr key={q.id}>
                      <td><b>{q.number}</b></td><td>{q.project}</td><td className="muted">{shortDate(q.issue_date)}</td>
                      <td><Pill status={q.status === "sent" ? "proposal" : q.status} text={q.status === "sent" ? "Awaiting your approval" : q.signed_by ? `Signed by ${q.signed_by}` : undefined} /></td>
                      <td className="r"><b>{inr(q.total)}</b></td>
                      <td className="r"><span className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <button className="btn ghost sm" onClick={() => setViewQ(q)}>View</button>
                        {q.status === "sent" && <button className="btn sm" onClick={() => setSigning(q)}>Sign</button>}
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>
        )}

        {tab === "invoices" && (
          <section className="card">
            {data.invoices.length === 0 ? <Empty>No invoices yet.</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Status</th><th className="r">Amount</th><th className="r">Balance</th><th /></tr></thead>
                <tbody>
                  {data.invoices.map((i) => (
                    <tr key={i.id}>
                      <td><b>{i.number}</b></td><td className="muted">{shortDate(i.issue_date)}</td><td className="muted">{shortDate(i.due_date)}</td>
                      <td><Pill status={i.effective_status} /></td><td className="r"><b>{inr(i.total)}</b></td><td className="r">{i.balance ? inr(i.balance) : "—"}</td>
                      <td className="r"><button className="btn ghost sm" onClick={() => setViewI(i)}>View / download</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            {c.bank_details && <p className="small muted" style={{ whiteSpace: "pre-line", marginTop: 14 }}><b>Payment details</b>{"\n"}{c.bank_details}</p>}
          </section>
        )}
        <p className="small muted" style={{ textAlign: "center" }}>{c.company_name} · {c.email} · {c.phone}</p>
      </main>

      {viewQ && <DocModal title={`Quotation ${viewQ.number}`} onClose={() => setViewQ(null)} action={viewQ.status === "sent" ? <button className="btn" onClick={() => { setSigning(viewQ); setViewQ(null); }}>Sign this quotation</button> : null}><QuotationDocument q={viewQ} company={c} /></DocModal>}
      {viewI && <DocModal title={`Invoice ${viewI.number}`} onClose={() => setViewI(null)}><InvoiceDocument inv={viewI} company={c} /></DocModal>}
      {signing && <SignModal token={token!} q={signing} onClose={() => setSigning(null)} onSigned={() => { setSigning(null); reload(); }} />}
    </div>
  );
}

function DocModal({ title, children, onClose, action }: { title: string; children: ReactNode; onClose: () => void; action?: ReactNode }) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const t = window.setTimeout(() => { window.print(); setPrinting(false); }, 300);
    return () => window.clearTimeout(t);
  }, [printing]);
  if (printing) {
    return <div className="doc-wrap" style={{ padding: 24 }}>{children}</div>;
  }
  return (
    <Modal wide title={title} onClose={onClose} footer={<>{action}<button className="btn ghost" onClick={() => setPrinting(true)}>Download PDF</button></>}>
      <FitPreview>{children}</FitPreview>
    </Modal>
  );
}

function SignModal({ token, q, onClose, onSigned }: { token: string; q: Quotation; onClose: () => void; onSigned: () => void }) {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const { run, busy } = useAction();
  const sign = async () => {
    if (await run(() => api.post(`/portal/${token}/quotations/${q.id}/sign`, { name }), "Thank you — quotation signed")) onSigned();
  };
  return (
    <Modal title={`Sign quotation ${q.number}`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || name.trim().length < 2 || !agree} onClick={sign}>Sign &amp; approve</button></>}>
      <p style={{ margin: 0 }}>You are approving <b>{q.project || "this quotation"}</b> for <b>{inr(q.total)}</b>{q.gst_mode === "excl" ? " plus applicable taxes" : ""}.</p>
      <Field label="Type your full name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I agree to the quotation and its terms &amp; conditions.</label>
    </Modal>
  );
}
