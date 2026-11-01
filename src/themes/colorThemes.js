import * as THREE from 'three';

/**
 * Curated Master Color Themes for Spectromorphology Generative Mandalas.
 * ----------------------------------------------------------------------
 * Engineered based on WebGL additive blending mathematics, Inigo Quilez cosine palettes,
 * and calibrated to prevent 'black crush' on consumer IPS/VA/TN displays.
 */
export const COLOR_THEMES = {
  '🌈 Classic Neon / True Obsidian': {
    id: 'classic',
    title: '🌈 Классический спектр (True Obsidian)',
    archetype: 'Абсолютный неоновый контраст на чистом черном',
    bgOuter: '#000000', // Истинный глубокий ноль
    bgInner: '#0c0e14', // Едва уловимое нейтральное свечение центра
    bgMode: 'radial',
    vignette: 0.70,
    layers: [
      { color: '#ff3b56', splitColor: '#ff9f43', name: 'Рубин / Янтарь (Ядро)' },
      { color: '#00d2d3', splitColor: '#10ac84', name: 'Циан / Изумруд (Середина)' },
      { color: '#9b59b6', splitColor: '#ff6b6b', name: 'Фиолет / Коралл (Орбита)' }
    ]
  },
  '🪙 Kintsugi Zen (Японское золото)': {
    id: 'kintsugi',
    title: '🪙 Kintsugi Zen (Японское золото)',
    archetype: 'Философия ваби-саби, сусальное золото и патинированная бронза',
    bgOuter: '#050403', // Обсидиан с теплым подтоном (Lum: 0.0013)
    bgInner: '#120e09', // Мягкая патинированная бронза
    bgMode: 'radial',
    vignette: 0.80,
    layers: [
      { color: '#d4af37', splitColor: '#f3e5ab', name: 'Сусальное золото / Эфирный свет' },
      { color: '#8c6239', splitColor: '#c5a059', name: 'Матовая медь / Старое золото' },
      { color: '#2b261f', splitColor: '#5c4d3c', name: 'Темный античный металл' }
    ]
  },
  '⚡ Blade Runner 2049 (Неоновый нуар)': {
    id: 'bladerunner',
    title: '⚡ Blade Runner 2049 (Неоновый нуар)',
    archetype: 'Холодный киберпанк, лазерный циан и неоновая маджента',
    bgOuter: '#030408', // Бездна холодного ночного неба
    bgInner: '#0a0f1d', // Темно-синий туман мегаполиса
    bgMode: 'radial',
    vignette: 0.75,
    layers: [
      { color: '#00f3ff', splitColor: '#ff0055', name: 'Голографический циан / Лазерная маджента' },
      { color: '#7000ff', splitColor: '#00ff9d', name: 'Ультрафиолет / Ядовитый ментол' },
      { color: '#120038', splitColor: '#005580', name: 'Темная плазма / Глубокий кобальт' }
    ]
  },
  '🌊 Deep Sea Bioluminescence (Океан)': {
    id: 'deepsea',
    title: '🌊 Deep Sea Bioluminescence (Океан)',
    archetype: 'Свечение планктона и глубоководных медуз в Марианской впадине',
    bgOuter: '#010608', // Марианская впадина (зеленовато-черный)
    bgInner: '#04151a', // Темно-изумрудная холодная аура
    bgMode: 'radial',
    vignette: 0.75,
    layers: [
      { color: '#00ffcc', splitColor: '#70ff00', name: 'Бирюза / Кислотный неон' },
      { color: '#0088cc', splitColor: '#00ffd5', name: 'Морской аквамарин / Океан' },
      { color: '#002b40', splitColor: '#00555e', name: 'Глубоководный сумрак' }
    ]
  },
  '🖤 Cyber-Goth Monochrome (Холодный хром)': {
    id: 'cybergoth',
    title: '🖤 Cyber-Goth Monochrome (Холодный хром)',
    archetype: 'Алмазный белый, полированный алюминий и оружейный титан',
    bgOuter: '#040405', // Космический вакуум с индиго-подтоном
    bgInner: '#101115', // Графитовое индустриальное отражение
    bgMode: 'radial',
    vignette: 0.85,
    layers: [
      { color: '#ffffff', splitColor: '#e0e6ed', name: 'Алмазный белый / Платина' },
      { color: '#8a95a5', splitColor: '#b8c4d0', name: 'Хирургическая сталь / Алюминий' },
      { color: '#2a3038', splitColor: '#4a5360', name: 'Темный оружейный титан' }
    ]
  },
  '🔥 Solar Flare Plasma (Солнечный огонь)': {
    id: 'solarflare',
    title: '🔥 Solar Flare Plasma (Солнечный огонь)',
    archetype: 'Термоядерная энергия, корональные протуберанцы и пепел',
    bgOuter: '#080201', // Раскаленный угольный мрак
    bgInner: '#180703', // Инфракрасное тепловое свечение
    bgMode: 'radial',
    vignette: 0.80,
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
    bgOuter: '#060208', // Зернистая темнота ретро-аркады
    bgInner: '#14061a', // Неоново-фиолетовый горизонт
    bgMode: 'radial',
    vignette: 0.75,
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
    bgOuter: '#060305', // Обволакивающий бархат благовоний
    bgInner: '#150810', // Тусклое сливовое свечение
    bgMode: 'radial',
    vignette: 0.80,
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
    bgOuter: '#010604', // Бездонная тьма древнего леса
    bgInner: '#04170e', // Ядовито-зеленая испарина
    bgMode: 'radial',
    vignette: 0.80,
    layers: [
      { color: '#00ff88', splitColor: '#88ff00', name: 'Весенний неон / Токсичный лайм' },
      { color: '#00b87c', splitColor: '#52d6a4', name: 'Изумруд / Светящийся малахит' },
      { color: '#013823', splitColor: '#0c5c3e', name: 'Тени хвойного леса' }
    ]
  }
};
