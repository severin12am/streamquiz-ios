import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { TranslateFn } from '@/lib/i18n';
import { playSound } from '@/lib/sounds';
import { KeycapButton } from '@/components/KeycapButton';
import { KeycapTextField, KeycapWell } from '@/components/KeycapField';
import { colors } from '@/theme';

interface Props {
  initialName: string;
  loading: boolean;
  gameFull: boolean;
  asHost?: boolean;
  onJoin: (name: string) => void;
  t: TranslateFn;
}

export function JoinScreen({ initialName, loading, gameFull, asHost, onJoin, t }: Props) {
  const [name, setName] = useState(initialName);
  const disabled = !name.trim() || gameFull || loading;

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{asHost ? t('joinAsHostTitle') : t('joinGame')}</Text>
          <Text style={styles.subtitle}>{t('joinSubtitle')}</Text>
        </View>

        {gameFull ? (
          <KeycapWell style={styles.fullWell}>
            <Text style={styles.fullText}>{t('gameFull')}</Text>
          </KeycapWell>
        ) : (
          <>
            <KeycapTextField
              align="center"
              value={name}
              onChangeText={setName}
              placeholder={t('yourName')}
              maxLength={24}
              autoCapitalize="words"
              returnKeyType="go"
              onSubmitEditing={() => {
                if (!disabled) {
                  playSound('click');
                  onJoin(name.trim());
                }
              }}
            />
            <KeycapButton
              variant="primary"
              disabled={disabled}
              onPress={() => {
                playSound('click');
                onJoin(name.trim());
              }}
            >
              {loading ? <ActivityIndicator color={colors.onPrimary} /> : t('join')}
            </KeycapButton>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 18,
    shadowColor: '#1f3a34',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  header: { alignItems: 'center', gap: 6 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  fullWell: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  fullText: { color: colors.wrong, fontSize: 14, textAlign: 'center' },
});
