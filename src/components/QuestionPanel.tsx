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
import { playerColor, playerInitial } from '@/lib/player-colors';
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
  /** Render for the translucent camera overlay (light text, no card chrome). */
  dark?: boolean;
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
  dark = false,
  t,
}: Props) {
  const idx = game.current_question_index + 1;
  const picksByOption = buildPicksByOption(players, me?.id);
  const secondsLeft = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const iHavePicked = !!me && me.mc_index !== null && me.mc_index !== undefined;
  const someonePicked = players.some((p) => p.mc_index !== null && p.mc_index !== undefined);
  const mcCanSelect =
    game.phase === 'question' && !!me && me.mc_index === null && !!question?.options;
  const showMcGrid =
    !!question?.options &&
    (game.phase === 'question' || (game.phase === 'result' && game.mc_mode));

  return (
    <View style={[styles.panel, dark && styles.panelDark]}>
      <Text style={[styles.round, dark && styles.textLightMuted]}>
        {t('round')} {idx} {t('of')} {game.num_questions}
      </Text>

      {game.phase === 'thinking' ? (
        <View style={styles.center}>
          <Text style={[styles.thinking, dark && styles.textLight]}>{t('thinking')}</Text>
          <CountdownTimer timeLeftMs={timeLeftMs} totalMs={THINK_TIME_SECONDS * 1000} />
        </View>
      ) : null}

      {game.phase === 'checking' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentBright} size="large" />
          <Text style={[styles.checking, dark && styles.textLightMuted]}>{t('checking')}</Text>
        </View>
      ) : null}

      {['question', 'answering', 'result'].includes(game.phase) && question ? (
        <>
          <Text style={[styles.question, dark && styles.textLight]}>{question.question}</Text>
          {['question', 'answering'].includes(game.phase) ? (
            <CountdownTimer
              timeLeftMs={timeLeftMs}
              totalMs={totalMsForPhase(game.phase, game.mc_mode)}
            />
          ) : null}

          {game.phase === 'question' && game.mc_mode ? (
            <View style={styles.mcStatus}>
              {iHavePicked ? (
                <Text style={[styles.mcStatusLocked, dark && styles.textLightMuted]}>
                  {t('answerLocked')} · {secondsLeft}
                  {t('secondsLeftSuffix')}
                </Text>
              ) : someonePicked ? (
                <Text style={styles.mcStatusUrgent}>
                  {t('someoneAnswered')} · {secondsLeft}
                  {t('secondsLeftSuffix')}
                </Text>
              ) : (
                <Text style={styles.mcStatusGo}>{t('answerNow')}</Text>
              )}
            </View>
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
              {[...players]
                .sort((a, b) => a.slot - b.slot)
                .map((p) => (
                  <VoiceResultRow
                    key={p.id}
                    name={p.name}
                    isMe={p.id === me?.id}
                    youLabel={t('youPick')}
                    colour={playerColor(p.slot)}
                    text={p.transcript}
                    correct={p.correct}
                    emptyHint={t('noAnswer')}
                  />
                ))}
              {question?.correct_answer ? (
                <View style={styles.correctAnswerBox}>
                  <Text style={styles.correctAnswerLabel}>{t('correctAnswerTitle')}</Text>
                  <Text style={styles.correctAnswerText}>{question.correct_answer}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function VoiceResultRow({
  name,
  isMe,
  youLabel,
  colour,
  text,
  correct,
  emptyHint,
}: {
  name: string;
  isMe: boolean;
  youLabel: string;
  colour: string;
  text: string | null;
  correct: boolean | null;
  emptyHint: string;
}) {
  const said = !!text && text.trim().length > 0;
  const badge = correct ? '✓' : said ? '✗' : '—';
  const badgeColor = correct ? colors.correct : said ? colors.wrong : colors.borderStrong;
  return (
    <View style={[styles.voiceResultRow, { borderLeftColor: colour }]}>
      <View style={[styles.voiceAvatar, { backgroundColor: colour }]}>
        <Text style={styles.voiceAvatarText}>{playerInitial(name)}</Text>
      </View>
      <View style={styles.voiceResultBody}>
        <Text style={[styles.voiceResultName, { color: colour }]} numberOfLines={1}>
          {name}
          {isMe ? ` (${youLabel})` : ''}
        </Text>
        <Text style={styles.voiceResultText} numberOfLines={2}>
          {said ? `\u201C${text}\u201D` : emptyHint}
        </Text>
      </View>
      <View style={[styles.voiceBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.voiceBadgeText}>{badge}</Text>
      </View>
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
  panelDark: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    padding: 4,
    flex: 0,
  },
  textLight: { color: '#eef3ec' },
  textLightMuted: { color: 'rgba(238,243,236,0.72)' },
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
  mcStatus: { minHeight: 24, alignItems: 'center', justifyContent: 'center' },
  mcStatusGo: { color: colors.correct, fontSize: 15, fontWeight: '700' },
  mcStatusUrgent: { color: colors.wrong, fontSize: 15, fontWeight: '700' },
  mcStatusLocked: { color: colors.textSecondary, fontSize: 13 },
  resultBox: { gap: 8, paddingVertical: 12, width: '100%' },
  resultTitle: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 4 },
  voiceResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    borderLeftWidth: 4,
  },
  voiceAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceAvatarText: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
  voiceResultBody: { flex: 1, minWidth: 0 },
  voiceResultName: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  voiceResultText: { color: colors.text, fontSize: 14, fontStyle: 'italic' },
  voiceBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBadgeText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  correctAnswerBox: {
    marginTop: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#dff5ea',
    alignItems: 'center',
  },
  correctAnswerLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  correctAnswerText: { color: colors.correct, fontSize: 17, fontWeight: '700' },
});
