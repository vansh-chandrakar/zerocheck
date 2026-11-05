(() => {
  const $ = (s) => document.querySelector(s);
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const LETTERS = 'ABCDEF';
  const DEFAULT_KEYS = {
    o0: 'Digit1', o1: 'Digit2', o2: 'Digit3', o3: 'Digit4', o4: 'Digit5', o5: 'Digit6',
    skip: 'KeyS', flag: 'KeyF', prev: 'ArrowLeft', next: 'ArrowRight'
  };
  const KEY_NAMES = {
    o0: 'Option 1', o1: 'Option 2', o2: 'Option 3', o3: 'Option 4', o4: 'Option 5', o5: 'Option 6',
    skip: 'Skip', flag: 'Flag for review', prev: 'Previous', next: 'Next'
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
    S.flags = S.flags || {};
    S.rules = S.rules || null;
    S.sections = S.sections || null;
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
  const secOf = (q) => (S.sections ? S.sections.find((s) => q >= s.from && q <= s.to) || null : null);
  const typeOf = (q) => (secOf(q) ? secOf(q).type : 'single');
  const subjectOf = (q) => (secOf(q) ? secOf(q).subject : 'All');
  const ansText = (v) => v === undefined ? 'Not answered' : v === 'skip' ? 'Skipped'
    : Array.isArray(v) ? v.map(label).join(', ') : (typeof v === 'object' ? v.n : label(v));
  const keyText = (q, k) => typeOf(q) === 'numeric' ? String(k) : Array.isArray(k) ? k.map(label).join(', ') : label(k);
  const optionList = () => Array.from({ length: S.options }, (_, i) => label(i)).join(', ');
  const fmtM = (n) => String(Math.round(n * 100) / 100);
  const flaggedList = () => Object.keys(S.flags).filter((q) => S.flags[q]).map(Number).sort((a, b) => a - b);
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
    const nFlag = flaggedList().length;
    const total = lastQ() !== null ? ` / ${S.count}` : '';
    $('#topicLabel').textContent = S.topic;
    $('#topicLabel').classList.toggle('hidden', !S.topic);
    $('#progress').textContent = `Answered ${c.answered}${total} · Skipped ${c.skipped}` + (nFlag ? ` · Flagged ${nFlag}` : '');
    $('.pbar').classList.toggle('hidden', !S.count);
    if (S.count) $('#pfill').style.width = Math.min(100, ((c.answered + c.skipped) / S.count) * 100) + '%';
    $('#qNum').textContent = S.current;

    const sec = secOf(S.current), t = typeOf(S.current), v = S.answers[S.current];

    // section chips (Exam Zone)
    const bar = $('#secBar');
    bar.classList.toggle('hidden', !S.sections);
    if (S.sections) {
      bar.innerHTML = '';
      S.sections.forEach((s) => {
        const b = document.createElement('button');
        b.textContent = s.name;
        if (s === sec) b.classList.add('on');
        b.addEventListener('click', () => go(s.from));
        bar.appendChild(b);
      });
      const on = bar.querySelector('.on');
      if (on) bar.scrollLeft = on.offsetLeft - bar.clientWidth / 2 + on.clientWidth / 2;
    }

    $('#qStatus').textContent = v === undefined ? 'Not answered yet' : v === 'skip' ? 'Skipped' : `Your answer: ${ansText(v)}`;
    $('#qHint').textContent = t === 'multi' ? 'One or more options can be correct' : t === 'numeric' ? 'Type a number' : '';
    $('#btnFlag').classList.toggle('on', !!S.flags[S.current]);
    $('#btnFlag').textContent = S.flags[S.current] ? '⚑ Flagged' : '⚑ Flag';

    const box = $('#options');
    box.classList.toggle('hidden', t === 'numeric');
    $('#numBox').classList.toggle('hidden', t !== 'numeric');
    box.innerHTML = '';
    if (t === 'numeric') {
      $('#numIn').value = v && typeof v === 'object' && !Array.isArray(v) ? v.n : '';
      if (!matchMedia('(hover: none)').matches) $('#numIn').focus({ preventScroll: true });
    } else {
      for (let i = 0; i < S.options; i++) {
        const b = document.createElement('button');
        b.textContent = label(i);
        if (t === 'multi' ? Array.isArray(v) && v.includes(i) : v === i) b.classList.add('selected');
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
    }
    updateClock();
  }

  function renderDone() {
    const c = counts();
    const nFlag = flaggedList().length;
    $('#stAnswered').textContent = c.answered;
    $('#stSkipped').textContent = c.skipped;
    $('#stNone').textContent = c.notAnswered;
    $('#stFlag').textContent = nFlag;
    $('#stFlagBox').classList.toggle('hidden', !nFlag);
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
  function answer(i) {
    flushTime();
    const t = typeOf(S.current);
    if (t === 'single') { S.answers[S.current] = i; advance(); }
    else if (t === 'multi') {
      const a = Array.isArray(S.answers[S.current]) ? S.answers[S.current].slice() : [];
      const p = a.indexOf(i);
      if (p >= 0) a.splice(p, 1); else a.push(i);
      a.sort((x, y) => x - y);
      if (a.length) S.answers[S.current] = a; else delete S.answers[S.current];
      persist(); render();
    }
  }
  function saveNumeric() {
    const raw = $('#numIn').value.trim().replace(',', '.');
    if (raw === '' || isNaN(Number(raw))) return toast('Enter a number');
    flushTime();
    S.answers[S.current] = { n: String(Number(raw)) };
    advance();
  }
  function skip() { flushTime(); S.answers[S.current] = 'skip'; advance(); }
  function clearAnswer() { delete S.answers[S.current]; persist(); render(); }
  function toggleFlag() {
    if (S.flags[S.current]) delete S.flags[S.current]; else S.flags[S.current] = true;
    persist(); render();
  }

  /* ---------- sessions / setup ---------- */
  function startSession(cfg) {
    S = {
      first: cfg.first, count: cfg.count || null, options: cfg.options, style: cfg.style,
      current: cfg.first, answers: {}, key: {}, times: {}, flags: {},
      topic: cfg.topic || '', mode: cfg.mode || 'none', limit: cfg.limit || 0,
      elapsed: 0, startedAt: cfg.mode && cfg.mode !== 'none' ? Date.now() : null,
      finished: false, alerted: false, rules: cfg.rules || null, sections: cfg.sections || null
    };
    view = 'done'; files = []; qEnter = Date.now();
    persist(); render();
  }

  $('#inTiming').addEventListener('change', (e) => {
    $('#minsWrap').classList.toggle('hidden', e.target.value !== 'timer');
  });
  $('#inMarking').addEventListener('change', (e) => {
    $('#markWrap').classList.toggle('hidden', e.target.value !== 'custom');
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
    let rules = null;
    if ($('#inMarking').value === 'custom') {
      const c = parseFloat($('#inMarkC').value), w = Math.abs(parseFloat($('#inMarkW').value)), u = parseFloat($('#inMarkU').value);
      if (isNaN(c) || isNaN(w)) return toast('Enter the marks for correct and wrong');
      rules = { single: { c, w }, skip: isNaN(u) ? 0 : u };
    }
    startSession({
      first, count: isNaN(count) ? null : count,
      options: parseInt($('#inOptions').value, 10), style: $('#inStyle').value,
      topic: $('#inTopic').value.trim(), mode, limit, rules
    });
  });

  document.querySelectorAll('.js-new').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Start a new session? Current answers will be cleared. Export first if you need them.')) return;
    S = null;
    view = 'done';
    try { localStorage.removeItem('zc_session'); } catch {}
    render();
  }));

  $('#btnSkip').addEventListener('click', skip);
  $('#btnFlag').addEventListener('click', toggleFlag);
  $('#btnClear').addEventListener('click', clearAnswer);
  $('#btnNumSave').addEventListener('click', saveNumeric);
  $('#btnNumNeg').addEventListener('click', () => {
    const el = $('#numIn');
    el.value = el.value.startsWith('-') ? el.value.slice(1) : '-' + el.value;
    el.focus({ preventScroll: true });
  });
  $('#numIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveNumeric(); } });
  $('#btnPrev').addEventListener('click', () => go(S.current - 1));
  $('#btnNext').addEventListener('click', () => go(S.current + 1));

  /* ---------- finish ---------- */
  $('#btnFinish').addEventListener('click', () => {
    const c = counts();
    const nFlag = flaggedList().length;
    if (!confirm(`Finish the test?\n\nNot answered: ${c.notAnswered}\nSkipped: ${c.skipped}` + (nFlag ? `\nFlagged for review: ${nFlag}` : ''))) return;
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
      const t = typeOf(q);
      const row = document.createElement('div');
      row.className = 'krow' + (t === 'multi' ? ' wide' : '');
      const mark = () => row.classList.toggle('set', S.key[q] !== undefined);
      const num = document.createElement('span');
      num.textContent = q;
      row.appendChild(num);
      if (t === 'single') {
        const sel = document.createElement('select');
        sel.appendChild(new Option('—', ''));
        for (let i = 0; i < S.options; i++) sel.appendChild(new Option(label(i), String(i)));
        sel.value = S.key[q] !== undefined ? String(S.key[q]) : '';
        sel.addEventListener('change', () => {
          if (sel.value === '') delete S.key[q]; else S.key[q] = parseInt(sel.value, 10);
          mark(); persist();
        });
        row.appendChild(sel);
      } else if (t === 'multi') {
        const wrap = document.createElement('div');
        wrap.className = 'kchips';
        const cur = () => (Array.isArray(S.key[q]) ? S.key[q] : []);
        for (let i = 0; i < S.options; i++) {
          const b = document.createElement('button');
          b.textContent = label(i);
          if (cur().includes(i)) b.classList.add('on');
          b.addEventListener('click', () => {
            const a = cur().slice(), p = a.indexOf(i);
            if (p >= 0) a.splice(p, 1); else a.push(i);
            a.sort((x, y) => x - y);
            if (a.length) S.key[q] = a; else delete S.key[q];
            b.classList.toggle('on', a.includes(i));
            mark(); persist();
          });
          wrap.appendChild(b);
        }
        row.appendChild(wrap);
      } else {
        const inp = document.createElement('input');
        inp.type = 'text'; inp.inputMode = 'decimal'; inp.placeholder = 'number';
        inp.value = S.key[q] !== undefined ? S.key[q] : '';
        inp.addEventListener('input', () => {
          const v = inp.value.trim().replace(',', '.');
          if (v === '' || isNaN(Number(v))) delete S.key[q]; else S.key[q] = Number(v);
          mark(); persist();
        });
        row.appendChild(inp);
      }
      mark();
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

  function keyPrompt() {
    const first = S.first, last = endQ();
    const groups = S.sections
      ? S.sections.filter((s) => s.from <= last).map((s) => ({ type: s.type, from: s.from, to: Math.min(s.to, last) }))
      : [{ type: 'single', from: first, to: last }];
    const rule = { single: 'single correct: report ONE position number', multi: 'multiple correct: report an ARRAY of ALL correct position numbers, e.g. [1,3]', numeric: 'numerical answer: report the number' };
    return `You are reading an answer key for a test. The attached file(s) contain the key. ` +
      `Extract the correct answer for each question number from ${first} to ${last}. ` +
      `Each question has ${S.options} options. The key may label options as letters (A, B, C...), numbers (1, 2, 3...) or roman numerals (I, II, III...). ` +
      `Always report options as position numbers from 1 to ${S.options} (first option = 1, second = 2, and so on). ` +
      `Question types:\n` + groups.map((g) => `- Questions ${g.from} to ${g.to}: ${rule[g.type]}`).join('\n') + '\n' +
      `Use only what is printed in the key. If a question is missing, unreadable or ambiguous, use null. Never guess. ` +
      `Respond with JSON only, in this shape: {"answers": {"${first}": 2, "${first + 1}": [1, 3], "${first + 2}": 12.5, "${first + 3}": null}}`;
  }

  $('#btnExtract').addEventListener('click', async () => {
    if (!gem.key) { toast('Add your Gemini key first'); return openGemini(); }
    if (!files.length) return toast('Choose photos or a PDF first');
    const btn = $('#btnExtract');
    const note = $('#extractNote');
    btn.disabled = true;
    btn.textContent = 'Reading…';
    try {
      const parts = [{ text: keyPrompt() }];
      for (const f of files) {
        const p = await fileToPart(f);
        parts.push({ inline_data: { mime_type: p.mime, data: p.data } });
      }
      const { data, model } = await generate(parts);
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
        .replace(/```json|```/g, '').trim();
      const ans = JSON.parse(text).answers || {};
      const first = S.first, last = endQ();
      let found = 0;
      for (const [q, v] of Object.entries(ans)) {
        const qn = parseInt(q, 10);
        if (!(qn >= first && qn <= last)) continue;
        const t = typeOf(qn);
        if (t === 'single') {
          const idx = toIdx(Array.isArray(v) ? v[0] : v);
          if (idx !== null) { S.key[qn] = idx; found++; }
        } else if (t === 'multi') {
          const arr = [...new Set((Array.isArray(v) ? v : [v]).map(toIdx).filter((x) => x !== null))].sort((a, b) => a - b);
          if (arr.length) { S.key[qn] = arr; found++; }
        } else {
          const n = parseFloat(v);
          if (isFinite(n)) { S.key[qn] = n; found++; }
        }
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
  // Marks for one question. Returns { st: correct | wrong | partial | missed | nokey, m: marks }
  function scoreQ(q) {
    const k = S.key[q], a = S.answers[q], t = typeOf(q);
    if (k === undefined) return { st: 'nokey', m: 0 };
    const R = S.rules, r = R ? (R[t] || R.single) : null;
    if (a === undefined || a === 'skip') return { st: 'missed', m: R ? (R.skip || 0) : 0 };
    let st;
    let right = 0;
    if (t === 'single') st = a === k ? 'correct' : 'wrong';
    else if (t === 'numeric') {
      const x = a && typeof a === 'object' && !Array.isArray(a) ? Number(a.n) : NaN;
      st = Math.abs(x - k) <= 1e-9 * Math.max(1, Math.abs(k)) ? 'correct' : 'wrong';
    } else {
      const A = Array.isArray(a) ? a : [], K = Array.isArray(k) ? k : [k];
      right = A.filter((x) => K.includes(x)).length;
      if (A.some((x) => !K.includes(x))) st = 'wrong';
      else st = right === K.length ? 'correct' : 'partial';
    }
    let m = 0;
    if (r) m = st === 'correct' ? r.c : st === 'wrong' ? -r.w : (right * (r.p || 0));
    return { st, m };
  }

  function compute() {
    const wrong = [], partial = [], missed = [], subj = {};
    let correct = 0, noKey = 0, marks = 0, max = 0;
    for (let q = S.first; q <= endQ(); q++) {
      const res = scoreQ(q);
      if (res.st === 'nokey') { noKey++; continue; }
      const t = typeOf(q), R = S.rules, r = R ? (R[t] || R.single) : null, name = subjectOf(q);
      const sj = subj[name] || (subj[name] = { name, correct: 0, wrong: 0, partial: 0, missed: 0, marks: 0, max: 0 });
      if (r) { max += r.c; sj.max += r.c; }
      marks += res.m; sj.marks += res.m;
      const item = { q, a: S.answers[q], k: S.key[q] };
      if (res.st === 'correct') { correct++; sj.correct++; }
      else if (res.st === 'wrong') { wrong.push(item); sj.wrong++; }
      else if (res.st === 'partial') { partial.push(item); sj.partial++; }
      else { missed.push(item); sj.missed++; }
    }
    const total = correct + wrong.length + partial.length + missed.length;
    return { correct, wrong, partial, missed, noKey, total, marks, max, pct: total ? Math.round((correct / total) * 100) : 0, subjects: Object.values(subj) };
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
    $('#scoreMain').textContent = S.rules ? `${fmtM(r.marks)} / ${fmtM(r.max)}` : `${r.correct} / ${r.total}`;
    $('#scoreSub').textContent = S.rules ? `${r.correct} of ${r.total} questions fully correct (${r.pct}%)` : `${r.pct}% correct`;
    $('#rsCorrect').textContent = r.correct;
    $('#rsWrong').textContent = r.wrong.length;
    $('#rsMissed').textContent = r.missed.length;
    $('#rsPartial').textContent = r.partial.length;
    $('#rsPartialBox').classList.toggle('hidden', r.partial.length === 0);
    $('#rsNoKey').textContent = r.noKey;
    $('#rsNoKeyBox').classList.toggle('hidden', r.noKey === 0);
    $('#timeOptR').classList.toggle('hidden', S.mode === 'none');

    const sb = $('#subjList');
    $('#subjBox').classList.toggle('hidden', r.subjects.length < 2);
    sb.innerHTML = r.subjects.map((s) =>
      `<div class="item"><b>${s.name}</b><span class="pair">${S.rules ? `<em>${fmtM(s.marks)} / ${fmtM(s.max)}</em>` : ''}${s.correct} right · ${s.wrong} wrong · ${s.missed} skipped</span></div>`).join('');

    const box = $('#wrongList');
    box.innerHTML = '';
    const blocks = [
      listBlock('Wrong', r.wrong, (i) => `<b>Q${i.q}</b><span class="pair">You <em>${ansText(i.a)}</em> Correct <em>${keyText(i.q, i.k)}</em></span>`),
      listBlock('Partially correct', r.partial, (i) => `<b>Q${i.q}</b><span class="pair">You <em>${ansText(i.a)}</em> Correct <em>${keyText(i.q, i.k)}</em></span>`),
      listBlock('Skipped or blank', r.missed, (i) => `<b>Q${i.q}</b><span class="pair">${i.a === 'skip' ? 'Skipped' : 'Blank'} Correct <em>${keyText(i.q, i.k)}</em></span>`)
    ].filter(Boolean);
    blocks.forEach((b) => box.appendChild(b));
    if (!blocks.length) box.innerHTML = '<p class="muted small" style="text-align:center">Nothing missed. Well done.</p>';
  }

  /* ---------- export ---------- */
  function buildRows() {
    const rows = [];
    const withT = $('#chkQTime').checked;
    for (let q = S.first; q <= endQ(); q++) rows.push([q, ansText(S.answers[q]) + (withT && S.times[q] ? ` (${fmt(S.times[q] / 1000)})` : '')]);
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
    const fl = flaggedList();
    copyText(
      (S.topic ? `Topic: ${S.topic}\n` : '') +
      `Questions: ${S.first} to ${endQ()}\nOptions: ${optionList()}\n` +
      (tl ? tl + '\n' : '') + '\n' +
      buildRows().map(([q, v]) => `${q}: ${v}`).join('\n') +
      `\n\n${summaryLine()}` + (fl.length ? `\nFlagged for review: ${fl.join(', ')}` : '')
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
    const fl = flaggedList();
    if (fl.length) { y += 5; doc.text(`Flagged for review: ${fl.join(', ')}`.slice(0, 150), 15, y); }
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

  function resultsLines(r) {
    const out = [];
    if (r.subjects.length > 1) {
      out.push(['By subject', true]);
      r.subjects.forEach((s) => out.push([`${s.name}: ${S.rules ? fmtM(s.marks) + ' / ' + fmtM(s.max) + ' marks, ' : ''}${s.correct} right, ${s.wrong} wrong, ${s.missed} skipped`, false]));
    }
    if (r.wrong.length) { out.push([`Wrong answers (${r.wrong.length})`, true]); r.wrong.forEach((i) => out.push([`${i.q}: You ${ansText(i.a)}, correct ${keyText(i.q, i.k)}`, false])); }
    if (r.partial.length) { out.push([`Partially correct (${r.partial.length})`, true]); r.partial.forEach((i) => out.push([`${i.q}: You ${ansText(i.a)}, correct ${keyText(i.q, i.k)}`, false])); }
    if (r.missed.length) { out.push([`Skipped or blank (${r.missed.length})`, true]); r.missed.forEach((i) => out.push([`${i.q}: ${i.a === 'skip' ? 'skipped' : 'blank'}, correct ${keyText(i.q, i.k)}`, false])); }
    return out;
  }
  const resultsHead = (r) =>
    (S.rules ? `Marks: ${fmtM(r.marks)} / ${fmtM(r.max)}\n` : `Score: ${r.correct} / ${r.total} (${r.pct}%)\n`) +
    `Correct: ${r.correct} | Wrong: ${r.wrong.length}` + (r.partial.length ? ` | Partial: ${r.partial.length}` : '') +
    ` | Skipped or blank: ${r.missed.length}` + (r.noKey ? ` | No key: ${r.noKey}` : '');

  $('#btnCopyR').addEventListener('click', () => {
    const r = compute(), tl = timeLine('#chkTimeR');
    let t = (S.topic ? `Topic: ${S.topic}\n` : '') + `Questions: ${S.first} to ${endQ()}\n` + resultsHead(r) + '\n' + (tl ? tl + '\n' : '');
    resultsLines(r).forEach(([txt, head]) => { t += (head ? '\n' : '') + txt + (head ? ':\n' : '\n'); });
    copyText(t.trim());
  });

  $('#btnPdfR').addEventListener('click', () => {
    const r = compute();
    const p = pdfStart('Results');
    if (!p) return;
    const { doc } = p;
    let y = p.y + 7;
    doc.text(`Questions ${S.first} to ${endQ()}  |  ${resultsHead(r).split('\n').pop()}`, 15, y);
    const tl = timeLine('#chkTimeR');
    if (tl) { y += 5; doc.text(tl, 15, y); }
    y += 12;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(S.rules ? `${fmtM(r.marks)} / ${fmtM(r.max)} marks` : `${r.correct} / ${r.total}  (${r.pct}%)`, 15, y);
    y += 12;
    resultsLines(r).forEach(([txt, head]) => {
      if (y > 280) { doc.addPage(); y = 20; }
      if (head) y += 3;
      doc.setFont('helvetica', head ? 'bold' : 'normal');
      doc.setFontSize(head ? 12 : 11);
      doc.text(txt, 15, y);
      y += head ? 8 : 6;
    });
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
      if (filter === 'flagged' && !S.flags[q]) continue;
      const b = document.createElement('button');
      b.textContent = q;
      if (v === 'skip') b.classList.add('skipped');
      else if (v !== undefined) b.classList.add('answered');
      if (S.flags[q]) b.classList.add('flagged');
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
    if (document.body.dataset.page !== 'tracker' || document.body.classList.contains('welcoming')) return;
    if (!S || S.finished || document.querySelector('dialog[open]')) return;
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const action = Object.keys(keys).find((a) => keys[a] === e.code);
    if (!action) return;
    e.preventDefault();
    if (action === 'skip') skip();
    else if (action === 'flag') toggleFlag();
    else if (action === 'prev') go(S.current - 1);
    else if (action === 'next') go(S.current + 1);
    else { const i = parseInt(action.slice(1), 10); if (i < S.options && typeOf(S.current) !== 'numeric') answer(i); }
  });

  window.ZC = {
    toast,
    startSession,
    hasSession: () => !!S,
    dockUpdate() {
      const d = $('#dock');
      if (d) d.classList.toggle('hidden', !$('#dockMusic').textContent && !$('#dockPomo').textContent);
    }
  };

  render();
})();
