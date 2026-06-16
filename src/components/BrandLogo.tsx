/** WhoSmarter wordmark — inline keycap S with tap pop (web HomeHeader parity). */
import React, { useRef } from 'react';
import { Animated, Easing, Pressable, Text, View, StyleSheet } from 'react-native';
import { colors } from '@/theme';

const POP_MS = 420;
const EASE = Easing.bezier(0.32, 1.45, 0.58, 1);

export function BrandLogo() {
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const popping = useRef(false);

  const handlePress = () => {
    if (popping.current) return;
    popping.current = true;
    Animated.parallel([
      Animated.sequence([
        Animated.timing(y, { toValue: 4, duration: 120, easing: EASE, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 300, easing: EASE, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 140, easing: EASE, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 280, easing: EASE, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(rotate, { toValue: 1, duration: 200, easing: EASE, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 0, duration: 220, easing: EASE, useNativeDriver: true }),
      ]),
    ]).start(() => {
      popping.current = false;
    });
  };

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-8deg'],
  });

  return (
    <View style={styles.row}>
      <Text style={styles.word}>Who</Text>
      <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Tap the S">
        <View style={styles.pillStack}>
          <View style={styles.pillStem} />
          <Animated.View
            style={[
              styles.pill,
              { transform: [{ translateY: y }, { scale }, { rotate: spin }] },
            ]}
          >
            <Text style={styles.s}>S</Text>
          </Animated.View>
        </View>
      </Pressable>
      <Text style={styles.word}>marter</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  word: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
  },
  pillStack: {
    position: 'relative',
    paddingBottom: 7,
    marginHorizontal: 2,
  },
  pillStem: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 0,
    height: 6,
    borderRadius: 8,
    backgroundColor: '#153d39',
    opacity: 0.85,
  },
  pill: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.accentHover,
    shadowColor: '#0f2320',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 4,
  },
  s: {
    color: colors.onPrimary,
    fontSize: 36,
    fontWeight: '800',
  },
});
