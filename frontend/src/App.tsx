import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, getToken } from "./api";
import Layout from "./components/Layout";
import { Loading } from "./components/ui";
import type { CompanySettings, User } from "./types";
import Login from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Clients from "./pages/Clients";
import Quotations from "./pages/Quotations";
import QuotationEditor from "./pages/QuotationEditor";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Projects from "./pages/Projects";
import Training from "./pages/Training";
import Team from "./pages/Team";
import Settings from "./pages/Settings";
import Ideas from "./pages/Ideas";
import { PrintInvoice, PrintQuotation } from "./pages/Print";
import Portal from "./pages/Portal";

type Ctx = { user: User; settings: CompanySettings; refreshSettings: () => void };
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

function Authed() {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const loc = useLocation();
  const refreshSettings = useCallback(() => {
    api.get<CompanySettings>("/settings").then(setSettings).catch(() => {});
  }, []);
  useEffect(() => {
    if (!getToken()) return;
    api.get<User>("/auth/me").then(setUser).catch(() => {});
    refreshSettings();
  }, [refreshSettings]);

  if (!getToken()) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!user || !settings) return <Loading />;

  return (
    <AppCtx.Provider value={{ user, settings, refreshSettings }}>
      <Routes>
        <Route path="/print/quotation/:id" element={<PrintQuotation />} />
        <Route path="/print/invoice/:id" element={<PrintInvoice />} />
        <Route element={<Layout user={user} />}>
          <Route index element={<DashboardPage />} />
          <Route path="leads" element={<Leads />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<Clients />} />
          <Route path="quotations" element={<Quotations />} />
          <Route path="quotations/new" element={<QuotationEditor />} />
          <Route path="quotations/:id" element={<QuotationEditor />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="projects" element={<Projects />} />
          <Route path="training" element={<Training />} />
          <Route path="team" element={<Team />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppCtx.Provider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/portal/:token" element={<Portal />} />
      <Route path="/*" element={<Authed />} />
    </Routes>
  );
}
