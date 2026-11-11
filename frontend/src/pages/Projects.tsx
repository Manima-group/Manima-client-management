import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Empty, Field, Icon, Loading, Modal, PageHead, Pill, Progress, useAction, useLoad } from "../components/ui";
import { shortDate } from "../format";
import type { Client, Project, TeamMember } from "../types";

export default function Projects() {
  const { data, setData, reload } = useLoad(() => api.get<Project[]>("/projects"));
  const { data: team } = useLoad(() => api.get<TeamMember[]>("/team"));
  const [edit, setEdit] = useState<Partial<Project> | null>(null);
  const [show, setShow] = useState("active");
  if (!data) return <Loading />;
  const list = data.filter((p) => show === "all" || p.status === show);
  const replace = (p: Project) => setData(data.map((x) => (x.id === p.id ? p : x)));

  return (
    <>
      <PageHead title="Projects" sub="Delivery boards for every active engagement.">
        <button className="btn" onClick={() => setEdit({ name: "", status: "active" })}>+ New project</button>
      </PageHead>
      <div className="tabs">
        {["active", "on_hold", "completed", "all"].map((s) => (
          <button key={s} className={`tab${show === s ? " on" : ""}`} onClick={() => setShow(s)}>
            {s === "on_hold" ? "On hold" : s.charAt(0).toUpperCase() + s.slice(1)} · {s === "all" ? data.length : data.filter((p) => p.status === s).length}
          </button>
        ))}
      </div>
      {list.length === 0 && <Empty>No projects here. Create one, or turn an approved quotation into a project.</Empty>}
      <div className="grid3">
        {list.map((p) => <ProjectCard key={p.id} p={p} team={team || []} onChange={replace} onEdit={() => setEdit(p)} />)}
      </div>
      {edit && <ProjectModal project={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function ProjectCard({ p, team, onChange, onEdit }: { p: Project; team: TeamMember[]; onChange: (p: Project) => void; onEdit: () => void }) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const { run } = useAction();
  const toggle = async (tid: number, done: boolean) => {
    const out = await run(() => api.put<Project>(`/projects/${p.id}/tasks/${tid}`, { done }));
    if (out) onChange(out);
  };
  const add = async () => {
    if (!title.trim()) return;
    const out = await run(() => api.post<Project>(`/projects/${p.id}/tasks`, { title, assignee_id: assignee ? Number(assignee) : null }));
    if (out) { onChange(out); setTitle(""); }
  };
  const del = async (tid: number) => {
    const out = await run(() => api.del(`/projects/${p.id}/tasks/${tid}`).then(() => api.get<Project[]>("/projects")));
    const fresh = out?.find((x) => x.id === p.id);
    if (fresh) onChange(fresh);
  };
  return (
    <section className="card stack" style={{ gap: 14 }}>
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="small muted strong">{p.client_name || "No client"}{p.due_date ? ` · due ${shortDate(p.due_date)}` : ""}</div>
          <h2 style={{ margin: "4px 0 0", fontSize: 18 }}>{p.name}</h2>
        </div>
        <Pill status={p.status} />
        <button className="btn ghost sm" onClick={onEdit}>Edit</button>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: 1 }}><Progress value={p.progress} /></div>
        <b className="small">{p.progress}%</b>
      </div>
      <div className="stack" style={{ gap: 2 }}>
        {p.tasks.map((t) => (
          <div key={t.id} className="row" style={{ flexWrap: "nowrap", minHeight: 44 }}>
            <label className="check" style={{ flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked={t.done} onChange={(e) => toggle(t.id, e.target.checked)} />
              <span style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--muted)" : undefined }}>{t.title}</span>
            </label>
            <span className="small muted">{t.assignee_name}</span>
            <button className="icon-btn" aria-label={`Delete task ${t.title}`} onClick={() => del(t.id)}><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input className="input" aria-label="New task" placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select className="input" aria-label="Assign to" style={{ width: 130 }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Anyone</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.name.split(" ")[0]}</option>)}
        </select>
        <button className="btn sm" onClick={add} disabled={!title.trim()}>Add</button>
      </div>
      {p.quotation_id && <Link className="small" to={`/quotations/${p.quotation_id}`}>From quotation</Link>}
    </section>
  );
}

function ProjectModal({ project, onClose, onSaved }: { project: Partial<Project>; onClose: () => void; onSaved: () => void }) {
  const { data: clients } = useLoad(() => api.get<Client[]>("/clients"));
  const [f, setF] = useState({ name: project.name || "", client_id: project.client_id ? String(project.client_id) : "", due_date: project.due_date || "", status: project.status || "active", description: project.description || "" });
  const { run, busy } = useAction();
  const save = async () => {
    const body = { ...f, client_id: f.client_id ? Number(f.client_id) : null, due_date: f.due_date || null };
    if (await run(() => (project.id ? api.put(`/projects/${project.id}`, body) : api.post("/projects", body)), "Project saved")) onSaved();
  };
  const remove = async () => {
    if (!confirm("Delete this project and its tasks?")) return;
    if (await run(() => api.del(`/projects/${project.id}`).then(() => true), "Project deleted")) onSaved();
  };
  return (
    <Modal title={project.id ? "Edit project" : "New project"} onClose={onClose}
      footer={<>{project.id && <button className="btn danger" onClick={remove}>Delete</button>}<span className="spacer" /><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !f.name} onClick={save}>Save project</button></>}>
      <div className="form-grid">
        <Field label="Project name" wide><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Client"><select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</select></Field>
        <Field label="Due date"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></Field>
        <Field label="Description" wide><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
