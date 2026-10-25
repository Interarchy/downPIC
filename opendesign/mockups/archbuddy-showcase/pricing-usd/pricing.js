const offers = {
  free: [
    "免费版",
    "$0 · 每周100次下载简析、10次深度反推。Library仅本地，无云同步。生图另购BuddyCoin。",
  ],
  light: [
    "轻享版 · $5.99 / 月",
    "每月360 BuddyCoin；1,000次简析、100次反推；Library仅本地，无云同步。可生成40张Nano Banana 2.1 · 4K。",
  ],
  standard: [
    "标准版 · $9.99 / 月",
    "每月720 BuddyCoin；2,000次简析、200次反推；Library仅本地，无云同步。可生成80张Nano Banana 2.1 · 4K；拟提供2任务并行、单次4张。",
  ],
  pro: [
    "专业版 · $19.99 / 月",
    "每月1,620 BuddyCoin；5,000次简析、400次反推。可生成180张Nano Banana 2.1 · 4K；拟提供Library云同步（容量待定）、4任务并行、单次8张。",
  ],
  packLight: [
    "轻享加油包 · $7",
    "360 BuddyCoin，长期有效。与轻享订阅数量相同，价格高约16.9%；不含订阅工具额度。",
  ],
  packStandard: [
    "标准加油包 · $11",
    "720 BuddyCoin，长期有效。与标准订阅数量相同，价格高约10.1%；不含订阅工具额度。",
  ],
  packPro: [
    "专业加油包 · $22",
    "1,620 BuddyCoin，长期有效。与专业订阅数量相同，价格高约10.1%；不含订阅工具额度。",
  ],
  analysis: ["简析扩展包 · $1.99", "100次下载及简析，需有效订阅，当期到期。"],
  reverse: ["反推扩展包 · $3.99", "50次深度反推，需有效订阅，当期到期。"],
};
const models = [
  ["GPT Image 2", [6, 10, 16]],
  ["GPT Image 2.5 Flare", [6, 10, 16]],
  ["GPT Image 2.5 Sunburst", [6, 10, 16]],
  ["Nano Banana Pro", [18, 18, 24]],
  ["Nano Banana 2", [8, 12, 18]],
  ["Nano Banana 2.1", [4, 6, 9]],
  ["Seedream 5.0 Pro", [7, 14, null]],
  ["Seedream 5.0 Flash", [3.24, 3.24, null]],
];

const byId = (id) => document.getElementById(id);
const minimumDollarCost = (coins, price, amount) =>
  `$${((coins * price) / amount).toFixed(4)}`;
models.forEach(([model, points]) => {
  const variants = points
    .map((cost, i) => [["1K", "2K", "4K"][i], cost])
    .filter(([, cost]) => cost !== null);
  if (model === "Seedream 5.0 Flash") variants.splice(1, 0, ["1.5K", 3.24]);
  variants.forEach(([resolution, cost], index) => {
    const row = document.createElement("tr");
    if (index === 0) row.className = "model-start";
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = model;
    row.append(name);
    [
      resolution,
      cost,
      minimumDollarCost(cost, 19.99, 1620),
      minimumDollarCost(cost, 22, 1620),
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    });
    byId("model-rows").append(row);
  });
});
const dialog = byId("offer-dialog");
document.querySelectorAll("[data-offer]").forEach((button) => {
  button.addEventListener("click", () => {
    const offer = offers[button.dataset.offer];
    byId("offer-title").textContent = offer[0];
    byId("offer-description").textContent = offer[1];
    dialog.showModal();
  });
});
byId("offer-close").addEventListener("click", () => dialog.close());
document.querySelectorAll('.nav a[href^="#"]').forEach((link) => {
  link.addEventListener("click", () => {
    const target = link.getAttribute("href");
    if (!target || target === "#") return;
    const section = document.querySelector(target);
    const detail = section?.querySelector(".more-details");
    if (detail) detail.open = true;
  });
});
