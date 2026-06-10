import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { Game, Player } from '@/lib/types';
import { playerColor } from '@/lib/player-colors';
import type { TranslateFn } from '@/lib/i18n';
import { colors } from '@/theme';

interface Props {
  game: Game;
  players: Player[];
  shareUrl: string;
  isHost: boolean;
  canStart: boolean;
  onStart: () => void;
  onCopyLink: () => void;
  copied: boolean;
  t: TranslateFn;
}

export function Lobby({
  game,
  players,
  shareUrl,
  isHost,
  canStart,
  onStart,
  onCopyLink,
  copied,
  t,
}: Props) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{t('lobby')}</Text>
      <Text style={styles.topic}>{game.topic}</Text>

      {isHost ? (
        <View style={styles.qrBox}>
          <QRCode value={shareUrl} size={160} backgroundColor="#fff" />
          <Pressable style={styles.copyBtn} onPress={onCopyLink}>
            <Text style={styles.copyText}>{copied ? t('copied') : t('copyLink')}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.waiting}>{t('waitingForHost')}</Text>
      )}

      <View style={styles.list}>
        {players.map((p) => (
          <View key={p.id} style={styles.playerRow}>
            <View style={[styles.dot, { backgroundColor: playerColor(p.slot) }]} />
            <Text style={styles.playerName}>
              {t('seat')} {p.slot + 1}: {p.name}
              {p.role === 'host' ? ` (${t('host')})` : ''}
            </Text>
          </View>
        ))}
      </View>

      {isHost ? (
        <Pressable
          style={[styles.startBtn, !canStart && styles.disabled]}
          disabled={!canStart}
          onPress={onStart}
        >
          <Text style={styles.startText}>{t('startQuiz')}</Text>
          {!canStart ? <Text style={styles.hint}>{t('needTwoPlayers')}</Text> : null}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 16, alignItems: 'center' },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  topic: { color: colors.textMuted, fontSize: 16 },
  qrBox: { alignItems: 'center', gap: 12, padding: 16 },
  copyBtn: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyText: { color: colors.accentBright },
  waiting: { color: colors.textMuted, textAlign: 'center' },
  list: { width: '100%', gap: 8 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  playerName: { color: colors.text, fontSize: 15 },
  startBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
  },
  startText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  hint: { color: '#d0efe8', fontSize: 12, marginTop: 4 },
  disabled: { opacity: 0.5 },
});
