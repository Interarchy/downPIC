const offers = {
  free: [
    "免费版",
    "$0 · 每周100次下载简析、10次深度反推。Library仅本地，无云同步。生图另购BuddyCoin。",
  ],
  light: [
    "轻享版 · $5.99 / 30 天",
    "购买后到账360 BuddyCoin；1,000次简析、100次反推；Library仅本地，无云同步。可生成40张Nano Banana 2.1 · 4K。",
  ],
  standard: [
    "标准版 · $9.99 / 30 天",
    "购买后到账720 BuddyCoin；2,000次简析、200次反推；Library仅本地，无云同步。可生成80张Nano Banana 2.1 · 4K；拟提供2任务并行、单次4张。",
  ],
  pro: [
    "专业版 · $19.99 / 30 天",
    "购买后到账1,620 BuddyCoin；5,000次简析、400次反推。可生成180张Nano Banana 2.1 · 4K；拟提供Library云同步（容量待定）、4任务并行、单次8张。",
  ],
  packLight: [
    "轻享加油包 · $7",
    "360 BuddyCoin，长期有效。与轻享套餐数量相同，价格高约16.9%；不含套餐工具额度。",
  ],
  packStandard: [
    "标准加油包 · $11",
    "720 BuddyCoin，长期有效。与标准套餐数量相同，价格高约10.1%；不含套餐工具额度。",
  ],
  packPro: [
    "专业加油包 · $22",
    "1,620 BuddyCoin，长期有效。与专业套餐数量相同，价格高约10.1%；不含套餐工具额度。",
  ],
  promptLight: ["提示词轻量包 · $1.99", "200次下载及简析＋50次深度反推。无需套餐，购买后永久有效。两类额度分别计次，普通下载不扣次数。"],
  promptStandard: ["提示词标准包 · $3.99", "500次下载及简析＋150次深度反推。无需套餐，购买后永久有效。两类额度分别计次，普通下载不扣次数。"],
  promptPro: ["提示词专业包 · $7.99", "1,200次下载及简析＋400次深度反推。无需套餐，购买后永久有效。两类额度分别计次，普通下载不扣次数。"],
};
if (document.documentElement.lang === "en") {
  Object.assign(offers, {
    free: ["Free", "$0 · 100 downloads and analyses, plus 10 deep prompt extractions per week. Library stays local. Buy BuddyCoin separately for generation."],
    light: ["Light · $5.99 / 30 days", "360 BuddyCoin, 1,000 analyses and 100 extractions per purchase. Local Library. Up to 40 Nano Banana 2.1 images at 4K."],
    standard: ["Standard · $9.99 / 30 days", "720 BuddyCoin, 2,000 analyses and 200 extractions per purchase. Local Library. Up to 80 Nano Banana 2.1 images at 4K; 2 concurrent jobs and up to 4 images per run are proposed."],
    pro: ["Pro · $19.99 / 30 days", "1,620 BuddyCoin, 5,000 analyses and 400 extractions per purchase. Up to 180 Nano Banana 2.1 images at 4K. Cloud sync, 4 concurrent jobs and up to 8 images per run are proposed."],
    packLight: ["Light top-up · $7", "360 BuddyCoin with no expiry. About 16.9% more than the matching plan; does not include plan allowances."],
    packStandard: ["Standard top-up · $11", "720 BuddyCoin with no expiry. About 10.1% more than the matching plan; does not include plan allowances."],
    packPro: ["Pro top-up · $22", "1,620 BuddyCoin with no expiry. About 10.1% more than the matching plan; does not include plan allowances."],
    promptLight: ["Small prompt pack · $1.99", "200 downloads and analyses plus 50 deep prompt extractions. No plan required; purchased allowances never expire and are counted separately. Ordinary downloads are free."],
    promptStandard: ["Standard prompt pack · $3.99", "500 downloads and analyses plus 150 deep prompt extractions. No plan required; purchased allowances never expire and are counted separately. Ordinary downloads are free."],
    promptPro: ["Pro prompt pack · $7.99", "1,200 downloads and analyses plus 400 deep prompt extractions. No plan required; purchased allowances never expire and are counted separately. Ordinary downloads are free."],
  });
}
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

const languageLink = document.querySelector("[data-pricing-language]");
if (languageLink && /^#(?:plans|packs|credits|features|faq)$/.test(location.hash)) {
  languageLink.href = languageLink.href.replace(/#.*$/, location.hash);
}
