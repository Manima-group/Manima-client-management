from __future__ import annotations

import secrets
from datetime import date, datetime
from typing import Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.utcnow()


def new_token() -> str:
    return secrets.token_urlsafe(24)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="owner")  # owner | member
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CompanySettings(Base):
    """Single row holding Manima's own details used on quotations and invoices."""

    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    brand_name: Mapped[str] = mapped_column(String(60), default="MANIMA")
    company_name: Mapped[str] = mapped_column(String(120), default="Manima")
    owner_name: Mapped[str] = mapped_column(String(120), default="Sai Naveen")
    website: Mapped[str] = mapped_column(String(120), default="www.manima.co.in")
    email: Mapped[str] = mapped_column(String(120), default="business@manima.co.in")
    phone: Mapped[str] = mapped_column(String(40), default="+91 93912 67369")
    linkedin: Mapped[str] = mapped_column(String(160), default="linkedin.com/in/sainaveenadepu666")
    gstin: Mapped[str] = mapped_column(String(30), default="36BXKPA2279R1ZU")
    address: Mapped[str] = mapped_column(Text, default="Hyderabad, Telangana")
    bank_details: Mapped[str] = mapped_column(Text, default="")
    quotation_prefix: Mapped[str] = mapped_column(String(30), default="MNM/{year}/")
    quotation_next: Mapped[int] = mapped_column(Integer, default=1)
    invoice_prefix: Mapped[str] = mapped_column(String(30), default="INV-")
    invoice_next: Mapped[int] = mapped_column(Integer, default=1)
    default_gst_rate: Mapped[float] = mapped_column(Float, default=18.0)
    invoice_due_days: Mapped[int] = mapped_column(Integer, default=15)
    default_terms: Mapped[list] = mapped_column(JSON, default=list)


class Client(Base):
    __tablename__ = "clients"
    id: Mapped[int] = mapped_column(primary_key=True)
    company: Mapped[str] = mapped_column(String(160))
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    website: Mapped[str] = mapped_column(String(160), default="")
    industry: Mapped[str] = mapped_column(String(120), default="")
    city: Mapped[str] = mapped_column(String(80), default="")
    gstin: Mapped[str] = mapped_column(String(30), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    portal_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    portal_token: Mapped[str] = mapped_column(String(64), default=new_token, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[int] = mapped_column(primary_key=True)
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    company: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(160), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    source: Mapped[str] = mapped_column(String(60), default="")
    kind: Mapped[str] = mapped_column(String(20), default="service")  # service | college | corporate
    value: Mapped[float] = mapped_column(Float, default=0)
    stage: Mapped[str] = mapped_column(String(20), default="new")  # new | contacted | proposal | won | lost
    follow_up: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Quotation(Base):
    __tablename__ = "quotations"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    issue_date: Mapped[date] = mapped_column(Date, default=date.today)
    validity_days: Mapped[int] = mapped_column(Integer, default=30)
    project: Mapped[str] = mapped_column(String(200), default="")
    to_name: Mapped[str] = mapped_column(String(120), default="")
    to_company: Mapped[str] = mapped_column(String(160), default="")
    to_email: Mapped[str] = mapped_column(String(160), default="")
    to_phone: Mapped[str] = mapped_column(String(40), default="")
    to_website: Mapped[str] = mapped_column(String(160), default="")
    salutation: Mapped[str] = mapped_column(String(20), default="Sir")
    intro: Mapped[str] = mapped_column(Text, default="")
    gst_mode: Mapped[str] = mapped_column(String(10), default="excl")  # excl | add | none
    gst_rate: Mapped[float] = mapped_column(Float, default=18.0)
    discount: Mapped[float] = mapped_column(Float, default=0)
    closing: Mapped[str] = mapped_column(Text, default="")
    show_signature: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | sent | approved | rejected | invoiced
    signed_by: Mapped[str] = mapped_column(String(120), default="")
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    client: Mapped[Optional[Client]] = relationship()
    items: Mapped[list["QuotationItem"]] = relationship(cascade="all, delete-orphan", order_by="QuotationItem.position")
    stages: Mapped[list["PaymentStage"]] = relationship(cascade="all, delete-orphan", order_by="PaymentStage.position")
    terms: Mapped[list["QuotationTerm"]] = relationship(cascade="all, delete-orphan", order_by="QuotationTerm.position")


class QuotationItem(Base):
    __tablename__ = "quotation_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    quotation_id: Mapped[int] = mapped_column(ForeignKey("quotations.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    unit: Mapped[str] = mapped_column(String(40), default="Project")
    qty: Mapped[float] = mapped_column(Float, default=1)
    rate: Mapped[float] = mapped_column(Float, default=0)
    quoted_on_selection: Mapped[bool] = mapped_column(Boolean, default=False)


class PaymentStage(Base):
    __tablename__ = "payment_stages"
    id: Mapped[int] = mapped_column(primary_key=True)
    quotation_id: Mapped[int] = mapped_column(ForeignKey("quotations.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    milestone: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    share: Mapped[float] = mapped_column(Float, default=0)


class QuotationTerm(Base):
    __tablename__ = "quotation_terms"
    id: Mapped[int] = mapped_column(primary_key=True)
    quotation_id: Mapped[int] = mapped_column(ForeignKey("quotations.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(120), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    included: Mapped[bool] = mapped_column(Boolean, default=True)
    auto: Mapped[bool] = mapped_column(Boolean, default=False)


class Training(Base):
    __tablename__ = "trainings"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), default="college")  # college | corporate
    name: Mapped[str] = mapped_column(String(160))
    area: Mapped[str] = mapped_column(String(160), default="")
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    contact_phone: Mapped[str] = mapped_column(String(40), default="")
    contact_email: Mapped[str] = mapped_column(String(160), default="")
    programme: Mapped[str] = mapped_column(String(200), default="")
    topics: Mapped[list] = mapped_column(JSON, default=list)
    days: Mapped[int] = mapped_column(Integer, default=7)
    timing: Mapped[str] = mapped_column(String(80), default="")
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    people: Mapped[int] = mapped_column(Integer, default=0)
    pricing_model: Mapped[str] = mapped_column(String(20), default="per_head")  # per_head | per_day | fixed
    rate: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="proposal")  # proposal | confirmed | ongoing | completed | cancelled
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    sessions: Mapped[list["TrainingSession"]] = relationship(cascade="all, delete-orphan", order_by="TrainingSession.day_no")
    payments: Mapped[list["TrainingPayment"]] = relationship(cascade="all, delete-orphan", order_by="TrainingPayment.paid_on")


class TrainingSession(Base):
    __tablename__ = "training_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    training_id: Mapped[int] = mapped_column(ForeignKey("trainings.id", ondelete="CASCADE"))
    day_no: Mapped[int] = mapped_column(Integer)
    topic: Mapped[str] = mapped_column(String(200), default="")
    session_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    attendance: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class TrainingPayment(Base):
    __tablename__ = "training_payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    training_id: Mapped[int] = mapped_column(ForeignKey("trainings.id", ondelete="CASCADE"))
    amount: Mapped[float] = mapped_column(Float)
    paid_on: Mapped[date] = mapped_column(Date, default=date.today)
    method: Mapped[str] = mapped_column(String(40), default="Bank transfer")
    note: Mapped[str] = mapped_column(String(200), default="")


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    bill_to: Mapped[str] = mapped_column(String(200), default="")
    quotation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("quotations.id", ondelete="SET NULL"), nullable=True)
    training_id: Mapped[Optional[int]] = mapped_column(ForeignKey("trainings.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), default="service")  # service | training
    issue_date: Mapped[date] = mapped_column(Date, default=date.today)
    due_date: Mapped[date] = mapped_column(Date, default=date.today)
    gst_rate: Mapped[float] = mapped_column(Float, default=18.0)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | sent | paid | cancelled
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    client: Mapped[Optional[Client]] = relationship()
    items: Mapped[list["InvoiceItem"]] = relationship(cascade="all, delete-orphan", order_by="InvoiceItem.position")
    payments: Mapped[list["InvoicePayment"]] = relationship(cascade="all, delete-orphan", order_by="InvoicePayment.paid_on")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    unit: Mapped[str] = mapped_column(String(40), default="Project")
    qty: Mapped[float] = mapped_column(Float, default=1)
    rate: Mapped[float] = mapped_column(Float, default=0)


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"))
    amount: Mapped[float] = mapped_column(Float)
    paid_on: Mapped[date] = mapped_column(Date, default=date.today)
    method: Mapped[str] = mapped_column(String(40), default="Bank transfer")
    note: Mapped[str] = mapped_column(String(200), default="")


class TeamMember(Base):
    __tablename__ = "team_members"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    role: Mapped[str] = mapped_column(String(80), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    entries: Mapped[list["MemberEntry"]] = relationship(cascade="all, delete-orphan", order_by="MemberEntry.entry_date")


class MemberEntry(Base):
    """Money owed to (earned) or paid to a team member."""

    __tablename__ = "member_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("team_members.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))  # earned | paid
    amount: Mapped[float] = mapped_column(Float)
    entry_date: Mapped[date] = mapped_column(Date, default=date.today)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    note: Mapped[str] = mapped_column(String(200), default="")


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    quotation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("quotations.id", ondelete="SET NULL"), nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | on_hold | completed
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    client: Mapped[Optional[Client]] = relationship()
    tasks: Mapped[list["Task"]] = relationship(cascade="all, delete-orphan", order_by="Task.position")


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(200))
    assignee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    visible_to_client: Mapped[bool] = mapped_column(Boolean, default=True)

    assignee: Mapped[Optional[TeamMember]] = relationship()


class Meeting(Base):
    __tablename__ = "meetings"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    location: Mapped[str] = mapped_column(String(160), default="")
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    lead_id: Mapped[Optional[int]] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class Idea(Base):
    __tablename__ = "ideas"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), default="")
    status: Mapped[str] = mapped_column(String(20), default="new")  # new | exploring | doing | done | parked
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
