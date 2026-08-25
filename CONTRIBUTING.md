# Contributing

Contributions are welcome. Follow the [code of conduct](./CODE_OF_CONDUCT.md).

## Development workflow

The Expo module lives at the repository root. The Expo SDK 56 development-build
example lives in `example/` and consumes the package through `file:..`.

Install each project with pnpm:

```sh
pnpm install
cd example
pnpm install
```

Run the example:

```sh
pnpm ios
# or
pnpm android
```

Native changes require rebuilding the development client. JavaScript changes are
picked up by Metro.

Run repository checks from the root:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Type-check the example separately:

```sh
cd example
pnpm typecheck
```

## Commits

Use conventional commit messages such as `feat:`, `fix:`, `refactor:`, `docs:`,
`test:`, or `chore:`.

## Pull requests

Keep pull requests focused, run the checks above, and update documentation when
the package interface or development workflow changes.
