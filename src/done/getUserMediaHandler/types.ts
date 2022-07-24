export interface MediaRequest {
  streams: {
    [idInstance: string]: {
      stream: MediaStream;
    };
  };
  mutex: boolean;
  queueRequests: UserMediaHandlerOptions[];
  remove: (idInstance: string) => void;
}

export interface MediaConstraints extends DisplayMediaStreamConstraints {
  isScreen: boolean;
  mandatory: any;
  mozMediaSource: any;
  mediaSource: any;
}

export interface UserMediaHandlerOptions {
  localMediaConstraints: MediaConstraints;
  onGettingLocalMedia: (stream: MediaStream) => void;
  onLocalMediaError: (error: any, constraints: MediaConstraints) => void;
}
