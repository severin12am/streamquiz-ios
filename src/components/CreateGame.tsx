/**
 * Host create form — simplified home: topic + Create, then Adjust for settings.
 * Defaults: medium, MC on, cameras on, first-answer mode (`classic` in DB).
 * Colors: theme.ts (matches web globals.css lagoon palette).
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import type { TranslateFn } from '@/lib/i18n';
import type { Difficulty, GameMode } from '@/lib/types';
import { playSound } from '@/lib/sounds';
import { KeycapSegSlider } from '@/components/KeycapSegSlider';
import { KeycapButton } from '@/components/KeycapButton';
import { colors } from '@/theme';

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
  const [gameMode, setGameMode] = useState<GameMode>('classic');
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
      <TextInput
        style={styles.input}
        value={topic}
        onChangeText={setTopic}
        placeholder={t('topicPlaceholder')}
        placeholderTextColor={colors.textMuted}
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
              <Pressable
                key={d}
                style={[styles.chip, difficulty === d && styles.chipActive]}
                onPress={() => setDifficulty(d)}
              >
                <Text style={styles.chipText}>{t(d)}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{t('numQuestions')}</Text>
          <KeycapSegSlider value={numQuestions} onChange={setNumQuestions} />

          <View style={styles.switchRow}>
            <Text style={styles.label}>{t('multipleChoice')}</Text>
            <Switch value={mcMode} onValueChange={setMcMode} trackColor={{ true: colors.accent }} />
          </View>
          {!mcMode ? <Text style={styles.hint}>{t('voiceAnswers')}</Text> : null}

          <Text style={styles.label}>{t('gameMode')}</Text>
          <Pressable
            style={[styles.modeCard, gameMode === 'classic' && styles.modeCardActive]}
            onPress={() => setGameMode('classic')}
          >
            <Text style={styles.modeTitle}>{t('firstAnswerMode')}</Text>
            <Text style={styles.modeDesc}>{t('firstAnswerModeDesc')}</Text>
          </Pressable>
          <Pressable
            style={[styles.modeCard, gameMode === 'think' && styles.modeCardActive]}
            onPress={() => setGameMode('think')}
          >
            <Text style={styles.modeTitle}>{t('thinkRaceMode')}</Text>
            <Text style={styles.modeDesc}>{t('thinkRaceModeDesc')}</Text>
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
  label: { color: colors.textMuted, fontSize: 14 },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: '#d8ebe8' },
  chipText: { color: colors.text, fontSize: 13 },
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
