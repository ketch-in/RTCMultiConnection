import { CodecNumber } from "./types";

export const CODEC_TABLE: { [key: string]: keyof CodecNumber } = {
  vp8: "vp8LineNumber",
  vp9: "vp9LineNumber",
  h264: "h264LineNumber",
};

export const ERROR_MESSAGE = {
  BANDWIDTH_ERROR_NO_SCRREN:
    "It seems that you are not using bandwidth for screen. Screen sharing is expected to fail.",
  BANDWIDTH_ERROR_NOT_SUPPORT_WIDTH:
    "It seems that you are using wrong bandwidth value for screen. Screen sharing is expected to fail.",
};
