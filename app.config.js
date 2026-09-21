const base = require('./app.json').expo;

module.exports = () => {
  const iosMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY;
  const androidMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
  const mapsOptions = {
    ...(androidMapsKey ? { androidGoogleMapsApiKey: androidMapsKey } : {}),
    ...(iosMapsKey ? { iosGoogleMapsApiKey: iosMapsKey } : {}),
  };

  return {
    ...base,
    plugins: [
      ...(base.plugins || []),
      ...(Object.keys(mapsOptions).length
        ? [['react-native-maps', mapsOptions]]
        : []),
    ],
  };
};
