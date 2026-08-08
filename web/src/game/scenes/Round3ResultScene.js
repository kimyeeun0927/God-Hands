import { OnboardingScene } from './OnboardingScene.js';

// 등급 판정: 최종 획득 점수 구간으로 상급·중급·하급·탈락을 가른다.
// (점수가 음수가 되는 경우는 Round2에서 즉시 실격 처리되어 이 화면에 도달하지 않는다.)
const TIER = {
  high: { label: '상급', badgeKey: 'rank_high', charKey: 'char_smile', color: '#FFD23F', glow: '#FF8C00' },
  mid:  { label: '중급', badgeKey: 'rank_mid',  charKey: 'char_mid',   color: '#60A5FA', glow: '#2563EB' },
  low:  { label: '하급', badgeKey: 'rank_low',  charKey: 'char_chill', color: '#4ADE80', glow: '#16A34A' },
  fail: { label: '탈락', badgeKey: 'fail',       charKey: null,         color: '#FF4D4D', glow: '#B91C1C' },
};

function getTier(rs) {
  const total = rs.r1 + rs.r2 + rs.r3;
  if (total >= 4000) return TIER.high;
  if (total >= 3000) return TIER.mid;
  if (total >= 1000) return TIER.low;
  return TIER.fail;
}

// 음수(라운드2 미스 누적 등)도 안전하게 표시하는 0채움 포맷
function fmt(n, digits) {
  const v = Math.round(n);
  return v < 0 ? String(v) : String(v).padStart(digits, '0');
}

const ADVANCE_COOLDOWN = 1200;
const PAPER_RATIO = 602 / 339;

export class Round3ResultScene {
  hideScoreHUD = true;

  constructor(manager) {
    this.manager  = manager;
    this.canvas   = manager.canvas;
    this.ctx      = manager.ctx;
    this._elapsed = 0;

    this._rs   = manager.roundScores;
    this._tier = getTier(this._rs);

    this._dispTotal   = 0;
    this._targetTotal = this._rs.r1 + this._rs.r2 + this._rs.r3;

    this._fistHeld        = false;
    this._advanceCooldown = ADVANCE_COOLDOWN;
    this._assets = {};
  }

  init() {
    this._tryLoad('paper',      'assets/ui/report_paper.png');
    this._tryLoad('rank_high',  'assets/ui/rank_high.png');
    this._tryLoad('rank_mid',   'assets/ui/rank_mid.png');
    this._tryLoad('rank_low',   'assets/ui/rank_low.png');
    this._tryLoad('fail',       'assets/enemies/fail.png');
    this._tryLoad('char_smile', 'assets/characters/char_smile.png');
    this._tryLoad('char_mid',   'assets/characters/char.png');
    this._tryLoad('char_chill', 'assets/characters/char_chill.png');
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

    if (this._dispTotal < this._targetTotal) {
      const step = Math.max(10, Math.ceil((this._targetTotal - this._dispTotal) / 18));
      this._dispTotal = Math.min(this._targetTotal, this._dispTotal + step);
    }

    if (this._advanceCooldown > 0) { this._fistHeld = false; return; }
    const fist = this._isFist(handState);
    if (fist && !this._fistHeld) {
      this._fistHeld = true;
    } else if (!fist && this._fistHeld) {
      this._fistHeld     = false;
      this.manager.score = 0;
      this.manager.roundScores = {
        r1: 0, r1Max: 0, r2: 0, r2Max: 0, r3: 0, r3Max: 0, cleared: false,
      };
      this.manager.goto(OnboardingScene);
    }
  }

  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.80)';
    ctx.fillRect(0, 0, W, H);

    const tint = Math.min(1, this._elapsed / 500);
    ctx.save();
    const rg = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, H * 0.75);
    rg.addColorStop(0, `rgba(${hexToRgb(this._tier.glow)},${0.16 * tint})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const scale = Math.min(1, easeOut(Math.min(1, this._elapsed / 450)));
    this._renderCertificate(W, H, scale);

    if (this._elapsed > 700) this._renderRestartHint(ctx, W, H, handState);
  }

  // ── 성적표 본체 ──────────────────────────────────────────────
  _renderCertificate(W, H, scale) {
    const ctx = this.ctx;

    const paperW = Math.min(W * 0.80, H * 0.82 * PAPER_RATIO);
    const paperH = paperW / PAPER_RATIO;
    const paperX = W / 2 - paperW / 2;
    const paperY = H * 0.48 - paperH / 2;

    ctx.save();
    ctx.translate(W / 2, H * 0.48);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H * 0.48);

    const paper = this._assets.paper;
    if (paper) {
      ctx.drawImage(paper, paperX, paperY, paperW, paperH);
    } else {
      ctx.fillStyle   = '#EBD9A8';
      ctx.strokeStyle = '#8B6914';
      ctx.lineWidth   = 4;
      this._rrect(ctx, paperX, paperY, paperW, paperH, 14);
      ctx.fill(); ctx.stroke();
    }

    // 여백 안쪽 콘텐츠 영역
    const padX = paperW * 0.10;
    const padY = paperH * 0.12;
    const inX  = paperX + padX;
    const inY  = paperY + padY;
    const inW  = paperW - padX * 2;
    const inH  = paperH - padY * 2;

    const titleH = inH * 0.30;
    this._renderTitle(ctx, inX, inY, inW, titleH);

    const bodyY = inY + titleH;
    const bodyH = inH - titleH;
    this._renderBody(ctx, inX, bodyY, inW, bodyH);

    ctx.restore();
  }

  // ── 상단 타이틀 (등급/탈락) ──────────────────────────────────
  _renderTitle(ctx, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2;
    const tier = this._tier;

    if (tier === TIER.fail) {
      const img = this._assets.fail;
      if (img) {
        const dh = h * 0.85;
        const dw = dh * (img.naturalWidth / img.naturalHeight);
        ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
      } else {
        ctx.save();
        ctx.font         = `bold ${Math.floor(h * 0.62)}px 'Mulmaru', sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle  = '#4A0000'; ctx.lineWidth = 8; ctx.lineJoin = 'round';
        ctx.strokeText('탈락', cx, cy);
        ctx.fillStyle = tier.color;
        ctx.fillText('탈락', cx, cy);
        ctx.restore();
      }
      return;
    }

    const badge  = this._assets[tier.badgeKey];
    const suffix = '닌자 합격증';

    ctx.save();
    ctx.font = `bold ${Math.floor(h * 0.4)}px 'Mulmaru', sans-serif`;
    const suffixW = ctx.measureText(suffix).width;
    const badgeH  = h * 0.7;
    const badgeW  = badge ? badgeH * (badge.naturalWidth / badge.naturalHeight) : ctx.measureText(tier.label).width * 1.1;
    const gap     = w * 0.02;
    const totalW  = badgeW + gap + suffixW;
    let px = cx - totalW / 2;

    if (badge) {
      ctx.drawImage(badge, px, cy - badgeH / 2, badgeW, badgeH);
    } else {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
      ctx.strokeText(tier.label, px, cy);
      ctx.fillStyle = tier.color;
      ctx.fillText(tier.label, px, cy);
    }
    px += badgeW + gap;

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
    ctx.strokeText(suffix, px, cy);
    ctx.fillStyle = 'rgba(245,230,195,0.95)';
    ctx.fillText(suffix, px, cy);
    ctx.restore();
  }

  // ── 본문: 좌측 단계별 점수 + 우측 캐릭터 ─────────────────────
  _renderBody(ctx, x, y, w, h) {
    const tier   = this._tier;
    const leftW  = w * 0.62;
    const rightX = x + leftW;
    const rightW = w - leftW;

    this._renderScoreRows(ctx, x, y, leftW, h);

    if (tier.charKey) {
      const img = this._assets[tier.charKey];
      if (img) {
        const dh = h * 0.92;
        const dw = dh * (img.naturalWidth / img.naturalHeight);
        const cx = rightX + rightW / 2;
        const cy = y + h / 2;
        ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
      }
    }
  }

  _renderScoreRows(ctx, x, y, w, h) {
    const rs = this._rs;
    const rows = [
      { label: '1단계', earned: rs.r1, max: rs.r1Max },
      { label: '2단계', earned: rs.r2, max: rs.r2Max },
      { label: '3단계', earned: rs.r3, max: rs.r3Max },
    ];

    const rowH   = h * 0.19;
    const startY = y + h * 0.08;
    const labelX = x;
    const valueRight = x + w * 0.86;

    rows.forEach((row, i) => {
      const ry = startY + rowH * i;
      ctx.save();
      ctx.font         = `bold ${Math.floor(rowH * 0.42)}px 'Mulmaru', sans-serif`;
      ctx.fillStyle    = '#3A2A0F';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.label, labelX, ry);

      ctx.font      = `${Math.floor(rowH * 0.4)}px 'Mulmaru', sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#5A4419';
      ctx.fillText(`${fmt(row.earned, 3)}점 / ${fmt(row.max, 3)}점`, valueRight, ry);
      ctx.restore();
    });

    // 구분선
    const divY = startY + rowH * 3 - rowH * 0.12;
    ctx.save();
    ctx.strokeStyle = 'rgba(139,105,20,0.5)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(x, divY);
    ctx.lineTo(x + w * 0.92, divY);
    ctx.stroke();
    ctx.restore();

    // 최종 점수
    const finalY = divY + rowH * 0.62;
    ctx.save();
    ctx.font         = `bold ${Math.floor(rowH * 0.5)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = '#2C1A00';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('최종 점수', labelX, finalY);

    ctx.font      = `bold ${Math.floor(rowH * 0.52)}px 'Mulmaru', sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#2C1A00';
    ctx.fillText(`${fmt(this._dispTotal, 6)}점`, valueRight, finalY);
    ctx.restore();
  }

  // ── 재시작 안내 ───────────────────────────────────────────────
  _renderRestartHint(ctx, W, H, handState) {
    const isFist  = this._isFist(handState);
    const cooling = this._advanceCooldown > 0;
    const pulse   = 0.5 + 0.5 * Math.sin(this._elapsed * 0.003);

    ctx.save();
    if (isFist && !cooling) {
      ctx.fillStyle = '#FFB800';
      ctx.font      = `bold ${Math.floor(H * 0.022)}px 'Mulmaru', sans-serif`;
    } else {
      ctx.globalAlpha = 0.5 + 0.5 * pulse;
      ctx.fillStyle    = 'rgba(245,230,195,0.65)';
      ctx.font         = `${Math.floor(H * 0.02)}px 'Mulmaru', sans-serif`;
    }
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      isFist && !cooling
        ? '✊ 감지됨 — 손을 펴서 처음부터 시작'
        : '주먹을 쥐었다 펴서 처음부터 시작 ▶',
      W / 2, H * 0.94
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
