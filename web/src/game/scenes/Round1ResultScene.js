import { Round2Scene } from './Round2Scene.js';

const ADVANCE_COOLDOWN = 700;

export class Round1ResultScene {
  hideScoreHUD = true;

  constructor(manager) {
    this.manager  = manager;
    this.canvas   = manager.canvas;
    this.ctx      = manager.ctx;
    this._elapsed = 0;

    this._fistHeld        = false;
    this._advanceCooldown = ADVANCE_COOLDOWN;
    this._assets = {};
  }

  init() {
    this._tryLoad('score_label', 'assets/ui/SCORE.png');
  }

  _tryLoad(key, src) {
    const img = new Image();
    img.onload  = () => { this._assets[key] = img; };
    img.onerror = () => {};
    img.src = src;
    if (img.complete && img.naturalWidth > 0) this._assets[key] = img;
  }

  // ── 주먹 판정 ────────────────────────────────────────────────
  _isFist(handState) {
    const lms = handState?.landmarks;
    if (!lms?.length) return false;
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    return lms.some(hand => tips.every((t, i) => hand[t].y > hand[pips[i]].y));
  }

  update(dt, handState) {
    this._elapsed += dt;
    this._advanceCooldown = Math.max(0, this._advanceCooldown - dt);
    if (this._advanceCooldown > 0) { this._fistHeld = false; return; }

    const fist = this._isFist(handState);
    if (fist && !this._fistHeld) {
      this._fistHeld = true;
    } else if (!fist && this._fistHeld) {
      this._fistHeld = false;
      this.manager.goto(Round2Scene);
    }
  }

  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);

    // 타이틀
    ctx.save();
    ctx.font         = `bold ${Math.floor(H * 0.065)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = '#FFB800';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ROUND 1', W / 2, H * 0.3);
    ctx.restore();

    ctx.save();
    ctx.font         = `bold ${Math.floor(H * 0.04)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = '#ffffff';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RESULT', W / 2, H * 0.42);
    ctx.restore();

    this._renderPixelScore(ctx, W, H, H * 0.54);

    // 다음 라운드 안내
    const isFist  = this._isFist(handState);
    const cooling = this._advanceCooldown > 0;
    ctx.save();
    if (isFist && !cooling) {
      ctx.fillStyle    = '#FFB800';
      ctx.font         = `bold ${Math.floor(H * 0.022)}px 'Mulmaru', sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✊ 감지됨 — 손을 펴서 Round 2 시작', W / 2, H * 0.83);
    } else {
      const pulse = 0.5 + 0.5 * Math.sin(this._elapsed * 0.003);
      ctx.globalAlpha  = 0.5 + 0.5 * pulse;
      ctx.font         = `${Math.floor(H * 0.02)}px 'Mulmaru', sans-serif`;
      ctx.fillStyle    = 'rgba(255,255,255,0.6)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('주먹을 쥐었다 펴서 Round 2 시작 ▶', W / 2, H * 0.83);
    }
    ctx.restore();
  }

  _renderPixelScore(ctx, W, H, centerY) {
    const scoreImg = this._assets.score_label;
    if (scoreImg) {
      const sw = Math.min(W * 0.28, H * 0.12 * (scoreImg.naturalWidth / scoreImg.naturalHeight));
      const sh = sw * (scoreImg.naturalHeight / scoreImg.naturalWidth);
      ctx.drawImage(scoreImg, W / 2 - sw / 2, centerY - sh / 2, sw, sh);
    } else {
      ctx.save();
      ctx.font      = `${Math.floor(H * 0.022)}px 'Mulmaru', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#7A3B00'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
      ctx.strokeText('✦  SCORE  ✦', W / 2, centerY);
      ctx.fillStyle = '#FFD23F';
      ctx.fillText('✦  SCORE  ✦', W / 2, centerY);
      ctx.restore();
    }

    const numStr = String(this.manager.score).padStart(6, '0');
    ctx.save();
    ctx.font      = `bold ${Math.floor(H * 0.088)}px 'Mulmaru', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#111'; ctx.lineWidth = 8; ctx.lineJoin = 'round';
    ctx.strokeText(numStr, W / 2, centerY + H * 0.13);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(numStr, W / 2, centerY + H * 0.13);
    ctx.restore();
  }
}
