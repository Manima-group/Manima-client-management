"""Ideas: a quick notebook for anything worth coming back to."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import models as m
from ..auth import current_user
from ..db import get_db
from ..schemas import IdeaIn
from ..services import iso
from .common import apply, get_or_404

router = APIRouter(prefix="/api/ideas", tags=["ideas"], dependencies=[Depends(current_user)])

STATUSES = ("new", "exploring", "doing", "done", "parked")


def idea_out(i: m.Idea) -> dict:
    return {
        "id": i.id, "title": i.title, "body": i.body, "category": i.category, "status": i.status,
        "pinned": i.pinned, "created_at": iso(i.created_at), "updated_at": iso(i.updated_at),
    }


def _check(data: dict) -> None:
    if data.get("status") and data["status"] not in STATUSES:
        raise HTTPException(422, "Status must be new, exploring, doing, done or parked")
    if "title" in data and not (data["title"] or "").strip():
        raise HTTPException(422, "Give the idea a title")


@router.get("")
def list_ideas(q: str | None = None, status: str | None = None, db: Session = Depends(get_db)):
    stmt = select(m.Idea).order_by(m.Idea.pinned.desc(), m.Idea.updated_at.desc())
    if status:
        stmt = stmt.where(m.Idea.status == status)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(m.Idea.title.ilike(like), m.Idea.body.ilike(like), m.Idea.category.ilike(like)))
    return [idea_out(i) for i in db.scalars(stmt).all()]


@router.post("", status_code=201)
def create_idea(body: IdeaIn, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not (data.get("title") or "").strip():
        raise HTTPException(422, "Give the idea a title")
    _check(data)
    idea = m.Idea(**data)
    db.add(idea)
    db.commit()
    return idea_out(idea)


@router.put("/{idea_id}")
def update_idea(idea_id: int, body: IdeaIn, db: Session = Depends(get_db)):
    idea = get_or_404(db, m.Idea, idea_id, "Idea")
    data = body.model_dump(exclude_unset=True)
    _check(data)
    apply(idea, data)
    idea.updated_at = datetime.utcnow()
    db.commit()
    return idea_out(idea)


@router.delete("/{idea_id}", status_code=204)
def delete_idea(idea_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, m.Idea, idea_id, "Idea"))
    db.commit()
