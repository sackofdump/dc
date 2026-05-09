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
  };

  const DEFAULT_SAVE = {
    dust: 0, bestFloor: 1, totalRuns: 0, totalKills: 0, bestLevel: 1,
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

  // Load the active profile's save (or null if no active profile)
  function load() {
    migrateLegacy();
    const id = getActiveId();
    if (!id) return null;
    const profiles = readProfiles();
    if (!profiles[id]) return null;
    return Object.assign({}, DEFAULT_SAVE, profiles[id].save || {});
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

  return {
    load, write, reset,
    listProfiles, createProfile, deleteProfile, renameProfile,
    selectProfile, logout, activeName, activeId,
    DEFAULT_KEYBINDS,
  };
})();
