/* Live camera with guidance.
   - Opens the rear camera inside the page (asks permission from a button tap).
   - Several times a second, checks the card, the leg outline, framing, distance, light, steadiness
     and (where the phone allows) the phone's angle.
   - Colored border: red = something missing, amber = almost ready, green = ready.
   - When green and steady, counts down and captures several full-resolution photos automatically.
   - A manual shutter and the phone's own camera app are always available as fallbacks. */
(function(){
"use strict";
const $ = id => document.getElementById(id);
const MIN_SHORT_SIDE = 1440;      // below this, the final photo is taken with the phone's camera app
const FRAMES = 3;                 // photos captured and averaged
const HOLD_MS = 1200;             // time green must hold before the countdown
let ui = null, stream = null, track = null, imageCapture = null, running = false, st = {}, onDone = null, mode = "side";
let greenSince = 0, counting = false, lastSpoken = "", lastSpokeAt = 0, voiceOn = true, opened = 0, orientationOn = false;

function build(){
  if (ui) return ui;
  const el = document.createElement("div");
  el.id = "livecam"; el.hidden = true;
  el.innerHTML = `
  <div class="lc-intro" id="lc-intro">
    <h2 id="lc-title">Live camera</h2>
    <p>The app will use the camera to check the photo before it is taken: the card, the leg, the framing and the phone angle. It captures automatically when everything is right.</p>
    <ul class="bullets">
      <li><b>1</b><span>Your phone will ask to allow the <b>camera</b>. Choose <b>Allow</b>.</span></li>
      <li><b>2</b><span>On iPhone it may also ask for <b>motion and orientation</b>, used for the phone-angle guide. Choose <b>Allow</b>. The camera still works if you don't.</span></li>
    </ul>
    <p class="lc-err" id="lc-err" hidden></p>
    <div class="lc-introbtns">
      <button class="btn primary" id="lc-allow">Allow camera and start</button>
      <label class="btn">Use the phone's camera app instead<input type="file" accept="image/*" capture="environment" id="lc-native"></label>
      <button class="btn link" id="lc-cancel">Cancel</button>
    </div>
  </div>
  <div class="lc-view" id="lc-view" hidden>
    <video id="lc-video" playsinline muted autoplay></video>
    <canvas id="lc-ov"></canvas>
    <div class="lc-ring" id="lc-ring"></div>
    <div class="lc-top"><div class="lc-msg" id="lc-msg">Starting the camera…</div><div class="lc-chips" id="lc-chips"></div></div>
    <div class="lc-level" id="lc-level" hidden><b></b><i id="lc-bubble"></i></div>
    <div class="lc-count" id="lc-count" hidden></div>
    <div class="lc-bar">
      <button class="lc-small" id="lc-close" aria-label="Close camera">✕</button>
      <button class="lc-shutter" id="lc-shutter" aria-label="Take photo now"></button>
      <button class="lc-small" id="lc-voice" aria-label="Spoken guidance on" aria-pressed="true">🔊</button>
    </div>
    <div class="lc-res" id="lc-res"></div>
  </div>
  <div class="lc-low" id="lc-low" hidden>
    <h2>Take the final photo with the camera app</h2>
    <p id="lc-lowtext">This phone's live camera is lower resolution than its regular photos. The setup is correct, so keep the same position and take the final photo with the phone's camera app.</p>
    <label class="btn primary">Open the camera app<input type="file" accept="image/*" capture="environment" id="lc-native2"></label>
    <button class="btn link" id="lc-lowcancel">Back to the live camera</button>
  </div>`;
  document.body.appendChild(el);
  ui = el;
  $("lc-allow").onclick = start;
  $("lc-cancel").onclick = () => close(null);
  $("lc-close").onclick = () => close(null);
  $("lc-lowcancel").onclick = () => { $("lc-low").hidden = true; $("lc-view").hidden = false; running = true; loop(); };
  $("lc-voice").onclick = () => { voiceOn = !voiceOn; $("lc-voice").textContent = voiceOn ? "🔊" : "🔇"; $("lc-voice").setAttribute("aria-pressed", voiceOn); $("lc-voice").setAttribute("aria-label", voiceOn ? "Spoken guidance on" : "Spoken guidance off"); if (!voiceOn) try { speechSynthesis.cancel(); } catch(e){} };
  $("lc-shutter").onclick = () => capture(true);
  const nat = e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; const img = new Image(); img.onload = () => close([{ img, file: f, method: "photo from the camera app", w: img.naturalWidth, h: img.naturalHeight }]); img.src = URL.createObjectURL(f); };
  $("lc-native").onchange = nat; $("lc-native2").onchange = nat;
  return el;
}

function open(opts, done){
  build(); onDone = done; mode = opts.mode; st = { beta: null };
  $("lc-title").textContent = opts.title;
  $("lc-err").hidden = true;
  $("lc-intro").hidden = !!stream; $("lc-view").hidden = true; $("lc-low").hidden = true;
  ui.hidden = false; document.documentElement.classList.add("lc-open");
  opened = Date.now(); greenSince = 0; counting = false;
  if (stream) showView();
}
function close(result){
  running = false; counting = false;
  if (stream){ stream.getTracks().forEach(t => t.stop()); stream = null; track = null; imageCapture = null; }
  try { speechSynthesis.cancel(); } catch(e){}
  if (ui){ ui.hidden = true; document.documentElement.classList.remove("lc-open"); }
  const cb = onDone; onDone = null; if (cb) cb(result);
}

async function start(){
  const err = $("lc-err"); err.hidden = true;
  // iPhone: orientation permission must be asked from the button tap, before any await
  let oriReq = null;
  try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") oriReq = DeviceOrientationEvent.requestPermission(); } catch(e){}
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 4096 } } });
  } catch(e){
    err.hidden = false;
    err.innerHTML = e && e.name === "NotAllowedError"
      ? "<b>Camera access is blocked for this page.</b> Open the browser's site settings for this page (usually from the icon beside the web address), set Camera to Allow, then tap the button again. You can also use the phone's camera app below."
      : "<b>The camera could not start.</b> Close other apps that may be using the camera and try again, or use the phone's camera app below.";
    return;
  }
  try { if (oriReq && (await oriReq) !== "granted") oriReq = null; } catch(e){ oriReq = null; }
  if (!orientationOn){ window.addEventListener("deviceorientation", e => { if (e.beta != null) st.beta = Math.abs(e.beta); }); orientationOn = true; }
  track = stream.getVideoTracks()[0];
  try { if ("ImageCapture" in window) imageCapture = new ImageCapture(track); } catch(e){ imageCapture = null; }
  try { const c = track.getCapabilities ? track.getCapabilities() : {}; if (c.focusMode && c.focusMode.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch(e){}
  showView();
}
function showView(){
  const v = $("lc-video"); v.srcObject = stream;
  $("lc-intro").hidden = true; $("lc-view").hidden = false;
  v.onloadedmetadata = () => { v.play().catch(()=>{}); running = true; loop(); };
  if (v.readyState >= 1){ v.play().catch(()=>{}); running = true; loop(); }
}

/* map small-frame coordinates to the on-screen video (object-fit: cover) */
function mapper(r){
  const v = $("lc-video"), W = v.clientWidth, H = v.clientHeight, vw = v.videoWidth, vh = v.videoHeight;
  const sc = Math.max(W/vw, H/vh), ox = (W - vw*sc)/2, oy = (H - vh*sc)/2, k = vw / r.w;
  return p => [ox + p[0]*k*sc, oy + p[1]*k*sc];
}
function draw(r){
  const c = $("lc-ov"), v = $("lc-video"), dpr = window.devicePixelRatio || 1;
  c.width = v.clientWidth*dpr; c.height = v.clientHeight*dpr; const g = c.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,c.width,c.height);
  if (!r) return;
  const M = mapper(r), col = { red: "#ff5a52", amber: "#f5b301", green: "#2fbf71" }[r.level];
  (r.outline || []).forEach(o => { g.beginPath(); o.forEach((p,i) => { const q = M(p); i ? g.lineTo(q[0],q[1]) : g.moveTo(q[0],q[1]); }); g.closePath(); g.lineWidth = 2.5; g.strokeStyle = "rgba(60,199,190,.95)"; g.stroke(); });
  if (r.quad){ g.beginPath(); r.quad.forEach((p,i) => { const q = M(p); i ? g.lineTo(q[0],q[1]) : g.moveTo(q[0],q[1]); }); g.closePath();
    g.fillStyle = r.level === "green" ? "rgba(47,191,113,.3)" : "rgba(91,140,255,.3)"; g.fill(); g.lineWidth = 3; g.strokeStyle = r.level === "green" ? col : "#5b8cff"; g.stroke(); }
}
function say(msg){
  if (!voiceOn || !("speechSynthesis" in window)) return;
  const now = Date.now(); if (msg === lastSpoken && now - lastSpokeAt < 6000) return; if (now - lastSpokeAt < 2500) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(msg.replace("…","")); u.rate = 1.05; speechSynthesis.speak(u); lastSpoken = msg; lastSpokeAt = now; } catch(e){}
}
function render(r){
  $("lc-ring").className = "lc-ring " + r.level;
  $("lc-msg").textContent = counting ? "Hold still…" : r.msg;
  $("lc-chips").innerHTML = r.chips.map(c => `<span class="lc-chip ${c.ok ? "ok" : "no"}">${c.ok ? "✓" : "✕"} ${c.k}</span>`).join("");
  const lv = $("lc-level");
  if (st.beta != null){ lv.hidden = false; const t = Math.max(0, Math.min(1, (st.beta - 30)/80)); $("lc-bubble").style.top = (6 + (1-t)*118) + "px"; $("lc-bubble").className = (st.beta > 45 && st.beta < 92) ? "ok" : ""; }
  const v = $("lc-video"); $("lc-res").textContent = v.videoWidth ? `Camera ${v.videoWidth}×${v.videoHeight}` : "";
  draw(r);
  if (r.level !== "green") say(r.msg);
}

async function loop(){
  if (!running) return;
  const v = $("lc-video");
  if (!v.videoWidth){ setTimeout(loop, 150); return; }
  const t0 = performance.now();
  let r = null; try { r = LegScan.liveCheck(v, mode, st); } catch(e){ r = null; }
  if (r){
    render(r);
    if (r.level === "green" && !counting){ if (!greenSince) greenSince = Date.now(); if (Date.now() - greenSince > HOLD_MS) countdown(); }
    else if (r.level !== "green"){ greenSince = 0; if (counting) cancelCountdown(); }
  }
  const dt = performance.now() - t0;
  if (running) setTimeout(loop, Math.max(120, 300 - dt));
}
let countTimer = null;
function countdown(){
  counting = true; let n = 3; const el = $("lc-count"); el.hidden = false; el.textContent = n; say("Hold still");
  countTimer = setInterval(() => { n--; if (n > 0){ el.textContent = n; return; } clearInterval(countTimer); el.hidden = true; capture(false); }, 600);
}
function cancelCountdown(){ counting = false; clearInterval(countTimer); $("lc-count").hidden = true; }

async function grab(){
  const v = $("lc-video");
  if (imageCapture){
    try { const blob = await imageCapture.takePhoto(); const img = await blobImg(blob); return { img, file: blob, method: "full-resolution photo", w: img.naturalWidth, h: img.naturalHeight }; } catch(e){ imageCapture = null; }
  }
  const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", .95)); const img = await blobImg(blob);
  return { img, file: null, method: "live video frame", w: c.width, h: c.height };
}
const blobImg = blob => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });

async function capture(manual){
  if (!running) return; running = false; cancelCountdown();
  $("lc-msg").textContent = "Capturing…"; $("lc-ring").className = "lc-ring green";
  const shots = [];
  try {
    for (let i = 0; i < FRAMES; i++){ shots.push(await grab()); if (i < FRAMES-1) await new Promise(r => setTimeout(r, 120)); }
  } catch(e){}
  try { navigator.vibrate && navigator.vibrate(80); } catch(e){}
  if (!shots.length){ running = true; loop(); return; }
  const s0 = shots[0];
  if (s0.method === "live video frame" && Math.min(s0.w, s0.h) < MIN_SHORT_SIDE){
    $("lc-view").hidden = true; $("lc-low").hidden = false;
    $("lc-lowtext").textContent = `This phone's live camera gives ${s0.w}×${s0.h} pixels, which is too low for 2 mm accuracy. The setup is correct, so keep the same position and take the final photo with the phone's camera app.`;
    say("Take the final photo with the camera app");
    return;
  }
  shots.forEach(s => s.manual = manual);
  close(shots);
}

window.LiveCam = { open, close };
})();
