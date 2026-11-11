import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Field, Loading, Modal, PageHead, useAction, useLoad } from "../components/ui";
import { inr, shortDate } from "../format";
import type { Lead, LeadStage } from "../types";

const STAGES: { id: LeadStage; label: string }[] = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "proposal", label: "Proposal sent" },
  { id: "won", label: "Won" },
];

const EMPTY: Partial<Lead> = { company: "", contact_name: "", email: "", phone: "", source: "", kind: "service", value: 0, stage: "new", notes: "", follow_up: null };

export default function Leads() {
  const { data, reload } = useLoad(() => api.get<Lead[]>("/leads"));
  const [edit, setEdit] = useState<Partial<Lead> | null>(null);
  const [params, setParams] = useSearchParams();
  const { run } = useAction();
  const nav = useNavigate();

  useEffect(() => {
    if (params.get("new")) { setEdit({ ...EMPTY }); setParams({}, { replace: true }); }
  }, [params, setParams]);

  if (!data) return <Loading />;
  const open = data.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const lost = data.filter((l) => l.stage === "lost");

  const move = async (l: Lead, stage: LeadStage) => {
    if (stage === "won") {
      const out = await run(() => api.post<{ client: { id: number } }>(`/leads/${l.id}/convert`), `${l.company} won — client created`);
      if (out) reload();
      return;
    }
    if (await run(() => api.put(`/leads/${l.id}`, { stage }), `${l.company} moved`)) reload();
  };

  return (
    <>
      <PageHead title="Leads" sub={`Open pipeline: ${inr(open.reduce((a, l) => a + l.value, 0))} across ${open.length} leads`}>
        <button className="btn pink" onClick={() => setEdit({ ...EMPTY })}>+ New lead</button>
      </PageHead>
      <div className="kanban">
        {STAGES.map((s, i) => {
          const list = data.filter((l) => l.stage === s.id);
          return (
            <div className="kcol" key={s.id}>
              <div className="row"><b>{s.label}</b><span className="small muted">{list.length} · {inr(list.reduce((a, l) => a + l.value, 0))}</span></div>
              {list.map((l) => (
                <div className="kcard" key={l.id}>
                  <button type="button" className="link-btn" style={{ textAlign: "left", color: "var(--ink)", fontSize: 14, fontWeight: 600 }} onClick={() => setEdit(l)}>{l.company}</button>
                  <span className="small muted">{[l.contact_name, l.source].filter(Boolean).join(" · ")}</span>
                  {l.follow_up && <span className="small" style={{ color: "var(--orange-ink)" }}>Follow up {shortDate(l.follow_up)}</span>}
                  <div className="row" style={{ marginTop: 4 }}>
                    <b>{inr(l.value)}</b>
                    <span className="spacer" />
                    {i < 3 && <button className="btn ghost sm" onClick={() => move(l, STAGES[i + 1].id)}>{i === 2 ? "Mark won" : `→ ${STAGES[i + 1].label}`}</button>}
                    {i === 3 && l.client_id && <button className="btn ghost sm" onClick={() => nav(`/clients/${l.client_id}`)}>Open client</button>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {lost.length > 0 && <p className="small muted">{lost.length} lost lead{lost.length === 1 ? "" : "s"} hidden.</p>}
      {edit && <LeadModal lead={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function LeadModal({ lead, onClose, onSaved }: { lead: Partial<Lead>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Lead>>(lead);
  const { run, busy } = useAction();
  const set = (k: keyof Lead) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const body = { ...f, value: Number(f.value) || 0, follow_up: f.follow_up || null };
    const ok = await run(() => (lead.id ? api.put(`/leads/${lead.id}`, body) : api.post("/leads", body)), "Lead saved");
    if (ok) onSaved();
  };
  const remove = async () => {
    if (!confirm("Delete this lead?")) return;
    if (await run(() => api.del(`/leads/${lead.id}`).then(() => true), "Lead deleted")) onSaved();
  };
  return (
    <Modal title={lead.id ? "Edit lead" : "New lead"} onClose={onClose}
      footer={<>{lead.id && <button className="btn danger" onClick={remove}>Delete</button>}<span className="spacer" /><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !f.company} onClick={save}>Save lead</button></>}>
      <div className="form-grid">
        <Field label="Company / college"><input value={f.company || ""} onChange={set("company")} /></Field>
        <Field label="Contact name"><input value={f.contact_name || ""} onChange={set("contact_name")} /></Field>
        <Field label="Email"><input type="email" value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="Phone"><input value={f.phone || ""} onChange={set("phone")} /></Field>
        <Field label="Source"><input value={f.source || ""} onChange={set("source")} placeholder="Referral, LinkedIn, Website…" /></Field>
        <Field label="Type">
          <select value={f.kind} onChange={set("kind")}><option value="service">Client service</option><option value="college">College training</option><option value="corporate">Corporate training</option></select>
        </Field>
        <Field label="Deal value (₹)"><input type="number" min={0} value={f.value ?? 0} onChange={set("value")} /></Field>
        <Field label="Stage">
          <select value={f.stage} onChange={set("stage")}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}<option value="lost">Lost</option></select>
        </Field>
        <Field label="Follow-up date"><input type="date" value={f.follow_up || ""} onChange={set("follow_up")} /></Field>
        <Field label="Notes" wide><textarea rows={3} value={f.notes || ""} onChange={set("notes")} /></Field>
      </div>
    </Modal>
  );
}
