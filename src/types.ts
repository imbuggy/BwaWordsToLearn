
export type GradeLevel = 'Reception' | 'Year 1';
export type AppMode = 'Read';
export type AppSection = 'Words' | 'Maths';

export interface WordData {
  word: string;
  level: GradeLevel;
  category: string;
  readScore: number;
  writeScore: number;
  lastSeen?: number;
}

export interface BondData {
  avgTime: number;
  recentTimes: number[];
}

export interface NumberBondStats {
  target: number;
  correct: number;
  total: number;
  bestStreak: number;
  bonds: Record<string, BondData>;
}

export interface AppState {
  words: WordData[];
  currentWordIndex: number | null;
  gradeFilter: GradeLevel;
  mode: AppMode;
  showScoreboard: boolean;
}
