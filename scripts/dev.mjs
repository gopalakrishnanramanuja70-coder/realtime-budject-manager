import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { delimiter, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'));

const port = process.argv[2] || '8080';
const jar = join('lib', 'sqlite-jdbc.jar');
const jarSha1 = 'f97e937f877cf3f2a2d84ce866d399a7da6ef08b';
const jarUrl = 'https://repo1.maven.org/maven2/org/xerial/sqlite-jdbc/3.42.0.1/sqlite-jdbc-3.42.0.1.jar';

function fail(lines) {
  console.error(lines.join('\n'));
  process.exit(1);
}

const javac = spawnSync('javac', ['-version'], { encoding: 'utf8' });
const major = javac.error ? 0 : Number(/javac (\d+)/.exec(`${javac.stdout}${javac.stderr}`)?.[1] ?? 0);
if (major < 17) {
  fail([
    'Java JDK 17 or newer is required' + (major ? ` (found ${major}).` : ' (javac was not found).'),
    'Windows: winget install -e --id EclipseAdoptium.Temurin.21.JDK',
    'Mac:     brew install --cask temurin@21',
    'Linux:   sudo apt install openjdk-21-jdk',
    'Then close and reopen the terminal and run npm run dev again.'
  ]);
}
console.log(`Java JDK ${major} found.`);

if (!existsSync(jar)) {
  console.log('Downloading the SQLite driver (one time, about 13 MB)...');
  mkdirSync('lib', { recursive: true });
  let data;
  try {
    const res = await fetch(jarUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    fail([`Download failed (${e.message}). Check your internet connection and run npm run dev again.`]);
  }
  writeFileSync(jar, data);
  if (createHash('sha1').update(data).digest('hex') !== jarSha1) {
    renameSync(jar, `${jar}.bad`);
    fail([`The downloaded driver failed its checksum and was renamed to ${jar}.bad. Run npm run dev again.`]);
  }
}

mkdirSync('build', { recursive: true });
const sources = readdirSync('src').filter((f) => f.endsWith('.java')).map((f) => join('src', f));
const compile = spawnSync('javac', ['-cp', jar, '-d', 'build', ...sources], { stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);

const server = spawn(
  'java',
  ['--enable-native-access=ALL-UNNAMED', '-cp', `build${delimiter}${jar}`, 'Main', port],
  { stdio: 'inherit' }
);
server.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill());
