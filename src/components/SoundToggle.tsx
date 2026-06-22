/** Mute / unmute game sound effects — keycap secondary toggle. */
import React, { useEffect, useState } from 'react';
import { Text, type ViewStyle } from 'react-native';
import { isSoundsMuted, setSoundsMuted } from '@/lib/sounds';
import { KeycapButton } from '@/components/KeycapButton';

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
      <Text style={{ fontSize: 16 }}>{muted ? '🔇' : '🔊'}</Text>
    </KeycapButton>
  );
}
