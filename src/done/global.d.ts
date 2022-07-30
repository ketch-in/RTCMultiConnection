interface MediaStream {
  streamid: string;
  idInstance: string;
  isScreen: boolean;
  isAudio: boolean;
  isVideo: boolean;
  oninactive: any;
  mute: (type?: "audio" | "video" | "both", isSyncAction?: boolean) => void;
  unmute: (type?: "audio" | "video" | "both", isSyncAction?: boolean) => void;
}

interface Navigator {
  getUserMedia: (mediaConstraints: any, successCallback: (stream: any) => void, errorCallback: (error: any) => void) => void;
  webkitGetUserMedia: any;
  mozGetUserMedia: any;
}
