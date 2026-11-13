import { FormEvent, useState } from "react";
import { api } from "../api";
import { Empty, Field, Icon, Loading, Modal, PageHead, useAction, useLoad } from "../components/ui";
import { shortDate } from "../format";
import type { Idea, IdeaStatus } from "../types";

const STATUSES: { id: IdeaStatus; label: string; tone: string }[] = [
  { id: "new", label: "New", tone: "grey" },
  { id: "exploring", label: "Exploring", tone: "orange" },
  { id: "doing", label: "Doing", tone: "yellow" },
  { id: "done", label: "Done", tone: "yellow" },
  { id: "parked", label: "Parked", tone: "pink" },
];
const CATEGORY_HINTS = ["Product", "Business", "Client work", "Training", "Content", "Marketing", "Personal"];

export default function Ideas() {
  const { data, setData } = useLoad(() => api.get<Idea[]>("/ideas"));
  const [filter, setFilter] = useState<"all" | IdeaStatus>("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Idea | null>(null);
  const { run } = useAction();

  if (!data) return <Loading />;
  const sorted = (list: Idea[]) => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
  const replace = (i: Idea) => setData(sorted(data.map((x) => (x.id === i.id ? i : x))));
  const needle = q.trim().toLowerCase();
  const list = data.filter((i) =>
    (filter === "all" || i.status === filter) &&
    (!needle || `${i.title} ${i.body} ${i.category}`.toLowerCase().includes(needle)));
  const categories = Array.from(new Set([...CATEGORY_HINTS, ...data.map((i) => i.category).filter(Boolean)]));

  const update = async (i: Idea, p: Partial<Idea>) => {
    const out = await run(() => api.put<Idea>(`/ideas/${i.id}`, p));
    if (out) replace(out);
  };
  const remove = async (i: Idea) => {
    if (!confirm(`Delete "${i.title}"?`)) return;
    if (await run(() => api.del(`/ideas/${i.id}`).then(() => true), "Idea deleted")) setData(data.filter((x) => x.id !== i.id));
  };

  return (
    <>
      <PageHead title="Ideas" sub="Write down every idea before it slips away — sort them out later." />
      <QuickCapture categories={categories} onAdded={(i) => setData(sorted([i, ...data]))} />

      <div className="row">
        <div className="tabs">
          <button className={`tab${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>All · {data.length}</button>
          {STATUSES.map((s) => (
            <button key={s.id} className={`tab${filter === s.id ? " on" : ""}`} onClick={() => setFilter(s.id)}>
              {s.label} · {data.filter((i) => i.status === s.id).length}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <div className="search" style={{ width: 280, height: 42 }}>
          <Icon name="search" size={16} />
          <input aria-label="Search ideas" placeholder="Search ideas" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <Empty>{data.length === 0 ? "No ideas yet. Write your first one above." : "No ideas match."}</Empty>
      ) : (
        <div className="grid3">
          {list.map((i) => {
            const st = STATUSES.find((s) => s.id === i.status) || STATUSES[0];
            return (
              <article key={i.id} className="card stack" style={{ gap: 10, borderColor: i.pinned ? "var(--yellow)" : undefined, boxShadow: i.pinned ? "0 0 0 3px var(--yellow-tint)" : undefined }}>
                <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                  <h2 style={{ margin: 0, fontSize: 17, flex: 1, lineHeight: 1.35 }}>{i.title}</h2>
                  <button type="button" className="icon-btn" aria-pressed={i.pinned} aria-label={i.pinned ? "Unpin idea" : "Pin idea"} title={i.pinned ? "Unpin" : "Pin to top"}
                    onClick={() => update(i, { pinned: !i.pinned })} style={{ color: i.pinned ? "var(--orange-deep)" : "var(--faint)", background: i.pinned ? "var(--yellow-tint)" : undefined }}>
                    <Icon name="pin" size={17} />
                  </button>
                </div>
                {i.body && <p style={{ margin: 0, whiteSpace: "pre-line", color: "#3B454B", lineHeight: 1.55 }}>{i.body}</p>}
                <div className="row small muted">
                  {i.category && <span className="chip">{i.category}</span>}
                  <span>{shortDate(i.created_at)}</span>
                </div>
                <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <select className={`input pill ${st.tone}`} aria-label="Idea status" value={i.status} onChange={(e) => update(i, { status: e.target.value as IdeaStatus })}
                    style={{ width: "auto", height: 32, padding: "0 10px", border: 0, fontSize: 12.5 }}>
                    {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <span className="spacer" />
                  <button className="btn ghost sm" onClick={() => setEdit(i)}>Edit</button>
                  <button className="icon-btn" aria-label="Delete idea" onClick={() => remove(i)}><Icon name="trash" size={15} /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {edit && <IdeaModal idea={edit} categories={categories} onClose={() => setEdit(null)} onSaved={(i) => { setEdit(null); replace(i); }} />}
    </>
  );
}

function QuickCapture({ categories, onAdded }: { categories: string[]; onAdded: (i: Idea) => void }) {
  const [f, setF] = useState({ title: "", body: "", category: "" });
  const { run, busy } = useAction();
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!f.title.trim()) return;
    const out = await run(() => api.post<Idea>("/ideas", f), "Idea saved");
    if (out) { onAdded(out); setF({ title: "", body: "", category: f.category }); }
  };
  return (
    <form className="card stack" style={{ gap: 10, background: "var(--yellow-tint)", borderColor: "#F7E3A6" }} onSubmit={save}>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <span style={{ color: "var(--yellow-ink)" }}><Icon name="ideas" size={22} /></span>
        <input className="input" aria-label="Idea title" placeholder="What's the idea?" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
          style={{ height: 46, fontSize: 16, fontWeight: 600 }} />
      </div>
      <textarea className="input" rows={3} aria-label="Details" placeholder="Details, links, who it's for… (optional)" value={f.body}
        onChange={(e) => setF({ ...f, body: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }} />
      <div className="row">
        <input className="input" list="idea-categories" aria-label="Category" placeholder="Category (optional)" value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: 220 }} />
        <datalist id="idea-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <span className="small muted">Enter in the title, or Ctrl + Enter in details, to save</span>
        <span className="spacer" />
        <button className="btn" type="submit" disabled={busy || !f.title.trim()}>Save idea</button>
      </div>
    </form>
  );
}

function IdeaModal({ idea, categories, onClose, onSaved }: { idea: Idea; categories: string[]; onClose: () => void; onSaved: (i: Idea) => void }) {
  const [f, setF] = useState({ title: idea.title, body: idea.body, category: idea.category, status: idea.status, pinned: idea.pinned });
  const { run, busy } = useAction();
  const save = async () => {
    const out = await run(() => api.put<Idea>(`/ideas/${idea.id}`, f), "Idea updated");
    if (out) onSaved(out);
  };
  return (
    <Modal title="Edit idea" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !f.title.trim()} onClick={save}>Save</button></>}>
      <Field label="Idea"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Details"><textarea rows={7} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <div className="form-grid">
        <Field label="Category">
          <input list="idea-categories-edit" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <datalist id="idea-categories-edit">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as IdeaStatus })}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />Pin to the top</label>
    </Modal>
  );
}
