"""Báo cáo tuần qua email: tổng kết tuần trước (thứ Hai-Chủ nhật, giờ VN), gửi sau 8:00 sáng thứ Hai.

Cấu hình Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=<gmail>, SMTP_PASSWORD=<App Password>.
Không đặt SMTP_HOST thì email được ghi ra backend/outbox/*.eml để xem thử.
"""

import logging
import os
import smtplib
import threading
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..labels import ASPECT_VI
from ..models import Review, Store, counted
from ..timeutil import VN, as_utc, vn_day_start
from . import anomaly
from . import email_template as T

log = logging.getLogger(__name__)
OUTBOX = Path(__file__).resolve().parents[2] / "outbox"
SEND_HOUR = 8  # giờ VN, sáng thứ Hai
CHECK_EVERY_S = 3600


class DeliveryError(Exception):
    pass


def last_week(now: datetime) -> tuple[datetime, datetime, str]:
    """(đầu tuần trước, đầu tuần này) theo giờ VN, đổi sang UTC; và mã tuần trước dạng "2026-W42"."""
    today = as_utc(now).astimezone(VN).date()
    this_monday = today - timedelta(days=today.weekday())
    prev_monday = this_monday - timedelta(days=7)
    year, week, _ = prev_monday.isocalendar()
    return vn_day_start(prev_monday), vn_day_start(this_monday), f"{year}-W{week:02d}"


def is_due(store: Store, now: datetime) -> bool:
    if not (store.weekly_report and store.report_email):
        return False
    now_vn = as_utc(now).astimezone(VN)
    if now_vn.weekday() == 0 and now_vn.hour < SEND_HOUR:
        return False
    # chưa gửi tuần trước thì gửi (kể cả khi server tắt đúng sáng thứ Hai, gửi bù vào lần kiểm tra sau)
    return store.last_report_week != last_week(now)[2]


def _stats(reviews: list[Review]) -> tuple[int, int, Counter]:
    negative = sum(1 for r in reviews if r.analysis and r.analysis.sentiment == "negative")
    aspects = Counter(a.aspect for r in reviews for a in r.aspects if a.sentiment == "negative")
    return len(reviews), negative, aspects


def _percent(x: float) -> str:
    return f"{x * 100:.1f}%".replace(".", ",")


def _pct(part: int, whole: int) -> str:
    return _percent(part / whole) if whole else "—"


def build(db: Session, store: Store, now: datetime) -> EmailMessage:
    start, end, _ = last_week(now)
    prev_start = start - timedelta(days=7)
    rows = db.scalars(select(Review).where(Review.store_id == store.id, Review.created_at >= prev_start,
                                           Review.created_at < end, counted()).order_by(Review.created_at.desc())).all()
    this = [r for r in rows if as_utc(r.created_at) >= start]
    prev = [r for r in rows if as_utc(r.created_at) < start]
    n, neg, aspects = _stats(this)
    pn, pneg, paspects = _stats(prev)

    # khía cạnh bị chê tăng nhiều nhất so với tuần trước; không có cái nào tăng thì lấy cái bị chê nhiều nhất
    rising = max(aspects, key=lambda a: (aspects[a] - paspects[a], aspects[a]), default=None)
    quotes = [r.content for r in this if r.analysis and r.analysis.sentiment == "negative"][:3]
    headline = store.insight.content.get("headline") if store.insight else None
    first, last = start.astimezone(VN), (end - timedelta(seconds=1)).astimezone(VN)
    period = f"{first:%d/%m}–{last:%d/%m/%Y}"
    name = " ".join(store.name.split())  # bỏ xuống dòng: tên quán nằm trong tiêu đề email

    title = f"Báo cáo tuần {period} – {name}"
    facts = [
        f"Đánh giá mới: {n} (tuần trước đó: {pn})",
        f"Tỉ lệ tiêu cực: {_pct(neg, n)} (tuần trước đó: {_pct(pneg, pn)})",
    ]
    warnings = []  # (chữ) các điều cần chú ý: khối đỏ trong HTML
    if rising:
        warnings.append(f"Cần chú ý: {ASPECT_VI.get(rising, rising)} – {aspects[rising]} lượt chê (tuần trước đó: {paspects[rising]})")
    for a in anomaly.detect(db, store.id, end)["alerts"]:
        label = ASPECT_VI.get(a["aspect"], a["aspect"]) if a["aspect"] else "Tổng thể"
        warnings.append(f"Bất thường – {label}: tỉ lệ chê {_percent(a['rate'])} trong {a['mentions']} lượt nhắc "
                        f"(8 tuần trước đó: {_percent(a['baseline_rate'])})")
    facts += warnings
    if headline:
        facts.append(f"Gợi ý từ AI (bản tóm tắt gần nhất): {headline}")

    quote_lines = ["", "Một số góp ý tiêu cực:", *[f"- {q}" for q in quotes]] if quotes else []
    text = "\n".join([title, *facts, *quote_lines])

    # nội dung review và tên quán do người dùng gõ: T.e() escape trước khi đưa vào HTML
    def kpi(label: str, value: str, before: str) -> str:
        return (f'<td width="50%" style="background:#ffffff;border:1px solid {T.RULE};border-radius:6px;padding:14px 16px">'
                f'<div style="font:13px {T.FONT};color:{T.MUTED}">{label}</div>'
                f'<div style="font:28px/1.2 {T.FONT};color:{T.INK}">{value}</div>'
                f'<div style="font:12px {T.FONT};color:{T.MUTED}">tuần trước đó: {before}</div></td>')

    body = (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>'
        + kpi("Đánh giá mới", str(n), str(pn)) + '<td width="12"></td>'
        + kpi("Tỉ lệ tiêu cực", _pct(neg, n), _pct(pneg, pn)) + "</tr></table>"
        + "".join(T.note(T.e(w), T.NEGATIVE) for w in warnings)
        + (T.note(f"<b>Gợi ý từ AI</b><br>{T.e(headline)}") if headline else "")
        + (f'<p style="margin:20px 0 8px;font:bold 13px {T.FONT};letter-spacing:1px;text-transform:uppercase;color:{T.BLUE}">'
           "Khách nói gì trong tuần</p>"
           + "".join(f'<p style="margin:0 0 8px;padding:10px 14px;background:#ffffff;border-radius:6px;font:italic 14px/1.5 {T.FONT}">'
                     f"“{T.e(q)}”</p>" for q in quotes) if quotes else "")
        + T.button(f"{T.APP_URL}/dashboard", "Mở Tổng quan")
    )
    page = T.layout(title, body, preheader=facts[1],
                    footer="Email tự động từ Quán Nghe. Tắt báo cáo tuần trong trang Cửa hàng.")

    msg = EmailMessage()
    msg["Subject"] = f"[Quán Nghe] Báo cáo tuần {period}: {name}"
    msg["From"] = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "quan-nghe@localhost"
    msg["To"] = store.report_email
    msg.set_content(text)
    msg.add_alternative(page, subtype="html")
    return msg


def deliver(msg: EmailMessage, slug: str) -> str:
    host = os.getenv("SMTP_HOST")
    if not host:
        OUTBOX.mkdir(exist_ok=True)
        path = OUTBOX / f"{datetime.now():%Y%m%d-%H%M%S}-{slug}.eml"
        path.write_bytes(bytes(msg))
        return f"Chưa cấu hình SMTP: đã lưu email vào backend/outbox/{path.name}"
    try:
        with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=30) as smtp:
            smtp.starttls()
            smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
            smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        raise DeliveryError("Sai SMTP_USER hoặc SMTP_PASSWORD (với Gmail phải dùng App Password)")
    except (smtplib.SMTPException, OSError, KeyError) as e:
        raise DeliveryError(f"Không gửi được email: {e}")
    return f"Đã gửi tới {msg['To']}"


def send_due(now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    sent = 0
    with SessionLocal() as db:
        for store in db.scalars(select(Store).where(Store.weekly_report.is_(True))):
            if not is_due(store, now):
                continue
            try:
                deliver(build(db, store, now), store.slug)
            except DeliveryError:
                log.exception("weekly report for store %s failed", store.id)
                continue  # để lần kiểm tra sau gửi lại
            store.last_report_week = last_week(now)[2]
            db.commit()
            sent += 1
    return sent


_started = False


def start_scheduler() -> None:
    """Luồng nền kiểm tra mỗi giờ. shortcut: chạy trong tiến trình backend; nhiều worker thì chuyển sang cron/Task Scheduler."""
    global _started
    if _started:
        return
    _started = True

    def loop():
        while True:
            try:
                send_due()
            except Exception:  # không để một lỗi (mất DB tạm thời...) giết luồng gửi báo cáo
                log.exception("weekly report check failed")
            time.sleep(CHECK_EVERY_S)

    threading.Thread(target=loop, daemon=True, name="weekly-report").start()
