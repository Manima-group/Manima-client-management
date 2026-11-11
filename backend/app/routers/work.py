"""Projects, tasks, team and meetings."""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models as m
from ..auth import current_user, hash_password, owner_only
from ..db import get_db
from ..schemas import MeetingIn, MemberEntryIn, ProjectIn, TaskIn, TeamMemberIn
from ..services import meeting_out, member_out, project_out
from .common import apply, get_or_404

router = APIRouter(prefix="/api", tags=["projects, team, meetings"], dependencies=[Depends(current_user)])


# ---------- projects ----------

@router.get("/projects")
def list_projects(db: Session = Depends(get_db)):
    return [project_out(p) for p in db.scalars(select(m.Project).order_by(m.Project.created_at.desc())).all()]


@router.post("/projects", status_code=201)
def create_project(body: ProjectIn, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not (data.get("name") or "").strip():
        raise HTTPException(422, "Project name is required")
    p = m.Project(**data)
    db.add(p)
    db.commit()
    return project_out(p)


@router.put("/projects/{pid}")
def update_project(pid: int, body: ProjectIn, db: Session = Depends(get_db)):
    p = get_or_404(db, m.Project, pid, "Project")
    apply(p, body.model_dump(exclude_unset=True))
    db.commit()
    return project_out(p)


@router.delete("/projects/{pid}", status_code=204)
def delete_project(pid: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.Project, pid, "Project"))
    db.commit()


@router.post("/projects/{pid}/tasks", status_code=201)
def add_task(pid: int, body: TaskIn, db: Session = Depends(get_db)):
    p = get_or_404(db, m.Project, pid, "Project")
    data = body.model_dump(exclude_unset=True)
    if not (data.get("title") or "").strip():
        raise HTTPException(422, "Task title is required")
    p.tasks.append(m.Task(position=len(p.tasks), **data))
    db.commit()
    db.refresh(p)
    return project_out(p)


@router.put("/projects/{pid}/tasks/{tid}")
def update_task(pid: int, tid: int, body: TaskIn, db: Session = Depends(get_db)):
    p = get_or_404(db, m.Project, pid, "Project")
    t = next((x for x in p.tasks if x.id == tid), None)
    if t is None:
        raise HTTPException(404, "Task not found")
    apply(t, body.model_dump(exclude_unset=True))
    if p.tasks and all(x.done for x in p.tasks) and p.status == "active":
        p.status = "completed"
    elif p.status == "completed" and not all(x.done for x in p.tasks):
        p.status = "active"
    db.commit()
    db.refresh(p)
    return project_out(p)


@router.delete("/projects/{pid}/tasks/{tid}")
def delete_task(pid: int, tid: int, db: Session = Depends(get_db)):
    p = get_or_404(db, m.Project, pid, "Project")
    p.tasks[:] = [x for x in p.tasks if x.id != tid]
    db.commit()
    return project_out(p)


# ---------- team ----------

def _project_names(db: Session, member_id: int) -> list[str]:
    rows = db.execute(
        select(m.Project.name).join(m.Task, m.Task.project_id == m.Project.id)
        .where(m.Task.assignee_id == member_id).distinct()
    ).all()
    return [r[0] for r in rows]


@router.get("/team")
def list_team(db: Session = Depends(get_db)):
    members = db.scalars(select(m.TeamMember).order_by(m.TeamMember.created_at)).all()
    return [member_out(tm, _project_names(db, tm.id)) for tm in members]


@router.post("/team", status_code=201)
def add_member(body: TeamMemberIn, db: Session = Depends(get_db), _: m.User = Depends(owner_only)):
    data = body.model_dump(exclude_unset=True)
    create_login = data.pop("create_login", False)
    password = data.pop("password", None)
    if not (data.get("name") or "").strip():
        raise HTTPException(422, "Name is required")
    tm = m.TeamMember(**data)
    if create_login:
        email = (tm.email or "").strip().lower()
        if not email or not password or len(password) < 6:
            raise HTTPException(422, "A login needs an email and a password of at least 6 characters")
        if db.scalars(select(m.User).where(func.lower(m.User.email) == email)).first():
            raise HTTPException(409, "A login with this email already exists")
        user = m.User(name=tm.name, email=email, password_hash=hash_password(password), role="member")
        db.add(user)
        db.flush()
        tm.user_id = user.id
    db.add(tm)
    db.commit()
    return member_out(tm)


@router.put("/team/{mid}")
def update_member(mid: int, body: TeamMemberIn, db: Session = Depends(get_db), _: m.User = Depends(owner_only)):
    tm = get_or_404(db, m.TeamMember, mid, "Team member")
    apply(tm, body.model_dump(exclude_unset=True), skip=("create_login", "password"))
    db.commit()
    return member_out(tm, _project_names(db, tm.id))


@router.post("/team/{mid}/entries", status_code=201)
def add_entry(mid: int, body: MemberEntryIn, db: Session = Depends(get_db), _: m.User = Depends(owner_only)):
    tm = get_or_404(db, m.TeamMember, mid, "Team member")
    if body.kind not in ("earned", "paid"):
        raise HTTPException(422, "Kind must be earned or paid")
    amount = body.amount
    if amount is None:
        if body.kind == "earned":
            raise HTTPException(422, "Enter the amount earned")
        amount = member_out(tm)["owed"]
    if amount <= 0:
        raise HTTPException(422, "Amount must be more than zero")
    tm.entries.append(m.MemberEntry(kind=body.kind, amount=amount, entry_date=body.entry_date or date.today(),
                                    project_id=body.project_id, note=body.note))
    db.commit()
    return member_out(tm, _project_names(db, tm.id))


@router.delete("/team/{mid}", status_code=204)
def delete_member(mid: int, db: Session = Depends(get_db), _: m.User = Depends(owner_only)):
    db.delete(get_or_404(db, m.TeamMember, mid, "Team member"))
    db.commit()


# ---------- meetings ----------

@router.get("/meetings")
def list_meetings(upcoming: bool = False, db: Session = Depends(get_db)):
    stmt = select(m.Meeting).order_by(m.Meeting.starts_at)
    if upcoming:
        stmt = stmt.where(m.Meeting.starts_at >= datetime.combine(date.today(), datetime.min.time()))
    return [meeting_out(mt) for mt in db.scalars(stmt).all()]


@router.post("/meetings", status_code=201)
def create_meeting(body: MeetingIn, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not (data.get("title") or "").strip() or not data.get("starts_at"):
        raise HTTPException(422, "Title and date/time are required")
    mt = m.Meeting(**data)
    db.add(mt)
    db.commit()
    return meeting_out(mt)


@router.put("/meetings/{mid}")
def update_meeting(mid: int, body: MeetingIn, db: Session = Depends(get_db)):
    mt = get_or_404(db, m.Meeting, mid, "Meeting")
    apply(mt, body.model_dump(exclude_unset=True))
    db.commit()
    return meeting_out(mt)


@router.delete("/meetings/{mid}", status_code=204)
def delete_meeting(mid: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.Meeting, mid, "Meeting"))
    db.commit()
