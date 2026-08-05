export class GestureClassifier {
  constructor() {
    this._lastJutsu = 'none';
    this._lastSeen  = 0;
    this.HOLD_MS    = 300;
    this.labels     = null;
    this.hasModel   = false;
  }

  async loadModel() {
    try {
      this.ort = window.ort;
      if (!this.ort) throw new Error('window.ort가 없음');

      const [session, labelsRes] = await Promise.all([
        this.ort.InferenceSession.create('models/handseal.onnx'),
        fetch('models/labels.json'),
      ]);
      this.model    = session;
      this.labels   = await labelsRes.json();
      this.hasModel = true;
    } catch (e) {
      console.error('[GestureClassifier] loadModel 실패:', e);
      this.hasModel = false;
    }
  }

  // 게임 루프 전용 동기 경로 (모델 없을 때 — 항상 이 경로 사용)
  predictSync(normalized) {
    const result = this._predictRules(normalized);
    if (result.jutsu !== 'none') {
      this._lastJutsu = result.jutsu;
      this._lastSeen  = Date.now();
      return result;
    }
    if (Date.now() - this._lastSeen < this.HOLD_MS) {
      return { jutsu: this._lastJutsu, confidence: 50 };
    }
    return result;
  }

  async predict(normalized) {
    const result = this.hasModel
      ? await this._predictONNX(normalized)
      : this._predictRules(normalized);
    if (result.jutsu !== 'none') {
      this._lastJutsu = result.jutsu;
      this._lastSeen  = Date.now();
      return result;
    }
    if (Date.now() - this._lastSeen < this.HOLD_MS) {
      return { jutsu: this._lastJutsu, confidence: 50 };
    }
    return result;
  }

  async _predictONNX(normalized) {
    const input = new Float32Array(126);
    if (normalized.right) input.set(normalized.right, 0);
    if (normalized.left)  input.set(normalized.left,  63);

    const tensor = new this.ort.Tensor('float32', input, [1, 126]);
    const out    = await this.model.run({ input: tensor });
    const logits = Array.from(out.output.data);
    const maxL   = Math.max(...logits);
    const exps   = logits.map(x => Math.exp(x - maxL));
    const sum    = exps.reduce((a, b) => a + b, 0);
    const probs  = exps.map(x => x / sum);
    const maxIdx = probs.indexOf(Math.max(...probs));
    const conf   = Math.round(probs[maxIdx] * 100);
    if (conf < 90) return { jutsu: 'none', confidence: conf };
    return { jutsu: this.labels[maxIdx], confidence: conf };
  }

  _predictRules(normalized) {
    const r = normalized.right;
    const l = normalized.left;
    if (!r || !l) return { jutsu: 'none', confidence: 0 };

    const tip  = (lm, i) => ({ x: lm[i*3], y: lm[i*3+1] });
    const up   = (lm, t, p) => lm && tip(lm,t).y < tip(lm,p).y;
    const down = (lm, t, p) => lm && tip(lm,t).y > tip(lm,p).y;

    const rWrist = tip(r, 0);
    const lWrist = tip(l, 0);
    const wristDist = Math.hypot(rWrist.x - lWrist.x, rWrist.y - lWrist.y);

    // 돼지(亥)
    const isBoar = wristDist < 0.25 &&
      down(r,8,6) && down(r,12,10) && down(r,16,14) && down(r,20,18) &&
      down(l,8,6) && down(l,12,10) && down(l,16,14) && down(l,20,18);

    // 토끼(卯)
    const isRabbit = up(r,8,6) && down(r,12,10) && down(r,16,14) &&
      down(l,8,6) && down(l,12,10) && down(l,16,14) && up(l,20,18);

    // 쥐(子)
    const isRat = up(r,8,6) && up(r,12,10) && down(r,16,14) && down(r,20,18) &&
      down(l,8,6) && down(l,12,10) && down(l,16,14) && down(l,20,18);

    // 원숭이(申)
    const isMonkey = up(r,8,6) && up(r,12,10) && down(r,16,14) && down(r,20,18) &&
      up(l,8,6) && down(l,12,10) && down(l,16,14) && down(l,20,18);

    // 개(戌)
    const isDog = up(r,8,6) && down(r,12,10) && down(r,16,14) && down(r,20,18) &&
      up(l,8,6) && down(l,12,10) && down(l,16,14) && down(l,20,18);

    // 뱀(巳)
    const isSnake = up(r,8,6) && up(r,12,10) && up(r,16,14) && down(r,20,18) &&
      down(l,8,6) && down(l,12,10) && down(l,16,14) && down(l,20,18);

    // O
    const isO = up(r,8,6) && up(r,12,10) && up(r,16,14) && up(r,20,18) &&
      up(l,8,6) && up(l,12,10) && up(l,16,14) && up(l,20,18);

    // X
    const isX = down(r,8,6) && down(r,12,10) && down(r,16,14) && down(r,20,18) &&
      down(l,8,6) && down(l,12,10) && down(l,16,14) && down(l,20,18);

    if (isBoar)   return { jutsu: 'boar',   confidence: 72 };
    if (isRabbit) return { jutsu: 'rabbit', confidence: 72 };
    if (isRat)    return { jutsu: 'rat',    confidence: 72 };
    if (isMonkey) return { jutsu: 'monkey', confidence: 72 };
    if (isDog)    return { jutsu: 'dog',    confidence: 72 };
    if (isSnake)  return { jutsu: 'snake',  confidence: 72 };
    if (isO)      return { jutsu: 'o',      confidence: 72 };
    if (isX)      return { jutsu: 'x',      confidence: 72 };

    return { jutsu: 'none', confidence: 0 };
  }
}
