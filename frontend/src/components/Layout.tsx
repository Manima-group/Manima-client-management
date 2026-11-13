import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { initials } from "../format";
import type { Dashboard, User } from "../types";
import { Icon } from "./ui";

const NAV: { to: string; label: string; icon: string; count?: keyof Dashboard["counts"] }[] = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/leads", label: "Leads", icon: "leads", count: "leads" },
  { to: "/clients", label: "Clients", icon: "clients" },
  { to: "/quotations", label: "Quotations", icon: "quotations" },
  { to: "/invoices", label: "Invoices", icon: "invoices", count: "overdue" },
  { to: "/projects", label: "Projects", icon: "projects", count: "projects" },
  { to: "/training", label: "Training", icon: "training", count: "training" },
  { to: "/team", label: "Team", icon: "team" },
  { to: "/ideas", label: "Ideas", icon: "ideas" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export default function Layout({ user }: { user: User }) {
  const [counts, setCounts] = useState<Dashboard["counts"] | null>(null);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    setOpen(false);
    api.get<Dashboard>("/dashboard").then((d) => setCounts(d.counts)).catch(() => {});
  }, [loc.pathname]);

  const logout = () => {
    setToken(null);
    nav("/login");
  };

  return (
    <div className="app">
      <div className="mobile-bar no-print">
        <button type="button" className="icon-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
        <b>Manima Hub</b>
      </div>
      <aside className={`side no-print${open ? " open" : ""}`}>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <NavLink to="/" className="brand">
            <div className="logo"><img src="/manima-logo.png" alt="" /></div>
            <div><b>Manima Hub</b><span>Client workspace</span></div>
          </NavLink>
          {open && <button type="button" className="icon-btn" aria-label="Close menu" onClick={() => setOpen(false)} style={{ marginLeft: "auto" }}><Icon name="close" /></button>}
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => {
            const c = n.count && counts ? counts[n.count] : 0;
            return (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon name={n.icon} />{n.label}
                {c ? <span className="badge">{c}</span> : null}
              </NavLink>
            );
          })}
        </nav>
        <div className="me">
          <div className="avatar">{initials(user.name)}</div>
          <div className="who"><b>{user.name}</b><span>{user.role === "owner" ? "Owner" : "Team"} · Manima</span></div>
          <button type="button" className="icon-btn" aria-label="Sign out" title="Sign out" onClick={logout}><Icon name="logout" /></button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
