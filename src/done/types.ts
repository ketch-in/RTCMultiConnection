import type { StreamEvents } from "./StreamsHandler/types";
import type { Translator } from "./TranslationHandler/types";

export interface RTCMultiConnection {
  streamEvents: StreamEvents;

  // TranslationHandler
  autoTranslateText: boolean;
  language?: string;
  googKey: string;
  Translator: Translator;

  // FileProgressBarHandler
  filesContainer: HTMLElement;
  onFileStart: (file: any) => void;
  onFileProgress: (file: any) => void;
  onFileEnd: (file: any) => void;
}
