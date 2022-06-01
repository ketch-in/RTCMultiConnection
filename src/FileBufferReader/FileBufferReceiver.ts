import { fileConverter } from "./FileConverter";

import { merge } from "./utils";

import { Chunk } from "./types";
import FileBufferReader from ".";

export default class FileBufferReceiver {
  fbr: FileBufferReader;
  chunks: { [uuid: string]: Chunk };
  constructor(fbr: FileBufferReader) {
    this.fbr = fbr;
    this.chunks = {};
  }

  receive(chunk: Chunk, callback?: (arg0: any) => void) {
    if (!chunk.uuid) {
      return fileConverter.convertToObject(chunk, (object: any) =>
        this.receive(object)
      );
    }

    if (chunk.start && !this.chunks[chunk.uuid]) {
      this.chunks[chunk.uuid] = {};
      if (this.fbr.onBegin) {
        this.fbr.onBegin(chunk);
      }
    }

    if (!chunk.end && chunk.buffer) {
      this.chunks[chunk.uuid][chunk.currentPosition] = chunk.buffer;
    }

    if (chunk.end) {
      const blob = merge(
        new Blob(Object.values(this.chunks[chunk.uuid]), {
          type: chunk.type,
        }),
        chunk
      );
      blob.url = URL.createObjectURL(blob);

      if (!blob.size) {
        console.error("Something went wrong. Blob Size is 0.");
      }

      if (this.fbr.onEnd) {
        this.fbr.onEnd(blob);
      }

      // clear system memory
      delete this.chunks[chunk.uuid];
    }

    if (chunk.buffer && this.fbr.onProgress) {
      this.fbr.onProgress(chunk);
    }

    if (!chunk.end) {
      callback(chunk);

      const looper = () => {
        if (!chunk.buffer || !this.chunks[chunk.uuid]) {
          return;
        }

        if (
          chunk.currentPosition != chunk.maxChunks &&
          !this.chunks[chunk.uuid][chunk.currentPosition]
        ) {
          callback(chunk);
          setTimeout(looper, 5000);
        }
      };

      setTimeout(looper, 5000);
    }
  }
}
