// Last time updated: 2017-08-27 5:48:35 AM UTC

// ________________
// FileBufferReader

// Open-Sourced: https://github.com/muaz-khan/FileBufferReader

// --------------------------------------------------
// Muaz Khan     - www.MuazKhan.com
// MIT License   - www.WebRTC-Experiment.com/licence
// --------------------------------------------------

import "./FileSelector";
import FileBufferReceiver from "./FileBufferReceiver";

import { pack, unpack, serialize, deserialize, fbrClone } from "./utils";

import { TYPES, DEBUG, BIG_ENDIAN, LITTLE_ENDIAN } from "./constants";
import FileBufferReaderHelper from "./FileBufferReaderHelper";
import { Chunk, ChunkString } from "./types";
import { fileConverter } from "./FileConverter";

export default class FileBufferReader {
  chunks: { [uuid: string]: Chunk };
  users: { [userid: string]: any };
  fbrHelper: FileBufferReaderHelper;
  fbReceiver: FileBufferReceiver;

  constructor() {
    if (DEBUG) {
      (window as Window & { Test?: any }).Test = {
        TYPES,
        BIG_ENDIAN,
        LITTLE_ENDIAN,
        pack,
        unpack,
        serialize,
        deserialize,
      };
    }
    this.chunks = {};
    this.users = {};
    this.fbrHelper = new FileBufferReaderHelper(this);
    this.fbReceiver = new FileBufferReceiver(this);
  }

  readAsArrayBuffer(
    file: { extra: { [x: string]: any } },
    callback: any,
    extra: any
  ) {
    this.fbrHelper.readAsArrayBuffer({
      file,
      extra: {
        ...(extra || {
          userid: 0,
        }),
        ...file?.extra,
      },
      earlyCallback: (uuid: ChunkString) => {
        callback(
          fbrClone(uuid, {
            currentPosition: -1,
          } as ChunkString)
        );
      },
    });
  }

  chunkMissing(chunk: Chunk) {
    delete this.fbReceiver.chunks[chunk.uuid];
  }

  addChunk(chunk: Chunk, callback: any) {
    if (!chunk) {
      return;
    }

    this.fbReceiver.receive(chunk, (chunk: Chunk) =>
      fileConverter.convertToArrayBuffer(
        {
          uuid: chunk.uuid,
          currentPosition: chunk.currentPosition,
          readyForNextChunk: true,
        },
        callback
      )
    );
  }

  getNextChunk(
    fileUUID: string | Chunk,
    callback: (buffer: ArrayBuffer, isEnd?: boolean) => void,
    userid: string,
    currentPosition?: number
  ) {
    if (typeof fileUUID !== "string") {
      return this.getNextChunk(
        fileUUID.uuid,
        callback,
        userid,
        fileUUID.currentPosition
      );
    }

    let position = currentPosition;

    const allFileChunks = this.chunks[fileUUID];

    if (!allFileChunks) {
      return;
    }

    if (typeof userid !== "undefined") {
      if (!this.users[userid + ""]) {
        this.users[userid + ""] = {
          fileUUID: fileUUID,
          userid: userid,
          currentPosition: -1,
        };
      }

      if (typeof currentPosition !== "undefined") {
        this.users[userid + ""].currentPosition = currentPosition;
      }

      this.users[userid + ""].currentPosition++;
      currentPosition = this.users[userid + ""].currentPosition;
    } else {
      if (typeof currentPosition !== "undefined") {
        this.chunks[fileUUID].currentPosition = currentPosition;
      }

      this.chunks[fileUUID].currentPosition++;
      currentPosition = this.chunks[fileUUID].currentPosition;
    }

    const chunk = allFileChunks[currentPosition] as Chunk | undefined;
    if (!chunk) {
      delete this.chunks[fileUUID];
      return fileConverter.convertToArrayBuffer(
        {
          chunkMissing: true,
          currentPosition: currentPosition,
          uuid: fileUUID,
        },
        callback
      );
    }

    const nextChunk = fbrClone(chunk);

    if (typeof userid !== "undefined") {
      nextChunk.remoteUserId = userid + "";
    }

    if (!!nextChunk.start) {
      this.onBegin(nextChunk);
    }

    if (!!nextChunk.end) {
      this.onEnd(nextChunk);
    }

    this.onProgress(nextChunk);

    fileConverter.convertToArrayBuffer(nextChunk, (buffer: ArrayBuffer) =>
      callback(buffer, nextChunk.currentPosition === nextChunk.maxChunks)
    );
  }

  onBegin(args?: any) {}
  onEnd(args?: any) {}
  onProgress(args?: any) {}
  // for backward compatibility----it is redundant.
  setMultipleUsers(args?: any) {}
}

export const fileBufferReader = new FileBufferReader();

(window as Window & { fileBufferReader?: FileBufferReader }).fileBufferReader =
  fileBufferReader;
