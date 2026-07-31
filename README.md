# God Hands 🖐️

나루토 핸드사인(수인)을 웹캠으로 실시간 인식해서 술식 이펙트를 발동시키는 브라우저 앱입니다.
MediaPipe로 손 랜드마크를 추출하고, 자체 학습한 MLP 모델(ONNX)로 어떤 수인인지 분류한 뒤 캔버스 위에 이펙트를 그립니다.

## 주요 기능

- **실시간 손 인식**: MediaPipe Tasks Vision (`HandLandmarker`)로 최대 2개 손 동시 추적
- **제스처 분류**: 좌표를 정규화해 학습된 ONNX 모델로 추론, 모델이 없으면 규칙 기반 fallback으로 동작
- **AR 이펙트**: 인식된 술식에 맞춰 캔버스 위에 오브(orb) 이펙트를 실시간 렌더링
- **데이터 수집 모드**: 웹 UI에서 바로 학습용 랜드마크 데이터를 녹화하고 CSV로 내보내기
- **학습 파이프라인**: 수집한 CSV → 정규화 → 증강 → MLP 학습 → ONNX 변환까지 한 번에 (`ml/train.py`)

## 지원 술식

| 수인 | 표시 |
|---|---|
| 亥 (돼지) | boar |
| 卯 (토끼) | rabbit |
| 子 (쥐) | rat |
| 申 (원숭이) | monkey |
| 戌 (개) | dog |
| 巳 (뱀) | snake |
| O | o |
| X | x |

## 기술 스택

- **프론트엔드**: Vanilla JS (ES Modules), Canvas 2D
- **손 인식**: [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) (HandLandmarker, FaceLandmarker)
- **추론**: [onnxruntime-web](https://onnxruntime.ai/)
- **학습**: PyTorch, scikit-learn, ONNX export

## 프로젝트 구조

```
God-Hands/
├── web/                # 프론트엔드 (Live Server로 실행)
│   ├── index.html
│   ├── models/
│   │   ├── handseal.onnx
│   │   └── labels.json
│   └── src/
│       ├── main.js
│       ├── core/
│       │   ├── gestureClassifier.js
│       │   └── dataCollector.js
│       ├── effects/
│       │   └── arEffectEngine.js
│       └── ui/
│           ├── uiController.js
│           └── style.css
└── ml/
    ├── train.py
    ├── data/raw/
    └── models/
```


## 실행 방법

### 1. 웹앱 실행

`web/` 폴더를 루트로 하는 정적 서버로 띄워야 합니다 (모델을 `/models/handseal.onnx` 절대경로로 불러오기 때문에 반드시 `web/` 기준으로 실행).

**Python 사용 시**
```bash
cd web
python -m http.server 5500
```
서버 실행 후 브라우저에서 http://localhost:5500 접속. 카메라 접근 권한을 허용해주세요. ONNX 모델이 없으면 규칙 기반 fallback으로 동작합니다.

### 2. 학습 데이터 수집
1. 상단 모드 바에서 **DATA COLLECT** 선택
2. 술식 버튼으로 레이블 선택
3. 손 포즈를 잡고 **녹화 시작** → 카운트다운 후 자동 녹화
4. 술식당 500개 이상 프레임 수집 권장 (`↩ 마지막 녹화 취소`로 실수 삭제 가능)
5. **💾 CSV 저장** → `ml/data/raw/`에 이동

### 3. 모델 학습
```bash
pip install torch scikit-learn pandas numpy onnx
python ml/train.py
```
학습이 끝나면 ml/models/handseal.onnx가 생성되고 web/models/에 자동으로 복사됩니다. 새로고침하면 바로 반영됩니다.





