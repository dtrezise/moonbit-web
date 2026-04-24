(() => {
  const {
    Engine,
    World,
    Bodies,
    Body,
    Constraint,
    Events,
    Vector,
  } = Matter;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const distanceEl = document.getElementById("distance");
  const velocityEl = document.getElementById("velocity");

  const assets = {
    moon: loadImage("./assets/textures/moonDetail.jpg"),
    buggy: loadImage("./assets/sprites/buggyFrame.png"),
    engine: new Audio("./assets/audio/engineDrill.m4a"),
    bounce: new Audio("./assets/audio/tireBounce.m4a"),
    crash: new Audio("./assets/audio/metalCrash.m4a"),
  };

  assets.engine.loop = true;
  assets.engine.volume = 0;
  assets.bounce.volume = 0.35;
  assets.crash.volume = 0.55;

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    zoom: 0.84,
    targetZoom: 0.84,
    camera: { x: 0, y: 0 },
    keys: new Set(),
    touches: new Map(),
    touchStartX: 0,
    dragX: 0,
    accelerating: false,
    pitch: 0,
    dust: [],
    stars: makeStars(170),
    audioPrimed: false,
    lastTime: 0,
  };

  const engine = Engine.create({ enableSleeping: false });
  engine.gravity.y = 0.62;
  engine.positionIterations = 10;
  engine.velocityIterations = 8;

  const terrain = createTerrain(1180, 160, -2400, 36000);
  const terrainBodies = createTerrainBodies(terrain);
  World.add(engine.world, terrainBodies);

  const rover = createRover(420, terrainHeightAt(terrain, 420) - 170);
  World.add(engine.world, [
    rover.body,
    rover.frontWheel,
    rover.backWheel,
    rover.frontAxle,
    rover.backAxle,
  ]);

  Events.on(engine, "collisionStart", ({ pairs }) => {
    let impact = 0;
    for (const pair of pairs) {
      if (pair.bodyA.isStatic || pair.bodyB.isStatic) {
        const roverHit =
          pair.bodyA.label.startsWith("moonbit") || pair.bodyB.label.startsWith("moonbit");
        if (roverHit) impact = Math.max(impact, pair.collision.depth + pair.bodyA.speed + pair.bodyB.speed);
      }
    }

    if (impact > 2.4) {
      playOneShot(impact > 4.8 ? assets.crash : assets.bounce, Math.min(1, impact / 7));
      burstDust(rover.body.position.x, rover.body.position.y + 38, Math.min(16, 4 + impact * 2));
    }
  });

  resize();
  window.addEventListener("resize", resize);
  bindInput();
  requestAnimationFrame(loop);

  function loop(time) {
    const dt = Math.min(32, time - (state.lastTime || time));
    state.lastTime = time;

    updateControls();
    updateRover();
    Engine.update(engine, 1000 / 60);
    updateCamera(dt);
    updateAudio();
    updateDust(dt);
    draw();

    requestAnimationFrame(loop);
  }

  function updateControls() {
    const keyAccel = state.keys.has("ArrowRight") || state.keys.has("Space") || state.keys.has("KeyW");
    const keyBack = state.keys.has("ArrowLeft") || state.keys.has("KeyS");
    const pitchLeft = state.keys.has("KeyA") || state.keys.has("ArrowUp");
    const pitchRight = state.keys.has("KeyD") || state.keys.has("ArrowDown");

    state.accelerating = keyAccel || state.touches.size > 0;
    state.pitch = 0;

    if (keyBack) state.pitch -= 0.35;
    if (pitchLeft) state.pitch -= 1;
    if (pitchRight) state.pitch += 1;
    if (Math.abs(state.dragX) > 8) state.pitch += clamp(state.dragX / 90, -1.2, 1.2);
  }

  function updateRover() {
    const wheelSpin = state.accelerating ? 0.092 : -0.018;
    const drive = state.accelerating ? 0.0022 : 0;
    const bodyAngle = rover.body.angle;
    const forward = { x: Math.cos(bodyAngle) * drive, y: Math.sin(bodyAngle) * drive };

    if (state.accelerating) {
      Body.setAngularVelocity(rover.frontWheel, rover.frontWheel.angularVelocity + wheelSpin);
      Body.setAngularVelocity(rover.backWheel, rover.backWheel.angularVelocity + wheelSpin);
      Body.applyForce(rover.frontWheel, rover.frontWheel.position, forward);
      Body.applyForce(rover.backWheel, rover.backWheel.position, forward);
      maybeTrailDust();
    }

    if (state.pitch) {
      rover.body.torque += state.pitch * 0.022;
    }

    const tooLow = rover.body.position.y > terrainHeightAt(terrain, rover.body.position.x) + 900;
    if (tooLow) rescue();
  }

  function updateCamera(dt) {
    state.targetZoom = clamp(state.targetZoom, 0.62, 1.28);
    state.zoom += (state.targetZoom - state.zoom) * 0.08;

    const targetX = rover.body.position.x + 200;
    const groundY = terrainHeightAt(terrain, rover.body.position.x);
    const targetY = lerp(rover.body.position.y, groundY, 0.35) - 180;
    const blend = 1 - Math.pow(0.001, dt / 1000);
    state.camera.x += (targetX - state.camera.x) * blend;
    state.camera.y += (targetY - state.camera.y) * blend;

    distanceEl.textContent = `${Math.max(0, Math.floor((rover.body.position.x - 420) / 8)).toString().padStart(4, "0")} m`;
    velocityEl.textContent = `${(Vector.magnitude(rover.body.velocity) * 1.65).toFixed(1)} m/s`;
  }

  function updateAudio() {
    if (!state.audioPrimed) return;
    const moving = state.accelerating && Math.abs(rover.frontWheel.angularVelocity) > 0.08;
    const targetVol = moving ? 0.34 : 0;
    assets.engine.volume += (targetVol - assets.engine.volume) * 0.08;
    assets.engine.playbackRate = clamp(0.72 + Math.abs(rover.frontWheel.angularVelocity) * 0.16, 0.72, 1.65);
    if (targetVol > 0 && assets.engine.paused) assets.engine.play().catch(() => {});
    if (assets.engine.volume < 0.01 && !moving) assets.engine.pause();
  }

  function draw() {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);

    drawSky();
    ctx.save();
    const yPivot = state.height > state.width ? 0.36 : 0.5;
    ctx.translate(state.width * 0.46, state.height * yPivot);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-state.camera.x, -state.camera.y);
    drawTerrain();
    drawDust();
    drawRover();
    ctx.restore();
    drawVignette();
  }

  function drawSky() {
    const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
    gradient.addColorStop(0, "#07090d");
    gradient.addColorStop(0.58, "#14171b");
    gradient.addColorStop(1, "#25282a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = "#f6f1de";
    for (const star of state.stars) {
      const x = (star.x * state.width - state.camera.x * star.depth * 0.02) % state.width;
      const y = star.y * state.height * 0.68;
      ctx.globalAlpha = star.alpha;
      ctx.fillRect(x < 0 ? x + state.width : x, y, star.size, star.size);
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    ctx.arc(state.width - 145, 118, 62, 0, Math.PI * 2);
    ctx.fillStyle = "#d5d0bd";
    ctx.fill();
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.arc(state.width - 120, 98, 62, 0, Math.PI * 2);
    ctx.fillStyle = "#07090d";
    ctx.fill();
    ctx.restore();
  }

  function drawTerrain() {
    const left = state.camera.x - state.width / state.zoom;
    const right = state.camera.x + state.width / state.zoom;
    const start = Math.max(0, Math.floor(left / terrain.step) - 2);
    const end = Math.min(terrain.points.length - 1, Math.ceil(right / terrain.step) + 2);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(terrain.points[start].x, terrain.points[start].y);
    for (let i = start + 1; i <= end; i++) {
      ctx.lineTo(terrain.points[i].x, terrain.points[i].y);
    }
    ctx.lineTo(terrain.points[end].x, terrain.base + 1200);
    ctx.lineTo(terrain.points[start].x, terrain.base + 1200);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, terrain.base - 280, 0, terrain.base + 620);
    fill.addColorStop(0, "#b8b0a0");
    fill.addColorStop(0.28, "#77746f");
    fill.addColorStop(1, "#3d3a35");
    ctx.fillStyle = fill;
    ctx.fill();

    if (assets.moon.complete) {
      ctx.globalAlpha = 0.2;
      const pattern = ctx.createPattern(assets.moon, "repeat");
      ctx.fillStyle = pattern;
      ctx.fill();
    }

    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#d7d0bd";
    ctx.stroke();
    ctx.restore();

    drawDistantRidges(left, right);
  }

  function drawDistantRidges(left, right) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    const offset = state.camera.x * 0.42;
    const startX = left - 600;
    ctx.moveTo(startX, terrain.base + 65);
    for (let x = startX; x <= right + 600; x += 180) {
      const y = terrain.base + 55 + Math.sin((x + offset) * 0.004) * 38 + Math.sin(x * 0.0017) * 72;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(right + 700, terrain.base + 800);
    ctx.lineTo(startX, terrain.base + 800);
    ctx.closePath();
    ctx.fillStyle = "#34383e";
    ctx.fill();
    ctx.restore();
  }

  function drawRover() {
    drawWheel(rover.backWheel);
    drawWheel(rover.frontWheel);

    ctx.save();
    ctx.translate(rover.body.position.x, rover.body.position.y);
    ctx.rotate(rover.body.angle);

    ctx.fillStyle = "#20242b";
    roundRect(ctx, -78, -25, 156, 48, 8);
    ctx.fill();
    ctx.strokeStyle = "#cec4a9";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-58, -26);
    ctx.lineTo(-20, -62);
    ctx.lineTo(42, -58);
    ctx.lineTo(71, -24);
    ctx.closePath();
    ctx.fillStyle = "#333a43";
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#b4ab94";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-58, -4);
    ctx.lineTo(-38, 31);
    ctx.moveTo(60, -4);
    ctx.lineTo(44, 31);
    ctx.stroke();

    if (assets.buggy.complete) {
      ctx.globalAlpha = 0.22;
      ctx.drawImage(assets.buggy, -82, -84, 164, 164);
    }

    ctx.restore();
  }

  function drawWheel(wheel) {
    ctx.save();
    ctx.translate(wheel.position.x, wheel.position.y);
    ctx.rotate(wheel.angle);
    ctx.fillStyle = "#15181d";
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#817a6d";
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#d0c6ad";
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(23, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDust() {
    ctx.save();
    for (const puff of state.dust) {
      ctx.globalAlpha = puff.life;
      ctx.fillStyle = `rgba(206, 198, 178, ${0.22 * puff.life})`;
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.size * (1.4 - puff.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVignette() {
    const gradient = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.48,
      state.height * 0.18,
      state.width * 0.5,
      state.height * 0.48,
      state.height * 0.8,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function createRover(x, y) {
    const body = Bodies.rectangle(x, y, 150, 44, {
      label: "moonbit-body",
      density: 0.0022,
      frictionAir: 0.025,
      restitution: 0.08,
    });
    const frontWheel = Bodies.circle(x + 58, y + 36, 29, {
      label: "moonbit-front-wheel",
      density: 0.0038,
      friction: 1.35,
      frictionAir: 0.018,
      restitution: 0.1,
    });
    const backWheel = Bodies.circle(x - 58, y + 36, 29, {
      label: "moonbit-back-wheel",
      density: 0.0038,
      friction: 1.35,
      frictionAir: 0.018,
      restitution: 0.1,
    });

    const frontAxle = Constraint.create({
      bodyA: body,
      pointA: { x: 58, y: 26 },
      bodyB: frontWheel,
      length: 17,
      stiffness: 0.75,
      damping: 0.12,
    });
    const backAxle = Constraint.create({
      bodyA: body,
      pointA: { x: -58, y: 26 },
      bodyB: backWheel,
      length: 17,
      stiffness: 0.75,
      damping: 0.12,
    });

    return { body, frontWheel, backWheel, frontAxle, backAxle };
  }

  function createTerrain(base, step, startX, length) {
    const rng = mulberry32(0x4d6f6f6e);
    const points = [];
    let y = base;
    for (let x = startX; x <= length; x += step) {
      const wave =
        Math.sin(x * 0.0021) * 120 +
        Math.sin(x * 0.0053 + 2.4) * 52 +
        Math.sin(x * 0.00058 + 1.8) * 190;
      y += (rng() - 0.48) * 34;
      y = lerp(y, base + wave, 0.24);
      points.push({ x, y });
    }
    return { base, step, points };
  }

  function createTerrainBodies(terrainData) {
    const bodies = [];
    for (let i = 1; i < terrainData.points.length; i++) {
      const a = terrainData.points[i - 1];
      const b = terrainData.points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2 + 46;
      bodies.push(
        Bodies.rectangle(midX, midY, length + 10, 92, {
          label: "terrain",
          isStatic: true,
          angle,
          friction: 1.1,
          restitution: 0.05,
        }),
      );
    }
    return bodies;
  }

  function terrainHeightAt(terrainData, x) {
    const firstX = terrainData.points[0].x;
    const lastX = terrainData.points[terrainData.points.length - 1].x;
    const clampedX = clamp(x, firstX, lastX);
    const idx = Math.min(terrainData.points.length - 2, Math.floor((clampedX - firstX) / terrainData.step));
    const a = terrainData.points[idx];
    const b = terrainData.points[idx + 1];
    const t = (clampedX - a.x) / terrainData.step;
    return lerp(a.y, b.y, t);
  }

  function maybeTrailDust() {
    if (Math.random() > 0.72) return;
    const wheel = Math.random() > 0.5 ? rover.backWheel : rover.frontWheel;
    const ground = terrainHeightAt(terrain, wheel.position.x);
    if (Math.abs(wheel.position.y + 28 - ground) < 24) {
      state.dust.push({
        x: wheel.position.x - 24 + Math.random() * 22,
        y: ground + 3,
        vx: -1.1 - Math.random() * 1.6,
        vy: -0.5 - Math.random() * 0.8,
        life: 0.9,
        size: 15 + Math.random() * 20,
      });
    }
  }

  function burstDust(x, y, count) {
    for (let i = 0; i < count; i++) {
      state.dust.push({
        x: x + (Math.random() - 0.5) * 50,
        y: y + (Math.random() - 0.5) * 34,
        vx: (Math.random() - 0.65) * 3,
        vy: -Math.random() * 2.4,
        life: 0.85,
        size: 18 + Math.random() * 28,
      });
    }
  }

  function updateDust(dt) {
    const seconds = dt / 16.67;
    for (const puff of state.dust) {
      puff.x += puff.vx * seconds;
      puff.y += puff.vy * seconds;
      puff.vy += 0.018 * seconds;
      puff.life -= 0.016 * seconds;
    }
    state.dust = state.dust.filter((puff) => puff.life > 0);
  }

  function rescue() {
    const x = Math.max(360, rover.body.position.x - 80);
    const y = terrainHeightAt(terrain, x) - 160;
    Body.setPosition(rover.body, { x, y });
    Body.setAngle(rover.body, 0);
    Body.setVelocity(rover.body, { x: 0, y: 0 });
    Body.setAngularVelocity(rover.body, 0);
    Body.setPosition(rover.backWheel, { x: x - 58, y: y + 36 });
    Body.setPosition(rover.frontWheel, { x: x + 58, y: y + 36 });
    Body.setVelocity(rover.backWheel, { x: 0, y: 0 });
    Body.setVelocity(rover.frontWheel, { x: 0, y: 0 });
    Body.setAngularVelocity(rover.backWheel, 0);
    Body.setAngularVelocity(rover.frontWheel, 0);
    burstDust(x, y + 34, 12);
  }

  function bindInput() {
    window.addEventListener("keydown", (event) => {
      if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      primeAudio();
      state.keys.add(event.code);
      if (event.code === "KeyR") rescue();
    });

    window.addEventListener("keyup", (event) => {
      state.keys.delete(event.code);
    });

    canvas.addEventListener("pointerdown", (event) => {
      primeAudio();
      canvas.setPointerCapture(event.pointerId);
      state.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      state.touchStartX = event.clientX;
      state.dragX = 0;
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!state.touches.has(event.pointerId)) return;
      state.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      state.dragX = event.clientX - state.touchStartX;
    });

    canvas.addEventListener("pointerup", clearPointer);
    canvas.addEventListener("pointercancel", clearPointer);

    document.getElementById("rescue").addEventListener("click", () => {
      primeAudio();
      rescue();
    });
    document.getElementById("zoomIn").addEventListener("click", () => {
      state.targetZoom += 0.12;
    });
    document.getElementById("zoomOut").addEventListener("click", () => {
      state.targetZoom -= 0.12;
    });
  }

  function clearPointer(event) {
    state.touches.delete(event.pointerId);
    if (state.touches.size === 0) state.dragX = 0;
  }

  function primeAudio() {
    if (state.audioPrimed) return;
    state.audioPrimed = true;
    assets.engine.play().then(() => {
      assets.engine.pause();
      assets.engine.currentTime = 0;
    }).catch(() => {});
  }

  function playOneShot(audio, intensity) {
    if (!state.audioPrimed) return;
    const clip = audio.cloneNode();
    clip.volume = audio.volume * clamp(intensity, 0.25, 1);
    clip.playbackRate = 0.92 + Math.random() * 0.18;
    clip.play().catch(() => {});
  }

  function resize() {
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
  }

  function loadImage(src) {
    const image = new Image();
    image.src = src;
    return image;
  }

  function makeStars(count) {
    const rng = mulberry32(0x73746172);
    return Array.from({ length: count }, () => ({
      x: rng(),
      y: rng(),
      depth: 0.3 + rng() * 1.4,
      size: rng() > 0.92 ? 2 : 1,
      alpha: 0.22 + rng() * 0.65,
    }));
  }

  function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function mulberry32(seed) {
    return function random() {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
