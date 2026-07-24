function softmax(logits) {
  const max  = Math.max(...logits);
  const exps = logits.map(v => Math.exp(v - max));
  const sum  = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

export class GestureClassifier {
  constructor() {
    this.ort       = null;
    this.model     = null;
    this.labels    = [];
    this.hasModel  = false;

    this._lastJutsu = 'none';
    this._lastSeen  = 0;
    this.HOLD_MS    = 300;
    this.CONFIDENCE_THRESHOLD = 90; // 이 미만이면 확신 부족으로 보고 none 처리
  }

  async loadModel() {
    // 1) labels.json 로드
    try {
      const res   = await fetch('/web/models/labels.json');
      this.labels = await res.json();
      console.log('[GestureClassifier] 라벨 로드:', this.labels);
    } catch (e) {
      console.warn('[GestureClassifier] labels.json 로드 실패:', e);
      this.labels = [];
    }

    // 2) ONNX 모델 로드
    try {
      this.ort   = globalThis.ort;
      this.model = await this.ort.InferenceSession.create('/web/models/handseal.onnx');
      this.hasModel = true;
      console.log('[GestureClassifier] ONNX 모델 로드 성공');
    } catch (e) {
      this.hasModel = false;
      console.warn('[GestureClassifier] ONNX 로드 실패:', e);
    }
  }

  async predict(normalized) {
    if (!this.hasModel) return { jutsu: 'none', confidence: 0 };

    const result    = await this._predictONNX(normalized);
    const confirmed = result.jutsu !== 'none' && result.confidence >= this.CONFIDENCE_THRESHOLD;

    if (confirmed) {
      this._lastJutsu = result.jutsu;
      this._lastSeen  = Date.now();
      return result;
    }

    if (Date.now() - this._lastSeen < this.HOLD_MS) {
      return { jutsu: this._lastJutsu, confidence: 50 };
    }

    return { jutsu: 'none', confidence: result.confidence };
  }

  async _predictONNX(normalized) {
    const input = new Float32Array(126);
    if (normalized.right) input.set(normalized.right, 0);
    if (normalized.left)  input.set(normalized.left,  63);

    const tensor = new this.ort.Tensor('float32', input, [1, 126]);
    const out    = await this.model.run({ input: tensor });
    const logits = Array.from(out.output.data);
    const probs  = softmax(logits);

    const maxIdx    = probs.indexOf(Math.max(...probs));
    const jutsuName = this.labels[maxIdx] ?? 'none';

    return {
      jutsu:      jutsuName,
      confidence: Math.round(probs[maxIdx] * 100),
    };
  }
}