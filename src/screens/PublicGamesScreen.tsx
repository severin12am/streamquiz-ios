/**
 * Browse open public waiting rooms — GET /api/public-games.
 * Join uses the existing Game guest flow (auto-claim seat when a saved name exists).
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchPublicGames } from '@/api/client';
import { useLocale } from '@/context/LocaleProvider';
import { playSound } from '@/lib/sounds';
import { displayPdfTopic } from '@/lib/pdf-source';
import type { PublicGameSummary } from '@/lib/types';
import type { RootStackParamList } from '@/navigation/types';
import { colors } from '@/theme';
import type { TranslateFn } from '@/lib/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'PublicGames'>;

function formatRelativeCreated(iso: string, t: TranslateFn): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return t('roomsAgoJustNow');
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t('roomsAgoJustNow');
  if (minutes < 60) return t('roomsAgoMinutes').replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  return t('roomsAgoHours').replace('{n}', String(Math.max(1, hours)));
}

function modeLabel(mode: PublicGameSummary['game_mode'], t: TranslateFn): string {
  return mode === 'hardcore' ? t('roomsModeHardcore') : t('roomsModeRegular');
}

export function PublicGamesScreen({ navigation }: Props) {
  const { t } = useLocale();
  const [games, setGames] = useState<PublicGameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const list = await fetchPublicGames();
      setGames(list);
    } catch {
      setError(t('roomsError'));
      setGames([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load]),
  );

  const handleJoin = (gameId: string) => {
    playSound('click');
    navigation.navigate('Game', { gameId, asHost: false, autoJoin: true });
  };

  return (
    <View style={styles.root}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentBright} />
          <Text style={styles.muted}>{t('roomsLoading')}</Text>
        </View>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerActions}>
              <Pressable
                style={styles.refreshBtn}
                onPress={() => {
                  playSound('click');
                  void load('refresh');
                }}
              >
                <Text style={styles.refreshText}>{t('roomsRefresh')}</Text>
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>{error ?? t('roomsEmpty')}</Text>
              {error ? (
                <Pressable
                  style={styles.refreshBtn}
                  onPress={() => {
                    playSound('click');
                    void load('initial');
                  }}
                >
                  <Text style={styles.refreshText}>{t('roomsRefresh')}</Text>
                </Pressable>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.topic} numberOfLines={2}>
                  {displayPdfTopic(item.topic)}
                </Text>
                <Text style={styles.meta}>
                  {t('roomsPlayers')
                    .replace('{n}', String(item.player_count))
                    .replace('{max}', String(item.max_players ?? 6))}
                  {' · '}
                  {t(item.difficulty)}
                  {' · '}
                  {item.mc_mode ? t('roomsMc') : t('roomsVoice')}
                </Text>
                <Text style={styles.meta}>
                  {modeLabel(item.game_mode, t)}
                  {' · '}
                  {formatRelativeCreated(item.created_at, t)}
                </Text>
              </View>
              <Pressable
                style={styles.joinBtn}
                onPress={() => handleJoin(item.id)}
              >
                <Text style={styles.joinText}>{t('roomsJoin')}</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1, gap: 10 },
  headerActions: { marginBottom: 8, alignItems: 'flex-end' },
  refreshBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  muted: { color: colors.textMuted, fontSize: 14 },
  empty: { color: colors.textSecondary, fontSize: 15, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowBody: { flex: 1, gap: 4 },
  topic: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  joinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  joinText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
});
