import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'streamquiz-question-history:';
const MAX = 24;

function key(topic: string): string {
  return `${PREFIX}${topic.trim().toLowerCase()}`;
}

export async function getPreviousQuestions(topic: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(key(topic));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addQuestionsToHistory(topic: string, questions: string[]): Promise<void> {
  const existing = await getPreviousQuestions(topic);
  const merged = [...existing, ...questions.map((q) => q.trim()).filter(Boolean)];
  const unique: string[] = [];
  for (const q of merged) {
    if (!unique.includes(q)) unique.push(q);
  }
  const trimmed = unique.slice(-MAX);
  await AsyncStorage.setItem(key(topic), JSON.stringify(trimmed));
}

export function mergePreviousQuestions(
  existing: string[],
  newQuestions: { question: string }[],
): string[] {
  const texts = newQuestions.map((q) => q.question.trim()).filter(Boolean);
  const merged = [...existing, ...texts];
  const unique: string[] = [];
  for (const q of merged) {
    if (!unique.includes(q)) unique.push(q);
  }
  return unique.slice(-MAX);
}
