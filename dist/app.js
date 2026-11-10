import { CONFIG } from './lib/config.js';
import { loadSource } from './lib/data.js';
import { createSession, domainStats, expired, filterQuestions, finishSession, recordCheck, remainingSeconds, selectQuestions } from './lib/quiz.js';
import { parseImport, readProgress, writeProgress } from './lib/persistence.js';
import { NAV, domainsView, escapeHTML, overview, progressView, renderNav, resultsView, sessionView, setup } from './lib/views.js';

const main = document.querySelector('#main');
const warning = document.querySelector('#storage-warning');
const message = document.querySelector('#message');
const dialog = document.querySelector('#confirm-dialog');
let data;
let progress;
let storage;
let preserveUnreadableStorage = false;
let view = 'overview';
let resultId;
let options = defaults();

function defaults() { return { exam: 'all', domain: 'all', size: '10', shuffle: false }; }

function notice(text, isError = false) {
  message.textContent = text;
  message.hidden = !text;
  message.className = `notice ${isError ? 'error' : ''}`;
}

function storageWarning(text) {
  warning.textContent = text;
  warning.hidden = !text;
}

function save() {
  if (!preserveUnreadableStorage) storageWarning(writeProgress(storage, progress));
}

function render(focus = false) {
  document.querySelector('#nav').innerHTML = renderNav(view, progress);
  if (view === 'session' && progress.active) main.innerHTML = sessionView(data, progress);
  else if (view === 'domains') main.innerHTML = domainsView(data, progress);
  else if (view === 'overview') main.innerHTML = overview(data, progress);
  else if (view === 'results') main.innerHTML = resultsView(data, progress, resultId);
  else if (view === 'progress') main.innerHTML = progressView(data, progress);
  else main.innerHTML = setup(data, progress, view, options);
  updateTimer();
  if (focus) (document.querySelector('#question-title') || main).focus({ preventScroll: true });
}

function navigate(next, reset = true, focus = true) {
  if (next === 'session' && !progress.active) next = 'overview';
  view = next;
  if (reset) options = { ...defaults(), exam: next === 'exam' ? '1' : 'all' };
  history.replaceState(null, '', `#${next}`);
  notice('');
  render(focus);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function confirmAction(title, description, label) {
  if (dialog.open) return Promise.resolve(false);
  document.querySelector('#confirm-title').textContent = title;
  document.querySelector('#confirm-description').textContent = description;
  document.querySelector('#confirm-action').textContent = label;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}

function submitSession(automatic = false) {
  const finished = finishSession(progress, data);
  if (!finished) return;
  resultId = finished.id;
  save();
  navigate('results');
  if (automatic) notice('Time is up. Your exam was submitted automatically, including unanswered questions.');
}

function checkExpiry() {
  if (!expired(progress?.active)) return false;
  if (dialog.open) { dialog.returnValue = 'cancel'; dialog.close(); }
  submitSession(true);
  return true;
}

function updateTimer() {
  const timer = document.querySelector('#timer');
  if (!timer || !progress?.active) return;
  const seconds = remainingSeconds(progress.active);
  timer.textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  timer.classList.toggle('time-low', seconds <= 300);
}

async function start(mode, questions) {
  if (!questions.length) { notice('No matching questions. Try different filters.', true); return; }
  if (progress.active) {
    const replace = await confirmAction('Replace your unfinished session?', 'Starting a new session replaces your current answers and position. Already checked practice answers stay in your study history.', 'Replace session');
    if (!replace || checkExpiry()) return;
  }
  progress.active = createSession(mode, questions);
  save();
  navigate('session');
}

function toggleBookmark(qid) {
  progress.bookmarks = progress.bookmarks.includes(qid) ? progress.bookmarks.filter(id => id !== qid) : [...progress.bookmarks, qid];
  save();
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `network-plus-progress-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Progress exported. Keep the JSON file to restore or transfer your study history.');
}

async function importProgress(file) {
  if (!file) return;
  try {
    if (file.size > CONFIG.maxImportBytes) throw new Error('Progress file is too large (maximum 5 MB). Your current progress has not changed.');
    const imported = parseImport(await file.text(), data);
    const replace = await confirmAction('Replace this browser’s progress?', 'The validated backup will replace your history, bookmarks, and unfinished session. Its original exam deadline will still apply.', 'Import backup');
    if (!replace) return;
    progress = imported;
    preserveUnreadableStorage = false;
    save();
    if (checkExpiry()) return;
    navigate(progress.active ? 'session' : 'overview');
    notice('Progress imported. Your study history is ready.');
  } catch (error) { notice(error.message || 'The file could not be read. Your current progress has not changed.', true); }
  finally { const input = document.querySelector('#import-file'); if (input) input.value = ''; }
}

document.addEventListener('click', async event => {
  const control = event.target.closest('[data-action]');
  if (!control || !data || control.disabled) return;
  const action = control.dataset.action;
  if (checkExpiry()) return;
  if (action.startsWith('go-')) { navigate(action.slice(3)); return; }
  if (action === 'continue') navigate('session');
  else if (action === 'quick') await start('practice', selectQuestions(data.questions, '10'));
  else if (action === 'start-domain') await start('practice', selectQuestions(filterQuestions(data, progress, { domain: control.dataset.domain }), '10', true));
  else if (action === 'weak') {
    navigate('practice');
    options.domain = control.dataset.domain || domainStats(data, progress.attempts).filter(stat => stat.accuracy !== null).sort((a, b) => a.accuracy - b.accuracy)[0]?.domain || 'all';
    render(true);
  } else if (action === 'start-exam') await start('exam', filterQuestions(data, progress, { exam: control.dataset.exam }));
  else if (action === 'bookmark' || action === 'bookmark-result') {
    const qid = action === 'bookmark' ? progress.active.ids[progress.active.index] : control.dataset.qid;
    toggleBookmark(qid);
    const marked = progress.bookmarks.includes(qid);
    control.setAttribute('aria-pressed', String(marked));
    control.textContent = marked ? 'Bookmarked' : action === 'bookmark' ? 'Bookmark' : 'Bookmark question';
    document.querySelector('#nav').innerHTML = renderNav(view, progress);
  } else if (['previous', 'next', 'jump'].includes(action) && progress.active) {
    const session = progress.active;
    session.index = action === 'jump' ? Number(control.dataset.index) : session.index + (action === 'next' ? 1 : -1);
    session.index = Math.max(0, Math.min(session.ids.length - 1, session.index));
    save();
    render(true);
  } else if (action === 'finish' && progress.active) {
    const session = progress.active;
    const unanswered = session.ids.filter(id => !session.answers[id]?.length).length;
    if (session.mode === 'exam' || unanswered || Object.keys(session.checked).length < session.ids.length) {
      const approved = await confirmAction('Submit this session?', `${unanswered} unanswered question${unanswered === 1 ? '' : 's'} will count as incorrect. You cannot change answers after submission.`, session.mode === 'exam' ? 'Submit exam' : 'Finish practice');
      if (!approved || checkExpiry()) return;
    }
    submitSession();
  } else if (action === 'view-result') { resultId = control.dataset.id; navigate('results'); }
  else if (action === 'reset-filters') { options = defaults(); render(true); }
  else if (action === 'export') exportProgress();
});

document.addEventListener('submit', async event => {
  if (!['setup-form', 'answer-form'].includes(event.target.id) || !data) return;
  event.preventDefault();
  if (checkExpiry()) return;
  if (event.target.id === 'setup-form') {
    const mode = event.target.dataset.mode;
    const values = new FormData(event.target);
    const matching = filterQuestions(data, progress, { exam: values.get('exam'), domain: values.get('domain') || 'all', review: ['bookmarks', 'missed'].includes(view) ? view : 'all' });
    await start(mode, selectQuestions(matching, mode === 'exam' ? 'all' : values.get('size'), values.has('shuffle')));
  } else if (progress.active?.mode === 'practice') {
    recordCheck(progress, data);
    save();
    render();
    const feedback = document.querySelector('.feedback');
    feedback?.setAttribute('tabindex', '-1');
    feedback?.focus({ preventScroll: true });
  }
});

document.addEventListener('change', event => {
  if (!data) return;
  if (event.target.id === 'import-file') { importProgress(event.target.files[0]); return; }
  if (checkExpiry()) return;
  if (event.target.closest('#setup-form')) {
    const name = event.target.name;
    const form = new FormData(event.target.form);
    options = { exam: form.get('exam'), domain: form.get('domain') || 'all', size: form.get('size') || 'all', shuffle: form.has('shuffle') };
    render();
    document.querySelector(`#setup-form [name="${name}"]`)?.focus();
  } else if (event.target.name === 'answer' && progress.active) {
    const session = progress.active;
    const qid = session.ids[session.index];
    if (session.checked[qid]) return;
    session.answers[qid] = [...document.querySelectorAll('[name="answer"]:checked')].map(input => input.value);
    save();
    // Update navigation without replacing the focused native input.
    const node = document.querySelector(`.node[data-index="${session.index}"]`);
    const answered = session.answers[qid].length > 0;
    node.classList.toggle('answered', answered);
    node.classList.toggle('unanswered', !answered);
    node.setAttribute('aria-label', `Question ${session.index + 1}, ${answered ? 'answered' : 'unanswered'}`);
    document.querySelector('.session-side > p').textContent = `${session.ids.filter(id => session.answers[id]?.length).length} answered of ${session.ids.length}`;
  }
});

window.addEventListener('hashchange', () => {
  if (!data) return;
  if (checkExpiry()) return;
  const next = location.hash.slice(1);
  navigate(NAV.some(([id]) => id === next) || next === 'session' ? next : 'overview');
});
document.addEventListener('visibilitychange', () => { if (data) { checkExpiry(); updateTimer(); } });
setInterval(() => { if (data) { checkExpiry(); updateTimer(); } }, 1000);

try {
  data = await loadSource();
  try { storage = localStorage; }
  catch { storage = { getItem() { throw new Error('Storage access denied'); }, setItem() { throw new Error('Storage access denied'); } }; }
  const loaded = readProgress(storage, data);
  progress = loaded.progress;
  preserveUnreadableStorage = Boolean(loaded.warning);
  storageWarning(loaded.warning);
  if (!preserveUnreadableStorage) save(); // Probe actual write access before the first answer.
  if (!checkExpiry()) {
    const requested = location.hash.slice(1);
    navigate(progress.active ? 'session' : NAV.some(([id]) => id === requested) ? requested : 'overview', true, false);
  }
} catch (error) {
  main.innerHTML = `<div class="empty"><h1>Let’s reconnect.</h1><p>${escapeHTML(error.message)}</p><a href="" class="button primary">Reload workspace</a></div>`;
}
