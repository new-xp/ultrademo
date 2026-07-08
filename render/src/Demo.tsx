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

// Source capture space is always 1920x1080; the vertical layout crops it.
const SRC = {width: 1920, height: 1080};

export type Layout = 'wide' | 'vertical';

export type CursorEvent = {t: number; type: 'move' | 'click'; x: number; y: number};

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
  durationHint?: number; // seconds, fallback when no audio
};

export type Storyboard = {
  title: string;
  template?: string;
  project?: string;
  scenes: Scene[];
};

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

const Caption: React.FC<{text: string; layout: Layout}> = ({text, layout}) => (
  <div
    style={{
      position: 'absolute',
      bottom: layout === 'vertical' ? 140 : 56,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    <div
      style={{
        maxWidth: layout === 'vertical' ? 940 : 1400,
        background: 'rgba(15,23,42,0.82)',
        color: '#f8fafc',
        padding: '18px 34px',
        borderRadius: 14,
        fontSize: layout === 'vertical' ? 40 : 34,
        lineHeight: 1.35,
        fontFamily:
          'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        textAlign: 'center',
      }}
    >
      {text}
    </div>
  </div>
);

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

const SceneView: React.FC<{
  scene: Scene;
  prev: Scene | null;
  layout: Layout;
  captions: boolean;
  audio: boolean;
}> = ({scene, prev, layout, captions, audio}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});

  const content =
    scene.media === 'clip' ? <ClipScene scene={scene} /> : <StillScene scene={scene} prev={prev} />;

  return (
    <AbsoluteFill style={{backgroundColor: '#0f172a', opacity}}>
      {scene.frame === 'phone' ? (
        <PhoneScene scene={scene} layout={layout} />
      ) : layout === 'vertical' ? (
        <VerticalCrop scene={scene}>{content}</VerticalCrop>
      ) : (
        content
      )}
      {captions ? <Caption text={scene.script} layout={layout} /> : null}
      {audio && scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
    </AbsoluteFill>
  );
};

export const Demo: React.FC<{
  storyboard: Storyboard | null;
  layout?: Layout;
  captions?: boolean;
  audio?: boolean;
}> = ({storyboard, layout = 'wide', captions = true, audio = true}) => {
  if (!storyboard) {
    return null;
  }
  let cursor = 0;
  return (
    <AbsoluteFill style={{backgroundColor: '#0f172a'}}>
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
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
