/**
 * In-game mic on/off toggle — elegant half-transparent circular button styled
 * after the camera-feed mic chip. Lets a player mute/unmute their own mic.
 */
import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface Props {
  muted: boolean;
  onToggle: () => void;
  style?: ViewStyle;
}

export function MicToggle({ muted, onToggle, style }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        muted && styles.btnMuted,
        pressed && styles.btnPressed,
        style,
      ]}
    >
      <MaterialIcons
        name={muted ? 'mic-off' : 'mic'}
        size={20}
        color={muted ? colors.wrong : '#fff'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnMuted: {
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderColor: 'rgba(214,87,69,0.6)',
  },
  btnPressed: { opacity: 0.7 },
});
