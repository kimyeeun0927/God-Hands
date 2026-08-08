# HANDSEAL

웹캠으로 손을 비춰 나루토식 수인(手印)을 맺으면, 브라우저가 실시간으로 이를 인식해 진행하는 웹 기반 미니게임입니다. 서버 없이 클라이언트(브라우저)에서 손 인식부터 제스처 분류, AR 이펙트 렌더링까지 전부 처리합니다.

## 주요 기능

- **실시간 수인 인식**: MediaPipe HandLandmarker로 양손 21개 관절 좌표를 추출하고, 브라우저에서 직접 ONNX 모델을 돌려 수인을 분류합니다. 모델 로드에 실패해도 게임이 멈추지 않도록 규칙 기반 폴백 분류기가 함께 동작합니다.
- **AR 이펙트**: 인식된 수인에 맞춰 손 위치를 따라다니는 나선환·치도리 등 파티클 이펙트를 실시간으로 합성합니다.
- **스토리 기반 3라운드 게임**
  - **Round 1** — OX 퀴즈 (제스처 홀드로 정답 제출)
  - **Round 2** — 정해진 수인 시퀀스를 제한시간 안에 맞추는 콤보 게임 (PERFECT / SUCCESS / MISS 판정, 콤보 보너스, 3연속 실패 시 실격)
  - **Round 3** — 보스전. 5가지 필살기(폭풍 소환 / 대지 용암 폭발 / 정글 결계 / 감전 폭우 / 겁화 태풍) 중 매 파동마다 중복 없이 랜덤으로 하나가 나오고, 정해진 수인 시퀀스를 완성하면 필살기별로 서로 다른 전용 이펙트가 적을 타격합니다.
- **개발자 도구**: 백틱(`` ` ``) 키로 인식 상태·신뢰도를 보여주는 디버그 오버레이 토글, `R` 키 홀드로 제스처 인식을 우회하는 마스터 키.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프론트엔드 | Vanilla JavaScript (ES Modules), 빌드 도구 없이 브라우저에서 바로 실행 |
| 렌더링 | HTML5 Canvas 2D API — 게임 화면, 손 랜드마크 시각화, 파티클 이펙트를 매 프레임 직접 렌더링 |
| 손 인식 | [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) `HandLandmarker` (GPU delegate) |
| 제스처 분류 | [ONNX Runtime Web](https://onnxruntime.ai/) — PyTorch로 학습한 MLP 모델을 브라우저에서 직접 추론 |
| 모델 학습 | PyTorch, scikit-learn (`ml/train.py`) |
| 스타일 | 순수 CSS3 (픽셀 폰트, `image-rendering: pixelated` 등 레트로 톤) |

## 프로젝트 구조

```
Got-Hands/
├── web/                        # 프론트엔드 (실제 실행되는 앱)
│   ├── index.html
│   ├── assets/                 # 캐릭터·적·속성·수인·UI 이미지, 폰트
│   ├── models/                 # handseal.onnx, labels.json (웹에서 로드하는 추론 모델)
│   └── src/
│       ├── main.js             # 카메라 초기화, 손 인식 루프, 정규화, 씬 루프 구동
│       ├── core/
│       │   ├── gestureClassifier.js  # ONNX 추론 + 규칙 기반 폴백
│       │   ├── handTracker.js        # (구버전 MediaPipe Hands 래퍼, 현재 미사용)
│       │   └── dataCollector.js      # 학습용 랜드마크 CSV 수집기
│       ├── effects/
│       │   └── arEffectEngine.js     # AR 파티클 이펙트 엔진
│       ├── game/
│       │   ├── SceneManager.js       # 씬 전환/업데이트/렌더 루프
│       │   └── scenes/               # Onboarding, Round1~3, 대사, 결과 화면 등
│       └── ui/
│           ├── uiController.js
│           └── style.css
├── ml/
│   └── train.py                # 수집된 CSV로 MLP 학습 → ONNX 내보내기
└── .vscode/
```

## 실행 방법

빌드 과정이 없어 정적 파일 서버만 있으면 됩니다. 단, 웹캠(`getUserMedia`)은 보안 컨텍스트(HTTPS 또는 `localhost`)에서만 동작하므로 `web/index.html`을 파일로 직접 열지 말고 반드시 로컬 서버로 띄워야 합니다.

```bash
cd web
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080 접속 후 카메라 권한 허용
```

## 조작 방법

| 입력 | 동작 |
|---|---|
| 손으로 수인 맺기 | 화면에 표시된 수인을 웹캠 앞에서 그대로 재현 |
| `` ` `` (백틱) | 인식 상태 / 신뢰도를 보여주는 디버그 오버레이 토글 |
| `R` (홀드) | 제스처 인식 결과를 무시하고 항상 "정답" 처리 (테스트용 마스터 키) |

## 인식 가능한 수인

| 수인 | 한자 | 대응 속성 |
|---|---|---|
| 돼지 (boar) | 亥 | 땅 |
| 토끼 (rabbit) | 卯 | 바람 |
| 쥐 (rat) | 子 | 전기 |
| 원숭이 (monkey) | 申 | 불 |
| 개 (dog) | 戌 | 물 |
| 뱀 (snake) | 巳 | 풀 |
| O / X | — | Round 1 정답 제출용 |

## 모델 학습 (선택)

새로운 학습 데이터를 모아 모델을 다시 학습하려면:

1. `web/src/core/dataCollector.js`를 활용해 수인별 손 랜드마크를 CSV로 수집 (`ml/data/raw/`에 저장)
2. 학습 실행

   ```bash
   pip install torch scikit-learn pandas numpy onnx
   python ml/train.py
   ```

3. 생성된 `ml/models/handseal.onnx`, `ml/models/labels.json`을 `web/models/`로 복사

`ml/train.py`의 정규화 로직과 `web/src/main.js`의 `normalize()`는 반드시 동일해야 학습된 모델이 웹에서 정확히 동작합니다.
