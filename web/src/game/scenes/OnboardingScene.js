import { Round1Scene } from './Round1Scene.js';

const HOVER_DURATION   = 1500;
const ADVANCE_COOLDOWN = 700; // 페이지 넘긴 후 다음 펌프 무시 시간 (ms)

// ── 대화 페이지 데이터 ────────────────────────────────────────
const PAGES = [
  {
    lines: [
      '잘 왔다, 닌자 지망생!',
      '닌자 시험에 온 걸 환영한다!',
    ],
  },
  {
    lines: [
      '총 3라운드가 있으며, 최종 점수에 따라 급수가 결정된다.',
      '중간에 점수가 너무 낮으면 실격이니 주의해라!',
    ],
  },
  {
    lines: [
      '첫 번째 라운드는 O/X 퀴즈다!',
      '문제를 읽고 손으로 정답을 표시하면 된다.',
    ],
    showOX: true,
  },
];

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

export class OnboardingScene {
  constructor(manager) {
    this.manager  = manager;
    this.canvas   = manager.canvas;
    this.ctx      = manager.ctx;
    this.video    = manager.video;

    this.phase           = 'title';
    this._hoverMs        = 0;

    // 대화
    this._page           = 0;
    this._fistHeld       = false;
    this._advanceCooldown = 0;

    this._assets = {};
  }

  init() {
    this._tryLoad('kakashi',     'assets/characters/kakashi.png');
    this._tryLoad('sign_o',      'assets/handsigns/sign_o.png');
    this._tryLoad('sign_x',      'assets/handsigns/sign_x.png');
    this._tryLoad('press_start', 'assets/ui/press_start.png');
    this._tryLoad('gamename',    'assets/ui/gamename.png');
  }

  _tryLoad(key, src) {
    const img = new Image();
    img.onload  = () => { this._assets[key] = img; };
    img.onerror = () => {};
    img.src = src;
  }

  // ── 주먹 판정: 어느 한 손이라도 손가락 4개 모두 접혀있으면 ──
  _isFist(handState) {
    const lms = handState.landmarks;
    if (!lms?.length) return false;
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    return lms.some(hand => tips.every((t, i) => hand[t].y > hand[pips[i]].y));
  }

  // ── Update ───────────────────────────────────────────────────

  update(dt, handState) {
    if (this.phase === 'title') {
      this._updateTitle(dt, handState);
    } else {
      this._updateDialogue(dt, handState);
    }
  }

  _updateTitle(dt, handState) {
    const palm  = this._palmOnCanvas(handState);
    const btn   = this._hoverRect();
    const inBtn = palm &&
      palm.x >= btn.x && palm.x <= btn.x + btn.w &&
      palm.y >= btn.y && palm.y <= btn.y + btn.h;

    if (inBtn) {
      this._hoverMs = Math.min(this._hoverMs + dt, HOVER_DURATION);
      if (this._hoverMs >= HOVER_DURATION) {
        this.phase    = 'dialogue';
        this._hoverMs = 0;
      }
    } else {
      this._hoverMs = Math.max(0, this._hoverMs - dt * 0.5);
    }
  }

  _updateDialogue(dt, handState) {
    this._advanceCooldown = Math.max(0, this._advanceCooldown - dt);

    // 쿨다운 중엔 입력 무시
    if (this._advanceCooldown > 0) {
      this._fistHeld = false;
      return;
    }

    const fist = this._isFist(handState);

    if (fist && !this._fistHeld) {
      this._fistHeld = true;                  // 주먹 쥠
    } else if (!fist && this._fistHeld) {
      this._fistHeld        = false;           // 주먹 폄 → 페이지 전환
      this._advanceCooldown = ADVANCE_COOLDOWN;

      if (this._page < PAGES.length - 1) {
        this._page++;
      } else {
        this.manager.goto(Round1Scene);
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────

  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (this.phase === 'title') {
      this._renderTitle(W, H, handState);
    } else {
      this._renderDialogue(W, H, handState);
    }

    this._renderHands(handState, W, H);
  }

  // ── Title ────────────────────────────────────────────────────

  _renderTitle(W, H, handState) {
    const ctx  = this.ctx;
    const btn  = this._btnRect();
    const prog = this._hoverMs / HOVER_DURATION;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);

    // 타이틀
    ctx.save();
    const gamename = this._assets.gamename;
    if (gamename) {
      const h = H * 0.14;
      const w = h * (gamename.width / gamename.height);
      ctx.shadowColor = '#FF8C00';
      ctx.shadowBlur  = 40;
      ctx.drawImage(gamename, W / 2 - w / 2, H * 0.38 - h / 2, w, h);
    } else {
      ctx.shadowColor  = '#FF8C00';
      ctx.shadowBlur   = 40;
      ctx.fillStyle    = '#FFB800';
      ctx.font         = `bold ${Math.floor(H * 0.1)}px 'Press Start 2P', monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HANDSEAL', W / 2, H * 0.38);
    }
    ctx.restore();

    const pressStart = this._assets.press_start;
    const hoverBox   = this._hoverRect();

    if (pressStart) {
      // 이미지만 표시 (배경 박스 없음, 4배 크기), 호버 진행도는 이미지 아래 얇은 바로 표시
      ctx.save();
      ctx.shadowColor = '#FFB800';
      ctx.shadowBlur  = 10 + 14 * prog;
      ctx.drawImage(pressStart, hoverBox.x, hoverBox.y, hoverBox.w, hoverBox.h);
      ctx.restore();

      if (prog > 0) {
        ctx.save();
        const barW = hoverBox.w, barH = 4, barX = hoverBox.x, barY = hoverBox.y + hoverBox.h + 8;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#FFB800';
        ctx.fillRect(barX, barY, barW * prog, barH);
        ctx.restore();
      }
    } else {
      // 버튼 배경
      ctx.save();
      ctx.fillStyle = '#C86A00';
      this._rrect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
      ctx.fill();

      // 호버 채우기
      if (prog > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(btn.x, btn.y, btn.w, btn.h); ctx.clip();
        ctx.fillStyle = '#FFB800';
        this._rrect(ctx, btn.x, btn.y, btn.w * prog, btn.h, 10);
        ctx.fill();
        ctx.restore();
      }

      ctx.strokeStyle = '#FFB800';
      ctx.lineWidth   = 2.5;
      this._rrect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
      ctx.stroke();
      ctx.restore();

      // 버튼 텍스트
      ctx.save();
      ctx.fillStyle    = '#fff';
      ctx.font         = `bold ${Math.floor(H * 0.026)}px 'Press Start 2P', monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦ 닌자 도전하기 ✦', W / 2, btn.y + btn.h / 2);
      ctx.restore();
    }

    // 손 커서
    const palm = this._palmOnCanvas(handState);
    if (palm) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(palm.x, palm.y, 22, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,184,0,${0.4 + 0.6 * prog})`;
      ctx.lineWidth   = 3;
      ctx.shadowColor = '#FFB800';
      ctx.shadowBlur  = 16;
      ctx.stroke();
      ctx.restore();
    }

    // 안내
    ctx.save();
    ctx.fillStyle    = 'rgba(255,255,255,0.55)';
    ctx.font         = `${Math.floor(H * 0.018)}px 'JetBrains Mono', monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('손을 버튼 위에 올려주세요', W / 2, hoverBox.y + hoverBox.h + 22);
    ctx.restore();
  }

  // ── Dialogue ─────────────────────────────────────────────────

  _renderDialogue(W, H, handState) {
    const ctx  = this.ctx;
    const page = PAGES[this._page];

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);

    // ── 캐릭터 초상화 (2배 크기) ──
    let pw = Math.min(H * 0.55, W * 0.28) * 2;
    let ph = pw * 1.4;
    if (ph > H * 0.95) { ph = H * 0.95; pw = ph / 1.4; }
    const px = W * 0.06;
    const py = H * 0.5 - ph / 2;

    if (this._assets.kakashi) {
      const img = this._assets.kakashi;
      const imgRatio = img.width / img.height;
      const boxRatio = pw / ph;
      let dw, dh;
      if (imgRatio > boxRatio) { dw = pw; dh = pw / imgRatio; }
      else                     { dh = ph; dw = ph * imgRatio; }
      ctx.drawImage(img, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
    } else {
      ctx.save();
      ctx.fillStyle   = 'rgba(80,80,80,0.4)';
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth   = 1;
      this._rrect(ctx, px, py, pw, ph, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle    = 'rgba(255,255,255,0.18)';
      ctx.font         = `13px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('캐릭터', px + pw / 2, py + ph / 2);
      ctx.restore();
    }

    // ── 다이얼로그 박스 ──
    const bx = W * 0.06, by = H * 0.72;
    const bw = W * 0.88, bh = H * 0.23;

    ctx.save();
    ctx.fillStyle   = '#F5E6C3';
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth   = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur  = 24;
    this._rrect(ctx, bx, by, bw, bh, 14);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // 화자 이름 태그
    ctx.save();
    const lw = 140, lh = 34;
    ctx.fillStyle   = '#F5E6C3';
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth   = 2;
    this._rrect(ctx, bx + 20, by - lh / 2, lw, lh, 6);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle    = '#5C3D00';
    ctx.font         = `bold ${Math.floor(H * 0.022)}px 'Press Start 2P', monospace`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('카카사', bx + 32, by);
    ctx.restore();

    // ── 대사 텍스트 ──
    ctx.save();
    ctx.fillStyle    = '#2C1A00';
    ctx.font         = `${Math.floor(H * 0.03)}px sans-serif`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    page.lines.forEach((line, i) => {
      ctx.fillText(line, bx + 28, by + 22 + i * (H * 0.058));
    });
    ctx.restore();

    // ── O/X 핸드사인 힌트 (3페이지만) ──
    if (page.showOX) {
      this._renderOXHint(H, bx, by, bw, bh);
    }

    // ── 페이지 도트 ──
    this._renderPageDots(bx, by, bw);

    // ── 주먹 펌프 안내 ──
    this._renderFistHint(W, H, by, handState);
  }

  _renderOXHint(H, bx, by, bw, bh) {
    const ctx   = this.ctx;
    const cardW = bw * 0.2;
    const cardH = bh * 0.38;
    const cardY = by + bh - cardH - 28;

    // O 카드
    const ox1 = bx + bw * 0.56;
    ctx.save();
    ctx.fillStyle   = 'rgba(30,60,120,0.85)';
    ctx.strokeStyle = '#5B8DD9';
    ctx.lineWidth   = 2;
    this._rrect(ctx, ox1, cardY, cardW, cardH, 8);
    ctx.fill(); ctx.stroke();

    if (this._assets.sign_o) {
      ctx.drawImage(this._assets.sign_o, ox1 + 4, cardY + 4, cardW - 8, cardH - 22);
    } else {
      // placeholder: O 원
      const cx1 = ox1 + cardW / 2, cy1 = cardY + cardH * 0.38;
      ctx.strokeStyle = '#7BB8FF';
      ctx.lineWidth   = 4;
      ctx.beginPath();
      ctx.arc(cx1, cy1, cardH * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle    = '#7BB8FF';
    ctx.font         = `bold ${Math.floor(H * 0.02)}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('O (맞다)', ox1 + cardW / 2, cardY + cardH - 4);
    ctx.restore();

    // X 카드
    const ox2 = bx + bw * 0.79;
    ctx.save();
    ctx.fillStyle   = 'rgba(100,30,20,0.85)';
    ctx.strokeStyle = '#D97B5B';
    ctx.lineWidth   = 2;
    this._rrect(ctx, ox2, cardY, cardW, cardH, 8);
    ctx.fill(); ctx.stroke();

    if (this._assets.sign_x) {
      ctx.drawImage(this._assets.sign_x, ox2 + 4, cardY + 4, cardW - 8, cardH - 22);
    } else {
      // placeholder: X 교차
      const cx2 = ox2 + cardW / 2, cy2 = cardY + cardH * 0.38;
      const r = cardH * 0.22;
      ctx.strokeStyle = '#FF9B7B';
      ctx.lineWidth   = 4;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(cx2 - r, cy2 - r); ctx.lineTo(cx2 + r, cy2 + r);
      ctx.moveTo(cx2 + r, cy2 - r); ctx.lineTo(cx2 - r, cy2 + r);
      ctx.stroke();
    }

    ctx.fillStyle    = '#FF9B7B';
    ctx.font         = `bold ${Math.floor(H * 0.02)}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('X (아니다)', ox2 + cardW / 2, cardY + cardH - 4);
    ctx.restore();
  }

  _renderPageDots(bx, by, bw) {
    const ctx    = this.ctx;
    const total  = PAGES.length;
    const dotR   = 5;
    const gap    = 18;
    const totalW = total * dotR * 2 + (total - 1) * (gap - dotR * 2);
    let dx       = bx + bw - totalW - 20;
    const dy     = by + 14;

    for (let i = 0; i < total; i++) {
      ctx.beginPath();
      ctx.arc(dx + dotR, dy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = i === this._page ? '#8B6914' : 'rgba(139,105,20,0.3)';
      ctx.fill();
      dx += gap;
    }
  }

  _renderFistHint(W, H, by, handState) {
    const ctx     = this.ctx;
    const isFist  = this._isFist(handState);
    const cooling = this._advanceCooldown > 0;

    const hintY = by - 36;

    ctx.save();
    if (cooling) {
      // 페이지 넘어가는 중 — 깜빡임
      ctx.globalAlpha  = 0.6;
      ctx.fillStyle    = '#FFB800';
      ctx.font         = `bold ${Math.floor(H * 0.022)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', W / 2, hintY);
    } else if (isFist) {
      // 주먹 감지됨 — 밝게
      ctx.fillStyle    = '#FFB800';
      ctx.shadowColor  = '#FFB800';
      ctx.shadowBlur   = 14;
      ctx.font         = `bold ${Math.floor(H * 0.022)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✊ 주먹 감지됨 — 손을 펴서 넘어가기', W / 2, hintY);
    } else {
      // 대기 — 깜빡임
      const pulse      = 0.5 + 0.5 * Math.sin(performance.now() * 0.003);
      ctx.globalAlpha  = 0.5 + 0.5 * pulse;
      ctx.fillStyle    = 'rgba(255,255,255,0.7)';
      ctx.font         = `${Math.floor(H * 0.02)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('주먹을 쥐었다 펴서 넘어가기 ▶', W / 2, hintY);
    }
    ctx.restore();
  }

  // ── 손 랜드마크 오버레이 ────────────────────────────────────

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

  // ── 헬퍼 ────────────────────────────────────────────────────

  _btnRect() {
    const W = this.canvas.width, H = this.canvas.height;
    const w = Math.min(380, W * 0.38);
    const h = Math.floor(H * 0.08);
    return { x: W / 2 - w / 2, y: H * 0.55, w, h };
  }

  // press_start 이미지가 있으면 그 크기(4배)에 맞춘 호버 판정 영역, 없으면 기본 버튼 영역
  _pressStartSize(btn) {
    const img = this._assets.press_start;
    if (!img) return null;
    const h = btn.h * 2.1;
    const w = h * (img.width / img.height);
    return { w, h };
  }

  _hoverRect() {
    const W   = this.canvas.width;
    const btn = this._btnRect();
    const size = this._pressStartSize(btn);
    if (!size) return btn;
    return { x: W / 2 - size.w / 2, y: btn.y + btn.h / 2 - size.h / 2, w: size.w, h: size.h };
  }

  _palmOnCanvas(handState) {
    const lms = handState.landmarks;
    if (!lms?.length || !this.video.videoWidth) return null;
    const hand  = lms[0];
    const video = this.video;
    const W     = this.canvas.width, H = this.canvas.height;
    const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
    const ox    = (W - video.videoWidth  * scale) / 2;
    const oy    = (H - video.videoHeight * scale) / 2;
    const pts   = [0, 5, 9, 13, 17].map(i => hand[i]);
    const x     = pts.reduce((s, p) => s + ((1 - p.x) * video.videoWidth  * scale + ox), 0) / 5;
    const y     = pts.reduce((s, p) => s + (p.y        * video.videoHeight * scale + oy), 0) / 5;
    return { x, y };
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
