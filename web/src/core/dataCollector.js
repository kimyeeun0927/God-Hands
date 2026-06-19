/**
 * dataCollector.js — 3초 카운트다운 후 연속 녹화 수집기
 *
 * 흐름:
 *   버튼 클릭 → 3초 카운트다운 → 3초간 녹화 (매 프레임 캡처)
 *   → 자동 완료 → 다음 녹화 준비
 *
 * CSV 포맷 (127컬럼):
 *   r0x,r0y,r0z,...,r20z, l0x,...,l20z, label
 *   (raw MediaPipe 좌표 — 정규화 없음)
 */

export class DataCollector {
  constructor(onStateChange) {
    this.rows         = [];
    this.count        = 0;
    this._snapshots   = [];
    this._currentLms  = null;
    this._isRecording = false;
    this._onStateChange = onStateChange ?? (() => {});

    this.RECORD_DURATION_MS  = 3000;
    this.COUNTDOWN_SEC       = 3;
    this._recordTimer        = null;
    this._recordInterval     = null;
  }

  /** main.js 루프에서 매 프레임 호출 — raw MediaPipe 결과 전달 */
  setLandmarks(landmarks, handedness) {
    this._currentLms = { landmarks, handedness };

    if (this._isRecording && this._jutsuTarget) {
      this._captureFrame();
    }
  }

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
    this._snapshots.push({ rowCount: this.rows.length, count: this.count });

    this._onStateChange({ phase: 'recording', count: this.count });

    this._recordTimer = setTimeout(() => {
      this._isRecording = false;
      const captured = this.count - startCount;
      this._onStateChange({ phase: 'done', captured, count: this.count });
    }, this.RECORD_DURATION_MS);
  }

  _captureFrame() {
    const { landmarks, handedness } = this._currentLms ?? {};
    if (!landmarks?.length) return;

    const raw = {};
    landmarks.forEach((lms, idx) => {
      const label = handedness?.[idx]?.[0]?.categoryName;
      const side  = label === 'Left' ? 'right' : 'left';
      raw[side] = lms;
    });

    if (!raw.right && !raw.left) return;

    const toFlat = (lms) => lms
      ? lms.flatMap(lm => [lm.x, lm.y, lm.z])
      : new Array(63).fill(0);

    this.rows.push([...toFlat(raw.right), ...toFlat(raw.left), this._jutsuTarget]);
    this.count++;
    this._frameCount++;
  }

  undo() {
    if (this._snapshots.length === 0) {
      alert('되돌릴 녹화가 없습니다.');
      return 0;
    }
    const snap = this._snapshots.pop();
    const removed = this.rows.length - snap.rowCount;
    this.rows.splice(snap.rowCount);
    this.count = snap.count;
    this._onStateChange({ phase: 'idle', count: this.count });
    return removed;
  }

  canUndo() {
    return this._snapshots.length > 0;
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
