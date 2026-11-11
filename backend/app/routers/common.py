from typing import Type, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

T = TypeVar("T")


def get_or_404(db: Session, model: Type[T], obj_id: int, label: str = "Record") -> T:
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(404, f"{label} not found")
    return obj


def apply(obj, data: dict, skip: tuple[str, ...] = ()) -> None:
    for key, value in data.items():
        if key in skip:
            continue
        if hasattr(obj, key):
            setattr(obj, key, value)
