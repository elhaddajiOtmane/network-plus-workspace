import { CONFIG } from './config.js';

function assert(condition, message) {
  if (!condition) throw new Error(`Source validation failed: ${message}`);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateSource(source) {
  assert(source && nonempty(source.course) && Array.isArray(source.exams), 'missing course or exams');
  assert(source.exams.length === CONFIG.sourceExams, 'expected six exams');
  const questions = [];
  const ids = new Set();
  const examIds = new Set();
  for (const exam of source.exams) {
    assert(Number.isInteger(exam.exam) && exam.exam >= 1 && exam.exam <= CONFIG.sourceExams && !examIds.has(exam.exam), 'invalid or duplicate exam');
    examIds.add(exam.exam);
    assert(nonempty(exam.title) && Array.isArray(exam.questions) && exam.questions.length === CONFIG.examQuestions, `exam ${exam.exam}: expected 90 questions`);
    for (const question of exam.questions) {
      assert(question.exam === exam.exam, 'question exam mismatch');
      assert(Number.isInteger(question.number) && question.number >= 1 && question.number <= CONFIG.examQuestions, 'invalid question number');
      const id = `e${exam.exam}-q${String(question.number).padStart(3, '0')}`;
      assert(!ids.has(id), `duplicate ${id}`);
      ids.add(id);
      assert(nonempty(question.question) && nonempty(question.domain) && nonempty(question.why), `${id}: missing question, domain, or explanation`);
      assert(Array.isArray(question.choices) && question.choices.length >= 2, `${id}: missing choices`);
      const letters = new Set();
      for (const choice of question.choices) {
        assert(nonempty(choice.letter) && nonempty(choice.text) && !letters.has(choice.letter), `${id}: invalid or duplicate choice`);
        letters.add(choice.letter);
      }
      assert(Array.isArray(question.correctAnswers) && question.correctAnswers.length > 0, `${id}: missing answer key`);
      assert(new Set(question.correctAnswers).size === question.correctAnswers.length, `${id}: duplicate answer`);
      assert(question.correctAnswers.every(letter => letters.has(letter)), `${id}: unknown answer reference`);
      assert(nonempty(question.correctText), `${id}: missing correctText`);
      assert(question.whyWrong === undefined || nonempty(question.whyWrong), `${id}: invalid alternate-choice explanation`);
      questions.push(Object.freeze({ ...question, id }));
    }
  }
  assert(questions.length === CONFIG.sourceQuestions, 'expected 540 questions');
  const domains = [...new Set(questions.map(question => question.domain))].sort();
  assert(domains.length === CONFIG.sourceDomains, 'expected five domains');
  return { course: source.course, note: source.note, exams: source.exams.map(({ exam, title }) => ({ exam, title })), questions, domains, byId: new Map(questions.map(question => [question.id, question])) };
}

export async function loadSource() {
  try {
    const response = await fetch('./data/network-plus-n10-009.json', { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return validateSource(await response.json());
  } catch (error) {
    console.error('Question source could not be loaded:', error.message);
    throw new Error('Questions could not be loaded. Check your connection and reload. Run this app through the local server, not by opening the HTML file.');
  }
}
