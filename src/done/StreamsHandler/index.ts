import type { RTCMultiConnection } from "../types";
import { fireEvent, getTracks } from "../../utils";

type SyncAction = "inactive" | "ended" | "mute" | "unmute";
type MuteType = "audio" | "video" | "both";

function afterEach(setTimeoutInteval: number, numberOfTimes: number, callback: Function, startedTimes = 0) {
  if (startedTimes >= numberOfTimes) {
    return;
  }

  setTimeout(() => {
    callback();
    afterEach(setTimeoutInteval, numberOfTimes, callback, startedTimes + 1);
  }, setTimeoutInteval);
}

function graduallyIncreaseVolume(stream: MediaStream, connection: RTCMultiConnection) {
  if (!connection.streamEvents[stream.streamid].mediaElement) {
    return;
  }

  const mediaElement = connection.streamEvents[stream.streamid].mediaElement;
  mediaElement.volume = 0;
  afterEach(200, 5, function () {
    try {
      mediaElement.volume += 0.2;
    } catch (e) {
      mediaElement.volume = 1;
    }
  });
}

function setHandlers(stream: MediaStream, syncAction: boolean, connection: RTCMultiConnection) {
  if (syncAction) {
    const streamEndedEvent = stream.oninactive ? "inactive" : "ended";
    stream.addEventListener(
      streamEndedEvent,
      () => {
        onSyncNeeded(stream.streamid, streamEndedEvent, "both");
      },
      false
    );
  }

  stream.mute = (muteType = "both", isSyncAction?: boolean) => {
    if (typeof isSyncAction !== "undefined") {
      syncAction = isSyncAction;
    }

    if (muteType === "both" || muteType === "audio") {
      getTracks(stream, "audio").forEach(track => {
        track.enabled = false;
        connection.streamEvents[stream.streamid].isAudioMuted = true;
      });
    }

    if (muteType === "both" || muteType === "video") {
      getTracks(stream, "video").forEach(function (track) {
        track.enabled = false;
      });
    }

    if (typeof syncAction === "undefined" || syncAction === true) {
      onSyncNeeded(stream.streamid, "mute", muteType);
    }

    connection.streamEvents[stream.streamid].muteType = muteType;

    fireEvent(stream, "mute", muteType);
  };

  stream.unmute = (unmuteType = "both", isSyncAction?: boolean) => {
    if (typeof isSyncAction !== "undefined") {
      syncAction = isSyncAction;
    }

    graduallyIncreaseVolume(stream, connection);

    if (unmuteType === "both" || unmuteType === "audio") {
      getTracks(stream, "audio").forEach(function (track) {
        track.enabled = true;
        connection.streamEvents[stream.streamid].isAudioMuted = false;
      });
    }

    if (unmuteType === "both" || unmuteType === "video") {
      getTracks(stream, "video").forEach(function (track) {
        track.enabled = true;
      });

      // make sure that video unmute doesn't affects audio
      if (unmuteType === "video" && connection.streamEvents[stream.streamid].isAudioMuted) {
        (function looper(times = 0) {
          times++;

          // check until five-seconds
          if (times < 100 && connection.streamEvents[stream.streamid].isAudioMuted) {
            stream.mute("audio");

            setTimeout(function () {
              looper(times);
            }, 50);
          }
        })();
      }
    }

    if (syncAction) {
      onSyncNeeded(stream.streamid, "unmute", unmuteType);
    }

    connection.streamEvents[stream.streamid].unmuteType = unmuteType;

    fireEvent(stream, "unmute", unmuteType);
  };
}

function onSyncNeeded(streamid: string, syncAction: SyncAction, muteType: MuteType) {}

export default {
  setHandlers,
  onSyncNeeded,
};
