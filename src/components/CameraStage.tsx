/**
 * Full-screen camera backdrop with tap-to-cycle layouts.
 *
 * Tapping ANY camera feed advances a single global layout index through a fixed
 * cycle — no settings UI. The quiz overlay (QuestionPanel, mic toggle) lives in
 * GameScreen and is unaffected; only the arrangement of feeds changes here.
 *
 * Cycle (built from the live player list, so it adapts to joins/leaves):
 *   1. grid          — opponents fill the screen, my feed is a top-right PiP (default look)
 *   2. grid-bottom   — same grid, my PiP moves to the bottom-right
 *   3. self-main     — my camera fills the screen, opponents become a bottom strip
 *   4..N spotlight   — each opponent in turn fills the screen, everyone else a top strip
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MediaStream } from 'react-native-webrtc';
import type { GamePhase, Player } from '@/lib/types';
import type { TranslateFn } from '@/lib/i18n';
import { CameraGrid } from './CameraGrid';
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
  t: TranslateFn;
}

type LayoutKind = 'grid' | 'grid-bottom' | 'self-main' | 'spotlight';
interface LayoutDesc {
  kind: LayoutKind;
  focusId?: string;
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
  t,
}: Props) {
  const [index, setIndex] = useState(0);

  const others = players.filter((p) => p.id !== me.id);

  const layouts: LayoutDesc[] =
    others.length === 0
      ? [{ kind: 'grid' }]
      : [
          { kind: 'grid' },
          { kind: 'grid-bottom' },
          { kind: 'self-main' },
          ...others.map((o): LayoutDesc => ({ kind: 'spotlight', focusId: o.id })),
        ];

  const layout = layouts[index % layouts.length];
  const advance = () => setIndex((i) => (i + 1) % layouts.length);

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

  const renderGrid = (gridPlayers: Player[]) => (
    <Pressable style={StyleSheet.absoluteFill} onPress={advance}>
      <CameraGrid
        players={gridPlayers}
        localStream={localStream}
        remoteStreams={remoteStreams}
        myId={me.id}
        camerasEnabled={camerasEnabled}
        showResult={showResult}
        phase={phase}
        mcMode={mcMode}
        fill
        t={t}
        localMedia={localMedia}
      />
    </Pressable>
  );

  const renderMain = (player: Player) => (
    <Pressable style={StyleSheet.absoluteFill} onPress={advance}>
      <CameraPanel {...feedProps(player)} />
    </Pressable>
  );

  const renderPip = (player: Player, position: 'top' | 'bottom') => (
    <Pressable
      style={[styles.pip, position === 'top' ? styles.pipTop : styles.pipBottom]}
      onPress={advance}
    >
      <CameraPanel {...feedProps(player)} />
    </Pressable>
  );

  const renderStrip = (stripPlayers: Player[], position: 'top' | 'bottom') => (
    <View
      style={[styles.strip, position === 'top' ? styles.stripTop : styles.stripBottom]}
      pointerEvents="box-none"
    >
      {stripPlayers.map((p) => (
        <Pressable key={p.id} style={styles.stripTile} onPress={advance}>
          <CameraPanel {...feedProps(p)} />
        </Pressable>
      ))}
    </View>
  );

  let content: React.ReactNode;
  switch (layout.kind) {
    case 'grid-bottom':
      content = (
        <>
          {renderGrid(others)}
          {renderPip(me, 'bottom')}
        </>
      );
      break;
    case 'self-main':
      content = (
        <>
          {renderMain(me)}
          {renderStrip(others, 'bottom')}
        </>
      );
      break;
    case 'spotlight': {
      const focus = players.find((p) => p.id === layout.focusId) ?? others[0];
      const rest = players.filter((p) => p.id !== focus.id);
      content = (
        <>
          {renderMain(focus)}
          {renderStrip(rest, 'top')}
        </>
      );
      break;
    }
    case 'grid':
    default:
      content = (
        <>
          {renderGrid(others.length > 0 ? others : players)}
          {others.length > 0 ? renderPip(me, 'top') : null}
        </>
      );
      break;
  }

  return <View style={StyleSheet.absoluteFill}>{content}</View>;
}

const styles = StyleSheet.create({
  pip: {
    position: 'absolute',
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
  pipTop: { top: 8 },
  pipBottom: { bottom: 96 },
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 8,
    zIndex: 15,
  },
  stripTop: { top: 8 },
  stripBottom: { bottom: 96 },
  stripTile: {
    width: 70,
    height: 94,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});
