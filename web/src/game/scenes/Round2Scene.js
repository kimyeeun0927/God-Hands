import { KakashiDialogueScene, r2Pages } from './KakashiDialogueScene.js';
import { Round3IntroScene }              from './Round3IntroScene.js';
import { OnboardingScene }               from './OnboardingScene.js';

const SIGNS      = ['boar', 'rabbit', 'rat', 'monkey', 'dog', 'snake'];
const SIGN_GLYPH = { boar: '亥', rabbit: '卯', rat: '子', monkey: '申', dog: '戌', snake: '巳' };

const SEQUENCE_LENGTH  = 10;
const TIME_LIMIT_MS    = 5000;  // 한 동작당 제한시간
const FAST_MS          = 1500;  // 이 시간 안에 맞추면 PERFECT
const CONFIRM_MS       = 150;   // 동작 인식 확정까지 유지해야 하는 시간
const FEEDBACK_MS      = 1100;
const ADVANCE_COOLDOWN = 550;

// perfect: +100 / success: +50 / miss: -100
// 콤보 보너스: (콤보수 - 1) × 50  (1콤보 = 0점, 2콤보 = +50, 3콤보 = +100 ...)
const POINTS = { perfect: 100, success: 50, miss: -100 };

// 성적표용 이론상 최고점 (10문제 전부 PERFECT, 콤보 안 끊길 때)
function computeRound2Max() {
  let max = 0, combo = 0;
  for (let i = 0; i < SEQUENCE_LENGTH; i++) {
    combo++;
    max += POINTS.perfect + Math.max(0, combo - 1) * 50;
  }
  return max;
}
const ROUND2_MAX = computeRound2Max();

const FEEDBACK_STYLE = {
  perfect: { text: 'PERFECT', color: '#FFD23F', glow: '#FF8C00', asset: 'fb_perfect' },
  success: { text: 'SUCCESS', color: '#4ADE80', glow: '#22C55E', asset: 'fb_success' },
  miss:    { text: 'MISS',    color: '#FF4D4D', glow: '#B91C1C', asset: 'fb_miss' },
};

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

export class Round2Scene {
  constructor(manager) {
    this.manager = manager;
    this.canvas  = manager.canvas;
    this.ctx     = manager.ctx;
    this.video   = manager.video;

    this._sequence    = this._buildSequence(SEQUENCE_LENGTH);
    this._index       = 0;
    this._phase       = 'active'; // 'active'|'cooldown'|'complete'|'disqualified'
    this._elapsedMs   = 0;
    this._matchHoldMs = 0;
    this._cooldownMs  = 0;
    this._completeMs  = 0;
    this._disqualMs   = 0;

    this._feedback = null; // { type, ms, combo, comboBonus, delta }
    this._combo    = 0;
    this._results  = []; // 각 시퀀스 판정 결과 ('perfect'|'success'|'miss')

    this._assets = {};
  }

  init() {
    this._tryLoad('sign_boar',   'assets/handsigns/ground.png');
    this._tryLoad('sign_rabbit', 'assets/handsigns/wind.png');
    this._tryLoad('sign_rat',    'assets/handsigns/elec.png');
    // 실측 결과 monkey/snake는 fire.png/grass.png가 서로 바뀐 포즈라 교체
    this._tryLoad('sign_monkey', 'assets/handsigns/grass.png');
    this._tryLoad('sign_dog',    'assets/handsigns/water.png');
    this._tryLoad('sign_snake',  'assets/handsigns/fire.png');
    this._tryLoad('elem_boar',   'assets/element/ground.png');
    this._tryLoad('elem_rabbit', 'assets/element/wind.png');
    this._tryLoad('elem_rat',    'assets/element/elec.png');
    this._tryLoad('elem_monkey', 'assets/element/fire.png');
    this._tryLoad('elem_dog',    'assets/element/water.png');
    this._tryLoad('elem_snake',  'assets/element/grass.png');
    this._tryLoad('frame',       'assets/ui/frame_focused.png');
    this._tryLoad('fb_perfect',  'assets/gamehelper/PERFECT.png');
    this._tryLoad('fb_success',  'assets/gamehelper/SUCCESS.png');
    this._tryLoad('fb_miss',     'assets/gamehelper/MISS.png');
    this._tryLoad('fb_combo',    'assets/gamehelper/COMBO.png');
    this._tryLoad('disqualify',  'assets/ui/out.png');
    for (let i = 0; i <= 9; i++) this._tryLoad(`d${i}`, `assets/ui/${i}.png`);
  }

  _tryLoad(key, src) {
    const img = new Image();
    img.onload  = () => { this._assets[key] = img; };
    img.onerror = () => {};
    img.src = src;
    if (img.complete && img.naturalWidth > 0) this._assets[key] = img;
  }

  _buildSequence(n) {
    const seq = [];
    let prev = null;
    for (let i = 0; i < n; i++) {
      let s;
      do { s = SIGNS[Math.floor(Math.random() * SIGNS.length)]; } while (s === prev);
      seq.push(s);
      prev = s;
    }
    return seq;
  }

  // ── Update ───────────────────────────────────────────────────
  update(dt, handState) {
    if (this._feedback) {
      this._feedback.ms += dt;
      if (this._feedback.ms >= FEEDBACK_MS) this._feedback = null;
    }

    if (this._phase === 'disqualified') {
      this._disqualMs += dt;
      if (this._disqualMs >= 3000) {
        this.manager.score = 0;
        this.manager.roundScores = {
          r1: 0, r1Max: 0, r2: 0, r2Max: 0, r3: 0, r3Max: 0, cleared: false,
        };
        this.manager.goto(OnboardingScene);
      }
      return;
    }

    if (this._phase === 'active') {
      this._elapsedMs += dt;
      const target  = this._sequence[this._index];
      const matched = handState.masterKey || (handState.gesture === target && handState.confidence >= 40);
      this._matchHoldMs = matched ? this._matchHoldMs + dt : 0;

      if (this._matchHoldMs >= CONFIRM_MS) {
        this._judge(this._elapsedMs <= FAST_MS ? 'perfect' : 'success');
      } else if (this._elapsedMs >= TIME_LIMIT_MS) {
        this._judge('miss');
      }

    } else if (this._phase === 'cooldown') {
      this._cooldownMs -= dt;
      if (this._cooldownMs <= 0) {
        this._index++;
        if (this._index >= this._sequence.length) {
          this._phase      = 'complete';
          this._completeMs = 0;
        } else {
          this._phase       = 'active';
          this._elapsedMs   = 0;
          this._matchHoldMs = 0;
        }
      }

    } else if (this._phase === 'complete') {
      this._completeMs += dt;
      if (this._completeMs >= 1800) {
        this.manager.roundScores.r2    = this.manager.score - this.manager.roundScores.r1;
        this.manager.roundScores.r2Max = ROUND2_MAX;
        const allCorrect = this._results.every(r => r !== 'miss');
        this.manager.goto(KakashiDialogueScene, Round3IntroScene, score => r2Pages(score, allCorrect));
      }
    }
  }

  _judge(type) {
    this._results.push(type);
    this._combo = type === 'perfect' ? this._combo + 1 : 0;
    const comboBonus = type === 'perfect' ? Math.max(0, this._combo - 1) * 50 : 0;
    const pts = POINTS[type] + comboBonus;
    this.manager.score += pts;

    this._feedback = { type, ms: 0, combo: this._combo, comboBonus, delta: pts };

    if (this.manager.score < 0) {
      this._phase     = 'disqualified';
      this._disqualMs = 0;
      return;
    }

    this._phase      = 'cooldown';
    this._cooldownMs = ADVANCE_COOLDOWN;
  }

  // ── Render ───────────────────────────────────────────────────
  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, W, H);

    this._renderRoundLabel(W, H);

    if (this._phase === 'disqualified') {
      this._renderDisqualified(W, H);
    } else if (this._phase === 'complete') {
      this._renderComplete(W, H);
    } else {
      this._renderCounter(W, H);
      this._renderCharacter(W, H);
      if (this._feedback) this._renderFeedback(W, H);
    }

    this._renderHands(handState, W, H);
  }

  // ── Round 라벨 ───────────────────────────────────────────────
  _renderRoundLabel() {}

  // ── 진행 카운터 ──────────────────────────────────────────────
  _renderCounter() {}

  // ── 캐릭터 + 목표 동작 카드 + 오라 ────────────────────────────
  _renderCharacter(W, H) {
    const ctx = this.ctx;
    const cx  = W / 2;
    const cardSize = H * 0.30;
    const cardCx   = cx;
    const cardCy   = H * 0.54 + cardSize / 2;

    let progress = 0, glowColor = '#C8921A';
    if (this._phase === 'active') {
      progress = Math.min(1, this._matchHoldMs / CONFIRM_MS);
    } else if (this._phase === 'cooldown') {
      progress  = 1;
      glowColor = this._feedback ? FEEDBACK_STYLE[this._feedback.type].glow : '#C8921A';
    }

    if (progress > 0) {
      const r = cardSize * (0.56 + 0.16 * progress);
      ctx.save();
      ctx.globalAlpha  = 0.35 + 0.5 * progress;
      ctx.strokeStyle  = glowColor;
      ctx.lineWidth    = 3 + 4 * progress;
      ctx.beginPath();
      ctx.arc(cardCx, cardCy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const sign = this._sequence[this._index];
    ctx.save();

    // 프레임 배경
    const frame = this._assets.frame;
    if (frame) {
      ctx.drawImage(frame, cardCx - cardSize / 2, cardCy - cardSize / 2, cardSize, cardSize);
    } else {
      ctx.fillStyle   = '#15100A';
      ctx.strokeStyle = progress > 0 ? '#C8921A' : '#3D2E14';
      ctx.lineWidth   = progress > 0 ? 2.5 : 1.5;
      this._rrect(ctx, cardCx - cardSize / 2, cardCy - cardSize / 2, cardSize, cardSize, 16);
      ctx.fill(); ctx.stroke();
    }

    // 핸드사인 (중앙보다 살짝 위)
    const signImg  = this._assets[`sign_${sign}`];
    const signMaxW = cardSize * 0.76;
    const signMaxH = cardSize * 0.58;
    const signCy   = cardCy - cardSize * 0.10;
    if (signImg) {
      const r = signImg.width / signImg.height;
      let dw = signMaxW, dh = dw / r;
      if (dh > signMaxH) { dh = signMaxH; dw = dh * r; }
      ctx.drawImage(signImg, cardCx - dw / 2, signCy - dh / 2, dw, dh);
    } else {
      ctx.fillStyle    = '#F5E6C3';
      ctx.font         = `bold ${Math.floor(cardSize * 0.5)}px 'Mulmaru', sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(SIGN_GLYPH[sign], cardCx, signCy);
    }

    // 속성 이미지 (핸드사인보다 살짝 아래)
    const elemImg  = this._assets[`elem_${sign}`];
    const elemMaxW = cardSize * 0.38;
    const elemMaxH = cardSize * 0.24;
    const elemCy   = cardCy + cardSize * 0.26;
    if (elemImg) {
      const r = elemImg.width / elemImg.height;
      let dw = elemMaxW, dh = dw / r;
      if (dh > elemMaxH) { dh = elemMaxH; dw = dh * r; }
      ctx.drawImage(elemImg, cardCx - dw / 2, elemCy - dh / 2, dw, dh);
    }

    ctx.restore();
  }

  // ── 판정 피드백 ─────────────────────────────────────────────
  _renderFeedback(W, H) {
    const ctx    = this.ctx;
    const { type, ms, combo, comboBonus, delta } = this._feedback;
    const style  = FEEDBACK_STYLE[type];
    const t      = Math.min(1, ms / FEEDBACK_MS);
    const scale  = 0.75 + 0.25 * Math.min(1, t * 6);
    const alpha  = Math.max(0, 1 - Math.max(0, t - 0.6) / 0.4);
    const img    = this._assets[style.asset];

    // 판정 텍스트 / 이미지
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W * 0.3, H * 0.33);
    ctx.scale(scale, scale);
    if (img) {
      const h = H * 0.07;
      const w = h * (img.width / img.height);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      ctx.font         = `bold ${Math.floor(H * 0.06)}px 'Mulmaru', sans-serif`;
      ctx.fillStyle    = style.color;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(style.text, 0, 0);
    }
    ctx.restore();

    // 점수 변화 (플로팅)
    const rise       = t * H * 0.1;
    const numAlpha   = Math.max(0, 1 - t * 1.2);
    const numStr     = delta >= 0 ? `+${delta}` : `${delta}`;
    const numColor   = delta < 0 ? '#FF4D4D' : '#FFD23F';
    this._drawScoreNum(ctx, numStr, W * 0.3, H * 0.42 - rise, H * 0.072, numAlpha, numColor);

    // 콤보 표시 (2콤보부터 = 보너스 발생 시)
    if (type === 'perfect' && combo >= 2) {
      const comboImg = this._assets.fb_combo;
      const cx = W * 0.3, cy = H * 0.50;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (comboImg) {
        const h = H * 0.045;
        const w = h * (comboImg.width / comboImg.height);
        ctx.drawImage(comboImg, cx - w / 2 - 16, cy - h / 2, w, h);
        ctx.font         = `bold ${Math.floor(H * 0.028)}px 'Mulmaru', sans-serif`;
        ctx.fillStyle    = '#38BDF8';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`x${combo}  +${comboBonus}`, cx + w / 2 - 16, cy);
      } else {
        ctx.font         = `bold ${Math.floor(H * 0.030)}px 'Mulmaru', sans-serif`;
        ctx.fillStyle    = '#38BDF8';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`COMBO x${combo}  +${comboBonus}`, cx, cy);
      }
      ctx.restore();
    }
  }

  _drawScoreNum(ctx, str, cx, cy, digitH, alpha = 1, plusColor = '#FFD23F') {
    const chars = [...str];
    const gap   = digitH * 0.06;
    const widths = chars.map(c => {
      if (/[0-9]/.test(c)) {
        const img = this._assets[`d${c}`];
        return img ? digitH * (img.naturalWidth / img.naturalHeight) : digitH * 0.62;
      }
      return digitH * 0.5;
    });
    const totalW = widths.reduce((s, w) => s + w, 0) + gap * (chars.length - 1);

    ctx.save();
    ctx.globalAlpha = alpha;
    let x = cx - totalW / 2;
    chars.forEach((c, i) => {
      const w = widths[i];
      if (/[0-9]/.test(c)) {
        const img = this._assets[`d${c}`];
        if (img) ctx.drawImage(img, x, cy - digitH / 2, w, digitH);
      } else {
        const thick = digitH * 0.13;
        ctx.fillStyle = c === '+' ? plusColor : '#FF4D4D';
        ctx.fillRect(x + (w - thick) / 2, cy - digitH * 0.32, thick, digitH * 0.64);
        if (c === '+') ctx.fillRect(x + w * 0.08, cy - thick / 2, w * 0.84, thick);
      }
      x += w + gap;
    });
    ctx.restore();
  }

  // ── 실격 화면 ─────────────────────────────────────────────────
  _renderDisqualified(W, H) {
    const ctx = this.ctx;

    // 적색 오버레이
    ctx.save();
    ctx.fillStyle = 'rgba(140,0,0,0.22)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 실격.png 팝인 (없으면 텍스트 폴백)
    const stampT = Math.min(1, this._disqualMs / 380);
    const scale  = easeOut(stampT);
    const img    = this._assets.disqualify;

    ctx.save();
    ctx.translate(W / 2, H * 0.37);
    ctx.scale(scale, scale);

    if (img) {
      const h = Math.min(H * 0.38, W * 0.42);
      const w = h * (img.width / img.height);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle    = '#DC2626';
      ctx.font         = `bold ${Math.floor(H * 0.12)}px 'Mulmaru', sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('실격', 0, 0);
    }
    ctx.restore();

    // 카운트다운 텍스트
    const textAlpha = Math.min(1, Math.max(0, (this._disqualMs - 300) / 200));
    const remaining = Math.max(0, Math.ceil((3000 - this._disqualMs) / 1000));

    ctx.save();
    ctx.globalAlpha  = textAlpha;
    ctx.font         = `${Math.floor(H * 0.028)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = 'rgba(255,140,140,0.92)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      remaining > 0 ? `${remaining}초 후 게임이 종료됩니다` : '게임을 재시작합니다...',
      W / 2, H * 0.62,
    );
    ctx.restore();
  }

  // ── 완료 화면 ────────────────────────────────────────────────
  _renderComplete(W, H) {
    const ctx   = this.ctx;
    const pulse = 0.4 + 0.6 * Math.sin(performance.now() * 0.003);
    ctx.save();
    ctx.globalAlpha  = pulse;
    ctx.font         = `${Math.floor(H * 0.022)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = 'rgba(255,255,255,0.7)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('잠시 후 다음 시험으로...', W / 2, H * 0.5);
    ctx.restore();
  }

  // ── 손 랜드마크 ──────────────────────────────────────────────
  _renderHands(handState, W, H) {
    const lms = handState.landmarks;
    if (!lms?.length || !this.video.videoWidth) return;
    const ctx   = this.ctx;
    const video = this.video;
    const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
    const ox    = (W - video.videoWidth  * scale) / 2;
    const oy    = (H - video.videoHeight * scale) / 2;
    const lx    = lm => (1 - lm.x) * video.videoWidth  * scale + ox;
    const ly    = lm => lm.y        * video.videoHeight * scale + oy;

    lms.forEach(hand => {
      ctx.beginPath();
      HAND_CONNECTIONS.forEach(([a, b]) => {
        ctx.moveTo(lx(hand[a]), ly(hand[a]));
        ctx.lineTo(lx(hand[b]), ly(hand[b]));
      });
      ctx.strokeStyle = 'rgba(255,184,0,0.75)';
      ctx.lineWidth   = 2;
      ctx.stroke();

      ctx.beginPath();
      hand.forEach((lm, i) => {
        if (i !== 0) { ctx.moveTo(lx(lm) + 4, ly(lm)); ctx.arc(lx(lm), ly(lm), 4, 0, Math.PI * 2); }
      });
      ctx.fillStyle   = 'rgba(255,184,0,0.85)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1;
      ctx.fill(); ctx.stroke();

      ctx.beginPath();
      ctx.arc(lx(hand[0]), ly(hand[0]), 6, 0, Math.PI * 2);
      ctx.fillStyle = '#FFB800';
      ctx.fill(); ctx.stroke();
    });
  }

  _rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
