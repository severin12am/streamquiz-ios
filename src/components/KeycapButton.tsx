/**
 * Mechanical keycap button — RN parity with web `.keycap` CSS.
 *
 * The "real" 3D look comes from four layers (matching app/globals.css):
 *  1. a vertical gradient face (highlight top -> brand mid -> darker bottom),
 *  2. a gradient "wall/stem" behind the face that reads as the keycap's side walls,
 *  3. a soft ambient drop shadow under the cap,
 *  4. inset rim highlights (light top edge, dark bottom edge).
 * Press travel (4pt) + a springy 340ms release sell the physical press.
 */
import React, { useRef, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme';

export type KeycapVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'revealedCorrect'
  | 'revealedWrong'
  | 'revealedNeutral';

// Web uses 5px travel on desktop, 4px on mobile (max-width: 639px). This is the
// mobile client, so match the mobile value everywhere.
const TRAVEL = 4;
const PRESS_MS = 170;
const RELEASE_MS = 340;
const EASE = Easing.bezier(0.32, 1.45, 0.58, 1);

/** Full keycap token set for the 3D (gradient) variants — copied from web CSS vars. */
interface Keycap3D {
  faceTop: string;
  faceMid: string;
  faceBot: string;
  activeTop: string;
  activeMid: string;
  activeBot: string;
  /** Side-wall gradient: lighter near the face, darkest at the base (the "stem"). */
  wallTop: string;
  stem: string;
  ambientColor: string;
  ambientOpacity: number;
  text: string;
  /** Subtle dark text shadow on coloured caps (skipped on the light secondary cap). */
  textShadow: boolean;
}

const KEYCAPS: Partial<Record<KeycapVariant, Keycap3D>> = {
  primary: {
    faceTop: '#3a8580',
    faceMid: '#2f7d77',
    faceBot: '#286963',
    activeTop: '#2c6b66',
    activeMid: '#276964',
    activeBot: '#245f57',
    wallTop: '#1d524e',
    stem: '#153d39',
    ambientColor: '#0f2320',
    ambientOpacity: 0.26,
    text: '#ffffff',
    textShadow: true,
  },
  secondary: {
    faceTop: '#ffffff',
    faceMid: '#f8f8f8',
    faceBot: '#ececec',
    activeTop: '#e8e8e8',
    activeMid: '#e2e2e2',
    activeBot: '#d8d8d8',
    wallTop: '#d8d8d8',
    stem: '#b8b8b8',
    ambientColor: '#000000',
    ambientOpacity: 0.14,
    text: colors.textSecondary,
    textShadow: false,
  },
  success: {
    faceTop: '#38ad78',
    faceMid: '#2f9e6f',
    faceBot: '#268a5e',
    activeTop: '#248056',
    activeMid: '#20754c',
    activeBot: '#1c6944',
    wallTop: '#1f7350',
    stem: '#104d35',
    ambientColor: '#104d35',
    ambientOpacity: 0.24,
    text: '#ffffff',
    textShadow: true,
  },
  danger: {
    faceTop: '#dc6a5a',
    faceMid: '#d65745',
    faceBot: '#b84335',
    activeTop: '#b84335',
    activeMid: '#a83c30',
    activeBot: '#963528',
    wallTop: '#9a3a2e',
    stem: '#652419',
    ambientColor: '#5a1e16',
    ambientOpacity: 0.32,
    text: '#ffffff',
    textShadow: true,
  },
};

/** Flat / reveal states keep the simpler solid-face + coloured-border look. */
interface LegacyFace {
  face: string;
  border: string;
  text: string;
}

const LEGACY: Record<KeycapVariant, LegacyFace> = {
  primary: { face: colors.accentBright, border: colors.accentHover, text: colors.onPrimary },
  secondary: { face: colors.bgCard, border: colors.borderStrong, text: colors.text },
  success: { face: colors.correct, border: '#268a58', text: colors.onPrimary },
  danger: { face: colors.wrong, border: '#b84a38', text: colors.onPrimary },
  revealedCorrect: { face: '#dff5ea', border: colors.correct, text: colors.correct },
  revealedWrong: { face: '#fdecea', border: colors.wrong, text: colors.wrong },
  revealedNeutral: { face: colors.bgElevated, border: colors.borderStrong, text: colors.textSecondary },
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
  const [pressed, setPressed] = useState(false);

  const inactive = Boolean(disabled || locked);
  const showDisabled = Boolean(disabled) && !locked;
  const heldDown = pressed || Boolean(locked);

  const keycap = !flat && !showDisabled ? KEYCAPS[variant] : undefined;
  const radius = compact ? 20 : 12;

  const animate = (to: number, duration: number) => {
    Animated.timing(y, {
      toValue: to,
      duration,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  };

  const scale = y.interpolate({
    inputRange: [0, TRAVEL],
    outputRange: [1, 0.994],
  });

  const handlePressIn = () => {
    if (!inactive) {
      setPressed(true);
      animate(TRAVEL, PRESS_MS);
    }
    onPressIn?.();
  };
  const handlePressOut = () => {
    if (!locked && !inactive) {
      setPressed(false);
      animate(0, RELEASE_MS);
    }
    onPressOut?.();
  };

  const renderChildren = (textColor: string, textShadow: boolean) =>
    typeof children === 'string' || typeof children === 'number' ? (
      <Text
        style={[
          styles.label,
          { color: textColor },
          textShadow && styles.labelShadow,
          textStyle,
        ]}
      >
        {children}
      </Text>
    ) : (
      children
    );

  return (
    <Pressable
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.hit, showDisabled && styles.disabled, style]}
    >
      {keycap ? (
        <View
          style={[
            styles.stack,
            compact && styles.stackCompact,
            flat && styles.stackFlat,
          ]}
        >
          {/* Side walls / stem — sits behind the face; the cap sinks over it on press. */}
          <LinearGradient
            colors={[keycap.wallTop, keycap.stem]}
            style={[styles.stem, { borderRadius: radius }]}
          />
          <Animated.View
            style={[
              styles.shadowWrap,
              {
                borderRadius: radius,
                backgroundColor: keycap.faceBot,
                shadowColor: keycap.ambientColor,
                shadowOpacity: heldDown ? keycap.ambientOpacity * 0.4 : keycap.ambientOpacity,
                transform: [{ translateY: y }, { scale }],
              },
            ]}
          >
            <View
              style={[
                styles.clip,
                compact ? styles.clipCompact : styles.clipDefault,
                { borderRadius: radius },
                contentStyle,
              ]}
            >
              <LinearGradient
                colors={
                  heldDown
                    ? [keycap.activeTop, keycap.activeMid, keycap.activeBot]
                    : [keycap.faceTop, keycap.faceMid, keycap.faceBot]
                }
                locations={heldDown ? [0, 0.48, 1] : [0, 0.42, 1]}
                style={StyleSheet.absoluteFill}
              />
              {/* Inset rim: light top edge + dark bottom edge. */}
              <View pointerEvents="none" style={styles.rimTop} />
              <View pointerEvents="none" style={styles.rimBottom} />
              {/* Pressed "sunk into the well" inner shadow at the top of the face. */}
              {heldDown ? (
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(0,0,0,0.24)', 'rgba(0,0,0,0)']}
                  style={styles.sink}
                />
              ) : null}
              {renderChildren(keycap.text, keycap.textShadow)}
            </View>
          </Animated.View>
        </View>
      ) : (
        // Flat / reveal / disabled — solid face with a coloured border.
        <View
          style={[
            styles.stack,
            compact && styles.stackCompact,
            styles.stackFlat,
          ]}
        >
          <View
            style={[
              styles.clip,
              compact ? styles.clipCompact : styles.clipDefault,
              {
                borderRadius: radius,
                borderWidth: 1,
                backgroundColor: showDisabled ? colors.bgElevated : LEGACY[variant].face,
                borderColor: showDisabled ? colors.borderStrong : LEGACY[variant].border,
              },
              contentStyle,
            ]}
          >
            {renderChildren(showDisabled ? colors.textMuted : LEGACY[variant].text, false)}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignSelf: 'stretch' },
  disabled: { opacity: 0.65 },
  stack: {
    position: 'relative',
    paddingBottom: TRAVEL + 3,
  },
  stackCompact: {
    paddingBottom: TRAVEL + 2,
  },
  stackFlat: {
    paddingBottom: 0,
  },
  stem: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 2,
    bottom: 0,
  },
  shadowWrap: {
    shadowOffset: { width: 0, height: TRAVEL + 2 },
    shadowRadius: 9,
    elevation: 6,
  },
  clip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipDefault: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  clipCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 40,
    minHeight: 40,
  },
  rimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  rimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  sink: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 10,
  },
  label: {
    fontWeight: '600',
    fontSize: 16,
    textAlign: 'center',
  },
  labelShadow: {
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
});
