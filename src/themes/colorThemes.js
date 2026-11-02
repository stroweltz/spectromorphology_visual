import * as THREE from 'three';

/**
 * Curated Master Color Themes for Spectromorphology Generative Mandalas.
 * ----------------------------------------------------------------------
 * Engineered based on WebGL additive blending mathematics, Inigo Quilez cosine palettes,
 * and calibrated to prevent 'black crush' while providing rich, blurred, breathing
 * procedural ambient gradients (Nebula, Waves, Aurora) tuned specifically for each aesthetic.
 */
export const COLOR_THEMES = {
  // ── 0. Изначальный авторский шедевр ─────────────────────────
  '🌌 Авторский Оригинал (Полночный Индиго)': {
    id: 'original',
    title: '🌌 Авторский Оригинал (Полночный Индиго)',
    archetype: 'Тот самый каноничный шедевр: глубокая индиго-небула и сочный спектр',
    bgMode: 'nebula',
    bgOuter: '#030406', // Ультраглубокий обсидиан
    bgInner: '#0c1527', // Полночный бархатный индиго
    bgAccent: '#160a22', // Глубокий сливовый акцент
    nebulaIntensity: 5.5,
    nebulaScale: 1.4,
    nebulaSpeed: 2.5,
    vignette: 0.75,
    toneMappingMode: 'none', // Исходный чистый рендеринг без срезания насыщенности
    layers: [
      { color: '#ef2353', splitColor: '#ffaa00', name: 'Рубиновый алый / Янтарь (Ядро)' },
      { color: '#00d2d3', splitColor: '#10ac84', name: 'Электрический циан / Изумруд (Середина)' },
      { color: '#9b59b6', splitColor: '#ff6b6b', name: 'Королевский фиолет / Коралл (Орбита)' }
    ]
  },

  // ── 1. Psychedelic / Acid RGB / VJ Presets ──────────────────
  '🌈 Псайтранс ТРИП (100% Acid)': {
    id: 'psyacid',
    title: '🌈 Псайтранс ТРИП (100% Acid)',
    archetype: 'Psytrance Festival / 100% Saturation / Флуоресцент',
    bgMode: 'nebula',
    bgOuter: '#020005', // Ультратемная фиолетовая бездна
    bgInner: '#22003b', // Флуоресцентная темно-фиолетовая плазма
    bgAccent: '#00262b', // Глубокий кислотно-циановый отблеск
    nebulaIntensity: 7.2,
    nebulaScale: 1.6,
    nebulaSpeed: 2.8,
    vignette: 0.70,
    toneMappingMode: 'none',
    layers: [
      { color: '#00ff00', splitColor: '#ff00ff', name: 'Acid Green / Hot Magenta (Ядро)' },
      { color: '#00ffff', splitColor: '#ffff00', name: 'Electric Cyan / Acid Yellow (Середина)' },
      { color: '#ff0055', splitColor: '#7000ff', name: 'Fluo Red / Electric Violet (Орбита)' }
    ]
  },
  '🔮 Ультрафиолетовый Рейв (UV Blacklight)': {
    id: 'uvrave',
    title: '🔮 Ультрафиолетовый Рейв (UV Blacklight)',
    archetype: 'Ультрафиолетовый лазер / Флуоресцентный неон',
    bgMode: 'nebula',
    bgOuter: '#040008', // Ночной клубный сумрак
    bgInner: '#290040', // Глубокий ультрафиолетовый blacklight
    bgAccent: '#0d2b10', // Фосфоресцирующий токсичный отблеск
    nebulaIntensity: 7.0,
    nebulaScale: 1.6,
    nebulaSpeed: 2.6,
    vignette: 0.72,
    toneMappingMode: 'none',
    layers: [
      { color: '#ff007f', splitColor: '#a6ff00', name: 'UV Pink / Toxic Lime (Ядро)' },
      { color: '#7f00ff', splitColor: '#00ffe1', name: 'Deep Violet / Electric Aqua (Середина)' },
      { color: '#3b0066', splitColor: '#ff5500', name: 'Dark Ultraviolet / Neon Orange (Орбита)' }
    ]
  },
  '🌀 Хрома-Спектр ЛСД (Chroma Acid)': {
    id: 'chromaacid',
    title: '🌀 Хрома-Спектр ЛСД (Chroma Acid)',
    archetype: 'Оптическая призматическая дисперсия / Калейдоскоп',
    bgMode: 'waves', // Пульсирующие хроматические волны
    bgOuter: '#030303', // Нейтральная темнота
    bgInner: '#1c1c33', // Призматическая темно-синяя аура
    bgAccent: '#2d1808', // Теплый янтарный отблеск спектра
    nebulaIntensity: 6.6,
    nebulaScale: 1.7,
    nebulaSpeed: 2.4,
    vignette: 0.75,
    toneMappingMode: 'none',
    layers: [
      { color: '#ffff00', splitColor: '#00ffaa', name: 'Solar Yellow / Spring Mint (Ядро)' },
      { color: '#ff00aa', splitColor: '#00aaff', name: 'Vivid Pink / Azure Blue (Середина)' },
      { color: '#9900ff', splitColor: '#ff3300', name: 'Psychedelic Violet / Fire Orange (Орбита)' }
    ]
  },
  '🕹️ Классический RGB Синтез': {
    id: 'classicrgb',
    title: '🕹️ Классический RGB Синтез',
    archetype: 'Видео-арт 80-х / Чистый Red-Green-Blue синтез света',
    bgMode: 'nebula',
    bgOuter: '#020202', // Чернота экрана CRT
    bgInner: '#121220', // Люминофорное свечение кинескопа
    bgAccent: '#201018', // Вторичный луч кинескопа
    nebulaIntensity: 6.2,
    nebulaScale: 1.5,
    nebulaSpeed: 2.0,
    vignette: 0.75,
    toneMappingMode: 'none',
    layers: [
      { color: '#ff0000', splitColor: '#ffff00', name: 'Pure Red / Pure Yellow (Ядро)' },
      { color: '#00ff00', splitColor: '#00ffff', name: 'Pure Green / Pure Cyan (Середина)' },
      { color: '#0000ff', splitColor: '#ff00ff', name: 'Pure Blue / Pure Magenta (Орбита)' }
    ]
  },

  // ── 2. Cinematic & Atmospheric Themes ──────────────────────
  '⚡ Blade Runner 2049 (Неоновый нуар)': {
    id: 'bladerunner',
    title: '⚡ Blade Runner 2049 (Неоновый нуар)',
    archetype: 'Холодный киберпанк, лазерный циан и неоновая маджента',
    bgMode: 'nebula',
    bgOuter: '#03050c', // Полночная бездна ночного Токио
    bgInner: '#0b2647', // Глубокий голографический циан-туман
    bgAccent: '#36093d', // Кислотный неоновый ультрафиолет
    nebulaIntensity: 6.8,
    nebulaScale: 1.6,
    nebulaSpeed: 2.4,
    vignette: 0.75,
    toneMappingMode: 'agx',
    layers: [
      { color: '#00f3ff', splitColor: '#ff0055', name: 'Голографический циан / Лазерная маджента' },
      { color: '#7000ff', splitColor: '#00ff9d', name: 'Ультрафиолет / Ядовитый ментол' },
      { color: '#120038', splitColor: '#005580', name: 'Темная плазма / Глубокий кобальт' }
    ]
  },
  '🪙 Kintsugi Zen (Японское золото)': {
    id: 'kintsugi',
    title: '🪙 Kintsugi Zen (Японское золото)',
    archetype: 'Философия ваби-саби, сусальное золото и патинированная бронза',
    bgMode: 'nebula',
    bgOuter: '#080604', // Глубокий лаковый обсидиан
    bgInner: '#2e2010', // Патинированное темное золото / теплая амбра
    bgAccent: '#1f130b', // Копченая бронза / дым ладана
    nebulaIntensity: 6.2,
    nebulaScale: 1.6,
    nebulaSpeed: 2.0,
    vignette: 0.80,
    toneMappingMode: 'agx',
    layers: [
      { color: '#d4af37', splitColor: '#f3e5ab', name: 'Сусальное золото / Эфирный свет' },
      { color: '#8c6239', splitColor: '#c5a059', name: 'Матовая медь / Старое золото' },
      { color: '#2b261f', splitColor: '#5c4d3c', name: 'Темный античный металл' }
    ]
  },
  '🌊 Deep Sea Bioluminescence (Океан)': {
    id: 'deepsea',
    title: '🌊 Deep Sea Bioluminescence (Океан)',
    archetype: 'Свечение планктона и глубоководных медуз в Марианской впадине',
    bgMode: 'waves', // Циклические волны глубоководного пульса
    bgOuter: '#01080d', // Марианская впадина (зеленовато-черный)
    bgInner: '#06384a', // Фосфоресцирующее свечение глубоководного аквамарина
    bgAccent: '#032422', // Изумрудные океанические течения
    nebulaIntensity: 6.5,
    nebulaScale: 1.7,
    nebulaSpeed: 2.2,
    vignette: 0.75,
    toneMappingMode: 'agx',
    layers: [
      { color: '#00ffcc', splitColor: '#70ff00', name: 'Бирюза / Кислотный неон' },
      { color: '#0088cc', splitColor: '#00ffd5', name: 'Морской аквамарин / Океан' },
      { color: '#002b40', splitColor: '#00555e', name: 'Глубоководный сумрак' }
    ]
  },
  '🔥 Solar Flare Plasma (Солнечный огонь)': {
    id: 'solarflare',
    title: '🔥 Solar Flare Plasma (Солнечный огонь)',
    archetype: 'Термоядерная энергия, корональные протуберанцы и пепел',
    bgMode: 'nebula',
    bgOuter: '#0a0302', // Угольный пепел
    bgInner: '#421208', // Инфракрасный тепловой жар короны
    bgAccent: '#260604', // Магматический сумрак
    nebulaIntensity: 6.5,
    nebulaScale: 1.5,
    nebulaSpeed: 2.2,
    vignette: 0.80,
    toneMappingMode: 'agx',
    layers: [
      { color: '#ffdd00', splitColor: '#ffffff', name: 'Звездная плазма / Белый жар' },
      { color: '#ff5500', splitColor: '#ffaa00', name: 'Корональный огонь / Янтарь' },
      { color: '#880000', splitColor: '#cc2200', name: 'Остывающая магма' }
    ]
  },
  '📼 Vaporwave Nostalgia (Вейпорвейв)': {
    id: 'vaporwave',
    title: '📼 Vaporwave Nostalgia (Вейпорвейв)',
    archetype: 'Майами-розовый, ретро-синтвейв 80-х и неоновый циан',
    bgMode: 'aurora', // Северное сияние / струящийся горизонт 80-х
    bgOuter: '#08030f', // Ночной закат аркады
    bgInner: '#3b0d4f', // Ностальгический синтвейв-маджента закат
    bgAccent: '#0c2e47', // Вечерний неоновый циан
    nebulaIntensity: 6.8,
    nebulaScale: 1.6,
    nebulaSpeed: 2.5,
    vignette: 0.75,
    toneMappingMode: 'agx',
    layers: [
      { color: '#ff71ce', splitColor: '#01cdfe', name: 'Майами-розовый / Электрик-циан' },
      { color: '#05ffa1', splitColor: '#b967ff', name: 'Радиоактивный ментол / Сирень' },
      { color: '#4b0082', splitColor: '#7a1c93', name: 'Цифровой индиго / Пурпур' }
    ]
  },
  '🪷 Sacred Lotus Temple (Храм Лотоса)': {
    id: 'lotus',
    title: '🪷 Sacred Lotus Temple (Храм Лотоса)',
    archetype: 'Мягкий лотос, благовония, сакральное золото и винные тени',
    bgMode: 'nebula',
    bgOuter: '#080306', // Бархатный сумрак святилища
    bgInner: '#3d1029', // Благоухающий сливовый и розовый туман
    bgAccent: '#260a1e', // Тени сандалового дерева
    nebulaIntensity: 6.2,
    nebulaScale: 1.6,
    nebulaSpeed: 2.0,
    vignette: 0.80,
    toneMappingMode: 'agx',
    layers: [
      { color: '#ff94c2', splitColor: '#ffe49e', name: 'Розовый лотос / Золотая сердцевина' },
      { color: '#d869a8', splitColor: '#f1a7c4', name: 'Дикая роза / Маджента' },
      { color: '#4a1836', splitColor: '#732d59', name: 'Рубиновые тени лепестков' }
    ]
  },
  '🧪 Emerald Alchemist (Изумрудный Алхимик)': {
    id: 'alchemist',
    title: '🧪 Emerald Alchemist (Изумрудный Алхимик)',
    archetype: 'Зеленый биохакинг, светящийся малахит и древний лес',
    bgMode: 'nebula',
    bgOuter: '#010804', // Хвойный мрак древней чащи
    bgInner: '#083b1d', // Светящийся нефритовый / малахитовый пар
    bgAccent: '#032412', // Глубокий лесной мох
    nebulaIntensity: 6.5,
    nebulaScale: 1.6,
    nebulaSpeed: 2.2,
    vignette: 0.80,
    toneMappingMode: 'agx',
    layers: [
      { color: '#00ff88', splitColor: '#88ff00', name: 'Весенний неон / Токсичный лайм' },
      { color: '#00b87c', splitColor: '#52d6a4', name: 'Изумруд / Светящийся малахит' },
      { color: '#013823', splitColor: '#0c5c3e', name: 'Тени хвойного леса' }
    ]
  },
  '🖤 Cyber-Goth Monochrome (Холодный хром)': {
    id: 'cybergoth',
    title: '🖤 Cyber-Goth Monochrome (Холодный хром)',
    archetype: 'Алмазный белый, полированный алюминий и оружейный титан',
    bgMode: 'nebula',
    bgOuter: '#040507', // Вакуум
    bgInner: '#202633', // Жидкая ртуть / холодный серебряный туман
    bgAccent: '#11151f', // Полированный титановый отблеск
    nebulaIntensity: 6.0,
    nebulaScale: 1.7,
    nebulaSpeed: 2.0,
    vignette: 0.85,
    toneMappingMode: 'agx',
    layers: [
      { color: '#ffffff', splitColor: '#e0e6ed', name: 'Алмазный белый / Платина' },
      { color: '#8a95a5', splitColor: '#b8c4d0', name: 'Хирургическая сталь / Алюминий' },
      { color: '#2a3038', splitColor: '#4a5360', name: 'Темный оружейный титан' }
    ]
  },

  // ── 3. Classic Baseline ──────────────────────────────────
  '🌈 Classic Neon / True Obsidian': {
    id: 'classic',
    title: '🌈 Классический спектр (True Obsidian)',
    archetype: 'Абсолютный неоновый контраст на чистом черном',
    bgMode: 'nebula',
    bgOuter: '#000000', // Истинный глубокий ноль
    bgInner: '#0e1828', // Мягкий полночный индиго
    bgAccent: '#1a0c28', // Глубокий бархатный ультрафиолет
    nebulaIntensity: 5.5,
    nebulaScale: 1.5,
    nebulaSpeed: 2.0,
    vignette: 0.70,
    toneMappingMode: 'none',
    layers: [
      { color: '#ff3b56', splitColor: '#ff9f43', name: 'Рубин / Янтарь (Ядро)' },
      { color: '#00d2d3', splitColor: '#10ac84', name: 'Циан / Изумруд (Середина)' },
      { color: '#9b59b6', splitColor: '#ff6b6b', name: 'Фиолет / Коралл (Орбита)' }
    ]
  }
};

/**
 * Returns an array of layer color configs for N brushes (from 3 to 6).
 * Layers beyond 3 are synthesized by cyclic harmonic interpolation across
 * the theme's anchor palettes, ensuring 100% aesthetic coherence and vibrant saturation.
 *
 * @param {string|Object} themeOrKey
 * @param {number} count - number of active brushes (3..6)
 * @returns {Array<{color: string, splitColor: string, name: string}>}
 */
export function getThemeLayerColors(themeOrKey, count = 3) {
  const theme = typeof themeOrKey === 'string' ? COLOR_THEMES[themeOrKey] : themeOrKey;
  const fallback = COLOR_THEMES['🌌 Авторский Оригинал (Полночный Индиго)'];
  const baseLayers = (theme && theme.layers && theme.layers.length >= 3) ? theme.layers : fallback.layers;

  const N = Math.min(6, Math.max(1, count));
  if (N <= 3) {
    return baseLayers.slice(0, N);
  }

  const c0 = new THREE.Color(baseLayers[0].color);
  const c1 = new THREE.Color(baseLayers[1].color);
  const c2 = new THREE.Color(baseLayers[2].color);

  const s0 = new THREE.Color(baseLayers[0].splitColor);
  const s1 = new THREE.Color(baseLayers[1].splitColor);
  const s2 = new THREE.Color(baseLayers[2].splitColor);

  const hexOf = (c) => '#' + c.getHexString();
  const lerpCol = (ca, cb, t) => hexOf(new THREE.Color().copy(ca).lerp(cb, t));

  if (N === 4) {
    return [
      baseLayers[0],
      { color: lerpCol(c0, c1, 0.5), splitColor: lerpCol(s0, s1, 0.5), name: 'Гармония 1-2' },
      baseLayers[1],
      baseLayers[2]
    ];
  }

  if (N === 5) {
    return [
      baseLayers[0],
      { color: lerpCol(c0, c1, 0.5), splitColor: lerpCol(s0, s1, 0.5), name: 'Гармония 1-2' },
      baseLayers[1],
      { color: lerpCol(c1, c2, 0.5), splitColor: lerpCol(s1, s2, 0.5), name: 'Гармония 2-3' },
      baseLayers[2]
    ];
  }

  // N === 6
  return [
    baseLayers[0],
    { color: lerpCol(c0, c1, 0.5), splitColor: lerpCol(s0, s1, 0.5), name: 'Гармония 1-2' },
    baseLayers[1],
    { color: lerpCol(c1, c2, 0.5), splitColor: lerpCol(s1, s2, 0.5), name: 'Гармония 2-3' },
    baseLayers[2],
    { color: lerpCol(c2, c0, 0.5), splitColor: lerpCol(s2, s0, 0.5), name: 'Гармония 3-1' }
  ];
}
