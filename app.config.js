const base = require('./app.json').expo;

module.exports = () => {
  const iosMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY;
  const androidMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;

  return {
    ...base,
    ios: {
      ...base.ios,
      config: {
        ...(base.ios?.config || {}),
        ...(iosMapsKey ? { googleMapsApiKey: iosMapsKey } : {}),
      },
    },
    android: {
      ...base.android,
      config: {
        ...(base.android?.config || {}),
        ...(androidMapsKey
          ? {
              googleMaps: {
                ...(base.android?.config?.googleMaps || {}),
                apiKey: androidMapsKey,
              },
            }
          : {}),
      },
    },
  };
};
