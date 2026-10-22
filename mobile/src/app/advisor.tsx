import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T, tap } from '@/components/ui';
import { useAdvisorCall, voiceSupported, type CallStatus } from '@/features/advisor/call';

const STATUS_TEXT: Record<CallStatus, string> = {
  idle: '',
  connecting: 'Bağlanıyor…',
  listening: 'Dinliyorum',
  userSpeaking: 'Dinliyorum…',
  thinking: 'Düşünüyor…',
  speaking: 'Danışman konuşuyor',
  ended: 'Görüşme bitti',
  error: 'Görüşme kesildi',
};

// The call screen is dark in both themes, like the phone app's call screen.
const C = { bg: '#0B1220', card: '#16213A', label: '#FFFFFF', muted: '#9AA7BD', accent: '#3987E5', red: '#E5484D', user: '#22324F' };

export default function AdvisorScreen() {
  const insets = useSafeAreaInsets();
  const call = useAdvisorCall();
  const { start } = call;
  const scroll = useRef<ScrollView>(null);

  // The call opens as soon as the screen does.
  useEffect(() => {
    void start();
  }, [start]);

  const active = !['ended', 'error', 'idle'].includes(call.status);
  const close = () => {
    tap();
    call.stop();
    router.back();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <T v="headline" color={C.label}>
          Yatırım danışmanı
        </T>
        <Pressable accessibilityRole="button" onPress={close} hitSlop={10}>
          <T v="body" color={C.muted}>
            Kapat
          </T>
        </Pressable>
      </View>

      {!voiceSupported ? (
        <View style={styles.center}>
          <T v="title" color={C.label} style={{ textAlign: 'center' }}>
            Sesli danışman bu sürümde yok
          </T>
          <T color={C.muted} style={{ textAlign: 'center', marginTop: 8 }}>
            Canlı sesli görüşme native bileşen gerektirir. {"TestFlight veya App Store sürümünde çalışır, Expo Go'da çalışmaz."}
          </T>
        </View>
      ) : (
        <>
          <View style={styles.orbArea}>
            <Orb status={call.status} />
            <T v="headline" color={C.label} style={{ marginTop: 18 }}>
              {STATUS_TEXT[call.status]}
            </T>
            {call.error ? (
              <T v="sub" color={C.red} style={{ marginTop: 6, textAlign: 'center' }}>
                {call.error}
              </T>
            ) : null}
          </View>

          <ScrollView
            ref={scroll}
            style={styles.transcript}
            contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          >
            {call.lines.map((l) => (
              <View key={l.id} style={[styles.bubble, l.role === 'user' ? styles.userBubble : styles.botBubble]}>
                <T v="sub" color={C.label}>
                  {l.text}
                </T>
              </View>
            ))}
          </ScrollView>

          <View style={styles.controls}>
            {active ? (
              <>
                <RoundButton label={call.muted ? 'Mikrofon kapalı' : 'Sessiz'} color={call.muted ? '#FFFFFF' : C.card} text={call.muted ? C.bg : C.label} onPress={call.toggleMute} />
                <RoundButton label="Bitir" color={C.red} text="#FFFFFF" onPress={close} />
              </>
            ) : (
              <RoundButton
                label="Tekrar ara"
                color={C.accent}
                text="#FFFFFF"
                onPress={() => {
                  tap();
                  void start();
                }}
              />
            )}
          </View>
          <T v="caption" color={C.muted} style={{ textAlign: 'center' }}>
            Yapay zekâ ile görüşüyorsunuz. Söylenenler genel bilgidir, yatırım tavsiyesi değildir.
          </T>
        </>
      )}
    </View>
  );
}

/** Pulses while the advisor speaks, breathes slowly while it listens. */
function Orb({ status }: { status: CallStatus }) {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const speaking = status === 'speaking';
    const quiet = ['ended', 'error', 'idle'].includes(status);
    if (quiet) {
      scale.setValue(1);
      return;
    }
    const to = speaking ? 1.18 : status === 'userSpeaking' ? 1.1 : 1.05;
    const duration = speaking ? 420 : 1200;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: to, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, scale]);
  const color = status === 'error' ? C.red : status === 'userSpeaking' ? '#5BA3F5' : C.accent;
  return (
    <Animated.View style={[styles.orbHalo, { borderColor: color, transform: [{ scale }] }]}>
      <View style={[styles.orb, { backgroundColor: color }]} />
    </Animated.View>
  );
}

function RoundButton({ label, color, text, onPress }: { label: string; color: string; text: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.round, { backgroundColor: color, opacity: pressed ? 0.75 : 1 }]}>
      <T v="sub" color={text} style={{ fontWeight: '700', textAlign: 'center' }}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 12 },
  orbArea: { alignItems: 'center', paddingTop: 28, paddingBottom: 8 },
  orbHalo: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  orb: { width: 116, height: 116, borderRadius: 58, opacity: 0.9 },
  transcript: { flex: 1 },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '88%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: C.user },
  botBubble: { alignSelf: 'flex-start', backgroundColor: C.card },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingVertical: 6 },
  round: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', padding: 6 },
});
