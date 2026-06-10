export const MAX_PLAYERS = 6;

export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameMode = 'think' | 'classic';
export type GameStatus = 'waiting' | 'ready' | 'playing' | 'ended';
export type GamePhase =
  | 'waiting'
  | 'thinking'
  | 'question'
  | 'answering'
  | 'checking'
  | 'result'
  | 'ended'
  | 'buzzing'
  | 'judging';

export type PlayerRole = 'host' | 'player';
export type Locale = 'en' | 'ru';

export interface Question {
  question: string;
  options?: [string, string, string, string];
  correct_answer?: string;
  accepted_answers?: string[];
}

export interface Player {
  id: string;
  game_id: string;
  client_id: string;
  name: string;
  role: PlayerRole;
  slot: number;
  score: number;
  mc_index: number | null;
  transcript: string | null;
  correct: boolean | null;
  done: boolean | null;
  rematch: boolean | null;
}

export interface Game {
  id: string;
  topic: string;
  difficulty: Difficulty;
  num_questions: number;
  mc_mode: boolean;
  cameras_enabled: boolean;
  game_mode: GameMode;
  questions: Question[];
  status: GameStatus;
  current_question_index: number;
  phase: GamePhase;
  phase_deadline: string | null;
  answer_correct: boolean | null;
  last_points: number | null;
}

export type WebRTCSignalType = 'offer' | 'answer' | 'ice-candidate';

export interface WebRTCSignal {
  type: WebRTCSignalType;
  from: string;
  to: string;
  payload: unknown;
}

export interface CreateGamePayload {
  topic: string;
  difficulty: Difficulty;
  num_questions: number;
  mc_mode: boolean;
  game_mode: GameMode;
  cameras_enabled: boolean;
  locale: Locale;
  previous_questions?: string[];
}
