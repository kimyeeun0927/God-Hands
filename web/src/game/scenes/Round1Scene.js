import { Round1ResultScene } from './Round1ResultScene.js';

const QUESTIONS = [
  { text: '첫번째 문제' },
  { text: '두번째 문제' },
  { text: '세번째 문제' },
];

const POINTS_PER_Q    = 100;
const FEEDBACK_MS     = 1200;
const ADVANCE_COOLDOWN = 700;

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

export class Round1Scene {
  constructor(manager) {
    this.manager = manager;
    this.canvas  = manager.canvas;
    this.ctx     = manager.ctx;
    this.video   = manager.video;

    this._qIndex          = 0;
    this._phase           = 'question'; // 'question' | 'feedback' | 'complete'
    this._feedbackMs      = 0;
    this._completeMs      = 0;
    this._fistHeld        = false;
    this._advanceCooldown = ADVANCE_COOLDOWN; // 첫 문제 직후 실수 방지

    this._assets = {};
  }

  init() {
    this._tryLoad('sign_o', 'assets/handsigns/sign_o.png');
    this._tryLoad('sign_x', 'assets/handsigns/sign_x.png');
  }

  _tryLoad(key, src) {
    const img = new Image();
    img.onload  = () => { this._assets[key] = img; };
    img.onerror = () => {};
    img.src = src;
  }

  // ── 주먹 판정 ────────────────────────────────────────────────
  _isFist(handState) {
    const lms = handState.landmarks;
    if (!lms?.length) return false;
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    return lms.some(hand => tips.every((t, i) => hand[t].y > hand[pips[i]].y));
  }

  // ── Update ───────────────────────────────────────────────────
  update(dt, handState) {
    this._advanceCooldown = Math.max(0, this._advanceCooldown - dt);

    if (this._phase === 'question') {
      if (this._advanceCooldown > 0) { this._fistHeld = false; return; }

      const fist = this._isFist(handState);
      if (fist && !this._fistHeld) {
        this._fistHeld = true;
      } else if (!fist && this._fistHeld) {
        this._fistHeld        = false;
        this._advanceCooldown = ADVANCE_COOLDOWN;
        this.manager.score   += POINTS_PER_Q;
        this._phase           = 'feedback';
        this._feedbackMs      = 0;
      }

    } else if (this._phase === 'feedback') {
      this._feedbackMs += dt;
      if (this._feedbackMs >= FEEDBACK_MS) {
        this._qIndex++;
        if (this._qIndex >= QUESTIONS.length) {
          this._phase = 'complete';
        } else {
          this._phase           = 'question';
          this._advanceCooldown = ADVANCE_COOLDOWN;
        }
      }

    } else if (this._phase === 'complete') {
      this._completeMs += dt;
      if (this._completeMs >= 3000) {
        this.manager.goto(Round1ResultScene);
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

    this._renderRoundLabel(W, H);

    if (this._phase === 'question') {
      this._renderQuestion(W, H, handState);
    } else if (this._phase === 'feedback') {
      this._renderFeedback(W, H);
    } else {
      this._renderComplete(W, H);
    }

    this._renderHands(handState, W, H);
  }

  // ── Round 라벨 ───────────────────────────────────────────────
  _renderRoundLabel(W, H) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font         = `bold ${Math.floor(H * 0.025)}px 'Press Start 2P', monospace`;
    ctx.fillStyle    = '#FFB800';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor  = '#FF8C00';
    ctx.shadowBlur   = 20;
    ctx.fillText('ROUND 1', W / 2, H * 0.06);
    ctx.restore();
  }

  // ── 문제 화면 ────────────────────────────────────────────────
  _renderQuestion(W, H, handState) {
    const ctx = this.ctx;
    const q   = QUESTIONS[this._qIndex];

    // 문제 번호
    ctx.save();
    ctx.font         = `${Math.floor(H * 0.02)}px 'JetBrains Mono', monospace`;
    ctx.fillStyle    = 'rgba(255,255,255,0.5)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`문제 ${this._qIndex + 1} / ${QUESTIONS.length}`, W / 2, H * 0.22);
    ctx.restore();

    // 문제 박스
    const bw = W * 0.68, bh = H * 0.18;
    const bx = W / 2 - bw / 2, by = H * 0.3;

    ctx.save();
    ctx.fillStyle   = 'rgba(245,230,195,0.93)';
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth   = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur  = 20;
    this._rrect(ctx, bx, by, bw, bh, 14);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle    = '#2C1A00';
    ctx.font         = `bold ${Math.floor(H * 0.042)}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur   = 0;
    ctx.fillText(q.text, W / 2, by + bh / 2);
    ctx.restore();

    // O / X 안내 (왼쪽 O, 오른쪽 X)
    this._renderOXHint(W, bx, by, bw, bh);

    // 주먹 안내
    const isFist = this._isFist(handState);
    const pulse  = 0.5 + 0.5 * Math.sin(performance.now() * 0.003);

    ctx.save();
    if (isFist) {
      ctx.fillStyle   = '#FFB800';
      ctx.shadowColor = '#FFB800';
      ctx.shadowBlur  = 14;
      ctx.font        = `bold ${Math.floor(H * 0.022)}px sans-serif`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('✊ 감지됨 — 손을 펴서 정답 제출', W / 2, by + bh + 24);
    } else {
      ctx.globalAlpha  = 0.5 + 0.5 * pulse;
      ctx.fillStyle    = 'rgba(255,255,255,0.7)';
      ctx.font         = `${Math.floor(H * 0.02)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('주먹을 쥐었다 펴서 정답 제출 ▶', W / 2, by + bh + 24);
    }
    ctx.restore();
  }

  // ── O(왼쪽) / X(오른쪽) 안내 ──────────────────────────────────
  _renderOXHint(W, bx, by, bw, bh) {
    const ctx  = this.ctx;
    const size = bh * 0.8;
    const gap  = W * 0.03;
    const cy   = by + bh / 2;

    const drawSide = (img, glyph, color, x) => {
      ctx.save();
      if (img) {
        ctx.drawImage(img, x, cy - size / 2, size, size);
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth   = 5;
        ctx.shadowColor = color;
        ctx.shadowBlur  = 10;
        if (glyph === 'O') {
          ctx.beginPath();
          ctx.arc(x + size / 2, cy, size * 0.42, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.lineCap = 'round';
          const r = size * 0.38;
          ctx.beginPath();
          ctx.moveTo(x + size / 2 - r, cy - r); ctx.lineTo(x + size / 2 + r, cy + r);
          ctx.moveTo(x + size / 2 + r, cy - r); ctx.lineTo(x + size / 2 - r, cy + r);
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    drawSide(this._assets.sign_o, 'O', '#7BB8FF', bx - gap - size);
    drawSide(this._assets.sign_x, 'X', '#FF9B7B', bx + bw + gap);
  }

  // ── 피드백 화면 ──────────────────────────────────────────────
  _renderFeedback(W, H) {
    const ctx = this.ctx;
    const t   = Math.min(1, this._feedbackMs / FEEDBACK_MS);

    // 정답! 텍스트 (팝인)
    const scale = 0.75 + 0.25 * Math.min(1, t * 6);
    ctx.save();
    ctx.translate(W / 2, H * 0.42);
    ctx.scale(scale, scale);
    ctx.font         = `bold ${Math.floor(H * 0.09)}px 'Press Start 2P', monospace`;
    ctx.fillStyle    = '#4ADE80';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = '#22C55E';
    ctx.shadowBlur   = 50;
    ctx.fillText('정답!', 0, 0);
    ctx.restore();

    // +100 점수 상승 텍스트
    const rise = t * H * 0.14;
    ctx.save();
    ctx.globalAlpha  = Math.max(0, 1 - t * 1.1);
    ctx.font         = `bold ${Math.floor(H * 0.04)}px 'Press Start 2P', monospace`;
    ctx.fillStyle    = '#FFB800';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = '#FF8C00';
    ctx.shadowBlur   = 20;
    ctx.fillText(`+${POINTS_PER_Q}`, W / 2, H * 0.62 - rise);
    ctx.restore();
  }

  // ── 완료 화면 ────────────────────────────────────────────────
  _renderComplete(W, H) {
    const ctx = this.ctx;

    ctx.save();
    ctx.font         = `bold ${Math.floor(H * 0.06)}px 'Press Start 2P', monospace`;
    ctx.fillStyle    = '#FFB800';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = '#FF8C00';
    ctx.shadowBlur   = 40;
    ctx.fillText('ROUND 1 CLEAR!', W / 2, H * 0.38);
    ctx.restore();

    ctx.save();
    ctx.font         = `${Math.floor(H * 0.028)}px 'JetBrains Mono', monospace`;
    ctx.fillStyle    = 'rgba(255,255,255,0.65)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Round 1 점수: ${QUESTIONS.length * POINTS_PER_Q}점`, W / 2, H * 0.5);

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.003);
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.font        = `${Math.floor(H * 0.02)}px sans-serif`;
    ctx.fillStyle   = 'rgba(255,255,255,0.6)';
    ctx.fillText('Round 2 준비중...', W / 2, H * 0.6);
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
      ctx.save();
      ctx.strokeStyle = 'rgba(255,184,0,0.75)';
      ctx.lineWidth   = 2;
      HAND_CONNECTIONS.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(lx(hand[a]), ly(hand[a]));
        ctx.lineTo(lx(hand[b]), ly(hand[b]));
        ctx.stroke();
      });
      hand.forEach((lm, i) => {
        ctx.beginPath();
        ctx.arc(lx(lm), ly(lm), i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle   = i === 0 ? '#FFB800' : 'rgba(255,184,0,0.85)';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1;
        ctx.fill(); ctx.stroke();
      });
      ctx.restore();
    });
  }

  // ── roundRect 폴리필 ─────────────────────────────────────────
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
