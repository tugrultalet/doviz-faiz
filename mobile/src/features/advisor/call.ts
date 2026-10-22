/**
 * Live voice call with the OpenAI Realtime API over WebRTC: the phone streams the microphone and
 * plays the advisor's voice as it is spoken; a data channel carries events, transcripts and tool
 * calls. The app server gives a short-lived key (POST /api/advisor/session); the OpenAI key stays there.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { MediaStream, RTCPeerConnection } from 'react-native-webrtc';

import { API_URL } from '@/lib/api';
import { runTool } from './tools';

/** WebRTC is native code that Expo Go does not have; TestFlight / App Store builds do. */
export const voiceSupported = Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export type CallStatus = 'idle' | 'connecting' | 'listening' | 'userSpeaking' | 'speaking' | 'thinking' | 'ended' | 'error';
export type Line = { id: string; role: 'user' | 'assistant'; text: string };

/** Every call ends after this, so a forgotten call does not run up the OpenAI bill. */
const MAX_CALL_MS = 15 * 60 * 1000;

type Session = { clientSecret: string; greeting: string };
type ServerEvent = { type: string; [k: string]: unknown };
type PendingCall = { call_id: string; name: string; arguments: string };

async function startSession(): Promise<Session> {
  const res = await fetch(`${API_URL}/api/advisor/session`, {
    method: 'POST',
    headers: { 'x-finans-app': process.env.EXPO_PUBLIC_APP_TOKEN ?? '' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Danışmana bağlanılamadı.');
  return body as Session;
}

export function useAdvisorCall() {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [muted, setMuted] = useState(false);
  const refs = useRef<{
    pc?: RTCPeerConnection;
    stream?: MediaStream;
    send?: (event: object) => void;
    pending: PendingCall[];
    timer?: ReturnType<typeof setTimeout>;
    closed: boolean;
  }>({ pending: [], closed: false });

  /** Adds text to a transcript line, creating it in place when it is new. */
  const upsert = useCallback((id: string, role: Line['role'], text: string, replace = false) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      if (i < 0) return [...prev, { id, role, text }];
      const next = [...prev];
      next[i] = { ...next[i], text: replace ? text : next[i].text + text };
      return next;
    });
  }, []);

  const stop = useCallback((final: CallStatus = 'ended') => {
    const r = refs.current;
    if (r.closed) return;
    r.closed = true;
    clearTimeout(r.timer);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.pc?.close();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native-incall-manager').default.stop();
    } catch {
      // not available (Expo Go, web)
    }
    setStatus(final);
  }, []);

  const handle = useCallback(
    async (e: ServerEvent) => {
      const r = refs.current;
      switch (e.type) {
        case 'input_audio_buffer.speech_started':
          setStatus('userSpeaking');
          upsert(String(e.item_id), 'user', '…', true);
          break;
        case 'input_audio_buffer.speech_stopped':
          setStatus('thinking');
          break;
        case 'conversation.item.input_audio_transcription.completed':
          upsert(String(e.item_id), 'user', String(e.transcript ?? '').trim() || '…', true);
          break;
        case 'response.output_audio_transcript.delta':
          upsert(String(e.item_id), 'assistant', String(e.delta ?? ''));
          break;
        case 'response.output_audio_transcript.done':
          upsert(String(e.item_id), 'assistant', String(e.transcript ?? ''), true);
          break;
        case 'output_audio_buffer.started':
          setStatus('speaking');
          break;
        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.cleared':
          setStatus('listening');
          break;
        case 'response.function_call_arguments.done':
          r.pending.push({ call_id: String(e.call_id), name: String(e.name), arguments: String(e.arguments ?? '') });
          setStatus('thinking');
          break;
        case 'response.done': {
          // Tool results go back only after the response ends; a new response cannot start while one runs.
          const calls = r.pending.splice(0);
          if (!calls.length) break;
          for (const c of calls) {
            const output = await runTool(c.name, c.arguments);
            r.send?.({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: c.call_id, output } });
          }
          r.send?.({ type: 'response.create' });
          break;
        }
        case 'error': {
          const msg = (e.error as { message?: string } | undefined)?.message;
          console.warn('Realtime error', msg);
          break;
        }
      }
    },
    [upsert],
  );

  const start = useCallback(async () => {
    if (!voiceSupported) return;
    // This call's own state: a call that was already closed (screen left while connecting) stops here.
    const r: typeof refs.current = { pending: [], closed: false };
    refs.current = r;
    setError(null);
    setLines([]);
    setMuted(false);
    setStatus('connecting');
    try {
      // Loaded here so Expo Go and web never evaluate the native modules.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const webrtc = require('react-native-webrtc') as typeof import('react-native-webrtc');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const InCallManager = require('react-native-incall-manager').default;

      const session = await startSession();
      if (r.closed) return;

      // Voice call audio, played on the loudspeaker instead of the earpiece.
      InCallManager.start({ media: 'audio' });
      InCallManager.setForceSpeakerphoneOn(true);

      const pc = new webrtc.RTCPeerConnection();
      const stream = await webrtc.mediaDevices.getUserMedia({ audio: true, video: false });
      r.pc = pc;
      r.stream = stream;
      if (r.closed) {
        stream.getTracks().forEach((t) => t.stop());
        pc.close();
        return;
      }
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel('oai-events');
      r.send = (event) => {
        if (dc.readyState === 'open') dc.send(JSON.stringify(event));
      };
      dc.addEventListener('open', () => {
        setStatus('speaking');
        r.send?.({
          type: 'response.create',
          response: { instructions: `Kullanıcıya sıcak bir sesle sadece şu cümleyi söyle, başka bir şey ekleme: "${session.greeting}"` },
        });
      });
      dc.addEventListener('message', (m) => {
        try {
          void handle(JSON.parse(String(m.data)));
        } catch {
          // ignore malformed events
        }
      });
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed') {
          setError('Bağlantı koptu.');
          stop('error');
        }
      });

      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      const answer = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${session.clientSecret}`, 'Content-Type': 'application/sdp' },
      });
      if (!answer.ok) throw new Error(`Ses bağlantısı kurulamadı (${answer.status}).`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
      if (r.closed) return;

      r.timer = setTimeout(() => stop('ended'), MAX_CALL_MS);
    } catch (err) {
      const msg = (err as Error).message;
      setError(/permission|NotAllowed/i.test(msg) ? 'Mikrofon izni gerekli. Ayarlar > Finans bölümünden izin verin.' : msg);
      stop('error');
    }
  }, [handle, stop]);

  const toggleMute = useCallback(() => {
    const track = refs.current.stream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  // Hang up when the screen closes.
  useEffect(() => () => stop('ended'), [stop]);

  return { status, error, lines, muted, start, stop, toggleMute };
}
