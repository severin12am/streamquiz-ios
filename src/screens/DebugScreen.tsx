import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  clearLogs,
  formatLogsForExport,
  getLogEntries,
  subscribeLogs,
  type LogEntry,
} from '@/lib/debug-log';
import { API_BASE_URL, SUPABASE_URL, isConfigured } from '@/lib/config';
import type { RootStackParamList } from '@/navigation/types';
import { colors } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Debug'>;

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  info: colors.textMuted,
  warn: '#d4a843',
  error: colors.wrong,
  api: '#5b6ee1',
  game: colors.accentBright,
  webrtc: '#b84d7a',
  sync: '#4a8f5c',
};

export function DebugScreen({ route }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>(getLogEntries());
  const snapshot = route.params?.snapshot;

  useEffect(() => subscribeLogs(() => setLogs(getLogEntries())), []);

  const copyAll = async () => {
    const text = formatLogsForExport(snapshot);
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Logs copied to clipboard — paste into chat or Notes.');
  };

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Pressable style={styles.btn} onPress={copyAll}>
          <Text style={styles.btnText}>Copy all</Text>
        </Pressable>
        <Pressable style={styles.btnSecondary} onPress={() => clearLogs()}>
          <Text style={styles.btnSecondaryText}>Clear</Text>
        </Pressable>
      </View>

      <View style={styles.config}>
        <Text style={styles.configLine}>configured: {String(isConfigured())}</Text>
        <Text style={styles.configLine} numberOfLines={1}>
          api: {API_BASE_URL || '(missing)'}
        </Text>
        <Text style={styles.configLine} numberOfLines={1}>
          supabase: {SUPABASE_URL ? 'set' : '(missing)'}
        </Text>
        {snapshot ? (
          <Text style={styles.snapshot}>{JSON.stringify(snapshot, null, 2)}</Text>
        ) : null}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {logs.length === 0 ? (
          <Text style={styles.empty}>No logs yet. Play a game and events will appear here.</Text>
        ) : (
          logs
            .slice()
            .reverse()
            .map((e) => (
              <View key={e.id} style={styles.row}>
                <Text style={styles.ts}>{e.ts}</Text>
                <Text style={[styles.level, { color: LEVEL_COLOR[e.level] }]}>{e.level}</Text>
                <View style={styles.body}>
                  <Text style={styles.tag}>{e.tag}</Text>
                  <Text style={styles.msg}>{e.message}</Text>
                  {e.data ? <Text style={styles.data}>{e.data}</Text> : null}
                </View>
              </View>
            ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  toolbar: { flexDirection: 'row', gap: 8, padding: 12 },
  btn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700' },
  btnSecondary: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnSecondaryText: { color: colors.textMuted },
  config: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    backgroundColor: colors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  configLine: { color: colors.textMuted, fontSize: 11, fontFamily: 'Menlo' },
  snapshot: {
    color: colors.text,
    fontSize: 10,
    fontFamily: 'Menlo',
    marginTop: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 32 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', gap: 6, marginBottom: 8, alignItems: 'flex-start' },
  ts: { color: colors.textMuted, fontSize: 10, fontFamily: 'Menlo', width: 72 },
  level: { fontSize: 9, fontWeight: '700', width: 44 },
  body: { flex: 1 },
  tag: { color: colors.accentBright, fontSize: 11, fontWeight: '600' },
  msg: { color: colors.text, fontSize: 12 },
  data: { color: colors.textMuted, fontSize: 10, fontFamily: 'Menlo', marginTop: 2 },
});
