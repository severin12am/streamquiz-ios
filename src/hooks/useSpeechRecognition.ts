import { useCallback, useEffect, useRef, useState } from 'react';
import Voice, {
  type SpeechErrorEvent,
  type SpeechResultsEvent,
} from '@react-native-voice/voice';

interface UseSpeechRecognitionResult {
  transcript: string;
  isListening: boolean;
  isSupported: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
}

export function useSpeechRecognition(
  onUpdate: (text: string) => void,
  lang: string,
): UseSpeechRecognitionResult {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
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
    Voice.onSpeechError = (_e: SpeechErrorEvent) => setIsListening(false);

    return () => {
      void Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const startListening = useCallback(async () => {
    try {
      await Voice.stop();
      setTranscript('');
      await Voice.start(lang);
      setIsListening(true);
    } catch {
      setIsListening(false);
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
    startListening,
    stopListening,
  };
}
