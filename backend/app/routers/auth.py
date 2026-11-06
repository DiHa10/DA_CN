import logging
import os
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..ratelimit import SlidingWindow
from ..schemas import ForgotIn, PasswordChange, ResetIn, Token, UserCreate
from ..security import (create_reset_token, create_token, get_current_user, hash_password, user_from_reset_token,
                        verify_password)
from ..services.email_template import APP_URL, BLUE, MUTED, RULE, button, e, layout
from ..services.weekly_report import DeliveryError, deliver

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# chống dò mật khẩu: đếm lần sai theo email, không theo IP (IP qua proxy giả được)
failed_logins = SlidingWindow(10, 15 * 60, "Sai mật khẩu quá nhiều lần, thử lại sau 15 phút")


@router.post("/register", response_model=Token, status_code=201)
def register(body: UserCreate, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email đã được đăng ký")
    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return Token(access_token=create_token(user))


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = form.username.lower()
    failed_logins.check(email)
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(form.password, user.password_hash):
        failed_logins.hit(email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sai email hoặc mật khẩu")
    failed_logins.reset(email)
    return Token(access_token=create_token(user))


# đổi mật khẩu: token đăng nhập gắn dấu vân tay mật khẩu (security.create_token) nên mọi phiên cũ hết hiệu lực
@router.post("/change-password")
def change_password(body: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    failed_logins.check(user.email)  # đoán mật khẩu hiện tại qua đây cũng là dò mật khẩu
    if not verify_password(body.current_password, user.password_hash):
        failed_logins.hit(user.email)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mật khẩu hiện tại không đúng")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


# chống dùng chức năng này để gửi thư rác tới một hộp thư
forgot_limit = SlidingWindow(3, 3600, "Đã gửi nhiều link đặt lại cho email này, thử lại sau 1 giờ")


def reset_email(user: User) -> EmailMessage:
    link = f"{APP_URL}/reset?token={create_reset_token(user)}"
    msg = EmailMessage()
    msg["Subject"] = "[Quán Nghe] Đặt lại mật khẩu"
    msg["From"] = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "quan-nghe@localhost"
    msg["To"] = user.email
    msg.set_content("\n".join([  # bản chữ thường cho trình đọc mail không hiện HTML
        "Bấm link sau để đặt mật khẩu mới (hết hạn sau 30 phút):",
        link,
        "",
        "Nếu bạn không yêu cầu, bỏ qua email này: mật khẩu cũ vẫn dùng được.",
    ]))
    body = (
        f'<p style="margin:0 0 8px">Có người vừa yêu cầu đặt lại mật khẩu cho tài khoản <b>{e(user.email)}</b>.</p>'
        f'<p style="margin:0">Bấm nút dưới đây để chọn mật khẩu mới.</p>'
        + button(link, "Đặt mật khẩu mới")
        + f'<p style="margin:0 0 16px;font-size:13px;color:{MUTED}">Link hết hạn sau <b>30 phút</b> và chỉ dùng được một lần.</p>'
        + f'<p style="margin:0 0 4px;font-size:13px;color:{MUTED}">Nút không bấm được? Chép link này vào trình duyệt:</p>'
        + f'<p style="margin:0 0 20px;font-size:12px;word-break:break-all"><a href="{e(link)}" style="color:{BLUE}">{e(link)}</a></p>'
        + f'<p style="margin:0;padding-top:16px;border-top:1px solid {RULE};font-size:13px;color:{MUTED}">'
          "Không phải bạn yêu cầu? Bỏ qua email này, mật khẩu cũ vẫn dùng được và không ai đổi được nếu không có link trên.</p>"
    )
    msg.add_alternative(layout("Đặt lại mật khẩu", body, preheader="Link đặt mật khẩu mới, hết hạn sau 30 phút"), subtype="html")
    return msg


@router.post("/forgot")
def forgot_password(body: ForgotIn, db: Session = Depends(get_db)):
    """Luôn trả cùng một câu, có tài khoản hay không: không để người ngoài dò email nào đã đăng ký."""
    email = body.email.strip().lower()
    forgot_limit.hit(email)
    user = db.scalar(select(User).where(User.email == email))
    if user:
        try:
            deliver(reset_email(user), "reset")
        except DeliveryError:
            log.exception("password reset email failed")
    return {"ok": True}


@router.post("/reset")
def reset_password(body: ResetIn, db: Session = Depends(get_db)):
    user = user_from_reset_token(body.token, db)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Link đặt lại đã hết hạn hoặc đã được dùng, hãy yêu cầu link mới")
    user.password_hash = hash_password(body.password)
    db.commit()
    failed_logins.reset(user.email)
    return {"ok": True}
