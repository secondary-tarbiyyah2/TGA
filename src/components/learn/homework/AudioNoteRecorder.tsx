"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  audioMimeBase,
  canRecordAudio,
  formatSeconds,
  pickRecorderMime,
  type AudioMime,
} from "@/lib/learn/homeworkFeedback";

export type AudioNote = { blob: Blob; seconds: number; mime: AudioMime };

/**
 * Records a short audio note in the browser with MediaRecorder (max two
 * minutes, under the 2MB bucket cap). Where recording isn't available (older
 * browsers, no microphone permission, an insecure page) it falls back to
 * choosing an existing audio/webm or audio/mp4 file, so a teacher can always
 * attach a note or simply type feedback instead.
 */
export function AudioNoteRecorder({ value, onChange }: { value: AudioNote | null; onChange: (note: AudioNote | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const previewUrl = useMemo(() => (value ? URL.createObjectURL(value.blob) : null), [value]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Stop the microphone if the component goes away mid-recording.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stop = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const start = async () => {
    setError(null);
    if (!canRecordAudio()) {
      setError("Recording isn't available in this browser. Choose an audio file instead, or type your feedback.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = pickRecorderMime();
      const options: MediaRecorderOptions = { audioBitsPerSecond: 32000 };
      if (preferred) options.mimeType = preferred;
      const rec = new MediaRecorder(stream, options);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setRecording(false);
        const type = rec.mimeType || preferred || "audio/webm";
        const mime = audioMimeBase(type);
        const blob = new Blob(chunksRef.current, { type });
        const seconds = Math.min(MAX_AUDIO_SECONDS, Math.round((Date.now() - startedRef.current) / 1000));
        if (!mime) {
          setError("This browser records in a format we can't accept. Choose a webm or mp4 audio file instead.");
          return;
        }
        if (blob.size === 0) {
          setError("Nothing was recorded. Please try again.");
          return;
        }
        if (blob.size > MAX_AUDIO_BYTES) {
          setError("That recording is over 2MB. Please record a shorter note.");
          return;
        }
        onChange({ blob, seconds, mime });
      };
      startedRef.current = Date.now();
      setElapsed(0);
      rec.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const secs = Math.round((Date.now() - startedRef.current) / 1000);
        setElapsed(secs);
        if (secs >= MAX_AUDIO_SECONDS) stop();
      }, 500);
    } catch {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setError("We couldn't use the microphone. Allow microphone access, or choose an audio file instead.");
    }
  };

  const onFile = (file: File | null) => {
    setError(null);
    if (!file) return;
    const mime = audioMimeBase(file.type);
    if (!mime) {
      setError("Please choose an audio/webm or audio/mp4 (.webm, .m4a, .mp4) file.");
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setError("That file is over 2MB. Please choose a shorter note.");
      return;
    }
    onChange({ blob: file, seconds: 0, mime });
  };

  return (
    <div className="rounded-lg border border-gold-light/40 bg-cream/40 p-3">
      <p className="text-xs font-medium text-ink">Audio note (optional, up to 2 minutes)</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={start}
            className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream"
          >
            {value ? "Record again" : "Record a note"}
          </button>
        ) : (
          <button type="button" onClick={stop} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800">
            Stop ({formatSeconds(elapsed)})
          </button>
        )}
        {!recording && (
          <label className="cursor-pointer text-xs text-gold-700 underline">
            or choose an audio file
            <input
              type="file"
              accept="audio/webm,audio/mp4,audio/x-m4a,.webm,.m4a,.mp4"
              className="sr-only"
              onChange={(e) => {
                onFile(e.target.files?.[0] || null);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {value && !recording && (
          <button type="button" onClick={() => onChange(null)} className="text-xs text-red-700 underline">
            Discard
          </button>
        )}
      </div>
      {recording && <p className="mt-2 text-xs text-red-700">Recording… speak now.</p>}
      {previewUrl && !recording && (
        <div className="mt-2">
          <audio controls src={previewUrl} className="h-9 w-full max-w-xs">
            <track kind="captions" />
          </audio>
          <p className="mt-1 text-xs text-ink/65">
            {value && value.seconds > 0 ? `${formatSeconds(value.seconds)} · ` : ""}
            {value ? `${Math.max(1, Math.round(value.blob.size / 1024))} KB` : ""}
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
