/* Leg Scan measuring pipeline.
   A standard bank card (85.60 x 53.98 mm) lies flat on the floor. From it the app recovers
   the camera's position and the floor plane, separates the leg and foot from the background,
   and measures them in real millimetres. Runs entirely in the browser with OpenCV.js. */
(function(){
"use strict";
const CW = 85.60, CH = 53.98;

let cvReady = null;
/* The OpenCV module is "thenable", so it is wrapped in a plain object before resolving a promise with it. */
function getCV(){
  if (cvReady) return cvReady;
  cvReady = new Promise((resolve, reject) => {
    const t0 = Date.now(); let hooked = false, done = false;
    const finish = m => { if (done) return; done = true; window.cv = m; resolve({ cv: m }); };
    (function wait(){
      if (done) return;
      const c = window.cv;
      if (c && c.Mat && c.imread) return finish(c);
      if (c && typeof c.then === "function" && !c.Mat && !hooked){ hooked = true; c.then(m => finish(m)); }
      else if (c && !c.Mat && !hooked){ hooked = true; const prev = c.onRuntimeInitialized; c.onRuntimeInitialized = () => { if (prev) prev(); finish(window.cv); }; }
      if (Date.now() - t0 > 120000) return reject(new Error("Measuring tools did not load"));
      setTimeout(wait, 100);
    })();
  });
  return cvReady;
}

/* ---------- small helpers ---------- */
const dimsOf = img => [img.naturalWidth || img.videoWidth || img.width, img.naturalHeight || img.videoHeight || img.height];
function canvasOf(img, maxDim){
  const [iw, ih] = dimsOf(img);
  const s = Math.min(1, maxDim / Math.max(iw, ih));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(iw * s)); c.height = Math.max(1, Math.round(ih * s));
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
  return { c, s, w: c.width, h: c.height, g };
}
function grayOf(cv){ // Float32 luminance of a canvas
  const d = cv.g.getImageData(0, 0, cv.w, cv.h).data, out = new Float32Array(cv.w * cv.h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = .299*d[j] + .587*d[j+1] + .114*d[j+2];
  return { w: cv.w, h: cv.h, d: out };
}
function samp(G, x, y){
  x = Math.max(0, Math.min(G.w - 1.001, x)); y = Math.max(0, Math.min(G.h - 1.001, y));
  const x0 = x|0, y0 = y|0, fx = x - x0, fy = y - y0, i = y0*G.w + x0, d = G.d;
  return (d[i]*(1-fx) + d[i+1]*fx)*(1-fy) + (d[i+G.w]*(1-fx) + d[i+G.w+1]*fx)*fy;
}
function edgeAlong(G, p, n, r){
  let best = -1, bs = 0; const gs = [], ss = [];
  for (let s = -r; s <= r + 1e-9; s += .5){
    const g = Math.abs(samp(G, p[0]+(s+.75)*n[0], p[1]+(s+.75)*n[1]) - samp(G, p[0]+(s-.75)*n[0], p[1]+(s-.75)*n[1]));
    gs.push(g); ss.push(s); if (g > best){ best = g; bs = gs.length-1; }
  }
  let s = ss[bs];
  if (bs > 0 && bs < gs.length-1){ const a=gs[bs-1], b=gs[bs], c=gs[bs+1], den=a-2*b+c; if (den < 0) s += .5*(.5*(a-c)/den); }
  return [p[0]+s*n[0], p[1]+s*n[1]];
}
const med = a => { const b = Float64Array.from(a).sort(); return b.length ? b[b.length>>1] : NaN; };
function fitLine(P){
  let pts = P.slice(), L = null;
  for (let it = 0; it < 4; it++){
    if (pts.length < 6) return null;
    let mx=0,my=0; pts.forEach(p=>{mx+=p[0];my+=p[1];}); mx/=pts.length; my/=pts.length;
    let xx=0,yy=0,xy=0; pts.forEach(p=>{const dx=p[0]-mx,dy=p[1]-my; xx+=dx*dx; yy+=dy*dy; xy+=dx*dy;});
    const ph = .5*Math.atan2(2*xy, xx-yy), d = [Math.cos(ph), Math.sin(ph)], nn = [-d[1], d[0]];
    L = { m:[mx,my], d };
    const res = pts.map(p => Math.abs((p[0]-mx)*nn[0] + (p[1]-my)*nn[1]));
    const tol = Math.max(.8, 2.5*med(res)), keep = pts.filter((p,i) => res[i] <= tol);
    if (keep.length === pts.length) break; pts = keep;
  }
  return L;
}
function cross2(L1, L2){
  const det = L1.d[0]*(-L2.d[1]) - L1.d[1]*(-L2.d[0]); if (Math.abs(det) < 1e-12) return null;
  const bx = L2.m[0]-L1.m[0], by = L2.m[1]-L1.m[1], t = (bx*(-L2.d[1]) - by*(-L2.d[0]))/det;
  return [L1.m[0]+t*L1.d[0], L1.m[1]+t*L1.d[1]];
}
const V = {
  sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
  mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s], dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  norm:a=>Math.hypot(a[0],a[1],a[2]), unit:a=>{ const n=Math.hypot(a[0],a[1],a[2]); return [a[0]/n,a[1]/n,a[2]/n]; }
};
const horiz = (v, n) => V.sub(v, V.mul(n, V.dot(v, n)));

/* ---------- EXIF: 35 mm-equivalent focal length ---------- */
async function focal35(file){
  try {
    if (!file) return null;
    const buf = new DataView(await file.slice(0, 196608).arrayBuffer());
    if (buf.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while (off < buf.byteLength - 4){
      const marker = buf.getUint16(off), len = buf.getUint16(off+2);
      if (marker === 0xFFE1 && buf.getUint32(off+4) === 0x45786966){
        const t = off + 10, le = buf.getUint16(t) === 0x4949, u16 = o => buf.getUint16(t+o, le), u32 = o => buf.getUint32(t+o, le);
        const readIFD = (o, want) => { const n = u16(o); for (let i = 0; i < n; i++){ const e = o + 2 + i*12; if (u16(e) === want) return e; } return null; };
        const ifd0 = u32(4), exifPtr = readIFD(ifd0, 0x8769); if (exifPtr == null) return null;
        const e = readIFD(u32(exifPtr+8), 0xA405); if (e == null) return null;
        const v = u16(e+8); return v > 10 && v < 300 ? v : null;
      }
      if ((marker & 0xFF00) !== 0xFF00) break;
      off += 2 + len;
    }
  } catch(e){}
  return null;
}

/* ---------- card on the floor ---------- */
/* Card candidates are tried from largest to smallest; `accept` rejects white shapes that are not lying on the floor
   (a shirt hem, paper on a wall, a card held in the hand). */
/* Where the setup instructions put the card, as fractions of the photo (left, top, right, bottom) and the
   expected spot. Front: on the floor beside the ankle. Side: on the floor in front of the foot.
   Foot: on the floor in front of the toes. Nothing outside this area is considered. */
const CARD_ZONE = {
  front: { box: [0, .50, 1, 1],   spot: [.5, .78] },
  side:  { box: [0, .58, 1, 1],   spot: [.5, .86] },
  foot:  { box: [0, .45, 1, 1],   spot: [.5, .80] }
};
function findCard(cv, img, full, seed, accept, mode, size){
  // a card seen from farther away is small: if none is found at the normal working size, look again in more detail
  if (!size){ const r = findCard(cv, img, full, seed, accept, mode, 900); if (r || seed) return r;
    return Math.max(...dimsOf(img)) > 1300 ? findCard(cv, img, full, seed, accept, mode, 1400) : null; }
  const sm = canvasOf(img, size), k = full.w / sm.w;
  const rgba = cv.imread(sm.c), rgb = new cv.Mat(), hsv = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB); cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  const m = new cv.Mat(sm.h, sm.w, cv.CV_8UC1), hd = hsv.data, md = m.data;
  for (let i = 0, j = 0; i < md.length; i++, j += 3){
    const H = hd[j], S = hd[j+1], Vv = hd[j+2];
    md[i] = seed ? ((Vv > 150 && S < 130) ? 255 : 0)
                 : ((Vv > 185 && (S < 45 || (H > 75 && H < 130 && S < 120))) ? 255 : 0);
  }
  const ker = cv.Mat.ones(7, 7, cv.CV_8U); cv.morphologyEx(m, m, cv.MORPH_CLOSE, ker);
  const cs = new cv.MatVector(), hier = new cv.Mat();
  cv.findContours(m, cs, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
  const N = sm.w * sm.h; const cands = [];
  for (let i = 0; i < cs.size(); i++){
    const c = cs.get(i), a = cv.contourArea(c), br = cv.boundingRect(c);
    let ok = a >= N*.0004 && a <= N*.08 && br.x > 1 && br.y > 1 && br.x+br.width < sm.w-1 && br.y+br.height < sm.h-1;
    if (seed) ok = a >= N*.0005 && cv.pointPolygonTest(c, new cv.Point(seed[0]*sm.s, seed[1]*sm.s), false) >= 0;
    if (ok){
      const hull = new cv.Mat(); cv.convexHull(c, hull, false, true);
      const peri = cv.arcLength(hull, true); let q = null;
      for (let e = .01; e <= .08; e += .005){ const ap = new cv.Mat(); cv.approxPolyDP(hull, ap, e*peri, true); if (ap.rows <= 4){ q = ap; break; } ap.delete(); }
      if (q && q.rows === 4){
        const qa = cv.contourArea(q), fill = a/qa;
        if (fill >= (seed ? .7 : .78)){ const sc = a*fill;
          const P = []; for (let r = 0; r < 4; r++) P.push([(q.data32S[r*2]+.5)*k, (q.data32S[r*2+1]+.5)*k]);
          const cx = P.reduce((a,p)=>a+p[0],0)/4/full.w, cy = P.reduce((a,p)=>a+p[1],0)/4/(full.h || sm.h*k), z = CARD_ZONE[mode];
          if (!z || seed) cands.push({ sc, P });
          else if (cx >= z.box[0] && cx <= z.box[2] && cy >= z.box[1] && cy <= z.box[3])
            cands.push({ sc: 1 / (1e-3 + Math.hypot(cx - z.spot[0], (cy - z.spot[1])*1.5)), P }); }
      }
      if (q) q.delete(); hull.delete();
    }
    c.delete();
  }
  [rgba, rgb, hsv, m, ker, cs, hier].forEach(x => x.delete());
  cands.sort((a, b) => b.sc - a.sc);
  for (const c of cands) if (!accept || accept(c.P)) return c.P;
  return null;
}
const floorCard = (cv, f, W, H) => P => {
  const c = pose(cv, P, f, W, H); if (!c) return false;
  const side = Math.sqrt(Math.abs((P[1][0]-P[0][0])*(P[2][1]-P[0][1]) - (P[2][0]-P[0][0])*(P[1][1]-P[0][1])));
  // must lie on the floor, at a sensible distance, and have the shape of a real card seen in perspective
  return c.n[1] <= -0.2 && c.dist > 150 && c.dist < 3000 && c.err < Math.max(1.2, .045*side);
};
function refineQuad(G, q){
  const c = [(q[0][0]+q[1][0]+q[2][0]+q[3][0])/4, (q[0][1]+q[1][1]+q[2][1]+q[3][1])/4], lines = [];
  const r = Math.max(6, G.w/240);
  for (let i = 0; i < 4; i++){
    const A = q[i], B = q[(i+1)%4], len = Math.hypot(B[0]-A[0], B[1]-A[1]), d = [(B[0]-A[0])/len, (B[1]-A[1])/len];
    let n = [-d[1], d[0]]; if (((A[0]+B[0])/2-c[0])*n[0] + ((A[1]+B[1])/2-c[1])*n[1] < 0) n = [-n[0], -n[1]];
    const pts = []; for (let j = 0; j < 40; j++){ const t = .15 + .7*j/39; pts.push(edgeAlong(G, [A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t], n, r)); }
    const L = fitLine(pts); if (!L) return null; lines.push(L);
  }
  const C = [cross2(lines[3],lines[0]), cross2(lines[0],lines[1]), cross2(lines[1],lines[2]), cross2(lines[2],lines[3])];
  return C.some(x => !x) ? null : C;
}
function pose(cv, C, f, W, H){
  const K = cv.matFromArray(3, 3, cv.CV_64F, [f,0,W/2, 0,f,H/2, 0,0,1]), dist = cv.Mat.zeros(4, 1, cv.CV_64F);
  const obj = cv.matFromArray(4, 1, cv.CV_64FC3, [0,0,0, CW,0,0, CW,CH,0, 0,CH,0]);
  let best = null;
  for (let rot = 0; rot < 2; rot++){
    const Cr = [0,1,2,3].map(i => C[(i+rot)%4]);
    const ip = cv.matFromArray(4, 1, cv.CV_64FC2, Cr.flat()), rv = new cv.Mat(), tv = new cv.Mat();
    const ok = cv.solvePnP(obj, ip, K, dist, rv, tv, false, cv.SOLVEPNP_IPPE);
    if (ok){
      const pr = new cv.Mat(); cv.projectPoints(obj, rv, tv, K, dist, pr);
      let err = 0; for (let i = 0; i < 4; i++) err += Math.hypot(pr.data64F[i*2]-Cr[i][0], pr.data64F[i*2+1]-Cr[i][1]); err /= 4;
      pr.delete();
      if (!best || err < best.err){ const R = new cv.Mat(); cv.Rodrigues(rv, R);
        best = { err, R: Array.from(R.data64F), t: Array.from(tv.data64F) }; R.delete(); }
    }
    ip.delete(); rv.delete(); tv.delete();
  }
  K.delete(); dist.delete(); obj.delete();
  if (!best) return null;
  const R = best.R, col = j => [R[j], R[3+j], R[6+j]];
  let n = col(2); if (V.dot(n, best.t) > 0) n = V.mul(n, -1); // floor normal pointing up, toward the camera side
  const toCam = (X,Y) => V.add([R[0]*X+R[1]*Y, R[3]*X+R[4]*Y, R[6]*X+R[7]*Y], best.t);
  return { f, cx: W/2, cy: H/2, t: best.t, n, err: best.err, center: toCam(CW/2, CH/2), dist: V.norm(toCam(CW/2, CH/2)) };
}
const rayOf = (cam, p) => [(p[0]-cam.cx)/cam.f, (p[1]-cam.cy)/cam.f, 1];
function hit(cam, p, n, P0){ const d = rayOf(cam, p), den = V.dot(n, d); if (Math.abs(den) < 1e-9) return null; return V.mul(d, V.dot(n, P0)/den); }

/* ---------- leg and foot outline ---------- */
/* Leg outline. The measured leg is expected in the middle of the photo (the live camera shows a guide band).
   Everything near the left and right edges is treated as background, so the app learns that room's wall and
   floor colors from the photo itself, then separates the leg (GrabCut). No fixed skin or clothing colors are assumed. */
const BAND = { front: [.30, .70], side: [.14, .86], foot: [.18, .82] };
/* Where is the measured leg? The setup instructions say the card lies on the floor right beside the measured ankle
   (front photo). So the app looks along the floor at the card's level for the nearest thing that is not floor:
   that is the measured foot. Using the card's position on the floor, it then works out where the shin must be
   above that foot (120 to 380 mm up), and only that line is taken as "definitely leg". Nothing is assumed about
   where in the picture the leg is. Returns null when the foot can't be found next to the card. */
function locateLeg(rgb, W, H, k, cardQ, cam, by){
  if (!cardQ || !cam) return null;
  const rd = rgb.data, bin = i => ((rd[i*3]>>4)<<8) | ((rd[i*3+1]>>4)<<4) | (rd[i*3+2]>>4);
  // floor colors: the strip at the bottom of the photo, which the instructions keep clear (floor below the foot)
  const fh = new Uint32Array(4096); let fn = 0;
  for (let y = by; y < H; y++) for (let x = 0; x < W; x++){ fh[bin(y*W+x)]++; fn++; }
  const thr = Math.max(2, fn * .002);
  const Q = cardQ.map(p => [p[0]/k, p[1]/k]);
  const qcx = Q.reduce((a,p)=>a+p[0],0)/4, qcy = Q.reduce((a,p)=>a+p[1],0)/4;
  const qx0 = Math.min(...Q.map(p=>p[0])), qx1 = Math.max(...Q.map(p=>p[0])), qy0 = Math.min(...Q.map(p=>p[1])), qy1 = Math.max(...Q.map(p=>p[1]));
  const pxmm = Math.hypot(Q[1][0]-Q[0][0], Q[1][1]-Q[0][1]) > Math.hypot(Q[2][0]-Q[1][0], Q[2][1]-Q[1][1])
    ? Math.hypot(Q[1][0]-Q[0][0], Q[1][1]-Q[0][1]) / 85.6 : Math.hypot(Q[2][0]-Q[1][0], Q[2][1]-Q[1][1]) / 85.6;
  // look across the rows level with the card (from its top edge to its middle)
  const r0 = Math.max(0, Math.round(qy0)), r1 = Math.min(H-1, Math.round(qcy)); if (r1 < r0) return null;
  const frac = new Float32Array(W);
  for (let x = 0; x < W; x++){ let c = 0, t = 0; for (let y = r0; y <= r1; y++){ t++; if (fh[bin(y*W+x)] < thr) c++; } frac[x] = c / t; }
  const runs = []; let st = -1;
  for (let x = 0; x <= W; x++){
    const on = x < W && frac[x] > .5 && !(x >= qx0 - 2 && x <= qx1 + 2);
    if (on && st < 0) st = x; if (!on && st >= 0){ runs.push([st, x-1]); st = -1; }
  }
  // merge small gaps, then keep foot-sized pieces (35 to 200 mm wide)
  const m = []; for (const r of runs){ const l = m[m.length-1]; if (l && r[0] - l[1] < 6*pxmm) l[1] = r[1]; else m.push(r.slice()); }
  const feet = m.filter(r => { const w = (r[1]-r[0]+1)/pxmm; return w >= 35 && w <= 200; });
  if (!feet.length) return null;
  const gap = r => r[0] > qcx ? r[0] - qx1 : qx0 - r[1];
  feet.sort((a, b) => gap(a) - gap(b));
  const foot = feet[0]; if (gap(foot) > 150*pxmm) return null; // the card must be right beside the foot
  const fx = (foot[0] + foot[1]) / 2;
  // the shin, straight up from that foot
  const F = hit(cam, [fx*k, qcy*k], cam.n, cam.t); if (!F) return null;
  const line = [];
  for (let h = 120; h <= 380; h += 10){ const X = V.add(F, V.mul(cam.n, h)); if (X[2] <= 0) continue;
    line.push([(cam.f*X[0]/X[2] + cam.cx)/k, (cam.f*X[1]/X[2] + cam.cy)/k]); }
  if (line.length < 5) return null;
  // the toes can reach at most about 22 cm in front of the card (it lies beside the ankle); the floor nearer the
  // camera than that is background
  const toward = V.unit(horiz(V.mul(cam.center, -1), cam.n)), T = V.add(cam.center, V.mul(toward, 220));
  const floorRow = T[2] > 0 ? (cam.f*T[1]/T[2] + cam.cy)/k : H;
  return { x: fx, foot, line, pxmm, half: Math.max(3, Math.round(15*pxmm)), floorRow: Math.max(qcy, Math.min(H, floorRow)) };
}
function segment(cv, img, full, cardQ, maxDim, iters, mode, paint, cam){
  const sm = canvasOf(img, maxDim || 800), k = full.w / sm.w, W = sm.w, H = sm.h, N = W*H;
  const rgba = cv.imread(sm.c), rgb = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  const by = Math.round(H*.94);   // floor showing below the foot
  const loc = mode === "front" ? locateLeg(rgb, W, H, k, cardQ, cam, by) : null;
  const band = BAND[mode] || BAND.side;
  let bx0 = Math.round(W*band[0]), bx1 = Math.round(W*band[1]);
  if (loc){ // guide band centred on the located leg instead of on the middle of the photo
    // wide enough for the largest calf on the size charts (about 21 cm across) with room to spare
    const hw = Math.max(W*.08, 230*loc.pxmm); bx0 = Math.max(0, Math.round(loc.x - hw)); bx1 = Math.min(W, Math.round(loc.x + hw)); }
  const mask = new cv.Mat(H, W, cv.CV_8UC1);
  // a narrow strip that is definitely leg: on the located shin, or (no card yet) down the middle of the guide band
  const cx = (bx0 + bx1)/2, cw = Math.max(3, Math.round(W*.025)), fy0 = Math.round(H*.18), fy1 = Math.round(H*.55);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    let v = (x < bx0 || x >= bx1 || y >= by || (loc && y >= loc.floorRow)) ? cv.GC_BGD : cv.GC_PR_FGD;
    if (!loc && y >= fy0 && y < fy1 && Math.abs(x - cx) <= cw) v = cv.GC_FGD;
    mask.data[y*W+x] = v;
  }
  const seedPts = [];
  if (loc) for (const [lx, ly] of loc.line){ const yy = Math.round(ly); if (yy < 0 || yy >= H) continue;
    for (let x = Math.max(0, Math.round(lx - loc.half)); x <= Math.min(W-1, Math.round(lx + loc.half)); x++) mask.data[yy*W+x] = cv.GC_FGD;
    // fill between sampled heights
    seedPts.push([lx, yy]); }
  for (let i = 1; i < seedPts.length; i++){ const [ax, ay] = seedPts[i-1], [bx, byy] = seedPts[i];
    for (let y = Math.min(ay, byy); y <= Math.max(ay, byy); y++){ const t = ay === byy ? 0 : (y - ay)/(byy - ay), lx = ax + (bx - ax)*t;
      for (let x = Math.max(0, Math.round(lx - loc.half)); x <= Math.min(W-1, Math.round(lx + loc.half)); x++) mask.data[y*W+x] = cv.GC_FGD; } }
  // colors seen in the background strips: inside the band, matching pixels start as "probably background"
  const rd = rgb.data, bin = i => ((rd[i*3]>>4)<<8) | ((rd[i*3+1]>>4)<<4) | (rd[i*3+2]>>4), hist = new Uint32Array(4096);
  let hn = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = y*W+x, edge = y >= by || (mode !== "front" && (x < bx0 || x >= bx1)) || (mode === "front" && y < H*.25 && (x < bx0 || x >= bx1));
    if (edge){ hist[bin(i)]++; hn++; }
  }
  const thr = Math.max(3, hn * .0015);
  for (let i = 0; i < N; i++) if (mask.data[i] === cv.GC_PR_FGD && hist[bin(i)] >= thr) mask.data[i] = cv.GC_PR_BGD;
  if (cardQ){
    const pts = cv.matFromArray(4, 1, cv.CV_32SC2, cardQ.flatMap(p => [Math.round(p[0]/k), Math.round(p[1]/k)]));
    const mv = new cv.MatVector(); mv.push_back(pts); cv.fillPoly(mask, mv, new cv.Scalar(cv.GC_BGD)); mv.delete(); pts.delete();
    // side photo: the card lies between the phone and the foot, so everything lower in the photo than the card's middle is floor
    if (mode === "side"){ const cyc = cardQ.reduce((a,p) => a + p[1], 0)/4/k; for (let y = Math.max(0, Math.round(cyc)); y < H; y++) for (let x = 0; x < W; x++) mask.data[y*W+x] = cv.GC_BGD; }
  }
  // clinician corrections: taps marking "not leg" or "leg"
  if (paint) for (const pt of paint){
    const px = pt.x/k, py = pt.y/k, r = Math.max(4, pt.r/k), val = pt.leg ? cv.GC_FGD : cv.GC_BGD;
    for (let y = Math.max(0, Math.floor(py-r)); y <= Math.min(H-1, py+r); y++) for (let x = Math.max(0, Math.floor(px-r)); x <= Math.min(W-1, px+r); x++)
      if ((x-px)*(x-px) + (y-py)*(y-py) <= r*r) mask.data[y*W+x] = val;
  }
  const bgd = new cv.Mat(), fgd = new cv.Mat();
  cv.grabCut(rgb, mask, new cv.Rect(0, 0, 1, 1), bgd, fgd, iters || 5, cv.GC_INIT_WITH_MASK);
  const fg = new cv.Mat(H, W, cv.CV_8UC1);
  for (let i = 0; i < N; i++) fg.data[i] = (mask.data[i] === cv.GC_FGD || mask.data[i] === cv.GC_PR_FGD) ? 1 : 0;
  const k5 = cv.Mat.ones(5, 5, cv.CV_8U), ko = cv.Mat.ones(Math.max(5, Math.round(W/90))|1, Math.max(5, Math.round(W/90))|1, cv.CV_8U); cv.morphologyEx(fg, fg, cv.MORPH_OPEN, ko);
  // keep the piece that runs down the middle of the photo
  const lab = new cv.Mat(), st = new cv.Mat(), ce = new cv.Mat();
  const n = cv.connectedComponentsWithStats(fg, lab, st, ce, 8, cv.CV_32S), score = new Float64Array(n);
  if (seedPts.length){ for (const [lx, ly] of seedPts){ const l = lab.data32S[ly*W + Math.round(lx)]; if (l) score[l]++; } }
  else { const cx0 = Math.round(W*.42), cx1 = Math.round(W*.58); for (let y = 0; y < H; y++) for (let x = cx0; x < cx1; x++){ const l = lab.data32S[y*W+x]; if (l) score[l]++; } }
  let bi = 0; for (let i = 1; i < n; i++) if (score[i] > score[bi]) bi = i;
  for (let i = 0; i < N; i++) fg.data[i] = (bi && lab.data32S[i] === bi) ? 1 : 0;
  const filled = new cv.Mat(H, W, cv.CV_8UC1), cs = new cv.MatVector(), hier = new cv.Mat();
  cv.findContours(fg, cs, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  filled.setTo(new cv.Scalar(0)); cv.drawContours(filled, cs, -1, new cv.Scalar(1), -1);
  const out = Uint8Array.from(filled.data);
  const outline = []; for (let i = 0; i < cs.size(); i++){ const c = cs.get(i); const pts = []; for (let r = 0; r < c.rows; r++) pts.push([(c.data32S[r*2]+.5)*k, (c.data32S[r*2+1]+.5)*k]); outline.push(pts); c.delete(); }
  [rgba, rgb, mask, bgd, fgd, fg, k5, ko, lab, st, ce, filled, cs, hier].forEach(x => x.delete());
  let area = 0; for (let i = 0; i < N; i++) area += out[i];
  const seed = seedPts.length ? seedPts[seedPts.length >> 1] : null;
  return { m: out, W, H, k, outline, area: area/N, band: [bx0*k, bx1*k], seed, located: !!loc, legX: loc ? loc.x*k : null };
}

/* ---------- measuring ---------- */
/* For each row, the span of ONE leg: rows can contain several separate runs (two legs, a hand, the other foot).
   The run followed is the widest one in the upper part of the outline, then tracked row by row, keeping the run
   whose center is closest to the row above or below. This stops the width from spanning both legs. */
function rowSpans(S){
  const runs = new Array(S.H);
  for (let y = 0; y < S.H; y++){
    const list = []; let st = -1;
    for (let x = 0; x <= S.W; x++){ const on = x < S.W && S.m[y*S.W+x]; if (on && st < 0) st = x; if (!on && st >= 0){ list.push([st, x-1]); st = -1; } }
    runs[y] = list;
  }
  let top = -1, bot = -1; runs.forEach((l,y) => { if (l.length){ if (top < 0) top = y; bot = y; } });
  const rows = new Array(S.H).fill(null); if (top < 0) return rows;
  // starting row: the located shin when known, otherwise the widest single run in the upper third of the outline
  let sy = top, sw = -1, sr = null;
  if (S.seed){ const y = S.seed[1], r = (runs[y] || []).find(r => r[0] <= S.seed[0] && r[1] >= S.seed[0]); if (r){ sy = y; sr = r; } }
  if (!sr) for (let y = top; y <= top + (bot-top)/3; y++) for (const r of runs[y]){ if (r[1]-r[0] > sw){ sw = r[1]-r[0]; sy = y; sr = r; } }
  rows[sy] = sr;
  const walk = (from, to, step) => { let c = (sr[0]+sr[1])/2, wPrev = sr[1]-sr[0];
    for (let y = from; y !== to; y += step){
      const l = runs[y]; if (!l.length) continue;
      let best = null, bd = Infinity; for (const r of l){ const d = Math.abs((r[0]+r[1])/2 - c); if (d < bd){ bd = d; best = r; } }
      if (bd > Math.max(20, wPrev)) continue; // jumped to a different object
      rows[y] = best; c = (best[0]+best[1])/2; wPrev = best[1]-best[0];
    } };
  walk(sy+1, bot+1, 1); walk(sy-1, top-1, -1);
  return rows;
}
function bandOf(S, rows){ let top = -1, bot = -1; rows.forEach((r,y) => { if (r){ if (top < 0) top = y; bot = y; } }); return [top, bot]; }
function trueWidth(w, D){ const h = w/2; return 2*h*D/Math.sqrt(D*D + h*h); } // round body seen from a finite distance
function profileInPlane(G, S, rows, cam, pn, P0, n){
  const prof = [], edges = [], r = Math.max(4, S.k*1.5);
  for (let y = 0; y < S.H; y++){
    const sp = rows[y]; if (!sp || sp[0] <= 1 || sp[1] >= S.W-2) continue;
    const Y = (y+.5)*S.k, a = edgeAlong(G, [sp[0]*S.k, Y], [-1,0], r), b = edgeAlong(G, [(sp[1]+1)*S.k, Y], [1,0], r);
    const A = hit(cam, a, pn, P0), B = hit(cam, b, pn, P0); if (!A || !B) continue;
    const mid = V.mul(V.add(A, B), .5), h = V.dot(V.sub(mid, P0), n);
    prof.push({ h, w: trueWidth(V.norm(horiz(V.sub(B, A), n)), V.norm(mid)) }); edges.push([a, b]);
  }
  prof.sort((p,q) => p.h - q.h);
  const smooth = prof.map((p,i) => ({ h: p.h, w: med(prof.slice(Math.max(0,i-3), i+4).map(q => q.w)) }));
  return { prof: smooth, edges };
}
function measureSide(G, S, cam){
  const rows = rowSpans(S), [top, bot] = bandOf(S, rows); if (top < 0) return null;
  const k = S.k, botY = new Int32Array(S.W).fill(-1);
  for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) if (S.m[y*S.W+x]) botY[x] = y;
  const band = bot - .12*(bot - top); let x0 = S.W, x1 = -1;
  for (let x = 0; x < S.W; x++) if (botY[x] >= band){ if (x < x0) x0 = x; if (x > x1) x1 = x; }
  if (x1 <= x0) return null;
  const L = x1 - x0, low = (a, b) => { let bx = a, by = -1; for (let x = Math.round(a); x <= Math.round(b); x++) if (botY[x] > by){ by = botY[x]; bx = x; } return [bx, by]; };
  const pa = low(x0, x0 + .15*L), pb = low(x1 - .15*L, x1);
  const G1 = hit(cam, [(pa[0]+.5)*k, (pa[1]+1)*k], cam.n, cam.t), G2 = hit(cam, [(pb[0]+.5)*k, (pb[1]+1)*k], cam.n, cam.t);
  if (!G1 || !G2) return null;
  const u = V.unit(horiz(V.sub(G2, G1), cam.n)), pn = V.unit(V.cross(u, cam.n));
  // foot length: the outline's farthest heel and toe points in the lowest part of the leg outline
  let li = null, ri = null;
  for (let y = Math.floor(band); y <= bot; y++){ const r = rows[y]; if (!r) continue; if (!li || r[0] < li[0]) li = [r[0], y]; if (!ri || r[1] > ri[0]) ri = [r[1], y]; }
  const eL = edgeAlong(G, [li[0]*k, (li[1]+.5)*k], [-1,0], Math.max(4, k*1.5)), eR = edgeAlong(G, [(ri[0]+1)*k, (ri[1]+.5)*k], [1,0], Math.max(4, k*1.5));
  const XL = hit(cam, eL, pn, G1), XR = hit(cam, eR, pn, G1);
  const footLen = Math.abs(V.dot(V.sub(XR, XL), u));
  const pr = profileInPlane(G, S, rows, cam, pn, G1, cam.n);
  return { pn, P0: G1, prof: pr.prof, edges: pr.edges, footLen, footLine: [eL, eR], top: pr.prof.length ? pr.prof[pr.prof.length-1].h : 0 };
}
function measureFront(G, S, cam){
  const rows = rowSpans(S), P0 = cam.center, pn = V.unit(horiz(V.unit(P0), cam.n));
  const pr = profileInPlane(G, S, rows, cam, pn, P0, cam.n);
  return { prof: pr.prof, edges: pr.edges, top: pr.prof.length ? pr.prof[pr.prof.length-1].h : 0 };
}
function measureFoot(G, S, cam){
  const rows = rowSpans(S), [top, bot] = bandOf(S, rows); if (top < 0) return null;
  const fwd = V.unit(horiz([0,0,1], cam.n)), side = V.cross(cam.n, fwd), k = S.k;
  let best = { w: 0 };
  for (let y = Math.floor(bot - .35*(bot - top)); y <= bot; y++){
    const sp = rows[y]; if (!sp || sp[0] <= 1 || sp[1] >= S.W-2) continue;
    const Y = (y+.5)*k, a = edgeAlong(G, [sp[0]*k, Y], [-1,0], Math.max(4, k*1.5)), b = edgeAlong(G, [(sp[1]+1)*k, Y], [1,0], Math.max(4, k*1.5));
    const A = hit(cam, a, cam.n, cam.t), B = hit(cam, b, cam.n, cam.t); if (!A || !B) continue;
    const w = Math.abs(V.dot(V.sub(B, A), side)); if (w > best.w) best = { w, line: [a, b] };
  }
  return best.w ? { width: best.w, widthLine: best.line } : null;
}

/* ---------- one photo, start to finish ---------- */
async function analyzePhoto(img, mode, opts){
  opts = opts || {};
  const cv = (await getCV()).cv;
  const full = canvasOf(img, 3000), G = grayOf(full), out = { mode, fs: full.w / img.naturalWidth, checks: [] };
  const F35 = opts.file ? await focal35(opts.file) : null;
  const f = opts.f ? opts.f*Math.max(full.w, full.h) : F35 ? F35/43.27*Math.hypot(full.w, full.h) : 0.72*Math.max(full.w, full.h);
  out.focalSource = F35 ? "photo" : "typical phone";
  let Q = findCard(cv, img, full, opts.seed || null, opts.seed ? null : floorCard(cv, f, full.w, full.h), mode);
  const C = Q ? refineQuad(G, Q) : null;
  let cam = C ? pose(cv, C, f, full.w, full.h) : null;
  if (cam && cam.n[1] > -0.2){ // the card's surface faces the camera instead of lying on the floor
    out.debugCard = { C, n: cam.n, dist: cam.dist }; cam = null;
    out.checks.push({ s:"bad", t:"The card isn't lying flat on the floor", fix:"Lay the card flat on the floor next to the foot, face down, and retake the photo." });
  } else if (!cam){
    out.needSeed = true;
    out.checks.push({ s:"bad", t:"Card not found on the floor", fix:"Make sure the whole card is in the photo, lying flat on the floor. If it's there, tap it in the photo." });
  }
  if (cam){
    out.card = C; out.cam = cam;
    out.checks.push({ s:"ok", t:"Card found and used to work out the camera angle and distance" });
    if (cam.dist < 250) out.checks.push({ s:"warn", t:"Very close to the floor card", fix:"Step back so the whole leg and the card fit with some space around them." });
    if (cam.dist > 1300 && mode !== "foot") out.checks.push({ s:"bad", t:`Too far away (about ${(cam.dist/1000).toFixed(1)} m from the card)`, fix:"Stand 60–90 cm (2–3 ft) from the leg so the lower leg fills most of the photo, then retake." });
  }
  const S = segment(cv, img, full, C, 800, 5, mode, opts.paint, cam);
  out.outline = S.outline;
  const what = mode === "foot" ? "Foot" : "Leg";
  if (S.area < .01){ out.checks.push({ s:"bad", t:`${what} not found`, fix:"Keep the leg in the middle of the photo with floor visible around the foot." }); }
  else out.checks.push({ s:"ok", t:`${what} outline found` });
  if (!cam || S.area < .01){ out.ok = false; return out; }
  if (mode === "side"){
    out.side = measureSide(G, S, cam);
    if (!out.side || out.side.prof.length < 20) out.checks.push({ s:"bad", t:"Couldn't measure the leg from the side", fix:"Retake with the whole foot and lower leg in view, card in front of the foot." });
    else if (out.side.footLen < 150 || out.side.footLen > 360) out.checks.push({ s:"warn", t:"Foot length looks unusual", fix:"Make sure the heel and toes are both fully in the photo." });
  } else if (mode === "front"){
    out.front = measureFront(G, S, cam);
    if (!out.front || out.front.prof.length < 20) out.checks.push({ s:"bad", t:"Couldn't measure the leg from the front", fix:"Retake with the lower leg and the card both in view." });
  } else {
    out.foot = measureFoot(G, S, cam);
    if (!out.foot) out.checks.push({ s:"bad", t:"Couldn't measure the foot", fix:"Retake with the whole foot and the card in view." });
  }
  out.ok = !out.checks.some(c => c.s === "bad");
  return out;
}

/* Height above the floor of a point the clinician taps on the side photo (full-resolution pixel coordinates). */
function heightAt(r, p){
  if (!r || !r.side || !r.cam) return null;
  const X = hit(r.cam, p, r.side.pn, r.side.P0); if (!X) return null;
  return V.dot(V.sub(X, r.side.P0), r.cam.n);
}
/* ---------- live check: runs several times a second on a small copy of the camera frame ----------
   Returns one status (red / amber / green), one instruction, checklist chips and overlay shapes.
   Measurements are NOT taken from these frames; they only decide whether the scene is ready. */
function liveCheck(source, mode, st){
  const cv = window.cv; if (!cv || !cv.Mat) return null;
  const sm = canvasOf(source, 360), W = sm.w, H = sm.h, N = W*H;
  const d = sm.g.getImageData(0, 0, W, H).data;
  // light and steadiness
  let sum = 0; const thumb = new Uint8Array(Math.ceil(W/4)*Math.ceil(H/4)); let ti = 0;
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4){ const i = (y*W+x)*4, Y = .299*d[i]+.587*d[i+1]+.114*d[i+2]; thumb[ti++] = Y; sum += Y; }
  const bright = sum / ti; let motion = 0;
  if (st.prev && st.prev.length === thumb.length){ for (let i = 0; i < thumb.length; i++) motion += Math.abs(thumb[i]-st.prev[i]); motion /= thumb.length; } else motion = 99;
  st.prev = thumb;
  // card
  const full = { w: W, h: H };
  const big = canvasOf(source, 720), Q = findCard(cv, big.c, full, null, floorCard(cv, 0.72*Math.max(W, H), W, H), mode);
  let cam = null, cardCut = false;
  if (Q){ const f = 0.72*Math.max(W, H); cam = pose(cv, Q, f, W, H); }
  // leg outline: same method as the measurement, run small with fewer passes
  const Sg = segment(cv, sm.c, full, Q, 360, 2, mode, null, cam), rows = rowSpans(Sg);
  let leg = null;
  if (Sg.area > .02){
    const rowW = new Int32Array(H), rowL = new Int32Array(H).fill(-1), rowR = new Int32Array(H).fill(-1);
    let y0 = -1, y1 = -1, x0 = W, x1 = 0;
    rows.forEach((r, y) => { if (!r) return; rowL[y] = r[0]; rowR[y] = r[1]; rowW[y] = r[1]-r[0]+1; if (y0 < 0) y0 = y; y1 = y; x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[1]); });
    if (y0 >= 0) leg = { x0, y0, x1, y1, rowW, rowL, rowR };
  }
  // card cut off at the bottom edge of the frame
  if (!Q){
    const rgba = cv.imread(sm.c), rgb = new cv.Mat(), hsv = new cv.Mat();
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB); cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    const hd = hsv.data, cardish = new cv.Mat(H, W, cv.CV_8UC1);
    for (let i = 0, j = 0; i < N; i++, j += 3){ const h = hd[j], s = hd[j+1], v = hd[j+2]; cardish.data[i] = (v > 185 && (s < 45 || (h > 75 && h < 130 && s < 120))) ? 255 : 0; }
    const l2 = new cv.Mat(), s2 = new cv.Mat(), c2 = new cv.Mat();
    const n2 = cv.connectedComponentsWithStats(cardish, l2, s2, c2, 8, cv.CV_32S);
    for (let i = 1; i < n2; i++){ const a = s2.intAt(i, cv.CC_STAT_AREA), y = s2.intAt(i, cv.CC_STAT_TOP), h = s2.intAt(i, cv.CC_STAT_HEIGHT);
      if (a > N*.001 && a < N*.03 && y + h >= H - 1 && y > H*.6) cardCut = true; }
    [rgba, rgb, hsv, cardish, l2, s2, c2].forEach(x => x.delete());
  }

  // ---------- decide ----------
  const chips = [], add = (k, ok) => chips.push({ k, ok });
  let msg = null, level = "green"; const issues = [];
  const fail = (text, lv, key) => { issues.push({ key: key || text, text, lv: lv || "red" }); if (!msg){ msg = text; level = lv || "red"; } };
  if (bright < 55) fail("Too dark. Turn on more lights.");
  // much too far away: say so first, since nothing else can be judged reliably from there
  if (cam && cam.dist >= 1400 && cam.n[1] <= -0.2) fail("Too far away. Move closer, 60–90 cm (2–3 ft) from the leg.");
  add("Leg", !!leg);
  if (!leg) fail("Point the camera at the leg.");
  // flat on the floor: with the phone's tilt, compare the card to true "up"; without it, a lenient check
  let cardFlat = false;
  if (cam){
    if (st.beta != null){ const b = st.beta*Math.PI/180, up = [0, -Math.sin(b), -Math.cos(b)]; cardFlat = (cam.n[0]*up[0] + cam.n[1]*up[1] + cam.n[2]*up[2]) > .75; }
    else cardFlat = cam.n[1] <= -0.2;
  }
  add("Card", !!Q && cardFlat);
  if (!Q) fail(cardCut ? "The card is cut off. Tilt the phone down a little." : (mode === "front" ? "Card not found. Lay it flat beside the ankle." : "Card not found. Lay it flat in front of the foot."));
  else if (!cardFlat) fail("The card must lie flat on the floor.");
  let framed = !!leg;
  if (leg){
    if (leg.y1 >= H - 2){ framed = false; fail("The foot is cut off. Step back or tilt the phone down."); }
    let sideCut = false; for (let y = Math.floor(H*.5); y <= leg.y1; y++) if (leg.rowW[y] && (leg.rowL[y] <= 0 || leg.rowR[y] >= W-1)) sideCut = true;
    if (sideCut){ framed = false; fail("Center the leg. It touches the edge of the screen."); }
    if (leg.y0 > H*.08){ framed = false; fail("Fit the knee in the photo. Step back or tilt the phone up."); }
    { const mid = []; for (let y = leg.y0 + Math.round((leg.y1-leg.y0)*.3); y < leg.y0 + Math.round((leg.y1-leg.y0)*.7); y++) if (leg.rowW[y]) mid.push((leg.rowL[y]+leg.rowR[y])/2);
      mid.sort((a,b)=>a-b); const c = mid.length ? mid[mid.length>>1]/W : .5;
      if (Math.abs(c - .5) > (Sg.located ? .2 : mode === "front" ? .1 : .14)){ framed = false; fail(c < .5 ? "Move the phone left so the leg is on the guide line." : "Move the phone right so the leg is on the guide line.", "red", "center"); } }
    if (mode === "front"){
      const span = leg.y1 - leg.y0, up = [], low = [];
      for (let y = leg.y0 + Math.round(span*.3); y < leg.y0 + Math.round(span*.5); y++) if (leg.rowW[y]) up.push(leg.rowR[y]-leg.rowL[y]);
      for (let y = leg.y0 + Math.round(span*.6); y < leg.y0 + Math.round(span*.85); y++) if (leg.rowW[y]) low.push(leg.rowR[y]-leg.rowL[y]);
      up.sort((a,b)=>a-b); low.sort((a,b)=>a-b);
      if (up.length && low.length && low[low.length>>1] > 1.35*up[up.length>>1]){ framed = false; fail("The legs look like they are touching. Ask for feet a fist apart."); }
    }
    if (Q){
      const qx0 = Math.min(...Q.map(p=>p[0])), qx1 = Math.max(...Q.map(p=>p[0])), qy0 = Math.min(...Q.map(p=>p[1])), qy1 = Math.max(...Q.map(p=>p[1]));
      let over = 0; for (let y = Math.max(0, Math.floor(qy0)); y <= Math.min(H-1, qy1); y++) if (leg.rowW[y] && leg.rowR[y] >= qx0 && leg.rowL[y] <= qx1) over++;
      if (over > (qy1-qy0)*.5){ framed = false; fail("Move the card so it does not touch the foot."); }
      if (mode === "front" && (qy0+qy1)/2 > leg.y1 + 4){ framed = false; fail("Move the card beside the ankle, not in front of the toes."); }
    }
  }
  add("Framing", framed);
  if (cam && cardFlat){
    const ok = cam.dist > 380 && cam.dist < 1400; add("Distance", ok);
    if (cam.dist <= 380) fail("Step back a little.", "amber"); else if (cam.dist >= 1400) fail("Move a little closer.", "amber");
  }
  if (st.beta != null){
    const ok = st.beta > 45 && st.beta < 92; add("Angle", ok);
    if (st.beta >= 92) fail("Tilt the phone down slightly.", "amber"); else if (st.beta <= 45) fail("Hold the phone more upright.", "amber");
  }
  if (bright >= 55) add("Light", true); else add("Light", false);
  const steady = motion < 9; add("Steady", steady);
  if (!steady) fail("Hold still.", "amber", "steady");
  return { level: msg ? level : "green", msg: msg || "Hold still…", issues, chips, quad: Q, leg: leg ? { x0: leg.x0, y0: leg.y0, x1: leg.x1, y1: leg.y1 } : null, outline: Sg.outline, w: W, h: H, motion, bright, dist: cam ? cam.dist : null };
}
window.LegScan = { getCV, analyzePhoto, heightAt, liveCheck, CW, CH };
})();
