interface MediaStream {
  streamid: string;
  oninactive: Function;
  mute: (type?: "audio" | "video" | "both", isSyncAction?: boolean) => void;
  unmute: (type?: "audio" | "video" | "both", isSyncAction?: boolean) => void;
}
