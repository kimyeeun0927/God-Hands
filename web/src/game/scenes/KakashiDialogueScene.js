const ADVANCE_COOLDOWN = 700;
const CHAR_SPEED_MS    = 38;

// 캐릭터 표정 에셋 — 페이지별 char 필드로 지정, 생략 시 'default'(char.png)
const CHAR_ASSETS = {
  default:   'assets/characters/char.png',
  angry:     'assets/characters/char_angry.png',
  chill:     'assets/characters/char_chill.png',
  smile:     'assets/characters/char_smile.png',
  surprised: 'assets/characters/char_surprised.png',
};

export function r1Pages(score) {
  const open = score >= 300
    ? { lines: ['후우... 꽤 하는군.', '예상보다 잘 했다.'], char: 'surprised' }
    : score >= 200
    ? { lines: ['그래... 나쁘진 않았다.', '아직 다듬을 부분은 있지만.'] }
    : { lines: ['흠... 아직 갈 길이 멀군.', '하지만 포기하기엔 이르다.'], char: 'angry' };
  return [
    open,
    { lines: ['다음은 두 번째 시험이다.'] },
    { lines: ['시험에 앞서 닌자의 필수 덕목,', '수인을 설명하겠다.'] },
    { lines: ['수인은 손으로 특정 모양을 맺어', '차크라를 이용해 공격, 혹은', '방어할 수 있는 전법이다.'] },
    { lines: ['수인에는 6가지가 있다.', '불, 물, 풀, 땅, 전기, 그리고 바람.'] },
    { lines: ['자, 화면에 보이는 수인을', '따라해봐라.'], char: 'chill' },
  ];
}

export function r2IntroPages(_score) {
  return [
    { lines: ['좋다.', '두 번째 시험에서는 수인을', '얼마나 빠르게 맺을 수 있는 가를 평가한다.'], char: 'smile' },
    { lines: ['빠르게 맞추면 PERFECT,', '맞추면 SUCCESS, 틀리면 MISS다.', '콤보를 이어가면 추가 점수가 붙는다.'] },
    { lines: ['자... 집중해라.'], char: 'angry' },
  ];
}

export function r2Pages(score, allCorrect = false) {
  const open = allCorrect || score >= 600
    ? { lines: ['잘 해냈군.', '순서까지 정확히 기억하다니... 대단하다.'], char: 'smile' }
    : score >= 300
    ? { lines: ['어렵긴 했지만... 해냈군.', '인정한다.'], char: 'surprised' }
    : { lines: ['쉽지 않았겠지.', '그래도 버텨낸 건 칭찬할 만하다.'], char: 'chill' };
  return [
    open,
    { lines: ['이제 마지막 시험이다.', '이번엔... 실전이다.'], char: 'angry' },
    { lines: ['전서구 파동이 날아올 것이다.', '닌자 인장으로 파동을 막아내라.', '콤보와 정확도가 승패를 가른다.'] },
    { lines: ['... 무운을 빈다.'], char: 'chill' },
  ];
}

export function r3Pages(_score) {
  return [
    { lines: ['... 수고했다.', '마지막까지 포기하지 않았군.'], char: 'smile' },
    { lines: ['이것으로 닌자 시험은 모두 끝이다.'] },
    { lines: ['결과를 발표하겠다.'] },
  ];
}

export class KakashiDialogueScene {
  hideScoreHUD = true;

  constructor(manager, nextSceneClass, pagesOrFn) {
    this.manager = manager;
    this.canvas  = manager.canvas;
    this.ctx     = manager.ctx;
    this._next   = nextSceneClass;
    this._pages  = typeof pagesOrFn === 'function'
      ? pagesOrFn(manager.score)
      : pagesOrFn;
    this._page     = 0;
    this._charIdx  = 0;
    this._typeMs   = 0;
    this._cooldown = ADVANCE_COOLDOWN;
    this._fistHeld = false;
    this._assets   = {};
  }

  init() {
    Object.entries(CHAR_ASSETS).forEach(([key, src]) => this._tryLoad(key, src));
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
    const pips  = [6, 10, 14, 18];
    return lms.some(hand => tips.every((t, i) => hand[t].y > hand[pips[i]].y));
  }

  _totalChars(page) {
    return page.lines.reduce((s, l) => s + l.length, 0);
  }

  update(dt, handState) {
    this._cooldown = Math.max(0, this._cooldown - dt);

    const page  = this._pages[this._page];
    const total = this._totalChars(page);

    if (this._charIdx < total) {
      this._typeMs += dt;
      this._charIdx = Math.min(total, Math.floor(this._typeMs / CHAR_SPEED_MS));
      return;
    }

    if (this._cooldown > 0) return;

    const fist = this._isFist(handState);
    if (fist && !this._fistHeld) {
      this._fistHeld = true;
    } else if (!fist && this._fistHeld) {
      this._fistHeld = false;
      if (this._page < this._pages.length - 1) {
        this._page++;
        this._charIdx  = 0;
        this._typeMs   = 0;
        this._cooldown = ADVANCE_COOLDOWN;
      } else {
        this.manager.goto(this._next);
      }
    }
  }

  render(handState) {
    const { canvas, ctx } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);

    // 캐릭터 — 0.75배, 왼쪽 하단으로
    const page = this._pages[this._page];
    const img  = this._assets[page.char || 'default'];
    if (img) {
      let pw = Math.min(H * 0.55, W * 0.28) * 1.5;
      let ph = pw * 1.4;
      if (ph > H * 0.95) { ph = H * 0.95; pw = ph / 1.4; }
      const px = W * 0.02, py = H * 0.56 - ph / 2;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const boxRatio = pw / ph;
      let dw, dh;
      if (imgRatio > boxRatio) { dw = pw; dh = pw / imgRatio; }
      else                     { dh = ph; dw = ph * imgRatio; }
      ctx.drawImage(img, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
    }

    // 말풍선 — 화면 하단 오른쪽
    const bx = W * 0.40, by = H * 0.52;
    const bw = W * 0.54, bh = H * 0.44;
    const br = 14;

    // 꼬리: 왼쪽 에지에서 캐릭터 방향으로
    const tTopY = by + bh * 0.18;
    const tBotY = by + bh * 0.34;
    const tTipX = bx - W * 0.09;
    const tTipY = by + bh * 0.26;

    // 말풍선 + 꼬리를 단일 path로 (꼬리 기저부 테두리가 내부에 숨음)
    ctx.save();
    ctx.fillStyle   = '#F5E6C3';
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + bw - br, by);
    ctx.quadraticCurveTo(bx + bw, by,      bx + bw, by + br);
    ctx.lineTo(bx + bw, by + bh - br);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
    ctx.lineTo(bx + br, by + bh);
    ctx.quadraticCurveTo(bx, by + bh,      bx, by + bh - br);
    // 왼쪽 에지를 올라오다가 꼬리 삽입
    ctx.lineTo(bx, tBotY);
    ctx.lineTo(tTipX, tTipY);
    ctx.lineTo(bx, tTopY);
    ctx.lineTo(bx, by + br);
    ctx.quadraticCurveTo(bx, by,            bx + br, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 화자 이름 태그
    ctx.save();
    const lw = 160, lh = 34;
    ctx.fillStyle   = '#F5E6C3';
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth   = 2;
    this._rrect(ctx, bx + 16, by - lh / 2, lw, lh, 6);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle    = '#5C3D00';
    ctx.font         = `bold ${Math.floor(H * 0.022)}px 'Mulmaru', sans-serif`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('시험관', bx + 28, by);
    ctx.restore();

    // 타자기 텍스트
    const total = this._totalChars(page);
    let   rem   = this._charIdx;
    ctx.save();
    ctx.fillStyle    = '#2C1A00';
    ctx.font         = `${Math.floor(H * 0.03)}px 'Mulmaru', sans-serif`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    page.lines.forEach((line, i) => {
      if (rem <= 0) return;
      ctx.fillText(line.slice(0, rem), bx + 22, by + 22 + i * (H * 0.058));
      rem -= line.length;
    });
    ctx.restore();

    // 다음 안내 힌트
    if (this._charIdx >= total && this._cooldown <= 0) {
      const isLast = this._page >= this._pages.length - 1;
      const hint   = isLast ? '✊ 주먹 쥐기 → 결과 확인' : '✊ 주먹 쥐기 → 계속';
      const fist   = this._isFist(handState);
      ctx.save();
      ctx.fillStyle    = fist ? '#8B6914' : 'rgba(92,61,0,0.5)';
      ctx.font         = `bold ${Math.floor(H * 0.02)}px 'Mulmaru', sans-serif`;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(hint, bx + bw - 16, by + bh - 12);
      ctx.restore();
    }
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
