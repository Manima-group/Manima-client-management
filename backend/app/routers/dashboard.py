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


def _chart_months(start: date, end: date) -> list[tuple[int, int]]:
    """Months covered by the period: at least 6 (ending at `end`), at most the latest 24."""
    months = []
    y, mo = end.year, end.month
    while (y, mo) >= (start.year, start.month) or len(months) < 6:
        months.append((y, mo))
        mo -= 1
        if mo == 0:
            y, mo = y - 1, 12
        if len(months) >= 24:
            break
    months.reverse()
    return months


@router.get("/dashboard")
def dashboard(start: date | None = None, end: date | None = None, db: Session = Depends(get_db)):
    today = date.today()
    month_start = today.replace(day=1)
    start = start or month_start
    end = end or today
    if end < start:
        start, end = end, start

    invoices = db.scalars(select(m.Invoice)).all()
    trainings = db.scalars(select(m.Training)).all()
    projects = db.scalars(select(m.Project)).all()
    leads = db.scalars(select(m.Lead)).all()
    quotes = db.scalars(select(m.Quotation)).all()
    team = db.scalars(select(m.TeamMember)).all()

    # money in (a payment on a training invoice is mirrored on the training, so count it once)
    def _client(inv: m.Invoice) -> str:
        return inv.bill_to or (inv.client.company if inv.client else "Other")

    service_rows = [(p.paid_on, p.amount, _client(inv)) for inv in invoices if inv.kind == "service" for p in inv.payments]
    training_rows = [(p.paid_on, p.amount, t.name) for t in trainings for p in t.payments]
    service_payments = [(d, a) for d, a, _ in service_rows]
    training_payments = [(d, a) for d, a, _ in training_rows]

    def _in(d: date) -> bool:
        return start <= d <= end

    period_services = sum(a for d, a, _ in service_rows if _in(d))
    period_training = sum(a for d, a, _ in training_rows if _in(d))
    period_count = sum(1 for d, _, _ in service_rows + training_rows if _in(d))
    collected = period_services + period_training
    total_services = sum(a for _, a, _ in service_rows)
    total_training = sum(a for _, a, _ in training_rows)

    by_client: dict[str, float] = {}
    for d, a, name in service_rows + training_rows:
        if _in(d):
            by_client[name] = by_client.get(name, 0) + a
    top_clients = [
        {"name": n, "amount": round(a, 2), "share": round(100 * a / collected) if collected else 0}
        for n, a in sorted(by_client.items(), key=lambda x: x[1], reverse=True)[:5]
    ]

    billed = 0.0
    for inv in invoices:
        if inv.status in ("draft", "cancelled") or not _in(inv.issue_date):
            continue
        billed += invoice_totals(inv)["total"]

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

    # revenue by month across the period
    revenue = []
    all_dates = [d for d, _, _ in service_rows + training_rows]
    chart_start = max(start, min(all_dates)) if all_dates else start  # skip empty months before the first payment
    chart_months = _chart_months(chart_start, end)
    multi_year = len({y for y, _ in chart_months}) > 1
    for (yy, mm) in chart_months:
        revenue.append({
            "label": MONTHS[mm - 1] + (f" {str(yy)[2:]}" if multi_year else ""),
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
            "collected": round(collected, 2), "collected_count": period_count,
            "period_services": round(period_services, 2), "period_training": round(period_training, 2),
            "billed": round(billed, 2),
            "total_earnings": round(total_services + total_training, 2),
            "total_services": round(total_services, 2), "total_training": round(total_training, 2),
            "outstanding": round(outstanding, 2), "overdue_count": len(overdue),
            "active_projects": len(active_projects), "active_project_clients": clients_with_projects,
            "pipeline": round(sum(l.value for l in open_leads), 2), "pipeline_count": len(open_leads),
            "training_days_left": training_days_left, "training_due": round(training_due, 2),
        },
        "period": {"start": iso(start), "end": iso(end)},
        "top_clients": top_clients,
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
