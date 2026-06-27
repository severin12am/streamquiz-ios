/**
 * Host create form — simplified home: topic + Create, then Adjust for settings.
 * Defaults: medium, MC on, cameras on, "every answer counts" (`regular` in DB).
 * Colors: theme.ts (matches web globals.css lagoon palette).
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import type { TranslateFn } from '@/lib/i18n';
import type { Difficulty, GameMode } from '@/lib/types';
import { playSound } from '@/lib/sounds';
import { KeycapSegSlider } from '@/components/KeycapSegSlider';
import { KeycapButton } from '@/components/KeycapButton';
import { KeycapTextField } from '@/components/KeycapField';
import { colors } from '@/theme';
import { VOICE_ANSWERS_ENABLED } from '@/lib/features';

interface Props {
  onCreate: (params: {
    topic: string;
    difficulty: Difficulty;
    num_questions: number;
    mc_mode: boolean;
    game_mode: GameMode;
    cameras_enabled: boolean;
  }) => Promise<void>;
  t: TranslateFn;
}

export function CreateGame({ onCreate, t }: Props) {
  const [topic, setTopic] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [mcMode, setMcMode] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>('regular');
  const [camerasEnabled, setCamerasEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

  const handleCreate = async () => {
    if (!topic.trim()) return;
    playSound('click');
    setLoading(true);
    try {
      await onCreate({
        topic: topic.trim(),
        difficulty,
        num_questions: numQuestions,
        mc_mode: mcMode,
        game_mode: gameMode,
        cameras_enabled: camerasEnabled,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t('topic')}</Text>
      <KeycapTextField
        value={topic}
        onChangeText={setTopic}
        placeholder={t('topicPlaceholder')}
      />

      <KeycapButton
        variant="primary"
        disabled={!topic.trim() || loading}
        onPress={handleCreate}
      >
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : t('createChallenge')}
      </KeycapButton>

      <KeycapButton variant="secondary" onPress={() => setShowAdjust((v) => !v)}>
        {showAdjust ? t('hideAdjust') : t('adjust')}
      </KeycapButton>

      {showAdjust ? (
        <View style={styles.adjustPanel}>
          <Text style={styles.adjustHeading}>{t('settings')}</Text>

          <Text style={styles.label}>{t('difficulty')}</Text>
          <View style={styles.row}>
            {difficulties.map((d) => (
              <KeycapButton
                key={d}
                variant={difficulty === d ? 'primary' : 'secondary'}
                onPress={() => {
                  playSound('click');
                  setDifficulty(d);
                }}
                style={styles.diffBtn}
                contentStyle={styles.diffFace}
                textStyle={styles.diffText}
              >
                {t(d)}
              </KeycapButton>
            ))}
          </View>

          <Text style={styles.label}>{t('numQuestions')}</Text>
          <KeycapSegSlider value={numQuestions} onChange={setNumQuestions} />

          <View style={styles.switchRow}>
            <Text style={styles.label}>{t('multipleChoice')}</Text>
            <Switch value={mcMode} onValueChange={setMcMode} trackColor={{ true: colors.accent }} />
          </View>
          {!mcMode ? (
            <Text style={styles.hint}>
              {t(VOICE_ANSWERS_ENABLED ? 'voiceAnswers' : 'typedAnswers')}
            </Text>
          ) : null}

          <Text style={styles.label}>{t('gameMode')}</Text>
          <Pressable
            style={[styles.modeCard, gameMode === 'regular' && styles.modeCardActive]}
            onPress={() => setGameMode('regular')}
          >
            <Text style={styles.modeTitle}>{t('everyAnswerMode')}</Text>
            <Text style={styles.modeDesc}>{t('everyAnswerModeDesc')}</Text>
          </Pressable>
          <Pressable
            style={[styles.modeCard, gameMode === 'hardcore' && styles.modeCardActive]}
            onPress={() => setGameMode('hardcore')}
          >
            <Text style={styles.modeTitle}>{t('firstCorrectMode')}</Text>
            <Text style={styles.modeDesc}>{t('firstCorrectModeDesc')}</Text>
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={styles.label}>{camerasEnabled ? t('camerasOn') : t('camerasOff')}</Text>
            <Switch
              value={camerasEnabled}
              onValueChange={setCamerasEnabled}
              trackColor={{ true: colors.accent }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 20,
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: 8 },
  diffBtn: { flex: 1 },
  diffFace: { paddingVertical: 11, paddingHorizontal: 8 },
  diffText: { fontSize: 15 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { color: colors.textMuted, fontSize: 12 },
  adjustPanel: {
    gap: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  adjustHeading: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  disabled: { opacity: 0.5 },
  modeCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  modeCardActive: {
    borderColor: colors.accent,
    backgroundColor: '#d8ebe8',
  },
  modeTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  modeDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
