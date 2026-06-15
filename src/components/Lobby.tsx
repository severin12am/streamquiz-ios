/** Pre-game lobby: player list, QR + copy/share link (host), START when ≥2 players. */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Share } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { Game, Player } from '@/lib/types';
import { playerColor } from '@/lib/player-colors';
import type { TranslateFn } from '@/lib/i18n';
import { KeycapButton } from '@/components/KeycapButton';
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
          <View style={styles.linkActions}>
            <KeycapButton variant="secondary" onPress={onCopyLink} style={styles.linkBtn}>
              {copied ? t('copied') : t('copyLink')}
            </KeycapButton>
            <KeycapButton
              variant="secondary"
              onPress={() => void Share.share({ message: shareUrl, url: shareUrl })}
              style={styles.linkBtn}
            >
              {t('shareLink')}
            </KeycapButton>
          </View>
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
              {p.role === 'host' ? ` (${t('host')})` : ` (${t('guest')})`}
            </Text>
          </View>
        ))}
      </View>

      {isHost ? (
        <View style={styles.startWrap}>
          <KeycapButton variant="primary" disabled={!canStart} onPress={onStart}>
            {t('startQuiz')}
          </KeycapButton>
          {!canStart ? <Text style={styles.hint}>{t('needTwoPlayers')}</Text> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 16, alignItems: 'center', paddingTop: 48 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  topic: { color: colors.textMuted, fontSize: 16 },
  qrBox: { alignItems: 'center', gap: 12, padding: 16 },
  linkActions: { flexDirection: 'row', gap: 10, width: '100%' },
  linkBtn: { flex: 1 },
  waiting: { color: colors.textMuted, textAlign: 'center' },
  list: { width: '100%', gap: 8 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  playerName: { color: colors.text, fontSize: 15 },
  startWrap: { width: '100%', gap: 6 },
  hint: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
});
