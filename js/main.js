/* main.js - Duck Hunt Canvas 2D */

(() => {
  // ======== CONFIG ========
  const BG_SRC = "img/fondo-duckhunt.png"; // <-- TU FONDO (pon la imagen aquí)
  const HS_KEY = "duckhunt_highscore_v1";
  const AMMO_MAX = 6;

  // ======== DOM ========
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const elScore = document.getElementById("score");
  const elHighScore = document.getElementById("highScore");
  const elLevel = document.getElementById("level");
  const elAmmo = document.getElementById("ammo");
  const elMisses = document.getElementById("misses");
  const elEscaped = document.getElementById("escaped");

  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnReload = document.getElementById("btnReload");
  const btnFullscreen = document.getElementById("btnFullscreen");

  const toast = document.getElementById("toast");
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // ======== HELPERS ========
  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 320);
  }

  // ======== CANVAS RESIZE (retina) ========
  function resizeCanvas() {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    // Dibujamos en coordenadas CSS
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas);

  // ======== BACKGROUND ========
  const bgImg = new Image();
  bgImg.src = BG_SRC;

  function drawBackground() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    if (!bgImg.complete || !bgImg.naturalWidth) {
      // Fondo fallback
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, w, h);
      return;
    }

    // Dibujar “cover” (tipo CSS background-size: cover)
    const iw = bgImg.naturalWidth;
    const ih = bgImg.naturalHeight;

    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    ctx.drawImage(bgImg, dx, dy, dw, dh);
  }

  // ======== DUCK IMAGES (SVG -> dataURI) ========
  function duckDataURI({ color = "#ffd400", direction = 1, wingUp = false } = {}) {
    const flip = direction === -1 ? "translate(64 0) scale(-1 1)" : "";
    const wingY = wingUp ? 18 : 22;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <g transform="${flip}">
          <ellipse cx="30" cy="36" rx="18" ry="12" fill="${color}"/>
          <circle cx="44" cy="28" r="3" fill="#0b1220"/>
          <path d="M48 31 L61 27 L54 38 L46 34 Z" fill="#ff7a00"/>
          <path d="M16 ${wingY} C 24 10, 34 10, 38 ${wingY} C 30 ${wingY + 8}, 24 ${wingY + 8}, 16 ${wingY} Z"
                fill="rgba(255,255,255,.35)"/>
          <rect x="16" y="40" width="4" height="10" fill="#5a3b16"/>
          <rect x="24" y="40" width="4" height="10" fill="#5a3b16"/>
        </g>
      </svg>
    `.trim();

    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function makeDuckImages() {
    const variants = [];
    const colors = ["#ffd400", "#7ee081", "#7bb6ff"];
    for (const c of colors) {
      for (const dir of [1, -1]) {
        for (const wingUp of [false, true]) {
          const img = new Image();
          img.src = duckDataURI({ color: c, direction: dir, wingUp });
          variants.push({ img, dir, wingUp, color: c });
        }
      }
    }
    return variants;
  }
  const duckImgs = makeDuckImages();

  // ======== GAME STATE ========
  let ducks = [];
  let running = true;
  let lastTime = 0;

  let score = 0;
  let level = 1;
  let ammo = AMMO_MAX;
  let misses = 0;
  let escaped = 0;

  let highScore = Number(localStorage.getItem(HS_KEY) || 0);
  if (elHighScore) elHighScore.textContent = highScore;

  function difficulty() {
    const speed = 110 + (level - 1) * 22; // px/s
    const spawnEvery = Math.max(520, 1200 - (level - 1) * 90); // ms
    const maxDucks = Math.min(10, 3 + Math.floor((level - 1) / 2));
    const lifeTime = Math.max(2200, 5200 - (level - 1) * 280); // ms
    return { speed, spawnEvery, maxDucks, lifeTime };
  }

  class Duck {
    constructor() {
      const { speed, lifeTime } = difficulty();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      const fromLeft = Math.random() < 0.5;
      this.dir = fromLeft ? 1 : -1;

      this.x = fromLeft ? -60 : w + 60;
      this.y = rand(80, h * 0.62);

      const vxBase = rand(0.75, 1.15) * speed * this.dir;
      const vyBase = rand(-0.55, 0.55) * speed;

      this.vx = vxBase;
      this.vy = vyBase;

      this.size = rand(44, 64);
      this.animT = 0;
      this.color = ["#ffd400", "#7ee081", "#7bb6ff"][Math.floor(rand(0, 3))];

      this.spawnAt = performance.now();
      this.lifeTime = lifeTime + rand(-450, 450);

      this.alive = true;
    }

    get radius() {
      return this.size * 0.38;
    }

    update(dt) {
      this.animT += dt;

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      const h = canvas.clientHeight;
      if (this.y < 60) { this.y = 60; this.vy *= -1; }
      if (this.y > h * 0.70) { this.y = h * 0.70; this.vy *= -1; }

      // Aleatoriedad: vibra en vertical
      if (Math.random() < 0.02) this.vy += rand(-18, 18);

      const now = performance.now();
      if (now - this.spawnAt > this.lifeTime) {
        this.alive = false;
        escaped++;
        if (elEscaped) elEscaped.textContent = escaped;
      }

      const w = canvas.clientWidth;
      if (this.x < -120 || this.x > w + 120) {
        this.alive = false;
        escaped++;
        if (elEscaped) elEscaped.textContent = escaped;
      }
    }

    draw() {
      const wingUp = Math.floor(this.animT * 8) % 2 === 0;
      const pick =
        duckImgs.find(v => v.color === this.color && v.dir === this.dir && v.wingUp === wingUp) || duckImgs[0];

      const s = this.size;
      ctx.drawImage(pick.img, this.x - s / 2, this.y - s / 2, s, s);
    }

    hit(mx, my) {
      const dx = mx - this.x;
      const dy = my - this.y;
      return dx * dx + dy * dy <= this.radius * this.radius;
    }
  }

  // ======== HUD setters ========
  function setScore(v) {
    score = v;
    if (elScore) elScore.textContent = score;

    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HS_KEY, String(highScore));
      if (elHighScore) elHighScore.textContent = highScore;
    }
    updateLevel();
  }

  function setAmmo(v) {
    ammo = v;
    if (elAmmo) elAmmo.textContent = ammo;
  }

  function setMisses(v) {
    misses = v;
    if (elMisses) elMisses.textContent = misses;
  }

  function updateLevel() {
    const targetLevel = 1 + Math.floor(score / 800);
    if (targetLevel !== level) {
      level = targetLevel;
      if (elLevel) elLevel.textContent = level;
      showToast(`Nivel ${level}`);
    }
  }

  // ======== SPAWN ========
  let lastSpawn = 0;
  function trySpawn(now) {
    const { spawnEvery, maxDucks } = difficulty();
    if (ducks.length >= maxDucks) return;
    if (now - lastSpawn >= spawnEvery) {
      ducks.push(new Duck());
      lastSpawn = now;
    }
  }

  // ======== INPUT (mouse = elimina objetos) ========
  canvas.addEventListener("mousedown", (e) => {
    if (!running) return;

    if (ammo <= 0) {
      showToast("Sin balas (R)");
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setAmmo(ammo - 1);

    let hitIndex = -1;
    for (let i = ducks.length - 1; i >= 0; i--) {
      if (ducks[i].hit(mx, my)) {
        hitIndex = i;
        break;
      }
    }

    if (hitIndex >= 0) {
      ducks.splice(hitIndex, 1);

      const bonus = (ammo <= 2) ? 40 : 0;
      const points = 100 + (level - 1) * 15 + bonus;
      setScore(score + points);
      showToast(`+${points}`);
    } else {
      setMisses(misses + 1);
      showToast("Fallo");
    }
  });

  // ======== CONTROLS ========
  function togglePause() {
    running = !running;
    if (btnPause) btnPause.textContent = running ? "Pausar" : "Reanudar";

    if (running) {
      lastTime = 0;
      requestAnimationFrame(loop);
    }
  }

  function reload() {
    setAmmo(AMMO_MAX);
    showToast("Recargado");
  }

  function resetGame() {
    ducks = [];
    lastSpawn = 0;

    score = 0;
    level = 1;
    ammo = AMMO_MAX;
    misses = 0;
    escaped = 0;

    if (elScore) elScore.textContent = "0";
    if (elLevel) elLevel.textContent = "1";
    if (elAmmo) elAmmo.textContent = String(AMMO_MAX);
    if (elMisses) elMisses.textContent = "0";
    if (elEscaped) elEscaped.textContent = "0";

    running = true;
    if (btnPause) btnPause.textContent = "Pausar";
    lastTime = 0;

    showToast("Reiniciado");
  }

  if (btnPause) btnPause.addEventListener("click", togglePause);
  if (btnRestart) btnRestart.addEventListener("click", () => { resetGame(); requestAnimationFrame(loop); });
  if (btnReload) btnReload.addEventListener("click", reload);

  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "p") togglePause();
    if (k === "r") reload();
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

  // ======== DRAW HUD inside canvas (instrucciones) ========
  function drawCanvasHUD() {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(12, 12, 280, 44);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Click dispara • R recarga • P pausa", 22, 40);
    ctx.restore();
  }

  // ======== LOOP ========
  function loop(ts) {
    if (!running) return;

    if (!lastTime) lastTime = ts;
    const dt = clamp((ts - lastTime) / 1000, 0, 0.033);
    lastTime = ts;

    trySpawn(ts);

    for (const d of ducks) d.update(dt);
    ducks = ducks.filter(d => d.alive);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    drawBackground();
    for (const d of ducks) d.draw();
    drawCanvasHUD();

    requestAnimationFrame(loop);
  }

  // ======== INIT ========
  resizeCanvas();
  setScore(0);
  setAmmo(AMMO_MAX);
  setMisses(0);
  if (elEscaped) elEscaped.textContent = "0";
  if (elLevel) elLevel.textContent = "1";

  // Arranca el juego incluso si el fondo tarda
  requestAnimationFrame(loop);
})();
