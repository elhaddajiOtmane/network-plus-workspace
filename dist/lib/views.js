import { CONFIG } from './config.js';
import { domainStats, filterQuestions, isCorrect, scoreSession } from './quiz.js';

export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const e = escapeHTML;
const button = (action, label, cls = '', extra = '') => `<button type="button" data-action="${action}" class="${cls}" ${extra}>${label}</button>`;
const date = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const NAV = [['overview', 'Overview'], ['practice', 'Practice'], ['domains', 'Domain practice'], ['exam', 'Timed exams'], ['bookmarks', 'Bookmarks'], ['missed', 'Missed questions'], ['results', 'Results'], ['progress', 'Progress & backup']];

export function renderNav(view, progress) {
  return NAV.map(([id, label]) => `<a href="#${id}" ${view === id ? 'aria-current="page"' : ''}><span>${label}</span>${id === 'bookmarks' ? `<span class="nav-count">${progress.bookmarks.length}</span>` : ''}</a>`).join('');
}

function heading(title, text, side = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${text}</p></div>${side}</div>`;
}

export function domainRows(stats) {
  return `<div class="domain-table">${stats.map(stat => `<div class="domain-row"><div><strong>${e(stat.domain)}</strong><small>${stat.total ? `${stat.correct} correct of ${stat.total} attempts` : 'No study history yet'}</small></div><meter min="0" max="100" value="${stat.accuracy ?? 0}" aria-label="${e(stat.domain)} accuracy">${stat.accuracy ?? 0}%</meter><span>${stat.accuracy === null ? 'Not studied' : `${stat.accuracy}%`}</span></div>`).join('')}</div>`;
}

export function overview(data, progress) {
  const studied = new Set(progress.attempts.map(attempt => attempt.qid)).size;
  const stats = domainStats(data, progress.attempts);
  const weak = stats.filter(stat => stat.accuracy !== null).sort((a, b) => a.accuracy - b.accuracy)[0];
  const active = progress.active;
  return heading('Make your next connection.', 'A focused space to turn networking knowledge into confidence.') +
    `<section class="start-panel"><div class="section-kicker">Your next session</div><h2>${active ? 'Pick up where you left off.' : studied ? 'Keep your knowledge moving.' : 'Start with ten questions.'}</h2><p>${active ? `${active.mode === 'exam' ? 'Timed exam' : 'Practice'} · Question ${active.index + 1} of ${active.ids.length}. Your answers and position are saved.` : 'A short practice session is a good place to begin. Check each answer, learn why, and build from there.'}</p><div class="actions">${active ? button('continue', 'Continue session', 'primary') : button('quick', 'Start a 10-question practice', 'primary')}${button('go-domains', 'Practice by domain', 'quiet')}${button('go-exam', 'Take a timed exam', 'quiet')}</div><div class="coverage"><strong>${studied}<span> / ${data.questions.length}</span></strong><span>unique questions studied</span><progress max="${data.questions.length}" value="${studied}" aria-label="Unique questions studied"></progress></div></section>` +
    `<section class="section"><div class="section-heading"><div><h2>Your domain map</h2><p>Accuracy from your checked and submitted answers.</p></div>${weak ? button('weak', `Practice ${e(weak.domain)}`, 'small', `data-domain="${e(weak.domain)}"`) : ''}</div>${domainRows(stats)}</section>` +
    `<section class="section"><div class="section-heading"><div><h2>Six exams. One clear goal.</h2><p>Each timed exam has 90 source questions and a 90-minute limit.</p></div></div><div class="exam-list">${data.exams.map(exam => `<div class="exam-row"><div><span class="exam-number">${String(exam.exam).padStart(2, '0')}</span><strong>${e(exam.title)}</strong></div><span>90 questions</span>${button('start-exam', 'Start exam', '', `data-exam="${exam.exam}"`)}</div>`).join('')}</div></section>`;
}

export function domainsView(data, progress) {
  const order = ['Networking Concepts', 'Network Implementation', 'Network Operations', 'Network Security', 'Network Troubleshooting'];
  const stats = domainStats(data, progress.attempts);
  return heading('Practice by domain.', 'Focus on one area at a time. Choose a domain for questions from all six practice exams.') +
    `<div class="domain-practice-list">${order.filter(domain => data.domains.includes(domain)).map((domain, index) => {
      const questions = filterQuestions(data, progress, { domain });
      const stat = stats.find(item => item.domain === domain);
      const studied = new Set(progress.attempts.filter(attempt => questions.some(q => q.id === attempt.qid)).map(attempt => attempt.qid)).size;
      return `<section class="domain-practice-card"><div class="section-kicker">Domain ${index + 1}</div><h2>${e(domain)}</h2><p><strong>${questions.length} questions</strong> · ${studied} studied · ${stat?.accuracy == null ? 'Not scored yet' : `${stat.accuracy}% accuracy`}</p><div class="actions">${button('start-domain', 'Start 10 questions', 'primary', `data-domain="${e(domain)}"`)}${button('weak', 'Choose quiz length', 'quiet', `data-domain="${e(domain)}"`)}</div></section>`;
    }).join('')}</div><p class="subtle">Each quick quiz shuffles questions within your chosen domain. Check answers for explanations; bookmarks and progress work just like regular practice.</p>`;
}

export function setup(data, progress, view, options) {
  const isExam = view === 'exam';
  const review = ['bookmarks', 'missed'].includes(view) ? view : 'all';
  const titles = { practice: 'Practice with purpose.', exam: 'Your exam rehearsal.', bookmarks: 'Keep the important ones close.', missed: 'Turn misses into understanding.' };
  const descriptions = { practice: 'Choose a focus. Answers and explanations appear after you check.', exam: '90 questions. 90 minutes. Feedback stays hidden until you finish.', bookmarks: 'Practice the questions you have saved for another look.', missed: 'Questions whose latest checked answer was incorrect.' };
  const matching = filterQuestions(data, progress, { ...options, review });
  return heading(titles[view], descriptions[view]) + `<section class="setup-panel"><form id="setup-form" data-mode="${isExam ? 'exam' : 'practice'}"><div class="form-grid"><label>Exam<select name="exam" id="exam-filter">${!isExam ? '<option value="all">All six exams</option>' : ''}${data.exams.map(exam => `<option value="${exam.exam}" ${String(options.exam) === String(exam.exam) ? 'selected' : ''}>${e(exam.title)}</option>`).join('')}</select></label>${!isExam ? `<label>Domain<select name="domain"><option value="all">All domains</option>${data.domains.map(domain => `<option ${options.domain === domain ? 'selected' : ''}>${e(domain)}</option>`).join('')}</select></label><label>Session length<select name="size"><option value="10" ${options.size === '10' ? 'selected' : ''}>10 questions</option><option value="20" ${options.size === '20' ? 'selected' : ''}>20 questions</option><option value="all" ${options.size === 'all' ? 'selected' : ''}>All matching questions</option></select></label>` : ''}</div><label class="check-line"><input type="checkbox" name="shuffle" ${options.shuffle ? 'checked' : ''}> Shuffle question order</label><div class="setup-summary"><strong>${isExam ? '90' : matching.length}</strong> ${isExam ? 'questions in this exam' : 'questions match your filters'}<p>${isExam ? 'You can navigate and change answers before submitting. Unanswered questions count as incorrect. Closing the page does not pause the timer.' : 'Single-answer questions use radio buttons. Multi-answer questions require the exact correct set. Unanswered questions count as incorrect when checked or submitted.'}</p></div>${isExam || matching.length ? `<button class="primary" type="submit">${isExam ? 'Start 90-minute exam' : 'Start practice'}</button>` : `<div class="empty"><h2>No matching questions yet.</h2><p>${view === 'bookmarks' ? 'Use “Bookmark” while studying to save a question here.' : view === 'missed' ? 'Missed questions appear after you check or submit an incorrect answer. Try a practice session first.' : 'Try another exam or choose all domains.'}</p>${button('reset-filters', 'Reset filters')}${button('go-practice', 'Open practice', 'quiet')}</div>`}</form></section>`;
}

function choices(question, answer, disabled, reveal) {
  const multi = question.correctAnswers.length > 1;
  return `<fieldset class="choices"><legend>${multi ? `Select ${question.correctAnswers.length} answers.` : 'Select one answer.'}</legend>${question.choices.map(choice => {
    const selected = answer.includes(choice.letter);
    const right = reveal && question.correctAnswers.includes(choice.letter);
    const wrong = reveal && selected && !right;
    return `<label class="choice ${selected ? 'selected' : ''} ${right ? 'correct-choice' : ''} ${wrong ? 'incorrect-choice' : ''}"><input type="${multi ? 'checkbox' : 'radio'}" name="answer" value="${e(choice.letter)}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="choice-letter">${e(choice.letter)}</span><span>${e(choice.text)}</span>${right ? '<strong class="choice-status">Correct answer</strong>' : wrong ? '<strong class="choice-status">Your selection</strong>' : ''}</label>`;
  }).join('')}</fieldset>`;
}

function feedback(question, answer) {
  const right = isCorrect(question, answer);
  return `<section class="feedback ${right ? 'correct' : 'incorrect'}" aria-label="Answer feedback"><h2>${right ? 'Correct.' : answer.length ? 'A connection to revisit.' : 'No answer selected.'}</h2><p><strong>Correct answer${question.correctAnswers.length > 1 ? 's' : ''}: ${e(question.correctAnswers.join(', '))}</strong></p><p>${e(question.correctText)}</p><h3>Why this answer</h3><p class="source-text">${e(question.why)}</p>${question.whyWrong ? `<h3>Why the other choices fall short</h3><p class="source-text">${e(question.whyWrong)}</p>` : ''}</section>`;
}

export function sessionView(data, progress) {
  const session = progress.active;
  const question = data.byId.get(session.ids[session.index]);
  const answer = session.answers[question.id] || [];
  const checked = session.mode === 'practice' && session.checked[question.id];
  const answered = session.ids.filter(id => session.answers[id]?.length).length;
  const bookmarked = progress.bookmarks.includes(question.id);
  return `<div class="session-heading"><div><p>${session.mode === 'exam' ? 'Timed exam' : 'Practice session'}</p><h1>Question ${session.index + 1}<span> / ${session.ids.length}</span></h1></div>${session.mode === 'exam' ? '<div class="timer"><span>Time remaining</span><strong id="timer" role="timer" aria-label="Exam time remaining">90:00</strong></div>' : `<span class="session-count">${Object.keys(session.checked).length} checked</span>`}</div><div class="study-layout"><section class="question-panel"><div class="question-meta"><span>${e(question.domain)}</span>${button('bookmark', bookmarked ? 'Bookmarked' : 'Bookmark', 'small bookmark', `aria-pressed="${bookmarked}"`)}</div><p class="source-id">Exam ${question.exam} / ${e(question.id)}</p><h2 class="question-text" id="question-title" tabindex="-1">${e(question.question)}</h2><form id="answer-form">${choices(question, answer, checked, checked)}${checked ? feedback(question, answer) : ''}<div class="question-actions"><div>${button('previous', 'Previous', '', session.index === 0 ? 'disabled' : '')}${button('next', 'Next question', '', session.index === session.ids.length - 1 ? 'disabled' : '')}</div>${session.mode === 'practice' && !checked ? '<button type="submit" class="primary">Check answer</button>' : ''}</div></form></section><aside class="session-side" aria-label="Session navigation"><h2>Your connections</h2><p>${answered} answered of ${session.ids.length}</p><div class="node-grid">${session.ids.map((qid, index) => {
    const wasChecked = session.mode === 'practice' && session.checked[qid];
    const hasAnswer = session.answers[qid]?.length > 0;
    const state = wasChecked ? 'checked' : hasAnswer ? 'answered' : 'unanswered';
    return button('jump', `${index + 1}`, `node ${state}`, `data-index="${index}" aria-label="Question ${index + 1}, ${state}" ${index === session.index ? 'aria-current="step"' : ''}`);
  }).join('')}</div><div class="node-key"><span><i class="answered"></i>Answered</span><span><i></i>Unanswered</span>${session.mode === 'practice' ? '<span><i class="checked"></i>Checked</span>' : ''}</div>${button('finish', session.mode === 'exam' ? 'Submit exam' : 'Finish practice', 'finish')}<p class="session-note">${session.mode === 'exam' ? 'Feedback unlocks after submission. The timer keeps running if you leave.' : 'Your place is saved automatically. Come back whenever you’re ready.'}</p></aside></div>`;
}

export function resultsView(data, progress, resultId) {
  const selected = progress.sessions.find(session => session.id === resultId) || progress.sessions.at(-1);
  if (!selected) return heading('Your results, in perspective.', 'Completed practice sessions and timed exams will appear here.') + `<div class="empty"><h2>Your first result is ahead.</h2><p>Complete a session to see your score, domain performance, and answer review.</p>${button('go-practice', 'Start practicing', 'primary')}</div>`;
  const result = scoreSession(data, selected);
  return heading('See what connected.', `${selected.mode === 'exam' ? 'Timed exam' : 'Practice session'} finished ${e(date(selected.finishedAt))}`) +
    `<section class="result-summary"><div class="score"><strong>${result.percentage}%</strong><span>${result.correct} correct out of ${result.total}</span></div><div><h2>A clearer picture of your knowledge.</h2><p>Exact-match scoring. Unanswered questions count as incorrect.</p><p>These are practice results, not an official certification score.</p>${button('go-missed', 'Review missed questions')}</div></section>` +
    `<section class="section"><h2>Domain performance</h2>${domainRows(result.domains)}</section><section class="section"><div class="section-heading"><h2>Answer review</h2><span>${result.total} questions</span></div>${result.review.map((item, index) => `<details class="review-item"><summary><span class="result-mark ${item.correct ? 'right' : 'wrong'}">${item.correct ? 'Correct' : 'Incorrect'}</span><span>${index + 1}. ${e(item.question.question)}</span></summary><div class="review-content"><p class="source-id">${e(item.qid)} · ${e(item.question.domain)}</p><p><strong>Your answer:</strong> ${e(item.answer.join(', ') || 'Unanswered')}</p>${choices(item.question, item.answer, true, true)}${feedback(item.question, item.answer)}${button('bookmark-result', progress.bookmarks.includes(item.qid) ? 'Bookmarked' : 'Bookmark question', '', `data-qid="${e(item.qid)}" aria-pressed="${progress.bookmarks.includes(item.qid)}"`)}</div></details>`).join('')}</section><section class="section"><h2>Session history</h2><div class="history-list">${[...progress.sessions].reverse().map(session => {
      const score = scoreSession(data, session);
      return button('view-result', `<span>${session.mode === 'exam' ? 'Timed exam' : 'Practice'} · ${e(date(session.finishedAt))}</span><strong>${score.correct}/${score.total} · ${score.percentage}%</strong>`, 'history-item', `data-id="${e(session.id)}"`);
    }).join('')}</div></section>`;
}

export function progressView(data, progress) {
  return heading('Your progress belongs to you.', 'Keep a backup, or move your study history to another browser.') + `<section class="backup-panel"><h2>Saved in this browser</h2><p>${progress.attempts.length} checked answers · ${progress.sessions.length} completed sessions · ${progress.bookmarks.length} bookmarks</p><p>Local and hosted versions save progress separately. Export here and import there to transfer your history, bookmarks, and unfinished session.</p><div class="actions">${button('export', 'Export progress as JSON', 'primary')}</div><hr><h2>Restore a backup</h2><p>Importing replaces this browser’s study progress, including any unfinished session. Export your current progress first if you want to keep it. Invalid files leave your progress unchanged.</p><label class="file-label">Progress JSON file<input type="file" id="import-file" accept="application/json,.json"></label><p class="subtle">Maximum 5 MB. Timed exams keep their original deadline after import.</p></section>`;
}
