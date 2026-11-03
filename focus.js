(() => {
  const $ = (s) => document.querySelector(s);
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const today = () => new Date().toISOString().slice(0, 10);

  /* ---------- Pomodoro (uses end timestamps, so it stays accurate in the background) ---------- */
  let P = Object.assign({ work: 25, brk: 5, phase: 'work', running: false, endsAt: 0, left: 25 * 60, sessions: 0, day: today() }, load('zc_pomo', {}));
  if (P.day !== today()) { P.day = today(); P.sessions = 0; }
  const saveP = () => { try { localStorage.setItem('zc_pomo', JSON.stringify(P)); } catch {} };
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const remaining = () => (P.running ? (P.endsAt - Date.now()) / 1000 : P.left);
  const phaseLen = () => (P.phase === 'work' ? P.work : P.brk) * 60;

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.3, 0.6].forEach((t) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 660; g.gain.value = 0.15;
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
      });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch {}
  }

  function switchPhase() {
    if (P.phase === 'work') P.sessions++;
    P.phase = P.phase === 'work' ? 'break' : 'work';
    P.left = phaseLen();
    P.running = false;
    saveP();
  }

  function tick() {
    let r = remaining();
    if (P.running && r <= 0) {
      beep();
      ZC.toast(P.phase === 'work' ? 'Focus session done. Time for a break.' : 'Break over. Back to focus.');
      switchPhase();
      r = P.left;
    }
    $('#pomoTime').textContent = fmt(r);
    $('#pomoPhase').textContent = P.phase === 'work' ? 'Focus' : 'Break';
    $('#pomoCount').textContent = P.sessions;
    $('#btnPomo').textContent = P.running ? 'Pause' : 'Start';
    $('#dockPomo').textContent = P.running ? `${P.phase === 'work' ? 'Focus' : 'Break'} ${fmt(r)}` : '';
    ZC.dockUpdate();
  }

  $('#btnPomo').addEventListener('click', () => {
    if (P.running) { P.left = remaining(); P.running = false; }
    else { P.running = true; P.endsAt = Date.now() + P.left * 1000; }
    saveP(); tick();
  });
  $('#btnPomoReset').addEventListener('click', () => { P.running = false; P.left = phaseLen(); saveP(); tick(); });
  $('#btnPomoSkip').addEventListener('click', () => { P.phase = P.phase === 'work' ? 'break' : 'work'; P.running = false; P.left = phaseLen(); saveP(); tick(); });
  const setLen = () => {
    P.work = Math.min(180, Math.max(1, parseInt($('#pomoWork').value, 10) || 25));
    P.brk = Math.min(60, Math.max(1, parseInt($('#pomoBreak').value, 10) || 5));
    if (!P.running) P.left = phaseLen();
    saveP(); tick();
  };
  $('#pomoWork').value = P.work;
  $('#pomoBreak').value = P.brk;
  $('#pomoWork').addEventListener('change', setLen);
  $('#pomoBreak').addEventListener('change', setLen);
  setInterval(tick, 500);
  tick();

  /* ---------- Notes ---------- */
  let N = Object.assign({ notes: [], cur: null }, load('zc_notes', {}));
  const newNote = () => { const n = { id: String(Date.now()), text: '' }; N.notes.unshift(n); N.cur = n.id; return n; };
  if (!N.notes.length) newNote();
  const cur = () => N.notes.find((n) => n.id === N.cur) || N.notes[0];
  const title = (n) => (n.text.trim().split('\n')[0] || 'Untitled note').slice(0, 34);
  const saveN = () => { try { localStorage.setItem('zc_notes', JSON.stringify(N)); } catch {} };

  function renderNotes() {
    const sel = $('#noteSel');
    sel.innerHTML = '';
    N.notes.forEach((n) => sel.appendChild(new Option(title(n), n.id)));
    N.cur = cur().id;
    sel.value = N.cur;
    $('#noteText').value = cur().text;
  }
  let t;
  $('#noteText').addEventListener('input', (e) => {
    cur().text = e.target.value;
    const opt = $('#noteSel').selectedOptions[0];
    if (opt) opt.textContent = title(cur());
    clearTimeout(t);
    t = setTimeout(saveN, 400);
  });
  $('#noteSel').addEventListener('change', (e) => { N.cur = e.target.value; saveN(); renderNotes(); });
  $('#btnNoteNew').addEventListener('click', () => { newNote(); saveN(); renderNotes(); $('#noteText').focus(); });
  $('#btnNoteDel').addEventListener('click', () => {
    if (!confirm('Delete this note?')) return;
    N.notes = N.notes.filter((n) => n.id !== N.cur);
    if (!N.notes.length) newNote();
    N.cur = N.notes[0].id;
    saveN(); renderNotes();
  });
  renderNotes();
})();
