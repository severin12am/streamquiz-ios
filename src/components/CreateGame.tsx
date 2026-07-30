/**
 * Host create form — topic + Create, then More for settings.
 * Defaults: medium, MC on, cameras on, Invite only ON (private), regular mode.
 * PDF mode: pick document → native extract → source_text; topic/difficulty off.
 * Colors: theme.ts (matches web globals.css lagoon palette).
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Switch, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { TranslateFn } from '@/lib/i18n';
import type { Difficulty, GameMode } from '@/lib/types';
import { containsProfanity } from '@/lib/profanity';
import { playSound } from '@/lib/sounds';
import { KeycapSegSlider } from '@/components/KeycapSegSlider';
import { KeycapButton } from '@/components/KeycapButton';
import { KeycapTextField } from '@/components/KeycapField';
import { colors } from '@/theme';
import { VOICE_ANSWERS_ENABLED } from '@/lib/features';
import {
  displayPdfTopic,
  encodePdfTopic,
  isPdfTruncated,
  MAX_PDF_PAGES,
  type PdfSource,
} from '@/lib/pdf-source';
import { extractPdfSource, PdfExtractError, pdfExtractAvailable } from '@/lib/extract-pdf-text';

interface Props {
  onCreate: (params: {
    topic: string;
    difficulty: Difficulty;
    num_questions: number;
    mc_mode: boolean;
    game_mode: GameMode;
    cameras_enabled: boolean;
    is_public: boolean;
    answer_seconds: number;
    source_text?: string;
  }) => Promise<void>;
  onBrowseOpenGames?: () => void;
  t: TranslateFn;
}

const MIN_ANSWER_SECONDS = 5;
const MAX_ANSWER_SECONDS = 30;
const DEFAULT_ANSWER_SECONDS = 20;

function clampAnswerSeconds(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_ANSWER_SECONDS;
  return Math.min(MAX_ANSWER_SECONDS, Math.max(MIN_ANSWER_SECONDS, Math.round(n)));
}

function pdfErrorMessage(e: unknown, t: TranslateFn): string {
  if (e instanceof PdfExtractError) {
    switch (e.code) {
      case 'unavailable':
        return t('pdfUnavailable');
      case 'too_large':
        return t('pdfTooLarge');
      case 'empty':
      case 'not_pdf':
        return t('pdfEmpty');
      case 'not_enough_text':
        return t('pdfNotEnoughText');
      case 'password':
        return t('pdfPassword');
      default:
        return t('pdfReadError');
    }
  }
  return e instanceof Error ? e.message : t('pdfReadError');
}

export function CreateGame({ onCreate, onBrowseOpenGames, t }: Props) {
  const [topic, setTopic] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [mcMode, setMcMode] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>('regular');
  const [camerasEnabled, setCamerasEnabled] = useState(true);
  const [answerSeconds, setAnswerSeconds] = useState(DEFAULT_ANSWER_SECONDS);
  /** Invite only ON → private (is_public false). Spec default. */
  const [inviteOnly, setInviteOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pdfSource, setPdfSource] = useState<PdfSource | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
  const canCreate = pdfSource ? true : Boolean(topic.trim());

  const clearPdf = () => {
    playSound('click');
    setPdfSource(null);
  };

  const pickPdf = async () => {
    playSound('click');
    if (!pdfExtractAvailable()) {
      Alert.alert(t('errorTitle'), t('pdfUnavailable'));
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setPdfBusy(true);
      try {
        const source = await extractPdfSource({
          uri: asset.uri,
          fileName: asset.name || 'document.pdf',
          size: asset.size,
          mimeType: asset.mimeType,
        });
        setPdfSource(source);
        setShowAdjust(true);
      } catch (e) {
        setPdfSource(null);
        Alert.alert(t('errorTitle'), pdfErrorMessage(e, t));
      } finally {
        setPdfBusy(false);
      }
    } catch (e) {
      Alert.alert(t('errorTitle'), pdfErrorMessage(e, t));
    }
  };

  const handleCreate = async () => {
    if (pdfSource) {
      // The filename becomes games.topic and is shown in Browse for public
      // lobbies, so it needs the same filter as a typed topic.
      if (containsProfanity(pdfSource.fileName)) {
        Alert.alert(t('errorTitle'), t('inappropriateLanguage'));
        return;
      }
      playSound('click');
      setLoading(true);
      try {
        await onCreate({
          topic: encodePdfTopic(pdfSource.fileName),
          difficulty: 'medium',
          num_questions: numQuestions,
          mc_mode: mcMode,
          game_mode: gameMode,
          cameras_enabled: camerasEnabled,
          is_public: !inviteOnly,
          answer_seconds:
            gameMode === 'regular' ? clampAnswerSeconds(answerSeconds) : DEFAULT_ANSWER_SECONDS,
          source_text: pdfSource.text,
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    const trimmed = topic.trim();
    if (!trimmed) return;
    if (containsProfanity(trimmed)) {
      Alert.alert(t('errorTitle'), t('inappropriateLanguage'));
      return;
    }
    playSound('click');
    setLoading(true);
    try {
      await onCreate({
        topic: trimmed,
        difficulty,
        num_questions: numQuestions,
        mc_mode: mcMode,
        game_mode: gameMode,
        cameras_enabled: camerasEnabled,
        is_public: !inviteOnly,
        answer_seconds: gameMode === 'regular' ? clampAnswerSeconds(answerSeconds) : DEFAULT_ANSWER_SECONDS,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      {pdfSource ? (
        <View style={styles.pdfSummary}>
          <Text style={styles.label}>{t('pdfQuiz')}</Text>
          <Text style={styles.pdfFileName} numberOfLines={2}>
            {displayPdfTopic(encodePdfTopic(pdfSource.fileName))}
          </Text>
          {isPdfTruncated(pdfSource) ? (
            <Text style={styles.hint}>
              {t('pdfTruncationNote')
                .replace('{used}', String(pdfSource.usedPages))
                .replace('{total}', String(pdfSource.totalPages))}
            </Text>
          ) : null}
          <Pressable onPress={clearPdf} hitSlop={8}>
            <Text style={styles.clearLink}>{t('pdfClear')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.label}>{t('topic')}</Text>
          <KeycapTextField
            value={topic}
            onChangeText={setTopic}
            placeholder={t('topicPlaceholder')}
          />
        </>
      )}

      <KeycapButton variant="primary" disabled={!canCreate || loading || pdfBusy} onPress={handleCreate}>
        {loading ? <ActivityIndicator color={colors.onPrimary} /> : t('createChallenge')}
      </KeycapButton>

      <KeycapButton variant="secondary" onPress={() => setShowAdjust((v) => !v)}>
        {showAdjust ? t('hideAdjust') : t('adjust')}
      </KeycapButton>

      {showAdjust ? (
        <View style={styles.adjustPanel}>
          <Text style={styles.adjustHeading}>{t('settings')}</Text>

          {!pdfSource ? (
            <>
              <Text style={styles.label}>{t('difficulty')}</Text>
              <View style={styles.row}>
                {difficulties.map((d) => (
                  <KeycapButton
                    key={d}
                    variant={difficulty === d ? 'primary' : 'secondary'}
                    onPress={() => {
                      playSound('click');
                      setDifficulty(d);
                    }}
                    style={styles.diffBtn}
                    contentStyle={styles.diffFace}
                    textStyle={styles.diffText}
                  >
                    {t(d)}
                  </KeycapButton>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.label}>{t('numQuestions')}</Text>
          <KeycapSegSlider value={numQuestions} onChange={setNumQuestions} />

          <Text style={styles.label}>{t('gameMode')}</Text>
          <Pressable
            style={[styles.modeCard, gameMode === 'regular' && styles.modeCardActive]}
            onPress={() => setGameMode('regular')}
          >
            <Text style={styles.modeTitle}>{t('everyAnswerMode')}</Text>
            <Text style={styles.modeDesc}>{t('everyAnswerModeDesc')}</Text>
          </Pressable>
          <Pressable
            style={[styles.modeCard, gameMode === 'hardcore' && styles.modeCardActive]}
            onPress={() => setGameMode('hardcore')}
          >
            <Text style={styles.modeTitle}>{t('firstCorrectMode')}</Text>
            <Text style={styles.modeDesc}>{t('firstCorrectModeDesc')}</Text>
          </Pressable>

          {gameMode === 'regular' ? (
            <>
              <Text style={styles.label}>{t('answerTime')}</Text>
              <KeycapSegSlider
                min={MIN_ANSWER_SECONDS}
                max={MAX_ANSWER_SECONDS}
                value={answerSeconds}
                onChange={setAnswerSeconds}
              />
            </>
          ) : null}

          <View style={styles.switchRow}>
            <Text style={styles.label}>{t('multipleChoice')}</Text>
            <Switch value={mcMode} onValueChange={setMcMode} trackColor={{ true: colors.accent }} />
          </View>
          {!mcMode ? (
            <Text style={styles.hint}>
              {t(VOICE_ANSWERS_ENABLED ? 'voiceAnswers' : 'typedAnswers')}
            </Text>
          ) : null}

          <View style={styles.switchRow}>
            <Text style={styles.label}>{camerasEnabled ? t('camerasOn') : t('camerasOff')}</Text>
            <Switch
              value={camerasEnabled}
              onValueChange={setCamerasEnabled}
              trackColor={{ true: colors.accent }}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>{t('inviteOnlyTitle')}</Text>
            <Switch
              value={inviteOnly}
              onValueChange={setInviteOnly}
              trackColor={{ true: colors.accent }}
            />
          </View>
          <Text style={styles.hint}>
            {inviteOnly ? t('inviteOnlyHintOn') : t('inviteOnlyHintOff')}
          </Text>

          <Text style={styles.label}>{t('specificQuizTypes')}</Text>
          <KeycapButton
            variant={pdfSource ? 'primary' : 'secondary'}
            disabled={pdfBusy}
            onPress={() => void pickPdf()}
          >
            {pdfBusy ? (
              <ActivityIndicator color={pdfSource ? colors.onPrimary : colors.text} />
            ) : pdfSource ? (
              t('pdfReady')
            ) : (
              t('pdfButton')
            )}
          </KeycapButton>
          <Text style={styles.hint}>
            {pdfBusy
              ? t('pdfReading')
              : pdfSource
                ? isPdfTruncated(pdfSource)
                  ? t('pdfHintTruncated')
                      .replace('{used}', String(pdfSource.usedPages))
                      .replace('{total}', String(pdfSource.totalPages))
                  : t('pdfHintActive')
                : t('pdfHint').replace('{n}', String(MAX_PDF_PAGES))}
          </Text>

          {onBrowseOpenGames ? (
            <Pressable
              style={styles.browseRow}
              onPress={() => {
                playSound('click');
                onBrowseOpenGames();
              }}
            >
              <Text style={styles.browseTitle}>{t('browseOpenGames')}</Text>
              <Text style={styles.browseHint}>{t('browseOpenGamesHint')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 20,
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: { flexDirection: 'row', gap: 8 },
  diffBtn: { flex: 1 },
  diffFace: { paddingVertical: 11, paddingHorizontal: 8 },
  diffText: { fontSize: 15 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { color: colors.textMuted, fontSize: 12 },
  adjustPanel: {
    gap: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  adjustHeading: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  modeCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  modeCardActive: {
    borderColor: colors.accent,
    backgroundColor: '#d8ebe8',
  },
  modeTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  modeDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  browseRow: {
    marginTop: 4,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  browseTitle: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  browseHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  pdfSummary: {
    gap: 6,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  pdfFileName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  clearLink: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: 2 },
});
