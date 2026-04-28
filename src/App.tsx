/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  CheckCircle2, 
  XCircle, 
  Trophy, 
  Settings, 
  ChevronRight, 
  RotateCcw,
  BookOpen,
  GraduationCap,
  RefreshCw,
  Copy,
  Check,
  Download,
  Upload,
  FileText,
  Menu,
  X,
  Info,
  Trash2,
  MessageSquare,
  Calculator,
  Plus,
  Star,
  TrendingUp,
  TrendingDown,
  PartyPopper
} from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { INITIAL_WORDS } from './constants';
import { WordData, GradeLevel, AppMode, AppSection, NumberBondStats } from './types';

const playSuccessSound = () => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
  oscillator.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.1); // C6

  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.3);
  setTimeout(() => audioCtx.close(), 500);
};

const playWrongSound = () => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
  oscillator.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.2); // A2

  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.3);
  setTimeout(() => audioCtx.close(), 500);
};

function NumberBonds({ stats, onUpdateStats, onAnswer, grade, forcedTarget }: { 
  stats: NumberBondStats[], 
  onUpdateStats: (stats: NumberBondStats[]) => void,
  onAnswer: (isCorrect: boolean, bondKey: string, oldTime: number | undefined, newTime: number) => void,
  grade: GradeLevel,
  forcedTarget: 10 | 20
}) {
  const [target, setTarget] = useState<10 | 20>(forcedTarget);
  
  useEffect(() => {
    setTarget(forcedTarget);
  }, [forcedTarget]);

  useEffect(() => {
    if (grade === 'Reception') {
      setTarget(10);
    }
  }, [grade]);
  const [question, setQuestion] = useState<{ a: number, b: number } | null>(null);
  const [prevQuestionKey, setPrevQuestionKey] = useState<string | null>(null);
  const [options, setOptions] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const startTime = useRef<number>(Date.now());

  const generateQuestion = useCallback(() => {
    let a, b, key;
    do {
      a = Math.floor(Math.random() * (target + 1));
      b = target - a;
      key = `${Math.min(a, b)}+${Math.max(a, b)}`;
    } while (key === prevQuestionKey && target <= 20); // Avoid same numeric pair twice

    setQuestion({ a, b });
    setPrevQuestionKey(key);
    
    // Generate options
    const correct = b;
    const others = new Set<number>();
    while (others.size < 3) {
      const rand = Math.floor(Math.random() * (target + 1));
      if (rand !== correct) others.add(rand);
    }
    setOptions([correct, ...Array.from(others)].sort((x, y) => x - y));
    setFeedback(null);
    setSelectedAnswer(null);
    startTime.current = Date.now();
  }, [target]);

  useEffect(() => {
    generateQuestion();
  }, [generateQuestion]);

  const handleAnswer = (ans: number) => {
    if (feedback) return;
    
    setSelectedAnswer(ans);
    const timeTaken = Date.now() - startTime.current;
    const isCorrect = ans === question?.b;
    setFeedback(isCorrect ? 'correct' : 'wrong');
    
    const newStats = [...stats];
    const sIdx = newStats.findIndex(s => s.target === target);
    
    if (sIdx !== -1) {
      const s = { ...newStats[sIdx] };
      s.bonds = { ...s.bonds };
      s.total += 1;
      
      const updateBond = (a: number, b: number, time: number, penalty: boolean) => {
        const key = `${Math.min(a, b)}+${Math.max(a, b)}`;
        const existing = s.bonds[key] || { avgTime: 0, recentTimes: [] };
        const oldAvg = existing.avgTime || undefined;
        const pTime = Math.min(10000, penalty ? time + 5000 : time); // Cap at 10s
        
        const newRecent = [...(existing.recentTimes || [])];
        newRecent.push(pTime);
        if (newRecent.length > 5) newRecent.shift();
        
        existing.recentTimes = newRecent;
        existing.avgTime = newRecent.reduce((acc, t) => acc + t, 0) / newRecent.length;
        
        s.bonds[key] = existing;
        onAnswer(isCorrect, key, oldAvg, existing.avgTime);
      };

      if (isCorrect) {
        playSuccessSound();
        setStreak(curr => curr + 1);
        s.correct += 1;
        s.bestStreak = Math.max(s.bestStreak, streak + 1);
        updateBond(question!.a, question!.b, timeTaken, false);
      } else {
        playWrongSound();
        setStreak(0);
        // Penalty for current bond
        updateBond(question!.a, question!.b, timeTaken, true);
        // Penalty for incorrectly guessed bond
        const guessedA = target - ans;
        updateBond(guessedA, ans, timeTaken, true);
      }
      
      newStats[sIdx] = s;
      onUpdateStats(newStats);
    }

    setTimeout(() => {
      generateQuestion();
    }, isCorrect ? 800 : 1000);
  };

  return (
    <div className="flex flex-col items-center gap-6 py-4 md:py-8">
      {/* Target Selector */}
      {grade !== 'Reception' && (
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200 gap-1">
          {[10, 20].map((t) => (
            <button
              key={t}
              onClick={() => {
                setTarget(t as 10 | 20);
                setStreak(0);
              }}
              className={`px-4 md:px-6 py-2 rounded-xl text-xs md:text-sm font-bold transition-all ${
                target === t 
                  ? 'bg-bwa-blue text-white shadow-lg scale-105' 
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Bonds to {t}
            </button>
          ))}
        </div>
      )}

      {/* Question Card */}
      <motion.div 
        key={`${target}-${question?.a}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 md:p-12 rounded-[2.5rem] md:rounded-[3rem] shadow-xl border border-slate-100 flex flex-col items-center gap-6 md:gap-8 w-full max-w-md relative overflow-hidden"
      >
        <div className="text-4xl md:text-6xl font-black text-slate-800 flex items-center gap-3 md:gap-4">
          <span>{question?.a}</span>
          <Plus className="w-6 h-6 md:w-10 md:h-10 text-slate-300" />
          <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-2xl border-4 border-dashed border-slate-200 flex items-center justify-center text-bwa-blue">
            ?
          </div>
          <span className="text-slate-300">=</span>
          <span>{target}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:gap-4 w-full">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              className={`py-4 md:py-6 rounded-2xl md:rounded-3xl text-2xl md:text-3xl font-bold transition-all border-2 ${
                feedback === 'correct' && opt === question?.b
                  ? 'bg-emerald-500 border-emerald-600 text-white scale-105 shadow-lg'
                  : feedback === 'wrong' && opt === question?.b
                  ? 'bg-emerald-500 border-emerald-600 text-white scale-105 shadow-lg'
                  : feedback === 'wrong' && opt === selectedAnswer
                  ? 'bg-red-500 border-red-600 text-white opacity-50'
                  : 'bg-white border-slate-100 text-slate-700 hover:border-bwa-blue hover:text-bwa-blue hover:shadow-md active:scale-95'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {/* Streak Counter */}
        <div className="absolute top-4 right-6 flex items-center gap-1">
          <Trophy className={`w-4 h-4 ${streak > 0 ? 'text-amber-500' : 'text-slate-200'}`} />
          <span className="text-sm font-black text-slate-400">{streak}</span>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 w-full max-w-md">
        {stats.map((s) => (
          <div key={s.target} className="bg-white p-3 md:p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center">
            <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Bonds to {s.target}</span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg md:text-xl font-black text-slate-700">{s.correct}</span>
              <span className="text-xs text-slate-300">/ {s.total}</span>
            </div>
            <div className="mt-1 md:mt-2 text-[8px] md:text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">
              Best Streak: {s.bestStreak}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [words, setWords] = useState<WordData[]>(() => {
    const saved = localStorage.getItem('word-spark-data');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old data if needed
      return parsed.map((w: any) => {
        let currentWord = w.word;
        if (currentWord === 'eye(s)') currentWord = 'eye';
        
        const initialWord = INITIAL_WORDS.find(iw => iw.word === currentWord && iw.level === w.level);
        return {
          ...w,
          word: currentWord,
          // Force update category from INITIAL_WORDS to pick up re-categorization
          category: initialWord?.category ?? w.category ?? 'General',
          readScore: w.readScore ?? w.score ?? 0,
          writeScore: w.writeScore ?? 0
        };
      });
    }
    return INITIAL_WORDS;
  });
  
  const [gradeFilter, setGradeFilter] = useState<GradeLevel>(() => {
    const saved = localStorage.getItem('word-spark-grade');
    return (saved as GradeLevel) || 'Reception';
  });
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [mode, setMode] = useState<AppMode>('Read');
  const [section, setSection] = useState<AppSection>(() => {
    const saved = localStorage.getItem('word-spark-section');
    return (saved as AppSection) || 'Words';
  });
  const [numberBondStats, setNumberBondStats] = useState<NumberBondStats[]>(() => {
    const saved = localStorage.getItem('word-spark-maths');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((s: any) => ({
        ...s,
        bonds: s.bonds || {}
      }));
    }
    return [
      { target: 10, correct: 0, total: 0, bestStreak: 0, bonds: {} },
      { target: 20, correct: 0, total: 0, bestStreak: 0, bonds: {} }
    ];
  });
  const [bondTarget, setBondTarget] = useState<10 | 20>(10);
  const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);
  const [lastWordIndex, setLastWordIndex] = useState<number | null>(null);
  const [lastWordId, setLastWordId] = useState<string | null>(null);
  const [reviewQueue, setReviewQueue] = useState<{ index: number; reappearIn: number }[]>([]);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [pdfLevel, setPdfLevel] = useState<GradeLevel>('Reception');
  const [selectedPdfCategories, setSelectedPdfCategories] = useState<string[]>([]);
  const [syncInput, setSyncInput] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionAchievements, setSessionAchievements] = useState<{
    masteredWords: string[];
    improvedBonds: { key: string; oldTime: number; newTime: number }[];
    worsenedBonds: { key: string; oldTime: number; newTime: number }[];
  }>({ masteredWords: [], improvedBonds: [], worsenedBonds: [] });

  // Save to local storage whenever words or grade change
  useEffect(() => {
    localStorage.setItem('word-spark-data', JSON.stringify(words));
  }, [words]);

  useEffect(() => {
    localStorage.setItem('word-spark-grade', gradeFilter);
  }, [gradeFilter]);

  useEffect(() => {
    localStorage.setItem('word-spark-section', section);
  }, [section]);

  useEffect(() => {
    localStorage.setItem('word-spark-maths', JSON.stringify(numberBondStats));
  }, [numberBondStats]);

  const filteredWords = useMemo(() => {
    return words.filter(w => {
      const matchesGrade = w.level === gradeFilter;
      const matchesCategory = categoryFilter === 'All' || w.category === categoryFilter;
      return matchesGrade && matchesCategory;
    });
  }, [words, gradeFilter, categoryFilter]);

  const categories = useMemo(() => {
    const allCats = words.filter(w => w.level === gradeFilter).map(w => w.category);
    return ['All', ...Array.from(new Set(allCats))];
  }, [words, gradeFilter]);

  const pickNextWord = useCallback(() => {
    if (filteredWords.length === 0) return;

    let nextIndex: number | null = null;

    // 1. Check review queue first (immediate mistakes)
    const readyForReview = reviewQueue.find(item => item.reappearIn <= 0);
    if (readyForReview) {
      nextIndex = readyForReview.index;
      setReviewQueue(prev => prev.filter(item => item.index !== nextIndex));
    } else {
      // 2. Decrement review queue timers
      setReviewQueue(prev => prev.map(item => ({ ...item, reappearIn: item.reappearIn - 1 })));

      // 3. Learning Algorithm: Working Window of ~10 words
      const workingWindowSize = 10;
      
      // Get all words in current filter with their scores
      const wordsWithScores = filteredWords.map(w => ({
        word: w,
        score: mode === 'Read' ? w.readScore : w.writeScore,
        originalIndex: words.findIndex(ow => ow.word === w.word && ow.level === w.level)
      }));

      // Selection Strategy: Ensure variety
      const masteredWords = wordsWithScores.filter(w => w.score >= 5);
      const inProgressWords = wordsWithScores.filter(w => w.score > 0 && w.score < 5);
      const unstartedWords = wordsWithScores.filter(w => w.score === 0);

      // Construct the working window
      let workingWindow = [...inProgressWords];
      if (workingWindow.length < workingWindowSize) {
        const needed = workingWindowSize - workingWindow.length;
        workingWindow = [...workingWindow, ...unstartedWords.slice(0, needed)];
      }

      // If window too small, add mastered
      if (workingWindow.length < 2 && masteredWords.length > 0) {
        workingWindow = [...workingWindow, ...masteredWords.slice(0, 5)];
      }

      // 10% chance: Review a mastered word
      const shouldReviewMastered = Math.random() < 0.1 && masteredWords.length > 0;
      
      let pool = shouldReviewMastered ? masteredWords : workingWindow;
      
      // Fallbacks
      if (pool.length === 0) {
        pool = workingWindow.length > 0 ? workingWindow : masteredWords;
      }

      // Prevent duplicate word in a row - IMPORTANT FIX
      const filteredPool = pool.filter(p => words[p.originalIndex].word !== lastWordId);
      const selectionSource = filteredPool.length > 0 ? filteredPool : pool;

      // Weighted selection within the source
      const weights = selectionSource.map(p => 1 / (p.score + 1));
      const totalWeight = weights.reduce((acc, w) => acc + w, 0);
      let random = Math.random() * totalWeight;
      
      let selected = selectionSource[0];
      for (let i = 0; i < selectionSource.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          selected = selectionSource[i];
          break;
        }
      }
      
      nextIndex = selected.originalIndex;
    }

    if (nextIndex !== null) {
      setLastWordId(words[nextIndex].word);
      setCurrentWordIndex(nextIndex);
      setFeedback(null);
    }
  }, [filteredWords, words, mode, lastWordId, reviewQueue]);

  // Initial word pick
  useEffect(() => {
    if (currentWordIndex === null && filteredWords.length > 0) {
      pickNextWord();
    }
  }, [currentWordIndex, filteredWords, pickNextWord]);

  const handleAnswer = (correct: boolean) => {
    if (currentWordIndex === null || feedback !== null || !sessionActive) return; // Guard against double-clicks and inactive sessions

    setFeedback(correct ? 'correct' : 'wrong');

    // Update score immediately
    setWords(prev => {
      const newWords = [...prev];
      const word = { ...newWords[currentWordIndex] };
      const oldScore = mode === 'Read' ? word.readScore : word.writeScore;
      
      if (mode === 'Read') {
        word.readScore = correct ? word.readScore + 1 : Math.max(0, word.readScore - 1);
      } else {
        word.writeScore = correct ? word.writeScore + 1 : Math.max(0, word.writeScore - 1);
      }
      
      const newScore = mode === 'Read' ? word.readScore : word.writeScore;
      
      // Success celebration!
      if (correct && newScore === 5 && oldScore < 5) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#3b82f6', '#f59e0b']
        });
        playSuccessSound();
      } else if (correct) {
        // Smaller "ding" for regular correct answers
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
        setTimeout(() => audioCtx.close(), 200);
      }

    word.lastSeen = Date.now();
    newWords[currentWordIndex] = word;

    if (correct && newScore === 5 && oldScore < 5) {
      setSessionAchievements(prev => ({
        ...prev,
        masteredWords: [...prev.masteredWords, word.word]
      }));
    }

    setSessionCount(prev => prev + 1);
    return newWords;
  });

    // Add to review queue if wrong
    if (!correct) {
      const reappearIn = Math.floor(Math.random() * 4) + 2; // 2 to 5
      setReviewQueue(prev => [...prev, { index: currentWordIndex, reappearIn }]);
    }

    setTimeout(() => {
      pickNextWord();
    }, 600);
  };

  const resetProgress = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    setWords(INITIAL_WORDS);
    setNumberBondStats([
      { target: 10, correct: 0, total: 0, bestStreak: 0, bonds: {} },
      { target: 20, correct: 0, total: 0, bestStreak: 0, bonds: {} }
    ]);
    localStorage.removeItem('word-spark-data');
    localStorage.removeItem('word-spark-maths');
    setCurrentWordIndex(null);
    setShowResetConfirm(false);
    setShowScoreboard(false);
  };

  const exportProgress = () => {
    const data = {
      w: words
        .filter(w => w.readScore > 0 || w.writeScore > 0)
        .map(w => ({ w: w.word, l: w.level, r: w.readScore, wr: w.writeScore })),
      m: numberBondStats
    };
    return btoa(JSON.stringify(data));
  };

  const handleImport = () => {
    try {
      const data = JSON.parse(atob(syncInput.trim()));
      
      // Handle legacy format (array of words) or new format (object with w and m)
      const wordData = Array.isArray(data) ? data : data.w;
      const mathsData = !Array.isArray(data) ? data.m : null;

      if (wordData) {
        setWords(prev => {
          const newWords = [...prev];
          wordData.forEach((item: any) => {
            const idx = newWords.findIndex(w => w.word === item.w && w.level === item.l);
            if (idx !== -1) {
              newWords[idx] = {
                ...newWords[idx],
                readScore: item.r || 0,
                writeScore: item.wr || 0
              };
            }
          });
          return newWords;
        });
      }

      if (mathsData) {
        setNumberBondStats(mathsData);
      }

      setSyncStatus('success');
      setTimeout(() => {
        setShowSyncModal(false);
        setSyncStatus('idle');
        setSyncInput('');
      }, 1500);
    } catch (e) {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 2000);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSyncStatus('success');
    setTimeout(() => setSyncStatus('idle'), 2000);
  };

  const toggleMastery = (wordToToggle: string) => {
    setWords(prev => prev.map(w => {
      if (w.word === wordToToggle && w.level === gradeFilter) {
        const currentScore = mode === 'Read' ? w.readScore : w.writeScore;
        const newScore = currentScore >= 5 ? 0 : 5;
        return mode === 'Read' 
          ? { ...w, readScore: newScore } 
          : { ...w, writeScore: newScore };
      }
      return w;
    }));
  };

  const handleMathsAnswer = (isCorrect: boolean, key: string, oldTime: number | undefined, newTime: number) => {
    if (!sessionActive || sessionCount >= 20) return;

    if (oldTime !== undefined) {
      if (newTime < oldTime - 100) { // Significant improvement
        setSessionAchievements(prev => ({
          ...prev,
          improvedBonds: [...prev.improvedBonds.filter(b => b.key !== key), { key, oldTime, newTime }]
        }));
      } else if (newTime > oldTime + 100) { // Significant worsening
        setSessionAchievements(prev => ({
          ...prev,
          worsenedBonds: [...prev.worsenedBonds.filter(b => b.key !== key), { key, oldTime, newTime }]
        }));
      }
    }
    setSessionCount(prev => prev + 1);
  };

  useEffect(() => {
    if (sessionCount >= 20) {
      setSessionActive(false);
      setShowSessionSummary(true);
      confetti({
        particleCount: 200,
        spread: 90,
        origin: { y: 0.6 }
      });
    }
  }, [sessionCount]);

  const startNewSession = () => {
    setSessionCount(0);
    setSessionActive(true);
    setShowSessionSummary(false);
    setSessionAchievements({ masteredWords: [], improvedBonds: [], worsenedBonds: [] });
    if (section === 'Words') pickNextWord();
  };

  const currentWord = currentWordIndex !== null ? words[currentWordIndex] : null;

  // Mastery stats
  const stats = useMemo(() => {
    const total = filteredWords.length;
    const mastered = filteredWords.filter(w => (mode === 'Read' ? w.readScore : w.writeScore) >= 5).length;
    const learning = filteredWords.filter(w => {
      const score = mode === 'Read' ? w.readScore : w.writeScore;
      return score > 0 && score < 5;
    }).length;
    const unstarted = filteredWords.filter(w => (mode === 'Read' ? w.readScore : w.writeScore) === 0).length;
    
    // Granular progress: sum of scores (capped at 5 per word) / (total * 5)
    const totalPossibleScore = total * 5;
    const currentTotalScore = filteredWords.reduce((acc, w) => {
      const score = mode === 'Read' ? w.readScore : w.writeScore;
      return acc + Math.min(5, score);
    }, 0);
    const granularProgress = totalPossibleScore > 0 ? (currentTotalScore / totalPossibleScore) * 100 : 0;

    return { total, mastered, learning, unstarted, granularProgress };
  }, [filteredWords, mode]);

  const generatePDF = () => {
    const doc = new jsPDF();
    const title = `BWA Writing Practice - ${pdfLevel}`;
    
    // Helper to render text with custom font to an image
    const renderTextToImage = (text: string): { dataUrl: string, width: number, height: number } => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return { dataUrl: '', width: 0, height: 0 };
      
      const fontSize = 100;
      ctx.font = `bold ${fontSize}px "Comic Neue", sans-serif`;
      const metrics = ctx.measureText(text);
      
      const canvasWidth = metrics.width + 40;
      const canvasHeight = fontSize * 1.4;
      
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      
      ctx.font = `bold ${fontSize}px "Comic Neue", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1e293b';
      ctx.fillText(text, 20, canvas.height / 2);
      
      return { 
        dataUrl: canvas.toDataURL('image/png'),
        width: canvasWidth,
        height: canvasHeight
      };
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(title, 14, 22);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30);
    
    const wordsToInclude = words.filter(w => 
      w.level === pdfLevel && 
      (selectedPdfCategories.length === 0 || selectedPdfCategories.includes(w.category))
    );

    // We leave the first column empty in the data and draw it as an image in didDrawCell
    const tableData = wordsToInclude.map(() => ['', '', '', '']);
    
    autoTable(doc, {
      startY: 40,
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 12, cellPadding: 6, minCellHeight: 20, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 55, fillColor: [248, 250, 252] },
        1: { cellWidth: 43 },
        2: { cellWidth: 43 },
        3: { cellWidth: 43 }
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 0) {
          const word = wordsToInclude[data.row.index].word;
          const { dataUrl, width: imgWidth, height: imgHeight } = renderTextToImage(word);
          
          if (dataUrl && imgHeight > 0) {
            const { x, y, width, height } = data.cell;
            
            // We use a fixed height and scale width to maintain aspect ratio
            const targetHeight = 10;
            const scale = targetHeight / imgHeight;
            const targetWidth = imgWidth * scale;
            
            // Center the image in the cell
            const offsetX = (width - targetWidth) / 2;
            const offsetY = (height - targetHeight) / 2;
            
            // Ensure coordinates are valid numbers
            if (!isNaN(x + offsetX) && !isNaN(y + offsetY) && !isNaN(targetWidth) && !isNaN(targetHeight)) {
              doc.addImage(dataUrl, 'PNG', x + offsetX, y + offsetY, targetWidth, targetHeight);
            }
          }
        }

        // Draw a writing line in the empty practice columns
        if (data.section === 'body' && data.column.index > 0) {
          const { x, y, width, height } = data.cell;
          doc.setDrawColor(200);
          doc.setLineWidth(0.1);
          // Draw line 5mm from the bottom of the cell
          doc.line(x + 2, y + height - 6, x + width - 2, y + height - 6);
        }
      }
    });

    doc.save(`BWA_Worksheet_${pdfLevel}.pdf`);
    setShowPdfModal(false);
  };

  const pdfCategories = useMemo(() => {
    const allCats = words.filter(w => w.level === pdfLevel).map(w => w.category);
    return Array.from(new Set(allCats));
  }, [words, pdfLevel]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900 selection:bg-bwa-blue/20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2 md:gap-4">
          <div className="bg-bwa-blue p-1.5 rounded-xl shadow-sm">
            <img src="icon.svg" alt="BWA Logo" className="w-6 h-6 md:w-7 md:h-7" referrerPolicy="no-referrer" />
          </div>
          <h1 className="text-base md:text-xl font-bold tracking-tight text-slate-800 whitespace-nowrap">Words to Learn</h1>
        </div>

        {/* Integrated Grade Switcher - Now replacing the Section Switcher location */}
        <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
          {(['Reception', 'Year 1'] as GradeLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => {
                setGradeFilter(level);
                setCurrentWordIndex(null);
                setSessionActive(false);
                setSessionCount(0);
              }}
              className={`px-3 md:px-6 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                gradeFilter === level 
                  ? 'bg-white text-bwa-blue shadow-sm scale-105' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {level === 'Reception' ? 'Rec' : 'Y1'}
              <span className="hidden sm:inline ml-0.5">{level === 'Reception' ? 'eption' : 'ear 1'}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-2">
            <button 
              onClick={() => setShowScoreboard(!showScoreboard)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${showScoreboard ? 'bg-bwa-blue/10 text-bwa-blue' : 'hover:bg-slate-100 text-slate-500'}`}
            >
              <Trophy className="w-5 h-5" />
              <span className="text-sm font-bold">Progress</span>
            </button>
            <button 
              onClick={() => setShowPdfModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <FileText className="w-5 h-5" />
              <span className="text-sm font-bold">Worksheet</span>
            </button>
            <button 
              onClick={() => setShowAboutModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <Info className="w-5 h-5" />
              <span className="text-sm font-bold">About</span>
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
          >
            {showMobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {showMobileMenu && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileMenu(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-64 bg-white z-50 shadow-2xl md:hidden p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="font-bold text-slate-400 uppercase text-xs tracking-widest">Menu</span>
                <button onClick={() => setShowMobileMenu(false)} className="text-slate-400"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-2 pb-4 border-b border-slate-100">
                <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400 ml-1">Grade Level</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['Reception', 'Year 1'] as GradeLevel[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => {
                        setGradeFilter(level);
                        setShowMobileMenu(false);
                        setSessionActive(false);
                      }}
                      className={`py-2 px-3 rounded-xl text-[10px] font-black transition-all border-2 ${
                        gradeFilter === level 
                          ? 'bg-bwa-blue text-white border-bwa-blue shadow-md' 
                          : 'bg-slate-50 text-slate-500 border-slate-50'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              
              <button 
                onClick={() => { setShowScoreboard(true); setShowMobileMenu(false); }}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-bold transition-colors"
              >
                <Trophy className="w-5 h-5 text-amber-500" /> Progress
              </button>
              <button 
                onClick={() => { setShowPdfModal(true); setShowMobileMenu(false); }}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-bold transition-colors"
              >
                <FileText className="w-5 h-5 text-bwa-blue" /> Worksheet
              </button>
              <button 
                onClick={() => { setShowAboutModal(true); setShowMobileMenu(false); }}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-bold transition-colors"
              >
                <Info className="w-5 h-5 text-blue-500" /> About
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col w-full max-w-4xl mx-auto px-4 py-4 md:px-6 md:py-8">
        {showScoreboard ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden"
          >
            {/* Dashboard Header */}
            <div className="bg-slate-50 border-b border-slate-200 p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Trophy className="text-amber-500" /> Progress Dashboard
                </h2>
                <button 
                  onClick={() => setShowScoreboard(false)}
                  className="text-bwa-blue font-bold hover:underline flex items-center gap-1"
                >
                  <XCircle className="w-5 h-5" /> Close
                </button>
              </div>

              {/* Tab Switcher */}
              <div className="flex p-1 bg-slate-200/50 rounded-2xl gap-1">
                {(['Read', 'Maths'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      if (tab === 'Maths') {
                        setSection('Maths');
                      } else {
                        setSection('Words');
                        // setMode(tab); // removed
                      }
                      setSessionActive(false); // Switch reset
                      setSessionCount(0);
                    }}
                    className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${
                      (tab === 'Maths' && section === 'Maths') || (tab === 'Read' && section === 'Words')
                        ? 'bg-white text-bwa-blue shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 md:p-8">
              {section === 'Words' ? (
                <div className="space-y-8">
                  {/* Word Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                      <div className="text-emerald-600 text-sm font-bold uppercase tracking-wider mb-1">Mastered</div>
                      <div className="text-4xl font-black text-emerald-700">{stats.mastered}</div>
                      <div className="text-emerald-600/60 text-xs mt-1">Words with 5+ correct</div>
                    </div>
                    <div className="bg-bwa-blue/5 p-6 rounded-2xl border border-bwa-blue/10">
                      <div className="text-bwa-blue text-sm font-bold uppercase tracking-wider mb-1">Learning</div>
                      <div className="text-4xl font-black text-bwa-blue">{stats.learning}</div>
                      <div className="text-bwa-blue/60 text-xs mt-1">Words in progress</div>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <div className="text-slate-600 text-sm font-bold uppercase tracking-wider mb-1">New</div>
                      <div className="text-4xl font-black text-slate-700">{stats.unstarted}</div>
                      <div className="text-slate-600/60 text-xs mt-1">Not yet seen</div>
                    </div>
                  </div>

                  {/* Word List */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <GraduationCap className="w-5 h-5" /> {mode} Word List
                      </h3>
                      <p className="text-[10px] text-slate-400 italic">Click a word to toggle mastery</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {filteredWords.sort((a, b) => {
                        const scoreA = mode === 'Read' ? a.readScore : a.writeScore;
                        const scoreB = mode === 'Read' ? b.readScore : b.writeScore;
                        return scoreB - scoreA;
                      }).map((w) => {
                        const score = mode === 'Read' ? w.readScore : w.writeScore;
                        return (
                          <button 
                            key={w.word}
                            onClick={() => toggleMastery(w.word)}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition-all hover:scale-105 active:scale-95 ${
                              score >= 5 ? 'bg-emerald-100 border-emerald-200 text-emerald-700 hover:bg-emerald-200' :
                              score > 0 ? 'bg-bwa-blue/10 border-bwa-blue/20 text-bwa-blue hover:bg-bwa-blue/20' :
                              'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                            }`}
                            title={score >= 5 ? "Click to mark as unmastered" : "Click to mark as mastered"}
                          >
                            {w.word}
                            <span className="ml-2 opacity-50 text-[10px]">{score}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-10">
                  {/* Maths Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {numberBondStats.map((s) => (
                      <div key={s.target} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Bonds to {s.target}</div>
                          <div className="text-3xl font-black text-slate-700">{s.correct} <span className="text-slate-300 font-normal text-lg">/ {s.total}</span></div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Best Streak</div>
                          <div className="text-3xl font-black text-amber-500">{s.bestStreak}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bond Combination Tables */}
                  <div className="space-y-12">
                    {numberBondStats.map((s) => {
                      const combinations = [];
                      for (let i = 0; i <= s.target / 2; i++) {
                        combinations.push({ a: i, b: s.target - i });
                      }

                      return (
                        <div key={`table-${s.target}`} className="space-y-4">
                          <h4 className="font-black text-slate-400 uppercase tracking-widest text-sm flex items-center gap-2">
                            <Calculator className="w-4 h-4" /> Bonds to {s.target} Combinations
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {combinations.map(({ a, b }) => {
                              const key = `${a}+${b}`;
                              const data = s.bonds[key];
                              const avgTime = data?.avgTime;
                              
                              // Color logic: Under 5s is green, Star if < 2s
                              // 1s (dark green) -> 10s (red)
                              let bgColor = 'bg-slate-50';
                              let textColor = 'text-slate-400';
                              let borderColor = 'border-slate-200';
                              let showStar = false;

                              if (avgTime !== undefined) {
                                textColor = 'text-white';
                                if (avgTime < 2000) showStar = true;
                                
                                if (avgTime >= 10000) {
                                  bgColor = 'bg-red-600';
                                  borderColor = 'border-red-700';
                                } else if (avgTime < 5000) {
                                  // Green range
                                  if (avgTime <= 2000) {
                                    bgColor = 'bg-emerald-700';
                                    borderColor = 'border-emerald-800';
                                  } else {
                                    bgColor = 'bg-emerald-500';
                                    borderColor = 'border-emerald-600';
                                  }
                                } else {
                                  // Amber to Red range (5s to 10s)
                                  const ratio = (avgTime - 5000) / 5000; // 0 to 1
                                  if (ratio < 0.33) bgColor = 'bg-amber-500';
                                  else if (ratio < 0.66) bgColor = 'bg-orange-500';
                                  else bgColor = 'bg-red-500';
                                  borderColor = 'border-black/5';
                                }
                              }

                              return (
                                <div 
                                  key={key} 
                                  className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center transition-all shadow-sm relative ${bgColor} ${borderColor} ${textColor}`}
                                >
                                  {showStar && (
                                    <Star className="w-3 h-3 absolute top-1 right-1 text-amber-300 fill-amber-300" />
                                  )}
                                  <span className="text-lg font-black">{a} + {b}</span>
                                  <span className="text-[10px] font-bold opacity-80 uppercase tracking-tighter">
                                    {avgTime === undefined ? 'Not Seen' : avgTime >= 10000 ? '>10s' : `${(avgTime / 1000).toFixed(1)}s`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dashboard Footer */}
              <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col items-center gap-6">
                <div className="flex flex-wrap justify-center gap-3">
                  <button 
                    onClick={() => setShowSyncModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-bwa-blue/5 text-bwa-blue rounded-xl font-bold hover:bg-bwa-blue/10 transition-all border border-bwa-blue/10"
                  >
                    <RefreshCw className="w-5 h-5" /> Sync Progress
                  </button>
                  <button 
                    onClick={resetProgress}
                    className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all border border-red-100"
                  >
                    <Trash2 className="w-5 h-5" /> Reset Progress
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                  Word Spark Learning System v1.2
                </p>
              </div>
            </div>
          </motion.div>
        ) : !sessionActive ? (
          <div className="flex-1 flex flex-col items-center justify-center py-4 px-2 sm:px-4 text-center w-full max-w-xl mx-auto min-h-0">
            {/* Unified Session Setup */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-4 sm:p-5 md:p-6 shadow-2xl border border-white w-full space-y-4 md:space-y-5 flex flex-col max-h-full overflow-y-auto">
              <div className="flex items-center gap-4 border-b border-slate-100 pb-4 shrink-0">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                  section === 'Maths' ? 'bg-amber-100 text-amber-600' : 'bg-bwa-blue/10 text-bwa-blue'
                }`}>
                  {section === 'Maths' ? <Calculator className="w-6 h-6" /> : <BookOpen className="w-6 h-6" />}
                </div>
                <div className="text-left">
                  <h2 className="text-xl font-black text-slate-800 leading-tight mb-0.5">Session Setup</h2>
                  <p className="text-slate-500 font-medium text-xs">Configure your practice</p>
                </div>
              </div>

              {/* Session Controls */}
              <div className="grid grid-cols-1 gap-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Practice Subject</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Words', 'Maths'] as AppSection[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setSection(s);
                          setSessionCount(0);
                        }}
                        className={`py-2.5 rounded-xl font-bold flex flex-row items-center justify-center gap-2 border-2 transition-all ${
                          section === s 
                            ? 'bg-slate-800 text-white border-slate-800 shadow-sm scale-[1.02]' 
                            : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        {s === 'Maths' ? <Calculator className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                        <span className="text-sm">{s}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {section === 'Maths' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Calculation Type</label>
                      <button className="w-full py-2.5 rounded-xl font-bold flex items-center gap-2 px-4 bg-amber-50 text-amber-700 border-2 border-amber-200 shadow-sm scale-[1.01]">
                        <CheckCircle2 className="w-4 h-4" /> Number Bonds
                      </button>
                    </div>
                    
                    {gradeFilter !== 'Reception' && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Number</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[10, 20].map((t) => (
                            <button
                              key={t}
                              onClick={() => setBondTarget(t as 10 | 20)}
                              className={`py-2 rounded-xl font-bold border-2 transition-all ${
                                bondTarget === t 
                                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm scale-[1.01]' 
                                  : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'
                              }`}
                            >
                              Bonds to {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {section === 'Words' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Word Category</label>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-24 overflow-y-auto pr-1 no-scrollbar">
                        {categories.map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setCategoryFilter(cat)}
                            className={`py-1 px-2 rounded-lg text-[10px] font-bold border transition-all text-left truncate ${
                              categoryFilter === cat 
                                ? 'bg-bwa-blue/10 text-bwa-blue border-bwa-blue/20' 
                                : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 mt-auto">
                <div className="flex items-center justify-between gap-2 py-2 px-2 pl-4 bg-slate-50 rounded-2xl border border-slate-100 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-white rounded-lg shadow-sm">
                      <GraduationCap className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="text-left leading-tight hidden sm:block">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Current Plan</p>
                      <p className="font-bold text-sm text-slate-700">{gradeFilter} &bull; {section}</p>
                    </div>
                  </div>
                  <button
                    onClick={startNewSession}
                    className="py-2.5 px-6 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[1.25rem] font-black text-sm transition-all shadow-md shadow-emerald-100 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1.5 shrink-0 w-full sm:w-auto"
                  >
                    Start Session <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : section === 'Maths' ? (
          <>
            {/* Session Progress */}
            <div className="w-full max-w-md mb-6 flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-bwa-blue animate-pulse" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Session Progress
                </span>
              </div>
              <span className="text-[10px] font-black text-bwa-blue bg-bwa-blue/5 px-2 py-1 rounded-lg">
                {sessionCount} / 20
              </span>
            </div>

            <NumberBonds 
              stats={numberBondStats} 
              onUpdateStats={setNumberBondStats} 
              onAnswer={handleMathsAnswer}
              grade={gradeFilter}
              forcedTarget={bondTarget}
            />
          </>
        ) : (
          <>
            {/* Session Progress */}
            <div className="w-full max-w-md mb-6 flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-bwa-blue animate-pulse" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Session Progress
                </span>
              </div>
              <span className="text-[10px] font-black text-bwa-blue bg-bwa-blue/5 px-2 py-1 rounded-lg">
                {sessionCount} / 20
              </span>
            </div>

            {/* Category Selector */}
            {categories.length > 2 && (
              <div className="flex justify-center mb-6 overflow-x-auto pb-1 no-scrollbar w-full">
                <div className="bg-white/50 p-1 rounded-xl shadow-sm border border-slate-200 flex gap-1 whitespace-nowrap">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setCategoryFilter(cat);
                        setCurrentWordIndex(null);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all duration-200 ${
                        categoryFilter === cat 
                          ? 'bg-bwa-blue text-white shadow-sm' 
                          : 'text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

        {/* About Modal */}
        <AnimatePresence>
          {showAboutModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                      <Info className="w-6 h-6 text-blue-600" />
                      About Words to Learn
                    </h2>
                    <button 
                      onClick={() => setShowAboutModal(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <XCircle className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="space-y-6 text-slate-600">
                    <p>
                      This app was created by a parent to help children practice their school words and maths essentials in a fun, interactive way. 
                      It follows the curriculum used by Belleville Wix Academy for Reception and Year 1.
                    </p>
                    
                    <div className="flex flex-col gap-3">
                      <a 
                        href="https://github.com/imbuggy/BwaWordsToLearn" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all"
                      >
                        <RefreshCw className="w-4 h-4" /> View Source on GitHub
                      </a>
                      <a 
                        href="https://github.com/imbuggy/BwaWordsToLearn/issues" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-all"
                      >
                        <MessageSquare className="w-4 h-4" /> Report an Issue or Feedback
                      </a>
                      <a 
                        href="https://imbuggy.github.io/BwaWordsToLearn/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-bwa-blue text-white rounded-xl font-bold hover:bg-bwa-blue/90 transition-all"
                      >
                        <BookOpen className="w-4 h-4" /> Open Live App
                      </a>
                      <div className="flex items-center justify-between mt-2 px-1">
                        <p className="text-xs text-slate-400 font-medium">Version 1.1.0</p>
                        <p className="text-xs text-slate-400">© 2026 • All Rights Reserved</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Reset Confirmation Modal */}
        <AnimatePresence>
          {showResetConfirm && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden border-4 border-red-50"
              >
                <div className="p-8 text-center">
                  <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Trash2 className="w-10 h-10 text-red-500" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-800 mb-4">Reset Progress?</h2>
                  <p className="text-slate-500 mb-8 leading-relaxed">
                    This will clear all your scores and mastered words. This action <span className="text-red-500 font-bold underline">cannot be undone</span>.
                  </p>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={confirmReset}
                      className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-100"
                    >
                      Yes, Reset Everything
                    </button>
                    <button 
                      onClick={() => setShowResetConfirm(false)}
                      className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showPdfModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                      <FileText className="w-6 h-6 text-bwa-blue" />
                      Download Worksheet
                    </h2>
                    <button 
                      onClick={() => setShowPdfModal(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <XCircle className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 block">
                        Select Grade Level
                      </label>
                      <div className="bg-slate-50 p-1 rounded-2xl border border-slate-200 flex gap-1 mb-6">
                        {(['Reception', 'Year 1'] as GradeLevel[]).map((level) => (
                          <button
                            key={level}
                            onClick={() => {
                              setPdfLevel(level);
                              setSelectedPdfCategories([]);
                            }}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                              pdfLevel === level 
                                ? 'bg-bwa-blue text-white shadow-md' 
                                : 'text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>

                      <label className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 block">
                        Select Categories to Include
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {pdfCategories.map(cat => (
                          <button
                            key={cat}
                            onClick={() => {
                              setSelectedPdfCategories(prev => 
                                prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                              );
                            }}
                            className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all text-left flex items-center justify-between ${
                              selectedPdfCategories.includes(cat)
                                ? 'bg-bwa-blue/5 border-bwa-blue/20 text-bwa-blue'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {cat}
                            {selectedPdfCategories.includes(cat) && <Check className="w-4 h-4" />}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-3 italic">Leave none selected to include ALL categories for {pdfLevel}.</p>
                    </div>

                    <button 
                      onClick={generatePDF}
                      className="w-full py-4 bg-bwa-blue text-white rounded-2xl font-bold hover:bg-bwa-blue/90 transition-all shadow-lg shadow-bwa-blue/10 flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      Generate PDF Worksheet
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Session Summary Modal */}
        <AnimatePresence>
          {showSessionSummary && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden"
              >
                <div className="p-8 md:p-12 text-center">
                  <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <PartyPopper className="w-10 h-10 text-amber-500" />
                  </div>
                  
                  <h2 className="text-4xl font-black text-slate-800 mb-2">Session Complete!</h2>
                  <p className="text-slate-500 font-medium mb-10">You've finished 20 questions. Great work!</p>

                  <div className="space-y-6 text-left mb-10">
                    {sessionAchievements.masteredWords.length > 0 && (
                      <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
                        <h3 className="text-emerald-700 font-black text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
                          <Trophy className="w-4 h-4" /> New Words Mastered
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {sessionAchievements.masteredWords.map(w => (
                            <span key={w} className="px-3 py-1 bg-white rounded-full text-sm font-bold text-emerald-600 border border-emerald-200">
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(sessionAchievements.improvedBonds.length > 0 || sessionAchievements.worsenedBonds.length > 0) && (
                      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                        <h3 className="text-slate-500 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                          <Calculator className="w-4 h-4" /> Maths Performance
                        </h3>
                        
                        {sessionAchievements.improvedBonds.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase">Getting Faster</p>
                            <div className="flex flex-wrap gap-2">
                              {sessionAchievements.improvedBonds.map(b => (
                                <div key={b.key} className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-emerald-100 text-xs font-bold text-slate-700">
                                  <span>{b.key}</span>
                                  <TrendingUp className="w-3 h-3 text-emerald-500" />
                                  <span className="text-emerald-500">{(b.newTime / 1000).toFixed(1)}s</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {sessionAchievements.worsenedBonds.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-red-500 uppercase">Needs Practice</p>
                            <div className="flex flex-wrap gap-2">
                              {sessionAchievements.worsenedBonds.map(b => (
                                <div key={b.key} className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-red-100 text-xs font-bold text-slate-700">
                                  <span>{b.key}</span>
                                  <TrendingDown className="w-3 h-3 text-red-400" />
                                  <span className="text-red-400">{(b.newTime / 1000).toFixed(1)}s</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {sessionAchievements.masteredWords.length === 0 && 
                     sessionAchievements.improvedBonds.length === 0 && 
                     sessionAchievements.worsenedBonds.length === 0 && (
                      <div className="bg-slate-50 rounded-2xl p-8 text-center border border-dashed border-slate-200">
                        <p className="text-slate-400 text-sm font-medium italic">
                          Keep practicing to see your achievements here!
                        </p>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={startNewSession}
                    className="w-full py-5 bg-bwa-blue text-white rounded-3xl font-black text-xl hover:bg-bwa-blue/90 transition-all shadow-xl shadow-bwa-blue/20 flex items-center justify-center gap-3"
                  >
                    Start Next Session
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Sync Modal */}
        <AnimatePresence>
          {showSyncModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                      <RefreshCw className="w-6 h-6 text-bwa-blue" />
                      Sync Progress
                    </h2>
                    <button 
                      onClick={() => setShowSyncModal(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <XCircle className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* Export Section */}
                    <div className="space-y-3">
                      <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        Export Progress
                      </label>
                      <p className="text-sm text-slate-500">Copy this code to save your progress or move it to another device.</p>
                      <div className="relative">
                        <textarea 
                          readOnly
                          value={exportProgress()}
                          className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-600 focus:outline-none resize-none"
                        />
                        <button 
                          onClick={() => copyToClipboard(exportProgress())}
                          className="absolute bottom-3 right-3 bg-white border border-slate-200 p-2 rounded-lg shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-2 text-xs font-bold text-bwa-blue"
                        >
                          {syncStatus === 'success' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {syncStatus === 'success' ? 'Copied!' : 'Copy Code'}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-100" />

                    {/* Import Section */}
                    <div className="space-y-3">
                      <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Import Progress
                      </label>
                      <p className="text-sm text-slate-500">Paste a progress code here to restore your scores.</p>
                      <textarea 
                        value={syncInput}
                        onChange={(e) => setSyncInput(e.target.value)}
                        placeholder="Paste code here..."
                        className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-600 focus:ring-2 focus:ring-bwa-blue/50 focus:border-transparent outline-none resize-none"
                      />
                      <button 
                        onClick={handleImport}
                        disabled={!syncInput.trim()}
                        className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                          syncStatus === 'error' 
                            ? 'bg-red-500 text-white' 
                            : syncStatus === 'success'
                            ? 'bg-green-500 text-white'
                            : 'bg-bwa-blue text-white hover:bg-bwa-blue/90 disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                      >
                        {syncStatus === 'error' ? <XCircle className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                        {syncStatus === 'error' ? 'Invalid Code' : syncStatus === 'success' ? 'Imported Successfully!' : 'Import Progress'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

          <div className="flex flex-col items-center">
            {/* Progress Bar */}
            <div className="w-full max-w-md mb-4 md:mb-8">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.granularProgress}%` }}
                    className="h-full bg-gradient-to-r from-bwa-blue to-emerald-500"
                  />
                </div>
                <span className="text-xs font-black text-bwa-blue min-w-[3ch]">
                  {Math.round(stats.granularProgress)}%
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <p className="text-[10px] text-slate-400 font-medium">
                  {stats.mastered} / {stats.total} mastered
                </p>
                {stats.learning > 0 && (
                  <p className="text-[10px] text-bwa-blue/60 font-medium animate-pulse">
                    {stats.learning} active
                  </p>
                )}
              </div>
            </div>

            {/* Flashcard */}
            <div className="relative w-full max-w-md aspect-[4/3] mb-4 md:mb-8">
              <AnimatePresence mode="wait">
                {currentWord && (
                  <motion.div
                    key={currentWord.word}
                    initial={{ scale: 0.8, opacity: 0, rotateY: -20 }}
                    animate={{ 
                      scale: 1, 
                      opacity: 1, 
                      rotateY: 0,
                      backgroundColor: feedback === 'correct' ? '#ecfdf5' : feedback === 'wrong' ? '#fef2f2' : '#ffffff'
                    }}
                    exit={{ scale: 1.2, opacity: 0, rotateY: 20 }}
                    transition={{ type: 'spring', damping: 15 }}
                    className="absolute inset-0 rounded-[2.5rem] shadow-2xl border-4 border-slate-100 flex flex-col items-center justify-center p-8 text-center"
                  >
                    <div className="absolute top-6 right-8 flex gap-1">
                      {[...Array(5)].map((_, i) => {
                        const score = mode === 'Read' ? currentWord.readScore : currentWord.writeScore;
                        return (
                          <div 
                            key={i} 
                            className={`w-3 h-3 rounded-full ${i < score ? 'bg-emerald-400' : 'bg-slate-200'}`} 
                          />
                        );
                      })}
                    </div>

                    <h2 className="text-7xl md:text-8xl font-black text-slate-800 tracking-tight mb-8">
                      {currentWord.word}
                    </h2>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
 
            {/* Controls */}
            <div className="flex gap-6 w-full max-w-md">
              <button
                onClick={() => handleAnswer(false)}
                className="flex-1 bg-white border-2 border-red-100 hover:border-red-200 text-red-500 py-6 rounded-3xl font-bold flex flex-col items-center gap-2 transition-all hover:bg-red-50 active:scale-95 shadow-lg shadow-red-100"
              >
                <XCircle className="w-10 h-10" />
                <span>Still Learning</span>
              </button>
              
              <button
                onClick={() => handleAnswer(true)}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-6 rounded-3xl font-bold flex flex-col items-center gap-2 transition-all hover:shadow-xl active:scale-95 shadow-lg shadow-emerald-100"
              >
                <CheckCircle2 className="w-10 h-10" />
                <span>Got it!</span>
              </button>
            </div>

            <div className="mt-12 text-slate-400 text-sm font-medium flex items-center gap-2">
              <ChevronRight className="w-4 h-4" />
              Next word will appear based on your progress
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 text-center md:hidden">
              <p className="text-[10px] text-slate-400">© 2026 All Rights Reserved</p>
            </div>
          </div>
        </>
      )}
    </main>
    </div>
  );
}
