from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Store, User
from ..ratelimit import SlidingWindow
from ..schemas import ReportSettings, StoreIn, StoreOut
from ..security import get_current_user, get_owned_store
from ..services import weekly_report

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


@router.put("/{store_id}/report-settings", response_model=StoreOut)
def update_report_settings(body: ReportSettings, store: Store = Depends(get_owned_store), db: Session = Depends(get_db)):
    if body.weekly_report and not body.report_email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nhập email nhận báo cáo trước khi bật")
    store.report_email, store.weekly_report = body.report_email, body.weekly_report
    db.commit()
    return store


test_limit = SlidingWindow(5, 3600, "Đã gửi thử nhiều lần trong giờ này, thử lại sau")


@router.post("/{store_id}/report/test")
def send_test_report(store: Store = Depends(get_owned_store), db: Session = Depends(get_db)):
    """Gửi ngay báo cáo của tuần trước; không đánh dấu đã gửi, lịch gửi thứ Hai vẫn chạy bình thường."""
    if not store.report_email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chưa có email nhận báo cáo")
    test_limit.hit(str(store.id))
    try:
        return {"message": weekly_report.deliver(weekly_report.build(db, store, datetime.now(timezone.utc)), store.slug)}
    except weekly_report.DeliveryError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))
