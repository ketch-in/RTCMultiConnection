import type { MediaRequest, MediaConstraints, UserMediaHandlerOptions } from "./types";

import { getRandomString, removeNullEntries } from "../../utils";

declare var currentUserMediaRequest: MediaRequest;

function setStreamType(mediaConstraints: MediaConstraints, stream: MediaStream) {
  if (mediaConstraints.mandatory && mediaConstraints.mandatory.chromeMediaSource) {
    stream.isScreen = true;
  } else if (mediaConstraints.mozMediaSource || mediaConstraints.mediaSource) {
    stream.isScreen = true;
  } else if (mediaConstraints.video) {
    stream.isVideo = true;
  } else if (mediaConstraints.audio) {
    stream.isAudio = true;
  }
}

function getUserMediaHandler(options: UserMediaHandlerOptions) {
  if (currentUserMediaRequest.mutex === true) {
    currentUserMediaRequest.queueRequests.push(options);
    return;
  }

  currentUserMediaRequest.mutex = true;

  const idInstance = JSON.stringify(options.localMediaConstraints);

  function streaming(stream: MediaStream) {
    setStreamType(options.localMediaConstraints, stream);

    const streamEndedEvent = stream.oninactive ? "inactive" : "ended";
    stream.addEventListener(
      streamEndedEvent,
      () => {
        delete currentUserMediaRequest.streams[idInstance];

        currentUserMediaRequest.mutex = false;
        if (currentUserMediaRequest.queueRequests.indexOf(options)) {
          delete currentUserMediaRequest.queueRequests[currentUserMediaRequest.queueRequests.indexOf(options)];
          currentUserMediaRequest.queueRequests = removeNullEntries(currentUserMediaRequest.queueRequests);
        }
      },
      false
    );

    currentUserMediaRequest.streams[idInstance] = {
      stream: stream,
    };
    currentUserMediaRequest.mutex = false;

    if (currentUserMediaRequest.queueRequests.length) {
      getUserMediaHandler(currentUserMediaRequest.queueRequests.shift() as UserMediaHandlerOptions);
    }

    options.onGettingLocalMedia(stream);
  }

  if (currentUserMediaRequest.streams[idInstance]) {
    streaming(currentUserMediaRequest.streams[idInstance].stream);
  } else {
    if (options.localMediaConstraints.isScreen === true) {
      navigator.mediaDevices
        .getDisplayMedia(options.localMediaConstraints)
        .then(stream => {
          stream.streamid = stream.streamid || stream.id || getRandomString();
          stream.idInstance = idInstance;

          streaming(stream);
        })
        .catch(error => {
          options.onLocalMediaError(error, options.localMediaConstraints);
        });
    }

    navigator.mediaDevices
      .getUserMedia(options.localMediaConstraints)
      .then(function (stream) {
        stream.streamid = stream.streamid || stream.id || getRandomString();
        stream.idInstance = idInstance;

        streaming(stream);
      })
      .catch(function (error) {
        options.onLocalMediaError(error, options.localMediaConstraints);
      });
  }
}

export default getUserMediaHandler;
