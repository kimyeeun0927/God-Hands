/**
 * dataCollector.js — 학습 데이터 수집기
 *
 * 사용법:
 *   1. 수집 모드 진입
 *   2. 술식 선택 (collectTarget 설정)
 *   3. 손 포즈 잡고 스페이스바 → capture() 호출
 *   4. CSV 저장 버튼 → exportCSV()
 *
 * CSV 포맷:
 *   r0x,r0y,r0z,...,r20z, l0x,...,l20z, label
 *   (right 63컬럼 + left 63컬럼 + label 1컬럼 = 127컬럼)
 */

export class DataCollector {
  constructor() {
    this.rows        = [];   // 수집된 데이터 행
    this.count       = 0;
    this._currentLms = null; // 최신 랜드마크 스냅샷
  }

  /** HandTracker에서 매 프레임 호출 — 최신 랜드마크 캐시 */
  setLandmarks(normalized) {
    this._currentLms = normalized;
  }

  /** 스페이스바 눌렀을 때 현재 프레임 저장 */
  capture(jutsuLabel) {
    if (!jutsuLabel) {
      alert('술식을 먼저 선택하세요!');
      return;
    }
    if (!this._currentLms) {
      console.warn('[Collector] 랜드마크 없음 — 손이 보이지 않습니다');
      return;
    }

    const { right, left } = this._currentLms;

    // 없는 손은 0으로 패딩
    const r = right ?? new Float32Array(63);
    const l = left  ?? new Float32Array(63);

    const row = [...r, ...l, jutsuLabel];
    this.rows.push(row);
    this.count++;

    // 시각 피드백
    this._flash();
    console.log(`[Collector] ${jutsuLabel} 캡처 (총 ${this.count}개)`);
  }

  /** CSV 파일로 다운로드 */
  exportCSV() {
    if (this.rows.length === 0) {
      alert('수집된 데이터가 없습니다.');
      return;
    }

    // 헤더 생성
    const header = [
      ...Array.from({ length: 21 }, (_, i) => [`r${i}x`, `r${i}y`, `r${i}z`]).flat(),
      ...Array.from({ length: 21 }, (_, i) => [`l${i}x`, `l${i}y`, `l${i}z`]).flat(),
      'label'
    ].join(',');

    const csv   = [header, ...this.rows.map(r => r.join(','))].join('\n');
    const blob  = new Blob([csv], { type: 'text/csv' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    const ts    = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    a.href     = url;
    a.download = `handseal_data_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log(`[Collector] CSV 저장 완료 (${this.rows.length}행)`);
  }

  /** 캡처 시 화면 번쩍 피드백 */
  _flash() {
    const el = document.getElementById('camera-container');
    el.style.outline = '3px solid #8b5cf6';
    setTimeout(() => el.style.outline = 'none', 100);
  }
}
