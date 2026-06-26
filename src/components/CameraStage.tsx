/**
 * Full-screen camera backdrop with tap-to-cycle layouts.
 *
 * Tapping ANY camera feed advances a single local layout index (no settings UI).
 * The quiz overlay (QuestionPanel, mic toggle) lives in GameScreen at a higher
 * z-index and is unaffected — only the arrangement of feeds changes here.
 *
 * Layout schema lives in lib/planLayout.ts:
 *   0  you PiP (top-right)      · others on stage (grid)
 *   1  pipOther PiP (top-right) · you + remaining others on stage
 *   2  you top 50%             · others bottom 50%
 *   3  others top 50%          · you bottom 50%
 *   4  letterbox (2p only)     · you + other, equal, middle band, no PiP
 *
 * Rules: at most one PiP (top-right); letterbox is 2-player only and is skipped
 * from the cycle for 3–6 players.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MediaStream } from 'react-native-webrtc';
import type { GamePhase, Player } from '@/lib/types';
import type { TranslateFn } from '@/lib/i18n';
import { layoutModeCount, planLayout, stageGridColumns } from '@/lib/planLayout';
import { CameraPanel } from './CameraPanel';

interface LocalMediaStatus {
  micLive: boolean;
  cameraBlocked: boolean;
  micBlocked: boolean;
}

interface Props {
  players: Player[];
  me: Player;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  camerasEnabled: boolean;
  showResult: boolean;
  phase: GamePhase;
  mcMode: boolean;
  localMedia: LocalMediaStatus;
  /** Measured top-UI height — defines the top edge of the letterbox band. */
  topInset?: number;
  /** Measured bottom-UI height — defines the bottom edge of the letterbox band. */
  bottomInset?: number;
  t: TranslateFn;
}

export function CameraStage({
  players,
  me,
  localStream,
  remoteStreams,
  camerasEnabled,
  showResult,
  phase,
  mcMode,
  localMedia,
  topInset = 0,
  bottomInset = 0,
  t,
}: Props) {
  const [layoutMode, setLayoutMode] = useState(0);

  const modeCount = layoutModeCount(players.length);
  // Keep the index in range as players join/leave so the cycle stays sane.
  useEffect(() => {
    setLayoutMode((m) => m % modeCount);
  }, [modeCount]);

  const canCycle = players.some((p) => p.id !== me.id);
  const advance = canCycle ? () => setLayoutMode((m) => (m + 1) % modeCount) : undefined;

  const plan = planLayout(me, players, layoutMode);

  const feedProps = (p: Player) => {
    const isLocal = p.id === me.id;
    const stream = isLocal ? localStream : remoteStreams.get(p.id) ?? null;
    const isAnswering = phase === 'answering' && p.done !== true;
    return {
      player: p,
      stream,
      showVideo: camerasEnabled,
      showResult,
      micLive: isLocal ? localMedia.micLive : true,
      cameraBlocked: isLocal ? localMedia.cameraBlocked : false,
      micBlocked: isLocal ? localMedia.micBlocked : false,
      isAnswering,
      mutedToPeers: isLocal && isAnswering && !mcMode,
      answeringLabel: t('playerAnswering'),
      mutedLabel: t('answeringMutedShort'),
      fill: true,
    };
  };

  // Even N-up grid: ≤2 tiles stack in 1 column, 3+ tile into 2 columns (2+1, 2+2, …).
  const renderGrid = (gridPlayers: Player[]) => {
    const columns = stageGridColumns(gridPlayers.length);
    const rows: Player[][] = [];
    for (let i = 0; i < gridPlayers.length; i += columns) {
      rows.push(gridPlayers.slice(i, i + columns));
    }
    return (
      <View style={styles.gridRoot}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.gridRow}>
            {row.map((p) => (
              <View key={p.id} style={styles.gridCell}>
                <CameraPanel {...feedProps(p)} />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderPip = (player: Player) => (
    <Pressable style={styles.pip} onPress={advance}>
      <CameraPanel {...feedProps(player)} />
    </Pressable>
  );

  let content: React.ReactNode;
  switch (plan.kind) {
    case 'letterbox':
      // Two equal feeds clipped to the band between the top and bottom UI.
      content = (
        <Pressable
          style={[styles.letterboxBand, { top: topInset, bottom: bottomInset }]}
          onPress={advance}
        >
          {plan.pair.map((p) => (
            <View key={p.id} style={styles.letterboxTile}>
              <CameraPanel {...feedProps(p)} />
            </View>
          ))}
        </Pressable>
      );
      break;
    case 'split':
      content = (
        <Pressable style={StyleSheet.absoluteFill} onPress={advance}>
          <View style={styles.half}>{renderGrid(plan.topHalf)}</View>
          <View style={styles.half}>{renderGrid(plan.bottomHalf)}</View>
        </Pressable>
      );
      break;
    case 'grid':
    default:
      content = (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={advance}>
            {renderGrid(plan.stage)}
          </Pressable>
          {plan.pip ? renderPip(plan.pip) : null}
        </>
      );
      break;
  }

  return <View style={StyleSheet.absoluteFill}>{content}</View>;
}

const styles = StyleSheet.create({
  gridRoot: { flex: 1, gap: 6, padding: 6 },
  gridRow: { flex: 1, flexDirection: 'row', gap: 6 },
  gridCell: { flex: 1 },
  half: { flex: 1 },
  pip: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 116,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 5,
  },
  letterboxBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 6,
    zIndex: 5,
  },
  letterboxTile: { flex: 1 },
});
