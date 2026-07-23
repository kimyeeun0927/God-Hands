import { Round3Scene } from './Round3Scene.js';

// ── 타임라인 (ms) ──────────────────────────────────────────────────
const T1_IN_END   =  700;
const T1_HOLD_END = 1500;
const T1_OUT_END  = 2300;
const T2_IN_START = 1800;
const T2_IN_END   = 2600;
const T2_HOLD_END = 3400;
const T2_OUT_END  = 4200;
const PAUSE_END   = 5200;
const SHAKE1_END  = 6600;   // 1차 진동 1400ms (2배)
const FOG_PEAK    = 8300;   // 안개 최고조
const BG_START    = 8000;   // background.png 페이드인 시작
const FOG_END     = 8900;   // 안개 걷힘 / 2차 진동 시작
const SHAKE2_END  = 10300;  // 2차 진동 1400ms (2배)
const SETTLE_END  = 10800;  // 적 착지 → Round3 시작

// 진동 대상 선택자 (video는 scaleX(-1) 복원 필요)
const SHAKE_ELEMS = ['#score-hud', '#hand-hud', '#fps-counter', '#timer-hud'];

export class Round3IntroScene {
  hideScoreHUD = false;

  constructor(manager) {
    this.manager  = manager;
    this.canvas   = manager.canvas;
    this.ctx      = manager.ctx;
    this._elapsed = 0;
    this._assets  = {};
    this._done    = false;
  }

  init() {
    this._tryLoad('enemy', 'assets/enemies/enemy.png');
    this._tryLoad('bg',    'assets/background.png');
  }

  _tryLoad(k, src) {
    const img = new Image();
    img.onload  = () => { this._assets[k] = img; };
    img.onerror = () => {};
    img.src = src;
    if (img.complete && img.naturalWidth > 0) this._assets[k] = img;
  }

  _shk(t, amp) {
    return Math.sin(t * 0.079) * amp
         + Math.sin(t * 0.053) * amp * 0.55
         + Math.sin(t * 0.107) * amp * 0.33;
  }

  _applyShake(sx, sy) {
    const tr      = `translate(${sx}px, ${sy}px)`;
    const videoEl = document.getElementById('input-video');
    // canvas: CSS transform으로 이동 (캔버스 내용 포함)
    this.canvas.style.transform = tr;
    // video: scaleX(-1) 유지하면서 추가로 이동
    if (videoEl) videoEl.style.transform = `${tr} scaleX(-1)`;
    // 나머지 HUD 요소들
    SHAKE_ELEMS.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.style.transform = tr;
    });
  }

  _resetShake() {
    const videoEl = document.getElementById('input-video');
    this.canvas.style.transform = '';
    if (videoEl) videoEl.style.transform = 'scaleX(-1)';
    SHAKE_ELEMS.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.style.transform = '';
    });
  }

  destroy() {
    this._resetShake();
  }

  update(dt) {
    if (this._done) return;
    this._elapsed += dt;
    const e = this._elapsed;

    const inShake = (e >= PAUSE_END && e < SHAKE1_END) ||
                    (e >= FOG_END   && e < SHAKE2_END);

    if (inShake) {
      this._applyShake(this._shk(e, 20), this._shk(e * 1.31, 14));
    } else {
      this._resetShake();
    }

    if (e >= SETTLE_END) {
      this._done = true;
      this._resetShake();
      this.manager.goto(Round3Scene);
    }
  }

  render() {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    const e = this._elapsed;

    ctx.clearRect(0, 0, W, H);

    // 반투명 검정 오버레이 — 캠은 뒤에서 보임
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0, 0, W, H);

    // background.png: 안개 최고조 직전부터 페이드인, 2차 흔들림 전까지만 표시
    const bgAlpha = (() => {
      if (e < BG_START || e >= FOG_END) return 0;
      if (e < FOG_PEAK) return Math.min(1, (e - BG_START) / 400);
      return 1;
    })();
    if (bgAlpha > 0) {
      const bg = this._assets['bg'];
      if (bg?.complete && bg.naturalWidth) {
        ctx.save();
        ctx.globalAlpha = bgAlpha;
        ctx.drawImage(bg, 0, 0, W, H);
        ctx.restore();
      }
    }

    // 안개
    const fogAlpha = (() => {
      if (e < SHAKE1_END) return 0;
      if (e < FOG_PEAK)   return (e - SHAKE1_END) / (FOG_PEAK - SHAKE1_END) * 0.93;
      if (e < FOG_END)    return 0.93 * (1 - (e - FOG_PEAK) / (FOG_END - FOG_PEAK));
      return 0;
    })();
    if (fogAlpha > 0) {
      ctx.save();
      const grd = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.75);
      grd.addColorStop(0, `rgba(150,165,195,${fogAlpha * 0.75})`);
      grd.addColorStop(1, `rgba(100,120,160,${fogAlpha})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 적 캐릭터 (안개 위에 그려 '불쑥 등장' 연출)
    const enemy = this._assets['enemy'];
    if (enemy?.complete && enemy.naturalWidth) {
      const ratio = enemy.naturalWidth / enemy.naturalHeight;

      if (e >= FOG_PEAK && e < SHAKE2_END) {
        // 화면 꽉 차게 등장
        const a  = Math.min(1, (e - FOG_PEAK) / 350);
        const eh = H * 0.97;
        const ew = eh * ratio;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.drawImage(enemy, W * 0.5 - ew / 2, H * 0.5 - eh * 0.52, ew, eh);
        ctx.restore();
      } else if (e >= SHAKE2_END) {
        // 오른쪽으로 이동하며 Round3 위치·크기로 착지
        const t  = Math.min(1, (e - SHAKE2_END) / 500);
        const tE = 1 - Math.pow(1 - t, 3);
        const ehB = H * 0.97;
        const ehE = Math.min(H * 0.56, W * 0.40);
        const eh  = ehB - tE * (ehB - ehE);
        const ew  = eh * ratio;
        const ex  = W * (0.5 + tE * 0.30);
        ctx.drawImage(enemy, ex - ew / 2, H * 0.5 - eh * 0.52, ew, eh);
      }
    }

    this._renderTexts(ctx, W, H, e);
  }

  _renderTexts(ctx, W, H, e) {
    const font = `${Math.floor(H * 0.038)}px 'Mulmaru', sans-serif`;

    const a1 = (() => {
      if (e >= T1_OUT_END) return 0;
      if (e < T1_IN_END)   return e / T1_IN_END;
      if (e < T1_HOLD_END) return 1;
      return 1 - (e - T1_HOLD_END) / (T1_OUT_END - T1_HOLD_END);
    })();
    if (a1 > 0.005) {
      ctx.save();
      ctx.globalAlpha  = a1;
      ctx.font         = font;
      ctx.fillStyle    = '#F5E6C3';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('뭔가 불안한 느낌이 든다', W * 0.07, H * 0.40);
      ctx.restore();
    }

    const a2 = (() => {
      if (e < T2_IN_START || e >= T2_OUT_END) return 0;
      if (e < T2_IN_END)   return (e - T2_IN_START) / (T2_IN_END - T2_IN_START);
      if (e < T2_HOLD_END) return 1;
      return 1 - (e - T2_HOLD_END) / (T2_OUT_END - T2_HOLD_END);
    })();
    if (a2 > 0.005) {
      ctx.save();
      ctx.globalAlpha  = a2;
      ctx.font         = font;
      ctx.fillStyle    = '#F5E6C3';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('무언가 튀어나올 것 같은 기분', W * 0.93, H * 0.60);
      ctx.restore();
    }
  }
}
