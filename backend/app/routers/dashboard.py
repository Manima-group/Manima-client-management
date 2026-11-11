from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..auth import current_user
from ..db import get_db
from ..services import invoice_totals, iso, member_out, quotation_totals, training_out

router = APIRouter(prefix="/api", tags=["dashboard"], dependencies=[Depends(current_user)])

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _month_key(d: date) -> tuple[int, int]:
    return d.year, d.month


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    today = date.today()
    month_start = today.replace(day=1)

    invoices = db.scalars(select(m.Invoice)).all()
    trainings = db.scalars(select(m.Training)).all()
    projects = db.scalars(select(m.Project)).all()
    leads = db.scalars(select(m.Lead)).all()
    quotes = db.scalars(select(m.Quotation)).all()
    team = db.scalars(select(m.TeamMember)).all()

    # money in
    service_payments = [(p.paid_on, p.amount) for inv in invoices if inv.kind == "service" for p in inv.payments]
    training_payments = [(p.paid_on, p.amount) for t in trainings for p in t.payments]
    month_payments = [a for d, a in service_payments + training_payments if d >= month_start]
    collected = sum(month_payments)

    outstanding = 0.0
    overdue = []
    for inv in invoices:
        t = invoice_totals(inv)
        if t["effective_status"] in ("sent", "overdue"):
            outstanding += t["balance"]
        if t["effective_status"] == "overdue":
            overdue.append((inv, t))

    active_projects = [p for p in projects if p.status == "active"]
    open_leads = [l for l in leads if l.stage not in ("won", "lost")]
    live_trainings = [t for t in trainings if t.status in ("confirmed", "ongoing", "completed")]
    t_infos = {t.id: training_out(t, db, full=False) for t in trainings}
    training_days_left = sum(t_infos[t.id]["days_left"] for t in live_trainings if t.status != "completed")
    training_due = sum(t_infos[t.id]["balance"] for t in live_trainings)

    # revenue: last 6 months
    months = []
    y, mo = today.year, today.month
    for _ in range(6):
        months.append((y, mo))
        mo -= 1
        if mo == 0:
            y, mo = y - 1, 12
    months.reverse()
    revenue = []
    for (yy, mm) in months:
        revenue.append({
            "label": MONTHS[mm - 1],
            "services": round(sum(a for d, a in service_payments if _month_key(d) == (yy, mm)), 2),
            "training": round(sum(a for d, a in training_payments if _month_key(d) == (yy, mm)), 2),
        })

    order = {"ongoing": 0, "confirmed": 1, "proposal": 2}
    in_progress = sorted([t for t in trainings if t.status in order], key=lambda t: (order[t.status], t.id))[:4]

    # recent documents
    docs = []
    for q in quotes:
        docs.append({"type": "quotation", "id": q.id, "number": q.number, "client": q.to_company or q.to_name,
                     "status": q.status, "amount": quotation_totals(q)["total"], "date": iso(q.issue_date)})
    for inv in invoices:
        t = invoice_totals(inv)
        docs.append({"type": "invoice", "id": inv.id, "number": inv.number,
                     "client": inv.bill_to or (inv.client.company if inv.client else ""),
                     "status": t["effective_status"], "amount": t["total"], "date": iso(inv.issue_date)})
    docs.sort(key=lambda d: (d["date"] or "", d["id"]), reverse=True)

    # upcoming: meetings + next training days
    upcoming = []
    horizon = today + timedelta(days=21)
    for mt in db.scalars(select(m.Meeting).where(m.Meeting.starts_at >= datetime.combine(today, datetime.min.time()))):
        if mt.starts_at.date() <= horizon:
            upcoming.append({"kind": "meeting", "title": mt.title, "at": iso(mt.starts_at), "where": mt.location})
    for t in trainings:
        if t.status not in ("confirmed", "ongoing"):
            continue
        nxt = next((s for s in t.sessions if not s.done), None)
        if nxt is None:
            continue
        when = nxt.session_date
        if when is None and t.start_date:
            when = max(t.start_date + timedelta(days=nxt.day_no - 1), today)
        if when and today <= when <= horizon:
            upcoming.append({"kind": "training", "title": f"{t.name} — Day {nxt.day_no}",
                             "at": iso(when),
                             "where": " · ".join(x for x in [t.timing, nxt.topic] if x),
                             "training_id": t.id})
    upcoming.sort(key=lambda u: u["at"])

    # needs attention
    attention = []
    for inv, t in overdue:
        attention.append({"tag": "Overdue", "tone": "pink", "link": f"/invoices/{inv.id}",
                          "text": f"{inv.number} · {inv.bill_to or (inv.client.company if inv.client else '')} · balance ₹{t['balance']:,.0f}"})
    for q in quotes:
        if q.status == "approved":
            attention.append({"tag": "Approved", "tone": "yellow", "link": f"/quotations/{q.id}",
                              "text": f"{q.number} · {q.to_company or q.to_name} approved — ready to invoice"})
    for l in open_leads:
        if l.follow_up and l.follow_up <= today:
            attention.append({"tag": "Follow up", "tone": "orange", "link": "/leads",
                              "text": f"{l.company} · follow-up due {l.follow_up.strftime('%d %b')}"})
    owed = sum(member_out(tm)["owed"] for tm in team)
    if owed > 0:
        attention.append({"tag": "Payouts", "tone": "orange", "link": "/team", "text": f"₹{owed:,.0f} owed to team members"})
    if training_due > 0:
        attention.append({"tag": "Training", "tone": "yellow", "link": "/training",
                          "text": f"₹{training_due:,.0f} still to collect from colleges & companies"})

    clients_with_projects = len({p.client_id for p in active_projects if p.client_id})
    return {
        "kpis": {
            "collected": round(collected, 2), "collected_count": len(month_payments),
            "outstanding": round(outstanding, 2), "overdue_count": len(overdue),
            "active_projects": len(active_projects), "active_project_clients": clients_with_projects,
            "pipeline": round(sum(l.value for l in open_leads), 2), "pipeline_count": len(open_leads),
            "training_days_left": training_days_left, "training_due": round(training_due, 2),
        },
        "revenue": revenue,
        "trainings": [t_infos[t.id] for t in in_progress],
        "documents": docs[:6],
        "upcoming": upcoming[:5],
        "attention": attention[:6],
        "counts": {
            "leads": len(open_leads), "overdue": len(overdue), "projects": len(active_projects),
            "training": sum(1 for t in trainings if t.status == "ongoing"),
        },
    }
