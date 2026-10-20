from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Store, User
from ..schemas import StoreIn, StoreOut
from ..security import get_current_user, get_owned_store

router = APIRouter(prefix="/stores", tags=["stores"])


@router.get("", response_model=list[StoreOut])
def list_stores(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Store).where(Store.owner_id == user.id).order_by(Store.id)).all()


@router.post("", response_model=StoreOut, status_code=201)
def create_store(body: StoreIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.scalar(select(Store).where(Store.slug == body.slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug đã được dùng")
    store = Store(owner_id=user.id, **body.model_dump())
    db.add(store)
    db.commit()
    return store


@router.get("/{store_id}", response_model=StoreOut)
def get_store(store: Store = Depends(get_owned_store)):
    return store


@router.delete("/{store_id}", status_code=204)
def delete_store(store: Store = Depends(get_owned_store), db: Session = Depends(get_db)):
    db.delete(store)
    db.commit()
