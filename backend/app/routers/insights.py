from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Store, StoreInsight
from ..ratelimit import SlidingWindow
from ..schemas import InsightOut
from ..security import get_owned_store
from ..services import insights
from ..services.llm import LLMError

router = APIRouter(prefix="/stores/{store_id}/insights", tags=["insights"])

# mỗi lần tạo tóm tắt là một lần gọi AI có tính phí
per_store = SlidingWindow(10, 3600, "Đã tạo tóm tắt nhiều lần trong giờ này, thử lại sau")


@router.get("", response_model=InsightOut | None)
def latest(store: Store = Depends(get_owned_store), db: Session = Depends(get_db)):
    return db.get(StoreInsight, store.id)


@router.post("", response_model=InsightOut)
def regenerate(store: Store = Depends(get_owned_store), db: Session = Depends(get_db)):
    per_store.hit(str(store.id))
    try:
        return insights.generate(db, store)
    except insights.NothingToAnalyze as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    except LLMError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
