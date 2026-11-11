export type User = { id: number; name: string; email: string; role: "owner" | "member" };

export type Term = { id?: number; title: string; text: string; included: boolean; auto: boolean };

export type CompanySettings = {
  brand_name: string; company_name: string; owner_name: string; website: string; email: string; phone: string;
  linkedin: string; gstin: string; address: string; bank_details: string; quotation_prefix: string;
  quotation_next: number; invoice_prefix: string; invoice_next: number; default_gst_rate: number;
  invoice_due_days: number; default_terms: Term[];
};

export type Client = {
  id: number; company: string; contact_name: string; email: string; phone: string; website: string;
  industry: string; city: string; gstin: string; notes: string; portal_enabled: boolean; portal_token: string;
  billed?: number; outstanding?: number; projects_count?: number; active_projects?: number;
};

export type HistoryItem = { date: string; kind: string; text: string };

export type ClientDetail = Client & {
  quotations: QuotationSummary[]; invoices: InvoiceSummary[]; projects: Project[]; trainings: Training[];
  meetings: Meeting[]; history: HistoryItem[];
};

export type LeadStage = "new" | "contacted" | "proposal" | "won" | "lost";
export type Lead = {
  id: number; contact_name: string; company: string; email: string; phone: string; source: string;
  kind: string; value: number; stage: LeadStage; follow_up: string | null; notes: string; client_id: number | null;
};

export type QuotationItem = {
  id?: number; title: string; description: string; unit: string; qty: number; rate: number; quoted_on_selection: boolean;
};
export type PaymentStage = { id?: number; milestone: string; description: string; share: number };

export type QuotationSummary = {
  id: number; number: string; client_id: number | null; issue_date: string; validity_days: number;
  valid_till: string; project: string; to_name: string; to_company: string; to_email: string; to_phone: string;
  to_website: string; salutation: string; status: string; signed_by: string; signed_at: string | null;
  gst_mode: "excl" | "add" | "none"; gst_rate: number; discount: number; subtotal: number; taxable: number;
  gst: number; total: number; share_total: number; has_on_selection: boolean;
};

export type Quotation = Omit<QuotationSummary, "id"> & {
  id: number | null; intro: string; closing: string; show_signature: boolean;
  items: QuotationItem[]; stages: PaymentStage[]; terms: Term[];
};

export type InvoiceItem = { id?: number; title: string; description: string; unit: string; qty: number; rate: number };
export type Payment = { id: number; amount: number; paid_on: string; method: string; note: string };

export type InvoiceSummary = {
  id: number; number: string; client_id: number | null; client_name: string; bill_to: string;
  quotation_id: number | null; training_id: number | null; kind: string; issue_date: string; due_date: string;
  gst_rate: number; status: string; notes: string; subtotal: number; gst: number; total: number; paid: number;
  balance: number; effective_status: string;
};
export type Invoice = InvoiceSummary & { client: Client | null; items: InvoiceItem[]; payments: Payment[] };

export type TrainingSession = {
  id: number; day_no: number; topic: string; session_date: string | null; done: boolean;
  attendance: number | null; notes: string;
};
export type Training = {
  id: number; kind: "college" | "corporate"; name: string; area: string; contact_name: string;
  contact_phone: string; contact_email: string; programme: string; topics: string[]; days: number; timing: string;
  start_date: string | null; people: number; pricing_model: "per_head" | "per_day" | "fixed"; rate: number;
  status: string; client_id: number | null; notes: string; fee: number; paid: number; balance: number;
  invoiced: number; uninvoiced: number; days_done: number; days_left: number; next_topic: string | null;
  next_date: string | null; sessions?: TrainingSession[]; payments?: Payment[];
};

export type Task = {
  id: number; title: string; assignee_id: number | null; assignee_name: string; due_date: string | null;
  done: boolean; visible_to_client: boolean;
};
export type Project = {
  id: number; name: string; client_id: number | null; client_name: string; quotation_id: number | null;
  due_date: string | null; status: string; description: string; progress: number; tasks_done: number;
  tasks_total: number; tasks: Task[];
};

export type MemberEntry = { id: number; kind: "earned" | "paid"; amount: number; entry_date: string; note: string };
export type TeamMember = {
  id: number; name: string; email: string; phone: string; role: string; active: boolean; has_login: boolean;
  earned: number; paid: number; owed: number; projects: string[]; entries: MemberEntry[];
};

export type Meeting = {
  id: number; title: string; starts_at: string; location: string; client_id: number | null;
  lead_id: number | null; notes: string;
};

export type Dashboard = {
  kpis: {
    collected: number; collected_count: number; outstanding: number; overdue_count: number;
    active_projects: number; active_project_clients: number; pipeline: number; pipeline_count: number;
    training_days_left: number; training_due: number;
  };
  revenue: { label: string; services: number; training: number }[];
  trainings: Training[];
  documents: { type: "quotation" | "invoice"; id: number; number: string; client: string; status: string; amount: number; date: string }[];
  upcoming: { kind: string; title: string; at: string; where: string; training_id?: number }[];
  attention: { tag: string; tone: string; link: string; text: string }[];
  counts: { leads: number; overdue: number; projects: number; training: number };
};
