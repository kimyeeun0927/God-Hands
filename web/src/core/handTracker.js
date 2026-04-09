export class HandTracker {
  constructor({ videoEl, canvasEl, onResults }) {
    this.videoEl = videoEl; this.canvasEl = canvasEl;
    this.ctx = canvasEl.getContext('2d'); this.onResults = onResults;
  }
  async start() {
    this.hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    this.hands.setOptions({ maxNumHands: 2, modelComplexity: 2, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    this.hands.onResults(r => this._handleResults(r));
    this.camera = new Camera(this.videoEl, {
      onFrame: async () => {
        this.canvasEl.width = this.videoEl.videoWidth;
        this.canvasEl.height = this.videoEl.videoHeight;
        await this.hands.send({ image: this.videoEl });
      }, width: 640, height: 480,
    });
    await this.camera.start();
  }
  _handleResults(results) {
    this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
    if (results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach(lm => {
        drawConnectors(this.ctx, lm, HAND_CONNECTIONS, { color: 'rgba(139,92,246,0.8)', lineWidth: 2 });
        drawLandmarks(this.ctx, lm, { color: '#fff', fillColor: 'rgba(139,92,246,0.9)', lineWidth: 1, radius: 3 });
      });
    }
    this.onResults(results);
  }
  normalize(multiHandLandmarks, multiHandedness) {
    const result = { right: null, left: null };
    if (!multiHandLandmarks) return result;
    multiHandLandmarks.forEach((lms, idx) => {
      const label = multiHandedness?.[idx]?.classification?.[0]?.label;
      const side = label === 'Left' ? 'right' : 'left';
      const wrist = lms[0];
      const arr = new Float32Array(63);
      lms.forEach((lm, i) => { arr[i*3]=lm.x-wrist.x; arr[i*3+1]=lm.y-wrist.y; arr[i*3+2]=lm.z-wrist.z; });
      result[side] = arr;
    });
    return result;
  }
}
