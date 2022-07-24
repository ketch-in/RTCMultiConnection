export interface StreamEvent {
  mediaElement: HTMLMediaElement;
  isAudioMuted: boolean;
  muteType: "audio" | "video" | "both";
  unmuteType: "audio" | "video" | "both";
}

export interface StreamEvents {
  [streamid: string]: StreamEvent;
}