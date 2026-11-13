import os
import tempfile

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_db.name}"
os.environ["SEED_DEMO_DATA"] = "true"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        token = c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()["token"]
        c.headers["Authorization"] = f"Bearer {token}"
        yield c


def test_requires_login():
    with TestClient(app) as c:
        assert c.get("/api/clients").status_code == 401
        assert c.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}).status_code == 401


def test_dashboard(client):
    d = client.get("/api/dashboard").json()
    assert d["kpis"]["active_projects"] == 3
    assert len(d["revenue"]) == 6
    assert d["kpis"]["training_days_left"] > 0
    assert any(a["tag"] == "Overdue" for a in d["attention"])


def test_quotation_flow(client):
    blank = client.get("/api/quotations/blank").json()
    assert blank["items"] == [] and len(blank["terms"]) == 14
    body = {
        "to_name": "Ramesh", "to_company": "Test Foods", "project": "Inventory app", "gst_mode": "excl",
        "items": [
            {"title": "Inventory app", "unit": "Project", "qty": 1, "rate": 100000},
            {"title": "Training", "unit": "Per day", "qty": 2, "rate": 10000},
            {"title": "Hosting", "unit": "As Applicable", "qty": 1, "rate": 0, "quoted_on_selection": True},
        ],
        "stages": [{"milestone": "Advance", "share": 50}, {"milestone": "Delivery", "share": 50}],
        "terms": blank["terms"], "discount": 20000,
    }
    q = client.post("/api/quotations", json=body).json()
    assert q["number"] == blank["number"]
    assert q["subtotal"] == 120000 and q["total"] == 100000 and q["share_total"] == 100

    q = client.put(f"/api/quotations/{q['id']}", json={"gst_mode": "add"}).json()
    assert q["total"] == 118000

    inv = client.post(f"/api/quotations/{q['id']}/invoice").json()
    assert inv["total"] == 118000 and inv["effective_status"] == "sent"
    assert inv["client"]["company"] == "Test Foods"

    paid = client.post(f"/api/invoices/{inv['id']}/payments", json={}).json()
    assert paid["effective_status"] == "paid" and paid["balance"] == 0

    proj = client.post(f"/api/quotations/{q['id']}/project").json()
    assert proj["tasks_total"] == 2


def test_training_flow(client):
    t = client.post("/api/trainings", json={
        "kind": "college", "name": "Test College", "programme": "Python bootcamp", "days": 3, "people": 50,
        "pricing_model": "per_head", "rate": 500, "session_topics": ["Intro", "Loops", "Project"],
    }).json()
    assert t["fee"] == 25000 and t["days_left"] == 3 and t["sessions"][1]["topic"] == "Loops"
    assert client.post(f"/api/trainings/{t['id']}/teach-next").status_code == 422  # still a proposal
    client.put(f"/api/trainings/{t['id']}", json={"status": "confirmed"})
    t = client.post(f"/api/trainings/{t['id']}/teach-next").json()
    assert t["status"] == "ongoing" and t["days_left"] == 2
    t = client.post(f"/api/trainings/{t['id']}/payments", json={"amount": 10000}).json()
    assert t["balance"] == 15000
    inv = client.post(f"/api/trainings/{t['id']}/invoice").json()
    assert inv["subtotal"] == 25000 and inv["total"] == 29500
    client.post(f"/api/invoices/{inv['id']}/payments", json={"amount": 5000})
    t = client.get(f"/api/trainings/{t['id']}").json()
    assert t["paid"] == 15000


def test_portal_sign(client):
    clients = client.get("/api/clients").json()
    bright = next(c for c in clients if c["company"] == "Brightpath Academy")
    with TestClient(app) as public:
        p = public.get(f"/api/portal/{bright['portal_token']}").json()
        q = p["quotations"][0]
        signed = public.post(f"/api/portal/{bright['portal_token']}/quotations/{q['id']}/sign",
                             json={"name": "Meera Iyer"}).json()
        assert signed["status"] == "approved" and signed["signed_by"] == "Meera Iyer"
        assert public.get("/api/portal/not-a-token").status_code == 404


def test_team_and_leads(client):
    team = client.get("/api/team").json()
    ravi = next(t for t in team if t["name"] == "Ravi Teja")
    assert ravi["owed"] == 18000
    ravi = client.post(f"/api/team/{ravi['id']}/entries", json={"kind": "paid"}).json()
    assert ravi["owed"] == 0
    lead = client.post("/api/leads", json={"company": "New Co", "value": 5000}).json()
    out = client.post(f"/api/leads/{lead['id']}/convert").json()
    assert out["lead"]["stage"] == "won" and out["client"]["company"] == "New Co"


def test_ideas(client):
    a = client.post("/api/ideas", json={"title": "AI resume checker", "body": "For college students", "category": "Product"}).json()
    b = client.post("/api/ideas", json={"title": "YouTube series on n8n", "category": "Content"}).json()
    assert a["status"] == "new" and not a["pinned"]
    assert client.post("/api/ideas", json={"title": "  "}).status_code == 422
    client.put(f"/api/ideas/{b['id']}", json={"pinned": True, "status": "exploring"})
    ideas = client.get("/api/ideas").json()
    assert ideas[0]["id"] == b["id"]  # pinned first
    assert [i["title"] for i in client.get("/api/ideas?q=resume").json()] == ["AI resume checker"]
    assert len(client.get("/api/ideas?status=exploring").json()) == 1
    assert client.delete(f"/api/ideas/{a['id']}").status_code == 204


def test_dashboard_earnings_filter(client):
    from datetime import date, timedelta
    all_time = client.get("/api/dashboard?start=2000-01-01").json()
    k = all_time["kpis"]
    assert k["total_earnings"] == k["total_services"] + k["total_training"]
    assert k["collected"] == k["total_earnings"]  # whole history selected
    assert 6 <= len(all_time["revenue"]) <= 24  # from the first payment, capped at 24 months
    today = date.today()
    month = client.get(f"/api/dashboard?start={today.replace(day=1)}&end={today}").json()
    assert month["kpis"]["collected"] <= k["total_earnings"]
    assert month["kpis"]["total_earnings"] == k["total_earnings"]
    assert len(month["revenue"]) == 6
    shares = sum(c["share"] for c in all_time["top_clients"])
    assert all_time["top_clients"] and shares <= 101
    empty = client.get(f"/api/dashboard?start={today + timedelta(days=400)}&end={today + timedelta(days=401)}").json()
    assert empty["kpis"]["collected"] == 0 and empty["top_clients"] == []
