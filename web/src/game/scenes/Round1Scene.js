import { KakashiDialogueScene, r1Pages } from './KakashiDialogueScene.js';
import { Round2PracticeScene }           from './Round2PracticeScene.js';

const QUESTIONS = [
  { text: '"Prometeus"는 올바른 영어 철자이다', answer: 'X' },
  { text: '이 프로젝트를 위해 수집된 데이터는 총 10400개이다', answer: 'O' },
  { text: '이 프로젝트에 사용된 손 인식 기술은 MediaPipe이다', answer: 'O' },
];

const POINTS_PER_Q     = 100;
const FEEDBACK_MS      = 1500;
const ADVANCE_COOLDOWN = 700;
const HOLD_CONFIRM_MS  = 1500; // 제스처를 이만큼 유지하면 제출

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
    this._currentSide     = null;   // 'O' | 'X' — 현재 감지된 제스처
    this._holdMs          = 0;      // 제스처 유지 시간
    this._lastResult      = false;
    this._advanceCooldown = ADVANCE_COOLDOWN;

    this._assets = {};
  }

  init() {
    this._tryLoad('sign_o',     'assets/handsigns/sign_o.png');
    this._tryLoad('sign_x',     'assets/handsigns/sign_x.png');
    this._tryLoad('fb_correct', 'assets/gamehelper/O.png');
    this._tryLoad('fb_wrong',   'assets/gamehelper/X.png');
    for (let i = 0; i <= 9; i++) this._tryLoad(`d${i}`, `assets/ui/${i}.png`);
  }

  _tryLoad(key, src) {
    const img = new Image();
    img.onload  = () => { this._assets[key] = img; };
    img.onerror = () => {};
    img.src = src;
    if (img.complete && img.naturalWidth > 0) this._assets[key] = img;
  }

  // gesture 'o' → O, 'x' → X
  _getSideFromHand(handState) {
    if (handState.gesture === 'o') return 'O';
    if (handState.gesture === 'x') return 'X';
    return null;
  }

  update(dt, handState) {
    this._advanceCooldown = Math.max(0, this._advanceCooldown - dt);

    if (this._phase === 'question') {
      this._currentSide = this._getSideFromHand(handState);
      if (this._advanceCooldown > 0) { this._holdMs = 0; return; }

      if (this._currentSide) {
        this._holdMs += dt;
        if (this._holdMs >= HOLD_CONFIRM_MS) {
          this._holdMs          = 0;
          this._advanceCooldown = ADVANCE_COOLDOWN;
          const correct = this._currentSide === QUESTIONS[this._qIndex].answer;
          if (correct) this.manager.score += POINTS_PER_Q;
          this._lastResult = correct;
          this._phase      = 'feedback';
          this._feedbackMs = 0;
        }
      } else {
        this._holdMs = 0;
      }

    } else if (this._phase === 'feedback') {
      this._feedbackMs += dt;
      if (this._feedbackMs >= FEEDBACK_MS) {
        this._qIndex++;
        if (this._qIndex >= QUESTIONS.length) {
          this._phase = 'complete';
        } else {
          this._phase           = 'question';
          this._currentSide     = null;
          this._holdMs          = 0;
          this._advanceCooldown = ADVANCE_COOLDOWN;
        }
      }

    } else if (this._phase === 'complete') {
      this._completeMs += dt;
      if (this._completeMs >= 3000) {
        this.manager.goto(KakashiDialogueScene, Round2PracticeScene, r1Pages);
      }
    }
  }

  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, W, H);

    this._renderRoundLabel(W, H);

    if (this._phase === 'question') {
      this._renderQuestion(W, H);
    } else if (this._phase === 'feedback') {
      this._renderFeedback(W, H);
    } else {
      this._renderComplete(W, H);
    }

    this._renderHands(handState, W, H);
  }

  _renderRoundLabel() {}

  _renderQuestion(W, H) {
    const ctx = this.ctx;
    const q   = QUESTIONS[this._qIndex];

    ctx.save();
    ctx.font         = `${Math.floor(H * 0.02)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = 'rgba(255,255,255,0.5)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`문제 ${this._qIndex + 1} / ${QUESTIONS.length}`, W / 2, H * 0.21);
    ctx.restore();

    ctx.save();
    ctx.font         = `${Math.floor(H * 0.015)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = 'rgba(245,230,195,0.45)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('O / X 퀴즈', W / 2, H * 0.26);
    ctx.restore();

    // 문제 박스
    const bw = W * 0.68, bh = H * 0.18;
    const bx = W / 2 - bw / 2, by = H * 0.31;

    ctx.save();
    ctx.fillStyle   = 'rgba(245,230,195,0.93)';
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth   = 3;
    this._rrect(ctx, bx, by, bw, bh, 14);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle    = '#2C1A00';
    ctx.font         = `bold ${Math.floor(H * 0.030)}px 'Mulmaru', sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    this._fillTextWrapped(ctx, q.text, W / 2, by + bh / 2, bw * 0.9, H * 0.040);
    ctx.restore();

    // O / X 힌트 — 현재 제스처에 따라 강조 + 홀드 진행도
    const holdProg = Math.min(1, this._holdMs / HOLD_CONFIRM_MS);
    this._renderOXHint(W, bx, by, bw, bh, this._currentSide, holdProg);

    // 안내 텍스트
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.003);
    ctx.save();
    if (this._currentSide) {
      const sideColor = this._currentSide === 'O' ? '#7BB8FF' : '#FF9B7B';
      ctx.fillStyle    = sideColor;
      ctx.font         = `bold ${Math.floor(H * 0.022)}px 'Mulmaru', sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${this._currentSide} 제스처 유지 중... (${Math.ceil((HOLD_CONFIRM_MS - this._holdMs) / 1000 * 10) / 10}초)`, W / 2, by + bh + 22);
    } else {
      ctx.globalAlpha  = 0.5 + 0.5 * pulse;
      ctx.fillStyle    = 'rgba(255,255,255,0.7)';
      ctx.font         = `${Math.floor(H * 0.019)}px 'Mulmaru', sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('양손으로 O 또는 X 제스처를 만들어 유지하세요 ▶', W / 2, by + bh + 22);
    }
    ctx.restore();
  }

  _renderOXHint(W, bx, by, bw, bh, currentSide, holdProg) {
    const ctx  = this.ctx;
    const size = bh * 0.82;
    const gap  = W * 0.03;
    const cy   = by + bh / 2;

    const drawSide = (img, glyph, color, x, isSelected) => {
      ctx.save();
      ctx.globalAlpha = currentSide === null ? 0.75 : (isSelected ? 1.0 : 0.30);
      if (img) {
        ctx.drawImage(img, x, cy - size / 2, size, size);
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth   = isSelected ? 6 : 5;
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

    const drawProgress = (color, cx, cyc) => {
      if (holdProg <= 0) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 5;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cyc, size * 0.52, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * holdProg);
      ctx.stroke();
      ctx.restore();
    };

    drawSide(this._assets.sign_o, 'O', '#7BB8FF', bx - gap - size, currentSide === 'O');
    drawSide(this._assets.sign_x, 'X', '#FF9B7B', bx + bw + gap,   currentSide === 'X');

    if (currentSide === 'O') drawProgress('#7BB8FF', bx - gap - size + size / 2, cy);
    if (currentSide === 'X') drawProgress('#FF9B7B', bx + bw + gap  + size / 2, cy);
  }

  _renderFeedback(W, H) {
    const ctx     = this.ctx;
    const t       = Math.min(1, this._feedbackMs / FEEDBACK_MS);
    const correct = this._lastResult;
    const scale   = 0.75 + 0.25 * Math.min(1, t * 6);

    // 정답/오답 이미지
    const fbImg = this._assets[correct ? 'fb_correct' : 'fb_wrong'];
    ctx.save();
    ctx.translate(W / 2, H * 0.42);
    ctx.scale(scale, scale);
    if (fbImg) {
      const h = H * 0.18;
      const w = h * (fbImg.naturalWidth / fbImg.naturalHeight);
      ctx.drawImage(fbImg, -w / 2, -h / 2, w, h);
    } else {
      ctx.font         = `bold ${Math.floor(H * 0.09)}px 'Mulmaru', sans-serif`;
      ctx.fillStyle    = correct ? '#4ADE80' : '#FF4D4D';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(correct ? '정답!' : '오답!', 0, 0);
    }
    ctx.restore();

    // 오답일 때 정답 표시
    if (!correct) {
      const q = QUESTIONS[this._qIndex];
      ctx.save();
      ctx.globalAlpha  = Math.max(0, Math.min(1, (t - 0.2) * 3));
      ctx.font         = `${Math.floor(H * 0.022)}px 'Mulmaru', sans-serif`;
      ctx.fillStyle    = 'rgba(255,255,255,0.75)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`정답: ${q.answer}`, W / 2, H * 0.58);
      ctx.restore();
    }

    // 점수 플로팅 (숫자 이미지)
    const rise  = t * H * 0.14;
    const alpha = Math.max(0, 1 - t * 1.1);
    this._drawScoreNum(ctx, correct ? `+${POINTS_PER_Q}` : '+0', W / 2, H * 0.62 - rise, H * 0.072, alpha, correct ? '#FFD23F' : '#888888');
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
        // '+' 또는 '-' 를 캔버스로 직접 그림
        const thick = digitH * 0.13;
        ctx.fillStyle = c === '+' ? plusColor : '#FF4D4D';
        ctx.fillRect(x + (w - thick) / 2, cy - digitH * 0.32, thick, digitH * 0.64);
        if (c === '+') ctx.fillRect(x + w * 0.08, cy - thick / 2, w * 0.84, thick);
      }
      x += w + gap;
    });
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
    ctx.fillText('잠시 후 다음 시험으로...', W / 2, H * 0.5);
    ctx.restore();
  }

  // 공백 단위로 줄 바꿈 (중앙 정렬)
  _fillTextWrapped(ctx, text, cx, cy, maxW, lineH) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const totalH = (lines.length - 1) * lineH;
    lines.forEach((l, i) => {
      ctx.fillText(l, cx, cy - totalH / 2 + lineH * i);
    });
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
      // 연결선 전체 한 번에
      ctx.beginPath();
      HAND_CONNECTIONS.forEach(([a, b]) => {
        ctx.moveTo(lx(hand[a]), ly(hand[a]));
        ctx.lineTo(lx(hand[b]), ly(hand[b]));
      });
      ctx.strokeStyle = 'rgba(255,184,0,0.75)';
      ctx.lineWidth   = 2;
      ctx.stroke();

      // 일반 랜드마크 전체 한 번에
      ctx.beginPath();
      hand.forEach((lm, i) => {
        if (i !== 0) { ctx.moveTo(lx(lm) + 4, ly(lm)); ctx.arc(lx(lm), ly(lm), 4, 0, Math.PI * 2); }
      });
      ctx.fillStyle   = 'rgba(255,184,0,0.85)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1;
      ctx.fill(); ctx.stroke();

      // 손목 별도 (크기·색 다름)
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
