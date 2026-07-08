// Ultrademo TTS step.
// Reads a project storyboard, synthesizes one audio clip per scene, measures
// its duration with ffprobe, and writes audio/audioDuration back into the
// storyboard.
//
// Voice chain: ElevenLabs (ELEVENLABS_API_KEY in .env) -> Piper if installed
// (free, offline, cross-platform: `pip install piper-tts`) -> macOS `say`
// placeholder -> error with install instructions.
//
// Unchanged lines are cached: each clip stores a signature of (engine, voice,
// text); re-runs only synthesize scenes whose script or voice changed, so
// editing one line never re-bills the other twenty.
//
// Usage: npm run tts -- <project>

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, rmSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM'; // Rachel
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2';
const API_KEY = process.env.ELEVENLABS_API_KEY;
const PIPER_MODEL = process.env.PIPER_MODEL ?? 'en_US-lessac-medium';
const STABILITY = process.env.ELEVENLABS_STABILITY ?? '0.45';
const SIMILARITY = process.env.ELEVENLABS_SIMILARITY ?? '0.75';

const args = process.argv.slice(2);
const project = args.find((a) => !a.startsWith('--'));
if (!project) {
  console.error('Usage: npm run tts -- <project> [--redo <sceneId,sceneId|all>]');
  process.exit(1);
}
const redoArg = args.includes('--redo') ? (args[args.indexOf('--redo') + 1] ?? 'all') : null;
const redo = new Set(redoArg ? redoArg.split(',') : []);

const assetsDir = path.resolve('projects', project, 'assets');
const sbPath = path.join(assetsDir, 'storyboard.json');
const storyboard = JSON.parse(await readFile(sbPath, 'utf8'));
await mkdir(path.join(assetsDir, 'audio'), {recursive: true});

const hasPiper = (() => {
  try {
    execFileSync('piper', ['--help'], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
})();

const engine = API_KEY
  ? 'elevenlabs'
  : hasPiper
    ? 'piper'
    : process.platform === 'darwin'
      ? 'say'
      : null;

if (!engine) {
  console.error(
    'No voice available. Either:\n' +
      '  - add ELEVENLABS_API_KEY=... to a .env file in this folder, or\n' +
      '  - install Piper (free, offline): pip install piper-tts',
  );
  process.exit(1);
}

const voiceSig =
  engine === 'elevenlabs'
    ? `elevenlabs:${VOICE_ID}:${MODEL_ID}:${STABILITY}:${SIMILARITY}`
    : engine === 'piper'
      ? `piper:${PIPER_MODEL}`
      : 'say';

const labels = {
  elevenlabs: `ElevenLabs (voice ${VOICE_ID})`,
  piper: `Piper (${PIPER_MODEL}, offline)`,
  say: 'macOS say fallback (placeholder voice)',
};
console.log(`TTS: ${labels[engine]}`);

const probeSeconds = (file) =>
  parseFloat(
    execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ]).toString(),
  );

const elevenlabs = async (text, outFile) => {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {'xi-api-key': API_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {stability: Number(STABILITY), similarity_boost: Number(SIMILARITY)},
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  }
  await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
};

const piper = (text, outFile) => {
  const wav = outFile.replace(/\.mp3$/, '.wav');
  const modelDir = path.join(os.homedir(), '.ultrademo', 'piper');
  // Piper auto-downloads the voice model on first use.
  execFileSync(
    'piper',
    ['--model', PIPER_MODEL, '--download-dir', modelDir, '--data-dir', modelDir, '--output_file', wav],
    {input: text},
  );
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, outFile]);
  rmSync(wav, {force: true});
};

const macSay = (text, outFile) => {
  const aiff = outFile.replace(/\.mp3$/, '.aiff');
  execFileSync('say', ['-o', aiff, text]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, outFile]);
  rmSync(aiff, {force: true});
};

const synth = {elevenlabs, piper, say: macSay}[engine];

for (const scene of storyboard.scenes) {
  const rel = `audio/${scene.id}.mp3`;
  const outFile = path.join(assetsDir, rel);
  const sigFile = `${outFile}.sig`;
  const sig = createHash('sha256').update(`${voiceSig}\n${scene.script}`).digest('hex');

  const force = redo.has('all') || redo.has(scene.id);
  const cached =
    !force && existsSync(outFile) && existsSync(sigFile) && readFileSync(sigFile, 'utf8') === sig;
  if (!cached) {
    await synth(scene.script, outFile);
    await writeFile(sigFile, sig);
  }
  scene.audio = rel;
  scene.audioDuration = probeSeconds(outFile);
  console.log(`${scene.id}: ${scene.audioDuration.toFixed(2)}s${cached ? ' (cached)' : ''}`);
}

// atomic write: a crash mid-write must never truncate the storyboard
const {rename} = await import('node:fs/promises');
await writeFile(`${sbPath}.tmp`, JSON.stringify(storyboard, null, 2));
await rename(`${sbPath}.tmp`, sbPath);
console.log('storyboard.json updated with audio durations');
