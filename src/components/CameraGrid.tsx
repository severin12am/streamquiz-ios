import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { MediaStream } from 'react-native-webrtc';
import type { Player } from '@/lib/types';
import { CameraPanel } from './CameraPanel';

interface Props {
  players: Player[];
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  myId: string | null;
  camerasEnabled: boolean;
  showResult?: boolean;
}

export function CameraGrid({
  players,
  localStream,
  remoteStreams,
  myId,
  camerasEnabled,
  showResult,
}: Props) {
  const count = players.length;
  const columns = count <= 2 ? 1 : count <= 4 ? 2 : 3;

  return (
    <View style={[styles.grid, { flexDirection: columns === 1 ? 'column' : 'row', flexWrap: 'wrap' }]}>
      {players.map((p) => {
        const stream = p.id === myId ? localStream : remoteStreams.get(p.id) ?? null;
        const widthPct = columns === 1 ? '100%' : columns === 2 ? '48%' : '31%';
        return (
          <View key={p.id} style={{ width: widthPct, marginBottom: 8 }}>
            <CameraPanel
              player={p}
              stream={stream}
              showVideo={camerasEnabled}
              showResult={showResult}
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
