/**
 * Voice answers via @react-native-voice/voice (Apple Speech framework).
 *
 * GameScreen starts listening in phase=answering when !typedMode && !done.
 * On speechError, GameScreen auto-enables typed mode (see answeringMuted UI).
 * Lang: speechLangFor(locale) → en-US / ru-RU.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Voice, {
  type SpeechErrorEvent,
  type SpeechResultsEvent,
} from '@react-native-voice/voice';

interface UseSpeechRecognitionResult {
  transcript: string;
  isListening: boolean;
  isSupported: boolean;
  speechError: string | null;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
}

export function useSpeechRecognition(
  onUpdate: (text: string) => void,
  lang: string,
): UseSpeechRecognitionResult {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0] ?? '';
      setTranscript(text);
      onUpdateRef.current(text);
    };
    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0] ?? '';
      setTranscript(text);
      onUpdateRef.current(text);
    };
    Voice.onSpeechEnd = () => setIsListening(false);
    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      setIsListening(false);
      setSpeechError(e.error?.message ?? 'speech_failed');
    };

    return () => {
      void Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const startListening = useCallback(async () => {
    try {
      await Voice.stop();
      setTranscript('');
      setSpeechError(null);
      await Voice.start(lang);
      setIsListening(true);
    } catch (e) {
      setIsListening(false);
      setSpeechError(e instanceof Error ? e.message : 'speech_start_failed');
    }
  }, [lang]);

  const stopListening = useCallback(async () => {
    try {
      await Voice.stop();
    } catch {
      // ignore
    }
    setIsListening(false);
  }, []);

  return {
    transcript,
    isListening,
    isSupported: true,
    speechError,
    startListening,
    stopListening,
  };
}
