(() => {
  /* Safe expression evaluator (no eval). Supports + - * / ^ ! %, parentheses, implicit multiplication, trig, logs, pi, e, ans. */
  function evaluate(str, deg, ans) {
    const s = str.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').toLowerCase();
    const tok = [];
    const re = /\s*(\d+\.?\d*|\.\d+|[a-z]+|[-+*/^()!%])/y;
    for (let pos = 0; pos < s.length;) {
      re.lastIndex = pos;
      const m = re.exec(s);
      if (!m) { if (!s.slice(pos).trim()) break; throw new Error('Unexpected input'); }
      tok.push(m[1]); pos = re.lastIndex;
    }
    let i = 0;
    const peek = () => tok[i], next = () => tok[i++];
    const rad = (x) => (deg ? (x * Math.PI) / 180 : x), out = (x) => (deg ? (x * 180) / Math.PI : x);
    const F = Object.assign(Object.create(null), {
      sin: (x) => Math.sin(rad(x)), cos: (x) => Math.cos(rad(x)), tan: (x) => Math.tan(rad(x)),
      asin: (x) => out(Math.asin(x)), acos: (x) => out(Math.acos(x)), atan: (x) => out(Math.atan(x)),
      log: Math.log10, ln: Math.log, sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp
    });
    const C = Object.assign(Object.create(null), { pi: Math.PI, e: Math.E, ans: ans || 0 });
    const fact = (n) => {
      if (n < 0 || n !== Math.floor(n) || n > 170) throw new Error('Invalid factorial');
      let r = 1; for (let k = 2; k <= n; k++) r *= k; return r;
    };
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const o = next(), r = term(); v = o === '+' ? v + r : v - r; } return v; }
    function term() {
      let v = unary();
      for (;;) {
        const t = peek();
        if (t === '*' || t === '/') { next(); const r = unary(); v = t === '*' ? v * r : v / r; }
        else if (t !== undefined && /^[\d.a-z(]/.test(t)) v *= unary();
        else break;
      }
      return v;
    }
    function unary() { if (peek() === '-') { next(); return -unary(); } if (peek() === '+') { next(); return unary(); } return power(); }
    function power() { const b = postfix(); if (peek() === '^') { next(); return Math.pow(b, unary()); } return b; }
    function postfix() {
      let v = primary();
      for (;;) { if (peek() === '!') { next(); v = fact(v); } else if (peek() === '%') { next(); v /= 100; } else break; }
      return v;
    }
    function primary() {
      const t = next();
      if (t === undefined) throw new Error('Incomplete');
      if (/^[\d.]/.test(t)) return parseFloat(t);
      if (t === '(') { const v = expr(); if (peek() === ')') next(); return v; }
      if (t in F) { if (next() !== '(') throw new Error('Use ' + t + '(…)'); const v = expr(); if (peek() === ')') next(); return F[t](v); }
      if (t in C) return C[t];
      throw new Error('Unknown: ' + t);
    }
    const v = expr();
    if (i < tok.length) throw new Error('Unexpected ' + tok[i]);
    return v;
  }
  const format = (v) => {
    if (!isFinite(v)) return 'Error';
    if (Math.abs(v) < 1e-12) return '0';
    return String(parseFloat(v.toPrecision(12)));
  };
  if (typeof module !== 'undefined') { module.exports = { evaluate, format }; return; }

  /* ---------- UI ---------- */
  const $ = (s) => document.querySelector(s);
  const input = $('#calcIn'), out = $('#calcOut');
  let deg = true, ans = 0;
  const ROWS = [
    ['sin', 'cos', 'tan', '(', ')'],
    ['asin', 'acos', 'atan', '^', '√'],
    ['log', 'ln', 'π', 'e', '!'],
    ['7', '8', '9', '÷', 'AC'],
    ['4', '5', '6', '×', '⌫'],
    ['1', '2', '3', '−', 'Ans'],
    ['0', '.', '%', '+', '=']
  ];
  const INSERT = { sin: 'sin(', cos: 'cos(', tan: 'tan(', asin: 'asin(', acos: 'acos(', atan: 'atan(', log: 'log(', ln: 'ln(', '√': 'sqrt(', Ans: 'ans' };

  function preview() {
    if (!input.value.trim()) { out.innerHTML = '&nbsp;'; return; }
    try { out.textContent = format(evaluate(input.value, deg, ans)); } catch { out.innerHTML = '&nbsp;'; }
  }
  function commit() {
    try {
      const v = evaluate(input.value, deg, ans);
      ans = v;
      input.value = format(v);
      out.innerHTML = '&nbsp;';
    } catch (e) { out.textContent = e.message; }
  }
  function press(k) {
    if (k === 'AC') { input.value = ''; return preview(); }
    if (k === '=') return commit();
    if (k === '⌫') {
      const a = input.selectionStart, b = input.selectionEnd;
      if (a !== b) input.setRangeText('', a, b, 'end'); else if (a > 0) input.setRangeText('', a - 1, a, 'end');
      return preview();
    }
    const text = INSERT[k] || k;
    input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
    preview();
  }
  ROWS.forEach((row) => row.forEach((k) => {
    const b = document.createElement('button');
    b.textContent = k;
    if (k === '=') b.className = 'eq'; else if (/^(AC|⌫|÷|×|−|\+)$/.test(k)) b.className = 'op';
    b.addEventListener('click', () => { press(k); input.focus({ preventScroll: true }); });
    $('#calcKeys').appendChild(b);
  }));
  input.addEventListener('input', preview);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  $('#calcMode').addEventListener('click', (e) => { deg = !deg; e.target.textContent = deg ? 'DEG' : 'RAD'; preview(); });
  $('#btnCalc').addEventListener('click', () => { $('#dlgCalc').showModal(); });
})();
