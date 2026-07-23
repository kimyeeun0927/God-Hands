import { FilesetResolver, HandLandmarker }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js';

import { GestureClassifier } from './core/gestureClassifier.js';
import { UIController }      from './ui/uiController.js';
import { DataCollector }     from './core/dataCollector.js';
import { AREffectEngine }    from './effects/arEffectEngine.js';
import { SceneManager }      from './game/SceneManager.js';
import { OnboardingScene }   from './game/scenes/OnboardingScene.js';

const video  = document.getElementById('input-video');
const canvas = document.getElementById('main-canvas');
const ctx    = canvas.getContext('2d');

// 게임 모드가 기본, 백틱(`) 으로 dev 패널 토글
let devMode = false;
const devState = { mode: 'collect' };

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function normalize(landmarks, handednessList) {
  const result = { right: null, left: null };
  if (!landmarks) return result;
  landmarks.forEach((lms, idx) => {
    const label = handednessList?.[idx]?.[0]?.categoryName;
    const side  = label === 'Left' ? 'right' : 'left';
    const wrist = lms[0];
    const arr   = new Float32Array(63);
    lms.forEach((lm, i) => {
      arr[i*3]   = lm.x - wrist.x;
      arr[i*3+1] = lm.y - wrist.y;
      arr[i*3+2] = lm.z - wrist.z;
    });
    result[side] = arr;
  });
  return result;
}

async function init() {
  const devOverlay = document.getElementById('dev-overlay');

  // dev 패널 토글
  document.addEventListener('keydown', e => {
    if (e.key === '`') {
      devMode = !devMode;
      devOverlay.classList.toggle('hidden', !devMode);
    }
  });

  // 상태 표시 (dev 모드에서만 의미 있음)
  const ui = new UIController(devState);
  ui.setStatus('loading', 'MediaPipe 로딩중...');

  // 카메라 스트림
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: 'user' }
  });
  video.srcObject = stream;
  await new Promise(res => { video.onloadedmetadata = () => video.play().then(res); });

  // Tasks Vision WASM
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

  const classifier   = new GestureClassifier();
  const arFx         = new AREffectEngine(canvas, ctx);
  const collector    = new DataCollector(onCollectorState);
  window._collector  = collector;

  classifier.loadModel().catch(() => {});
  setupCollectUI(collector);
  ui.setStatus('active', '실행중');

  // 게임 씬 매니저 초기화
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
      fpsEl.textContent = `${fps} FPS`;
      fpsEl.className = fps >= 50 ? 'fps-high' : fps >= 30 ? 'fps-mid' : 'fps-low';
    }
  }

  async function loop() {
    requestAnimationFrame(loop);
    if (video.readyState < 2) return;

    const now = performance.now();
    const dt  = Math.min(now - lastTime, 100); // 최대 100ms 캡
    lastTime  = now;
    updateFPS(now);

    const handResult  = handLandmarker.detectForVideo(video, now);
    const { landmarks, handednesses } = handResult;
    const normalized  = normalize(landmarks, handednesses);

    // ── Dev / 데이터 수집 모드 ────────────────────────────
    if (devMode) {
      if (devState.mode === 'collect') {
        collector.setLandmarks(normalized);
        arFx.draw('none', landmarks?.length ? landmarks : null, video);
        return;
      }
      // dev demo 모드
      if (!landmarks?.length) {
        arFx.draw('none', null, video);
        ui.setJutsu('none'); ui.setConfidence(0);
        return;
      }
      const { jutsu, confidence } = await classifier.predict(normalized);
      ui.setJutsu(jutsu); ui.setConfidence(confidence);
      arFx.draw(jutsu, landmarks, video);
      return;
    }

    // ── 게임 모드 ─────────────────────────────────────────
    const handState = { gesture: 'none', confidence: 0, landmarks, handednesses, normalized };
    if (landmarks?.length) {
      const { jutsu, confidence } = await classifier.predict(normalized);
      handState.gesture    = jutsu;
      handState.confidence = confidence;
    }

    updateTimerHUD(dt);
    const hideScore = scenes.hideScoreHUD;
    _scoreEl.parentElement.style.display = hideScore ? 'none' : '';
    if (!hideScore) updateScoreHUD(scenes.score);
    updateHandHUD(handState);
    scenes.update(dt, handState);
    scenes.render(handState);
  }

  loop();
}

// ── 데이터 수집 UI (dev 패널 내부) ───────────────────────────

function setupCollectUI(collector) {
  document.querySelectorAll('.jutsu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.jutsu-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const jutsu = btn.dataset.jutsu;
      document.getElementById('collect-jutsu').textContent = `술식: ${jutsu}`;
      document.getElementById('record-btn').disabled = false;
      document.getElementById('record-btn-text').textContent = '녹화 시작';
    });
  });

  document.getElementById('record-btn').addEventListener('click', () => {
    const cd = parseInt(document.getElementById('cfg-countdown').value) || 3;
    const dr = parseInt(document.getElementById('cfg-duration').value)  || 3;
    collector.COUNTDOWN_SEC      = cd;
    collector.RECORD_DURATION_MS = dr * 1000;
    const active = document.querySelector('.jutsu-btn.active');
    if (active) collector.startRecording(active.dataset.jutsu);
  });

  document.getElementById('save-btn').addEventListener('click', () => collector.exportCSV());

  document.getElementById('undo-btn').addEventListener('click', () => {
    const removed = collector.undo();
    if (removed > 0) {
      document.getElementById('collect-count').textContent = `총 수집: ${collector.count}개`;
      document.getElementById('done-msg').textContent = `${removed}프레임 삭제됨 (누적 ${collector.count}개)`;
      const toast = document.getElementById('done-toast');
      toast.classList.add('visible');
      setTimeout(() => toast.classList.remove('visible'), 2500);
    }
  });

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      devState.mode = btn.dataset.mode;
      document.getElementById('collect-panel')
        .classList.toggle('hidden', devState.mode !== 'collect');
    });
  });
}

function onCollectorState({ phase, remaining, captured, count }) {
  const overlay   = document.getElementById('countdown-overlay');
  const recInd    = document.getElementById('record-indicator');
  const toast     = document.getElementById('done-toast');
  const recordBtn = document.getElementById('record-btn');
  const btnText   = document.getElementById('record-btn-text');
  document.getElementById('collect-count').textContent = `총 수집: ${count}개`;

  if (phase === 'countdown') {
    overlay.classList.add('visible');
    document.getElementById('countdown-number').textContent = remaining;
    recordBtn.disabled = true; btnText.textContent = `${remaining}초...`;
  } else if (phase === 'recording') {
    overlay.classList.remove('visible');
    recInd.classList.add('visible');
    recordBtn.classList.add('recording'); recordBtn.disabled = true; btnText.textContent = '녹화 중...';
  } else if (phase === 'done') {
    recInd.classList.remove('visible');
    recordBtn.classList.remove('recording'); recordBtn.disabled = false; btnText.textContent = '다시 녹화';
    document.getElementById('done-msg').textContent = `${captured}프레임 수집 완료 (누적 ${count}개)`;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
  } else {
    overlay.classList.remove('visible'); recInd.classList.remove('visible');
  }
}

// ── 게임 타이머 HUD ───────────────────────────────────────────
const _timerEl  = document.getElementById('timer-value');
let _timerMs    = 0;
let _timerSec   = -1;

function updateTimerHUD(dt) {
  _timerMs += dt;
  const secs = Math.floor(_timerMs / 1000);
  if (secs !== _timerSec) {
    _timerSec = secs;
    _timerEl.textContent = String(secs).padStart(2, '0');
  }
}

// ── SCORE HUD (픽셀 카운트업 애니메이션) ─────────────────────
const _scoreEl   = document.getElementById('score-value');
let _dispScore   = 0;
let _prevScore   = 0;

function updateScoreHUD(targetScore) {
  if (targetScore !== _prevScore) _prevScore = targetScore;
  if (_dispScore < targetScore) {
    const step   = Math.max(10, Math.ceil((targetScore - _dispScore) / 12));
    _dispScore   = Math.min(targetScore, _dispScore + step);
  } else if (_dispScore > targetScore) {
    _dispScore = targetScore;
  }
  _scoreEl.textContent = String(_dispScore).padStart(6, '0');
}

// ── 손 인식 HUD 업데이트 ─────────────────────────────────────
const GESTURE_KO = { none: '—', boar: '돼지 (亥)', rabbit: '토끼 (卯)', rat: '쥐 (子)' };
const _hudBadge  = document.getElementById('hud-status-badge');
const _hudBar    = document.getElementById('hud-bar');
const _hudPct    = document.getElementById('hud-pct');
const _hudGesture = document.getElementById('hud-gesture-name');

function updateHandHUD(handState) {
  const conf = handState.confidence ?? 0;
  const hasHand = handState.landmarks?.length > 0;

  if (!hasHand) {
    _hudBadge.textContent  = '손 없음';
    _hudBadge.className    = 'hud-badge hud-none';
    _hudBar.style.width    = '0%';
    _hudBar.style.background = 'rgba(255,255,255,0.1)';
    _hudPct.textContent    = '0%';
    _hudGesture.textContent = '—';
    return;
  }

  if (conf >= 70) {
    _hudBadge.textContent = 'GOOD';
    _hudBadge.className   = 'hud-badge hud-good';
    _hudBar.style.background = '#10b981';
  } else if (conf >= 40) {
    _hudBadge.textContent = '인식 중';
    _hudBadge.className   = 'hud-badge hud-mid';
    _hudBar.style.background = '#f6e05e';
  } else {
    _hudBadge.textContent = '낮음';
    _hudBadge.className   = 'hud-badge hud-low';
    _hudBar.style.background = '#fc8181';
  }
  _hudBar.style.width    = `${Math.min(100, conf)}%`;
  _hudPct.textContent    = `${Math.round(conf)}%`;
  _hudGesture.textContent = GESTURE_KO[handState.gesture] ?? handState.gesture;
}

init().catch(err => {
  console.error('[HANDSEAL]', err);
});
