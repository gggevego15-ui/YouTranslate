import { pipeline, env } from "@huggingface/transformers";

// Audio is processed in this browser tab. Model weights are downloaded from Hugging Face
// on first use and then cached by the Transformers.js runtime.
env.allowLocalModels = false;
env.allowRemoteModels = true;

let transcriberPromise;

export async function transcribeAudio(samples, onProgress = () => {}) {
  if (!(samples instanceof Float32Array) || samples.length < 16000) {
    throw new Error("Недостаточно аудио для распознавания.");
  }

  if (!transcriberPromise) {
    const device = navigator.gpu ? "webgpu" : "wasm";
    transcriberPromise = pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny",
      {
        device,
        dtype: device === "webgpu" ? "fp32" : "q8",
        progress_callback: (progress) => {
          if (progress && Number.isFinite(progress.progress)) {
            onProgress(Math.round(progress.progress));
          }
        }
      }
    ).catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }

  const transcriber = await transcriberPromise;
  const result = await transcriber(samples, {
    sampling_rate: 16000,
    chunk_length_s: 20,
    return_timestamps: false
  });
  return String(result?.text || "").trim();
}
