import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import type { TranslateFn } from '@/lib/i18n';
import { playSound } from '@/lib/sounds';
import { KeycapButton } from '@/components/KeycapButton';
import { colors } from '@/theme';

interface Props {
  initialName: string;
  loading: boolean;
  gameFull: boolean;
  onJoin: (name: string) => void;
  t: TranslateFn;
}

export function JoinScreen({ initialName, loading, gameFull, onJoin, t }: Props) {
  const [name, setName] = useState(initialName);
  const disabled = !name.trim() || gameFull || loading;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('joinGame')}</Text>
      {gameFull ? <Text style={styles.error}>{t('gameFull')}</Text> : null}
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('yourName')}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  error: { color: colors.wrong, textAlign: 'center' },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
