"""Public client portal, opened with a client's secret link."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..db import get_db
from ..schemas import SignIn
from ..services import get_settings, invoice_out, project_out, quotation_out, settings_out

router = APIRouter(prefix="/api/portal", tags=["client portal"])


def _client(db: Session, token: str) -> m.Client:
    c = db.scalars(select(m.Client).where(m.Client.portal_token == token)).first()
    if c is None or not c.portal_enabled:
        raise HTTPException(404, "This portal link is not valid")
    return c


@router.get("/{token}")
def portal(token: str, db: Session = Depends(get_db)):
    c = _client(db, token)
    s = settings_out(get_settings(db))
    company = {k: s[k] for k in ("brand_name", "company_name", "owner_name", "website", "email", "phone",
                                 "linkedin", "gstin", "address", "bank_details")}
    projects = []
    for p in db.scalars(select(m.Project).where(m.Project.client_id == c.id)).all():
        out = project_out(p)
        out["tasks"] = [t for t in out["tasks"] if t["visible_to_client"]]
        for t in out["tasks"]:
            t.pop("assignee_name", None)
        projects.append(out)
    quotes = db.scalars(select(m.Quotation).where(
        m.Quotation.client_id == c.id, m.Quotation.status.in_(("sent", "approved", "invoiced")))).all()
    invoices = db.scalars(select(m.Invoice).where(
        m.Invoice.client_id == c.id, m.Invoice.status.notin_(("draft", "cancelled")))).all()
    return {
        "company": company,
        "client": {"company": c.company, "contact_name": c.contact_name},
        "projects": projects,
        "quotations": [quotation_out(q) for q in quotes],
        "invoices": [invoice_out(i) for i in invoices],
    }


@router.post("/{token}/quotations/{qid}/sign")
def sign_quotation(token: str, qid: int, body: SignIn, db: Session = Depends(get_db)):
    c = _client(db, token)
    q = db.get(m.Quotation, qid)
    if q is None or q.client_id != c.id:
        raise HTTPException(404, "Quotation not found")
    if q.status not in ("sent", "approved"):
        raise HTTPException(422, "This quotation can no longer be signed")
    q.status = "approved"
    q.signed_by = body.name.strip()
    q.signed_at = datetime.utcnow()
    db.commit()
    return quotation_out(q)
