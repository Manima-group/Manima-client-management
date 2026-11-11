"""Calculations, numbering and JSON serialisers shared by the routers."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m

DEFAULT_TERMS = [
    {"title": "Payment Terms", "text": "", "included": True, "auto": True},
    {"title": "Timeline", "text": "To be finalized mutually once the scope is confirmed in writing."},
    {"title": "Scope", "text": "Any requirement beyond the scope described above will be quoted separately."},
    {"title": "Change Requests", "text": "Any changes to the approved requirements, design, workflow, or functionality may affect the project cost and timeline. Additional work will be started only after client approval."},
    {"title": "Hosting", "text": "Hosting setup charge depends on the platform/plan selected by the client; domain registration and cloud/server subscription costs are excluded and billed separately at actuals.", "included": False},
    {"title": "Third-Party Services", "text": "Any paid APIs, plugins, software licenses, subscriptions, or third-party services required for the project are not included unless specifically mentioned and will be billed separately."},
    {"title": "Client Responsibilities", "text": "{client} will provide the required content, information, approvals, credentials, and access needed to complete the project. Delays in providing these may affect the project timeline."},
    {"title": "Source Code", "text": "Applicable project-specific source code will be handed over after receipt of full payment for the project."},
    {"title": "Maintenance", "text": "Ongoing maintenance, server management, security updates, upgrades, and future development are not included unless separately agreed."},
    {"title": "Testing & Approval", "text": "Manima will test the agreed functionality before delivery. The project will be considered accepted upon client approval or production deployment/go-live."},
    {"title": "Confidentiality", "text": "Both parties will maintain confidentiality of non-public business, technical, and project-related information shared during the engagement."},
    {"title": "Cancellation & Refunds", "text": "If the project is cancelled after commencement, payment for completed work and approved expenses will remain payable. Payments for completed work and non-refundable third-party expenses are non-refundable."},
    {"title": "Taxes", "text": "Prices are exclusive of applicable taxes. GST or other applicable taxes, if any, will be charged additionally at actuals."},
    {"title": "Project Handover", "text": "Final handover of the agreed deliverables will be completed after delivery and settlement of all outstanding payments."},
]

DEFAULT_INTRO = (
    "Thank you for the opportunity to work with {client}. Following our discussion, please find our "
    "quotation below, along with the payment schedule."
)
DEFAULT_CLOSING = (
    "We look forward to working with {client}. Please let us know if you have any questions or would like to proceed."
)


def iso(d: date | datetime | None) -> str | None:
    return d.isoformat() if d else None


# ---------- settings & numbering ----------

def get_settings(db: Session) -> m.CompanySettings:
    s = db.scalars(select(m.CompanySettings)).first()
    if s is None:
        s = m.CompanySettings(default_terms=DEFAULT_TERMS)
        db.add(s)
        db.commit()
    if not s.default_terms:
        s.default_terms = DEFAULT_TERMS
        db.commit()
    return s


def next_quotation_number(db: Session) -> str:
    s = get_settings(db)
    prefix = s.quotation_prefix.replace("{year}", str(date.today().year))
    while True:
        number = f"{prefix}{s.quotation_next:03d}"
        s.quotation_next += 1
        if not db.scalars(select(m.Quotation).where(m.Quotation.number == number)).first():
            return number


def next_invoice_number(db: Session) -> str:
    s = get_settings(db)
    while True:
        number = f"{s.invoice_prefix}{s.invoice_next:04d}"
        s.invoice_next += 1
        if not db.scalars(select(m.Invoice).where(m.Invoice.number == number)).first():
            return number


def settings_out(s: m.CompanySettings) -> dict:
    return {
        k: getattr(s, k)
        for k in (
            "brand_name", "company_name", "owner_name", "website", "email", "phone", "linkedin", "gstin",
            "address", "bank_details", "quotation_prefix", "quotation_next", "invoice_prefix", "invoice_next",
            "default_gst_rate", "invoice_due_days", "default_terms",
        )
    }


# ---------- clients & leads ----------

def client_out(c: m.Client, stats: dict | None = None) -> dict:
    out = {
        "id": c.id, "company": c.company, "contact_name": c.contact_name, "email": c.email, "phone": c.phone,
        "website": c.website, "industry": c.industry, "city": c.city, "gstin": c.gstin, "notes": c.notes,
        "portal_enabled": c.portal_enabled, "portal_token": c.portal_token, "created_at": iso(c.created_at),
    }
    if stats is not None:
        out.update(stats)
    return out


def lead_out(l: m.Lead) -> dict:
    return {
        "id": l.id, "contact_name": l.contact_name, "company": l.company, "email": l.email, "phone": l.phone,
        "source": l.source, "kind": l.kind, "value": l.value, "stage": l.stage, "follow_up": iso(l.follow_up),
        "notes": l.notes, "client_id": l.client_id, "created_at": iso(l.created_at),
    }


# ---------- quotations ----------

def quotation_totals(q: m.Quotation) -> dict:
    subtotal = sum(i.qty * i.rate for i in q.items if not i.quoted_on_selection)
    discount = min(q.discount or 0, subtotal)
    taxable = subtotal - discount
    gst = taxable * q.gst_rate / 100 if q.gst_mode == "add" else 0
    total = taxable + gst
    share_total = sum(s.share for s in q.stages)
    return {
        "subtotal": round(subtotal, 2), "discount": round(discount, 2), "taxable": round(taxable, 2),
        "gst": round(gst, 2), "total": round(total, 2), "share_total": share_total,
        "has_on_selection": any(i.quoted_on_selection for i in q.items),
    }


def quotation_out(q: m.Quotation, full: bool = True) -> dict:
    t = quotation_totals(q)
    valid_till = q.issue_date + timedelta(days=q.validity_days) if q.issue_date else None
    out = {
        "id": q.id, "number": q.number, "client_id": q.client_id, "issue_date": iso(q.issue_date),
        "validity_days": q.validity_days, "valid_till": iso(valid_till), "project": q.project,
        "to_name": q.to_name, "to_company": q.to_company, "to_email": q.to_email, "to_phone": q.to_phone,
        "to_website": q.to_website, "salutation": q.salutation, "status": q.status,
        "signed_by": q.signed_by, "signed_at": iso(q.signed_at), "gst_mode": q.gst_mode, "gst_rate": q.gst_rate,
        "discount": q.discount, "created_at": iso(q.created_at), "updated_at": iso(q.updated_at), **t,
    }
    if full:
        out.update({
            "intro": q.intro, "closing": q.closing, "show_signature": q.show_signature,
            "items": [
                {"id": i.id, "title": i.title, "description": i.description, "unit": i.unit, "qty": i.qty,
                 "rate": i.rate, "quoted_on_selection": i.quoted_on_selection}
                for i in q.items
            ],
            "stages": [
                {"id": s.id, "milestone": s.milestone, "description": s.description, "share": s.share}
                for s in q.stages
            ],
            "terms": [
                {"id": tm.id, "title": tm.title, "text": tm.text, "included": tm.included, "auto": tm.auto}
                for tm in q.terms
            ],
        })
    return out


# ---------- invoices ----------

def invoice_totals(inv: m.Invoice) -> dict:
    subtotal = sum(i.qty * i.rate for i in inv.items)
    gst = subtotal * (inv.gst_rate or 0) / 100
    total = subtotal + gst
    paid = sum(p.amount for p in inv.payments)
    balance = max(total - paid, 0)
    status = inv.status
    if status != "cancelled":
        if total > 0 and balance < 0.5 and status != "draft":
            status = "paid"
        elif status == "paid" and balance >= 0.5:
            status = "sent"
        if status == "sent" and inv.due_date and inv.due_date < date.today():
            status = "overdue"
    return {
        "subtotal": round(subtotal, 2), "gst": round(gst, 2), "total": round(total, 2),
        "paid": round(paid, 2), "balance": round(balance, 2), "effective_status": status,
    }


def invoice_out(inv: m.Invoice, full: bool = True) -> dict:
    out = {
        "id": inv.id, "number": inv.number, "client_id": inv.client_id,
        "client_name": inv.bill_to or (inv.client.company if inv.client else ""),
        "bill_to": inv.bill_to, "quotation_id": inv.quotation_id, "training_id": inv.training_id,
        "kind": inv.kind, "issue_date": iso(inv.issue_date), "due_date": iso(inv.due_date),
        "gst_rate": inv.gst_rate, "status": inv.status, "notes": inv.notes, **invoice_totals(inv),
    }
    if full:
        c = inv.client
        out["client"] = client_out(c) if c else None
        out["items"] = [
            {"id": i.id, "title": i.title, "description": i.description, "unit": i.unit, "qty": i.qty, "rate": i.rate}
            for i in inv.items
        ]
        out["payments"] = [
            {"id": p.id, "amount": p.amount, "paid_on": iso(p.paid_on), "method": p.method, "note": p.note}
            for p in inv.payments
        ]
    return out


# ---------- training ----------

def training_fee(t: m.Training) -> float:
    if t.pricing_model == "per_head":
        return t.rate * t.people
    if t.pricing_model == "per_day":
        return t.rate * t.days
    return t.rate


def training_out(t: m.Training, db: Session | None = None, full: bool = True) -> dict:
    fee = training_fee(t)
    paid = sum(p.amount for p in t.payments)
    done = sum(1 for s in t.sessions if s.done)
    next_session = next((s for s in t.sessions if not s.done), None)
    invoiced = 0.0
    if db is not None:
        invs = db.scalars(select(m.Invoice).where(m.Invoice.training_id == t.id, m.Invoice.status != "cancelled")).all()
        invoiced = sum(sum(i.qty * i.rate for i in inv.items) for inv in invs)
    out = {
        "id": t.id, "kind": t.kind, "name": t.name, "area": t.area, "contact_name": t.contact_name,
        "contact_phone": t.contact_phone, "contact_email": t.contact_email, "programme": t.programme,
        "topics": t.topics or [], "days": t.days, "timing": t.timing, "start_date": iso(t.start_date),
        "people": t.people, "pricing_model": t.pricing_model, "rate": t.rate, "status": t.status,
        "client_id": t.client_id, "notes": t.notes,
        "fee": round(fee, 2), "paid": round(paid, 2), "balance": round(max(fee - paid, 0), 2),
        "invoiced": round(invoiced, 2), "uninvoiced": round(max(fee - invoiced, 0), 2),
        "days_done": done, "days_left": max(t.days - done, 0),
        "next_topic": next_session.topic if next_session else None,
        "next_date": iso(next_session.session_date) if next_session else None,
    }
    if full:
        out["sessions"] = [
            {"id": s.id, "day_no": s.day_no, "topic": s.topic, "session_date": iso(s.session_date), "done": s.done,
             "attendance": s.attendance, "notes": s.notes}
            for s in t.sessions
        ]
        out["payments"] = [
            {"id": p.id, "amount": p.amount, "paid_on": iso(p.paid_on), "method": p.method, "note": p.note}
            for p in t.payments
        ]
    return out


def sync_sessions(t: m.Training) -> None:
    """Keep one session row per teaching day."""
    current = len(t.sessions)
    if current < t.days:
        for n in range(current + 1, t.days + 1):
            t.sessions.append(m.TrainingSession(day_no=n, topic=""))
    elif current > t.days:
        keep = [s for s in t.sessions if s.day_no <= t.days]
        t.sessions[:] = keep


# ---------- team & projects ----------

def member_out(tm: m.TeamMember, project_names: list[str] | None = None) -> dict:
    earned = sum(e.amount for e in tm.entries if e.kind == "earned")
    paid = sum(e.amount for e in tm.entries if e.kind == "paid")
    return {
        "id": tm.id, "name": tm.name, "email": tm.email, "phone": tm.phone, "role": tm.role, "active": tm.active,
        "has_login": tm.user_id is not None, "earned": round(earned, 2), "paid": round(paid, 2),
        "owed": round(max(earned - paid, 0), 2), "projects": project_names or [],
        "entries": [
            {"id": e.id, "kind": e.kind, "amount": e.amount, "entry_date": iso(e.entry_date), "note": e.note,
             "project_id": e.project_id}
            for e in tm.entries
        ],
    }


def project_out(p: m.Project) -> dict:
    total = len(p.tasks)
    done = sum(1 for t in p.tasks if t.done)
    return {
        "id": p.id, "name": p.name, "client_id": p.client_id, "client_name": p.client.company if p.client else "",
        "quotation_id": p.quotation_id, "due_date": iso(p.due_date), "status": p.status,
        "description": p.description, "progress": round(100 * done / total) if total else 0,
        "tasks_done": done, "tasks_total": total,
        "tasks": [
            {"id": t.id, "title": t.title, "assignee_id": t.assignee_id,
             "assignee_name": t.assignee.name if t.assignee else "", "due_date": iso(t.due_date), "done": t.done,
             "visible_to_client": t.visible_to_client}
            for t in p.tasks
        ],
    }


def meeting_out(mt: m.Meeting) -> dict:
    return {
        "id": mt.id, "title": mt.title, "starts_at": iso(mt.starts_at), "location": mt.location,
        "client_id": mt.client_id, "lead_id": mt.lead_id, "notes": mt.notes,
    }
