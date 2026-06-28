import { ExpoConfig, ConfigContext } from 'expo/config';

/** Hostname from EXPO_PUBLIC_API_BASE_URL → applinks:whosmarter.com (or your custom domain) */
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
    image: './assets/splash-pattern.png',
    resizeMode: 'cover',
    backgroundColor: '#eef3ec',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.severin.whosmarter',
    associatedDomains: associatedDomains(),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        'WhoSmarter uses your camera so other players can see you during the quiz.',
      NSMicrophoneUsageDescription:
        'WhoSmarter uses your microphone for voice answers and talking to other players.',
      // iOS 14+ blocks discovery of local-network (LAN) WebRTC "host" ICE
      // candidates unless the app declares this purpose string. Without it, two
      // devices on the SAME Wi-Fi can fail to connect directly and fall back to a
      // TURN relay — which needlessly burns TURN/Metered quota. Declaring it lets
      // same-network players connect peer-to-peer (no relay) when possible.
      NSLocalNetworkUsageDescription:
        'WhoSmarter connects players on the same Wi-Fi directly so video and audio stay fast.',
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
    // RevenueCat public iOS SDK key (safe to ship in the client bundle).
    // When unset, in-app purchases degrade gracefully and only the free trial applies.
    revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  },
});
