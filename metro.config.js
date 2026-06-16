const { getDefaultConfig } = require('expo/metro-config');
const resolveFrom = require('resolve-from');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// react-native-webrtc depends on event-target-shim@6, while React Native ships
// event-target-shim@5. Redirect webrtc's imports to its own (v6) copy.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName.startsWith('event-target-shim') &&
    context.originModulePath.includes('react-native-webrtc')
  ) {
    // event-target-shim@6 only exposes "." in its package "exports", so the
    // "event-target-shim/index" subpath webrtc imports must be normalized.
    const normalized = moduleName.endsWith('/index')
      ? moduleName.replace(/\/index$/, '')
      : moduleName;
    return {
      filePath: resolveFrom(context.originModulePath, normalized),
      type: 'sourceFile',
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
