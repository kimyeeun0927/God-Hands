"""
train.py — HANDSEAL 제스처 분류 모델 학습
============================================
입력: ml/data/train.csv, ml/data/val.csv
출력: ml/models/handseal.onnx  (웹에서 로드)

실행:
  pip install torch scikit-learn pandas numpy onnx matplotlib
  python ml/train.py
"""

import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report
import matplotlib.pyplot as plt
import os, json

# ── 설정 ──────────────────────────────────────────────────
TRAIN_DIR  = '../data/train.csv'
VAL_DIR    = '../data/val.csv'
MODEL_DIR  = '../web/models'
MODEL_PATH = f'{MODEL_DIR}/handseal.onnx'
EPOCHS     = 100
BATCH_SIZE = 64
LR         = 5e-4
PATIENCE   = 10    # val loss가 이만큼 연속 epoch 동안 개선 안 되면 조기 종료

os.makedirs(MODEL_DIR, exist_ok=True)

# ── 1. 데이터 로드 ────────────────────────────────────────
train_df   = pd.read_csv(TRAIN_DIR)
feature_cols = train_df.columns[:126]
train_df = train_df[(train_df[feature_cols] != 0).all(axis=1)].reset_index(drop=True)

val_df   = pd.read_csv(VAL_DIR)
val_df = val_df[(val_df[feature_cols] != 0).all(axis=1)].reset_index(drop=True)

print(f'train: {len(train_df)}행 / val: {len(val_df)}행')
print('클래스 분포 (train):\n', train_df['label'].value_counts())

# ── 2. 레이블 인코딩 ──────────────────────────────────────
le = LabelEncoder()
le.fit(pd.concat([train_df, val_df])['label'].values)  # 전체 레이블 기준으로 fit
print('클래스:', le.classes_)

NUM_CLASSES = len(le.classes_)

with open(f'{MODEL_DIR}/labels.json', 'w') as f:
    json.dump(list(le.classes_), f, ensure_ascii=False)

# ── 3. 데이터 분할 ────────────────────────────────────────
def normalize(X):
    # 양 손목(r0, l0) 중심으로 평행이동 + 손목 간 거리로 스케일링 (main.js와 동일한 수식)
    rwrist = X[:, 0:3]
    lwrist = X[:, 63:66]
    center = (rwrist + lwrist) / 2
    scale  = np.linalg.norm(rwrist - lwrist, axis=1)
    scale[scale == 0] = 1

    out = X.copy()
    for hand_offset in (0, 63):
        for lm in range(21):
            i = hand_offset + lm * 3
            out[:, i:i+3] = (X[:, i:i+3] - center) / scale[:, None]
    return out

X_train = normalize(train_df.iloc[:, :126].values.astype(np.float32))
y_train = le.transform(train_df['label'].values)

X_test  = normalize(val_df.iloc[:, :126].values.astype(np.float32))
y_test  = le.transform(val_df['label'].values)

train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(y_train, dtype=torch.long))
test_ds  = TensorDataset(torch.tensor(X_test),  torch.tensor(y_test,  dtype=torch.long))
train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
test_dl  = DataLoader(test_ds,  batch_size=BATCH_SIZE)

# ── 4. 모델 정의 (MLP) ────────────────────────────────────
class HandSealMLP(nn.Module):
    def __init__(self, in_dim=126, num_classes=9):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.2),

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
criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

# ── 5. 학습 ───────────────────────────────────────────────
best_acc = 0.0
best_val_loss = float('inf')
patience_counter = 0
train_loss_history, val_loss_history, val_acc_history = [], [], []

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
    val_loss = 0
    correct = total = 0
    with torch.no_grad():
        for xb, yb in test_dl:
            xb, yb = xb.to(device), yb.to(device)
            logits = model(xb)
            val_loss += criterion(logits, yb).item()
            preds = logits.argmax(1)
            correct += (preds == yb).sum().item()
            total   += len(yb)

    acc = correct / total * 100
    val_loss_avg = val_loss / len(test_dl)
    train_loss_history.append(total_loss / len(train_dl))
    val_loss_history.append(val_loss_avg)
    val_acc_history.append(acc)

    if acc > best_acc:
        best_acc = acc
        torch.save(model.state_dict(), f'{MODEL_DIR}/best.pt')

    if val_loss_avg < best_val_loss - 1e-4:
        best_val_loss    = val_loss_avg
        patience_counter = 0
    else:
        patience_counter += 1

    if epoch % 10 == 0:
        print(f'Epoch {epoch:3d}/{EPOCHS} | Loss: {total_loss/len(train_dl):.4f} | Val Acc: {acc:.1f}%')

    if patience_counter >= PATIENCE:
        print(f'\nEarly stopping: val loss가 {PATIENCE}epoch 동안 개선되지 않음 (epoch {epoch}에서 종료)')
        break

print(f'\n최고 검증 정확도: {best_acc:.1f}%')

# ── 5-1. 학습 곡선 시각화 ──────────────────────────────────
fig, (ax_loss, ax_acc) = plt.subplots(1, 2, figsize=(12, 4.5))

epochs_range = range(1, len(train_loss_history) + 1)
ax_loss.plot(epochs_range, train_loss_history, label='Train Loss')
ax_loss.plot(epochs_range, val_loss_history,   label='Val Loss')
ax_loss.set_xlabel('Epoch')
ax_loss.set_ylabel('Loss')
ax_loss.set_title('Loss')
ax_loss.legend()
ax_loss.grid(alpha=0.3)

ax_acc.plot(epochs_range, val_acc_history, color='tab:green', label='Val Accuracy')
ax_acc.set_xlabel('Epoch')
ax_acc.set_ylabel('Accuracy (%)')
ax_acc.set_title('Validation Accuracy')
ax_acc.legend()
ax_acc.grid(alpha=0.3)

fig.tight_layout()
curve_path = f'{MODEL_DIR}/training_curve.png'
fig.savefig(curve_path, dpi=150)
plt.close(fig)
print(f'학습 곡선 저장: {curve_path}')

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

import onnx
from onnx.external_data_helper import load_external_data_for_model

model_proto = onnx.load(MODEL_PATH)
load_external_data_for_model(model_proto, MODEL_DIR)
onnx.save(model_proto, MODEL_PATH, save_as_external_data=False)

data_file = MODEL_PATH + '.data'
if os.path.exists(data_file):
    os.remove(data_file)
    print(f'임시 파일 삭제: {data_file}')

print(f'\nONNX 모델 저장 (단일 파일): {MODEL_PATH}')
print('→ 웹에서 바로 로드 가능')