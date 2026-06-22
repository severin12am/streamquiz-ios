import { ExpoConfig, ConfigContext } from 'expo/config';

/** Hostname from EXPO_PUBLIC_API_BASE_URL → applinks:streamquiz.netlify.app */
function associatedDomains(): string[] {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
  if (!base) return [];
  try {
    const host = new URL(base).hostname;
    return host ? [`applinks:${host}`] : [];
  } catch {
    return [];
  }
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'WhoSmarter',
  slug: 'whosmarter',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'whosmarter',
  newArchEnabled: false,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#eef3ec',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.severin.whosmarter',
    associatedDomains: associatedDomains(),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        'WhoSmarter uses your camera so other players can see you during the quiz.',
      NSMicrophoneUsageDescription:
        'WhoSmarter uses your microphone for voice answers and talking to other players.',
      NSSpeechRecognitionUsageDescription:
        'WhoSmarter uses speech recognition to transcribe your voice answers.',
      NSPhotoLibraryUsageDescription:
        'WhoSmarter uses your photo library to save screen recordings of quiz sessions.',
      NSPhotoLibraryAddUsageDescription:
        'WhoSmarter saves screen recordings of quiz sessions to your photo library.',
      UIBackgroundModes: ['audio'],
    },
  },
  plugins: [
    [
      'expo-dev-client',
      {
        // Always show the "Enter URL manually" screen on launch (not the embedded bundle).
        launchMode: 'launcher',
      },
    ],
    'expo-asset',
    'expo-font',
    'expo-localization',
    [
      '@config-plugins/react-native-webrtc',
      {
        cameraPermission: 'WhoSmarter uses your camera so other players can see you during the quiz.',
        microphonePermission:
          'WhoSmarter uses your microphone for voice answers and talking to other players.',
      },
    ],
  ],
  extra: {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      projectId: 'd4ca5f7d-bf04-4174-8bdd-8b90fbf1ee53',
    },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  },
});
