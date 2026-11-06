import hashlib
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import Store, StoreMember, User

PRODUCTION = os.getenv("APP_ENV") == "production"
DEV_SECRET = "dev-secret-change-me"
SECRET_KEY = os.getenv("SECRET_KEY", DEV_SECRET)
# ai biết khóa ký JWT là tự tạo được token đăng nhập vào mọi tài khoản: production không được chạy với khóa mặc định
if PRODUCTION and (SECRET_KEY == DEV_SECRET or len(SECRET_KEY) < 32):
    raise RuntimeError("APP_ENV=production cần SECRET_KEY ngẫu nhiên dài ít nhất 32 ký tự "
                       '(tạo bằng: python -c "import secrets; print(secrets.token_urlsafe(48))")')
TOKEN_TTL = timedelta(hours=12)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _fingerprint(user: User) -> str:
    return hashlib.sha256(user.password_hash.encode()).hexdigest()[:16]


def create_token(user: User) -> str:
    # pw: dấu vân tay mật khẩu; đổi mật khẩu là mọi phiên đăng nhập cũ (kể cả máy khác) hết hiệu lực ngay
    exp = datetime.now(timezone.utc) + TOKEN_TTL
    return jwt.encode({"sub": str(user.id), "pw": _fingerprint(user), "exp": exp}, SECRET_KEY, algorithm="HS256")


RESET_TTL = timedelta(minutes=30)


def create_reset_token(user: User) -> str:
    """Token đặt lại mật khẩu: gắn dấu vân tay mật khẩu hiện tại, nên đổi mật khẩu xong là token cũ hết hiệu lực."""
    exp = datetime.now(timezone.utc) + RESET_TTL
    return jwt.encode({"sub": str(user.id), "purpose": "reset", "fp": _fingerprint(user), "exp": exp}, SECRET_KEY, algorithm="HS256")


def user_from_reset_token(token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    ok = user and payload.get("purpose") == "reset" and payload.get("fp") == _fingerprint(user)
    return user if ok else None


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token không hợp lệ")
    if payload.get("purpose"):  # token đặt lại mật khẩu ký cùng khóa: không được dùng để đăng nhập
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token không hợp lệ")
    user = db.get(User, user_id)
    if not user or payload.get("pw") != _fingerprint(user):  # mật khẩu đã đổi sau khi token được cấp
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập đã hết, hãy đăng nhập lại")
    return user


ROLE_RANK = {"staff": 1, "manager": 2, "owner": 3}


def store_access(min_role: str):
    """Dependency: quán theo store_id trên URL, chỉ khi người dùng có vai trò >= min_role ở quán đó."""

    def dependency(store_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Store:
        member = db.get(StoreMember, (store_id, user.id))
        # không phải thành viên: 404 như quán không tồn tại, để không lộ id quán của người khác
        if not member:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cửa hàng")
        if ROLE_RANK[member.role] < ROLE_RANK[min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Vai trò của bạn ở quán này không được làm việc này")
        store = db.get(Store, store_id)
        store.role = member.role  # giao diện dựa vào đây để ẩn nút không được dùng
        return store

    return dependency


staff_store = store_access("staff")  # xem, trả lời review
manager_store = store_access("manager")  # nhập dữ liệu, xuất Excel, tạo tóm tắt AI
owner_store = store_access("owner")  # cài đặt quán, thành viên, xóa quán
