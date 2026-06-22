/** Responsive grid of CameraPanel tiles. Passes local media status only for myId. */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { MediaStream } from 'react-native-webrtc';
import type { GamePhase, Player } from '@/lib/types';
import type { TranslateFn } from '@/lib/i18n';
import { CameraPanel } from './CameraPanel';

interface LocalMediaStatus {
  micLive: boolean;
  cameraBlocked: boolean;
  micBlocked: boolean;
}

interface Props {
  players: Player[];
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  myId: string | null;
  camerasEnabled: boolean;
  showResult?: boolean;
  localMedia?: LocalMediaStatus;
  phase?: GamePhase;
  mcMode?: boolean;
  /** Fill the parent (WhatsApp-style background) instead of fixed-ratio tiles. */
  fill?: boolean;
  t: TranslateFn;
}

export function CameraGrid({
  players,
  localStream,
  remoteStreams,
  myId,
  camerasEnabled,
  showResult,
  localMedia,
  phase,
  mcMode = false,
  fill = false,
  t,
}: Props) {
  const count = players.length;
  // Fill mode (WhatsApp-style background) shows opponents only — a single
  // opponent fills the screen, 2+ tile into a 2-column grid (handles up to 6).
  const columns = fill ? (count <= 1 ? 1 : 2) : count <= 2 ? 1 : count <= 4 ? 2 : 3;
  const showAnswered = phase === 'question' || phase === 'answering';

  const renderTile = (p: Player) => {
    const stream = p.id === myId ? localStream : remoteStreams.get(p.id) ?? null;
    const isLocal = p.id === myId;
    const isAnswering = phase === 'answering' && p.done !== true;
    const mutedToPeers = isLocal && isAnswering && !mcMode;
    const answered = showAnswered ? (mcMode ? p.mc_index !== null : p.done) : null;
    return (
      <CameraPanel
        player={p}
        stream={stream}
        showVideo={camerasEnabled}
        showResult={showResult}
        micLive={isLocal ? (localMedia?.micLive ?? false) : true}
        cameraBlocked={isLocal ? localMedia?.cameraBlocked : false}
        micBlocked={isLocal ? localMedia?.micBlocked : false}
        isAnswering={isAnswering}
        mutedToPeers={mutedToPeers}
        answered={answered}
        answeringLabel={t('playerAnswering')}
        mutedLabel={t('answeringMutedShort')}
        fill={fill}
      />
    );
  };

  // Fill mode: tiles fill the available space as an even grid (the camera
  // feeds become the full-screen background under the quiz overlay).
  if (fill) {
    const rows: Player[][] = [];
    for (let i = 0; i < players.length; i += columns) {
      rows.push(players.slice(i, i + columns));
    }
    return (
      <View style={styles.fillRoot}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.fillRow}>
            {row.map((p) => (
              <View key={p.id} style={styles.fillCell}>
                {renderTile(p)}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.grid, { flexDirection: columns === 1 ? 'column' : 'row', flexWrap: 'wrap' }]}>
      {players.map((p) => {
        const widthPct = columns === 1 ? '100%' : columns === 2 ? '48%' : '31%';
        return (
          <View key={p.id} style={{ width: widthPct, marginBottom: 8 }}>
            {renderTile(p)}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 8, justifyContent: 'space-between' },
  fillRoot: { flex: 1, gap: 6 },
  fillRow: { flex: 1, flexDirection: 'row', gap: 6 },
  fillCell: { flex: 1 },
});
