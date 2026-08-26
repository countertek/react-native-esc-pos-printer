import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function javaMajor(home) {
  const binary = path.join(home, 'bin', 'java');
  if (!existsSync(binary)) {
    return null;
  }

  const result = spawnSync(binary, ['-version'], { encoding: 'utf8' });
  const match = `${result.stderr}${result.stdout}`.match(/version "(\d+)/);
  return match ? Number(match[1]) : null;
}

const candidates = [
  process.env.JAVA_HOME,
  '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
  '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
].filter(Boolean);

const javaHome = candidates.find((home) => {
  const major = javaMajor(home);
  return major != null && major >= 17 && major <= 21;
});

if (!javaHome) {
  console.error(
    'Android builds need JDK 17 or 21. Android Studio JBR 25 fails CMake with:\n' +
      '  WARNING: A restricted method in java.lang.System has been called\n\n' +
      'Install JDK 17, then re-run:\n' +
      '  brew install openjdk@17\n' +
      '  export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"\n' +
      '  pnpm android'
  );
  process.exit(1);
}

if (javaHome !== process.env.JAVA_HOME) {
  console.log(`Using JAVA_HOME=${javaHome}`);
}

const child = spawn('pnpm', ['exec', 'expo', 'run:android', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
