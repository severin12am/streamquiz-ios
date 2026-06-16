/**
 * Central question UI: timer, MC options, voice input, per-player result rows.
 * answeringMuted banner: local player in voice phase (others can't hear on iOS).
 */
import React from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Game, Player, Question } from '@/lib/types';
import {
  QUESTION_TIME_SECONDS,
  THINK_TIME_SECONDS,
  VOICE_ANSWER_SECONDS,
  RESULT_TIME_SECONDS,
} from '@/hooks/useGameState';
import { playerColor } from '@/lib/player-colors';
import { CountdownTimer } from './CountdownTimer';
import { MCOptions, type OptionPick } from './MCOptions';
import { KeycapButton } from './KeycapButton';
import type { TranslateFn } from '@/lib/i18n';
import { colors } from '@/theme';

interface Props {
  game: Game;
  question: Question | null;
  players: Player[];
  me: Player | null;
  timeLeftMs: number;
  typedText: string;
  typedMode: boolean;
  speechUnavailable?: boolean;
  onTypedChange: (text: string) => void;
  onToggleTypedMode: () => void;
  onSelectMC: (index: number) => void;
  onDone: () => void;
  onPushToTalkIn?: () => void;
  onPushToTalkOut?: () => void;
  pttHeld?: boolean;
  t: TranslateFn;
}

function totalMsForPhase(phase: Game['phase'], mcMode: boolean): number {
  switch (phase) {
    case 'thinking':
      return THINK_TIME_SECONDS * 1000;
    case 'question':
      return QUESTION_TIME_SECONDS * 1000;
    case 'answering':
      return VOICE_ANSWER_SECONDS * 1000;
    case 'result':
      return RESULT_TIME_SECONDS * 1000;
    default:
      return mcMode ? QUESTION_TIME_SECONDS * 1000 : VOICE_ANSWER_SECONDS * 1000;
  }
}

function buildPicksByOption(players: Player[], meId: string | undefined): OptionPick[][] {
  const picks: OptionPick[][] = [[], [], [], []];
  for (const p of players) {
    if (p.mc_index !== null && p.mc_index >= 0 && p.mc_index < 4) {
      picks[p.mc_index]!.push({
        id: p.id,
        name: p.name,
        colour: playerColor(p.slot),
        isMe: p.id === meId,
      });
    }
  }
  return picks;
}

export function QuestionPanel({
  game,
  question,
  players,
  me,
  timeLeftMs,
  typedText,
  typedMode,
  speechUnavailable,
  onTypedChange,
  onToggleTypedMode,
  onSelectMC,
  onDone,
  onPushToTalkIn,
  onPushToTalkOut,
  pttHeld = false,
  t,
}: Props) {
  const idx = game.current_question_index + 1;
  const picksByOption = buildPicksByOption(players, me?.id);
  const mcCanSelect =
    game.phase === 'question' && !!me && me.mc_index === null && !!question?.options;
  const showMcGrid =
    !!question?.options &&
    (game.phase === 'question' || (game.phase === 'result' && game.mc_mode));

  return (
    <View style={styles.panel}>
      <Text style={styles.round}>
        {t('round')} {idx} {t('of')} {game.num_questions}
      </Text>

      {game.phase === 'thinking' ? (
        <View style={styles.center}>
          <Text style={styles.thinking}>{t('thinking')}</Text>
          <CountdownTimer timeLeftMs={timeLeftMs} totalMs={THINK_TIME_SECONDS * 1000} />
        </View>
      ) : null}

      {game.phase === 'checking' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentBright} size="large" />
          <Text style={styles.checking}>{t('checking')}</Text>
        </View>
      ) : null}

      {['question', 'answering', 'result'].includes(game.phase) && question ? (
        <>
          <Text style={styles.question}>{question.question}</Text>
          {['question', 'answering'].includes(game.phase) ? (
            <CountdownTimer
              timeLeftMs={timeLeftMs}
              totalMs={totalMsForPhase(game.phase, game.mc_mode)}
              label={game.phase === 'question' ? t('pickAnswer') : t('speakAnswer')}
            />
          ) : null}

          {showMcGrid && question.options ? (
            <MCOptions
              options={question.options}
              correctAnswer={game.phase === 'result' ? question.correct_answer : undefined}
              myPick={me?.mc_index ?? null}
              picksByOption={game.phase === 'result' ? picksByOption : undefined}
              canSelect={mcCanSelect}
              youLabel={t('youPick')}
              onSelect={onSelectMC}
            />
          ) : null}

          {game.phase === 'answering' ? (
            <View style={styles.voiceBox}>
              {me?.done ? (
                <View style={styles.answeringStatusWait}>
                  <Text style={styles.answeringStatusText}>{t('answeringWaiting')}</Text>
                </View>
              ) : (
                <View style={styles.answeringStatusMuted}>
                  <MaterialIcons name="mic-off" size={22} color={colors.accent} />
                  <Text style={styles.answeringStatusText}>{t('answeringMuted')}</Text>
                </View>
              )}
              {speechUnavailable ? (
                <Text style={styles.speechHint}>{t('speechUnavailable')}</Text>
              ) : null}
              <TextInput
                style={styles.input}
                value={typedText}
                onChangeText={onTypedChange}
                placeholder={t('speakAnswer')}
                placeholderTextColor={colors.textMuted}
                multiline
                editable={!me?.done}
              />
              <View style={styles.voiceActions}>
                <KeycapButton variant="secondary" onPress={onToggleTypedMode}>
                  {typedMode ? t('speakInstead') : t('typeInstead')}
                </KeycapButton>
                {onPushToTalkIn && onPushToTalkOut ? (
                  <KeycapButton
                    variant={pttHeld ? 'success' : 'secondary'}
                    onPressIn={onPushToTalkIn}
                    onPressOut={onPushToTalkOut}
                  >
                    {t('pushToTalk')}
                  </KeycapButton>
                ) : null}
                <KeycapButton variant="primary" disabled={!!me?.done} onPress={onDone}>
                  {t('done')}
                </KeycapButton>
              </View>
            </View>
          ) : null}

          {game.phase === 'result' && !game.mc_mode ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>{t('result')}</Text>
              {players.map((p) => {
                const badge = p.correct === true ? '✓' : p.correct === false ? '✗' : '—';
                const badgeStyle =
                  p.correct === true
                    ? styles.playerCorrect
                    : p.correct === false
                      ? styles.playerWrong
                      : styles.playerNeutral;
                return (
                  <View key={p.id} style={styles.playerResultRow}>
                    <Text style={styles.playerResultName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={[styles.playerResultBadge, badgeStyle]}>{badge}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1,
  },
  round: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  center: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  thinking: { color: colors.text, fontSize: 20, fontWeight: '600' },
  checking: { color: colors.textMuted, marginTop: 8 },
  question: { color: colors.text, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  voiceBox: { gap: 10 },
  speechHint: { color: colors.wrong, fontSize: 13, textAlign: 'center' },
  answeringStatusMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#d8ebe8',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  answeringStatusWait: {
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  answeringStatusText: { color: colors.text, fontSize: 14, flex: 1, fontWeight: '500' },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
  },
  voiceActions: { gap: 8 },
  disabled: { opacity: 0.5 },
  resultBox: { gap: 8, paddingVertical: 12, width: '100%' },
  resultTitle: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 4 },
  playerResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: 8,
  },
  playerResultName: { color: colors.text, flex: 1, fontSize: 14 },
  playerResultBadge: { fontSize: 18, fontWeight: '700', minWidth: 28, textAlign: 'center' },
  playerCorrect: { color: colors.correct },
  playerWrong: { color: colors.wrong },
  playerNeutral: { color: colors.textMuted },
});
