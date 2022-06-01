import { CODEC_TABLE } from "./constants";
import { Info, Peer, CodecName } from "./types";

export function splitLines(sdp = "") {
  return sdp.split("\n").reduce(
    (info: Info, line) => {
      if (line.indexOf("m=video") === 0) {
        const codecNumbers = line
          .split("SAVPF")[1]
          .split(" ")
          .map((codecNumber) => codecNumber.trim())
          .filter((codecNumber) => codecNumber);
        info.videoCodecNumbers.push(...codecNumbers);
        if (codecNumbers.length > 0) {
          info.videoCodecNumbersOriginal = line;
        }
      }

      const codecNumber = line.replace("a=rtpmap:", "").split(" ").shift();

      if (line.indexOf("VP8/90000") !== -1 && !info.vp8LineNumber) {
        info.vp8LineNumber = codecNumber;
      }

      if (line.indexOf("VP9/90000") !== -1 && !info.vp9LineNumber) {
        info.vp9LineNumber = codecNumber;
      }

      if (line.indexOf("H264/90000") !== -1 && !info.h264LineNumber) {
        info.h264LineNumber = codecNumber;
      }

      return info;
    },
    { videoCodecNumbers: [] }
  );
}

export function extractSdp(line: string, pattern: RegExp) {
  const result = line.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

export function preferCodecHelper(
  sdp: string,
  codecName: CodecName,
  info: Info,
  ignore?: boolean
) {
  if (
    (codecName === "vp8" && !info.vp8LineNumber) ||
    (codecName === "vp9" && !info.vp9LineNumber) ||
    (codecName === "h264" && !info.h264LineNumber)
  ) {
    return sdp;
  }

  const preferCodecNumber = info[CODEC_TABLE[codecName]];
  const newLine =
    info.videoCodecNumbersOriginal.split("SAVPF").shift() + "SAVPF ";

  const newOrder = ignore ? [] : [preferCodecNumber];
  newOrder.push(
    ...info.videoCodecNumbers.filter(
      (codecNumber) => codecNumber !== preferCodecNumber
    )
  );

  return sdp.replace(
    info.videoCodecNumbersOriginal,
    newLine + newOrder.join(" ")
  );
}

// Find the line in sdpLines[startLine...endLine - 1] that starts with |prefix|
// and, if specified, contains |substr| (case-insensitive search).
export function findLineInRange(
  sdpLines: string[],
  startLine: number,
  endLine: number,
  prefix: string,
  substr?: string
) {
  const end = endLine !== -1 ? endLine : sdpLines.length;

  for (let i = startLine; i < end; ++i) {
    const line = sdpLines[i];
    if (
      line.indexOf(prefix) === 0 &&
      (!substr || line.toLowerCase().indexOf(substr.toLowerCase()) !== -1)
    ) {
      return i;
    }
  }
  return null;
}

// Find the line in sdpLines that starts with |prefix|, and, if specified,
// contains |substr| (case-insensitive search).
export function findLine(sdpLines: string[], prefix: string, substr?: string) {
  return findLineInRange(sdpLines, 0, -1, prefix, substr);
}

// Gets the codec payload type from an a=rtpmap:X line.
export function getCodecPayloadType(sdpLine: string) {
  const result = sdpLine.match(/a=rtpmap:(\d+) \w+\/\d+/);
  return result && result.length === 2 ? result[1] : null;
}

export function prioritize(codecMimeType: string, peer: Peer) {
  peer.getSenders().forEach((sender) => {
    const params = sender.getParameters();
    for (let i = 0; i < params.codecs.length; i++) {
      if (params.codecs[i].mimeType === codecMimeType) {
        params.codecs.unshift(...params.codecs.splice(i, 1));
        break;
      }
    }
    sender.setParameters(params);
  });
}

export function checkFirefox() {
  return (
    navigator.userAgent.toLowerCase().indexOf("firefox") > -1 &&
    "netscape" in window &&
    / rv:/.test(navigator.userAgent)
  );
}
