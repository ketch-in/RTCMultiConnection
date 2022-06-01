import DetectRTC from "detectrtc";
import { getTracks } from "../utils";
import CustomChannel from "./Channel";
import { LocalConfig } from "./MultiPeers";
import { RTCMultiConnection } from "./RTCMultiConnection";

export class CustomMediaStream extends MediaStream {
  id:string;
  isAudio:boolean;
  isVideo:boolean;
  isScreen:boolean;
  streamid:string;
  mediaStream:MediaStream;
  constructor(mediaStream:MediaStream){
    super()
    this.mediaStream = mediaStream;
    this.id = this.mediaStream.id;
  }
}

interface StreamToShareInterface {
  isAudio: boolean;
    isVideo: boolean;
    isScreen: boolean;
}

interface StreamsToShareInterface {
  [id: string]: StreamToShareInterface;
}

interface ExtraInterface {
  fullName: string;
  joinedAt: Date;
}

interface CustomMedia extends MediaStream{
  isAudio:boolean;
  isVideo:boolean;
  isScreen:boolean;
  streamid:string;
}

export default class CustomRTCPeerConnection extends RTCPeerConnection {
  config?: LocalConfig;
  extra?: ExtraInterface;
  dontDuplicate?: string[];
  streamsToShare?: StreamsToShareInterface;
  streams?:MediaStream[];
  allRemoteStreams?:CustomMedia[];

  constructor(configuration?: RTCConfiguration) {
    super(configuration);
    this.dontDuplicate = [];
    this.streams = [];
  }

  getStreamsToShare():StreamsToShareInterface{
    return this.config?.remoteSdp?.streamsToShare || this.config?.streamsToShare || {}
  }

  getStreamToShare(id:string):StreamToShareInterface{
    return this.getStreamsToShare()[id]
  }

  setLocalConfig(localConfig: LocalConfig) {


    const connection = this.config.rtcMultiConnection;
    this.config = localConfig;
    this.extra = this.config.remoteSdp
      ? this.config.remoteSdp.extra
      : connection.extra;

    this.onicecandidate = (e) => {};

    this.onicecandidate = (e) => {
      if (e.candidate && !connection.trickleIce) {
        return;
      }
      if (e.candidate) {
        this.config.onLocalCandidate(e.candidate);
        return;
      }
      if (connection.trickleIce) {
        return;
      }
      const localSdp = this.localDescription;
      this.config.onLocalSdp({
        type: localSdp.type,
        sdp: localSdp.sdp,
        remotePeerSdpConstraints: this.config.remotePeerSdpConstraints || false,
        renegotiatingPeer: !!this.config.renegotiatingPeer || false,
        connectionDescription: this.config.connectionDescription,
        dontGetRemoteStream: !!this.config.dontGetRemoteStream,
        extra: connection ? connection.extra : {},
        streamsToShare: this.getStreamsToShare(),
      });
    };

    this.oniceconnectionstatechange = this.onsignalingstatechange = () => {
      const {iceConnectionState} = this;
        this.config.onPeerStateChanged({
          iceConnectionState,
          extra:this.extra,
          userid:this.config.userid,
          signalingState:this.signalingState,
          iceGatheringState:this.iceGatheringState,
        })
        
        if(!!iceConnectionState && iceConnectionState.search(/closed|failed/gi) !== -1){
          this.streams.forEach((stream)=>connection.onstreamended(connection.streamEvents[stream.id] || {
            stream,
            type:"remote",
            streamid:stream.id,
          }))
        }
    }

    this.ontrack = (e) =>{
      if(!e || e.type !== "track"){
        return;
      }
      const {track, streams}  =e;
      
      const stream = streams[streams.length - 1]
      const id = stream.id || track.id;
      const streamid = id;
      
      if(this.dontDuplicate[id] && DetectRTC.browser.name !== "Safari") {
        if(track){
          track.onended = ()=>this.onremovestream(e)
        }
        return;
      }

      this.dontDuplicate.push(id)
      
      const streamToShare = this.getStreamToShare(id) || {
        isVideo:!!getTracks(stream, "video").length,
        isAudio:true,
        isScreen:false
      }
      
      
    }

    this.ontrack = (e) => {
      if (!e || e.type !== "track") {
        return;
      }
      const stream =  e.streams[e.streams.length - 1].clone();
      if (!stream.id) {
        stream.id = e.track.id;
      }
      if (
        this.dontDuplicate.includes(stream.id) &&
        DetectRTC.browser.name !== "Safari"
      ) {
        if (e.track) {
          e.track.onended = () => {
            this.onremovestream(e);
          };
        }
        return;
      }
      this.dontDuplicate.push(stream.id);
      if (config.remoteSdp && config.remoteSdp.streamsToShare) {
        this.streamsToShare = config.remoteSdp.streamsToShare;
      } else if (config.streamsToShare) {
        this.streamsToShare = config.streamsToShare;
      }
      const streamToShare = this.streamsToShare[stream.id];
			stream.
      if (streamToShare) {
        stream.isAudio = streamToShare.isAudio;
        stream.isVideo = streamToShare.isVideo;
        stream.isScreen = streamToShare.isScreen;
      } else {
        stream.isVideo = !!getTracks(stream, "video").length;
        stream.isAudio = !stream.isVideo;
        stream.isScreen = false;
      }
    };

  }

  createDataChannel() {
    if (!this.config) {
      throw "LocalConfig가 없습니다. 먼저 setLocalConfig를 호출해주세요.";
    }
    const channel = super.createDataChannel("sctp", {}) as CustomChannel;
    channel.setLocalConfig(this.config);
    this.channel = channel;
    return this.channel;
  }
  getRemoteStreams() {
    const stream = new MediaStream();
    this.getReceivers().forEach((receiver) => stream.addTrack(receiver.track));
    return [stream];
  }
  getLocalStreams() {
    const stream = new MediaStream();
    this.getSenders().forEach((sender) => stream.addTrack(sender.track));
    return [stream];
  }
}
