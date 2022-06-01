import io from "socket.io/client-dist/socket.io";
import { Connection, SessionInterface } from "../Connection";

function isData(session: SessionInterface) {
  return !session.audio && !session.video && !session.screen && session.data;
}

function toQueries(connection: Connection) {
  const queries = [
    `userid=${rtcMultiConnection.userid}`,
    `sessionid=${rtcMultiConnection.sessionid}`,
    `msgEvent=${rtcMultiConnection.socketMessageEvent}`,
    `socketCustomEvent=${rtcMultiConnection.socketCustomEvent}`,
    `autoCloseEntireSession=${!!rtcMultiConnection.autoCloseEntireSession}`,
  ];

  if (connection.session.broadcast === true) {
    queries.push("oneToMany=true");
  }

  queries.push(`maxParticipantsAllowed=${connection.maxParticipantsAllowed}`);

  if (connection.enableScalableBroadcast) {
    queries.push("enableScalableBroadcast=true");
    queries.push(
      `maxRelayLimitPerUser=${connection.maxRelayLimitPerUser || 2}`
    );
  }

  queries.push(`extra=${JSON.stringify(connection.extra || {})}`);

  if (connection.socketCustomParameters) {
    queries.push(connection.socketCustomParameters);
  }

  return "?" + queries.join("&");
}

function socketConnection(
  connection: Connection,
  connectCallback?: (io) => void
) {
  const rtcMultiConnection = connection.get("RTCMultiConnection");
  

  if (!connection.socketURL) {
    connection.socketURL = "/";
  }

  if (
    connection.socketURL.substring(connection.socketURL.length - 1, 1) != "/"
  ) {
    // connection.socketURL = 'https://domain.com:9001/';
    throw '"socketURL" MUST end with a slash.';
  }

  if (connection.enableLogs) {
    if (connection.socketURL == "/") {
      console.info("socket.io url is: ", location.origin + "/");
    } else {
      console.info("socket.io url is: ", connection.socketURL);
    }
  }

  const queries = toQueries(connection);
  connection.socket = io(connection.socketURL + queries);
}
