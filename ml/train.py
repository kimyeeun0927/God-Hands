"""
train.py — HANDSEAL 제스처 분류 모델 학습
============================================
입력: ml/data/raw/*.csv  (dataCollector.js가 생성한 파일들)
출력: ml/models/handseal.onnx + web/models/handseal.onnx (자동 복사)

실행:
  pip install torch scikit-learn pandas numpy onnx
  python ml/train.py

구조 축소 실험(k-fold)은 ml/archive/search_arch.py 참고 — baseline(256-128-64)이
가장 나은 선택으로 확정되어 이 파일은 그 구조를 그대로 사용한다.
"""

import sys, os, glob, json, shutil, random
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset, WeightedRandomSampler
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report

# ── Windows cp949 인코딩 픽스 ─────────────────────────────
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# ── 재현성 시드 고정 ──────────────────────────────────────
SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(SEED)

# ── 설정 ──────────────────────────────────────────────────
DATA_DIR      = 'ml/data/raw'
MODEL_DIR     = 'ml/models'
WEB_MODEL_DIR = 'web/models'
MODEL_PATH    = f'{MODEL_DIR}/handseal.onnx'
HIDDEN_SIZES  = (256, 128, 64)   # k-fold 실험 결과 baseline 유지로 확정
MAX_EPOCHS    = 200
PATIENCE      = 20               # val_loss 기준 20에폭 개선 없으면 조기 종료
BATCH_SIZE    = 64
LR            = 1e-3

os.makedirs(MODEL_DIR,     exist_ok=True)
os.makedirs(WEB_MODEL_DIR, exist_ok=True)

# ── 정규화 (web main.js normalize()와 동일 로직) ──────────
def normalize_landmarks(X_raw):
    r = X_raw[:, :63].reshape(-1, 21, 3)
    l = X_raw[:, 63:].reshape(-1, 21, 3)
    r_absent = (X_raw[:, :63] == 0).all(axis=1)
    l_absent = (X_raw[:, 63:] == 0).all(axis=1)
    r_wrist = r[:, 0:1, :]
    r_rel   = r - r_wrist
    # 웹 normalize()와 일치: 오른손 없으면 왼손은 왼손 wrist 기준으로 뺌
    l_anchor = np.where(r_absent[:, None, None], l[:, 0:1, :], r_wrist)
    l_rel   = l - l_anchor
    scale   = np.hypot(r_rel[:, 9, 0], r_rel[:, 9, 1])
    scale   = np.where(scale == 0, 1.0, scale)[:, None]
    r_norm  = r_rel.reshape(-1, 63) / scale
    l_norm  = l_rel.reshape(-1, 63) / scale
    r_norm[r_absent] = 0.0
    l_norm[l_absent] = 0.0
    return np.concatenate([r_norm, l_norm], axis=1).astype(np.float32)

# ── 데이터 증강 ────────────────────────────────────────────
def augment(X: np.ndarray) -> np.ndarray:
    N = len(X)
    X = X.copy()

    # Gaussian noise
    X += np.random.normal(0, 0.01, X.shape).astype(np.float32)

    # 손별 랜덤 스케일 (±10%)
    X[:, :63] *= np.random.uniform(0.9, 1.1, (N, 1)).astype(np.float32)
    X[:, 63:] *= np.random.uniform(0.9, 1.1, (N, 1)).astype(np.float32)

    # 2D 회전 (xy 평면, ±15°)
    angles = np.random.uniform(-np.pi / 12, np.pi / 12, N).astype(np.float32)
    cos_a  = np.cos(angles)[:, None]
    sin_a  = np.sin(angles)[:, None]
    for start in [0, 63]:
        xs = X[:, start:start+63:3].copy()      # 21개 x좌표
        ys = X[:, start+1:start+63:3].copy()    # 21개 y좌표
        X[:, start:start+63:3]   = cos_a * xs - sin_a * ys
        X[:, start+1:start+63:3] = sin_a * xs + cos_a * ys

    # Z축 지터
    X[:, 2:63:3]   += np.random.normal(0, 0.005, (N, 21)).astype(np.float32)
    X[:, 65:126:3] += np.random.normal(0, 0.005, (N, 21)).astype(np.float32)

    # 랜드마크 드롭아웃 (5% 확률로 해당 랜드마크 3축 0으로)
    drop_r = (np.random.rand(N, 21) > 0.05).astype(np.float32)
    drop_l = (np.random.rand(N, 21) > 0.05).astype(np.float32)
    for i in range(21):
        X[:, i*3:(i+1)*3]       *= drop_r[:, i:i+1]
        X[:, 63+i*3:63+(i+1)*3] *= drop_l[:, i:i+1]

    return X

# ── 모델 정의 (MLP) ────────────────────────────────────────
class HandSealMLP(nn.Module):
    def __init__(self, in_dim=126, hidden_sizes=(256, 128, 64), num_classes=9,
                 dropout=(0.3, 0.2)):
        super().__init__()
        layers = []
        prev = in_dim
        for i, h in enumerate(hidden_sizes):
            layers.append(nn.Linear(prev, h))
            layers.append(nn.BatchNorm1d(h))
            layers.append(nn.ReLU())
            if i < len(dropout):
                layers.append(nn.Dropout(dropout[i]))
            prev = h
        layers.append(nn.Linear(prev, num_classes))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x)

# ── 평가 (loss, acc 동시 반환) ────────────────────────────
def evaluate(model, dl, device, criterion):
    model.eval()
    correct = total = 0
    loss_sum = 0.0
    with torch.no_grad():
        for xb, yb in dl:
            xb, yb = xb.to(device), yb.to(device)
            out = model(xb)
            loss_sum += criterion(out, yb).item() * len(yb)
            correct += (out.argmax(1) == yb).sum().item()
            total += len(yb)
    return loss_sum / total, correct / total * 100

# ── early stopping 학습 루프 ───────────────────────────────
def train_with_early_stopping(model, train_dl, val_dl, device,
                               max_epochs=200, patience=20,
                               lr=1e-3, weight_decay=1e-4, verbose=False,
                               train_eval_dl=None):
    """val_loss가 patience 에폭 동안 개선 없으면 중단하고 best 가중치를 복원.
    train_eval_dl을 주면(증강 포함, 셔플 없는 고정 순서) train acc도 같이 재서
    train-val 격차로 overfitting 여부를 직접 확인할 수 있다."""
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(optimizer, T_0=50, T_mult=1)

    best_val_loss = float('inf')
    best_val_acc = 0.0
    best_state = None
    epochs_no_improve = 0
    stopped_epoch = max_epochs

    for epoch in range(1, max_epochs + 1):
        model.train()
        for xb, yb in train_dl:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            loss = criterion(model(xb), yb)
            loss.backward()
            optimizer.step()
        scheduler.step()

        val_loss, val_acc = evaluate(model, val_dl, device, criterion)

        if val_loss < best_val_loss - 1e-4:
            best_val_loss = val_loss
            best_val_acc = val_acc
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            epochs_no_improve = 0
        else:
            epochs_no_improve += 1

        if verbose and epoch % 10 == 0:
            if train_eval_dl is not None:
                _, train_acc = evaluate(model, train_eval_dl, device, criterion)
                print(f'  epoch {epoch:3d} | train_acc {train_acc:5.1f}% '
                      f'| val_loss {val_loss:.4f} | val_acc {val_acc:5.1f}%')
            else:
                print(f'  epoch {epoch:3d} | val_loss {val_loss:.4f} | val_acc {val_acc:.1f}%')

        if epochs_no_improve >= patience:
            stopped_epoch = epoch
            break

    model.load_state_dict(best_state)

    final_train_acc = None
    if train_eval_dl is not None:
        _, final_train_acc = evaluate(model, train_eval_dl, device, criterion)

    return model, best_val_loss, best_val_acc, stopped_epoch, final_train_acc

# ── 1. 데이터 로드 & NaN 처리 ─────────────────────────────
csv_files = glob.glob(f'{DATA_DIR}/*.csv')
if not csv_files:
    raise FileNotFoundError(f'{DATA_DIR}에 CSV 파일이 없습니다. 먼저 데이터를 수집하세요.')

df = pd.concat([pd.read_csv(f) for f in csv_files], ignore_index=True)
df.iloc[:, :126] = df.iloc[:, :126].fillna(0)   # 미감지 손 → 0 (dropna 대신)
df.dropna(subset=['label'], inplace=True)          # label 누락 행만 제거
print(f'데이터 로드: {len(df)}행, 파일 {len(csv_files)}개')
print('클래스 분포:\n', df['label'].value_counts())

X_raw = normalize_landmarks(df.iloc[:, :126].values.astype(np.float32))
y     = df['label'].values

# ── 2. 레이블 인코딩 ──────────────────────────────────────
le = LabelEncoder()
y_enc = le.fit_transform(y)
print('클래스:', le.classes_)
NUM_CLASSES = len(le.classes_)

with open(f'{MODEL_DIR}/labels.json', 'w', encoding='utf-8') as f:
    json.dump(list(le.classes_), f, ensure_ascii=False)

# ── 3. train / val 분리 (클래스별 연속 블록) ──────────────
# 연속 녹화 프레임은 거의 동일 → 셔플 분할 시 train/val에 쌍둥이 프레임이
# 섞여 누수 발생. 셔플 없이 각 클래스 앞 80%=train, 뒤 20%=val로 잘라
# 뒤쪽(다른 녹화/다른 팀원) 프레임만 val로 보내 누수를 줄인다.
VAL_RATIO = 0.2
order = np.arange(len(y_enc))   # df 원본 순서 = 녹화 순서 유지
tr_idx, va_idx = [], []
for c in np.unique(y_enc):
    idx_c = order[y_enc == c]
    cut   = int(round(len(idx_c) * (1 - VAL_RATIO)))
    if le.classes_[c] == 'none':
        # none은 이질적인 near-miss 포즈 혼합 → 랜덤 split
        perm = np.random.permutation(len(idx_c))
        tr_idx.extend(idx_c[perm[:cut]])
        va_idx.extend(idx_c[perm[cut:]])
    else:
        # 연속 녹화 프레임 leakage 방지 → 블록 split
        tr_idx.extend(idx_c[:cut])
        va_idx.extend(idx_c[cut:])
tr_idx, va_idx = np.array(tr_idx), np.array(va_idx)
X_train, X_val = X_raw[tr_idx], X_raw[va_idx]
y_train, y_val = y_enc[tr_idx], y_enc[va_idx]
print(f'[split] none=랜덤 / 나머지=블록 — train {len(tr_idx)} / val {len(va_idx)}')

# 증강본을 train에만 추가 (val은 원본 유지)
X_aug   = augment(X_train)
X_train = np.concatenate([X_train, X_aug])
y_train = np.concatenate([y_train, y_train])

# ── WeightedRandomSampler (클래스 불균형 대응) ────────────
class_counts = np.bincount(y_train)
sample_weights = (1.0 / class_counts[y_train]).astype(np.float32)
sampler = WeightedRandomSampler(sample_weights, len(sample_weights), replacement=True)

train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(y_train, dtype=torch.long))
val_ds   = TensorDataset(torch.tensor(X_val),   torch.tensor(y_val,   dtype=torch.long))

train_dl      = DataLoader(train_ds, batch_size=BATCH_SIZE, sampler=sampler)
train_eval_dl = DataLoader(train_ds, batch_size=BATCH_SIZE)   # train acc 측정용 (순서 고정, 샘플러 없음)
val_dl        = DataLoader(val_ds,   batch_size=BATCH_SIZE)

device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f'디바이스: {device}')

# ── 4. 학습 (early stopping) ──────────────────────────────
model = HandSealMLP(hidden_sizes=HIDDEN_SIZES, num_classes=NUM_CLASSES).to(device)
model, best_val_loss, best_val_acc, stopped_epoch, final_train_acc = train_with_early_stopping(
    model, train_dl, val_dl, device,
    max_epochs=MAX_EPOCHS, patience=PATIENCE, lr=LR, verbose=True,
    train_eval_dl=train_eval_dl,
)
gap = final_train_acc - best_val_acc
print(f'\n조기 종료: epoch {stopped_epoch}/{MAX_EPOCHS} | train_acc: {final_train_acc:.1f}% '
      f'| val_acc: {best_val_acc:.1f}% | gap: {gap:+.1f}%p | val_loss: {best_val_loss:.4f}')

torch.save(model.state_dict(), f'{MODEL_DIR}/best.pt')

# ── 5. 최종 평가 (val 기준) ───────────────────────────────
model.eval()
all_preds, all_true = [], []
with torch.no_grad():
    for xb, yb in val_dl:
        preds = model(xb.to(device)).argmax(1).cpu().numpy()
        all_preds.extend(preds)
        all_true.extend(yb.numpy())

print('\n=== Classification Report (val) ===')
print(classification_report(all_true, all_preds, target_names=le.classes_))

# ── 6. ONNX Export + 웹 자동 배포 ────────────────────────
model.cpu()
dummy_input = torch.zeros(1, 126)
torch.onnx.export(
    model, dummy_input, MODEL_PATH,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}},
    opset_version=17,
)

# 가중치를 .onnx 안에 임베드 (외부 .data 의존 제거 → 웹에서 단일파일로 로드)
import onnx
onnx.save_model(onnx.load(MODEL_PATH), MODEL_PATH, save_as_external_data=False)
for stale in glob.glob(f'{MODEL_DIR}/*.onnx.data') + glob.glob(f'{WEB_MODEL_DIR}/*.onnx.data'):
    os.remove(stale)

shutil.copy(MODEL_PATH, f'{WEB_MODEL_DIR}/handseal.onnx')
shutil.copy(f'{MODEL_DIR}/labels.json', f'{WEB_MODEL_DIR}/labels.json')
size_kb = os.path.getsize(f'{WEB_MODEL_DIR}/handseal.onnx') / 1024
print(f'\nONNX 모델 저장:  {MODEL_PATH}')
print(f'웹 자동 배포:     {WEB_MODEL_DIR}/handseal.onnx ({size_kb:.0f} KB, 단일파일)')
if size_kb < 50:
    print('⚠️  파일이 너무 작습니다 — 가중치 임베드 실패 가능. 로드 확인 요망.')
