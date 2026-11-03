let currentFps = 0;
let currentFrametime = 0;
let currentDraws = 0;
let currentTris = 0;
let currentEngine = 'WebGL2';

const listeners = new Set<() => void>();

export const fpsStore = {
  set(fps: number, frametime?: number, draws?: number, tris?: number) {
    currentFps = fps;
    if (frametime !== undefined) currentFrametime = frametime;
    if (draws !== undefined) currentDraws = draws;
    if (tris !== undefined) currentTris = tris;
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getFps: () => currentFps,
  getFrametime: () => currentFrametime,
  getDraws: () => currentDraws,
  getTris: () => currentTris,
  getEngine: () => currentEngine,
  setEngine: (engine: string) => {
    currentEngine = engine;
    listeners.forEach((l) => l());
  }
};
