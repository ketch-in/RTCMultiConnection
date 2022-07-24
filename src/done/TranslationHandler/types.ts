export interface Language {
  language: string;
}

export interface Translator {
  TranslateText: (text: string, callback: (translatedText: string) => void) => void;
  getListOfLanguages: (callback: (languages: Language[]) => void) => void;
}

export interface Translation {
  translatedText: string;
}

export interface TranslationResponse {
  data?: {
    translations: Translation[];
    languages: Language[];
  };
  error?: {
    message: string;
  };
}
