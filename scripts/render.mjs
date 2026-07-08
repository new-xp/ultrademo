// Render helper: picks the composition, flags, and output name for a project.
//
// Usage: npm run render -- <project> [--vertical] [--gif] [--no-captions] [--stems]
//
// Default output is the FINALIZED video (captions burned in, narration mixed).
// Power-user opt-ins for editing before publishing:
//   --no-captions  finalized video without burned-in captions
//   --stems        editor-ready bundle in out/<project>-stems/:
//                    video.mp4      clean video track (no captions, no audio)
//                    narration.mp3  timeline-aligned narration track
//                    captions.srt   subtitles matching the same timeline
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync} from 'node:fs';

const args = process.argv.slice(2);
const project = args.find((a) => !a.startsWith('--'));
if (!project) {
  console.error('Usage: npm run render -- <project> [--vertical] [--gif] [--no-captions] [--stems]');
  process.exit(1);
}
const vertical = args.includes('--vertical');
const gif = args.includes('--gif');
const noCaptions = args.includes('--no-captions');
const stems = args.includes('--stems');

const comp = vertical ? 'DemoVertical' : 'Demo';
const publicDir = `projects/${project}/assets`;
const outDir = `projects/${project}/out`;

// Mirror of the renderer's timing math (Demo.tsx) - keep in sync.
const HOLD_AFTER_AUDIO = 0.7;
const HOLD_AFTER_CLIP = 0.4;
const FPS = 30;
const clipRate = (s) => {
  const narration = (s.audioDuration ?? s.durationHint ?? 4) + HOLD_AFTER_AUDIO;
  const clip = s.clipDuration ?? 0;
  if (!clip || clip <= narration) return 1;
  return Math.min(1.3, clip / narration);
};
const sceneSeconds = (s) => {
  const narration = (s.audioDuration ?? s.durationHint ?? 4) + HOLD_AFTER_AUDIO;
  const clip = s.clipDuration ? s.clipDuration / clipRate(s) + HOLD_AFTER_CLIP : 0;
  return Math.max(1, Math.round(Math.max(narration, clip) * FPS)) / FPS;
};

// Regen support: never overwrite a previous render - archive it first, so
// "the UI changed" always leaves a before/after pair to compare.
const archive = (out) => {
  if (!existsSync(out)) return;
  const stamp = statSync(out).mtime.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const dir = `${outDir}/archive`;
  mkdirSync(dir, {recursive: true});
  const base = out.split('/').pop();
  renameSync(out, `${dir}/${stamp}-${base}`);
  console.log(`archived previous render -> ${dir}/${stamp}-${base}`);
};

const renderComp = (out, props) => {
  archive(out);
  execFileSync(
    'npx',
    ['remotion', 'render', 'render/src/index.ts', comp, out,
      `--public-dir=${publicDir}`,
      '--timeout=90000',
      `--props=${JSON.stringify(props)}`,
      ...(gif ? ['--codec=gif', '--every-nth-frame=2', '--scale=0.5'] : [])],
    {stdio: 'inherit'},
  );
};
mkdirSync(outDir, {recursive: true});

if (!stems) {
  const out = `${outDir}/${project}${vertical ? '-vertical' : ''}${noCaptions ? '-nocaptions' : ''}.${gif ? 'gif' : 'mp4'}`;
  renderComp(out, {storyboard: null, captions: !noCaptions});
  console.log(`\nrendered ${out}`);
} else {
  const dir = `${outDir}/stems`;
  mkdirSync(dir, {recursive: true});
  const sb = JSON.parse(readFileSync(`${publicDir}/storyboard.json`, 'utf8'));

  // the finalized video is ALWAYS produced, stems are additional
  const finalOut = `${outDir}/${project}${vertical ? '-vertical' : ''}.mp4`;
  renderComp(finalOut, {storyboard: null});
  console.log(`rendered ${finalOut} (finalized)`);

  // scene start offsets on the final timeline
  let t = 0;
  const starts = sb.scenes.map((s) => {
    const at = t;
    t += sceneSeconds(s);
    return at;
  });

  // 1. clean video track
  renderComp(`${dir}/video.mp4`, {storyboard: null, captions: false, audio: false});

  // 2. timeline-aligned narration track (each clip delayed to its scene start)
  const withAudio = sb.scenes.map((s, i) => ({s, at: starts[i]})).filter((x) => x.s.audio);
  const inputs = withAudio.flatMap((x) => ['-i', `${publicDir}/${x.s.audio}`]);
  const delays = withAudio
    .map((x, i) => `[${i}]adelay=${Math.round(x.at * 1000)}:all=1[a${i}]`)
    .join(';');
  const mix = `${withAudio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${withAudio.length}:normalize=0[out]`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${delays};${mix}`,
    '-map', '[out]', '-t', String(t.toFixed(3)), `${dir}/narration.mp3`]);

  // 3. SRT matching the same timeline
  const ts = (sec) => {
    const ms = Math.round(sec * 1000);
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const s2 = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return `${h}:${m}:${s2},${String(ms % 1000).padStart(3, '0')}`;
  };
  const srt = sb.scenes
    .map((s, i) => {
      const start = starts[i];
      const end = start + (s.audioDuration ?? s.durationHint ?? 4);
      return `${i + 1}\n${ts(start)} --> ${ts(end)}\n${s.script}\n`;
    })
    .join('\n');
  writeFileSync(`${dir}/captions.srt`, srt);

  console.log(`\nstems ready in ${dir}/: video.mp4 (clean), narration.mp3, captions.srt (finalized video also rendered)`);
}
