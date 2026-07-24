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
  const result = { right: null, left: null };
  if (!landmarks || landmarks.length < 2) return result;

  let rightWrist = null, leftWrist = null;
  let rightLms = null, leftLms = null;

  landmarks.forEach((lms, idx) => {
    const label = handednessList?.[idx]?.[0]?.categoryName;
    const side  = label === 'Left' ? 'right' : 'left';
    if (side === 'right') { rightWrist = lms[0]; rightLms = lms; }
    if (side === 'left')  { leftWrist  = lms[0]; leftLms  = lms; }
  });

  if (!rightWrist || !leftWrist) return result;

  const cx = (rightWrist.x + leftWrist.x) / 2;
  const cy = (rightWrist.y + leftWrist.y) / 2;
  const cz = (rightWrist.z + leftWrist.z) / 2;
  const scale = Math.hypot(
    rightWrist.x - leftWrist.x,
    rightWrist.y - leftWrist.y,
    rightWrist.z - leftWrist.z,
  ) || 1;

  const toArr = (lms) => {
    const arr = new Float32Array(63);
    lms.forEach((lm, i) => {
      arr[i*3]   = (lm.x - cx) / scale;
      arr[i*3+1] = (lm.y - cy) / scale;
      arr[i*3+2] = (lm.z - cz) / scale;
    });
    return arr;
  };

  result.right = toArr(rightLms);
  result.left  = toArr(leftLms);
  return result;
}

async function init() {
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

  const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
  });

  await classifier.loadModel().catch(() => {});

  setupCollectUI();
  ui.setStatus('active', '실행중');

  let lastTime = -1;
  let fpsFrameCount = 0;
  let fpsLastUpdate = performance.now();

  async function loop() {
    requestAnimationFrame(loop);

    if (video.readyState < 2) return;
    const now = performance.now();
    if (now === lastTime) return;
    lastTime = now;

    fpsFrameCount++;
    if (now - fpsLastUpdate >= 500) {
      ui.setFPS(Math.round((fpsFrameCount * 1000) / (now - fpsLastUpdate)));
      fpsFrameCount  = 0;
      fpsLastUpdate  = now;
    }

    const handResult = handLandmarker.detectForVideo(video, now);
    const landmarks  = handResult.landmarks;
    const handedness = handResult.handednesses;

    const normalized = normalize(landmarks, handedness);

    if (state.mode === 'collect') {
      collector.setLandmarks(landmarks, handedness);  // normalized → raw
      arFx.draw('none', landmarks?.length ? landmarks : null, video);
      return;
    }

    if (!normalized.right || !normalized.left) {
      arFx.draw('none', null, video);
      ui.setJutsu('none');
      ui.setConfidence(0);
      return;
    }

    const { jutsu, confidence } = await classifier.predict(normalized);
    state.currentJutsu = jutsu;
    ui.setJutsu(jutsu);
    ui.setConfidence(confidence);

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

  document.getElementById('stop-btn').addEventListener('click', () => {
    collector.stopRecording();
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
  const stopBtn   = document.getElementById('stop-btn');
  const btnText   = document.getElementById('record-btn-text');

  document.getElementById('collect-count').textContent = `총 수집: ${count}개`;

  if (phase === 'countdown') {
    overlay.classList.add('visible');
    document.getElementById('countdown-number').textContent = remaining;
    recordBtn.disabled = true;
    btnText.textContent = `${remaining}초...`;
    stopBtn.classList.remove('hidden');
  } else if (phase === 'recording') {
    overlay.classList.remove('visible');
    recInd.classList.add('visible');
    recordBtn.classList.add('recording');
    recordBtn.disabled = true;
    btnText.textContent = '녹화 중...';
    stopBtn.classList.remove('hidden');
  } else if (phase === 'done') {
    recInd.classList.remove('visible');
    recordBtn.classList.remove('recording');
    recordBtn.disabled = false;
    btnText.textContent = '다시 녹화';
    stopBtn.classList.add('hidden');
    document.getElementById('done-msg').textContent = `${captured}프레임 수집 완료 (누적 ${count}개)`;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
  } else {
    // idle
    overlay.classList.remove('visible');
    recInd.classList.remove('visible');
    recordBtn.classList.remove('recording');
    recordBtn.disabled = false;
    btnText.textContent = '녹화 시작';
    stopBtn.classList.add('hidden');
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