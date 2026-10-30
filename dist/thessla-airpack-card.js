/*
 * Thessla AirPack card for Home Assistant
 * Main screen laid out like the unit's wall panel: clock, season / EKO-KOMFORT / mode,
 * ventilation intensity with airflow, supply temperature, filter wear and special functions.
 * Tapping intensity or temperature opens an adjustment screen, the gear opens readings.
 *
 * Not affiliated with Thessla Green; no manufacturer logo, wordmark or artwork is used.
 */

const CARD_VERSION = "2.2.0";

// key: [domains, candidate entity names (friendly-name suffixes)]
const ENTITY_KEYS = {
  mode: [["select"], ["Tryb pracy"]],
  season: [["select"], ["Sezon"]],
  special: [["select"], ["Funkcja specjalna", "Funkcje"]],
  comfort: [["select"], ["Tryb EKO-KOMFORT", "EKO-KOMFORT", "EKO / KOMFORT"]],
  intensity: [["number", "select"], ["Intensywność", "Intensywność wentylacji - tryb manualny"]],
  intensity_now: [["sensor"], ["Intensywność wentylacji", "Zadana intensywność wentylacji (nawiew)"]],
  setpoint: [["number"], ["Temperatura nawiewu – nastawa", "Temperatura nawiewu - nastawa"]],
  power: [["switch"], ["Centrala włączona", "Wł⁄wył", "Wł/wył"]],
  outside: [["sensor"], ["Temperatura zewnętrzna (TZ1)", "Temperatura powietrza zewnętrznego (TZ1)"]],
  supply: [["sensor"], ["Temperatura nawiewu (TN1)", "Temperatura powietrza nawiewanego (TN1)"]],
  extract: [["sensor"], ["Temperatura wywiewu (TP)", "Temperatura powietrza usuwanego z pomieszczenia (TP)"]],
  fpx_temp: [["sensor"], ["Temperatura za nagrzewnicą FPX (TZ2)", "Temperatura powietrza za nagrzewnicą FPX (TZ2)"]],
  ambient: [["sensor"], ["Temperatura otoczenia (TO)"]],
  supply_flow: [["sensor"], ["Strumień nawiewu", "Wartość chwilowa strumienia powietrza - nawiew"]],
  extract_flow: [["sensor"], ["Strumień wywiewu", "Wartość chwilowa strumienia powietrza - wywiew"]],
  supply_percent: [["sensor"], ["Intensywność nawiewu", "Zadana intensywność wentylacji (nawiew)"]],
  extract_percent: [["sensor"], ["Intensywność wywiewu", "Zadana intensywność wentylacji (wywiew)"]],
  filter_supply: [["sensor"], ["Zużycie filtra nawiewnego", "Stopień zużycia filtra nawiewnego"]],
  filter_extract: [["sensor"], ["Zużycie filtra wywiewnego", "Stopień zużycia filtra wywiewnego"]],
  alarm_s: [["binary_sensor"], ["Alarm S"]],
  alarm_e: [["binary_sensor"], ["Ostrzeżenie E"]],
  bypass: [["binary_sensor"], ["Bypass otwarty"]],
  gwc: [["binary_sensor"], ["GWC"]],
  fpx: [["binary_sensor"], ["FPX"]],
  erv: [["binary_sensor"], ["ERV"]],
  hood: [["binary_sensor"], ["Wejście okap"]],
  humidistat: [["binary_sensor"], ["Higrostat"]],
  air_quality: [["binary_sensor"], ["Czujnik jakości powietrza"]],
  online: [["binary_sensor"], ["Połączenie z centralą", "Status"]],
  clock: [["text_sensor", "sensor"], ["Zegar centrali"]],
  comfort_status: [["sensor"], ["Status KOMFORT"]],
};

// Special functions, matched against the select's options. Shown in this order when available.
const SPECIALS = [
  { key: "airing", label: "Wietrzenie", match: (o) => /^wietrzenie$/i.test(o) || /wietrzenie.*(ręczn|reczn)/i.test(o) },
  { key: "empty", label: "Pusty dom", match: (o) => /pusty/i.test(o) },
  { key: "windows", label: "Otwarte okno", match: (o) => /okn/i.test(o) },
  { key: "fireplace", label: "Kominek", match: (o) => /kominek/i.test(o) },
  { key: "hood", label: "Okap", match: (o) => /^okap$/i.test(o) },
];
const DEFAULT_FUNCTIONS = ["airing", "empty", "windows", "fireplace"];

// Status codes shown in the top line when active, as on the panel.
const STATUS_CODES = [
  { key: "bypass", code: "BP", title: "Bypass otwarty" },
  { key: "gwc", code: "GWC", title: "Gruntowy wymiennik ciepła pracuje" },
  { key: "fpx", code: "FPX", title: "Ochrona przeciwzamrożeniowa" },
  { key: "erv", code: "ERV", title: "Nagrzewnica wtórna" },
  { key: "hood", code: "OKAP", title: "Okap" },
  { key: "humidistat", code: "H2O", title: "Higrostat" },
  { key: "air_quality", code: "JP", title: "Czujnik jakości powietrza" },
];

const READINGS = [
  { key: "outside", label: "Temperatura zewnętrzna", code: "TZ1" },
  { key: "supply", label: "Temperatura nawiewu", code: "TN1" },
  { key: "extract", label: "Temperatura wywiewu", code: "TP" },
  { key: "fpx_temp", label: "Za nagrzewnicą FPX", code: "TZ2" },
  { key: "ambient", label: "Temperatura otoczenia", code: "TO" },
  { key: "supply_flow", label: "Strumień nawiewu", code: "" },
  { key: "extract_flow", label: "Strumień wywiewu", code: "" },
];

const WEEKDAYS = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

const num = (v) => {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const isOn = (st) => st && st.state === "on";
const unavailable = (st) => !st || st.state === "unavailable" || st.state === "unknown";
const comma = (v, d) => v.toFixed(d).replace(".", ",");

class ThesslaAirpackCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = { step: 5, functions: DEFAULT_FUNCTIONS, ...config };
    this._entities = null;
    this._pending = null;
    this._view = null; // null | "intensity" | "temperature" | "settings"
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    }
  }

  connectedCallback() {
    // Keep the clock moving when it comes from the browser rather than the unit.
    this._tick = setInterval(() => {
      if (!this._st("clock")) this._render();
    }, 20000);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    clearTimeout(this._viewTimer);
  }

  getCardSize() {
    return 6;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._entities) this._resolve();
    // Drop optimistic values once the unit confirms them.
    for (const [key, exp] of Object.entries(this._expect || {})) {
      const id = this._entities[key];
      const real = id && hass.states[id];
      if (!real || real.state === exp.value || Date.now() > exp.until) delete this._expect[key];
    }
    const sig = Object.values(this._entities || {})
      .map((id) => {
        const st = hass.states[id];
        return st ? `${st.state}|${st.attributes.options ? st.attributes.options.length : ""}` : "-";
      })
      .join(",");
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }

  // ------------------------------------------------------------------ entity discovery
  _resolve() {
    const hass = this._hass;
    const cfg = this._config;
    const explicit = cfg.entities || {};
    let device = cfg.device;
    const registry = hass.entities || {};
    if (!device) {
      // Find the unit by its operating-mode select.
      for (const st of Object.values(hass.states)) {
        if (!st.entity_id.startsWith("select.")) continue;
        const fname = st.attributes.friendly_name || "";
        const opts = st.attributes.options || [];
        if (/Tryb pracy$/.test(fname) && opts.some((o) => /manual/i.test(o))) {
          device = registry[st.entity_id] && registry[st.entity_id].device_id;
          break;
        }
      }
    }
    const candidates = Object.values(hass.states).filter(
      (st) => !device || (registry[st.entity_id] && registry[st.entity_id].device_id === device)
    );
    const found = {};
    for (const [key, [domains, names]] of Object.entries(ENTITY_KEYS)) {
      if (explicit[key]) {
        found[key] = explicit[key];
        continue;
      }
      search: for (const name of names) {
        for (const domain of domains) {
          const d = domain === "text_sensor" ? "sensor" : domain;
          const hit = candidates.find((st) => {
            if (!st.entity_id.startsWith(d + ".")) return false;
            const fname = st.attributes.friendly_name || "";
            return fname === name || fname.endsWith(" " + name);
          });
          if (hit) {
            found[key] = hit.entity_id;
            break search;
          }
        }
      }
    }
    this._entities = found;
  }

  _st(key) {
    const id = this._entities && this._entities[key];
    const real = id ? this._hass.states[id] : undefined;
    const exp = this._expect && this._expect[key];
    if (real && exp && Date.now() <= exp.until && real.state !== exp.value) return { ...real, state: exp.value };
    return real;
  }

  // Values the unit recalculates after a mode or function change (set intensity, airflow).
  _derivedSig() {
    return ["intensity_now", "supply_percent", "supply_flow"]
      .map((k) => (this._st(k) || {}).state)
      .join("|");
  }

  _isStale() {
    if (!this._staleUntil || Date.now() > this._staleUntil) return false;
    if (this._derivedSig() !== this._staleBase) {
      this._staleUntil = 0; // the unit has reported new values
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ state helpers
  _modeKind(st) {
    if (unavailable(st)) return null;
    const s = st.state.toLowerCase();
    if (s.startsWith("auto")) return "auto";
    if (s.startsWith("man")) return "manual";
    if (s.startsWith("chwil")) return "temporary";
    return null;
  }

  _intensity() {
    if (this._pending !== null) return this._pending;
    for (const key of ["intensity_now", "intensity"]) {
      const st = this._st(key);
      if (!unavailable(st)) {
        const v = num(st.state);
        if (v !== null) return Math.round(v);
      }
    }
    return null;
  }

  _specialOption(def) {
    const st = this._st("special");
    if (unavailable(st)) return null;
    return (st.attributes.options || []).find((o) => def.match(o)) || null;
  }

  _noneOption() {
    const st = this._st("special");
    const opts = (st && st.attributes.options) || [];
    return opts.find((o) => /^brak$/i.test(o)) || opts[0];
  }

  // ------------------------------------------------------------------ actions
  _call(domain, service, data) {
    return this._hass.callService(domain, service, data);
  }

  _selectOption(key, option) {
    const id = this._entities[key];
    if (!id || !option) return;
    // Show the choice at once, like the wall panel; the unit confirms it within a second or two.
    this._expect = this._expect || {};
    this._expect[key] = { value: option, until: Date.now() + 5000 };
    if (["mode", "special", "comfort", "season"].includes(key)) {
      this._staleBase = this._derivedSig();
      this._staleUntil = Date.now() + 8000;
    }
    clearTimeout(this._expectTimer);
    this._expectTimer = setTimeout(() => {
      this._sig = null;
      this._render();
    }, 8100);
    this._render();
    this._call("select", "select_option", { entity_id: id, option });
  }

  _changeIntensity(dir) {
    const st = this._st("intensity");
    if (unavailable(st)) return;
    const current = this._intensity() ?? 50;
    if (st.entity_id.startsWith("select.")) {
      // Option list such as "15%" / "20%": step to the neighbouring option.
      const opts = (st.attributes.options || [])
        .map((o) => ({ o, v: num(o) }))
        .filter((x) => x.v !== null)
        .sort((a, b) => a.v - b.v);
      const next = dir > 0 ? opts.find((x) => x.v > current) : [...opts].reverse().find((x) => x.v < current);
      if (!next) return;
      this._pending = Math.round(next.v);
      this._render();
      this._call("select", "select_option", { entity_id: st.entity_id, option: next.o });
      this._schedulePendingClear(1500);
      return;
    }
    const min = num(st.attributes.min) ?? 10;
    const max = num(st.attributes.max) ?? 100;
    const step = this._config.step;
    const target = Math.min(max, Math.max(min, Math.round((current + dir * step) / step) * step));
    this._pending = target;
    this._render();
    // Collect quick taps into one write, like holding the button on the panel.
    clearTimeout(this._sendTimer);
    this._sendTimer = setTimeout(() => {
      this._call("number", "set_value", { entity_id: st.entity_id, value: this._pending });
      this._schedulePendingClear(2500);
    }, 700);
  }

  _schedulePendingClear(ms) {
    clearTimeout(this._pendingTimer);
    this._pendingTimer = setTimeout(() => {
      this._pending = null;
      this._sig = null;
      this._render();
    }, ms);
  }

  _changeSetpoint(dir) {
    const st = this._st("setpoint");
    if (unavailable(st)) return;
    const v = num(st.state);
    if (v === null) return;
    const step = num(st.attributes.step) ?? 0.5;
    const target = Math.min(num(st.attributes.max) ?? 45, Math.max(num(st.attributes.min) ?? 10, v + dir * step));
    this._call("number", "set_value", { entity_id: st.entity_id, value: target });
  }

  _cycle(key, predicate) {
    const st = this._st(key);
    if (unavailable(st)) return;
    const opts = (st.attributes.options || []).filter(predicate || (() => true));
    if (!opts.length) return;
    const i = opts.indexOf(st.state);
    this._selectOption(key, opts[(i + 1) % opts.length]);
  }

  _moreInfo(key) {
    const entityId = this._entities[key];
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
  }


  _adjustSetpoint(dir) {
    const st = this._st("setpoint");
    if (unavailable(st)) return;
    const base = this._spPending ?? num(st.state);
    if (base === null) return;
    const step = num(st.attributes.step) ?? 0.5;
    const target = Math.min(num(st.attributes.max) ?? 45, Math.max(num(st.attributes.min) ?? 10, base + dir * step));
    this._spPending = target;
    this._render();
    clearTimeout(this._spTimer);
    this._spTimer = setTimeout(() => {
      this._call("number", "set_value", { entity_id: st.entity_id, value: this._spPending });
      setTimeout(() => {
        this._spPending = null;
        this._sig = null;
        this._render();
      }, 2500);
    }, 700);
  }

  _openView(view) {
    this._view = view;
    this._viewFresh = true;
    this._render();
    this._armViewTimer();
  }

  _armViewTimer() {
    // Like the panel: adjustment screens fall back to the main screen when left alone.
    clearTimeout(this._viewTimer);
    if (this._view)
      this._viewTimer = setTimeout(() => {
        this._view = null;
        this._confirmOff = false;
        this._render();
      }, this._view === "settings" || this._view === "flow" ? 60000 : 8000);
  }

  _onClick(ev) {
    const el = ev.target.closest("[data-action]");
    if (!el) return;
    const { action, arg } = el.dataset;
    if (this._view) this._armViewTimer();
    switch (action) {
      case "open":
        if (arg === "temperature" && unavailable(this._st("setpoint"))) {
          this._moreInfo("supply");
          return;
        }
        if (arg === "intensity" && unavailable(this._st("intensity"))) return;
        this._openView(arg);
        break;
      case "close":
        this._view = null;
        this._confirmOff = false;
        clearTimeout(this._viewTimer);
        this._render();
        break;
      case "intensity":
        this._changeIntensity(Number(arg));
        break;
      case "setpoint":
        this._adjustSetpoint(Number(arg));
        break;
      case "mode": {
        const st = this._st("mode");
        if (unavailable(st)) return;
        const kind = this._modeKind(st);
        const opts = st.attributes.options || [];
        const auto = opts.find((o) => /^auto/i.test(o));
        const manual = opts.find((o) => /^man/i.test(o));
        this._selectOption("mode", kind === "auto" ? manual : auto);
        break;
      }
      case "comfort":
        this._cycle("comfort");
        break;
      case "season":
        this._cycle("season");
        break;
      case "special": {
        const def = SPECIALS.find((s) => s.key === arg);
        const option = this._specialOption(def);
        const st = this._st("special");
        this._selectOption("special", st.state === option ? this._noneOption() : option);
        break;
      }
      case "power": {
        const st = this._st("power");
        if (!st) return;
        if (isOn(st) && !this._confirmOff) {
          this._confirmOff = true;
          this._render();
          return;
        }
        this._confirmOff = false;
        this._call("switch", isOn(st) ? "turn_off" : "turn_on", { entity_id: st.entity_id });
        break;
      }
      case "more":
        this._moreInfo(arg);
        break;
    }
  }

  // ------------------------------------------------------------------ rendering
  _clock() {
    const st = this._st("clock");
    let d = null;
    if (!unavailable(st)) {
      const m = st.state.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
      if (m) d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    }
    d = d || new Date();
    const p = (n) => String(n).padStart(2, "0");
    return {
      time: `${p(d.getHours())}:${p(d.getMinutes())}`,
      day: WEEKDAYS[d.getDay()],
      date: `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`,
    };
  }

  _value(key, digits) {
    const st = this._st(key);
    if (unavailable(st)) return null;
    const v = num(st.state);
    return v === null ? null : comma(v, digits);
  }

  _render() {
    if (!this.shadowRoot || !this._hass || !this._entities) return;
    const e = this._entities;
    const stale = this._isStale();
    const modeSt = this._st("mode");
    const powerSt = this._st("power");
    const powered = !powerSt || isOn(powerSt);
    const online = !e.online || isOn(this._st("online"));
    const kind = this._modeKind(modeSt);
    const intensity = this._intensity();
    const comfortSt = this._st("comfort");
    const comfortOn = !unavailable(comfortSt) && /komfort/i.test(comfortSt.state);
    const seasonSt = this._st("season");
    const winter = !unavailable(seasonSt) && /zim/i.test(seasonSt.state);
    const specialSt = this._st("special");
    const clock = this._clock();
    const flow = this._value("supply_flow", 0);
    const setpointSt = this._st("setpoint");
    const showSetpoint = comfortOn && !unavailable(setpointSt);
    const temperature = showSetpoint
      ? comma(this._spPending ?? num(setpointSt.state), 1)
      : this._value("supply", 1);

    const codes = [
      isOn(this._st("alarm_s")) ? `<button class="code alarm" data-action="more" data-arg="alarm_s" title="Alarm zatrzymujący centralę">S</button>` : "",
      isOn(this._st("alarm_e")) ? `<button class="code warn" data-action="more" data-arg="alarm_e" title="Ostrzeżenie">E</button>` : "",
      ...STATUS_CODES.filter((s) => isOn(this._st(s.key))).map(
        (s) => `<button class="code" data-action="more" data-arg="${s.key}" title="${esc(s.title)}">${s.code}</button>`),
    ].join("");

    const tiles = [];
    if (!unavailable(seasonSt))
      tiles.push(`<button class="tile" data-action="season" aria-label="Harmonogram ${winter ? "zimowy" : "letni"}, zmień">
        <ha-icon icon="${winter ? "mdi:snowflake" : "mdi:white-balance-sunny"}"></ha-icon><span>${winter ? "Zima" : "Lato"}</span></button>`);
    if (!unavailable(comfortSt))
      tiles.push(`<button class="tile" data-action="comfort" aria-label="Tryb ${comfortOn ? "komfort" : "eko"}, zmień">
        <ha-icon icon="${comfortOn ? "mdi:thermometer" : "mdi:leaf"}"></ha-icon><span>${comfortOn ? "Komfort" : "Eko"}</span></button>`);
    if (!unavailable(modeSt)) {
      const m = { auto: ["mdi:calendar-month-outline", "Auto"], manual: ["mdi:hand-back-right-outline", "Manual"], temporary: ["mdi:timer-outline", "Chwilowy"] }[kind] || ["mdi:help", esc(modeSt.state)];
      tiles.push(`<button class="tile${kind === "temporary" ? " hot" : ""}" data-action="mode" aria-label="Tryb pracy ${m[1]}, zmień">
        <ha-icon icon="${m[0]}"></ha-icon><span>${m[1]}</span></button>`);
    }

    const filters = [["filter_supply", "Czerpnia"], ["filter_extract", "Wywiew"]]
      .filter(([k]) => e[k])
      .map(([k, label]) => {
        const v = num((this._st(k) || {}).state);
        const pct = v === null ? 0 : Math.max(0, Math.min(100, v));
        return `<span class="f-name">${label}</span><span class="f-val">${v === null ? "–" : Math.round(v) + "%"}</span>
          <span class="bar"><span style="width:${pct}%"></span></span>`;
      })
      .join("");

    const wanted = this._config.functions || DEFAULT_FUNCTIONS;
    const functions = wanted
      .map((k) => SPECIALS.find((s) => s.key === k))
      .filter(Boolean)
      .map((def) => ({ def, option: this._specialOption(def) }))
      .filter((x) => x.option)
      .map(({ def, option }) => {
        const active = specialSt && specialSt.state === option;
        return `<button class="fn${active ? " active" : ""}" data-action="special" data-arg="${def.key}" aria-pressed="${active}">${def.label}</button>`;
      })
      .join("");
    const otherSpecial = specialSt && !unavailable(specialSt) && specialSt.state !== this._noneOption() &&
      !SPECIALS.some((d) => this._specialOption(d) === specialSt.state);

    const main = `
      <div class="top">
        <div class="when">
          <div class="time">${clock.time}</div>
          <div class="day">${clock.day}<br>${clock.date}</div>
        </div>
        <div class="right">
          <div class="codes">${codes}</div>
          <div class="tiles" style="grid-template-columns: repeat(${tiles.length}, minmax(0, 104px))">${tiles.join("")}</div>
        </div>
      </div>
      <div class="middle">
        <div class="left-col">
          <button class="filters" data-action="open" data-arg="flow" aria-label="Zużycie filtrów, pokaż schemat przepływu">
            <span class="f-title">${filters ? "Zużycie filtrów" : "Schemat przepływu"}</span>${filters}</button>
          <button class="gear" data-action="open" data-arg="settings" aria-label="Odczyty i ustawienia">
            <ha-icon icon="mdi:cog"></ha-icon></button>
        </div>
        <div class="values">
          <button class="metric" data-action="open" data-arg="intensity" aria-label="Zmień intensywność wentylacji">
            <span class="m-label">Intensywność<br>wentylacji</span>
            <span class="m-value${stale ? " stale" : ""}">${powered && intensity !== null ? intensity : "–"}<small>%</small></span>
            ${flow !== null ? `<span class="m-sub${stale ? " stale" : ""}">${flow} m³/h</span>` : ""}
          </button>
          <button class="metric" data-action="open" data-arg="temperature" aria-label="${showSetpoint ? "Zmień temperaturę nawiewu" : "Temperatura nawiewu"}">
            <span class="m-label">Temperatura<br>nawiewu</span>
            <span class="m-value">${temperature ?? "–"}<small>°C</small></span>
          </button>
        </div>
      </div>
      ${otherSpecial ? `<div class="note">Aktywna funkcja: ${esc(specialSt.state)}</div>` : ""}
      ${functions ? `<nav class="functions">${functions}</nav>` : ""}`;

    const fresh = this._viewFresh ? " enter" : "";
    this._viewFresh = false;
    let overlay = "";
    if (this._view === "intensity") {
      overlay = this._adjustScreen(fresh, "Intensywność wentylacji", intensity === null ? "–" : String(intensity), "%",
        "intensity", kind === "manual" ? "Nastawa trybu manualnego" : "Zmiana uruchomi tryb chwilowy", flow ? `${flow} m³/h` : "");
    } else if (this._view === "temperature") {
      overlay = this._adjustScreen(fresh, "Temperatura nawiewu", temperature ?? "–", "°C", "setpoint",
        kind === "manual" ? "Nastawa trybu manualnego" : "Zmiana uruchomi tryb chwilowy", "");
    } else if (this._view === "flow") {
      overlay = this._flowScreen(fresh);
    } else if (this._view === "settings") {
      const rows = READINGS.filter((r) => e[r.key])
        .map((r) => {
          const st = this._st(r.key);
          const unit = st && st.attributes.unit_of_measurement ? st.attributes.unit_of_measurement : "";
          const v = this._value(r.key, /m³|m3/.test(unit) ? 0 : 1);
          return `<button class="row" data-action="more" data-arg="${r.key}">
              <span>${r.label}${r.code ? ` <small>${r.code}</small>` : ""}</span><b>${v ?? "–"} ${esc(unit)}</b></button>`;
        })
        .join("");
      overlay = `<div class="overlay settings${fresh}">
          <div class="o-head"><span>Odczyty</span><button class="close" data-action="close" aria-label="Wróć">
            <ha-icon icon="mdi:close"></ha-icon></button></div>
          <div class="rows">${rows}</div>
          ${powerSt ? `<button class="power${this._confirmOff ? " confirm" : ""}" data-action="power">
              ${powered ? (this._confirmOff ? "Dotknij ponownie, aby wyłączyć" : "Wyłącz centralę") : "Włącz centralę"}</button>` : ""}
        </div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="screen${powered ? "" : " off"}">
          ${main}
          ${overlay}
          ${!powered && !this._view ? `<div class="banner">Centrala wyłączona – włączysz ją w odczytach (koło zębate).</div>` : ""}
          ${!online ? `<div class="banner">Brak połączenia z centralą – sprawdź przewód RS485 i zasilanie bramki.</div>` : ""}
          ${!modeSt ? `<div class="banner">Nie znaleziono encji rekuperatora. Ustaw <code>device</code> lub <code>entities</code> w konfiguracji karty.</div>` : ""}
        </div>
      </ha-card>`;
  }

  _flowScreen(fresh) {
    const t = (key) => {
      const v = this._value(key, 1);
      return v === null ? null : `${v}°C`;
    };
    const pct = (key) => {
      const st = this._st(key);
      const v = unavailable(st) ? null : num(st.state);
      return v === null ? null : `${Math.round(v)}%`;
    };
    const flow = (key) => {
      const v = this._value(key, 0);
      return v === null ? null : `${v} m³/h`;
    };
    const fpxOn = isOn(this._st("fpx"));
    const bypassOn = isOn(this._st("bypass"));
    // Heat-recovery efficiency on the supply side, from outside, extract and supply temperatures.
    let eff = null;
    const tz1 = num((this._st("outside") || {}).state), tp = num((this._st("extract") || {}).state),
      tn1 = num((this._st("supply") || {}).state);
    if (!bypassOn && tz1 !== null && tp !== null && tn1 !== null && Math.abs(tp - tz1) >= 3) {
      const ratio = (tn1 - tz1) / (tp - tz1);
      // Outside 0..1 something else heats or cools the supply air (heater, sun on the duct): no figure.
      if (ratio > 0 && ratio <= 1) eff = Math.round(ratio * 100);
    }
    const txt = (x, y, value, cls = "", anchor = "middle", key = "") =>
      value === null ? "" : `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}"${key ? ` data-action="more" data-arg="${key}"` : ""}>${esc(value)}</text>`;
    const arrow = (x, y, dir, cls) => {
      const d = dir === "r" ? `M${x - 12} ${y - 8} L${x} ${y} L${x - 12} ${y + 8}` : `M${x + 12} ${y - 8} L${x} ${y} L${x + 12} ${y + 8}`;
      return `<path d="${d}" class="${cls} head"/>`;
    };
    const filter = (x, y) => `<path d="M${x} ${y - 34} L${x + 14} ${y - 22} L${x} ${y - 10} L${x + 14} ${y + 2} L${x} ${y + 14} L${x + 14} ${y + 26} L${x} ${y + 34}" class="device"/>`;
    const fan = (cx, cy, dir) => {
      const tri = dir === "r" ? `M${cx - 9} ${cy - 15} L${cx + 15} ${cy} L${cx - 9} ${cy + 15} Z` : `M${cx + 9} ${cy - 15} L${cx - 15} ${cy} L${cx + 9} ${cy + 15} Z`;
      return `<circle cx="${cx}" cy="${cy}" r="30" class="device"/><path d="${tri}" class="device"/>`;
    };
    const hex = "353,198 447,198 495,280 447,362 353,362 305,280";
    return `<div class="overlay flow${fresh}">
      <svg viewBox="0 0 800 460" role="img" aria-label="Schemat przepływu powietrza przez centralę">
        <text x="20" y="44" class="zone">Czerpnia</text>
        <text x="780" y="44" class="zone" text-anchor="end">Wywiew</text>
        <text x="20" y="448" class="zone">Wyrzutnia</text>
        <text x="720" y="448" class="zone" text-anchor="end">Nawiew</text>

        <path d="M20 120 H171 M193 120 H202 M248 120 H250 M310 120 H366 L380 194" class="air fresh"/>
        ${arrow(70, 120, "r", "fresh")}
        ${filter(175, 120)}
        <text x="225" y="127" text-anchor="middle" class="fpx${fpxOn ? " on" : ""}" data-action="more" data-arg="fpx">FPX</text>
        ${fan(280, 120, "r")}

        <path d="M780 120 H625 M605 120 H550 M490 120 H434 L420 194" class="air warm"/>
        ${arrow(730, 120, "l", "warm")}
        ${filter(607, 120)}
        ${fan(520, 120, "l")}

        <polygon points="${hex}" class="exchanger${bypassOn ? " bypass" : ""}" data-action="more" data-arg="bypass"/>
        ${bypassOn ? `<text x="400" y="290" text-anchor="middle" class="inside">Bypass</text>`
          : eff !== null ? `<text x="400" y="282" text-anchor="middle" class="inside">${eff}%</text><text x="400" y="310" text-anchor="middle" class="caption">odzysk ciepła</text>` : ""}

        <path d="M353 362 L335 392 H20" class="air used"/>${arrow(70, 392, "l", "used")}
        <path d="M447 362 L465 392 H780" class="air supplied"/>${arrow(730, 392, "r", "supplied")}
        <path d="M400 362 V410" class="air drain"/>

        ${txt(100, 166, t("outside"), "temp", "middle", "outside")}
        ${txt(182, 192, pct("filter_supply"), "small", "middle", "filter_supply")}
        ${txt(280, 186, pct("supply_percent"), "small", "middle", "supply_percent")}
        ${txt(280, 214, flow("supply_flow"), "small", "middle", "supply_flow")}
        ${txt(520, 186, pct("extract_percent"), "small", "middle", "extract_percent")}
        ${txt(520, 214, flow("extract_flow"), "small", "middle", "extract_flow")}
        ${txt(614, 192, pct("filter_extract"), "small", "middle", "filter_extract")}
        ${txt(700, 166, t("extract"), "temp", "middle", "extract")}
        ${txt(640, 374, t("supply"), "temp", "middle", "supply")}
        ${txt(400, 440, t("ambient"), "temp", "middle", "ambient")}
      </svg>
      <button class="home" data-action="close" aria-label="Ekran główny"><ha-icon icon="mdi:home"></ha-icon></button>
    </div>`;
  }

  _adjustScreen(fresh, title, value, unit, action, hint, sub) {
    return `<div class="overlay adjust${fresh}">
        <div class="o-head"><span>${title}</span><button class="close" data-action="close" aria-label="Gotowe">
          <ha-icon icon="mdi:check"></ha-icon></button></div>
        <div class="adjuster">
          <button class="step" data-action="${action}" data-arg="-1" aria-label="Zmniejsz">−</button>
          <div class="a-value">${value}<small>${unit}</small>${sub ? `<span>${sub}</span>` : ""}</div>
          <button class="step" data-action="${action}" data-arg="1" aria-label="Zwiększ">+</button>
        </div>
        <div class="hint">${this._pending !== null || this._spPending != null ? "Wysyłam nastawę…" : hint}</div>
      </div>`;
  }
}

const STYLE = `
  :host {
    --ap-screen: #ffffff;
    --ap-ink: #121416;
    --ap-muted: #5d6266;
    --ap-rule: #e3e6e8;
    --ap-accent: #16c7a7;
    --ap-warn: #e39a1d;
    --ap-alarm: #d93a3f;
  }
  ha-card { overflow: hidden; background: var(--ap-screen); }
  .screen {
    position: relative; container-type: inline-size;
    color: var(--ap-ink); background: var(--ap-screen);
    padding: 18px 22px 14px; font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .screen.off .values, .screen.off .tiles { opacity: .35; }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: inherit; }
  button:focus-visible { outline: 2px solid var(--ap-accent); outline-offset: 3px; border-radius: 4px; }

  .top { display: grid; grid-template-columns: 1fr 1.25fr; gap: 12px; }
  .time { font-size: 3.4rem; font-weight: 300; line-height: 1; letter-spacing: -.01em; }
  .day { margin-top: 10px; font-size: .95rem; line-height: 1.35; }
  .right { display: flex; flex-direction: column; gap: 10px; }
  .codes { display: flex; gap: 10px; min-height: 22px; align-items: center; }
  .code { font-size: 1rem; font-weight: 500; }
  .code.alarm, .code.warn { color: #fff; border-radius: 4px; padding: 0 7px; }
  .code.alarm { background: var(--ap-alarm); }
  .code.warn { background: var(--ap-warn); }
  .tiles { display: grid; justify-content: end; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: .9rem; padding: 4px 0; border-radius: 8px; }
  .tile ha-icon { --mdc-icon-size: 40px; }
  .tile:hover { background: #f3f5f6; }
  .tile.hot { color: var(--ap-warn); }

  .middle { display: grid; grid-template-columns: 1fr 1.25fr; gap: 12px; margin-top: 22px; align-items: end; }
  .left-col { display: flex; flex-direction: column; gap: 14px; justify-content: flex-end; }
  .filters { display: grid; grid-template-columns: 1fr auto; column-gap: 10px; border-radius: 8px; padding: 2px 4px; margin: -2px -4px; }
  .filters:hover { background: #f3f5f6; }
  .f-title { grid-column: 1 / -1; margin-bottom: 8px; }
  .f-name, .f-val { font-size: 1rem; padding-top: 4px; }
  .f-val { text-align: right; }
  .bar { grid-column: 1 / -1; height: 3px; background: var(--ap-rule); margin: 3px 0 4px; position: relative; }
  .bar span { position: absolute; inset: 0 auto 0 0; background: var(--ap-accent); }
  .gear { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; }
  .gear ha-icon { --mdc-icon-size: 30px; }

  .values { display: flex; flex-direction: column; gap: 14px; }
  .metric { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 8px; border-radius: 8px; padding: 2px 4px; }
  .metric:hover { background: #f3f5f6; }
  .m-label { font-size: 1rem; line-height: 1.25; }
  .m-value { font-size: 2.9rem; font-weight: 300; line-height: 1.05; text-align: right; }
  .m-value small { font-size: .62em; margin-left: 1px; }
  .m-sub { grid-column: 2; text-align: right; font-size: .95rem; margin-top: 2px; }
  .stale { opacity: .35; transition: opacity .2s; }

  .note { margin-top: 10px; color: var(--ap-warn); font-size: .9rem; }
  .functions { display: flex; justify-content: space-between; gap: 6px; margin-top: 20px; }
  .fn { flex: 1; text-align: center; font-size: .95rem; padding: 6px 2px 8px; border-bottom: 2px solid transparent; }
  .fn.active { border-bottom-color: var(--ap-accent); font-weight: 500; }
  .fn:hover { background: #f3f5f6; border-radius: 6px 6px 0 0; }

  .overlay {
    position: absolute; inset: 0; background: var(--ap-screen);
    padding: 18px 22px; display: flex; flex-direction: column;
  }
  .overlay.enter { animation: show .18s ease-out; }
  @keyframes show { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .overlay { animation: none; } }
  .o-head { display: flex; justify-content: space-between; align-items: center; font-size: 1.2rem; }
  .close { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 50%; }
  .close:hover { background: #f3f5f6; }
  .adjuster { flex: 1; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; }
  .step {
    width: 64px; height: 64px; border-radius: 50%; border: 1.5px solid var(--ap-ink);
    font-size: 2.2rem; font-weight: 300; line-height: 1; display: grid; place-items: center; text-align: center;
  }
  .step:active { background: var(--ap-accent); border-color: var(--ap-accent); color: #fff; }
  .a-value { text-align: center; font-size: 5rem; font-weight: 300; line-height: 1; }
  .a-value small { font-size: .45em; }
  .a-value span { display: block; font-size: 1rem; margin-top: 8px; color: var(--ap-muted); }
  .hint { text-align: center; color: var(--ap-muted); font-size: .9rem; }
  .rows { margin-top: 8px; overflow: auto; }
  .row { width: 100%; display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--ap-rule); }
  .row small { color: var(--ap-muted); }
  .row b { font-weight: 500; }
  .power { margin-top: auto; padding: 10px; border: 1.5px solid var(--ap-ink); border-radius: 8px; text-align: center; }
  .power.confirm { background: var(--ap-alarm); border-color: var(--ap-alarm); color: #fff; }

  .overlay.flow { padding: 10px 14px; justify-content: center; }
  .flow svg { width: 100%; height: auto; display: block; overflow: visible; }
  .flow text { font-family: inherit; fill: var(--ap-ink); }
  .flow text[data-action] { cursor: pointer; }
  .flow .zone { font-size: 22px; fill: var(--ap-muted); }
  .flow .temp { font-size: 26px; }
  .flow .small { font-size: 22px; }
  .flow .inside { font-size: 34px; font-weight: 300; }
  .flow .caption { font-size: 18px; fill: var(--ap-muted); }
  .flow .fpx { font-size: 18px; fill: #c3c8cb; }
  .flow .fpx.on { fill: var(--ap-warn); font-weight: 600; }
  .air { fill: none; stroke-width: 2.5; }
  .head { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  .fresh { stroke: #3f8fd2; }
  .warm { stroke: #c79a2a; }
  .used { stroke: #9cc4e4; }
  .supplied { stroke: #8fd3c6; }
  .drain { stroke: #c9d2d6; }
  .faint { stroke: #c9d6df; }
  .device { fill: none; stroke: #7d8a92; stroke-width: 2.5; stroke-linejoin: round; }
  .exchanger { fill: none; stroke: var(--ap-accent); stroke-width: 6; stroke-linejoin: round; cursor: pointer; }
  .exchanger.bypass { stroke-dasharray: 14 10; opacity: .6; }
  .home { position: absolute; right: 14px; bottom: 10px; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 50%; }
  .home ha-icon { --mdc-icon-size: 30px; }
  .home:hover { background: #f3f5f6; }
  .banner { margin-top: 12px; padding: 8px 10px; border-radius: 6px; background: #fdeced; color: #8f1d22; font-size: .9rem; }
  code { font-size: .85em; }

  @container (max-width: 430px) {
    .top, .middle { grid-template-columns: 1fr; }
    .time { font-size: 2.8rem; }
    .left-col { order: 2; }
    .tile ha-icon { --mdc-icon-size: 32px; }
    .tiles { justify-content: start; }
    .m-value { font-size: 2.4rem; }
    .functions { flex-wrap: wrap; }
    .fn { flex: 1 1 45%; }
  }
`;

customElements.define("thessla-airpack-card", ThesslaAirpackCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "thessla-airpack-card",
  name: "Thessla AirPack",
  description: "Ekran główny rekuperatora w układzie panelu ściennego.",
  preview: false,
});
console.info(`%c THESSLA-AIRPACK-CARD %c ${CARD_VERSION} `, "background:#fff;color:#16c7a7", "background:#16c7a7;color:#fff");
