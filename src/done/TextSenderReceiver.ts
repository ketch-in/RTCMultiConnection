import type { RTCMultiConnection } from "./types";
import { getRandomString, isString } from "../utils";

interface SendConfig {
  text: string;
  channel: any;
  connection: RTCMultiConnection;
  remoteUserId: string;
}

interface SendData {
  type: string;
  uuid: string;
  sendingTime: number;
  message: string;
  packets?: number;
  last?: boolean;
  isobject?: boolean;
}

interface ReceiveContentMap {
  [uuid: string]: string[];
}

interface MessageEvent {
  data: string;
  original?: string;
  userid: string;
  extra: any;
  latency: number;
}

function send({ connection, channel, remoteUserId, text: initialText }: SendConfig) {
  const packetSize = connection.chunkSize || 1000;
  let textToTransfer = "";
  let isobject = false;

  if (!isString(initialText)) {
    isobject = true;
    initialText = JSON.stringify(initialText);
  }

  // uuid is used to uniquely identify sending instance
  const uuid = getRandomString();
  const sendingTime = new Date().getTime();

  sendText(initialText);

  function sendText(textMessage: string | null, text?: string) {
    const data: SendData = {
      type: "text",
      uuid: uuid,
      sendingTime: sendingTime,
      message: "",
    };

    if (textMessage) {
      text = textMessage;
      data.packets = text.length / packetSize;
    }

    if (!text) {
      return;
    }

    if (text.length > packetSize) {
      data.message = text.slice(0, packetSize);
    } else {
      data.message = text;
      data.last = true;
      data.isobject = isobject;
    }

    channel.send(data, remoteUserId);

    textToTransfer = text.slice(data.message.length);
    if (textToTransfer.length) {
      setTimeout(() => {
        sendText(null, textToTransfer);
      }, connection.chunkInterval || 100);
    }
  }
}

export const TextSender = { send };

export class TextReceiver {
  content: ReceiveContentMap;
  connection: RTCMultiConnection;

  constructor(connection: RTCMultiConnection) {
    this.content = {};
    this.connection = connection;
  }

  receive(data: SendData, userid: string, extra: any) {
    const uuid = data.uuid;
    if (!this.content[uuid]) {
      this.content[uuid] = [];
    }

    this.content[uuid].push(data.message);

    if (data.last) {
      let message = this.content[uuid].join("");
      if (data.isobject) {
        message = JSON.parse(message);
      }

      // latency detection
      const receivingTime = new Date().getTime();
      const latency = receivingTime - data.sendingTime;

      const e: MessageEvent = {
        data: message,
        userid: userid,
        extra: extra,
        latency: latency,
      };

      if (this.connection.autoTranslateText) {
        e.original = e.data;
        this.connection.Translator.TranslateText(e.data, translatedText => {
          e.data = translatedText;
          this.connection.onmessage(e);
        });
      } else {
        this.connection.onmessage(e);
      }

      delete this.content[uuid];
    }
  }
}
