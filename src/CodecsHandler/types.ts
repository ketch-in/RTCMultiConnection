export interface CodecNumber {
  vp8LineNumber?: string;
  vp9LineNumber?: string;
  h264LineNumber?: string;
}

export interface Info extends CodecNumber {
  videoCodecNumbers: string[];
  videoCodecNumbersOriginal?: string;
}

export interface Codec {
  mimeType?: string;
}

export interface Sender {
  getParameters: () => { codecs: Codec[] };
  setParameters: ({ codecs }: { codecs: Codec[] }) => void;
}

export interface Peer {
  getSenders: () => Sender[];
}

export interface Bitrate {
  min?: string;
  max?: string;
}

export interface Attributes {
  stereo?: string;
  "sprop-stereo"?: string;
  maxaveragebitrate?: number;
  maxplaybackrate?: number;
  cbr?: string;
  useinbandfec?: string;
  usedtx?: string;
  maxptime?: string;
}

export interface BandWidth {
  audio: boolean;
  video: boolean;
  screen: number;
}

export type CodecName = "vp8" | "vp9" | "h264";
