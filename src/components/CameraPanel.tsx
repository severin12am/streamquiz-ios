/** Single player tile: video or avatar, score, result badge, mic/camera-off, answering pill. */
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
  /** Has this player answered this round? Shows a small status dot. */
  answered?: boolean | null;
  answeringLabel?: string;
  mutedLabel?: string;
  /** Fill the parent (background mode) instead of a fixed 4:3 tile. */
  fill?: boolean;
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
  answered = null,
  answeringLabel = 'Answering',
  mutedLabel = "Can't hear",
  fill = false,
}: Props) {
  const color = playerColor(player.slot);
  const resultBadge =
    showResult && player.correct === true ? '✓' : showResult && player.correct === false ? '✗' : null;

  const showCameraFeed = showVideo && stream && !cameraBlocked;
  const showCameraOff = showVideo && (!stream || cameraBlocked);
  const showMicOff = micBlocked || !micLive;

  return (
    <View
      style={[
        styles.tile,
        fill ? styles.tileFill : styles.tileAspect,
        { borderColor: isAnswering ? colors.accentBright : color },
      ]}
    >
      {showCameraFeed ? (
        <RTCView streamURL={stream.toURL()} style={styles.video} objectFit="cover" />
      ) : (
        <View style={[styles.avatar, { backgroundColor: color }]}>
          {showCameraOff ? (
            <MaterialIcons name="videocam-off" size={38} color="rgba(255,255,255,0.85)" />
          ) : (
            <Text style={styles.initial}>{playerInitial(player.name)}</Text>
          )}
        </View>
      )}

      {/* Mic chip — top-left */}
      <View style={styles.micChip}>
        <MaterialIcons
          name={showMicOff ? 'mic-off' : 'mic'}
          size={14}
          color={showMicOff ? colors.wrong : '#fff'}
        />
      </View>

      {/* Answering pill (top-right) takes priority over the result badge */}
      {isAnswering ? (
        <View style={styles.answeringPill}>
          <View style={styles.answeringDot} />
          <Text style={styles.answeringText}>{answeringLabel}</Text>
        </View>
      ) : resultBadge ? (
        <View style={[styles.badge, player.correct ? styles.badgeCorrect : styles.badgeWrong]}>
          <Text style={styles.badgeText}>{resultBadge}</Text>
        </View>
      ) : null}

      {mutedToPeers ? (
        <View style={styles.mutedChip}>
          <MaterialIcons name="mic-off" size={12} color="#fff" />
          <Text style={styles.mutedText}>{mutedLabel}</Text>
        </View>
      ) : null}

      {/* Bottom bar */}
      <View style={styles.footer}>
        <View style={styles.nameWrap}>
          <View style={[styles.nameDot, { backgroundColor: color }]} />
          <Text style={styles.name} numberOfLines={1}>
            {player.name}
          </Text>
          {answered !== null ? (
            <View
              style={[
                styles.answeredDot,
                answered
                  ? { backgroundColor: colors.correct, borderWidth: 0 }
                  : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.6)' },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.scoreChip}>
          <Text style={styles.score}>{player.score}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#0c0f0e',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
  },
  tileAspect: { aspectRatio: 4 / 3 },
  tileFill: { flex: 1 },
  video: { flex: 1, backgroundColor: '#000' },
  avatar: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontSize: 36, fontWeight: '800' },
  micChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answeringPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.accentBright,
  },
  answeringDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  answeringText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  mutedChip: {
    position: 'absolute',
    top: 40,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(178, 58, 72, 0.92)',
  },
  mutedText: { color: '#fff', fontSize: 9, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  nameWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  nameDot: { width: 9, height: 9, borderRadius: 5 },
  name: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  answeredDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  scoreChip: {
    backgroundColor: colors.bgCard,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  score: { color: colors.gold, fontWeight: '800', fontSize: 13 },
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
