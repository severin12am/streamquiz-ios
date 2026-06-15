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
  t,
}: Props) {
  const count = players.length;
  const columns = count <= 2 ? 1 : count <= 4 ? 2 : 3;

  return (
    <View style={[styles.grid, { flexDirection: columns === 1 ? 'column' : 'row', flexWrap: 'wrap' }]}>
      {players.map((p) => {
        const stream = p.id === myId ? localStream : remoteStreams.get(p.id) ?? null;
        const widthPct = columns === 1 ? '100%' : columns === 2 ? '48%' : '31%';
        const isLocal = p.id === myId;
        const isAnswering = phase === 'answering' && p.done !== true;
        const mutedToPeers = isLocal && isAnswering && !mcMode;
        return (
          <View key={p.id} style={{ width: widthPct, marginBottom: 8 }}>
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
              answeringLabel={t('playerAnswering')}
              mutedLabel={t('answeringMutedShort')}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 8, justifyContent: 'space-between' },
});
