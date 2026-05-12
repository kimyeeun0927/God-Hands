import { Round1Scene } from './Round1Scene.js';

const HOVER_DURATION = 1500; // ms to hold hand over button
const BOAR_HOLD_MS   = 800;  // dialogue에서 boar 인식 → Round1 전환 딜레이

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
    this.phase      = 'title';   // 'title' | 'dialogue'
    this._hoverMs   = 0;
    this._boarHoldMs = 0;
    this._assets    = {};
  }

  init() {
    this._tryLoad('kakashi', '/assets/characters/kakashi.png');
  }

  _tryLoad(key, src) {
    const img = new Image();
    img.onload  = () => { this._assets[key] = img; };
    img.onerror = () => {};
    img.src = src;
  }

  update(dt, handState) {
    if (this.phase === 'title') {
      this._updateTitle(dt, handState);
    } else {
      this._updateDialogue(dt, handState);
    }
  }

  _updateTitle(dt, handState) {
    const palm  = this._palmOnCanvas(handState);
    const btn   = this._btnRect();
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
    if (handState.gesture === 'boar') {
      this._boarHoldMs += dt;
      if (this._boarHoldMs >= BOAR_HOLD_MS) {
        this.manager.goto(Round1Scene);
      }
    } else {
      this._boarHoldMs = 0;
    }
  }

  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (this.phase === 'title') {
      this._renderTitle(W, H, handState);
    } else {
      this._renderDialogue(W, H);
    }

    this._renderHands(handState, W, H);
  }

  // ── Title ─────────────────────────────────────────────────

  _renderTitle(W, H, handState) {
    const ctx  = this.ctx;
    const btn  = this._btnRect();
    const prog = this._hoverMs / HOVER_DURATION;

    // 반투명 오버레이
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);

    // 타이틀
    ctx.save();
    ctx.shadowColor = '#FF8C00';
    ctx.shadowBlur  = 40;
    ctx.fillStyle   = '#FFB800';
    ctx.font        = `bold ${Math.floor(H * 0.1)}px 'Press Start 2P', monospace`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HANDSEAL', W / 2, H * 0.38);
    ctx.restore();

    // 버튼 배경
    ctx.save();
    ctx.fillStyle = '#C86A00';
    this._rrect(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fill();

    // 호버 진행 채우기
    if (prog > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(btn.x, btn.y, btn.w, btn.h);
      ctx.clip();
      ctx.fillStyle = '#FFB800';
      this._rrect(ctx, btn.x, btn.y, btn.w * prog, btn.h, 10);
      ctx.fill();
      ctx.restore();
    }

    // 버튼 테두리
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

    // 손 커서 (버튼 위 팜 위치 시각화)
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

    // 안내 문구
    ctx.save();
    ctx.fillStyle    = 'rgba(255,255,255,0.55)';
    ctx.font         = `${Math.floor(H * 0.018)}px 'JetBrains Mono', monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('손을 버튼 위에 올려주세요', W / 2, btn.y + btn.h + 18);
    ctx.restore();
  }

  // ── Dialogue ───────────────────────────────────────────────

  _renderDialogue(W, H) {
    const ctx = this.ctx;

    // 어두운 오버레이
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);

    // 캐릭터 초상화 (이미지 or 플레이스홀더)
    const pw = Math.min(H * 0.55, W * 0.28);
    const ph = pw * 1.4;
    const px = W * 0.06;
    const py = H * 0.5 - ph / 2;

    if (this._assets.kakashi) {
      ctx.drawImage(this._assets.kakashi, px, py, pw, ph);
    } else {
      ctx.save();
      ctx.fillStyle   = 'rgba(80,80,80,0.45)';
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth   = 1;
      this._rrect(ctx, px, py, pw, ph, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle    = 'rgba(255,255,255,0.2)';
      ctx.font         = `12px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('캐릭터', px + pw / 2, py + ph / 2);
      ctx.restore();
    }

    // 다이얼로그 박스 (하단 고정)
    const bx = W * 0.06, by = H * 0.72;
    const bw = W * 0.88,  bh = H * 0.23;

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

    // 대사
    const lines = [
      '잘 왔다, 닌자 지망생!',
      '너의 닌자 실력을 시험해 보지.',
      '3단계를 통과하면 정식 닌자로 인정해주마!',
    ];
    ctx.save();
    ctx.fillStyle    = '#2C1A00';
    ctx.font         = `${Math.floor(H * 0.03)}px sans-serif`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, bx + 28, by + 22 + i * (H * 0.065));
    });
    ctx.restore();

    // 인장 안내 (boar 인식 중이면 진행 바, 아니면 깜박임)
    const boarProg = Math.min(1, this._boarHoldMs / BOAR_HOLD_MS);
    ctx.save();
    if (boarProg > 0) {
      // 진행 배경
      const barW = bw * 0.7, barH = 6;
      const barX = bx + (bw - barW) / 2, barY = by + bh - 20;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.roundRect?.(barX, barY, barW, barH, 3) ?? ctx.rect(barX, barY, barW, barH); ctx.fill();
      ctx.fillStyle   = '#FF8C00';
      ctx.shadowColor = '#FF8C00'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.roundRect?.(barX, barY, barW * boarProg, barH, 3) ?? ctx.rect(barX, barY, barW * boarProg, barH); ctx.fill();
      ctx.fillStyle = '#FF8C00'; ctx.shadowBlur = 0;
      ctx.font = `bold ${Math.floor(H * 0.018)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('亥 인장 인식중...', W / 2, barY - 6);
    } else {
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.003);
      ctx.globalAlpha  = pulse;
      ctx.fillStyle    = '#FF8C00';
      ctx.font         = `bold ${Math.floor(H * 0.022)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('준비가 되면 亥 (돼지) 인장을 취하세요', W / 2, by + bh - 24);
    }
    ctx.restore();
  }

  // ── 손 랜드마크 오버레이 ───────────────────────────────────

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
      ctx.strokeStyle = 'rgba(139,92,246,0.7)';
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
        ctx.fillStyle   = i === 0 ? '#f59e0b' : 'rgba(139,92,246,0.9)';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1;
        ctx.fill(); ctx.stroke();
      });
      ctx.restore();
    });
  }

  // ── 헬퍼 ──────────────────────────────────────────────────

  _btnRect() {
    const W = this.canvas.width, H = this.canvas.height;
    const w = Math.min(380, W * 0.38);
    const h = Math.floor(H * 0.08);
    return { x: W / 2 - w / 2, y: H * 0.55, w, h };
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

  // roundRect 폴리필
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
