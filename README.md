# @countertek/react-native-esc-pos-printer

Expo native module for Epson TM ESC/POS printers.

Discovery is available through `PrintersDiscovery` and `usePrintersDiscovery`.
Connect a Printer with `connect`, `disconnect`, and `getStatus`. Print a text
receipt with `run` and the Command Buffer.

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

## Printer session

```ts
import { Printer, PrinterConstants } from '@countertek/react-native-esc-pos-printer';

const printer = new Printer({
  target: 'TCP:192.168.1.50',
  deviceName: 'TM-T88V',
});
await printer.connect();
const status = await printer.run(async (buffer) => {
  await buffer.addTextAlign(PrinterConstants.ALIGN_CENTER);
  await buffer.addText('Hello\n');
  await buffer.addFeedLine(2);
  await buffer.addCut();
  return buffer.sendData();
});
await printer.disconnect();
```

`connect` on an already-connected Printer succeeds. Nested `run` on the same
Printer throws. `getStatus` and a successful `sendData` return `connection`,
`online`, `coverOpen`, `paper`, and `errorStatus`. `add*` and `sendData` live
on the Command Buffer passed to `run`, not on Printer.

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
