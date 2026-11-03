(() => {
  const $ = (s) => document.querySelector(s);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const PAGES = ['home', 'tracker', 'focus', 'music', 'about'];

  /* ---------- pages ---------- */
  function show() {
    let p = (location.hash || '#home').slice(1);
    if (!PAGES.includes(p)) p = 'home';
    PAGES.forEach((x) => $('#page-' + x).classList.toggle('hidden', x !== p));
    document.body.dataset.page = p;
    window.scrollTo({ top: 0 });
    document.dispatchEvent(new CustomEvent('zc:page', { detail: p }));
  }
  addEventListener('hashchange', show);
  show();

  /* ---------- themes ---------- */
  function renderThemes() {
    const list = $('#themeList');
    list.innerHTML = '';
    const cur = ZCThemes.current();
    ZCThemes.list.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'theme' + (t.id === cur ? ' active' : '');
      b.innerHTML = `<div class="dots"><i style="background:${t.bg}"></i><i style="background:${t.surface}"></i><i style="background:${t.accent}"></i></div><span>${t.name}</span><small>${t.mood}</small>`;
      b.addEventListener('click', () => { ZCThemes.apply(t.id); renderThemes(); });
      list.appendChild(b);
    });
  }
  $('#btnThemes').addEventListener('click', () => { renderThemes(); $('#dlgThemes').showModal(); });

  /* ---------- focus mode ---------- */
  const exitBtn = $('#btnExitFocus');
  function setFocus(on) {
    document.body.classList.toggle('focus', on);
    exitBtn.classList.toggle('hidden', !on);
    if (on) { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }
    else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
  }
  $('#btnFocusMode').addEventListener('click', () => setFocus(!document.body.classList.contains('focus')));
  exitBtn.addEventListener('click', () => setFocus(false));
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('focus')) setFocus(false);
  });

  /* ---------- exam countdown ---------- */
  let exam = load('zc_exam', { name: '', date: '' });
  function renderExam() {
    $('#examName').value = exam.name;
    $('#examDate').value = exam.date;
    const out = $('#examOut');
    if (!exam.date) { out.textContent = 'Set an exam date'; return; }
    const days = Math.round((new Date(exam.date + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / 864e5);
    const name = exam.name || 'your exam';
    out.textContent = days > 1 ? `${days} days to ${name}` : days === 1 ? `1 day to ${name}` : days === 0 ? `${name} is today` : `${name} was ${-days} day${days === -1 ? '' : 's'} ago`;
  }
  const saveExam = () => {
    exam = { name: $('#examName').value.trim(), date: $('#examDate').value };
    try { localStorage.setItem('zc_exam', JSON.stringify(exam)); } catch {}
    renderExam();
  };
  $('#examName').addEventListener('change', saveExam);
  $('#examDate').addEventListener('change', saveExam);
  renderExam();

  /* ---------- install + offline ---------- */
  let deferred = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('#btnInstall').classList.remove('hidden'); });
  $('#btnInstall').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('#btnInstall').classList.add('hidden');
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

  /* ---------- backup ---------- */
  const KEYS = ['zc_session', 'zc_keys', 'zc_theme', 'zc_notes', 'zc_pomo', 'zc_exam', 'zc_yt'];
  const FILE_NAME = 'ZeroCheck Backup.json';
  const msg = (t) => { $('#bkMsg').textContent = t; };
  $('#tileBackup').addEventListener('click', () => { msg(''); $('#dlgBackup').showModal(); });

  function snapshot() {
    const data = {};
    KEYS.forEach((k) => { const v = localStorage.getItem(k); if (v !== null) data[k] = v; });
    return { app: 'ZeroCheck', version: 1, savedAt: new Date().toISOString(), data };
  }
  function restore(obj) {
    if (!obj || obj.app !== 'ZeroCheck' || !obj.data) throw new Error('This is not a ZeroCheck backup.');
    KEYS.forEach((k) => { if (k in obj.data) localStorage.setItem(k, obj.data[k]); });
    location.reload();
  }

  $('#btnExportFile').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ZeroCheck-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg('Backup file downloaded.');
  });
  $('#btnImportFile').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (!obj || obj.app !== 'ZeroCheck') throw new Error('This is not a ZeroCheck backup.');
      if (!confirm('Restore this backup? It replaces your current data on this device.')) return;
      restore(obj);
    } catch (err) { msg(err.message || 'Could not read that file.'); }
    e.target.value = '';
  });

  // Google Drive: one visible file in the person's own Drive. The drive.file scope only lets ZeroCheck see files it created.
  let tok = null, tokExp = 0;
  function token() {
    return new Promise((res, rej) => {
      if (tok && Date.now() < tokExp) return res(tok);
      const id = window.ZC_CONFIG && ZC_CONFIG.googleClientId;
      if (!id) return rej(new Error('Google backup is not set up yet. The owner needs to add a client ID in config.js.'));
      if (!window.google || !google.accounts) return rej(new Error('Google sign-in could not load. Check your connection or ad blocker.'));
      google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (r) => {
          if (r.error) return rej(new Error('Google sign-in failed or was cancelled.'));
          tok = r.access_token; tokExp = Date.now() + (r.expires_in - 60) * 1000; res(tok);
        },
        error_callback: () => rej(new Error('Google sign-in was cancelled.'))
      }).requestAccessToken();
    });
  }
  async function dFetch(url, opt = {}) {
    const t = await token();
    const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } });
    if (!r.ok) { if (r.status === 401) tok = null; throw new Error(r.status === 401 ? 'Google session expired. Try again.' : `Google Drive error (${r.status}).`); }
    return r;
  }
  async function findFile() {
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const j = await (await dFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&spaces=drive`)).json();
    return (j.files && j.files[0]) || null;
  }
  $('#btnDriveBackup').addEventListener('click', async () => {
    try {
      msg('Signing in…');
      const f = await findFile();
      const body = JSON.stringify(snapshot());
      if (f) {
        await dFetch(`https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      } else {
        const b = 'zcb' + Date.now();
        const meta = JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' });
        const mp = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
        await dFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: mp });
      }
      msg('Backed up to your Google Drive as "ZeroCheck Backup.json".');
    } catch (err) { msg(err.message); }
  });
  $('#btnDriveRestore').addEventListener('click', async () => {
    try {
      msg('Signing in…');
      const f = await findFile();
      if (!f) return msg('No backup found in this Google account.');
      if (!confirm(`Restore the backup saved ${new Date(f.modifiedTime).toLocaleString()}? It replaces your current data on this device.`)) return msg('');
      restore(await (await dFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json());
    } catch (err) { msg(err.message); }
  });
})();
