import { Round3ResultScene }             from './Round3ResultScene.js';
import { KakashiDialogueScene, r3Pages } from './KakashiDialogueScene.js';

const SIGN_LABEL = {
  boar: '돼지 (亥)', rabbit: '토끼 (卯)', rat: '쥐 (子)',
  monkey: '원숭이 (申)', dog: '개 (戌)', snake: '뱀 (巳)',
};

// 5대 필살기 — 한 판에서 중복 없이 랜덤 소환
const SPELLS = [
  {
    id: 'storm', name: '폭풍 소환',
    signs: ['rabbit', 'rat', 'rabbit', 'dog', 'rat', 'rabbit', 'rat'],
    glow: '#7CD8FF',
  },
  {
    id: 'volcano', name: '대지 용암 폭발',
    signs: ['boar', 'monkey', 'boar', 'monkey', 'monkey', 'boar'],
    glow: '#FF6E1E',
  },
  {
    id: 'jungle', name: '정글 결계',
    signs: ['snake', 'dog', 'boar', 'snake', 'snake', 'dog'],
    glow: '#50DC78',
  },
  {
    id: 'rainstorm', name: '감전 폭우',
    signs: ['dog', 'dog', 'rat', 'rat', 'dog', 'rat'],
    glow: '#FFE066',
  },
  {
    id: 'typhoon', name: '겁화 태풍',
    signs: ['monkey', 'rabbit', 'monkey', 'rat', 'boar', 'monkey', 'rabbit'],
    glow: '#FFD23F',
  },
];

const ENEMY_MAX_HP  = 3;   // 3대 맞으면 사망
const TIME_LIMIT_MS = 5000;
const FAST_MS       = 1500;
const CONFIRM_MS    = 150;
const SIGN_CD_MS    = 380;
const SEQ_DONE_MS   = 500;  // 시퀀스 완료 후 잠깐 체크마크 보여주는 시간
const GATHER_MS     = 750;  // 손에서 이펙트가 모이며 커지는 시간
const PROJ_MS       = 650;  // 투사체 이동 시간
const IMPACT_MS     = 750;  // 임팩트(적이 휩쓸리는 연출) 지속
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

    this._enemyHp    = ENEMY_MAX_HP;
    this._wave       = 0;
    this._usedSpells = new Set();
    this._spell      = this._pickSpell();
    this._sequence   = this._spell.signs;
    this._seqIdx     = 0;
    this._results    = [];   // 현재 시퀀스 각 사인 결과
    this._clearedWaveMax = 0;  // 성적표용 — 실제로 클리어한 파동들의 최고점 합

    // phases: 'signing' | 'sign_cd' | 'seq_done' | 'gather' | 'projectile' | 'impact' | 'dead' | 'complete'
    this._phase   = 'signing';
    this._elapsed = 0;
    this._matchMs = 0;

    this._projStart   = { x: 0, y: 0 };
    this._projEnd     = { x: 0, y: 0 };
    this._gatherPos   = null;   // 충전 중 실시간 추적되는 손 위치
    this._impactPop   = 0;   // 0→1 크기 팝 애니메이션
    this._feedback    = null;
    this._assets      = {};
    this._playerHp    = PLAYER_MAX_HP;
    this._particles   = [];
    this._screenFlash = 0;
  }

  init() {
    ['sign_boar:assets/handsigns/ground.png',
     'sign_rabbit:assets/handsigns/wind.png',
     'sign_rat:assets/handsigns/elec.png',
     // 실측 결과 monkey/snake는 fire.png/grass.png가 서로 바뀐 포즈라 교체
     'sign_monkey:assets/handsigns/grass.png',
     'sign_dog:assets/handsigns/water.png',
     'sign_snake:assets/handsigns/fire.png',
     'elem_boar:assets/element/ground.png',
     'elem_rabbit:assets/element/wind.png',
     'elem_rat:assets/element/elec.png',
     'elem_monkey:assets/element/fire.png',
     'elem_dog:assets/element/water.png',
     'elem_snake:assets/element/grass.png',
     'frame:assets/ui/frame_focused.png',
     'enemy_idle:assets/enemies/enemy.png',
     'enemy_hurt:assets/enemies/enemy_attacted.png',
     'hp_full:assets/enemies/fullheart.png',
     'hp_empty:assets/enemies/emptyheart.png',
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

  // 5개 필살기 중 이번 판에서 아직 안 나온 것을 랜덤으로 선택 (다 나오면 초기화)
  _pickSpell() {
    if (this._usedSpells.size >= SPELLS.length) this._usedSpells.clear();
    let idx;
    do { idx = Math.floor(Math.random() * SPELLS.length); } while (this._usedSpells.has(idx));
    this._usedSpells.add(idx);
    return SPELLS[idx];
  }

  _nextSpell() {
    this._spell     = this._pickSpell();
    this._sequence  = this._spell.signs;
    this._seqIdx    = 0;
    this._results   = [];
    this._particles = [];
  }

  // 성적표에 넘길 라운드3 점수 스냅샷 후 결과 화면으로 이동
  // (미스로 인한 재도전은 세지 않고, 실제로 클리어했거나 지금 진행 중인
  //  파동의 시퀀스 길이만 최고점에 반영한다 — 재시도 횟수로 최고점이 부풀지 않도록)
  _goToResult(cleared) {
    const rs = this.manager.roundScores;
    rs.r3 = this.manager.score - rs.r1 - rs.r2;

    if (cleared) {
      rs.r3Max = this._clearedWaveMax + KILL_BONUS;
    } else {
      const currentWaveMax = this._spell.signs.length * 100 + SEQ_BONUS;
      const remainingWaves = Math.max(0, ENEMY_MAX_HP - this._wave - 1);
      rs.r3Max = this._clearedWaveMax + currentWaveMax + remainingWaves * (6 * 100 + SEQ_BONUS) + KILL_BONUS;
    }

    rs.cleared = cleared;
    this.manager.goto(KakashiDialogueScene, Round3ResultScene, r3Pages);
  }

  _ec(W, H) { return { x: W * 0.80, y: H * 0.50 }; }  // 적 중심
  _pc(W, H) { return { x: W * 0.26, y: H * 0.48 }; }  // 손이 안 보일 때 쓰는 폴백 시작점

  // 화면상 손(들)의 평균 위치 — arEffectEngine._palmCenter와 동일한 방식
  _computeHandPos(handState) {
    const lms = handState?.landmarks;
    if (!lms?.length || !this.video.videoWidth) return null;
    const W = this.canvas.width, H = this.canvas.height;
    const video = this.video;
    const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
    const ox = (W - video.videoWidth  * scale) / 2;
    const oy = (H - video.videoHeight * scale) / 2;
    const lx = lm => (1 - lm.x) * video.videoWidth  * scale + ox;
    const ly = lm => lm.y        * video.videoHeight * scale + oy;

    let sx = 0, sy = 0, n = 0;
    lms.forEach(hand => {
      const pts = [0, 5, 9, 13, 17].map(i => hand[i]);
      sx += pts.reduce((s, p) => s + lx(p), 0) / pts.length;
      sy += pts.reduce((s, p) => s + ly(p), 0) / pts.length;
      n++;
    });
    return n > 0 ? { x: sx / n, y: sy / n } : null;
  }

  // ── Update ───────────────────────────────────────────────────
  update(dt, handState) {
    this._tickParticles(dt);
    if (this._screenFlash > 0) this._screenFlash = Math.max(0, this._screenFlash - dt / 300);

    if (this._feedback) {
      this._feedback.ms += dt;
      if (this._feedback.ms >= 520) this._feedback = null;
    }

    switch (this._phase) {
      case 'signing':    this._updateSigning(dt, handState); break;
      case 'sign_cd':    this._updateSignCd(dt);             break;
      case 'seq_done':   this._updateSeqDone(dt);            break;
      case 'gather':     this._updateGather(dt, handState);  break;
      case 'projectile': this._updateProjectile(dt);         break;
      case 'impact':     this._updateImpact(dt);             break;
      case 'dead':       this._updateDead(dt);               break;
      case 'charging':   this._updateCharging(dt);           break;
      case 'player_hit': this._updatePlayerHit(dt);         break;
      case 'player_dead':
        this._elapsed += dt;
        if (this._elapsed >= 1800) this._goToResult(false);
        break;
      case 'complete':
        this._elapsed += dt;
        if (this._elapsed >= COMPLETE_MS) this._goToResult(true);
        break;
    }
  }

  _updateSigning(dt, handState) {
    this._elapsed += dt;
    const target  = this._sequence[this._seqIdx];
    const matched = handState.masterKey || (handState.gesture === target && handState.confidence >= 40);
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
      this._phase = 'gather'; this._elapsed = 0;
    }
  }

  // 손 위치에서 이펙트가 모이며 점점 커지는 충전 단계
  _updateGather(dt, handState) {
    this._elapsed += dt;
    const hp = this._computeHandPos(handState);
    if (hp) this._gatherPos = hp;   // 계속 손을 따라감
    this._spawnGather();

    if (this._elapsed >= GATHER_MS) {
      const W = this.canvas.width, H = this.canvas.height;
      this._projStart = { ...(this._gatherPos ?? this._pc(W, H)) };
      this._projEnd   = { ...this._ec(W, H) };
      this._phase = 'projectile'; this._elapsed = 0;
    }
  }

  _updateProjectile(dt) {
    this._elapsed += dt;
    this._spawnTravel();
    if (this._elapsed >= PROJ_MS) {
      this._enemyHp--;
      this._impactPop = 0;
      this._spawnImpactBurst();
      this._phase = 'impact'; this._elapsed = 0;
    }
  }

  _updateImpact(dt) {
    this._elapsed += dt;
    this._impactPop = Math.min(1, this._elapsed / (IMPACT_MS * 0.3));
    if (this._elapsed >= IMPACT_MS) {
      this._clearedWaveMax += this._spell.signs.length * 100 + SEQ_BONUS;
      if (this._enemyHp <= 0) {
        this._phase = 'dead'; this._elapsed = 0;
      } else {
        this._wave++;
        this._nextSpell();
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
        this._nextSpell();
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

    if (this._phase === 'seq_done')   this._renderSpellBanner(W, H);
    if (this._phase === 'gather')     this._renderGatherEffect(W, H);
    if (this._phase === 'projectile') this._renderSpellEffect(H);
    if (this._phase === 'impact')     this._renderEngulf(W, H);
    this._drawParticles(ctx);
    if (this._feedback)               this._renderFeedback(W, H);

    const showSeqBar = !['dead', 'complete', 'charging', 'player_hit', 'player_dead'].includes(this._phase);
    if (showSeqBar) this._renderSeqBar(W, H);

    if (['dead', 'complete'].includes(this._phase)) this._renderVictory(W, H);

    // 임팩트 화면 플래시 (필살기별 색상)
    if (this._screenFlash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45 * this._screenFlash;
      ctx.fillStyle   = this._spell.glow;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

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

    ctx.save();
    ctx.font      = `bold ${Math.floor(H * 0.017)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle = this._spell.glow;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(this._spell.name, W * 0.03, H * 0.075);
    ctx.restore();
  }

  // ── 필살기 이름 배너 (시퀀스 완성 직후) ─────────────────────
  _renderSpellBanner(W, H) {
    const ctx = this.ctx;
    const t     = Math.min(1, this._elapsed / SEQ_DONE_MS);
    const alpha = t < 0.7 ? t / 0.7 : (1 - t) / 0.3;
    ctx.save();
    ctx.globalAlpha  = Math.max(0, alpha);
    ctx.font         = `bold ${Math.floor(H * 0.05)}px 'Mulmaru', sans-serif`;
    ctx.fillStyle    = this._spell.glow;
    ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowBlur   = 18; ctx.shadowColor = this._spell.glow;
    ctx.fillText(this._spell.name, W / 2, H * 0.30);
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
    } else if (isHurt) {
      // 피격 넉백 흔들림 (시간이 지날수록 잦아듦)
      const shakeT = 1 - this._impactPop;
      ec.x += Math.sin(this._elapsed * 0.09) * 10 * shakeT;
      ec.y += Math.cos(this._elapsed * 0.07) * 4  * shakeT;
    }

    const imgH  = Math.min(H * 0.56, W * 0.40);
    const imgW  = imgH * (img.naturalWidth / img.naturalHeight);
    const drawX = ec.x - imgW / 2;
    const drawY = ec.y - imgH * 0.78;

    const deadT   = isDead ? Math.min(1, this._elapsed / DEAD_MS) : 0;
    const breathe = (isDead || isHurt || isCharging || isHitting)
                    ? 0 : Math.sin(performance.now() * 0.00225);

    // _renderEngulf에서 동일한 위치/크기를 쓸 수 있도록 저장
    this._enemyBox = { cx: ec.x, cy: drawY + imgH * 0.5, h: imgH };

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
      ctx.strokeStyle = this._spell.glow;
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

  // ── 충전 (손에서 이펙트가 모이며 점점 커짐) ───────────────────
  _renderGatherEffect(W, H) {
    const p = this._gatherPos ?? this._pc(W, H);
    const t = Math.min(1, this._elapsed / GATHER_MS);
    switch (this._spell.id) {
      case 'storm':     this._fxGatherStorm(p.x, p.y, t, H);     break;
      case 'volcano':   this._fxGatherVolcano(p.x, p.y, t, H);   break;
      case 'jungle':    this._fxGatherJungle(p.x, p.y, t, H);    break;
      case 'rainstorm': this._fxGatherRainstorm(p.x, p.y, t, H); break;
      case 'typhoon':   this._fxGatherTyphoon(p.x, p.y, t, H);   break;
    }
  }

  _fxGatherStorm(x, y, t, H) {
    const ctx = this.ctx;
    const r   = H * (0.035 + 0.22 * t);
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.7);
    glow.addColorStop(0,   `rgba(255,255,255,${0.55 + 0.4 * t})`);
    glow.addColorStop(0.5, `rgba(150,220,255,${0.45 * t})`);
    glow.addColorStop(1,   'rgba(80,160,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill();

    ctx.translate(x, y);
    ctx.rotate(this._elapsed * (0.02 + 0.05 * t));
    ctx.strokeStyle = `rgba(180,230,255,${0.55 + 0.4 * t})`;
    ctx.lineWidth   = (4 + 5 * t) * (H / 720);
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * Math.PI * 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.85, r * 0.32, 0, 0, Math.PI * 1.6);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  _fxGatherVolcano(x, y, t, H) {
    const ctx = this.ctx;
    const r   = H * (0.03 + 0.20 * t);
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    glow.addColorStop(0,    `rgba(255,220,140,${0.55 + 0.4 * t})`);
    glow.addColorStop(0.4,  `rgba(255,110,30,${0.55 * t})`);
    glow.addColorStop(1,    'rgba(140,20,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = `rgba(58,14,0,${0.6 + 0.3 * t})`;
    ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,200,80,${0.6 + 0.3 * t})`;
    ctx.lineWidth = 3 * (H / 720);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + this._elapsed * 0.006;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2);
      ctx.lineTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
      ctx.stroke();
    }
    ctx.restore();
  }

  _fxGatherJungle(x, y, t, H) {
    const ctx = this.ctx;
    const r   = H * (0.03 + 0.19 * t);
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    glow.addColorStop(0,   `rgba(200,255,190,${0.55 + 0.35 * t})`);
    glow.addColorStop(0.5, `rgba(70,200,100,${0.45 * t})`);
    glow.addColorStop(1,   'rgba(20,90,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = `rgba(70,170,80,${0.65 + 0.3 * t})`;
    ctx.lineWidth   = 5 * (H / 720); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a  = (i / 28) * Math.PI * 4 + this._elapsed * 0.01;
      const rr = r * (0.15 + (i / 28) * 0.9);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  _fxGatherRainstorm(x, y, t, H) {
    const ctx = this.ctx;
    const r   = H * (0.03 + 0.20 * t);
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    glow.addColorStop(0,   `rgba(220,240,255,${0.55 + 0.4 * t})`);
    glow.addColorStop(0.5, `rgba(90,160,255,${0.45 * t})`);
    glow.addColorStop(1,   'rgba(20,60,160,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(190,227,255,${0.6 + 0.3 * t})`;
    ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (Math.random() < 0.35 + 0.4 * t) {
      const a = Math.random() * Math.PI * 2;
      this._drawArc(x, y, a, r * (0.6 + Math.random() * 0.5), 'rgba(255,240,130,0.9)');
    }
  }

  _fxGatherTyphoon(x, y, t, H) {
    const ctx = this.ctx;
    const r   = H * (0.045 + 0.30 * t);
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    glow.addColorStop(0,    `rgba(255,240,200,${0.6 + 0.4 * t})`);
    glow.addColorStop(0.35, `rgba(255,110,30,${0.55 * t})`);
    glow.addColorStop(1,    'rgba(120,10,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();

    ctx.translate(x, y);
    ctx.rotate(this._elapsed * (0.03 + 0.06 * t));
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * Math.PI * 2);
      const grad = ctx.createLinearGradient(0, 0, r * 0.9, 0);
      grad.addColorStop(0, `rgba(255,180,60,${0.6 + 0.4 * t})`);
      grad.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth   = (6 + 5 * t) * (H / 720); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 1.3); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // 충전 중 손 주변에서 매 프레임 스폰
  _spawnGather() {
    const p = this._gatherPos;
    if (!p) return;
    const { x, y } = p;

    switch (this._spell.id) {
      case 'storm':
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 30 + Math.random() * 60;
          this._emit({
            x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
            vx: -Math.cos(a) * 3, vy: -Math.sin(a) * 3,
            r: 3 + Math.random() * 4, life: 1, decay: 0.035,
            type: 'streak', color: '160,220,255',
          });
        }
        break;
      case 'volcano':
        for (let i = 0; i < 4; i++) {
          this._emit({
            x: x + (Math.random() - 0.5) * 70, y: y + (Math.random() - 0.5) * 70,
            vx: (Math.random() - 0.5) * 1.5, vy: -0.6 - Math.random() * 1.5,
            r: 6 + Math.random() * 7, life: 1, decay: 0.03,
            type: 'ember', color: '255,120,30',
          });
        }
        break;
      case 'jungle':
        for (let i = 0; i < 4; i++) {
          this._emit({
            x: x + (Math.random() - 0.5) * 80, y: y + (Math.random() - 0.5) * 80,
            vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5,
            rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.25,
            r: 6 + Math.random() * 6, life: 1, decay: 0.025,
            type: 'leaf', color: '90,210,110',
          });
        }
        break;
      case 'rainstorm':
        for (let i = 0; i < 4; i++) {
          this._emit({
            x: x + (Math.random() - 0.5) * 70, y: y - 40 - Math.random() * 30,
            vx: 0, vy: 5 + Math.random() * 2, len: 16 + Math.random() * 8,
            r: 3, life: 1, decay: 0.04,
            type: 'drop', color: '110,180,255',
          });
        }
        break;
      case 'typhoon':
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 24 + Math.random() * 80;
          this._emit({
            x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
            vx: -Math.cos(a) * 3.5, vy: -Math.sin(a) * 3.5 - 0.6,
            r: 6 + Math.random() * 7, life: 1, decay: 0.028,
            type: 'ember', color: '255,90,20',
          });
        }
        break;
    }
  }

  // ── 투사체 (필살기별 전용 이펙트) ─────────────────────────────
  _coreProjPos(H) {
    const t   = Math.min(1, this._elapsed / PROJ_MS);
    const sx  = this._projStart.x, sy = this._projStart.y;
    const ex  = this._projEnd.x,   ey = this._projEnd.y;
    const arc = H * 0.14;
    return {
      t,
      x: sx + (ex - sx) * t,
      y: sy + (ey - sy) * t - arc * Math.sin(Math.PI * t),
    };
  }

  _renderSpellEffect(H) {
    const { x: px, y: py } = this._coreProjPos(H);
    switch (this._spell.id) {
      case 'storm':     this._fxCoreStorm(px, py, H);     break;
      case 'volcano':   this._fxCoreVolcano(px, py, H);   break;
      case 'jungle':    this._fxCoreJungle(px, py, H);    break;
      case 'rainstorm': this._fxCoreRainstorm(px, py, H); break;
      case 'typhoon':   this._fxCoreTyphoon(px, py, H);   break;
    }
  }

  // 잔가지처럼 뻗는 번개 선 (storm / rainstorm 공용)
  _drawArc(sx, sy, angle, length, strokeStyle) {
    const ctx   = this.ctx;
    const segs  = 4 + Math.floor(Math.random() * 3);
    const ex    = sx + Math.cos(angle) * length;
    const ey    = sy + Math.sin(angle) * length;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(sx, sy);
    for (let i = 1; i <= segs; i++) {
      const p = i / segs;
      ctx.lineTo(sx + (ex - sx) * p + (Math.random() - 0.5) * 10, sy + (ey - sy) * p + (Math.random() - 0.5) * 10);
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth   = 1.6;
    ctx.shadowBlur  = 8; ctx.shadowColor = strokeStyle;
    ctx.stroke();
    ctx.restore();
  }

  // 1. 폭풍 소환 — 바람 소용돌이 + 번개
  _fxCoreStorm(px, py, H) {
    const ctx = this.ctx;
    const R   = H * 0.19;
    ctx.save();
    const glow = ctx.createRadialGradient(px, py, 0, px, py, R);
    glow.addColorStop(0,   'rgba(255,255,255,0.95)');
    glow.addColorStop(0.4, 'rgba(150,220,255,0.6)');
    glow.addColorStop(1,   'rgba(80,160,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#EAF6FF';
    ctx.beginPath(); ctx.arc(px, py, R * 0.28, 0, Math.PI * 2); ctx.fill();

    ctx.translate(px, py);
    ctx.rotate(this._elapsed * 0.02);
    ctx.strokeStyle = 'rgba(180,230,255,0.85)';
    ctx.lineWidth   = H * 0.007;
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * Math.PI * 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.75, R * 0.28, 0, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      this._drawArc(px, py, a, R * (0.5 + Math.random() * 0.4), 'rgba(210,240,255,0.9)');
    }
  }

  // 2. 대지 용암 폭발 — 마그마 구체 + 균열
  _fxCoreVolcano(px, py, H) {
    const ctx = this.ctx;
    const R   = H * 0.17;
    ctx.save();
    const glow = ctx.createRadialGradient(px, py, 0, px, py, R);
    glow.addColorStop(0,    'rgba(255,220,140,0.95)');
    glow.addColorStop(0.35, 'rgba(255,110,30,0.8)');
    glow.addColorStop(1,    'rgba(140,20,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#3A0E00';
    ctx.beginPath(); ctx.arc(px, py, R * 0.42, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(255,200,80,0.9)';
    ctx.lineWidth   = H * 0.006;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + this._elapsed * 0.006;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a) * R * 0.14,  py + Math.sin(a) * R * 0.14);
      ctx.lineTo(px + Math.cos(a) * R * 0.4,   py + Math.sin(a) * R * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. 정글 결계 — 덩굴 나선
  _fxCoreJungle(px, py, H) {
    const ctx = this.ctx;
    const R   = H * 0.16;
    ctx.save();
    const glow = ctx.createRadialGradient(px, py, 0, px, py, R);
    glow.addColorStop(0,   'rgba(200,255,190,0.9)');
    glow.addColorStop(0.4, 'rgba(70,200,100,0.6)');
    glow.addColorStop(1,   'rgba(20,90,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#2F7A3E';
    ctx.beginPath(); ctx.arc(px, py, R * 0.35, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(70,170,80,0.9)';
    ctx.lineWidth   = H * 0.007; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const a = (i / 30) * Math.PI * 4 + this._elapsed * 0.01;
      const r = R * (0.2 + (i / 30) * 0.85);
      const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 4. 감전 폭우 — 물방울 구체 + 스파크
  _fxCoreRainstorm(px, py, H) {
    const ctx = this.ctx;
    const R   = H * 0.17;
    ctx.save();
    const glow = ctx.createRadialGradient(px, py, 0, px, py, R);
    glow.addColorStop(0,   'rgba(220,240,255,0.9)');
    glow.addColorStop(0.4, 'rgba(90,160,255,0.65)');
    glow.addColorStop(1,   'rgba(20,60,160,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#BEE3FF';
    ctx.beginPath(); ctx.arc(px, py, R * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        this._drawArc(px, py, a, R * (0.5 + Math.random() * 0.4), 'rgba(255,240,130,0.9)');
      }
    }
  }

  // 5. 겁화 태풍 — 화염 소용돌이 (최종기)
  _fxCoreTyphoon(px, py, H) {
    const ctx = this.ctx;
    const R   = H * 0.26;
    ctx.save();
    const glow = ctx.createRadialGradient(px, py, 0, px, py, R);
    glow.addColorStop(0,    'rgba(255,240,200,0.97)');
    glow.addColorStop(0.35, 'rgba(255,110,30,0.75)');
    glow.addColorStop(1,    'rgba(120,10,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();

    ctx.translate(px, py);
    ctx.rotate(this._elapsed * 0.03);
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * Math.PI * 2);
      const grad = ctx.createLinearGradient(0, 0, R * 0.68, 0);
      grad.addColorStop(0, 'rgba(255,180,60,0.95)');
      grad.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth   = H * 0.011; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.45, 0, Math.PI * 1.3); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.fillStyle = '#FFF4D6';
    ctx.beginPath(); ctx.arc(px, py, R * 0.27, 0, Math.PI * 2); ctx.fill();
  }

  // ── 파티클 시스템 (필살기별 궤적/임팩트 공용) ────────────────
  _emit(p) { this._particles.push(p); }

  _tickParticles(dt) {
    const k = Math.max(0.1, dt / 16.67);
    this._particles = this._particles.filter(p => p.life > 0);
    this._particles.forEach(p => {
      p.x += p.vx * k;
      p.y += p.vy * k;
      if (p.gravity) p.vy += p.gravity * k;
      if (p.vr) p.rot = (p.rot || 0) + p.vr * k;
      p.life -= p.decay * k;
    });
  }

  _drawParticles(ctx) {
    this._particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      switch (p.type) {
        case 'streak':
          ctx.strokeStyle = `rgba(${p.color},1)`;
          ctx.lineWidth   = p.r;
          ctx.lineCap     = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
          ctx.stroke();
          break;
        case 'spark':
          ctx.strokeStyle = `rgba(${p.color},1)`;
          ctx.lineWidth   = 1.8;
          ctx.shadowBlur  = 6; ctx.shadowColor = `rgba(${p.color},0.8)`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 4, p.y - p.vy * 4);
          ctx.stroke();
          break;
        case 'ember': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0,   'rgba(255,240,200,0.9)');
          g.addColorStop(0.4, `rgba(${p.color},0.8)`);
          g.addColorStop(1,   `rgba(${p.color},0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'leaf':
          ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
          ctx.fillStyle = `rgba(${p.color},1)`;
          ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
          break;
        case 'drop':
          ctx.strokeStyle = `rgba(${p.color},0.8)`;
          ctx.lineWidth   = p.r;
          ctx.lineCap     = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x, p.y - p.len);
          ctx.stroke();
          break;
        case 'smoke': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, `rgba(${p.color},0.35)`);
          g.addColorStop(1, `rgba(${p.color},0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'debris':
          ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
          ctx.fillStyle = `rgba(${p.color},1)`;
          ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
          break;
      }
      ctx.restore();
    });
  }

  // 궤적 이동 중 매 프레임 스폰
  _spawnTravel() {
    const { x: px, y: py, t } = this._coreProjPos(this.canvas.height);

    switch (this._spell.id) {
      case 'storm':
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2;
          this._emit({
            x: px + Math.cos(a) * 40, y: py + Math.sin(a) * 40,
            vx: Math.cos(a) * 4 - 6, vy: Math.sin(a) * 4,
            r: 3 + Math.random() * 3, life: 1, decay: 0.04,
            type: 'streak', color: '160,220,255',
          });
        }
        for (let i = 0; i < 3; i++) {
          this._emit({
            x: px + (Math.random() - 0.5) * 60, y: py + (Math.random() - 0.5) * 60,
            vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3,
            r: 3, life: 1, decay: 0.07,
            type: 'spark', color: '255,255,255',
          });
        }
        break;
      case 'volcano':
        for (let i = 0; i < 3; i++) {
          this._emit({
            x: px + (Math.random() - 0.5) * 34, y: py + (Math.random() - 0.5) * 34,
            vx: (Math.random() - 0.5) * 2, vy: 0.8 + Math.random() * 1.5,
            r: 6 + Math.random() * 6, life: 1, decay: 0.03,
            type: 'ember', color: '255,120,30',
          });
        }
        if (Math.random() < 0.7) {
          this._emit({
            x: px, y: py, vx: (Math.random() - 0.5) * 1.5, vy: -0.6 - Math.random(),
            r: 24 + Math.random() * 18, life: 1, decay: 0.015,
            type: 'smoke', color: '80,50,40',
          });
        }
        break;
      case 'jungle':
        for (let i = 0; i < 3; i++) {
          this._emit({
            x: px + (Math.random() - 0.5) * 46, y: py + (Math.random() - 0.5) * 46,
            vx: (Math.random() - 0.5) * 2.5, vy: (Math.random() - 0.5) * 2.5,
            rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.3,
            r: 7 + Math.random() * 6, life: 1, decay: 0.025,
            type: 'leaf', color: '90,210,110',
          });
        }
        break;
      case 'rainstorm':
        for (let i = 0; i < 3; i++) {
          this._emit({
            x: px + (Math.random() - 0.5) * 70, y: py - 40 - Math.random() * 30,
            vx: -1.5, vy: 8 + Math.random() * 3, len: 18 + Math.random() * 10,
            r: 3, life: 1, decay: 0.035,
            type: 'drop', color: '110,180,255',
          });
        }
        if (Math.random() < 0.6) {
          this._emit({
            x: px + (Math.random() - 0.5) * 50, y: py + (Math.random() - 0.5) * 50,
            vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
            r: 3, life: 1, decay: 0.06,
            type: 'spark', color: '255,230,80',
          });
        }
        break;
      case 'typhoon': {
        for (let i = 0; i < 4; i++) {
          const a = t * 30 + Math.random() * Math.PI * 2;
          this._emit({
            x: px + Math.cos(a) * 44, y: py + Math.sin(a) * 44,
            vx: Math.cos(a + Math.PI / 2) * 4, vy: Math.sin(a + Math.PI / 2) * 4 - 1.5,
            r: 8 + Math.random() * 7, life: 1, decay: 0.028,
            type: 'ember', color: '255,90,20',
          });
        }
        for (let i = 0; i < 3; i++) {
          this._emit({
            x: px + (Math.random() - 0.5) * 30, y: py + (Math.random() - 0.5) * 30,
            vx: (Math.random() - 0.5) * 5 - 4, vy: (Math.random() - 0.5) * 3,
            r: 3, life: 1, decay: 0.05,
            type: 'streak', color: '255,200,140',
          });
        }
        break;
      }
    }
  }

  // 명중 순간 한 번에 터지는 버스트
  _spawnImpactBurst() {
    const { x: px, y: py } = this._projEnd;

    switch (this._spell.id) {
      case 'storm':
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          const sp = 8 + Math.random() * 6;
          this._emit({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            r: 3 + Math.random() * 2, life: 1, decay: 0.03, type: 'spark', color: '190,230,255' });
        }
        for (let i = 0; i < 26; i++) {
          this._emit({ x: px, y: py, vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16,
            r: 4 + Math.random() * 3, life: 1, decay: 0.025, type: 'streak', color: '150,210,255' });
        }
        this._screenFlash = Math.max(this._screenFlash, 0.5);
        break;
      case 'volcano':
        for (let i = 0; i < 34; i++) {
          const a  = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
          const sp = 5 + Math.random() * 9;
          this._emit({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            r: 7 + Math.random() * 7, life: 1, decay: 0.02, type: 'ember', color: '255,110,20', gravity: 0.25 });
        }
        for (let i = 0; i < 16; i++) {
          this._emit({ x: px + (Math.random() - 0.5) * 60, y: py, vx: (Math.random() - 0.5) * 1.5, vy: -1.2 - Math.random() * 1.5,
            r: 32 + Math.random() * 28, life: 1, decay: 0.011, type: 'smoke', color: '60,40,35' });
        }
        for (let i = 0; i < 14; i++) {
          this._emit({ x: px, y: py, vx: (Math.random() - 0.5) * 10, vy: -3 - Math.random() * 4, gravity: 0.3,
            rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.4,
            r: 9 + Math.random() * 7, life: 1, decay: 0.02, type: 'debris', color: '120,70,40' });
        }
        this._screenFlash = Math.max(this._screenFlash, 0.55);
        break;
      case 'jungle':
        for (let i = 0; i < 44; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 3 + Math.random() * 4;
          this._emit({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
            rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.3,
            r: 9 + Math.random() * 7, life: 1, decay: 0.017, type: 'leaf', color: '90,210,110' });
        }
        this._screenFlash = Math.max(this._screenFlash, 0.4);
        break;
      case 'rainstorm':
        for (let i = 0; i < 46; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 4 + Math.random() * 5;
          this._emit({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            r: 3, life: 1, decay: 0.05, type: 'spark', color: '255,230,90' });
        }
        for (let i = 0; i < 26; i++) {
          this._emit({ x: px + (Math.random() - 0.5) * 90, y: py + (Math.random() - 0.5) * 60,
            vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3,
            r: 5, life: 1, decay: 0.03, type: 'spark', color: '110,180,255' });
        }
        this._screenFlash = Math.max(this._screenFlash, 0.5);
        break;
      case 'typhoon':
        for (let i = 0; i < 60; i++) {
          const a  = Math.random() * Math.PI * 2;
          const sp = 5 + Math.random() * 11;
          this._emit({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            r: 7 + Math.random() * 8, life: 1, decay: 0.02, type: 'ember', color: '255,90,20' });
        }
        for (let i = 0; i < 20; i++) {
          this._emit({ x: px + (Math.random() - 0.5) * 60, y: py, vx: (Math.random() - 0.5) * 1.5, vy: -1.5 - Math.random() * 2,
            r: 34 + Math.random() * 30, life: 1, decay: 0.011, type: 'smoke', color: '90,40,20' });
        }
        this._screenFlash = 1;
        break;
    }
  }

  // ── 적을 휩쓰는 대형 이펙트 (impact 단계 동안 적 전신을 감쌈) ──
  _renderEngulf(W, H) {
    const box = this._enemyBox ?? { cx: this._ec(W, H).x, cy: H * 0.42, h: H * 0.5 };
    const t   = Math.min(1, this._elapsed / IMPACT_MS);
    const S   = Math.max(W, H);
    switch (this._spell.id) {
      case 'storm':     this._fxEngulfStorm(box, t, S);     break;
      case 'volcano':   this._fxEngulfVolcano(box, t, S);   break;
      case 'jungle':    this._fxEngulfJungle(box, t, S);    break;
      case 'rainstorm': this._fxEngulfRainstorm(box, t, S); break;
      case 'typhoon':   this._fxEngulfTyphoon(box, t, S);   break;
    }
  }

  _fxEngulfStorm({ cx, cy }, t, S) {
    const ctx = this.ctx;
    const r = S * (0.42 + 0.30 * t);
    ctx.save();
    ctx.globalAlpha = 0.8 * (1 - t * 0.55);
    ctx.translate(cx, cy);
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.rotate(this._elapsed * (0.015 + i * 0.004) + (i / 7) * Math.PI * 2);
      ctx.strokeStyle = 'rgba(190,230,255,0.9)';
      ctx.lineWidth   = S * 0.012;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.4, 0, 0, Math.PI * 1.7);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  _fxEngulfVolcano({ cx, cy }, t, S) {
    const ctx = this.ctx;
    const r = S * (0.55 + 0.40 * t);
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - t * 0.45);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,   'rgba(255,200,100,0.8)');
    grad.addColorStop(0.5, 'rgba(255,90,20,0.55)');
    grad.addColorStop(1,   'rgba(120,10,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _fxEngulfJungle({ cx, cy }, t, S) {
    const ctx = this.ctx;
    const r = S * (0.32 + 0.34 * t);
    ctx.save();
    ctx.globalAlpha = 0.88 * (1 - t * 0.45);
    ctx.strokeStyle = 'rgba(70,190,90,0.92)';
    ctx.lineWidth   = S * 0.010; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2 + this._elapsed * 0.004;
      ctx.beginPath();
      for (let s = 0; s <= 16; s++) {
        const a = a0 + (s / 16) * Math.PI * 2.6;
        const rr = r * (0.2 + (s / 16) * 0.85);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.9;
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _fxEngulfRainstorm({ cx, cy }, t, S) {
    const ctx = this.ctx;
    const r = S * (0.48 + 0.32 * t);
    ctx.save();
    ctx.globalAlpha = 0.8 * (1 - t * 0.55);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(150,210,255,0.65)');
    grad.addColorStop(1, 'rgba(40,90,200,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2;
        this._drawArc(cx, cy, a, r * (0.35 + Math.random() * 0.35), 'rgba(255,240,130,0.9)');
      }
    }
  }

  _fxEngulfTyphoon({ cx, cy }, t, S) {
    const ctx = this.ctx;
    const r = S * (0.65 + 0.55 * t);
    ctx.save();
    ctx.globalAlpha = 0.9 * (1 - t * 0.45);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,    'rgba(255,220,150,0.75)');
    grad.addColorStop(0.5,  'rgba(255,100,20,0.6)');
    grad.addColorStop(1,    'rgba(120,10,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    ctx.translate(cx, cy);
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.rotate(this._elapsed * (0.02 + i * 0.005) + (i / 7) * Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,180,60,0.9)';
      ctx.lineWidth   = S * 0.013;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.9, r * 0.35, 0, 0, Math.PI * 1.6);
      ctx.stroke();
      ctx.restore();
    }
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
