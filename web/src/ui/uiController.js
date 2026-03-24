/**
 * uiController.js — UI 상태 관리
 */

const JUTSU_KO = {
  none:         '손을 보여주세요',
  shadow_clone: '다중 분신술 (影分身の術)',
  rasengan:     '나선환 (螺旋丸)',
  chidori:      '치도리 (千鳥)',
  sharingan:    '사륜안 (写輪眼)',
};

const JUTSU_COLOR = {
  none:         '#4a5568',
  shadow_clone: '#f6e05e',
  rasengan:     '#63b3ed',
  chidori:      '#bee3f8',
  sharingan:    '#fc8181',
};

export class UIController {
  constructor(state) {
    this.state       = state;
    this.jutsuEl     = document.getElementById('jutsu-name');
    this.statusEl    = document.getElementById('status-text');
    this.pillEl      = document.getElementById('status-pill');
    this.confBar     = document.getElementById('confidence-bar');
    this.confLabel   = document.getElementById('confidence-label');
    this.collectPanel = document.getElementById('collect-panel');
  }

  setJutsu(jutsu, confidence = 0) {
    this.jutsuEl.textContent = JUTSU_KO[jutsu] ?? jutsu;
    this.jutsuEl.style.color = JUTSU_COLOR[jutsu] ?? '#fff';
    this.setConfidence(confidence);
  }

  setConfidence(pct) {
    this.confBar.style.width       = `${pct}%`;
    this.confLabel.textContent     = `${pct}%`;
    this.confBar.style.background  = pct > 80 ? '#8b5cf6' : pct > 50 ? '#f6e05e' : '#4a5568';
  }

  setStatus(type, text) {
    this.statusEl.textContent = text;
    this.pillEl.className = `pill ${type}`;
  }

  updateCollectCount(count) {
    document.getElementById('collect-count').textContent = `수집: ${count}개`;
  }

  onModeChange(mode) {
    this.collectPanel.classList.toggle('hidden', mode !== 'collect');
  }
}
