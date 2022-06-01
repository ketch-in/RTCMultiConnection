import { LocalConfig } from "./MultiPeers";

export default class CustomChannel extends RTCDataChannel {
  constructor() {
    super();
  }

  setLocalConfig(localConfig: LocalConfig) {
    this.binaryType = "arraybuffer";
    this.onmessage = ({ data }) => localConfig.onDataChannelMessage(data);
    this.onopen = () => localConfig.onDataChannelOpened(this);
    this.onerror = (error) => localConfig.onDataChannelError(error);
    this.onclose = (e) => localConfig.onDataChannelClosed(e);
    this.send = (data) => {
      if (this.readyState !== "open") {
        return;
      }
      super.send(data);
    };
  }
}

// const p = new RTCPeerConnection();
// const c = p.createDataChannel("st", {}) as CustomChannel;
// c.setLocalConfig(
//   new LocalConfig(2, 2, 2, new Connection({ roomId: "1", forceOptions: {} }))
// );
