/**
 * Recessed "well" surfaces — RN parity with web .keycap-input / .keycap-well.
 * The asymmetric borders (darker top/sides, light bottom) fake the inset look
 * since RN has no inset box-shadow. Used for inputs, link displays, list rows.
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
    <View style={styles.frame}>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...props}
        style={[styles.well, styles.input, { textAlign: align }, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
});
