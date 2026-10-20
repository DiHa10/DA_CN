from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..ratelimit import SlidingWindow
from ..schemas import Token, UserCreate
from ..security import create_token, hash_password, verify_password

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
    return Token(access_token=create_token(user.id))


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = form.username.lower()
    failed_logins.check(email)
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(form.password, user.password_hash):
        failed_logins.hit(email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sai email hoặc mật khẩu")
    failed_logins.reset(email)
    return Token(access_token=create_token(user.id))
