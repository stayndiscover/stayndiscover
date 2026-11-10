'use client';
import { useEffect, useRef } from 'react';

/**
 * Ouverture de la page d'accueil : un grand drap blanc couvre l'écran, l'avion du logo (rendu en relief)
 * le tracte en diagonale, du bas à droite vers le haut à gauche, au rythme du défilement.
 *
 * Fonctionnement :
 *  - le bandeau d'accueil reste immobile (position « sticky ») pendant une courte zone de défilement (« piste ») ;
 *  - sur cette piste, la progression p (0 → 1) fait rouler le drap : la partie soulevée s'enroule autour d'un
 *    cylindre puis repasse par-dessus, vers le haut à gauche (modèle de « page qui se tourne ») ;
 *  - le tissu est un maillage calculé à chaque image puis dessiné en WebGL, avec éclairage, plis et ondulations ;
 *  - rien de tout cela n'existe si l'appareil demande « réduire les animations » (classe html.fx-on absente).
 * Le contenu et le design de la page ne changent pas : le drap est une couche posée au-dessus.
 */

const VS = `
attribute vec3 aPos; attribute vec3 aN; attribute float aSh;
uniform vec2 uRes;
varying vec3 vN; varying float vSh; varying float vZ;
void main(){
  vN = aN; vSh = aSh; vZ = aPos.z;
  gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, -aPos.z / 2000.0, 1.0);
}`;
const FS = `
precision mediump float;
varying vec3 vN; varying float vSh; varying float vZ;
uniform float uDpr; uniform float uF; uniform float uR; uniform float uEnd;
void main(){
  vec3 n = normalize(vN);
  bool back = n.z < 0.0;
  if (back) n = -n;
  vec3 L = normalize(vec3(-0.35, -0.6, 0.72));
  float diff = max(dot(n, L), 0.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 60.0) * 0.18;
  vec3 base = back ? vec3(0.925, 0.918, 0.895) : vec3(0.992, 0.989, 0.978);
  // trame très fine du tissu
  vec2 fc = gl_FragCoord.xy / uDpr;
  float weave = 0.988 + 0.012 * sin(fc.x * 2.2) * sin(fc.y * 2.2);
  vec3 col = base * clamp(0.62 + 0.38 * diff / 0.72, 0.0, 1.06) * weave + spec;
  // ombre du rabat sur la partie encore posée (vZ ≈ 0) : douce, juste devant le pli
  float flat0 = 1.0 - smoothstep(0.5, 3.0, vZ);
  float sh = flat0 * smoothstep(uF - uR * 0.2, uF + uR * 0.4, vSh) * (0.05 + 0.13 * exp(-(vSh - uF) / (uR * 2.2))) * (1.0 - smoothstep(uEnd - uR * 2.0, uEnd, vSh));
  col *= 1.0 - sh;
  gl_FragColor = vec4(col, 1.0);
}`;
// ombre portée du drap sur la page déjà dévoilée
const VS2 = `attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.999, 1.0); }`;
const FS2 = `
precision mediump float;
uniform vec2 uC; uniform vec2 uU; uniform float uF; uniform float uR; uniform float uDpr; uniform vec2 uRes;
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
  float a = dot(p - uC, uU);
  float edge = uF - uR * 0.55;
  float d = edge - a;
  float al = d > 0.0 ? 0.42 * exp(-d / (uR * 1.1)) : 0.0;
  gl_FragColor = vec4(0.02, 0.09, 0.08, al);
}`;

type Labels = { hint: string };

export function VeilIntro({ children, labels }: { children: React.ReactNode; labels: Labels }) {
  const pinRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const ropeRef = useRef<SVGPathElement>(null);
  const rope2Ref = useRef<SVGPathElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const veil = veilRef.current, cv = canRef.current, run = runRef.current;
    if (!root.classList.contains('fx-on') || !veil || !cv || !run) return;
    const hdr = document.querySelector<HTMLElement>('header.top');
    const setHdr = () => root.style.setProperty('--hdr', `${hdr?.offsetHeight ?? 68}px`);
    setHdr();

    // ——— WebGL
    const gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    let prog: WebGLProgram | null = null, prog2: WebGLProgram | null = null;
    const mk = (vs: string, fs: string) => {
      if (!gl) return null;
      const p = gl.createProgram()!;
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
        const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    };
    if (gl) { prog = mk(VS, FS); prog2 = mk(VS2, FS2); }
    const ctx2 = !prog ? cv.getContext('2d') : null; // secours sans WebGL : drap plat qui se retire

    let W = 0, H = 0, dpr = 1, cols = 0, rows = 0;
    let pos = new Float32Array(0), nor = new Float32Array(0), sh = new Float32Array(0);
    let bPos: WebGLBuffer | null = null, bN: WebGLBuffer | null = null, bSh: WebGLBuffer | null = null, bIdx: WebGLBuffer | null = null, bQuad: WebGLBuffer | null = null;
    let nIdx = 0;
    const PAD = 24;
    const LIFT_K = 0.72; // vitesse du rabat par rapport au pli (1 = retombe à plat)
    const LIFT_Z = 260;  // hauteur maximale du voile soulevé (px)

    const resize = () => {
      setHdr();
      W = window.innerWidth; H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, W < 700 ? 1.75 : 1.5);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cols = W > 800 ? 72 : 44;
      rows = Math.max(20, Math.round(cols * (H / W)));
      const n = (cols + 1) * (rows + 1);
      pos = new Float32Array(n * 3); nor = new Float32Array(n * 3); sh = new Float32Array(n);
      if (gl && prog) {
        const idx = new Uint16Array(cols * rows * 6);
        let k = 0;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
          idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
        }
        nIdx = k;
        bIdx = bIdx ?? gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        bPos = bPos ?? gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferData(gl.ARRAY_BUFFER, pos.byteLength, gl.DYNAMIC_DRAW);
        bN = bN ?? gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bN); gl.bufferData(gl.ARRAY_BUFFER, nor.byteLength, gl.DYNAMIC_DRAW);
        bSh = bSh ?? gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bSh); gl.bufferData(gl.ARRAY_BUFFER, sh.byteLength, gl.DYNAMIC_DRAW);
        bQuad = bQuad ?? gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bQuad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      }
    };
    resize();

    const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x); // départ et arrivée en douceur
    const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    let raf = 0, done = false, pSm = -1;
    const t0 = performance.now();

    const frame = (now: number) => {
      raf = 0;
      const R = run.offsetHeight || 1;
      const pRaw = clamp(window.scrollY / R);
      pSm = pSm < 0 ? pRaw : pSm + (pRaw - pSm) * 0.14; // suit le défilement avec douceur
      if (Math.abs(pRaw - pSm) < 0.0005) pSm = pRaw;
      const p = pSm;
      if (p >= 0.999) {
        veil.style.visibility = 'hidden'; root.dataset.veil = 'done';
        done = true; return;
      }
      if (done) { veil.style.visibility = ''; done = false; }
      root.dataset.veil = 'on';
      const t = (now - t0) / 1000;

      // repère du pli : coin bas-droit C, direction u vers le haut-gauche, v perpendiculaire
      const Cx = W + PAD, Cy = H + PAD;
      let ux = -(W + 2 * PAD), uy = -(H + 2 * PAD);
      const D = Math.hypot(ux, uy); ux /= D; uy /= D;
      const vx = -uy, vy = ux;
      const r = clamp(Math.min(W, H) * 0.085, 34, 86);
      const f0 = r * 1.5; // coin déjà légèrement soulevé avant le premier défilement
      const f = f0 + ease(p) * (D + Math.PI * r * 1.25 - f0);
      const persp = 1500, cxs = W / 2, cys = H / 2;
      const wob = 1 - p * 0.6;

      // projection d'un point du drap (a, b) → écran (x, y, z)
      const place = (a: number, b: number, out: Float32Array, o: number) => {
        let a2 = a, z = 0, b2 = b;
        if (a < f) {
          const arc = f - a;
          if (arc <= Math.PI * r) { const th = arc / r; a2 = f - r * Math.sin(th); z = r * (1 - Math.cos(th)); }
          // au-delà du rouleau, le voile ne retombe pas à plat : il monte vers l'avion (vers nous)
          else { const e = arc - Math.PI * r; a2 = f + e * LIFT_K; z = 2 * r + Math.min(e * 0.32, LIFT_Z); }
          // tension : plis qui rayonnent vers le coin tiré par l'avion, et ondulation du voile
          const k = clamp(arc / (D * 0.5));
          const phi = Math.atan2(b, Math.max(a, 1));
          z += (5 + 12 * k) * Math.sin(phi * 6 + arc * 0.01 - t * 2.2) * k * wob;
          z += 10 * Math.sin(arc * 0.018 - t * 3.0 + b * 0.004) * k;
          b2 = b * (1 - 0.05 * k);
        } else {
          // drap encore posé : légère respiration du tissu
          z = 2.2 * Math.sin(a * 0.011 + t * 0.9) * Math.sin(b * 0.009 - t * 0.6) * wob;
        }
        const X = Cx + a2 * ux + b2 * vx, Y = Cy + a2 * uy + b2 * vy;
        const s = persp / (persp - z);
        out[o] = cxs + (X - cxs) * s; out[o + 1] = cys + (Y - cys) * s; out[o + 2] = z;
      };

      if (prog && gl) {
        // maillage
        for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
          const x = -PAD + (i / cols) * (W + 2 * PAD), y = -PAD + (j / rows) * (H + 2 * PAD);
          const a = (x - Cx) * ux + (y - Cy) * uy, b = (x - Cx) * vx + (y - Cy) * vy;
          const o = (j * (cols + 1) + i);
          place(a, b, pos, o * 3);
          // ombre du rabat sur la partie encore posée
          sh[o] = a;
        }
        // normales (différences entre voisins)
        for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
          const o = j * (cols + 1) + i;
          const iL = Math.max(0, i - 1), iR = Math.min(cols, i + 1), jU = Math.max(0, j - 1), jD = Math.min(rows, j + 1);
          const A = (j * (cols + 1) + iL) * 3, B = (j * (cols + 1) + iR) * 3, Cc = (jU * (cols + 1) + i) * 3, Dd = (jD * (cols + 1) + i) * 3;
          const tx = pos[B] - pos[A], ty = pos[B + 1] - pos[A + 1], tz = pos[B + 2] - pos[A + 2];
          const sx = pos[Dd] - pos[Cc], sy = pos[Dd + 1] - pos[Cc + 1], sz = pos[Dd + 2] - pos[Cc + 2];
          // y vers le bas à l'écran : on retourne pour avoir z vers l'observateur
          nor[o * 3] = -(ty * sz - tz * sy); nor[o * 3 + 1] = -(tz * sx - tx * sz); nor[o * 3 + 2] = -(tx * sy - ty * sx);
        }
        gl.viewport(0, 0, cv.width, cv.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // 1. ombre sur la page dévoilée
        gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        if (prog2) {
          gl.useProgram(prog2);
          gl.uniform2f(gl.getUniformLocation(prog2, 'uC'), Cx, Cy); gl.uniform2f(gl.getUniformLocation(prog2, 'uU'), ux, uy);
          gl.uniform1f(gl.getUniformLocation(prog2, 'uF'), f); gl.uniform1f(gl.getUniformLocation(prog2, 'uR'), r);
          gl.uniform1f(gl.getUniformLocation(prog2, 'uDpr'), dpr); gl.uniform2f(gl.getUniformLocation(prog2, 'uRes'), W, H);
          const la = gl.getAttribLocation(prog2, 'aP');
          gl.bindBuffer(gl.ARRAY_BUFFER, bQuad); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(la);
        }
        // 2. le drap
        gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
        gl.useProgram(prog);
        gl.uniform2f(gl.getUniformLocation(prog, 'uRes'), W, H); gl.uniform1f(gl.getUniformLocation(prog, 'uDpr'), dpr);
        gl.uniform1f(gl.getUniformLocation(prog, 'uF'), f); gl.uniform1f(gl.getUniformLocation(prog, 'uR'), r);
        gl.uniform1f(gl.getUniformLocation(prog, 'uEnd'), f + LIFT_K * Math.max(0, f - Math.PI * r));
        const bind = (buf: WebGLBuffer | null, data: Float32Array, name: string, size: number) => {
          const l = gl.getAttribLocation(prog!, name);
          gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
          gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
        };
        bind(bPos, pos, 'aPos', 3); bind(bN, nor, 'aN', 3); bind(bSh, sh, 'aSh', 1);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
        gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0);
      } else if (ctx2) {
        // secours : drap plat dont la partie encore posée se réduit
        ctx2.setTransform(dpr, 0, 0, dpr, 0, 0); ctx2.clearRect(0, 0, W, H);
        ctx2.fillStyle = '#fbfaf6';
        const ex = Cx + f * ux, ey = Cy + f * uy, L = 4 * D;
        ctx2.beginPath();
        ctx2.moveTo(ex + vx * L, ey + vy * L); ctx2.lineTo(ex - vx * L, ey - vy * L);
        ctx2.lineTo(ex - vx * L + ux * L, ey - vy * L + uy * L); ctx2.lineTo(ex + vx * L + ux * L, ey + vy * L + uy * L);
        ctx2.closePath(); ctx2.fill();
      }

      // ——— l'avion : il tire le coin du drap (point a = 0, b = 0) au bout de deux câbles
      const corner = new Float32Array(3), k1 = new Float32Array(3), k2 = new Float32Array(3);
      place(0, 0, corner, 0);
      const span = Math.min(W, H) * 0.06;
      place(span * 0.9, span, k1, 0); place(span * 0.9, -span, k2, 0);
      const depth = 1500 / (1500 - corner[2]);
      const planeW = clamp(Math.min(W, H) * 0.3, 130, 240) * Math.min(depth, 1.6);
      const ropeL = clamp(Math.min(W, H) * 0.17, 70, 150);
      const bob = Math.sin(t * 1.7) * 4 * wob, roll = Math.sin(t * 1.3) * 2.5;
      const px = corner[0] + ux * (ropeL + planeW * 0.5) + vx * bob;
      const py = corner[1] + uy * (ropeL + planeW * 0.5) + vy * bob;
      const ang = Math.atan2(uy, ux) * 57.2958 + 180;
      const plane = planeRef.current;
      if (plane) {
        plane.style.width = `${planeW}px`;
        plane.style.transform = `translate3d(${(px - planeW / 2).toFixed(1)}px,${(py - planeW * 0.213).toFixed(1)}px,0) rotate(${(ang + roll).toFixed(2)}deg) scaleX(-1)`;
      }
      // câbles : de la queue de l'avion vers deux points du bord du drap, avec un léger fléchissement
      const tx = px - ux * planeW * 0.4, ty = py - uy * planeW * 0.4;
      const sag = 10 + 8 * Math.sin(t * 2.1);
      const curve = (k: Float32Array) => {
        const mx = (tx + k[0]) / 2 + vx * 0 + 0, my = (ty + k[1]) / 2 + sag;
        return `M${tx.toFixed(1)} ${ty.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${k[0].toFixed(1)} ${k[1].toFixed(1)}`;
      };
      ropeRef.current?.setAttribute('d', curve(k1));
      rope2Ref.current?.setAttribute('d', curve(k2));
      if (hintRef.current) hintRef.current.style.opacity = `${clamp(1 - p * 7)}`;

      raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const onResize = () => { resize(); kick(); };
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', onResize);
    veil.classList.add('ready');
    kick();
    return () => {
      window.removeEventListener('scroll', kick); window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      delete root.dataset.veil;
    };
  }, []);

  return (
    <>
      <div className="veil-pin" ref={pinRef}>
        {children}
        <div className="veil-runway" ref={runRef} aria-hidden="true" />
      </div>
      <div className="veil" ref={veilRef} aria-hidden="true">
        <canvas ref={canRef} />
        <svg className="veil-ropes"><path ref={ropeRef} /><path ref={rope2Ref} /></svg>
        <div className="veil-plane" ref={planeRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/avion-3d.png" alt="" width={445} height={190} />
          <span className="veil-prop" />
        </div>
        <div className="veil-hint" ref={hintRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="" width={457} height={360} />
          <span>{labels.hint}</span>
          <i />
        </div>
      </div>
    </>
  );
}
