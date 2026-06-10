import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import type { Game, Player, Question } from '@/lib/types';
import {
  QUESTION_TIME_SECONDS,
  THINK_TIME_SECONDS,
  VOICE_ANSWER_SECONDS,
  RESULT_TIME_SECONDS,
} from '@/hooks/useGameState';
import { CountdownTimer } from './CountdownTimer';
import { MCOptions } from './MCOptions';
import type { TranslateFn } from '@/lib/i18n';
import { colors } from '@/theme';

interface Props {
  game: Game;
  question: Question | null;
  me: Player | null;
  timeLeftMs: number;
  typedText: string;
  typedMode: boolean;
  onTypedChange: (text: string) => void;
  onToggleTypedMode: () => void;
  onSelectMC: (index: number) => void;
  onDone: () => void;
  onPushToTalkIn?: () => void;
  onPushToTalkOut?: () => void;
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

export function QuestionPanel({
  game,
  question,
  me,
  timeLeftMs,
  typedText,
  typedMode,
  onTypedChange,
  onToggleTypedMode,
  onSelectMC,
  onDone,
  onPushToTalkIn,
  onPushToTalkOut,
  t,
}: Props) {
  const idx = game.current_question_index + 1;

  return (
    <View style={styles.panel}>
      <Text style={styles.round}>
        {t('round')} {idx} {t('of')} {game.num_questions}
      </Text>

      {game.phase === 'thinking' ? (
        <View style={styles.center}>
          <Text style={styles.thinking}>{t('thinking')}</Text>
          <CountdownTimer
            timeLeftMs={timeLeftMs}
            totalMs={THINK_TIME_SECONDS * 1000}
          />
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

          {game.phase === 'question' && question.options ? (
            <MCOptions
              options={question.options}
              selected={me?.mc_index ?? null}
              disabled={!me}
              onSelect={onSelectMC}
            />
          ) : null}

          {game.phase === 'answering' ? (
            <View style={styles.voiceBox}>
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
                <Pressable style={styles.secondaryBtn} onPress={onToggleTypedMode}>
                  <Text style={styles.secondaryText}>
                    {typedMode ? t('speakInstead') : t('typeInstead')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.pttBtn, me?.done && styles.disabled]}
                  disabled={!!me?.done}
                  onPressIn={onPushToTalkIn}
                  onPressOut={onPushToTalkOut}
                >
                  <Text style={styles.pttText}>{t('pushToTalk')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, me?.done && styles.disabled]}
                  disabled={!!me?.done}
                  onPress={onDone}
                >
                  <Text style={styles.primaryText}>{t('done')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {game.phase === 'result' ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>{t('result')}</Text>
              <Text style={game.answer_correct ? styles.correct : styles.wrong}>
                {game.answer_correct ? t('correct') : t('wrong')}
              </Text>
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
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.textMuted },
  pttBtn: {
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  pttText: { color: colors.accentBright, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  resultBox: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  resultTitle: { color: colors.textMuted, fontSize: 14 },
  correct: { color: colors.correct, fontSize: 22, fontWeight: '700' },
  wrong: { color: colors.wrong, fontSize: 22, fontWeight: '700' },
});
