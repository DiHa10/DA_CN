"""Fine-tune PhoBERT cho ABSA 6 khía cạnh. Vừa GPU 4GB: fp16, batch 8, max_len 256.

Chạy: python ml/train_absa.py [--epochs 6] [--batch 8]   -> ml/models/absa/ (checkpoint tốt nhất theo F1 trên tập val)

Huấn luyện thêm bằng review thật đã gán nhãn (short_test.py --set real_train eval tạo ra gold.jsonl), tiếp từ model
đang dùng và lưu ra thư mục riêng để so sánh trước khi thay:
  python ml/train_absa.py --init ml/models/absa --extra ml/real_train/gold.jsonl --out ml/models/absa_real --epochs 3 --lr 1e-5
"""

import argparse
import json
import random
import sys
import time

import numpy as np
import torch
from sklearn.metrics import f1_score
from torch import nn
from pathlib import Path

from transformers import AutoTokenizer, get_linear_schedule_with_warmup

from data import ROOT, load

sys.path.insert(0, str(ROOT.parent / "backend"))
from app.services.absa_model import ASPECTS, BASE_MODEL, LABELS, MAX_LEN, AbsaModel  # noqa: E402

OUT = ROOT / "models" / "absa"


def encode(rows, tokenizer):
    enc = tokenizer([r["seg"] for r in rows], padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt")
    y = torch.tensor([[LABELS.index(r["labels"][a]) for a in ASPECTS] for r in rows])
    return enc["input_ids"], enc["attention_mask"], y


def batches(rows, size, shuffle):
    idx = list(range(len(rows)))
    if shuffle:
        random.shuffle(idx)
    for i in range(0, len(idx), size):
        yield [rows[j] for j in idx[i:i + size]]


@torch.no_grad()
def evaluate(model, rows, tokenizer, device, size=32):
    model.eval()
    gold, pred = [], []
    for chunk in batches(rows, size, False):
        ids, mask, y = encode(chunk, tokenizer)
        with torch.autocast(device, dtype=torch.float16, enabled=device == "cuda"):
            logits = model(ids.to(device), mask.to(device))
        gold.append(y)
        pred.append(logits.argmax(-1).cpu())
    gold, pred = torch.cat(gold), torch.cat(pred)
    return float(np.mean([f1_score(gold[:, k], pred[:, k], labels=range(len(LABELS)), average="macro", zero_division=0)
                          for k in range(len(ASPECTS))]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--init", type=Path, help="tiếp tục từ checkpoint này thay vì PhoBERT gốc")
    ap.add_argument("--extra", type=Path, nargs="*", default=[], help="file jsonl {text, seg, labels} thêm vào tập train")
    ap.add_argument("--extra-times", type=int, default=5, help="lặp dữ liệu thêm N lần: vài chục câu lẫn trong ~3000 câu VLSP")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    random.seed(42)
    torch.manual_seed(42)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    train, val = load("train"), load("val")
    for path in args.extra:
        with open(path, encoding="utf-8") as f:
            rows = [json.loads(line) for line in f]
        train += rows * args.extra_times
        print(f"+ {len(rows)} câu từ {path} (x{args.extra_times})")
    # val vẫn là VLSP: chọn checkpoint theo dữ liệu chưa dùng để huấn luyện; đo trên review thật bằng short_test.py --set real_test
    tokenizer = AutoTokenizer.from_pretrained(args.init or BASE_MODEL)
    model = AbsaModel(str(args.init) if args.init else BASE_MODEL)
    if args.init:
        model.head.load_state_dict(torch.load(args.init / "head.pt", map_location="cpu", weights_only=True))
    model = model.to(device)

    # "không nhắc" chiếm đa số: trọng số nghịch đảo tần suất cho từng khía cạnh, chặn trên để không quá gắt
    counts = torch.ones(len(ASPECTS), len(LABELS))
    for r in train:
        for k, a in enumerate(ASPECTS):
            counts[k, LABELS.index(r["labels"][a])] += 1
    weights = (counts.sum(1, keepdim=True) / (len(LABELS) * counts)).clamp(max=10).to(device)
    losses = [nn.CrossEntropyLoss(weight=weights[k]) for k in range(len(ASPECTS))]

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    steps = args.epochs * ((len(train) + args.batch - 1) // args.batch)
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)
    scaler = torch.amp.GradScaler(enabled=device == "cuda")

    best = -1.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        start, total = time.time(), 0.0
        for chunk in batches(train, args.batch, True):
            ids, mask, y = encode(chunk, tokenizer)
            ids, mask, y = ids.to(device), mask.to(device), y.to(device)
            with torch.autocast(device, dtype=torch.float16, enabled=device == "cuda"):
                logits = model(ids, mask)
            loss = sum(losses[k](logits[:, k].float(), y[:, k]) for k in range(len(ASPECTS)))
            opt.zero_grad()
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(opt)
            scaler.update()
            sched.step()
            total += loss.item()
        f1 = evaluate(model, val, tokenizer, device)
        print(f"epoch {epoch}: loss {total:.1f}  val macro-F1 {f1:.4f}  ({time.time() - start:.0f}s)", flush=True)
        if f1 > best:
            best = f1
            model.save(args.out, tokenizer)
            print(f"  -> saved best to {args.out}", flush=True)
    print(f"best val macro-F1 {best:.4f}")


if __name__ == "__main__":
    main()
