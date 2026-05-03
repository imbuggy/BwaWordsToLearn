
import { GradeLevel } from './types';

const RECEPTION_WORDS = [
  'a', 'at', 'go', 'is', 'in', 'my', 'the', 'they',
  'all', 'be', 'he', 'has', 'it', 'no', 'so', 'you',
  'and', 'by', 'her', 'have', 'like', 'of', 'to', 'was',
  'are', 'do', 'his', 'I', 'me', 'said', 'we'
];

const YEAR_1_WORDS = [
  'ask', 'asked', 'called', 'come', 'does', 'eye', 'friend',
  'full', 'here', 'house', "I'll", "I'm", "it's",
  'little', 'looked', 'love', 'Mr', 'Mrs', 'once', 'our',
  'people', 'pull', 'push', 'put', 'says', 'school', 'some',
  'their', 'there', 'these', 'today', 'want', 'were', 'what',
  'when', 'where', 'who', 'why', 'your',
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
];

const QUESTION_WORDS = ['what', 'when', 'where', 'who', 'why', 'how'];
const NUMBERS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const PHONICS_WORDS = [
  // Section 1 - Pseudo Words
  { word: 'tox', isPseudo: true, section: 1 },
  { word: 'bim', isPseudo: true, section: 1 },
  { word: 'vap', isPseudo: true, section: 1 },
  { word: 'ul', isPseudo: true, section: 1 },
  { word: 'chab', isPseudo: true, section: 1 },
  { word: 'yest', isPseudo: true, section: 1 },
  { word: 'pell', isPseudo: true, section: 1 },
  { word: 'quib', isPseudo: true, section: 1 },
  { word: 'thop', isPseudo: true, section: 1 },
  { word: 'shig', isPseudo: true, section: 1 },
  { word: 'blan', isPseudo: true, section: 1 },
  { word: 'stot', isPseudo: true, section: 1 },
  
  // Section 1 - Real Words
  { word: 'beg', isPseudo: false, section: 1 },
  { word: 'sum', isPseudo: false, section: 1 },
  { word: 'hut', isPseudo: false, section: 1 },
  { word: 'chill', isPseudo: false, section: 1 },
  { word: 'shop', isPseudo: false, section: 1 },
  { word: 'peel', isPseudo: false, section: 1 },
  { word: 'week', isPseudo: false, section: 1 },
  { word: 'sport', isPseudo: false, section: 1 },
  
  // Section 2 - Pseudo Words
  { word: 'wome', isPseudo: true, section: 2 },
  { word: 'phope', isPseudo: true, section: 2 },
  { word: 'quoig', isPseudo: true, section: 2 },
  { word: 'flisp', isPseudo: true, section: 2 },
  { word: 'smeak', isPseudo: true, section: 2 },
  { word: 'sprow', isPseudo: true, section: 2 },
  { word: 'graint', isPseudo: true, section: 2 },
  { word: 'thrild', isPseudo: true, section: 2 },
  
  // Section 2 - Real Words
  { word: 'zoom', isPseudo: false, section: 2 },
  { word: 'street', isPseudo: false, section: 2 },
  { word: 'cloak', isPseudo: false, section: 2 },
  { word: 'brown', isPseudo: false, section: 2 },
  { word: 'blank', isPseudo: false, section: 2 },
  { word: 'strait', isPseudo: false, section: 2 },
  { word: 'spring', isPseudo: false, section: 2 },
  { word: 'phone', isPseudo: false, section: 2 },
  { word: 'spider', isPseudo: false, section: 2 },
  { word: 'friend', isPseudo: false, section: 2 },
  { word: 'star', isPseudo: false, section: 2 },
  { word: 'thorn', isPseudo: false, section: 2 }
];

export const INITIAL_WORDS = [
  ...RECEPTION_WORDS.map(w => ({
    word: w,
    level: 'Reception' as GradeLevel,
    category: w.length <= 2 ? 'Short Words' : 'Common',
    readScore: 0,
    writeScore: 0
  })),
  ...YEAR_1_WORDS.map(w => {
    let category = 'Common';
    const lower = w.toLowerCase();
    if (QUESTION_WORDS.includes(lower)) category = 'Questions';
    else if (NUMBERS.includes(lower)) category = 'Numbers';
    else if (DAYS.includes(w)) category = 'Days'; // Case sensitive for days
    
    return {
      word: w,
      level: 'Year 1' as GradeLevel,
      category,
      readScore: 0,
      writeScore: 0
    };
  })
];
