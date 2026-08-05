import { FilesetResolver, HandLandmarker }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js';

import { GestureClassifier } from './core/gestureClassifier.js';
import { UIController }      from './ui/uiController.js';
import { SceneManager }      from './game/SceneManager.js';
import { OnboardingScene }   from './game/scenes/OnboardingScene.js';

const video  = document.getElementById('input-video');
const canvas = document.getElementById('main-canvas');
const ctx    = canvas.getContext('2d');

let devMode = false;
let masterKeyDown = false;

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ml/train.py normalize_landmarks()와 반드시 동일 로직 유지
function normalize(landmarks, handednessList) {
  const result = { right: null, left: null };
  if (!landmarks) return result;

  const raw = { right: null, left: null };
  landmarks.forEach((lms, idx) => {
    const label = handednessList?.[idx]?.[0]?.categoryName;
    // Tasks API: 미러링 카메라 기준 Left/Right 반전 없음
    const side  = label === 'Left' ? 'right' : 'left';
    raw[side] = lms;
  });

  const rWrist  = raw.right ? raw.right[0] : null;
  const lWrist  = raw.left  ? raw.left[0]  : null;
  const lAnchor = rWrist ?? lWrist; // 오른손 있으면 오른손 wrist 기준, 없으면 왼손 wrist 기준

  // scale: 오른손 wrist → 오른손 중지 MCP(9) 거리 (xy). 오른손 없으면 1.0
  let scale = 1.0;
  if (raw.right) {
    const d = Math.hypot(raw.right[9].x - rWrist.x, raw.right[9].y - rWrist.y);
    if (d !== 0) scale = d;
  }

  if (raw.right) {
    const arr = new Float32Array(63);
    raw.right.forEach((lm, i) => {
      arr[i*3]   = (lm.x - rWrist.x) / scale;
      arr[i*3+1] = (lm.y - rWrist.y) / scale;
      arr[i*3+2] = (lm.z - rWrist.z) / scale;
    });
    result.right = arr;
  }

  if (raw.left) {
    const arr = new Float32Array(63);
    raw.left.forEach((lm, i) => {
      arr[i*3]   = (lm.x - lAnchor.x) / scale;
      arr[i*3+1] = (lm.y - lAnchor.y) / scale;
      arr[i*3+2] = (lm.z - lAnchor.z) / scale;
    });
    result.left = arr;
  }

  return result;
}

async function init() {
  await document.fonts.ready;
  const devOverlay = document.getElementById('dev-overlay');

  document.addEventListener('keydown', e => {
    if (e.key === '`') {
      devMode = !devMode;
      devOverlay.classList.toggle('hidden', !devMode);
    } else if (e.key === 'r' || e.key === 'R') {
      masterKeyDown = true;
    }
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'r' || e.key === 'R') {
      masterKeyDown = false;
    }
  });

  const ui = new UIController({});
  ui.setStatus('loading', 'MediaPipe 로딩중...');

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: 'user' }
  });
  video.srcObject = stream;
  await new Promise(res => { video.onloadedmetadata = () => video.play().then(res); });

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
  );

  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.3,
  });

  const classifier = new GestureClassifier();
  classifier.loadModel().catch(() => {});
  ui.setStatus('active', '실행중');

  const scenes = new SceneManager(canvas, ctx, video);
  scenes.goto(OnboardingScene);

  let lastTime = performance.now();

  const fpsEl       = document.getElementById('fps-counter');
  const FPS_SAMPLES = 60;
  const fpsTimes    = [];
  let fpsDisplay    = 0;

  function updateFPS(now) {
    fpsTimes.push(now);
    if (fpsTimes.length > FPS_SAMPLES) fpsTimes.shift();
    if (fpsTimes.length < 2) return;
    const fps = Math.round((fpsTimes.length - 1) / (fpsTimes[fpsTimes.length - 1] - fpsTimes[0]) * 1000);
    if (fps !== fpsDisplay) {
      fpsDisplay = fps;
      fpsEl.textContent = `${fps} FPS  det:${Math.round(_detectMs)}ms`;
      fpsEl.className = fps >= 50 ? 'fps-high' : fps >= 30 ? 'fps-mid' : 'fps-low';
    }
  }

  let _devLastState  = { jutsu: 'none', confidence: 0 };
  let _devPredicting = false;

  let _gameLastJutsu  = 'none';
  let _gamePredicting = false;

  const _detectCanvas = document.createElement('canvas');
  _detectCanvas.width  = 640;
  _detectCanvas.height = 360;
  const _detectCtx = _detectCanvas.getContext('2d');

  let _lastDetectMs = 0;
  let _cachedHands  = { landmarks: [], handednesses: [] };
  let _detectMs     = 0;
  const DETECT_EVERY = 50;

  function loop() {
    requestAnimationFrame(loop);
    if (video.readyState < 2) return;

    const now = performance.now();
    const dt  = Math.min(now - lastTime, 100);
    lastTime  = now;
    updateFPS(now);

    if (now - _lastDetectMs >= DETECT_EVERY) {
      _lastDetectMs = now;
      _detectCtx.drawImage(video, 0, 0, 640, 360);
      const t0 = performance.now();
      _cachedHands = handLandmarker.detectForVideo(_detectCanvas, now);
      _detectMs    = performance.now() - t0;
    }
    const { landmarks, handednesses } = _cachedHands;
    const normalized = normalize(landmarks, handednesses);

    if (devMode) {
      if (!landmarks?.length) {
        _devLastState = { jutsu: 'none', confidence: 0 };
      } else if (!_devPredicting) {
        _devPredicting = true;
        classifier.predict(normalized).then(result => {
          _devLastState  = result;
          _devPredicting = false;
        });
      }
      ui.setJutsu(_devLastState.jutsu);
      ui.setConfidence(_devLastState.confidence);
    }

    const handState = { gesture: 'none', confidence: 0, landmarks, handednesses, normalized, masterKey: masterKeyDown };
    if (landmarks?.length) {
      if (classifier.hasModel) {
        if (!_gamePredicting) {
          _gamePredicting = true;
          classifier.predict(normalized).then(r => {
            _gameLastJutsu  = r.jutsu;
            _gamePredicting = false;
          });
        }
        handState.gesture    = _gameLastJutsu;
        handState.confidence = _gameLastJutsu !== 'none' ? 72 : 0;
      } else {
        const { jutsu, confidence } = classifier.predictSync(normalized);
        handState.gesture    = jutsu;
        handState.confidence = confidence;
      }
    }

    const hideScore = scenes.hideScoreHUD;
    _scoreEl.parentElement.style.display = hideScore ? 'none' : '';
    if (!hideScore) updateScoreHUD(scenes.score);

    scenes.update(dt, handState);
    scenes.render(handState);
  }

  loop();
}

// ── SCORE HUD ─────────────────────────────────────────────────
const _scoreEl = document.getElementById('score-value');
let _dispScore = 0;

function updateScoreHUD(targetScore) {
  if (_dispScore < targetScore) {
    const step = Math.max(10, Math.ceil((targetScore - _dispScore) / 12));
    _dispScore = Math.min(targetScore, _dispScore + step);
  } else if (_dispScore > targetScore) {
    _dispScore = targetScore;
  }
  _scoreEl.textContent = String(_dispScore).padStart(6, '0');
}

init().catch(err => {
  console.error('[HANDSEAL]', err);
});
