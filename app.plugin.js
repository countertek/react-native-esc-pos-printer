const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

const androidPermissions = [
  { 'android:name': 'android.permission.INTERNET' },
  {
    'android:name': 'android.permission.BLUETOOTH_SCAN',
    'android:usesPermissionFlags': 'neverForLocation',
  },
  { 'android:name': 'android.permission.BLUETOOTH_CONNECT' },
  {
    'android:name': 'android.permission.BLUETOOTH',
    'android:maxSdkVersion': '30',
  },
  {
    'android:name': 'android.permission.BLUETOOTH_ADMIN',
    'android:maxSdkVersion': '30',
  },
  {
    'android:name': 'android.permission.ACCESS_FINE_LOCATION',
    'android:maxSdkVersion': '30',
  },
  {
    'android:name': 'android.permission.ACCESS_COARSE_LOCATION',
    'android:maxSdkVersion': '28',
  },
];

module.exports = function withReactNativeEscPosPrinter(config) {
  config = withInfoPlist(config, (iosConfig) => {
    const infoPlist = iosConfig.modResults;
    infoPlist.NSBluetoothAlwaysUsageDescription ??=
      'Allow $(PRODUCT_NAME) to find and communicate with Bluetooth printers.';
    const localNetworkDescription =
      'Allow $(PRODUCT_NAME) to find and communicate with printers on the local network.';
    const existingLocalNetworkDescription = infoPlist.NSLocalNetworkUsageDescription;
    if (
      !existingLocalNetworkDescription ||
      existingLocalNetworkDescription.includes('Expo Dev Launcher')
    ) {
      infoPlist.NSLocalNetworkUsageDescription = localNetworkDescription;
    } else if (!existingLocalNetworkDescription.includes(localNetworkDescription)) {
      infoPlist.NSLocalNetworkUsageDescription = `${existingLocalNetworkDescription} ${localNetworkDescription}`;
    }
    infoPlist.UISupportedExternalAccessoryProtocols = [
      ...new Set([...(infoPlist.UISupportedExternalAccessoryProtocols ?? []), 'com.epson.escpos']),
    ];
    return iosConfig;
  });

  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    const usesPermissions = (manifest['uses-permission'] ??= []);

    for (const permission of androidPermissions) {
      const existing = usesPermissions.find(
        (entry) => entry.$['android:name'] === permission['android:name']
      );
      if (!existing) {
        usesPermissions.push({ $: permission });
      }
    }

    return androidConfig;
  });
};
