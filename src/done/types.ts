interface StreamEvent {
  mediaElement: HTMLMediaElement;
  isAudioMuted: boolean;
  muteType: "audio" | "video" | "both";
  unmuteType: "audio" | "video" | "both";
}

interface StreamEvents {
  [streamid: string]: StreamEvent;
}

export interface RTCMultiConnection {
  streamEvents: StreamEvents;
}
