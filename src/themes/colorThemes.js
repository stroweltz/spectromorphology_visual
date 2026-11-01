import * as THREE from 'three';

/**
 * Curated Master Color Themes for Spectromorphology Generative Mandalas.
 * ----------------------------------------------------------------------
 * Engineered based on WebGL additive blending mathematics, Inigo Quilez cosine palettes,
 * and calibrated to prevent 'black crush' while providing rich, blurred, breathing
 * procedural ambient gradients (Nebula, Waves, Aurora) tuned specifically for each aesthetic.
 */
export const COLOR_THEMES = {
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
    layers: [
      { color: '#ffffff', splitColor: '#e0e6ed', name: 'Алмазный белый / Платина' },
      { color: '#8a95a5', splitColor: '#b8c4d0', name: 'Хирургическая сталь / Алюминий' },
      { color: '#2a3038', splitColor: '#4a5360', name: 'Темный оружейный титан' }
    ]
  },
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
    layers: [
      { color: '#ff3b56', splitColor: '#ff9f43', name: 'Рубин / Янтарь (Ядро)' },
      { color: '#00d2d3', splitColor: '#10ac84', name: 'Циан / Изумруд (Середина)' },
      { color: '#9b59b6', splitColor: '#ff6b6b', name: 'Фиолет / Коралл (Орбита)' }
    ]
  }
};
