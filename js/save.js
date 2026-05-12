// ============================================================
// save.js — multi-profile localStorage persistence
// ============================================================
window.DDI = window.DDI || {};
DDI.save = (function () {
  const PROFILES_KEY = 'ddi_profiles_v2';
  const ACTIVE_KEY   = 'ddi_active_profile_v2';
  const LEGACY_KEY   = 'ddi_save_v1';

  const DEFAULT_KEYBINDS = {
    moveUp:    'w',
    moveDown:  's',
    moveLeft:  'a',
    moveRight: 'd',
    sprint:    'Shift',
    ult:       ' ',
    magnet:    'e',
    pause:     'Escape',
    // MEGA potion slots — keep on number row (combat-reactive).
    potionHp:   '1',
    potionUlt:  '2',
    potionStam: '3',
    // Level-up choices — Shift+1 / Shift+2 / Shift+3.  Distinct from the
    // unmodified 1/2/3 potion binds so a combat-reactive potion mash
    // can't pick an upgrade by accident.  Reroll + skip stay on letter
    // keys nearby (T / Y) for the resting hand.
    upgrade1:      'Shift+1',
    upgrade2:      'Shift+2',
    upgrade3:      'Shift+3',
    upgradeReroll: 't',
    upgradeSkip:   'y',
  };

  const DEFAULT_SAVE = {
    dust: 0, bestFloor: 1, totalRuns: 0, totalKills: 0, bestLevel: 1,
    bestAct: 1, act1ClearSeconds: null,
    accountXp: 0, accountRank: 1,    // persistent rank — gates character unlocks
    character: null,         // 'default' | 'mage' — null until first character pick
    unlockedClasses: ['mage'],
    permUpgrades: {},
    settings: { sound: true, autoAim: true, screenShake: true },
    keybinds: Object.assign({}, DEFAULT_KEYBINDS),
    tutorialDone: false,
    ownedUlts: ['cataclysm'],
    activeUlt: 'cataclysm',
    hudPositions: {},     // { elementId: { x, y } } — overrides defaults when set
    zonesCleared: {},     // { magma: true, ... } — portals stay sealed after first clear
  };

  function newId() {
    return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function readProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function writeProfiles(profiles) {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch (e) {}
  }
  function getActiveId()  { return localStorage.getItem(ACTIVE_KEY); }
  function setActiveId(id){ if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); }

  // Migrate any legacy single-save into a default profile on first run
  function migrateLegacy() {
    const profiles = readProfiles();
    if (Object.keys(profiles).length > 0) return;
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const id = newId();
        const parsed = JSON.parse(legacy);
        profiles[id] = { name: 'Adventurer', created: Date.now(), save: Object.assign({}, DEFAULT_SAVE, parsed) };
        writeProfiles(profiles);
        setActiveId(id);
      }
    } catch (e) {}
  }

  function listProfiles() {
    migrateLegacy();
    const profiles = readProfiles();
    return Object.keys(profiles).map(function (id) {
      return {
        id,
        name: profiles[id].name || 'Adventurer',
        created: profiles[id].created || 0,
        bestFloor: (profiles[id].save && profiles[id].save.bestFloor) | 0,
        dust: (profiles[id].save && profiles[id].save.dust) | 0,
      };
    }).sort(function (a, b) { return b.created - a.created; });
  }

  function createProfile(name) {
    name = (name || 'Adventurer').toString().trim().slice(0, 18) || 'Adventurer';
    const profiles = readProfiles();
    const id = newId();
    profiles[id] = { name, created: Date.now(), save: Object.assign({}, DEFAULT_SAVE) };
    writeProfiles(profiles);
    setActiveId(id);
    return id;
  }

  function deleteProfile(id) {
    const profiles = readProfiles();
    delete profiles[id];
    writeProfiles(profiles);
    if (getActiveId() === id) setActiveId(null);
  }

  function renameProfile(id, newName) {
    const profiles = readProfiles();
    if (!profiles[id]) return;
    profiles[id].name = (newName || 'Adventurer').toString().trim().slice(0, 18) || 'Adventurer';
    writeProfiles(profiles);
  }

  // One-time keybind migration: legacy upgrade-pick defaults have been
  // swapped twice (1/2/3 -> q/w/e -> q/e/r -> Shift+1/2/3).  Detect any
  // of the older default layouts and rewrite to the current one so
  // existing saves auto-upgrade without the player digging through
  // Settings -> Keybinds.
  function _migrateUpgradeKeybinds(save) {
    if (!save || !save.keybinds) return;
    const k = save.keybinds;
    const isLegacyQWE = k.upgrade1 === 'q' && k.upgrade2 === 'w' && k.upgrade3 === 'e';
    const isLegacyQER = k.upgrade1 === 'q' && k.upgrade2 === 'e' && k.upgrade3 === 'r';
    const isLegacy123 = k.upgrade1 === '1' && k.upgrade2 === '2' && k.upgrade3 === '3';
    if (isLegacyQWE || isLegacyQER || isLegacy123) {
      k.upgrade1      = DEFAULT_KEYBINDS.upgrade1;
      k.upgrade2      = DEFAULT_KEYBINDS.upgrade2;
      k.upgrade3      = DEFAULT_KEYBINDS.upgrade3;
      k.upgradeReroll = DEFAULT_KEYBINDS.upgradeReroll;
      k.upgradeSkip   = DEFAULT_KEYBINDS.upgradeSkip;
    }
  }

  // Load the active profile's save (or null if no active profile)
  function load() {
    migrateLegacy();
    const id = getActiveId();
    if (!id) return null;
    const profiles = readProfiles();
    if (!profiles[id]) return null;
    const save = Object.assign({}, DEFAULT_SAVE, profiles[id].save || {});
    _migrateUpgradeKeybinds(save);
    return save;
  }

  function write(saveData) {
    const id = getActiveId();
    if (!id) return;
    const profiles = readProfiles();
    if (!profiles[id]) return;
    profiles[id].save = saveData;
    writeProfiles(profiles);
  }

  function reset() {
    const id = getActiveId();
    if (!id) return;
    const profiles = readProfiles();
    if (!profiles[id]) return;
    profiles[id].save = Object.assign({}, DEFAULT_SAVE);
    writeProfiles(profiles);
  }

  function activeName() {
    const id = getActiveId();
    if (!id) return null;
    const profiles = readProfiles();
    return profiles[id] ? profiles[id].name : null;
  }

  function activeId() { return getActiveId(); }

  function selectProfile(id) {
    const profiles = readProfiles();
    if (!profiles[id]) return false;
    setActiveId(id);
    return true;
  }

  function logout() { setActiveId(null); }

  // Return a fresh, fully-populated default save structure.  Used by the
  // Supabase auth flow when no existing save exists yet.
  function defaults() { return Object.assign({}, DEFAULT_SAVE, { keybinds: Object.assign({}, DEFAULT_KEYBINDS) }); }

  return {
    load, write, reset, defaults,
    listProfiles, createProfile, deleteProfile, renameProfile,
    selectProfile, logout, activeName, activeId,
    DEFAULT_KEYBINDS,
  };
})();
