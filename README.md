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
const permission = current.granted ? current : await requestDiscoveryPermissions();

if (permission.granted) {
  PrintersDiscovery.start();
}
```

Subscribe with `PrintersDiscovery.onDiscovery`, `onStatusChange`, and `onError`,
or use `usePrintersDiscovery` for React state. The config plugin writes the
required Bluetooth, local-network, and external-accessory permission entries.

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

The example uses Expo Router and a development client. Expo Go is not supported
because this package contains native modules.

## License

MIT
