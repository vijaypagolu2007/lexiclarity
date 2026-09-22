const LANG_CODE_MAP: Record<string, string> = {
  English: 'en-US',
  Hindi: 'hi-IN',
  Spanish: 'es-ES',
  Tamil: 'ta-IN',
  Telugu: 'te-IN',
  Kannada: 'kn-IN',
  Malayalam: 'ml-IN',
  Bengali: 'bn-IN',
  Gujarati: 'gu-IN',
  Marathi: 'mr-IN',
  Punjabi: 'pa-IN',
  French: 'fr-FR',
  German: 'de-DE',
  Italian: 'it-IT',
  Portuguese: 'pt-BR',
  Russian: 'ru-RU',
  Japanese: 'ja-JP',
  Korean: 'ko-KR',
  'Chinese (Mandarin)': 'zh-CN',
  Chinese: 'zh-CN',
  Arabic: 'ar-SA',
  Dutch: 'nl-NL',
  Polish: 'pl-PL',
  Turkish: 'tr-TR',
  Vietnamese: 'vi-VN',
  Greek: 'el-GR',
  Hebrew: 'he-IL',
  Thai: 'th-TH',
};

export interface DetectedLanguage {
  langCode: string;
  langName: string;
  confidence: number;
}

const STOPWORDS_MAP: Record<string, { code: string; name: string; words: string[] }> = {
  spanish: {
    code: 'es-ES',
    name: 'Spanish',
    words: [
      'de', 'la', 'el', 'en', 'que', 'los', 'por', 'con', 'para', 'un', 'una', 'las', 'su', 'al',
      'como', 'del', 'este', 'esta', 'pero', 'sus', 'les', 'sin', 'sobre', 'entre', 'contrato',
      'arrendamiento', 'arrendador', 'arrendatario', 'pago', 'cuota', 'derechos', 'obligaciones',
      'plazo', 'propiedad', 'cláusula', 'acuerdo'
    ],
  },
  french: {
    code: 'fr-FR',
    name: 'French',
    words: [
      'de', 'la', 'le', 'et', 'les', 'des', 'en', 'un', 'une', 'est', 'pour', 'pas', 'dans', 'sur',
      'par', 'avec', 'sont', 'au', 'ne', 'mais', 'contrat', 'bail', 'location', 'locataire',
      'propriétaire', 'loyer', 'durée', 'clauses', 'résiliation'
    ],
  },
  german: {
    code: 'de-DE',
    name: 'German',
    words: [
      'der', 'die', 'das', 'und', 'in', 'den', 'von', 'zu', 'mit', 'sich', 'des', 'auf', 'für',
      'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'mietvertrag', 'vertrag', 'mieter',
      'vermieter', 'miete', 'kaution', 'kündigung', 'rechte', 'pflichten'
    ],
  },
  italian: {
    code: 'it-IT',
    name: 'Italian',
    words: [
      'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'il', 'lo', 'la', 'i', 'gli', 'le',
      'un', 'uno', 'una', 'che', 'non', 'del', 'della', 'al', 'alla', 'contratto', 'locazione',
      'locatore', 'conduttore', 'canone', 'recesso'
    ],
  },
  portuguese: {
    code: 'pt-BR',
    name: 'Portuguese',
    words: [
      'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'com', 'não', 'uma', 'os', 'no',
      'se', 'na', 'por', 'mais', 'as', 'contrato', 'locação', 'aluguel', 'locador', 'locatário',
      'cláusula', 'imóvel'
    ],
  },
  dutch: {
    code: 'nl-NL',
    name: 'Dutch',
    words: [
      'de', 'het', 'en', 'van', 'te', 'dat', 'die', 'in', 'een', 'op', 'met', 'voor', 'zijn',
      'was', 'om', 'over', 'niet', 'aan', 'er', 'huurovereenkomst', 'overeenkomst', 'huurder',
      'verhuurder', 'huur'
    ],
  },
  polish: {
    code: 'pl-PL',
    name: 'Polish',
    words: [
      'w', 'z', 'i', 'na', 'do', 'nie', 'że', 'o', 'się', 'to', 'co', 'jest', 'jak', 'tak', 'ale',
      'od', 'po', 'umowa', 'najmu', 'najemca', 'wynajmujący', 'czynsz', 'lokal'
    ],
  },
  turkish: {
    code: 'tr-TR',
    name: 'Turkish',
    words: [
      'bir', 've', 'de', 'da', 'bu', 'ne', 'için', 'ile', 'gibi', 'olan', 'var', 'daha', 'kadar',
      'sonra', 'sözleşme', 'kira', 'kiracı', 'kiraya', 'veren', 'taraf', 'madde'
    ],
  },
  vietnamese: {
    code: 'vi-VN',
    name: 'Vietnamese',
    words: [
      'của', 'và', 'có', 'không', 'trong', 'được', 'cho', 'các', 'là', 'khi', 'người', 'với',
      'hợp', 'đồng', 'thuê', 'bên', 'nhà', 'tiền', 'điều', 'khoản'
    ],
  },
  english: {
    code: 'en-US',
    name: 'English',
    words: [
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it', 'for', 'not', 'on', 'with',
      'he', 'as', 'you', 'do', 'at', 'this', 'but', 'by', 'from', 'or', 'an', 'will', 'shall',
      'agreement', 'contract', 'tenant', 'landlord', 'lease', 'clause', 'rent', 'party', 'terms'
    ],
  },
};

/**
 * Automatically detects the language of the provided text based on Unicode scripts
 * and word frequency analysis for Latin scripts.
 */
export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.trim().length === 0) {
    return { langCode: 'en-US', langName: 'English', confidence: 0 };
  }

  const sampleText = text.slice(0, 2000); // Sample first 2000 characters for high speed & accuracy

  // 1. Script checks for non-Latin writing systems
  let devanagariCount = 0;
  let marathiCount = 0;
  let tamilCount = 0;
  let teluguCount = 0;
  let kannadaCount = 0;
  let malayalamCount = 0;
  let bengaliCount = 0;
  let gujaratiCount = 0;
  let punjabiCount = 0;
  let arabicCount = 0;
  let japaneseCount = 0;
  let koreanCount = 0;
  let chineseCount = 0;
  let cyrillicCount = 0;
  let greekCount = 0;
  let hebrewCount = 0;
  let thaiCount = 0;

  for (let i = 0; i < sampleText.length; i++) {
    const code = sampleText.charCodeAt(i);
    // Devanagari (Hindi / Marathi)
    if (code >= 0x0900 && code <= 0x097f) {
      devanagariCount++;
      if (code === 0x0933) marathiCount++; // 'ळ' character specific to Marathi
    } else if (code >= 0x0b80 && code <= 0x0bff) tamilCount++;
    else if (code >= 0x0c00 && code <= 0x0c7f) teluguCount++;
    else if (code >= 0x0c80 && code <= 0x0cff) kannadaCount++;
    else if (code >= 0x0d00 && code <= 0x0d7f) malayalamCount++;
    else if (code >= 0x0980 && code <= 0x09ff) bengaliCount++;
    else if (code >= 0x0a80 && code <= 0x0aff) gujaratiCount++;
    else if (code >= 0x0a00 && code <= 0x0a7f) punjabiCount++;
    else if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) arabicCount++;
    else if ((code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)) japaneseCount++;
    else if ((code >= 0xac00 && code <= 0xd7af) || (code >= 0x1100 && code <= 0x11ff)) koreanCount++;
    else if (code >= 0x4e00 && code <= 0x9fff) chineseCount++;
    else if (code >= 0x0400 && code <= 0x04ff) cyrillicCount++;
    else if (code >= 0x0370 && code <= 0x03ff) greekCount++;
    else if (code >= 0x0590 && code <= 0x05ff) hebrewCount++;
    else if (code >= 0x0e00 && code <= 0x0e7f) thaiCount++;
  }

  const scriptTotal =
    devanagariCount +
    tamilCount +
    teluguCount +
    kannadaCount +
    malayalamCount +
    bengaliCount +
    gujaratiCount +
    punjabiCount +
    arabicCount +
    japaneseCount +
    koreanCount +
    chineseCount +
    cyrillicCount +
    greekCount +
    hebrewCount +
    thaiCount;

  if (scriptTotal > 8) {
    if (devanagariCount > scriptTotal * 0.4) {
      if (marathiCount > 0) return { langCode: 'mr-IN', langName: 'Marathi', confidence: 0.98 };
      return { langCode: 'hi-IN', langName: 'Hindi', confidence: 0.98 };
    }
    if (tamilCount > scriptTotal * 0.4) return { langCode: 'ta-IN', langName: 'Tamil', confidence: 0.98 };
    if (teluguCount > scriptTotal * 0.4) return { langCode: 'te-IN', langName: 'Telugu', confidence: 0.98 };
    if (kannadaCount > scriptTotal * 0.4) return { langCode: 'kn-IN', langName: 'Kannada', confidence: 0.98 };
    if (malayalamCount > scriptTotal * 0.4) return { langCode: 'ml-IN', langName: 'Malayalam', confidence: 0.98 };
    if (bengaliCount > scriptTotal * 0.4) return { langCode: 'bn-IN', langName: 'Bengali', confidence: 0.98 };
    if (gujaratiCount > scriptTotal * 0.4) return { langCode: 'gu-IN', langName: 'Gujarati', confidence: 0.98 };
    if (punjabiCount > scriptTotal * 0.4) return { langCode: 'pa-IN', langName: 'Punjabi', confidence: 0.98 };
    if (arabicCount > scriptTotal * 0.4) return { langCode: 'ar-SA', langName: 'Arabic', confidence: 0.98 };
    if (japaneseCount > 0) return { langCode: 'ja-JP', langName: 'Japanese', confidence: 0.98 };
    if (koreanCount > scriptTotal * 0.4) return { langCode: 'ko-KR', langName: 'Korean', confidence: 0.98 };
    if (chineseCount > scriptTotal * 0.4) return { langCode: 'zh-CN', langName: 'Chinese', confidence: 0.98 };
    if (cyrillicCount > scriptTotal * 0.4) return { langCode: 'ru-RU', langName: 'Russian', confidence: 0.98 };
    if (greekCount > scriptTotal * 0.4) return { langCode: 'el-GR', langName: 'Greek', confidence: 0.98 };
    if (hebrewCount > scriptTotal * 0.4) return { langCode: 'he-IL', langName: 'Hebrew', confidence: 0.98 };
    if (thaiCount > scriptTotal * 0.4) return { langCode: 'th-TH', langName: 'Thai', confidence: 0.98 };
  }

  // 2. Word Tokenization & Frequency Analysis for Latin / European languages
  const cleanedText = sampleText.toLowerCase().replace(/[^a-zà-ÿñçâêîôûäëïöüáéíóúàèìòù]/gi, ' ');
  const words = cleanedText.split(/\s+/).filter((w) => w.length > 0);

  if (words.length === 0) {
    return { langCode: 'en-US', langName: 'English', confidence: 0.1 };
  }

  const wordCounts: Record<string, number> = {};
  for (const w of words) {
    wordCounts[w] = (wordCounts[w] || 0) + 1;
  }

  let bestLangKey = 'english';
  let bestScore = 0;

  for (const [key, langData] of Object.entries(STOPWORDS_MAP)) {
    let matches = 0;
    for (const stopword of langData.words) {
      if (wordCounts[stopword]) {
        matches += wordCounts[stopword];
      }
    }

    // Language specific character signals
    if (key === 'spanish' && sampleText.includes('ñ')) matches += 5;
    if (key === 'german' && (sampleText.includes('ß') || sampleText.includes('ä') || sampleText.includes('ö') || sampleText.includes('ü'))) matches += 5;
    if (key === 'portuguese' && (sampleText.includes('ã') || sampleText.includes('õ') || sampleText.includes('ç'))) matches += 5;
    if (key === 'french' && (sampleText.includes('ç') || sampleText.includes('é') || sampleText.includes('è') || sampleText.includes('ê'))) matches += 3;
    if (key === 'polish' && (sampleText.includes('ł') || sampleText.includes('ż') || sampleText.includes('ź') || sampleText.includes('ę') || sampleText.includes('ą'))) matches += 5;
    if (key === 'turkish' && (sampleText.includes('ğ') || sampleText.includes('ş') || sampleText.includes('ı'))) matches += 5;
    if (key === 'vietnamese' && (sampleText.includes('đ') || sampleText.includes('ơ') || sampleText.includes('ư'))) matches += 5;

    const score = matches / words.length;
    if (score > bestScore) {
      bestScore = score;
      bestLangKey = key;
    }
  }

  const matched = STOPWORDS_MAP[bestLangKey];
  return {
    langCode: matched.code,
    langName: matched.name,
    confidence: Math.min(1, Math.max(0.2, bestScore * 2.5)),
  };
}

/**
 * Searches browser speech synthesis voices for the voice best matching the target language code.
 */
function findBestVoice(targetLangCode: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;
  const targetLower = targetLangCode.toLowerCase();
  const langPrefix = targetLower.slice(0, 2);

  const prefixToKeywords: Record<string, string[]> = {
    es: ['spanish', 'español', 'es_es', 'es_mx', 'es-es', 'es-mx'],
    hi: ['hindi', 'hi_in', 'hi-in', 'हिन्दी'],
    fr: ['french', 'français', 'fr_fr', 'fr-fr', 'fr_ca'],
    de: ['german', 'deutsch', 'de_de', 'de-de'],
    it: ['italian', 'italiano', 'it_it', 'it-it'],
    pt: ['portuguese', 'português', 'pt_br', 'pt_pt', 'pt-br'],
    ta: ['tamil', 'ta_in', 'ta-in', 'தமிழ்'],
    te: ['telugu', 'te_in', 'te-in', 'తెలుగు'],
    kn: ['kannada', 'kn_in', 'kn-in', 'கன்னட'],
    ml: ['malayalam', 'ml_in', 'ml-in', 'മലയാളം'],
    bn: ['bengali', 'bn_in', 'bn-in', 'বাংলা'],
    gu: ['gujarati', 'gu_in', 'gu-in', 'ગુજરાતી'],
    mr: ['marathi', 'mr_in', 'mr-in', 'मराठी'],
    pa: ['punjabi', 'pa_in', 'pa-in', 'ਪੰਜਾਬੀ'],
    ru: ['russian', 'русский', 'ru_ru', 'ru-ru'],
    ja: ['japanese', '日本語', 'ja_jp', 'ja-jp'],
    ko: ['korean', '한국어', 'ko_kr', 'ko-kr'],
    zh: ['chinese', 'mandarin', 'zh_cn', 'zh-cn', 'zh_tw', '中文'],
    ar: ['arabic', 'ar_sa', 'ar-sa', 'العربية'],
    nl: ['dutch', 'nederlands', 'nl_nl', 'nl-nl'],
    pl: ['polish', 'polski', 'pl_pl', 'pl-pl'],
    tr: ['turkish', 'türkçe', 'tr_tr', 'tr-tr'],
    vi: ['vietnamese', 'tiếng việt', 'vi_vn', 'vi-vn'],
    en: ['english', 'en_us', 'en_gb', 'en-us', 'en-gb'],
  };

  const nameKeywords = prefixToKeywords[langPrefix] || [];

  // 1. Exact BCP-47 match (e.g. 'es-ES' === 'es-ES' or 'hi-IN' === 'hi-IN')
  let voice = voices.find(
    (v) => v.lang.toLowerCase().replace('_', '-') === targetLower.replace('_', '-')
  );
  if (voice) return voice;

  // 2. Starts with same language prefix (e.g. 'es' or 'hi')
  voice = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
  if (voice) return voice;

  // 3. Match by voice name / description containing language keywords (e.g. "Google Español", "Microsoft Helena - Spanish")
  voice = voices.find((v) => {
    const vName = v.name.toLowerCase();
    return nameKeywords.some((keyword) => vName.includes(keyword));
  });
  if (voice) return voice;

  // 4. Default fallback to system default voice or first voice
  return voices.find((v) => v.default) || voices[0] || null;
}

export type StopSpeechFunction = (() => void) & {
  detectedLanguage?: DetectedLanguage;
};

/**
 * Speaks the provided text using browser speech synthesis after automatically
 * detecting the text's language and matching the appropriate browser voice.
 */
export function speakText(
  text: string,
  hintLanguage: string = 'English',
  onEnd?: () => void,
  onError?: (err: any) => void
): StopSpeechFunction {
  const stopFn: StopSpeechFunction = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported in this browser.');
    return stopFn;
  }

  window.speechSynthesis.cancel();

  // 1. Auto-detect language of generated text
  const detected = detectLanguage(text);
  stopFn.detectedLanguage = detected;

  // 2. Resolve target BCP-47 language tag
  let targetLangCode = detected.langCode;

  // If detection has low confidence and user explicitly selected a non-English language, respect hintLanguage
  if (detected.confidence < 0.2 && hintLanguage && hintLanguage !== 'English') {
    targetLangCode = LANG_CODE_MAP[hintLanguage] || (hintLanguage.length === 5 ? hintLanguage : detected.langCode);
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = targetLangCode;
  utterance.rate = 0.95;

  if (onEnd) utterance.onend = onEnd;
  if (onError) utterance.onerror = onError;

  const playUtterance = () => {
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = findBestVoice(targetLangCode, voices);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
      console.log(`[TTS Auto-Language] Detected: ${detected.langName} (${targetLangCode}) | Selected Voice: "${matchedVoice.name}" (${matchedVoice.lang})`);
    } else {
      console.log(`[TTS Auto-Language] Detected: ${detected.langName} (${targetLangCode}) | Using default browser speech engine`);
    }
    window.speechSynthesis.speak(utterance);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    playUtterance();
  } else {
    let voicedLoaded = false;
    const handleVoicesChanged = () => {
      if (!voicedLoaded) {
        voicedLoaded = true;
        window.speechSynthesis.onvoiceschanged = null;
        playUtterance();
      }
    };
    window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
    setTimeout(() => {
      if (!voicedLoaded) {
        voicedLoaded = true;
        playUtterance();
      }
    }, 250);
  }

  return stopFn;
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
