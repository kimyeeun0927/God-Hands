import { OnboardingScene } from './OnboardingScene.js';

// 최대 점수: R1(300) + R2(500) + R3(3파동×700 + 킬800) = 3,700 ~ 최고 4,300
// 등급 기준: 총점 기준 (적 처치 보너스 포함)
const GRADES = [
  { min: 3700, grade: 'S', rank: '카게 (影)',     desc: '전설의 닌자다! 최강의 실력!',        color: '#FFD23F', glow: '#FF8C00', outline: '#7A3B00' },
  { min: 2600, grade: 'A', rank: '조닌 (上忍)',   desc: '엘리트 닌자의 실력이다!',             color: '#C084FC', glow: '#7C3AED', outline: '#3B1A6E' },
  { min: 1600, grade: 'B', rank: '츄닌 (中忍)',   desc: '합격! 앞으로도 계속 수련하라.',       color: '#60A5FA', glow: '#2563EB', outline: '#1E3A8A' },
  { min:  800, grade: 'C', rank: '겐닌 (下忍)',   desc: '겨우 합격했다. 아직 갈 길이 멀다.',   color: '#4ADE80', glow: '#16A34A', outline: '#14532D' },
  { min:    0, grade: 'D', rank: '아카데미 학생', desc: '처음부터 다시 수련이 필요하다...',    color: '#94A3B8', glow: '#475569', outline: '#1E293B' },
];

function getGrade(score) {
  return GRADES.find(g => score >= g.min) ?? GRADES[GRADES.length - 1];
}

const ADVANCE_COOLDOWN = 1200;

export class Round3ResultScene {
  hideScoreHUD = true;

  constructor(manager) {
    this.manager  = manager;
    this.canvas   = manager.canvas;
    this.ctx      = manager.ctx;
    this._elapsed = 0;

    this._grade        = getGrade(manager.score);
    this._dispScore    = 0;
    this._targetScore  = manager.score;
    this._fistHeld     = false;
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

    // 점수 카운트업
    if (this._dispScore < this._targetScore) {
      const step      = Math.max(10, Math.ceil((this._targetScore - this._dispScore) / 18));
      this._dispScore = Math.min(this._targetScore, this._dispScore + step);
    }

    if (this._advanceCooldown > 0) { this._fistHeld = false; return; }
    const fist = this._isFist(handState);
    if (fist && !this._fistHeld) {
      this._fistHeld = true;
    } else if (!fist && this._fistHeld) {
      this._fistHeld        = false;
      this.manager.score    = 0;
      this.manager.goto(OnboardingScene);
    }
  }

  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // 배경 — 등급 색 틴트
    const g = this._grade;
    const tint = this._elapsed < 600
      ? Math.min(1, this._elapsed / 600)
      : 1;

    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, W, H);

    // 등급별 상단 광원 효과
    ctx.save();
    const grad = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.7);
    grad.addColorStop(0,   `rgba(${hexToRgb(g.glow)},${0.18 * tint})`);
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 타이틀
    ctx.save();
    ctx.font         = `bold ${Math.floor(H * 0.032)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = 'rgba(245,230,195,0.7)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('닌자 시험 완료', W / 2, H * 0.1);
    ctx.restore();

    // 등급 카드 (스케일 팝인)
    const cardScale = Math.min(1, easeOut(Math.min(1, this._elapsed / 500)));
    this._renderGradeCard(ctx, W, H, cardScale);

    // SCORE 표시 (등급 카드 이후 등장)
    const scoreAlpha = Math.max(0, Math.min(1, (this._elapsed - 400) / 300));
    if (scoreAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = scoreAlpha;
      this._renderPixelScore(ctx, W, H, H * 0.72);
      ctx.restore();
    }

    // 재시작 안내
    if (this._elapsed > 900) {
      this._renderRestartHint(ctx, W, H, handState);
    }
  }

  // ── 등급 카드 ─────────────────────────────────────────────────
  _renderGradeCard(ctx, W, H, scale) {
    const g      = this._grade;
    const cardW  = Math.min(W * 0.62, H * 0.6);
    const cardH  = H * 0.32;
    const cardX  = W / 2 - cardW / 2;
    const cardY  = H * 0.22 - cardH / 2;

    ctx.save();
    ctx.translate(W / 2, H * 0.22);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H * 0.22);

    // 카드 배경
    ctx.fillStyle   = 'rgba(12,7,2,0.92)';
    this._rrect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.fill();

    // 카드 테두리
    ctx.strokeStyle = g.color;
    ctx.lineWidth   = 3.5;
    this._rrect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.stroke();

    const cx = W / 2;
    const cy = cardY + cardH / 2;

    // 등급 글자 (대형)
    ctx.font      = `bold ${Math.floor(cardH * 0.62)}px 'Mulmaru', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = g.outline; ctx.lineWidth = 10; ctx.lineJoin = 'round';
    ctx.strokeText(g.grade, cx - cardW * 0.18, cy);
    ctx.fillStyle = g.color;
    ctx.fillText(g.grade, cx - cardW * 0.18, cy);

    // 구분선
    ctx.strokeStyle = g.color + '55';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + cardW * 0.04, cardY + cardH * 0.2);
    ctx.lineTo(cx + cardW * 0.04, cardY + cardH * 0.8);
    ctx.stroke();

    // 급수명 + 설명
    ctx.textAlign = 'left';
    ctx.font      = `bold ${Math.floor(cardH * 0.175)}px 'Mulmaru', sans-serif`;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
    ctx.strokeText(g.rank, cx + cardW * 0.09, cy - cardH * 0.12);
    ctx.fillStyle = g.color;
    ctx.fillText(g.rank, cx + cardW * 0.09, cy - cardH * 0.12);

    ctx.font      = `${Math.floor(cardH * 0.1)}px 'Mulmaru', sans-serif`;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(g.desc, cx + cardW * 0.09, cy + cardH * 0.16);
    ctx.fillStyle = 'rgba(245,230,195,0.75)';
    ctx.fillText(g.desc, cx + cardW * 0.09, cy + cardH * 0.16);

    ctx.restore();
  }

  // ── 픽셀 아트 SCORE ──────────────────────────────────────────
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

    const numStr = String(Math.round(this._dispScore)).padStart(6, '0');
    ctx.save();
    ctx.font      = `bold ${Math.floor(H * 0.088)}px 'Mulmaru', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#111'; ctx.lineWidth = 8; ctx.lineJoin = 'round';
    ctx.strokeText(numStr, W / 2, centerY + H * 0.12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(numStr, W / 2, centerY + H * 0.12);
    ctx.restore();
  }

  // ── 재시작 안내 ───────────────────────────────────────────────
  _renderRestartHint(ctx, W, H, handState) {
    const isFist  = this._isFist(handState);
    const cooling = this._advanceCooldown > 0;
    const pulse   = 0.5 + 0.5 * Math.sin(this._elapsed * 0.003);

    ctx.save();
    if (isFist && !cooling) {
      ctx.fillStyle   = '#FFB800';
      ctx.font        = `bold ${Math.floor(H * 0.022)}px 'Mulmaru', sans-serif`;
    } else {
      ctx.globalAlpha = 0.5 + 0.5 * pulse;
      ctx.fillStyle   = 'rgba(245,230,195,0.65)';
      ctx.font        = `${Math.floor(H * 0.02)}px 'Mulmaru', sans-serif`;
    }
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      isFist && !cooling
        ? '✊ 감지됨 — 손을 펴서 처음부터 시작'
        : '주먹을 쥐었다 펴서 처음부터 시작 ▶',
      W / 2, H * 0.92
    );
    ctx.restore();
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

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
