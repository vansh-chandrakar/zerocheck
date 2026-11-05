(() => {
  const $ = (s) => document.querySelector(s);

  // Section format: [subject, section name, number of questions, type]. Types: single, multi, numeric.
  const sub = (subject, parts) => parts.map(([suffix, n, type]) => [subject, `${subject} ${suffix}`, n, type]);
  const EXAMS = {
    neet: {
      name: 'NEET UG', sub: '180 MCQs, 720 marks, +4 / −1',
      desc: '180 compulsory MCQs: Physics 45, Chemistry 45, Botany 45, Zoology 45. Total 720 marks.',
      minutes: 180, options: 4, style: 'numbers',
      secs: [['Physics', 'Physics', 45, 'single'], ['Chemistry', 'Chemistry', 45, 'single'], ['Botany', 'Botany', 45, 'single'], ['Zoology', 'Zoology', 45, 'single']],
      rules: { single: { c: 4, w: 1 } }
    },
    jeemain: {
      name: 'JEE Main', sub: '75 questions, 300 marks, MCQ + numerical',
      desc: 'Paper 1: 75 questions. Each subject has 20 MCQs (section A) and 5 numerical questions (section B). Total 300 marks. Sources disagree on negative marking for numericals, so check the NTA bulletin and edit below.',
      minutes: 180, options: 4, style: 'numbers',
      secs: ['Physics', 'Chemistry', 'Mathematics'].flatMap((s) => sub(s, [['A', 20, 'single'], ['B', 5, 'numeric']])),
      rules: { single: { c: 4, w: 1 }, numeric: { c: 4, w: 1 } }
    },
    jeeadv: {
      name: 'JEE Advanced', sub: 'One paper, mixed question types, partial marking',
      desc: 'One paper: 17 questions per subject. A: 4 single correct. B: 3 multiple correct (partial marking). C: 6 numerical. D: 4 matching (single correct). The real pattern changes every year, so check the official brochure and edit the marks below. Time is 3 hours per paper.',
      minutes: 180, options: 4, style: 'letters',
      secs: ['Physics', 'Chemistry', 'Mathematics'].flatMap((s) => sub(s, [['A', 4, 'single'], ['B', 3, 'multi'], ['C', 6, 'numeric'], ['D', 4, 'single']])),
      rules: { single: { c: 3, w: 1 }, multi: { c: 4, p: 1, w: 2 }, numeric: { c: 4, w: 0 } }
    }
  };
  const TYPE_NAMES = { single: 'Single correct', multi: 'Multiple correct', numeric: 'Numerical' };
  let cur = null;

  const pick = $('#examPick');
  Object.entries(EXAMS).forEach(([id, ex]) => {
    const b = document.createElement('button');
    b.className = 'tile';
    b.innerHTML = `<span class="t-title">${ex.name}</span><span class="t-sub">${ex.sub}</span>`;
    b.addEventListener('click', () => select(id));
    pick.appendChild(b);
  });

  const typesIn = (ex) => [...new Set(ex.secs.map((s) => s[3]))];
  const countOf = (ex, type) => ex.secs.filter((s) => s[3] === type).reduce((a, s) => a + s[2], 0);

  function maxMarks() {
    const ex = EXAMS[cur];
    return typesIn(ex).reduce((sum, t) => sum + countOf(ex, t) * (parseFloat($(`#rule_${t}_c`).value) || 0), 0);
  }
  const updateMax = () => { $('#exMax').textContent = `Total marks: ${Math.round(maxMarks() * 100) / 100}`; };

  function renderRules(ex) {
    const box = $('#exRules');
    box.innerHTML = '';
    typesIn(ex).forEach((t) => {
      const r = ex.rules[t] || ex.rules.single;
      const field = (key, lbl, val) => `<label><span class="lbl">${lbl}</span><input id="rule_${t}_${key}" type="number" step="any" value="${val}"></label>`;
      const row = document.createElement('div');
      row.className = 'rule';
      row.innerHTML = `<div class="rule-name">${TYPE_NAMES[t]} <span class="muted small">(${countOf(ex, t)} questions)</span></div>` +
        `<div class="rule-fields">` + field('c', 'Correct (+)', r.c) +
        (t === 'multi' ? field('p', 'Partial, per option (+)', r.p) : '') +
        field('w', t === 'multi' ? 'Any wrong (−)' : 'Wrong (−)', r.w) + `</div>`;
      box.appendChild(row);
      row.querySelectorAll('input').forEach((i) => i.addEventListener('input', updateMax));
    });
    const p = document.createElement('p');
    p.id = 'exMax';
    p.className = 'muted small';
    box.appendChild(p);
    updateMax();
  }

  function renderPresets(ex) {
    const box = $('#exPresets');
    box.innerHTML = '';
    [[`Full · ${ex.minutes} min`, ex.minutes], [`Half · ${Math.round(ex.minutes / 2)} min`, Math.round(ex.minutes / 2)],
      [`Quick · ${Math.round(ex.minutes / 3)} min`, Math.round(ex.minutes / 3)], ['Stopwatch', 0]].forEach(([txt, m]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = txt;
      b.addEventListener('click', () => {
        $('#exMinutes').value = m || '';
        box.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
      });
      box.appendChild(b);
    });
    box.firstChild.classList.add('on');
  }

  function select(id) {
    cur = id;
    const ex = EXAMS[id];
    $('#examCfg').classList.remove('hidden');
    $('#examTitle').textContent = ex.name;
    $('#examDesc').textContent = ex.desc;
    $('#exName').value = '';
    $('#exMinutes').value = ex.minutes;
    $('#exStyle').value = ex.style;
    renderPresets(ex);
    renderRules(ex);
    $('#examCfg').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('#exMinutes').addEventListener('input', () => {
    $('#exPresets').querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
  });

  $('#examForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ex = EXAMS[cur];
    if (!ex) return;
    let from = 1;
    const sections = ex.secs.map(([subject, name, n, type]) => {
      const s = { name, subject, from, to: from + n - 1, type };
      from += n;
      return s;
    });
    const rules = { skip: 0 };
    for (const t of typesIn(ex)) {
      const c = parseFloat($(`#rule_${t}_c`).value), w = Math.abs(parseFloat($(`#rule_${t}_w`).value));
      if (isNaN(c) || isNaN(w)) return ZC.toast('Fill in the marks for every question type');
      rules[t] = { c, w };
      if (t === 'multi') rules[t].p = parseFloat($('#rule_multi_p').value) || 0;
    }
    const mins = parseFloat($('#exMinutes').value) || 0;
    if (ZC.hasSession() && !confirm('Starting a new exam replaces your current session. Continue?')) return;
    ZC.startSession({
      first: 1, count: from - 1, options: ex.options, style: $('#exStyle').value,
      topic: $('#exName').value.trim() || ex.name,
      mode: mins > 0 ? 'timer' : 'stopwatch', limit: Math.round(mins * 60),
      rules, sections
    });
    $('#examCfg').classList.add('hidden');
    location.hash = '#tracker';
  });
})();
