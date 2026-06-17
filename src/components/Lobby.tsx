/** Pre-game lobby: player list, QR + copy/share link (host), START when ≥2 players. */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Share, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { Game, Player } from '@/lib/types';
import { MAX_PLAYERS } from '@/lib/types';
import { playerColor, playerInitial } from '@/lib/player-colors';
import type { TranslateFn } from '@/lib/i18n';
import { KeycapButton } from '@/components/KeycapButton';
import { KeycapWell } from '@/components/KeycapField';
import { colors } from '@/theme';

interface Props {
  game: Game;
  players: Player[];
  shareUrl: string;
  isHost: boolean;
  canStart: boolean;
  meId?: string;
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
  meId,
  onStart,
  onCopyLink,
  copied,
  t,
}: Props) {
  void game;
  const emptySeats = Array.from({ length: Math.max(0, MAX_PLAYERS - players.length) }, (_, i) => i);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('lobby')}</Text>
          <Text style={styles.count}>
            {players.length} / {MAX_PLAYERS} {t('playersWord')}
          </Text>
        </View>

        <View style={styles.list}>
          {players.map((p) => (
            <KeycapWell
              key={p.id}
              style={[styles.seatWell, p.id === meId ? styles.seatWellMe : null]}
            >
              <View style={styles.seatRow}>
                <View style={[styles.avatar, { backgroundColor: playerColor(p.slot) }]}>
                  <Text style={styles.avatarText}>{playerInitial(p.name)}</Text>
                </View>
                <Text style={styles.seatName} numberOfLines={1}>
                  {p.name}
                </Text>
                <View style={styles.seatTags}>
                  {p.role === 'host' ? <Text style={styles.hostTag}>{t('host')}</Text> : null}
                  {p.id === meId ? <Text style={styles.youTag}>({t('youPick')})</Text> : null}
                </View>
              </View>
            </KeycapWell>
          ))}
          {emptySeats.map((i) => (
            <KeycapWell key={`empty-${i}`} style={styles.seatWellEmpty}>
              <View style={styles.seatRow}>
                <View style={styles.emptyAvatar}>
                  <Text style={styles.emptyAvatarText}>{players.length + i + 1}</Text>
                </View>
                <Text style={styles.emptyName}>{t('emptySeat')}</Text>
              </View>
            </KeycapWell>
          ))}
        </View>

        {isHost ? (
          <View style={styles.invite}>
            <Text style={styles.inviteLabel}>{t('shareInvite')}</Text>
            <View style={styles.qrBox}>
              <QRCode value={shareUrl} size={140} backgroundColor="#ffffff" />
            </View>
            <KeycapWell style={styles.linkWell}>
              <Text style={styles.linkText} numberOfLines={1}>
                {shareUrl}
              </Text>
            </KeycapWell>
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
        ) : null}

        {isHost ? (
          <View style={styles.startWrap}>
            <KeycapButton variant="primary" disabled={!canStart} onPress={onStart}>
              {t('startQuiz')}
            </KeycapButton>
            {!canStart ? <Text style={styles.hint}>{t('needTwoPlayers')}</Text> : null}
          </View>
        ) : (
          <View style={styles.waitRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.waiting}>{t('waitingForHost')}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingTop: 48, paddingBottom: 40, flexGrow: 1, justifyContent: 'center' },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 20,
    shadowColor: '#1f3a34',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  header: { alignItems: 'center', gap: 4 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  count: { color: colors.textSecondary, fontSize: 14 },
  list: { gap: 8 },
  seatWell: { paddingHorizontal: 12, paddingVertical: 9 },
  seatWellMe: { borderTopColor: colors.accent, borderLeftColor: colors.accent, borderRightColor: colors.accent },
  seatWellEmpty: { paddingHorizontal: 12, paddingVertical: 9, opacity: 0.6 },
  seatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
  seatName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '500' },
  seatTags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hostTag: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  youTag: { color: colors.textMuted, fontSize: 11 },
  emptyAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  emptyAvatarText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  emptyName: { color: colors.textMuted, fontSize: 14 },
  invite: { alignItems: 'center', gap: 12 },
  inviteLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  qrBox: { padding: 12, borderRadius: 16, backgroundColor: '#ffffff' },
  linkWell: { width: '100%', paddingHorizontal: 12, paddingVertical: 10 },
  linkText: { color: colors.textSecondary, fontSize: 12 },
  linkActions: { flexDirection: 'row', gap: 10, width: '100%' },
  linkBtn: { flex: 1 },
  startWrap: { gap: 6 },
  hint: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  waitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  waiting: { color: colors.textSecondary, fontSize: 14 },
});
