/*
 * Неоновая 3D-галактика на фон страницы (WebGL1, без зависимостей).
 * Сама медленно вращается; прокрутка вниз разгоняет её, вверх — тормозит и разворачивает.
 * Камера при прокрутке подлетает и наклоняется; курсор слегка двигает точку обзора.
 *
 * Подключение:
 *   <canvas id="space"></canvas> <canvas id="dust"></canvas>
 *   <script src="galaxy.js"></script>
 *   CSS: #space, #dust { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
 *        #space { z-index: 0 }  #dust { z-index: 1; mix-blend-mode: screen }  контент — z-index 2+
 * API: Galaxy.pulse([r,g,b], k)  — вспышка;  Galaxy.spin(v) — подкрутить;  Galaxy.setMotion('full'|'calm'|'off')
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const fine = matchMedia('(pointer:fine)').matches;
  let motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'calm' : 'full';

  const mouse = { x: innerWidth / 2, y: innerHeight * 0.4, sx: innerWidth / 2, sy: innerHeight * 0.4 };
  addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  let scrollP = 0, scrollS = 0;
  let pulse = 0, pulseCol = [1, .3, .85];
  let phase = 0, boost = 0, velT = 0;
  let galaxyScreen = [innerWidth * .65, innerHeight * .5];

  const cv = document.getElementById('space');
  const gl = cv && cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  let prog, U = {}, A = {}, glOk = false, count = 0, dprScale = 1;

  const VS = `
attribute vec4 aA; attribute vec4 aC;
uniform mat4 uP; uniform mat4 uV; uniform float uPhase; uniform float uPx; uniform float uT; uniform float uPulse; uniform vec3 uPC; uniform float uGain;
varying vec3 vC;
void main(){
  float ang=aA.y+uPhase*aC.w;
  vec3 p=vec3(cos(ang)*aA.x,aA.z,sin(ang)*aA.x);
  vec4 mv=uV*vec4(p,1.);
  gl_Position=uP*mv;
  float s=abs(aA.w)*uPx/max(-mv.z,.05);
  float k=1.;
  if(s<1.6){k=(s*s)/(1.6*1.6);s=1.6;}
  float tw=aA.w<0.?.55+.45*sin(uT*(1.3+fract(aA.y*7.31)*3.)+aA.y*91.):1.;
  gl_PointSize=min(s,90.);
  vec3 c=aC.rgb*k*tw*(aC.w<.5?1.:uGain);
  c+=uPC*uPulse*.5*length(aC.rgb)*step(.5,aC.w);
  vC=c;
}`;
  const FS = `
precision mediump float; varying vec3 vC;
void main(){vec2 d=gl_PointCoord-.5;float l=dot(d,d)*4.;float a=exp(-l*3.2)-.04;if(a<=0.)discard;gl_FragColor=vec4(vC*a,1.);}`;

  /* генерация звёзд */
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const COL = { core: [1, .86, .95], hot: [1, .32, .82], vio: [.62, .32, 1], cyan: [.25, .85, 1], blue: [.55, .7, 1] };
  function armColor(t) { // t: 0 центр → 1 край
    if (t < .35) return mix(COL.hot, COL.vio, t / .35);
    if (t < .7) return mix(COL.vio, COL.cyan, (t - .35) / .35);
    return mix(COL.cyan, COL.blue, (t - .7) / .3);
  }
  function build(n) {
    const R = 6.2, ARMS = 4, TW = 2.35;
    const nDust = Math.round(n * .025), nBg = Math.round(n * .05), nCore = Math.round(n * .14), nHalo = Math.round(n * .08);
    const nArm = n - nDust - nBg - nCore - nHalo;
    const a = new Float32Array(n * 4), c = new Float32Array(n * 4);
    let i = 0;
    const put = (r, th, y, size, col, w, br) => {
      a[i * 4] = r; a[i * 4 + 1] = th; a[i * 4 + 2] = y; a[i * 4 + 3] = size;
      c[i * 4] = col[0] * br; c[i * 4 + 1] = col[1] * br; c[i * 4 + 2] = col[2] * br; c[i * 4 + 3] = w; i++;
    };
    for (let k = 0; k < nCore; k++) {
      const r = Math.abs(gauss()) * .62, th = Math.random() * 6.283;
      put(r, th, gauss() * .32 * Math.max(.2, 1 - r / 1.6), .045, mix(COL.core, COL.hot, Math.min(1, r / 1.2) * .6), 1.35, .55 + Math.random() * .5);
    }
    for (let k = 0; k < nArm; k++) {
      const arm = [0, 2, 0, 2, 1, 3][k % 6];
      const r = .35 + R * Math.pow(Math.random(), 1.25);
      const spread = gauss() * (.32 / (.55 + r * .22)) + gauss() * .05 * r;
      const th = arm * Math.PI / 2 + Math.log(r + .6) * TW * 1.6 + spread;
      const y = gauss() * .1 * (1 + (R - r) / R * .7);
      const bright = Math.random() < .025;
      const col = bright ? (Math.random() < .5 ? COL.cyan : [1, .55, .95]) : armColor(r / R + gauss() * .06);
      put(r, th, y, bright ? -.075 : (.026 + Math.random() * .03), col, 1, bright ? 1.4 : .32 + Math.random() * .45);
    }
    for (let k = 0; k < nHalo; k++) {
      const r = R * 1.15 * Math.sqrt(Math.random()), th = Math.random() * 6.283;
      put(r, th, gauss() * .35, .03, mix(COL.vio, COL.blue, Math.random()), 1, .14 + Math.random() * .18);
    }
    for (let k = 0; k < nDust; k++) { // светящиеся облака вдоль рукавов
      const arm = k % ARMS;
      const r = .8 + (R - .4) * Math.pow(Math.random(), 1.1);
      const th = arm * Math.PI / 2 + Math.log(r + .6) * TW * 1.6 + gauss() * .18;
      const col = armColor(r / R);
      put(r, th, gauss() * .06, .7 + Math.random() * 1.5, Math.random() < .3 ? COL.hot : col, 1, .028 + Math.random() * .03);
    }
    for (let k = 0; k < nBg; k++) { // далёкие звёзды на сфере
      const u = Math.random() * 2 - 1, th = Math.random() * 6.283, Rs = 40 + Math.random() * 40;
      put(Rs * Math.sqrt(1 - u * u), th, Rs * u, -(.12 + Math.random() * .2), Math.random() < .2 ? [1, .7, .95] : [.75, .85, 1], .04, .5 + Math.random() * .6);
    }
    count = i;
    return { a, c };
  }

  function initGL() {
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; };
    const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
    if (!v || !f) return false;
    prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const n = fine && innerWidth > 900 ? 110000 : 55000;
    const { a, c } = build(n);
    for (const [name, data] of [['aA', a], ['aC', c]]) {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
    }
    ['uP', 'uV', 'uPhase', 'uPx', 'uT', 'uPulse', 'uPC', 'uGain'].forEach(k => U[k] = gl.getUniformLocation(prog, k));
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    return true;
  }
  glOk = initGL();
  if (!glOk) root.classList.add('no-gl');

  function sizeGL() {
    if (!glOk) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.75) * dprScale;
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
  }

  /* матрицы */
  function persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), nf = 1 / (n - f); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]); }
  function lookAt(e, c, up) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  }
  const FOV = 50 * Math.PI / 180;

  /* ---------------- Варп-полосы (2D): видны, когда прокрутка разгоняет галактику ---------------- */
  const dc = document.getElementById('dust');
  const dx = dc && dc.getContext('2d');
  let streaks = [];
  function sizeDust() {
    if (!dx) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    dc.width = innerWidth * dpr; dc.height = innerHeight * dpr; dx.setTransform(dpr, 0, 0, dpr, 0, 0);
    streaks = Array.from({ length: 90 }, () => ({ a: Math.random() * 6.283, d: Math.random(), s: .4 + Math.random(), h: Math.random() < .5 }));
  }
  function drawStreaks(dt) {
    if (!dx) return;
    dx.clearRect(0, 0, innerWidth, innerHeight);
    const k = Math.min(1, Math.abs(boost) / 2.2);
    if (k < .04 || motion !== 'full') return;
    const [cx, cy] = galaxyScreen, maxD = Math.hypot(innerWidth, innerHeight) * .75, dir = Math.sign(boost);
    dx.lineCap = 'round';
    for (const s of streaks) {
      s.d += dir * dt * .0006 * s.s * (.3 + k * 2.2);
      if (s.d > 1) { s.d -= 1; s.a = Math.random() * 6.283; } if (s.d < 0) { s.d += 1; s.a = Math.random() * 6.283; }
      const r0 = 40 + s.d * s.d * maxD, len = 10 + 140 * k * s.d;
      const ca = Math.cos(s.a), sa = Math.sin(s.a);
      dx.strokeStyle = s.h ? `rgba(255,90,220,${.55 * k * s.d})` : `rgba(90,220,255,${.55 * k * s.d})`;
      dx.lineWidth = .6 + s.d * 1.6;
      dx.beginPath(); dx.moveTo(cx + ca * r0, cy + sa * r0); dx.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len)); dx.stroke();
    }
  }

  /* ---------------- Прокрутка → скорость вращения ---------------- */
  let lastY = scrollY, lastST = performance.now();
  function onScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    scrollP = Math.min(1, Math.max(0, scrollY / max));
    const now = performance.now(), dt = Math.max(8, now - lastST);
    const v = (scrollY - lastY) / dt;            // px/мс, вниз > 0
    lastY = scrollY; lastST = now;
    velT = Math.max(-6, Math.min(6, velT * .5 + v * 1.4));
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('wheel', e => { // на краях страницы колесо тоже крутит галактику
    const atEdge = (e.deltaY < 0 && scrollY <= 0) || (e.deltaY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2);
    if (atEdge) velT = Math.max(-6, Math.min(6, velT + e.deltaY * .01));
  }, { passive: true });
  addEventListener('resize', () => { sizeGL(); sizeDust(); });

  /* ---------------- Цикл ---------------- */
  let last = performance.now(), acc = 0, frames = 0, running = true, simT = 0;
  const BASE = .07;   // собственная скорость, рад/с
  function frame(now) {
    if (!running) return;
    const dt = Math.min(64, now - last); last = now;
    const speed = motion === 'full' ? 1 : motion === 'calm' ? .35 : 0;
    simT += dt * .001 * speed;
    velT *= Math.pow(.86, dt / 16);
    boost += (velT - boost) * Math.min(1, .07 * dt / 16);
    if (motion !== 'full') boost *= .5;
    phase += dt * .001 * (BASE * speed + boost * .9);
    mouse.sx += (mouse.x - mouse.sx) * (motion === 'full' ? .06 : .02);
    mouse.sy += (mouse.y - mouse.sy) * (motion === 'full' ? .06 : .02);
    scrollS += (scrollP - scrollS) * .06;
    pulse *= Math.pow(.975, dt / 16);

    if (glOk) {
      sizeGL();
      const W = cv.width, H = cv.height, asp = W / H, wide = asp > 1.05;
      const mx = (mouse.sx / innerWidth - .5), my = (mouse.sy / innerHeight - .5);
      const pitch = (wide ? 1.02 : 1.12) - scrollS * .72 + my * .08;   // от «сверху под углом» к «почти с ребра»
      const yaw = -.35 + mx * .25 + scrollS * .9;
      const dist = (wide ? 8.5 : 12) - scrollS * (wide ? 4.5 : 6);
      const eye = [Math.cos(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.sin(yaw) * Math.cos(pitch) * dist];
      const V = lookAt(eye, [0, 0, 0], [0, 1, 0]);
      const P = persp(FOV, asp, .05, 300);
      // сдвиг галактики вправо на широких экранах (смещение в пространстве экрана)
      const shift = wide ? .42 - scrollS * .3 : 0, lift = wide ? 0 : -.18 + scrollS * .2;
      P[8] -= shift; P[9] -= lift;
      galaxyScreen = [innerWidth * (.5 + shift / 2), innerHeight * (.5 - lift / 2)];
      gl.uniformMatrix4fv(U.uP, false, P); gl.uniformMatrix4fv(U.uV, false, V);
      gl.uniform1f(U.uPhase, phase); gl.uniform1f(U.uT, simT);
      gl.uniform1f(U.uPx, H / (2 * Math.tan(FOV / 2)));
      // приглушаем после первого экрана, чтобы контент читался
      const gy = Math.min(1, Math.max(0, (scrollY / innerHeight - .25) / .6));
      gl.uniform1f(U.uGain, 1 - .58 * gy * gy * (3 - 2 * gy));
      gl.uniform1f(U.uPulse, pulse); gl.uniform3f(U.uPC, pulseCol[0], pulseCol[1], pulseCol[2]);
      gl.clearColor(.012, .006, .03, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, count);
      // адаптивное разрешение
      acc += dt; frames++;
      if (frames === 45) {
        const avg = acc / frames; acc = 0; frames = 0;
        if (avg > 28 && dprScale > .5) dprScale = Math.max(.5, dprScale - .15);
        else if (avg < 15 && dprScale < 1) dprScale = Math.min(1, dprScale + .05);
      }
    }
    drawStreaks(dt);
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });

  function boot() { sizeGL(); sizeDust(); onScroll(); velT = 0; requestAnimationFrame(frame); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.Galaxy = {
    setMotion(m) { motion = m; },
    pulse(rgb, k = 1) { pulseCol = rgb; pulse = Math.min(1.4, pulse + k); },
    spin(v) { velT += v; },
  };
})();
