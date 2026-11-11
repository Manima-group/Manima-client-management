from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..auth import current_user
from ..db import get_db
from ..schemas import PaymentIn, SessionIn, TrainingIn
from ..services import get_settings, invoice_out, next_invoice_number, sync_sessions, training_out
from .common import apply, get_or_404

router = APIRouter(prefix="/api/trainings", tags=["training"], dependencies=[Depends(current_user)])

KINDS = ("college", "corporate")
STATUSES = ("proposal", "confirmed", "ongoing", "completed", "cancelled")
PRICING = ("per_head", "per_day", "fixed")


def _validate(data: dict) -> None:
    if data.get("kind") and data["kind"] not in KINDS:
        raise HTTPException(422, "Kind must be college or corporate")
    if data.get("status") and data["status"] not in STATUSES:
        raise HTTPException(422, "Unknown status")
    if data.get("pricing_model") and data["pricing_model"] not in PRICING:
        raise HTTPException(422, "Pricing must be per_head, per_day or fixed")


def _apply_topics(t: m.Training, topics: list[str] | None) -> None:
    if topics is None:
        return
    for s in t.sessions:
        if s.day_no - 1 < len(topics):
            s.topic = topics[s.day_no - 1]


def _refresh_status(t: m.Training) -> None:
    done = sum(1 for s in t.sessions if s.done)
    if t.status in ("cancelled", "proposal"):
        return
    if done >= t.days:
        t.status = "completed"
    elif done > 0:
        t.status = "ongoing"
    elif t.status in ("ongoing", "completed"):
        t.status = "confirmed"


@router.get("")
def list_trainings(kind: str | None = None, db: Session = Depends(get_db)):
    stmt = select(m.Training).order_by(m.Training.created_at.desc())
    if kind:
        stmt = stmt.where(m.Training.kind == kind)
    return [training_out(t, db) for t in db.scalars(stmt).all()]


@router.post("", status_code=201)
def create_training(body: TrainingIn, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not (data.get("name") or "").strip():
        raise HTTPException(422, "College or company name is required")
    _validate(data)
    topics = data.pop("session_topics", None)
    t = m.Training()
    apply(t, data)
    t.days = t.days or 7
    sync_sessions(t)
    _apply_topics(t, topics)
    db.add(t)
    db.commit()
    return training_out(t, db)


@router.get("/{tid}")
def get_training(tid: int, db: Session = Depends(get_db)):
    return training_out(get_or_404(db, m.Training, tid, "Training"), db)


@router.put("/{tid}")
def update_training(tid: int, body: TrainingIn, db: Session = Depends(get_db)):
    t = get_or_404(db, m.Training, tid, "Training")
    data = body.model_dump(exclude_unset=True)
    _validate(data)
    topics = data.pop("session_topics", None)
    apply(t, data)
    sync_sessions(t)
    _apply_topics(t, topics)
    _refresh_status(t)
    db.commit()
    return training_out(t, db)


@router.put("/{tid}/sessions/{sid}")
def update_session(tid: int, sid: int, body: SessionIn, db: Session = Depends(get_db)):
    t = get_or_404(db, m.Training, tid, "Training")
    s = next((x for x in t.sessions if x.id == sid), None)
    if s is None:
        raise HTTPException(404, "Session not found")
    data = body.model_dump(exclude_unset=True)
    apply(s, data)
    if data.get("done") and not s.session_date:
        s.session_date = date.today()
    if data.get("done") and t.status == "proposal":
        t.status = "confirmed"
    _refresh_status(t)
    db.commit()
    return training_out(t, db)


@router.post("/{tid}/teach-next")
def teach_next(tid: int, db: Session = Depends(get_db)):
    """Mark the next pending day as taught today."""
    t = get_or_404(db, m.Training, tid, "Training")
    if t.status in ("proposal", "cancelled"):
        raise HTTPException(422, "Confirm the tie-up before marking sessions")
    s = next((x for x in t.sessions if not x.done), None)
    if s is None:
        raise HTTPException(422, "All days are already taught")
    s.done = True
    s.session_date = s.session_date or date.today()
    _refresh_status(t)
    db.commit()
    return training_out(t, db)


@router.post("/{tid}/payments", status_code=201)
def add_payment(tid: int, body: PaymentIn, db: Session = Depends(get_db)):
    t = get_or_404(db, m.Training, tid, "Training")
    balance = training_out(t, full=False)["balance"]
    amount = body.amount if body.amount is not None else balance
    if amount <= 0:
        raise HTTPException(422, "Nothing left to collect")
    t.payments.append(m.TrainingPayment(amount=amount, paid_on=body.paid_on or date.today(),
                                        method=body.method, note=body.note))
    db.commit()
    return training_out(t, db)


@router.delete("/{tid}/payments/{pid}")
def delete_payment(tid: int, pid: int, db: Session = Depends(get_db)):
    t = get_or_404(db, m.Training, tid, "Training")
    t.payments[:] = [p for p in t.payments if p.id != pid]
    db.commit()
    return training_out(t, db)


@router.post("/{tid}/invoice", status_code=201)
def raise_invoice(tid: int, db: Session = Depends(get_db)):
    """GST invoice for the part of the fee that is not invoiced yet."""
    t = get_or_404(db, m.Training, tid, "Training")
    info = training_out(t, db, full=False)
    if t.status in ("proposal", "cancelled"):
        raise HTTPException(422, "Confirm the tie-up before invoicing")
    if info["uninvoiced"] <= 0:
        raise HTTPException(422, "The full fee is already invoiced")
    client = db.get(m.Client, t.client_id) if t.client_id else None
    if client is None:
        client = db.scalars(select(m.Client).where(m.Client.company == t.name)).first()
    if client is None:
        client = m.Client(company=t.name, contact_name=t.contact_name, email=t.contact_email,
                          phone=t.contact_phone, city=t.area,
                          industry="Education" if t.kind == "college" else "")
        db.add(client)
        db.flush()
    t.client_id = client.id
    s = get_settings(db)
    unit = {"per_head": "Per student" if t.kind == "college" else "Per participant",
            "per_day": "Per day", "fixed": "Fixed"}[t.pricing_model]
    qty = {"per_head": t.people, "per_day": t.days, "fixed": 1}[t.pricing_model]
    if info["invoiced"] > 0 or qty == 0:
        unit, qty, rate = "Fixed", 1, info["uninvoiced"]
    else:
        rate = t.rate
    inv = m.Invoice(
        number=next_invoice_number(db), client_id=client.id, training_id=t.id, kind="training",
        issue_date=date.today(), due_date=date.today() + timedelta(days=s.invoice_due_days),
        gst_rate=s.default_gst_rate, status="sent", notes=f"{t.programme} — {t.days}-day training",
    )
    inv.items = [m.InvoiceItem(position=0, title=t.programme or "Training programme",
                               description=f"{t.days} days · {', '.join(t.topics or [])}".strip(" ·"),
                               unit=unit, qty=qty, rate=rate)]
    db.add(inv)
    db.commit()
    return invoice_out(inv)


@router.delete("/{tid}", status_code=204)
def delete_training(tid: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.Training, tid, "Training"))
    db.commit()
