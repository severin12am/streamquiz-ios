/**
 * Mechanical keycap button — parity with web .keycap CSS (340ms spring press).
 */
import React, { useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors } from '@/theme';

export type KeycapVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'revealedCorrect'
  | 'revealedWrong'
  | 'revealedNeutral';

const TRAVEL = 5;
const PRESS_MS = 170;
const RELEASE_MS = 340;
const EASE = Easing.bezier(0.32, 1.45, 0.58, 1);

interface FaceStyle {
  face: string;
  facePressed: string;
  stem: string;
  text: string;
  border: string;
}

const FACES: Record<KeycapVariant, FaceStyle> = {
  primary: {
    face: colors.accentBright,
    facePressed: colors.accentHover,
    // A darker shade of the same teal — reads as the keycap's bottom lip, not a slab.
    stem: colors.accentHover,
    text: colors.onPrimary,
    border: colors.accentHover,
  },
  secondary: {
    face: colors.bgCard,
    facePressed: colors.bgElevated,
    stem: '#d6dccf',
    text: colors.text,
    border: colors.borderStrong,
  },
  success: {
    face: colors.correct,
    facePressed: '#268a58',
    stem: '#268a58',
    text: colors.onPrimary,
    border: '#268a58',
  },
  danger: {
    face: colors.wrong,
    facePressed: '#b84a38',
    stem: '#b84a38',
    text: colors.onPrimary,
    border: '#b84a38',
  },
  revealedCorrect: {
    face: '#dff5ea',
    facePressed: '#dff5ea',
    stem: colors.border,
    text: colors.correct,
    border: colors.correct,
  },
  revealedWrong: {
    face: '#fdecea',
    facePressed: '#fdecea',
    stem: colors.border,
    text: colors.wrong,
    border: colors.wrong,
  },
  revealedNeutral: {
    face: colors.bgElevated,
    facePressed: colors.bgElevated,
    stem: colors.border,
    text: colors.textSecondary,
    border: colors.borderStrong,
  },
};

interface Props {
  variant?: KeycapVariant;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  locked?: boolean;
  accessibilityLabel?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  textStyle?: TextStyle;
  compact?: boolean;
  /** Drop the 3D stem + drop shadow (flat surface, e.g. floating icon toggles). */
  flat?: boolean;
}

export function KeycapButton({
  variant = 'secondary',
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  locked,
  accessibilityLabel,
  children,
  style,
  contentStyle,
  textStyle,
  compact,
  flat,
}: Props) {
  const y = useRef(new Animated.Value(locked ? TRAVEL : 0)).current;
  const face = FACES[variant];
  const inactive = Boolean(disabled || locked);
  const showDisabled = Boolean(disabled) && !locked;
  const faceBg = showDisabled
    ? colors.bgElevated
    : locked
      ? face.facePressed
      : face.face;
  const faceBorder = showDisabled ? colors.borderStrong : face.border;
  const stemBg = showDisabled ? colors.borderStrong : face.stem;
  const textColor = showDisabled ? colors.textMuted : face.text;

  const animate = (to: number, duration: number) => {
    Animated.timing(y, {
      toValue: to,
      duration,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => {
        if (!inactive) animate(TRAVEL, PRESS_MS);
        onPressIn?.();
      }}
      onPressOut={() => {
        if (!locked && !inactive) animate(0, RELEASE_MS);
        onPressOut?.();
      }}
      style={[styles.hit, inactive && styles.disabled, style]}
    >
      <View style={[styles.stack, compact && styles.stackCompact, flat && styles.stackFlat]}>
        {flat ? null : <View style={[styles.stem, { backgroundColor: stemBg }]} />}
        <Animated.View
          style={[
            styles.face,
            compact && styles.faceCompact,
            flat && styles.faceFlat,
            {
              backgroundColor: faceBg,
              borderColor: faceBorder,
              transform: [{ translateY: y }],
            },
            contentStyle,
          ]}
        >
          {typeof children === 'string' || typeof children === 'number' ? (
            <Text style={[styles.label, { color: textColor }, textStyle]}>{children}</Text>
          ) : (
            children
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignSelf: 'stretch' },
  disabled: { opacity: 0.9 },
  stack: {
    position: 'relative',
    paddingBottom: TRAVEL - 1,
  },
  stackCompact: {
    paddingBottom: TRAVEL - 2,
  },
  stackFlat: {
    paddingBottom: 0,
  },
  // Bottom "lip" of the keycap: a thin slab tucked behind the face (taller than
  // the lip gap so the two never separate). Solid colour reads as a 3D edge.
  stem: {
    position: 'absolute',
    left: 1,
    right: 1,
    bottom: 0,
    height: TRAVEL + 3,
    borderRadius: 12,
  },
  face: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f2320',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  faceFlat: {
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  faceCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 20,
    minWidth: 40,
    minHeight: 40,
  },
  label: {
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
  },
});
