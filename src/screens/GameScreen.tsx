import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { gameShareUrl, generateQuestions } from '@/api/client';
import { mergePreviousQuestions, getPreviousQuestions, addQuestionsToHistory } from '@/lib/question-history';
import { getSavedName, saveName } from '@/lib/client-id';
import { speechLangFor } from '@/lib/i18n';
import { useLocale } from '@/context/LocaleProvider';
import { useGameState } from '@/hooks/useGameState';
import { useMeshWebRTC } from '@/hooks/useMeshWebRTC';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { JoinScreen } from '@/components/JoinScreen';
import { Lobby } from '@/components/Lobby';
import { CameraGrid } from '@/components/CameraGrid';
import { QuestionPanel } from '@/components/QuestionPanel';
import { ScoreBoard } from '@/components/ScoreBoard';
import { WinnerScreen } from '@/components/WinnerScreen';
import type { RootStackParamList } from '@/navigation/types';
import { colors } from '@/theme';

export const TRANSCRIPT_THROTTLE_MS = 350;
const THROTTLE = TRANSCRIPT_THROTTLE_MS;

type Props = {
  gameId: string;
  clientId: string;
  asHost: boolean;
};

export function GameScreen({ gameId, clientId, asHost }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, locale } = useLocale();
  const {
    game,
    players,
    me,
    loading,
    error,
    timeLeftMs,
    currentQuestion,
    join,
    startGame,
    submitMCAnswer,
    updateTranscript,
    finishAnswer,
    voteRematch,
    rematch,
  } = useGameState(gameId, clientId);

  const [joining, setJoining] = useState(false);
  const [gameFull, setGameFull] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [typedText, setTypedText] = useState('');
  const [typedMode, setTypedMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pttHeld, setPttHeld] = useState(false);

  const lastTranscriptWrite = useRef(0);
  const transcriptPending = useRef<string | null>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const camerasEnabled = game?.cameras_enabled ?? false;
  const { localStream, remoteStreams, startCamera, setMicEnabled } = useMeshWebRTC(
    gameId,
    me?.id ?? null,
    camerasEnabled,
  );

  const flushTranscript = useCallback(
    (text: string) => {
      void updateTranscript(text);
    },
    [updateTranscript],
  );

  const throttledTranscriptUpdate = useCallback(
    (text: string) => {
      transcriptPending.current = text;
      const now = Date.now();
      const elapsed = now - lastTranscriptWrite.current;
      if (elapsed >= THROTTLE) {
        lastTranscriptWrite.current = now;
        flushTranscript(text);
        return;
      }
      if (throttleTimer.current) clearTimeout(throttleTimer.current);
      throttleTimer.current = setTimeout(() => {
        lastTranscriptWrite.current = Date.now();
        if (transcriptPending.current !== null) flushTranscript(transcriptPending.current);
      }, THROTTLE - elapsed);
    },
    [flushTranscript],
  );

  const { startListening, stopListening } = useSpeechRecognition(
    (text) => {
      if (!typedMode) {
        setTypedText(text);
        throttledTranscriptUpdate(text);
      }
    },
    speechLangFor(locale),
  );

  useEffect(() => {
    void getSavedName().then(setSavedName);
  }, []);

  useLayoutEffect(() => {
    if (!__DEV__) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() =>
            navigation.navigate('Debug', {
              snapshot: {
                gameId: gameId.slice(0, 8),
                asHost,
                clientId: clientId.slice(0, 8),
                me: me ? { slot: me.slot, role: me.role, score: me.score } : null,
                phase: game?.phase,
                status: game?.status,
                players: players.length,
                timeLeftMs,
                qIndex: game?.current_question_index,
              },
            })
          }
          style={{ paddingHorizontal: 12 }}
        >
          <Text style={{ color: '#8b9aab', fontSize: 12 }}>Logs</Text>
        </Pressable>
      ),
    });
  }, [navigation, gameId, asHost, clientId, me, game, players.length, timeLeftMs]);

  const rematchInFlight = useRef(false);
  useEffect(() => {
    if (!game || game.phase !== 'ended' || !me || me.role !== 'host' || rematchInFlight.current) return;
    const guestVotes = players.filter((p) => p.role === 'player' && p.rematch).length;
    if (!me.rematch || guestVotes < 1) return;

    rematchInFlight.current = true;
    void (async () => {
      try {
        const previous = await getPreviousQuestions(game.topic);
        const merged = mergePreviousQuestions(previous, game.questions);
        const questions = await generateQuestions({
          topic: game.topic,
          difficulty: game.difficulty,
          num_questions: game.num_questions,
          mc_mode: game.mc_mode,
          game_mode: game.game_mode,
          cameras_enabled: game.cameras_enabled,
          locale,
          previous_questions: merged,
        });
        await addQuestionsToHistory(
          game.topic,
          questions.map((q) => q.question),
        );
        await rematch(questions);
      } catch {
        rematchInFlight.current = false;
      }
    })();
  }, [game, me, players, locale, rematch]);

  useEffect(() => {
    if (me) void startCamera();
  }, [me, startCamera]);

  const micPolicy = useCallback(() => {
    if (!game) return false;
    if (game.mc_mode) return true;
    if (game.phase === 'answering') return true;
    return pttHeld;
  }, [game, pttHeld]);

  useEffect(() => {
    setMicEnabled(micPolicy());
  }, [micPolicy, setMicEnabled]);

  useEffect(() => {
    if (!game || game.phase !== 'answering' || !me || me.done || typedMode) {
      void stopListening();
      return;
    }
    void startListening();
    return () => {
      void stopListening();
    };
  }, [game?.phase, me?.done, typedMode, me, startListening, stopListening]);

  useEffect(() => {
    if (game?.phase !== 'answering' && typedText.trim() && me && !me.done) {
      void finishAnswer(typedText.trim());
    }
    if (game?.phase !== 'answering') {
      setTypedText('');
    }
  }, [game?.phase, typedText, me, finishAnswer]);

  const handleJoin = async (name: string) => {
    setJoining(true);
    setGameFull(false);
    try {
      const player = await join(name, asHost);
      if (!player) setGameFull(true);
      else await saveName(name);
    } finally {
      setJoining(false);
    }
  };

  const handleTypedChange = (text: string) => {
    setTypedText(text);
    throttledTranscriptUpdate(text);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accentBright} />
        <Text style={styles.muted}>{t('loading')}</Text>
      </View>
    );
  }

  if (error || !game) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('errorLoadGame')}</Text>
      </View>
    );
  }

  if (!me) {
    return (
      <JoinScreen
        initialName={savedName}
        loading={joining}
        gameFull={gameFull}
        onJoin={handleJoin}
        t={t}
      />
    );
  }

  if (game.status === 'waiting') {
    return (
      <Lobby
        game={game}
        players={players}
        shareUrl={gameShareUrl(gameId)}
        isHost={me.role === 'host'}
        canStart={players.length >= 2}
        onStart={() => void startGame()}
        onCopyLink={async () => {
          await Clipboard.setStringAsync(gameShareUrl(gameId));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        copied={copied}
        t={t}
      />
    );
  }

  const showWinner = game.phase === 'ended' || game.status === 'ended';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.playArea}>
        <CameraGrid
          players={players}
          localStream={localStream}
          remoteStreams={remoteStreams}
          myId={me.id}
          camerasEnabled={camerasEnabled}
          showResult={game.phase === 'result'}
        />
        <QuestionPanel
          game={game}
          question={currentQuestion}
          me={me}
          timeLeftMs={timeLeftMs}
          typedText={typedText}
          typedMode={typedMode}
          onTypedChange={handleTypedChange}
          onToggleTypedMode={() => setTypedMode((v) => !v)}
          onSelectMC={(i) => void submitMCAnswer(i)}
          onDone={() => void finishAnswer(typedText.trim() || undefined)}
          onPushToTalkIn={() => setPttHeld(true)}
          onPushToTalkOut={() => setPttHeld(false)}
          t={t}
        />
        <ScoreBoard players={players} />
      </ScrollView>
      {showWinner ? (
        <WinnerScreen players={players} me={me} onRematch={() => void voteRematch()} t={t} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  playArea: { padding: 12, gap: 12, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  muted: { color: colors.textMuted },
  error: { color: colors.wrong, textAlign: 'center' },
});
