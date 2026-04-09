/**
 * arEffectEngine.js — 캠 위에 직접 그리는 AR 이펙트 엔진
 * draw()를 MediaPipe 콜백에서 매 프레임 호출
 */

export class AREffectEngine {
  constructor(canvas, ctx) {
    this.canvas        = canvas;
    this.ctx           = ctx;
    this.faceLandmarks = null;
    this.frameCount    = 0;
    this.particles     = [];
  }

  updateFace(faceLandmarks) {
    this.faceLandmarks = faceLandmarks;
  }

  /** MediaPipe 콜백에서 매 프레임 직접 호출 */
  draw(jutsu, multiHandLandmarks, video) {
    this.multiHandLandmarks = multiHandLandmarks;
    this.video              = video;
    this.frameCount++;

    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // ── 항상: 손 랜드마크 시각화 ──────────────────────────
    this._drawHandLandmarks(W, H);

    // ── 술식 이펙트 ───────────────────────────────────────
    switch (jutsu) {
    case 'boar':   this._drawOrb(W, H, '255,60,60',  'rgba(255,0,0,0.6)');   break;
    case 'rabbit': this._drawOrb(W, H, '60,120,255', 'rgba(0,80,255,0.6)');  break;
    case 'rat':    this._drawOrb(W, H, '255,220,30', 'rgba(255,180,0,0.6)'); break;
  }
  }

  // ── 랜드마크 좌표 → 캔버스 픽셀 변환 ─────────────────
  // video와 canvas 모두 scaleX(-1) 되어 있으므로
  // x 반전 없이 그대로 쓰면 됨
  _lx(lm, W) {
    const video = this.video;
    const scale = Math.max(W / video.videoWidth, this.canvas.height / video.videoHeight);
    const offsetX = (W - video.videoWidth * scale) / 2;
    return (1 - lm.x) * video.videoWidth * scale + offsetX;
  }
  _ly(lm, H) {
    const video = this.video;
    const scale = Math.max(this.canvas.width / video.videoWidth, H / video.videoHeight);
    const offsetY = (H - video.videoHeight * scale) / 2;
    return lm.y * video.videoHeight * scale + offsetY;
  }

  // 손바닥 중심 (landmark 9 = 중지 MCP)
  _palmCenter(hand, W, H) {
  // 0(손목), 5, 9, 13, 17(각 손가락 MCP) 평균
  const pts = [0, 5, 9, 13, 17].map(i => hand[i]);
  const x = pts.reduce((s, p) => s + this._lx(p, W), 0) / pts.length;
  const y = pts.reduce((s, p) => s + this._ly(p, H), 0) / pts.length;
  return { x, y };
  }

  // 손목-중지 거리로 손 크기 추정
  _handSize(hand, W, H) {
    const w = hand[0], m = hand[9];
    return Math.hypot((m.x - w.x) * W, (m.y - w.y) * H);
  }

  // ── 1. 손 랜드마크 시각화 ─────────────────────────────
  _drawHandLandmarks(W, H) {
    const lms = this.multiHandLandmarks;
    if (!lms?.length) return;
    const ctx = this.ctx;

    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17],
    ];

    lms.forEach(hand => {
      // 연결선
      ctx.save();
      ctx.strokeStyle = 'rgba(139,92,246,0.7)';
      ctx.lineWidth   = 2;
      CONNECTIONS.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(this._lx(hand[a], W), this._ly(hand[a], H));
        ctx.lineTo(this._lx(hand[b], W), this._ly(hand[b], H));
        ctx.stroke();
      });

      // 관절 점
      hand.forEach((lm, i) => {
        ctx.beginPath();
        ctx.arc(this._lx(lm, W), this._ly(lm, H), i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle   = i === 0 ? '#f59e0b' : 'rgba(139,92,246,0.9)';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1;
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    });
  }

  // ── 2. 사륜안 ─────────────────────────────────────────
  _drawSharingan(W, H) {
    const ctx = this.ctx;
    const lms = this.faceLandmarks;
    if (!lms) return;

    const eyes = [
      { center: lms[468] ?? lms[159], l: lms[33],  r: lms[133] },
      { center: lms[473] ?? lms[386], l: lms[362], r: lms[263] },
    ];

    eyes.forEach(({ center, l, r }) => {
      if (!center) return;
      const cx   = this._lx(center, W);
      const cy   = this._ly(center, H);
      const eyeW = Math.hypot((r.x - l.x) * W, (r.y - l.y) * H);
      const rad  = eyeW * 0.7;
      this._drawSharinganEye(ctx, cx, cy, rad);
    });

    // 전체 빨간 vignette
    const vig = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.85);
    vig.addColorStop(0, 'rgba(160,0,0,0)');
    vig.addColorStop(1, 'rgba(160,0,0,0.3)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  _drawSharinganEye(ctx, cx, cy, r) {
    const t = this.frameCount * 0.025;

    // 글로우
    const glow = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.8);
    glow.addColorStop(0, 'rgba(220,0,0,0.45)');
    glow.addColorStop(1, 'rgba(220,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    // 흰 공막
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(235,215,215,0.88)'; ctx.fill();
    // 빨간 홍채
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(195,0,0,0.92)'; ctx.fill();
    // 토마에 3개
    for (let i = 0; i < 3; i++) {
      const a = t + (i * Math.PI * 2) / 3;
      this._drawTomoe(ctx, cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4, r * 0.18, a);
    }
    // 동공
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = '#000'; ctx.fill();
    // 하이라이트
    ctx.beginPath(); ctx.arc(cx - r * 0.07, cy - r * 0.09, r * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    ctx.restore();
  }

  _drawTomoe(ctx, x, y, r, angle) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#180000'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.bezierCurveTo(r * 1.2, r * 1.5, r * 1.5, 0, 0, -r * 0.5);
    ctx.bezierCurveTo(-r * 0.5, -r * 0.2, -r * 0.3, r * 0.5, 0, r);
    ctx.fillStyle = '#180000'; ctx.fill();
    ctx.restore();
  }

  // ── 3. 분신술 ─────────────────────────────────────────
  // 현재 비디오 프레임을 좌우로 오프셋해서 반투명하게 복제
  _drawShadowClone(W, H) {
    const ctx   = this.ctx;
    const video = this.video;
    if (!video) return;
    const t = this.frameCount;

    // 흔들림 offset
    const shake = Math.sin(t * 0.15) * 6;

    // 분신 2개 (원본보다 먼저 그려서 뒤에 깔림)
    const clones = [
      { dx: -W * 0.10 + shake,  alpha: 0.50, hue: 200 },
      { dx:  W * 0.10 - shake,  alpha: 0.50, hue: 160 },
    ];

    clones.forEach(({ dx, alpha, hue }) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.filter      = `hue-rotate(${hue}deg) brightness(1.2)`;
      // 크롭 없이 동일 크기로, x만 이동
      ctx.drawImage(video, dx, 0, W, H);
      ctx.restore();
    });

    // 연기 파티클
    this._emitSmoke(W, H);
    this._tickParticles(ctx);
  }

  // ── 4. 나선환 — 손바닥 위치 추적 ──────────────────────
  _drawRasengan(W, H) {
    const ctx = this.ctx;
    const lms = this.multiHandLandmarks;
    if (!lms?.length) return;
    const t = this.frameCount;

    lms.forEach(hand => {
      const { x: cx, y: cy } = this._palmCenter(hand, W, H);
      const R = this._handSize(hand, W, H) * 1.1;

      // 외부 글로우
      const glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 2.2);
      glow.addColorStop(0,   'rgba(80,160,255,0.65)');
      glow.addColorStop(0.4, 'rgba(40,100,255,0.3)');
      glow.addColorStop(1,   'rgba(0,40,200,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx, cy, R * 2.2, 0, Math.PI * 2); ctx.fill();

      // 회전 링 3개
      [1.0, 0.72, 0.46].forEach((scale, ri) => {
        const rr    = R * scale;
        const speed = (ri + 1) * 0.045 * (ri % 2 === 0 ? 1 : -1);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * speed);
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 1.75);
        ctx.strokeStyle = `rgba(${100 + ri*50},${180 - ri*20},255,${0.8 - ri*0.15})`;
        ctx.lineWidth   = 3.5 - ri * 0.8;
        ctx.shadowBlur  = 14; ctx.shadowColor = '#4af';
        ctx.stroke();
        ctx.restore();
      });

      // 파티클 방출
      if (t % 2 === 0) {
        const a = Math.random() * Math.PI * 2;
        this.particles.push({
          x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R,
          vx: Math.cos(a + Math.PI / 2) * (2 + Math.random() * 2.5),
          vy: Math.sin(a + Math.PI / 2) * (2 + Math.random() * 2.5),
          r: 3 + Math.random() * 4, life: 1.0, decay: 0.04,
          type: 'spark', color: '100,180,255',
        });
      }
    });

    this._tickParticles(ctx);
  }

  // ── 5. 치도리 — 손 위치 추적 ──────────────────────────
  _drawChidori(W, H) {
    const ctx = this.ctx;
    const lms = this.multiHandLandmarks;
    if (!lms?.length) return;

    lms.forEach(hand => {
      const { x: cx, y: cy } = this._palmCenter(hand, W, H);
      const R = this._handSize(hand, W, H) * 1.5;

      // 번개 arc 방사
      for (let i = 0; i < 14; i++) {
        const baseAngle = (i / 14) * Math.PI * 2 + this.frameCount * 0.09;
        this._drawLightningArc(ctx, cx, cy, baseAngle, R * (0.5 + Math.random() * 0.9));
      }

      // 중심 글로우
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
      core.addColorStop(0, 'rgba(255,255,255,0.95)');
      core.addColorStop(0.3, 'rgba(180,220,255,0.6)');
      core.addColorStop(1, 'rgba(100,160,255,0)');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.fill();

      // 간헐적 화면 플래시
      if (this.frameCount % 7 < 2) {
        ctx.fillStyle = 'rgba(140,200,255,0.07)';
        ctx.fillRect(0, 0, W, H);
      }
    });
  }

  _drawOrb(W, H, rgb, glowColor) {
    const ctx = this.ctx;
    const lms = this.multiHandLandmarks;
    if (!lms?.length) return;
    const t = this.frameCount;

    lms.forEach(hand => {
      const { x: cx, y: cy } = this._palmCenter(hand, W, H);
      const R = this._handSize(hand, W, H) * 0.9;

      // 외부 글로우
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.5);
      glow.addColorStop(0,   `rgba(${rgb},0.5)`);
      glow.addColorStop(0.5, `rgba(${rgb},0.15)`);
      glow.addColorStop(1,   `rgba(${rgb},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx, cy, R * 2.5, 0, Math.PI * 2); ctx.fill();

      // 공 본체
      const ball = ctx.createRadialGradient(cx - R*0.3, cy - R*0.3, R*0.1, cx, cy, R);
      ball.addColorStop(0,   `rgba(255,255,255,0.95)`);
      ball.addColorStop(0.3, `rgba(${rgb},0.9)`);
      ball.addColorStop(1,   `rgba(${rgb},0.6)`);
      ctx.fillStyle = ball;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // 회전 링
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.3, 0, Math.PI * 1.6);
      ctx.strokeStyle = `rgba(${rgb},0.5)`;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12; ctx.shadowColor = glowColor;
      ctx.stroke();
      ctx.restore();

      // 파티클
      if (t % 3 === 0) {
        const a = Math.random() * Math.PI * 2;
        this.particles.push({
          x: cx + Math.cos(a) * R,
          y: cy + Math.sin(a) * R,
          vx: Math.cos(a) * (1 + Math.random() * 1.5),
          vy: Math.sin(a) * (1 + Math.random() * 1.5),
          r: 2 + Math.random() * 3,
          life: 1.0, decay: 0.05,
          type: 'spark', color: rgb,
        });
      }
    });

    this._tickParticles(ctx);
  }

  _drawLightningArc(ctx, sx, sy, angle, length) {
    const segs = 5 + Math.floor(Math.random() * 4);
    const ex   = sx + Math.cos(angle) * length;
    const ey   = sy + Math.sin(angle) * length;

    // 글로우 레이어
    ctx.save();
    ctx.beginPath(); ctx.moveTo(sx, sy);
    for (let i = 1; i <= segs; i++) {
      const p  = i / segs;
      ctx.lineTo(
        sx + (ex - sx) * p + (Math.random() - 0.5) * 22,
        sy + (ey - sy) * p + (Math.random() - 0.5) * 22
      );
    }
    ctx.strokeStyle = 'rgba(160,210,255,0.28)';
    ctx.lineWidth   = 5; ctx.shadowBlur = 18; ctx.shadowColor = '#9df';
    ctx.stroke();

    // 핵심 선
    ctx.beginPath(); ctx.moveTo(sx, sy);
    for (let i = 1; i <= segs; i++) {
      const p = i / segs;
      ctx.lineTo(
        sx + (ex - sx) * p + (Math.random() - 0.5) * 12,
        sy + (ey - sy) * p + (Math.random() - 0.5) * 12
      );
    }
    ctx.strokeStyle = 'rgba(225,245,255,0.92)';
    ctx.lineWidth   = 1.5; ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  // ── 파티클 공통 ───────────────────────────────────────
  _emitSmoke(W, H) {
    if (this.frameCount % 3 !== 0) return;
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: W * (0.25 + Math.random() * 0.5),
        y: H * (0.45 + Math.random() * 0.35),
        vx: (Math.random() - 0.5) * 2.5,
        vy: -(1 + Math.random() * 2),
        r: 22 + Math.random() * 28,
        life: 1.0, decay: 0.011 + Math.random() * 0.009,
        type: 'smoke',
      });
    }
  }

  _tickParticles(ctx) {
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.life -= p.decay;

      if (p.type === 'smoke') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(210,210,210,${0.35 * p.life})`);
        g.addColorStop(1, 'rgba(210,210,210,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'spark') {
        ctx.save();
        ctx.strokeStyle = `rgba(${p.color},${p.life * 0.9})`;
        ctx.lineWidth   = 1.8;
        ctx.shadowBlur  = 6; ctx.shadowColor = `rgba(${p.color},0.8)`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 5, p.y - p.vy * 5);
        ctx.stroke();
        ctx.restore();
      }
    });
  }
}