import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function javaMajor(home) {
  const binary = path.join(home, 'bin', 'java');
  if (!existsSync(binary)) {
    return null;
  }

  const result = spawnSync(binary, ['-version'], { encoding: 'utf8' });
  const match = `${result.stderr}${result.stdout}`.match(/version "(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeJavaHome(dir) {
  if (!dir) {
    return null;
  }

  const nested = path.join(dir, 'Contents', 'Home');
  if (existsSync(path.join(nested, 'bin', 'java'))) {
    return nested;
  }

  if (existsSync(path.join(dir, 'bin', 'java'))) {
    return dir;
  }

  return null;
}

function isSupportedJdk(home) {
  const major = javaMajor(home);
  return major != null && major >= 17 && major <= 21;
}

function miseJavaHomes() {
  const homes = [];
  const localMise = path.join(os.homedir(), '.local/bin/mise');
  const mise = existsSync(localMise) ? localMise : 'mise';
  for (const spec of ['java@17', 'java@21', 'java']) {
    const where = spawnSync(mise, ['where', spec], {
      encoding: 'utf8',
      cwd: repoRoot,
    });

    if (!where.error && where.status === 0) {
      const home = normalizeJavaHome(where.stdout.trim());
      if (home) {
        homes.push(home);
      }
    }
  }

  const dataDir = process.env.MISE_DATA_DIR ?? path.join(os.homedir(), '.local/share/mise');
  const installs = path.join(dataDir, 'installs', 'java');
  if (!existsSync(installs)) {
    return homes;
  }

  for (const name of readdirSync(installs)) {
    const home = normalizeJavaHome(path.join(installs, name));
    if (home) {
      homes.push(home);
    }
  }

  return homes;
}

const candidates = [
  normalizeJavaHome(process.env.JAVA_HOME),
  ...miseJavaHomes(),
  '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
  '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
].filter(Boolean);

const javaHome = candidates.find(isSupportedJdk);

if (!javaHome) {
  console.error(
    'Android builds need JDK 17 or 21. Android Studio JBR 25 fails CMake with:\n' +
      '  WARNING: A restricted method in java.lang.System has been called\n\n' +
      'Install JDK 17, then re-run pnpm android:\n\n' +
      '  mise install java@17\n\n' +
      'or:\n\n' +
      '  brew install openjdk@17\n' +
      '  export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"'
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
