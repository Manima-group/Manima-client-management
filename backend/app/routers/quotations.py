from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..auth import current_user
from ..db import get_db
from ..schemas import QuotationIn
from ..services import (
    DEFAULT_CLOSING, DEFAULT_INTRO, get_settings, invoice_out, next_invoice_number, next_quotation_number,
    project_out, quotation_out, quotation_totals,
)
from .common import apply, get_or_404

router = APIRouter(prefix="/api/quotations", tags=["quotations"], dependencies=[Depends(current_user)])

STATUSES = ("draft", "sent", "approved", "rejected", "invoiced")


def _fill_lines(q: m.Quotation, data: dict) -> None:
    if "items" in data and data["items"] is not None:
        q.items[:] = [m.QuotationItem(position=i, **it) for i, it in enumerate(data["items"])]
    if "stages" in data and data["stages"] is not None:
        q.stages[:] = [m.PaymentStage(position=i, **st) for i, st in enumerate(data["stages"])]
    if "terms" in data and data["terms"] is not None:
        q.terms[:] = [m.QuotationTerm(position=i, **tm) for i, tm in enumerate(data["terms"])]


def _fill_from_client(db: Session, q: m.Quotation) -> None:
    if not q.client_id:
        return
    c = db.get(m.Client, q.client_id)
    if c is None:
        raise HTTPException(422, "Client not found")
    q.to_company = q.to_company or c.company
    q.to_name = q.to_name or c.contact_name
    q.to_email = q.to_email or c.email
    q.to_phone = q.to_phone or c.phone
    q.to_website = q.to_website or c.website


def _ensure_client(db: Session, q: m.Quotation) -> m.Client:
    """Invoices and projects belong to a client: create one from the quotation if needed."""
    if q.client_id:
        c = db.get(m.Client, q.client_id)
        if c:
            return c
    name = (q.to_company or q.to_name or "").strip()
    if not name:
        raise HTTPException(422, "Add the client's company or name first")
    c = db.scalars(select(m.Client).where(m.Client.company == name)).first()
    if c is None:
        c = m.Client(company=name, contact_name=q.to_name, email=q.to_email, phone=q.to_phone, website=q.to_website)
        db.add(c)
        db.flush()
    q.client_id = c.id
    return c


@router.get("")
def list_quotations(db: Session = Depends(get_db)):
    qs = db.scalars(select(m.Quotation).order_by(m.Quotation.created_at.desc())).all()
    return [quotation_out(q, full=False) for q in qs]


@router.get("/blank")
def blank_quotation(db: Session = Depends(get_db)):
    """A new, unsaved quotation with Manima's defaults (no items)."""
    s = get_settings(db)
    prefix = s.quotation_prefix.replace("{year}", str(date.today().year))
    return {
        "id": None, "number": f"{prefix}{s.quotation_next:03d}", "client_id": None,
        "issue_date": date.today().isoformat(), "validity_days": 30, "project": "",
        "to_name": "", "to_company": "", "to_email": "", "to_phone": "", "to_website": "", "salutation": "Sir",
        "intro": DEFAULT_INTRO, "closing": DEFAULT_CLOSING, "gst_mode": "excl", "gst_rate": s.default_gst_rate,
        "discount": 0, "show_signature": True, "status": "draft", "items": [], "stages": [],
        "terms": [{"title": t["title"], "text": t.get("text", ""), "included": t.get("included", True),
                   "auto": t.get("auto", False)} for t in s.default_terms],
    }


@router.post("", status_code=201)
def create_quotation(body: QuotationIn, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    number = (data.pop("number", None) or "").strip()
    s = get_settings(db)
    if number:
        if db.scalars(select(m.Quotation).where(m.Quotation.number == number)).first():
            raise HTTPException(409, f"Quotation number {number} already exists")
        prefix = s.quotation_prefix.replace("{year}", str(date.today().year))
        if number == f"{prefix}{s.quotation_next:03d}":
            s.quotation_next += 1
    else:
        number = next_quotation_number(db)
    q = m.Quotation(
        number=number, intro=DEFAULT_INTRO, closing=DEFAULT_CLOSING, gst_rate=s.default_gst_rate,
    )
    apply(q, data, skip=("items", "stages", "terms"))
    if "terms" not in data:
        data["terms"] = [{"title": t["title"], "text": t.get("text", ""), "included": t.get("included", True),
                          "auto": t.get("auto", False)} for t in s.default_terms]
    _fill_lines(q, data)
    _fill_from_client(db, q)
    db.add(q)
    db.commit()
    return quotation_out(q)


@router.get("/{qid}")
def get_quotation(qid: int, db: Session = Depends(get_db)):
    return quotation_out(get_or_404(db, m.Quotation, qid, "Quotation"))


@router.put("/{qid}")
def update_quotation(qid: int, body: QuotationIn, db: Session = Depends(get_db)):
    q = get_or_404(db, m.Quotation, qid, "Quotation")
    data = body.model_dump(exclude_unset=True)
    if "number" in data:
        number = (data["number"] or "").strip()
        clash = db.scalars(select(m.Quotation).where(m.Quotation.number == number, m.Quotation.id != q.id)).first()
        if not number or clash:
            raise HTTPException(409, "That quotation number is empty or already used")
    if data.get("status") and data["status"] not in STATUSES:
        raise HTTPException(422, "Unknown status")
    apply(q, data, skip=("items", "stages", "terms"))
    _fill_lines(q, data)
    _fill_from_client(db, q)
    q.updated_at = datetime.utcnow()
    db.commit()
    return quotation_out(q)


@router.post("/{qid}/duplicate", status_code=201)
def duplicate_quotation(qid: int, db: Session = Depends(get_db)):
    src = get_or_404(db, m.Quotation, qid, "Quotation")
    q = m.Quotation(number=next_quotation_number(db))
    for col in ("client_id", "validity_days", "project", "to_name", "to_company", "to_email", "to_phone",
                "to_website", "salutation", "intro", "gst_mode", "gst_rate", "discount", "closing", "show_signature"):
        setattr(q, col, getattr(src, col))
    q.items = [m.QuotationItem(position=i.position, title=i.title, description=i.description, unit=i.unit,
                               qty=i.qty, rate=i.rate, quoted_on_selection=i.quoted_on_selection) for i in src.items]
    q.stages = [m.PaymentStage(position=s.position, milestone=s.milestone, description=s.description, share=s.share)
                for s in src.stages]
    q.terms = [m.QuotationTerm(position=t.position, title=t.title, text=t.text, included=t.included, auto=t.auto)
               for t in src.terms]
    db.add(q)
    db.commit()
    return quotation_out(q)


@router.post("/{qid}/invoice", status_code=201)
def convert_to_invoice(qid: int, db: Session = Depends(get_db)):
    q = get_or_404(db, m.Quotation, qid, "Quotation")
    totals = quotation_totals(q)
    if totals["taxable"] <= 0:
        raise HTTPException(422, "This quotation has no billable amount yet")
    client = _ensure_client(db, q)
    s = get_settings(db)
    inv = m.Invoice(
        number=next_invoice_number(db), client_id=client.id, quotation_id=q.id, kind="service",
        issue_date=date.today(), due_date=date.today() + timedelta(days=s.invoice_due_days),
        gst_rate=0 if q.gst_mode == "none" else q.gst_rate, status="sent",
        notes=f"As per quotation {q.number}" + (f" — {q.project}" if q.project else ""),
    )
    pos = 0
    for it in q.items:
        if it.quoted_on_selection:
            continue
        inv.items.append(m.InvoiceItem(position=pos, title=it.title, description=it.description, unit=it.unit,
                                       qty=it.qty, rate=it.rate))
        pos += 1
    if totals["discount"] > 0:
        inv.items.append(m.InvoiceItem(position=pos, title="Discount", unit="Fixed", qty=1, rate=-totals["discount"]))
    q.status = "invoiced"
    db.add(inv)
    db.commit()
    return invoice_out(inv)


@router.post("/{qid}/project", status_code=201)
def create_project(qid: int, db: Session = Depends(get_db)):
    q = get_or_404(db, m.Quotation, qid, "Quotation")
    client = _ensure_client(db, q)
    p = m.Project(name=q.project or f"Project for {client.company}", client_id=client.id, quotation_id=q.id)
    p.tasks = [m.Task(position=i, title=it.title or f"Item {i + 1}") for i, it in enumerate(q.items)
               if not it.quoted_on_selection]
    if q.status in ("draft", "sent"):
        q.status = "approved"
    db.add(p)
    db.commit()
    return project_out(p)


@router.delete("/{qid}", status_code=204)
def delete_quotation(qid: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.Quotation, qid, "Quotation"))
    db.commit()
