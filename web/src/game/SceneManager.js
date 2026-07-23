export class SceneManager {
  constructor(canvas, ctx, video) {
    this.canvas = canvas;
    this.ctx    = ctx;
    this.video  = video;
    this._scene = null;
    this.score  = 0;      // 라운드 전반 누적 점수
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
