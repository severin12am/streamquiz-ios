/**
 * In-game orchestrator — same role as web components/GameScreen.tsx.
 *
 * UI states (conditional render, single screen):
 *   loading → JoinScreen → Lobby (status=waiting) → playing → WinnerScreen overlay
 *
 * Wires together: useGameState, useMeshWebRTC, useSpeechRecognition.
 *
 * iOS-specific:
 * - micPolicy: WebRTC mic OFF during voice answering (Speech uses mic); PTT between rounds.
 * - Transcript writes throttled to TRANSCRIPT_THROTTLE_MS (350ms).
 * - Host rematch: when host + ≥1 guest voted, checks create quota, regenerates
 *   questions via API, and counts as one create against quota.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { gameShareUrl, generateQuestions } from '@/api/client';
import { mergePreviousQuestions, getPreviousQuestions, addQuestionsToHistory } from '@/lib/question-history';
import { getSavedName, saveName } from '@/lib/client-id';
import { speechLangFor } from '@/lib/i18n';
import { VOICE_ANSWERS_ENABLED } from '@/lib/features';
import { useLocale } from '@/context/LocaleProvider';
import { useEntitlements } from '@/context/EntitlementsProvider';
import { useGameState } from '@/hooks/useGameState';
import { useGameSounds } from '@/hooks/useGameSounds';
import { useMeshWebRTC } from '@/hooks/useMeshWebRTC';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { playSound } from '@/lib/sounds';
import { updatePlayer } from '@/lib/supabase';
import { SoundToggle } from '@/components/SoundToggle';
import { MicToggle } from '@/components/MicToggle';
import { JoinScreen } from '@/components/JoinScreen';
import { Lobby } from '@/components/Lobby';
import { CameraStage } from '@/components/CameraStage';
import { QuestionPanel } from '@/components/QuestionPanel';
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
  const { refresh, noteCreated, applyQuotaSnapshot } = useEntitlements();
  const {
    game,
    players,
    me,
    loading,
    error,
    timeLeft,
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

  useGameSounds({ game, players, me, timeLeft });

  const [joining, setJoining] = useState(false);
  const [gameFull, setGameFull] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [typedText, setTypedText] = useState('');
  const [typedMode, setTypedMode] = useState(!VOICE_ANSWERS_ENABLED);
  const [copied, setCopied] = useState(false);
  const [pttHeld, setPttHeld] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  // Measured floating-UI band heights — define the middle band for the
  // 2-player letterbox camera layout (mode 4).
  const [topInset, setTopInset] = useState(0);
  const [bottomInset, setBottomInset] = useState(0);

  const lastTranscriptWrite = useRef(0);
  const transcriptPending = useRef<string | null>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const camerasEnabled = game?.cameras_enabled ?? false;
  const { localStream, remoteStreams, startCamera, setMicEnabled, cameraError } = useMeshWebRTC(
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

  const { startListening, stopListening, speechError } = useSpeechRecognition(
    (text) => {
      if (!typedMode) {
        setTypedText(text);
        throttledTranscriptUpdate(text);
      }
    },
    speechLangFor(locale),
    VOICE_ANSWERS_ENABLED,
  );

  useEffect(() => {
    void getSavedName().then(setSavedName);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        __DEV__ ? (
          <View style={styles.headerRight}>
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
              style={styles.headerBtn}
            >
              <Text style={styles.headerBtnMuted}>{t('logs')}</Text>
            </Pressable>
          </View>
        ) : undefined,
    });
  }, [
    navigation,
    gameId,
    asHost,
    clientId,
    me,
    game,
    players.length,
    timeLeftMs,
  ]);

  const rematchInFlight = useRef(false);
  useEffect(() => {
    // Once the game leaves the ended screen (a rematch started the next game),
    // clear the in-flight guard so a SUBSEQUENT ended screen can rematch again.
    // Without this reset the guard stays true after the first rematch and the
    // host never processes later votes ("waiting for votes" forever).
    if (!game || game.phase !== 'ended') {
      rematchInFlight.current = false;
      return;
    }
    if (!me || me.role !== 'host' || rematchInFlight.current) return;
    const guestVotes = players.filter((p) => p.role === 'player' && p.rematch).length;
    if (!me.rematch || guestVotes < 1) return;

    rematchInFlight.current = true;
    setRematchLoading(true);
    void (async () => {
      try {
        const allowance = await refresh();
        if (!allowance.allowed) {
          rematchInFlight.current = false;
          await updatePlayer(me.id, { rematch: false });
          navigation.navigate('Paywall', {
            reason: allowance.tier === 'free' ? 'trial' : 'monthly',
          });
          return;
        }

        const previous = await getPreviousQuestions(game.topic);
        const merged = mergePreviousQuestions(previous, game.questions);
        const { questions, quota } = await generateQuestions({
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
        if (quota) {
          await applyQuotaSnapshot(quota);
        } else {
          await noteCreated();
        }
      } catch (e) {
        rematchInFlight.current = false;
        Alert.alert(
          t('errorTitle'),
          e instanceof Error ? e.message : t('errorRegenerateQuestions'),
        );
      } finally {
        setRematchLoading(false);
      }
    })();
  }, [game, me, players, locale, rematch, refresh, noteCreated, applyQuotaSnapshot, navigation]);

  useEffect(() => {
    if (me?.id) void startCamera();
  }, [me?.id, startCamera]);

  // Mic policy. Manual mute (MicToggle) always wins.
  //  - MC mode: regular voice chat — mic always open.
  //  - Typed mode (voice answers removed): also regular voice chat — mic always
  //    open. No PTT needed; iOS Speech no longer competes for the mic.
  //  - Legacy voice-answer mode (VOICE_ANSWERS_ENABLED): mic OFF while speaking
  //    an answer (Apple Speech owns it); PTT to talk otherwise.
  const micPolicy = useCallback(() => {
    if (!game) return false;
    if (micMuted) return false;
    if (game.mc_mode) return true;
    if (!VOICE_ANSWERS_ENABLED) return true;
    if (game.phase === 'answering') {
      if (!typedMode) return false;
      return pttHeld;
    }
    return pttHeld;
  }, [game, pttHeld, micMuted, typedMode]);

  useEffect(() => {
    setMicEnabled(micPolicy());
  }, [micPolicy, setMicEnabled]);

  useEffect(() => {
    if (!VOICE_ANSWERS_ENABLED || !game || game.phase !== 'answering' || !me || me.done || typedMode) {
      void stopListening();
      return;
    }
    void startListening();
    return () => {
      void stopListening();
    };
  }, [game?.phase, me?.done, typedMode, me, startListening, stopListening]);

  useEffect(() => {
    if (!VOICE_ANSWERS_ENABLED) return;
    if (speechError && game?.phase === 'answering') {
      setTypedMode(true);
    }
  }, [speechError, game?.phase]);

  // Flush the final answer the instant the answering phase ends, so the last
  // keystrokes inside the throttle window aren't lost before judging. We write
  // transcript directly (finishAnswer guards on phase === 'answering').
  const prevPhaseRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const cur = game?.phase;
    prevPhaseRef.current = cur;
    if (prev === 'answering' && cur !== 'answering' && !game?.mc_mode && me && !me.done) {
      if (throttleTimer.current) clearTimeout(throttleTimer.current);
      const finalText = typedText.trim();
      if (finalText) void updatePlayer(me.id, { done: true, transcript: finalText });
    }
    if (cur !== 'answering') setTypedText('');
  }, [game?.phase, game?.mc_mode, typedText, me]);

  const handleJoin = async (name: string) => {
    setJoining(true);
    setGameFull(false);
    try {
      const player = await join(name, asHost);
      if (!player) setGameFull(true);
      else await saveName(name);
    } catch (e) {
      Alert.alert(t('errorTitle'), e instanceof Error ? e.message : t('errorJoinFailed'));
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
      <View style={styles.root}>
        <View style={styles.soundToggleWrap}>
          <SoundToggle />
        </View>
        <JoinScreen
          initialName={savedName}
          loading={joining}
          gameFull={gameFull}
          asHost={asHost}
          onJoin={handleJoin}
          t={t}
        />
      </View>
    );
  }

  if (game.status === 'waiting') {
    return (
      <View style={styles.root}>
        <View style={styles.soundToggleWrap}>
          <SoundToggle />
        </View>
        <Lobby
          game={game}
          players={players}
          shareUrl={gameShareUrl(gameId)}
          isHost={me.role === 'host'}
          canStart={players.length >= 2}
          meId={me.id}
          onStart={() => {
            playSound('click');
            void startGame();
          }}
          onCopyLink={async () => {
            playSound('click');
            await Clipboard.setStringAsync(gameShareUrl(gameId));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          copied={copied}
          t={t}
        />
      </View>
    );
  }

  const showWinner = game.phase === 'ended' || game.status === 'ended';

  // "Others can't hear you" is a voice-answer-mode concept only. With voice
  // answers removed, typed mode is regular voice chat (no answering mute).
  const localMutedToPeers =
    VOICE_ANSWERS_ENABLED &&
    game.phase === 'answering' &&
    !game.mc_mode &&
    me.done !== true &&
    !micPolicy();

  const sharedPanelProps = {
    game,
    question: currentQuestion,
    players,
    me,
    timeLeftMs,
    typedText,
    typedMode,
    voiceAnswersEnabled: VOICE_ANSWERS_ENABLED,
    speechUnavailable:
      VOICE_ANSWERS_ENABLED && Boolean(speechError) && game.phase === 'answering',
    onTypedChange: handleTypedChange,
    onToggleTypedMode: VOICE_ANSWERS_ENABLED ? () => setTypedMode((v) => !v) : undefined,
    onSelectMC: (i: number) => void submitMCAnswer(i),
    onDone: () => void finishAnswer(typedText.trim() || undefined),
    onPushToTalkIn: VOICE_ANSWERS_ENABLED ? () => setPttHeld(true) : undefined,
    onPushToTalkOut: VOICE_ANSWERS_ENABLED ? () => setPttHeld(false) : undefined,
    pttHeld,
    dark: true as const,
    t,
  };

  return (
    <View style={styles.root}>
      {/* Full-screen camera backdrop. Tap any feed to cycle layouts (CameraStage). */}
      <View style={styles.cameraLayer}>
        <CameraStage
          players={players}
          me={me}
          localStream={localStream}
          remoteStreams={remoteStreams}
          camerasEnabled={camerasEnabled}
          showResult={game.phase === 'result'}
          phase={game.phase}
          mcMode={game.mc_mode}
          localMedia={{
            micLive: micPolicy(),
            cameraBlocked: camerasEnabled && Boolean(cameraError),
            micBlocked: Boolean(cameraError),
          }}
          localMutedToPeers={localMutedToPeers}
          topInset={topInset}
          bottomInset={bottomInset}
          t={t}
        />
      </View>

      <View style={styles.micTogglePlaying}>
        <MicToggle
          muted={micMuted}
          onToggle={() => {
            playSound('click');
            setMicMuted((v) => !v);
          }}
        />
      </View>

      {/* Top overlay: round + question + timer floating near the top. */}
      <View
        style={styles.overlayTop}
        pointerEvents="box-none"
        onLayout={(e) => setTopInset(e.nativeEvent.layout.height)}
      >
        <QuestionPanel {...sharedPanelProps} section="top" />
      </View>

      {/* Bottom overlay: answer buttons / results floating near the bottom. */}
      <View
        style={styles.overlayBottom}
        pointerEvents="box-none"
        onLayout={(e) => setBottomInset(e.nativeEvent.layout.height)}
      >
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={styles.panelContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <QuestionPanel {...sharedPanelProps} section="bottom" />
        </ScrollView>
      </View>
      {showWinner ? (
        <WinnerScreen
          players={players}
          me={me}
          rematchLoading={rematchLoading}
          onRematch={() => void voteRematch()}
          onExit={() => navigation.navigate('Home')}
          t={t}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  soundToggleWrap: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 20,
  },
  // In-game: sit just below the (taller) self-camera PiP at the top-right.
  micTogglePlaying: {
    position: 'absolute',
    top: 166,
    right: 14,
    zIndex: 20,
  },
  cameraLayer: { ...StyleSheet.absoluteFillObject },
  // Top overlay lives in the column to the LEFT of the self-camera PiP, so the
  // question can use most of the width while the bigger PiP sits top-right.
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 134,
    alignItems: 'stretch',
    paddingTop: 10,
    paddingLeft: 12,
    paddingRight: 4,
    zIndex: 10,
  },
  overlayBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '52%',
    zIndex: 10,
  },
  panelScroll: { flexGrow: 0 },
  panelContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24, gap: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  muted: { color: colors.textMuted },
  error: { color: colors.wrong, textAlign: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { paddingHorizontal: 10 },
  headerBtnMuted: { color: colors.textMuted, fontSize: 12 },
});
