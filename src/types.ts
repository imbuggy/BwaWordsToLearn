
export type GradeLevel = 'Reception' | 'Year 1';
export type AppMode = 'Read' | 'Write';

export interface WordData {
  word: string;
  level: GradeLevel;
  category: string;
  readScore: number;
  writeScore: number;
  lastSeen?: number;
}

export interface AppState {
  words: WordData[];
  currentWordIndex: number | null;
  gradeFilter: GradeLevel;
  mode: AppMode;
  showScoreboard: boolean;
}
