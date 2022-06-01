import DetectRTC from "detectrtc";
import { Connection, Controller } from "../Connection";
import { RTCMultiConnection } from "./RTCMultiConnection";
import PeerInitiator from "./RTCPeerConnection";

const SKIP_PEERS = [
  "send",
  "forEach",
  "streams",
  "handler",
  "getLength",
  "getSkipPeerKey",
  "selectFirst",
  "getAllParticipants",
];

interface FileProgressBarInterface extends Controller {
  onFileProgress: (chunk) => void;
  onFileStart: (file) => void;
  onFileEnd: (file) => void;
}

export class LocalConfig {
  handler: MultiPeersHandler;
  connection: Connection;
  userid: string;
  streamsToShare: any;
  rtcMultiConnection: any;
  connectionDescription: any;
  localPeerSdpConstraints: any;
  remotePeerSdpConstraints: any;
  dontGetRemoteStream: any;
  dontAttachLocalStream: any;
  renegotiatingPeer: any;
  peerRef: any;
  channels: any;
  remoteSdp: any;
  constructor(
    remoteSdp,
    remoteUserId,
    userPreferences,
    connection: Connection
  ) {
    this.connection = connection;
    const preferences = userPreferences || {};
    this.handler = this.connection.get(
      "MultiPeersHandler"
    ) as MultiPeersHandler;
    this.remoteSdp = remoteSdp;
    this.streamsToShare = preferences.streamsToShare || {};
    this.rtcMultiConnection = this.handler.rtcMultiConnection;
    this.connectionDescription = preferences.connectionDescription;
    this.userid = remoteUserId;
    this.localPeerSdpConstraints = preferences.localPeerSdpConstraints;
    this.remotePeerSdpConstraints = preferences.remotePeerSdpConstraints;
    this.dontGetRemoteStream = !!preferences.dontGetRemoteStream;
    this.dontAttachLocalStream = !!preferences.dontAttachLocalStream;
    this.renegotiatingPeer = !!preferences.renegotiatingPeer;
    this.peerRef = preferences.peerRef;
    this.channels = preferences.channels || [];
  }

  onLocalSdp(localSdp) {
    this.handler.onNegotiationNeeded(localSdp, this.userid);
  }
  onLocalCandidate(localCandidate) {
    const candidate = OnIceCandidateHandler.processCandidates(
      this.connection,
      localCandidate
    );
    if (candidate) {
      this.handler.onNegotiationNeeded(candidate, this.userid);
    }
  }
  onDataChannelError(error) {
    this.handler.onDataChannelError(error, this.userid);
  }
  onDataChannelOpened(channel) {
    this.handler.onDataChannelOpened(channel, this.userid);
  }
  onDataChannelClosed(event) {
    this.handler.onDataChannelClosed(event, this.userid);
  }
  onRemoteStream(stream) {
    if (this.handler.multiPeers[this.userid]) {
      this.handler.multiPeers[this.userid].streams.push(stream);
    }
    this.handler.onGettingRemoteMedia(stream, this.userid);
  }
  onRemoteStreamRemoved(stream) {
    this.handler.onRemovingRemoteMedia(stream, this.userid);
  }
  onPeerStateChanged(states) {
    this.handler.onPeerStateChanged(states);

    if (states.iceConnectionState === "new") {
      this.handler.onNegotiationStarted(this.userid, states);
    }
    if (states.iceConnectionState === "connected") {
      this.handler.onNegotiationCompleted(this.userid, states);
    }
    if (states.iceConnectionState.search(/closed|failed/gi) !== -1) {
      this.handler.onUserLeft(this.userid);
      this.handler.disconnectWith(this.userid);
    }
  }
  onDataChannelMessage(message) {}
}

class MultiPeersHandler implements Controller {
  uuid?: string;
  rtcMultiConnection?: RTCMultiConnection;
  connection: Connection;
  multiPeers?: MultiPeers;
  fbr?: any;
  textReceiver?: any;
  constructor() {}
  setCore(connection: Connection) {
    this.connection = connection;
    this.rtcMultiConnection = this.connection.get(
      "RTCMultiConnection"
    ) as RTCMultiConnection;
    this.uuid = this.rtcMultiConnection.userid;
    this.multiPeers = new MultiPeers(this);
    this.textReceiver = TextReceiver(connection);
  }
  getLocalConfig(remoteSdp, remoteUserId, userPreferences) {
    return new LocalConfig(
      remoteSdp,
      remoteUserId,
      userPreferences,
      this.connection
    );
  }
  createNewPeer(remoteUserId, userPreferences) {
    const { session, isInitiator, maxParticipantsAllowed } =
      this.rtcMultiConnection;
    if (maxParticipantsAllowed <= this.multiPeers.getAllParticipants().length) {
      return;
    }
    const preferences = userPreferences || {};

    if (
      isInitiator &&
      !!session.audio &&
      session.audio === "two-way" &&
      !preferences.streamsToShare
    ) {
      preferences.isOneWay = false;
      preferences.isDataOnly = false;
      preferences.session = session;
    }

    if (!preferences.isOneWay && !preferences.isDataOnly) {
      preferences.isOneWay = true;
      return this.onNegotiationNeeded(
        {
          enableMedia: true,
          userPreferences: preferences,
        },
        remoteUserId
      );
    }

    this.createAnsweringPeer(null, remoteUserId, preferences);
  }
  createAnsweringPeer(remoteSdp, remoteUserId?: any, userPreferences?: any) {
    this.multiPeers[remoteUserId] = new PeerInitiator(
      this.getLocalConfig(
        remoteSdp,
        remoteUserId,
        this.rtcMultiConnection.setUserPreferences(
          userPreferences || {},
          remoteUserId
        )
      )
    );
  }
  renegotiatePeer(remoteUserId, userPreferences?: any, remoteSdp?: any) {
    if (!this.multiPeers[remoteUserId]) {
      if (this.rtcMultiConnection.enableLogs) {
        console.error(
          `Peer (${remoteUserId}) does not exist. Renegotiation skipped.`
        );
      }
      return;
    }
    const preferences = userPreferences || {};

    preferences.renegotiatingPeer = true;
    preferences.peerRef = this.multiPeers[remoteUserId].peer;
    preferences.channels = this.multiPeers[remoteUserId].channels;

    this.createAnsweringPeer(remoteSdp, remoteUserId, preferences);
  }
  replaceTrack(track, remoteUserId, isVideoTrack) {
    if (!this.multiPeers[remoteUserId]) {
      throw `This peer (${remoteUserId}) does not exist.`;
    }
    const { getSenders } = this.multiPeers[remoteUserId].peer;
    if (
      !!getSenders &&
      typeof getSenders === "function" &&
      getSenders().length
    ) {
      return getSenders().forEach((rtpSender) => {
        if (isVideoTrack && rtpSender.track.kind === "video") {
          this.multiPeers[remoteUserId].peer.lastVideoTrack = rtpSender.track;
          rtpSender.replaceTrack(track);
        }

        if (!isVideoTrack && rtpSender.track.kind === "audio") {
          this.multiPeers[remoteUserId].peer.lastAudioTrack = rtpSender.track;
          rtpSender.replaceTrack(track);
        }
      });
    }
    console.warn("RTPSender.replaceTrack is NOT supported.");
    this.renegotiatePeer(remoteUserId);
  }
  addNegotiatedMessage(message, remoteUserId) {
    const {
      type,
      sdp,
      candidate,
      enableMedia,
      readyForOffer,
      renegotiatingPeer,
    } = message || {};
    const peer = this.multiPeers[remoteUserId];
    const enableLogs = this.rtcMultiConnection.enableLogs;
    if (type && sdp) {
      if (type === "answer" && peer) {
        peer.addRemoteSdp(message);
      }
      if (type === "offer") {
        if (renegotiatingPeer) {
          this.renegotiatePeer(remoteUserId, null, message);
        } else {
          this.createAnsweringPeer(message, remoteUserId);
        }
      }
      if (enableLogs) {
        console.log(`Remote peer\'s sdp: ${sdp}`);
      }
      return;
    }
    if (candidate) {
      if (peer) {
        peer.addRemoteCandidate(message);
      }

      if (enableLogs) {
        console.log(`Remote peer\'s candidate pairs:${message.candidate}`);
      }
      return;
    }
    if (enableMedia) {
      this.rtcMultiConnection.session =
        message.userPreferences.session || this.rtcMultiConnection.session;
      const { session } = this.rtcMultiConnection;
      if (session.oneway && this.connection.attachStreams.length) {
        this.connection.attachStreams = [];
      }

      if (
        message.userPreferences.isDataOnly &&
        this.connection.attachStreams.length
      ) {
        this.connection.attachStreams = [];
      }

      this.onNegotiationNeeded(
        {
          userPreferences: this.connection.attachStreams.reduce(
            (streamsToShare, stream) => ({
              ...streamsToShare,
              [stream.streamid]: {
                isAudio: !!stream.isAudio,
                isVideo: !!stream.isVideo,
                isScreen: !!stream.isScreen,
              },
            }),
            {}
          ),
          readyForOffer: true,
        },
        remoteUserId
      );
    }
    if (readyForOffer) {
      this.rtcMultiConnection.onReadyForOffer(
        remoteUserId,
        message.userPreferences
      );
    }
  }
  onLocalMediaError(error, constraints) {
    this.rtcMultiConnection.onMediaError(error, constraints);
  }
  shareFile(file, remoteUserId) {
    this.fbr = new FileBufferReader();
    const fileProgressBar = this.connection.get(
      "FileProgressBarHandler"
    ) as FileProgressBarInterface;
    this.fbr.onProgress = (chunk) => fileProgressBar.onFileProgress(chunk);
    this.fbr.onBegin = (file) => fileProgressBar.onFileStart(file);
    this.fbr.onEnd = (file) => fileProgressBar.onFileEnd(file);

    this.fbr.readAsArrayBuffer(
      file,
      (uuid) => {
        const arrayOfUsers = remoteUserId
          ? [remoteUserId]
          : this.multiPeers.getAllParticipants();

        arrayOfUsers.forEach((participant) => {
          this.fbr.getNextChunk(uuid, (nextChunk) => {
            this.multiPeers[participant].channels.forEach((channel) =>
              channel.send(nextChunk)
            );
          });
        });
      },
      {
        userid: this.rtcMultiConnection.userid,
        chunkSize:
          DetectRTC.browser.name === "Firefox"
            ? 15 * 1000
            : this.rtcMultiConnection.chunkSize || 0,
      }
    );
  }
  onDataChannelMessage(message, remoteUserId) {
    this.textReceiver.receive(
      JSON.parse(message),
      remoteUserId,
      this.multiPeers[remoteUserId]
    );
  }
  onDataChannelClosed(event, remoteUserId) {
    this.rtcMultiConnection.onclose({
      ...event,
      userid: remoteUserId,
      extra: this.multiPeers[remoteUserId]
        ? this.multiPeers[remoteUserId].extra
        : {},
    });
  }
  onDataChannelError(error, remoteUserId) {
    this.rtcMultiConnection.onerror({
      ...error,
      userid: remoteUserId,
      extra: this.multiPeers[remoteUserId]
        ? this.multiPeers[remoteUserId].extra
        : {},
    });
  }
  onDataChannelOpened(channel, remoteUserId) {
    if (this.multiPeers[remoteUserId].channels.length) {
      this.multiPeers[remoteUserId].channels = [channel];
      return;
    }
    this.multiPeers[remoteUserId].channels.push(channel);
    this.rtcMultiConnection.onopen({
      channel,
      extra: this.multiPeers[remoteUserId]
        ? this.multiPeers[remoteUserId].extra
        : {},
      userid: remoteUserId,
    });
  }
  onPeerStateChanged(state) {
    this.rtcMultiConnection.onPeerStateChanged(state);
  }
  getRemoteStreams(remoteUserId) {
    const userid = remoteUserId || this.multiPeers.selectFirst().shift();
    return this.multiPeers[userid] ? this.multiPeers[userid].streams : [];
  }
  onNegotiationNeeded(message, remoteUserId) {}
  onGettingRemoteMedia(stream, remoteUserId) {}
  onRemovingRemoteMedia(stream, remoteUserId) {}
  onGettingLocalMedia(localStream) {}
  onNegotiationStarted(remoteUserId, states) {}
  onNegotiationCompleted(remoteUserId, states) {}
}

class MultiPeers {
  handler: MultiPeersHandler;
  constructor(multiPeersHandler: MultiPeersHandler) {
    this.handler = multiPeersHandler;
  }

  getSkipPeerKey(filter = (key) => !!key) {
    return Object.keys(this).filter(
      (key) => SKIP_PEERS.indexOf(key) === -1 && filter(key)
    );
  }
  getLength() {
    return this.getSkipPeerKey().length;
  }
  selectFirst() {
    return this[this.getSkipPeerKey().shift()];
  }
  getAllParticipants(sender?: string) {
    return this.getSkipPeerKey((key) => key !== sender);
  }
  forEach(callback) {
    this.getAllParticipants().forEach((participant) =>
      callback(this[participant])
    );
  }
  send(data: any | string, remoteUserId) {
    if (!isNull(data.size) && !isNull(data.type)) {
      if (this.handler.connection.enableFileSharing) {
        return this.handler.rtcMultiConnection.shareFile(data, remoteUserId);
      }

      if (typeof data !== "string") {
        data = JSON.stringify(data);
      }
    }

    if (
      data.type !== "text" &&
      !(data instanceof ArrayBuffer) &&
      !(data instanceof DataView)
    ) {
      TextSender.send({
        remoteUserId,
        text: data,
        channel: this,
        connection: this.handler.connection,
      });
    }

    if (data.type === "text") {
      data = JSON.stringify(data);
    }

    if (remoteUserId) {
      const remoteUser = this[remoteUserId];
      if (remoteUser) {
        if (!remoteUser.channels.length) {
          remoteUser.createDataChannel();
          this.handler.rtcMultiConnection.renegotiate(remoteUserId);
          setTimeout(() => this.send(data, remoteUserId), 3000);
          return;
        }

        remoteUser.channels.forEach((channel) => channel.send(data));
        return;
      }
    }

    this.getAllParticipants().forEach((participant) => {
      if (!this[participant].channels.length) {
        this[participant].createDataChannel();
        this.handler.rtcMultiConnection.renegotiate(remoteUserId);
        setTimeout(
          () =>
            this[participant].channels.forEach((channel) => channel.send(data)),
          3000
        );
        return;
      }
      this[participant].channels.forEach((channel) => channel.send(data));
    });
  }
}
