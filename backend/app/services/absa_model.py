"""PhoBERT ABSA: 6 khía cạnh × 4 nhãn. Dùng chung cho ml/train_absa.py và backend."""

from pathlib import Path

import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer

from .nlp import normalize

ASPECTS = ["food", "drink", "service", "price", "ambience", "location"]
LABELS = ["none", "positive", "neutral", "negative"]  # "none" = review không nhắc tới khía cạnh
BASE_MODEL = "vinai/phobert-base"
MAX_LEN = 256  # PhoBERT tối đa 258 vị trí


def segment(text: str) -> str:
    """PhoBERT cần đầu vào đã tách từ ("phục_vụ"); train và chạy thật phải dùng cùng hàm này."""
    from underthesea import word_tokenize  # import chậm, chỉ nạp khi cần

    return word_tokenize(normalize(text), format="text")


class AbsaModel(nn.Module):
    def __init__(self, encoder_path: str = BASE_MODEL):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(encoder_path)
        self.dropout = nn.Dropout(0.1)
        self.head = nn.Linear(self.encoder.config.hidden_size, len(ASPECTS) * len(LABELS))

    def forward(self, input_ids, attention_mask):
        cls = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state[:, 0]
        return self.head(self.dropout(cls)).view(-1, len(ASPECTS), len(LABELS))

    def save(self, out_dir: str | Path, tokenizer) -> None:
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        self.encoder.save_pretrained(out)
        tokenizer.save_pretrained(out)
        torch.save(self.head.state_dict(), out / "head.pt")


class AbsaPredictor:
    """Nạp checkpoint một lần, dự đoán theo lô."""

    def __init__(self, model_dir: str | Path, device: str | None = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        self.model = AbsaModel(str(model_dir))
        self.model.head.load_state_dict(torch.load(Path(model_dir) / "head.pt", map_location="cpu", weights_only=True))
        self.model.to(self.device).eval()

    @torch.no_grad()
    def predict(self, texts: list[str], batch_size: int = 32, segmented: bool = False) -> list[dict]:
        """Trả về mỗi review: {aspect: (nhãn, xác suất)} cho các khía cạnh được nhắc tới."""
        results = []
        for i in range(0, len(texts), batch_size):
            chunk = texts[i:i + batch_size]
            chunk = chunk if segmented else [segment(t) for t in chunk]
            enc = self.tokenizer(chunk, padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt").to(self.device)
            probs = self.model(enc["input_ids"], enc["attention_mask"]).float().softmax(-1).cpu()
            for row in probs:
                out = {}
                for a, p in zip(ASPECTS, row):
                    k = int(p.argmax())
                    if LABELS[k] != "none":
                        out[a] = (LABELS[k], float(p[k]))
                results.append(out)
        return results
