/** MC answer normalization + scoring helpers. Tested in parity.test.ts — keep in sync with web. */
import type { Question } from './types';

export function normalizeMcText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isMcAnswerCorrect(chosenText: string, correctAnswer: string): boolean {
  return normalizeMcText(chosenText) === normalizeMcText(correctAnswer);
}

export function sanitizeMcQuestion(q: Question): Question {
  if (!q.options || q.options.length !== 4) return q;
  const correct = q.correct_answer ?? q.options[0];
  const normalizedCorrect = normalizeMcText(correct);
  const unique = new Set<string>();
  const options = q.options.map((opt, i) => {
    let text = opt.trim();
    const norm = normalizeMcText(text);
    if (unique.has(norm) && i > 0) {
      text = `${text} (${String.fromCharCode(65 + i)})`;
    }
    unique.add(normalizeMcText(text));
    return text;
  }) as [string, string, string, string];

  let correctIndex = options.findIndex((o) => normalizeMcText(o) === normalizedCorrect);
  if (correctIndex < 0) correctIndex = 0;

  return {
    ...q,
    options,
    correct_answer: options[correctIndex],
  };
}

export function getMcOptionText(question: Question, index: number): string | null {
  if (!question.options || index < 0 || index > 3) return null;
  return question.options[index] ?? null;
}
