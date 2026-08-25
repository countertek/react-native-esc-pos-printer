# @countertek/react-native-esc-pos-printer

Expo native module for Epson TM ESC/POS printers.

The package is currently a development-build scaffold. Discovery, printer sessions,
and printing are not implemented yet.

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
