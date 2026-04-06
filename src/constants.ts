
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
