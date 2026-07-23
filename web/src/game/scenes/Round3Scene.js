import { Round3ResultScene }             from './Round3ResultScene.js';
import { KakashiDialogueScene, r3Pages } from './KakashiDialogueScene.js';

const SIGNS      = ['boar', 'rabbit', 'rat'];
const SIGN_LABEL = { boar: '돼지 (亥)', rabbit: '토끼 (卯)', rat: '쥐 (子)' };

const ENEMY_MAX_HP  = 3;   // 3대 맞으면 사망
const MIN_SEQ       = 3;
const MAX_SEQ       = 5;
const TIME_LIMIT_MS = 5000;
const FAST_MS       = 1500;
const CONFIRM_MS    = 150;
const SIGN_CD_MS    = 380;
const SEQ_DONE_MS   = 500;  // 시퀀스 완료 후 잠깐 체크마크 보여주는 시간
const PROJ_MS       = 650;  // 투사체 이동 시간
const IMPACT_MS     = 550;  // 임팩트 지속
const DEAD_MS       = 1900; // 사망 애니메이션
const COMPLETE_MS   = 600;

const PLAYER_MAX_HP = 3;
const CHARGE_MS     = 550;   // 적 돌진 지속
const P_HIT_MS      = 500;   // 플레이어 피격 지속

const PTS   = { perfect: 100, success: 50, miss: 0 };
const SEQ_BONUS  = 200;
const KILL_BONUS = 800;

const FB_STYLE = {
  perfect: { text: 'PERFECT!', color: '#FFD23F', glow: '#FF8C00' },
  success: { text: 'SUCCESS',  color: '#4ADE80', glow: '#22C55E' },
  miss:    { text: 'MISS',     color: '#FF4D4D', glow: '#B91C1C' },
};

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

export class Round3Scene {
  constructor(manager) {
    this.manager = manager;
    this.canvas  = manager.canvas;
    this.ctx     = manager.ctx;
    this.video   = manager.video;

    this._enemyHp   = ENEMY_MAX_HP;
    this._wave      = 0;
    this._sequence  = this._buildSeq();
    this._seqIdx    = 0;
    this._results   = [];   // 현재 시퀀스 각 사인 결과

    // phases: 'signing' | 'sign_cd' | 'seq_done' | 'projectile' | 'impact' | 'dead' | 'complete'
    this._phase   = 'signing';
    this._elapsed = 0;
    this._matchMs = 0;

    this._projStart = { x: 0, y: 0 };
    this._projEnd   = { x: 0, y: 0 };
    this._impactPop = 0;   // 0→1 크기 팝 애니메이션
    this._feedback  = null;
    this._assets    = {};
    this._playerHp  = PLAYER_MAX_HP;
  }

  init() {
    ['sign_boar:assets/handsigns/ground.png',
     'sign_rabbit:assets/handsigns/wind.png',
     'sign_rat:assets/handsigns/elec.png',
     'elem_boar:assets/element/ground.png',
     'elem_rabbit:assets/element/wind.png',
     'elem_rat:assets/element/elec.png',
     'frame:assets/ui/frame_focused.png',
     'enemy_idle:assets/enemies/enemy.png',
     'enemy_hurt:assets/enemies/enemy_attacted.png',
     'hp_full:assets/ui/fullheart.png',
     'hp_empty:assets/ui/emptyheart.png',
     'enemy_dead:assets/enemies/enemy_defeated.png',
    ].forEach(s => {
      const [k, ...rest] = s.split(':');
      this._tryLoad(k, rest.join(':'));
    });
    for (let i = 0; i <= 9; i++) this._tryLoad(`d${i}`, `assets/ui/${i}.png`);
    this._tryLoad('score_label', 'assets/ui/SCORE.png');  // result 씬 진입 전 캐시
  }

  _tryLoad(k, src) {
    const img = new Image();
    img.onload = () => { this._assets[k] = img; };
    img.onerror = () => {};
    img.src = src;
    if (img.complete && img.naturalWidth > 0) this._assets[k] = img;
  }

  _buildSeq() {
    const n   = MIN_SEQ + Math.floor(Math.random() * (MAX_SEQ - MIN_SEQ + 1));
    const seq = [];
    let prev  = null;
    for (let i = 0; i < n; i++) {
      let s;
      do { s = SIGNS[Math.floor(Math.random() * SIGNS.length)]; } while (s === prev);
      seq.push(s); prev = s;
    }
    return seq;
  }

  _ec(W, H) { return { x: W * 0.80, y: H * 0.50 }; }  // 적 중심
  _pc(W, H) { return { x: W * 0.26, y: H * 0.48 }; }  // 투사체 시작점

  // ── Update ───────────────────────────────────────────────────
  update(dt, handState) {
    if (this._feedback) {
      this._feedback.ms += dt;
      if (this._feedback.ms >= 520) this._feedback = null;
    }

    switch (this._phase) {
      case 'signing':    this._updateSigning(dt, handState); break;
      case 'sign_cd':    this._updateSignCd(dt);             break;
      case 'seq_done':   this._updateSeqDone(dt);            break;
      case 'projectile': this._updateProjectile(dt);         break;
      case 'impact':     this._updateImpact(dt);             break;
      case 'dead':       this._updateDead(dt);               break;
      case 'charging':   this._updateCharging(dt);           break;
      case 'player_hit': this._updatePlayerHit(dt);         break;
      case 'player_dead':
        this._elapsed += dt;
        if (this._elapsed >= 1800) this.manager.goto(KakashiDialogueScene, Round3ResultScene, r3Pages);
        break;
      case 'complete':
        this._elapsed += dt;
        if (this._elapsed >= COMPLETE_MS) this.manager.goto(KakashiDialogueScene, Round3ResultScene, r3Pages);
        break;
    }
  }

  _updateSigning(dt, handState) {
    this._elapsed += dt;
    const target  = this._sequence[this._seqIdx];
    const matched = handState.gesture === target && handState.confidence >= 40;
    this._matchMs = matched ? this._matchMs + dt : 0;

    if (this._matchMs >= CONFIRM_MS) {
      const type = this._elapsed <= FAST_MS ? 'perfect' : 'success';
      this.manager.score += PTS[type];
      this._results.push(type);
      this._feedback = { type, ms: 0 };
      this._phase = 'sign_cd'; this._elapsed = 0; this._matchMs = 0;
    } else if (this._elapsed >= TIME_LIMIT_MS) {
      this._results.push('miss');
      this._feedback = { type: 'miss', ms: 0 };
      this._phase = 'charging'; this._elapsed = 0; this._matchMs = 0;
    }
  }

  _updateSignCd(dt) {
    this._elapsed += dt;
    if (this._elapsed >= SIGN_CD_MS) {
      this._seqIdx++;
      if (this._seqIdx >= this._sequence.length) {
        this.manager.score += SEQ_BONUS;
        this._phase = 'seq_done'; this._elapsed = 0;
      } else {
        this._phase = 'signing'; this._elapsed = 0;
      }
    }
  }

  _updateSeqDone(dt) {
    this._elapsed += dt;
    if (this._elapsed >= SEQ_DONE_MS) {
      const W = this.canvas.width, H = this.canvas.height;
      this._projStart = { ...this._pc(W, H) };
      this._projEnd   = { ...this._ec(W, H) };
      this._phase = 'projectile'; this._elapsed = 0;
    }
  }

  _updateProjectile(dt) {
    this._elapsed += dt;
    if (this._elapsed >= PROJ_MS) {
      this._enemyHp--;
      this._impactPop = 0;
      this._phase = 'impact'; this._elapsed = 0;
    }
  }

  _updateImpact(dt) {
    this._elapsed += dt;
    this._impactPop = Math.min(1, this._elapsed / (IMPACT_MS * 0.3));
    if (this._elapsed >= IMPACT_MS) {
      if (this._enemyHp <= 0) {
        this._phase = 'dead'; this._elapsed = 0;
      } else {
        this._wave++;
        this._sequence = this._buildSeq();
        this._seqIdx   = 0;
        this._results  = [];
        this._phase = 'signing'; this._elapsed = 0;
      }
    }
  }

  _updateDead(dt) {
    this._elapsed += dt;
    if (this._elapsed >= DEAD_MS) {
      this.manager.score += KILL_BONUS;
      this._phase = 'complete'; this._elapsed = 0;
    }
  }

  _updateCharging(dt) {
    this._elapsed += dt;
    if (this._elapsed >= CHARGE_MS) {
      this._playerHp--;
      this._phase = 'player_hit'; this._elapsed = 0;
    }
  }

  _updatePlayerHit(dt) {
    this._elapsed += dt;
    if (this._elapsed >= P_HIT_MS) {
      if (this._playerHp <= 0) {
        this._phase = 'player_dead'; this._elapsed = 0;
      } else {
        this._sequence = this._buildSeq();
        this._seqIdx   = 0;
        this._results  = [];
        this._phase = 'signing'; this._elapsed = 0;
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────
  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.fillRect(0, 0, W, H);

    // 우측 어둠 그라데이션 (적 가시성 향상)
    const rg = ctx.createLinearGradient(W * 0.52, 0, W, 0);
    rg.addColorStop(0,    'rgba(0,0,0,0)');
    rg.addColorStop(0.3,  'rgba(0,0,0,0.38)');
    rg.addColorStop(1,    'rgba(0,0,0,0.62)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    this._renderRoundLabel(W, H);
    this._renderEnemy(W, H);

    if (this._phase === 'signing') {
      this._renderTimeBar(W, H);
      this._renderHint(W, H);
    }

    if (this._phase === 'projectile') this._renderProjectile(H);
    if (this._feedback)               this._renderFeedback(W, H);

    const showSeqBar = !['dead', 'complete', 'charging', 'player_hit', 'player_dead'].includes(this._phase);
    if (showSeqBar) this._renderSeqBar(W, H);

    if (['dead', 'complete'].includes(this._phase)) this._renderVictory(W, H);

    // 플레이어 피격 빨간 플래시
    if (this._phase === 'player_hit') {
      const hitT = Math.min(1, this._elapsed / P_HIT_MS);
      ctx.save();
      ctx.fillStyle = `rgba(220,30,30,${0.55 * (1 - hitT)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 플레이어 패배 오버레이
    if (this._phase === 'player_dead') {
      const t = Math.min(1, this._elapsed / 1800);
      ctx.save();
      ctx.globalAlpha  = Math.min(1, t * 2);
      ctx.font         = `bold ${Math.floor(H * 0.062)}px 'Mulmaru', sans-serif`;
      ctx.fillStyle    = '#FF4D4D';
      ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DEFEATED...', W / 2, H * 0.38);
      ctx.restore();
    }

    this._renderPlayerHP(W, H);
    this._renderHands(handState, W, H);
  }

  // ── Round 라벨 ──────────────────────────────────────────────
  _renderRoundLabel(W, H) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font      = `${Math.floor(H * 0.016)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle = 'rgba(245,230,195,0.5)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`파동 ${this._wave + 1} / ${ENEMY_MAX_HP}`, W * 0.03, H * 0.04);
    ctx.restore();
  }

  // ── 적 캐릭터 ───────────────────────────────────────────────
  _renderEnemy(W, H) {
    const ctx        = this.ctx;
    const ecBase     = this._ec(W, H);
    const isDead     = ['dead', 'complete'].includes(this._phase);
    const isHurt     = this._phase === 'impact';
    const isCharging = this._phase === 'charging';
    const isHitting  = this._phase === 'player_hit';

    let img;
    if (isDead)                  img = this._assets['enemy_dead'] ?? this._assets['enemy_idle'];
    else if (isHurt || isHitting) img = this._assets['enemy_hurt'] ?? this._assets['enemy_idle'];
    else                          img = this._assets['enemy_idle'];
    if (!img?.complete || !img.naturalWidth) return;

    // 돌진 중 적 위치 계산
    const chargeTarget = { x: W * 0.38, y: ecBase.y };
    let ec = { ...ecBase };
    if (isCharging) {
      const tE = Math.pow(Math.min(1, this._elapsed / CHARGE_MS), 2);  // ease-in
      ec.x = ecBase.x + (chargeTarget.x - ecBase.x) * tE;
    } else if (isHitting) {
      const tE = Math.min(1, this._elapsed / P_HIT_MS);
      ec.x = chargeTarget.x + (ecBase.x - chargeTarget.x) * tE;       // 복귀
    }

    const imgH  = Math.min(H * 0.56, W * 0.40);
    const imgW  = imgH * (img.naturalWidth / img.naturalHeight);
    const drawX = ec.x - imgW / 2;
    const drawY = ec.y - imgH * 0.78;

    const deadT   = isDead ? Math.min(1, this._elapsed / DEAD_MS) : 0;
    const breathe = (isDead || isHurt || isCharging || isHitting)
                    ? 0 : Math.sin(performance.now() * 0.00225);

    ctx.save();

    if (isDead) {
      // 쓰러지면서 회전 + 페이드
      ctx.translate(ec.x, drawY + imgH);
      ctx.rotate(deadT * Math.PI * 0.45);
      ctx.globalAlpha = Math.max(0, 1 - deadT * 0.9);
      ctx.translate(-ec.x, -(drawY + imgH));
      ctx.translate(0, deadT * H * 0.18);
    } else if (!isHurt && !isCharging && !isHitting) {
      ctx.translate(0, breathe * imgH * 0.018);
    }

    ctx.drawImage(img, drawX, drawY, imgW, imgH);
    ctx.restore();

    // HP 오브 (적)
    if (!isDead) {
      this._drawHPOrbs(ctx, ecBase.x, drawY - 18, this._enemyHp, ENEMY_MAX_HP);
    }

    // 임팩트 팝 링
    if (isHurt && this._impactPop > 0) {
      ctx.save();
      const r = imgH * 0.28 + imgH * 0.35 * this._impactPop;
      ctx.globalAlpha = (1 - this._impactPop) * 0.8;
      ctx.strokeStyle = '#FF4444';
      ctx.lineWidth   = 5 * (1 - this._impactPop);
      ctx.beginPath(); ctx.arc(ec.x, ec.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }


  _drawHPOrbs(ctx, cx, cy, hp, maxHp) {
    const full_img  = this._assets['hp_full'];
    const empty_img = this._assets['hp_empty'];
    const ref       = full_img ?? empty_img;
    const ih        = 28;
    const iw        = ref ? ih * (ref.naturalWidth / ref.naturalHeight) : ih;
    const gap       = iw * 0.25;
    const totalW    = maxHp * iw + (maxHp - 1) * gap;
    let x = cx - totalW / 2;

    for (let i = 0; i < maxHp; i++) {
      const img = i < hp ? full_img : empty_img;
      if (img?.complete && img.naturalWidth) {
        ctx.drawImage(img, x, cy - ih / 2, iw, ih);
      } else {
        ctx.save();
        ctx.fillStyle = i < hp ? '#FF3B3B' : 'rgba(60,10,10,0.45)';
        ctx.beginPath(); ctx.arc(x + iw / 2, cy, ih / 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      x += iw + gap;
    }

    ctx.save();
    ctx.font      = `${Math.floor(ih * 0.55)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle = 'rgba(245,230,195,0.55)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('HP', cx, cy - ih / 2 - 4);
    ctx.restore();
  }

  _renderPlayerHP(W, H) {
    const ctx       = this.ctx;
    const full_img  = this._assets['hp_full'];
    const empty_img = this._assets['hp_empty'];
    const ref       = full_img ?? empty_img;
    const N         = PLAYER_MAX_HP;
    const hp        = this._playerHp;
    const ih        = 32;
    const iw        = ref ? ih * (ref.naturalWidth / ref.naturalHeight) : ih;
    const gap       = iw * 0.25;
    const totalW    = N * iw + (N - 1) * gap;
    const hudH      = 72 + 10;
    const startX    = W - 24 - totalW;
    const startY    = H - hudH - ih - 28;

    // 라벨
    ctx.save();
    ctx.font         = `${Math.floor(H * 0.014)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = 'rgba(245,230,195,0.55)';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('PLAYER HP', W - 24, startY - 4);
    ctx.restore();

    // 하트 아이콘
    for (let i = 0; i < N; i++) {
      const img = i < hp ? full_img : empty_img;
      const x   = startX + i * (iw + gap);
      if (img?.complete && img.naturalWidth) {
        ctx.drawImage(img, x, startY, iw, ih);
      } else {
        ctx.save();
        ctx.fillStyle = i < hp ? '#FF3B3B' : '#333';
        ctx.beginPath(); ctx.arc(x + iw / 2, startY + ih / 2, ih / 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  // ── 투사체 ──────────────────────────────────────────────────
  _renderProjectile(H) {
    const ctx = this.ctx;
    const t   = Math.min(1, this._elapsed / PROJ_MS);
    const sx  = this._projStart.x, sy = this._projStart.y;
    const ex  = this._projEnd.x,   ey = this._projEnd.y;
    const arc = H * 0.14;

    const px = sx + (ex - sx) * t;
    const py = sy + (ey - sy) * t - arc * Math.sin(Math.PI * t);

    // 꼬리 (shadow 없이 alpha만으로 표현)
    for (let i = 1; i <= 6; i++) {
      const ti = Math.max(0, t - i * 0.055);
      const tx = sx + (ex - sx) * ti;
      const ty = sy + (ey - sy) * ti - arc * Math.sin(Math.PI * ti);
      ctx.save();
      ctx.globalAlpha = (1 - i / 7) * 0.45;
      ctx.fillStyle   = '#A855F7';
      ctx.beginPath(); ctx.arc(tx, ty, Math.max(3, (7 - i) * 2.2), 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // 메인 오브 (glow는 큰 반투명 원으로 대체)
    ctx.save();
    ctx.fillStyle   = 'rgba(124,58,237,0.35)';
    ctx.beginPath(); ctx.arc(px, py, 26, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle   = '#C084FC';
    ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle   = '#E9D5FF';
    ctx.beginPath(); ctx.arc(px - 4, py - 4, 6, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── 타임바 ──────────────────────────────────────────────────
  _renderTimeBar(W, H) {
    const ctx  = this.ctx;
    const prog = 1 - Math.min(1, this._elapsed / TIME_LIMIT_MS);
    const bw   = W * 0.36, bh = 7;
    const bx   = W * 0.03,  by = H * 0.128;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    this._rrect(ctx, bx, by, bw, bh, 4); ctx.fill();
    const color = prog > 0.35 ? '#FFB800' : '#FF4D4D';
    ctx.fillStyle = color;
    this._rrect(ctx, bx, by, bw * prog, bh, 4); ctx.fill();
    ctx.restore();
  }

  // ── 현재 동작 힌트 ──────────────────────────────────────────
  _renderHint(W, H) {
    const ctx  = this.ctx;
    const sign = this._sequence[this._seqIdx];
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.004);
    ctx.save();
    ctx.globalAlpha  = pulse;
    ctx.font         = `bold ${Math.floor(H * 0.021)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = '#F5E6C3';
    ctx.textAlign    = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`▶ ${SIGN_LABEL[sign]}`, W * 0.03, H * 0.16);
    ctx.restore();
  }

  // ── 판정 피드백 ─────────────────────────────────────────────
  _renderFeedback(W, H) {
    const ctx = this.ctx;
    const { type, ms } = this._feedback;
    const s     = FB_STYLE[type];
    const t     = Math.min(1, ms / 500);
    const alpha = Math.max(0, 1 - Math.max(0, t - 0.5) / 0.5);
    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.font         = `bold ${Math.floor(H * 0.055)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = s.color;
    ctx.textAlign    = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s.text, W * 0.03, H * 0.36);
    ctx.restore();

    // +pts 팝업 (miss 제외)
    if (type !== 'miss') {
      const pts    = PTS[type];
      const rise   = t * H * 0.1;
      const pAlpha = Math.max(0, 1 - t * 1.2);
      this._drawScoreNum(ctx, `+${pts}`, W * 0.12, H * 0.44 - rise, H * 0.065, pAlpha, s.color);
    }
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
        const thick = digitH * 0.13;
        ctx.fillStyle = c === '+' ? plusColor : '#FF4D4D';
        ctx.fillRect(x + (w - thick) / 2, cy - digitH * 0.32, thick, digitH * 0.64);
        if (c === '+') ctx.fillRect(x + w * 0.08, cy - thick / 2, w * 0.84, thick);
      }
      x += w + gap;
    });
    ctx.restore();
  }

  // ── 승리 텍스트 ─────────────────────────────────────────────
  _renderVictory(W, H) {
    const ctx = this.ctx;
    const t   = Math.min(1, this._elapsed / 800);
    ctx.save();
    ctx.globalAlpha  = t;
    ctx.font         = `bold ${Math.floor(H * 0.06)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = '#FFB800';
    ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ENEMY DEFEATED!', W / 2, H * 0.38);
    ctx.restore();
  }

  // ── 하단 시퀀스 카드 바 ──────────────────────────────────────
  _renderSeqBar(W, H) {
    const ctx = this.ctx;
    const N   = this._sequence.length;

    const cardW  = Math.min(H * 0.195, W * 0.152);
    const cardH  = cardW * 1.22;
    const arrowW = cardW * 0.42;
    const totalW = N * cardW + (N - 1) * arrowW;
    const startX = W / 2 - totalW / 2;
    const hudH   = 72 + 14;
    const cardY  = H - cardH - hudH;

    // 라벨
    ctx.save();
    ctx.font      = `${Math.floor(H * 0.014)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle = 'rgba(245,230,195,0.45)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('필요한 핸드사인', W / 2, cardY - 8);
    ctx.restore();

    for (let i = 0; i < N; i++) {
      const sign = this._sequence[i];
      const cx   = startX + i * (cardW + arrowW);

      const seqCompleted = ['seq_done','projectile','impact'].includes(this._phase);
      const done = i < this._seqIdx || (seqCompleted);
      const curr = i === this._seqIdx && this._phase === 'signing';

      this._drawCard(ctx, cx, cardY, cardW, cardH, sign, done, curr);

      if (i < N - 1) {
        ctx.save();
        ctx.font      = `bold ${Math.floor(arrowW * 0.68)}px 'Mulmaru', sans-serif`;
        ctx.fillStyle = done ? '#B87820' : 'rgba(184,120,32,0.30)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('→', cx + cardW + arrowW * 0.5, cardY + cardH * 0.44);
        ctx.restore();
      }
    }
  }

  _drawCard(ctx, x, y, w, h, sign, done, curr) {
    const cx    = x + w / 2;
    const cy    = y + h / 2;
    const alpha = done ? 0.42 : curr ? 1.0 : 0.62;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 프레임 배경
    const frame = this._assets.frame;
    if (frame) {
      ctx.drawImage(frame, x, y, w, h);
    } else {
      ctx.fillStyle   = done ? '#0F0C06' : curr ? '#1E1508' : '#15100A';
      this._rrect(ctx, x, y, w, h, 9); ctx.fill();
      ctx.strokeStyle = curr ? '#C8921A' : done ? 'rgba(74,222,128,0.25)' : '#3D2E14';
      ctx.lineWidth   = curr ? 2.5 : 1.5;
      this._rrect(ctx, x, y, w, h, 9); ctx.stroke();
    }

    // 핸드사인 (중앙보다 살짝 위)
    const signImg  = this._assets[`sign_${sign}`];
    const signMaxW = w * 0.74;
    const signMaxH = h * 0.40;
    const signCy   = cy - h * 0.10;
    if (signImg) {
      const r = signImg.width / signImg.height;
      let dw = signMaxW, dh = dw / r;
      if (dh > signMaxH) { dh = signMaxH; dw = dh * r; }
      ctx.drawImage(signImg, cx - dw / 2, signCy - dh / 2, dw, dh);
    }

    // 속성 이미지 (핸드사인보다 살짝 아래)
    const elemImg  = this._assets[`elem_${sign}`];
    const elemMaxW = w * 0.54;
    const elemMaxH = h * 0.26;
    const elemCy   = cy + h * 0.22;
    if (elemImg) {
      const r = elemImg.width / elemImg.height;
      let dw = elemMaxW, dh = dw / r;
      if (dh > elemMaxH) { dh = elemMaxH; dw = dh * r; }
      ctx.drawImage(elemImg, cx - dw / 2, elemCy - dh / 2, dw, dh);
    }

    ctx.restore();

    // 완료 배지 (항상 불투명)
    if (done) {
      const cr = w * 0.165, bx = x + w - cr * 0.55, by = y + cr * 0.55;
      ctx.save();
      ctx.fillStyle = '#050E05'; ctx.strokeStyle = '#4ADE80'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4ADE80';
      ctx.font      = `bold ${Math.floor(cr * 1.25)}px 'Mulmaru', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✓', bx, by + 1);
      ctx.restore();
    }
  }

  // ── 손 랜드마크 ─────────────────────────────────────────────
  _renderHands(handState, W, H) {
    const lms = handState.landmarks;
    if (!lms?.length || !this.video.videoWidth) return;
    const ctx   = this.ctx, video = this.video;
    const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
    const ox    = (W - video.videoWidth  * scale) / 2;
    const oy    = (H - video.videoHeight * scale) / 2;
    const lx    = lm => (1 - lm.x) * video.videoWidth  * scale + ox;
    const ly    = lm => lm.y        * video.videoHeight * scale + oy;

    lms.forEach(hand => {
      ctx.beginPath();
      HAND_CONNECTIONS.forEach(([a, b]) => {
        ctx.moveTo(lx(hand[a]), ly(hand[a]));
        ctx.lineTo(lx(hand[b]), ly(hand[b]));
      });
      ctx.strokeStyle = 'rgba(255,184,0,0.75)';
      ctx.lineWidth   = 2;
      ctx.stroke();

      ctx.beginPath();
      hand.forEach((lm, i) => {
        if (i !== 0) { ctx.moveTo(lx(lm) + 4, ly(lm)); ctx.arc(lx(lm), ly(lm), 4, 0, Math.PI * 2); }
      });
      ctx.fillStyle   = 'rgba(255,184,0,0.85)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1;
      ctx.fill(); ctx.stroke();

      ctx.beginPath();
      ctx.arc(lx(hand[0]), ly(hand[0]), 6, 0, Math.PI * 2);
      ctx.fillStyle = '#FFB800';
      ctx.fill(); ctx.stroke();
    });
  }

  _rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }
}
