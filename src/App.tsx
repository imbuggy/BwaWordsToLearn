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
  Volume2, 
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
  MessageSquare
} from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { INITIAL_WORDS } from './constants';
import { WordData, GradeLevel, AppMode } from './types';

// Initialize Gemini AI for TTS
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [userInput, setUserInput] = useState('');
  const [isCorrecting, setIsCorrecting] = useState(false);

  // Save to local storage whenever words or grade change
  useEffect(() => {
    localStorage.setItem('word-spark-data', JSON.stringify(words));
  }, [words]);

  useEffect(() => {
    localStorage.setItem('word-spark-grade', gradeFilter);
  }, [gradeFilter]);

  // Autoread in Write mode when a new word appears
  useEffect(() => {
    if (mode === 'Write' && currentWordIndex !== null && !isCorrecting && !feedback) {
      speakWord();
    }
  }, [currentWordIndex, mode]);

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

      const masteredWords = wordsWithScores.filter(w => w.score >= 5);
      const inProgressWords = wordsWithScores.filter(w => w.score > 0 && w.score < 5);
      const unstartedWords = wordsWithScores.filter(w => w.score === 0);

      // Construct the working window
      let workingWindow = [...inProgressWords];
      if (workingWindow.length < workingWindowSize) {
        const needed = workingWindowSize - workingWindow.length;
        workingWindow = [...workingWindow, ...unstartedWords.slice(0, needed)];
      }

      // Selection Strategy:
      // 10% chance: Review a mastered word
      // 90% chance: Practice from working window
      const shouldReviewMastered = Math.random() < 0.1 && masteredWords.length > 0;
      
      let pool = shouldReviewMastered ? masteredWords : workingWindow;
      
      // Fallbacks if one pool is empty
      if (pool.length === 0) {
        pool = workingWindow.length > 0 ? workingWindow : masteredWords;
      }

      // Prevent duplicate word in a row
      const filteredPool = pool.length > 1 
        ? pool.filter(p => p.word.word !== lastWordId)
        : pool;

      // Weighted selection within the pool (lower score = higher weight)
      const weights = filteredPool.map(p => 1 / (p.score + 1));
      const totalWeight = weights.reduce((acc, w) => acc + w, 0);
      let random = Math.random() * totalWeight;
      
      let selected = filteredPool[0];
      for (let i = 0; i < filteredPool.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          selected = filteredPool[i];
          break;
        }
      }
      
      nextIndex = selected.originalIndex;
    }

    setLastWordId(words[nextIndex].word);
    setCurrentWordIndex(nextIndex);
    setFeedback(null);
    setUserInput('');
    setIsCorrecting(false);
  }, [filteredWords, words, mode, lastWordId, reviewQueue]);

  // Initial word pick
  useEffect(() => {
    if (currentWordIndex === null && filteredWords.length > 0) {
      pickNextWord();
    }
  }, [currentWordIndex, filteredWords, pickNextWord]);

  const handleAnswer = (correct: boolean) => {
    if (currentWordIndex === null || feedback !== null) return; // Guard against double-clicks

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
      return newWords;
    });

    // Add to review queue if wrong
    if (!correct) {
      const reappearIn = Math.floor(Math.random() * 4) + 2; // 2 to 5
      setReviewQueue(prev => [...prev, { index: currentWordIndex, reappearIn }]);
    }

    if (mode === 'Read' || correct) {
      setTimeout(() => {
        pickNextWord();
      }, 600);
    } else {
      // Write mode & wrong: Enter correction mode
      setTimeout(() => {
        setIsCorrecting(true);
        setFeedback(null);
        setUserInput('');
        speakWord(); // Read again for correction
      }, 1000);
    }
  };

  const checkSpelling = () => {
    if (currentWordIndex === null || feedback !== null) return;
    
    const target = words[currentWordIndex].word.toLowerCase().replace(/[^\w\s]/gi, '');
    const input = userInput.toLowerCase().trim();
    
    if (isCorrecting) {
      if (target === input) {
        // Correctly copied the word
        pickNextWord();
      } else {
        // Still wrong during correction
        setFeedback('wrong');
        setTimeout(() => setFeedback(null), 500);
      }
    } else {
      handleAnswer(target === input);
    }
  };

  const speakWord = async () => {
    if (currentWordIndex === null || isSpeaking) return;
    
    // Sanitize word for TTS (e.g., "eye(s)" -> "eyes")
    const rawWord = words[currentWordIndex].word;
    const sanitizedWord = rawWord.replace(/\((.*?)\)/g, '$1').replace(/[^\w\s]/gi, '');
    
    setIsSpeaking(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly with a British accent: ${sanitizedWord}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;

      if (base64Audio) {
        const binary = atob(base64Audio);
        const arrayBuffer = new ArrayBuffer(binary.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        for (let i = 0; i < binary.length; i++) {
          uint8Array[i] = binary.charCodeAt(i);
        }

        // Gemini TTS usually returns raw PCM (L16) which needs AudioContext
        if (mimeType?.includes('pcm') || !mimeType) {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const int16Array = new Int16Array(arrayBuffer);
          const float32Array = new Float32Array(int16Array.length);
          
          // Convert PCM16 to Float32
          for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768;
          }

          const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
          audioBuffer.getChannelData(0).set(float32Array);

          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioCtx.destination);
          source.onended = () => {
            setIsSpeaking(false);
            audioCtx.close();
          };
          source.start();
        } else {
          // Handle encoded audio (WAV/MP3) if returned
          const audioBlob = new Blob([arrayBuffer], { type: mimeType });
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
          await audio.play();
        }
      } else {
        throw new Error("No audio data in response");
      }
    } catch (error) {
      console.error("TTS Error:", error);
      const utterance = new SpeechSynthesisUtterance(sanitizedWord);
      const voices = window.speechSynthesis.getVoices();
      const britishVoice = voices.find(v => v.lang === 'en-GB' || v.name.includes('UK') || v.name.includes('British'));
      if (britishVoice) utterance.voice = britishVoice;
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const resetProgress = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    setWords(INITIAL_WORDS);
    localStorage.removeItem('word-spark-data');
    setCurrentWordIndex(null);
    setShowResetConfirm(false);
    setShowScoreboard(false);
  };

  const exportProgress = () => {
    const data = words
      .filter(w => w.readScore > 0 || w.writeScore > 0)
      .map(w => ({ w: w.word, l: w.level, r: w.readScore, wr: w.writeScore }));
    return btoa(JSON.stringify(data));
  };

  const handleImport = () => {
    try {
      const data = JSON.parse(atob(syncInput.trim()));
      if (!Array.isArray(data)) throw new Error("Invalid format");
      
      setWords(prev => {
        const newWords = [...prev];
        data.forEach((item: any) => {
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
    return { total, mastered, learning, unstarted };
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
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-sm">
            <BookOpen className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">BWA Words to Learn</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-2">
            <button 
              onClick={() => setShowScoreboard(!showScoreboard)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${showScoreboard ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'}`}
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
                <FileText className="w-5 h-5 text-indigo-500" /> Worksheet
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

      <main className="max-w-4xl mx-auto px-4 py-4 md:px-6 md:py-8">
        {/* Selectors */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4 md:mb-6">
          {/* Level Selector */}
          <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex gap-1">
            {(['Reception', 'Year 1'] as GradeLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => {
                  setGradeFilter(level);
                  setCurrentWordIndex(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                  gradeFilter === level 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Mode Selector */}
          <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex gap-1">
            {(['Read', 'Write'] as AppMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setCurrentWordIndex(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                  mode === m 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Category Selector */}
        {categories.length > 2 && (
          <div className="flex justify-center mb-4 md:mb-6 overflow-x-auto pb-1 no-scrollbar">
            <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex gap-1 whitespace-nowrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setCategoryFilter(cat);
                    setCurrentWordIndex(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all duration-200 ${
                    categoryFilter === cat 
                      ? 'bg-indigo-100 text-indigo-700' 
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
                      About BWA Words
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
                      This app was created by a parent to help children practice their school words in a fun, interactive way. 
                      It follows the "Words to Learn" list used by Belleville Wix Academy for Reception and Year 1.
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
                        className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
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
                      <FileText className="w-6 h-6 text-indigo-600" />
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
                                ? 'bg-indigo-600 text-white shadow-md' 
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
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
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
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
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
                      <RefreshCw className="w-6 h-6 text-indigo-600" />
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
                          className="absolute bottom-3 right-3 bg-white border border-slate-200 p-2 rounded-lg shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-2 text-xs font-bold text-indigo-600"
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
                        className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                      />
                      <button 
                        onClick={handleImport}
                        disabled={!syncInput.trim()}
                        className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                          syncStatus === 'error' 
                            ? 'bg-red-500 text-white' 
                            : syncStatus === 'success'
                            ? 'bg-green-500 text-white'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed'
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

        {showScoreboard ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Trophy className="text-amber-500" /> {mode} Progress Dashboard
              </h2>
              <button 
                onClick={() => setShowScoreboard(false)}
                className="text-indigo-600 font-medium hover:underline"
              >
                Back to Cards
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                <div className="text-emerald-600 text-sm font-bold uppercase tracking-wider mb-1">Mastered</div>
                <div className="text-4xl font-black text-emerald-700">{stats.mastered}</div>
                <div className="text-emerald-600/60 text-xs mt-1">Words with 5+ correct</div>
              </div>
              <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
                <div className="text-indigo-600 text-sm font-bold uppercase tracking-wider mb-1">Learning</div>
                <div className="text-4xl font-black text-indigo-700">{stats.learning}</div>
                <div className="text-indigo-600/60 text-xs mt-1">Words in progress</div>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <div className="text-slate-600 text-sm font-bold uppercase tracking-wider mb-1">New</div>
                <div className="text-4xl font-black text-slate-700">{stats.unstarted}</div>
                <div className="text-slate-600/60 text-xs mt-1">Not yet seen</div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <GraduationCap className="w-5 h-5" /> {mode} Word List
              </h3>
              <div className="flex flex-wrap gap-2">
                {filteredWords.sort((a, b) => {
                  const scoreA = mode === 'Read' ? a.readScore : a.writeScore;
                  const scoreB = mode === 'Read' ? b.readScore : b.writeScore;
                  return scoreB - scoreA;
                }).map((w) => {
                  const score = mode === 'Read' ? w.readScore : w.writeScore;
                  return (
                    <div 
                      key={w.word}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                        score >= 5 ? 'bg-emerald-100 border-emerald-200 text-emerald-700' :
                        score > 0 ? 'bg-indigo-100 border-indigo-200 text-indigo-700' :
                        'bg-white border-slate-200 text-slate-400'
                      }`}
                    >
                      {w.word}
                      <span className="ml-2 opacity-50 text-[10px]">{score}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col items-center gap-4">
              <p className="text-sm text-slate-400 text-center max-w-xs">
                Manage your progress data below.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <button 
                  onClick={() => setShowSyncModal(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
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
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center">
            {/* Progress Bar */}
            <div className="w-full max-w-md mb-4 md:mb-8">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(stats.mastered / stats.total) * 100}%` }}
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500"
                  />
                </div>
                <span className="text-xs font-black text-indigo-600 min-w-[3ch]">
                  {Math.round((stats.mastered / stats.total) * 100)}%
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <p className="text-[10px] text-slate-400 font-medium">
                  {stats.mastered} / {stats.total} mastered
                </p>
                {stats.learning > 0 && (
                  <p className="text-[10px] text-indigo-400 font-medium animate-pulse">
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

                    {mode === 'Read' ? (
                      <>
                        <h2 className="text-7xl md:text-8xl font-black text-slate-800 tracking-tight mb-8">
                          {currentWord.word}
                        </h2>
                        <button
                          onClick={speakWord}
                          disabled={isSpeaking}
                          className={`p-4 rounded-full transition-all ${
                            isSpeaking ? 'bg-indigo-100 text-indigo-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:scale-110 active:scale-95'
                          }`}
                        >
                          <Volume2 className={`w-8 h-8 ${isSpeaking ? 'animate-pulse' : ''}`} />
                        </button>
                      </>
                    ) : (
                      <div className="w-full space-y-8">
                        <div className="flex flex-col items-center gap-4">
                          <button
                            onClick={speakWord}
                            disabled={isSpeaking}
                            className={`p-6 rounded-full transition-all ${
                              isSpeaking ? 'bg-indigo-100 text-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-110 active:scale-95 shadow-lg'
                            }`}
                          >
                            <Volume2 className={`w-10 h-10 ${isSpeaking ? 'animate-pulse' : ''}`} />
                          </button>
                          
                          {isCorrecting ? (
                            <div className="text-center animate-bounce">
                              <p className="text-red-500 font-bold text-lg mb-2">Oops! Try again.</p>
                              <p className="text-slate-400 text-sm mb-1">The correct word is:</p>
                              <p className="text-4xl font-black text-indigo-600 tracking-wider bg-indigo-50 px-6 py-2 rounded-2xl border-2 border-indigo-100">
                                {currentWord.word}
                              </p>
                            </div>
                          ) : (
                            <p className="text-slate-400 font-medium">Listen and type the word</p>
                          )}
                        </div>
                        
                        <div className="relative">
                          <input
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && checkSpelling()}
                            placeholder={isCorrecting ? "Copy the word here..." : "Type here..."}
                            className={`w-full text-3xl font-bold text-center py-4 border-b-4 outline-none transition-all bg-transparent ${
                              isCorrecting ? 'border-indigo-300 text-indigo-600' : 'border-slate-200 focus:border-indigo-500'
                            }`}
                            autoFocus
                          />
                          {isCorrecting && (
                            <div className="absolute -bottom-8 left-0 right-0 text-center text-indigo-400 text-xs font-bold animate-pulse">
                              TYPE THE WORD TO CONTINUE
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Controls */}
            {mode === 'Read' ? (
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
            ) : (
              <button
                onClick={checkSpelling}
                disabled={!userInput.trim()}
                className="w-full max-w-md bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-6 rounded-3xl font-bold flex items-center justify-center gap-3 transition-all hover:shadow-xl active:scale-95 shadow-lg shadow-indigo-100"
              >
                <CheckCircle2 className="w-8 h-8" />
                <span className="text-xl">Check Spelling</span>
              </button>
            )}

            <div className="mt-12 text-slate-400 text-sm font-medium flex items-center gap-2">
              <ChevronRight className="w-4 h-4" />
              {mode === 'Read' ? 'Next word will appear based on your progress' : 'Type correctly to advance'}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 text-center md:hidden">
              <p className="text-[10px] text-slate-400">© 2026 All Rights Reserved</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
