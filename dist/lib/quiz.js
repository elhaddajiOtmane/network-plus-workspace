import { CONFIG } from './config.js';

export function isCorrect(question, selected = []) {
  return selected.length === question.correctAnswers.length &&
    new Set(selected).size === selected.length &&
    question.correctAnswers.every(letter => selected.includes(letter));
}

export function remainingSeconds(session, now = Date.now()) {
  return session.mode === 'exam' ? Math.max(0, Math.ceil((session.deadline - now) / 1000)) : null;
}

export function expired(session, now = Date.now()) {
  return Boolean(session && !session.finishedAt && session.mode === 'exam' && now >= session.deadline);
}

export function domainStats(data, attempts) {
  return data.domains.map(domain => {
    const relevant = attempts.filter(attempt => data.byId.get(attempt.qid)?.domain === domain);
    const correct = relevant.filter(attempt => isCorrect(data.byId.get(attempt.qid), attempt.answer)).length;
    return { domain, total: relevant.length, correct, accuracy: relevant.length ? Math.round(correct / relevant.length * 100) : null };
  });
}

export function filterQuestions(data, progress, { exam = 'all', domain = 'all', review = 'all' } = {}) {
  const latest = new Map(progress.attempts.map(attempt => [attempt.qid, attempt]));
  return data.questions.filter(question =>
    (exam === 'all' || question.exam === Number(exam)) &&
    (domain === 'all' || question.domain === domain) &&
    (review !== 'bookmarks' || progress.bookmarks.includes(question.id)) &&
    (review !== 'missed' || (latest.has(question.id) && !isCorrect(question, latest.get(question.id).answer)))
  );
}

export function selectQuestions(questions, size = '10', shuffle = false, random = Math.random) {
  const selected = [...questions];
  if (shuffle) {
    for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [selected[i], selected[j]] = [selected[j], selected[i]];
    }
  }
  return selected.slice(0, size === 'all' ? selected.length : Number(size));
}

export function createSession(mode, questions, now = Date.now()) {
  if (!['practice', 'exam'].includes(mode) || !questions.length) throw new Error('Choose at least one question.');
  if (mode === 'exam' && questions.length !== CONFIG.examQuestions) throw new Error('An exam must contain 90 questions.');
  return {
    id: globalThis.crypto.randomUUID(), mode, ids: questions.map(question => question.id),
    answers: {}, checked: {}, index: 0, startedAt: now,
    deadline: mode === 'exam' ? now + CONFIG.examMinutes * 60_000 : null,
    finishedAt: null,
  };
}

export function scoreSession(data, session) {
  const review = session.ids.map(qid => {
    const question = data.byId.get(qid);
    const answer = session.answers[qid] || [];
    return { qid, question, answer, correct: isCorrect(question, answer) };
  });
  const correct = review.filter(item => item.correct).length;
  const domains = data.domains.map(domain => {
    const items = review.filter(item => item.question.domain === domain);
    const count = items.filter(item => item.correct).length;
    return { domain, total: items.length, correct: count, accuracy: items.length ? Math.round(count / items.length * 100) : null };
  });
  return { correct, total: review.length, percentage: Math.round(correct / review.length * 100), review, domains };
}

export function recordCheck(progress, data, now = Date.now()) {
  const session = progress.active;
  const qid = session.ids[session.index];
  if (session.mode !== 'practice' || session.checked[qid]) return;
  session.checked[qid] = true;
  progress.attempts.push({ sessionId: session.id, qid, answer: [...(session.answers[qid] || [])], at: now, mode: session.mode });
}

export function finishSession(progress, data, now = Date.now()) {
  const session = progress.active;
  if (!session) return null;
  for (const qid of session.ids) {
    if (session.mode === 'exam' || !session.checked[qid]) {
      progress.attempts.push({ sessionId: session.id, qid, answer: [...(session.answers[qid] || [])], at: now, mode: session.mode });
      if (session.mode === 'practice') session.checked[qid] = true;
    }
  }
  session.finishedAt = now;
  progress.sessions.push(session);
  progress.active = null;
  return session;
}
