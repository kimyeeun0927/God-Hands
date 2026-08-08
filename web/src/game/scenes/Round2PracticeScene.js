import { KakashiDialogueScene, r2IntroPages } from './KakashiDialogueScene.js';
import { Round2Scene }                        from './Round2Scene.js';

// 연습 순서: 불 → 물 → 풀 → 땅 → 전기 → 바람
const SIGNS = ['monkey', 'dog', 'snake', 'boar', 'rat', 'rabbit'];

const SIGN_ELEMENT_IMG = {
  monkey: 'fire',
  dog:    'water',
  snake:  'grass',
  boar:   'ground',
  rat:    'elec',
  rabbit: 'wind',
};

// 실제 모델이 인식하는 손모양 사진(handsigns/) — monkey/snake는 실측 결과
// 위 속성 테마와 반대로 찍혀있어서(fire.png 포즈가 실제로는 snake로 인식됨)
// 별도로 분리해서 관리한다.
const SIGN_HAND_IMG = {
  monkey: 'grass',
  dog:    'water',
  snake:  'fire',
  boar:   'ground',
  rat:    'elec',
  rabbit: 'wind',
};

const SIGN_LABEL = {
  monkey: '불',
  dog:    '물',
  snake:  '풀',
  boar:   '땅',
  rat:    '전기',
  rabbit: '바람',
};

const CONFIRM_MS       = 150;   // 동작 인식 확정까지 유지해야 하는 시간
const ADVANCE_COOLDOWN = 550;

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

export class Round2PracticeScene {
  constructor(manager) {
    this.manager = manager;
    this.canvas  = manager.canvas;
    this.ctx     = manager.ctx;
    this.video   = manager.video;

    this._index       = 0;
    this._phase       = 'active'; // 'active'|'cooldown'|'complete'
    this._matchHoldMs = 0;
    this._cooldownMs  = 0;
    this._completeMs  = 0;

    this._assets = {};
  }

  init() {
    SIGNS.forEach(sign => {
      this._tryLoad(`sign_${sign}`, `assets/handsigns/${SIGN_HAND_IMG[sign]}.png`);
      this._tryLoad(`elem_${sign}`, `assets/element/${SIGN_ELEMENT_IMG[sign]}.png`);
    });
    this._tryLoad('frame', 'assets/ui/frame_focused.png');
  }

  _tryLoad(key, src) {
    const img = new Image();
    img.onload  = () => { this._assets[key] = img; };
    img.onerror = () => {};
    img.src = src;
    if (img.complete && img.naturalWidth > 0) this._assets[key] = img;
  }

  // ── Update ───────────────────────────────────────────────────
  update(dt, handState) {
    if (this._phase === 'active') {
      const target  = SIGNS[this._index];
      const matched = handState.masterKey || (handState.gesture === target && handState.confidence >= 40);
      this._matchHoldMs = matched ? this._matchHoldMs + dt : 0;

      if (this._matchHoldMs >= CONFIRM_MS) {
        this._phase      = 'cooldown';
        this._cooldownMs = ADVANCE_COOLDOWN;
      }

    } else if (this._phase === 'cooldown') {
      this._cooldownMs -= dt;
      if (this._cooldownMs <= 0) {
        this._index++;
        if (this._index >= SIGNS.length) {
          this._phase      = 'complete';
          this._completeMs = 0;
        } else {
          this._phase       = 'active';
          this._matchHoldMs = 0;
        }
      }

    } else if (this._phase === 'complete') {
      this._completeMs += dt;
      if (this._completeMs >= 1200) {
        this.manager.goto(KakashiDialogueScene, Round2Scene, r2IntroPages);
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────
  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, W, H);

    if (this._phase === 'complete') {
      this._renderComplete(W, H);
    } else {
      this._renderProgress(W, H);
      this._renderCard(W, H);
    }

    this._renderHands(handState, W, H);
  }

  _renderProgress(W, H) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font         = `bold ${Math.floor(H * 0.026)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = '#F5E6C3';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`수인 연습  (${this._index + 1} / ${SIGNS.length})`, W / 2, H * 0.06);
    ctx.font      = `${Math.floor(H * 0.02)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle = 'rgba(245,230,195,0.8)';
    ctx.fillText('화면에 보이는 수인을 맺고 유지하세요', W / 2, H * 0.1);
    ctx.restore();
  }

  _renderCard(W, H) {
    const ctx = this.ctx;
    const cx  = W / 2;
    const cardSize = H * 0.30;
    const cardCx   = cx;
    const cardCy   = H * 0.54 + cardSize / 2;

    let progress = 0;
    if (this._phase === 'active') {
      progress = Math.min(1, this._matchHoldMs / CONFIRM_MS);
    } else if (this._phase === 'cooldown') {
      progress = 1;
    }

    if (progress > 0) {
      const r = cardSize * (0.56 + 0.16 * progress);
      ctx.save();
      ctx.globalAlpha  = 0.35 + 0.5 * progress;
      ctx.strokeStyle  = '#C8921A';
      ctx.lineWidth    = 3 + 4 * progress;
      ctx.beginPath();
      ctx.arc(cardCx, cardCy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const sign = SIGNS[this._index];
    ctx.save();

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

    const signImg  = this._assets[`sign_${sign}`];
    const signMaxW = cardSize * 0.76;
    const signMaxH = cardSize * 0.58;
    const signCy   = cardCy - cardSize * 0.10;
    if (signImg) {
      const r = signImg.width / signImg.height;
      let dw = signMaxW, dh = dw / r;
      if (dh > signMaxH) { dh = signMaxH; dw = dh * r; }
      ctx.drawImage(signImg, cardCx - dw / 2, signCy - dh / 2, dw, dh);
    }

    const elemImg  = this._assets[`elem_${sign}`];
    const elemMaxW = cardSize * 0.38;
    const elemMaxH = cardSize * 0.24;
    const elemCy   = cardCy + cardSize * 0.26;
    if (elemImg) {
      const r = elemImg.width / elemImg.height;
      let dw = elemMaxW, dh = dw / r;
      if (dh > elemMaxH) { dh = elemMaxH; dw = dh * r; }
      ctx.drawImage(elemImg, cardCx - dw / 2, elemCy - dh / 2, dw, dh);
    } else {
      ctx.fillStyle    = '#F5E6C3';
      ctx.font         = `bold ${Math.floor(cardSize * 0.16)}px 'Mulmaru', sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(SIGN_LABEL[sign], cardCx, elemCy);
    }

    ctx.restore();
  }

  _renderComplete(W, H) {
    const ctx   = this.ctx;
    const pulse = 0.4 + 0.6 * Math.sin(performance.now() * 0.003);
    ctx.save();
    ctx.globalAlpha  = pulse;
    ctx.font         = `${Math.floor(H * 0.022)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = 'rgba(255,255,255,0.7)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('좋다...', W / 2, H * 0.5);
    ctx.restore();
  }

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
