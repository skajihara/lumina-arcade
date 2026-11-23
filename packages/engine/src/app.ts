/**
 * Pixi アプリの生成。論理解像度（例 600x1000）で描いて、画面に収まるよう拡大縮小する。
 */
import { Application, Container, Graphics } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';

export interface GameApp {
  app: Application;
  /** 揺れ・拡大縮小をかける最上位 */
  root: Container;
  /** ゲーム世界（ブルームがかかる） */
  world: Container;
  /** 画面全体を覆うフラッシュ */
  flash: Graphics;
  width: number;
  height: number;
  scale: number;
  setBloom(on: boolean, strength?: number): void;
  /** 画面座標 → 論理座標 */
  toLogical(clientX: number, clientY: number): { x: number; y: number };
}

export async function createGameApp(width: number, height: number, background = 0x02030a): Promise<GameApp> {
  const app = new Application();
  await app.init({
    background,
    antialias: true,
    preference: 'webgl',
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
    resizeTo: window,
  });
  app.canvas.id = 'game';
  document.body.appendChild(app.canvas);

  const root = new Container();
  const world = new Container();
  root.addChild(world);
  const flash = new Graphics().rect(0, 0, width, height).fill({ color: 0xffffff });
  flash.alpha = 0;
  root.addChild(flash);
  app.stage.addChild(root);

  const bloom = new AdvancedBloomFilter({ threshold: 0.35, bloomScale: 1.1, brightness: 1.0, blur: 6, quality: 4 });
  const ga: GameApp = {
    app, root, world, flash, width, height, scale: 1,
    setBloom(on: boolean, strength = 1.1) {
      bloom.bloomScale = strength;
      world.filters = on ? [bloom] : [];
    },
    toLogical(cx: number, cy: number) {
      return { x: (cx - root.x) / ga.scale, y: (cy - root.y) / ga.scale };
    },
  };

  const layout = () => {
    const sw = app.screen.width, sh = app.screen.height;
    const s = Math.min(sw / width, sh / height);
    ga.scale = s;
    root.scale.set(s);
    root.x = (sw - width * s) / 2;
    root.y = (sh - height * s) / 2;
  };
  app.renderer.on('resize', layout);
  layout();
  ga.setBloom(true);
  return ga;
}

/** e2e テストやボットから状態を覗くためのフック */
export interface DebugHook {
  game: string;
  ready: boolean;
  errors: string[];
  frames: number;
  state: () => Record<string, unknown>;
  [k: string]: unknown;
}

export function installDebugHook(game: string, state: () => Record<string, unknown>): DebugHook {
  const hook: DebugHook = { game, ready: false, errors: [], frames: 0, state };
  (window as unknown as { __lumina: DebugHook }).__lumina = hook;
  window.addEventListener('error', (e) => hook.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => hook.errors.push(String(e.reason)));
  return hook;
}
