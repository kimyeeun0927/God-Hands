const JUTSU_LABELS = ['none','shadow_clone','rasengan','chidori','sharingan'];
export class GestureClassifier {
  constructor() {
  this._lastJutsu = 'none';
  this._lastSeen  = 0;
  this.HOLD_MS    = 300;  // 마지막 인식 후 300ms 유지
}

async loadModel() {
  try {
    const ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');
    this.model = await ort.InferenceSession.create('/models/handseal.onnx');
    this.hasModel = true;
  } catch {
    this.hasModel = false;
  }
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

  // 인식 끊겼어도 300ms 안이면 이전 값 유지
  if (Date.now() - this._lastSeen < this.HOLD_MS) {
    return { jutsu: this._lastJutsu, confidence: 50 };
  }

  return result;
}
  async _predictONNX(normalized) {
    const input = new Float32Array(126);
    if (normalized.right) input.set(normalized.right, 0);
    if (normalized.left)  input.set(normalized.left, 63);
    const tensor = new ort.Tensor('float32', input, [1, 126]);
    const out = await this.model.run({ input: tensor });
    const probs = out.output.data;
    const maxIdx = probs.indexOf(Math.max(...probs));
    return { jutsu: JUTSU_LABELS[maxIdx], confidence: Math.round(probs[maxIdx] * 100) };
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

  // 돼지(亥) — 양손 주먹 + 맞붙임 (손목 가까움 + 모든 손가락 접힘)
  const isBoar = wristDist < 0.25 &&
    down(r,8,6) && down(r,12,10) && down(r,16,14) && down(r,20,18) &&
    down(l,8,6) && down(l,12,10) && down(l,16,14) && down(l,20,18);

  // 토끼(卯) — 오른손 엄지+검지 펴고, 왼손 새끼만 펴서 수직으로 끼움
  // 오른손: 검지 올라옴, 왼손: 새끼만 올라옴
  const isRabbit = up(r,8,6) && down(r,12,10) && down(r,16,14) &&
    down(l,8,6) && down(l,12,10) && down(l,16,14) && up(l,20,18);

  // 쥐(子) — 오른손 검지+중지 피고, 왼손으로 감싸쥠
  // 오른손: 검지+중지 올라옴, 왼손: 모두 접힘
  const isRat = up(r,8,6) && up(r,12,10) && down(r,16,14) && down(r,20,18) &&
    down(l,8,6) && down(l,12,10) && down(l,16,14) && down(l,20,18);

  if (isBoar)   return { jutsu: 'boar',   confidence: 72 };
  if (isRabbit) return { jutsu: 'rabbit', confidence: 72 };
  if (isRat)    return { jutsu: 'rat',    confidence: 72 };

  return { jutsu: 'none', confidence: 0 };
}};