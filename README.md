# Got-Hands 🖐️

나루토 핸드사인을 실시간 CV로 인식해서 술식 이펙트를 발동하는 웹앱

## 프로젝트 구조

```
handseal/
├── web/                        # 프론트엔드 (Live Server로 실행)
│   ├── index.html
│   ├── public/
│   │   └── models/
│   │       └── handseal.onnx   # 학습 후 여기에 복사
│   └── src/
│       ├── main.js             # 앱 진입점 / 파이프라인 연결
│       ├── core/
│       │   ├── handTracker.js      # MediaPipe 래퍼 + 정규화
│       │   ├── gestureClassifier.js # ONNX 추론 + 규칙 기반 fallback
│       │   └── dataCollector.js    # 학습 데이터 수집 + CSV 저장
│       ├── effects/
│       │   └── effectEngine.js     # Three.js 파티클 이펙트
│       └── ui/
│           ├── uiController.js     # UI 상태 관리
│           └── style.css
│
└── ml/                         # 학습 파이프라인 (Python)
    ├── train.py                # 모델 학습 + ONNX 변환
    ├── data/
    │   └── raw/                # CSV 파일 여기에 저장
    └── models/                 # 학습된 모델 저장
        ├── handseal.onnx
        └── labels.json
```

## 실행 방법

### 1단계: 웹앱 실행
```
VS Code → web/index.html → Go Live
```
처음엔 ONNX 모델 없으므로 규칙 기반 fallback으로 동작

### 2단계: 데이터 수집
1. 웹앱에서 **DATA COLLECT** 모드 선택
2. 술식 버튼 클릭으로 레이블 선택
3. 손 포즈 잡고 **SPACE** → 캡처
4. 술식당 500개 이상 수집 권장
5. **CSV 저장** → `ml/data/raw/`에 이동

### 3단계: 모델 학습
```bash
pip install torch scikit-learn pandas numpy onnx
python ml/train.py
```

### 4단계: 모델 배포
```bash
cp ml/models/handseal.onnx web/public/models/handseal.onnx
```
새로고침하면 ONNX 모델로 자동 전환

## 술식 추가하기

1. `web/src/ui/uiController.js` → `JUTSU_KO`, `JUTSU_COLOR`에 추가
2. `web/src/effects/effectEngine.js` → `JUTSU_CONFIG`와 파티클 모양 추가
3. `index.html` → `.jutsu-btn` 버튼 추가
4. 데이터 수집 후 재학습
