import { getRandomString, isString } from "../utils";

export default class TextSender {
  isObject: boolean;
  uuid: string;
  sendingTime: number;
  packetSize: number;
  remoteUserId:string;
  

  send(config) {
    const { connection, channel, remoteUserId, text } = config;
    const initialText = isString(text) ? text : JSON.stringify(text);
    const { chunkSize = 1000 } = connection;
    this.packetSize = chunkSize;
    this.isObject = !isString(text);
    this.uuid = getRandomString();
    this.sendingTime = new Date().getTime();
    this.channel = channel;
    this.remoteUserId = remoteUserId;

    this.sendText(initialText);
  }
  sendText(textMessage: string | null, text?: string) {}
}
