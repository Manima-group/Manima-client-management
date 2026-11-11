import { ReactNode, useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { InvoiceDocument, QuotationDocument } from "../components/Documents";
import { Loading, useLoad } from "../components/ui";
import type { Invoice, Quotation } from "../types";

function PrintShell({ title, ready, children }: { title: string; ready: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!ready) return;
    document.title = title;
    const t = window.setTimeout(() => window.print(), 600);
    return () => window.clearTimeout(t);
  }, [ready, title]);
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div className="no-print row">
        <span className="muted small">Choose “Save as PDF” in the print window.</span>
        <button className="btn sm" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      <div className="doc-wrap">{children}</div>
    </div>
  );
}

export function PrintQuotation() {
  const { id } = useParams();
  const { settings } = useApp();
  const { data } = useLoad(() => api.get<Quotation>(`/quotations/${id}`), [id]);
  if (!data) return <Loading />;
  const name = `Quotation ${data.number.split("/").join("-")} - ${data.to_company || data.to_name}`;
  return <PrintShell title={name} ready><QuotationDocument q={data} company={settings} /></PrintShell>;
}

export function PrintInvoice() {
  const { id } = useParams();
  const { settings } = useApp();
  const { data } = useLoad(() => api.get<Invoice>(`/invoices/${id}`), [id]);
  if (!data) return <Loading />;
  return <PrintShell title={`Invoice ${data.number} - ${data.client_name}`} ready><InvoiceDocument inv={data} company={settings} /></PrintShell>;
}
