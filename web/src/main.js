/**
 * main.js — 앱 진입점
 * HandTracker → GestureClassifier → EffectEngine 순으로 파이프라인 연결
 */

import { HandTracker } from './core/handTracker.js';
import { GestureClassifier } from './core/gestureClassifier.js';
import { EffectEngine } from './effects/effectEngine.js';
import { UIController } from './ui/uiController.js';
import { DataCollector } from './core/dataCollector.js';

// ── 전역 상태 ──────────────────────────────────────────
const state = {
  mode: 'demo',          // 'demo' | 'collect' | 'debug'
  currentJutsu: 'none',  // 현재 감지된 술식
  collectTarget: null,   // 수집 모드에서 선택된 술식
  isRunning: false,
};

// ── 모듈 초기화 ────────────────────────────────────────
const ui         = new UIController(state);
const collector  = new DataCollector();
const classifier = new GestureClassifier();
const effect     = new EffectEngine(document.getElementById('effect-container'));
const tracker    = new HandTracker({
  videoEl:  document.getElementById('input-video'),
  canvasEl: document.getElementById('landmark-canvas'),
  onResults: handleResults,
});

// ── 메인 콜백: MediaPipe 결과 처리 ────────────────────
async function handleResults(results) {
  if (!results.multiHandLandmarks?.length) {
    ui.setJutsu('none');
    effect.trigger('none');
    return;
  }

  // 1. 랜드마크 정규화 (손목 기준 상대좌표)
  const normalized = tracker.normalize(results.multiHandLandmarks);

  // 2. 모드별 분기
  if (state.mode === 'collect') {
    // 데이터 수집 모드: 스페이스바로 저장
    collector.setLandmarks(normalized);
    ui.updateCollectCount(collector.count);
    return;
  }

  // 3. 술식 분류
  const { jutsu, confidence } = await classifier.predict(normalized);

  // 4. UI + 이펙트 업데이트
  if (jutsu !== state.currentJutsu) {
    state.currentJutsu = jutsu;
    ui.setJutsu(jutsu, confidence);
    effect.trigger(jutsu);
  }

  ui.setConfidence(confidence);
}

// ── 키보드 단축키 ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && state.mode === 'collect') {
    e.preventDefault();
    collector.capture(state.collectTarget);
  }
});

// ── 모드 전환 버튼 ────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    ui.onModeChange(state.mode);
  });
});

// ── 술식 선택 버튼 (수집 모드) ────────────────────────
document.querySelectorAll('.jutsu-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.jutsu-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.collectTarget = btn.dataset.jutsu;
    document.getElementById('collect-jutsu').textContent = `술식: ${state.collectTarget}`;
  });
});

// ── CSV 저장 버튼 ─────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', () => {
  collector.exportCSV();
});

// ── 앱 시작 ───────────────────────────────────────────
async function init() {
  ui.setStatus('loading', 'MediaPipe 로딩중...');
  await classifier.loadModel();   // 모델 있으면 로드, 없으면 스킵
  await tracker.start();
  ui.setStatus('active', '실행중');
  state.isRunning = true;
}

init().catch(err => {
  console.error(err);
  ui.setStatus('error', '오류: ' + err.message);
});
