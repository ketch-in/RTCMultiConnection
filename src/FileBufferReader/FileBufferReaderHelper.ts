import FileBufferReader from ".";
import { Chunk } from "./types";

export default class FileBufferReaderHelper {
  fbr: FileBufferReader;
  options: { [key: string]: any };

  constructor(fbr: FileBufferReader) {
    this.fbr = fbr;
    this.options = {};
  }

  readAsArrayBuffer(options: any) {
    this.options = { ...this.options, ...options };
    this.fileReaderWrapper();
  }

  private fileReaderWrapper() {
    const cb = this.processChunk;

    const file = this.options.file;
    if (!file.uuid) {
      file.uuid = (Math.random() * 100).toString().replace(/\./g, "");
    }

    const chunkSize =
      this.options.extra && this.options.extra.chunkSize
        ? this.options.extra.chunkSize
        : this.options.chunkSize || 15 * 1000;

    let sliceId = 0;

    const chunksPerSlice = Math.floor(
      Math.min(100000000, chunkSize) / chunkSize
    );
    const sliceSize = chunksPerSlice * chunkSize;
    const maxChunks = Math.ceil(file.size / chunkSize);

    file.maxChunks = maxChunks;

    let currentPosition = 0;
    const chunks = [];

    const addChunks = (
      binarySlice: ArrayBuffer,
      addChunkCallback: { (): void; (): void }
    ) => {
      const numOfChunksInSlice = Math.ceil(binarySlice.byteLength / chunkSize);
      Array(numOfChunksInSlice)
        .fill(1)
        .map((_, i) => i * chunkSize)
        .forEach((start) => {
          chunks[currentPosition] = binarySlice.slice(
            start,
            Math.min(start + chunkSize, binarySlice.byteLength)
          );

          cb({
            maxChunks,
            currentPosition,
            uuid: file.uuid,
            size: file.size,
            type: file.type,
            name: file.name,
            buffer: chunks[currentPosition],
            lastModifiedDate: (file.lastModifiedDate || new Date()).toString(),
          });

          currentPosition++;
        });
      addChunkCallback();
    };

    cb({
      currentPosition: currentPosition,
      uuid: file.uuid,
      maxChunks: maxChunks,
      size: file.size,
      name: file.name,
      type: file.type,
      lastModifiedDate: (file.lastModifiedDate || new Date()).toString(),
      start: true,
    });

    const reader = new FileReader();

    reader.onloadend = ({ target }) => {
      if (target.readyState !== FileReader.DONE) {
        return;
      }

      addChunks(target.result as ArrayBuffer, () => {
        sliceId++;

        if ((sliceId + 1) * sliceSize < file.size) {
          return reader.readAsArrayBuffer(
            file.slice(sliceId * sliceSize, (sliceId + 1) * sliceSize)
          );
        }

        if (sliceId * sliceSize < file.size) {
          return reader.readAsArrayBuffer(
            file.slice(sliceId * sliceSize, file.size)
          );
        }

        file.url = URL.createObjectURL(file);

        cb({
          currentPosition: currentPosition,
          uuid: file.uuid,
          maxChunks: maxChunks,
          size: file.size,
          name: file.name,
          lastModifiedDate: (file.lastModifiedDate || new Date()).toString(),
          url: URL.createObjectURL(file),
          type: file.type,
          end: true,
        });
      });
    };

    currentPosition += 1;

    reader.readAsArrayBuffer(
      file.slice(sliceId * sliceSize, (sliceId + 1) * sliceSize)
    );
  }

  processChunk(chunk: Chunk) {
    if (!this.fbr.chunks[chunk.uuid]) {
      this.fbr.chunks[chunk.uuid] = {
        currentPosition: -1,
      };
    }
    const earlyCallback = this.options.earlyCallback;
    delete this.options.earlyCallback;

    this.options.extra = this.options.extra || { userid: 0 };
    this.options.userid = this.options.userid || this.options.extra.userid || 0;

    this.fbr.chunks[chunk.uuid][chunk.currentPosition] = chunk;

    if (chunk.end && earlyCallback) {
      earlyCallback(chunk.uuid);
    }

    // for huge files
    if (
      chunk.maxChunks > 200 &&
      chunk.currentPosition == 200 &&
      earlyCallback
    ) {
      earlyCallback(chunk.uuid);
    }
  }
}
