from app.services.nlp import analyze, analyze_batch


def test_mixed_review_split_by_aspect():
    r = analyze("Phở ngon nhưng phục vụ chậm, giá hơi cao")
    assert r["aspects"] == {"food": "positive", "service": "negative", "price": "negative"}
    assert r["sentiment"] == "negative"


def test_negation_and_teencode():
    assert analyze("đồ ăn ko ngon")["sentiment"] == "negative"
    assert analyze("giá không quá đắt")["sentiment"] == "positive"


def test_khong_gian_is_not_negation():
    assert analyze("Không gian đẹp, sạch sẽ")["aspects"] == {"ambience": "positive"}


def test_neutral_when_no_opinion():
    assert analyze("Tôi đến quán lúc 7 giờ")["sentiment"] == "neutral"


def test_rating_decides_when_text_has_no_lean():
    texts = ["Không còn gì để nói, luôn là điểm dừng chân lí tưởng"] * 4 + ["Phở ngon"]
    out = [r["sentiment"] for r in analyze_batch(texts, [5, 1, 3, None, 1])]
    assert out == ["positive", "negative", "neutral", "neutral", "positive"]  # nội dung đã rõ thì không xét số sao


def test_topic_filter_drops_off_topic_aspects():
    from app.services.nlp import about_store, on_topic_aspects

    guess = {"food": ("negative", 0.9)}  # PhoBERT gán Món ăn cho câu không nói về quán
    assert on_topic_aspects("Điện thoại này pin yếu quá", guess) == {}
    assert not about_store("Điện thoại này pin yếu quá")
    assert on_topic_aspects("Phở ngon nhưng phục vụ chậm", {"food": "positive", "service": "negative"}) == {"food": "positive", "service": "negative"}
    assert on_topic_aspects("Hột vịt lộn 12k một trứng", {"price": "neutral"}) == {"price": "neutral"}  # số tiền là dấu hiệu giá
    assert on_topic_aspects("giá hơi cao", {"price": "negative"}) == {"price": "negative"}  # dấu tổ hợp (NFD)
    assert about_store("Lần sau sẽ quay lại")
