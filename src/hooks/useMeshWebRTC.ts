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

interface UseMeshWebRTCResult {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  connected: boolean;
  cameraError: string | null;
  startCamera: () => Promise<void>;
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
    (peerId: string) => {
      const state = peersRef.current.get(peerId);
      if (state) {
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

  const iceRestart = useCallback(
    async (state: PeerState) => {
      if (!myId) return;
      try {
        state.makingOffer = true;
        const offer = await state.pc.createOffer({ iceRestart: true });
        await state.pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', from: myId, to: state.peerId, payload: offer });
        debugLog('webrtc', 'ice-restart', state.peerId.slice(0, 8));
      } catch (e) {
        debugLog('error', 'webrtc', 'ice-restart failed', String(e));
      } finally {
        state.makingOffer = false;
      }
    },
    [myId, sendSignal],
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

      // Decoupled-capture support: when tracks are added later (camera became ready,
      // or a renegotiation is needed), create and send an offer. Perfect negotiation
      // resolves any glare with the peer's own offer.
      pc.addEventListener('negotiationneeded', async () => {
        if (pc.signalingState !== 'stable') return;
        try {
          state.makingOffer = true;
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          if (myId) sendSignal({ type: 'offer', from: myId, to: peerId, payload: offer });
        } catch (e) {
          debugLog('error', 'webrtc', 'negotiation failed', String(e));
        } finally {
          state.makingOffer = false;
        }
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
          teardownPeer(peerId);
        }
      });

      // Attach now if capture is already running; otherwise this is a no-op and the
      // tracks get attached later by startCamera()/recover() → negotiationneeded.
      attachLocalTracks(state);

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
      if (!peersRef.current.has(id)) {
        ensurePeer(id);
        changed = true;
      }
    }
    for (const id of [...peersRef.current.keys()]) {
      if (!present.has(id)) {
        teardownPeer(id);
        changed = true;
      }
    }

    for (const [, state] of peersRef.current) {
      const cs = state.pc.connectionState;
      if ((cs === 'failed' || cs === 'disconnected') && !state.polite) {
        void iceRestart(state);
      }
    }

    if (changed) applyDynamicQuality();
  }, [myId, ensurePeer, teardownPeer, iceRestart, applyDynamicQuality]);

  const startCamera = useCallback(async () => {
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

      // Attach/replace tracks on every existing peer. First attach renegotiates
      // (via negotiationneeded); a replace on restart is seamless.
      for (const [, state] of peersRef.current) {
        attachLocalTracks(state);
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
  }, [attachLocalTracks]);

  const setMicEnabled = useCallback((enabled: boolean) => {
    micEnabledRef.current = enabled;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }, []);

  // Lifecycle recovery: iOS stops capture, suspends the signaling socket, and pauses
  // timers in the background; none auto-recover. On foreground/network regain,
  // explicitly re-announce presence → restart capture → reconcile → ICE-restart
  // unhealthy peers.
  const recover = useCallback(async () => {
    debugLog('webrtc', 'recover', 'foreground');
    try {
      await channelRef.current?.track({ online_at: new Date().toISOString() });
    } catch {
      // channel may be re-subscribing; reconcile/timer will catch up
    }
    if (localStreamRef.current) {
      await startCamera();
    }
    reconcile();
    for (const [, state] of peersRef.current) {
      if (state.pc.connectionState !== 'connected' && !state.polite) {
        void iceRestart(state);
      }
    }
  }, [startCamera, reconcile, iceRestart]);

  useEffect(() => {
    void ensureIceServers();
  }, [ensureIceServers]);

  useEffect(() => {
    if (!gameId || !myId) return;

    const supabase = getSupabase();
    const channel = supabase.channel(`webrtc:${gameId}`, {
      config: { presence: { key: myId } },
    });

    channel
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        void handleSignal(payload as WebRTCSignal);
      })
      .on('presence', { event: 'sync' }, () => reconcile())
      .on('presence', { event: 'join' }, () => reconcile())
      .on('presence', { event: 'leave' }, () => reconcile())
      .subscribe(async (status) => {
        debugLog('webrtc', 'channel', status);
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    // Reconciliation loop — any missed presence event self-corrects within one tick,
    // and unhealthy peers get ICE-restarted (covers Wi-Fi↔cellular path changes).
    const reconcileTimer = setInterval(() => reconcile(), RECONCILE_INTERVAL_MS);

    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void recover();
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
      if (regained || switched) void recover();
    });

    return () => {
      clearInterval(reconcileTimer);
      appStateSub.remove();
      netInfoUnsub();
      channel.unsubscribe();
      channelRef.current = null;
      for (const peerId of [...peersRef.current.keys()]) teardownPeer(peerId);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    };
  }, [gameId, myId, handleSignal, reconcile, recover, teardownPeer]);

  return {
    localStream,
    remoteStreams,
    connected,
    cameraError,
    startCamera,
    setMicEnabled,
  };
}
