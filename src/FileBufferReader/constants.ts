export const BIG_ENDIAN = false;
export const LITTLE_ENDIAN = true;
export const TYPE_LENGTH = Uint8Array.BYTES_PER_ELEMENT;
export const LENGTH_LENGTH = Uint16Array.BYTES_PER_ELEMENT;
export const BYTES_LENGTH = Uint32Array.BYTES_PER_ELEMENT;

export const DEBUG = false;

export const TYPES = {
  NULL: 0,
  UNDEFINED: 1,
  STRING: 2,
  NUMBER: 3,
  BOOLEAN: 4,
  ARRAY: 5,
  OBJECT: 6,
  INT8ARRAY: 7,
  INT16ARRAY: 8,
  INT32ARRAY: 9,
  UINT8ARRAY: 10,
  UINT16ARRAY: 11,
  UINT32ARRAY: 12,
  FLOAT32ARRAY: 13,
  FLOAT64ARRAY: 14,
  ARRAYBUFFER: 15,
  BLOB: 16,
  FILE: 16,
  BUFFER: 17, // Special type for node.js
};

export const TYPE_NAMES = Object.keys(TYPES);

export const LENGTH = [
  null, // TYPES.NULL
  null, // TYPES.UNDEFINED
  "Uint16", // TYPES.STRING
  "Float64", // TYPES.NUMBER
  "Uint8", // TYPES.BOOLEAN
  null, // TYPES.ARRAY
  null, // TYPES.OBJECT
  "Int8", // TYPES.INT8ARRAY
  "Int16", // TYPES.INT16ARRAY
  "Int32", // TYPES.INT32ARRAY
  "Uint8", // TYPES.UINT8ARRAY
  "Uint16", // TYPES.UINT16ARRAY
  "Uint32", // TYPES.UINT32ARRAY
  "Float32", // TYPES.FLOAT32ARRAY
  "Float64", // TYPES.FLOAT64ARRAY
  "Uint8", // TYPES.ARRAYBUFFER
  "Uint8", // TYPES.BLOB, TYPES.FILE
  "Uint8", // TYPES.BUFFER
];
