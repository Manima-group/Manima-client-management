"""Request bodies. Updates use model_dump(exclude_unset=True), so every field is optional."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    email: str
    password: str


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class SettingsIn(BaseModel):
    brand_name: Optional[str] = None
    company_name: Optional[str] = None
    owner_name: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    bank_details: Optional[str] = None
    quotation_prefix: Optional[str] = None
    quotation_next: Optional[int] = None
    invoice_prefix: Optional[str] = None
    invoice_next: Optional[int] = None
    default_gst_rate: Optional[float] = None
    invoice_due_days: Optional[int] = None
    default_terms: Optional[list[dict]] = None


class ClientIn(BaseModel):
    company: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    city: Optional[str] = None
    gstin: Optional[str] = None
    notes: Optional[str] = None
    portal_enabled: Optional[bool] = None


class LeadIn(BaseModel):
    contact_name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    source: Optional[str] = None
    kind: Optional[str] = None
    value: Optional[float] = None
    stage: Optional[str] = None
    follow_up: Optional[date] = None
    notes: Optional[str] = None


class ItemIn(BaseModel):
    title: str = ""
    description: str = ""
    unit: str = "Project"
    qty: float = 1
    rate: float = 0
    quoted_on_selection: bool = False


class StageIn(BaseModel):
    milestone: str = ""
    description: str = ""
    share: float = 0


class TermIn(BaseModel):
    title: str = ""
    text: str = ""
    included: bool = True
    auto: bool = False


class QuotationIn(BaseModel):
    number: Optional[str] = None
    client_id: Optional[int] = None
    issue_date: Optional[date] = None
    validity_days: Optional[int] = None
    project: Optional[str] = None
    to_name: Optional[str] = None
    to_company: Optional[str] = None
    to_email: Optional[str] = None
    to_phone: Optional[str] = None
    to_website: Optional[str] = None
    salutation: Optional[str] = None
    intro: Optional[str] = None
    gst_mode: Optional[str] = None
    gst_rate: Optional[float] = None
    discount: Optional[float] = None
    closing: Optional[str] = None
    show_signature: Optional[bool] = None
    status: Optional[str] = None
    items: Optional[list[ItemIn]] = None
    stages: Optional[list[StageIn]] = None
    terms: Optional[list[TermIn]] = None


class InvoiceItemIn(BaseModel):
    title: str = ""
    description: str = ""
    unit: str = "Project"
    qty: float = 1
    rate: float = 0


class InvoiceIn(BaseModel):
    client_id: Optional[int] = None
    bill_to: Optional[str] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    gst_rate: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[list[InvoiceItemIn]] = None


class PaymentIn(BaseModel):
    amount: Optional[float] = None  # None = pay the full balance
    paid_on: Optional[date] = None
    method: str = "Bank transfer"
    note: str = ""


class TrainingIn(BaseModel):
    kind: Optional[str] = None
    name: Optional[str] = None
    area: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    programme: Optional[str] = None
    topics: Optional[list[str]] = None
    days: Optional[int] = Field(default=None, ge=1, le=120)
    timing: Optional[str] = None
    start_date: Optional[date] = None
    people: Optional[int] = None
    pricing_model: Optional[str] = None
    rate: Optional[float] = None
    status: Optional[str] = None
    client_id: Optional[int] = None
    notes: Optional[str] = None
    session_topics: Optional[list[str]] = None


class SessionIn(BaseModel):
    topic: Optional[str] = None
    session_date: Optional[date] = None
    done: Optional[bool] = None
    attendance: Optional[int] = None
    notes: Optional[str] = None


class TeamMemberIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    create_login: bool = False
    password: Optional[str] = None


class MemberEntryIn(BaseModel):
    kind: str  # earned | paid
    amount: Optional[float] = None  # for "paid", None = settle everything owed
    entry_date: Optional[date] = None
    project_id: Optional[int] = None
    note: str = ""


class ProjectIn(BaseModel):
    name: Optional[str] = None
    client_id: Optional[int] = None
    due_date: Optional[date] = None
    status: Optional[str] = None
    description: Optional[str] = None


class TaskIn(BaseModel):
    title: Optional[str] = None
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None
    done: Optional[bool] = None
    visible_to_client: Optional[bool] = None


class MeetingIn(BaseModel):
    title: Optional[str] = None
    starts_at: Optional[datetime] = None
    location: Optional[str] = None
    client_id: Optional[int] = None
    lead_id: Optional[int] = None
    notes: Optional[str] = None


class SignIn(BaseModel):
    name: str = Field(min_length=2)
