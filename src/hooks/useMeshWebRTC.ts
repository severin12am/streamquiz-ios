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
 * iOS note: GameScreen turns WebRTC mic OFF during voice answering (Speech owns mic).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  type MediaStream,
} from 'react-native-webrtc';
import { fetchIceServers } from '@/api/client';
import { debugLog } from '@/lib/debug-log';
import { getSupabase } from '@/lib/supabase';
import type { WebRTCSignal } from '@/lib/types';

interface UseMeshWebRTCResult {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  connected: boolean;
  cameraError: string | null;
  startCamera: () => Promise<void>;
  setMicEnabled: (enabled: boolean) => void;
}

type PeerState = {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  iceBuffer: RTCIceCandidate[];
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

  const sendSignal = useCallback(
    (signal: WebRTCSignal) => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: signal,
      });
    },
    [],
  );

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

  const teardownPeer = useCallback(
    (peerId: string) => {
      const state = peersRef.current.get(peerId);
      if (state) {
        state.pc.close();
        peersRef.current.delete(peerId);
      }
      removeRemote(peerId);
    },
    [removeRemote],
  );

  const flushIce = useCallback((peerId: string) => {
    const state = peersRef.current.get(peerId);
    if (!state?.pc.remoteDescription) return;
    for (const candidate of state.iceBuffer) {
      void state.pc.addIceCandidate(candidate);
    }
    state.iceBuffer = [];
  }, []);

  /**
   * Send a fresh offer to a peer. Only the IMPOLITE side ever offers, which
   * keeps the mesh glare-free without needing SDP rollback (not reliable in
   * react-native-webrtc). Used both for the initial connection and to
   * renegotiate when tracks are added later (e.g. startCamera ran after the
   * peer already existed — the cause of "I only see my own camera").
   */
  const renegotiate = useCallback(
    async (peerId: string) => {
      if (!myId) return;
      const state = peersRef.current.get(peerId);
      if (!state || state.polite) return;
      const { pc } = state;
      try {
        state.makingOffer = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', from: myId, to: peerId, payload: offer });
      } catch (e) {
        debugLog('error', 'webrtc', 'renegotiate failed', String(e));
      } finally {
        state.makingOffer = false;
      }
    },
    [myId, sendSignal],
  );

  const ensurePeer = useCallback(
    async (peerId: string) => {
      if (!myId || peerId === myId || peersRef.current.has(peerId)) return;

      // Wait for ICE servers before constructing the peer. Re-check the map
      // afterwards since another presence event may have created it meanwhile.
      await ensureIceServers();
      if (peersRef.current.has(peerId)) return;

      const polite = myId < peerId;
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const state: PeerState = {
        pc,
        makingOffer: false,
        ignoreOffer: false,
        polite,
        iceBuffer: [],
      };
      peersRef.current.set(peerId, state);

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

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

      pc.addEventListener('connectionstatechange', () => {
        const cs = pc.connectionState;
        debugLog('webrtc', 'peer', cs, { peerId: peerId.slice(0, 8) });
        if (cs === 'connected') {
          setConnected(true);
          setCameraError(null);
        }
        // Do NOT tear the peer down on 'disconnected'/'closed' here — a brief
        // network blip would otherwise permanently drop that player's camera.
        // The impolite side nudges a recovery with an ICE restart; peers are
        // only removed when presence reports they actually left the channel.
        if (cs === 'failed' && !polite) {
          void pc.restartIce();
        }
      });

      pc.addEventListener('iceconnectionstatechange', () => {
        if (pc.iceConnectionState === 'disconnected' && !polite) {
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              try {
                pc.restartIce();
              } catch {
                /* restartIce unsupported — let presence/teardown handle it */
              }
            }
          }, 2000);
        }
      });

      if (!polite) await renegotiate(peerId);
    },
    [myId, sendSignal, addRemote, renegotiate, ensureIceServers],
  );

  const handleSignal = useCallback(
    async (signal: WebRTCSignal) => {
      if (!myId || signal.to !== myId) return;
      const peerId = signal.from;
      await ensurePeer(peerId);
      const state = peersRef.current.get(peerId);
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
    [myId, ensurePeer, flushIce, sendSignal],
  );

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const peerCount = peersRef.current.size + 1;
      const tier = videoTierForPeerCount(peerCount);
      debugLog('webrtc', 'quality', `tier for ${peerCount} peers`, tier);

      const stream = (await mediaDevices.getUserMedia({
        audio: true,
        video: camerasEnabled
          ? {
              width: { ideal: tier.width },
              height: { ideal: tier.height },
              facingMode: 'user',
              frameRate: { ideal: tier.frameRate },
            }
          : false,
      })) as MediaStream;

      stream.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      // The camera may start AFTER some peers already connected (presence can
      // fire first). Add our tracks to those peers and renegotiate so they
      // actually receive our video — otherwise they'd only ever see a black
      // tile for us.
      for (const [peerId, state] of peersRef.current) {
        stream.getTracks().forEach((track) => state.pc.addTrack(track, stream));
        void renegotiate(peerId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera/mic permission denied';
      debugLog('error', 'media', msg);
      setCameraError(msg);
    }
  }, [camerasEnabled, renegotiate]);

  /** Downscale video track when peers join/leave (safe no-op if track doesn't support it). */
  const applyDynamicQuality = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream || !camerasEnabled) return;

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
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = tier.maxBitrateKbps * 1000;
          void sender.setParameters(params);
        }
      } catch {
        // Not all RN WebRTC versions support setParameters; safe to skip
      }
    }
  }, [camerasEnabled]);

  const setMicEnabled = useCallback((enabled: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }, []);

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
      .on('presence', { event: 'sync' }, () => {
        const presence = channel.presenceState() as Record<string, unknown[]>;
        const online = Object.keys(presence).filter((id) => id !== myId);
        for (const peerId of online) void ensurePeer(peerId);
        for (const peerId of peersRef.current.keys()) {
          if (!online.includes(peerId)) teardownPeer(peerId);
        }
        applyDynamicQuality();
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key && key !== myId) {
          void ensurePeer(key);
          applyDynamicQuality();
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key) {
          teardownPeer(key);
          applyDynamicQuality();
        }
      })
      .subscribe(async (status) => {
        debugLog('webrtc', 'channel', status);
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      for (const peerId of [...peersRef.current.keys()]) teardownPeer(peerId);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    };
  }, [gameId, myId, ensurePeer, teardownPeer, handleSignal, applyDynamicQuality]);

  return {
    localStream,
    remoteStreams,
    connected,
    cameraError,
    startCamera,
    setMicEnabled,
  };
}
