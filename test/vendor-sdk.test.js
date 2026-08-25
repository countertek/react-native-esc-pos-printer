const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');

test('published package contains the vendored Epson SDK', () => {
  const [{ files }] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
  );
  const paths = new Set(files.map((file) => file.path));
  const required = [
    'android/libs/EULA.en.txt',
    'android/libs/NOTICE.txt',
    'android/libs/ePOS2.jar',
    'android/src/main/jniLibs/arm64-v8a/libepos2.so',
    'android/src/main/jniLibs/armeabi-v7a/libepos2.so',
    'android/src/main/jniLibs/x86/libepos2.so',
    'android/src/main/jniLibs/x86_64/libepos2.so',
    'ios/Frameworks/EULA.en.txt',
    'ios/Frameworks/NOTICE.txt',
    'ios/Frameworks/PrivacyInfo.xcprivacy',
    'ios/Frameworks/libepos2.xcframework/Info.plist',
    'ios/Frameworks/libepos2.xcframework/ios-arm64/libepos2.framework/libepos2',
    'ios/Frameworks/libepos2.xcframework/ios-arm64_x86_64-simulator/libepos2.framework/libepos2',
  ];

  assert.deepEqual(required.filter((file) => !paths.has(file)), []);

  const manifest = require(path.join(repositoryRoot, 'package.json'));
  for (const section of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    assert.equal(manifest[section]?.['react-native-esc-pos-printer-sdk'], undefined);
  }
});

test('Android SDK archives and native libraries are valid for all four ABIs', () => {
  const jar = path.join(repositoryRoot, 'android/libs/ePOS2.jar');
  execFileSync('unzip', ['-tqq', jar]);
  const entries = new Set(execFileSync('unzip', ['-Z1', jar], { encoding: 'utf8' }).trim().split('\n'));

  assert.equal(entries.has('com/epson/epos2/printer/Printer.class'), true);
  assert.equal(entries.has('com/epson/epos2/discovery/Discovery.class'), true);

  const expected = {
    'arm64-v8a': { class: 2, machine: 183 },
    'armeabi-v7a': { class: 1, machine: 40 },
    x86: { class: 1, machine: 3 },
    x86_64: { class: 2, machine: 62 },
  };

  for (const [abi, header] of Object.entries(expected)) {
    const binary = fs.readFileSync(
      path.join(repositoryRoot, 'android/src/main/jniLibs', abi, 'libepos2.so')
    );

    assert.equal(binary.subarray(0, 4).toString('hex'), '7f454c46');
    assert.equal(binary[4], header.class);
    assert.equal(binary[5], 1);
    assert.equal(binary.readUInt16LE(16), 3);
    assert.equal(binary.readUInt16LE(18), header.machine);
  }
});

test(
  'iOS XCFramework exposes valid device and simulator slices',
  { skip: process.platform !== 'darwin' },
  () => {
    const framework = path.join(repositoryRoot, 'ios/Frameworks/libepos2.xcframework');
    const info = JSON.parse(
      execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(framework, 'Info.plist')], {
        encoding: 'utf8',
      })
    );
    const slices = info.AvailableLibraries.map((library) => ({
      architectures: library.SupportedArchitectures.sort(),
      identifier: library.LibraryIdentifier,
      path: library.LibraryPath,
      platform: library.SupportedPlatform,
      variant: library.SupportedPlatformVariant ?? 'device',
    })).sort((left, right) => left.identifier.localeCompare(right.identifier));

    assert.deepEqual(slices, [
      {
        architectures: ['arm64'],
        identifier: 'ios-arm64',
        path: 'libepos2.framework',
        platform: 'ios',
        variant: 'device',
      },
      {
        architectures: ['arm64', 'x86_64'],
        identifier: 'ios-arm64_x86_64-simulator',
        path: 'libepos2.framework',
        platform: 'ios',
        variant: 'simulator',
      },
    ]);

    for (const slice of slices) {
      const binary = path.join(framework, slice.identifier, slice.path, 'libepos2');
      const architectures = execFileSync('xcrun', ['lipo', '-archs', binary], {
        encoding: 'utf8',
      })
        .trim()
        .split(/\s+/)
        .sort();

      assert.deepEqual(architectures, slice.architectures);
    }

    execFileSync('codesign', ['--verify', '--deep', '--strict', framework]);
  }
);
