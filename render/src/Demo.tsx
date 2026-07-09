import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

export const FPS = 30;
const HOLD_AFTER_AUDIO = 0.7; // seconds of breathing room after each narration line
const HOLD_AFTER_CLIP = 0.4; // minimum settle after a clip finishes
const SLIDE_SECONDS = 3; // intro / outro title-card duration
const TOPTAIL = 12; // frames of fade-from-black (open) and fade-to-black (close)

// Source capture space is always 1920x1080; the vertical layout crops it.
const SRC = {width: 1920, height: 1080};

export type Layout = 'wide' | 'vertical';

export type CursorEvent = {t: number; type: 'move' | 'click'; x: number; y: number};

// Caption presentation. Defaults to the dark pill; brand/theme overridable per
// storyboard (storyboard.caption) or per render (--caption-* flags -> props).
export type CaptionStyle = {
  theme?: 'pill' | 'bar' | 'minimal'; // rounded chip / full-width lower third / text-only
  size?: 'sm' | 'md' | 'lg';
  position?: 'bottom' | 'top';
  accent?: string; // background/bar tint (hex)
  // Karaoke word-highlight (needs per-word timings -> ElevenLabs voice only;
  // free voices fall back to the static caption). Off unless set.
  highlight?: 'dim' | 'pill' | 'wipe';
};

export type WordTiming = {w: string; start: number; end: number};

export type IntroSlide = {title: string; subtitle?: string; screenshot?: string};
export type OutroSlide = {title: string; subtitle?: string; url?: string};

export type Scene = {
  id: string;
  media?: 'still' | 'clip';
  screenshot: string; // path under public/; for clips this is the end-state freeze frame
  clip?: string; // path under public/ (media: 'clip')
  clipDuration?: number; // seconds of sliced clip
  events?: CursorEvent[]; // cursor track logged during capture (media: 'clip')
  frame?: 'phone'; // phone-bezel presentation for mobile stills
  script: string;
  // Point of interest in 1920x1080 viewport coordinates
  focus?: {x: number; y: number; zoom?: number};
  // Where the cursor travels and clicks (usually same as focus)
  action?: {type: 'click' | 'hover' | 'none'; x: number; y: number};
  audio?: string; // path under public/
  audioDuration?: number; // seconds, written by the tts step
  words?: WordTiming[]; // per-word timings from ElevenLabs (karaoke captions)
  durationHint?: number; // seconds, fallback when no audio
};

export type Storyboard = {
  title: string;
  template?: string;
  project?: string;
  brand?: string; // accent hex for slides + caption default
  caption?: CaptionStyle;
  intro?: IntroSlide;
  outro?: OutroSlide;
  scenes: Scene[];
};

const BRAND_DEFAULT = '#ffb224';

// If a clip outlasts its narration, play it faster (capped) instead of leaving
// a silent action tail after the voice ends.
export const clipRate = (s: Scene): number => {
  const narration = (s.audioDuration ?? s.durationHint ?? 4) + HOLD_AFTER_AUDIO;
  const clip = s.clipDuration ?? 0;
  if (!clip || clip <= narration) return 1;
  return Math.min(1.3, clip / narration);
};

export const sceneFrames = (s: Scene): number => {
  const narration = (s.audioDuration ?? s.durationHint ?? 4) + HOLD_AFTER_AUDIO;
  const clip = s.clipDuration ? s.clipDuration / clipRate(s) + HOLD_AFTER_CLIP : 0;
  return Math.max(FPS, Math.round(Math.max(narration, clip) * FPS));
};

export const slideFrames = Math.round(SLIDE_SECONDS * FPS);
export const introFrames = (sb: Storyboard): number => (sb.intro ? slideFrames : 0);
export const outroFrames = (sb: Storyboard): number => (sb.outro ? slideFrames : 0);
export const totalFrames = (sb: Storyboard): number =>
  introFrames(sb) + sb.scenes.reduce((sum, s) => sum + sceneFrames(s), 0) + outroFrames(sb);

const Cursor: React.FC<{scale: number}> = ({scale}) => (
  <svg
    width={34 * scale}
    height={34 * scale}
    viewBox="0 0 24 24"
    style={{
      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))',
      display: 'block',
    }}
  >
    <path
      d="M5.5 3.2l12.8 7.9-5.6 1.2 3.1 6.6-2.5 1.2-3.1-6.7-4.2 4z"
      fill="#fff"
      stroke="#1e293b"
      strokeWidth="1.4"
    />
  </svg>
);

const CAPTION_SIZE = {sm: {wide: 27, vertical: 33}, md: {wide: 34, vertical: 40}, lg: {wide: 42, vertical: 50}};

const WORD_GREY = '#8b93a6';

// Karaoke word run: each word styled by whether it's been spoken, is being
// spoken now (t within [start,end)), or is upcoming. `t` is audio-relative
// seconds (audio starts at the scene's frame 0).
const WordRun: React.FC<{words: WordTiming[]; t: number; mode: 'dim' | 'pill' | 'wipe'; accent: string}> = ({
  words,
  t,
  mode,
  accent,
}) => (
  <>
    {words.map((word, i) => {
      const done = t >= word.end;
      const active = t >= word.start && t < word.end;
      const p = active ? Math.min(1, Math.max(0, (t - word.start) / Math.max(0.001, word.end - word.start))) : 0;
      let st: React.CSSProperties = {};
      if (mode === 'dim') {
        st = {opacity: active ? 1 : 0.4, fontWeight: active ? 700 : 400};
      } else if (mode === 'pill') {
        st = active
          ? {background: accent, color: '#1a1200', borderRadius: 8, padding: '2px 6px', margin: '0 -6px', fontWeight: 600}
          : {};
      } else {
        st = done
          ? {color: '#ffffff'}
          : active
            ? {
                background: `linear-gradient(90deg, ${accent} ${p * 100}%, ${WORD_GREY} ${p * 100}%)`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontWeight: 600,
              }
            : {color: WORD_GREY};
      }
      return (
        <React.Fragment key={i}>
          {i > 0 ? ' ' : ''}
          <span style={st}>{word.w}</span>
        </React.Fragment>
      );
    })}
  </>
);

const Caption: React.FC<{
  text: string;
  words?: WordTiming[];
  layout: Layout;
  style: CaptionStyle;
  highlightColor: string;
}> = ({text, words, layout, style, highlightColor}) => {
  const frame = useCurrentFrame();
  const theme = style.theme ?? 'pill';
  const size = style.size ?? 'md';
  const position = style.position ?? 'bottom';
  const accent = style.accent ?? 'rgba(15,23,42,0.82)';
  const fontSize = CAPTION_SIZE[size][layout];
  const edge = layout === 'vertical' ? 140 : 56;
  // Word-highlight only when a style is set AND word timings exist (ElevenLabs).
  const karaoke = style.highlight && words && words.length > 0;

  const box: React.CSSProperties =
    theme === 'bar'
      ? {
          width: '100%',
          background: accent.startsWith('#') ? hexToRgba(accent, 0.9) : accent,
          color: '#f8fafc',
          padding: layout === 'vertical' ? '26px 60px' : '22px 80px',
          fontSize,
          lineHeight: 1.35,
          textAlign: 'center',
        }
      : theme === 'minimal'
        ? {
            maxWidth: layout === 'vertical' ? 940 : 1500,
            color: '#ffffff',
            padding: '0 40px',
            fontSize,
            lineHeight: 1.35,
            textAlign: 'center',
            textShadow: '0 2px 10px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.9)',
            fontWeight: 600,
          }
        : {
            maxWidth: layout === 'vertical' ? 940 : 1400,
            background: accent.startsWith('#') ? hexToRgba(accent, 0.82) : accent,
            color: '#f8fafc',
            padding: layout === 'vertical' ? '18px 34px' : '18px 34px',
            borderRadius: 14,
            fontSize,
            lineHeight: 1.35,
            textAlign: 'center',
          };

  return (
    <div
      style={{
        position: 'absolute',
        [position]: theme === 'bar' ? 0 : edge,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily:
            'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          ...box,
        }}
      >
        {karaoke ? (
          <WordRun words={words!} t={frame / FPS} mode={style.highlight!} accent={highlightColor} />
        ) : (
          text
        )}
      </div>
    </div>
  );
};

const hexToRgba = (hex: string, a: number): string => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// Piecewise-linear cursor position along the logged event track.
const cursorAt = (events: CursorEvent[], t: number): {x: number; y: number} | null => {
  if (!events.length) return null;
  if (t <= events[0].t) return {x: events[0].x, y: events[0].y};
  for (let i = 0; i < events.length - 1; i++) {
    const a = events[i];
    const b = events[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return {x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p};
    }
  }
  const last = events[events.length - 1];
  return {x: last.x, y: last.y};
};

// Last known cursor point of a scene, for cross-scene cursor continuity.
const lastPoint = (s: Scene | null): {x: number; y: number} | null => {
  if (!s) return null;
  if (s.events?.length) {
    const e = s.events[s.events.length - 1];
    return {x: e.x, y: e.y};
  }
  return s.action ? {x: s.action.x, y: s.action.y} : null;
};

// Horizontal anchor for the 9:16 crop: the scene's point of interest.
const cropAnchorX = (scene: Scene): number => {
  if (scene.focus) return scene.focus.x;
  if (scene.action) return scene.action.x;
  const clicks = (scene.events ?? []).filter((e) => e.type === 'click');
  if (clicks.length) return clicks[Math.floor(clicks.length / 2)].x;
  return SRC.width / 2;
};

// Wraps 1920x1080 scene content so it covers a 1080x1920 canvas, cropped
// around the scene's focus point (F14: one capture, every format).
const VerticalCrop: React.FC<{scene: Scene; children: React.ReactNode}> = ({scene, children}) => {
  const s = 1920 / SRC.height; // scale so source height fills the 1920px canvas
  const scaledW = SRC.width * s;
  const x = Math.min(0, Math.max(1080 - scaledW, 540 - cropAnchorX(scene) * s));
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          width: SRC.width,
          height: SRC.height,
          transform: `translateX(${x}px) scale(${s})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

const ClipScene: React.FC<{scene: Scene}> = ({scene}) => {
  const frame = useCurrentFrame();
  const rate = clipRate(scene);
  const t = (frame / FPS) * rate; // clip-time, accounting for auto-fit speed-up
  const clipDuration = scene.clipDuration ?? 0;
  const clipFrames = Math.round((clipDuration / rate) * FPS);
  const pos = cursorAt(scene.events ?? [], Math.min(t, clipDuration));
  const clicks = (scene.events ?? []).filter((e) => e.type === 'click');

  return (
    <AbsoluteFill>
      {frame < clipFrames && scene.clip ? (
        <OffthreadVideo
          muted
          playbackRate={rate}
          src={staticFile(scene.clip)}
          style={{width: SRC.width, height: SRC.height}}
        />
      ) : (
        <Img
          src={staticFile(scene.screenshot)}
          style={{width: SRC.width, height: SRC.height, objectFit: 'cover'}}
        />
      )}
      {clicks.map((c, i) => {
        const start = Math.round((c.t / rate) * FPS);
        const p = interpolate(frame, [start, start + 14], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        if (p <= 0 || p >= 1) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: c.x - 40 * p,
              top: c.y - 40 * p,
              width: 80 * p,
              height: 80 * p,
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.9)',
              opacity: 1 - p,
            }}
          />
        );
      })}
      {pos ? (
        <div style={{position: 'absolute', left: pos.x, top: pos.y}}>
          <Cursor scale={1} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const PhoneScene: React.FC<{scene: Scene; layout: Layout}> = ({scene, layout}) => {
  const w = layout === 'vertical' ? 560 : 380;
  const imgH = Math.round(844 * (w / 390));
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        background: 'radial-gradient(ellipse at 50% 30%, #1e293b 0%, #0f172a 65%)',
      }}
    >
      <div
        style={{
          width: w + 22,
          borderRadius: Math.round(w * 0.137),
          padding: 11,
          background: '#020617',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(148,163,184,0.35)',
        }}
      >
        <Img
          src={staticFile(scene.screenshot)}
          style={{width: w, height: imgH, borderRadius: Math.round(w * 0.11), display: 'block'}}
        />
      </div>
    </AbsoluteFill>
  );
};

const StillScene: React.FC<{scene: Scene; prev: Scene | null}> = ({scene, prev}) => {
  const frame = useCurrentFrame();
  const total = sceneFrames(scene);

  const focus = scene.focus ?? (scene.action ? {x: scene.action.x, y: scene.action.y} : null);
  const zoom = focus?.zoom ?? 1.35;

  // Ken Burns: settle in at 1.0, then ease toward the focus point
  const scale = focus
    ? interpolate(frame, [Math.round(total * 0.18), Math.round(total * 0.62)], [1, zoom], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.inOut(Easing.cubic),
      })
    : 1;

  // Cursor travels from the previous scene's last known point to this one
  const cursorFrom = lastPoint(prev) ?? {x: 960, y: 620};
  const cursorTo = scene.action ?? cursorFrom;
  const travel = interpolate(frame, [Math.round(total * 0.12), Math.round(total * 0.42)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  });
  const cx = cursorFrom.x + (cursorTo.x - cursorFrom.x) * travel;
  const cy = cursorFrom.y + (cursorTo.y - cursorFrom.y) * travel;

  // Click ripple shortly after the cursor arrives
  const clickAt = Math.round(total * 0.5);
  const ripple = interpolate(frame, [clickAt, clickAt + 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const showRipple = scene.action?.type === 'click' && ripple > 0 && ripple < 1;

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        transformOrigin: focus ? `${focus.x}px ${focus.y}px` : '50% 50%',
      }}
    >
      <Img
        src={staticFile(scene.screenshot)}
        style={{width: SRC.width, height: SRC.height, objectFit: 'cover'}}
      />
      {scene.action && scene.action.type !== 'none' ? (
        <>
          {showRipple ? (
            <div
              style={{
                position: 'absolute',
                left: cursorTo.x - 40 * ripple,
                top: cursorTo.y - 40 * ripple,
                width: 80 * ripple,
                height: 80 * ripple,
                borderRadius: '50%',
                border: `${3 / scale}px solid rgba(255,255,255,0.9)`,
                opacity: 1 - ripple,
              }}
            />
          ) : null}
          <div style={{position: 'absolute', left: cx, top: cy}}>
            <Cursor scale={1 / scale} />
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};

// Full-frame title card for the optional intro / outro slides.
const SlideView: React.FC<{
  kind: 'intro' | 'outro';
  intro?: IntroSlide;
  outro?: OutroSlide;
  brand: string;
  layout: Layout;
}> = ({kind, intro, outro, brand, layout}) => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [0, 18], [24, 0], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const fade = interpolate(frame, [0, 18], [0, 1], {extrapolateRight: 'clamp'});
  const title = kind === 'intro' ? intro?.title : outro?.title;
  const subtitle = kind === 'intro' ? intro?.subtitle : outro?.subtitle;

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse at 50% 35%, #16233b 0%, #0b1120 70%)',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {kind === 'intro' && intro?.screenshot ? (
        <div
          style={{
            transform: `translateY(${rise * -0.6}px)`,
            opacity: fade,
            marginBottom: 44,
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(148,163,184,0.3)',
            boxShadow: '0 40px 90px -30px rgba(0,0,0,0.8)',
            width: layout === 'vertical' ? 760 : 980,
          }}
        >
          <Img src={staticFile(intro.screenshot)} style={{width: '100%', display: 'block'}} />
        </div>
      ) : null}
      <div style={{transform: `translateY(${rise}px)`, opacity: fade, textAlign: 'center', padding: '0 80px'}}>
        <div style={{width: 54, height: 5, background: brand, borderRadius: 3, margin: '0 auto 30px'}} />
        <div
          style={{
            color: '#f8fafc',
            fontSize: layout === 'vertical' ? 66 : 76,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            maxWidth: 1500,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{color: '#9aa3b5', fontSize: layout === 'vertical' ? 34 : 34, marginTop: 22}}>
            {subtitle}
          </div>
        ) : null}
        {kind === 'outro' && outro?.url ? (
          <div style={{color: brand, fontSize: layout === 'vertical' ? 34 : 32, marginTop: 30, fontWeight: 600}}>
            {outro.url}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const SceneView: React.FC<{
  scene: Scene;
  prev: Scene | null;
  layout: Layout;
  captions: boolean;
  audio: boolean;
  captionStyle: CaptionStyle;
  brand: string;
}> = ({scene, prev, layout, captions, audio, captionStyle, brand}) => {
  const content =
    scene.media === 'clip' ? <ClipScene scene={scene} /> : <StillScene scene={scene} prev={prev} />;

  // Hard cut between scenes (no per-scene fade) - the composition-level
  // fade-from-black / fade-to-black tops and tails the whole video, so scenes
  // never dip to the dark background between cuts (that was the visible flash).
  return (
    <AbsoluteFill style={{backgroundColor: '#0f172a'}}>
      {scene.frame === 'phone' ? (
        <PhoneScene scene={scene} layout={layout} />
      ) : layout === 'vertical' ? (
        <VerticalCrop scene={scene}>{content}</VerticalCrop>
      ) : (
        content
      )}
      {captions ? (
        <Caption
          text={scene.script}
          words={scene.words}
          layout={layout}
          style={captionStyle}
          highlightColor={brand}
        />
      ) : null}
      {audio && scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
    </AbsoluteFill>
  );
};

// One black overlay for the whole piece: reveals over the first TOPTAIL frames,
// closes over the last TOPTAIL. Replaces the per-scene fades that caused the flash.
const TopTail: React.FC<{total: number}> = ({total}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, TOPTAIL, total - TOPTAIL, total],
    [1, 0, 0, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  return <AbsoluteFill style={{backgroundColor: '#000', opacity, pointerEvents: 'none'}} />;
};

export const Demo: React.FC<{
  storyboard: Storyboard | null;
  layout?: Layout;
  captions?: boolean;
  audio?: boolean;
  caption?: CaptionStyle;
}> = ({storyboard, layout = 'wide', captions = true, audio = true, caption}) => {
  if (!storyboard) {
    return null;
  }
  const brand = storyboard.brand ?? BRAND_DEFAULT;
  // Precedence: per-render caption overrides > storyboard.caption. Accent stays
  // unset by default so captions use the readable dark pill; brand tints slides,
  // and a caption accent is opt-in (e.g. a branded 'bar' theme).
  const captionStyle: CaptionStyle = {...storyboard.caption, ...caption};
  const total = totalFrames(storyboard);
  let cursor = introFrames(storyboard);

  return (
    <AbsoluteFill style={{backgroundColor: '#0f172a'}}>
      {storyboard.intro ? (
        <Sequence from={0} durationInFrames={slideFrames}>
          <SlideView kind="intro" intro={storyboard.intro} brand={brand} layout={layout} />
        </Sequence>
      ) : null}

      {storyboard.scenes.map((scene, i) => {
        const from = cursor;
        const frames = sceneFrames(scene);
        cursor += frames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={frames}>
            <SceneView
              scene={scene}
              prev={i > 0 ? storyboard.scenes[i - 1] : null}
              layout={layout}
              captions={captions}
              audio={audio}
              captionStyle={captionStyle}
              brand={brand}
            />
          </Sequence>
        );
      })}

      {storyboard.outro ? (
        <Sequence from={cursor} durationInFrames={slideFrames}>
          <SlideView kind="outro" outro={storyboard.outro} brand={brand} layout={layout} />
        </Sequence>
      ) : null}

      <TopTail total={total} />
    </AbsoluteFill>
  );
};
