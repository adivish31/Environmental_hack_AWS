import { createContext, useContext, useState } from 'react';

const dict = {
  en: {
    checkin: 'Check in', manager: 'Mess manager', impact: 'Impact',
    rollPrompt: 'Your roll number', rollHint: 'Saved on this phone, so you only type it once.', continue: 'Continue', change: 'Change',
    eating: 'Eating', skipping: 'Skipping', closesIn: 'Closes in', locked: 'Locked — final count sent to the mess',
    noMeals: 'No meals open today yet. Check back closer to mealtime.',
    BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner',
    youSaid: 'Your answer', notYet: 'Not answered — the mess will guess for you',
  },
  hi: {
    checkin: 'चेक-इन', manager: 'मेस मैनेजर', impact: 'असर',
    rollPrompt: 'आपका रोल नंबर', rollHint: 'यह इस फ़ोन पर सेव रहेगा, बस एक बार लिखना है।', continue: 'आगे बढ़ें', change: 'बदलें',
    eating: 'खाऊँगा', skipping: 'नहीं खाऊँगा', closesIn: 'बंद होगा', locked: 'बंद — अंतिम संख्या मेस को भेज दी गई',
    noMeals: 'आज अभी कोई भोजन खुला नहीं है। खाने के समय के पास फिर देखें।',
    BREAKFAST: 'नाश्ता', LUNCH: 'दोपहर का खाना', DINNER: 'रात का खाना',
    youSaid: 'आपका जवाब', notYet: 'जवाब नहीं दिया — मेस अंदाज़ा लगाएगा',
  },
};

const Ctx = createContext(null);
export function LangProvider({ children }) {
  const [lang, setLangState] = useState(localStorage.getItem('mw_lang') || 'en');
  const setLang = (l) => { localStorage.setItem('mw_lang', l); setLangState(l); };
  const t = (k) => dict[lang][k] ?? dict.en[k] ?? k;
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export const useT = () => useContext(Ctx);
