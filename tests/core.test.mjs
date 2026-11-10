import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSource } from '../dist/lib/data.js';
import { CONFIG } from '../dist/lib/config.js';
import { createSession, domainStats, expired, filterQuestions, finishSession, isCorrect, recordCheck, remainingSeconds, scoreSession, selectQuestions } from '../dist/lib/quiz.js';
import { freshProgress, parseImport, readProgress, validateProgress, writeProgress } from '../dist/lib/persistence.js';
import { escapeHTML, sessionView } from '../dist/lib/views.js';

const raw = JSON.parse(readFileSync(new URL('../dist/data/network-plus-n10-009.json', import.meta.url)));
const data = validateSource(raw);
const copy = value => structuredClone(value);

test('all 540 source records retain wording, choices, answers and stable unique IDs', () => {
  assert.equal(data.questions.length, 540);
  assert.equal(data.byId.size, 540);
  assert.equal(data.exams.length, 6);
  assert.equal(data.domains.length, 5);
  for (const exam of raw.exams) {
    assert.equal(exam.questions.length, 90);
    for (const source of exam.questions) {
      const id = `e${source.exam}-q${String(source.number).padStart(3, '0')}`;
      const { id: actual, ...question } = data.byId.get(id);
      assert.equal(actual, id);
      assert.deepEqual(question, source);
      assert.ok(source.correctAnswers.every(letter => source.choices.some(choice => choice.letter === letter)));
    }
  }
  assert.deepEqual(data.questions.filter(q => q.correctAnswers.length > 1).map(q => q.id), ['e4-q072', 'e6-q078']);
});

test('source validator rejects duplicate IDs, bad references, and malformed multi-answer keys', () => {
  const mutations = [
    value => { value.exams[0].questions[1].number = 1; },
    value => { value.exams[0].questions[0].correctAnswers = ['Z']; },
    value => { value.exams[3].questions[71].correctAnswers = ['D', 'D']; },
    value => { value.exams[0].questions[0].choices[1].letter = 'A'; },
    value => { value.exams[0].questions[0].exam = 2; },
    value => { value.exams.pop(); },
    value => { value.exams[0].questions[0].why = ''; },
  ];
  for (const mutate of mutations) { const input = copy(raw); mutate(input); assert.throws(() => validateSource(input)); }
});

test('single-answer scoring and all source answer keys are exact', () => {
  for (const question of data.questions) {
    assert.equal(isCorrect(question, question.correctAnswers), true);
    assert.equal(isCorrect(question, []), false);
    assert.equal(isCorrect(question, ['Z']), false);
  }
});

test('multi-answer requires exact unordered set without duplicate or partial credit', () => {
  for (const question of data.questions.filter(q => q.correctAnswers.length > 1)) {
    assert.equal(isCorrect(question, [...question.correctAnswers].reverse()), true);
    assert.equal(isCorrect(question, question.correctAnswers.slice(0, 1)), false);
    assert.equal(isCorrect(question, [...question.correctAnswers, question.choices.find(c => !question.correctAnswers.includes(c.letter)).letter]), false);
    assert.equal(isCorrect(question, [question.correctAnswers[0], question.correctAnswers[0]]), false);
  }
});

test('exam/domain filters, bookmarks, and latest-attempt missed review', () => {
  const progress = freshProgress();
  const q = data.questions[0];
  progress.bookmarks = [q.id];
  assert.equal(filterQuestions(data, progress, { exam: 1 }).length, 90);
  assert.ok(filterQuestions(data, progress, { domain: q.domain }).every(item => item.domain === q.domain));
  assert.deepEqual(filterQuestions(data, progress, { review: 'bookmarks' }).map(q => q.id), [q.id]);
  assert.equal(filterQuestions(data, progress, { review: 'missed' }).length, 0);
  progress.attempts.push({ qid: q.id, answer: [] });
  assert.equal(filterQuestions(data, progress, { review: 'missed' }).length, 1);
  progress.attempts.push({ qid: q.id, answer: q.correctAnswers });
  assert.equal(filterQuestions(data, progress, { review: 'missed' }).length, 0);
  assert.equal(filterQuestions(data, progress, { exam: 6, review: 'bookmarks' }).length, 0);
});

test('10/20/all session sizes, undersized filters and shuffle preserve IDs', () => {
  assert.equal(selectQuestions(data.questions, '10').length, 10);
  assert.equal(selectQuestions(data.questions, '20').length, 20);
  assert.equal(selectQuestions(data.questions, 'all').length, 540);
  assert.equal(selectQuestions(data.questions.slice(0, 2), '20').length, 2);
  const shuffled = selectQuestions(data.questions, 'all', true, () => 0.25);
  assert.deepEqual(new Set(shuffled.map(q => q.id)), new Set(data.questions.map(q => q.id)));
  assert.notDeepEqual(shuffled.map(q => q.id), data.questions.map(q => q.id));
  assert.equal(data.questions[0].id, 'e1-q001');
});

test('domain accuracy distinguishes not studied from 0% and uses real history', () => {
  assert.ok(domainStats(data, [])[0].accuracy === null);
  const q = data.questions[0];
  const stat = domainStats(data, [{ qid: q.id, answer: [] }]).find(s => s.domain === q.domain);
  assert.equal(stat.accuracy, 0);
  assert.equal(stat.total, 1);
});

test('absolute deadline and answers/position survive export, storage read and expiry', () => {
  const now = 1_800_000_000_000;
  const progress = freshProgress();
  progress.active = createSession('exam', data.questions.slice(0, 90), now);
  progress.active.index = 7;
  progress.active.answers[data.questions[0].id] = ['B'];
  const text = JSON.stringify(progress);
  const loaded = readProgress({ getItem: () => text }, data).progress;
  assert.deepEqual(loaded, progress);
  assert.equal(remainingSeconds(loaded.active, now), 5400);
  assert.equal(remainingSeconds(loaded.active, now + 60_000), 5340);
  assert.equal(expired(loaded.active, now + 5_400_000), true);
  assert.equal(remainingSeconds(loaded.active, now + 9_000_000), 0);
  const result = finishSession(loaded, data, now + 5_400_000);
  assert.equal(loaded.active, null);
  assert.equal(loaded.attempts.length, 90);
  assert.equal(scoreSession(data, result).correct, 1);
  assert.equal(finishSession(loaded, data), null);
});

test('practice checking records once, submission counts unanswered and does not duplicate checks', () => {
  const progress = freshProgress();
  progress.active = createSession('practice', data.questions.slice(0, 10));
  progress.active.answers[data.questions[0].id] = data.questions[0].correctAnswers;
  recordCheck(progress, data);
  recordCheck(progress, data);
  assert.equal(progress.attempts.length, 1);
  const finished = finishSession(progress, data);
  assert.equal(progress.attempts.length, 10);
  assert.equal(scoreSession(data, finished).correct, 1);
  assert.equal(scoreSession(data, finished).percentage, 10);
  assert.deepEqual(validateProgress(progress, data), progress);
});

test('export/import round trip includes active session, completed results, history and bookmarks', () => {
  const progress = freshProgress();
  progress.bookmarks = ['e1-q001', 'e4-q072'];
  progress.active = createSession('practice', data.questions.slice(0, 10));
  recordCheck(progress, data);
  finishSession(progress, data);
  progress.active = createSession('exam', data.questions.slice(90, 180));
  assert.deepEqual(parseImport(JSON.stringify(progress), data), progress);
  const imported = parseImport(JSON.stringify(progress), data);
  imported.bookmarks.pop();
  assert.equal(progress.bookmarks.length, 2);
});

test('malformed imports preserve existing progress: JSON, version, IDs, answers, timer, checked, duplicate sessions', () => {
  const existing = freshProgress();
  existing.active = createSession('exam', data.questions.slice(0, 90));
  const before = JSON.stringify(existing);
  assert.throws(() => parseImport('{', data));
  assert.throws(() => parseImport('x'.repeat(CONFIG.maxImportBytes + 1), data));
  for (const mutate of [
    p => { p.version = 2; }, p => { p.bookmarks = ['<script>']; },
    p => { p.active.ids[0] = 'unknown'; }, p => { p.active.index = -1; },
    p => { p.active.answers['e1-q001'] = ['Z']; }, p => { p.active.deadline += 60_000; },
    p => { p.active.checked['e1-q001'] = true; }, p => { p.active.ids[1] = p.active.ids[0]; },
    p => { p.active.finishedAt = 5; }, p => { p.bookmarks = ['e1-q001', 'e1-q001']; },
    p => { Object.defineProperty(p.active.answers, '__proto__', { value: ['A'], enumerable: true }); },
    p => { const session = copy(p.active); session.finishedAt = session.startedAt + 1; p.sessions = [session]; },
  ]) {
    const candidate = JSON.parse(before);
    mutate(candidate);
    assert.throws(() => parseImport(JSON.stringify(candidate), data));
    assert.equal(JSON.stringify(existing), before);
  }
});

test('blocked or malformed browser storage returns explicit warning without overwriting', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.match(readProgress(blocked, data).warning, /preserved/);
  assert.match(writeProgress(blocked, freshProgress()), /only in this tab/);
  let writes = 0;
  const malformed = { getItem() { return '{}'; }, setItem() { writes++; } };
  assert.match(readProgress(malformed, data).warning, /preserved/);
  assert.equal(writes, 0);
});

test('rendering hides practice answer key until check and always hides it during exams', () => {
  const progress = freshProgress();
  progress.active = createSession('practice', data.questions.slice(0, 10));
  assert.ok(!sessionView(data, progress).includes('Why this answer'));
  recordCheck(progress, data);
  assert.ok(sessionView(data, progress).includes('Why this answer'));
  progress.active = createSession('exam', data.questions.slice(0, 90));
  assert.ok(!sessionView(data, progress).includes('Why this answer'));
  assert.ok(!sessionView(data, progress).includes('Correct answer'));
});

test('source text is escaped before HTML insertion', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">&\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
});

test('alternate-choice explanations remain hidden until practice check', () => {
  const q = data.questions.find(question => question.whyWrong);
  const progress = freshProgress();
  progress.active = createSession('practice', [q]);
  assert.ok(!sessionView(data, progress).includes(escapeHTML(q.whyWrong)));
  recordCheck(progress, data);
  assert.ok(sessionView(data, progress).includes(escapeHTML(q.whyWrong)));
});
