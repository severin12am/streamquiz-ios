/**
 * P2P WebRTC mesh — up to 6 players, signaling via Supabase Broadcast.
 *
 * Channel: webrtc:{gameId}. Signal shape: WebRTCSignal in types.ts.
 * Perfect negotiation: lower players.id string = polite peer.
 *
 * Mic/camera capture via getUserMedia; tracks start disabled — GameScreen calls setMicEnabled.
 * ICE servers from GET /api/ice-servers with public STUN/TURN fallback.
 *
 * Dynamic video quality: resolution/bitrate/framerate scale down as peers join (see videoConstraints).
 *
 * Robustness (ported from the web app — see help_with_fixing_camera_issues.md):
 * - Reconciliation, not event-driven connect: ensurePeer() is idempotent and reconcile()
 *   runs on every presence event AND a 3s timer, so a missed presence event self-corrects.
 * - Discovery is decoupled from capture: we join presence/signaling on identity and attach
 *   local tracks later when the camera is ready; addTrack fires negotiationneeded → renegotiate.
 * - Lifecycle/network recovery: on app foreground (AppState) and on network regain/switch
 *   (NetInfo) we restart capture, re-announce presence, reconcile, and ICE-restart any
 *   unhealthy peer. The 3s loop also ICE-restarts failed/disconnected peers.
 *
 * iOS note: GameScreen turns WebRTC mic OFF during voice answering (Speech owns mic).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  type MediaStream,
  type RTCRtpSender,
} from 'react-native-webrtc';
import { fetchIceServers } from '@/api/client';
import { debugLog } from '@/lib/debug-log';
import { getSupabase } from '@/lib/supabase';
import type { WebRTCSignal } from '@/lib/types';

const RECONCILE_INTERVAL_MS = 3000;
// A peer must be ABSENT from presence this long before we tear it down. Presence
// flickers during phase transitions / polling / brief socket drops; tearing a
// peer down on the first miss was killing connections mid-handshake (peer never
// reached 'connected', then got rebuilt). Outlast a flicker before destroying.
const PRESENCE_GRACE_MS = 8000;

interface UseMeshWebRTCResult {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  connected: boolean;
  cameraError: string | null;
  startCamera: (force?: boolean) => Promise<void>;
  setMicEnabled: (enabled: boolean) => void;
}

type PeerState = {
  peerId: string;
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  iceBuffer: RTCIceCandidate[];
  audioSender: RTCRtpSender | null;
  videoSender: RTCRtpSender | null;
};

// Dynamic quality tiers — lower resolution/framerate/bitrate as peers increase.
// Bandwidth savings: 4 peers ~30%, 5-6 peers ~50% vs baseline.
interface VideoTier {
  width: number;
  height: number;
  frameRate: number;
  maxBitrateKbps: number;
}

function videoTierForPeerCount(peers: number): VideoTier {
  if (peers <= 2) return { width: 1280, height: 720, frameRate: 30, maxBitrateKbps: 1200 };
  if (peers <= 3) return { width: 960, height: 540, frameRate: 24, maxBitrateKbps: 900 };
  return { width: 640, height: 480, frameRate: 20, maxBitrateKbps: 600 };
}

export function useMeshWebRTC(
  gameId: string,
  myId: string | null,
  camerasEnabled: boolean,
): UseMeshWebRTCResult {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [connected, setConnected] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const peersRef = useRef<Map<string, PeerState>>(new Map());
  // peerId → timestamp first observed missing from presence (for the grace period).
  const missingSinceRef = useRef<Map<string, number>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const iceReadyRef = useRef<Promise<void> | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabase>['channel']> | null>(null);
  // Mic enabled state is owned by GameScreen's mic policy; remember it so a capture
  // restart (e.g. on foreground) doesn't silently re-mute or unmute the user.
  const micEnabledRef = useRef(false);
  const camerasEnabledRef = useRef(camerasEnabled);
  camerasEnabledRef.current = camerasEnabled;

  // Guarantee STUN/TURN servers are loaded before any RTCPeerConnection is
  // built. Without this, presence can fire before fetchIceServers() resolves,
  // creating a peer with an empty iceServers list — only host candidates, so
  // the media path never forms across NAT/VPN and the remote tile stays black.
  const ensureIceServers = useCallback(async () => {
    if (iceServersRef.current.length) return;
    if (!iceReadyRef.current) {
      iceReadyRef.current = fetchIceServers().then((servers) => {
        iceServersRef.current = servers;
      });
    }
    await iceReadyRef.current;
  }, []);

  const sendSignal = useCallback((signal: WebRTCSignal) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'signal',
      payload: signal,
    });
  }, []);

  const addRemote = useCallback((peerId: string, stream: MediaStream) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.set(peerId, stream);
      return next;
    });
  }, []);

  const removeRemote = useCallback((peerId: string) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const updateConnected = useCallback(() => {
    let any = false;
    for (const [, state] of peersRef.current) {
      if (state.pc.connectionState === 'connected') {
        any = true;
        break;
      }
    }
    setConnected(any);
  }, []);

  const teardownPeer = useCallback(
    (peerId: string, reason: string) => {
      const state = peersRef.current.get(peerId);
      if (state) {
        debugLog('webrtc', 'teardown', reason, {
          peerId: peerId.slice(0, 8),
          cs: state.pc.connectionState,
        });
        state.pc.close();
        peersRef.current.delete(peerId);
      }
      removeRemote(peerId);
      updateConnected();
    },
    [removeRemote, updateConnected],
  );

  const flushIce = useCallback((peerId: string) => {
    const state = peersRef.current.get(peerId);
    if (!state?.pc.remoteDescription) return;
    for (const candidate of state.iceBuffer) {
      void state.pc.addIceCandidate(candidate);
    }
    state.iceBuffer = [];
  }, []);

  // Idempotent: adds local tracks the first time (which fires negotiationneeded and
  // renegotiates), and swaps in the new tracks via replaceTrack on a capture restart
  // (seamless — no renegotiation). Safe to call before capture is ready (no-op).
  const attachLocalTracks = useCallback((state: PeerState) => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audio = stream.getAudioTracks()[0] ?? null;
    const video = stream.getVideoTracks()[0] ?? null;

    if (audio) {
      if (state.audioSender) void state.audioSender.replaceTrack(audio);
      else state.audioSender = state.pc.addTrack(audio, stream);
    }
    if (video) {
      if (state.videoSender) void state.videoSender.replaceTrack(video);
      else state.videoSender = state.pc.addTrack(video, stream);
    }
  }, []);

  // react-native-webrtc often skips negotiationneeded when addTrack runs during
  // ensurePeer. The impolite side must proactively offer (see help doc §3).
  const sendOffer = useCallback(
    async (state: PeerState, iceRestartOffer = false) => {
      if (!myId || state.polite) return;
      const { pc, peerId } = state;
      if (state.makingOffer || pc.signalingState !== 'stable') return;
      try {
        state.makingOffer = true;
        const offer = await pc.createOffer(iceRestartOffer ? { iceRestart: true } : undefined);
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', from: myId, to: peerId, payload: offer });
        debugLog('webrtc', iceRestartOffer ? 'ice-restart' : 'offer sent', peerId.slice(0, 8));
      } catch (e) {
        debugLog('error', 'webrtc', iceRestartOffer ? 'ice-restart failed' : 'offer failed', String(e));
      } finally {
        state.makingOffer = false;
      }
    },
    [myId, sendSignal],
  );

  const iceRestart = useCallback(
    async (state: PeerState) => {
      await sendOffer(state, true);
    },
    [sendOffer],
  );

  const ensurePeer = useCallback(
    (peerId: string): PeerState | undefined => {
      if (!myId || peerId === myId) return peersRef.current.get(peerId);
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      // Don't build a peer until ICE servers are loaded, or it would only ever
      // gather host candidates and never connect across NAT. Kick off the fetch
      // and let the reconcile loop / next signal retry once they're ready.
      if (!iceServersRef.current.length) {
        void ensureIceServers();
        return undefined;
      }

      const polite = myId < peerId;
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const state: PeerState = {
        peerId,
        pc,
        makingOffer: false,
        ignoreOffer: false,
        polite,
        iceBuffer: [],
        audioSender: null,
        videoSender: null,
      };
      peersRef.current.set(peerId, state);

      pc.addEventListener('icecandidate', (event: { candidate: RTCIceCandidate | null }) => {
        if (event.candidate && myId) {
          sendSignal({
            type: 'ice-candidate',
            from: myId,
            to: peerId,
            payload: event.candidate.toJSON(),
          });
        }
      });

      pc.addEventListener('track', (event: { streams: MediaStream[] }) => {
        const [remote] = event.streams;
        if (remote) addRemote(peerId, remote);
      });

      // Backup if negotiationneeded does fire (unreliable on RN — sendOffer also runs explicitly).
      pc.addEventListener('negotiationneeded', () => {
        void sendOffer(state);
      });

      pc.addEventListener('connectionstatechange', () => {
        const cs = pc.connectionState;
        debugLog('webrtc', 'peer', cs, { peerId: peerId.slice(0, 8) });
        updateConnected();
        if (cs === 'connected') setCameraError(null);
        // 'disconnected' is usually transient — recover with an ICE restart instead of
        // destroying the peer (the reconcile loop will also retry). Only the impolite
        // side initiates the restart to avoid both sides offering at once.
        if ((cs === 'failed' || cs === 'disconnected') && !polite) {
          void iceRestart(state);
        }
        if (cs === 'closed') {
          teardownPeer(peerId, 'pc-closed');
        }
      });

      // Attach now if capture is already running; otherwise this is a no-op and the
      // tracks get attached later by startCamera()/recover().
      attachLocalTracks(state);
      void sendOffer(state);

      return state;
    },
    [
      myId,
      sendSignal,
      addRemote,
      teardownPeer,
      updateConnected,
      iceRestart,
      attachLocalTracks,
      ensureIceServers,
      sendOffer,
    ],
  );

  const handleSignal = useCallback(
    async (signal: WebRTCSignal) => {
      if (!myId || signal.to !== myId || signal.from === myId) return;
      // Make sure ICE servers are loaded so ensurePeer can build the connection.
      await ensureIceServers();
      const peerId = signal.from;
      const state = ensurePeer(peerId);
      if (!state) return;
      const { pc } = state;

      if (signal.type === 'offer') {
        const offer = new RTCSessionDescription(
          signal.payload as ConstructorParameters<typeof RTCSessionDescription>[0],
        );
        const offerCollision = state.makingOffer || pc.signalingState !== 'stable';
        state.ignoreOffer = !state.polite && offerCollision;
        if (state.ignoreOffer) return;

        await pc.setRemoteDescription(offer);
        flushIce(peerId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'answer', from: myId, to: peerId, payload: answer });
        debugLog('webrtc', 'answer sent', peerId.slice(0, 8));
        return;
      }

      if (signal.type === 'answer') {
        const answer = new RTCSessionDescription(
          signal.payload as ConstructorParameters<typeof RTCSessionDescription>[0],
        );
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(answer);
          flushIce(peerId);
        }
        return;
      }

      if (signal.type === 'ice-candidate') {
        const candidate = new RTCIceCandidate(
          signal.payload as ConstructorParameters<typeof RTCIceCandidate>[0],
        );
        if (pc.remoteDescription) {
          await pc.addIceCandidate(candidate);
        } else {
          state.iceBuffer.push(candidate);
        }
      }
    },
    [myId, ensurePeer, flushIce, sendSignal, ensureIceServers],
  );

  /** Downscale video track when peers join/leave (safe no-op if track doesn't support it). */
  const applyDynamicQuality = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream || !camerasEnabledRef.current) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const peerCount = peersRef.current.size + 1;
    const tier = videoTierForPeerCount(peerCount);

    try {
      void videoTrack.applyConstraints({
        width: { ideal: tier.width },
        height: { ideal: tier.height },
        frameRate: { ideal: tier.frameRate },
      });
      debugLog('webrtc', 'quality', `applied tier for ${peerCount} peers`, tier);
    } catch {
      // applyConstraints may not be supported; safe to ignore
    }

    // Apply maxBitrate via sender parameters (best-effort)
    for (const [, peerState] of peersRef.current) {
      try {
        const senders = peerState.pc.getSenders?.();
        if (!senders) continue;
        for (const sender of senders) {
          if (sender.track?.kind !== 'video') continue;
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}] as typeof params.encodings;
          }
          params.encodings[0].maxBitrate = tier.maxBitrateKbps * 1000;
          void sender.setParameters(params);
        }
      } catch {
        // Not all RN WebRTC versions support setParameters; safe to skip
      }
    }
  }, []);

  // Declarative connect: make the set of peer connections match the set of present
  // participants, and ICE-restart any unhealthy peer. Idempotent — safe to call often.
  const reconcile = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !myId) return;

    const presence = channel.presenceState() as Record<string, unknown[]>;
    const present = new Set(Object.keys(presence).filter((id) => id !== myId));

    let changed = false;
    for (const id of present) {
      missingSinceRef.current.delete(id);
      if (!peersRef.current.has(id)) {
        ensurePeer(id);
        changed = true;
      }
    }
    for (const id of [...peersRef.current.keys()]) {
      if (present.has(id)) {
        missingSinceRef.current.delete(id);
        continue;
      }
      // Absent from presence — start/check the grace timer instead of an instant
      // teardown, so a brief presence flicker doesn't kill a live connection.
      const since = missingSinceRef.current.get(id);
      if (since === undefined) {
        missingSinceRef.current.set(id, Date.now());
      } else if (Date.now() - since >= PRESENCE_GRACE_MS) {
        teardownPeer(id, 'reconcile-absent');
        missingSinceRef.current.delete(id);
        changed = true;
      }
    }

    for (const [, state] of peersRef.current) {
      if (state.polite) continue;
      const cs = state.pc.connectionState;
      if (cs === 'failed' || cs === 'disconnected') {
        void iceRestart(state);
      } else if (cs === 'connecting' && !state.pc.remoteDescription) {
        void sendOffer(state);
      }
    }

    if (changed) applyDynamicQuality();
  }, [myId, ensurePeer, teardownPeer, iceRestart, sendOffer, applyDynamicQuality]);

  const startCamera = useCallback(async (force = false) => {
    // Idempotent: capture the camera ONCE. GameScreen re-renders constantly (every
    // game-state/score/clock update gives `me` a new object identity), and its effect
    // re-invokes startCamera each time. Without this guard each call re-ran
    // getUserMedia → new stream → re-attached tracks → new offer, thrashing the
    // WebRTC engine so ICE never reached 'connected' (peers stuck on 'connecting').
    // recover() passes force=true to genuinely restart capture after backgrounding.
    if (localStreamRef.current && !force) return;
    try {
      setCameraError(null);
      const peerCount = peersRef.current.size + 1;
      const tier = videoTierForPeerCount(peerCount);
      debugLog('webrtc', 'quality', `tier for ${peerCount} peers`, tier);

      const stream = (await mediaDevices.getUserMedia({
        audio: true,
        video: camerasEnabledRef.current
          ? {
              width: { ideal: tier.width },
              height: { ideal: tier.height },
              facingMode: 'user',
              frameRate: { ideal: tier.frameRate },
            }
          : false,
      })) as MediaStream;

      // Preserve the mic policy across (re)starts instead of always muting.
      stream.getAudioTracks().forEach((t) => {
        t.enabled = micEnabledRef.current;
      });

      const previous = localStreamRef.current;
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Attach/replace tracks on every existing peer; impolite side offers so remote
      // gets our video (negotiationneeded is unreliable on RN).
      for (const [, state] of peersRef.current) {
        attachLocalTracks(state);
        void sendOffer(state);
      }

      // Stop the old capture only after the new tracks are wired in.
      if (previous && previous !== stream) {
        previous.getTracks().forEach((t) => t.stop());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera/mic permission denied';
      debugLog('error', 'media', msg);
      setCameraError(msg);
    }
  }, [attachLocalTracks, sendOffer]);

  const setMicEnabled = useCallback((enabled: boolean) => {
    micEnabledRef.current = enabled;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }, []);

  const lastRecoverAtRef = useRef(0);

  // Lifecycle recovery: iOS stops capture, suspends the signaling socket, and pauses
  // timers in the background; none auto-recover.
  const recover = useCallback(
    async (reason: 'foreground' | 'network') => {
      const now = Date.now();
      if (reason === 'network' && now - lastRecoverAtRef.current < 5000) return;
      lastRecoverAtRef.current = now;

      debugLog('webrtc', 'recover', reason);
      try {
        await channelRef.current?.track({ online_at: new Date().toISOString() });
      } catch {
        // channel may be re-subscribing; reconcile/timer will catch up
      }
      // Only restart capture on foreground — network flaps were re-opening the camera
      // every few seconds (visible as repeated "quality: tier" lines in debug logs).
      if (reason === 'foreground' && localStreamRef.current) {
        await startCamera(true);
      }
      reconcile();
      for (const [, state] of peersRef.current) {
        if (state.polite) continue;
        const cs = state.pc.connectionState;
        if (cs === 'connected') continue;
        if (cs === 'connecting' && !state.pc.remoteDescription) {
          void sendOffer(state);
        } else {
          void iceRestart(state);
        }
      }
    },
    [startCamera, reconcile, iceRestart, sendOffer],
  );

  useEffect(() => {
    void ensureIceServers();
  }, [ensureIceServers]);

  // The signaling channel + peer mesh must live for the WHOLE game session and be
  // rebuilt ONLY when the game or our identity actually changes — never because a
  // callback's identity churned on a re-render. Previously the effect depended on
  // handleSignal/reconcile/recover/teardownPeer; any change tore down the channel
  // and every peer mid-handshake (seen in logs as channel CLOSED + pc 0/1/2 churn,
  // never reaching 'connected'). We hold the latest callbacks in refs and let the
  // effect depend only on [gameId, myId].
  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;
  const recoverRef = useRef(recover);
  recoverRef.current = recover;
  const teardownPeerRef = useRef(teardownPeer);
  teardownPeerRef.current = teardownPeer;

  useEffect(() => {
    if (!gameId || !myId) return;

    debugLog('webrtc', 'signaling', 'mount', { gameId: gameId.slice(0, 8), myId: myId.slice(0, 8) });

    const supabase = getSupabase();
    const channel = supabase.channel(`webrtc:${gameId}`, {
      config: { presence: { key: myId } },
    });

    channel
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        void handleSignalRef.current(payload as WebRTCSignal);
      })
      .on('presence', { event: 'sync' }, () => reconcileRef.current())
      .on('presence', { event: 'join' }, () => reconcileRef.current())
      .on('presence', { event: 'leave' }, () => reconcileRef.current())
      .subscribe(async (status) => {
        debugLog('webrtc', 'channel', status);
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    // Reconciliation loop — any missed presence event self-corrects within one tick,
    // and unhealthy peers get ICE-restarted (covers Wi-Fi↔cellular path changes).
    const reconcileTimer = setInterval(() => reconcileRef.current(), RECONCILE_INTERVAL_MS);

    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void recoverRef.current('foreground');
    });

    // Network path changes (Wi-Fi↔cellular, dropout→reconnect) on iOS leave peer
    // connections in failed/disconnected and the signaling socket stale; nothing
    // auto-recovers. Trigger recovery the moment connectivity returns or the
    // transport type changes.
    let lastNet: { connected: boolean; type: string } = {
      connected: true,
      type: 'unknown',
    };
    const netInfoUnsub = NetInfo.addEventListener((state: NetInfoState) => {
      const isConnected = state.isConnected === true;
      const type = state.type ?? 'unknown';
      const regained = isConnected && !lastNet.connected;
      const switched = isConnected && lastNet.connected && type !== lastNet.type;
      lastNet = { connected: isConnected, type };
      if (regained || switched) void recoverRef.current('network');
    });

    return () => {
      debugLog('webrtc', 'signaling', 'unmount', { gameId: gameId.slice(0, 8) });
      clearInterval(reconcileTimer);
      appStateSub.remove();
      netInfoUnsub();
      channel.unsubscribe();
      channelRef.current = null;
      for (const peerId of [...peersRef.current.keys()]) teardownPeerRef.current(peerId, 'cleanup');
      missingSinceRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    };
    // Stable for the whole session — callbacks are invoked via refs (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, myId]);

  return {
    localStream,
    remoteStreams,
    connected,
    cameraError,
    startCamera,
    setMicEnabled,
  };
}
