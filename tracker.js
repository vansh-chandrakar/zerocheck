(() => {
  const $ = (s) => document.querySelector(s);
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const LETTERS = 'ABCDEF';
  const DEFAULT_KEYS = {
    o0: 'Digit1', o1: 'Digit2', o2: 'Digit3', o3: 'Digit4', o4: 'Digit5', o5: 'Digit6',
    skip: 'KeyS', prev: 'ArrowLeft', next: 'ArrowRight'
  };
  const KEY_NAMES = {
    o0: 'Option 1', o1: 'Option 2', o2: 'Option 3', o3: 'Option 4', o4: 'Option 5', o5: 'Option 6',
    skip: 'Skip', prev: 'Previous', next: 'Next'
  };
  const DEFAULT_MODEL = ''; // empty = Auto (prefers Flash-Lite, which has the highest free daily limit)
  const API = 'https://generativelanguage.googleapis.com/v1beta';

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  let keys = Object.assign({}, DEFAULT_KEYS, load('zc_keys', {}));
  let S = load('zc_session', null);
  let gem = Object.assign({ key: '', model: DEFAULT_MODEL }, load('zc_gemini', {}));
  if (gem.model === 'gemini-2.5-flash') gem.model = DEFAULT_MODEL; // old default, now treated as Auto
  let filter = 'all';
  let capturing = null;
  let view = 'done';      // done | review | results (only used once the test is finished)
  let files = [];         // answer-key files chosen for Gemini (not saved)

  if (S) {
    S.topic = S.topic || '';
    S.mode = S.mode || 'none';
    S.limit = S.limit || 0;
    S.elapsed = S.elapsed || 0;
    S.startedAt = S.startedAt || null;
    S.finished = !!S.finished;
    S.alerted = !!S.alerted;
    S.key = S.key || {};
    S.times = S.times || {};
  }

  const persist = () => {
    try {
      localStorage.setItem('zc_session', JSON.stringify(S));
      localStorage.setItem('zc_keys', JSON.stringify(keys));
    } catch {}
  };

  /* ---------- helpers ---------- */
  const label = (i) => S.style === 'letters' ? LETTERS[i] : S.style === 'roman' ? ROMAN[i] : String(i + 1);
  const lastQ = () => (S.count ? S.first + S.count - 1 : null);
  const maxSeen = () => Math.max(S.current, ...Object.keys(S.answers).map(Number));
  const endQ = () => (lastQ() !== null ? lastQ() : maxSeen());
  const valueText = (v) => (v === undefined ? 'Not answered' : v === 'skip' ? 'Skipped' : label(v));
  const optionList = () => Array.from({ length: S.options }, (_, i) => label(i)).join(', ');
  const counts = () => {
    const vals = Object.values(S.answers);
    const answered = vals.filter((v) => v !== 'skip').length;
    const skipped = vals.filter((v) => v === 'skip').length;
    const total = endQ() - S.first + 1;
    return { answered, skipped, notAnswered: Math.max(0, total - answered - skipped) };
  };
  const pretty = (code) => (code ? code.replace(/^Key|^Digit/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2') : 'Not set');

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------- per-question timer ---------- */
  let qEnter = Date.now();
  function flushTime() {
    if (!S || S.finished) return;
    const now = Date.now();
    S.times[S.current] = (S.times[S.current] || 0) + Math.min(now - qEnter, 15 * 60 * 1000);
    qEnter = now;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { flushTime(); if (S) persist(); } else qEnter = Date.now();
  });
  document.addEventListener('zc:page', (e) => {
    if (e.detail !== 'tracker') { flushTime(); if (S) persist(); } else qEnter = Date.now();
  });

  /* ---------- clock ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  const elapsedMs = () => S.elapsed + (S.startedAt ? Date.now() - S.startedAt : 0);

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880; g.gain.value = 0.15;
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
      });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch {}
  }

  function updateClock() {
    const wrap = $('#clock');
    if (!S || S.mode === 'none' || S.finished) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    const ms = elapsedMs();
    let txt, over = false;
    if (S.mode === 'timer') {
      const rem = S.limit * 1000 - ms;
      over = rem <= 0;
      txt = over ? '+' + fmt(-rem / 1000) : fmt(Math.ceil(rem / 1000));
      if (over && S.startedAt && !S.alerted) { S.alerted = true; persist(); beep(); toast("Time's up"); }
    } else {
      txt = fmt(ms / 1000);
    }
    $('#clockTime').textContent = txt;
    wrap.classList.toggle('over', over);
    wrap.classList.toggle('paused', !S.startedAt);
    $('#btnClock').textContent = S.startedAt ? 'Pause' : 'Resume';
  }
  setInterval(updateClock, 250);

  $('#btnClock').addEventListener('click', () => {
    if (S.startedAt) { S.elapsed = elapsedMs(); S.startedAt = null; }
    else { S.startedAt = Date.now(); }
    persist();
    updateClock();
  });

  /* ---------- rendering ---------- */
  function render() {
    const fin = !!S && S.finished;
    $('#setup').classList.toggle('hidden', !!S);
    $('#test').classList.toggle('hidden', !S || fin);
    $('#done').classList.toggle('hidden', !(fin && view === 'done'));
    $('#review').classList.toggle('hidden', !(fin && view === 'review'));
    $('#results').classList.toggle('hidden', !(fin && view === 'results'));
    if (!S) return;
    if (fin) {
      if (view === 'done') renderDone();
      if (view === 'review') renderReview();
      if (view === 'results') renderResults();
      window.scrollTo({ top: 0 });
      return;
    }

    const c = counts();
    const total = lastQ() !== null ? ` / ${S.count}` : '';
    $('#topicLabel').textContent = S.topic;
    $('#topicLabel').classList.toggle('hidden', !S.topic);
    $('#progress').textContent = `Answered ${c.answered}${total} · Skipped ${c.skipped}`;
    const pb = $('.pbar');
    pb.classList.toggle('hidden', !S.count);
    if (S.count) $('#pfill').style.width = Math.min(100, ((c.answered + c.skipped) / S.count) * 100) + '%';
    $('#qNum').textContent = S.current;

    const v = S.answers[S.current];
    $('#qStatus').textContent = v === undefined ? 'Not answered yet' : v === 'skip' ? 'Skipped' : `Your answer: ${label(v)}`;

    const box = $('#options');
    box.innerHTML = '';
    for (let i = 0; i < S.options; i++) {
      const b = document.createElement('button');
      b.textContent = label(i);
      if (v === i) b.classList.add('selected');
      const hint = keys['o' + i];
      if (hint) {
        const k = document.createElement('span');
        k.className = 'kbd';
        k.textContent = pretty(hint).replace('Numpad', 'Num');
        b.appendChild(k);
      }
      b.addEventListener('click', () => answer(i));
      box.appendChild(b);
    }
    if (S.options % 2 === 1) box.lastChild.style.gridColumn = '1 / -1';
    updateClock();
  }

  function renderDone() {
    const c = counts();
    $('#stAnswered').textContent = c.answered;
    $('#stSkipped').textContent = c.skipped;
    $('#stNone').textContent = c.notAnswered;
    $('#doneTitle').textContent = S.topic || 'Test finished';
    const hasTime = S.mode !== 'none';
    $('#stTimeBox').classList.toggle('hidden', !hasTime);
    $('#timeOpt').classList.toggle('hidden', !hasTime);
    if (hasTime) {
      const used = fmt(S.elapsed / 1000);
      $('#stTime').textContent = S.mode === 'timer' ? `${used} / ${fmt(S.limit)}` : used;
    }
    const slow = Object.entries(S.times).filter(([, t]) => t > 0).sort((x, y) => y[1] - x[1]).slice(0, 5);
    $('#slowBox').classList.toggle('hidden', !slow.length);
    $('#slowList').innerHTML = slow.map(([q, t]) => `<div class="item"><b>Q${q}</b><span class="pair"><em>${fmt(t / 1000)}</em></span></div>`).join('');
  }

  function go(q) {
    flushTime();
    if (q < S.first) return toast('This is the first question');
    if (lastQ() !== null && q > lastQ()) return toast('This is the last question');
    S.current = q;
    persist();
    render();
  }
  function advance() {
    if (lastQ() !== null && S.current >= lastQ()) { persist(); render(); return toast('Last question reached'); }
    go(S.current + 1);
  }
  function answer(i) { flushTime(); S.answers[S.current] = i; advance(); }
  function skip() { flushTime(); S.answers[S.current] = 'skip'; advance(); }

  /* ---------- setup ---------- */
  $('#inTiming').addEventListener('change', (e) => {
    $('#minsWrap').classList.toggle('hidden', e.target.value !== 'timer');
  });

  $('#setupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const first = parseInt($('#inFirst').value, 10);
    const count = parseInt($('#inCount').value, 10);
    if (isNaN(first)) return;
    const mode = $('#inTiming').value;
    let limit = 0;
    if (mode === 'timer') {
      const m = parseFloat($('#inMinutes').value);
      if (!(m > 0)) return toast('Enter the timer minutes');
      limit = Math.round(m * 60);
    }
    S = {
      first,
      count: isNaN(count) ? null : count,
      options: parseInt($('#inOptions').value, 10),
      style: $('#inStyle').value,
      current: first,
      answers: {},
      key: {},
      times: {},
      topic: $('#inTopic').value.trim(),
      mode, limit,
      elapsed: 0,
      startedAt: mode === 'none' ? null : Date.now(),
      finished: false,
      alerted: false
    };
    view = 'done';
    files = [];
    qEnter = Date.now();
    persist();
    render();
  });

  document.querySelectorAll('.js-new').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Start a new session? Current answers will be cleared. Export first if you need them.')) return;
    S = null;
    view = 'done';
    try { localStorage.removeItem('zc_session'); } catch {}
    render();
  }));

  $('#btnSkip').addEventListener('click', skip);
  $('#btnPrev').addEventListener('click', () => go(S.current - 1));
  $('#btnNext').addEventListener('click', () => go(S.current + 1));

  /* ---------- finish ---------- */
  $('#btnFinish').addEventListener('click', () => {
    const c = counts();
    if (!confirm(`Finish the test?\n\nNot answered: ${c.notAnswered}\nSkipped: ${c.skipped}`)) return;
    flushTime();
    if (S.startedAt) { S.elapsed = elapsedMs(); S.startedAt = null; }
    S.finished = true;
    view = 'done';
    persist();
    render();
  });
  $('#btnBack').addEventListener('click', () => {
    S.finished = false;
    qEnter = Date.now();
    if (S.mode !== 'none') S.startedAt = Date.now();
    persist();
    render();
  });

  /* ---------- answer key: review / edit ---------- */
  const toIdx = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim().toUpperCase();
    let n;
    if (/^\d+$/.test(s)) n = parseInt(s, 10) - 1;
    else if (ROMAN.includes(s)) n = ROMAN.indexOf(s);
    else if (/^[A-F]$/.test(s)) n = LETTERS.indexOf(s);
    else return null;
    return n >= 0 && n < S.options ? n : null;
  };

  function renderReview() {
    const ed = $('#keyEditor');
    ed.innerHTML = '';
    for (let q = S.first; q <= endQ(); q++) {
      const row = document.createElement('label');
      row.className = 'krow' + (S.key[q] !== undefined ? ' set' : '');
      const num = document.createElement('span');
      num.textContent = q;
      const sel = document.createElement('select');
      sel.appendChild(new Option('—', ''));
      for (let i = 0; i < S.options; i++) sel.appendChild(new Option(label(i), String(i)));
      sel.value = S.key[q] !== undefined ? String(S.key[q]) : '';
      sel.addEventListener('change', () => {
        if (sel.value === '') delete S.key[q]; else S.key[q] = parseInt(sel.value, 10);
        row.classList.toggle('set', sel.value !== '');
        persist();
      });
      row.append(num, sel);
      ed.appendChild(row);
    }
    updateFileInfo();
  }

  function updateFileInfo() {
    $('#fileInfo').textContent = files.length
      ? `${files.length} file${files.length > 1 ? 's' : ''} selected: ${files.map((f) => f.name).join(', ')}`
      : 'No files selected';
  }

  $('#btnCheck').addEventListener('click', () => { view = 'review'; render(); });
  $('#btnBackDone').addEventListener('click', () => { view = 'done'; render(); });
  $('#btnBackDone2').addEventListener('click', () => { view = 'done'; render(); });
  $('#btnEditKey').addEventListener('click', () => { view = 'review'; render(); });
  $('#btnCompare').addEventListener('click', () => {
    if (!Object.keys(S.key).length) return toast('Add at least one correct answer first');
    view = 'results';
    render();
  });
  $('#btnClearKey').addEventListener('click', () => {
    if (!confirm('Clear the whole answer key?')) return;
    S.key = {};
    persist();
    renderReview();
  });

  $('#btnPick').addEventListener('click', () => $('#keyFiles').click());
  $('#keyFiles').addEventListener('change', (e) => {
    files = Array.from(e.target.files || []);
    updateFileInfo();
  });

  /* ---------- Gemini ---------- */
  function fileToPart(file) {
    return new Promise((resolve, reject) => {
      if (file.type === 'application/pdf') {
        const r = new FileReader();
        r.onload = () => resolve({ mime: 'application/pdf', data: String(r.result).split(',')[1] });
        r.onerror = () => reject(new Error('Could not read ' + file.name));
        r.readAsDataURL(file);
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const sc = Math.min(1, 2000 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc);
        c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.9).split(',')[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read ' + file.name + '. Try a JPG or PNG.')); };
      img.src = url;
    });
  }

  async function geminiError(res) {
    let msg = '';
    try { msg = (await res.json()).error.message || ''; } catch {}
    msg = msg.replace(/\s+/g, ' ').slice(0, 180);
    if (res.status === 429) return 'Rate limit or no free quota' + (msg ? ` (${msg})` : '');
    if (res.status === 404) return 'Model not available' + (msg ? ` (${msg})` : '');
    if (res.status === 400 && /api key/i.test(msg)) return 'The API key looks invalid. Check it in Gemini settings.';
    if (res.status === 403) return 'Access was refused. Check your key in Gemini settings.';
    return msg || `Request failed (${res.status}).`;
  }

  // Auto mode: try Flash-Lite models first (highest free daily limit). Regular Flash is used only if no Flash-Lite exists.
  async function candidateModels() {
    const list = [];
    const add = (m) => { if (m && !list.includes(m)) list.push(m); };
    add(gem.model);
    try {
      const res = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(gem.key)}`);
      if (res.ok) {
        const names = ((await res.json()).models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m) => m.name.replace(/^models\//, ''))
          .filter((n) => /^gemini/.test(n) && !/pro|image|tts|embed|live|audio|preview|exp|thinking|robotics|computer/i.test(n))
          .sort((x, y) => y.localeCompare(x, undefined, { numeric: true }));
        const lite = names.filter((n) => /flash-lite/.test(n));
        (lite.length ? lite : names.filter((n) => /flash/.test(n))).forEach(add);
      }
    } catch {}
    if (!list.length) add('gemini-flash-lite-latest');
    return list.slice(0, 5);
  }

  async function generate(parts) {
    const models = await candidateModels();
    const tried = [];
    for (const model of models) {
      const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(gem.key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } })
      });
      if (res.ok) {
        return { data: await res.json(), model };
      }
      const msg = await geminiError(res);
      tried.push(`${model}: ${msg}`);
      if (![404, 429, 503].includes(res.status)) throw new Error(msg);
    }
    throw new Error('No model worked. ' + tried.join(' | '));
  }

  $('#btnExtract').addEventListener('click', async () => {
    if (!gem.key) { toast('Add your Gemini key first'); return openGemini(); }
    if (!files.length) return toast('Choose photos or a PDF first');
    const btn = $('#btnExtract');
    const note = $('#extractNote');
    btn.disabled = true;
    btn.textContent = 'Reading…';
    try {
      const parts = [];
      const first = S.first, last = endQ();
      parts.push({
        text:
          `You are reading an answer key for a multiple-choice test. The attached file(s) contain the key. ` +
          `Extract the correct option for each question number from ${first} to ${last}. ` +
          `The test has ${S.options} options per question. The key may label options as letters (A, B, C...), numbers (1, 2, 3...) ` +
          `or roman numerals (I, II, III...). Always report the option as its position number from 1 to ${S.options} ` +
          `(first option = 1, second = 2, and so on). Use only what is printed in the key. If a question is missing, ` +
          `unreadable or ambiguous, use null. Never guess. Respond with JSON only, in this shape: ` +
          `{"answers": {"${first}": 2, "${first + 1}": null}}`
      });
      for (const f of files) {
        const p = await fileToPart(f);
        parts.push({ inline_data: { mime_type: p.mime, data: p.data } });
      }
      const { data, model } = await generate(parts);
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
        .replace(/```json|```/g, '').trim();
      const ans = JSON.parse(text).answers || {};
      let found = 0;
      for (const [q, v] of Object.entries(ans)) {
        const qn = parseInt(q, 10);
        const idx = toIdx(v);
        if (qn >= first && qn <= last && idx !== null) { S.key[qn] = idx; found++; }
      }
      persist();
      renderReview();
      const total = last - first + 1;
      note.textContent = `Gemini (${model}) found ${found} of ${total} answers. Check them below, and fix any that are wrong or missing.`;
      toast(`Found ${found} of ${total} answers`);
    } catch (err) {
      note.textContent = err instanceof SyntaxError ? 'Gemini returned something unreadable. Try again, or use clearer photos.' : err.message;
      toast('Could not read the key');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Read key with Gemini';
    }
  });

  function openGemini() {
    $('#gemKey').value = gem.key;
    $('#gemModel').value = gem.model;
    $('#gemMsg').textContent = gem.key ? 'A key is saved in this browser.' : 'No key saved yet.';
    $('#dlgGemini').showModal();
  }
  $('#btnGemini').addEventListener('click', openGemini);
  $('#btnSaveKey').addEventListener('click', () => {
    gem = { key: $('#gemKey').value.trim(), model: $('#gemModel').value.trim() };
    try { localStorage.setItem('zc_gemini', JSON.stringify(gem)); } catch {}
    $('#gemMsg').textContent = 'Saved in this browser.';
    toast('Gemini settings saved');
  });
  $('#btnRemoveKey').addEventListener('click', () => {
    gem = { key: '', model: DEFAULT_MODEL };
    try { localStorage.removeItem('zc_gemini'); } catch {}
    $('#gemKey').value = '';
    $('#gemModel').value = DEFAULT_MODEL;
    $('#gemMsg').textContent = 'Key removed.';
  });
  $('#btnTestKey').addEventListener('click', async () => {
    const key = $('#gemKey').value.trim();
    const msg = $('#gemMsg');
    if (!key) return (msg.textContent = 'Paste a key first.');
    msg.textContent = 'Testing…';
    try {
      const res = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(await geminiError(res));
      const data = await res.json();
      const names = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name))
        .map((m) => m.name.replace(/^models\//, ''));
      $('#modelList').innerHTML = names.map((n) => `<option value="${n}">`).join('');
      msg.textContent = `Connected. ${names.length} models available. Tap the Model box to pick one, then Save.`;
    } catch (err) {
      msg.textContent = err.message;
    }
  });

  /* ---------- results ---------- */
  function compute() {
    const wrong = [], missed = [];
    let correct = 0, noKey = 0;
    for (let q = S.first; q <= endQ(); q++) {
      const k = S.key[q], a = S.answers[q];
      if (k === undefined) { noKey++; continue; }
      if (a === undefined || a === 'skip') missed.push({ q, a, k });
      else if (a === k) correct++;
      else wrong.push({ q, a, k });
    }
    const total = correct + wrong.length + missed.length;
    return { correct, wrong, missed, noKey, total, pct: total ? Math.round((correct / total) * 100) : 0 };
  }

  function listBlock(title, items, fn) {
    if (!items.length) return null;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="list-title">${title} (${items.length})</div>`;
    const list = document.createElement('div');
    list.className = 'list';
    items.forEach((it) => {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = fn(it);
      list.appendChild(el);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function renderResults() {
    const r = compute();
    $('#resTitle').textContent = S.topic || 'Your score';
    $('#scoreMain').textContent = `${r.correct} / ${r.total}`;
    $('#scoreSub').textContent = `${r.pct}% correct`;
    $('#rsCorrect').textContent = r.correct;
    $('#rsWrong').textContent = r.wrong.length;
    $('#rsMissed').textContent = r.missed.length;
    $('#rsNoKey').textContent = r.noKey;
    $('#rsNoKeyBox').classList.toggle('hidden', r.noKey === 0);
    $('#timeOptR').classList.toggle('hidden', S.mode === 'none');

    const box = $('#wrongList');
    box.innerHTML = '';
    const a = listBlock('Wrong', r.wrong, (i) =>
      `<b>Q${i.q}</b><span class="pair">You <em>${label(i.a)}</em> Correct <em>${label(i.k)}</em></span>`);
    const b = listBlock('Skipped or blank', r.missed, (i) =>
      `<b>Q${i.q}</b><span class="pair">${i.a === 'skip' ? 'Skipped' : 'Blank'} Correct <em>${label(i.k)}</em></span>`);
    if (a) box.appendChild(a);
    if (b) box.appendChild(b);
    if (!a && !b) box.innerHTML = '<p class="muted small" style="text-align:center">Nothing missed. Well done.</p>';
  }

  /* ---------- export ---------- */
  function buildRows() {
    const rows = [];
    const withT = $('#chkQTime').checked;
    for (let q = S.first; q <= endQ(); q++) rows.push([q, valueText(S.answers[q]) + (withT && S.times[q] ? ` (${fmt(S.times[q] / 1000)})` : '')]);
    return rows;
  }
  function timeLine(checkId) {
    if (S.mode === 'none' || !$(checkId).checked) return '';
    const used = fmt(S.elapsed / 1000);
    return S.mode === 'timer' ? `Time limit: ${fmt(S.limit)} | Time used: ${used}` : `Time taken: ${used}`;
  }
  function summaryLine() {
    const c = counts();
    return `Answered: ${c.answered} | Skipped: ${c.skipped}` + (c.notAnswered ? ` | Not answered: ${c.notAnswered}` : '');
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Copied to clipboard');
  }
  function pdfStart(title) {
    if (!window.jspdf) { toast('PDF library not loaded. Check your internet connection.'); return null; }
    const doc = new window.jspdf.jsPDF();
    let y = 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 15, y);
    if (S.topic) { y += 8; doc.setFontSize(12); doc.text(S.topic, 15, y); }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    return { doc, y };
  }
  const fileSafe = () => (S.topic || 'answers').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'answers';

  $('#btnCopy').addEventListener('click', () => {
    const tl = timeLine('#chkTime');
    copyText(
      (S.topic ? `Topic: ${S.topic}\n` : '') +
      `Questions: ${S.first} to ${endQ()}\nOptions: ${optionList()}\n` +
      (tl ? tl + '\n' : '') + '\n' +
      buildRows().map(([q, v]) => `${q}: ${v}`).join('\n') +
      `\n\n${summaryLine()}`
    );
  });

  $('#btnPdf').addEventListener('click', () => {
    const p = pdfStart('Answer Sheet');
    if (!p) return;
    const { doc } = p;
    let y = p.y + 7;
    const rows = buildRows();
    const withT = $('#chkQTime').checked;
    const PER_COL = 40, COLS = withT ? 3 : 4, COLW = withT ? 62 : 47, PER_PAGE = PER_COL * COLS;
    doc.text(`Questions ${S.first} to ${endQ()}  |  Options: ${optionList()}  |  ${summaryLine()}`, 15, y);
    const tl = timeLine('#chkTime');
    if (tl) { y += 5; doc.text(tl, 15, y); }
    doc.setTextColor(0);
    doc.setFontSize(11);
    const startY = y + 10;
    rows.forEach(([q, v], i) => {
      if (i > 0 && i % PER_PAGE === 0) doc.addPage();
      const page = Math.floor(i / PER_PAGE), n = i % PER_PAGE;
      doc.text(`${q}: ${v}`, 15 + Math.floor(n / PER_COL) * COLW, (page === 0 ? startY : 20) + (n % PER_COL) * 6);
    });
    doc.save(`${fileSafe()}_${S.first}-${endQ()}.pdf`);
  });

  function resultsText(r) {
    const tl = timeLine('#chkTimeR');
    let t = (S.topic ? `Topic: ${S.topic}\n` : '') +
      `Questions: ${S.first} to ${endQ()}\n` +
      `Score: ${r.correct} / ${r.total} (${r.pct}%)\n` +
      `Correct: ${r.correct} | Wrong: ${r.wrong.length} | Skipped or blank: ${r.missed.length}` +
      (r.noKey ? ` | No key: ${r.noKey}` : '') + '\n' + (tl ? tl + '\n' : '');
    if (r.wrong.length) t += '\nWrong answers:\n' + r.wrong.map((i) => `${i.q}: You ${label(i.a)}, correct ${label(i.k)}`).join('\n') + '\n';
    if (r.missed.length) t += '\nSkipped or blank:\n' + r.missed.map((i) => `${i.q}: ${i.a === 'skip' ? 'skipped' : 'blank'}, correct ${label(i.k)}`).join('\n') + '\n';
    return t.trim();
  }
  $('#btnCopyR').addEventListener('click', () => copyText(resultsText(compute())));

  $('#btnPdfR').addEventListener('click', () => {
    const r = compute();
    const p = pdfStart('Results');
    if (!p) return;
    const { doc } = p;
    let y = p.y + 7;
    doc.text(`Questions ${S.first} to ${endQ()}  |  Correct: ${r.correct}  Wrong: ${r.wrong.length}  Skipped or blank: ${r.missed.length}` + (r.noKey ? `  No key: ${r.noKey}` : ''), 15, y);
    const tl = timeLine('#chkTimeR');
    if (tl) { y += 5; doc.text(tl, 15, y); }
    y += 12;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(`${r.correct} / ${r.total}  (${r.pct}%)`, 15, y);
    y += 12;
    const line = (txt, bold) => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 12 : 11);
      doc.text(txt, 15, y);
      y += bold ? 8 : 6;
    };
    if (r.wrong.length) {
      line(`Wrong answers (${r.wrong.length})`, true);
      r.wrong.forEach((i) => line(`${i.q}:  You ${label(i.a)}   Correct ${label(i.k)}`));
      y += 4;
    }
    if (r.missed.length) {
      line(`Skipped or blank (${r.missed.length})`, true);
      r.missed.forEach((i) => line(`${i.q}:  ${i.a === 'skip' ? 'Skipped' : 'Blank'}   Correct ${label(i.k)}`));
    }
    doc.save(`${fileSafe()}_results.pdf`);
  });

  /* ---------- dialogs ---------- */
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  function renderGrid() {
    const grid = $('#grid');
    grid.innerHTML = '';
    for (let q = S.first; q <= endQ(); q++) {
      const v = S.answers[q];
      if (filter === 'skipped' && v !== 'skip') continue;
      if (filter === 'unanswered' && v !== undefined) continue;
      const b = document.createElement('button');
      b.textContent = q;
      if (v === 'skip') b.classList.add('skipped');
      else if (v !== undefined) b.classList.add('answered');
      if (q === S.current) b.classList.add('current');
      b.addEventListener('click', () => { $('#dlgGrid').close(); go(q); });
      grid.appendChild(b);
    }
    if (!grid.children.length) grid.innerHTML = '<p class="muted small">Nothing to show here.</p>';
  }
  $('#btnGrid').addEventListener('click', () => {
    if (!S) return toast('Start a session first');
    if (S.finished) return toast('Go back to the test to browse questions');
    renderGrid();
    $('#dlgGrid').showModal();
    const cur = $('#grid .current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  });
  document.querySelectorAll('[data-filter]').forEach((c) => c.addEventListener('click', () => {
    filter = c.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === c));
    renderGrid();
  }));

  function renderKeys() {
    const list = $('#keyList');
    list.innerHTML = '';
    Object.keys(KEY_NAMES).forEach((action) => {
      const row = document.createElement('div');
      row.className = 'keyrow';
      row.innerHTML = `<span>${KEY_NAMES[action]}</span>`;
      const b = document.createElement('button');
      b.textContent = capturing === action ? 'Press a key…' : pretty(keys[action]);
      if (capturing === action) b.classList.add('waiting');
      b.addEventListener('click', () => { capturing = action; renderKeys(); });
      row.appendChild(b);
      list.appendChild(row);
    });
  }
  $('#btnKeys').addEventListener('click', () => { capturing = null; renderKeys(); $('#dlgKeys').showModal(); });
  $('#dlgKeys').addEventListener('close', () => { capturing = null; if (S && !S.finished) render(); });
  $('#btnResetKeys').addEventListener('click', () => { keys = Object.assign({}, DEFAULT_KEYS); persist(); renderKeys(); });

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', (e) => {
    if (capturing) {
      e.preventDefault();
      if (e.code === 'Escape') { capturing = null; return renderKeys(); }
      Object.keys(keys).forEach((a) => { if (keys[a] === e.code) keys[a] = ''; });
      keys[capturing] = e.code;
      capturing = null;
      persist();
      return renderKeys();
    }
    if (document.body.dataset.page !== 'tracker') return;
    if (!S || S.finished || document.querySelector('dialog[open]')) return;
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const action = Object.keys(keys).find((a) => keys[a] === e.code);
    if (!action) return;
    e.preventDefault();
    if (action === 'skip') skip();
    else if (action === 'prev') go(S.current - 1);
    else if (action === 'next') go(S.current + 1);
    else { const i = parseInt(action.slice(1), 10); if (i < S.options) answer(i); }
  });

  window.ZC = {
    toast,
    dockUpdate() {
      const d = $('#dock');
      if (d) d.classList.toggle('hidden', !$('#dockMusic').textContent && !$('#dockPomo').textContent);
    }
  };

  render();
})();
