(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const overlay = $('#overlay'), playBtn = $('#play-btn');
  const WAVE_MAX = 6;
  let w = 0, h = 0, dpr = 1, last = 0, state = 'title', wave = 1;
  let player, zombies = [], bullets = [], particles = [], props = [], keys = new Set();
  let spawned = 0, total = 8, spawnTimer = 0, waveWait = 0, fireTimer = 0, bannerTimer = 0;
  let pointer = { x: 0, y: 0, down: false }, joystick = { active: false, id: null, x: 0, y: 0 }, touchFire = false;
  let kills = 0, soundOn = false, audio = null, shake = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    w = rect.width; h = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    props = [];
    for (let i = 0; i < 16; i++) props.push({ x: (i * 197 + 83) % Math.max(100, w), y: (i * 127 + 42) % Math.max(100, h), r: 12 + (i % 3) * 5, type: i % 4 });
    if (!player) player = { x: w / 2, y: h / 2, r: 13, hp: 100, angle: -Math.PI / 2, inv: 0 };
    else { player.x = Math.min(w - 25, Math.max(25, player.x)); player.y = Math.min(h - 30, Math.max(95, player.y)); }
  }
  window.addEventListener('resize', resize); resize();

  function updateHud() {
    $('#wave').textContent = String(wave).padStart(2, '0');
    $('#footer-wave').textContent = String(wave).padStart(2, '0');
    $('#kills').innerHTML = `${kills} <small>/ ${total}</small>`;
    $('#health-fill').style.width = `${player.hp}%`;
    $('#health-fill').style.background = player.hp < 32 ? '#e65f4b' : 'var(--acid)';
    $('#health-text').textContent = `${Math.ceil(player.hp)}%`;
    $('#ammo').innerHTML = '12 <small>/ ∞</small>';
    $('#objective').textContent = state === 'playing' ? `${Math.max(0, total - kills)} HOSTILES REMAIN` : 'CLEAR THE AREA';
    $('#zone-name').textContent = wave >= 5 ? 'QUARANTINE PERIMETER' : wave >= 3 ? 'OLD TOWN · SECTOR 04' : 'ABANDONED DISTRICT';
  }
  function showBanner(title, sub) {
    const b = $('#wave-banner'); b.innerHTML = `<span>${title}</span><b>${sub}</b>`; b.classList.add('visible'); bannerTimer = 2.3;
  }
  function startGame() {
    wave = 1; kills = 0; player.hp = 100; player.x = w / 2; player.y = h / 2; player.inv = 0;
    zombies = []; bullets = []; particles = []; state = 'playing'; startWave();
    overlay.classList.add('hidden');
  }
  function startWave() {
    state = 'playing'; spawned = 0; kills = 0; total = 5 + wave * 3; spawnTimer = 1.15; waveWait = 0;
    updateHud(); showBanner(`WAVE ${String(wave).padStart(2, '0')}`, wave % 3 === 0 ? 'BRUTE INBOUND' : 'THEY’RE COMING');
  }
  function nextWave() {
    if (wave >= WAVE_MAX) {
      state = 'won'; overlay.classList.remove('hidden');
      $('#overlay-title').innerHTML = 'YOU<br><em>MADE IT</em>';
      $('#overlay-copy').innerHTML = 'Six sectors cleared. Sunrise is yours.<br>But the city is still crawling.';
      playBtn.innerHTML = '<span>▶</span> <b>PLAY AGAIN</b> <span class="button-arrow">↗</span>';
      $('#objective').textContent = 'EXTRACTION COMPLETE'; return;
    }
    wave++; player.hp = Math.min(100, player.hp + 16); startWave();
  }
  function gameOver() {
    state = 'over'; overlay.classList.remove('hidden');
    $('#overlay-title').innerHTML = 'THEY<br><em>GOT YOU</em>';
    $('#overlay-copy').innerHTML = `You cleared ${wave > 1 ? wave - 1 : 0} ${wave === 2 ? 'sector' : 'sectors'}.<br>The dead don't give second chances.`;
    playBtn.innerHTML = '<span>▶</span> <b>TRY AGAIN</b> <span class="button-arrow">↗</span>';
  }
  playBtn.addEventListener('click', () => state === 'paused' ? resume() : startGame());
  $('#pause-btn').addEventListener('click', () => {
    if (state === 'playing') { state = 'paused'; overlay.classList.remove('hidden'); $('#overlay-title').innerHTML = 'TAKE A<br><em>BREATHER</em>'; $('#overlay-copy').textContent = 'The infected are waiting. Get back out there.'; playBtn.innerHTML = '<span>▶</span> <b>RESUME</b> <span class="button-arrow">↗</span>'; }
  });
  function resume() { state = 'playing'; overlay.classList.add('hidden'); }
  window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault(); keys.add(k); if (k === 'escape' && state === 'playing') $('#pause-btn').click(); });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; });
  canvas.addEventListener('pointerdown', e => { pointer.down = true; canvas.setPointerCapture?.(e.pointerId); });
  window.addEventListener('pointerup', () => pointer.down = false);
  const stick = $('#joystick');
  stick.addEventListener('pointerdown', e => { e.preventDefault(); joystick.active = true; joystick.id = e.pointerId; stick.setPointerCapture(e.pointerId); updateStick(e); });
  stick.addEventListener('pointermove', e => { if (joystick.active && e.pointerId === joystick.id) updateStick(e); });
  function updateStick(e) {
    const r = stick.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), len = Math.hypot(dx, dy), max = r.width * .32;
    const x = len ? dx / len * Math.min(max, len) : 0, y = len ? dy / len * Math.min(max, len) : 0;
    joystick.x = x / max; joystick.y = y / max; stick.querySelector('span').style.transform = `translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;
  }
  function endStick(e) { if (e.pointerId === joystick.id) { joystick.active = false; joystick.x = joystick.y = 0; stick.querySelector('span').style.transform = 'translate(-50%,-50%)'; } }
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
  const fireButton = $('#fire-btn');
  fireButton.addEventListener('pointerdown', e => { e.preventDefault(); touchFire = true; fireButton.setPointerCapture(e.pointerId); });
  fireButton.addEventListener('pointerup', () => touchFire = false); fireButton.addEventListener('pointercancel', () => touchFire = false);
  $('#sound-btn').addEventListener('click', e => { soundOn = !soundOn; e.currentTarget.textContent = soundOn ? '♫' : '♪'; e.currentTarget.style.color = soundOn ? 'var(--acid)' : ''; if (soundOn && !audio) audio = new (window.AudioContext || window.webkitAudioContext)(); });
  function beep(freq, duration, volume) { if (!soundOn || !audio) return; try { const o = audio.createOscillator(), g = audio.createGain(); o.type = 'square'; o.frequency.value = freq; g.gain.setValueAtTime(volume, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration); o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + duration); } catch (_) {} }

  function spawnZombie() {
    const side = Math.floor(Math.random() * 4), pad = 28;
    const x = side === 0 ? -pad : side === 1 ? w + pad : Math.random() * w;
    const y = side === 2 ? -pad : side === 3 ? h + pad : 85 + Math.random() * Math.max(50, h - 140);
    const brute = wave % 3 === 0 && spawned === total - 1;
    zombies.push({ x, y, r: brute ? 22 : 13 + Math.random() * 2, hp: brute ? 5 + wave : 2 + Math.floor(wave / 3), maxHp: brute ? 5 + wave : 2 + Math.floor(wave / 3), speed: (brute ? 26 : 38 + Math.random() * 15) + wave * 2, attack: 0, hit: 0, phase: Math.random() * 6.28, brute });
    spawned++;
  }
  function burst(x, y, color, count = 6) { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 110; particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: .25 + Math.random() * .42, max: .67, color, r: 1 + Math.random() * 3 }); } }
  function closestZombie() { let z = null, d = Infinity; for (const e of zombies) { const n = Math.hypot(e.x - player.x, e.y - player.y); if (n < d) { d = n; z = e; } } return z; }
  function shoot() {
    if (fireTimer > 0) return;
    let tx = pointer.x, ty = pointer.y;
    if (touchFire || (w < 700 && !pointer.down)) { const z = closestZombie(); if (!z) return; tx = z.x; ty = z.y; }
    let a = Math.atan2(ty - player.y, tx - player.x); if (!Number.isFinite(a)) a = player.angle;
    player.angle = a; bullets.push({ x: player.x + Math.cos(a) * 19, y: player.y + Math.sin(a) * 19, vx: Math.cos(a) * 610, vy: Math.sin(a) * 610, life: 1.05 });
    burst(player.x + Math.cos(a) * 22, player.y + Math.sin(a) * 22, '#d8f36a', 2); fireTimer = .19; beep(105, .055, .025);
  }
  function update(dt) {
    if (state !== 'playing') return;
    fireTimer = Math.max(0, fireTimer - dt); player.inv = Math.max(0, player.inv - dt); shake = Math.max(0, shake - dt * 20);
    if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) $('#wave-banner').classList.remove('visible');
    let mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + joystick.x;
    let my = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0) + joystick.y;
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    player.x = Math.max(20, Math.min(w - 20, player.x + mx * 205 * dt)); player.y = Math.max(88, Math.min(h - 38, player.y + my * 205 * dt));
    if (Math.hypot(mx, my) < .1 && !touchFire && !pointer.down) { const z = closestZombie(); if (z && w < 700) player.angle = Math.atan2(z.y - player.y, z.x - player.x); }
    else if (!touchFire && !pointer.down) player.angle = Math.atan2(pointer.y - player.y, pointer.x - player.x);
    if (pointer.down || touchFire || keys.has(' ')) shoot();
    spawnTimer -= dt;
    if (spawned < total && spawnTimer <= 0) { spawnZombie(); spawnTimer = Math.max(.42, 1.05 - wave * .07); }
    for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
    bullets = bullets.filter(b => b.life > 0 && b.x > -20 && b.x < w + 20 && b.y > 60 && b.y < h + 20);
    for (const z of zombies) {
      z.phase += dt * 8; z.hit = Math.max(0, z.hit - dt); z.attack -= dt;
      const dx = player.x - z.x, dy = player.y - z.y, dist = Math.hypot(dx, dy) || 1;
      if (dist > z.r + player.r + 2) { z.x += dx / dist * z.speed * dt; z.y += dy / dist * z.speed * dt; }
      if (dist < z.r + player.r + 4 && z.attack <= 0 && player.inv <= 0) { player.hp -= z.brute ? 16 : 9; player.inv = .58; z.attack = .78; shake = 5; burst(player.x, player.y, '#e95e4a', 7); beep(55, .13, .045); if (player.hp <= 0) { player.hp = 0; updateHud(); gameOver(); return; } }
      for (const b of bullets) { if (b.life <= 0) continue; if (Math.hypot(z.x - b.x, z.y - b.y) < z.r + 5) { z.hp--; z.hit = .1; b.life = 0; burst(b.x, b.y, '#e4dfc8', 3); if (z.hp <= 0) { z.dead = true; kills++; burst(z.x, z.y, z.brute ? '#b54b39' : '#718751', 11); } break; } }
    }
    zombies = zombies.filter(z => !z.dead);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    if (spawned === total && zombies.length === 0) { waveWait += dt; if (waveWait > 1.05) { nextWave(); return; } }
    updateHud();
  }

  function drawBackground() {
    ctx.fillStyle = '#28302a'; ctx.fillRect(0, 0, w, h);
    const grad = ctx.createRadialGradient(w * .5, h * .46, 30, w * .5, h * .5, Math.max(w, h) * .68);
    grad.addColorStop(0, '#394238'); grad.addColorStop(.58, '#2b342c'); grad.addColorStop(1, '#161e19'); ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.globalAlpha = .15; ctx.strokeStyle = '#a4ab91'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 38) { ctx.beginPath(); ctx.moveTo(x, 65); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 80; y < h; y += 38) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.restore();
    // worn central road and dashed lane markings
    ctx.fillStyle = 'rgba(17,23,20,.17)'; ctx.fillRect(w * .18, 68, w * .64, h - 106);
    ctx.setLineDash([12, 22]); ctx.strokeStyle = 'rgba(206,208,177,.13)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w / 2, 85); ctx.lineTo(w / 2, h - 42); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < props.length; i++) {
      const p = props[i]; if (p.y < 76 || p.y > h - 45) continue;
      ctx.save(); ctx.translate(p.x, p.y);
      if (p.type === 0) { ctx.fillStyle = '#333a31'; ctx.beginPath(); ctx.arc(0, 0, p.r + 4, 0, 7); ctx.fill(); ctx.fillStyle = '#566249'; ctx.beginPath(); ctx.arc(-3, -3, p.r * .76, 0, 7); ctx.fill(); ctx.fillStyle = '#687753'; ctx.beginPath(); ctx.arc(5, 2, p.r * .55, 0, 7); ctx.fill(); }
      else if (p.type === 1) { ctx.rotate(.3); ctx.fillStyle = '#252c27'; ctx.fillRect(-p.r * 1.5, -p.r * .5, p.r * 3, p.r); ctx.fillStyle = '#4d574b'; ctx.fillRect(-p.r * 1.3, -p.r * .3, p.r * 2.6, p.r * .6); }
      else if (p.type === 2) { ctx.strokeStyle = '#717968'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-p.r, -p.r / 2); ctx.lineTo(p.r, p.r / 2); ctx.moveTo(-p.r / 2, p.r); ctx.lineTo(p.r / 2, -p.r); ctx.stroke(); }
      else { ctx.fillStyle = '#3d493c'; ctx.fillRect(-4, -p.r, 8, p.r * 2); ctx.fillRect(-p.r, -4, p.r * 2, 8); ctx.fillStyle = '#647b42'; ctx.fillRect(-2, -p.r + 3, 4, p.r * 2 - 6); ctx.fillRect(-p.r + 3, -2, p.r * 2 - 6, 4); }
      ctx.restore();
    }
    // subtle edge vignette
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .25, w / 2, h / 2, Math.max(w, h) * .7); v.addColorStop(0, 'transparent'); v.addColorStop(1, 'rgba(4,8,6,.45)'); ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  }
  function drawPlayer() {
    if (player.inv > 0 && Math.floor(player.inv * 18) % 2 === 0) return;
    ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle);
    ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(1, 8, 17, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#b7c49c'; ctx.beginPath(); ctx.arc(0, 1, 13, 0, 7); ctx.fill();
    ctx.fillStyle = '#45583f'; ctx.beginPath(); ctx.arc(-2, 0, 9.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#d4cda9'; ctx.beginPath(); ctx.arc(4, -3, 7, -1.3, 1.25); ctx.fill();
    ctx.fillStyle = '#343a31'; ctx.fillRect(4, -4, 20, 7); ctx.fillStyle = '#d8f36a'; ctx.fillRect(19, -2.5, 9, 2);
    ctx.fillStyle = '#222922'; ctx.fillRect(-10, -3, 6, 5); ctx.restore();
  }
  function drawZombie(z) {
    ctx.save(); ctx.translate(z.x, z.y + Math.sin(z.phase) * 1.5);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(2, z.r * .75, z.r * 1.2, z.r * .5, 0, 0, 7); ctx.fill();
    if (z.brute) { ctx.fillStyle = '#503e34'; ctx.beginPath(); ctx.ellipse(0, 1, z.r * 1.2, z.r * 1.13, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#85764d'; ctx.beginPath(); ctx.arc(-2, -3, z.r * .72, 0, 7); ctx.fill(); ctx.fillStyle = '#d64d35'; ctx.fillRect(1, -6, 4, 3); ctx.fillRect(7, -6, 4, 3); }
    else { ctx.rotate(Math.sin(z.phase * .5) * .12); ctx.fillStyle = z.hit ? '#d2d3b1' : '#69795b'; ctx.beginPath(); ctx.ellipse(0, 2, z.r * .78, z.r, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#899474'; ctx.beginPath(); ctx.arc(-2, -5, z.r * .68, 0, 7); ctx.fill(); ctx.fillStyle = '#d64c38'; ctx.fillRect(1, -7, 3, 2); ctx.fillRect(6, -7, 3, 2); ctx.strokeStyle = '#8f684c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-z.r * .4, 1); ctx.lineTo(-z.r * 1.2, 5); ctx.moveTo(z.r * .4, 1); ctx.lineTo(z.r * 1.3, 4); ctx.stroke(); }
    if (z.hp < z.maxHp) { const bw = z.r * 2; ctx.fillStyle = '#222820'; ctx.fillRect(-bw / 2, -z.r - 10, bw, 3); ctx.fillStyle = '#da7652'; ctx.fillRect(-bw / 2, -z.r - 10, bw * Math.max(0, z.hp / z.maxHp), 3); }
    ctx.restore();
  }
  function render() {
    ctx.clearRect(0, 0, w, h); ctx.save(); if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    drawBackground();
    for (const b of bullets) { ctx.fillStyle = '#e5f98b'; ctx.shadowColor = '#d8f36a'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    for (const z of zombies) drawZombie(z);
    for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life / .2); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
    drawPlayer(); ctx.restore();
    if (state === 'title') { ctx.fillStyle = 'rgba(7,12,9,.16)'; ctx.fillRect(0, 0, w, h); }
  }
  function frame(t) { const dt = Math.min(.035, (t - last) / 1000 || 0); last = t; update(dt); render(); requestAnimationFrame(frame); }
  updateHud(); requestAnimationFrame(frame);
})();
