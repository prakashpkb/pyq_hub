/* PrelimsPractice – one app for every test.  Data lives in /data/*.json */
(() => {
'use strict';

// ---------------------------------------------------------------- config
const CFG = {
  protect: true,          // block right-click / copy on question text
  defaultNeg: 1 / 3,      // negative mark if test file doesn't specify
};

// ---------------------------------------------------------------- tiny helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('pp_' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('pp_' + k, JSON.stringify(v)),
  del: k => localStorage.removeItem('pp_' + k),
};
const fmt = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800); };
const tpl = id => $('#app').replaceChildren($('#tpl-' + id).content.cloneNode(true));

// ---------------------------------------------------------------- data
let catalogue = [];
const cache = {};
async function loadCatalogue() {
  if (catalogue.length) return catalogue;
  const r = await fetch('data/tests.json', { cache: 'no-cache' });
  catalogue = await r.json();
  return catalogue;
}
async function loadTest(id) {
  if (!cache[id]) {
    const r = await fetch(`data/${encodeURIComponent(id)}.json`);
    if (!r.ok) throw new Error('Test not found');
    cache[id] = await r.json();
  }
  return cache[id];
}
const qKey = (tid, i) => tid + '#' + i;

// ---------------------------------------------------------------- theme
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#themeBtn i').className = t === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}
applyTheme(store.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#themeBtn').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; store.set('theme', t); applyTheme(t); };

// ---------------------------------------------------------------- router
let S = null;          // active quiz session
let timerH = null;
window.addEventListener('hashchange', route);
async function route() {
  const h = location.hash.slice(2).split('/');
  document.body.classList.remove('in-quiz');
  clearInterval(timerH);
  try {
    if (h[0] === 'test' && h[1]) return await renderStart(decodeURIComponent(h[1]));
    if (h[0] === 'quiz' && S) return renderQuiz();
    if (h[0] === 'result' && S?.submitted) return renderResult();
    if (h[0] === 'bookmarks') return await startBookmarks();
    return await renderHome();
  } catch (e) {
    $('#app').innerHTML = `<div class="empty card"><i class="fas fa-triangle-exclamation fa-2x"></i><p style="margin-top:10px">${esc(e.message)}</p>
      <p class="muted" style="font-size:13px">Opening index.html directly from disk? Run <code>python -m http.server</code> in the folder and open http://localhost:8000</p></div>`;
  }
}

// ================================================================= HOME
async function renderHome() {
  tpl('home');
  const tests = await loadCatalogue();
  const prog = store.get('progress', {});
  const wrong = Object.keys(store.get('wrong', {})).length;
  const totalQ = tests.reduce((a, t) => a + t.count, 0);
  const done = tests.filter(t => prog[t.id]).length;
  const avg = done ? Math.round(tests.filter(t => prog[t.id]).reduce((a, t) => a + prog[t.id].best, 0) / done) : 0;
  $('#heroStats').innerHTML = [
    ['pri', tests.length, 'Tests'], ['', totalQ, 'Questions'], ['ok', `${done}/${tests.length}`, 'Tests attempted'],
    ['warn', avg + '%', 'Avg best score'], ['bad', wrong, 'Questions to revise'],
  ].map(([c, v, l]) => `<div class="stat ${c}"><b>${v}</b><span>${l}</span></div>`).join('');

  const cats = ['All', ...new Set(tests.map(t => t.category))];
  let cat = store.get('cat', 'All'); if (!cats.includes(cat)) cat = 'All';
  const picked = new Set();

  const draw = () => {
    const q = $('#search').value.trim().toLowerCase();
    $('#chips').innerHTML = cats.map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
    const list = tests.filter(t => (cat === 'All' || t.category === cat) && (t.title + ' ' + t.category).toLowerCase().includes(q));
    const groups = {};
    list.forEach(t => (groups[t.category] ||= []).push(t));
    $('#catalogue').innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([g, ts]) => `
      <div class="cat-title">${esc(g)} <span>${ts.length}</span></div>
      <div class="tests">${ts.map(t => {
        const p = prog[t.id];
        return `<div class="test card" data-id="${esc(t.id)}">
          <input type="checkbox" class="pick" title="Include in mixed practice" ${picked.has(t.id) ? 'checked' : ''}>
          <h4>${esc(t.title)}</h4>
          <div class="meta"><span><i class="far fa-circle-question"></i> ${t.count} Qs</span><span><i class="far fa-clock"></i> ${t.minutes} min</span></div>
          <div class="bar"><div style="width:${p ? p.best : 0}%"></div></div>
          <div class="best ${p ? 'done' : ''}">${p ? `Best ${p.best}% · ${p.attempts} attempt${p.attempts > 1 ? 's' : ''}` : 'Not attempted yet'}</div>
        </div>`; }).join('')}</div>`).join('')
      : `<div class="empty">No tests match “${esc(q)}”</div>`;
  };
  draw();
  $('#search').oninput = draw;
  $('#chips').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; cat = c.dataset.c; store.set('cat', cat); draw(); };
  $('#catalogue').onclick = e => {
    const card = e.target.closest('.test'); if (!card) return;
    if (e.target.classList.contains('pick')) { e.target.checked ? picked.add(card.dataset.id) : picked.delete(card.dataset.id); return; }
    location.hash = '#/test/' + encodeURIComponent(card.dataset.id);
  };
  $('#mixBtn').onclick = async () => {
    const ids = picked.size ? [...picked] : tests.filter(t => cat === 'All' || t.category === cat).map(t => t.id);
    const onlyWrong = $('#mixWrong').checked, wrongSet = store.get('wrong', {});
    $('#mixBtn').disabled = true;
    let pool = [];
    for (const id of ids) {
      const d = await loadTest(id);
      d.questions.forEach((q, i) => { if (!onlyWrong || wrongSet[qKey(id, i)]) pool.push({ tid: id, i, src: d.title, ...q }); });
    }
    $('#mixBtn').disabled = false;
    if (!pool.length) return toast(onlyWrong ? 'No wrong answers saved yet 🎉' : 'No questions found');
    const n = +$('#mixCount').value;
    newSession({ id: null, title: onlyWrong ? 'Revise mistakes' : 'Mixed practice', mode: 'practice', items: shuffle(pool).slice(0, n), minutes: 0, neg: CFG.defaultNeg });
  };
}

// ================================================================= START
async function renderStart(id) {
  tpl('start');
  const d = await loadTest(id);
  const neg = d.negative ?? CFG.defaultNeg;
  $('#sCat').textContent = d.category;
  $('#sTitle').textContent = d.title;
  $('#sMeta').innerHTML = `<span><i class="far fa-circle-question"></i> ${d.questions.length} questions</span><span><i class="far fa-clock"></i> ${d.minutes} min</span><span><i class="fas fa-minus"></i> ${+neg.toFixed(2)} negative</span>`;
  $('#sMin').value = d.minutes;
  let mode = null;
  $$('.mode').forEach(b => b.onclick = () => { $$('.mode').forEach(x => x.classList.remove('on')); b.classList.add('on'); mode = b.dataset.mode; $('#sGo').disabled = false; });

  const saved = store.get('session_' + id);
  if (saved && !saved.submitted) {
    const n = saved.ans.filter(a => a !== null).length;
    $('#sResume').innerHTML = `<div class="resume"><span><i class="fas fa-clock-rotate-left"></i> Unfinished ${saved.mode} attempt · ${n}/${saved.items.length} answered</span><button class="btn primary" id="resBtn">Resume</button></div>`;
    $('#resBtn').onclick = () => { S = saved; S.items = saved.order.map(i => ({ tid: id, i, ...d.questions[i] })); location.hash = '#/quiz'; };
  }
  $('#sGo').onclick = () => {
    let items = d.questions.map((q, i) => ({ tid: id, i, ...q }));
    if ($('#sShuffle').checked) items = shuffle(items);
    newSession({ id, title: d.title, mode, items, minutes: mode === 'exam' ? Math.max(1, +$('#sMin').value || d.minutes) : 0, neg });
  };
}

async function startBookmarks() {
  const bm = Object.keys(store.get('bm', {}));
  if (!bm.length) { await renderHome(); return toast('No saved questions yet — tap “Save” during a quiz'); }
  const items = [];
  for (const k of bm) {
    const [tid, i] = k.split('#');
    try { const d = await loadTest(tid); if (d.questions[i]) items.push({ tid, i: +i, src: d.title, ...d.questions[i] }); } catch {}
  }
  newSession({ id: null, title: 'Saved questions', mode: 'practice', items, minutes: 0, neg: CFG.defaultNeg });
}

// ================================================================= SESSION
function newSession({ id, title, mode, items, minutes, neg }) {
  S = { id, title, mode, items, neg, order: items.map(x => x.i), dur: minutes * 60, used: 0,
        ans: Array(items.length).fill(null), mk: Array(items.length).fill(false), seen: Array(items.length).fill(false),
        cur: 0, submitted: false, filter: null };
  if (id) store.del('session_' + id);
  if (location.hash === '#/quiz') route(); else location.hash = '#/quiz';
}
function save() {
  if (!S?.id) return;
  if (S.submitted) return store.del('session_' + S.id);
  const { items, ...rest } = S;           // don't store question text, only order
  store.set('session_' + S.id, rest);
}

// ================================================================= QUIZ
function renderQuiz() {
  tpl('quiz');
  document.body.classList.add('in-quiz');
  if (CFG.protect) $('#qCard').classList.add('noselect');
  $('#qTitle').textContent = S.title;
  $('#qMode').textContent = S.submitted ? 'review' : S.mode;

  // palette
  $('#qGrid').innerHTML = S.items.map((_, i) => `<button class="cell" data-i="${i}">${i + 1}</button>`).join('');
  $('#qGrid').onclick = e => { const c = e.target.closest('.cell'); if (c) { go(+c.dataset.i); $('#palette').classList.remove('open'); } };
  $('#qGridBtn').onclick = () => $('#palette').classList.toggle('open');
  $('#palClose').onclick = () => $('#palette').classList.remove('open');

  $('#qPrev').onclick = () => step(-1);
  $('#qNext').onclick = () => (isLast() && !S.submitted) ? confirmSubmit() : step(1);
  $('#qMark').onclick = () => { S.mk[S.cur] = !S.mk[S.cur]; save(); paint(); };
  $('#qBook').onclick = toggleBookmark;
  $('#qSubmit2').onclick = () => S.submitted ? (location.hash = '#/result') : confirmSubmit();
  $('#qExit').onclick = () => { if (S.submitted || !S.id || confirm('Leave the test? Your progress is saved and you can resume later.')) location.hash = S.submitted ? '#/result' : (S.id ? '#/test/' + encodeURIComponent(S.id) : '#/'); };
  if (S.submitted) { $('#qSubmit2').innerHTML = '<i class="fas fa-chart-pie"></i> Back to result'; $('#qSubmit2').className = 'btn primary full'; }

  // timer
  const tick = () => {
    if (!S.submitted) S.used++;
    const el = $('#qTimer'); if (!el) return clearInterval(timerH);
    if (S.dur) {
      const left = S.dur - S.used;
      el.lastChild.textContent = fmt(left);
      el.classList.toggle('low', left <= 60 && !S.submitted);
      if (left <= 0 && !S.submitted) { toast("Time's up!"); submit(); }
    } else el.lastChild.textContent = fmt(S.used);
    if (S.used % 10 === 0) save();
  };
  clearInterval(timerH); S.used--; tick();
  if (!S.submitted) timerH = setInterval(tick, 1000);
  else $('#qTimer').lastChild.textContent = fmt(S.used);

  go(S.filter ? S.filter[0] ?? 0 : S.cur);
}

const isLast = () => S.filter ? S.filter.indexOf(S.cur) === S.filter.length - 1 : S.cur === S.items.length - 1;
function step(d) {
  if (S.filter) { const k = S.filter.indexOf(S.cur) + d; if (k >= 0 && k < S.filter.length) go(S.filter[k]); }
  else { const k = S.cur + d; if (k >= 0 && k < S.items.length) go(k); }
}
function go(i) { S.cur = i; S.seen[i] = true; drawQuestion(); paint(); $('#qCard').scrollTop = 0; save(); }

function drawQuestion() {
  const q = S.items[S.cur], a = S.ans[S.cur];
  const reveal = S.submitted || (S.mode === 'practice' && a !== null);
  const L = 'ABCDEF';
  const opts = q.o.map((o, k) => {
    let c = 'opt', key = L[k];
    if (a === k) c += ' sel';
    if (reveal) {
      if (k === q.a) { c = 'opt ok'; key = '<i class="fas fa-check"></i>'; }
      else if (a === k) { c = 'opt bad'; key = '<i class="fas fa-xmark"></i>'; }
    }
    return `<button class="${c}" data-k="${k}" ${reveal ? 'disabled' : ''}><span class="k">${key}</span><span class="t">${esc(o)}</span></button>`;
  }).join('');
  let verdict = '';
  if (reveal) verdict = a === null ? `<div class="verdict"><i class="fas fa-minus"></i> Not attempted — answer is ${L[q.a]}</div>`
    : a === q.a ? `<div class="verdict ok"><i class="fas fa-circle-check"></i> Correct</div>`
    : `<div class="verdict bad"><i class="fas fa-circle-xmark"></i> Incorrect — answer is ${L[q.a]}</div>`;
  const pos = S.filter ? `${S.filter.indexOf(S.cur) + 1} of ${S.filter.length} (filtered)` : `${S.cur + 1} of ${S.items.length}`;
  $('#qCard').innerHTML = `
    <div class="qnum"><span>Question ${pos}</span>${q.src ? `<span class="src">${esc(q.src)}</span>` : ''}</div>
    ${q.r ? `<div class="qref">${esc(q.r)}</div>` : ''}
    <div class="qtext">${esc(q.q)}</div>
    <div class="opts">${opts}</div>
    ${verdict}
    ${reveal && q.e ? `<div class="exp"><b><i class="fas fa-lightbulb"></i> Explanation</b>${esc(q.e)}</div>` : ''}`;
  $$('.opt', $('#qCard')).forEach(b => b.onclick = () => choose(+b.dataset.k));

  $('#qPrev').disabled = S.filter ? S.filter.indexOf(S.cur) === 0 : S.cur === 0;
  const last = isLast();
  $('#qNext').innerHTML = last && !S.submitted ? '<span>Submit</span><i class="fas fa-paper-plane"></i>' : '<span>Next</span><i class="fas fa-chevron-right"></i>';
  $('#qNext').disabled = last && S.submitted;
  const bm = store.get('bm', {})[qKey(q.tid, q.i)];
  $('#qBook').innerHTML = `<i class="${bm ? 'fas' : 'far'} fa-bookmark"></i><span>${bm ? 'Saved' : 'Save'}</span>`;
  $('#qBook').classList.toggle('on', !!bm);
  $('#qMark').innerHTML = `<i class="${S.mk[S.cur] ? 'fas' : 'far'} fa-flag"></i><span>${S.mk[S.cur] ? 'Marked' : 'Mark'}</span>`;
  $('#qMark').classList.toggle('on', S.mk[S.cur]);
  $('#qMark').style.display = S.submitted ? 'none' : '';
}

function choose(k) {
  if (S.submitted) return;
  const locked = S.mode === 'practice' && S.ans[S.cur] !== null;
  if (locked) return;
  S.ans[S.cur] = S.ans[S.cur] === k ? null : k;
  if (S.mode === 'practice') trackWrong(S.items[S.cur], S.ans[S.cur]);
  save(); drawQuestion(); paint();
}

function paint() {
  const n = S.ans.filter(a => a !== null).length;
  $('#qCount').textContent = `${n}/${S.items.length} answered`;
  $('#qProg').style.width = (n / S.items.length * 100) + '%';
  $$('.cell').forEach((c, i) => {
    let cls = 'cell';
    if (S.submitted || (S.mode === 'practice' && S.ans[i] !== null)) {
      if (S.ans[i] !== null) cls += S.ans[i] === S.items[i].a ? ' ok' : ' bad';
    } else {
      if (S.ans[i] !== null) cls += ' ans';
      if (S.mk[i]) cls += ' mk';
    }
    if (i === S.cur) cls += ' cur';
    if (S.filter && !S.filter.includes(i)) cls += ' hide';
    c.className = cls;
  });
}

function toggleBookmark() {
  const q = S.items[S.cur], bm = store.get('bm', {}), k = qKey(q.tid, q.i);
  if (bm[k]) { delete bm[k]; toast('Removed from saved'); } else { bm[k] = 1; toast('Saved for revision'); }
  store.set('bm', bm); drawQuestion();
}
function trackWrong(q, a) {
  const w = store.get('wrong', {}), k = qKey(q.tid, q.i);
  if (a === null) return;
  if (a === q.a) delete w[k]; else w[k] = 1;
  store.set('wrong', w);
}

// keyboard: ← → navigate, 1-4 / a-d answer, m mark, s save
document.addEventListener('keydown', e => {
  if (!document.body.classList.contains('in-quiz') || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'arrowright') step(1);
  else if (k === 'arrowleft') step(-1);
  else if ('1234'.includes(k) && k) choose(+k - 1);
  else if ('abcd'.includes(k) && k.length === 1) choose(k.charCodeAt(0) - 97);
  else if (k === 'm' && !S.submitted) $('#qMark').click();
  else if (k === 's') toggleBookmark();
});

function confirmSubmit() {
  const u = S.ans.filter(a => a === null).length, m = S.mk.filter(Boolean).length;
  let msg = 'Submit the test?';
  if (u) msg += `\n\n${u} question(s) unanswered.`;
  if (m) msg += `\n${m} question(s) marked for review.`;
  if (confirm(msg)) submit();
}

function submit() {
  clearInterval(timerH);
  S.submitted = true; S.filter = null;
  let c = 0, w = 0;
  S.items.forEach((q, i) => { if (S.ans[i] === null) return; S.ans[i] === q.a ? c++ : w++; trackWrong(q, S.ans[i]); });
  const score = c - w * S.neg;
  S.res = { c, w, u: S.items.length - c - w, score, pct: Math.max(0, Math.round(score / S.items.length * 100)) };
  if (S.id) {
    const p = store.get('progress', {}), o = p[S.id] || { best: 0, attempts: 0 };
    p[S.id] = { best: Math.max(o.best, S.res.pct), attempts: o.attempts + 1, last: S.res.pct, at: Date.now() };
    store.set('progress', p);
  }
  save();
  location.hash = '#/result';
}

// ================================================================= RESULT
function renderResult() {
  tpl('result');
  const r = S.res, att = r.c + r.w;
  $('#rRing').style.setProperty('--p', r.pct);
  $('#rPct').textContent = r.pct + '%';
  $('#rHead').textContent = r.pct >= 60 ? 'Excellent! 🏆' : r.pct >= 40 ? 'Good going 👍' : 'Keep practising 💪';
  $('#rScore').innerHTML = `Score <b>${+r.score.toFixed(2)}</b> / ${S.items.length}`;
  $('#rTime').textContent = `${S.title} · ${S.mode} mode · time ${fmt(S.used)}`;
  $('#rStats').innerHTML = [
    ['ok', r.c, 'Correct'], ['bad', r.w, 'Wrong'], ['', r.u, 'Skipped'],
    ['warn', '-' + +(r.w * S.neg).toFixed(2), 'Negative marks'],
    ['pri', att ? Math.round(r.c / att * 100) + '%' : '—', 'Accuracy'],
  ].map(([c, v, l]) => `<div class="stat ${c}"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#rReview').onclick = () => { S.filter = null; S.cur = 0; location.hash = '#/quiz'; };
  const wrongIdx = S.items.map((q, i) => (S.ans[i] !== null && S.ans[i] !== q.a) ? i : -1).filter(i => i >= 0);
  $('#rWrong').disabled = !wrongIdx.length;
  $('#rWrong').onclick = () => { S.filter = wrongIdx; location.hash = '#/quiz'; };
  $('#rRetry').onclick = () => location.hash = S.id ? '#/test/' + encodeURIComponent(S.id) : '#/';
}

// ---------------------------------------------------------------- protection (optional)
if (CFG.protect) {
  document.addEventListener('contextmenu', e => { if (e.target.closest('.qcard')) e.preventDefault(); });
  document.addEventListener('copy', e => { if (e.target.closest?.('.qcard') || document.body.classList.contains('in-quiz')) e.preventDefault(); });
}

route();
})();
