/* Should I evolve this Pokémon?
   Static site, no build step. Data from https://pokeapi.co */

const API = "https://pokeapi.co/api/v2";
const cache = new Map();

// Newest game versions first. Used to pick which move list to compare.
const VERSION_PRIORITY = [
  "scarlet-violet", "legends-arceus", "brilliant-diamond-and-shining-pearl",
  "sword-shield", "lets-go-pikachu-lets-go-eevee", "ultra-sun-ultra-moon",
  "sun-moon", "omega-ruby-alpha-sapphire", "x-y", "black-2-white-2",
  "black-white", "heartgold-soulsilver", "platinum", "diamond-pearl",
  "emerald", "firered-leafgreen", "ruby-sapphire", "crystal", "gold-silver",
  "yellow", "red-blue"
];

const STAT_LABELS = {
  "hp": "HP", "attack": "Attack", "defense": "Defense",
  "special-attack": "Sp. Atk", "special-defense": "Sp. Def", "speed": "Speed"
};

const form = document.getElementById("search-form");
const nameInput = document.getElementById("name-input");
const levelInput = document.getElementById("level-input");
const button = document.getElementById("check-button");
const status = document.getElementById("status");
const result = document.getElementById("result");
const verdictBox = document.getElementById("verdict");
const verdictWord = document.getElementById("verdict-word");
const verdictReason = document.getElementById("verdict-reason");
const pairBox = document.getElementById("pair");
const detailsBox = document.getElementById("details");
const cardTemplate = document.getElementById("card-template");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = normaliseName(nameInput.value);
  const level = levelInput.value ? Number(levelInput.value) : null;
  if (!name) return;

  setStatus("Looking up " + prettyName(name) + "...");
  button.disabled = true;
  result.hidden = true;

  try {
    const data = await loadEverything(name);
    render(data, level);
    setStatus("");
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    console.error(err);
    if (err.message === "not-found") {
      setStatus("No Pokémon called \"" + nameInput.value.trim() + "\". Check the spelling and try again.", true);
    } else {
      setStatus("Couldn't reach PokéAPI. Check your connection and try again.", true);
    }
  } finally {
    button.disabled = false;
  }
});

/* ---------- Data ---------- */

async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (res.status === 404) throw new Error("not-found");
  if (!res.ok) throw new Error("network");
  const json = await res.json();
  cache.set(url, json);
  return json;
}

function normaliseName(raw) {
  let n = raw.trim().toLowerCase();
  n = n.replace(/♀/g, "-f").replace(/♂/g, "-m");
  n = n.replace(/[.'’:]/g, "").replace(/\s+/g, "-");
  const special = {
    "mr-mime": "mr-mime", "mime-jr": "mime-jr", "farfetchd": "farfetchd",
    "type-null": "type-null", "jangmo-o": "jangmo-o", "hakamo-o": "hakamo-o",
    "kommo-o": "kommo-o", "porygon-z": "porygon-z", "ho-oh": "ho-oh"
  };
  return special[n] || n;
}

function prettyName(slug) {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

async function loadSpeciesAndPokemon(nameOrSpeciesUrl) {
  // Accepts a slug or a species URL. Returns { species, pokemon }.
  let species;
  if (nameOrSpeciesUrl.startsWith("http")) {
    species = await getJson(nameOrSpeciesUrl);
  } else {
    try {
      species = await getJson(API + "/pokemon-species/" + nameOrSpeciesUrl);
    } catch (e) {
      // Maybe the user typed a form name like "charizard-mega-x"
      const pokemon = await getJson(API + "/pokemon/" + nameOrSpeciesUrl);
      species = await getJson(pokemon.species.url);
      return { species, pokemon };
    }
  }
  const defaultVariety = species.varieties.find(v => v.is_default) || species.varieties[0];
  const pokemon = await getJson(defaultVariety.pokemon.url);
  return { species, pokemon };
}

async function loadEverything(name) {
  const current = await loadSpeciesAndPokemon(name);
  const chain = await getJson(current.species.evolution_chain.url);
  const node = findNode(chain.chain, current.species.name);
  const nextNodes = node ? node.evolves_to : [];

  const nextForms = await Promise.all(nextNodes.map(async (n) => {
    const loaded = await loadSpeciesAndPokemon(n.species.url);
    return { ...loaded, how: describeEvolution(n.evolution_details) };
  }));

  return { current, nextForms };
}

function findNode(node, speciesName) {
  if (node.species.name === speciesName) return node;
  for (const child of node.evolves_to) {
    const found = findNode(child, speciesName);
    if (found) return found;
  }
  return null;
}

function describeEvolution(detailsList) {
  if (!detailsList || detailsList.length === 0) return { text: "Evolves (method unknown)", minLevel: null };
  const d = detailsList[0];
  const parts = [];
  let minLevel = null;

  switch (d.trigger.name) {
    case "level-up":
      if (d.min_level) { parts.push("Reach level " + d.min_level); minLevel = d.min_level; }
      else parts.push("Level up");
      break;
    case "use-item":
      parts.push("Use " + prettyName(d.item ? d.item.name : "an item"));
      break;
    case "trade":
      parts.push("Trade");
      break;
    case "shed":
      parts.push("Level 20 with an empty party slot and a Poké Ball");
      minLevel = 20;
      break;
    default:
      parts.push(prettyName(d.trigger.name));
  }

  if (d.min_happiness) parts.push("high friendship");
  if (d.min_affection) parts.push("high affection");
  if (d.min_beauty) parts.push("high beauty");
  if (d.time_of_day) parts.push("during the " + d.time_of_day);
  if (d.held_item) parts.push("holding " + prettyName(d.held_item.name));
  if (d.known_move) parts.push("knowing " + prettyName(d.known_move.name));
  if (d.known_move_type) parts.push("knowing a " + prettyName(d.known_move_type.name) + " move");
  if (d.location) parts.push("at " + prettyName(d.location.name));
  if (d.needs_overworld_rain) parts.push("while it rains");
  if (d.gender === 1) parts.push("female only");
  if (d.gender === 2) parts.push("male only");
  if (d.party_species) parts.push("with " + prettyName(d.party_species.name) + " in the party");
  if (d.party_type) parts.push("with a " + prettyName(d.party_type.name) + " type in the party");
  if (d.trade_species) parts.push("for " + prettyName(d.trade_species.name));
  if (d.turn_upside_down) parts.push("with the console upside down");
  if (d.relative_physical_stats === 1) parts.push("Attack > Defense");
  if (d.relative_physical_stats === -1) parts.push("Attack < Defense");
  if (d.relative_physical_stats === 0) parts.push("Attack = Defense");

  return { text: parts.join(", "), minLevel };
}

/* ---------- Analysis ---------- */

function levelUpMoves(pokemon) {
  // Returns { versionGroup -> { moveName -> level } }
  const byVersion = {};
  for (const m of pokemon.moves) {
    for (const v of m.version_group_details) {
      if (v.move_learn_method.name !== "level-up") continue;
      const vg = v.version_group.name;
      byVersion[vg] = byVersion[vg] || {};
      const existing = byVersion[vg][m.move.name];
      byVersion[vg][m.move.name] = existing === undefined ? v.level_learned_at : Math.min(existing, v.level_learned_at);
    }
  }
  return byVersion;
}

function pickVersion(curMoves, nextMoves) {
  for (const vg of VERSION_PRIORITY) {
    if (curMoves[vg] && nextMoves[vg]) return vg;
  }
  const shared = Object.keys(curMoves).find(vg => nextMoves[vg]);
  return shared || Object.keys(curMoves)[0] || null;
}

function compareMoves(current, next, userLevel) {
  const curAll = levelUpMoves(current.pokemon);
  const nextAll = levelUpMoves(next.pokemon);
  const vg = pickVersion(curAll, nextAll);
  if (!vg) return { version: null, atRisk: [] };

  const cur = curAll[vg] || {};
  const nxt = nextAll[vg] || {};
  const atRisk = [];

  for (const [move, level] of Object.entries(cur)) {
    if (level <= 1) continue; // starting moves, not worth waiting for
    if (userLevel !== null && level <= userLevel) continue; // presumably already learned
    const nextLevel = nxt[move];
    if (nextLevel === undefined) {
      atRisk.push({ move, level, nextLevel: null });
    } else if (nextLevel > level) {
      atRisk.push({ move, level, nextLevel });
    }
  }
  atRisk.sort((a, b) => a.level - b.level);
  return { version: vg, atRisk };
}

function statMap(pokemon) {
  const out = {};
  for (const s of pokemon.stats) out[s.stat.name] = s.base_stat;
  out.total = pokemon.stats.reduce((sum, s) => sum + s.base_stat, 0);
  return out;
}

/* ---------- Rendering ---------- */

function render(data, userLevel) {
  const { current, nextForms } = data;
  pairBox.innerHTML = "";
  detailsBox.innerHTML = "";
  verdictBox.className = "verdict";

  const currentCard = buildCard(current, "current");

  if (nextForms.length === 0) {
    pairBox.className = "pair single";
    pairBox.appendChild(currentCard);
    setVerdict("no", "No", prettyName(current.species.name) + " doesn't evolve any further. Train it as it is.");
    return;
  }

  pairBox.className = "pair";
  pairBox.appendChild(currentCard);
  const arrow = document.createElement("div");
  arrow.className = "arrow";
  arrow.textContent = "→";
  arrow.setAttribute("aria-label", "evolves into");
  pairBox.appendChild(arrow);

  const stack = document.createElement("div");
  stack.className = "branch-stack";
  for (const next of nextForms) stack.appendChild(buildCard(next, "next"));
  pairBox.appendChild(stack);

  const analyses = nextForms.map(next => ({
    next,
    moves: compareMoves(current, next, userLevel),
    stats: { cur: statMap(current.pokemon), next: statMap(next.pokemon) }
  }));

  decideVerdict(current, analyses, userLevel);

  for (const a of analyses) {
    detailsBox.appendChild(buildStatsPanel(current, a));
    if (a.moves.atRisk.length) detailsBox.appendChild(buildMovesPanel(current, a, userLevel));
  }
}

function decideVerdict(current, analyses, userLevel) {
  const curName = prettyName(current.species.name);
  const branched = analyses.length > 1;

  // Can it evolve yet?
  const minLevels = analyses.map(a => a.next.how.minLevel).filter(Boolean);
  if (userLevel !== null && minLevels.length && userLevel < Math.min(...minLevels)) {
    setVerdict("wait", "Not yet",
      curName + " evolves at level " + Math.min(...minLevels) + ". You're at level " + userLevel + ". Keep training.");
    return;
  }

  const allRisk = analyses.flatMap(a => a.moves.atRisk.map(r => ({ ...r, into: prettyName(a.next.species.name) })));

  if (allRisk.length === 0) {
    if (branched) {
      setVerdict("yes", "Yes", curName + " has " + analyses.length + " possible evolutions, and none of them makes you miss a move. Pick the one that fits your team.");
    } else {
      const s = analyses[0].stats;
      const gain = s.next.total - s.cur.total;
      setVerdict("yes", "Yes",
        prettyName(analyses[0].next.species.name) + " has " + (gain >= 0 ? "+" : "") + gain +
        " base stat total and learns every move " + curName + " would, at the same level or earlier. Nothing to wait for.");
    }
    return;
  }

  const lastLevel = Math.max(...allRisk.map(r => r.level));
  const moveList = listMoves(allRisk.slice(0, 3));
  const more = allRisk.length > 3 ? " and " + (allRisk.length - 3) + " more" : "";

  if (userLevel !== null) {
    setVerdict("wait", "Wait",
      curName + " still learns " + moveList + more + " that " + (branched ? "its evolutions" : prettyName(analyses[0].next.species.name)) +
      " gets later or never. Evolve after level " + lastLevel + " if you want them all, or evolve now and accept the trade-off.");
  } else {
    setVerdict("yes", "Yes, but",
      "Evolving is a stat upgrade. Just know " + curName + " learns " + moveList + more + " that " +
      (branched ? "its evolutions" : prettyName(analyses[0].next.species.name)) +
      " gets later or never. Enter your level above for a sharper answer.");
  }
}

function listMoves(list) {
  const names = list.map(r => prettyName(r.move) + " (Lv " + r.level + ")");
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

function setVerdict(kind, word, reason) {
  verdictBox.classList.add(kind);
  verdictWord.textContent = word;
  verdictReason.textContent = reason;
}

function buildCard(entry, role) {
  const node = cardTemplate.content.firstElementChild.cloneNode(true);
  node.classList.add(role);
  const { species, pokemon } = entry;

  const art = node.querySelector(".art");
  const img = art.querySelector("img");
  const src = (pokemon.sprites.other && pokemon.sprites.other["official-artwork"] && pokemon.sprites.other["official-artwork"].front_default)
    || pokemon.sprites.front_default;
  if (src) {
    img.src = src;
    img.alt = prettyName(species.name);
  } else {
    img.remove();
    art.classList.add("no-image");
    art.textContent = "No image available";
  }

  node.querySelector(".card-name").textContent = prettyName(species.name);
  node.querySelector(".card-meta").textContent = "#" + String(species.id).padStart(4, "0") +
    (role === "current" ? " (current)" : "");

  const types = node.querySelector(".types");
  for (const t of pokemon.types) {
    const li = document.createElement("li");
    li.textContent = t.type.name;
    li.style.background = typeColor(t.type.name);
    types.appendChild(li);
  }

  if (role === "next" && entry.how) {
    const how = document.createElement("p");
    how.className = "how";
    how.textContent = entry.how.text;
    node.appendChild(how);
  }
  return node;
}

function buildStatsPanel(current, a) {
  const panel = document.createElement("div");
  panel.className = "panel";
  const h = document.createElement("h3");
  h.textContent = "Stats: " + prettyName(current.species.name) + " vs " + prettyName(a.next.species.name);
  panel.appendChild(h);

  const max = 255;
  for (const key of Object.keys(STAT_LABELS)) {
    panel.appendChild(statRow(STAT_LABELS[key], a.stats.cur[key], a.stats.next[key], max));
  }
  const total = statRow("Total", a.stats.cur.total, a.stats.next.total, 800);
  total.classList.add("total-row");
  panel.appendChild(total);

  const legend = document.createElement("div");
  legend.className = "legend";
  legend.innerHTML = "<span><i class='l-cur'></i>" + prettyName(current.species.name) + "</span><span><i class='l-next'></i>" + prettyName(a.next.species.name) + "</span>";
  panel.appendChild(legend);
  return panel;
}

function statRow(label, cur, next, max) {
  const row = document.createElement("div");
  row.className = "stat-row";
  const diff = next - cur;
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "same";
  const sign = diff > 0 ? "+" : "";
  row.innerHTML =
    "<div class='stat-name'>" + label + "</div>" +
    "<div class='bars'>" +
      "<div class='bar'><span style='width:" + pct(cur, max) + "%'></span></div>" +
      "<div class='bar next'><span style='width:" + pct(next, max) + "%'></span></div>" +
    "</div>" +
    "<div class='stat-values'>" + cur + " → " + next + " <span class='delta " + cls + "'>" + sign + diff + "</span></div>";
  return row;
}

function pct(v, max) { return Math.min(100, Math.round((v / max) * 100)); }

function buildMovesPanel(current, a, userLevel) {
  const panel = document.createElement("div");
  panel.className = "panel";
  const curName = prettyName(current.species.name);
  const nextName = prettyName(a.next.species.name);

  const h = document.createElement("h3");
  h.textContent = "Moves you'd miss or delay by evolving into " + nextName;
  panel.appendChild(h);

  const p = document.createElement("p");
  p.textContent = (userLevel !== null ? "Moves " + curName + " learns after level " + userLevel : "Moves " + curName + " learns by levelling up") +
    " that " + nextName + " learns later or not at all" + (a.moves.version ? " (" + prettyName(a.moves.version) + ")" : "") + ".";
  panel.appendChild(p);

  const ul = document.createElement("ul");
  ul.className = "moves";
  for (const r of a.moves.atRisk) {
    const li = document.createElement("li");
    const right = r.nextLevel === null ? nextName + " never learns it" : nextName + " learns it at Lv " + r.nextLevel;
    li.innerHTML = "<span class='move-name'>" + prettyName(r.move) + "</span><span>" + curName + " Lv " + r.level + ". " + right + "</span>";
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function typeColor(type) {
  const colors = {
    normal: "#8f9bb0", fire: "#e2622a", water: "#3f7fd6", electric: "#d8a80f", grass: "#4c9a4a",
    ice: "#5fb3c6", fighting: "#b7402f", poison: "#8f4aa3", ground: "#b8853a", flying: "#7a86d6",
    psychic: "#e04f7a", bug: "#8fa02a", rock: "#a08e4a", ghost: "#5f4f8f", dragon: "#5b3fc9",
    dark: "#5a4a42", steel: "#7f8ea3", fairy: "#d97fb0"
  };
  return colors[type] || "#223047";
}

function setStatus(text, isError) {
  status.textContent = text;
  status.className = "hint" + (isError ? " error" : "");
}
