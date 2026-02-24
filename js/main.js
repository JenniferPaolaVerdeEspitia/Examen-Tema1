/* main.js - Duck Hunt Canvas 2D (Rounds + NES HUD + SFX/Music + Game Over) */

(() => {
  // ========= CONFIG =========
  const BG_SRC   = "img/Fondo.PNG";
  const DUCK_SRC = "img/pato.png";
  const HS_KEY   = "duckhunt_highscore_v2";

  const AMMO_MAX     = 6;
  const DUCKS_PER_ROUND = 10;     // patos por ronda
  const MAX_ROUNDS   = 5;         // total rondas
  const MAX_ESCAPES  = 20;        // game over si se escapan muchos

  // ========= DOM =========
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const elScore = document.getElementById("score");
  const elHighScore = document.getElementById("highScore");
  const elLevel = document.getElementById("level");     // lo usaremos como round también
  const elAmmo = document.getElementById("ammo");
  const elMisses = document.getElementById("misses");
  const elEscaped = document.getElementById("escaped");
  const elKills = document.getElementById("kills");     // opcional (si lo agregas en HTML)

  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnReload = document.getElementById("btnReload");
  const btnFullscreen = document.getElementById("btnFullscreen");

  const toast = document.getElementById("toast");
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // ========= HELPERS =========
  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 320);
  }

  // ========= CANVAS RESIZE (retina) =========
  function resizeCanvas() {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas);

  // ========= IMAGES =========
  const bgImg = new Image();
  bgImg.src = BG_SRC;

  const duckImage = new Image();
  duckImage.src = DUCK_SRC;

  function drawBackground() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    if (!bgImg.complete || !bgImg.naturalWidth) {
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const iw = bgImg.naturalWidth;
    const ih = bgImg.naturalHeight;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.drawImage(bgImg, dx, dy, dw, dh);
  }

  // ========= AUDIO (8-bit WebAudio) =========
  let audioCtx = null;
  let masterGain = null;
  let musicGain = null;
  let soundEnabled = true;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.65;
    masterGain.connect(audioCtx.destination);

    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(masterGain);
  }

  function playTone({ freq = 440, duration = 0.08, gain = 0.10, type = "square", sweepTo = null, bus = "sfx" } = {}) {
    if (!soundEnabled) return;
    initAudio();
    const t0 = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);

    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(g);
    g.connect(bus === "music" ? musicGain : masterGain);

    osc.start(t0);
    osc.stop(t0 + duration);
  }

  function playNoiseBurst({ duration = 0.05, gain = 0.22, hp = 700, lp = 6000 } = {}) {
    if (!soundEnabled) return;
    initAudio();
    const t0 = audioCtx.currentTime;

    const bufferSize = Math.floor(audioCtx.sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const env = 1 - i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;

    const hpFilter = audioCtx.createBiquadFilter();
    hpFilter.type = "highpass";
    hpFilter.frequency.value = hp;

    const lpFilter = audioCtx.createBiquadFilter();
    lpFilter.type = "lowpass";
    lpFilter.frequency.value = lp;

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(hpFilter);
    hpFilter.connect(lpFilter);
    lpFilter.connect(g);
    g.connect(masterGain);

    src.start(t0);
    src.stop(t0 + duration);
  }

  // SFX
  const sfx = {
    shot() { playNoiseBurst({ duration: 0.045, gain: 0.22 }); playTone({ freq: 160, sweepTo: 90, duration: 0.06, gain: 0.08, type: "square" }); },
    hit()  { playTone({ freq: 880, sweepTo: 520, duration: 0.10, gain: 0.10, type: "triangle" }); },
    miss() { playTone({ freq: 220, sweepTo: 180, duration: 0.08, gain: 0.08, type: "sawtooth" }); },
    reload() {
      playTone({ freq: 600, duration: 0.045, gain: 0.06, type: "square" });
      setTimeout(() => playTone({ freq: 480, duration: 0.06, gain: 0.06, type: "square" }), 55);
    },
    roundClear() {
      // pequeño jingle “clear”
      const notes = [880, 988, 1175, 1568];
      notes.forEach((f, i) => setTimeout(() => playTone({ freq: f, duration: 0.10, gain: 0.07, type: "square" }), i * 110));
    },
    gameOver() {
      const notes = [440, 392, 349, 294, 262];
      notes.forEach((f, i) => setTimeout(() => playTone({ freq: f, duration: 0.13, gain: 0.08, type: "square" }), i * 140));
    },
    startJingle() {
      const notes = [523, 659, 784, 1046, 784, 659];
      notes.forEach((f, i) => setTimeout(() => playTone({ freq: f, duration: 0.11, gain: 0.06, type: "square" }), i * 120));
    }
  };

  // Permisos de audio (Chrome)
  window.addEventListener("pointerdown", () => {
    initAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }, { once: true });

  // ========= FX (disparo/partículas) =========
  const shots = [];
  const particles = [];

  function spawnShotFX(x, y) {
    shots.push({ x, y, t: 0, life: 0.12 });
    const n = Math.floor(rand(10, 18));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(140, 360);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.18, 0.32),
        t: 0,
        r: rand(1.2, 2.6)
      });
    }
  }

  function updateFX(dt) {
    for (const s of shots) s.t += dt;
    for (let i = shots.length - 1; i >= 0; i--) if (shots[i].t >= shots[i].life) shots.splice(i, 1);

    for (const p of particles) {
      p.t += dt;
      p.vy += 620 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].t >= particles[i].life) particles.splice(i, 1);
  }

  function drawFX() {
    for (const s of shots) {
      const k = 1 - (s.t / s.life);
      ctx.save();
      ctx.globalAlpha = 0.8 * k;

      ctx.beginPath();
      ctx.arc(s.x, s.y, 26 * (1 - k * 0.15), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(s.x, s.y, 10 + 12 * (1 - k), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,215,120,0.55)";
      ctx.fill();

      ctx.restore();
    }

    for (const p of particles) {
      const k = 1 - (p.t / p.life);
      ctx.save();
      ctx.globalAlpha = 0.9 * k;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fill();
      ctx.restore();
    }
  }

  // ========= GAME / ROUND STATE =========
  let state = "menu"; // menu | playing | roundEnd | gameOver
  let running = true; // pausa

  let lastTime = 0;
  let ducks = [];

  let score = 0;
  let round = 1;

  let ammo = AMMO_MAX;
  let misses = 0;
  let escaped = 0;
  let killsTotal = 0;

  // Round counters
  let spawnedThisRound = 0;   // cuantos han aparecido
  let resolvedThisRound = 0;  // muertos + escapados
  let killsThisRound = 0;     // muertos
  let roundEndTimer = 0;

  let highScore = Number(localStorage.getItem(HS_KEY) || 0);
  if (elHighScore) elHighScore.textContent = highScore;

  function difficulty() {
    // Round sube dificultad
    const speed = 130 + (round - 1) * 30;
    const spawnEvery = Math.max(360, 980 - (round - 1) * 110);
    const maxAlive = Math.min(10, 3 + Math.floor((round - 1) / 1.8));

    const lifeTime = Math.max(1800, 5200 - (round - 1) * 380);

    const zigAmp = clamp(16 + (round - 1) * 3.2, 16, 52);
    const zigFreq = clamp(2.4 + (round - 1) * 0.22, 2.4, 4.8);
    const flapFreq = clamp(7.8 + (round - 1) * 0.35, 7.8, 11);

    return { speed, spawnEvery, maxAlive, lifeTime, zigAmp, zigFreq, flapFreq };
  }

  class Duck {
    constructor() {
      const { speed, lifeTime, zigAmp, zigFreq, flapFreq } = difficulty();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      const fromLeft = Math.random() < 0.5;
      this.dir = fromLeft ? 1 : -1;

      this.x = fromLeft ? -90 : w + 90;
      this.baseY = rand(85, h * 0.62);
      this.y = this.baseY;

      this.vx = rand(0.80, 1.25) * speed * this.dir;
      this.vy = rand(-0.35, 0.35) * speed;

      this.size = rand(56, 88);

      // Zigzag
      this.zigAmp = zigAmp * rand(0.75, 1.15);
      this.zigFreq = zigFreq * rand(0.85, 1.15);
      this.zigPhase = rand(0, Math.PI * 2);

      // Flap (visual)
      this.flapFreq = flapFreq * rand(0.9, 1.2);
      this.flapPhase = rand(0, Math.PI * 2);

      // Life
      this.spawnAt = performance.now();
      this.lifeTime = lifeTime + rand(-450, 450);

      this.state = "alive"; // alive | dying
      this.deadT = 0;
      this.deadLife = 0.78;
      this.rot = rand(-0.5, 0.5);

      this.alive = true;
      this.countedResolve = false; // para contar 1 sola vez cuando muere/escapa
    }

    get radius() {
      return this.size * 0.36;
    }

    kill() {
      if (this.state !== "alive") return;
      this.state = "dying";
      this.deadT = 0;
      this.vy = rand(120, 240);
      this.vx *= 0.35;
    }

    update(dt) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (this.state === "alive") {
        this.x += this.vx * dt;
        this.baseY += this.vy * dt;

        if (this.baseY < 70) { this.baseY = 70; this.vy *= -1; }
        if (this.baseY > h * 0.70) { this.baseY = h * 0.70; this.vy *= -1; }

        this.zigPhase += (Math.PI * 2) * this.zigFreq * dt;
        this.y = this.baseY + Math.sin(this.zigPhase) * this.zigAmp;

        if (Math.random() < 0.02) this.vy += rand(-22, 22);

        const now = performance.now();
        if (now - this.spawnAt > this.lifeTime || this.x < -180 || this.x > w + 180) {
          this.alive = false;
          if (!this.countedResolve) {
            this.countedResolve = true;
            escaped++;
            resolvedThisRound++;
          }
        }
      } else {
        // dying
        this.deadT += dt;
        this.rot += (this.dir * 2.6) * dt;

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 760 * dt;

        if (this.y > h * 0.78) {
          this.y = h * 0.78;
          this.vx *= 0.88;
          this.vy = 0;
        }

        if (this.deadT >= this.deadLife) {
          this.alive = false;
          if (!this.countedResolve) {
            this.countedResolve = true;
            resolvedThisRound++;
          }
        }
      }
    }

    draw() {
      const s = this.size;

      if (!duckImage.complete || !duckImage.naturalWidth) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,.65)";
        ctx.fill();
        return;
      }

      const t = performance.now() / 1000;
      const flap = Math.sin((t * this.flapFreq * Math.PI * 2) + this.flapPhase);
      const bob = Math.sin((t * (this.flapFreq * 0.65) * Math.PI * 2) + this.flapPhase) * 1.7;

      const scaleY = this.state === "alive" ? (1 + flap * 0.06) : 1;
      const scaleX = this.state === "alive" ? (1 - flap * 0.03) : 1;
      const rotAlive = this.state === "alive" ? (flap * 0.08) : 0;

      let alpha = 1;
      if (this.state === "dying") alpha = clamp(1 - (this.deadT / this.deadLife), 0, 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.y + bob);

      if (this.dir === -1) ctx.scale(-1, 1);

      if (this.state === "dying") ctx.rotate(this.rot);
      else ctx.rotate(rotAlive);

      ctx.scale(scaleX, scaleY);

      ctx.drawImage(duckImage, -s / 2, -s / 2, s, s);
      ctx.restore();
    }

    hit(mx, my) {
      if (this.state !== "alive") return false;
      const dx = mx - this.x;
      const dy = my - this.y;
      return dx * dx + dy * dy <= this.radius * this.radius;
    }
  }

  // ========= HUD setters (panel lateral) =========
  function syncHUD() {
    if (elScore) elScore.textContent = score;
    if (elHighScore) elHighScore.textContent = highScore;
    if (elLevel) elLevel.textContent = round;   // Nivel = Round
    if (elAmmo) elAmmo.textContent = ammo;
    if (elMisses) elMisses.textContent = misses;
    if (elEscaped) elEscaped.textContent = escaped;
    if (elKills) elKills.textContent = killsTotal;
  }

  function setScore(v) {
    score = v;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HS_KEY, String(highScore));
    }
    syncHUD();
  }

  function setAmmo(v) {
    ammo = v;
    syncHUD();
  }

  // ========= ROUND CONTROL =========
  let lastSpawn = 0;

  function startNewRound() {
    ducks = [];
    spawnedThisRound = 0;
    resolvedThisRound = 0;
    killsThisRound = 0;
    ammo = AMMO_MAX;
    lastSpawn = 0;
    roundEndTimer = 0;
    state = "playing";
    showToast(`ROUND ${round}`);
    syncHUD();
  }

  function endRound() {
    state = "roundEnd";
    roundEndTimer = 0;
    sfx.roundClear();
  }

  function gameOver() {
    state = "gameOver";
    sfx.gameOver();
    syncHUD();
  }

  function trySpawn(now) {
    if (state !== "playing") return;

    const { spawnEvery, maxAlive } = difficulty();
    const aliveCount = ducks.filter(d => d.state === "alive").length;

    if (spawnedThisRound >= DUCKS_PER_ROUND) return;
    if (aliveCount >= maxAlive) return;

    if (now - lastSpawn >= spawnEvery) {
      ducks.push(new Duck());
      spawnedThisRound++;
      lastSpawn = now;
    }
  }

  // ========= INPUT =========
  canvas.addEventListener("mousedown", (e) => {
    // reactivar audio si suspendido
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // click en menu / end screens
    if (state === "menu") {
      sfx.startJingle();
      round = 1;
      score = 0;
      misses = 0;
      escaped = 0;
      killsTotal = 0;
      startNewRound();
      return;
    }

    if (state === "roundEnd") {
      // siguiente ronda
      round++;
      if (round > MAX_ROUNDS || escaped >= MAX_ESCAPES) {
        gameOver();
      } else {
        startNewRound();
      }
      return;
    }

    if (state === "gameOver") {
      // reiniciar
      state = "menu";
      return;
    }

    if (!running) return;

    // disparo FX + sonido
    spawnShotFX(mx, my);
    sfx.shot();

    // sin balas
    if (ammo <= 0) {
      showToast("Sin balas (R)");
      sfx.miss();
      return;
    }

    setAmmo(ammo - 1);

    // hit test
    let hitDuck = null;
    for (let i = ducks.length - 1; i >= 0; i--) {
      if (ducks[i].hit(mx, my)) { hitDuck = ducks[i]; break; }
    }

    if (hitDuck) {
      hitDuck.kill();
      killsThisRound++;
      killsTotal++;

      const bonus = (ammo <= 2) ? 40 : 0;
      const points = 100 + (round - 1) * 20 + bonus;
      setScore(score + points);

      showToast(`+${points}`);
      sfx.hit();
      syncHUD();
    } else {
      misses++;
      showToast("Fallo");
      sfx.miss();
      syncHUD();
    }
  });

  // ========= CONTROLS =========
  function togglePause() {
    if (state !== "playing") return;
    running = !running;
    if (btnPause) btnPause.textContent = running ? "Pausar" : "Reanudar";
    if (running) {
      lastTime = 0;
      requestAnimationFrame(loop);
    }
  }

  function reload() {
    if (state !== "playing") return;
    setAmmo(AMMO_MAX);
    showToast("Recargado");
    sfx.reload();
  }

  function resetGame() {
    ducks = [];
    score = 0;
    round = 1;
    ammo = AMMO_MAX;
    misses = 0;
    escaped = 0;
    killsTotal = 0;

    state = "menu";
    running = true;
    if (btnPause) btnPause.textContent = "Pausar";
    lastTime = 0;

    syncHUD();
    showToast("Reiniciado");
  }

  if (btnPause) btnPause.addEventListener("click", togglePause);
  if (btnRestart) btnRestart.addEventListener("click", resetGame);
  if (btnReload) btnReload.addEventListener("click", reload);

  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "p") togglePause();
    if (k === "r") reload();
    if (k === "m") {
      soundEnabled = !soundEnabled;
      showToast(soundEnabled ? "Sonido ON" : "Sonido OFF");
    }
  });

  if (btnFullscreen) {
    btnFullscreen.addEventListener("click", async () => {
      try {
        const parent = canvas.closest(".glass") || canvas;
        if (!document.fullscreenElement) await parent.requestFullscreen();
        else await document.exitFullscreen();
      } catch {
        showToast("No disponible");
      }
    });
  }

  // ========= NES STYLE CANVAS UI =========
  function drawNesHUD() {
    const w = canvas.clientWidth;

    // barra superior
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, 0, w, 46);

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(`ROUND ${round}`, 12, 28);

    // derecha
    const textRight = `SCORE ${score}   HI ${highScore}`;
    ctx.textAlign = "right";
    ctx.fillText(textRight, w - 12, 28);
    ctx.textAlign = "left";

    ctx.restore();

    // barra inferior tipo “status”
    const h = canvas.clientHeight;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(0, h - 40, w, 40);

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto";

    const left = 12;
    ctx.fillText(`AMMO ${ammo}`, left, h - 14);
    ctx.fillText(`KILLS ${killsThisRound}/${DUCKS_PER_ROUND}`, left + 120, h - 14);

    const leftDucks = DUCKS_PER_ROUND - resolvedThisRound;
    ctx.fillText(`DUCKS LEFT ${Math.max(0, leftDucks)}`, left + 270, h - 14);

    ctx.textAlign = "right";
    ctx.fillText(`ESCAPED ${escaped}/${MAX_ESCAPES}`, w - 12, h - 14);
    ctx.textAlign = "left";

    ctx.restore();
  }

  function drawCenterOverlay(title, lines = []) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(0, 0, w, h);

    // “marco” tipo NES
    const bw = Math.min(520, w - 60);
    const bh = 240;
    const bx = (w - bw) / 2;
    const by = (h - bh) / 2;

    ctx.fillStyle = "rgba(10,12,22,.95)";
    ctx.fillRect(bx, by, bw, bh);

    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.textAlign = "center";
    ctx.font = "800 42px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText(title, w / 2, by + 70);

    ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto";
    let yy = by + 115;
    for (const line of lines) {
      ctx.fillText(line, w / 2, yy);
      yy += 28;
    }

    ctx.restore();
  }

  // ========= MAIN LOOP =========
  function loop(ts) {
    if (state === "playing" && !running) return;

    if (!lastTime) lastTime = ts;
    const dt = clamp((ts - lastTime) / 1000, 0, 0.033);
    lastTime = ts;

    // spawn
    trySpawn(ts);

    // update
    if (state === "playing") {
      for (const d of ducks) d.update(dt);
      ducks = ducks.filter(d => d.alive);

      // si ya spawneó todos y ya se resolvieron todos -> fin ronda
      if (spawnedThisRound >= DUCKS_PER_ROUND && resolvedThisRound >= DUCKS_PER_ROUND) {
        endRound();
      }

      // game over por escapes
      if (escaped >= MAX_ESCAPES) {
        gameOver();
      }
    }

    updateFX(dt);

    // draw
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    drawBackground();

    for (const d of ducks) d.draw();
    drawFX();

    drawNesHUD();

    if (state === "menu") {
      drawCenterOverlay("DUCK HUNT", [
        "CLICK PARA INICIAR",
        "R = RECARGAR   P = PAUSA   M = SONIDO",
        `TOP SCORE = ${highScore}`
      ]);
    }

    if (state === "roundEnd") {
      drawCenterOverlay(`ROUND ${round} CLEAR`, [
        `KILLS: ${killsThisRound}/${DUCKS_PER_ROUND}`,
        `SCORE: ${score}`,
        "CLICK PARA CONTINUAR"
      ]);
    }

    if (state === "gameOver") {
      drawCenterOverlay("GAME OVER", [
        `FINAL SCORE: ${score}`,
        `HI-SCORE: ${highScore}`,
        "CLICK PARA VOLVER AL MENU"
      ]);
    }

    // Sync panel
    syncHUD();

    requestAnimationFrame(loop);
  }

  // ========= INIT =========
  resizeCanvas();
  syncHUD();
  state = "menu";

  requestAnimationFrame(loop);
})();
