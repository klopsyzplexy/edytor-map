import * as THREE from 'three';
import './style.css';

// Szkielet 0.0.0: pusta scena z siatką i numerem wersji.
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20242b);
scene.add(new THREE.GridHelper(40, 40, 0x667080, 0x3a404a));

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.set(20, 18, 20);
camera.lookAt(0, 0, 0);

const badge = document.createElement('div');
badge.className = 'version';
badge.textContent = `Edytor map alfa ${__APP_VERSION__}`;
app.appendChild(badge);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
