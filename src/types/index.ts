export type StorageMethod = "localStorage" | "sessionStorage" | null;

export type CKSettings = {
  storageMethod: StorageMethod;
};

export type FallbackMediaRecorderConfig = {
  base: string;

  mimeType: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
};
