/**
 * effectEngine.js — Three.js 파티클 이펙트 엔진
 *
 * 각 술식마다 파티클 목표 위치/색상을 설정하고
 * 매 프레임 lerp로 부드럽게 전환
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const COUNT = 15000;

// 술식별 설정
const JUTSU_CONFIG = {
  none:         { bloom: 0.5,  color: [0.05, 0.05, 0.1] },
  shadow_clone: { bloom: 2.0,  color: [0.9,  0.8,  0.3] },  // 황금
  rasengan:     { bloom: 3.0,  color: [0.2,  0.5,  1.0] },  // 파란 구체
  chidori:      { bloom: 3.5,  color: [0.6,  0.8,  1.0] },  // 번개 흰파랑
  sharingan:    { bloom: 2.5,  color: [1.0,  0.0,  0.0] },  // 빨강
};

export class EffectEngine {
  constructor(container) {
    this._setup(container);
    this._initParticles();
    this._animate();
    this.currentJutsu = 'none';
  }

  _setup(container) {
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 50;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.4, 0.85
    );
    this.composer.addPass(this.bloomPass);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _initParticles() {
    const geo   = new THREE.BufferGeometry();
    const pos   = new Float32Array(COUNT * 3);
    const col   = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    this.targetPos   = new Float32Array(COUNT * 3);
    this.targetCol   = new Float32Array(COUNT * 3);
    this.targetSizes = new Float32Array(COUNT);

    geo.setAttribute('position', new THREE.BufferAttribute(pos,   3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col,   3));
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.3, vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false,
    }));

    this.scene.add(this.particles);
    this._setTargets('none');
  }

  /** 술식 트리거 — 외부에서 호출 */
  trigger(jutsu) {
    if (jutsu === this.currentJutsu) return;
    this.currentJutsu = jutsu;
    this.bloomPass.strength = JUTSU_CONFIG[jutsu]?.bloom ?? 1.0;
    this._setTargets(jutsu);
  }

  /** 술식에 맞는 파티클 목표 위치/색 계산 */
  _setTargets(jutsu) {
    const cfg = JUTSU_CONFIG[jutsu] ?? JUTSU_CONFIG.none;
    const [cr, cg, cb] = cfg.color;

    for (let i = 0; i < COUNT; i++) {
      let x, y, z, s;

      if (jutsu === 'none') {
        // 흩어진 배경 파티클
        x = (Math.random() - 0.5) * 120;
        y = (Math.random() - 0.5) * 120;
        z = (Math.random() - 0.5) * 120;
        s = 0.2;

      } else if (jutsu === 'shadow_clone') {
        // 구형 분산 (분신 연기)
        const r = 15 + Math.random() * 20;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.sin(phi) * Math.sin(theta);
        z = r * Math.cos(phi);
        s = 0.5 + Math.random() * 0.5;

      } else if (jutsu === 'rasengan') {
        // 나선 구체
        const r     = 8 + Math.random() * 5;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.sin(phi) * Math.sin(theta);
        z = r * Math.cos(phi);
        s = 0.6;

      } else if (jutsu === 'chidori') {
        // 번개 방사형
        const angle = Math.random() * Math.PI * 2;
        const r     = Math.random() * 35;
        x = r * Math.cos(angle) + (Math.random() - 0.5) * 3;
        y = r * Math.sin(angle) + (Math.random() - 0.5) * 3;
        z = (Math.random() - 0.5) * 5;
        s = 0.4 + Math.random() * 0.8;

      } else if (jutsu === 'sharingan') {
        // 2개의 동심원 (사륜안)
        const ring  = Math.random() > 0.5 ? 10 : 20;
        const angle = Math.random() * Math.PI * 2;
        x = ring * Math.cos(angle);
        y = ring * Math.sin(angle);
        z = (Math.random() - 0.5) * 2;
        s = 0.5;
      }

      this.targetPos[i * 3]     = x;
      this.targetPos[i * 3 + 1] = y;
      this.targetPos[i * 3 + 2] = z;
      this.targetCol[i * 3]     = cr + (Math.random() - 0.5) * 0.2;
      this.targetCol[i * 3 + 1] = cg + (Math.random() - 0.5) * 0.2;
      this.targetCol[i * 3 + 2] = cb + (Math.random() - 0.5) * 0.2;
      this.targetSizes[i]        = s;
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const pos = this.particles.geometry.attributes.position.array;
    const col = this.particles.geometry.attributes.color.array;
    const siz = this.particles.geometry.attributes.size.array;

    // lerp 전환
    for (let i = 0; i < COUNT * 3; i++) {
      pos[i] += (this.targetPos[i] - pos[i]) * 0.08;
      col[i] += (this.targetCol[i] - col[i]) * 0.08;
    }
    for (let i = 0; i < COUNT; i++) {
      siz[i] += (this.targetSizes[i] - siz[i]) * 0.08;
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate    = true;
    this.particles.geometry.attributes.size.needsUpdate     = true;

    // 술식별 회전
    const j = this.currentJutsu;
    if      (j === 'rasengan')     this.particles.rotation.z += 0.03;
    else if (j === 'chidori')      this.particles.rotation.z -= 0.05;
    else if (j === 'shadow_clone') this.particles.rotation.y += 0.01;
    else if (j === 'sharingan')    this.particles.rotation.z += 0.02;
    else                           this.particles.rotation.y += 0.003;

    this.composer.render();
  }
}
