# @countertek/react-native-esc-pos-printer

Expo native module for Epson TM ESC/POS printers.

Discovery is available through `PrintersDiscovery` and `usePrintersDiscovery`.
Printer sessions and printing are not implemented yet.

## Discovery

Add the package to the Expo app's `plugins` array, rebuild the development
client, then request permission before starting Discovery:

```ts
import {
  PrintersDiscovery,
  getDiscoveryPermissions,
  requestDiscoveryPermissions,
} from '@countertek/react-native-esc-pos-printer';

const current = await getDiscoveryPermissions();
if (!current.granted) {
  await requestDiscoveryPermissions();
}

PrintersDiscovery.start();
```

Subscribe with `PrintersDiscovery.onDiscovery`, `onStatusChange`, and `onError`,
or use `usePrintersDiscovery` for React state. `granted` reports Bluetooth;
start Discovery even when it is false so LAN and USB printers can still be
found. The config plugin writes the required Bluetooth, local-network, and
external-accessory permission entries.

## Documentation

- [v0.1 development specification](./docs/spec-v0.1.md)
- [Architecture decisions](./docs/adr/)
- [Legacy 4.x documentation](./docs/legacy-v4/) for the unscoped package

## Development

Install the library dependencies:

```sh
pnpm install
```

Install and run the Expo SDK 56 example:

```sh
cd example
pnpm install
pnpm ios
# or
pnpm android
```

Android builds need JDK 17 or 21. Android Studio's bundled JBR 25 fails native
CMake (`react-native-worklets:configureCMakeDebug`) with a restricted
`java.lang.System` warning. `pnpm android` prefers Homebrew `openjdk@17` when
`JAVA_HOME` is unset or too new:

```sh
brew install openjdk@17
export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
```

The example uses Expo Router and a development client. Expo Go is not supported
because this package contains native modules.

## License

MIT
