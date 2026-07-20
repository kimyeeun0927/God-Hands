"""
preprocess.py — HANDSEAL 데이터 전처리
========================================
1. CSV 병합 (raw_original의 여러 세션 CSV들)
2. capture_id 없으면 라벨 연속구간 기준으로 복원
3. 두 손 다 인식 안 된 행만 제거 (한 손만 잡힌 건 유지 - none 다양성 방침)
4. Palm-scale 정규화 + inter-hand feature 4개 추가 (126 → 130차원)
5. boar 예전 방식(손 맞댄) 세션 제외
6. 라벨별 capture_id holdout (세션 누수 방지, 라벨당 최대 2세션 val)
7. processed_train.csv, processed_val.csv 저장 (오버샘플링 없음 — train.py에서 class_weight로 보정)

실행:
  python ml/preprocess.py --data_dir ml/data/raw_original --out_dir ml/data/raw
"""

import pandas as pd
import numpy as np
import argparse, os, glob

parser = argparse.ArgumentParser()
parser.add_argument('--data_dir',  default='ml/data/raw')
parser.add_argument('--out_dir',   default='ml/data/raw')
parser.add_argument('--val_ratio', type=float, default=0.2)
args = parser.parse_args()

os.makedirs(args.out_dir, exist_ok=True)

# ── 1. 로드 & 병합 ────────────────────────────────────────
csv_files = glob.glob(f'{args.data_dir}/*.csv')
csv_files = [f for f in csv_files if 'processed' not in os.path.basename(f)]

if not csv_files:
    raise FileNotFoundError(f'{args.data_dir}에 CSV 파일 없음')

df = pd.concat([pd.read_csv(f) for f in csv_files], ignore_index=True)
print(f'로드: {len(df)}행 ({len(csv_files)}개 파일)')

# capture_id 없는 구버전 CSV 호환 처리
if 'capture_id' not in df.columns:
    print('⚠️  capture_id 컬럼 없음 → 라벨 연속 구간 기준으로 복원')
    # 라벨이 바뀌지 않고 이어지는 구간 = 캡처 세션 하나로 간주
    df['capture_id'] = (df['label'] != df['label'].shift()).cumsum()

print('클래스 분포:')
print(df['label'].value_counts())
print(f'capture_id 수: {df["capture_id"].nunique()}개 세션')

# ── 2. 두 손 다 인식 안 된 행만 제거 (한 손만 잡힌 건 유지) ──
right_zero_mask = (df[[c for c in df.columns if c.startswith('r') and c not in ['r0x','r0y','r0z','label']]] == 0).all(axis=1)
left_zero_mask  = (df[[c for c in df.columns if c.startswith('l') and c not in ['l0x','l0y','l0z','label']]] == 0).all(axis=1)

before = len(df)
df = df[~(right_zero_mask & left_zero_mask)].reset_index(drop=True)
print(f'양손 다 미인식 제거: {before} → {len(df)}행 (한 손만 잡힌 행은 유지)')

# ── 3. Palm-scale 정규화 + 두 손 간 상대 위치 feature 추가 ──
def palm_scale_normalize(row):
    feat = row[:126].copy().astype(np.float32)
    scales = []
    for start in [0, 63]:
        wrist = feat[start:start+3]
        mcp9  = feat[start+27:start+30]  # landmark 9 = 중지 MCP
        scale = np.linalg.norm(mcp9 - wrist)
        scales.append(scale if scale > 1e-6 else 0.0)
        if scale > 1e-6:
            feat[start:start+63] /= scale

    # 두 손목 간 상대 벡터/거리 (두 손 palm size 평균으로 정규화)
    r_wrist_raw = row[0:3]
    l_wrist_raw = row[63:66]
    avg_scale = np.mean([s for s in scales if s > 0]) if any(s > 0 for s in scales) else 1.0
    if scales[0] > 0 and scales[1] > 0:
        interhand = (r_wrist_raw - l_wrist_raw) / avg_scale
        interhand_dist = np.linalg.norm(r_wrist_raw - l_wrist_raw) / avg_scale
    else:
        interhand = np.zeros(3, dtype=np.float32)
        interhand_dist = 0.0

    return np.concatenate([feat, interhand, [interhand_dist]]).astype(np.float32)

feat_cols = [c for c in df.columns if c not in ['capture_id', 'label']]
X_raw = df[feat_cols].values
print('\nPalm-scale 정규화 중...')
X_norm = np.array([palm_scale_normalize(row) for row in X_raw])
print('완료')

feat_cols = feat_cols + ['interhand_dx', 'interhand_dy', 'interhand_dz', 'interhand_dist']

df_norm = pd.DataFrame(X_norm, columns=feat_cols)
df_norm['capture_id'] = df['capture_id'].values
df_norm['label']      = df['label'].values

# ── 4. boar "손 맞댄 예전 방식" 세션 제외 ─────────────────
# [중요] 데이터 파일이 바뀌면 capture_id 번호도 바뀝니다.
# 처음 실행할 땐 아래 set()을 비워두고 한번 돌려서, 콘솔에 찍히는
# "[진단] boar 세션별 interhand_dist" 로그를 보고 값이 낮은(~0.4~0.6대,
# 손 맞댄 예전방식) 세션 번호를 여기 채운 다음 다시 실행하세요.
# (값이 높은 ~0.9대는 손 벌린 올바른 방식이라 유지)
OLD_CONVENTION_BOAR_IDS = {14, 37}  # 예: {25, 29}

before_n = len(df_norm)
df_norm = df_norm[~((df_norm['label']=='boar') & (df_norm['capture_id'].isin(OLD_CONVENTION_BOAR_IDS)))].reset_index(drop=True)
print(f'\nboar 예전 방식 세션 제외: {before_n} → {len(df_norm)}행')

# ── 5. 라벨별 capture_id holdout (최대 2세션 val) ─────────
sizes = df_norm.groupby(['label', 'capture_id']).size().reset_index(name='n')
val_ids = set()
for label, group in sizes.groupby('label'):
    group = group.sort_values('n')
    n_sessions = len(group)
    max_val_sessions = min(2, n_sessions - 1)
    for i, (_, row) in enumerate(group.iterrows()):
        if i >= max_val_sessions:
            break
        val_ids.add(row['capture_id'])

is_val = df_norm['capture_id'].isin(val_ids)
df_train = df_norm[~is_val].reset_index(drop=True)
df_val   = df_norm[is_val].reset_index(drop=True)

# [진단] boar 세션별 interhand_dist
print('\n[진단] boar 세션별 interhand_dist:')
boar_rows = df_norm[df_norm['label'] == 'boar']
for cid, g in boar_rows.groupby('capture_id'):
    print(f'  capture_id={cid}: n={len(g)}, interhand_dist 평균={g["interhand_dist"].mean():.3f}')

# ── 5. 라벨별 capture_id holdout (최대 2세션 val) ─────────
sizes = df_norm.groupby(['label', 'capture_id']).size().reset_index(name='n')
val_ids = set()
single_session_labels = set()
for label, group in sizes.groupby('label'):
    if len(group) == 1:
        # 세션이 1개뿐이면 그룹 단위로 나눌 수 없음
        single_session_labels.add(label)
        continue
    group = group.sort_values('n')
    n_sessions = len(group)
    max_val_sessions = min(2, n_sessions - 1)
    for i, (_, row) in enumerate(group.iterrows()):
        if i >= max_val_sessions:
            break
        val_ids.add(row['capture_id'])

is_val = df_norm['capture_id'].isin(val_ids).to_numpy().copy()

# 세션 1개뿐인 라벨은 프레임 단위 랜덤 20% split으로 대체 (근사치)
if single_session_labels:
    print(f'세션 1개뿐인 라벨(프레임 랜덤 split): {single_session_labels}')
    rng = np.random.RandomState(42)
    for label in single_session_labels:
        idx = np.where(df_norm['label'].to_numpy() == label)[0]
        rng.shuffle(idx)
        is_val[idx[:int(len(idx) * args.val_ratio)]] = True

df_train = df_norm[~is_val].reset_index(drop=True)
df_val   = df_norm[is_val].reset_index(drop=True)

# ── 6. 저장 (오버샘플링 없음 — train.py에서 class_weight로 불균형 보정) ──
train_path = os.path.join(args.out_dir, 'processed_train.csv')
val_path   = os.path.join(args.out_dir, 'processed_val.csv')

df_train.drop(columns=['capture_id']).to_csv(train_path, index=False)
df_val.drop(columns=['capture_id']).to_csv(val_path, index=False)

print(f'\n저장 완료')
print(f'  train: {len(df_train)}행 → {train_path}')
print(f'  val:   {len(df_val)}행 → {val_path}')
print('\n클래스 분포 (train):')
print(df_train['label'].value_counts())
print('\n클래스 분포 (val):')
print(df_val['label'].value_counts())

