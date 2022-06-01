import { pack, serialize, deserialize } from "./utils";

import { DEBUG } from "./constants";

class FileConverter {
  convertToArrayBuffer(object: any, callback: (buffer: ArrayBuffer) => void) {
    this.pack(object, (dataView: DataView) => callback(dataView.buffer));
  }

  convertToObject(buffer: any, callback: any) {
    this.unpack(buffer, callback);
  }

  private pack(obj: any, callback = (dataView: DataView) => {}) {
    try {
      if (DEBUG) {
        console.info("%cPacking Start", "font-weight: bold; color: red;", obj);
      }

      serialize(obj, (array) => {
        if (DEBUG) {
          console.info("Serialized Object", array);
        }
        callback(pack(array));
      });
    } catch (e) {
      throw e;
    }
  }
  private unpack(buffer: any, callback: (value: any) => void) {
    try {
      if (DEBUG)
        console.info(
          "%cUnpacking Start",
          "font-weight: bold; color: red;",
          buffer
        );
      const result = deserialize(buffer);
      if (DEBUG) {
        console.info("Deserialized Object", result);
      }
      callback(result);
    } catch (e) {
      throw e;
    }
  }
}

export const fileConverter = new FileConverter();

(window as Window & { fileConverter?: FileConverter }).fileConverter =
  fileConverter;
