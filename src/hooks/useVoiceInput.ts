import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceRecognitionResult } from '../types';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export interface UseVoiceInputOptions {
  lang?: string;
  continuous?: boolean;
  maxAlternatives?: number;
  onFinalTranscript?: (text: string) => void;
  onFinalResult?: (result: VoiceRecognitionResult) => void;
}

export function useVoiceInput({
  lang = 'zh-TW',
  continuous = true,
  maxAlternatives = 5,
  onFinalTranscript,
  onFinalResult,
}: UseVoiceInputOptions = {}) {
  const [isSupported] = useState(() => getSpeechRecognitionCtor() !== null);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;
  const onFinalResultRef = useRef(onFinalResult);
  onFinalResultRef.current = onFinalResult;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText('');
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('此瀏覽器不支援語音辨識，建議使用 Chrome、Edge 或 Safari。');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    setError(null);
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = Math.max(1, maxAlternatives);

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalChunk = '';
      const altBuckets: string[][] = [];

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalChunk += text;
          const alts: string[] = [];
          for (let a = 0; a < result.length; a += 1) {
            const altText = (result[a]?.transcript ?? '').trim();
            if (altText && !alts.includes(altText)) {
              alts.push(altText);
            }
          }
          if (alts.length > 0) {
            altBuckets.push(alts);
          }
        } else {
          interim += text;
        }
      }

      setInterimText(interim.trim());
      const trimmedFinal = finalChunk.trim();
      if (trimmedFinal) {
        // 合併同一輪的候選結果，保留第一順位與去重後的其他候選
        const mergedAlternatives: string[] = [trimmedFinal];
        if (altBuckets.length === 1) {
          for (const alt of altBuckets[0]) {
            if (!mergedAlternatives.includes(alt)) {
              mergedAlternatives.push(alt);
            }
          }
        } else if (altBuckets.length > 1) {
          const maxAltCount = Math.max(...altBuckets.map((b) => b.length));
          for (let idx = 1; idx < maxAltCount; idx += 1) {
            const combined = altBuckets.map((b) => b[idx] ?? b[0] ?? '').join('').trim();
            if (combined && !mergedAlternatives.includes(combined)) {
              mergedAlternatives.push(combined);
            }
          }
        }

        onFinalRef.current?.(trimmedFinal);
        onFinalResultRef.current?.({
          text: trimmedFinal,
          alternatives: mergedAlternatives,
        });
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setError('請允許麥克風權限以使用語音輸入');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError(`語音辨識發生錯誤 (${event.error})`);
      }
      setIsListening(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }, [lang, continuous, maxAlternatives]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    isSupported,
    isListening,
    interimText,
    error,
    start,
    stop,
    toggle,
  };
}
