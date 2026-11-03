(() => {
  const $ = (s) => document.querySelector(s);
  const SCENES = [
    { id: 'rain', name: 'Rain', file: 'music/rain.mp3' },
    { id: 'forest', name: 'Forest', file: 'music/forest.mp3' },
    { id: 'ocean', name: 'Ocean', file: 'music/ocean.mp3' },
    { id: 'cafe', name: 'Café', file: 'music/cafe.mp3' },
    { id: 'fireplace', name: 'Fireplace', file: 'music/fireplace.mp3' },
    { id: 'night', name: 'Night', file: 'music/night.mp3' }
  ];
  const audios = {};            // scene id -> Audio
  let tracks = [], idx = -1, trackUrl = null;
  const userAudio = new Audio();
  let sleepTimer = null;

  /* ---------- dock ---------- */
  function updateDock() {
    const names = SCENES.filter((s) => audios[s.id] && !audios[s.id].paused).map((s) => s.name);
    if (!userAudio.paused && tracks[idx]) names.push(tracks[idx].name.replace(/\.[^.]+$/, ''));
    $('#dockMusic').textContent = names.length ? '♪ ' + names.join(' + ') : '';
    $('#dockStop').classList.toggle('hidden', !names.length);
    ZC.dockUpdate();
  }
  function stopAll() {
    Object.values(audios).forEach((a) => a.pause());
    userAudio.pause();
    SCENES.forEach((s) => { const c = document.querySelector(`[data-scene="${s.id}"]`); if (c) c.classList.remove('on'); });
    $('#btnPlayT').textContent = 'Play';
    updateDock();
  }
  $('#dockStop').addEventListener('click', stopAll);

  /* ---------- ambient scenes ---------- */
  const box = $('#scenes');
  SCENES.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'scene';
    card.dataset.scene = s.id;
    card.innerHTML = `<button>${s.name}</button><input type="range" min="0" max="1" step="0.05" value="0.6" aria-label="${s.name} volume">`;
    const btn = card.querySelector('button'), vol = card.querySelector('input');
    btn.addEventListener('click', () => {
      let a = audios[s.id];
      if (a && !a.paused) { a.pause(); card.classList.remove('on'); return updateDock(); }
      if (!a) { a = audios[s.id] = new Audio(s.file); a.loop = true; }
      a.volume = parseFloat(vol.value);
      a.play().then(() => { card.classList.add('on'); updateDock(); })
        .catch(() => ZC.toast(`Could not play ${s.name}. Add ${s.file} to your repo.`));
    });
    vol.addEventListener('input', () => { if (audios[s.id]) audios[s.id].volume = parseFloat(vol.value); });
    box.appendChild(card);
  });

  $('#sleepSel').addEventListener('change', (e) => {
    clearTimeout(sleepTimer);
    const m = parseInt(e.target.value, 10);
    if (!m) return ($('#sleepNote').textContent = '');
    sleepTimer = setTimeout(() => { stopAll(); $('#sleepNote').textContent = ''; $('#sleepSel').value = '0'; ZC.toast('Sleep timer: music stopped'); }, m * 60000);
    const at = new Date(Date.now() + m * 60000);
    $('#sleepNote').textContent = `Music stops at ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
  });

  /* ---------- my music (stored on this device in IndexedDB) ---------- */
  const dbp = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no idb'));
    const r = indexedDB.open('zerocheck', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  async function tx(mode, fn) {
    const db = await dbp;
    return new Promise((res, rej) => {
      const t = db.transaction('tracks', mode);
      const r = fn(t.objectStore('tracks'));
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
    });
  }
  async function loadTracks() {
    try { tracks = (await tx('readonly', (s) => s.getAll())) || []; } catch { tracks = []; }
    renderTracks();
  }
  function renderTracks() {
    const list = $('#trackList');
    list.innerHTML = '';
    $('#player').classList.toggle('hidden', !tracks.length);
    tracks.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'item' + (i === idx ? ' on' : '');
      el.innerHTML = '<span></span><button class="mini">Remove</button>';
      el.firstChild.textContent = t.name;
      el.addEventListener('click', () => playTrack(i));
      el.querySelector('button').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (i === idx) { userAudio.pause(); idx = -1; }
        await tx('readwrite', (s) => s.delete(t.id));
        loadTracks(); updateDock();
      });
      list.appendChild(el);
    });
  }
  function playTrack(i) {
    if (!tracks.length) return;
    idx = (i + tracks.length) % tracks.length;
    if (trackUrl) URL.revokeObjectURL(trackUrl);
    trackUrl = URL.createObjectURL(tracks[idx].blob);
    userAudio.src = trackUrl;
    userAudio.volume = parseFloat($('#volT').value);
    userAudio.play().then(() => { $('#btnPlayT').textContent = 'Pause'; updateDock(); }).catch(() => ZC.toast('Could not play that file.'));
    $('#nowPlaying').textContent = tracks[idx].name;
    renderTracks();
  }
  userAudio.addEventListener('ended', () => playTrack(idx + 1));
  userAudio.addEventListener('pause', updateDock);
  $('#btnPlayT').addEventListener('click', () => {
    if (idx < 0) return playTrack(0);
    if (userAudio.paused) { userAudio.play(); $('#btnPlayT').textContent = 'Pause'; } else { userAudio.pause(); $('#btnPlayT').textContent = 'Play'; }
    updateDock();
  });
  $('#btnPrevT').addEventListener('click', () => playTrack(idx < 0 ? 0 : idx - 1));
  $('#btnNextT').addEventListener('click', () => playTrack(idx + 1));
  $('#volT').addEventListener('input', (e) => { userAudio.volume = parseFloat(e.target.value); });

  $('#btnAddMusic').addEventListener('click', () => $('#musicFiles').click());
  $('#musicFiles').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('audio/'));
    try {
      for (const f of files) await tx('readwrite', (s) => s.add({ name: f.name, blob: f }));
      if (files.length) ZC.toast(`Added ${files.length} file${files.length > 1 ? 's' : ''}`);
    } catch { ZC.toast('Could not save files in this browser.'); }
    e.target.value = '';
    loadTracks();
  });
  loadTracks();

  /* ---------- YouTube (official embed; ads are YouTube's normal behaviour) ---------- */
  function ytSrc(text) {
    try {
      const u = new URL(text.trim());
      const list = u.searchParams.get('list');
      let id = u.searchParams.get('v');
      if (!id) { const m = u.pathname.match(/^\/(?:embed\/|live\/|shorts\/)?([\w-]{11})$/); if (m) id = m[1]; }
      if (id) return `https://www.youtube.com/embed/${id}?rel=0` + (list ? `&list=${encodeURIComponent(list)}` : '');
      if (list) return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(list)}`;
    } catch {}
    return null;
  }
  function loadYt(url) {
    const src = ytSrc(url);
    if (!src) return ZC.toast('That does not look like a YouTube link');
    const yt = $('#ytBox');
    yt.classList.remove('hidden');
    yt.innerHTML = '';
    const f = document.createElement('iframe');
    f.src = src;
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.allowFullscreen = true;
    f.loading = 'lazy';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.title = 'YouTube player';
    yt.appendChild(f);
    try { localStorage.setItem('zc_yt', JSON.stringify(url)); } catch {}
  }
  $('#btnYt').addEventListener('click', () => loadYt($('#ytUrl').value));
  $('#ytUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadYt(e.target.value); });
  try { const saved = JSON.parse(localStorage.getItem('zc_yt')); if (saved) $('#ytUrl').value = saved; } catch {}
})();
