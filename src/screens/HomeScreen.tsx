/**
 * Home / create / join entry. Route: web "/".
 *
 * Create: API generate-questions → insert games row → navigate Game asHost:true.
 * Join: parse UUID from pasted link → navigate Game asHost:false.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { generateQuestions } from '@/api/client';
import { parseGameIdFromLink } from '@/api/client';
import { isConfigured } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import { addQuestionsToHistory, getPreviousQuestions } from '@/lib/question-history';
import { useLocale } from '@/context/LocaleProvider';
import { BrandLogo } from '@/components/BrandLogo';
import { CreateGame } from '@/components/CreateGame';
import { HomeDotTexture } from '@/components/HomeDotTexture';
import { KeycapButton } from '@/components/KeycapButton';
import { LanguagePicker } from '@/components/LanguagePicker';
import { SoundToggle } from '@/components/SoundToggle';
import { playSound } from '@/lib/sounds';
import type { RootStackParamList } from '@/navigation/types';
import { colors } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { t, locale, setLocale } = useLocale();
  const [joinInput, setJoinInput] = useState('');

  if (!isConfigured()) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('setupMissing')}</Text>
      </View>
    );
  }

  const handleCreate = async (params: {
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    num_questions: number;
    mc_mode: boolean;
    game_mode: 'think' | 'classic';
    cameras_enabled: boolean;
  }) => {
    try {
      const previous = await getPreviousQuestions(params.topic);
      const questions = await generateQuestions({
        ...params,
        locale,
        previous_questions: previous,
      });
      await addQuestionsToHistory(
        params.topic,
        questions.map((q) => q.question),
      );

      const { data, error } = await getSupabase()
        .from('games')
        .insert({
          topic: params.topic,
          difficulty: params.difficulty,
          num_questions: params.num_questions,
          mc_mode: params.mc_mode,
          game_mode: params.game_mode,
          cameras_enabled: params.cameras_enabled,
          questions,
          status: 'waiting',
          phase: 'waiting',
          current_question_index: 0,
        })
        .select('id')
        .single();

      if (error) throw error;
      navigation.navigate('Game', { gameId: data.id, asHost: true });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create game');
    }
  };

  const handleJoin = () => {
    const id = parseGameIdFromLink(joinInput);
    if (!id) {
      Alert.alert('Error', 'Invalid game ID or link');
      return;
    }
    playSound('click');
    navigation.navigate('Game', { gameId: id, asHost: false });
  };

  return (
    <View style={styles.root}>
      <HomeDotTexture />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={styles.topSpacer} />
        <SoundToggle style={styles.soundToggle} />
        <LanguagePicker locale={locale} onLocaleChange={setLocale} />
      </View>

      <BrandLogo />
      <Text style={styles.steps}>{t('homeSteps')}</Text>

      <CreateGame onCreate={handleCreate} t={t} />

      <View style={styles.joinCard}>
        <Text style={styles.joinTitle}>{t('joinById')}</Text>
        <TextInput
          style={styles.input}
          value={joinInput}
          onChangeText={setJoinInput}
          placeholder={t('pasteGameId')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />
        <KeycapButton variant="primary" onPress={handleJoin} style={styles.joinBtn}>
          {t('join')}
        </KeycapButton>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 8,
  },
  topSpacer: { flex: 1 },
  soundToggle: {},
  steps: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  error: { color: colors.wrong, textAlign: 'center' },
  joinCard: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    gap: 10,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  joinTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  joinBtn: {
    marginTop: 4,
  },
});
