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
  filesContainer: any;
  onFileStart: any;
  onFileProgress: any;
  onFileEnd: any;
}
