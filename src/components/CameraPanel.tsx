/** Single player tile: video or avatar, score, result badge, mic/camera-off, answering banner. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RTCView, type MediaStream } from 'react-native-webrtc';
import type { Player } from '@/lib/types';
import { playerColor, playerInitial } from '@/lib/player-colors';
import { colors } from '@/theme';

interface Props {
  player: Player;
  stream?: MediaStream | null;
  showVideo: boolean;
  showResult?: boolean;
  /** Local tile only — mic is actively sending to peers. */
  micLive?: boolean;
  /** Camera unavailable (permission denied or capture failed). */
  cameraBlocked?: boolean;
  /** Microphone unavailable (permission denied or capture failed). */
  micBlocked?: boolean;
  /** Player is still in the voice answer window (!done). */
  isAnswering?: boolean;
  /** Local voice round — mic off so others cannot hear you while you answer. */
  mutedToPeers?: boolean;
  answeringLabel?: string;
  mutedLabel?: string;
}

export function CameraPanel({
  player,
  stream,
  showVideo,
  showResult,
  micLive = false,
  cameraBlocked = false,
  micBlocked = false,
  isAnswering = false,
  mutedToPeers = false,
  answeringLabel = 'Answering',
  mutedLabel = "Can't hear",
}: Props) {
  const resultBadge =
    showResult && player.correct === true ? '✓' : showResult && player.correct === false ? '✗' : null;

  const showCameraFeed = showVideo && stream && !cameraBlocked;
  const showCameraOff = showVideo && (!stream || cameraBlocked);
  const showMicOff = micBlocked || !micLive;

  return (
    <View style={[styles.tile, isAnswering && styles.tileAnswering]}>
      {showCameraFeed ? (
        <RTCView streamURL={stream.toURL()} style={styles.video} objectFit="cover" />
      ) : (
        <View style={[styles.avatar, { backgroundColor: playerColor(player.slot) }]}>
          {showCameraOff ? (
            <MaterialIcons name="videocam-off" size={40} color="rgba(255,255,255,0.85)" />
          ) : (
            <Text style={styles.initial}>{playerInitial(player.name)}</Text>
          )}
        </View>
      )}
      <View style={styles.footer}>
        <Text style={styles.name} numberOfLines={1}>
          {player.name}
        </Text>
        <Text style={styles.score}>{player.score}</Text>
      </View>
      {isAnswering ? (
        <View style={styles.answeringBanner}>
          <Text style={styles.answeringText}>{answeringLabel}</Text>
          {mutedToPeers ? (
            <View style={styles.mutedRow}>
              <MaterialIcons name="mic-off" size={14} color="#fff" />
              <Text style={styles.mutedText}>{mutedLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {showMicOff ? (
        <View style={styles.micBadge}>
          <MaterialIcons name="mic-off" size={16} color="#fff" />
        </View>
      ) : null}
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
  tileAnswering: {
    borderColor: colors.accentBright,
    borderWidth: 2,
  },
  answeringBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(47, 125, 119, 0.92)',
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  answeringText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  mutedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mutedText: { color: '#e8f5f3', fontSize: 10, fontWeight: '600' },
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
  micBadge: {
    position: 'absolute',
    bottom: 36,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
