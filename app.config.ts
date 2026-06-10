import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'StreamQuiz',
  slug: 'streamquiz',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'streamquiz',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0a0f14',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.streamquiz.app',
    infoPlist: {
      NSCameraUsageDescription:
        'StreamQuiz uses your camera so other players can see you during the quiz.',
      NSMicrophoneUsageDescription:
        'StreamQuiz uses your microphone for voice answers and talking to other players.',
      NSSpeechRecognitionUsageDescription:
        'StreamQuiz uses speech recognition to transcribe your voice answers.',
      UIBackgroundModes: ['audio'],
    },
  },
  plugins: [
    'expo-dev-client',
    [
      '@config-plugins/react-native-webrtc',
      {
        cameraPermission: 'StreamQuiz uses your camera so other players can see you during the quiz.',
        microphonePermission:
          'StreamQuiz uses your microphone for voice answers and talking to other players.',
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  },
});
