const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const inventoryList = document.getElementById("inventory-list");
const moneyValue = document.getElementById("money-value");
const toolValue = document.getElementById("tool-value");
const depthValue = document.getElementById("depth-value");
const sellButton = document.getElementById("sell-button");

const tileSize = 32;
const worldWidth = 60;
const worldHeight = 90;
const autoMineIntervalMs = 5000;
const gravityIntervalMs = 140;
const camera = { x: 0, y: 0 };
const keys = new Set();

const resourceTypes = {
  dirt: { label: "Dirt", color: "#76513a", value: 1, hardness: 1 },
  stone: { label: "Stone", color: "#86939a", value: 2, hardness: 2 },
  coal: { label: "Coal", color: "#373737", value: 5, hardness: 2 },
  copper: { label: "Copper Ore", color: "#c07b4f", value: 8, hardness: 3 },
  iron: { label: "Iron Ore", color: "#c2b9a7", value: 14, hardness: 4 }
};

const toolTiers = [
  { name: "Rusty Pickaxe", power: 2, price: 0 },
  { name: "Copper Pickaxe", power: 3, price: 80 },
  { name: "Iron Pickaxe", power: 5, price: 220 }
];

const state = {
  money: 0,
  toolTier: 0,
  inventory: {
    dirt: 0,
    stone: 0,
    coal: 0,
    copper: 0,
    iron: 0
  },
  player: {
    x: Math.floor(worldWidth / 2),
    y: 5
  },
  autoMineStartedAt: null,
  lastFallAt: 0,
  message: "Mine the earth below you."
};

const world = generateWorld();

function generateWorld() {
  const grid = [];

  for (let y = 0; y < worldHeight; y += 1) {
    const row = [];
    for (let x = 0; x < worldWidth; x += 1) {
      if (y < 5) {
        row.push({ type: "sky", solid: false });
        continue;
      }

      if (y === 5) {
        row.push({ type: "grass", solid: true });
        continue;
      }

      row.push(makeUndergroundTile(y));
    }
    grid.push(row);
  }

  const shaftX = state.player.x;
  for (let y = 0; y <= state.player.y; y += 1) {
    grid[y][shaftX] = { type: "air", solid: false };
  }
  grid[state.player.y][state.player.x] = { type: "air", solid: false };

  return grid;
}

function makeUndergroundTile(depth) {
  const roll = Math.random();

  if (depth > 50 && roll > 0.9) {
    return { type: "iron", solid: true };
  }
  if (depth > 30 && roll > 0.84) {
    return { type: "copper", solid: true };
  }
  if (depth > 18 && roll > 0.74) {
    return { type: "coal", solid: true };
  }
  if (depth > 10 && roll > 0.48) {
    return { type: "stone", solid: true };
  }
  return { type: "dirt", solid: true };
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.floor(bounds.width);
  canvas.height = Math.floor(bounds.height);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTile(x, y) {
  if (x < 0 || y < 0 || x >= worldWidth || y >= worldHeight) {
    return { type: "bedrock", solid: true };
  }
  return world[y][x];
}

function setTile(x, y, tile) {
  if (x < 0 || y < 0 || x >= worldWidth || y >= worldHeight) {
    return;
  }
  world[y][x] = tile;
}

function tryMove(dx, dy) {
  const nextX = state.player.x + dx;
  const nextY = state.player.y + dy;
  const nextTile = getTile(nextX, nextY);

  if (nextTile.solid) {
    return;
  }

  state.player.x = clamp(nextX, 0, worldWidth - 1);
  state.player.y = clamp(nextY, 0, worldHeight - 1);
}

function mineBelow() {
  const targetX = state.player.x;
  const targetY = state.player.y + 1;
  const targetTile = getTile(targetX, targetY);

  if (!targetTile.solid || !resourceTypes[targetTile.type]) {
    state.message = "There is nothing useful to mine there.";
    return;
  }

  const tool = toolTiers[state.toolTier];
  const resource = resourceTypes[targetTile.type];

  if (tool.power < resource.hardness) {
    state.message = `${resource.label} needs a better tool.`;
    return;
  }

  state.inventory[targetTile.type] += 1;
  setTile(targetX, targetY, { type: "air", solid: false });
  state.message = `Mined ${resource.label}.`;

  maybeUpgradeTool();
  renderHud();
}

function maybeUpgradeTool() {
  const nextTool = toolTiers[state.toolTier + 1];
  if (!nextTool || state.money < nextTool.price) {
    return;
  }

  state.money -= nextTool.price;
  state.toolTier += 1;
  state.message = `Bought ${nextTool.name}.`;
}

function sellInventory() {
  let saleValue = 0;

  Object.entries(state.inventory).forEach(([type, amount]) => {
    if (amount < 1) {
      return;
    }
    saleValue += amount * resourceTypes[type].value;
    state.inventory[type] = 0;
  });

  if (saleValue === 0) {
    state.message = "Inventory is empty.";
    renderHud();
    return;
  }

  state.money += saleValue;
  state.message = `Sold inventory for $${saleValue}.`;
  maybeUpgradeTool();
  renderHud();
}

function renderTile(tile, screenX, screenY) {
  if (tile.type === "air" || tile.type === "sky") {
    return;
  }

  if (tile.type === "grass") {
    ctx.fillStyle = "#8caf59";
    ctx.fillRect(screenX, screenY, tileSize, tileSize);
    ctx.fillStyle = "#6d8b4d";
    ctx.fillRect(screenX, screenY, tileSize, 10);
    ctx.fillStyle = "#76513a";
    ctx.fillRect(screenX, screenY + 10, tileSize, tileSize - 10);
    return;
  }

  const fill = resourceTypes[tile.type]?.color ?? "#111111";
  ctx.fillStyle = fill;
  ctx.fillRect(screenX, screenY, tileSize, tileSize);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(screenX + 3, screenY + 3, tileSize - 6, 4);
}

function renderWorld() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  camera.x = state.player.x * tileSize - canvas.width / 2 + tileSize / 2;
  camera.y = state.player.y * tileSize - canvas.height / 2 + tileSize / 2;

  const maxCameraX = worldWidth * tileSize - canvas.width;
  const maxCameraY = worldHeight * tileSize - canvas.height;
  camera.x = clamp(camera.x, 0, Math.max(0, maxCameraX));
  camera.y = clamp(camera.y, 0, Math.max(0, maxCameraY));

  const startX = Math.floor(camera.x / tileSize);
  const startY = Math.floor(camera.y / tileSize);
  const visibleCols = Math.ceil(canvas.width / tileSize) + 2;
  const visibleRows = Math.ceil(canvas.height / tileSize) + 2;

  for (let y = startY; y < startY + visibleRows; y += 1) {
    for (let x = startX; x < startX + visibleCols; x += 1) {
      const tile = getTile(x, y);
      const screenX = x * tileSize - camera.x;
      const screenY = y * tileSize - camera.y;
      renderTile(tile, screenX, screenY);
    }
  }

  const playerX = state.player.x * tileSize - camera.x;
  const playerY = state.player.y * tileSize - camera.y;

  ctx.fillStyle = "#f7d485";
  ctx.fillRect(playerX + 8, playerY + 4, 16, 24);
  ctx.fillStyle = "#6f3b20";
  ctx.fillRect(playerX + 10, playerY + 0, 12, 8);

  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(18, canvas.height - 62, 330, 40);
  ctx.fillStyle = "#f5eddc";
  ctx.font = "16px Georgia";
  ctx.fillText(state.message, 32, canvas.height - 36);
}

function renderHud() {
  moneyValue.textContent = `$${state.money}`;
  toolValue.textContent = toolTiers[state.toolTier].name;
  depthValue.textContent = `${Math.max(0, state.player.y - 5)}m`;

  inventoryList.innerHTML = "";
  Object.entries(resourceTypes).forEach(([type, resource]) => {
    const item = document.createElement("li");
    const amount = state.inventory[type];
    item.innerHTML = `
      <span class="inventory-icon" style="background:${resource.color}"></span>
      <span class="inventory-name">${resource.label}</span>
      <strong class="inventory-count">${amount}</strong>
    `;
    inventoryList.appendChild(item);
  });
}

function tickMovement() {
  if (keys.has("ArrowLeft") || keys.has("a")) {
    tryMove(-1, 0);
  }
  if (keys.has("ArrowRight") || keys.has("d")) {
    tryMove(1, 0);
  }
  if (keys.has("ArrowUp") || keys.has("w")) {
    tryMove(0, -1);
  }
  if (keys.has("s")) {
    tryMove(0, 1);
  }
}

function tickAutoMine(now) {
  if (!keys.has("ArrowDown")) {
    state.autoMineStartedAt = null;
    return;
  }

  if (state.autoMineStartedAt === null) {
    state.autoMineStartedAt = now;
    state.message = "Holding down to mine...";
    return;
  }

  if (now - state.autoMineStartedAt < autoMineIntervalMs) {
    return;
  }

  mineBelow();
  state.autoMineStartedAt = now;
}

function tickGravity(now) {
  if (now - state.lastFallAt < gravityIntervalMs) {
    return;
  }

  if (!getTile(state.player.x, state.player.y + 1).solid) {
    state.player.y = clamp(state.player.y + 1, 0, worldHeight - 1);
  }

  state.lastFallAt = now;
}

function loop() {
  const now = performance.now();
  tickMovement();
  tickAutoMine(now);
  tickGravity(now);
  renderWorld();
  renderHud();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key);

  if (event.key === " ") {
    event.preventDefault();
    mineBelow();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);

  if (event.key === "ArrowDown") {
    state.autoMineStartedAt = null;
  }
});

window.addEventListener("resize", resizeCanvas);
sellButton?.addEventListener("click", sellInventory);

resizeCanvas();
renderHud();
loop();
