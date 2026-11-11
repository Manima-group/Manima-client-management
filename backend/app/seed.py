"""First-run setup: owner login, company settings and (optionally) demo data."""

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .auth import hash_password
from .config import ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, SEED_DEMO_DATA
from .services import DEFAULT_CLOSING, DEFAULT_INTRO, DEFAULT_TERMS, get_settings, sync_sessions


def seed(db: Session) -> None:
    if db.scalars(select(m.User)).first():
        return
    db.add(m.User(name=ADMIN_NAME, email=ADMIN_EMAIL.lower(), password_hash=hash_password(ADMIN_PASSWORD), role="owner"))
    s = get_settings(db)
    s.default_terms = DEFAULT_TERMS
    db.commit()
    if SEED_DEMO_DATA:
        _demo(db)


def _months_ago(n: int, day: int = 12) -> date:
    t = date.today()
    y, mo = t.year, t.month - n
    while mo <= 0:
        y, mo = y - 1, mo + 12
    return date(y, mo, min(day, 28))


def _demo(db: Session) -> None:
    today = date.today()
    s = get_settings(db)

    # team
    sai = m.TeamMember(name="Sai Naveen", role="Owner · Lead trainer", email=ADMIN_EMAIL)
    ravi = m.TeamMember(name="Ravi Teja", role="Developer", email="ravi@example.com")
    divya = m.TeamMember(name="Divya S", role="Designer", email="divya@example.com")
    karthik = m.TeamMember(name="Karthik M", role="QA (freelance)", email="karthik@example.com")
    ravi.entries = [m.MemberEntry(kind="earned", amount=42000, entry_date=today - timedelta(days=40)),
                    m.MemberEntry(kind="paid", amount=24000, entry_date=today - timedelta(days=20))]
    divya.entries = [m.MemberEntry(kind="earned", amount=27000, entry_date=today - timedelta(days=35)),
                     m.MemberEntry(kind="paid", amount=15000, entry_date=today - timedelta(days=18))]
    karthik.entries = [m.MemberEntry(kind="earned", amount=6000, entry_date=today - timedelta(days=5))]
    db.add_all([sai, ravi, divya, karthik])

    # clients
    sagar = m.Client(company="Sagar Air", contact_name="Operations head", industry="HVAC manufacturing", city="Hyderabad",
                     email="ops@sagarair.example", website="www.sagarair.com")
    hydfit = m.Client(company="HYDFIT", contact_name="Founder", industry="Sportswear e-commerce", city="Hyderabad",
                      email="hello@hydfit.example", website="hydfit.in")
    nova = m.Client(company="Nova Interiors", contact_name="Priya Nair", industry="Interior design", city="Bengaluru",
                    email="priya@nova.example")
    bright = m.Client(company="Brightpath Academy", contact_name="Meera Iyer", industry="Education", city="Hyderabad",
                      email="meera@brightpath.example")
    db.add_all([sagar, hydfit, nova, bright])
    db.flush()

    # leads
    db.add_all([
        m.Lead(contact_name="Ravi Kumar", company="Deccan Dental Clinic", value=85000, stage="new", source="Referral"),
        m.Lead(contact_name="Anita Rao", company="Lotus Realty", value=140000, stage="new", source="LinkedIn",
               follow_up=today),
        m.Lead(contact_name="Farhan Ali", company="UrbanCrate", value=60000, stage="contacted", source="Website"),
        m.Lead(contact_name="Meera Iyer", company="Brightpath Academy", value=120000, stage="proposal",
               source="Referral", client_id=bright.id),
        m.Lead(contact_name="Principal", company="Boduppal Degree College", value=60000, stage="proposal",
               source="College outreach", kind="college"),
        m.Lead(contact_name="Priya Nair", company="Nova Interiors", value=180000, stage="won", source="Website",
               client_id=nova.id),
    ])

    # quotation
    q = m.Quotation(number=f"MNM/{today.year}/001", client_id=bright.id, issue_date=today - timedelta(days=3),
                    project="AI tutor chatbot", to_name="Meera Iyer", to_company="Brightpath Academy",
                    to_email="meera@brightpath.example", salutation="Madam", intro=DEFAULT_INTRO,
                    closing=DEFAULT_CLOSING, status="sent", gst_rate=s.default_gst_rate)
    q.items = [
        m.QuotationItem(position=0, title="AI tutor chatbot", description="RAG chatbot trained on Brightpath course material, web widget and admin panel.", unit="Project", qty=1, rate=95000),
        m.QuotationItem(position=1, title="Staff training", description="Hands-on session for teachers to manage content.", unit="Per session", qty=2, rate=12500),
        m.QuotationItem(position=2, title="Cloud hosting", description="Server and model API costs depend on usage.", unit="As Applicable", qty=1, rate=0, quoted_on_selection=True),
    ]
    q.stages = [
        m.PaymentStage(position=0, milestone="Advance", description="Payable on approval of this quotation.", share=40),
        m.PaymentStage(position=1, milestone="Final Delivery", description="Payable on go-live and handover.", share=60),
    ]
    q.terms = [m.QuotationTerm(position=i, title=t["title"], text=t.get("text", ""), included=t.get("included", True),
                               auto=t.get("auto", False)) for i, t in enumerate(DEFAULT_TERMS)]
    db.add(q)
    s.quotation_next = 2

    # invoices (with history for the revenue chart)
    def invoice(n, client, title, amount, issued, due, paid_on=None, status="sent"):
        inv = m.Invoice(number=f"INV-{n:04d}", client_id=client.id, kind="service", issue_date=issued,
                        due_date=due, gst_rate=18, status=status)
        inv.items = [m.InvoiceItem(position=0, title=title, unit="Project", qty=1, rate=amount)]
        if paid_on:
            inv.payments = [m.InvoicePayment(amount=round(amount * 1.18, 2), paid_on=paid_on)]
        db.add(inv)

    invoice(35, sagar, "ERPNext discovery & setup", 50000, _months_ago(5, 3), _months_ago(5, 18), _months_ago(5, 15))
    invoice(36, hydfit, "Store design", 70000, _months_ago(4, 2), _months_ago(4, 17), _months_ago(4, 14))
    invoice(37, nova, "Brand website — advance", 60000, _months_ago(3, 4), _months_ago(3, 19), _months_ago(3, 16))
    invoice(38, sagar, "ERPNext inventory module", 90000, _months_ago(2, 5), _months_ago(2, 20), _months_ago(2, 18))
    invoice(39, hydfit, "Catalogue & product pages", 85000, _months_ago(1, 3), _months_ago(1, 18), _months_ago(1, 12))
    invoice(40, nova, "Brand website — build", 40000, _months_ago(1, 6), _months_ago(1, 21), _months_ago(1, 20))
    invoice(41, sagar, "ERPNext rollout — phase 2", 200000, today - timedelta(days=12), today - timedelta(days=2),
            today - timedelta(days=4))
    invoice(42, hydfit, "Cart & checkout", 80000, today - timedelta(days=6), today + timedelta(days=9))
    invoice(43, nova, "Brand website — launch", 120000, today - timedelta(days=25), today - timedelta(days=10))
    s.invoice_next = 44

    # projects
    def project(name, client, due, tasks):
        p = m.Project(name=name, client_id=client.id, due_date=due)
        p.tasks = [m.Task(position=i, title=t, assignee=a, done=d) for i, (t, a, d) in enumerate(tasks)]
        db.add(p)

    project("HYDFIT e-commerce site", hydfit, today + timedelta(days=19),
            [("Catalogue setup", sai, True), ("Cart & checkout", ravi, False), ("Payment gateway", ravi, False),
             ("QA pass", karthik, False)])
    project("ERPNext rollout", sagar, today + timedelta(days=34),
            [("Requirements workshop", sai, True), ("Chart of accounts", sai, True), ("Inventory module", ravi, False),
             ("User training", divya, False)])
    project("Brand website", nova, today + timedelta(days=11),
            [("Wireframes", divya, True), ("Visual design", divya, True), ("Build", ravi, True), ("Launch", sai, False)])

    # trainings
    py_plan = ["Python basics & setup", "Python data structures", "Functions & files", "GitHub & your first repo",
               "ChatGPT & Claude for coding", "Prompting that works", "Build a mini project", "LinkedIn profile makeover",
               "Emailing HR & landing internships", "Project demo day"]

    def training(kind, name, area, contact, programme, topics, days, timing, start, people, model, rate, status,
                 plan, done, payments):
        t = m.Training(kind=kind, name=name, area=area, contact_name=contact, programme=programme, topics=topics,
                       days=days, timing=timing, start_date=start, people=people, pricing_model=model, rate=rate,
                       status=status)
        sync_sessions(t)
        for sess in t.sessions:
            sess.topic = plan[sess.day_no - 1] if sess.day_no - 1 < len(plan) else ""
            if sess.day_no <= done:
                sess.done = True
                sess.session_date = (start or today) + timedelta(days=sess.day_no - 1)
        t.payments = [m.TrainingPayment(amount=a, paid_on=d) for a, d in payments]
        db.add(t)

    training("college", "Nacharam Degree College", "Nacharam", "Principal · T&P cell", "Python + AI tools bootcamp",
             ["Python", "ChatGPT", "Claude", "GitHub", "LinkedIn"], 10, "10:00 AM – 12:00 PM",
             today - timedelta(days=6), 120, "per_head", 600, "ongoing", py_plan, 6, [(36000, today - timedelta(days=6))])
    training("college", "ECIL Institute of Science", "ECIL", "HoD, Computer Science", "AI automation with n8n & voice agents",
             ["n8n", "Vapi", "Ollama", "Hugging Face"], 7, "2:00 PM – 4:00 PM", today + timedelta(days=13), 80,
             "per_head", 600, "confirmed",
             ["What AI automation is", "n8n basics", "n8n with APIs & Google Sheets", "Running LLMs with Ollama",
              "Hugging Face models", "Voice agents with Vapi", "Capstone automation demo"], 0, [])
    training("college", "Uppal College of Commerce", "Uppal", "Placement officer", "Vibe coding & career readiness",
             ["Lovable", "Bolt", "Cursor", "Kiro", "LinkedIn"], 7, "11:00 AM – 1:00 PM", _months_ago(1, 5), 150,
             "per_head", 600, "completed",
             ["Intro to vibe coding", "Build a site with Lovable", "Build an app with Bolt", "Cursor for real code",
              "Spec-driven building with Kiro", "Deploy & share your project", "Resume, LinkedIn & HR emails"], 7,
             [(45000, _months_ago(1, 5)), (45000, _months_ago(1, 14))])
    training("college", "Boduppal Degree College", "Boduppal", "Principal", "Python + AI tools bootcamp",
             ["Python", "ChatGPT", "Claude", "GitHub"], 10, "", None, 100, "per_head", 600, "proposal", py_plan, 0, [])
    training("corporate", "Kaveri Foods", "Operations team", "HR manager", "AI tools for everyday productivity",
             ["ChatGPT", "Claude", "Sheets automation", "n8n"], 3, "10:00 AM – 1:00 PM", today - timedelta(days=1), 25,
             "per_day", 15000, "ongoing",
             ["AI assistants for daily work", "Automating reports & emails", "An n8n workflow for the team"], 1,
             [(22500, today - timedelta(days=1))])
    training("corporate", "Sagar Air", "Shop floor & accounts", "Operations head", "ERPNext for daily users",
             ["ERPNext", "Inventory", "Reports"], 2, "3:00 PM – 6:00 PM", _months_ago(2, 8), 18, "per_day", 12000,
             "completed", ["ERPNext navigation & daily entries", "Inventory & reports"], 2, [(24000, _months_ago(2, 10))])
    training("corporate", "Lotus Realty", "Sales team", "Sales director", "ChatGPT & n8n for sales",
             ["ChatGPT", "n8n", "LinkedIn outreach"], 2, "", None, 15, "per_day", 18000, "proposal",
             ["AI for prospecting & follow-ups", "Automating lead follow-up with n8n"], 0, [])
    training("college", "Habsiguda Degree College", "Habsiguda", "T&P officer", "Python + AI tools bootcamp",
             ["Python", "ChatGPT"], 7, "10:00 AM – 12:00 PM", _months_ago(3, 2), 90, "per_head", 600, "completed",
             py_plan, 7, [(54000, _months_ago(3, 10))])
    training("college", "ECIL Polytechnic", "ECIL", "Principal", "AI tools crash course", ["ChatGPT", "Canva AI"], 5,
             "10:00 AM – 12:00 PM", _months_ago(4, 6), 70, "per_head", 500, "completed", [], 5,
             [(35000, _months_ago(4, 12))])

    # meetings
    def at(days, hour, minute=0):
        return datetime.combine(today + timedelta(days=days), datetime.min.time()).replace(hour=hour, minute=minute)

    db.add_all([
        m.Meeting(title="HYDFIT — checkout review", starts_at=at(1, 11), location="Google Meet", client_id=hydfit.id),
        m.Meeting(title="Brightpath — proposal walkthrough", starts_at=at(3, 16), location="Google Meet", client_id=bright.id),
        m.Meeting(title="Sagar Air — ERP sprint demo", starts_at=at(7, 10, 30), location="On-site", client_id=sagar.id),
    ])
    db.commit()
