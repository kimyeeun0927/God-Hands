const TARGET = { jutsu: 'rabbit', char: '卯', name: '토끼', hint: '오른손 검지 ↑   왼손 새끼손가락 ↑' };

const HOLD_MS    = 1200;
const SUCCESS_MS = 2200;

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
    this.manager    = manager;
    this.canvas     = manager.canvas;
    this.ctx        = manager.ctx;
    this.video      = manager.video;
    this.phase      = 'challenge';
    this._holdMs    = 0;
    this._successMs = 0;
    this._frame     = 0;
    this._particles = [];
    this._gone      = false;
  }

  update(dt, handState) {
    this._frame++;

    if (this.phase === 'challenge') {
      if (handState.gesture === TARGET.jutsu) {
        this._holdMs += dt;
        if (this._holdMs >= HOLD_MS) {
          this.phase   = 'success';
          this._holdMs = HOLD_MS;
        }
      } else {
        this._holdMs = Math.max(0, this._holdMs - dt * 1.5);
      }
    } else if (this.phase === 'success') {
      this._successMs += dt;
      this._emitParticles();
      if (this._successMs >= SUCCESS_MS && !this._gone) {
        this._gone = true;
        // TODO: this.manager.goto(Round2Scene);
        console.log('[Round1] CLEAR → Round 2 (미구현)');
      }
    }

    this._tickParticles();
  }

  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, W, H);

    if (this.phase === 'challenge') {
      this._renderChallenge(W, H);
    } else {
      this._renderSuccess(W, H);
    }

    this._renderHands(handState, W, H);
    this._renderParticles();
  }

  // ── Challenge ──────────────────────────────────────────────

  _renderChallenge(W, H) {
    const ctx  = this.ctx;
    const prog = this._holdMs / HOLD_MS;

    // ROUND 1 라벨
    ctx.save();
    ctx.font         = `bold ${Math.floor(H * 0.025)}px 'Press Start 2P', monospace`;
    ctx.fillStyle    = '#FFB800';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor  = '#FF8C00';
    ctx.shadowBlur   = 20;
    ctx.fillText('ROUND 1', W / 2, H * 0.06);
    ctx.restore();

    // 대형 인장 한자
    ctx.save();
    ctx.font         = `${Math.floor(H * 0.22)}px serif`;
    ctx.fillStyle    = prog > 0
      ? `rgba(255,184,0,${0.7 + 0.3 * prog})`
      : 'rgba(255,255,255,0.88)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = prog > 0 ? '#FFB800' : 'rgba(255,255,255,0.2)';
    ctx.shadowBlur   = prog > 0 ? 50 * prog : 8;
    ctx.fillText(TARGET.char, W / 2, H * 0.37);
    ctx.restore();

    // 인장 이름
    ctx.save();
    ctx.font         = `bold ${Math.floor(H * 0.028)}px 'Press Start 2P', monospace`;
    ctx.fillStyle    = 'rgba(255,255,255,0.92)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(TARGET.name + ' 인장', W / 2, H * 0.545);
    ctx.restore();

    // 힌트 텍스트
    ctx.save();
    ctx.font         = `${Math.floor(H * 0.019)}px 'JetBrains Mono', monospace`;
    ctx.fillStyle    = 'rgba(255,255,255,0.45)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(TARGET.hint, W / 2, H * 0.625);
    ctx.restore();

    // 진행 링
    const cx = W / 2, cy = H * 0.785;
    const R  = Math.min(W, H) * 0.068;

    ctx.save();
    // 트랙
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth   = 7;
    ctx.stroke();

    // 채움
    if (prog > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      ctx.strokeStyle = '#FFB800';
      ctx.lineWidth   = 7;
      ctx.lineCap     = 'round';
      ctx.shadowColor = '#FFB800';
      ctx.shadowBlur  = 18;
      ctx.stroke();
    }

    // 중앙 텍스트
    ctx.font         = `${Math.floor(H * 0.02)}px 'JetBrains Mono', monospace`;
    ctx.fillStyle    = prog > 0 ? '#FFB800' : 'rgba(255,255,255,0.4)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur   = 0;
    ctx.fillText(prog > 0 ? `${Math.round(prog * 100)}%` : '✦', cx, cy);
    ctx.restore();

    // 안내 문구
    ctx.save();
    ctx.font         = `${Math.floor(H * 0.016)}px 'JetBrains Mono', monospace`;
    ctx.fillStyle    = 'rgba(255,255,255,0.35)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('인장을 유지하세요', W / 2, cy + R + 14);
    ctx.restore();
  }

  // ── Success ────────────────────────────────────────────────

  _renderSuccess(W, H) {
    const ctx = this.ctx;
    const t   = Math.min(1, this._successMs / SUCCESS_MS);

    // 초기 플래시
    const flash = Math.max(0, 0.35 - t * 0.45);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,184,0,${flash})`;
      ctx.fillRect(0, 0, W, H);
    }

    // CLEAR 텍스트
    ctx.save();
    const pop = Math.min(1, t * 4);
    ctx.translate(W / 2, H / 2);
    ctx.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
    ctx.globalAlpha  = pop;
    ctx.font         = `bold ${Math.floor(H * 0.1)}px 'Press Start 2P', monospace`;
    ctx.fillStyle    = '#FFB800';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = '#FF8C00';
    ctx.shadowBlur   = 60;
    ctx.fillText('CLEAR!', 0, 0);
    ctx.restore();

    // 서브 텍스트
    if (t > 0.4) {
      ctx.save();
      ctx.globalAlpha  = Math.min(1, (t - 0.4) * 2.5);
      ctx.font         = `${Math.floor(H * 0.022)}px 'JetBrains Mono', monospace`;
      ctx.fillStyle    = 'rgba(255,255,255,0.7)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('토끼 인장 습득!', W / 2, H * 0.6);
      ctx.restore();
    }
  }

  // ── 손 랜드마크 ────────────────────────────────────────────

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

  // ── 파티클 ────────────────────────────────────────────────

  _emitParticles() {
    if (this._frame % 2 !== 0) return;
    const W = this.canvas.width, H = this.canvas.height;
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.min(W, H) * 0.28;
      this._particles.push({
        x: W / 2 + Math.cos(a) * r,
        y: H / 2 + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 7,
        vy: -(2 + Math.random() * 5),
        size: 3 + Math.random() * 5,
        life: 1,
        decay: 0.022 + Math.random() * 0.018,
        color: Math.random() > 0.4 ? '255,184,0' : '255,255,255',
      });
    }
  }

  _tickParticles() {
    this._particles = this._particles.filter(p => p.life > 0);
    this._particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.12;
      p.life -= p.decay;
    });
  }

  _renderParticles() {
    const ctx = this.ctx;
    this._particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = `rgba(${p.color},1)`;
      ctx.shadowColor = `rgba(${p.color},0.8)`;
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}
