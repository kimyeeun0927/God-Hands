// ml/train.py normalize_landmarks()와 반드시 동일 로직 유지
export function normalize(landmarks, handednessList) {
  const result = { right: null, left: null };
  if (!landmarks) return result;

  const raw = { right: null, left: null };
  landmarks.forEach((lms, idx) => {
    const label = handednessList?.[idx]?.[0]?.categoryName;
    // Tasks API: 미러링 카메라 기준 Left/Right 반전 없음
    const side  = label === 'Left' ? 'right' : 'left';
    raw[side] = lms;
  });

  const rWrist  = raw.right ? raw.right[0] : null;
  const lWrist  = raw.left  ? raw.left[0]  : null;
  const lAnchor = rWrist ?? lWrist; // 오른손 있으면 오른손 wrist 기준, 없으면 왼손 wrist 기준

  // scale: 오른손 wrist → 오른손 중지 MCP(9) 거리 (xy). 오른손 없으면 1.0
  let scale = 1.0;
  if (raw.right) {
    const d = Math.hypot(raw.right[9].x - rWrist.x, raw.right[9].y - rWrist.y);
    if (d !== 0) scale = d;
  }

  if (raw.right) {
    const arr = new Float32Array(63);
    raw.right.forEach((lm, i) => {
      arr[i*3]   = (lm.x - rWrist.x) / scale;
      arr[i*3+1] = (lm.y - rWrist.y) / scale;
      arr[i*3+2] = (lm.z - rWrist.z) / scale;
    });
    result.right = arr;
  }

  if (raw.left) {
    const arr = new Float32Array(63);
    raw.left.forEach((lm, i) => {
      arr[i*3]   = (lm.x - lAnchor.x) / scale;
      arr[i*3+1] = (lm.y - lAnchor.y) / scale;
      arr[i*3+2] = (lm.z - lAnchor.z) / scale;
    });
    result.left = arr;
  }

  return result;
}
