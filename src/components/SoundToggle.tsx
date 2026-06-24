/** Mute / unmute game sound effects — keycap secondary toggle. */
import React, { useEffect, useState } from 'react';
import { type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { isSoundsMuted, setSoundsMuted } from '@/lib/sounds';
import { KeycapButton } from '@/components/KeycapButton';
import { colors } from '@/theme';

interface Props {
  style?: ViewStyle;
}

export function SoundToggle({ style }: Props) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(isSoundsMuted());
  }, []);

  return (
    <KeycapButton
      variant="secondary"
      compact
      flat
      style={style}
      accessibilityLabel={muted ? 'Unmute sounds' : 'Mute sounds'}
      onPress={() => {
        const next = !muted;
        void setSoundsMuted(next);
        setMuted(next);
      }}
    >
      <MaterialIcons
        name={muted ? 'volume-off' : 'volume-up'}
        size={20}
        color={muted ? colors.textMuted : colors.accent}
      />
    </KeycapButton>
  );
}
