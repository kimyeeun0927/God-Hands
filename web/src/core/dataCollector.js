/**
 * dataCollector.js — 3초 카운트다운 후 연속 녹화 수집기
 *
 * 흐름:
 *   버튼 클릭 → 3초 카운트다운 → 3초간 녹화 (매 프레임 캡처)
 *   → 자동 완료 → 다음 녹화 준비
 *
 * CSV 포맷 (127컬럼):
 *   r0x,r0y,r0z,...,r20z, l0x,...,l20z, label
 */

export class DataCollector {
  constructor(onStateChange) {
    this.rows         = [];
    this.count        = 0;
    this._currentLms  = null;
    this._isRecording = false;
    this._onStateChange = onStateChange ?? (() => {});

    // 녹화 설정
    this.RECORD_DURATION_MS  = 3000;  // 녹화 시간
    this.COUNTDOWN_SEC       = 3;     // 카운트다운
    this._recordTimer        = null;
    this._recordInterval     = null;
  }

  /** HandTracker에서 매 프레임 호출 */
  setLandmarks(normalized) {
    this._currentLms = normalized;

    // 녹화 중이면 프레임마다 자동 저장
    if (this._isRecording && this._jutsuTarget) {
      this._captureFrame();
    }
  }

  /**
   * 버튼 클릭 시 호출
   * → 3초 카운트다운 → 3초 녹화 → 완료
   */
  startRecording(jutsuLabel) {
    if (!jutsuLabel || jutsuLabel === '') {
      alert('술식을 먼저 선택하세요!');
      return;
    }
    if (this._isRecording) return;

    this._jutsuTarget = jutsuLabel;
    this._startCountdown();
  }

  stopRecording() {
    this._isRecording = false;
    clearTimeout(this._recordTimer);
    this._onStateChange({ phase: 'idle', count: this.count });
  }

  // ── 내부 ──────────────────────────────────────────────

  _startCountdown() {
    let remaining = this.COUNTDOWN_SEC;
    this._onStateChange({ phase: 'countdown', remaining, count: this.count });

    const tick = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(tick);
        this._startRecording();
      } else {
        this._onStateChange({ phase: 'countdown', remaining, count: this.count });
      }
    }, 1000);
  }

  _startRecording() {
    this._isRecording   = true;
    this._frameCount    = 0;
    const startCount    = this.count;

    this._onStateChange({ phase: 'recording', count: this.count });

    // RECORD_DURATION_MS 후 자동 종료
    this._recordTimer = setTimeout(() => {
      this._isRecording = false;
      const captured = this.count - startCount;
      this._onStateChange({ phase: 'done', captured, count: this.count });
    }, this.RECORD_DURATION_MS);
  }

  _captureFrame() {
    const lms = this._currentLms;
    if (!lms) return;

    const { right, left } = lms;

    // 양손 다 없으면 스킵
    if (!right && !left) return;

    const r = right ?? new Float32Array(63);
    const l = left  ?? new Float32Array(63);

    this.rows.push([...r, ...l, this._jutsuTarget]);
    this.count++;
    this._frameCount++;
  }

  exportCSV() {
    if (this.rows.length === 0) {
      alert('수집된 데이터가 없습니다.');
      return;
    }

    const header = [
      ...Array.from({ length: 21 }, (_, i) => [`r${i}x`, `r${i}y`, `r${i}z`]).flat(),
      ...Array.from({ length: 21 }, (_, i) => [`l${i}x`, `l${i}y`, `l${i}z`]).flat(),
      'label'
    ].join(',');

    const csv  = [header, ...this.rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    a.href     = url;
    a.download = `${this.rows[0]?.at(-1) ?? 'handseal'}_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log(`[Collector] CSV 저장 (${this.rows.length}행)`);
  }
}
