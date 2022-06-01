import { TYPES } from "./constants";

export interface Chunk {
  start?: boolean;
  buffer?: boolean;
  url?: string;
  end?: boolean;
  name?: string;
  uuid?: string;
  size?: number;
  type?: string;
  extra?: {};
  userid?: number;
  maxChunks?: number;
  remoteUserId?: string;
  currentPosition?: number;
  lastModifiedDate?: string;
}

export type Types = typeof TYPES[keyof typeof TYPES];
export type BlobChunk = Blob & Chunk;

export type InputFileElement = HTMLInputElement & { clickStarted?: boolean };
export type SelectFile = File & { url: string };

export interface ClassObj extends Object {
  constructor: (args?: any) => void;
}

export interface ChunkString extends String, Chunk {}
