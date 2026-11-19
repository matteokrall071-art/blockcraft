// =======================================
// BLOCKCRAFT - ISLAND SURVIVAL
// =======================================

const $ = id => document.getElementById(id);

const VERIFY_CODE = "656565";

// Hier später die direkte URL deiner Menü-Musik eintragen:
const MENU_MUSIC_URL = "";

let scene, camera, renderer, clock;
let blocks = [];
let blockMap = new Map();
let chickens = [];
let enemies = [];
let playerAvatar;

let worldReady = false;
let paused = false;
let inventoryOpen = false;
let gameMode = "survival";

let yaw = 0;
let pitch = 0;
let cameraMode = 0;

let worldMinute = 8 * 60;
let survivedDays = 1;
let lastNight = -1;
let nightSpawned = false;
let lastDamage = 0;
let selectedSlot = 0;
let messageTimer;

const DAY_LENGTH = 1440;
const WATER_LEVEL = -1.5;
const ISLAND_RADIUS = 18;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;

const player = {
  x: 0,
  y: 4,
  z: 0,
  vy: 0,
  health: 5,
  onGround: true,
  walkTime: 0
};

const keys = {};

const inventory = {
  Grass: 20,
  Dirt: 20,
  Stone: 10,
  Sand: 10,
  Wood: 10,
  Leaves: 10,
  Mango: 0,
  Torch: 0
};

const hotbarItems = [
  "Grass", "Dirt", "Stone", "Wood",
  "Sand", "Mango", "Torch"
];

const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

let materials = {};

// =======================================
// MENÜ UND WELT-CODES
// =======================================

function showMenuMessage(text) {
  $("menuMessage").textContent = text;
}

function startNewWorld() {
  const code = $("saveCodeInput").value.trim();

  if (code.length < 4) {
    showMenuMessage("Dein Welt-Code muss mindestens 4 Zeichen haben.");
    return;
  }

  localStorage.setItem("blockcraft_current_code", code);
  localStorage.setItem("blockcraft_save_" + code, "");

  startGame(code);
}

function loadWorld() {
  const code = $("codeInput").value.trim();

  if (!code) {
    showMenuMessage("Bitte Welt-Code eingeben.");
    return;
  }

  const save = localStorage.getItem("blockcraft_save_" + code);

  if (!save) {
    showMenuMessage("Kein Spielstand mit diesem Code gefunden.");
    return;
  }

  startGame(code, JSON.parse(save));
}

$("newWorldBtn").addEventListener("click", startNewWorld);
$("loadWorldBtn").addEventListener("click", loadWorld);

// =======================================
// MUSIK
// =======================================

const music = $("menuMusic");

if (MENU_MUSIC_URL) {
  music.src = MENU_MUSIC_URL;
  music.volume = 0.4;
}

function playMenuMusic() {
  if (music.src) music.play().catch(() => {});
}

function stopMenuMusic() {
  music.pause();
  music.currentTime = 0;
}

// =======================================
// HILFSFUNKTIONEN
// =======================================

function waitFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function loading(percent, text) {
  $("loadingFill").style.width = percent + "%";
  $("loadingPercent").textContent = Math.floor(percent) + "%";
  $("loadingText").textContent = text;
}

function showMessage(text) {
  $("gameMessage").textContent = text;
  $("gameMessage").style.display = "block";

  clearTimeout(messageTimer);

  messageTimer = setTimeout(() => {
    $("gameMessage").style.display = "none";
  }, 2200);
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function key(x, y, z) {
  return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
}

// =======================================
// SPIELSTART
// =======================================

async function startGame(code, save = null) {
  if (worldReady) return;

  gameMode = "survival";
  stopMenuMusic();

  $("menu").style.display = "none";
  $("game").style.display = "block";
  $("loadingScreen").style.display = "flex";

  loading(5, "Grafik wird geladen...");
  await waitFrame();

  if (!window.THREE) {
    showMenuMessage("Three.js konnte nicht geladen werden.");
    location.reload();
    return;
  }

  createWorld();

  loading(15, "Unterwasserwelt...");
  await createUnderwater();

  loading(45, "Tropische Insel...");
  await createIsland();

  loading(70, "Palmen und Mango-Bäume...");
  createTrees();

  loading(80, "Hühner...");
  createChickens();

  loading(88, "Fackel...");
  createStartingTorch();

  loading(94, "Spieler...");
  createPlayer();

  if (save) loadSaveData(save);

  updateHotbar();
  updateInventory();
  updateHealth();
  updateDayDisplay();

  loading(100, "Insel bereit!");
  await new Promise(resolve => setTimeout(resolve, 450));

  $("loadingScreen").style.display = "none";

  worldReady = true;
  clock.start();

  updateCamera();
  animate();
  requestPointerLock();
}

// =======================================
// GRAFIK UND SHADER-LOOK
// =======================================

function texture(base, detail) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);

  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = detail;
    ctx.globalAlpha = Math.random() * 0.3;
    ctx.fillRect(
      Math.random() * 64,
      Math.random() * 64,
      2 + Math.random() * 4,
      2 + Math.random() * 4
    );
  }

  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;

  return tex;
}

function createWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x77c9e8);
  scene.fog = new THREE.Fog(0x77c9e8, 35, 100);

  camera = new THREE.PerspectiveCamera(
    75,
    innerWidth / innerHeight,
    0.1,
    160
  );

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
  });

  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  $("game").prepend(renderer.domElement);

  clock = new THREE.Clock();

  blocks = [];
  blockMap = new Map();
  chickens = [];
  enemies = [];

  materials = {
    Grass: new THREE.MeshStandardMaterial({
      map: texture("#6eaa45", "#b2d76a"),
      roughness: 1
    }),
    Dirt: new THREE.MeshStandardMaterial({
      map: texture("#80532e", "#bd8953"),
      roughness: 1
    }),
    Sand: new THREE.MeshStandardMaterial({
      map: texture("#e5d08b", "#fff1b7"),
      roughness: 1
    }),
    Stone: new THREE.MeshStandardMaterial({
      map: texture("#858985", "#c2c6c0"),
      roughness: 1
    }),
    RedStone: new THREE.MeshStandardMaterial({
      color: 0x9c3028
    }),
    Wood: new THREE.MeshStandardMaterial({
      map: texture("#81502b", "#c18a4b"),
      roughness: 1
    }),
    Leaves: new THREE.MeshStandardMaterial({
      map: texture("#328348", "#81bd51"),
      roughness: 1
    }),
    OakLeaves: new THREE.MeshStandardMaterial({
      map: texture("#397a36", "#8fb34c"),
      roughness: 1
    }),
    Torch: new THREE.MeshStandardMaterial({
      color: 0xffa52b,
      emissive: 0xff7415,
      emissiveIntensity: 1.8
    })
  };

  const ambient = new THREE.HemisphereLight(
    0xd7f4ff,
    0x67513a,
    1.2
  );
  scene.add(ambient);
  scene.userData.ambient = ambient;

  const sun = new THREE.DirectionalLight(0xfff1cf, 1.5);
  sun.position.set(30, 45, 20);
  scene.add(sun);
  scene.userData.sun = sun;

  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(3, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe7a0 })
  );
  scene.add(sunBall);
  scene.userData.sunBall = sunBall;

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(2, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xdde8ff })
  );
  scene.add(moon);
  scene.userData.moon = moon;

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshStandardMaterial({
      color: 0x168ac1,
      roughness: 0.2,
      metalness: 0.05,
      transparent: true,
      opacity: 0.72
    })
  );

  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  scene.add(water);
  scene.userData.water = water;
}

// =======================================
// BLOCKS
// =======================================

function addBlock(x, y, z, type) {
  x = Math.round(x);
  y = Math.round(y);
  z = Math.round(z);

  const id = key(x, y, z);
  if (blockMap.has(id)) return null;

  const mesh = new THREE.Mesh(
    blockGeometry,
    materials[type] || materials.Grass
  );

  mesh.position.set(x, y, z);
  mesh.userData.type = type;
  mesh.userData.unbreakable = type === "RedStone";

  scene.add(mesh);
  blocks.push(mesh);
  blockMap.set(id, mesh);

  return mesh;
}

function isSolid(x, y, z) {
  return blockMap.has(key(x, y, z));
}

// =======================================
// INSEL UND UNTERWASSER
// =======================================

function islandDistance(x, z) {
  return Math.hypot(x, z);
}

function islandHeight(x, z) {
  return Math.floor(
    1 +
    Math.sin(x * .23) * .3 +
    Math.cos(z * .2) * .3 -
    Math.max(0, islandDistance(x, z) - 10) * .1
  );
}

function groundSurface(x, z) {
  const bx = Math.round(x);
  const bz = Math.round(z);

  if (islandDistance(bx, bz) > ISLAND_RADIUS) {
    return WATER_LEVEL - 1;
  }

  return islandHeight(bx, bz) + 0.5;
}

async function createUnderwater() {
  for (let x = -29; x <= 29; x++) {
    for (let z = -29; z <= 29; z++) {
      if (Math.hypot(x, z) <= ISLAND_RADIUS + 1) continue;
      if (Math.hypot(x, z) > 29) continue;

      addBlock(x, -3, z, "Sand");
      addBlock(x, -4, z, "Stone");
      addBlock(x, -5, z, "Stone");
      addBlock(x, -6, z, "RedStone");
    }

    if (x % 5 === 0) await waitFrame();
  }

  for (let x = -ISLAND_RADIUS; x <= ISLAND_RADIUS; x++) {
    for (let z = -ISLAND_RADIUS; z <= ISLAND_RADIUS; z++) {
      if (islandDistance(x, z) <= ISLAND_RADIUS) {
        addBlock(x, -5, z, "Stone");
        addBlock(x, -6, z, "RedStone");
      }
    }
  }
}

async function createIsland() {
  for (let x = -ISLAND_RADIUS; x <= ISLAND_RADIUS; x++) {
    for (let z = -ISLAND_RADIUS; z <= ISLAND_RADIUS; z++) {
      if (islandDistance(x, z) > ISLAND_RADIUS) continue;

      const h = islandHeight(x, z);
      const beach = islandDistance(x, z) > ISLAND_RADIUS - 4;

      addBlock(x, h, z, beach ? "Sand" : "Grass");
      addBlock(x, h - 1, z, "Dirt");
      addBlock(x, h - 2, z, "Dirt");
      addBlock(x, h - 3, z, "Stone");
    }

    if (x % 3 === 0) await waitFrame();
  }
}

// =======================================
// BÄUME - KEINE SCHWEBENDEN STÄMME
// =======================================

function createTree(x, z, kind = "oak") {
  const surface = groundSurface(x, z);
  const groundBlockY = Math.floor(surface - 0.5);

  const trunkType = "Wood";

  // Stamm beginnt direkt auf dem Bodenblock.
  for (let y = 1; y <= 4; y++) {
    addBlock(x, groundBlockY + y, z, trunkType);
  }

  const leafType = kind === "mango" ? "Leaves" : "OakLeaves";

  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 2; dy <= 5; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 3) < 5) {
          addBlock(
            x + dx,
            groundBlockY + dy,
            z + dz,
            leafType
          );
        }
      }
    }
  }

  if (kind === "mango") {
    const fruitMat = new THREE.MeshStandardMaterial({
      color: 0xffa21b
    });

    for (let i = 0; i < 4; i++) {
      const fruit = new THREE.Mesh(
        new THREE.SphereGeometry(.22, 8, 8),
        fruitMat
      );

      fruit.position.set(
        x + random(-1, 1),
        groundBlockY + random(2, 4),
        z + random(-1, 1)
      );

      scene.add(fruit);
    }
  }
}

function createPalm(x, z) {
  const baseY = Math.floor(groundSurface(x, z) - 0.5);
  const group = new THREE.Group();

  for (let i = 0; i < 5; i++) {
    const trunk = new THREE.Mesh(
      blockGeometry,
      materials.Wood
    );

    trunk.position.set(i * .07, i + .5, 0);
    group.add(trunk);
  }

  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI / 3.5;

    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(.7, .15, 3),
      materials.Leaves
    );

    leaf.position.set(
      .3 + Math.cos(angle) * 1.1,
      4.5,
      Math.sin(angle) * 1.1
    );

    leaf.rotation.y = -angle;
    leaf.rotation.z = -.2;
    group.add(leaf);
  }

  group.position.set(x, baseY + 1, z);
  scene.add(group);

  // Palmenstämme werden als abbaubare Blöcke angelegt.
  for (let y = 1; y <= 5; y++) {
    addBlock(x, baseY + y, z, "Wood");
  }
}

function createTrees() {
  [
    [-13, -7], [-12, 8], [12, -9],
    [14, 5], [-7, 14], [7, 13]
  ].forEach(([x, z]) => createPalm(x, z));

  [
    [-5, -5], [6, -5], [-7, 5], [7, 5]
  ].forEach(([x, z]) => createTree(x, z));

  [
    [-3, 8], [4, 8], [1, -8]
  ].forEach(([x, z]) => createTree(x, z, "mango"));
}

// =======================================
// FACKEL
// =======================================

function createTorch(x, y, z) {
  const group = new THREE.Group();

  const stick = new THREE.Mesh(
    new THREE.BoxGeometry(.13, .65, .13),
    materials.Wood
  );
  stick.position.y = .3;
  group.add(stick);

  const flame = new THREE.Mesh(
    new THREE.BoxGeometry(.2, .3, .2),
    materials.Torch
  );
  flame.position.y = .78;
  group.add(flame);

  const light = new THREE.PointLight(0xffa044, 2.3, 12);
  light.position.y = .8;
  group.add(light);

  group.position.set(x, y, z);
  scene.add(group);

  group.userData.type = "Torch";
  group.userData.flame = flame;

  return group;
}

let torches = [];

function createStartingTorch() {
  const x = 2;
  const z = 2;
  const y = groundSurface(x, z) + .5;

  const torch = createTorch(x, y, z);
  torches.push(torch);
}

function updateTorches(time) {
  for (const torch of torches) {
    if (torch.userData.flame) {
      torch.userData.flame.scale.y =
        .9 + Math.sin(time * 9) * .12;
    }
  }
}

// =======================================
// SPIELER-AVATAR UND ANIMATION
// =======================================

let avatarParts = {};

function createPlayer() {
  playerAvatar = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({ color: 0xd5a176 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x2484bb });
  const pants = new THREE.MeshStandardMaterial({ color: 0x344184 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x49301f });

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(.62, .7, .34),
    shirt
  );
  torso.position.y = 1.05;
  playerAvatar.add(torso);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(.46, .46, .46),
    skin
  );
  head.position.y = 1.65;
  playerAvatar.add(head);

  const hairTop = new THREE.Mesh(
    new THREE.BoxGeometry(.48, .14, .48),
    hair
  );
  hairTop.position.y = 1.94;
  playerAvatar.add(hairTop);

  const arms = [];
  const legs = [];

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(.2, .65, .25),
      shirt
    );

    arm.position.set(side * .42, 1.05, 0);
    playerAvatar.add(arm);
    arms.push(arm);

    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(.25, .68, .28),
      pants
    );

    leg.position.set(side * .16, .36, 0);
    playerAvatar.add(leg);
    legs.push(leg);
  }

  avatarParts = { arms, legs };

  playerAvatar.position.set(
    player.x,
    player.y - PLAYER_HEIGHT / 2,
    player.z
  );

  scene.add(playerAvatar);
}

function animatePlayer(delta) {
  const moving =
    keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;

  if (moving) {
    player.walkTime += delta * 9;
  }

  const swing = moving ? Math.sin(player.walkTime) * .55 : 0;

  avatarParts.arms?.forEach((arm, i) => {
    arm.rotation.x = i === 0 ? swing : -swing;
  });

  avatarParts.legs?.forEach((leg, i) => {
    leg.rotation.x = i === 0 ? -swing : swing;
  });

  if (playerAvatar) {
    playerAvatar.position.set(
      player.x,
      player.y - PLAYER_HEIGHT / 2,
      player.z
    );

    playerAvatar.rotation.y = yaw;
    playerAvatar.visible = cameraMode !== 0;
  }
}

// =======================================
// KLEINE HÜHNER MIT LAUFANIMATION
// =======================================

function createChicken(x, z) {
  const group = new THREE.Group();

  const white = new THREE.MeshStandardMaterial({ color: 0xf0eee4 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffc62b });
  const red = new THREE.MeshStandardMaterial({ color: 0xd83d35 });
  const black = new THREE.MeshStandardMaterial({ color: 0x222222 });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(.42, .34, .5),
    white
  );
  body.position.y = .35;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(.25, .25, .25),
    white
  );
  head.position.set(0, .62, -.18);
  group.add(head);

  const beak = new THREE.Mesh(
    new THREE.BoxGeometry(.12, .08, .13),
    yellow
  );
  beak.position.set(0, .59, -.35);
  group.add(beak);

  const comb = new THREE.Mesh(
    new THREE.BoxGeometry(.1, .1, .1),
    red
  );
  comb.position.set(0, .79, -.18);
  group.add(comb);

  const legs = [];

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(.04, .04, .03),
      black
    );
    eye.position.set(side * .09, .66, -.31);
    group.add(eye);

    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(.07, .2, .07),
      yellow
    );
    leg.position.set(side * .12, .12, 0);
    group.add(leg);
    legs.push(leg);
  }

  group.position.set(x, groundSurface(x, z) + .5, z);
  scene.add(group);

  chickens.push({
    group,
    legs,
    walkTime: random(0, 5),
    direction: random(0, Math.PI * 2),
    changeTime: random(2, 5)
  });
}

function createChickens() {
  // Nur vier kleine Hühner.
  [
    [-4, 2], [3, 3], [5, -2], [-6, -2]
  ].forEach(([x, z]) => createChicken(x, z));
}

function updateChickens(delta) {
  for (const chicken of chickens) {
    chicken.changeTime -= delta;

    if (chicken.changeTime <= 0) {
      chicken.changeTime = random(2, 5);
      chicken.direction = random(0, Math.PI * 2);
    }

    const speed = .45;

    chicken.group.position.x +=
      Math.sin(chicken.direction) * speed * delta;

    chicken.group.position.z +=
      Math.cos(chicken.direction) * speed * delta;

    chicken.group.rotation.y = chicken.direction;

    chicken.walkTime += delta * 7;

    const swing = Math.sin(chicken.walkTime) * .45;

    chicken.legs[0].rotation.x = swing;
    chicken.legs[1].rotation.x = -swing;

    const x = chicken.group.position.x;
    const z = chicken.group.position.z;

    if (islandDistance(x, z) > ISLAND_RADIUS - 1) {
      chicken.direction += Math.PI;
    }

    chicken.group.position.y +=
      (groundSurface(x, z) + .5 - chicken.group.position.y) *
      Math.min(1, delta * 6);
  }
}

// =======================================
// FANTASY-SCHATTENWÄCHTER
// =======================================

function createEnemy(x, z, strong = false) {
  const group = new THREE.Group();

  const dark = new THREE.MeshStandardMaterial({
    color: strong ? 0x402d43 : 0x292b35,
    roughness: 1
  });

  const bone = new THREE.MeshStandardMaterial({
    color: 0xe4ddc9
  });

  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xff392b,
    emissive: 0xff1600,
    emissiveIntensity: 1.8
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(.65, 1, .38),
    dark
  );
  body.position.y = 1;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(.5, .5, .5),
    dark
  );
  head.position.y = 1.8;
  group.add(head);

  // Knochen-Schädel-Maske als rein dekoratives Fantasy-Design.
  const skull = new THREE.Mesh(
    new THREE.BoxGeometry(.56, .3, .12),
    bone
  );
  skull.position.set(0, 1.8, -.27);
  group.add(skull);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(.09, .08, .04),
      eyeMat
    );
    eye.position.set(side * .13, 1.83, -.35);
    group.add(eye);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(.2, .7, .22),
      dark
    );
    arm.position.set(side * .43, 1.05, 0);
    group.add(arm);
  }

  const legs = [];

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(.24, .7, .25),
      dark
    );
    leg.position.set(side * .17, .35, 0);
    group.add(leg);
    legs.push(leg);
  }

  group.position.set(x, groundSurface(x, z) + .5, z);
  scene.add(group);

  enemies.push({
    group,
    legs,
    health: strong ? 15 : 10,
    speed: strong ? 2.3 : 1.8,
    strong,
    walkTime: random(0, 5)
  });
}

function clearEnemies() {
  for (const enemy of enemies) {
    scene.remove(enemy.group);
  }

  enemies = [];
}

function spawnNightEnemies() {
  clearEnemies();

  const strong = survivedDays >= 5;
  const amount = strong ? 20 : 8;

  // Maximal 15 Gegner vor Tag 5, ab Tag 5 maximal 20.
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = random(12, 17);

    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;

    createEnemy(x, z, strong);
  }

  $("enemyCounter").textContent =
    amount + " Schattenwächter auf der Insel";
}

function updateEnemies(delta) {
  for (const enemy of enemies) {
    const group = enemy.group;

    const dx = player.x - group.position.x;
    const dz = player.z - group.position.z;
    const distance = Math.hypot(dx, dz);

    if (distance > 1.1) {
      group.position.x += dx / distance * enemy.speed * delta;
      group.position.z += dz / distance * enemy.speed * delta;
      group.rotation.y = Math.atan2(dx, dz);
    } else {
      damagePlayer(1);
    }

    enemy.walkTime += delta * 7;

    const swing = Math.sin(enemy.walkTime) * .5;

    enemy.legs[0].rotation.x = swing;
    enemy.legs[1].rotation.x = -swing;

    group.position.y +=
      (groundSurface(group.position.x, group.position.z) + .5 -
       group.position.y) * Math.min(1, delta * 8);
  }
}

// =======================================
// TAG-NACHT-ZYKLUS UND TAGE
// =======================================

function isNight() {
  const hour = Math.floor(worldMinute / 60);
  return hour >= 22 || hour < 5;
}

function updateDayDisplay() {
  $("dayCounter").textContent =
    survivedDays + (survivedDays === 1 ? " Day" : " Days");
}

function updateDayNight(delta) {
  worldMinute += delta * 1440 / DAY_LENGTH;
  worldMinute %= 1440;

  const hour = Math.floor(worldMinute / 60);
  const minute = Math.floor(worldMinute % 60);

  $("blockyTime").textContent =
    (hour >= 6 && hour < 18 ? "☀ " : "☾ ") +
    String(hour).padStart(2, "0") + ":" +
    String(minute).padStart(2, "0");

  const daylight = Math.max(
    .08,
    Math.sin(worldMinute / 1440 * Math.PI * 2 - Math.PI / 2) * .5 + .5
  );

  const sky = new THREE.Color().setHSL(
    .56,
    .45,
    .12 + daylight * .4
  );

  scene.background.copy(sky);
  scene.fog.color.copy(sky);

  scene.userData.ambient.intensity = .2 + daylight * 1.2;
  scene.userData.sun.intensity = .1 + daylight * 1.5;

  const angle = worldMinute / 1440 * Math.PI * 2;

  scene.userData.sunBall.position.set(
    Math.cos(angle) * 45,
    Math.sin(angle) * 40,
    -30
  );

  scene.userData.sunBall.visible =
    scene.userData.sunBall.position.y > -2;

  scene.userData.moon.position.set(
    -Math.cos(angle) * 45,
    -Math.sin(angle) * 40,
    -30
  );

  scene.userData.moon.visible =
    scene.userData.sunBall.position.y < 2;

  // Nacht beginnt um 22:00 Uhr.
  if (hour === 22 && !nightSpawned) {
    nightSpawned = true;
    lastNight = survivedDays;

    spawnNightEnemies();
    showMessage("Die Schattenwächter sind gekommen!");
  }

  // Nacht endet um 05:00 Uhr.
  if (hour === 5 && nightSpawned) {
    nightSpawned = false;
    clearEnemies();

    $("enemyCounter").textContent = "Insel sicher";
    survivedDays++;
    updateDayDisplay();

    showMessage("Du hast einen weiteren Tag überlebt!");
  }

  // Wer nach 05:20 noch auf der Insel ist, wird zurückgesetzt.
  if (hour === 5 && minute >= 20 && !nightSpawned) {
    if (islandDistance(player.x, player.z) < ISLAND_RADIUS + 2) {
      player.x = 0;
      player.z = 0;
      player.y = groundSurface(0, 0) + PLAYER_HEIGHT / 2;
      player.vy = 0;

      damagePlayer(1);
      showMessage("Die Inselprüfung ist vorbei!");
    }
  }
}

// =======================================
// SPIELER UND KOLLISION
// =======================================

function canStandAt(x, centerY, z) {
  const feet = centerY - PLAYER_HEIGHT / 2;
  const head = centerY + PLAYER_HEIGHT / 2;

  const minX = Math.floor(x - PLAYER_RADIUS + .5);
  const maxX = Math.floor(x + PLAYER_RADIUS + .5);
  const minZ = Math.floor(z - PLAYER_RADIUS + .5);
  const maxZ = Math.floor(z + PLAYER_RADIUS + .5);

  const minY = Math.ceil(feet - .5);
  const maxY = Math.floor(head - .5);

  for (let bx = minX; bx <= maxX; bx++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let by = minY; by <= maxY; by++) {
        if (isSolid(bx, by, bz)) return false;
      }
    }
  }

  return true;
}

function movePlayer(delta) {
  const forward = new THREE.Vector3(
    -Math.sin(yaw), 0, -Math.cos(yaw)
  );

  const right = new THREE.Vector3(
    Math.cos(yaw), 0, -Math.sin(yaw)
  );

  let mx = 0;
  let mz = 0;

  if (keys.KeyW) { mx += forward.x; mz += forward.z; }
  if (keys.KeyS) { mx -= forward.x; mz -= forward.z; }
  if (keys.KeyA) { mx -= right.x; mz -= right.z; }
  if (keys.KeyD) { mx += right.x; mz += right.z; }

  const len = Math.hypot(mx, mz);

  if (len > 0) {
    mx /= len;
    mz /= len;
  }

  const speed = keys.ShiftLeft ? 6.5 : 4.3;

  const nx = player.x + mx * speed * delta;
  const nz = player.z + mz * speed * delta;

  if (canStandAt(nx, player.y, player.z)) player.x = nx;
  if (canStandAt(player.x, player.y, nz)) player.z = nz;

  player.vy -= 22 * delta;

  const ny = player.y + player.vy * delta;

  if (canStandAt(player.x, ny, player.z)) {
    player.y = ny;
    player.onGround = false;
  } else {
    if (player.vy < 0) player.onGround = true;
    player.vy = 0;
  }

  const minimumY = groundSurface(player.x, player.z) + PLAYER_HEIGHT / 2;

  if (player.y < minimumY) {
    player.y = minimumY;
    player.vy = 0;
    player.onGround = true;
  }

  animatePlayer(delta);
  updateCamera();
}

function jump() {
  if (!worldReady || paused || inventoryOpen) return;

  if (player.onGround) {
    player.vy = 8.5;
    player.onGround = false;
  }
}

// =======================================
// KAMERA
// =======================================

function cycleCamera() {
  cameraMode = (cameraMode + 1) % 3;

  $("cameraMode").textContent = [
    "Ego-Perspektive",
    "Ansicht von hinten",
    "Ansicht von vorne"
  ][cameraMode];

  updateCamera();
}

function updateCamera() {
  if (!camera) return;

  const eyeY = player.y + .15;

  if (cameraMode === 0) {
    camera.position.set(player.x, eyeY, player.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    if (playerAvatar) playerAvatar.visible = false;
    return;
  }

  if (playerAvatar) playerAvatar.visible = true;

  const dir = new THREE.Vector3(
    -Math.sin(yaw), 0, -Math.cos(yaw)
  );

  const distance = 5;

  if (cameraMode === 1) {
    camera.position.set(
      player.x - dir.x * distance,
      eyeY + 1.4,
      player.z - dir.z * distance
    );
  } else {
    camera.position.set(
      player.x + dir.x * distance,
      eyeY + 1.4,
      player.z + dir.z * distance
    );
  }

  camera.lookAt(player.x, player.y + .7, player.z);
}

// =======================================
// ABBauen UND PLATZIEREN
// =======================================

function getBlockTarget() {
  const ray = new THREE.Raycaster();

  ray.setFromCamera(new THREE.Vector2(0, 0), camera);

  const hits = ray.intersectObjects(blocks, false);

  return hits.length && hits[0].distance < 6 ? hits[0] : null;
}

function removeBlock(mesh) {
  if (mesh.userData.unbreakable) {
    showMessage("Dieses Gestein ist unzerstörbar!");
    return;
  }

  const p = mesh.position;
  const type = mesh.userData.type;

  blockMap.delete(key(p.x, p.y, p.z));

  scene.remove(mesh);

  const index = blocks.indexOf(mesh);
  if (index >= 0) blocks.splice(index, 1);

  inventory[type] = (inventory[type] || 0) + 1;

  updateHotbar();
  updateInventory();
}

function placeBlock() {
  const hit = getBlockTarget();
  if (!hit) return;

  const type = hotbarItems[selectedSlot];

  if (!inventory[type] || inventory[type] <= 0) {
    showMessage("Du hast diesen Gegenstand nicht!");
    return;
  }

  const p = hit.object.position.clone().add(hit.face.normal);

  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const z = Math.round(p.z);

  if (isSolid(x, y, z)) return;

  if (Math.hypot(x - player.x, y - player.y, z - player.z) < 1.5) {
    return;
  }

  if (type === "Torch") {
    const torch = createTorch(x, y + .5, z);
    torches.push(torch);
  } else {
    addBlock(x, y, z, type);
  }

  inventory[type]--;

  updateHotbar();
  updateInventory();
}

function mineTarget() {
  const hit = getBlockTarget();
  if (!hit) return;

  const block = hit.object;

  // Fackeln einsammeln
  for (let i = 0; i < torches.length; i++) {
    const torch = torches[i];

    if (torch.position.distanceTo(camera.position) < 5) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);

      const meshes = [];
      torch.traverse(obj => {
        if (obj.isMesh) meshes.push(obj);
      });

      const torchHit = ray.intersectObjects(meshes, false);

      if (torchHit.length && torchHit[0].distance < 5) {
        scene.remove(torch);
        torches.splice(i, 1);
        inventory.Torch++;
        updateHotbar();
        showMessage("Fackel eingesammelt!");
        return;
      }
    }
  }

  removeBlock(block);
}

// =======================================
// LEBEN
// =======================================

function updateHealth() {
  $("health").textContent = "♥ ".repeat(player.health) || "0 ♥";
}

function damagePlayer(amount) {
  if (Date.now() - lastDamage < 850) return;

  lastDamage = Date.now();
  player.health = Math.max(0, player.health - amount);

  updateHealth();

  if (player.health <= 0) {
    showMessage("Du wurdest besiegt! Rückkehr zum Start...");

    setTimeout(() => {
      player.health = 5;
      player.x = 0;
      player.z = 0;
      player.y = groundSurface(0, 0) + PLAYER_HEIGHT / 2;
      player.vy = 0;
      player.onGround = true;

      updateHealth();
      updateCamera();
    }, 1500);
  }
}

// =======================================
// INVENTAR UND HOTBAR
// =======================================

function updateHotbar() {
  $("hotbar").innerHTML = "";

  hotbarItems.forEach((item, index) => {
    const slot = document.createElement("div");

    slot.className =
      "hotbar-slot" +
      (index === selectedSlot ? " selected" : "");

    slot.textContent = item + "\n" + (inventory[item] || 0);
    $("hotbar").appendChild(slot);
  });
}

function updateInventory() {
  $("inventoryItems").innerHTML = "";

  for (const [item, count] of Object.entries(inventory)) {
    const div = document.createElement("div");
    div.className = "inventory-item";
    div.textContent = item + ": " + count;

    $("inventoryItems").appendChild(div);
  }
}

function openInventory() {
  inventoryOpen = true;
  $("inventoryPanel").classList.remove("hidden");
  document.exitPointerLock?.();
}

function closeInventory() {
  inventoryOpen = false;
  $("inventoryPanel").classList.add("hidden");
  requestPointerLock();
}

$("closeInventoryBtn").addEventListener("click", closeInventory);

// =======================================
// SPEICHERN UND LADEN
// =======================================

let currentWorldCode = "";

function saveWorld() {
  if (!currentWorldCode) return;

  const data = {
    worldMinute,
    survivedDays,
    player: {
      x: player.x,
      y: player.y,
      z: player.z,
      health: player.health
    },
    inventory,
    blocks: blocks.map(block => ({
      x: block.position.x,
      y: block.position.y,
      z: block.position.z,
      type: block.userData.type
    }))
  };

  localStorage.setItem(
    "blockcraft_save_" + currentWorldCode,
    JSON.stringify(data)
  );

  showMessage("Welt gespeichert!");
}

function loadSaveData(data) {
  worldMinute = data.worldMinute ?? 480;
  survivedDays = data.survivedDays ?? 1;

  if (data.player) {
    player.x = data.player.x ?? 0;
    player.y = data.player.y ?? 4;
    player.z = data.player.z ?? 0;
    player.health = data.player.health ?? 5;
  }

  if (data.inventory) {
    Object.assign(inventory, data.inventory);
  }

  if (Array.isArray(data.blocks)) {
    for (const b of data.blocks) {
      if (b.type !== "RedStone") {
        addBlock(b.x, b.y, b.z, b.type);
      }
    }
  }

  updateDayDisplay();
  updateHealth();
}

$("saveBtn").addEventListener("click", saveWorld);

$("backMenuBtn").addEventListener("click", () => {
  saveWorld();
  location.reload();
});

// =======================================
// PAUSE UND VOLLbild
// =======================================

function requestPointerLock() {
  renderer?.domElement?.requestPointerLock?.();
}

function openPause() {
  if (paused) return;

  paused = true;
  $("pausePanel").classList.remove("hidden");
  document.exitPointerLock?.();
}

function closePause() {
  paused = false;
  $("pausePanel").classList.add("hidden");
  requestPointerLock();
}

$("resumeBtn").addEventListener("click", closePause);

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    showMessage("Vollbild konnte nicht aktiviert werden.");
  }
}

$("fullscreenBtn").addEventListener("click", toggleFullscreen);

// =======================================
// TASTEN UND MAUS
// =======================================

document.addEventListener("keydown", e => {
  if (e.code === "F10") {
    e.preventDefault();
    toggleFullscreen();
    return;
  }

  if (e.code === "F5" || e.code === "KeyV") {
    e.preventDefault();
    if (worldReady) cycleCamera();
    return;
  }

  if (e.code === "Escape") {
    if (inventoryOpen) closeInventory();
    else if (paused) closePause();
    else openPause();

    return;
  }

  if (!worldReady) return;

  if (e.code === "KeyE") {
    if (inventoryOpen) closeInventory();
    else if (!paused) openInventory();

    return;
  }

  if (e.code === "Space") {
    e.preventDefault();
    jump();
  }

  if (e.code.startsWith("Digit")) {
    const number = Number(e.code.replace("Digit", ""));

    if (number >= 1 && number <= hotbarItems.length) {
      selectedSlot = number - 1;
      updateHotbar();
    }
  }

  keys[e.code] = true;
});

document.addEventListener("keyup", e => {
  keys[e.code] = false;
});

document.addEventListener("mousemove", e => {
  if (!worldReady || paused || inventoryOpen) return;
  if (document.pointerLockElement !== renderer.domElement) return;

  yaw -= e.movementX * .002;
  pitch -= e.movementY * .002;
  pitch = Math.max(-1.5, Math.min(1.5, pitch));

  if (cameraMode === 0) updateCamera();
});

document.addEventListener("mousedown", e => {
  if (!worldReady || paused || inventoryOpen) return;

  if (document.pointerLockElement !== renderer.domElement) {
    requestPointerLock();
    return;
  }

  if (e.button === 0) mineTarget();
  if (e.button === 2) placeBlock();
});

document.addEventListener("contextmenu", e => e.preventDefault());

// =======================================
// SPIELSCHLEIFE
// =======================================

function animate() {
  if (!worldReady) return;

  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), .05);
  const elapsed = clock.elapsedTime;

  if (!paused && !inventoryOpen) {
    movePlayer(delta);
    updateChickens(delta);
    updateEnemies(delta);
    updateDayNight(delta);
    updateTorches(elapsed);

    // Regelmäßig automatisch speichern.
    if (Math.floor(elapsed) % 30 === 0) {
      // Der eigentliche Speicheraufruf wird über den
      // Zeitvergleich unten begrenzt.
      if (Math.floor(elapsed) !== animate.lastSave) {
        animate.lastSave = Math.floor(elapsed);
        saveWorld();
      }
    }
  }

  renderer.render(scene, camera);
}

// =======================================
// FENSTERGRÖSSE
// =======================================

window.addEventListener("resize", () => {
  if (!camera || !renderer) return;

  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});