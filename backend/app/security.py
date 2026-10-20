import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import Store, User

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


def create_token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + TOKEN_TTL
    return jwt.encode({"sub": str(user_id), "exp": exp}, SECRET_KEY, algorithm="HS256")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        user_id = int(jwt.decode(token, SECRET_KEY, algorithms=["HS256"])["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token không hợp lệ")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token không hợp lệ")
    return user


def get_owned_store(store_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Store:
    store = db.get(Store, store_id)
    # trả 404 cả khi cửa hàng của người khác, để không lộ id tồn tại
    if not store or store.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cửa hàng")
    return store
