// debug.html 전용 — 게임 로직 없이 손 인식 파이프라인만 그대로 떼어내서
// 원본 확률 분포를 실시간으로 보여주는 진단용 스크립트.
// main.js와 동일한 core/normalize.js, core/gestureClassifier.js의 모델
// 로딩 방식을 그대로 쓰고, threshold(60%) 게이트 없이 raw softmax 값을 노출한다.

import { FilesetResolver, HandLandmarker }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js';
import { normalize } from './core/normalize.js';

const video   = document.getElementById('input-video');
const canvas  = document.getElementById('overlay-canvas');
const ctx     = canvas.getContext('2d');
const statusEl      = document.getElementById('status');
const detectInfoEl  = document.getElementById('detect-info');
const topPredEl     = document.getElementById('top-pred');
const probListEl    = document.getElementById('prob-list');

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resize();
window.addEventListener('resize', resize);

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

let ort_, session, labels, hasModel = false;

async function loadModel() {
  try {
    ort_ = window.ort;
    if (!ort_) throw new Error('window.ort 없음 (onnxruntime-web 로드 실패)');
    const [sess, labelsRes] = await Promise.all([
      ort_.InferenceSession.create('models/handseal.onnx'),
      fetch('models/labels.json'),
    ]);
    session  = sess;
    labels   = await labelsRes.json();
    hasModel = true;
    statusEl.textContent = `모델 로드 완료 (${labels.length}개 클래스: ${labels.join(', ')})`;
  } catch (e) {
    hasModel = false;
    statusEl.textContent = `모델 로드 실패: ${e.message}`;
    statusEl.style.color = '#FF4D4D';
    console.error('[debug] loadModel 실패:', e);
  }
}

// gestureClassifier._predictONNX와 동일 로직이지만 threshold 게이트 없이
// 전체 확률 분포를 그대로 반환한다.
async function predictRaw(normalized) {
  const input = new Float32Array(126);
  if (normalized.right) input.set(normalized.right, 0);
  if (normalized.left)  input.set(normalized.left,  63);
  const tensor = new ort_.Tensor('float32', input, [1, 126]);
  const out    = await session.run({ input: tensor });
  const logits = Array.from(out.output.data);
  const maxL   = Math.max(...logits);
  const exps   = logits.map(x => Math.exp(x - maxL));
  const sum    = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => x / sum);
}

function drawSkeleton(landmarks, W, H) {
  if (!landmarks?.length || !video.videoWidth) return;
  const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
  const ox = (W - video.videoWidth  * scale) / 2;
  const oy = (H - video.videoHeight * scale) / 2;
  const lx = lm => (1 - lm.x) * video.videoWidth  * scale + ox;
  const ly = lm => lm.y        * video.videoHeight * scale + oy;

  landmarks.forEach(hand => {
    ctx.beginPath();
    HAND_CONNECTIONS.forEach(([a, b]) => {
      ctx.moveTo(lx(hand[a]), ly(hand[a]));
      ctx.lineTo(lx(hand[b]), ly(hand[b]));
    });
    ctx.strokeStyle = 'rgba(255,184,0,0.8)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    hand.forEach(lm => {
      ctx.beginPath();
      ctx.arc(lx(lm), ly(lm), 3, 0, Math.PI * 2);
      ctx.fillStyle = '#FFB800';
      ctx.fill();
    });
  });
}

function renderProbs(probs) {
  const order = probs.map((p, i) => i).sort((a, b) => probs[b] - probs[a]);
  const top = order[0];
  topPredEl.textContent = `${labels[top]}  (${(probs[top] * 100).toFixed(1)}%)`;
  probListEl.innerHTML = order.map(i => {
    const pct = (probs[i] * 100).toFixed(1);
    return `<div class="prob-row${i === top ? ' is-top' : ''}">` +
      `<span class="prob-label">${labels[i]}</span>` +
      `<div class="prob-bar-wrap"><div class="prob-bar" style="width:${pct}%"></div></div>` +
      `<span class="prob-pct">${pct}%</span>` +
      `</div>`;
  }).join('');
}

async function init() {
  statusEl.textContent = '카메라 준비중...';
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: 'user' }
  });
  video.srcObject = stream;
  await new Promise(res => { video.onloadedmetadata = () => video.play().then(res); });

  statusEl.textContent = 'MediaPipe 로딩중...';
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

  await loadModel();

  // main.js와 동일한 640x360 검출용 캔버스
  const _detectCanvas = document.createElement('canvas');
  _detectCanvas.width  = 640;
  _detectCanvas.height = 360;
  const _detectCtx = _detectCanvas.getContext('2d');

  let _lastDetectMs = 0;
  let _cachedHands  = { landmarks: [], handednesses: [] };
  let _detectMs     = 0;
  const DETECT_EVERY = 50;

  const fpsTimes = [];
  let fpsDisplay = 0;

  async function loop() {
    requestAnimationFrame(loop);
    if (video.readyState < 2) return;

    const now = performance.now();
    fpsTimes.push(now);
    if (fpsTimes.length > 60) fpsTimes.shift();
    if (fpsTimes.length > 1) {
      fpsDisplay = Math.round((fpsTimes.length - 1) / (fpsTimes[fpsTimes.length - 1] - fpsTimes[0]) * 1000);
    }

    if (now - _lastDetectMs >= DETECT_EVERY) {
      _lastDetectMs = now;
      _detectCtx.drawImage(video, 0, 0, 640, 360);
      const t0 = performance.now();
      _cachedHands = handLandmarker.detectForVideo(_detectCanvas, now);
      _detectMs    = performance.now() - t0;
    }

    const { landmarks, handednesses } = _cachedHands;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    drawSkeleton(landmarks, W, H);

    detectInfoEl.textContent =
      `손 감지: ${landmarks?.length ?? 0}개 | FPS: ${fpsDisplay} | 검출: ${Math.round(_detectMs)}ms | 모델: ${hasModel ? 'OK' : '실패'}`;

    if (landmarks?.length && hasModel) {
      const normalized = normalize(landmarks, handednesses);
      const probs = await predictRaw(normalized);
      renderProbs(probs);
    } else if (!landmarks?.length) {
      topPredEl.textContent = '-- 손 없음 --';
      probListEl.innerHTML = '';
    }
  }

  loop();
}

init().catch(err => {
  statusEl.textContent = '초기화 오류: ' + err.message;
  statusEl.style.color = '#FF4D4D';
  console.error('[debug]', err);
});
