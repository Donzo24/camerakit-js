import { triggerEvent } from "../main/events";
import { getVideoSpecs, injectMetadata } from "../util";
import { FallbackMediaRecorderConfig } from "../types";
import logger from "../main/logger";
import * as path from "path";
import FediaRecorder = require("webm-media-recorder");

const WORKER_NAME = "encoderWorker.umd.js";
const WASM_NAME = "WebMOpusEncoder.wasm";

const DEFAULT_CONFIG: FallbackMediaRecorderConfig = {
  base: "",
  mimeType: "video/webm",
  width: 640,
  height: 480,
  framerate: 30,
  bitrate: 1200
};

export class FallbackMediaRecorder {
  private config: FallbackMediaRecorderConfig;
  private stream: MediaStream;
  private mediaRecorder: FediaRecorder | null;
  private blobs: Array<Blob>;
  private latestRecording: Blob | null;
  private mimeType: string = "video/webm";

  paused: boolean;

  static isTypeSupported(mimeType: string): boolean {
    return FediaRecorder.isTypeSupported(mimeType);
  }

  constructor(
    stream: MediaStream,
    config?: Partial<FallbackMediaRecorderConfig>
  ) {
    // Stream must be cloned, otherwise there are audio recording issues
    this.stream = stream.clone();
    this.blobs = [];
    this.mediaRecorder = null;

    this.config = {
      ...DEFAULT_CONFIG,
      ...getVideoSpecs(stream),
      ...config
    };
  }

  private createRecorder() {
    this.mediaRecorder = null;

    try {
      this.mediaRecorder = new FediaRecorder(
        this.stream,
        {
          mimeType: this.mimeType,
          videoBitsPerSecond: this.config.bitrate,
          width: this.config.width,
          height: this.config.height,
          framerate: this.config.framerate
        },
        {
          encoderWorkerFactory: () =>
            new Worker(path.join(this.config.base, WORKER_NAME)),
          WebmOpusEncoderWasmPath: path.join(this.config.base, WASM_NAME)
        }
      );
    } catch (e) {
      logger.error("Exception while creating MediaRecorder:", e);
      return;
    }
    if (this.mediaRecorder) {
      this.mediaRecorder.addEventListener("videoplaying", () => {
        triggerEvent("video");
      });

      this.mediaRecorder.addEventListener(
        "dataavailable",
        (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            this.blobs.push(event.data);
          }
        }
      );
      this.mediaRecorder.start();
    }
    logger.log("MediaRecorder started", this.mediaRecorder);
  }

  private async stopAndAwait() {
    return new Promise(resolve => {
      if (this.mediaRecorder) {
        this.mediaRecorder.addEventListener("stop", async () => {
          resolve();
        });
        this.mediaRecorder.stop();
      }
    });
  }

  setMimeType(mimeType: string): boolean {
    this.mimeType = mimeType;

    return true;
  }

  resetRecording() {
    this.blobs = [];
    this.paused = false;
    this.latestRecording = null;
  }

  async resume() {
    if (this.mediaRecorder) {
      this.mediaRecorder.resume();
      this.paused = false;
    }
  }

  async pause() {
    if (this.mediaRecorder) {
      this.mediaRecorder.pause();
      this.paused = true;
    }
  }

  async start() {
    if (this.paused) {
      await this.resume();
      return;
    }

    this.createRecorder();
  }

  async stop(): Promise<Blob> {
    // Stops recorder properly and awaits `stop` event
    await this.stopAndAwait();

    this.latestRecording = await injectMetadata(
      new Blob(this.blobs, {
        type: this.mimeType
      })
    );

    return this.latestRecording;
  }

  getLatestRecording() {
    return this.latestRecording;
  }
}
