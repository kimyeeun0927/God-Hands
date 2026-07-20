"""
train.py — HANDSEAL 제스처 분류 모델 학습
============================================
입력: ml/data/raw/processed_train.csv, processed_val.csv (preprocess.py 결과물, 130차원)
출력: ml/models/handseal.onnx
"""

import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix
import os, json

DATA_DIR   = 'ml/data/raw'
MODEL_DIR  = 'ml/models'
MODEL_PATH = f'{MODEL_DIR}/handseal.onnx'
EPOCHS     = 100
BATCH_SIZE = 64
LR         = 1e-3
PATIENCE   = 15

os.makedirs(MODEL_DIR, exist_ok=True)

# ── 1. 전처리된 데이터 로드 ────────────────────────────
train_path = f'{DATA_DIR}/processed_train.csv'
val_path   = f'{DATA_DIR}/processed_val.csv'

if not os.path.exists(train_path) or not os.path.exists(val_path):
    raise FileNotFoundError(f'{train_path} 또는 {val_path}가 없습니다. 먼저 preprocess.py를 실행하세요.')

df_train = pd.read_csv(train_path)
df_val   = pd.read_csv(val_path)
print(f'train: {len(df_train)}행, val: {len(df_val)}행')
print(df_train['label'].value_counts())

feat_cols = [c for c in df_train.columns if c != 'label']
X_train = df_train[feat_cols].values.astype(np.float32)
X_test  = df_val[feat_cols].values.astype(np.float32)
y_train_raw = df_train['label'].values
y_test_raw  = df_val['label'].values

# ── 2. 레이블 인코딩 ──────────────────────────────────
le = LabelEncoder()
le.fit(np.concatenate([y_train_raw, y_test_raw]))
y_train = le.transform(y_train_raw)
y_test  = le.transform(y_test_raw)
print('클래스:', list(le.classes_))
NUM_CLASSES = len(le.classes_)

with open(f'{MODEL_DIR}/labels.json', 'w') as f:
    json.dump(list(le.classes_), f, ensure_ascii=False)

# class_weight (오버샘플링 대신 불균형 보정)
counts = np.bincount(y_train, minlength=NUM_CLASSES)
class_weights = (counts.sum() / (NUM_CLASSES * counts)).astype(np.float32)
print('class_weights:', dict(zip(le.classes_, np.round(class_weights, 2))))

# ── 3. 데이터로더 ─────────────────────────────────────
train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(y_train, dtype=torch.long))
test_ds  = TensorDataset(torch.tensor(X_test),  torch.tensor(y_test,  dtype=torch.long))
train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
test_dl  = DataLoader(test_ds,  batch_size=BATCH_SIZE)

# ── 4. 모델 정의 (32-16, 기존 256-128-64 대비 실험으로 검증된 축소 구조) ──
class HandSealMLP(nn.Module):
    def __init__(self, in_dim=130, num_classes=9):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, 32), nn.BatchNorm1d(32), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(32, 16), nn.BatchNorm1d(16), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(16, num_classes),
        )
    def forward(self, x):
        return self.net(x)

device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f'디바이스: {device}')

model = HandSealMLP(in_dim=X_train.shape[1], num_classes=NUM_CLASSES).to(device)
optimizer = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=1e-4)
criterion = nn.CrossEntropyLoss(weight=torch.tensor(class_weights).to(device))
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

# ── 5. 학습 (early stopping) ──────────────────────────
best_acc = 0.0
no_improve = 0

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
        no_improve = 0
        torch.save(model.state_dict(), f'{MODEL_DIR}/best.pt')
    else:
        no_improve += 1

    if epoch % 5 == 0 or no_improve == 0:
        print(f'Epoch {epoch:3d}/{EPOCHS} | Loss: {total_loss/len(train_dl):.4f} | Val Acc: {acc:.1f}% | best: {best_acc:.1f}% (no_improve={no_improve})')

    if no_improve >= PATIENCE:
        print(f'\n{PATIENCE} epoch 동안 개선 없어서 조기 종료 (epoch {epoch})')
        break

print(f'\n최고 검증 정확도: {best_acc:.1f}%')

# ── 6. 최종 평가 ──────────────────────────────────────
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

cm = confusion_matrix(all_true, all_preds)
print('\n=== Confusion Matrix ===')
print(pd.DataFrame(cm, index=le.classes_, columns=le.classes_))

# ── 7. ONNX Export ────────────────────────────────────
model.cpu()
dummy_input = torch.zeros(1, X_train.shape[1])
torch.onnx.export(
    model, dummy_input, MODEL_PATH,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}},
    opset_version=17,
    dynamo=False,
)
print(f'\nONNX 모델 저장: {MODEL_PATH}')
print('→ web/public/models/handseal.onnx 로 복사하면 웹에서 바로 사용 가능')