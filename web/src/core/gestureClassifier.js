/**
 * gestureClassifier.js — 술식 분류기
 *
 * 두 가지 모드로 동작:
 *   1) ONNX 모델이 있으면 → ML 추론
 *   2) 모델 없으면 → 규칙 기반 fallback (개발 초기용)
 *
 * 입력: { right: Float32Array(63), left: Float32Array(63) }
 * 출력: { jutsu: string, confidence: number }
 */

const JUTSU_LABELS = [
  'none',
  'shadow_clone',   // 다중 분신술
  'rasengan',       // 나선환
  'chidori',        // 치도리
  'sharingan',      // 사륜안
];

export class GestureClassifier {
  constructor() {
    this.model    = null;    // ONNX 세션 (로드 후)
    this.hasModel = false;
  }

  /**
   * ONNX 모델 로드 시도
   * 모델 파일이 없으면 규칙 기반으로 fallback
   */
  async loadModel() {
    try {
      // onnxruntime-web CDN
      const ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');
      this.model = await ort.InferenceSession.create('/models/handseal.onnx');
      this.hasModel = true;
      console.log('[Classifier] ONNX 모델 로드 완료');
    } catch {
      console.warn('[Classifier] 모델 없음 → 규칙 기반 fallback 사용');
      this.hasModel = false;
    }
  }

  /**
   * 술식 예측
   * @param {{ right: Float32Array|null, left: Float32Array|null }} normalized
   * @returns {{ jutsu: string, confidence: number }}
   */
  async predict(normalized) {
    if (this.hasModel) {
      return this._predictONNX(normalized);
    }
    return this._predictRules(normalized);
  }

  // ── ONNX 추론 ──────────────────────────────────────
  async _predictONNX(normalized) {
    const { right, left } = normalized;

    // 126차원 벡터 생성 (right 63 + left 63, 없는 손은 0으로 패딩)
    const input = new Float32Array(126);
    if (right) input.set(right, 0);
    if (left)  input.set(left,  63);

    const tensor = new ort.Tensor('float32', input, [1, 126]);
    const output = await this.model.run({ input: tensor });
    const probs  = output.output.data;  // softmax 확률 배열

    const maxIdx  = probs.indexOf(Math.max(...probs));
    return {
      jutsu:      JUTSU_LABELS[maxIdx],
      confidence: Math.round(probs[maxIdx] * 100),
    };
  }

  // ── 규칙 기반 fallback ─────────────────────────────
  // 실제 훈련 전 개발/테스트용. 정확도 낮음.
  _predictRules(normalized) {
    const lm = normalized.right || normalized.left;
    if (!lm) return { jutsu: 'none', confidence: 0 };

    // landmark index 기준 (정규화 후 y값 — 손목 기준이라 위가 음수)
    const tip   = i => ({ x: lm[i*3], y: lm[i*3+1], z: lm[i*3+2] });
    const pip   = i => ({ x: lm[i*3], y: lm[i*3+1] });

    const fingerUp = (tipIdx, pipIdx) => tip(tipIdx).y < pip(pipIdx).y;

    const index  = fingerUp(8,  6);
    const middle = fingerUp(12, 10);
    const ring   = fingerUp(16, 14);
    const pinky  = fingerUp(20, 18);
    const pinchDist = Math.hypot(tip(8).x - tip(4).x, tip(8).y - tip(4).y);

    if (pinchDist < 0.08 && !index && !middle)        return { jutsu: 'rasengan',     confidence: 70 };
    if (index && middle && ring && pinky)              return { jutsu: 'shadow_clone', confidence: 70 };
    if (index && middle && !ring && !pinky)            return { jutsu: 'chidori',      confidence: 65 };
    if (!index && !middle && !ring && !pinky)          return { jutsu: 'sharingan',    confidence: 60 };

    return { jutsu: 'none', confidence: 0 };
  }
}
