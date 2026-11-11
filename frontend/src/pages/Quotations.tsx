import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Empty, Kpi, Loading, PageHead, Pill, useLoad } from "../components/ui";
import { inr, shortDate } from "../format";
import type { QuotationSummary } from "../types";

const FILTERS = ["all", "draft", "sent", "approved", "invoiced", "rejected"];

export default function Quotations() {
  const { data } = useLoad(() => api.get<QuotationSummary[]>("/quotations"));
  const [filter, setFilter] = useState("all");
  const nav = useNavigate();
  if (!data) return <Loading />;
  const list = data.filter((q) => filter === "all" || q.status === filter);
  const sum = (s: string[]) => data.filter((q) => s.includes(q.status)).reduce((a, q) => a + q.total, 0);

  return (
    <>
      <PageHead title="Quotations" sub="Every quotation in the Manima template — add any work, product or service.">
        <Link className="btn" to="/quotations/new">+ New quotation</Link>
      </PageHead>
      <div className="kpis">
        <Kpi highlight dot="#1F2A2E" label="Awaiting reply" value={inr(sum(["sent"]))} note={`${data.filter((q) => q.status === "sent").length} sent`} />
        <Kpi dot="var(--orange)" label="Approved, not invoiced" value={inr(sum(["approved"]))} note={`${data.filter((q) => q.status === "approved").length} approved`} />
        <Kpi dot="var(--yellow)" label="Invoiced" value={inr(sum(["invoiced"]))} />
        <Kpi dot="var(--muted)" label="Drafts" value={data.filter((q) => q.status === "draft").length} />
      </div>
      <section className="card">
        <div className="tabs" style={{ marginBottom: 14 }}>
          {FILTERS.map((f) => <button key={f} className={`tab${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}</button>)}
        </div>
        {list.length === 0 ? <Empty>No quotations here yet.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Number</th><th>Client</th><th>Project</th><th>Date</th><th>Status</th><th className="r">Total</th></tr></thead>
              <tbody>
                {list.map((q) => (
                  <tr key={q.id} className="click" onClick={() => nav(`/quotations/${q.id}`)}>
                    <td><b>{q.number}</b></td>
                    <td>{q.to_company || q.to_name || "—"}</td>
                    <td className="muted">{q.project || "—"}</td>
                    <td className="muted">{shortDate(q.issue_date)}</td>
                    <td><Pill status={q.status} /></td>
                    <td className="r"><b>{inr(q.total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
