/**
 * handTracker.js — MediaPipe Hands 래퍼
 * - 양손 랜드마크 추출
 * - 손목 기준 정규화
 * - 캔버스에 랜드마크 시각화
 */

export class HandTracker {
  constructor({ videoEl, canvasEl, onResults }) {
    this.videoEl  = videoEl;
    this.canvasEl = canvasEl;
    this.ctx      = canvasEl.getContext('2d');
    this.onResults = onResults;
    this.hands    = null;
    this.camera   = null;
  }

  async start() {
    this.hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    this.hands.onResults(results => this._handleResults(results));

    this.camera = new Camera(this.videoEl, {
      onFrame: async () => {
        this.canvasEl.width  = this.videoEl.videoWidth;
        this.canvasEl.height = this.videoEl.videoHeight;
        await this.hands.send({ image: this.videoEl });
      },
      width: 640, height: 480,
    });

    await this.camera.start();
  }

  _handleResults(results) {
    // 랜드마크 시각화
    this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
    if (results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach(lm => {
        drawConnectors(this.ctx, lm, HAND_CONNECTIONS, {
          color: 'rgba(139,92,246,0.8)', lineWidth: 2
        });
        drawLandmarks(this.ctx, lm, {
          color: '#fff', fillColor: 'rgba(139,92,246,0.9)', lineWidth: 1, radius: 3
        });
      });
    }

    this.onResults(results);
  }

  /**
   * 정규화: 손목(landmark 0) 기준 상대좌표로 변환
   * 반환값: { right: Float32Array(63) | null, left: Float32Array(63) | null }
   * 각 배열 = [x0,y0,z0, x1,y1,z1, ... x20,y20,z20] (21개 × 3축)
   */
  normalize(multiHandLandmarks, multiHandedness) {
    const result = { right: null, left: null };

    if (!multiHandLandmarks) return result;

    multiHandLandmarks.forEach((lms, idx) => {
      // MediaPipe는 미러링 기준으로 handedness가 반전됨
      const label = multiHandedness?.[idx]?.classification?.[0]?.label;
      const side  = label === 'Left' ? 'right' : 'left';

      const wrist = lms[0];
      const arr   = new Float32Array(63);

      lms.forEach((lm, i) => {
        arr[i * 3]     = lm.x - wrist.x;
        arr[i * 3 + 1] = lm.y - wrist.y;
        arr[i * 3 + 2] = lm.z - wrist.z;
      });

      result[side] = arr;
    });

    return result;
  }
}
