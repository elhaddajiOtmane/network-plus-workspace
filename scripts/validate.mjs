import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateSource } from '../dist/lib/data.js';
const bytes = readFileSync(new URL('../dist/data/network-plus-n10-009.json', import.meta.url));
const data = validateSource(JSON.parse(bytes));
const report = {
  questions: data.questions.length, exams: data.exams.length, domains: data.domains,
  multiAnswerQuestions: data.questions.filter(question => question.correctAnswers.length > 1).map(({ id, correctAnswers }) => ({ id, correctAnswers })),
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  uniqueIds: data.byId.size, invalidAnswerReferences: 0,
};
writeFileSync(new URL('../evidence/source-validation.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
