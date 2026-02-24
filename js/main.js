/* main.js - Duck Hunt Canvas 2D (10 Niveles + HUD + FX + Sonidos 8-bit + Game Over + Perro caminando + Meta progresiva 3..12) */

(() => {
  // ========= CONFIG =========
  const BG_SRC   = "img/Fondo.PNG";
  const DUCK_SRC = "img/pato.png";
  const DOG_SRC  = "img/perro.png";

  const HS_KEY   = "duckhunt_highscore_v3";

  const AMMO_MAX = 6;

  // ✅ Para que el nivel 10 (meta 12) sea posible, necesitamos más patos por ronda
  const DUCKS_PER_ROUND = 15;

  // ✅ 10 niveles
  const MAX_ROUNDS = 10;

  const MAX_ESCAPES = 20;

  // ========= DOM =========
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const elScore = document.getElementById("score");
  const elHighScore = document.getElementById("highScore");
  const elLevel = document.getElementById("level");
  const elAmmo = document.getElementById("ammo");
  const elMisses = document.getElementById("misses");
  const elEscaped = document.getElementById("escaped");
  const elKills = document.getElementById("kills");

  // ✅ referencias para META en el panel
  const elRoundGoal = document.getElementById("roundGoal");
  const elGoalProgress = document.getElementById("goalProgress");

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

  // ✅ META progresiva por nivel:
  // Nivel 1=3, Nivel 2=4, ... Nivel 10=12
  function requiredKillsForRound(r) {
    return 2 + r;
  }

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 380);
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

  const dogImage = new Image();
  dogImage.src = DOG_SRC;

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

  const sfx = {
    disparo() { playNoiseBurst({ duration: 0.045, gain: 0.22 }); playTone({ freq: 160, sweepTo: 90, duration: 0.06, gain: 0.08, type: "square" }); },
    acierto() { playTone({ freq: 880, sweepTo: 520, duration: 0.10, gain: 0.10, type: "triangle" }); },
    fallo()   { playTone({ freq: 220, sweepTo: 180, duration: 0.08, gain: 0.08, type: "sawtooth" }); },
    recarga() {
      playTone({ freq: 600, duration: 0.045, gain: 0.06, type: "square" });
      setTimeout(() => playTone({ freq: 480, duration: 0.06, gain: 0.06, type: "square" }), 55);
    },
    rondaCompleta() {
      [880, 988, 1175, 1568].forEach((f, i) => setTimeout(() => playTone({ freq: f, duration: 0.10, gain: 0.07, type: "square" }), i * 110));
    },
    finJuego() {
      [440, 392, 349, 294, 262].forEach((f, i) => setTimeout(() => playTone({ freq: f, duration: 0.13, gain: 0.08, type: "square" }), i * 140));
    },
    inicio() {
      [523, 659, 784, 1046, 784, 659].forEach((f, i) => setTimeout(() => playTone({ freq: f, duration: 0.11, gain: 0.06, type: "square" }), i * 120));
    }
  };

  window.addEventListener("pointerdown", () => {
    initAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }, { once: true });

  // ========= FX =========
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

  // ========= DOG =========
  const dog = { x: -160, vx: 95, dir: 1, stepT: 0, dustT: 0 };
  const dogDust = [];

  function resetDog() {
    dog.x = -160;
    dog.stepT = 0;
    dog.dustT = 0;
    dog.dir = 1;
    dogDust.length = 0;
  }

  function spawnDogDust(x, y) {
    const n = Math.floor(rand(4, 7));
    for (let i = 0; i < n; i++) {
      dogDust.push({
        x: x + rand(-8, 6),
        y: y + rand(-3, 3),
        vx: rand(-30, -90),
        vy: rand(-40, -110),
        t: 0,
        life: rand(0.22, 0.36),
        r: rand(2.0, 3.6)
      });
    }
  }

  function updateDog(dt, round) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    dog.vx = 95 + (round - 1) * 12;
    dog.x += dog.vx * dt;
    if (dog.x > w + 170) dog.x = -170;

    dog.stepT += dt * (1.15 + (round - 1) * 0.05);
    dog.dustT += dt;

    const groundY = h * 0.78;
    const stepSpeed = 16 + (round - 1) * 1.2;
    const stepWave = Math.sin(dog.stepT * stepSpeed);

    if (dog.dustT > 0.05 && stepWave < -0.78) {
      dog.dustT = 0;
      spawnDogDust(dog.x + 46, groundY + 5);
    }

    for (const p of dogDust) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 340 * dt;
    }
    for (let i = dogDust.length - 1; i >= 0; i--) {
      if (dogDust[i].t >= dogDust[i].life) dogDust.splice(i, 1);
    }
  }

  function drawDogDust() {
    for (const p of dogDust) {
      const k = 1 - (p.t / p.life);
      ctx.save();
      ctx.globalAlpha = 0.60 * k;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.7 + 0.7 * (1 - k)), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDog() {
    const h = canvas.clientHeight;
    const groundY = h * 0.78;

    if (!dogImage.complete || !dogImage.naturalWidth) return;

    const iw = dogImage.naturalWidth;
    const ih = dogImage.naturalHeight;

    const targetH = 70;
    const scaleBase = targetH / ih;

    const stepSpeed = 16;
    const s1 = Math.sin(dog.stepT * stepSpeed);
    const s2 = Math.sin(dog.stepT * stepSpeed * 2);

    const bobY = s1 * 4.0 + s2 * 1.2;
    const tilt = s1 * 0.10;

    const impact = (s1 < 0 ? Math.abs(s1) : 0);
    const scaleX = 1 + impact * 0.28;
    const scaleY = 1 - impact * 0.20;

    const jitterX = (s1 < -0.65 ? -2.2 : 0);

    const drawW = iw * scaleBase;
    const drawH = ih * scaleBase;

    const x = dog.x + jitterX;
    const y = groundY - drawH + bobY;

    ctx.save();

    const shadowW = drawW * (0.30 + impact * 0.14);
    const shadowH = 7 - impact * 2.0;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.ellipse(x + drawW * 0.46, groundY + 6, shadowW, shadowH, 0, 0, Math.PI * 2);
    ctx.fillStyle = "black";
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.translate(x + drawW / 2, y + drawH / 2);
    ctx.rotate(tilt);
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(dogImage, -drawW / 2, -drawH / 2, drawW, drawH);

    ctx.restore();

    drawDogDust();
  }

  // ========= GAME STATE =========
  let state = "menu";   // menu | playing | roundEnd | gameOver
  let running = true;

  let lastTime = 0;
  let ducks = [];

  let score = 0;
  let round = 1;

  let ammo = AMMO_MAX;
  let misses = 0;
  let escaped = 0;
  let killsTotal = 0;

  let spawnedThisRound = 0;
  let resolvedThisRound = 0;
  let killsThisRound = 0;
  let lastSpawn = 0;

  let highScore = Number(localStorage.getItem(HS_KEY) || 0);

  let gameOverReason = "";

  function syncHUD() {
    if (elScore) elScore.textContent = score;
    if (elHighScore) elHighScore.textContent = highScore;
    if (elLevel) elLevel.textContent = round;
    if (elAmmo) elAmmo.textContent = ammo;
    if (elMisses) elMisses.textContent = misses;
    if (elEscaped) elEscaped.textContent = escaped;
    if (elKills) elKills.textContent = killsTotal;

    // ✅ meta y progreso en panel
    const req = requiredKillsForRound(round);
    if (elRoundGoal) elRoundGoal.textContent = req;
    if (elGoalProgress) elGoalProgress.textContent = `${killsThisRound}/${req}`;
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

  function difficulty() {
    const speed = 130 + (round - 1) * 30;
    const spawnEvery = Math.max(320, 980 - (round - 1) * 95);
    const maxAlive = Math.min(12, 3 + Math.floor((round - 1) / 1.6));
    const lifeTime = Math.max(1600, 5200 - (round - 1) * 340);

    const zigAmp = clamp(16 + (round - 1) * 3.2, 16, 58);
    const zigFreq = clamp(2.4 + (round - 1) * 0.22, 2.4, 5.0);
    const flapFreq = clamp(7.8 + (round - 1) * 0.35, 7.8, 11.6);

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

      this.zigAmp = zigAmp * rand(0.75, 1.15);
      this.zigFreq = zigFreq * rand(0.85, 1.15);
      this.zigPhase = rand(0, Math.PI * 2);

      this.flapFreq = flapFreq * rand(0.9, 1.2);
      this.flapPhase = rand(0, Math.PI * 2);

      this.spawnAt = performance.now();
      this.lifeTime = lifeTime + rand(-450, 450);

      this.state = "alive";
      this.deadT = 0;
      this.deadLife = 0.78;
      this.rot = rand(-0.5, 0.5);

      this.alive = true;
      this.countedResolve = false;
    }

    get radius() { return this.size * 0.36; }

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

  function startNewRound() {
    ducks = [];
    spawnedThisRound = 0;
    resolvedThisRound = 0;
    killsThisRound = 0;
    ammo = AMMO_MAX;
    lastSpawn = 0;
    state = "playing";

    const req = requiredKillsForRound(round);
    showToast(`RONDA ${round} - META ${req}`);
    syncHUD();
  }

  function endRound() {
    state = "roundEnd";
    sfx.rondaCompleta();
  }

  function gameOver(reason = "") {
    state = "gameOver";
    gameOverReason = reason;
    sfx.finJuego();
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
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (state === "menu") {
      sfx.inicio();
      round = 1;
      score = 0;
      misses = 0;
      escaped = 0;
      killsTotal = 0;
      resetDog();
      startNewRound();
      return;
    }

    if (state === "roundEnd") {
      round++;

      // ✅ si ya pasaste el nivel 10, GANAS
      if (round > MAX_ROUNDS) {
        gameOverReason = "¡GANASTE! Completaste los 10 niveles.";
        state = "gameOver";
        sfx.rondaCompleta();
        syncHUD();
        return;
      }

      if (escaped >= MAX_ESCAPES) gameOver("Se escaparon demasiados patos.");
      else startNewRound();
      return;
    }

    if (state === "gameOver") {
      state = "menu";
      return;
    }

    if (!running) return;

    spawnShotFX(mx, my);
    sfx.disparo();

    if (ammo <= 0) {
      showToast("SIN BALAS (R)");
      sfx.fallo();
      return;
    }

    setAmmo(ammo - 1);

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
      sfx.acierto();
      syncHUD();
    } else {
      misses++;
      showToast("FALLO");
      sfx.fallo();
      syncHUD();
    }
  });

  // ========= CONTROLS =========
  function togglePause() {
    if (state !== "playing") return;
    running = !running;
    if (btnPause) btnPause.textContent = running ? "⏯️ Pausar / Reanudar" : "▶️ Reanudar";
    if (running) {
      lastTime = 0;
      requestAnimationFrame(loop);
    }
  }

  function reload() {
    if (state !== "playing") return;
    setAmmo(AMMO_MAX);
    showToast("RECARGADO");
    sfx.recarga();
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
    if (btnPause) btnPause.textContent = "⏯️ Pausar / Reanudar";
    lastTime = 0;

    resetDog();
    syncHUD();
    showToast("REINICIADO");
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
      showToast(soundEnabled ? "SONIDO ON" : "SONIDO OFF");
    }
  });

  if (btnFullscreen) {
    btnFullscreen.addEventListener("click", async () => {
      try {
        const parent = canvas.closest(".glass") || canvas;
        if (!document.fullscreenElement) await parent.requestFullscreen();
        else await document.exitFullscreen();
      } catch {
        showToast("NO DISPONIBLE");
      }
    });
  }

  // ========= NES HUD =========
  function drawNesHUD() {
    const w = canvas.clientWidth;
    const req = requiredKillsForRound(round);

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, 0, w, 46);

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "800 14px Oxanium, system-ui";
    ctx.fillText(`RONDA ${round}`, 12, 28);

    const textRight = `PUNTAJE ${score}   RÉCORD ${highScore}`;
    ctx.textAlign = "right";
    ctx.fillText(textRight, w - 12, 28);
    ctx.textAlign = "left";
    ctx.restore();

    const h = canvas.clientHeight;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(0, h - 40, w, 40);

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "700 14px Oxanium, system-ui";

    const left = 12;
    ctx.fillText(`BALAS ${ammo}`, left, h - 14);
    ctx.fillText(`PATOS ${killsThisRound}/${DUCKS_PER_ROUND}`, left + 120, h - 14);

    const leftDucks = DUCKS_PER_ROUND - resolvedThisRound;
    ctx.fillText(`RESTANTES ${Math.max(0, leftDucks)}`, left + 270, h - 14);

    ctx.fillText(`META ${req}`, left + 420, h - 14);

    ctx.textAlign = "right";
    ctx.fillText(`ESCAPADOS ${escaped}/${MAX_ESCAPES}`, w - 12, h - 14);
    ctx.textAlign = "left";
    ctx.restore();
  }

  function drawCenterOverlay(title, lines = []) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(0, 0, w, h);

    const bw = Math.min(560, w - 60);
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

    ctx.font = "800 18px Oxanium, system-ui";
    let yy = by + 115;
    for (const line of lines) {
      ctx.fillText(line, w / 2, yy);
      yy += 28;
    }

    ctx.restore();
  }

  // ========= LOOP =========
  function loop(ts) {
    if (state === "playing" && !running) return;

    if (!lastTime) lastTime = ts;
    const dt = clamp((ts - lastTime) / 1000, 0, 0.033);
    lastTime = ts;

    trySpawn(ts);

    if (state === "playing") {
      updateDog(dt, round);

      for (const d of ducks) d.update(dt);
      ducks = ducks.filter(d => d.alive);

      // fin de ronda: ya se resolvieron todos los patos generados en esta ronda
      if (spawnedThisRound >= DUCKS_PER_ROUND && resolvedThisRound >= DUCKS_PER_ROUND) {
        const req = requiredKillsForRound(round);
        if (killsThisRound >= req) endRound();
        else gameOver(`No alcanzaste la meta: ${killsThisRound}/${req}`);
      }

      if (escaped >= MAX_ESCAPES) {
        gameOver("Se escaparon demasiados patos.");
      }
    }

    updateFX(dt);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    drawBackground();
    drawDog();
    for (const d of ducks) d.draw();
    drawFX();

    drawNesHUD();
    syncHUD();

    if (state === "menu") {
      drawCenterOverlay("DUCK HUNT", [
        "CLICK PARA INICIAR",
        "META PROGRESIVA (10 NIVELES):",
        "N1=3  N2=4  N3=5  N4=6  N5=7",
        "N6=8  N7=9  N8=10 N9=11 N10=12",
        "R = RECARGAR   P = PAUSA   M = SONIDO",
        `MEJOR PUNTAJE = ${highScore}`
      ]);
    }

    if (state === "roundEnd") {
      const req = requiredKillsForRound(round);
      drawCenterOverlay(`RONDA ${round} COMPLETADA`, [
        `PATOS: ${killsThisRound}/${DUCKS_PER_ROUND}`,
        `META: ${req}`,
        `PUNTAJE: ${score}`,
        "CLICK PARA CONTINUAR"
      ]);
    }

    if (state === "gameOver") {
      drawCenterOverlay("FIN DEL JUEGO", [
        `PUNTAJE FINAL: ${score}`,
        `RÉCORD: ${highScore}`,
        gameOverReason ? gameOverReason : "",
        "CLICK PARA VOLVER AL MENÚ"
      ].filter(Boolean));
    }

    requestAnimationFrame(loop);
  }

  // ========= INIT =========
  resizeCanvas();
  resetDog();
  syncHUD();
  state = "menu";
  requestAnimationFrame(loop);
})();