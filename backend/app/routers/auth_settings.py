from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models as m
from ..auth import create_token, current_user, hash_password, owner_only, verify_password
from ..db import get_db
from ..schemas import LoginIn, PasswordIn, SettingsIn
from ..services import get_settings, settings_out
from .common import apply

router = APIRouter(prefix="/api", tags=["auth & settings"])


def user_out(u: m.User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role}


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalars(select(m.User).where(func.lower(m.User.email) == body.email.strip().lower())).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    return {"token": create_token(user), "user": user_out(user)}


@router.get("/auth/me")
def me(user: m.User = Depends(current_user)):
    return user_out(user)


@router.post("/auth/password")
def change_password(body: PasswordIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is wrong")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.get("/settings")
def read_settings(db: Session = Depends(get_db), _: m.User = Depends(current_user)):
    return settings_out(get_settings(db))


@router.put("/settings")
def update_settings(body: SettingsIn, db: Session = Depends(get_db), _: m.User = Depends(owner_only)):
    s = get_settings(db)
    apply(s, body.model_dump(exclude_unset=True))
    db.commit()
    return settings_out(s)
