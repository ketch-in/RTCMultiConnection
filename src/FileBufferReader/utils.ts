import {
  TYPES,
  DEBUG,
  LENGTH,
  TYPE_NAMES,
  BIG_ENDIAN,
  TYPE_LENGTH,
  BYTES_LENGTH,
  LENGTH_LENGTH,
  LITTLE_ENDIAN,
} from "./constants";
import { BlobChunk, ClassObj, Types } from "./types";

/**
 * Deserialize binary and return JavaScript object
 * @param  ArrayBuffer buffer ArrayBuffer you want to deserialize
 * @return mixed              Retrieved JavaScript object
 */
export function deserialize(buffer: ArrayBufferLike) {
  var view = buffer instanceof DataView ? buffer : new DataView(buffer);
  var result = unpack(view, 0);
  return result.value;
}

/**
 * packs seriarized elements array into a packed ArrayBuffer
 * @param  {Array} serialized Serialized array of elements.
 * @return {DataView} view of packed binary
 */
export function pack(serialized: any[]): DataView {
  const view = new DataView(
    new ArrayBuffer(serialized[0].byte_length + serialized[0].header_size)
  );

  let cursor = 0;

  serialized.forEach(({ header_size, type, length, value, byte_length }) => {
    const start = cursor;
    const type_name = LENGTH[type];
    const unit =
      type_name === null ? 0 : window[type_name + "Array"].BYTES_PER_ELEMENT;
    view.setUint8(cursor, type === TYPES.BUFFER ? TYPES.BLOB : type);

    cursor += TYPE_LENGTH;

    if (DEBUG) {
      console.info("Packing", type, TYPE_NAMES[type]);
    }

    // Set length if required
    if (type === TYPES.ARRAY || type === TYPES.OBJECT) {
      view.setUint16(cursor, length, BIG_ENDIAN);
      cursor += LENGTH_LENGTH;

      if (DEBUG) {
        console.info("Content Length", length);
      }
    }

    // Set byte length
    view.setUint32(cursor, byte_length, BIG_ENDIAN);
    cursor += BYTES_LENGTH;

    if (DEBUG) {
      console.info("Header Size", header_size, "bytes");
      console.info("Byte Length", byte_length, "bytes");
    }

    switch (type) {
      case TYPES.NULL:
      case TYPES.UNDEFINED:
        // NULL and UNDEFINED doesn't have any payload
        break;

      case TYPES.STRING:
        if (DEBUG) {
          console.info('Actual Content %c"' + value + '"', "font-weight:bold;");
        }
        value.split("").forEach((char) => {
          view.setUint16(cursor, char.charCodeAt(), BIG_ENDIAN);
          cursor += unit;
        });
        break;

      case TYPES.NUMBER:
      case TYPES.BOOLEAN:
        if (DEBUG) {
          console.info("%c" + value.toString(), "font-weight:bold;");
        }
        view["set" + type_name](cursor, value, BIG_ENDIAN);
        cursor += unit;
        break;

      case TYPES.INT8ARRAY:
      case TYPES.INT16ARRAY:
      case TYPES.INT32ARRAY:
      case TYPES.UINT8ARRAY:
      case TYPES.UINT16ARRAY:
      case TYPES.UINT32ARRAY:
      case TYPES.FLOAT32ARRAY:
      case TYPES.FLOAT64ARRAY:
        new Uint8Array(view.buffer, cursor, byte_length).set(
          new Uint8Array(value.buffer)
        );
        cursor += byte_length;
        break;

      case TYPES.ARRAYBUFFER:
      case TYPES.BUFFER:
        new Uint8Array(view.buffer, cursor, byte_length).set(
          new Uint8Array(value)
        );
        cursor += byte_length;
        break;

      case TYPES.BLOB:
      case TYPES.ARRAY:
      case TYPES.OBJECT:
        break;

      default:
        throw "TypeError: Unexpected type found.";
    }

    if (DEBUG) {
      binary_dump(view, start, cursor - start);
    }
  });

  return view;
}

export function unpack(view: DataView, cursor: number) {
  const start = cursor;

  // Retrieve "type"
  const type = view.getUint8(cursor);
  cursor += TYPE_LENGTH;

  if (DEBUG) {
    console.info("Unpacking", type, TYPE_NAMES[type]);
  }

  // Retrieve "length"
  const length =
    type === TYPES.ARRAY || type === TYPES.OBJECT
      ? view.getUint16(cursor, BIG_ENDIAN)
      : null;

  if (!length) {
    cursor += LENGTH_LENGTH;

    if (DEBUG) {
      console.info("Content Length", length);
    }
  }

  // Retrieve "byte_length"
  const byte_length = view.getUint32(cursor, BIG_ENDIAN);
  cursor += BYTES_LENGTH;

  if (DEBUG) {
    console.info("Byte Length", byte_length, "bytes");
  }

  const type_name = LENGTH[type];
  const unit =
    type_name === null ? 0 : window[type_name + "Array"].BYTES_PER_ELEMENT;

  let value = null;

  switch (type) {
    case TYPES.NULL:
    case TYPES.UNDEFINED:
      if (DEBUG) {
        binary_dump(view, start, cursor - start);
      }
      // NULL and UNDEFINED doesn't have any octet
      value = null;
      break;

    case TYPES.STRING:
      value = Array(byte_length / unit)
        .fill(1)
        .map(() => {
          const code = view.getUint16(cursor, BIG_ENDIAN);
          cursor += unit;
          return String.fromCharCode(code);
        })
        .join("");

      if (DEBUG) {
        console.info('Actual Content %c"' + value + '"', "font-weight:bold;");
        binary_dump(view, start, cursor - start);
      }
      break;

    case TYPES.NUMBER:
      value = view.getFloat64(cursor, BIG_ENDIAN);
      cursor += unit;
      if (DEBUG) {
        console.info(
          'Actual Content %c"' + value.toString() + '"',
          "font-weight:bold;"
        );
        binary_dump(view, start, cursor - start);
      }
      break;

    case TYPES.BOOLEAN:
      value = view.getUint8(cursor) === 1 ? true : false;
      cursor += unit;
      if (DEBUG) {
        console.info(
          'Actual Content %c"' + value.toString() + '"',
          "font-weight:bold;"
        );
        binary_dump(view, start, cursor - start);
      }
      break;

    case TYPES.INT8ARRAY:
    case TYPES.INT16ARRAY:
    case TYPES.INT32ARRAY:
    case TYPES.UINT8ARRAY:
    case TYPES.UINT16ARRAY:
    case TYPES.UINT32ARRAY:
    case TYPES.FLOAT32ARRAY:
    case TYPES.FLOAT64ARRAY:
    case TYPES.ARRAYBUFFER:
      const arrayBufferElem = view.buffer.slice(cursor, cursor + byte_length);
      cursor += byte_length;

      value =
        type === TYPES.ARRAYBUFFER
          ? arrayBufferElem
          : new window[type_name + "Array"](arrayBufferElem);

      if (DEBUG) {
        binary_dump(view, start, cursor - start);
      }
      break;

    case TYPES.BLOB:
      if (DEBUG) {
        binary_dump(view, start, cursor - start);
      }
      // If Blob is available (on browser)
      if (window.Blob) {
        const mime = unpack(view, cursor);
        const buffer = unpack(view, mime.cursor);

        cursor = buffer.cursor;
        value = new Blob([buffer.value], {
          type: mime.value,
        });
      } else {
        // node.js implementation goes here
        const blobElem = view.buffer.slice(cursor, cursor + byte_length);

        cursor += byte_length;
        // node.js implementatino uses Buffer to help Blob
        value = new Buffer(blobElem);
      }
      break;

    case TYPES.ARRAY:
      if (DEBUG) {
        binary_dump(view, start, cursor - start);
      }
      value = Array(length)
        .fill(1)
        .map(() => {
          // Retrieve array element
          const arrayElem = unpack(view, cursor);
          cursor = arrayElem.cursor;
          return arrayElem.value;
        });
      break;

    case TYPES.OBJECT:
      if (DEBUG) {
        binary_dump(view, start, cursor - start);
      }
      value = Array(length)
        .fill(1)
        .reduce((value) => {
          // Retrieve object key and value in sequence
          const key = unpack(view, cursor);
          const val = unpack(view, key.cursor);
          cursor = val.cursor;

          return { ...value, [key.value]: val.value };
        }, {});
      break;

    default:
      throw "TypeError: Type not supported.";
  }
  return { value, cursor };
}

export function merge(mergein: Blob, mergeto: { [x: string]: any }): BlobChunk {
  if (!mergein) {
    return merge(new Blob(), mergeto);
  }

  if (!mergeto) {
    return mergein;
  }

  Object.keys(mergeto).forEach((item) => {
    try {
      mergein[item] = mergeto[item];
    } catch (e) {}
  });

  return mergein;
}

/**
 * Serializes object and return byte_length
 * @param  {mixed} obj JavaScript object you want to serialize
 * @return {Array} Serialized array object
 */
export function serialize(obj: unknown, callback) {
  const header_size = TYPE_LENGTH + BYTES_LENGTH;
  const type = find_type(obj);
  const unit =
    LENGTH[type] === undefined || LENGTH[type] === null
      ? 0
      : window[LENGTH[type] + "Array"].BYTES_PER_ELEMENT;

  let length = 0;
  let byte_length = 0;

  switch (type) {
    case TYPES.UNDEFINED:
    case TYPES.NULL:
      break;
    case TYPES.NUMBER:
    case TYPES.BOOLEAN:
      byte_length = unit;
      break;

    case TYPES.STRING:
      length = (obj as string).length;
      byte_length += length * unit;
      break;

    case TYPES.INT8ARRAY:
    case TYPES.INT16ARRAY:
    case TYPES.INT32ARRAY:
    case TYPES.UINT8ARRAY:
    case TYPES.UINT16ARRAY:
    case TYPES.UINT32ARRAY:
    case TYPES.FLOAT32ARRAY:
    case TYPES.FLOAT64ARRAY:
      length = (obj as number[]).length;
      byte_length += length * unit;
      break;

    case TYPES.ARRAY:
      deferredSerialize(
        obj as any[],
        (subarray: any[], byte_length: number) => {
          callback([
            {
              type,
              byte_length,
              length: (obj as any[]).length,
              header_size: header_size + LENGTH_LENGTH,
              value: null,
            },
            ...subarray,
          ]);
        }
      );
      return;

    case TYPES.OBJECT:
      deferredSerialize(
        Object.keys(obj)
          .map((key) => {
            length++;
            return [key, obj[key]];
          })
          .flat(),
        (subarray: any[], byte_length: number) => {
          callback([
            {
              type,
              length,
              byte_length,
              value: null,
              header_size: header_size + LENGTH_LENGTH,
            },
            ...subarray,
          ]);
        }
      );
      return;

    case TYPES.ARRAYBUFFER:
      byte_length += (obj as ArrayBuffer).byteLength;
      break;

    case TYPES.BLOB:
      const reader = new FileReader();
      reader.onload = function (e) {
        deferredSerialize(
          [(obj as Blob).type, e.target.result],
          (subarray, byte_length: any) => {
            callback([
              {
                type,
                length,
                byte_length,
                header_size,
                value: null,
              },
              ...subarray,
            ]);
          }
        );
      };
      reader.onerror = function (e) {
        throw "FileReader Error: " + e;
      };
      reader.readAsArrayBuffer(obj as Blob);
      return;

    case TYPES.BUFFER:
      byte_length += (obj as Buffer).length;
      break;

    default:
      throw 'TypeError: Type "' + obj.constructor.name + '" not supported.';
  }

  callback([{ type, length, header_size, byte_length, value: obj }]);
}

export function utf16_utf8(string: string | number | boolean) {
  return unescape(encodeURIComponent(string));
}

export function utf8_utf16(bytes: string) {
  return decodeURIComponent(escape(bytes));
}

export function processInWebWorker(_function: {
  [key: string]: any;
  toString: () => string;
  name: string;
}) {
  return new Worker(
    URL.createObjectURL(
      new Blob(
        [
          _function.toString(),
          `this.onmessage =  function (e) {${_function.name}(e.data);}`,
        ],
        {
          type: "application/javascript",
        }
      )
    )
  );
}

// extends 'from' object with members from 'to'. If 'to' is null, a deep clone of 'from' is returned
export function fbrClone<T>(from: T & { constructor?: any }, to?: T): T {
  if (
    from === null ||
    typeof from !== "object" ||
    (from.constructor !== Object && from.constructor !== Array)
  ) {
    return from;
  }

  if (
    from.constructor === Date ||
    from.constructor === RegExp ||
    from.constructor === Function ||
    from.constructor === String ||
    from.constructor === Number ||
    from.constructor === Boolean
  ) {
    return new from.constructor(from);
  }

  const newObj = to || new from.constructor();

  Object.keys(from).forEach((name) => {
    newObj[name] =
      newObj[name] === undefined ? fbrClone(from[name], null) : newObj[name];
  });

  return Object.assign(from, newObj);
}

function find_type(obj: {
  [key: string]: any;
  constructor: { name: string; toString: () => string };
}): Types {
  if (obj === undefined) {
    return TYPES.UNDEFINED;
  }
  if (obj === null) {
    return TYPES.NULL;
  }

  const name = obj.constructor.name;

  if (name !== undefined && TYPES[name.toUpperCase()] !== undefined) {
    // return type by .constructor.name if possible
    return TYPES[name.toUpperCase()];
  }

  const name_reflection = obj.constructor.toString().match(/\w+/g)[1];

  if (
    name_reflection !== undefined &&
    TYPES[name_reflection.toUpperCase()] !== undefined
  ) {
    return TYPES[name_reflection.toUpperCase()];
  }
  // Work around when constructor.name is not defined
  switch (typeof obj) {
    case "string":
      return TYPES.STRING;
    case "number":
      return TYPES.NUMBER;
    case "boolean":
      return TYPES.BOOLEAN;
    case "object":
      if (obj instanceof Array) {
        return TYPES.ARRAY;
      }
      if (obj instanceof Int8Array) {
        return TYPES.INT8ARRAY;
      }
      if (obj instanceof Int16Array) {
        return TYPES.INT16ARRAY;
      }
      if (obj instanceof Int32Array) {
        return TYPES.INT32ARRAY;
      }
      if (obj instanceof Uint8Array) {
        return TYPES.UINT8ARRAY;
      }
      if (obj instanceof Uint16Array) {
        return TYPES.UINT16ARRAY;
      }
      if (obj instanceof Uint32Array) {
        return TYPES.UINT32ARRAY;
      }
      if (obj instanceof Float32Array) {
        return TYPES.FLOAT32ARRAY;
      }
      if (obj instanceof Float64Array) {
        return TYPES.FLOAT64ARRAY;
      }
      if (obj instanceof ArrayBuffer) {
        return TYPES.ARRAYBUFFER;
      }
      if (obj instanceof Blob) {
        // including File
        return TYPES.BLOB;
      }
      if (obj instanceof Buffer) {
        // node.js only
        return TYPES.BUFFER;
      }
      if (obj instanceof Object) {
        return TYPES.OBJECT;
      }
      break;
    default:
      break;
  }
  return undefined;
}

function binary_dump(view: DataView, start: number, length: number) {
  const ROW_LENGTH = 40;

  const table = [
    Array(ROW_LENGTH)
      .fill(1)
      .map((i) => (i < 10 ? "0" + i.toString(10) : i.toString(10))),
  ];

  Array(length)
    .fill(1)
    .map((i) => {
      const code = view.getUint8(start + i);
      const index = ~~(i / ROW_LENGTH) + 1;

      if (typeof table[index] === "undefined") {
        table[index] = [];
      }

      table[index][i % ROW_LENGTH] =
        code < 16 ? "0" + code.toString(16) : code.toString(16);
    });

  console.log("%c" + table[0].join(" "), "font-weight: bold;");

  table.forEach((item, idx) => {
    if (idx === 0) {
      return;
    }
    console.log(item.join(" "));
  });
}

/**
 * deferred function to process multiple serialization in order
 * @param  {array}   array    [description]
 * @param  {Function} callback [description]
 * @return {void} no return value
 */
function deferredSerialize(
  array: any[],
  callback: (arr: [], len: number) => void
) {
  const { length } = array;
  const results = [];

  let byteLen = 0;
  let count = 0;

  array.forEach((item) => {
    serialize(item, (result) => {
      // store results in order
      results.push(result);
      // count byte length
      byteLen += result[0].header_size + result[0].byte_length;
      // when all results are on table
      if (++count === length) {
        // finally concatenate all results into a single array in order
        callback(result.flat(), byteLen);
      }
    });
  });
}
