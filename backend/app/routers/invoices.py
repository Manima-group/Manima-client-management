from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..auth import current_user
from ..db import get_db
from ..schemas import InvoiceIn, PaymentIn
from ..services import get_settings, invoice_out, invoice_totals, next_invoice_number
from .common import apply, get_or_404

router = APIRouter(prefix="/api/invoices", tags=["invoices"], dependencies=[Depends(current_user)])

STATUSES = ("draft", "sent", "paid", "cancelled")


@router.get("")
def list_invoices(db: Session = Depends(get_db)):
    invs = db.scalars(select(m.Invoice).order_by(m.Invoice.issue_date.desc(), m.Invoice.id.desc())).all()
    return [invoice_out(i, full=False) for i in invs]


@router.post("", status_code=201)
def create_invoice(body: InvoiceIn, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not data.get("client_id") and not (data.get("bill_to") or "").strip():
        raise HTTPException(422, "Choose a client or enter who the invoice is for")
    s = get_settings(db)
    inv = m.Invoice(
        number=next_invoice_number(db), gst_rate=s.default_gst_rate,
        issue_date=date.today(), due_date=date.today() + timedelta(days=s.invoice_due_days),
    )
    apply(inv, data, skip=("items",))
    inv.items = [m.InvoiceItem(position=i, **it) for i, it in enumerate(data.get("items") or [])]
    db.add(inv)
    db.commit()
    return invoice_out(inv)


@router.get("/{iid}")
def get_invoice(iid: int, db: Session = Depends(get_db)):
    return invoice_out(get_or_404(db, m.Invoice, iid, "Invoice"))


@router.put("/{iid}")
def update_invoice(iid: int, body: InvoiceIn, db: Session = Depends(get_db)):
    inv = get_or_404(db, m.Invoice, iid, "Invoice")
    data = body.model_dump(exclude_unset=True)
    if data.get("status") and data["status"] not in STATUSES:
        raise HTTPException(422, "Unknown status")
    apply(inv, data, skip=("items",))
    if data.get("items") is not None:
        inv.items[:] = [m.InvoiceItem(position=i, **it) for i, it in enumerate(data["items"])]
    db.commit()
    return invoice_out(inv)


@router.post("/{iid}/payments", status_code=201)
def add_payment(iid: int, body: PaymentIn, db: Session = Depends(get_db)):
    inv = get_or_404(db, m.Invoice, iid, "Invoice")
    balance = invoice_totals(inv)["balance"]
    amount = body.amount if body.amount is not None else balance
    if amount <= 0:
        raise HTTPException(422, "Nothing left to pay on this invoice")
    paid_on = body.paid_on or date.today()
    inv.payments.append(m.InvoicePayment(amount=amount, paid_on=paid_on, method=body.method, note=body.note))
    if inv.training_id:
        # Keep the training's own payment record in step with its invoice.
        t = db.get(m.Training, inv.training_id)
        if t is not None:
            t.payments.append(m.TrainingPayment(amount=amount, paid_on=paid_on, method=body.method,
                                                note=f"{inv.number} {body.note}".strip()))
    if inv.status == "draft":
        inv.status = "sent"
    db.commit()
    return invoice_out(inv)


@router.delete("/{iid}/payments/{pid}")
def delete_payment(iid: int, pid: int, db: Session = Depends(get_db)):
    inv = get_or_404(db, m.Invoice, iid, "Invoice")
    inv.payments[:] = [p for p in inv.payments if p.id != pid]
    db.commit()
    return invoice_out(inv)


@router.delete("/{iid}", status_code=204)
def delete_invoice(iid: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.Invoice, iid, "Invoice"))
    db.commit()
