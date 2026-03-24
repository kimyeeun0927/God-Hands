"""
train.py — HANDSEAL 제스처 분류 모델 학습
============================================
입력: ml/data/raw/*.csv  (dataCollector.js가 생성한 파일들)
출력: ml/models/handseal.onnx  (웹에서 로드)

실행:
  pip install torch scikit-learn pandas numpy onnx
  python ml/train.py
"""

import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix
import glob, os

# ── 설정 ──────────────────────────────────────────────────
DATA_DIR   = 'ml/data/raw'
MODEL_DIR  = 'ml/models'
MODEL_PATH = f'{MODEL_DIR}/handseal.onnx'
EPOCHS     = 100
BATCH_SIZE = 64
LR         = 1e-3

os.makedirs(MODEL_DIR, exist_ok=True)

# ── 1. 데이터 로드 ────────────────────────────────────────
csv_files = glob.glob(f'{DATA_DIR}/*.csv')
if not csv_files:
    raise FileNotFoundError(f'{DATA_DIR}에 CSV 파일이 없습니다. 먼저 데이터를 수집하세요.')

df = pd.concat([pd.read_csv(f) for f in csv_files], ignore_index=True)
print(f'데이터 로드: {len(df)}행, 파일 {len(csv_files)}개')
print('클래스 분포:\n', df['label'].value_counts())

X = df.iloc[:, :126].values.astype(np.float32)  # right(63) + left(63)
y = df['label'].values

# ── 2. 레이블 인코딩 ──────────────────────────────────────
le = LabelEncoder()
y_enc = le.fit_transform(y)
print('클래스:', le.classes_)

NUM_CLASSES = len(le.classes_)

# 레이블 맵 저장 (웹에서 참조용)
with open(f'{MODEL_DIR}/labels.json', 'w') as f:
    import json
    json.dump(list(le.classes_), f, ensure_ascii=False)

# ── 3. 데이터 분할 ────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y_enc, test_size=0.2, random_state=42, stratify=y_enc
)

train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(y_train, dtype=torch.long))
test_ds  = TensorDataset(torch.tensor(X_test),  torch.tensor(y_test,  dtype=torch.long))
train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
test_dl  = DataLoader(test_ds,  batch_size=BATCH_SIZE)

# ── 4. 모델 정의 (MLP) ────────────────────────────────────
class HandSealMLP(nn.Module):
    def __init__(self, in_dim=126, num_classes=5):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.3),

            nn.Linear(256, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.2),

            nn.Linear(128, 64),
            nn.ReLU(),

            nn.Linear(64, num_classes),
        )

    def forward(self, x):
        return self.net(x)

device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f'디바이스: {device}')

model     = HandSealMLP(num_classes=NUM_CLASSES).to(device)
optimizer = torch.optim.Adam(model.parameters(), lr=LR)
criterion = nn.CrossEntropyLoss()
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

# ── 5. 학습 ───────────────────────────────────────────────
best_acc = 0.0
for epoch in range(1, EPOCHS + 1):
    model.train()
    total_loss = 0
    for xb, yb in train_dl:
        xb, yb = xb.to(device), yb.to(device)
        optimizer.zero_grad()
        loss = criterion(model(xb), yb)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()

    scheduler.step()

    # 검증
    model.eval()
    correct = total = 0
    with torch.no_grad():
        for xb, yb in test_dl:
            xb, yb = xb.to(device), yb.to(device)
            preds = model(xb).argmax(1)
            correct += (preds == yb).sum().item()
            total   += len(yb)

    acc = correct / total * 100
    if acc > best_acc:
        best_acc = acc
        torch.save(model.state_dict(), f'{MODEL_DIR}/best.pt')

    if epoch % 10 == 0:
        print(f'Epoch {epoch:3d}/{EPOCHS} | Loss: {total_loss/len(train_dl):.4f} | Val Acc: {acc:.1f}%')

print(f'\n최고 검증 정확도: {best_acc:.1f}%')

# ── 6. 최종 평가 ──────────────────────────────────────────
model.load_state_dict(torch.load(f'{MODEL_DIR}/best.pt'))
model.eval()

all_preds, all_true = [], []
with torch.no_grad():
    for xb, yb in test_dl:
        preds = model(xb.to(device)).argmax(1).cpu().numpy()
        all_preds.extend(preds)
        all_true.extend(yb.numpy())

print('\n=== Classification Report ===')
print(classification_report(all_true, all_preds, target_names=le.classes_))

# ── 7. ONNX Export ────────────────────────────────────────
model.cpu()
dummy_input = torch.zeros(1, 126)
torch.onnx.export(
    model, dummy_input, MODEL_PATH,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}},
    opset_version=17,
)
print(f'\nONNX 모델 저장: {MODEL_PATH}')
print('→ web/public/models/handseal.onnx 로 복사하면 웹에서 바로 사용 가능')
