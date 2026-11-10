import { CONFIG } from './config.js';

export function freshProgress() {
  return { version: CONFIG.version, bookmarks: [], attempts: [], sessions: [], active: null };
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000;
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);

export function validateProgress(value, data) {
  const fail = () => { throw new Error('Invalid progress file. Your current progress has not changed.'); };
  if (!object(value) || value.version !== CONFIG.version || !Array.isArray(value.bookmarks) || !Array.isArray(value.attempts) || !Array.isArray(value.sessions)) fail();
  if (value.bookmarks.length > CONFIG.sourceQuestions || value.attempts.length > 100_000 || value.sessions.length > 10_000) fail();
  if (new Set(value.bookmarks).size !== value.bookmarks.length || value.bookmarks.some(qid => !data.byId.has(qid))) fail();
  const answerValid = (qid, answer) => Array.isArray(answer) && answer.length <= data.byId.get(qid).choices.length && new Set(answer).size === answer.length && answer.every(letter => data.byId.get(qid).choices.some(choice => choice.letter === letter));
  const sessionValid = (session, finished) => {
    if (!object(session) || !identifier(session.id) || !['practice', 'exam'].includes(session.mode) || !Array.isArray(session.ids) || !session.ids.length || session.ids.length > CONFIG.sourceQuestions) return false;
    if (new Set(session.ids).size !== session.ids.length || session.ids.some(qid => !data.byId.has(qid))) return false;
    if (session.mode === 'exam' && (session.ids.length !== CONFIG.examQuestions || new Set(session.ids.map(qid => data.byId.get(qid).exam)).size !== 1)) return false;
    if (!Number.isInteger(session.index) || session.index < 0 || session.index >= session.ids.length || !timestamp(session.startedAt)) return false;
    if (session.mode === 'exam' ? session.deadline !== session.startedAt + CONFIG.examMinutes * 60_000 : session.deadline !== null) return false;
    if (finished ? !timestamp(session.finishedAt) || session.finishedAt < session.startedAt : session.finishedAt !== null) return false;
    if (!object(session.answers) || !object(session.checked)) return false;
    if (!Object.entries(session.answers).every(([qid, answer]) => session.ids.includes(qid) && answerValid(qid, answer))) return false;
    if (!Object.entries(session.checked).every(([qid, checked]) => session.ids.includes(qid) && checked === true)) return false;
    if (session.mode === 'exam' && Object.keys(session.checked).length) return false;
    return true;
  };
  if (!value.sessions.every(session => sessionValid(session, true))) fail();
  if (value.active !== null && !sessionValid(value.active, false)) fail();
  const sessionIds = value.sessions.map(session => session.id).concat(value.active ? [value.active.id] : []);
  if (new Set(sessionIds).size !== sessionIds.length) fail();
  const attemptKeys = new Set();
  for (const attempt of value.attempts) {
    if (!object(attempt) || !identifier(attempt.sessionId) || !data.byId.has(attempt.qid) || !timestamp(attempt.at) || !['practice', 'exam'].includes(attempt.mode) || !answerValid(attempt.qid, attempt.answer)) fail();
    const key = `${attempt.sessionId}:${attempt.qid}`;
    if (attemptKeys.has(key)) fail();
    attemptKeys.add(key);
  }
  // Copy only known fields: imported object prototypes and extra properties never enter application state.
  const cleanSession = session => ({
    id: session.id, mode: session.mode, ids: [...session.ids],
    answers: Object.fromEntries(Object.entries(session.answers).map(([qid, answer]) => [qid, [...answer]])),
    checked: { ...session.checked }, index: session.index, startedAt: session.startedAt,
    deadline: session.deadline, finishedAt: session.finishedAt,
  });
  return {
    version: CONFIG.version, bookmarks: [...value.bookmarks],
    attempts: value.attempts.map(({ sessionId, qid, answer, at, mode }) => ({ sessionId, qid, answer: [...answer], at, mode })),
    sessions: value.sessions.map(cleanSession), active: value.active ? cleanSession(value.active) : null,
  };
}

export function parseImport(text, data) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > CONFIG.maxImportBytes) throw new Error('Progress file is too large (maximum 5 MB). Your current progress has not changed.');
  try { return validateProgress(JSON.parse(text), data); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('This file is not valid JSON. Your current progress has not changed.');
    throw error;
  }
}

export function readProgress(storage, data) {
  try {
    const text = storage.getItem(CONFIG.storageKey);
    return { progress: text ? parseImport(text, data) : freshProgress(), warning: '' };
  } catch (error) {
    console.error('Saved progress could not be read:', error.message);
    return { progress: freshProgress(), warning: 'Saved progress could not be read. Existing browser data has been preserved. Export any new work before leaving; import a valid backup to recover.' };
  }
}

export function writeProgress(storage, progress) {
  try {
    storage.setItem(CONFIG.storageKey, JSON.stringify(progress));
    return '';
  } catch (error) {
    console.error('Progress could not be saved:', error.message);
    return 'Browser storage is unavailable or full. Your work is only in this tab. Export your progress before closing it.';
  }
}
