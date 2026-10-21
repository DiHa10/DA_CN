from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Review, ReviewAnalysis, ReviewAspect, Store, StoreMember, User
from ..ratelimit import SlidingWindow
from ..schemas import MemberIn, MemberOut, ReportSettings, RoleIn, StoreIn, StoreOut
from ..security import get_current_user, owner_store, staff_store
from ..services import weekly_report

router = APIRouter(prefix="/stores", tags=["stores"])


@router.get("", response_model=list[StoreOut])
def list_stores(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Store, StoreMember.role).join(StoreMember)
                      .where(StoreMember.user_id == user.id).order_by(Store.id)).all()
    for store, role in rows:
        store.role = role  # vai trò của người đang xem, để giao diện ẩn nút không được dùng
    return [store for store, _ in rows]


@router.post("", response_model=StoreOut, status_code=201)
def create_store(body: StoreIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.scalar(select(Store).where(Store.slug == body.slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug đã được dùng")
    store = Store(**body.model_dump(), members=[StoreMember(user_id=user.id, role="owner")])
    db.add(store)
    db.commit()
    store.role = "owner"
    return store


COMPARE_DAYS = 30


@router.get("/compare")
def compare_stores(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Số liệu 30 ngày của mọi quán người dùng được xem, để so sánh chi nhánh."""
    stores = db.execute(select(Store.id, Store.name).join(StoreMember).where(StoreMember.user_id == user.id)
                        .order_by(Store.id)).all()
    ids = [s.id for s in stores]
    since = datetime.now(timezone.utc) - timedelta(days=COMPARE_DAYS)
    in_window = (Review.store_id.in_(ids), Review.created_at >= since)

    sentiment = defaultdict(Counter)
    for sid, label, n in db.execute(select(Review.store_id, ReviewAnalysis.sentiment, func.count())
                                    .join(ReviewAnalysis).where(*in_window)
                                    .group_by(Review.store_id, ReviewAnalysis.sentiment)):
        sentiment[sid][label] = n
    aspects = defaultdict(lambda: defaultdict(Counter))
    for sid, aspect, label, n in db.execute(select(Review.store_id, ReviewAspect.aspect, ReviewAspect.sentiment, func.count())
                                            .join(ReviewAspect).where(*in_window)
                                            .group_by(Review.store_id, ReviewAspect.aspect, ReviewAspect.sentiment)):
        aspects[sid][aspect][label] = n

    def rate(c: Counter) -> dict:
        total = sum(c.values())
        return {"mentions": total, "negative_rate": round(c["negative"] / total, 4) if total else None}

    overall = defaultdict(Counter)
    for per_store in aspects.values():
        for aspect, c in per_store.items():
            overall[aspect].update(c)
    return {
        "days": COMPARE_DAYS,
        "stores": [{"id": s.id, "name": s.name, **rate(sentiment[s.id]),
                    "aspects": {a: rate(c) for a, c in aspects[s.id].items()}} for s in stores],
        # mức chung của mọi chi nhánh, để tô ô tệ hơn mức chung
        "overall": {**rate(sum(sentiment.values(), Counter())), "aspects": {a: rate(c) for a, c in overall.items()}},
    }


@router.get("/{store_id}", response_model=StoreOut)
def get_store(store: Store = Depends(staff_store)):
    return store


@router.delete("/{store_id}", status_code=204)
def delete_store(store: Store = Depends(owner_store), db: Session = Depends(get_db)):
    db.delete(store)
    db.commit()


@router.put("/{store_id}/report-settings", response_model=StoreOut)
def update_report_settings(body: ReportSettings, store: Store = Depends(owner_store), db: Session = Depends(get_db)):
    if body.weekly_report and not body.report_email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nhập email nhận báo cáo trước khi bật")
    store.report_email, store.weekly_report = body.report_email, body.weekly_report
    db.commit()
    return store


test_limit = SlidingWindow(5, 3600, "Đã gửi thử nhiều lần trong giờ này, thử lại sau")


@router.post("/{store_id}/report/test")
def send_test_report(store: Store = Depends(owner_store), db: Session = Depends(get_db)):
    """Gửi ngay báo cáo của tuần trước; không đánh dấu đã gửi, lịch gửi thứ Hai vẫn chạy bình thường."""
    if not store.report_email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chưa có email nhận báo cáo")
    test_limit.hit(str(store.id))
    try:
        return {"message": weekly_report.deliver(weekly_report.build(db, store, datetime.now(timezone.utc)), store.slug)}
    except weekly_report.DeliveryError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))


# ---- thành viên: chỉ owner quản lý ----

def _members(db: Session, store_id: int) -> list[MemberOut]:
    rows = db.execute(select(User.id, User.email, StoreMember.role).join(StoreMember)
                      .where(StoreMember.store_id == store_id).order_by(User.email)).all()
    return [MemberOut(user_id=uid, email=email, role=role) for uid, email, role in rows]


def _keep_an_owner(db: Session, store_id: int, user_id: int) -> None:
    """Chặn bỏ/hạ owner cuối cùng: quán không còn ai quản lý, cũng không ai xóa được."""
    owners = db.scalars(select(StoreMember.user_id).where(StoreMember.store_id == store_id,
                                                          StoreMember.role == "owner")).all()
    if owners == [user_id]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Quán phải còn ít nhất một chủ quán (owner)")


@router.get("/{store_id}/members", response_model=list[MemberOut])
def list_members(store: Store = Depends(owner_store), db: Session = Depends(get_db)):
    return _members(db, store.id)


@router.post("/{store_id}/members", response_model=list[MemberOut], status_code=201)
def add_member(body: MemberIn, store: Store = Depends(owner_store), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có tài khoản nào với email này; nhờ người đó đăng ký trước")
    if db.get(StoreMember, (store.id, user.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Người này đã là thành viên của quán")
    db.add(StoreMember(store_id=store.id, user_id=user.id, role=body.role))
    db.commit()
    return _members(db, store.id)


@router.patch("/{store_id}/members/{user_id}", response_model=list[MemberOut])
def change_role(user_id: int, body: RoleIn, store: Store = Depends(owner_store), db: Session = Depends(get_db)):
    member = db.get(StoreMember, (store.id, user_id))
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thành viên")
    if member.role == "owner" and body.role != "owner":
        _keep_an_owner(db, store.id, user_id)
    member.role = body.role
    db.commit()
    return _members(db, store.id)


@router.delete("/{store_id}/members/{user_id}", response_model=list[MemberOut])
def remove_member(user_id: int, store: Store = Depends(owner_store), db: Session = Depends(get_db)):
    member = db.get(StoreMember, (store.id, user_id))
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thành viên")
    if member.role == "owner":
        _keep_an_owner(db, store.id, user_id)
    db.delete(member)
    db.commit()
    return _members(db, store.id)
