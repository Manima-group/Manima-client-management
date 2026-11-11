from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..auth import current_user
from ..db import get_db
from ..schemas import ClientIn, LeadIn
from ..services import (
    client_out, invoice_out, invoice_totals, iso, lead_out, meeting_out, project_out, quotation_out,
    training_out,
)
from .common import apply, get_or_404

router = APIRouter(prefix="/api", tags=["clients & leads"], dependencies=[Depends(current_user)])

LEAD_STAGES = ("new", "contacted", "proposal", "won", "lost")


def client_stats(db: Session, c: m.Client) -> dict:
    invoices = db.scalars(select(m.Invoice).where(m.Invoice.client_id == c.id, m.Invoice.status != "cancelled")).all()
    billed = outstanding = 0.0
    for inv in invoices:
        t = invoice_totals(inv)
        if t["effective_status"] != "draft":
            billed += t["total"]
            outstanding += t["balance"]
    projects = db.scalars(select(m.Project).where(m.Project.client_id == c.id)).all()
    return {
        "billed": round(billed, 2), "outstanding": round(outstanding, 2),
        "projects_count": len(projects),
        "active_projects": sum(1 for p in projects if p.status == "active"),
    }


@router.get("/clients")
def list_clients(db: Session = Depends(get_db)):
    clients = db.scalars(select(m.Client).order_by(m.Client.company)).all()
    return [client_out(c, client_stats(db, c)) for c in clients]


@router.post("/clients", status_code=201)
def create_client(body: ClientIn, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not (data.get("company") or "").strip():
        raise HTTPException(422, "Company name is required")
    c = m.Client(**data)
    db.add(c)
    db.commit()
    return client_out(c, client_stats(db, c))


@router.get("/clients/{client_id}")
def get_client(client_id: int, db: Session = Depends(get_db)):
    c = get_or_404(db, m.Client, client_id, "Client")
    quotes = db.scalars(select(m.Quotation).where(m.Quotation.client_id == c.id)).all()
    invoices = db.scalars(select(m.Invoice).where(m.Invoice.client_id == c.id)).all()
    projects = db.scalars(select(m.Project).where(m.Project.client_id == c.id)).all()
    trainings = db.scalars(select(m.Training).where(m.Training.client_id == c.id)).all()
    meetings = db.scalars(select(m.Meeting).where(m.Meeting.client_id == c.id)).all()

    history = []
    for q in quotes:
        history.append({"date": iso(q.issue_date), "kind": "Quotation", "text": f"{q.number} · {q.project or 'Quotation'} ({q.status})"})
        if q.signed_at:
            history.append({"date": iso(q.signed_at.date()), "kind": "Signed", "text": f"{q.number} signed by {q.signed_by}"})
    for inv in invoices:
        history.append({"date": iso(inv.issue_date), "kind": "Invoice", "text": f"{inv.number} raised"})
        for p in inv.payments:
            history.append({"date": iso(p.paid_on), "kind": "Payment", "text": f"{inv.number} · ₹{p.amount:,.0f} received"})
    for p in projects:
        history.append({"date": iso(p.created_at.date()), "kind": "Project", "text": f"{p.name} started"})
    for mt in meetings:
        history.append({"date": iso(mt.starts_at.date()), "kind": "Meeting", "text": mt.title})
    history.sort(key=lambda h: h["date"] or "", reverse=True)

    out = client_out(c, client_stats(db, c))
    out.update({
        "quotations": [quotation_out(q, full=False) for q in quotes],
        "invoices": [invoice_out(i, full=False) for i in invoices],
        "projects": [project_out(p) for p in projects],
        "trainings": [training_out(t, db, full=False) for t in trainings],
        "meetings": [meeting_out(mt) for mt in meetings],
        "history": history,
    })
    return out


@router.put("/clients/{client_id}")
def update_client(client_id: int, body: ClientIn, db: Session = Depends(get_db)):
    c = get_or_404(db, m.Client, client_id, "Client")
    apply(c, body.model_dump(exclude_unset=True))
    db.commit()
    return client_out(c, client_stats(db, c))


@router.post("/clients/{client_id}/portal-link")
def reset_portal_link(client_id: int, db: Session = Depends(get_db)):
    c = get_or_404(db, m.Client, client_id, "Client")
    c.portal_token = m.new_token()
    db.commit()
    return client_out(c)


@router.delete("/clients/{client_id}", status_code=204)
def delete_client(client_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.Client, client_id, "Client"))
    db.commit()


# ---------- leads ----------

@router.get("/leads")
def list_leads(db: Session = Depends(get_db)):
    return [lead_out(l) for l in db.scalars(select(m.Lead).order_by(m.Lead.created_at.desc())).all()]


@router.post("/leads", status_code=201)
def create_lead(body: LeadIn, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not (data.get("company") or "").strip():
        raise HTTPException(422, "Company or college name is required")
    if data.get("stage") and data["stage"] not in LEAD_STAGES:
        raise HTTPException(422, "Unknown stage")
    lead = m.Lead(**data)
    db.add(lead)
    db.commit()
    return lead_out(lead)


@router.put("/leads/{lead_id}")
def update_lead(lead_id: int, body: LeadIn, db: Session = Depends(get_db)):
    lead = get_or_404(db, m.Lead, lead_id, "Lead")
    data = body.model_dump(exclude_unset=True)
    if data.get("stage") and data["stage"] not in LEAD_STAGES:
        raise HTTPException(422, "Unknown stage")
    apply(lead, data)
    db.commit()
    return lead_out(lead)


@router.post("/leads/{lead_id}/convert")
def convert_lead(lead_id: int, db: Session = Depends(get_db)):
    """Mark a lead as won and create (or link) the client record."""
    lead = get_or_404(db, m.Lead, lead_id, "Lead")
    client = db.get(m.Client, lead.client_id) if lead.client_id else None
    if client is None:
        client = db.scalars(select(m.Client).where(m.Client.company == lead.company)).first()
    if client is None:
        client = m.Client(company=lead.company, contact_name=lead.contact_name, email=lead.email, phone=lead.phone)
        db.add(client)
        db.flush()
    lead.client_id = client.id
    lead.stage = "won"
    db.commit()
    return {"lead": lead_out(lead), "client": client_out(client)}


@router.delete("/leads/{lead_id}", status_code=204)
def delete_lead(lead_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.Lead, lead_id, "Lead"))
    db.commit()
