# v0.1 spec

Implement this slice. Language is in [`CONTEXT.md`](../CONTEXT.md). Why is in [`docs/adr/`](adr/). This file is the public interface and the done bar.

Package: `@countertek/react-native-esc-pos-printer@0.1.0`  
Repo: flatten this GitHub repo to NFC layout (library at root, `example/` Expo SDK 56 + dev client + Expo Router). `pnpm`. No web. Not Expo Go.

## Public interface

```ts
import {
  Printer,
  PrintersDiscovery,
  usePrintersDiscovery,
  PrinterConstants,
  PrinterError,
  PrinterDiscoveryError,
  getDiscoveryPermissions,
  requestDiscoveryPermissions,
} from '@countertek/react-native-esc-pos-printer';

new Printer({ target, deviceName, lang? }); // singleton per Target

printer.connect(timeout?: number): Promise<void>;
printer.disconnect(): Promise<void>;
printer.getStatus(): Promise<PrinterStatus>;
printer.run<T>(job: (buffer: CommandBuffer) => Promise<T>): Promise<T>;

buffer.addText(text: string): Promise<void>;
buffer.addTextAlign(align?: Align): Promise<void>;
buffer.addTextSize(params?: { width?: number; height?: number }): Promise<void>;
buffer.addTextStyle(params?: { reverse?: Flag; ul?: Flag; em?: Flag; color?: Color }): Promise<void>;
buffer.addTextLang(lang?: TextLang): Promise<void>;
buffer.addTextSmooth(smooth?: Flag): Promise<void>;
buffer.addFeedLine(lines?: number): Promise<void>;
buffer.addLineSpace(space: number): Promise<void>;
buffer.addCut(type?: Cut): Promise<void>;
buffer.sendData(timeout?: number): Promise<PrinterStatus>;

PrintersDiscovery.start(params?: DiscoveryStartParams): void;
PrintersDiscovery.stop(): void;
PrintersDiscovery.onDiscovery(listener): () => void;
PrintersDiscovery.onStatusChange(listener): () => void;
PrintersDiscovery.onError(listener): () => void;

usePrintersDiscovery(): {
  printers: DeviceInfo[];
  isDiscovering: boolean;
  printerError: PrinterDiscoveryError | null;
  start: (params?: DiscoveryStartParams) => void;
  stop: () => void;
};
```

`DeviceInfo` keeps Discovery fields: `target`, `deviceName`, `deviceType`, `ipAddress`, `macAddress`, `bdAddress`.

`PrinterStatus` is only `connection`, `online`, `coverOpen`, `paper`, `errorStatus`, each `{ statusCode, status, message }`.

`PrinterConstants` is a TypeScript enum/const object for TRUE/FALSE/UNKNOWN, `ALIGN_*`, `CUT_*`, `MODEL_*`, `LANG_*`, `PARAM_*`, and the status codes those five fields need. No native `getConstants()` dump.

`PrinterError` / `PrinterDiscoveryError` throw. They carry `status`, `message`, `methodName`. `connect` on an already-connected Printer succeeds. Nested `run` on the same Printer throws. `run` returns the callback’s value. If `run` exits without a successful `sendData`, the Command Buffer is cleared.

`getDiscoveryPermissions` / `requestDiscoveryPermissions` cover Bluetooth, local network, and USB as the OS requires. The config plugin writes the static permission entries. Consumers add `@countertek/react-native-esc-pos-printer` to `plugins`.

## Native

Swift and Kotlin `ModuleDefinition` wrapping the vendored Epson ePOS SDK. [ADR 0004](adr/0004-vendor-epson-epos-sdk-2.37-binaries.md) owns the supported versions, binary layout, and redistribution gate. Do not port ObjC/Java `ThePrinter`. Infer series from Device Name. Hide `beginTransaction` / `endTransaction` inside send.

## Example

Expo 56, `expo-dev-client`, `expo-router`, `file:..`, `nativeModulesDir: ".."`, plugin in `app.json`.

Routes: Discovery (hook + permission request + list) and SimplePrint (connect, `run` with a **text** receipt, disconnect). No image, barcode, QR, or print-from-view.

## Out of scope (GitHub issues)

- [#3](https://github.com/countertek/react-native-esc-pos-printer/issues/3) `addImage`
- [#4](https://github.com/countertek/react-native-esc-pos-printer/issues/4) `addBarcode`
- [#5](https://github.com/countertek/react-native-esc-pos-printer/issues/5) `addSymbol`
- [#6](https://github.com/countertek/react-native-esc-pos-printer/issues/6) `addViewShot`
- [#7](https://github.com/countertek/react-native-esc-pos-printer/issues/7) `addCommand`
- [#8](https://github.com/countertek/react-native-esc-pos-printer/issues/8) `addPulse`
- [#9](https://github.com/countertek/react-native-esc-pos-printer/issues/9) `addTextLine`
- [#10](https://github.com/countertek/react-native-esc-pos-printer/issues/10) `monitorPrinter`
- [#11](https://github.com/countertek/react-native-esc-pos-printer/issues/11) `tryToConnectUntil`
- [#12](https://github.com/countertek/react-native-esc-pos-printer/issues/12) `pairBluetoothDevice`
- [#13](https://github.com/countertek/react-native-esc-pos-printer/issues/13) `getPrinterSetting`
- [#14](https://github.com/countertek/react-native-esc-pos-printer/issues/14) remaining Printer Status fields
- [#15](https://github.com/countertek/react-native-esc-pos-printer/issues/15) remaining Epson constants

## Done when

- `pnpm` install at repo root and in `example/` works.
- Example discovers a TM printer, connects, prints a text receipt, cuts, returns Printer Status.
- Types reject `printer.addText` (that method is not on Printer).
- Automated tests cover JS: singleton per Target, `run` serialization, clear-on-failed-run, slim status typing.
- Manual hardware check is the example on a real TM printer.
