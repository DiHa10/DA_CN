"""Mốc cải thiện: quán ghi lại việc đã thay đổi từ ngày nào, hệ thống so tỉ lệ chê 4 tuần trước và sau mốc đó."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..labels import ASPECT_VI
from ..models import Review, Store, StoreAction, counted
from ..schemas import ActionIn
from ..security import manager_store, staff_store
from ..services.anomaly import z_score
from ..timeutil import as_utc, vn_date, vn_day_start

router = APIRouter(prefix="/stores/{store_id}/actions", tags=["actions"])

WINDOW = timedelta(days=28)
MIN_MENTIONS = 5  # mỗi bên ít hơn số lượt nhắc này thì chưa kết luận
SIGNIFICANT_Z = 1.96  # 95%: chênh lệch khó là ngẫu nhiên


def impact(db: Session, action: StoreAction, now: datetime) -> dict:
    """Lượt nhắc và lượt chê khía cạnh của mốc (hoặc tổng thể) trong 28 ngày trước và tới 28 ngày sau mốc."""
    start = vn_day_start(action.day)
    end = min(start + WINDOW, now)
    rows = db.scalars(select(Review).where(Review.store_id == action.store_id, Review.created_at >= start - WINDOW,
                                           Review.created_at < end, counted())).all()
    side = {True: [0, 0], False: [0, 0]}  # sau mốc? -> [lượt nhắc, lượt chê]
    for r in rows:
        if not r.analysis:
            continue
        labels = [r.analysis.sentiment] if action.aspect is None else [a.sentiment for a in r.aspects if a.aspect == action.aspect]
        c = side[as_utc(r.created_at) >= start]
        for s in labels:
            c[0] += 1
            c[1] += s == "negative"
    (bn, bneg), (an, aneg) = side[False], side[True]
    enough = bn >= MIN_MENTIONS and an >= MIN_MENTIONS
    z = round(z_score(aneg, an, bneg, bn), 2) if enough else None
    return {
        "before": {"mentions": bn, "negative": bneg},
        "after": {"mentions": an, "negative": aneg},
        "after_days": max(0, (vn_date(now) - action.day).days),  # mốc mới đặt thì "sau" mới có vài ngày
        "enough": enough,
        # better: giảm rõ | worse: tăng rõ | same: chưa thấy khác biệt chắc chắn
        "verdict": None if z is None else "better" if z <= -SIGNIFICANT_Z else "worse" if z >= SIGNIFICANT_Z else "same",
        "z": z,
    }


def out(db: Session, a: StoreAction, now: datetime) -> dict:
    return {"id": a.id, "day": a.day.isoformat(), "aspect": a.aspect, "note": a.note, **impact(db, a, now)}


@router.get("")
def list_actions(store: Store = Depends(staff_store), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    rows = db.scalars(select(StoreAction).where(StoreAction.store_id == store.id)
                      .order_by(StoreAction.day.desc(), StoreAction.id.desc()).limit(30)).all()
    return [out(db, a, now) for a in rows]


@router.post("", status_code=201)
def create_action(body: ActionIn, store: Store = Depends(manager_store), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    if body.aspect is not None and body.aspect not in ASPECT_VI:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không có khía cạnh này")
    if body.day > vn_date(now):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ngày áp dụng không được ở tương lai")
    action = StoreAction(store_id=store.id, day=body.day, aspect=body.aspect, note=body.note.strip())
    db.add(action)
    db.commit()
    return out(db, action, now)


@router.delete("/{action_id}", status_code=204)
def delete_action(action_id: int, store: Store = Depends(manager_store), db: Session = Depends(get_db)):
    action = db.get(StoreAction, action_id)
    if not action or action.store_id != store.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy mốc này")
    db.delete(action)
    db.commit()
