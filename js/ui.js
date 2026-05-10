// ============================================================
// ui.js — HUD, level-up, death, title modals
// ============================================================
window.DDI = window.DDI || {};
DDI.UI = (function () {
  const { ABILITIES, UPGRADES } = DDI.data;
  const { shortNum, fmtTime, clamp } = DDI.util;
  const { Leveling } = DDI.systems;

  function displayKey(k) {
    if (k == null) return '?';
    if (k === ' ') return 'SPACE';
    if (k === 'Escape') return 'ESC';
    if (k === 'Shift') return 'SHIFT';
    if (k === 'Control') return 'CTRL';
    if (k === 'ArrowUp') return '↑';
    if (k === 'ArrowDown') return '↓';
    if (k === 'ArrowLeft') return '←';
    if (k === 'ArrowRight') return '→';
    if (k.length === 1) return k.toUpperCase();
    return k;
  }

  class UI {
    constructor(app) {
      this.app = app;
      this.modalOpen = false;
      this.rerolls = 3;
      this.bind();
    }
    $(id) { return document.getElementById(id); }

    bind() {
      const self = this;
      // Number keys 1/2/3 pick level-up choices, 4 reroll, 5 skip.
      // Use e.code so Shift-held sprinting doesn't break the binding (Shift+1 = '!').
      addEventListener('keydown', function (e) {
        const lvl = self.$('modal-levelup');
        if (!lvl || lvl.classList.contains('hidden')) return;
        const code = e.code;
        const key = e.key;
        if (code === 'Digit4' || key === '4') { self.rerollChoices(); e.preventDefault(); return; }
        if (code === 'Digit5' || key === '5') { self.skipChoice();    e.preventDefault(); return; }
        let idx = -1;
        if (code === 'Digit1' || key === '1') idx = 0;
        else if (code === 'Digit2' || key === '2') idx = 1;
        else if (code === 'Digit3' || key === '3') idx = 2;
        if (idx < 0) return;
        const wrap = self.$('levelup-choices');
        const btn = wrap && wrap.children[idx];
        if (btn) { btn.click(); e.preventDefault(); }
      });
      const btnStart = this.$('btn-start');
      const btnRestart = this.$('btn-restart');
      const btnReroll = this.$('btn-reroll');
      const btnSkip = this.$('btn-skip');
      const btnForge = this.$('btn-forge');
      const btnForgeBack = this.$('btn-forge-back');
      const btnSettings = this.$('btn-settings');
      const btnSettingsBack = this.$('btn-settings-back');
      const btnReset = this.$('btn-reset-save');
      const btnNewProfile = this.$('btn-new-profile');
      const btnNewConfirm = this.$('btn-new-confirm');
      const btnNewCancel = this.$('btn-new-cancel');
      const profilePill = this.$('profile-pill');
      if (btnStart)   btnStart.addEventListener('click', function () {
        // Guard the active character's saved run — DESCEND silently overwrote
        // it before. Now we ask first so an existing save is never lost by
        // accident.
        const a = self.app;
        const active = (a && a.activeSavedRun) ? a.activeSavedRun() : null;
        if (active) {
          const ck = (a.save && a.save.character) || 'default';
          const D = DDI.data || {};
          const cls = (D.CLASSES && D.CLASSES[ck]) || { name: ck };
          self.showConfirm({
            title: 'DISCARD ' + (cls.name || ck).toUpperCase() + ' SAVE?',
            message:
              'You have a saved run on <em class="hl">' + (cls.name || ck).toUpperCase() + '</em>.\n' +
              'Starting a new run will permanently overwrite it.',
            confirmText: 'START NEW RUN',
            cancelText: 'KEEP MY SAVE',
            danger: true,
            onConfirm: function () { a.startRun(); },
          });
          return;
        }
        a.startRun();
      });
      if (btnRestart) btnRestart.addEventListener('click', function () { self.app.startRun(); });
      const btnDeathMenu = this.$('btn-death-menu');
      if (btnDeathMenu) btnDeathMenu.addEventListener('click', function () {
        self.hideDeath();
        self.showTitle();
      });
      if (btnReroll)  btnReroll.addEventListener('click', function () { self.rerollChoices(); });
      if (btnSkip)    btnSkip.addEventListener('click', function () { self.skipChoice(); });
      if (btnForge)   btnForge.addEventListener('click', function () { self.openForge(); });
      if (btnForgeBack) btnForgeBack.addEventListener('click', function () { self.closeForge(); });
      if (btnSettings) btnSettings.addEventListener('click', function () { self.openSettings(); });
      if (btnSettingsBack) btnSettingsBack.addEventListener('click', function () { self.closeSettings(); });
      if (btnReset) btnReset.addEventListener('click', function () { self.resetSaveConfirm(); });
      const btnSwitch = this.$('btn-switch-profile');
      if (btnSwitch) btnSwitch.addEventListener('click', function () { self.switchProfile(); });
      const btnTitleSwitch = this.$('btn-title-switch');
      if (btnTitleSwitch) btnTitleSwitch.addEventListener('click', function () { self.switchProfile(); });
      const btnTitleSignout = this.$('btn-title-signout');
      if (btnTitleSignout) btnTitleSignout.addEventListener('click', function () { self.signOutFromTitle(); });
      const btnLoginSettings = this.$('btn-login-settings');
      if (btnLoginSettings) btnLoginSettings.addEventListener('click', function () {
        self._settingsFromLogin = true;
        self.openSettings();
      });

      // Auth modal: tab switching, login/signup buttons, forgot password
      const tabLogin  = this.$('auth-tab-login');
      const tabSignup = this.$('auth-tab-signup');
      const btnLogin  = this.$('btn-login');
      const btnSignup = this.$('btn-signup');
      const btnForgot = this.$('btn-forgot');
      if (tabLogin)  tabLogin .addEventListener('click', function () { self.switchAuthTab('login');  });
      if (tabSignup) tabSignup.addEventListener('click', function () { self.switchAuthTab('signup'); });
      if (btnLogin)  btnLogin .addEventListener('click', function () { self.submitLogin();  });
      if (btnSignup) btnSignup.addEventListener('click', function () { self.submitSignup(); });
      if (btnForgot) btnForgot.addEventListener('click', function () { self.submitForgot(); });
      // Enter-key submits the active form
      const onEnter = function (formId, action) {
        const form = self.$(formId);
        if (!form) return;
        form.querySelectorAll('input').forEach(function (inp) {
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') action.call(self); });
        });
      };
      onEnter('auth-form-login',  self.submitLogin);
      onEnter('auth-form-signup', self.submitSignup);
      const btnAuthSettings = this.$('btn-auth-settings');
      if (btnAuthSettings) btnAuthSettings.addEventListener('click', function () {
        self._settingsFromLogin = true; self.openSettings();
      });
      const btnAuthLb = this.$('btn-auth-leaderboard');
      if (btnAuthLb) btnAuthLb.addEventListener('click', function () { self._lbFromAuth = true; self.showLeaderboard(); });
      const btnAuthGuest = this.$('btn-auth-guest');
      if (btnAuthGuest) btnAuthGuest.addEventListener('click', function () { self.app.playAsGuest(); });

      // Admin: skip to next act (testing aid — only meaningful while a run is live)
      const btnAdminAct = this.$('btn-admin-act');
      if (btnAdminAct) btnAdminAct.addEventListener('click', function () {
        if (!self.app.game.running) { self.app.fx && self.app.fx.toast && self.app.fx.toast('NOT IN A RUN'); return; }
        if (self.app.adminSkipAct) self.app.adminSkipAct();
      });

      // Title leaderboard button
      const btnLb = this.$('btn-leaderboard');
      if (btnLb) btnLb.addEventListener('click', function () { self.showLeaderboard(); });
      // Rank unlocks (button is re-rendered inside title-stats; delegate from document)
      document.addEventListener('click', function (e) {
        if (e.target && e.target.id === 'btn-rank-unlocks') self.showUnlocks();
      });
      const btnUnlocksBack = this.$('btn-unlocks-back');
      if (btnUnlocksBack) btnUnlocksBack.addEventListener('click', function () { self.hideUnlocks(); });
      const btnChangeChar = this.$('btn-change-char');
      if (btnChangeChar) btnChangeChar.addEventListener('click', function () {
        self._charFromTitle = true;
        self.showCharacterSelect();
      });
      // X-close on the character select modal — only valid when a character
      // is already chosen (initial pick still needs a class).
      const btnCharClose = this.$('btn-char-close');
      if (btnCharClose) btnCharClose.addEventListener('click', function () {
        if (!self.app.save || !self.app.save.character) return;     // first pick is mandatory
        self.$('modal-character').classList.add('hidden');
        self.modalOpen = false;
        self._charFromTitle = false;
        self.showTitle();
      });
      const btnLbBack = this.$('btn-lb-back');
      if (btnLbBack) btnLbBack.addEventListener('click', function () {
        self.hideLeaderboard();
        if (self._lbFromAuth) { self._lbFromAuth = false; self.showAuth(); }
        else                    self.showTitle();
      });

      // Customize HUD: force-close ALL other overlays so the user can drag freely
      const btnCustomize = this.$('btn-customize-hud');
      if (btnCustomize) btnCustomize.addEventListener('click', function () {
        self.$('modal-settings').classList.add('hidden');
        self.$('modal-pause').classList.add('hidden');
        self.$('modal-levelup').classList.add('hidden');
        self.modalOpen = false;
        self.pauseOpen = false;
        if (self.app.game.running) self.app.game.paused = true; // pause sim while editing
        if (DDI.hudedit) DDI.hudedit.enter();
      });
      const btnHudDone = this.$('btn-hud-done');
      if (btnHudDone) btnHudDone.addEventListener('click', function () {
        if (DDI.hudedit) DDI.hudedit.exit();
        if (self.app.game.running) self.app.game.paused = false;
      });
      const btnHudReset = this.$('btn-hud-reset');
      if (btnHudReset) btnHudReset.addEventListener('click', function () {
        if (DDI.hudedit) DDI.hudedit.clearPositions();
      });

      // Pause menu
      const btnResume = this.$('btn-resume');
      const btnQuit = this.$('btn-quit-run');
      const btnSaveQuit = this.$('btn-save-quit');
      const btnPauseSettings = this.$('btn-pause-settings');
      if (btnResume) btnResume.addEventListener('click', function () { self.closePause(); });
      if (btnQuit) btnQuit.addEventListener('click', function () {
        // Quitting drops the run permanently — confirm before nuking it.
        self.showConfirm({
          title: 'QUIT THIS RUN?',
          message:
            'You will lose all progress on this run.\n' +
            '<em class="hl">Tip:</em> use <em class="hl">SAVE & QUIT</em> instead to resume later.',
          confirmText: 'QUIT RUN',
          cancelText: 'KEEP PLAYING',
          danger: true,
          onConfirm: function () { self.quitRun(); },
        });
      });
      if (btnSaveQuit) btnSaveQuit.addEventListener('click', function () {
        if (self.app && self.app.saveRun) self.app.saveRun();
      });
      // Saved-runs panel — delegated click handler so we can rebuild rows
      // dynamically each time the title is shown.
      const savedRunsEl = this.$('saved-runs');
      if (savedRunsEl) {
        savedRunsEl.addEventListener('click', function (ev) {
          const row = ev.target && ev.target.closest && ev.target.closest('.sr-row');
          if (!row) return;
          const charKey = row.getAttribute('data-char');
          if (!charKey) return;
          if (self.app && self.app.continueRunFor) self.app.continueRunFor(charKey);
        });
      }
      if (btnPauseSettings) btnPauseSettings.addEventListener('click', function () {
        self.closePause();
        self.openSettings();
      });
      if (btnNewProfile) btnNewProfile.addEventListener('click', function () { self.showNewProfileInput(true); });
      if (btnNewCancel)  btnNewCancel.addEventListener('click', function () { self.showNewProfileInput(false); });
      if (btnNewConfirm) btnNewConfirm.addEventListener('click', function () { self.createProfileSubmit(); });
      if (profilePill)   profilePill.addEventListener('click', function () { self.switchProfile(); });
      // Allow Enter to submit profile name
      const newInput = this.$('new-profile-name');
      if (newInput) newInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') self.createProfileSubmit();
      });

      // settings toggles
      const setSound = this.$('set-sound');
      const setAuto  = this.$('set-autoaim');
      const setShake = this.$('set-shake');
      if (setSound) setSound.addEventListener('change', function () {
        self.app.save.settings.sound = setSound.checked; self.app.persist();
        if (DDI.audio && DDI.audio.setMuted) DDI.audio.setMuted(!setSound.checked);
      });
      if (setAuto) setAuto.addEventListener('change', function () {
        self.app.save.settings.autoAim = setAuto.checked; self.app.persist();
      });
      if (setShake) setShake.addEventListener('change', function () {
        self.app.save.settings.screenShake = setShake.checked; self.app.persist();
      });
    }

    // ---- Auth (Supabase) ----
    showAuth() {
      this.modalOpen = true;
      this.$('modal-title').classList.add('hidden');
      this.$('modal-death').classList.add('hidden');
      this.$('modal-levelup').classList.add('hidden');
      this.$('modal-forge').classList.add('hidden');
      this.$('modal-settings').classList.add('hidden');
      this.$('modal-leaderboard').classList.add('hidden');
      this.$('modal-auth').classList.remove('hidden');
      this.setAuthError('');
      this.switchAuthTab('login');
    }
    hideAuth() {
      this.$('modal-auth').classList.add('hidden');
      this.modalOpen = false;
    }
    // Legacy alias — keep showLogin/hideLogin pointing at the new flow so
    // older call sites (`showLogin()` from settings, etc.) keep working.
    showLogin() { return this.showAuth(); }
    hideLogin() { return this.hideAuth(); }
    switchAuthTab(which) {
      const isSignup = (which === 'signup');
      this.$('auth-tab-login') .classList.toggle('active', !isSignup);
      this.$('auth-tab-signup').classList.toggle('active',  isSignup);
      this.$('auth-form-login') .classList.toggle('hidden',  isSignup);
      this.$('auth-form-signup').classList.toggle('hidden', !isSignup);
      this.setAuthError('');
    }
    setAuthError(msg, kind) {
      const el = this.$('auth-error');
      if (!el) return;
      el.textContent = msg || '';
      el.classList.toggle('success', kind === 'success');
      el.classList.toggle('info',    kind === 'info');
    }
    async submitLogin() {
      this.setAuthError('');
      const email = (this.$('login-email').value || '').trim();
      const pw    =  this.$('login-password').value || '';
      if (!email || !pw) { this.setAuthError('Email and password required'); return; }
      this.setAuthError('Logging in…', 'info');
      const { data, error } = await DDI.auth.signIn(email, pw);
      if (error) { this.setAuthError(error.message || 'Login failed'); return; }
      // Remember-me: when unchecked, sign out on tab close so the session
      // doesn't persist into the next browser visit.
      const remember = !!(this.$('remember-me') && this.$('remember-me').checked);
      this.app._rememberMe = remember;
      if (!remember) {
        window.addEventListener('beforeunload', function () {
          if (DDI.auth && DDI.auth.signOut) DDI.auth.signOut();
        });
      }
      await this.app.onAuthChanged();
      this.hideAuth();
      // After login, if no character is chosen yet, prompt for it before title
      if (!this.app.save || !this.app.save.character) {
        this.showCharacterSelect();
      } else {
        this.showTitle();
      }
    }
    async submitSignup() {
      this.setAuthError('');
      const name  = (this.$('signup-name') .value || '').trim();
      const email = (this.$('signup-email').value || '').trim();
      const pw    =  this.$('signup-password').value || '';
      if (!name || !email || !pw) { this.setAuthError('All fields required'); return; }
      this.setAuthError('Creating account…', 'info');
      const { data, error } = await DDI.auth.signUp(email, pw, name);
      if (error) { this.setAuthError(error.message || 'Signup failed'); return; }
      // If email confirmation is OFF in Supabase, we're auto-signed-in → drop into the game.
      if (data && data.session) {
        this.setAuthError('✓ Account created — entering the dungeon…', 'success');
        // Brief pause so the success flashes before we hide the modal
        const self = this;
        setTimeout(async function () {
          await self.app.onAuthChanged();
          self.hideAuth();
          // First-time signup → always go through character select
          if (!self.app.save || !self.app.save.character) self.showCharacterSelect();
          else                                            self.showTitle();
        }, 700);
      } else {
        // Email confirmation required — surface a strong success state, then bounce them to login
        this.switchAuthTab('login');
        // Pre-fill the email so they don't re-type
        const loginEmail = this.$('login-email');
        if (loginEmail) loginEmail.value = email;
        this.setAuthError('✓ Account created! Check ' + email + ' for a confirmation link, then log in here.', 'success');
      }
    }
    async submitForgot() {
      const email = (this.$('login-email').value || '').trim();
      if (!email) { this.setAuthError('Enter your email above first'); return; }
      this.setAuthError('Sending reset email…', 'info');
      const { error } = await DDI.auth.sendPasswordReset(email);
      if (error) { this.setAuthError(error.message || 'Failed to send'); return; }
      this.setAuthError('✓ Reset link sent — check ' + email + '.', 'success');
    }
    async signOutFromTitle() {
      // Guests just bounce back to the auth screen — no Supabase call needed
      if (this.app.isGuest) {
        this.app.isGuest = false;
        this.app.save = null;
        this.$('modal-title').classList.add('hidden');
        this.showAuth();
        return;
      }
      if (DDI.auth && DDI.auth.signOut) await DDI.auth.signOut();
      this.app.save = null;
      this.$('modal-title').classList.add('hidden');
      this.showAuth();
    }
    switchProfile() { return this.signOutFromTitle(); }   // legacy alias

    // ---- Character select ----
    showCharacterSelect() {
      const modal = this.$('modal-character');
      if (!modal) {
        // Modal HTML missing (stale cache?) — skip gracefully so the user
        // isn't trapped on a blank screen.  They can re-pick later.
        console.warn('[ui] modal-character not found, skipping char select');
        if (this.app.save && !this.app.save.character) this.app.save.character = 'default';
        this.showTitle();
        return;
      }
      this.modalOpen = true;
      this.$('modal-title').classList.add('hidden');
      this.$('modal-auth').classList.add('hidden');
      modal.classList.remove('hidden');
      const self = this;
      this._chosenChar = (this.app.save && this.app.save.character) || null;
      // Populate per-card ability badges from CLASSES + ABILITIES so the player
      // sees exactly what each class will play with.
      const CLASSES   = (DDI.data && DDI.data.CLASSES)   || {};
      const ABILITIES = (DDI.data && DDI.data.ABILITIES) || {};
      const accountRank = (this.app.save && this.app.save.accountRank) || 1;
      const picks = modal.querySelectorAll('.char-pick');
      // Helper: commit the chosen character + close modal + go to title.
      // If a saved-mid-run snapshot exists and the player picks a DIFFERENT
      // character, warn them — the saved run will be discarded since the
      // ability roster won't match.
      // Per-character runStates: switching classes no longer discards
      // saved runs — each class keeps its own snapshot.
      const commit = function (choice) {
        if (!choice || !self.app.save) return;
        self.app.save.character = choice;
        self.app.persist();
        modal.classList.add('hidden');
        self.modalOpen = false;
        self._charFromTitle = false;
        self.showTitle();
        if (self.app.fx && self.app.fx.toast) {
          self.app.fx.toast('CHARACTER: ' + choice.toUpperCase());
        }
      };
      picks.forEach(function (el) {
        const myChar = el.getAttribute('data-char');
        const klass = CLASSES[myChar] || CLASSES.default;
        const reqRank = (klass && klass.requiredRank) || 1;
        const locked = accountRank < reqRank;
        el.classList.toggle('selected', myChar === self._chosenChar && !locked);
        el.classList.toggle('locked',   locked);
        el.disabled = locked;
        // Replace any existing lock badge to keep state fresh
        let lockBadge = el.querySelector('.char-lock');
        if (lockBadge) lockBadge.remove();
        if (locked) {
          lockBadge = document.createElement('div');
          lockBadge.className = 'char-lock';
          lockBadge.textContent = '🔒 RANK ' + reqRank + ' REQUIRED';
          el.appendChild(lockBadge);
        }
        const abilEl = el.querySelector('.char-abilities');
        if (abilEl) {
          const starters = (klass && klass.starters) || [];
          const pool     = (klass && klass.pool)     || [];
          abilEl.innerHTML = '';
          pool.forEach(function (id) {
            const def = ABILITIES[id];
            if (!def) return;
            const isStarter = starters.indexOf(id) !== -1;
            const node = document.createElement('span');
            node.className = 'ab' + (isStarter ? ' starter' : '');
            node.title = def.desc || def.name;
            node.innerHTML = '<span class="ico" style="color:' + (def.color || '#fff') + '">' + def.icon + '</span>'
              + '<span class="nm">' + def.name + '</span>';
            // Tap an ability chip to see what it does — same tooltip as in-game.
            node.style.cursor = 'pointer';
            node.addEventListener('click', function (ev) {
              ev.preventDefault();
              ev.stopPropagation();    // don't trigger the card's select handler
              self.showAbilityInfo(node, def);
            });
            abilEl.appendChild(node);
          });
        }
        // Inject a CONFIRM button inside this card (only shown when the card is .selected)
        let confirmBtn = el.querySelector('.char-confirm');
        if (!confirmBtn) {
          confirmBtn = document.createElement('button');
          confirmBtn.type = 'button';
          confirmBtn.className = 'char-confirm';
          confirmBtn.textContent = 'CONFIRM';
          el.appendChild(confirmBtn);
        }
        confirmBtn.onclick = function (ev) {
          ev.stopPropagation();    // don't bubble to the card's click handler
          commit(myChar);
        };

        if (!el._wired) {
          el._wired = true;
          el.addEventListener('click', function (ev) {
            if (el.classList.contains('locked')) return;
            // Ignore clicks on the inline CONFIRM button itself
            if (ev.target.closest && ev.target.closest('.char-confirm')) return;
            picks.forEach(function (p) { p.classList.remove('selected'); });
            el.classList.add('selected');
            self._chosenChar = el.getAttribute('data-char');
          });
        }
      });
      const btn = this.$('btn-char-confirm');
      if (btn) {
        btn.disabled = !self._chosenChar;     // pre-enable if a char is already picked
        if (!btn._wired) {
          btn._wired = true;
          btn.addEventListener('click', function () {
            if (!self._chosenChar || !self.app.save) return;
            self.app.save.character = self._chosenChar;
            self.app.persist();
            const card = modal.querySelector('.char-card');
            if (card) card.classList.remove('has-pick');     // hide popup on commit
            modal.classList.add('hidden');
            self.modalOpen = false;
            self._charFromTitle = false;
            self.showTitle();
            if (self.app.fx && self.app.fx.toast) {
              self.app.fx.toast('CHARACTER: ' + self._chosenChar.toUpperCase());
            }
          });
        }
      }
    }

    // ---- Leaderboard ----
    showLeaderboard() {
      this.modalOpen = true;
      this.$('modal-title').classList.add('hidden');
      this.$('modal-auth').classList.add('hidden');
      this.$('modal-leaderboard').classList.remove('hidden');
      this._lbSort = this._lbSort || 'act';
      this.refreshLeaderboardTabs();
      this.refreshLeaderboard();
    }
    hideLeaderboard() {
      this.$('modal-leaderboard').classList.add('hidden');
      this.modalOpen = false;
    }

    // Rank → Unlocks panel
    showUnlocks() {
      const a = this.app;
      const rk = (a.save && a.save.accountRank) || 1;
      const D = DDI.data || {};
      const CLASSES = D.CLASSES || {};
      const list = Object.keys(CLASSES).map(function (k) { return Object.assign({ key: k }, CLASSES[k]); });
      list.sort(function (x, y) { return (x.requiredRank || 1) - (y.requiredRank || 1); });
      const html = list.map(function (c) {
        const req = c.requiredRank || 1;
        const unlocked = rk >= req;
        const starters = (c.starters || []).map(function (id) {
          const def = (D.ABILITIES && D.ABILITIES[id]);
          return def ? def.name : id;
        }).join(' · ');
        return '' +
          '<div class="unlock-row ' + (unlocked ? 'on' : 'off') + '">' +
            '<div class="unlock-rank">RANK ' + req + '</div>' +
            '<div class="unlock-name">' + (c.name || c.key) +
              (unlocked ? ' <span class="unlock-tag on">UNLOCKED</span>'
                        : ' <span class="unlock-tag off">LOCKED</span>') +
            '</div>' +
            '<div class="unlock-starters">' + (starters || '—') + '</div>' +
          '</div>';
      }).join('');
      this.$('unlocks-list').innerHTML = html;
      this.$('modal-unlocks').classList.remove('hidden');
      this.modalOpen = true;
    }
    hideUnlocks() {
      this.$('modal-unlocks').classList.add('hidden');
      this.modalOpen = false;
    }
    refreshLeaderboardTabs() {
      const self = this;
      const tabs = this.$('modal-leaderboard').querySelectorAll('.lb-tab');
      tabs.forEach(function (t) {
        const isActive = t.getAttribute('data-sort') === self._lbSort;
        t.classList.toggle('active', isActive);
        if (!t._wired) {
          t._wired = true;
          t.addEventListener('click', function () {
            self._lbSort = t.getAttribute('data-sort');
            self.refreshLeaderboardTabs();
            self.refreshLeaderboard();
          });
        }
      });
    }
    async refreshLeaderboard() {
      const list = this.$('lb-list');
      list.innerHTML = '<div class="lb-loading">Loading…</div>';
      let rows = await DDI.auth.fetchLeaderboard(this._lbSort, 25);
      // Filter out hidden / banned display names (case-insensitive)
      const HIDDEN = ['dumpsack'];
      rows = (rows || []).filter(function (r) {
        const n = (r.display_name || '').toLowerCase();
        return HIDDEN.indexOf(n) === -1;
      });
      const me = (DDI.auth.user && DDI.auth.user()) || null;
      const myId = me && me.id;
      if (!rows.length) {
        list.innerHTML = '<div class="lb-empty">No runs yet — be the first.</div>';
        return;
      }
      const sort = this._lbSort;
      list.innerHTML = '';
      rows.forEach(function (r, i) {
        const rank = i + 1;
        const rankCls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
        const isMe = (r.user_id === myId);
        const name = (r.display_name || 'Delver').replace(/[<>&]/g, '');
        let primary, secondary;
        if (sort === 'floor') {
          primary   = '<span class="label">FLOOR</span> <b>' + r.best_floor + '</b>';
          secondary = '<span class="label">DUST</span> <b>' + shortNum(r.total_dust) + '</b>';
        } else if (sort === 'dust') {
          primary   = '<span class="label">DUST</span> <b>' + shortNum(r.total_dust) + '</b>';
          secondary = '<span class="label">ACT</span> <b>' + r.best_act + '</b>';
        } else if (sort === 'time') {
          const t = (r.act1_clear_seconds == null) ? '—' : fmtTime(r.act1_clear_seconds);
          primary   = '<span class="label">ACT 1</span> <b>' + t + '</b>';
          secondary = '<span class="label">ACT</span> <b>' + r.best_act + '</b>';
        } else {
          primary   = '<span class="label">ACT</span> <b>'   + r.best_act   + '</b>';
          secondary = '<span class="label">FLOOR</span> <b>' + r.best_floor + '</b>';
        }
        const tertiary = '<span class="label">DUST</span> <b>' + shortNum(r.total_dust) + '</b>';
        // Class tag — pulled from the new `character` column.  Falls back to
        // a neutral dash when the row pre-dates the schema migration.
        const D = DDI.data || {};
        const ck = (r.character || '').toLowerCase();
        const cls = (D.CLASSES && D.CLASSES[ck]) || null;
        const portraitIcons = {
          default: '⚔', rogue: '🗡', ranger: '🏹', mage: '🔥',
          paladin: '🛡', berserker: '🪓', necromancer: '💀',
        };
        const ico = portraitIcons[ck] || '·';
        const className = (cls && cls.name) || (ck ? ck.toUpperCase() : '—');
        const classChip = '<span class="lb-class" title="' + className + '">' + ico + ' ' + className + '</span>';
        const row = document.createElement('div');
        row.className = 'lb-row' + (isMe ? ' me' : '');
        row.innerHTML =
          '<div class="rank ' + rankCls + '">#' + rank + '</div>' +
          '<div class="name">' + name + ' ' + classChip + '</div>' +
          '<div class="stat">' + primary   + '</div>' +
          '<div class="stat">' + secondary + '</div>' +
          '<div class="stat">' + (sort === 'dust' ? '' : tertiary) + '</div>';
        list.appendChild(row);
      });
    }

    // ---- Tutorial ----
    maybeShowTutorial() {
      const a = this.app;
      if (!a.save) return false;
      if (a.save.tutorialDone) return false;
      this.openTutorial(0);
      return true;
    }
    openTutorial(idx) {
      this.tutorialIdx = idx | 0;
      this.$('modal-title').classList.add('hidden');
      this.$('modal-tutorial').classList.remove('hidden');
      this.modalOpen = true;
      this.renderTutorial();
      const self = this;
      const next = this.$('btn-tut-next');
      const prev = this.$('btn-tut-prev');
      const skip = this.$('btn-tut-skip');
      if (next && !next._wired) { next._wired = true; next.addEventListener('click', function () { self.tutorialNext(); }); }
      if (prev && !prev._wired) { prev._wired = true; prev.addEventListener('click', function () { self.tutorialPrev(); }); }
      if (skip && !skip._wired) { skip._wired = true; skip.addEventListener('click', function () { self.tutorialFinish(); }); }
    }
    tutorialPages() {
      return [
        { title: 'WELCOME, DELVER', html:
          '<p>You auto-attack. The dungeon does not stop. Survive, level up, get loot.</p>' +
          '<p>Press <strong>NEXT</strong> to learn the controls — or <strong>SKIP</strong> if you already know what you are doing.</p>' },
        { title: 'MOVE', html:
          '<div class="row"><span class="key">W A S D</span><span>Move your delver around the dungeon.</span></div>' +
          '<div class="row"><span class="key">SHIFT</span><span>Hold to <strong>sprint</strong> — drains the cyan stamina bar under your HP.</span></div>' },
        { title: 'COMBAT', html:
          '<p>Your abilities <strong>auto-cast</strong> at the nearest enemy. The bottom toolbar shows what you have.</p>' +
          '<p>Tap a toolbar slot any time to see what it does and what level it is.</p>' },
        { title: 'ULT — CATACLYSM', html:
          '<div class="row"><span class="key">SPACE</span><span>Trigger the <strong>Cataclysm</strong> ult — annihilates everything on screen. 30s cooldown.</span></div>' +
          '<p>The flame button on the bottom-right glows when ULT is ready.</p>' },
        { title: 'LOOT', html:
          '<p>Gold, gems and XP orbs auto-vacuum once you get close enough.</p>' +
          '<div class="row"><span class="key">E</span><span>Force a <strong>Greed Pulse</strong> — pull every loot drop on screen.</span></div>' +
          '<p>Treasure chests drop bonus gold + dust.</p>' },
        { title: 'LEVEL UP', html:
          '<p>Killing enemies fills your XP bar. Each level offers <strong>3 choices</strong> — at least one is always a new ability.</p>' +
          '<p>Game pauses while you choose. <strong>Reroll</strong> if you do not like the options.</p>' },
        { title: 'PROGRESSION', html:
          '<p>When you die, kills + elites + bosses convert into <strong>Soul Dust</strong>.</p>' +
          '<p>Spend it in the <strong>FORGE</strong> on permanent upgrades that apply to every future run.</p>' +
          '<div class="row"><span class="key">ESC</span><span>Pause the run anytime.</span></div>' },
        { title: 'GO BREAK THE DUNGEON', html:
          '<p>Each <strong>class</strong> starts with two unique abilities — Warriors throw daggers, Mages hurl fireballs, Rogues bleed foes with venom, and so on. Pick a class on the title screen.</p>' +
          '<p>Stack synergies, evolve weapons, melt floors.</p>' +
          '<p>One more run is always a lie.</p>' },
      ];
    }
    renderTutorial() {
      const pages = this.tutorialPages();
      const idx = clamp(this.tutorialIdx, 0, pages.length - 1);
      const p = pages[idx];
      this.$('tut-title').textContent = p.title;
      this.$('tut-body').innerHTML = p.html + '<div class="tut-progress">' + (idx + 1) + ' / ' + pages.length + '</div>';
      const next = this.$('btn-tut-next');
      const prev = this.$('btn-tut-prev');
      if (prev) prev.style.visibility = idx === 0 ? 'hidden' : 'visible';
      if (next) next.textContent = (idx === pages.length - 1) ? 'BEGIN' : 'NEXT';
    }
    tutorialNext() {
      const pages = this.tutorialPages();
      if (this.tutorialIdx >= pages.length - 1) { this.tutorialFinish(); return; }
      this.tutorialIdx++;
      this.renderTutorial();
    }
    tutorialPrev() {
      this.tutorialIdx = Math.max(0, this.tutorialIdx - 1);
      this.renderTutorial();
    }
    tutorialFinish() {
      this.app.save.tutorialDone = true;
      this.app.persist();
      this.$('modal-tutorial').classList.add('hidden');
      this.modalOpen = false;
      this.showTitle();
    }

    // ---- Act Complete (post-act-boss intermission menu) ----
    showActComplete(actNum) {
      const a = this.app;
      this.modalOpen = true;
      const m = this.$('modal-act-complete');
      m.classList.remove('hidden');
      const next = (actNum || 1) + 1;
      this.$('act-complete-title').textContent = '★  ACT ' + (actNum || 1) + ' COMPLETE  ★';
      this.$('act-complete-sub').textContent = 'The act boss has fallen. The realm shifts beneath your feet.';
      this.$('act-complete-summary').innerHTML =
        '<div class="row"><span>Time</span><span class="v">' + fmtTime(a.game.time) + '</span></div>' +
        '<div class="row"><span>Hero Level</span><span class="v">' + a.game.level + '</span></div>' +
        '<div class="row"><span>Kills</span><span class="v">' + a.game.kills + '</span></div>' +
        '<div class="row"><span>Bosses Slain</span><span class="v">' + a.game.bosses + '</span></div>' +
        '<div class="row"><span>Gold</span><span class="v gold">' + shortNum(a.game.gold) + '</span></div>' +
        '<div class="row"><span>Soul Dust</span><span class="v dust">' + shortNum(a.save.dust) + '</span></div>';
      const btnCont = this.$('btn-act-continue');
      if (btnCont) btnCont.textContent = 'ENTER ACT ' + next;
      const self = this;
      const btnForge = this.$('btn-act-forge');
      const btnSet = this.$('btn-act-settings');
      const btnMenu = this.$('btn-act-menu');
      if (btnCont && !btnCont._wired) {
        btnCont._wired = true;
        btnCont.addEventListener('click', function () {
          self.hideActComplete();
          self.app.continueToNextAct();
        });
      }
      if (btnForge && !btnForge._wired) {
        btnForge._wired = true;
        btnForge.addEventListener('click', function () {
          self.$('modal-act-complete').classList.add('hidden');
          self._forgeFromActComplete = true;
          self.openForge();
        });
      }
      if (btnSet && !btnSet._wired) {
        btnSet._wired = true;
        btnSet.addEventListener('click', function () {
          self.$('modal-act-complete').classList.add('hidden');
          self._settingsFromActComplete = true;
          self.openSettings();
        });
      }
      if (btnMenu && !btnMenu._wired) {
        btnMenu._wired = true;
        btnMenu.addEventListener('click', function () {
          self.hideActComplete();
          // End the run cleanly so dust/best-floor/etc. lock in, then bounce to title
          self.app.endRun(true);
          // Skip the death modal — go straight to title
          setTimeout(function () {
            self.$('modal-death').classList.add('hidden');
            self.modalOpen = false;
            self.showTitle();
          }, 100);
        });
      }
    }
    hideActComplete() {
      this.$('modal-act-complete').classList.add('hidden');
      this.modalOpen = false;
    }

    // ---- In-game confirm dialog (replaces window.confirm) ----
    showConfirm(opts) {
      // opts: { title, message, confirmText, cancelText, danger, onConfirm, onCancel }
      const m = this.$('modal-confirm');
      if (!m) {
        // Fallback in case the modal HTML is missing (stale cache)
        if (window.confirm(opts.message || 'Are you sure?')) {
          if (opts.onConfirm) opts.onConfirm();
        } else if (opts.onCancel) opts.onCancel();
        return;
      }
      const titleEl = this.$('confirm-title');
      const msgEl   = this.$('confirm-msg');
      const yesBtn  = this.$('confirm-yes');
      const noBtn   = this.$('confirm-no');
      if (titleEl) titleEl.textContent = (opts.title || 'CONFIRM').toUpperCase();
      if (msgEl)   msgEl.innerHTML = opts.message || '';
      if (yesBtn)  yesBtn.textContent = (opts.confirmText || 'CONFIRM').toUpperCase();
      if (noBtn)   noBtn.textContent  = (opts.cancelText  || 'CANCEL').toUpperCase();
      m.classList.toggle('danger', !!opts.danger);
      m.classList.remove('hidden');
      this.modalOpen = true;
      const self = this;
      const cleanup = function () {
        m.classList.add('hidden');
        // Don't drop modalOpen if another modal is still up
        if (!document.querySelector('.modal:not(.hidden)')) self.modalOpen = false;
        yesBtn && (yesBtn.onclick = null);
        noBtn  && (noBtn.onclick  = null);
      };
      if (yesBtn) yesBtn.onclick = function () { cleanup(); if (opts.onConfirm) opts.onConfirm(); };
      if (noBtn)  noBtn.onclick  = function () { cleanup(); if (opts.onCancel)  opts.onCancel(); };
    }

    // ---- Boot splash — covers the brief auto-login hydrate so title doesn't pop ----
    showBootSplash() {
      const el = document.getElementById('boot-splash');
      if (!el) return;
      el.classList.remove('hidden');
      el.classList.remove('fading');
    }
    hideBootSplash() {
      const el = document.getElementById('boot-splash');
      if (!el) return;
      el.classList.add('fading');
      setTimeout(function () { el.classList.add('hidden'); el.classList.remove('fading'); }, 500);
    }

    // ---- Objective banner — big centered card on zone entry, stays ~5s ----
    showObjectiveBanner(name, desc) {
      let el = document.getElementById('objective-banner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'objective-banner';
        el.className = 'hud';
        document.getElementById('game-root').appendChild(el);
      }
      el.innerHTML =
        '<div class="ob-name">' + (name || 'OBJECTIVE') + '</div>' +
        '<div class="ob-desc">' + (desc || '') + '</div>';
      el.classList.remove('hidden');
      el.classList.remove('fading');
      // Force reflow so the animation restarts cleanly
      void el.offsetWidth;
      el.classList.add('visible');
      clearTimeout(this._objBannerTimer);
      const self = this;
      this._objBannerTimer = setTimeout(function () {
        el.classList.add('fading');
        setTimeout(function () { el.classList.add('hidden'); el.classList.remove('visible','fading'); }, 800);
      }, 4500);
    }

    // ---- Act Proceed button (after act boss slain — let player loot first) ----
    showActProceedButton() {
      const btn = this.$('btn-act-proceed');
      if (!btn) return;
      const next = (this.app.game.act || 1) + 1;
      btn.textContent = 'PROCEED TO ACT ' + next + '  ★';
      btn.classList.remove('hidden');
      const self = this;
      if (!btn._wired) {
        btn._wired = true;
        btn.addEventListener('click', function () {
          btn.classList.add('hidden');
          if (self.app && self.app.advanceAct) self.app.advanceAct();
        });
      }
    }
    hideActProceedButton() {
      const btn = this.$('btn-act-proceed');
      if (btn) btn.classList.add('hidden');
    }

    // ---- Zone Exit button (non-blocking — appears after zone clear) ----
    showZoneExitButton() {
      const btn = this.$('btn-zone-exit');
      if (!btn) return;
      btn.classList.remove('hidden');
      const self = this;
      if (!btn._wired) {
        btn._wired = true;
        btn.addEventListener('click', function () {
          btn.classList.add('hidden');
          self.app.game.paused = true;
          self.showZoneComplete(self.app.zone);
        });
      }
    }
    hideZoneExitButton() {
      const btn = this.$('btn-zone-exit');
      if (btn) btn.classList.add('hidden');
    }

    // ---- Zone Complete ----
    showZoneComplete(zone) {
      const a = this.app;
      this.modalOpen = true;
      const m = this.$('modal-zone');
      m.classList.remove('hidden');
      this.$('zone-title').textContent = (zone.displayName || 'ZONE') + ' CLEARED';
      this.$('zone-title').style.color = zone.color || '#ffe14d';
      // Track per-zone gold/dust/xp from when the zone was entered.
      // We use the current run totals as a simple display since zone-only deltas weren't tracked.
      this.$('zone-summary').innerHTML =
        '<div class="row"><span>Enemies Killed</span><span class="v">' + (zone.killsInZone || 0) + '</span></div>' +
        '<div class="row"><span>Hero Level</span><span class="v">' + a.game.level + '</span></div>' +
        '<div class="row"><span>Gold</span><span class="v gold">' + shortNum(a.game.gold) + '</span></div>' +
        '<div class="row"><span>Soul Dust</span><span class="v dust">' + shortNum(a.save.dust) + '</span></div>';
      const self = this;
      const btnForge = this.$('btn-zone-forge');
      const btnReturn = this.$('btn-zone-return');
      // Set the return button label to the actual destination — e.g., the
      // current act's home-base name ("WHISPERING CRYPTS", "SCARRED CATACOMBS")
      // so the player knows where they're going.
      if (btnReturn) {
        const D = DDI.data || {};
        const act = (a.game && a.game.act) || 1;
        const theme = (D.actTheme ? D.actTheme(act) : null);
        const mainName = (theme && theme.mainName) || 'MAIN MAP';
        btnReturn.textContent = 'RETURN TO ' + mainName + '  ▲';
      }
      if (btnForge && !btnForge._wired) {
        btnForge._wired = true;
        btnForge.addEventListener('click', function () {
          self.$('modal-zone').classList.add('hidden');
          self._forgeFromZone = true;        // flag: when forge closes, return to main (don't go to title)
          self.openForge();
        });
      }
      if (btnReturn && !btnReturn._wired) {
        btnReturn._wired = true;
        btnReturn.addEventListener('click', function () {
          self.$('modal-zone').classList.add('hidden');
          self.modalOpen = false;
          self.app.returnToMain();
        });
      }
    }

    // ---- Pause ----
    openPause() {
      if (!this.app.game.running) return;
      this.pauseOpen = true;
      this.app.game.paused = true;
      this.$('modal-pause').classList.remove('hidden');
    }
    closePause() {
      this.pauseOpen = false;
      this.$('modal-pause').classList.add('hidden');
      // Only resume if no other modal is open (e.g. settings opened from pause)
      if (!this.modalOpen && !document.querySelector('.modal:not(.hidden)')) {
        this.app.game.paused = false;
      } else {
        // Modal was opened from pause; will resume when that closes
      }
      // Defensive: if the game is supposed to be running, make sure the
      // game-root .in-game class is present so the HUD comes back after
      // returning from pause/settings.
      if (this.app && this.app.game && this.app.game.running) {
        const root = document.getElementById('game-root');
        if (root) root.classList.add('in-game');
      }
    }
    quitRun() {
      this.pauseOpen = false;
      this.$('modal-pause').classList.add('hidden');
      this.app.game.paused = false;
      // Voluntary quit — death summary should NOT offer a revive (player chose
      // to end the run; reviving would feel cheap).
      this.app.game.quitFromMenu = true;
      this.app.endRun(false);
    }

    // ---- Forge ----
    openForge() {
      this.$('modal-title').classList.add('hidden');
      this.$('modal-act-complete').classList.add('hidden');
      this.$('modal-forge').classList.remove('hidden');
      // Adjust the back-button copy to name the actual destination.
      // - From a zone clear  -> "RETURN TO <main map name>"
      // - From act complete  -> "ENTER ACT N+1"
      // - From the title     -> plain "BACK"
      const backBtn = this.$('btn-forge-back');
      if (backBtn) {
        const a = this.app;
        const D = DDI.data || {};
        const act = (a.game && a.game.act) || 1;
        const theme = (D.actTheme ? D.actTheme(act) : null);
        const mainName = (theme && theme.mainName) || 'MAIN MAP';
        let label = 'BACK';
        let primary = false;
        if (this._forgeFromActComplete) {
          label = 'ENTER ACT ' + (act + 1) + '  ▼';
          primary = true;
        } else if (this._forgeFromZone) {
          label = 'RETURN TO ' + mainName + '  ▲';
          primary = true;
        }
        backBtn.textContent = label;
        backBtn.classList.toggle('primary-btn', primary);
        backBtn.classList.toggle('ghost-btn', !primary);
      }
      this.renderForge();
    }
    closeForge() {
      this.$('modal-forge').classList.add('hidden');
      // If we came here from the zone-complete modal, go straight back to the run.
      if (this._forgeFromZone && this.app.game.running) {
        this._forgeFromZone = false;
        this.modalOpen = false;
        this.app.returnToMain();
        return;
      }
      // If we came here from the act-complete intermission, return to it
      if (this._forgeFromActComplete) {
        this._forgeFromActComplete = false;
        this.showActComplete(this.app.game.act || 1);
        return;
      }
      this.$('modal-title').classList.remove('hidden');
      this.showTitle();
    }
    renderForge() {
      const a = this.app;
      const META = DDI.data.META_UPGRADES;
      const ULTS = DDI.data.ULTS;
      const cost = DDI.data.metaUpgradeCost;
      this.$('forge-dust').textContent = shortNum(a.save.dust);
      const goldEl = this.$('forge-gold');
      const goldNow = (a.game && a.game.gold) || 0;
      if (goldEl) goldEl.textContent = goldNow ? shortNum(goldNow) + ' gold' : '0 gold';
      const burnBtn = this.$('btn-burn-gold');
      if (burnBtn) {
        // Show the dust the player would get for burning their full gold pile (80 gold = 1 dust)
        const projectedDust = Math.floor(goldNow / 80);
        burnBtn.innerHTML = 'BURN GOLD → <b>' + shortNum(projectedDust) + '</b> DUST';
        burnBtn.disabled = projectedDust <= 0;
        if (!burnBtn._wired) {
          burnBtn._wired = true;
          const self2 = this;
          burnBtn.addEventListener('click', function () { self2.burnGoldForDust(); });
        }
      }
      const grid = this.$('forge-grid');
      grid.innerHTML = '';
      const self = this;

      // ---- ULTIMATES section header ----
      const ultsHdr = document.createElement('div');
      ultsHdr.className = 'forge-section';
      ultsHdr.textContent = 'ULTIMATES — equip one';
      grid.appendChild(ultsHdr);

      const ownedUlts = (a.save.ownedUlts && a.save.ownedUlts.slice()) || ['cataclysm'];
      const activeUlt = a.save.activeUlt || 'cataclysm';
      Object.keys(ULTS).forEach(function (id) {
        const u = ULTS[id];
        const owned = ownedUlts.indexOf(id) !== -1;
        const equipped = activeUlt === id;
        const canBuy = !owned && a.save.dust >= u.cost;

        const wrap = document.createElement('div');
        wrap.className = 'forge-item ult' + (equipped ? ' equipped' : '');
        wrap.innerHTML =
          '<div class="head">' +
            '<div class="icon" style="color:' + u.color + '">' + u.icon + '</div>' +
            '<div class="body">' +
              '<div class="name" style="color:' + u.color + '">' + u.name + '</div>' +
              '<div class="lvl">CD ' + u.cooldown + 's' + (equipped ? ' · EQUIPPED' : '') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="desc">' + u.desc + '</div>';
        const btn = document.createElement('button');
        btn.className = 'buy';
        if (equipped) {
          btn.innerHTML = 'EQUIPPED';
          btn.disabled = true;
        } else if (owned) {
          btn.innerHTML = 'EQUIP';
          btn.addEventListener('click', function () { self.equipUlt(id); });
        } else {
          btn.disabled = !canBuy;
          btn.innerHTML = 'BUY<span class="cost">' + shortNum(u.cost) + ' DUST</span>';
          btn.addEventListener('click', function () { self.buyUlt(id); });
        }
        wrap.appendChild(btn);
        grid.appendChild(wrap);
      });

      // ---- PASSIVES section header ----
      const passHdr = document.createElement('div');
      passHdr.className = 'forge-section';
      passHdr.textContent = 'PASSIVE UPGRADES';
      grid.appendChild(passHdr);

      Object.keys(META).forEach(function (id) {
        const u = META[id];
        const lvl = (a.save.permUpgrades && a.save.permUpgrades[id]) | 0;
        const maxed = lvl >= u.max;
        const c = maxed ? Infinity : cost(id, lvl);
        const canBuy = !maxed && a.save.dust >= c;

        const wrap = document.createElement('div');
        wrap.className = 'forge-item' + (maxed ? ' maxed' : '');
        wrap.innerHTML =
          '<div class="head">' +
            '<div class="icon" style="color:' + u.color + '">' + u.icon + '</div>' +
            '<div class="body">' +
              '<div class="name" style="color:' + u.color + '">' + u.name + '</div>' +
              '<div class="lvl">Lv ' + lvl + ' / ' + u.max + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="desc">' + u.desc + '</div>';
        const btn = document.createElement('button');
        btn.className = 'buy';
        btn.disabled = !canBuy && !maxed;
        if (maxed) {
          btn.innerHTML = 'MAX';
        } else {
          btn.innerHTML = 'BUY<span class="cost">' + shortNum(c) + ' DUST</span>';
        }
        btn.addEventListener('click', function () { self.buyMetaUpgrade(id); });
        wrap.appendChild(btn);
        grid.appendChild(wrap);
      });
    }
    burnGoldForDust() {
      const a = this.app;
      const gold = (a.game && a.game.gold) || 0;
      const ratio = 80;
      if (gold < ratio) { a.fx.toast('NEED ' + ratio + '+ GOLD'); return; }
      const dust = Math.floor(gold / ratio);
      const goldUsed = dust * ratio;
      a.game.gold -= goldUsed;
      a.save.dust += dust;
      a.persist();
      a.fx.toast('+' + dust + ' DUST');
      this.renderForge();
    }
    buyUlt(id) {
      const a = this.app;
      const u = DDI.data.ULTS[id];
      if (!u) return;
      a.save.ownedUlts = a.save.ownedUlts || ['cataclysm'];
      if (a.save.ownedUlts.indexOf(id) !== -1) return;
      if (a.save.dust < u.cost) return;
      a.save.dust -= u.cost;
      a.save.ownedUlts.push(id);
      a.save.activeUlt = id;            // auto-equip on purchase
      a.persist();
      a.fx.toast('UNLOCKED ' + u.name.toUpperCase());
      this.renderForge();
    }
    equipUlt(id) {
      const a = this.app;
      a.save.ownedUlts = a.save.ownedUlts || ['cataclysm'];
      if (a.save.ownedUlts.indexOf(id) === -1) return;
      a.save.activeUlt = id;
      a.persist();
      a.fx.toast('EQUIPPED ' + DDI.data.ULTS[id].name.toUpperCase());
      this.renderForge();
    }
    buyMetaUpgrade(id) {
      const a = this.app;
      const META = DDI.data.META_UPGRADES;
      const u = META[id];
      if (!u) return;
      a.save.permUpgrades = a.save.permUpgrades || {};
      const lvl = a.save.permUpgrades[id] | 0;
      if (lvl >= u.max) return;
      const c = DDI.data.metaUpgradeCost(id, lvl);
      if (a.save.dust < c) return;
      a.save.dust -= c;
      a.save.permUpgrades[id] = lvl + 1;
      a.persist();
      a.fx.toast('+1 ' + u.name.toUpperCase());
      this.renderForge();
    }

    // ---- Settings ----
    openSettings() {
      const t = this.$('modal-title');         if (t) t.classList.add('hidden');
      const a = this.$('modal-auth');          if (a) a.classList.add('hidden');
      const c = this.$('modal-character');     if (c) c.classList.add('hidden');
      const ac = this.$('modal-act-complete'); if (ac) ac.classList.add('hidden');
      // Settings opened mid-run pauses the simulation so enemies/spawns freeze.
      const inRun = !!(this.app && this.app.game && this.app.game.running);
      if (inRun) this.app.game.paused = true;
      // Customize HUD only makes sense while a run is live (you need to see your HUD).
      const customBtn = this.$('btn-customize-hud');
      if (customBtn) customBtn.style.display = inRun ? '' : 'none';
      this.$('modal-settings').classList.remove('hidden');
      const s = (this.app.save && this.app.save.settings) || {};
      this.$('set-sound').checked = !!s.sound;
      this.$('set-autoaim').checked = !!s.autoAim;
      this.$('set-shake').checked = !!s.screenShake;
      this.renderKeybinds();
      const self = this;
      const btn = this.$('btn-keybinds-reset');
      if (btn && !btn._wired) {
        btn._wired = true;
        btn.addEventListener('click', function () {
          if (!self.app.save) return;
          self.app.save.keybinds = Object.assign({}, DDI.save.DEFAULT_KEYBINDS);
          self.app.persist();
          self.renderKeybinds();
        });
      }
    }
    closeSettings() {
      this.$('modal-settings').classList.add('hidden');
      // Routing in priority order: act-complete → ACT modal, login → login modal,
      // pause/in-run → pause modal, otherwise → title
      if (this._settingsFromActComplete) {
        this._settingsFromActComplete = false;
        this.showActComplete(this.app.game.act || 1);
      } else if (this.pauseOpen || this.app.game.running) {
        this.$('modal-pause').classList.remove('hidden');
      } else if (this._settingsFromLogin) {
        this._settingsFromLogin = false;
        this.$('modal-auth').classList.remove('hidden');
      } else {
        this.$('modal-title').classList.remove('hidden');
      }
    }

    renderKeybinds() {
      const list = this.$('keybind-list');
      if (!list) return;
      list.innerHTML = '';
      const labels = {
        moveUp: 'Move Up',
        moveDown: 'Move Down',
        moveLeft: 'Move Left',
        moveRight: 'Move Right',
        sprint: 'Sprint',
        ult: 'Ultimate',
        magnet: 'Loot Magnet',
        pause: 'Pause',
      };
      const kb = this.app.save.keybinds || Object.assign({}, DDI.save.DEFAULT_KEYBINDS);
      const self = this;
      Object.keys(labels).forEach(function (id) {
        const row = document.createElement('div');
        row.className = 'keybind-row';
        const lab = document.createElement('span'); lab.className = 'label'; lab.textContent = labels[id];
        const key = document.createElement('button'); key.className = 'key'; key.type = 'button';
        key.textContent = displayKey(kb[id]);
        key.title = 'Click then press a key to rebind';
        key.addEventListener('click', function () {
          if (self._listeningKey) self._listeningKey.classList.remove('listening');
          self._listeningKey = key;
          self._listeningId = id;
          key.classList.add('listening');
          key.textContent = '...';
        });
        row.appendChild(lab); row.appendChild(key);
        list.appendChild(row);
      });

      // Single global keydown listener (attach once)
      if (!this._kbListener) {
        this._kbListener = function (e) {
          if (!self._listeningKey || !self._listeningId) return;
          // Special keys: Escape cancels; otherwise capture
          if (e.key === 'Escape') {
            self._listeningKey.classList.remove('listening');
            self._listeningKey.textContent = displayKey(self.app.save.keybinds[self._listeningId]);
            self._listeningKey = null;
            self._listeningId = null;
            e.preventDefault();
            return;
          }
          self.app.save.keybinds = self.app.save.keybinds || {};
          self.app.save.keybinds[self._listeningId] = e.key;
          self.app.persist();
          self._listeningKey.classList.remove('listening');
          self._listeningKey.textContent = displayKey(e.key);
          self._listeningKey = null;
          self._listeningId = null;
          e.preventDefault();
        };
        addEventListener('keydown', this._kbListener, true);
      }
    }
    resetSaveConfirm() {
      if (!confirm('Reset all progress? Soul Dust, upgrades, and best floor will be lost.')) return;
      DDI.save.reset();
      this.app.save = DDI.save.load();
      this.app.persist();
      this.app.fx.toast('SAVE RESET');
      this.openSettings(); // refresh
      this.showTitle();
    }

    refreshHUD() {
      const a = this.app;
      // Belt-and-suspenders: keep the .in-game class in sync with game.running.
      // Catches any code path that drifts the class state out of sync (e.g.
      // settings/pause juggling) and makes the HUD reappear automatically.
      const _root = document.getElementById('game-root');
      if (_root) {
        const want = !!(a.game && a.game.running);
        const has = _root.classList.contains('in-game');
        if (want && !has)      _root.classList.add('in-game');
        else if (!want && has) _root.classList.remove('in-game');
      }
      const hp = Math.max(0, a.hero.hp);
      const max = a.hero.maxHp || 1;
      const pct = clamp(hp / max, 0, 1);
      this.$('hp-fill').style.width = (pct * 100).toFixed(1) + '%';
      this.$('hp-text').textContent = Math.ceil(hp) + ' / ' + max;

      const stEl = this.$('stamina-fill');
      if (stEl) {
        const stPct = clamp((a.hero.stamina || 0) / (a.hero.maxStamina || 1), 0, 1);
        stEl.style.width = (stPct * 100).toFixed(1) + '%';
        stEl.classList.toggle('sprinting', !!a.hero.sprinting);
        stEl.classList.toggle('empty', stPct <= 0.02);
      }

      // Zone header — current location at the top of the screen
      const zh = this.$('zone-header');
      if (zh) {
        const act = (a.game && a.game.act) || 1;
        const name = (a.zone && a.zone.displayName) || 'DUNGEON';
        const actEl  = this.$('zone-header-act');
        const nameEl = this.$('zone-header-name');
        if (actEl)  actEl.textContent  = 'ACT ' + act + ' ·';
        if (nameEl) nameEl.textContent = name;
      }

      // Zone progress (only visible inside biome zones) — bars adapt to the
      // randomized zone objective (standard, survival, bounty, defend, ritual).
      const zoneWrap = this.$('zone-progress-wrap');
      if (zoneWrap) {
        const inZone = a.zone && a.zone.name !== 'main' && a.zone.killsNeeded > 0;
        const bossUp = a.zone && (a.zone.finalEliteSpawned || a.zone.fadeOutBegan);
        if (inZone && !bossUp) {
          zoneWrap.classList.remove('hidden');
          this.$('zone-progress-name').textContent = a.zone.displayName || 'ZONE';
          const kFill = zoneWrap.querySelector('.zp-fill-kills');
          const sFill = zoneWrap.querySelector('.zp-fill-shards');
          const kText = zoneWrap.querySelector('.zp-text-kills');
          const sText = zoneWrap.querySelector('.zp-text-shards');
          const kIcon = zoneWrap.querySelector('.zp-icon.zp-kills');
          const sIcon = zoneWrap.querySelector('.zp-icon.zp-shards');
          const sRow  = sIcon && sIcon.parentElement;
          const obj = a.zone.objective || 'standard';
          // Default visibility for the second row — most objectives use both rows
          if (sRow) sRow.style.display = '';
          if (obj === 'survival' || obj === 'defend') {
            // Single TIME bar; hide the second row
            if (sRow) sRow.style.display = 'none';
            if (kIcon) kIcon.textContent = '⏱';
            const total = (a.zone.objectiveDef && a.zone.objectiveDef.durationSeconds) || 60;
            const left = Math.max(0, Math.ceil(a.zone.survivalT || 0));
            const pct = clamp(1 - left / Math.max(1, total), 0, 1);
            if (kFill) kFill.style.width = (pct * 100).toFixed(1) + '%';
            if (kText) kText.textContent = (obj === 'defend' ? 'DEFEND ' : 'SURVIVE ') +
              (Math.floor(left / 60)) + ':' + String(left % 60).padStart(2, '0');
          } else if (obj === 'bounty') {
            if (kIcon) kIcon.textContent = '⚔';
            if (sIcon) sIcon.textContent = '☠';
            const need = a.zone.bountyTotal || 3;
            const cur  = Math.min(need, a.zone.bountyKilled || 0);
            if (kFill) kFill.style.width = ((cur / Math.max(1, need)) * 100).toFixed(1) + '%';
            if (kText) kText.textContent = 'BOUNTIES ' + cur + ' / ' + need;
            // Second row stays as kills counter (decorative, no win-gate)
            const kn = (a.zone.killsInZone || 0);
            if (sFill) sFill.style.width = Math.min(100, (kn / 100) * 100).toFixed(1) + '%';
            if (sText) sText.textContent = kn + ' kills';
          } else if (obj === 'ritual') {
            if (kIcon) kIcon.textContent = '◯';
            if (sIcon) sIcon.textContent = '☠';
            const need = (a.zone.ritualCircles && a.zone.ritualCircles.length) || 3;
            const cur  = a.zone.ritualDone || 0;
            // Sum partial charges into the bar so it grows continuously
            let partial = 0;
            if (a.zone.ritualCircles) {
              a.zone.ritualCircles.forEach(function (c) { partial += (c.charge || 0); });
              partial = partial / (need * 100);
            }
            if (kFill) kFill.style.width = ((partial) * 100).toFixed(1) + '%';
            if (kText) kText.textContent = 'CIRCLES ' + cur + ' / ' + need;
            const kn = (a.zone.killsInZone || 0);
            if (sFill) sFill.style.width = Math.min(100, (kn / 100) * 100).toFixed(1) + '%';
            if (sText) sText.textContent = kn + ' kills';
          } else {
            // standard: kills + shards (existing)
            if (kIcon) kIcon.textContent = '☠';
            if (sIcon) sIcon.textContent = '◆';
            const kNeed = a.zone.killsNeeded;
            const kCur = Math.min(kNeed, a.zone.killsInZone || 0);
            const sNeed = a.zone.itemsTotal || 0;
            const sCur = Math.min(sNeed, a.zone.itemsCollected || 0);
            if (kFill) kFill.style.width = ((kCur / Math.max(1, kNeed)) * 100).toFixed(1) + '%';
            if (sFill) sFill.style.width = ((sCur / Math.max(1, sNeed)) * 100).toFixed(1) + '%';
            if (kText) kText.textContent = kCur + ' / ' + kNeed;
            if (sText) sText.textContent = sCur + ' / ' + sNeed;
          }
          const status = this.$('zone-progress-status');
          if (status) status.textContent = a.zone.finalEliteSpawned ? '★ SLAY THE BOSS ★' : '';
        } else {
          zoneWrap.classList.add('hidden');
        }
      }

      // ULT cooldown indicator (round button + horizontal ULT bar) — show active ult name
      const ultBtn = this.$('btn-overdrive');
      const ultText = this.$('ult-cd-text');
      const ultBar = this.$('ult-bar');
      const ultFill = this.$('ult-bar-fill');
      const ultStatus = document.querySelector('.ult-bar-status');
      const ultName = document.querySelector('.ult-bar-name');
      if (a.ult) {
        const activeId = (a.save && a.save.activeUlt) || 'cataclysm';
        const ULTS = DDI.data.ULTS;
        const ultDef = ULTS[activeId] || ULTS.cataclysm;
        const ready = a.ult.cd <= 0;
        const pct = ready ? 1 : (1 - a.ult.cd / a.ult.maxCd);
        if (ultBtn) {
          ultBtn.classList.toggle('ult-ready', ready);
          ultBtn.classList.toggle('ult-cooling', !ready);
        }
        if (ultText) ultText.textContent = ready ? '' : Math.ceil(a.ult.cd);
        if (ultBar) {
          ultBar.classList.toggle('ready', ready);
          ultBar.classList.toggle('cooling', !ready);
        }
        if (ultFill) ultFill.style.width = (pct * 100).toFixed(1) + '%';
        if (ultName) ultName.textContent = ultDef.name.toUpperCase();
        if (ultStatus) ultStatus.textContent = ready ? 'READY · SPACE' : Math.ceil(a.ult.cd) + 's';
      }

      const xpPct = clamp(a.game.xp / a.game.xpNeed, 0, 1);
      this.$('xp-fill').style.width = (xpPct * 100).toFixed(1) + '%';
      this.$('xp-text').textContent = 'Lv ' + a.game.level;

      this.$('floor-num').textContent = 'FLOOR ' + a.game.floor;
      this.$('time').textContent = fmtTime(a.game.time);

      this.$('gold').textContent = shortNum(a.game.gold);
      this.$('dust').textContent = shortNum(a.save.dust);

      const bar = this.$('ability-bar');
      if (bar.children.length !== a.hero.abilities.length) {
        bar.innerHTML = '';
        for (let i = 0; i < a.hero.abilities.length; i++) {
          this.buildSlot(bar, a.hero.abilities[i], i);
        }
      } else {
        for (let i = 0; i < a.hero.abilities.length; i++) {
          const ab = a.hero.abilities[i];
          const slot = bar.children[i];
          if (!slot) continue;
          slot.querySelector('.lvl').textContent = ab.level;
          const def = ABILITIES[ab.id];
          const stats = def.scale(ab.level - 1, def.base);
          const cdMax = (stats.cooldown || 1) * a.hero.cooldownMult;
          // Continuous abilities (orbital/aura) have no cooldown UI
          const cdPct = (def.type === 'orbital' || def.type === 'aura')
            ? 0
            : clamp(ab.cd / cdMax, 0, 1);
          slot.querySelector('.cd').style.height = (cdPct * 100).toFixed(0) + '%';
          slot.querySelector('.cd').style.transform = 'translateY(' + ((1-cdPct)*100) + '%)';
          if (cdPct <= 0.05 && def.type !== 'orbital' && def.type !== 'aura') {
            slot.classList.add('ready');
          } else {
            slot.classList.remove('ready');
          }
        }
      }
    }

    buildSlot(bar, ab, idx) {
      const def = ABILITIES[ab.id];
      const slot = document.createElement('button');
      slot.className = 'ability-slot';
      slot.type = 'button';
      slot.style.borderColor = def.color;
      slot.style.color = def.color;
      slot.title = def.name + ' — tap for info, right-click or long-press to toggle on/off';
      slot.innerHTML =
        '<div class="ring"></div>' +
        '<span class="glyph">' + def.icon + '</span>' +
        '<span class="lvl">' + ab.level + '</span>' +
        '<div class="cd"></div>' +
        '<div class="off-marker"></div>';
      slot.classList.toggle('off', !!ab.disabled);
      const self = this;
      // Long-press / right-click toggles disabled state
      let pressTimer = null, suppressTap = false;
      const startPress = function () {
        suppressTap = false;
        pressTimer = setTimeout(function () {
          suppressTap = true;
          self.toggleAbility(ab.id);
        }, 480);
      };
      const cancelPress = function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
      slot.addEventListener('mousedown', function (ev) {
        // Right mouse button → toggle directly (cleaner than waiting on long-press)
        if (ev.button === 2) {
          ev.preventDefault();
          suppressTap = true;
          self.toggleAbility(ab.id);
          return;
        }
        startPress();
      });
      slot.addEventListener('mouseup', cancelPress);
      slot.addEventListener('mouseleave', cancelPress);
      slot.addEventListener('touchstart', function (ev) { ev.preventDefault(); startPress(); }, { passive: false });
      slot.addEventListener('touchend',   function () { cancelPress(); });
      slot.addEventListener('touchcancel', function () { cancelPress(); });
      const tap = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (suppressTap) { suppressTap = false; return; }
        self.tapAbility(ab.id, slot);
      };
      slot.addEventListener('click', tap);
      bar.appendChild(slot);
    }

    toggleAbility(abilityId) {
      const a = this.app;
      const ab = a.hero.abilities.find(function (x) { return x.id === abilityId; });
      if (!ab) return;
      ab.disabled = !ab.disabled;
      // Persistent-buff abilities clear their per-tick effect when turned off
      const def = ABILITIES[ab.id];
      if (ab.disabled && def && def.type === 'buff') {
        a.hero._buffDR = 0;
        a.hero._buffCrit = 0;
      }
      const onoff = ab.disabled ? 'OFF' : 'ON';
      a.fx.toast(def.name.toUpperCase() + ' — ' + onoff);
      // Refresh the slot's visual state
      const bar = this.$('ability-bar');
      if (bar && bar.children) {
        const idx = a.hero.abilities.findIndex(function (x) { return x.id === abilityId; });
        const slot = bar.children[idx];
        if (slot) slot.classList.toggle('off', !!ab.disabled);
      }
    }

    tapAbility(abilityId, slotEl) {
      const a = this.app;
      const ab = a.hero.abilities.find(function (x) { return x.id === abilityId; });
      if (!ab) return;
      const def = ABILITIES[ab.id];
      const stats = def.scale(ab.level - 1, def.base);
      // Tapping a slot now only surfaces the info tooltip — abilities auto-cast
      // on cooldown.  No more "tap to shave" or force-cast.
      this.showAbilityTooltip(slotEl, def, ab, stats);
    }

    // Static ability tooltip — used on the character-select screen where there
    // is no slot/level state, just a hover info card showing what the ability
    // will do at level 1.
    showAbilityInfo(anchorEl, def) {
      let tip = document.getElementById('ability-tooltip');
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'ability-tooltip';
        document.getElementById('game-root').appendChild(tip);
      }
      const stats = def.scale ? def.scale(0, def.base) : def.base;
      const descLine = def.desc_at ? def.desc_at(0, stats) : '';
      tip.innerHTML =
        '<div class="tip-head" style="color:' + (def.color || '#fff') + '">' + def.icon + ' ' + def.name + ' <span class="tip-lvl">Lv 1</span></div>' +
        '<div class="tip-desc">' + (def.desc || '') + '</div>' +
        (descLine ? '<div class="tip-stats">' + descLine + '</div>' : '');
      if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        tip.style.left = (r.left + r.width / 2) + 'px';
        tip.style.top  = (r.top - 10) + 'px';
      }
      tip.classList.add('visible');
      clearTimeout(this._tooltipTimer);
      const self = this;
      this._tooltipTimer = setTimeout(function () { tip.classList.remove('visible'); }, 3000);
    }

    showAbilityTooltip(slotEl, def, ab, stats) {
      // Make sure a single tooltip element exists
      let tip = document.getElementById('ability-tooltip');
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'ability-tooltip';
        document.getElementById('game-root').appendChild(tip);
      }
      const descLine = def.desc_at ? def.desc_at(ab.level - 1, stats) : def.desc;
      const stateTag = ab.disabled
        ? '<span class="tip-state off">DISABLED</span>'
        : '<span class="tip-state on">ACTIVE</span>';
      tip.innerHTML =
        '<div class="tip-head" style="color:' + def.color + '">' + def.icon + ' ' + def.name + ' <span class="tip-lvl">Lv ' + ab.level + '</span> ' + stateTag + '</div>' +
        '<div class="tip-desc">' + def.desc + '</div>' +
        '<div class="tip-stats">' + descLine + '</div>' +
        '<div class="tip-hint">RIGHT-CLICK or LONG-PRESS to ' + (ab.disabled ? 'enable' : 'disable') + '</div>';
      // Position above the slot
      if (slotEl) {
        const r = slotEl.getBoundingClientRect();
        tip.style.left = (r.left + r.width/2) + 'px';
        tip.style.top  = (r.top - 10) + 'px';
      }
      tip.classList.add('visible');
      clearTimeout(this._tooltipTimer);
      const self = this;
      this._tooltipTimer = setTimeout(function () { tip.classList.remove('visible'); }, 2200);
    }

    setSlaughterTier(tier, label) {
      const root = document.getElementById('game-root');
      root.classList.remove('tier-bloody','tier-frenzy','tier-massacre','tier-apocalypse','tier-godkill');
      const map = ['','tier-bloody','tier-frenzy','tier-massacre','tier-apocalypse','tier-godkill'];
      if (map[tier]) root.classList.add(map[tier]);
      // No tier yet: just show "COMBO". After: tier name + bonus.
      this.$('slaughter-text').textContent = (tier > 0 ? label : 'COMBO');
      // Big top-center banner — surfaces the active tier + exact damage bonus.
      // Hidden when no tier; pops into view + hot palette when the combo climbs.
      const banner = this.$('combo-banner');
      if (banner) {
        if (tier > 0) {
          banner.classList.remove('hidden');
          banner.classList.remove('tier-3','tier-4','tier-5');
          if (tier >= 5)      banner.classList.add('tier-5');
          else if (tier === 4) banner.classList.add('tier-4');
          else if (tier === 3) banner.classList.add('tier-3');
          // Parse "FRENZY +20%" → tier name + bonus
          const labels = ['—','BLOODY','FRENZY','MASSACRE','APOCALYPSE','GODKILL'];
          const icons  = ['',  '🩸',    '🔥',    '💀',       '☄️',         '👑'];
          const bonusPct = tier * 10;
          const tEl = banner.querySelector('.combo-tier');
          const bEl = banner.querySelector('.combo-bonus');
          const iEl = banner.querySelector('.combo-icon');
          if (tEl) tEl.textContent = labels[tier] || 'COMBO';
          if (bEl) bEl.textContent = '+' + bonusPct + '% DMG';
          if (iEl) iEl.textContent = icons[tier] || '🔥';
        } else {
          banner.classList.add('hidden');
        }
      }
    }
    setSlaughterMeter(value) {
      this.$('slaughter-fill').style.width = (value * 100).toFixed(1) + '%';
    }

    showBoss(name, frac) {
      this.$('boss-wrap').classList.remove('hidden');
      this.$('boss-name').textContent = name.toUpperCase();
      this.$('boss-fill').style.width = (frac * 100) + '%';
    }
    updateBoss(frac) { this.$('boss-fill').style.width = (clamp(frac,0,1) * 100) + '%'; }
    hideBoss() { this.$('boss-wrap').classList.add('hidden'); }

    showTitle() {
      // Gate: must have a save (Supabase user, guest, or local profile).  Don't
      // require DDI.save.activeId() — Supabase users may have no localStorage profile.
      if (!this.app.save) { this.showAuth(); return; }
      // Show tutorial on first run
      if (!this.app.save.tutorialDone && !this._tutorialShown) {
        this._tutorialShown = true;
        this.openTutorial(0);
        return;
      }
      this.$('modal-auth').classList.add('hidden');
      this.$('modal-character').classList.add('hidden');
      this.$('modal-title').classList.remove('hidden');
      this.$('modal-tutorial').classList.add('hidden');
      this.$('modal-death').classList.add('hidden');
      this.$('modal-levelup').classList.add('hidden');
      this.$('modal-forge').classList.add('hidden');
      this.$('modal-settings').classList.add('hidden');
      this.modalOpen = true;
      // Resolve display name: Supabase profile > localStorage profile > 'Adventurer'
      let pname = 'Adventurer';
      if (DDI.auth && DDI.auth.profile) {
        const p = DDI.auth.profile();
        if (p && p.display_name) pname = p.display_name;
      }
      if (pname === 'Adventurer' && DDI.save.activeName) {
        pname = DDI.save.activeName() || pname;
      }
      this.$('profile-name').textContent = pname.toUpperCase();
      const rk = this.app.save.accountRank || 1;
      const xp = this.app.save.accountXp   || 0;
      const D = DDI.data || {};
      const xpThis = (D.accountXpForRank ? D.accountXpForRank(rk) : 0);
      const xpNext = (D.accountXpForRank ? D.accountXpForRank(rk + 1) : xpThis + 100);
      const into   = Math.max(0, xp - xpThis);
      const span   = Math.max(1, xpNext - xpThis);
      const pct    = Math.min(100, (into / span) * 100);
      // Current character card — shows who's selected + their starter abilities
      const charKey = (this.app.save && this.app.save.character) || 'default';
      const CLASSES = (D && D.CLASSES) || {};
      const ABILITIES = (D && D.ABILITIES) || {};
      const klass = CLASSES[charKey] || CLASSES.default || { name: 'Warrior', starters: [] };
      const starters = (klass.starters || []).map(function (id) {
        const ad = ABILITIES[id];
        return ad ? (ad.icon + ' ' + ad.name) : id;
      }).join(' · ');
      // Portrait icon — pick a class glyph for the portrait box.  Uses unicode
      // fallback rather than asset paths so it's never broken.
      const portraitIcons = {
        default: '⚔', rogue: '🗡', ranger: '🏹', mage: '🔥',
        paladin: '🛡', berserker: '🪓', necromancer: '💀',
      };
      const portraitIcon = portraitIcons[charKey] || '⚔';
      const charCard = '' +
        '<div class="current-char">' +
          '<div class="cc-portrait">' + portraitIcon + '</div>' +
          '<div class="cc-body">' +
            '<div class="cc-label">PLAYING AS</div>' +
            '<div class="cc-name">' + (klass.name || 'WARRIOR').toUpperCase() + '</div>' +
            '<div class="cc-abils">' + (starters || '—') + '</div>' +
          '</div>' +
        '</div>';
      // Saved-runs panel — one row per saved class with progress info.
      // Each row's data-char attribute is read by the delegated click
      // handler in init() to dispatch continueRunFor.
      const savedEl = this.$('saved-runs');
      const map = (this.app.save && this.app.save.runStates) || {};
      const rows = [];
      for (const k in map) if (map[k]) rows.push(map[k]);
      // Most-recently-saved first
      rows.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
      if (savedEl) {
        if (!rows.length) {
          savedEl.classList.add('hidden');
          savedEl.innerHTML = '';
        } else {
          const portraitIcons = {
            default: '⚔', rogue: '🗡', ranger: '🏹', mage: '🔥',
            paladin: '🛡', berserker: '🪓', necromancer: '💀',
          };
          const fmtTime = function (s) {
            s = Math.floor(s || 0);
            const m = Math.floor(s / 60); const ss = s % 60;
            return m + ':' + (ss < 10 ? '0' : '') + ss;
          };
          const html =
            '<div class="sr-head">SAVED RUNS</div>' +
            rows.map(function (rs) {
              const ck = rs.character || 'default';
              const cls = (D.CLASSES && D.CLASSES[ck]) || { name: ck };
              const ico = portraitIcons[ck] || '⚔';
              const t   = (rs.game && rs.game.time) || 0;
              const lvl = (rs.game && rs.game.level) || 1;
              const act = (rs.game && rs.game.act) || 1;
              return '' +
                '<button class="sr-row" type="button" data-char="' + ck + '">' +
                  '<span class="sr-ico">' + ico + '</span>' +
                  '<span class="sr-body">' +
                    '<span class="sr-class">' + (cls.name || ck).toUpperCase() + '</span>' +
                    '<span class="sr-stats">ACT ' + act + ' · LV ' + lvl + ' · ' + fmtTime(t) + '</span>' +
                  '</span>' +
                  '<span class="sr-cta">▶ CONTINUE</span>' +
                '</button>';
            }).join('');
          savedEl.innerHTML = html;
          savedEl.classList.remove('hidden');
        }
      }
      // Update DESCEND label to "NEW RUN" when this character has a save.
      const startBtn = this.$('btn-start');
      if (startBtn) {
        const charHasSave = !!(this.app && this.app.activeSavedRun && this.app.activeSavedRun());
        startBtn.textContent = charHasSave ? 'NEW RUN' : 'DESCEND';
      }
      this.$('title-stats').innerHTML =
        charCard +
        '<div class="rank-block">' +
          '<div class="rank-row">' +
            '<span class="rank-pill">RANK <b>' + rk + '</b></span>' +
            '<button id="btn-rank-unlocks" class="rank-info-btn" type="button" title="View unlocks">UNLOCKS</button>' +
            '<span class="rank-xp-text">' + into + ' / ' + (xpNext - xpThis) + ' XP</span>' +
          '</div>' +
          '<div class="rank-bar"><div class="rank-bar-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
        '</div>' +
        '<div class="title-stats-row">' +
          '<span><span class="label">BEST FLOOR</span> <b>' + (this.app.save.bestFloor || 1) + '</b></span>' +
          '<span><span class="label">SOUL DUST</span> <b>' + shortNum(this.app.save.dust || 0) + '</b></span>' +
        '</div>';
    }
    hideTitle() { this.$('modal-title').classList.add('hidden'); this.modalOpen = false; }

    showDeath(summary) {
      const a = this.app;
      this.modalOpen = true;
      const m = this.$('modal-death');
      m.classList.remove('hidden');
      this.$('death-title').textContent = summary.win ? 'FLOOR CLEARED' : 'YOU HAVE FALLEN';
      // Revive button — only on death (not on win), not after a voluntary quit,
      // only if not already used this run, and only if dust ≥ 1000.
      const reviveBtn = this.$('btn-revive');
      if (reviveBtn) {
        const quit = !!(a.game && a.game.quitFromMenu);
        const canRevive = !summary.win && !quit && !(a.game && a.game.revivesUsed) && (a.save && a.save.dust >= 1000);
        const alreadyDead = !summary.win && (a.game && a.game.revivesUsed);
        const broke      = !summary.win && (!a.save || a.save.dust < 1000) && !alreadyDead;
        // Hide on win OR on voluntary quit
        reviveBtn.classList.toggle('hidden', summary.win || quit);
        reviveBtn.disabled = !canRevive;
        if (canRevive)            reviveBtn.textContent = 'REVIVE · 1,000 DUST';
        else if (alreadyDead)     reviveBtn.textContent = 'REVIVE USED';
        else if (broke)           reviveBtn.textContent = 'NEED 1,000 DUST TO REVIVE';
        const self = this;
        if (!reviveBtn._wired) {
          reviveBtn._wired = true;
          reviveBtn.addEventListener('click', function () {
            if (reviveBtn.disabled) return;
            self.app.revive();
          });
        }
      }
      const b = summary.breakdown || {};
      const breakdownHtml =
        '<div class="row sub"><span>· from Kills</span><span class="v dust">+' + (b.kills||0) + '</span></div>' +
        '<div class="row sub"><span>· from Elites</span><span class="v dust">+' + (b.elites||0) + '</span></div>' +
        '<div class="row sub"><span>· from Bosses</span><span class="v dust">+' + (b.bosses||0) + '</span></div>' +
        '<div class="row sub"><span>· from Level</span><span class="v dust">+' + (b.level||0) + '</span></div>' +
        '<div class="row sub"><span>· from Gold (1 dust per 25 gold)</span><span class="v dust">+' + (b.gold||0) + '</span></div>';
      const acctXp = a._lastRunXpEarned || 0;
      const rankUp = !!a._lastRunRankUp;
      this.$('death-summary').innerHTML =
        '<div class="row"><span>Time</span><span class="v">' + fmtTime(a.game.time) + '</span></div>' +
        '<div class="row"><span>Level</span><span class="v">' + a.game.level + '</span></div>' +
        '<div class="row"><span>Kills</span><span class="v">' + a.game.kills + '</span></div>' +
        '<div class="row"><span>Elites Slain</span><span class="v">' + a.game.elites + '</span></div>' +
        '<div class="row"><span>Bosses Slain</span><span class="v">' + a.game.bosses + '</span></div>' +
        '<div class="row"><span>Gold Earned</span><span class="v gold">' + shortNum(a.game.gold) + '</span></div>' +
        '<hr class="death-divider" />' +
        '<div class="row"><span><b>Soul Dust Earned</b></span><span class="v dust"><b>+' + shortNum(summary.dustEarned) + '</b></span></div>' +
        breakdownHtml +
        '<hr class="death-divider" />' +
        '<div class="row"><span><b>Account XP Earned</b></span><span class="v" style="color:#b266ff"><b>+' + acctXp + '</b></span></div>' +
        '<div class="row"><span>Rank</span><span class="v"><b>' + (a.save.accountRank || 1) + '</b>' + (rankUp ? ' <span style="color:#ffd966">RANK UP!</span>' : '') + '</span></div>';
    }
    hideDeath() { this.$('modal-death').classList.add('hidden'); this.modalOpen = false; }

    openLevelUp() {
      if (this.app.game.pendingLevelUps <= 0) return;
      // If already open, just bump the badge — don't re-roll while user is choosing
      if (!this.$('modal-levelup').classList.contains('hidden')) {
        this.refreshLevelUpBadge();
        return;
      }
      // Do NOT pause - game keeps running. Player chooses when ready.
      this.rerolls = 3;
      this.$('reroll-count').textContent = this.rerolls + ' (then 50g)';
      this.$('modal-levelup').classList.remove('hidden');
      this.renderChoices();
      this.refreshLevelUpBadge();
    }
    closeLevelUp() {
      const self = this;
      this.app.game.pendingLevelUps--;
      this.refreshLevelUpBadge();
      if (this.app.game.pendingLevelUps > 0) {
        // Re-render with fresh choices, don't hide
        setTimeout(function () { self.renderChoices(); }, 60);
      } else {
        this.$('modal-levelup').classList.add('hidden');
      }
    }
    refreshLevelUpBadge() {
      const badge = this.$('lvl-pending-badge');
      const n = this.app.game.pendingLevelUps;
      if (badge) {
        badge.textContent = n > 1 ? '×' + n : '';
        badge.classList.toggle('hidden', n <= 1);
      }
    }
    renderChoices() {
      const choices = Leveling.buildChoices(this.app, 3);
      this._currentChoices = choices;
      const wrap = this.$('levelup-choices');
      wrap.innerHTML = '';
      const self = this;
      choices.forEach(function (c, idx) {
        const el = document.createElement('button');
        el.className = 'choice';
        const view = self.choiceView(c);
        if (c.kind === 'new') el.classList.add('new');
        el.innerHTML =
          '<span class="key-num">' + (idx + 1) + '</span>' +
          '<div class="icon">' + view.icon + '</div>' +
          '<div class="body">' +
            '<div class="lvl-tag">' + view.tag + '</div>' +
            '<div class="name" style="color:' + view.color + '">' + view.name + '</div>' +
            '<div class="desc">' + view.desc + '</div>' +
          '</div>';
        el.addEventListener('click', function () {
          Leveling.applyChoice(self.app, c);
          self.closeLevelUp();
        });
        wrap.appendChild(el);
      });
    }
    choiceView(c) {
      if (c.kind === 'new') {
        const def = ABILITIES[c.id];
        return { icon: def.icon, name: def.name, color: def.color, tag: 'NEW ABILITY', desc: def.desc };
      }
      if (c.kind === 'level') {
        const def = ABILITIES[c.id];
        const a = this.app.hero.abilities.find(function (x) { return x.id === c.id; });
        const newLvl = (a ? a.level : 0) + 1;
        const stats = def.scale(newLvl - 1, def.base);
        const desc = def.desc_at ? def.desc_at(newLvl - 1, stats) : def.desc;
        return { icon: def.icon, name: def.name + ' Lv ' + newLvl, color: def.color, tag: 'UPGRADE', desc };
      }
      if (c.kind === 'upgrade') {
        const u = UPGRADES[c.id];
        return { icon: u.icon, name: u.name, color: '#fff', tag: 'PASSIVE', desc: u.desc };
      }
      return { icon: '?', name: '?', color: '#fff', tag: '', desc: '' };
    }
    rerollChoices() {
      const a = this.app;
      if (this.rerolls > 0) {
        this.rerolls--;
        this.$('reroll-count').textContent = this.rerolls + ' (then 50g)';
        this.renderChoices();
        return;
      }
      // Out of free rerolls — spend gold
      if (a.game.gold >= 50) {
        a.game.gold -= 50;
        this.$('reroll-count').textContent = '(50g)';
        this.renderChoices();
      } else {
        a.fx.toast('NEED 50 GOLD');
      }
    }
    skipChoice() {
      this.app.save.dust += 50;
      this.app.persist();
      this.closeLevelUp();
    }
  }
  return UI;
})();
