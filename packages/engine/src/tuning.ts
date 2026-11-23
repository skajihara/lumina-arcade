/**
 * 調整パネル。全パラメータを1つの設定オブジェクトに集めて、ゲーム中にスライダーで変更できる。
 * - プリセット（やさしい／ふつう／むずかしい）
 * - 自分用の設定を localStorage に保存
 * - JSON で書き出し・読み込み
 * T キーで開閉。
 */
import GUI from 'lil-gui';

export interface ParamDef {
  min?: number;
  max?: number;
  step?: number;
  label: string;
  folder?: string;
  /** 変更をステージ再開始まで反映しない（地形に関わる値など） */
  restart?: boolean;
}

export type Schema<C> = { [K in keyof C]: ParamDef };

export interface Tuning<C extends Record<string, number | boolean>> {
  config: C;
  preset: string;
  gui: GUI;
  applyPreset(name: string): void;
  onChange(fn: (key: keyof C, needsRestart: boolean) => void): void;
  toggle(): void;
}

export function createTuning<C extends Record<string, number | boolean>>(
  gameId: string,
  schema: Schema<C>,
  presets: Record<string, C>,
  defaultPreset: string,
): Tuning<C> {
  const storeKey = `lumina:${gameId}:tuning`;
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) ?? 'null') as { preset: string; custom?: C } | null;
    } catch {
      return null;
    }
  })();
  const allPresets: Record<string, C> = { ...presets };
  if (saved?.custom) allPresets['じぶん用'] = { ...presets[defaultPreset], ...saved.custom };
  const startPreset = saved && allPresets[saved.preset] ? saved.preset : defaultPreset;
  const config = { ...allPresets[startPreset] } as C;

  const listeners: ((k: keyof C, r: boolean) => void)[] = [];
  const gui = new GUI({ title: '調整パネル（T で開閉）', width: 300 });
  gui.domElement.style.zIndex = '50';
  gui.close();
  gui.hide();

  const state = { preset: startPreset };
  const presetCtrl = gui.add(state, 'preset', Object.keys(allPresets)).name('プリセット');
  presetCtrl.onChange((v: string) => t.applyPreset(v));

  const folders = new Map<string, GUI>();
  const ctrls: { updateDisplay(): void }[] = [];
  for (const key of Object.keys(schema) as (keyof C & string)[]) {
    const d = schema[key];
    const parent = d.folder ? (folders.get(d.folder) ?? folders.set(d.folder, gui.addFolder(d.folder)).get(d.folder)!) : gui;
    const v = config[key];
    const c = typeof v === 'boolean'
      ? parent.add(config, key)
      : parent.add(config, key, d.min, d.max, d.step);
    c.name(d.label + (d.restart ? ' ↻' : ''));
    c.onChange(() => listeners.forEach((fn) => fn(key, !!d.restart)));
    ctrls.push(c);
  }

  const persist = (custom?: C) => {
    const prev = saved ?? { preset: state.preset };
    localStorage.setItem(storeKey, JSON.stringify({ preset: state.preset, custom: custom ?? prev.custom }));
  };

  const actions = {
    save: () => {
      allPresets['じぶん用'] = { ...config };
      state.preset = 'じぶん用';
      presetCtrl.options(Object.keys(allPresets));
      presetCtrl.setValue('じぶん用');
      persist({ ...config });
    },
    export: () => {
      const json = JSON.stringify(config, null, 2);
      void navigator.clipboard?.writeText(json);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `${gameId}-tuning.json`;
      a.click();
    },
    import: () => {
      const s = prompt('設定のJSONを貼り付けてください');
      if (!s) return;
      try {
        Object.assign(config, JSON.parse(s));
        ctrls.forEach((c) => c.updateDisplay());
        listeners.forEach((fn) => fn('*' as keyof C, true));
      } catch {
        alert('JSON を読み込めませんでした');
      }
    },
  };
  gui.add(actions, 'save').name('💾 じぶん用として保存');
  gui.add(actions, 'export').name('⬇ JSONで書き出し');
  gui.add(actions, 'import').name('⬆ JSONを読み込み');

  let visible = false;
  const t: Tuning<C> = {
    config,
    get preset() { return state.preset; },
    gui,
    applyPreset(name: string) {
      const p = allPresets[name];
      if (!p) return;
      Object.assign(config, p);
      state.preset = name;
      presetCtrl.updateDisplay();
      ctrls.forEach((c) => c.updateDisplay());
      persist();
      listeners.forEach((fn) => fn('*' as keyof C, true));
    },
    onChange(fn) {
      listeners.push(fn);
    },
    toggle() {
      visible = !visible;
      if (visible) { gui.show(); gui.open(); } else gui.hide();
    },
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyT' && !(e.target instanceof HTMLInputElement)) t.toggle();
  });
  return t;
}
