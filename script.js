(() => {
  'use strict';

  const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const MAX_DIGITS = 15;
  const MAX_HISTORY = 50;
  const STORE_KEY = 'calculator-history-v1';

  class CalcError extends Error {}

  const $ = (id) => document.getElementById(id);
  const els = {
    display: $('display'), expr: $('expression'), value: $('value'), preview: $('preview'),
    keys: $('keys'), list: $('historyList'), empty: $('historyEmpty'), clearHistory: $('clearHistory'),
  };

  const isOp = (t) => Object.prototype.hasOwnProperty.call(SYMBOL, t);
  const newState = () => ({ tokens: [], current: '0', replace: false, error: '', lastExpr: '' });

  let state = newState();
  let history = loadHistory();

  /* ---------- Math helpers ---------- */
  const clean = (n) => {
    const r = Number(n.toPrecision(12));
    return Object.is(r, -0) ? 0 : r;
  };
  const toStr = (n) => String(clean(n));

  function evaluate(list) {
    const terms = [Number(list[0])];
    const adds = [];
    for (let i = 1; i < list.length; i += 2) {
      const op = list[i];
      const n = Number(list[i + 1]);
      if (op === '*') terms[terms.length - 1] *= n;
      else if (op === '/') {
        if (n === 0) throw new CalcError('Cannot divide by zero');
        terms[terms.length - 1] /= n;
      } else {
        adds.push(op);
        terms.push(n);
      }
    }
    let result = terms[0];
    adds.forEach((op, i) => { result = op === '+' ? result + terms[i + 1] : result - terms[i + 1]; });
    if (!Number.isFinite(result)) throw new CalcError('Result is too large to display');
    return toStr(result);
  }

  function formatNum(str) {
    if (/e/i.test(str)) return str.replace('-', '−');
    const neg = str.startsWith('-');
    const [int, dec] = (neg ? str.slice(1) : str).split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + grouped + (dec !== undefined ? '.' + dec : '');
  }

  const formatToken = (t) => (isOp(t) ? SYMBOL[t] : formatNum(t));

  function currentList() {
    const list = state.tokens.concat(state.current !== '' ? [state.current] : []);
    if (isOp(list[list.length - 1])) list.pop();
    return list;
  }

  /* ---------- Actions ---------- */
  const actions = {
    digit(d) {
      if (state.error) state = newState();
      const c = state.current;
      if (state.replace || c === '' || c === '0') state.current = d;
      else if (c === '-0') state.current = '-' + d;
      else if (c.replace(/\D/g, '').length < MAX_DIGITS) state.current = c + d;
      state.replace = false;
      state.lastExpr = '';
    },

    dot() {
      if (state.error) state = newState();
      if (state.replace || state.current === '') state.current = '0.';
      else if (!state.current.includes('.')) state.current += '.';
      state.replace = false;
      state.lastExpr = '';
    },

    op(op) {
      if (state.error) return;
      if (state.current === '') state.tokens[state.tokens.length - 1] = op;
      else { state.tokens.push(state.current, op); state.current = ''; }
      state.replace = false;
      state.lastExpr = '';
    },

    equals() {
      if (state.error) return;
      const list = currentList();
      if (list.length < 2) return;
      const exprText = list.map(formatToken).join(' ') + ' =';
      try {
        const result = evaluate(list);
        addHistory(exprText.slice(0, -2), result);
        state = { ...newState(), current: result, replace: true, lastExpr: exprText };
      } catch (err) {
        state = { ...newState(), error: err instanceof CalcError ? err.message : 'Invalid calculation', lastExpr: exprText };
        els.display.classList.remove('shake');
        void els.display.offsetWidth;
        els.display.classList.add('shake');
      }
    },

    negate() {
      if (state.error) return;
      const c = state.current;
      state.current = c === '' ? '-0' : c.startsWith('-') ? c.slice(1) : '-' + c;
      if (c === '') state.replace = false;
    },

    percent() {
      if (state.error || state.current === '') return;
      const value = Number(state.current);
      const last = state.tokens[state.tokens.length - 1];
      let result = value / 100;
      if (state.tokens.length >= 2 && (last === '+' || last === '-')) {
        try { result = (Number(evaluate(state.tokens.slice(0, -1))) * value) / 100; } catch { /* keep plain percent */ }
      }
      state.current = toStr(result);
      state.replace = true;
    },

    delete() {
      if (state.error) { state = newState(); return; }
      if (state.replace) { state = newState(); return; }
      if (state.current === '') {
        state.tokens.pop();
        state.current = state.tokens.pop() ?? '0';
        return;
      }
      state.current = state.current.slice(0, -1);
      if (state.current === '' || state.current === '-') state.current = '0';
    },

    clear() { state = newState(); },
  };

  function perform(type, value) {
    if (type === 'digit') actions.digit(value);
    else if (type === 'op') actions.op(value);
    else if (actions[value]) actions[value]();
    render();
  }

  /* ---------- Rendering ---------- */
  function render() {
    const { tokens, current, error, lastExpr } = state;
    let main;
    if (error) main = error;
    else if (current === '') {
      try { main = formatNum(evaluate(tokens.slice(0, -1))); } catch { main = '0'; }
    } else main = formatNum(current);

    let exprText = lastExpr;
    if (!exprText && tokens.length) {
      exprText = tokens.map(formatToken).join(' ') + (current !== '' ? ' ' + formatNum(current) : '');
    }

    let previewText = '';
    if (!error && !lastExpr) {
      const list = currentList();
      if (list.length >= 3) {
        try { previewText = '= ' + formatNum(evaluate(list)); } catch { previewText = ''; }
      }
    }

    els.expr.textContent = exprText;
    els.value.textContent = main;
    els.value.dataset.size = main.length > 16 ? 'xs' : main.length > 11 ? 'sm' : '';
    els.preview.textContent = previewText;
    els.display.classList.toggle('is-error', Boolean(error));

    const pending = current === '' && tokens.length ? tokens[tokens.length - 1] : null;
    els.keys.querySelectorAll('[data-type="op"]').forEach((btn) => {
      const on = btn.dataset.value === pending;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  /* ---------- History ---------- */
  function loadHistory() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY));
      return Array.isArray(data) ? data.filter((h) => h && typeof h.expr === 'string' && typeof h.result === 'string') : [];
    } catch { return []; }
  }

  function saveHistory() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(history)); } catch { /* storage unavailable */ }
  }

  function addHistory(expr, result) {
    history.unshift({ expr, result });
    history = history.slice(0, MAX_HISTORY);
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    els.list.replaceChildren();
    history.forEach((item) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-item';
      btn.title = 'Use this result';
      const e = document.createElement('span');
      e.className = 'h-expr';
      e.textContent = item.expr + ' =';
      const r = document.createElement('span');
      r.className = 'h-result';
      r.textContent = formatNum(item.result);
      btn.append(e, r);
      btn.addEventListener('click', () => {
        state = { ...newState(), current: item.result, replace: true };
        render();
      });
      li.appendChild(btn);
      els.list.appendChild(li);
    });
    els.empty.hidden = history.length > 0;
    els.clearHistory.disabled = history.length === 0;
  }

  els.clearHistory.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
  });

  /* ---------- Input: mouse / touch ---------- */
  els.keys.addEventListener('click', (e) => {
    const btn = e.target.closest('.key');
    if (btn) perform(btn.dataset.type, btn.dataset.value);
  });

  /* ---------- Input: keyboard ---------- */
  const KEY_MAP = {
    '+': ['op', '+'], '-': ['op', '-'], '*': ['op', '*'], x: ['op', '*'], X: ['op', '*'], '/': ['op', '/'],
    Enter: ['action', 'equals'], '=': ['action', 'equals'],
    Backspace: ['action', 'delete'], Delete: ['action', 'clear'], Escape: ['action', 'clear'],
    '%': ['action', 'percent'], n: ['action', 'negate'], N: ['action', 'negate'],
    '.': ['action', 'dot'], ',': ['action', 'dot'],
  };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' && e.target.closest('.history')) return;
    const mapped = /^\d$/.test(e.key) ? ['digit', e.key] : KEY_MAP[e.key];
    if (!mapped) return;
    e.preventDefault();
    const [type, value] = mapped;
    perform(type, value);
    const btn = els.keys.querySelector(`[data-type="${type}"][data-value="${value}"]`);
    if (btn) {
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 120);
    }
  });

  renderHistory();
  render();
})();
