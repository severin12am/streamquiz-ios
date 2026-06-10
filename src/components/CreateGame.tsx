import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import type { TranslateFn } from '@/lib/i18n';
import type { Difficulty, GameMode, Locale } from '@/lib/types';
import { colors } from '@/theme';

interface Props {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
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

export function CreateGame({ locale, onLocaleChange, onCreate, t }: Props) {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [mcMode, setMcMode] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>('think');
  const [camerasEnabled, setCamerasEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

  const handleCreate = async () => {
    if (!topic.trim()) return;
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
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{t('createChallenge')}</Text>

      <View style={styles.langRow}>
        <Pressable
          style={[styles.chip, locale === 'en' && styles.chipActive]}
          onPress={() => onLocaleChange('en')}
        >
          <Text style={styles.chipText}>{t('english')}</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, locale === 'ru' && styles.chipActive]}
          onPress={() => onLocaleChange('ru')}
        >
          <Text style={styles.chipText}>{t('russian')}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>{t('topic')}</Text>
      <TextInput
        style={styles.input}
        value={topic}
        onChangeText={setTopic}
        placeholder={t('topicPlaceholder')}
        placeholderTextColor={colors.textMuted}
      />

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

      <Text style={styles.label}>{t('numQuestions')}: {numQuestions}</Text>
      <View style={styles.row}>
        {[3, 5, 7, 10].map((n) => (
          <Pressable
            key={n}
            style={[styles.chip, numQuestions === n && styles.chipActive]}
            onPress={() => setNumQuestions(n)}
          >
            <Text style={styles.chipText}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.label}>{t('multipleChoice')}</Text>
        <Switch value={mcMode} onValueChange={setMcMode} trackColor={{ true: colors.accent }} />
      </View>
      {!mcMode ? (
        <Text style={styles.hint}>{t('voiceAnswers')}</Text>
      ) : null}

      <View style={styles.row}>
        <Pressable
          style={[styles.chip, gameMode === 'think' && styles.chipActive]}
          onPress={() => setGameMode('think')}
        >
          <Text style={styles.chipText}>{t('thinkRace')}</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, gameMode === 'classic' && styles.chipActive]}
          onPress={() => setGameMode('classic')}
        >
          <Text style={styles.chipText}>{t('classic')}</Text>
        </Pressable>
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.label}>{camerasEnabled ? t('camerasOn') : t('camerasOff')}</Text>
        <Switch
          value={camerasEnabled}
          onValueChange={setCamerasEnabled}
          trackColor={{ true: colors.accent }}
        />
      </View>

      <Pressable
        style={[styles.btn, (!topic.trim() || loading) && styles.disabled]}
        disabled={!topic.trim() || loading}
        onPress={handleCreate}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>{t('createChallenge')}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', marginBottom: 8 },
  label: { color: colors.textMuted, fontSize: 14 },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.accentBright, backgroundColor: '#1e3330' },
  chipText: { color: colors.text, fontSize: 13 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { color: colors.textMuted, fontSize: 12 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
