// Static game data: items, crops, recipes, buildings and ground residents.

export const ITEMS = {
  wheat: { name: '小麥', emoji: '🌾', value: 3 },
  carrot: { name: '胡蘿蔔', emoji: '🥕', value: 4 },
  tomato: { name: '番茄', emoji: '🍅', value: 6 },
  lavender: { name: '薰衣草', emoji: '💜', value: 5 },
  strawberry: { name: '草莓', emoji: '🍓', value: 7 },
  bread: { name: '麵包', emoji: '🍞', value: 12 },
  soup: { name: '蔬菜湯', emoji: '🥣', value: 18 },
  jam: { name: '草莓果醬', emoji: '🍯', value: 26 },
  tea: { name: '薰衣草茶', emoji: '🍵', value: 16 },
  bouquet: { name: '花束', emoji: '💐', value: 24 },
};

/**
 * Crops. `grow` is the real-time seconds needed to ripen at 1x growth speed.
 * `regrow` crops stay in the ground after harvest and ripen again faster.
 * The crop id doubles as the id of the item it yields.
 */
export const CROPS = {
  wheat: { seedCost: 2, grow: 45, yield: [2, 3], regrow: false },
  carrot: { seedCost: 3, grow: 60, yield: [1, 2], regrow: false },
  tomato: { seedCost: 5, grow: 90, yield: [2, 3], regrow: true },
  lavender: { seedCost: 4, grow: 75, yield: [2, 3], regrow: true },
  strawberry: { seedCost: 6, grow: 100, yield: [2, 4], regrow: true },
};

/** Fraction of `grow` a regrowing crop is set back to after harvest. */
export const REGROW_PROGRESS = 0.45;

export const RECIPES = {
  bread: { in: { wheat: 3 }, out: { bread: 1 } },
  soup: { in: { carrot: 2, tomato: 1 }, out: { soup: 1 } },
  jam: { in: { strawberry: 3 }, out: { jam: 1 } },
  tea: { in: { lavender: 2 }, out: { tea: 1 } },
  bouquet: { in: { lavender: 3, wheat: 1 }, out: { bouquet: 1 } },
};

export const BUILDINGS = {
  workbench: { name: '工作台', emoji: '🧰', cost: 30 },
  lantern: { name: '燈籠', emoji: '🏮', cost: 8 },
  flowerbed: { name: '花圃', emoji: '🌷', cost: 10 },
  tree: { name: '小樹', emoji: '🌳', cost: 12 },
  path: { name: '石板路', emoji: '🪨', cost: 1 },
};

export const RESIDENTS = [
  { name: '阿棠', emoji: '🧑‍🌾' },
  { name: '小葵', emoji: '👧' },
  { name: '老橡', emoji: '👴' },
  { name: '米露', emoji: '🐱' },
  { name: '蘑菇婆婆', emoji: '👵' },
  { name: '阿澈', emoji: '🧒' },
  { name: '波波', emoji: '🐻' },
  { name: '白鷺先生', emoji: '🦢' },
];

export const TOOLS = {
  farm: { name: '耕作', emoji: '🌱', key: '1' },
  build: { name: '建造', emoji: '🔨', key: '2' },
  remove: { name: '移除', emoji: '🧹', key: '3' },
};
