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
import { CreateGame } from '@/components/CreateGame';
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
    navigation.navigate('Game', { gameId: id, asHost: false });
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.brand}>{t('appName')}</Text>
      <CreateGame locale={locale} onLocaleChange={setLocale} onCreate={handleCreate} t={t} />

      <View style={styles.divider} />

      <Text style={styles.joinTitle}>{t('joinById')}</Text>
      <TextInput
        style={styles.input}
        value={joinInput}
        onChangeText={setJoinInput}
        placeholder={t('pasteGameId')}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />
      <Pressable style={styles.joinBtn} onPress={handleJoin}>
        <Text style={styles.joinBtnText}>{t('join')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  brand: {
    color: colors.accentBright,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  error: { color: colors.wrong, textAlign: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 20, marginVertical: 16 },
  joinTitle: { color: colors.text, fontSize: 18, fontWeight: '600', marginHorizontal: 20 },
  input: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  joinBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  joinBtnText: { color: colors.accentBright, fontWeight: '700' },
});
