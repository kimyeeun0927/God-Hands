import { FilesetResolver, HandLandmarker, FaceLandmarker }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js';

import { GestureClassifier } from './core/gestureClassifier.js';
import { UIController }      from './ui/uiController.js';
import { DataCollector }     from './core/dataCollector.js';
import { AREffectEngine }    from './effects/arEffectEngine.js';

const state = { mode: 'demo', currentJutsu: 'none' };

const video  = document.getElementById('input-video');
const canvas = document.getElementById('main-canvas');
const ctx    = canvas.getContext('2d');

const ui        = new UIController(state);
const classifier = new GestureClassifier();
const arFx      = new AREffectEngine(canvas, ctx);
const collector = new DataCollector(onCollectorState);
window._collector = collector;

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function normalize(landmarks, handednessList) {
  const result = { right: null, left: null, interhand: null };
  if (!landmarks) return result;

  let rightLms = null, leftLms = null;
  landmarks.forEach((lms, idx) => {
    const label = handednessList?.[idx]?.[0]?.categoryName;
    const side  = label === 'Left' ? 'right' : 'left';
    if (side === 'right') rightLms = lms; else leftLms = lms;
  });

  const normalizeHand = (lms) => {
    if (!lms) return { arr: null, wrist: null, scale: 0 };
    const wrist = lms[0];
    const midMcp = lms[9];
    const scale = Math.hypot(midMcp.x - wrist.x, midMcp.y - wrist.y, midMcp.z - wrist.z);
    const s = scale > 1e-6 ? scale : 1.0;
    const arr = new Float32Array(63);
    lms.forEach((lm, i) => {
      arr[i*3]   = (lm.x - wrist.x) / s;
      arr[i*3+1] = (lm.y - wrist.y) / s;
      arr[i*3+2] = (lm.z - wrist.z) / s;
    });
    return { arr, wrist, scale: scale > 1e-6 ? scale : 0 };
  };

  const r = normalizeHand(rightLms);
  const l = normalizeHand(leftLms);
  result.right = r.arr;
  result.left  = l.arr;

  // inter-hand feature (preprocess.py의 palm_scale_normalize와 동일 공식)
  const interhand = new Float32Array(4); // dx, dy, dz, dist
  if (r.scale > 0 && l.scale > 0) {
    const avgScale = (r.scale + l.scale) / 2;
    const dx = (r.wrist.x - l.wrist.x) / avgScale;
    const dy = (r.wrist.y - l.wrist.y) / avgScale;
    const dz = (r.wrist.z - l.wrist.z) / avgScale;
    interhand[0] = dx; interhand[1] = dy; interhand[2] = dz;
    interhand[3] = Math.hypot(r.wrist.x - l.wrist.x, r.wrist.y - l.wrist.y, r.wrist.z - l.wrist.z) / avgScale;
  }
  // 한 손만 있으면 0,0,0,0 유지 (preprocess.py와 동일)
  result.interhand = interhand;

  return result;
}
async function init() {
  ui.setStatus('loading', 'MediaPipe 로딩중...');

  // 카메라 스트림
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: 'user' }
  });
  video.srcObject = stream;
  await new Promise(res => { video.onloadedmetadata = () => video.play().then(res); });

  // Tasks Vision WASM 로드
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
  );

  // HandLandmarker 초기화
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

  // FaceLandmarker 초기화 (사륜안용)
  const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
  });

  classifier.loadModel().catch(() => {});
  setupCollectUI();
  ui.setStatus('active', '실행중');

  // ── 메인 루프 ──────────────────────────────────────
  let lastTime = -1;

  async function loop() {
    requestAnimationFrame(loop);

    if (video.readyState < 2) return;
    const now = performance.now();
    if (now === lastTime) return;
    lastTime = now;

    // 손 감지
    const handResult = handLandmarker.detectForVideo(video, now);
    const landmarks  = handResult.landmarks;
    const handedness = handResult.handednesses;

    const normalized = normalize(landmarks, handedness);

    if (state.mode === 'collect') {
      collector.setLandmarks(landmarks, handedness);  // raw 전달 — 정규화는 train.py에서
      arFx.draw('none', landmarks?.length ? landmarks : null, video);
      return;
    }

    if (!landmarks?.length) {
      arFx.draw('none', null, video);
      ui.setJutsu('none');
      ui.setConfidence(0);
      return;
    }

    const { jutsu, confidence } = await classifier.predict(normalized);
    state.currentJutsu = jutsu;
    ui.setJutsu(jutsu);
    ui.setConfidence(confidence);

    // 사륜안이면 얼굴도 감지
    let faceLms = null;
    if (jutsu === 'sharingan') {
      const faceResult = faceLandmarker.detectForVideo(video, now);
      faceLms = faceResult.faceLandmarks?.[0] ?? null;
      arFx.updateFace(faceLms);
    }

    arFx.draw(jutsu, landmarks, video);
  }

  loop();
}

// ── 수집 모드 UI ─────────────────────────────────────
function setupCollectUI() {
  let selectedJutsu = null;
  document.querySelectorAll('.jutsu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.jutsu-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedJutsu = btn.dataset.jutsu;
      document.getElementById('collect-jutsu').textContent = `술식: ${selectedJutsu}`;
      document.getElementById('record-btn').disabled = false;
      document.getElementById('record-btn-text').textContent = '녹화 시작';
    });
  });
  document.getElementById('record-btn').addEventListener('click', () => {
    const cd = parseInt(document.getElementById('cfg-countdown').value) || 3;
    const dr = parseInt(document.getElementById('cfg-duration').value)  || 3;
    collector.COUNTDOWN_SEC      = cd;
    collector.RECORD_DURATION_MS = dr * 1000;
    collector.startRecording(selectedJutsu);
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

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    ui.onModeChange(state.mode);
  });
});

init().catch(err => {
  console.error('[HANDSEAL]', err);
  ui.setStatus('error', '오류: ' + err.message);
});
