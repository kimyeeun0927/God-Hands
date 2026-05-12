export class SceneManager {
  constructor(canvas, ctx, video) {
    this.canvas = canvas;
    this.ctx    = ctx;
    this.video  = video;
    this._scene = null;
  }

  goto(SceneClass, ...args) {
    this._scene?.destroy?.();
    this._scene = new SceneClass(this, ...args);
    this._scene.init?.();
  }

  update(dt, handState) {
    this._scene?.update(dt, handState);
  }

  render(handState) {
    this._scene?.render(handState);
  }
}
