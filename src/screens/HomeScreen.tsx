/**
 * Home / create / join entry. Route: web "/".
 *
 * Create: POST /api/create-game (server creates row + questions) → navigate Game asHost:true.
 * Join: parse UUID from pasted link → navigate Game asHost:false.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import * as Linking from 'expo-linking';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createGame, parseGameIdFromLink } from '@/api/client';
import { isConfigured } from '@/lib/config';
import { addQuestionsToHistory, getPreviousQuestions } from '@/lib/question-history';
import { useLocale } from '@/context/LocaleProvider';
import { useEntitlements } from '@/context/EntitlementsProvider';
import { BrandLogo } from '@/components/BrandLogo';
import { CreateGame } from '@/components/CreateGame';
import { HomeDotTexture } from '@/components/HomeDotTexture';
import { KeycapButton } from '@/components/KeycapButton';
import { KeycapTextField } from '@/components/KeycapField';
import { LanguagePicker } from '@/components/LanguagePicker';
import { SoundToggle } from '@/components/SoundToggle';
import { playSound } from '@/lib/sounds';
import type { RootStackParamList } from '@/navigation/types';
import type { GameMode } from '@/lib/types';
import { colors } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const LEGAL_URL = 'https://severin12am.github.io/whosmarter-legal';

export function HomeScreen({ navigation }: Props) {
  const { t, locale, setLocale } = useLocale();
  const { allowance, refresh, noteCreated } = useEntitlements();
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
    game_mode: GameMode;
    cameras_enabled: boolean;
  }) => {
    // Joining is always free; creating is gated. Check before spending any AI
    // tokens or inserting a row.
    const current = await refresh();
    if (!current.allowed) {
      navigation.navigate('Paywall', {
        reason: current.tier === 'free' ? 'trial' : 'monthly',
      });
      return;
    }

    try {
      const previous = await getPreviousQuestions(params.topic);
      const { gameId, questions } = await createGame({
        ...params,
        locale,
        previous_questions: previous,
      });
      await addQuestionsToHistory(
        params.topic,
        questions.map((q) => q.question),
      );
      await noteCreated();
      navigation.navigate('Game', { gameId, asHost: true });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create game');
    }
  };

  const quotaLabel = (() => {
    if (!allowance) return null;
    const suffix =
      allowance.tier === 'free' ? t('paywallFreeLeft') : t('paywallMonthlyLeft');
    return `${allowance.remaining} ${suffix}`;
  })();

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

      {quotaLabel ? (
        <Pressable style={styles.quotaPill} onPress={() => navigation.navigate('Paywall')}>
          <Text style={styles.quotaText}>{quotaLabel}</Text>
          <Text style={styles.quotaLink}>{t('seePlans')}</Text>
        </Pressable>
      ) : null}

      <CreateGame onCreate={handleCreate} t={t} />

      <View style={styles.joinCard}>
        <Text style={styles.joinTitle}>{t('joinById')}</Text>
        <KeycapTextField
          value={joinInput}
          onChangeText={setJoinInput}
          placeholder={t('pasteGameId')}
          autoCapitalize="none"
        />
        <KeycapButton variant="primary" onPress={handleJoin} style={styles.joinBtn}>
          {t('join')}
        </KeycapButton>
      </View>

      <Pressable
        style={styles.legalLink}
        hitSlop={8}
        onPress={() => void Linking.openURL(LEGAL_URL)}
      >
        <Text style={styles.legalText}>{t('privacySupport')}</Text>
      </Pressable>
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
  quotaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quotaText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  quotaLink: { color: colors.accent, fontSize: 13, fontWeight: '700' },
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
  legalLink: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 8,
  },
  legalText: {
    color: colors.textMuted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
