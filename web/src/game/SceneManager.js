export class SceneManager {
  constructor(canvas, ctx, video) {
    this.canvas = canvas;
    this.ctx    = ctx;
    this.video  = video;
    this._scene = null;
    this.score  = 0;      // 라운드 전반 누적 점수

    // 성적표용 라운드별 획득/최고 점수 스냅샷 (각 라운드가 완료 시 채움)
    this.roundScores = {
      r1: 0, r1Max: 0,
      r2: 0, r2Max: 0,
      r3: 0, r3Max: 0,
      cleared: false,   // Round3를 클리어했는지 (탈락 여부 판정용)
    };
  }

  goto(SceneClass, ...args) {
    this._scene?.destroy?.();
    this._scene = new SceneClass(this, ...args);
    this._scene.init?.();
  }

  get hideScoreHUD() {
    return this._scene?.hideScoreHUD ?? false;
  }

  update(dt, handState) {
    this._scene?.update(dt, handState);
  }

  render(handState) {
    this._scene?.render(handState);
  }
}
