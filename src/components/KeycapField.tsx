/**
 * Recessed "well" surfaces — RN parity with web .keycap-input / .keycap-well.
 *
 * KeycapTextField mirrors web `.keycap-input-frame` + `.keycap-input`: a raised
 * gradient bezel wrapping a sunken well. The well gradient is darker at the TOP
 * (inverse of a raised cap) plus a faked inset top-shadow + light bottom edge,
 * which reads as pressed into the card. RN has no inset box-shadow, so the
 * shadow is an overlay gradient.
 *
 * KeycapWell stays a simple bordered surface: it is reused as highlightable
 * coloured rows (seats, winner rows) where callers recolour its borders.
 */
import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme';

export function KeycapWell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={styles.frame}>
      <View style={[styles.well, style]}>{children}</View>
    </View>
  );
}

interface FieldProps extends TextInputProps {
  align?: 'left' | 'center';
}

export function KeycapTextField({ align = 'left', style, ...props }: FieldProps) {
  return (
    <View style={styles.inputBezel}>
      <View style={styles.inputBezelClip}>
        {/* Raised bezel face */}
        <LinearGradient
          colors={['#f4f4f4', '#e6e6e6', '#dcdcdc']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.bezelTopHighlight} />
        {/* Sunken well */}
        <View style={styles.inputWell}>
          <LinearGradient
            colors={['#d6d6d6', '#ececec', '#f2f2f2']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          {/* Faked inset top shadow — sells the recess. */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0.22)', 'rgba(0,0,0,0)']}
            style={styles.wellTopShadow}
          />
          {/* Light bottom inner edge. */}
          <View pointerEvents="none" style={styles.wellBottomEdge} />
          <TextInput
            placeholderTextColor={colors.textMuted}
            {...props}
            style={[styles.input, { textAlign: align }, style]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // --- KeycapWell (bordered surface, recolourable by callers) ---
  frame: {
    backgroundColor: '#e7ebe3',
    borderRadius: 14,
    padding: 3,
    shadowColor: '#1f3a34',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  well: {
    backgroundColor: '#f4f6f1',
    borderRadius: 11,
    borderWidth: 1,
    borderTopColor: '#cdd8c4',
    borderLeftColor: '#dbe2d3',
    borderRightColor: '#dbe2d3',
    borderBottomColor: '#f0f3ec',
  },

  // --- KeycapTextField (recessed input, matches web .keycap-input) ---
  inputBezel: {
    borderRadius: 14,
    backgroundColor: '#e6e6e6',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  inputBezelClip: {
    borderRadius: 14,
    padding: 2,
    overflow: 'hidden',
  },
  bezelTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  inputWell: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  wellTopShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 12,
  },
  wellBottomEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
  },
});
