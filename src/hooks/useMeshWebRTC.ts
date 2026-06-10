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
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabase>['channel']> | null>(null);

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

  const ensurePeer = useCallback(
    async (peerId: string) => {
      if (!myId || peerId === myId || peersRef.current.has(peerId)) return;

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
        setConnected(cs === 'connected');
        if (cs === 'failed' && !polite) {
          void pc.restartIce();
        }
        if (cs === 'closed' || cs === 'disconnected') {
          teardownPeer(peerId);
        }
      });

      if (!polite) {
        state.makingOffer = true;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal({ type: 'offer', from: myId, to: peerId, payload: offer });
        } finally {
          state.makingOffer = false;
        }
      }
    },
    [myId, sendSignal, addRemote, teardownPeer],
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
      const stream = (await mediaDevices.getUserMedia({
        audio: true,
        video: camerasEnabled
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
              frameRate: { ideal: 30 },
            }
          : false,
      })) as MediaStream;

      stream.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      for (const [, state] of peersRef.current) {
        stream.getTracks().forEach((track) => state.pc.addTrack(track, stream));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera/mic permission denied';
      debugLog('error', 'media', msg);
      setCameraError(msg);
    }
  }, [camerasEnabled]);

  const setMicEnabled = useCallback((enabled: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }, []);

  useEffect(() => {
    void fetchIceServers().then((servers) => {
      iceServersRef.current = servers;
    });
  }, []);

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
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key && key !== myId) void ensurePeer(key);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key) teardownPeer(key);
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
  }, [gameId, myId, ensurePeer, teardownPeer, handleSignal]);

  return {
    localStream,
    remoteStreams,
    connected,
    cameraError,
    startCamera,
    setMicEnabled,
  };
}
