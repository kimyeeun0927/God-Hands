const JUTSU_KO = {
  none:   '손을 보여주세요',
  boar:   '돼지 (亥)',
  rabbit: '토끼 (卯)',
  rat:    '쥐 (子)',
};
const JUTSU_COLOR = {
  none:   '#4a5568',
  boar:   '#f9a8d4',
  rabbit: '86efac',
  rat:    '#fcd34d',
};

export class UIController {
  constructor(state) {
    this.state        = state;
    this.jutsuEl      = document.getElementById('jutsu-name');
    this.statusEl     = document.getElementById('status-text');
    this.pillEl       = document.getElementById('status-pill');
    this.confBar      = document.getElementById('confidence-bar');
    this.confLabel    = document.getElementById('confidence-label');
    this.collectPanel = document.getElementById('collect-panel');
  }
  setJutsu(jutsu) {
    this.jutsuEl.textContent = JUTSU_KO[jutsu] ?? jutsu;
    this.jutsuEl.style.color = JUTSU_COLOR[jutsu] ?? '#fff';
  }
  setConfidence(pct) {
    this.confBar.style.width      = `${pct}%`;
    this.confLabel.textContent    = `${pct}%`;
    this.confBar.style.background = pct > 80 ? '#8b5cf6' : pct > 50 ? '#f6e05e' : '#4a5568';
  }
  setStatus(type, text) {
    this.statusEl.textContent = text;
    this.pillEl.className     = `pill ${type}`;
  }
  onModeChange(mode) {
    this.collectPanel.classList.toggle('hidden', mode !== 'collect');
  }
}
