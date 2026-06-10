import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RTCView, type MediaStream } from 'react-native-webrtc';
import type { Player } from '@/lib/types';
import { playerColor, playerInitial } from '@/lib/player-colors';
import { colors } from '@/theme';

interface Props {
  player: Player;
  stream?: MediaStream | null;
  showVideo: boolean;
  showResult?: boolean;
}

export function CameraPanel({ player, stream, showVideo, showResult }: Props) {
  const resultBadge =
    showResult && player.correct === true ? '✓' : showResult && player.correct === false ? '✗' : null;

  return (
    <View style={styles.tile}>
      {showVideo && stream ? (
        <RTCView streamURL={stream.toURL()} style={styles.video} objectFit="cover" />
      ) : (
        <View style={[styles.avatar, { backgroundColor: playerColor(player.slot) }]}>
          <Text style={styles.initial}>{playerInitial(player.name)}</Text>
        </View>
      )}
      <View style={styles.footer}>
        <Text style={styles.name} numberOfLines={1}>
          {player.name}
        </Text>
        <Text style={styles.score}>{player.score}</Text>
      </View>
      {resultBadge ? (
        <View
          style={[
            styles.badge,
            player.correct ? styles.badgeCorrect : styles.badgeWrong,
          ]}
        >
          <Text style={styles.badgeText}>{resultBadge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    aspectRatio: 4 / 3,
  },
  video: { flex: 1, backgroundColor: '#000' },
  avatar: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontSize: 36, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  name: { color: colors.text, fontSize: 12, flex: 1 },
  score: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCorrect: { backgroundColor: colors.correct },
  badgeWrong: { backgroundColor: colors.wrong },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
