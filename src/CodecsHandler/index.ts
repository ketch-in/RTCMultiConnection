import { ERROR_MESSAGE } from "./constants";
import { Attributes, BandWidth, Bitrate, CodecName } from "./types";
import {
  findLine,
  extractSdp,
  splitLines,
  checkFirefox,
  preferCodecHelper,
  getCodecPayloadType,
} from "./utils";

const { BANDWIDTH_ERROR_NO_SCRREN, BANDWIDTH_ERROR_NOT_SUPPORT_WIDTH } =
  ERROR_MESSAGE;

export default class CodecsHandler {
  private sdp: string;

  constructor(sdp: string) {
    this.sdp = sdp;
  }

  private toLines() {
    return this.sdp.split("\r\n");
  }

  removeVPX() {
    const info = splitLines(this.sdp);

    // last parameter below means: ignore these codecs
    return preferCodecHelper(
      preferCodecHelper(this.sdp, "vp9", info, true),
      "vp8",
      info,
      true
    );
  }

  disableNACK() {
    return this.sdp
      .replace("a=rtcp-fb:126 nack\r\n", "")
      .replace("a=rtcp-fb:126 nack pli\r\n", "a=rtcp-fb:126 pli\r\n")
      .replace("a=rtcp-fb:97 nack\r\n", "")
      .replace("a=rtcp-fb:97 nack pli\r\n", "a=rtcp-fb:97 pli\r\n");
  }

  removeNonG722() {
    return this.sdp.replace(
      /m=audio ([0-9]+) RTP\/SAVPF ([0-9 ]*)/g,
      "m=audio $1 RTP/SAVPF 9"
    );
  }
  setApplicationSpecificBandwidth(bandwidth: BandWidth, isScreen: boolean) {
    const isFirefox = checkFirefox();

    if (!bandwidth || (typeof isFirefox !== "undefined" && isFirefox)) {
      return this.sdp;
    }

    if (isScreen) {
      if (!bandwidth.screen) {
        console.warn(BANDWIDTH_ERROR_NO_SCRREN);
      } else if (bandwidth.screen < 300) {
        console.warn(BANDWIDTH_ERROR_NOT_SUPPORT_WIDTH);
      }
    }

    // if screen; must use at least 300kbs
    if (bandwidth.screen && isScreen) {
      return this.sdp
        .replace(/b=AS([^\r\n]+\r\n)/g, "")
        .replace(
          /a=mid:video\r\n/g,
          "a=mid:video\r\nb=AS:" + bandwidth.screen + "\r\n"
        );
    }

    // remove existing bandwidth lines
    if (bandwidth.audio || bandwidth.video) {
      return this.sdp.replace(/b=AS([^\r\n]+\r\n)/g, "");
    }

    if (bandwidth.audio) {
      return this.sdp.replace(
        /a=mid:audio\r\n/g,
        "a=mid:audio\r\nb=AS:" + bandwidth.audio + "\r\n"
      );
    }

    if (bandwidth.screen) {
      return this.sdp.replace(
        /a=mid:video\r\n/g,
        "a=mid:video\r\nb=AS:" + bandwidth.screen + "\r\n"
      );
    }

    if (bandwidth.video) {
      return this.sdp.replace(
        /a=mid:video\r\n/g,
        "a=mid:video\r\nb=AS:" + bandwidth.video + "\r\n"
      );
    }

    return this.sdp;
  }

  setVideoBitrates(params: Bitrate = {}) {
    const sdpLines = this.toLines();

    const v8Index = findLine(sdpLines, "a=rtpmap", "VP8/90000");
    const vp8Payload = v8Index ? getCodecPayloadType(sdpLines[v8Index]) : null;

    if (!vp8Payload) {
      return this.sdp;
    }

    const rtxIndex = findLine(sdpLines, "a=rtpmap", "VP8/90000");
    const rtxPayload = rtxIndex
      ? getCodecPayloadType(sdpLines[rtxIndex])
      : null;

    // TODO : 원래는 rtxIndex인데 위 패턴을 보면 rtxPayload 값이 없을 경우가 맞는 듯.
    if (!rtxPayload) {
      return this.sdp;
    }

    const rtxFmtpLineIndex = findLine(
      sdpLines,
      "a=fmtp:" + rtxPayload.toString()
    );

    if (!rtxFmtpLineIndex) {
      return this.sdp;
    }

    sdpLines[rtxFmtpLineIndex] = sdpLines[rtxFmtpLineIndex].concat(
      `\r\na=fmtp:${vp8Payload} x-google-min-bitrate=${
        params.min || "228"
      }; x-google-max-bitrate=${params.max || "228"}`
    );

    return sdpLines.join("\r\n");
  }

  setOpusAttributes(params: Attributes = {}) {
    const sdpLines = this.toLines();

    const opusIndex = findLine(sdpLines, "a=rtpmap", "opus/48000");
    const opusPayload = opusIndex
      ? getCodecPayloadType(sdpLines[opusIndex])
      : null;

    if (!opusPayload) {
      return this.sdp;
    }

    const opusFmtpLineIndex = findLine(
      sdpLines,
      "a=fmtp:" + opusPayload.toString()
    );

    if (opusFmtpLineIndex === null) {
      return this.sdp;
    }

    const appendOpusNext = [
      `; stereo=${typeof params.stereo !== "undefined" ? params.stereo : "1"}`,
      `; sprop-stereo=${
        typeof params["sprop-stereo"] !== "undefined"
          ? params["sprop-stereo"]
          : "1"
      }`,
    ];

    if (!params.maxaveragebitrate) {
      appendOpusNext.push(
        `; maxaveragebitrate=${params.maxaveragebitrate || 128 * 1024 * 8}`
      );
    }

    if (!params.maxplaybackrate) {
      appendOpusNext.push(
        `; maxplaybackrate=${params.maxplaybackrate || 128 * 1024 * 8}`
      );
    }

    if (typeof params.cbr != "undefined") {
      appendOpusNext.push(
        `'; cbr=${typeof params.cbr != "undefined" ? params.cbr : "1"}`
      );
    }

    if (typeof params.useinbandfec != "undefined") {
      appendOpusNext.push(`'; useinbandfec=${params.useinbandfec}`);
    }

    if (typeof params.usedtx != "undefined") {
      appendOpusNext.push(`'; usedtx=${params.usedtx}`);
    }

    if (typeof params.maxptime != "undefined") {
      appendOpusNext.push(`'\r\na=maxptime:${params.maxptime}`);
    }

    sdpLines[opusFmtpLineIndex] = sdpLines[opusFmtpLineIndex].concat(
      appendOpusNext.join("")
    );

    return sdpLines.join("\r\n");
  }
  preferCodec(codecName: CodecName) {
    const info = splitLines(this.sdp);

    if (
      !info.videoCodecNumbers ||
      (codecName === "vp8" &&
        info.vp8LineNumber === info.videoCodecNumbers[0]) ||
      (codecName === "vp9" &&
        info.vp9LineNumber === info.videoCodecNumbers[0]) ||
      (codecName === "h264" &&
        info.h264LineNumber === info.videoCodecNumbers[0])
    ) {
      return this.sdp;
    }

    return preferCodecHelper(this.sdp, codecName, info);
  }
  preferVP9() {
    return this.preferCodec("vp9");
  }

  // forceStereoAudio => via webrtcexample.com
  // requires getUserMedia => echoCancellation:false
  forceStereoAudio() {
    const sdpLines = this.toLines();
    const opusPayload = extractSdp(
      sdpLines.find((line) => line.search("opus/48000") !== -1),
      /:(\d+) opus\/48000/i
    );
    const fmtpLineIndex = sdpLines.findIndex((line) => {
      if (line.search("a=fmtp") !== -1) {
        const payload = extractSdp(line, /a=fmtp:(\d+)/);
        return payload === opusPayload;
      }
    });

    if (fmtpLineIndex === null) {
      return this.sdp;
    }

    sdpLines[fmtpLineIndex] = sdpLines[fmtpLineIndex].concat(
      "; stereo=1; sprop-stereo=1"
    );

    return sdpLines.join("\r\n");
  }
}
