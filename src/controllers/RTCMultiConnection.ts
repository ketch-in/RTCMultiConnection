import { Connection, Controller } from "../Connection";

export class RTCMultiConnection implements Controller {
  connection?: Connection;

  userid;
  sessionid;
  socketMessageEvent;
  socketCustomEvent;
  autoCloseEntireSession;
  session;
  maxParticipantsAllowed;
  enableScalableBroadcast;
  maxRelayLimitPerUser;
  socketCustomParameters;
  socketURL;
  enableLogs;

  constructor() {}
  setCore(connection: Connection) {
    this.connection = connection;
  }

  onUserStatusChanged(
    event: { userId: string; status: string },
    dontWriteLogs: boolean
  ) {
    if (this.enableLogs && !dontWriteLogs) {
      console.info(event.userId, event.status);
    }
  }

  onExtraDataUpdated(event) {
    this.onUserStatusChanged({ ...event, status: "online" }, true);
  }
}
