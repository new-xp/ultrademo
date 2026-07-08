import {Composition, staticFile} from 'remotion';
import {Demo, FPS, Layout, Storyboard, sceneFrames} from './Demo';

type Props = {storyboard: Storyboard | null; layout?: Layout; captions?: boolean; audio?: boolean};

// The render runs with --public-dir projects/<name>/assets, so the storyboard
// and all asset paths resolve relative to that project.
const loadStoryboard = async ({props}: {props: Props}) => {
  const storyboard: Storyboard = await fetch(staticFile('storyboard.json')).then((r) => r.json());
  const durationInFrames = storyboard.scenes.reduce((sum, s) => sum + sceneFrames(s), 0);
  return {durationInFrames, props: {...props, storyboard}};
};

const DemoWide: React.FC<Props> = (p) => (
  <Demo storyboard={p.storyboard} layout="wide" captions={p.captions ?? true} audio={p.audio ?? true} />
);
const DemoVertical: React.FC<Props> = (p) => (
  <Demo storyboard={p.storyboard} layout="vertical" captions={p.captions ?? true} audio={p.audio ?? true} />
);

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Demo"
        component={DemoWide}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={300}
        defaultProps={{storyboard: null}}
        calculateMetadata={loadStoryboard}
      />
      <Composition
        id="DemoVertical"
        component={DemoVertical}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={300}
        defaultProps={{storyboard: null}}
        calculateMetadata={loadStoryboard}
      />
    </>
  );
};
