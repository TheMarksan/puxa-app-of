// Puxa — interface sem build: um módulo, estado explícito, DOM atualizado por funções "sync".
// Movimento segue as regras da stageshow: todo movimento tem causa, nada aparece do nada,
// texto e números que mudam rolam no lugar, painéis abrem com a altura.

const $ = (id) => document.getElementById(id);

const ui = {
  intro: $("intro"),
  form: $("lookup"), input: $("url"), paste: $("paste"), clear: $("clear"),
  urlHint: $("url-hint"), urlError: $("url-error"), lookupBtn: $("lookup-btn"), status: $("status"),
  empty: $("empty"), sample: $("sample"), skeleton: $("skeleton"),
  lookupError: $("lookup-error"), lookupErrorTitle: $("lookup-error-title"),
  lookupErrorText: $("lookup-error-text"), lookupRetry: $("lookup-retry"),
  result: $("result"), thumb: $("v-thumb"), duration: $("v-duration"),
  title: $("v-title"), channel: $("v-channel"), meta: $("v-meta"),
  qualityList: $("quality-list"), qualityEmpty: $("quality-empty"), useMp3: $("use-mp3"),
  dock: $("dock"), dockSentinel: $("dock-sentinel"),
  actions: $("actions"), downloadBtn: $("download-btn"), shareBtn: $("share-btn"),
  job: $("job"), jobStage: $("job-stage"), jobPercent: $("job-percent"),
  steps: $("steps"), stepsTrack: $("steps-track"), stepsFill: $("steps-fill"), stepProcess: $("step-process"),
  stepItems: [...document.querySelectorAll(".step")],
  jobNumbers: $("job-numbers"), cancelBtn: $("cancel-btn"),
  jobError: $("job-error"), jobErrorTitle: $("job-error-title"), jobErrorText: $("job-error-text"), jobRetry: $("job-retry"),
  done: $("done"), doneName: $("done-name"), doneSize: $("done-size"), doneNote: $("done-note"),
  doneActions: $("done-actions"), saveBtn: $("save-btn"), openSendBtn: $("open-send-btn"),
  send: $("send"), sendTitle: $("send-title"), sendMode: $("send-mode"),
  sendSummary: $("send-summary"), summaryDuration: $("summary-duration"), summarySize: $("summary-size"),
  wholeDuration: $("whole-duration"), wholeSize: $("whole-size"),
  trim: $("trim"), wave: $("wave"), canvas: $("wave-canvas"), playhead: $("playhead"),
  hStart: $("handle-start"), hEnd: $("handle-end"), waveLoading: $("wave-loading"), waveError: $("wave-error"),
  timeStart: $("time-start"), timeEnd: $("time-end"),
  startInput: $("start-input"), endInput: $("end-input"), clipLength: $("clip-length"),
  trimError: $("trim-error"), previewBtn: $("preview-btn"), clipSize: $("clip-size"), audio: $("preview-audio"),
  sizeNote: $("size-note"), unsupported: $("share-unsupported"),
  sendBtn: $("send-btn"), sendHint: $("send-hint"), waWeb: $("whatsapp-web"),
  demoBar: $("demo-bar"), ttlText: $("ttl-text"),
  toasts: $("toasts"), toastList: $("toast-list"),
};

const SAMPLE_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const ACTIVE = new Set(["queued", "downloading", "processing"]);
const WHATSAPP_MEDIA_LIMIT = 16_000_000; // acima disso o WhatsApp pode mandar como documento
const PREFETCH_LIMIT = 64_000_000;
const MIN_CLIP = 1;
const MIME = { mp3: "audio/mpeg", mp4: "video/mp4" };
const BASE_TITLE = document.title;

const state = {
  info: null,
  format: "mp3",
  quality: { mp3: 192, mp4: null },
  jobs: new Map(), // chave "id:formato:qualidade" → último estado do pedido
  lookupSeq: 0,
  pollTimer: null,
  pollFails: 0,
  starting: false,
  send: null,
  view: "none", // o que o dock mostra: actions | job | error | done
};

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => reducedMotion.matches;
const isNarrow = matchMedia("(max-width: 559px)");

// ------------------------------------------------------------------ formatação

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

function fmtBytes(n) {
  if (n == null) return "";
  if (n < 1e6) return `${nf0.format(Math.max(1, n / 1e3))} KB`;
  if (n < 1e9) return `${(n < 1e8 ? nf1 : nf0).format(n / 1e6)} MB`;
  return `${nf1.format(n / 1e9)} GB`;
}

function fmtClock(seconds, tenths = false) {
  let s = Math.max(0, seconds || 0);
  if (!tenths) s = Math.round(s);
  let whole = Math.floor(s);
  let dec = Math.round((s - whole) * 10);
  if (dec === 10) { whole += 1; dec = 0; }
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const sec = String(whole % 60).padStart(2, "0");
  const base = h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  // Décimos só quando existem: "0:43" é mais fácil de ler que "0:43,0".
  return tenths && dec ? `${base},${dec}` : base;
}

function parseClock(text) {
  const t = (text || "").trim().replace(",", ".");
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(t)) return null;
  const parts = t.split(":").map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function fmtEta(s) {
  if (s == null || !isFinite(s)) return "";
  if (s < 60) return `${Math.max(1, Math.round(s))} s restantes`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(Math.round(s % 60)).padStart(2, "0")} s restantes`;
}

function fmtViews(n) {
  if (n == null) return "";
  if (n === 1) return "1 visualização";
  return n >= 1e6 ? `${compact.format(n)} de visualizações` : `${compact.format(n)} visualizações`;
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

const fmtHour = (epoch) => new Date(epoch * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// ------------------------------------------------------------------ utilidades

const YT_RE = /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\/?\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/|v\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i;

function videoIdFrom(text) {
  const t = (text || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
  const m = t.match(YT_RE);
  return m ? m[1] : null;
}

class ApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError("offline", "Sem conexão com o servidor. Confira a internet e tente de novo.", 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* resposta sem JSON */ }
  if (!res.ok) {
    const err = data && data.error;
    throw new ApiError(err?.code || "http", err?.message || `O servidor respondeu com erro ${res.status}. Tente de novo.`, res.status);
  }
  return data;
}

async function fetchFile(url, name, type, onProgress) {
  let res;
  try { res = await fetch(url); } catch {
    throw new ApiError("offline", "A conexão caiu enquanto o arquivo era preparado. Tente de novo.", 0);
  }
  if (!res.ok) {
    let msg = "Não foi possível pegar o arquivo no servidor. Gere de novo.";
    try { msg = (await res.json()).error.message; } catch { /* mantém a mensagem padrão */ }
    throw new ApiError("http", msg, res.status);
  }
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) return new File([await res.blob()], name, { type });
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received / total);
  }
  return new File(chunks, name, { type });
}

function setBusy(button, busy, label) {
  const text = button.querySelector(".btn-label");
  if (busy) {
    if (text && !button.dataset.label) button.dataset.label = text.textContent;
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
    if (text && label) text.textContent = label;
  } else {
    button.removeAttribute("aria-busy");
    button.disabled = false;
    if (text && button.dataset.label) text.textContent = button.dataset.label;
    delete button.dataset.label;
  }
}

function setLabel(button, label) {
  const text = button.querySelector(".btn-label") || button;
  if (button.getAttribute("aria-busy") === "true") button.dataset.label = label;
  else text.textContent = label;
}

function announce(message) {
  ui.status.textContent = "";
  requestAnimationFrame(() => { ui.status.textContent = message; });
}

function saveFromUrl(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "";
  document.body.append(a);
  a.click();
  a.remove();
}

const haptic = () => { try { navigator.vibrate?.(12); } catch { /* sem vibração */ } };

const currentKey = () => state.info && `${state.info.id}:${state.format}:${state.quality[state.format]}`;
const currentJob = () => state.jobs.get(currentKey());

// ------------------------------------------------------------------ movimento

// Muda a altura de um container junto com o conteúdo, a partir da altura atual
// (retoma de onde estiver se for interrompido). O que vem abaixo se move com ele.
function morphHeight(el, mutate, duration = 360) {
  if (reduced() || !el.isConnected || el.offsetParent === null) { mutate(); return; }
  const token = (el._morph = (el._morph || 0) + 1);
  const from = el.getBoundingClientRect().height;
  el.style.transition = "none";
  el.style.height = "";
  mutate();
  const to = el.getBoundingClientRect().height;
  if (Math.abs(from - to) < 1) { el.style.transition = ""; return; }
  el.style.height = `${from}px`;
  el.style.overflow = "clip";
  el.getBoundingClientRect();
  el.style.transition = `height ${duration}ms var(--ease-travel)`;
  el.style.height = `${to}px`;
  const finish = () => {
    if (el._morph !== token) return;
    el.style.height = "";
    el.style.overflow = "";
    el.style.transition = "";
  };
  el.addEventListener("transitionend", (e) => { if (e.target === el) finish(); }, { once: true });
  setTimeout(finish, duration + 100);
}

// O conteúdo chega depois do container: fade com uma subida curta.
function enter(el) {
  if (reduced() || !el) return;
  el.classList.remove("enter");
  void el.offsetWidth;
  el.classList.add("enter");
  el.addEventListener("animationend", () => el.classList.remove("enter"), { once: true });
}

// Texto que muda rola: o antigo sobe e sai, o novo sobe e entra no mesmo lugar.
function rollText(el, text) {
  const current = el.dataset.text ?? el.textContent;
  if (current === text) return;
  el.dataset.text = text;
  if (reduced() || !current || el.offsetParent === null) { el.textContent = text; return; }
  const out = Object.assign(document.createElement("span"), { className: "roll-out", textContent: current });
  const inn = Object.assign(document.createElement("span"), { className: "roll-in", textContent: text });
  el.replaceChildren(out, inn);
  inn.addEventListener("animationend", () => { if (el.dataset.text === text) el.textContent = text; }, { once: true });
}

// Porcentagem com dígitos que giram, o último primeiro; os que não mudam ficam parados.
function countTo(el, value) {
  if (value == null) { el.replaceChildren(); el.removeAttribute("aria-label"); return; }
  const str = String(value);
  el.setAttribute("aria-label", `${str}%`);
  if (reduced()) { el.textContent = `${str}%`; return; }
  let digits = el.querySelector(".count-digits");
  if (!digits) {
    el.replaceChildren();
    digits = Object.assign(document.createElement("span"), { className: "count-digits" });
    el.append(digits, Object.assign(document.createElement("span"), { className: "count-unit", textContent: "%" }));
  }
  while (digits.children.length < str.length) {
    const slot = Object.assign(document.createElement("span"), { className: "count-slot" });
    const strip = Object.assign(document.createElement("span"), { className: "count-strip" });
    for (let d = 0; d < 10; d++) strip.append(Object.assign(document.createElement("span"), { textContent: String(d) }));
    slot.append(strip);
    digits.prepend(slot);
  }
  while (digits.children.length > str.length) digits.firstElementChild.remove();
  [...digits.children].forEach((slot, i) => {
    const strip = slot.firstElementChild;
    strip.style.transitionDelay = `${(str.length - 1 - i) * 45}ms`;
    strip.style.transform = `translateY(${-Number(str[i]) * 10}%)`;
  });
}

// Destaque deslizante numa lista de escolhas: segue a opção marcada.
function syncIndicator(list, instant = false) {
  if (!list || list.hidden) return;
  let bar = list.querySelector(":scope > .choice-indicator");
  if (!bar) {
    bar = Object.assign(document.createElement("span"), { className: "choice-indicator" });
    bar.setAttribute("aria-hidden", "true");
    list.prepend(bar);
    list.classList.add("has-indicator");
    instant = true;
  }
  const row = list.querySelector(".choice:has(input:checked)");
  if (!row) { bar.style.opacity = "0"; return; }
  if (instant) bar.style.transition = "none";
  bar.style.opacity = "1";
  bar.style.transform = `translateY(${row.offsetTop}px)`;
  bar.style.height = `${row.offsetHeight}px`;
  if (instant) { void bar.offsetWidth; bar.style.transition = ""; }
}

// ------------------------------------------------------------------ toasts

// Pilha no canto (embaixo no celular, à direita no desktop). O mais novo fica na frente;
// os anteriores recuam atrás dele e se abrem em lista com o ponteiro ou o foco.
const toaster = (() => {
  const list = ui.toastList;
  const items = [];
  let expanded = false;
  let paused = false;
  const ICONS = {
    success: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    error: '<path d="M12 7v6M12 16.8v.2"/>',
    info: '<path d="M12 11v6M12 7.6v.2"/>',
  };
  const maxVisible = () => (isNarrow.matches ? 2 : 3);

  function layout() {
    const visible = items.filter((t) => t.state !== "leaving");
    // Mede a altura natural de cada um antes de aplicar a pilha
    const natural = new Map();
    for (const t of visible) {
      const prev = t.el.style.height;
      t.el.style.height = "";
      natural.set(t, t.el.offsetHeight);
      t.el.style.height = prev;
    }
    const front = visible[visible.length - 1];
    const frontH = front ? natural.get(front) : 0;
    let offset = 0;
    visible.slice().reverse().forEach((t, k) => {
      const h = natural.get(t);
      // Recolhida, a pilha mostra só a borda dos de trás, todos com a altura do da frente
      const behind = !expanded && k > 0;
      t.el.style.height = behind ? `${frontH}px` : `${h}px`;
      t.el.toggleAttribute("data-behind", behind);
      const hiddenNow = k >= maxVisible();
      t.el.toggleAttribute("data-hidden", hiddenNow);
      t.el.style.zIndex = String(100 - k);
      // Entrando: a transformação de partida vem do CSS; a pilha só assume depois do primeiro quadro
      if (t.dragX || t.state === "entering") return;
      if (expanded) {
        t.el.style.transform = `translateY(${-offset}px)`;
        offset += h + 10;
      } else {
        t.el.style.transform = `translateY(${-k * 10}px) scale(${1 - k * 0.05})`;
      }
    });
    const height = expanded ? Math.max(0, offset - 10) : front ? frontH + Math.min(visible.length - 1, maxVisible() - 1) * 10 : 0;
    list.style.setProperty("--stack-h", `${height}px`);
  }

  function schedule(t) {
    clearTimeout(t.timer);
    if (!isFinite(t.remaining) || paused) return;
    t.started = performance.now();
    t.timer = setTimeout(() => dismiss(t), t.remaining);
  }

  function pauseAll() {
    if (paused) return;
    paused = true;
    for (const t of items) {
      clearTimeout(t.timer);
      if (isFinite(t.remaining) && t.started) t.remaining = Math.max(1200, t.remaining - (performance.now() - t.started));
    }
  }

  function resumeAll() {
    if (!paused) return;
    paused = false;
    items.forEach(schedule);
  }

  function dismiss(t, direction = 0) {
    if (!t || t.state === "leaving") return;
    t.state = "leaving";
    clearTimeout(t.timer);
    t.el.dataset.state = "leaving";
    const dx = direction || 0;
    t.el.style.transform = dx ? `translateX(${dx * 120}%)` : "translateY(12px) scale(0.98)";
    const remove = () => {
      const i = items.indexOf(t);
      if (i >= 0) items.splice(i, 1);
      t.el.remove();
      if (!items.length) { expanded = false; resumeAll(); }
      layout();
    };
    if (reduced()) remove(); else setTimeout(remove, 230);
    layout();
  }

  function attachSwipe(t) {
    let startX = 0, startY = 0, startT = 0, active = false;
    t.el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      active = true; startX = e.clientX; startY = e.clientY; startT = performance.now();
      t.el.setPointerCapture(e.pointerId);
    });
    t.el.addEventListener("pointermove", (e) => {
      if (!active) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) < 4 && !t.dragX) return;
      if (!t.dragX && Math.abs(e.clientY - startY) > Math.abs(dx)) { active = false; return; }
      t.dragX = dx;
      t.el.classList.add("is-dragging");
      t.el.style.transform = `translateX(${dx}px)`;
      t.el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 260));
    });
    const end = (e) => {
      if (!active) return;
      active = false;
      const dx = t.dragX || 0;
      const speed = Math.abs(dx) / Math.max(1, performance.now() - startT);
      t.el.classList.remove("is-dragging");
      t.el.style.opacity = "";
      t.dragX = 0;
      if (Math.abs(dx) > 90 || (Math.abs(dx) > 30 && speed > 0.6)) dismiss(t, Math.sign(dx));
      else layout();
    };
    t.el.addEventListener("pointerup", end);
    t.el.addEventListener("pointercancel", end);
  }

  function render(t) {
    const { tone = "info", title, body, action } = t.opts;
    t.el.dataset.tone = tone;
    t.el.setAttribute("role", tone === "error" ? "alert" : "status");
    t.el.setAttribute("aria-atomic", "true");
    t.el.innerHTML = `
      <span class="toast-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[tone] || ICONS.info}</svg></span>
      <div class="toast-text"><p class="toast-title"></p>${body ? '<p class="toast-body"></p>' : ""}</div>
      ${action ? '<button type="button" class="toast-action"></button>' : ""}
      <button type="button" class="toast-close" aria-label="Fechar notificação"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg></button>`;
    t.el.querySelector(".toast-title").textContent = title;
    if (body) t.el.querySelector(".toast-body").textContent = body;
    if (action) {
      const btn = t.el.querySelector(".toast-action");
      btn.textContent = action.label;
      btn.addEventListener("click", () => { dismiss(t); action.onClick(); });
    }
    t.el.querySelector(".toast-close").addEventListener("click", () => dismiss(t));
  }

  function show(opts) {
    // Um aviso com o mesmo id é atualizado no lugar, em vez de empilhar uma cópia
    const existing = opts.id && items.find((t) => t.opts.id === opts.id && t.state !== "leaving");
    const chars = (opts.title || "").length + (opts.body || "").length;
    const duration = opts.duration ?? (opts.tone === "error" ? Infinity : Math.min(9000, Math.max(4000, 2000 + chars * 22)));
    if (existing) {
      existing.opts = opts;
      existing.remaining = duration;
      render(existing);
      schedule(existing);
      layout();
      return existing;
    }
    const el = document.createElement("li");
    el.className = "toast";
    el.dataset.state = "entering";
    const t = { el, opts, remaining: duration, state: "entering", dragX: 0 };
    render(t);
    list.append(el);
    items.push(t);
    attachSwipe(t);
    layout();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      t.state = "shown";
      delete el.dataset.state;
      layout();
    }));
    schedule(t);
    if (opts.tone === "success") haptic();
    return t;
  }

  const region = ui.toasts;
  region.addEventListener("pointerenter", () => { expanded = items.length > 1; pauseAll(); layout(); });
  region.addEventListener("pointerleave", () => {
    if (region.contains(document.activeElement)) return;
    expanded = false; resumeAll(); layout();
  });
  region.addEventListener("focusin", () => { expanded = items.length > 1; pauseAll(); layout(); });
  region.addEventListener("focusout", (e) => {
    if (region.contains(e.relatedTarget) || region.matches(":hover")) return;
    expanded = false; resumeAll(); layout();
  });
  region.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const focused = items.find((t) => t.el.contains(document.activeElement));
    dismiss(focused || items[items.length - 1]);
  });
  addEventListener("resize", layout);

  return {
    show,
    dismiss: (id) => dismiss(items.find((t) => t.opts.id === id)),
  };
})();

// ------------------------------------------------------------------ campo de link

function syncSlotButtons() {
  const hasText = ui.input.value.length > 0;
  ui.clear.hidden = !hasText;
  ui.paste.hidden = hasText || !navigator.clipboard?.readText;
}

function showFieldError(message) {
  ui.urlError.textContent = message;
  ui.urlError.hidden = false;
  ui.urlHint.hidden = true;
  ui.input.setAttribute("aria-invalid", "true");
  const slot = ui.input.closest(".slot");
  slot.classList.add("is-invalid");
  slot.classList.remove("is-shaking");
  void slot.offsetWidth;
  slot.classList.add("is-shaking");
  slot.addEventListener("animationend", () => slot.classList.remove("is-shaking"), { once: true });
}

function clearFieldError() {
  ui.urlError.hidden = true;
  ui.urlHint.hidden = false;
  ui.input.removeAttribute("aria-invalid");
  ui.input.closest(".slot").classList.remove("is-invalid");
}

ui.input.addEventListener("input", () => { clearFieldError(); syncSlotButtons(); });

ui.input.addEventListener("paste", (event) => {
  const text = event.clipboardData?.getData("text");
  if (text && videoIdFrom(text)) setTimeout(() => lookup(ui.input.value), 0);
});

ui.clear.addEventListener("click", () => {
  ui.input.value = "";
  clearFieldError();
  syncSlotButtons();
  ui.input.focus();
});

ui.paste.addEventListener("click", async () => {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) throw new Error("vazio");
    ui.input.value = text;
    syncSlotButtons();
    lookup(text);
  } catch {
    ui.input.focus();
    showFieldError("O navegador não liberou a área de transferência. Toque e segure no campo e escolha Colar.");
  }
});

ui.form.addEventListener("submit", (event) => {
  event.preventDefault();
  lookup(ui.input.value);
});

ui.sample.addEventListener("click", () => {
  ui.input.value = SAMPLE_URL;
  syncSlotButtons();
  lookup(SAMPLE_URL);
});

// ------------------------------------------------------------------ busca

const ERROR_TITLES = {
  invalid_url: "Link não reconhecido",
  private: "Vídeo privado",
  age_restricted: "Vídeo com restrição de idade",
  unavailable: "Vídeo indisponível",
  live: "Transmissão ao vivo em andamento",
  upcoming: "Vídeo ainda não publicado",
  too_long: "Vídeo longo demais",
  region_blocked: "Vídeo bloqueado nesta região",
  members_only: "Vídeo só para membros",
  bot_check: "O YouTube pediu uma verificação",
  network: "Sem resposta do YouTube",
  offline: "Sem conexão",
  blocked: "O YouTube recusou o arquivo",
};
const PERMANENT = new Set(["invalid_url", "private", "age_restricted", "unavailable", "too_long", "region_blocked", "members_only", "live", "upcoming"]);

async function lookup(raw) {
  const id = videoIdFrom(raw);
  if (!id) {
    showFieldError(raw.trim()
      ? "Isso não parece um link de vídeo do YouTube. No app, toque em Compartilhar, copie o link e cole aqui."
      : "Cole o link de um vídeo do YouTube para continuar.");
    ui.input.focus();
    return;
  }
  clearFieldError();
  if (state.info?.id === id && !ui.result.hidden) {
    ui.result.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    return;
  }

  const seq = ++state.lookupSeq;
  resetResult();
  dropDemo();
  ui.empty.hidden = true;
  ui.lookupError.hidden = true;
  ui.skeleton.classList.remove("is-leaving");
  ui.skeleton.hidden = false;
  setBusy(ui.lookupBtn, true, "Buscando…");
  announce("Buscando o vídeo.");

  try {
    const info = await api(`/api/info?url=${encodeURIComponent(id)}`);
    if (seq !== state.lookupSeq) return;
    state.info = info;
    await leaveSkeleton();
    if (seq !== state.lookupSeq) return;
    renderResult();
    history.replaceState(null, "", `?v=${id}`);
  } catch (err) {
    if (seq !== state.lookupSeq) return;
    ui.skeleton.hidden = true;
    showLookupError(err);
  } finally {
    if (seq === state.lookupSeq) setBusy(ui.lookupBtn, false);
  }
}

// O esqueleto sai em 160ms enquanto o resultado entra no mesmo lugar
function leaveSkeleton() {
  if (reduced() || ui.skeleton.hidden) { ui.skeleton.hidden = true; return Promise.resolve(); }
  ui.skeleton.classList.add("is-leaving");
  return new Promise((resolve) => setTimeout(() => {
    ui.skeleton.hidden = true;
    ui.skeleton.classList.remove("is-leaving");
    resolve();
  }, 150));
}

function showLookupError(err) {
  ui.lookupErrorTitle.textContent = ERROR_TITLES[err.code] || "Não foi possível abrir este vídeo";
  ui.lookupErrorText.textContent = err.message;
  const permanent = PERMANENT.has(err.code);
  ui.lookupRetry.textContent = permanent ? "Usar outro link" : "Tentar de novo";
  ui.lookupRetry.dataset.mode = permanent ? "edit" : "retry";
  ui.lookupError.hidden = false;
  enter(ui.lookupError);
  announce(`${ui.lookupErrorTitle.textContent}. ${err.message}`);
}

ui.lookupRetry.addEventListener("click", () => {
  if (ui.lookupRetry.dataset.mode === "edit") {
    ui.lookupError.hidden = true;
    ui.input.focus();
    ui.input.select();
  } else {
    lookup(ui.input.value);
  }
});

function resetResult() {
  clearTimeout(state.pollTimer);
  stopPreview();
  state.info = null;
  state.send = null;
  state.view = "none";
  ui.result.hidden = true;
  ui.send.hidden = true;
}

// ------------------------------------------------------------------ resultado

function renderResult() {
  const info = state.info;
  ui.thumb.classList.remove("is-loaded");
  ui.thumb.hidden = false;
  ui.thumb.onload = () => ui.thumb.classList.add("is-loaded");
  ui.thumb.onerror = () => { ui.thumb.hidden = true; };
  ui.thumb.src = info.thumbnail || "";
  if (ui.thumb.complete && ui.thumb.naturalWidth) ui.thumb.classList.add("is-loaded");
  ui.duration.textContent = info.duration ? fmtClock(info.duration) : "";
  ui.duration.hidden = !info.duration;
  ui.title.textContent = info.title;
  ui.channel.textContent = info.channel || "";
  ui.meta.replaceChildren(
    ...[fmtViews(info.view_count), fmtDate(info.upload_date)].filter(Boolean).map((text) => {
      const span = document.createElement("span");
      span.textContent = text;
      return span;
    }),
  );
  document.querySelector(`input[name="format"][value="${state.format}"]`).checked = true;
  renderQualities({ animate: false });
  ui.result.hidden = false;
  document.body.classList.add("has-video");

  // O único momento orquestrado da página: o resultado chega em ordem de leitura
  if (!reduced()) {
    [...ui.result.querySelectorAll(":scope > .video, :scope > .group, :scope > .dock")].forEach((el, i) => el.style.setProperty("--i", i));
    ui.result.classList.add("is-entering");
    setTimeout(() => ui.result.classList.remove("is-entering"), 900);
  }
  requestAnimationFrame(() => { syncIndicator(ui.qualityList, true); syncDock(); });
  announce(`${info.title}. Escolha o formato e a qualidade.`);
}

function defaultQuality(format, options) {
  if (format === "mp3") return options.find((o) => o.quality === 192)?.quality ?? options[0].quality;
  return (options.find((o) => o.quality === 720) || options.find((o) => o.quality <= 1080) || options[0]).quality;
}

function renderQualities({ animate = true } = {}) {
  const options = state.info.options[state.format] || [];
  const group = ui.qualityList.closest(".group");
  const apply = () => {
    ui.qualityList.querySelectorAll(".choice").forEach((row) => row.remove());
    ui.qualityEmpty.hidden = options.length > 0;
    ui.qualityList.hidden = options.length === 0;
    if (!options.length) return;
    if (!options.some((o) => o.quality === state.quality[state.format])) {
      state.quality[state.format] = defaultQuality(state.format, options);
    }
    options.forEach((option, i) => {
      const label = document.createElement("label");
      label.className = animate ? "choice is-new" : "choice";
      label.style.setProperty("--i", i);
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "quality";
      input.value = option.quality;
      input.checked = option.quality === state.quality[state.format];
      const main = Object.assign(document.createElement("span"), { className: "choice-main num", textContent: option.label });
      const note = Object.assign(document.createElement("span"), { className: "choice-note", textContent: option.note });
      const size = Object.assign(document.createElement("span"), {
        className: "choice-size num",
        textContent: option.size ? `≈ ${fmtBytes(option.size)}` : "",
      });
      label.append(input, main, note, size);
      if (animate) label.addEventListener("animationend", () => label.classList.remove("is-new"), { once: true });
      ui.qualityList.append(label);
    });
  };
  // A lista troca de altura junto com as linhas: o que vem abaixo desce ou sobe com ela
  if (animate) morphHeight(group, apply, 320); else apply();
  syncIndicator(ui.qualityList, true);
  syncJobUI();
}

function selectFormat(format) {
  state.format = format;
  document.querySelector(`input[name="format"][value="${format}"]`).checked = true;
  renderQualities();
}

document.querySelectorAll('input[name="format"]').forEach((radio) => {
  radio.addEventListener("change", () => selectFormat(radio.value));
});

ui.useMp3.addEventListener("click", () => {
  selectFormat("mp3");
  ui.downloadBtn.focus();
});

ui.qualityList.addEventListener("change", (event) => {
  if (event.target.name !== "quality") return;
  state.quality[state.format] = Number(event.target.value);
  syncIndicator(ui.qualityList);
  syncJobUI();
});

// ------------------------------------------------------------------ pedido de download

function setChoicesLocked(locked) {
  ui.result.querySelectorAll("fieldset.group:not(#send-mode)").forEach((fs) => { fs.disabled = locked; });
}

function viewFor(job) {
  if (!job || job.status === "cancelled") return "actions";
  if (ACTIVE.has(job.status)) return "job";
  if (job.status === "ready") return job.revealAt && performance.now() < job.revealAt ? "job" : "done";
  return "error";
}

function syncJobUI() {
  if (!state.info) return;
  const job = currentJob();
  const hasOptions = (state.info.options[state.format] || []).length > 0;
  ui.downloadBtn.textContent = `Baixar ${state.format.toUpperCase()}`;
  ui.downloadBtn.disabled = !hasOptions || state.starting;
  ui.shareBtn.disabled = !hasOptions || state.starting;

  const view = viewFor(job);
  const apply = () => {
    ui.actions.hidden = view !== "actions";
    ui.job.hidden = view !== "job";
    ui.jobError.hidden = view !== "error";
    ui.done.hidden = view !== "done";
  };
  if (view !== state.view) {
    const first = state.view === "none";
    state.view = view;
    // O dock muda de altura com o conteúdo; o painel novo entra depois do container abrir
    if (first) apply(); else morphHeight(ui.dock, apply, 340);
    if (!first) enter({ actions: ui.actions, job: ui.job, error: ui.jobError, done: ui.done }[view]);
  } else {
    apply();
  }
  setChoicesLocked(view === "job");

  if (view === "job") renderProgress(job);
  if (view === "error") renderJobError(job);
  if (view === "done") renderDone(job);
  if (!state.send || state.send.key !== currentKey() || view !== "done") {
    if (!ui.send.hidden) stopPreview();
    ui.send.hidden = true;
  }
  syncDoneActions();
  syncDock();
}

// Com o painel de envio aberto, o botão "Enviar no WhatsApp" do bloco Pronto seria repetido.
function syncDoneActions() {
  const sending = !ui.send.hidden;
  ui.openSendBtn.hidden = sending;
  ui.doneActions.classList.toggle("is-single", sending);
}

async function startJob(intent) {
  const key = currentKey();
  const existing = state.jobs.get(key);
  if (existing?.status === "ready") return onReady(existing, intent);
  if (existing && ACTIVE.has(existing.status)) return;
  if (state.starting) return;

  state.starting = true;
  syncJobUI();
  try {
    const job = await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ url: state.info.id, format: state.format, quality: state.quality[state.format] }),
    });
    job.intent = intent;
    state.jobs.set(key, job);
    announce("Preparando o arquivo.");
    poll(key);
  } catch (err) {
    state.jobs.set(key, { status: "error", intent, error: { code: err.code, message: err.message } });
  } finally {
    state.starting = false;
    syncJobUI();
  }
}

ui.downloadBtn.addEventListener("click", () => startJob("download"));
ui.shareBtn.addEventListener("click", () => startJob("share"));

function poll(key) {
  clearTimeout(state.pollTimer);
  state.pollFails = 0;
  let lastStage = "";
  const tick = async () => {
    const job = state.jobs.get(key);
    if (!job || !ACTIVE.has(job.status)) return;
    try {
      const fresh = await api(`/api/jobs/${job.id}`);
      fresh.intent = job.intent;
      if (fresh.status === "ready") fresh.revealAt = performance.now() + (reduced() ? 0 : 520);
      state.jobs.set(key, fresh);
      state.pollFails = 0;
      if (fresh.stage !== lastStage && fresh.status !== "ready") { lastStage = fresh.stage; announce(fresh.stage); }
      if (key === currentKey()) syncJobUI();
      if (fresh.status === "ready") {
        // As etapas fecham em Pronto antes do painel virar o bloco do arquivo
        setTimeout(() => { if (key === currentKey()) { syncJobUI(); onReady(fresh, fresh.intent); } else notifyReadyElsewhere(fresh); }, reduced() ? 0 : 540);
        return;
      }
      if (fresh.status === "error" && key === currentKey()) announce(fresh.error?.message || "Erro ao preparar o arquivo.");
      if (!ACTIVE.has(fresh.status)) return;
    } catch (err) {
      if (err.status === 404 || ++state.pollFails >= 6) {
        state.jobs.set(key, { ...job, status: "error", error: { code: err.code, message: err.status === 404 ? err.message : "A conexão com o servidor caiu. Confira a internet e tente de novo." } });
        if (key === currentKey()) syncJobUI();
        return;
      }
    }
    state.pollTimer = setTimeout(tick, 600);
  };
  state.pollTimer = setTimeout(tick, 300);
}

function renderProgress(job) {
  const ready = job.status === "ready";
  rollText(ui.jobStage, ready ? "Pronto" : job.status === "queued" ? "Na fila" : job.stage);

  // Etapas: Baixar → Converter (ou Juntar, no MP4) → Pronto
  const reached = ready ? 3 : job.status === "processing" ? 1 : 0;
  ui.stepItems.forEach((li, i) => { li.dataset.state = i < reached ? "done" : i === reached ? "current" : "todo"; });
  ui.stepProcess.textContent = job.format === "mp4" ? "Juntar" : "Converter";

  const downloading = job.status === "downloading" && job.progress != null;
  const waiting = job.status === "queued" || (job.status === "downloading" && job.progress == null);
  ui.stepsTrack.classList.toggle("is-waiting", waiting);
  ui.stepsTrack.classList.toggle("is-processing", job.status === "processing");
  const fill = ready ? 100 : downloading ? job.progress * 50 : job.status === "processing" ? 50 : 0;
  ui.stepsFill.style.width = `${fill}%`;

  if (downloading) {
    const pct = Math.min(99, Math.floor(job.progress * 100));
    countTo(ui.jobPercent, pct);
    ui.steps.setAttribute("aria-valuenow", String(pct));
  } else {
    countTo(ui.jobPercent, null);
    ui.steps.removeAttribute("aria-valuenow");
  }

  const parts = [];
  if (ready) parts.push("Arquivo pronto.");
  else if (job.status === "queued") parts.push("Outros arquivos estão sendo preparados. Já já é a sua vez.");
  else if (job.status === "processing") parts.push("Falta pouco. Isso leva alguns segundos.");
  else if (job.total) {
    parts.push(`${fmtBytes(job.downloaded)} de ${fmtBytes(job.total)}`);
    if (job.speed) parts.push(`${fmtBytes(job.speed)}/s`);
    if (job.eta != null) parts.push(fmtEta(job.eta));
  } else if (job.downloaded) {
    parts.push(`${fmtBytes(job.downloaded)} baixados`);
  }
  ui.jobNumbers.replaceChildren(...parts.map((t) => Object.assign(document.createElement("span"), { textContent: t })));
  ui.cancelBtn.disabled = ready;
}

ui.cancelBtn.addEventListener("click", async () => {
  const key = currentKey();
  const job = state.jobs.get(key);
  if (!job?.id) return;
  ui.cancelBtn.disabled = true;
  clearTimeout(state.pollTimer);
  try { await api(`/api/jobs/${job.id}`, { method: "DELETE" }); } catch { /* o pedido some sozinho */ }
  state.jobs.delete(key);
  syncJobUI();
  ui.downloadBtn.focus();
  toaster.show({
    tone: "info",
    title: "Preparo cancelado",
    body: `${state.format.toUpperCase()} ${job.quality_label || ""}`.trim(),
    action: { label: "Recomeçar", onClick: () => startJob(job.intent || "download") },
  });
});

function renderJobError(job) {
  const expired = job.status === "expired";
  ui.jobErrorTitle.textContent = expired ? "O arquivo expirou" : "Não deu para preparar o arquivo";
  ui.jobErrorText.textContent = expired
    ? "Ele foi apagado do servidor depois do prazo. Gere de novo; leva só alguns segundos."
    : job.error?.message || "Tente de novo.";
  ui.jobRetry.textContent = expired ? "Gerar de novo" : "Tentar de novo";
}

ui.jobRetry.addEventListener("click", () => {
  const key = currentKey();
  const intent = state.jobs.get(key)?.intent || "download";
  state.jobs.delete(key);
  startJob(intent);
});

const expiryTimers = new Map();

function onReady(job, intent) {
  job.saved = job.saved || intent === "download";
  syncJobUI();
  if (!expiryTimers.has(job.id) && job.expires_at) {
    const key = currentKey();
    const ms = Math.max(0, job.expires_at * 1000 - Date.now());
    expiryTimers.set(job.id, setTimeout(() => {
      const stored = state.jobs.get(key);
      if (stored?.id === job.id) {
        state.jobs.set(key, { ...stored, status: "expired" });
        if (key === currentKey()) syncJobUI();
      }
    }, ms));
  }
  flagTitleIfHidden(job);
  if (intent === "download") {
    saveFromUrl(`/api/jobs/${job.id}/file`, job.filename);
    toaster.show({
      tone: "success",
      title: "Download iniciado",
      body: job.filename,
      action: { label: "Enviar no WhatsApp", onClick: () => openSend() },
    });
  } else if (intent === "share") {
    openSend();
  }
}

// Pronto enquanto a pessoa olhava outra coisa: avisa por toast e no título da aba
function notifyReadyElsewhere(job) {
  toaster.show({ tone: "success", title: `${job.format.toUpperCase()} pronto`, body: job.filename });
  flagTitleIfHidden(job);
}

function flagTitleIfHidden(job) {
  if (!document.hidden) return;
  document.title = `Pronto: ${job.filename} | Puxa`;
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) document.title = BASE_TITLE; });

function renderDone(job) {
  ui.doneName.textContent = job.filename;
  ui.doneSize.textContent = fmtBytes(job.size);
  ui.saveBtn.href = `/api/jobs/${job.id}/file`;
  ui.saveBtn.download = job.filename;
  ui.saveBtn.textContent = job.saved ? "Salvar de novo" : "Salvar no aparelho";
  const until = job.expires_at ? ` Fica disponível aqui até ${fmtHour(job.expires_at)}.` : "";
  ui.doneNote.textContent = job.saved
    ? `Se o download não aparecer, toque em Salvar de novo.${until}`
    : `Pronto para salvar ou mandar.${until}`;
}

ui.saveBtn.addEventListener("click", () => {
  const job = currentJob();
  if (job) { job.saved = true; renderDone(job); }
});

ui.openSendBtn.addEventListener("click", () => openSend());

// ------------------------------------------------------------------ dock fixo no celular

// No celular, ações, progresso e o bloco Pronto ficam presos ao rodapé enquanto a lista
// de qualidade empurra o lugar deles para baixo da tela. Os toasts sobem para não cobri-los.
let dockFrame = 0;
function syncDock() {
  cancelAnimationFrame(dockFrame);
  dockFrame = requestAnimationFrame(() => {
    const shown = !ui.result.hidden;
    const below = ui.dockSentinel.getBoundingClientRect().top > innerHeight - 1;
    const stuck = shown && isNarrow.matches && below;
    ui.dock.classList.toggle("is-stuck", stuck);
    document.documentElement.style.setProperty("--toast-lift", stuck ? `${ui.dock.offsetHeight}px` : "0px");
  });
}
addEventListener("scroll", syncDock, { passive: true });
addEventListener("resize", syncDock);
isNarrow.addEventListener("change", syncDock);

// ------------------------------------------------------------------ envio para o WhatsApp

function shareCapability(format) {
  if (!window.isSecureContext) return "insecure";
  if (!navigator.canShare) return "unsupported";
  try {
    const probe = new File([new Uint8Array(4)], `teste.${format}`, { type: MIME[format] });
    return navigator.canShare({ files: [probe] }) ? "ok" : "unsupported";
  } catch {
    return "unsupported";
  }
}

function openSend() {
  const job = currentJob();
  if (!job || job.status !== "ready") return;
  const key = currentKey();
  if (!state.send || state.send.key !== key) {
    const duration = job.duration || state.info.duration || 0;
    state.send = {
      key, job, duration,
      mode: "whole",
      start: 0,
      end: Math.min(duration, 30),
      peaks: null,
      waveIntro: 0,
      wholeFile: null, wholeLoading: null,
      clip: null, clipFile: null,
      busy: false,
      capability: shareCapability(job.format),
    };
    document.querySelector('input[name="send-mode"][value="whole"]').checked = true;
    ui.trim.hidden = true;
    ui.audio.removeAttribute("src");
    setSendHint("");
  }
  const s = state.send;
  const isAudio = job.format === "mp3";
  ui.sendMode.hidden = !isAudio;
  ui.sendSummary.hidden = isAudio;
  ui.wholeDuration.textContent = fmtClock(s.duration);
  ui.wholeSize.textContent = fmtBytes(job.size);
  ui.summaryDuration.textContent = fmtClock(s.duration);
  ui.summarySize.textContent = fmtBytes(job.size);

  ui.unsupported.hidden = s.capability === "ok";
  ui.waWeb.hidden = s.capability === "ok";
  ui.sendBtn.classList.toggle("btn-whatsapp", s.capability === "ok");
  ui.sendBtn.classList.toggle("btn-primary", s.capability !== "ok");
  ui.unsupported.textContent = s.capability === "insecure"
    ? "O envio direto para o WhatsApp só funciona com o site aberto em HTTPS. Por enquanto, salve o arquivo e anexe na conversa."
    : "Este navegador não entrega arquivos direto para o WhatsApp. Salve o arquivo e anexe na conversa, pelo app ou pelo WhatsApp Web.";

  const wasHidden = ui.send.hidden;
  ui.send.hidden = false;
  if (wasHidden) enter(ui.send);
  syncDoneActions();
  syncSendUI();
  requestAnimationFrame(() => syncIndicator(ui.sendMode.querySelector(".choices"), true));
  ui.sendTitle.focus({ preventScroll: true });
  ui.send.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });

  if (s.capability === "ok" && job.size <= PREFETCH_LIMIT) prefetchWhole();
}

function prefetchWhole() {
  const s = state.send;
  if (!s || s.wholeFile || s.wholeLoading) return s?.wholeLoading;
  const { job } = s;
  s.wholeLoading = fetchFile(`/api/jobs/${job.id}/file`, job.filename, MIME[job.format])
    .then((file) => { if (state.send === s) s.wholeFile = file; return file; })
    .finally(() => { s.wholeLoading = null; });
  s.wholeLoading.catch(() => { /* tratado quando a pessoa tocar em Enviar */ });
  return s.wholeLoading;
}

document.querySelectorAll('input[name="send-mode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!state.send) return;
    state.send.mode = radio.value;
    setSendHint("");
    syncIndicator(ui.sendMode.querySelector(".choices"));
    if (radio.value === "clip") {
      morphHeight(ui.send, () => { ui.trim.hidden = false; }, 360);
      enter(ui.trim);
      enterClipMode();
    } else {
      stopPreview();
      morphHeight(ui.send, () => { ui.trim.hidden = true; }, 300);
    }
    syncSendUI();
  });
});

function clipMatches() {
  const s = state.send;
  return s.clip && Math.abs(s.clip.start - s.start) < 0.05 && Math.abs(s.clip.end - s.end) < 0.05;
}

function syncSendUI() {
  const s = state.send;
  if (!s) return;
  const verb = s.capability === "ok" ? "Enviar" : "Salvar";
  const isClip = s.mode === "clip" && s.job.format === "mp3";
  const length = s.end - s.start;
  const label = s.job.format === "mp4"
    ? `${verb} vídeo`
    : isClip ? `${verb} trecho de ${fmtClock(length)}` : `${verb} áudio inteiro`;
  if (!ui.sendBtn.classList.contains("is-confirmed")) setLabel(ui.sendBtn, label);
  ui.sendBtn.dataset.idle = label;

  const size = isClip ? (s.duration ? (s.job.size * length) / s.duration : null) : s.job.size;
  const kind = s.job.format === "mp3" ? "áudio" : "vídeo";
  ui.sizeNote.hidden = !(size > WHATSAPP_MEDIA_LIMIT);
  ui.sizeNote.textContent = s.job.format === "mp3"
    ? `Com ${fmtBytes(size)}, o WhatsApp pode mandar como documento em vez de ${kind}. Um trecho mais curto vai como ${kind} normal.`
    : `Com ${fmtBytes(size)}, o WhatsApp pode mandar como documento em vez de ${kind}. Para ir como ${kind} normal, escolha uma qualidade menor.`;
}

function setSendHint(text, tone = "") {
  ui.sendHint.textContent = text;
  ui.sendHint.classList.toggle("field-error", tone === "error");
  ui.sendHint.classList.toggle("hint", tone !== "error");
}

// O botão confirma em si mesmo: o rótulo troca por "Enviado" com um check e volta depois
function confirmOnButton(text) {
  const btn = ui.sendBtn;
  if (!btn.querySelector(".btn-check")) {
    btn.insertAdjacentHTML("afterbegin", '<svg class="btn-check" viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>');
  }
  btn.classList.add("is-swapping");
  setTimeout(() => {
    setLabel(btn, text);
    btn.classList.add("is-confirmed");
    btn.classList.remove("is-swapping");
  }, reduced() ? 0 : 120);
  clearTimeout(btn._confirmTimer);
  btn._confirmTimer = setTimeout(() => {
    btn.classList.add("is-swapping");
    setTimeout(() => {
      btn.classList.remove("is-confirmed", "is-swapping");
      setLabel(btn, btn.dataset.idle || text);
    }, reduced() ? 0 : 120);
  }, 2200);
}

ui.sendBtn.addEventListener("click", onSendClick);

async function onSendClick() {
  const s = state.send;
  if (!s || s.busy) return;
  const isClip = s.mode === "clip" && s.job.format === "mp3";
  if (isClip && !commitTimeInputs()) return;
  stopPreview();

  // Sem suporte a arquivos no menu de compartilhar: salva no aparelho.
  if (s.capability !== "ok") {
    if (!isClip) {
      saveFromUrl(`/api/jobs/${s.job.id}/file`, s.job.filename);
      confirmOnButton("Salvo");
      toaster.show({ tone: "success", title: "Download iniciado", body: "Agora é só anexar o arquivo na conversa do WhatsApp." });
      return;
    }
    await withSendBusy("Cortando…", async () => {
      const clip = await ensureClip();
      saveFromUrl(clip.url, clip.filename);
      confirmOnButton("Salvo");
      toaster.show({ tone: "success", title: "Trecho salvo", body: `${clip.filename}. Agora é só anexar na conversa do WhatsApp.` });
    });
    return;
  }

  // Arquivo já em memória: compartilha ainda dentro do toque (exigência do navegador).
  const ready = isClip ? (clipMatches() ? s.clipFile : null) : s.wholeFile;
  if (ready) { deliver(ready); return; }

  await withSendBusy(isClip ? "Cortando…" : "Preparando…", async () => {
    let file;
    if (isClip) {
      const clip = await ensureClip();
      setLabel(ui.sendBtn, "Preparando…");
      file = await fetchFile(clip.url, clip.filename, MIME.mp3, (p) => setLabel(ui.sendBtn, `Preparando ${Math.round(p * 100)}%`));
      if (state.send === s && clipMatches()) s.clipFile = file;
    } else {
      file = s.wholeFile || await (prefetchWhole() || Promise.resolve(null));
      if (!file) {
        file = await fetchFile(`/api/jobs/${s.job.id}/file`, s.job.filename, MIME[s.job.format],
          (p) => setLabel(ui.sendBtn, `Preparando ${Math.round(p * 100)}%`));
        s.wholeFile = file;
      }
    }
    return file;
  }).then((file) => { if (file && state.send === s) deliver(file); });
}

async function withSendBusy(label, work) {
  const s = state.send;
  s.busy = true;
  setSendHint("");
  setBusy(ui.sendBtn, true, label);
  try {
    return await work();
  } catch (err) {
    setSendHint(err.message || "Algo deu errado. Tente de novo.", "error");
    return null;
  } finally {
    s.busy = false;
    setBusy(ui.sendBtn, false);
    syncSendUI();
  }
}

async function ensureClip() {
  const s = state.send;
  if (clipMatches()) return s.clip;
  const clip = await api(`/api/jobs/${s.job.id}/clips`, {
    method: "POST",
    body: JSON.stringify({ start: s.start, end: s.end }),
  });
  s.clip = clip;
  s.clipFile = null;
  return clip;
}

function deliver(file) {
  // O navegador só abre o menu de compartilhar logo depois de um toque. Se a preparação
  // demorou, o toque "venceu": pedimos um segundo toque, com o arquivo já pronto.
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    setSendHint("Arquivo pronto. Toque de novo no botão e escolha o WhatsApp no menu.");
    ui.sendBtn.focus();
    return;
  }
  navigator.share({ files: [file] })
    .then(() => {
      setSendHint("");
      confirmOnButton("Enviado");
      toaster.show({ tone: "success", title: "Entregue ao WhatsApp", body: "Escolha a conversa por lá." });
    })
    .catch((err) => {
      if (err.name === "AbortError") setSendHint("");
      else if (err.name === "NotAllowedError") setSendHint("Arquivo pronto. Toque de novo no botão e escolha o WhatsApp no menu.");
      else setSendHint("O menu de compartilhar não abriu. Use Salvar no aparelho e anexe o arquivo no WhatsApp.", "error");
    });
}

// ------------------------------------------------------------------ editor de trecho

async function enterClipMode() {
  const s = state.send;
  ui.waveError.hidden = true;
  if (!ui.audio.getAttribute("src")) ui.audio.src = `/api/jobs/${s.job.id}/file?inline=1`;
  syncTrimUI();
  // No celular o editor nasce abaixo da dobra: traz a onda e os campos para a tela.
  setTimeout(() => ui.trim.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" }), 380);
  if (s.peaks) { drawWave(); return; }
  ui.waveLoading.hidden = false;
  try {
    const data = await api(`/api/jobs/${s.job.id}/waveform`);
    if (state.send !== s) return;
    s.peaks = data.peaks;
    if (data.duration) s.duration = data.duration;
    s.waveIntro = performance.now();
  } catch (err) {
    ui.waveError.textContent = err.message;
    ui.waveError.hidden = false;
    s.peaks = [];
  } finally {
    ui.waveLoading.hidden = true;
  }
  syncTrimUI();
  animateWaveIntro();
}

// As barras crescem a partir da linha do meio, da esquerda para a direita, uma vez só
function animateWaveIntro() {
  const s = state.send;
  if (!s?.waveIntro || reduced()) { if (s) s.waveIntro = 0; drawWave(); return; }
  const step = () => {
    if (!state.send || state.send !== s) return;
    drawWave();
    if (performance.now() - s.waveIntro < 900) requestAnimationFrame(step);
    else { s.waveIntro = 0; drawWave(); }
  };
  requestAnimationFrame(step);
}

function syncTrimUI() {
  const s = state.send;
  if (!s) return;
  const d = s.duration || 1;
  const startPct = (s.start / d) * 100;
  const endPct = (s.end / d) * 100;
  ui.hStart.style.left = `${startPct}%`;
  ui.hEnd.style.left = `${endPct}%`;
  placeTimeLabels(startPct, endPct);
  ui.timeStart.textContent = fmtClock(s.start, true);
  ui.timeEnd.textContent = fmtClock(s.end, true);
  for (const [handle, value, min, max] of [
    [ui.hStart, s.start, 0, s.end - MIN_CLIP],
    [ui.hEnd, s.end, s.start + MIN_CLIP, s.duration],
  ]) {
    handle.setAttribute("aria-valuemin", String(Math.round(min)));
    handle.setAttribute("aria-valuemax", String(Math.round(max)));
    handle.setAttribute("aria-valuenow", String(Math.round(value)));
    handle.setAttribute("aria-valuetext", fmtClock(value, true));
  }
  if (document.activeElement !== ui.startInput) ui.startInput.value = fmtClock(s.start, true);
  if (document.activeElement !== ui.endInput) ui.endInput.value = fmtClock(s.end, true);
  ui.clipLength.textContent = fmtClock(s.end - s.start, true);
  const estimate = s.duration ? (s.job.size * (s.end - s.start)) / s.duration : null;
  ui.clipSize.textContent = estimate ? `Trecho com ≈ ${fmtBytes(estimate)}` : "";
  drawWave();
  syncSendUI();
}

// Os tempos ficam sob as alças, mas nunca saem da onda nem encostam um no outro
function placeTimeLabels(startPct, endPct) {
  const width = ui.wave.clientWidth;
  if (!width) return;
  const edge = 20, gap = 46;
  let a = (startPct / 100) * width;
  let b = (endPct / 100) * width;
  a = Math.min(Math.max(a, edge), width - edge - gap);
  b = Math.min(Math.max(b, a + gap), width - edge);
  if (b - a < gap) a = b - gap;
  ui.timeStart.style.setProperty("--x", `${a}px`);
  ui.timeEnd.style.setProperty("--x", `${b}px`);
}

// Quando uma alça empurra a outra, a seleção desliza mantendo a duração que tinha no
// começo do gesto. Assim, levar o início de 0:00 para 1:10 já entrega 1:10 a 1:40.
// Cada movimento é calculado a partir de `origin` (o estado quando o gesto começou),
// e não do movimento anterior, para o resultado não depender de quantos eventos chegaram.
function setEdge(which, seconds, origin = { start: state.send.start, end: state.send.end }) {
  const s = state.send;
  const t = Math.round(seconds * 10) / 10;
  const length = Math.max(MIN_CLIP, origin.end - origin.start);
  if (which === "start") {
    const start = Math.min(Math.max(0, t), Math.max(0, s.duration - MIN_CLIP));
    s.end = start > origin.end - MIN_CLIP ? Math.min(s.duration, start + length) : origin.end;
    s.start = Math.min(start, s.end - MIN_CLIP);
  } else {
    const end = Math.max(Math.min(s.duration, t), MIN_CLIP);
    s.start = end < origin.start + MIN_CLIP ? Math.max(0, end - length) : origin.start;
    s.end = Math.max(end, s.start + MIN_CLIP);
  }
  ui.trimError.hidden = true;
  ui.startInput.removeAttribute("aria-invalid");
  ui.endInput.removeAttribute("aria-invalid");
  setSendHint("");
  syncTrimUI();
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawWave() {
  const s = state.send;
  if (!s || ui.trim.hidden) return;
  const rect = ui.canvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = window.devicePixelRatio || 1;
  ui.canvas.width = Math.round(rect.width * dpr);
  ui.canvas.height = Math.round(rect.height * dpr);
  const ctx = ui.canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const peaks = s.peaks || [];
  if (!peaks.length) return;
  const bar = 2, gap = 1;
  const count = Math.floor(rect.width / (bar + gap));
  const mid = rect.height / 2;
  const maxH = rect.height - 24;
  const idle = cssVar("--wave");
  const active = cssVar("--wave-active");
  const intro = s.waveIntro ? performance.now() - s.waveIntro : Infinity;
  for (let i = 0; i < count; i++) {
    const p = peaks[Math.floor((i / count) * peaks.length)] || 0;
    // Entrada: cada barra cresce em 260ms, começando 1,8ms depois da vizinha à esquerda
    const grow = intro === Infinity ? 1 : Math.min(1, Math.max(0, (intro - i * 1.8) / 260));
    const eased = 1 - Math.pow(1 - grow, 3);
    const h = Math.max(2, p * maxH * eased);
    const x = i * (bar + gap);
    const t = ((x + bar / 2) / rect.width) * s.duration;
    ctx.fillStyle = t >= s.start && t <= s.end ? active : idle;
    ctx.fillRect(x, mid - h / 2, bar, h);
  }
}

new ResizeObserver(() => { drawWave(); if (state.send) syncTrimUI(); }).observe(ui.wave);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => drawWave());

let dragging = null;
let dragOrigin = null;

function timeAt(clientX) {
  const rect = ui.wave.getBoundingClientRect();
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * state.send.duration;
}

ui.wave.addEventListener("pointerdown", (event) => {
  const s = state.send;
  if (!s || !s.duration) return;
  stopPreview();
  const t = timeAt(event.clientX);
  dragOrigin = { start: s.start, end: s.end };
  if (event.target === ui.hStart) dragging = "start";
  else if (event.target === ui.hEnd) dragging = "end";
  else {
    dragging = Math.abs(t - s.start) <= Math.abs(t - s.end) ? "start" : "end";
    setEdge(dragging, t, dragOrigin);
  }
  (dragging === "start" ? ui.hStart : ui.hEnd).focus({ preventScroll: true });
  ui.wave.setPointerCapture(event.pointerId);
  event.preventDefault();
});

ui.wave.addEventListener("pointermove", (event) => {
  if (dragging) setEdge(dragging, timeAt(event.clientX), dragOrigin);
});

for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  ui.wave.addEventListener(type, () => { dragging = null; });
}

for (const [handle, which] of [[ui.hStart, "start"], [ui.hEnd, "end"]]) {
  handle.addEventListener("keydown", (event) => {
    const s = state.send;
    if (!s) return;
    const current = s[which];
    const step = event.shiftKey ? 10 : 1;
    let next;
    switch (event.key) {
      case "ArrowLeft": case "ArrowDown": next = current - step; break;
      case "ArrowRight": case "ArrowUp": next = current + step; break;
      case "PageDown": next = current - 10; break;
      case "PageUp": next = current + 10; break;
      case "Home": next = 0; break;
      case "End": next = s.duration; break;
      default: return;
    }
    event.preventDefault();
    stopPreview();
    setEdge(which, next);
  });
}

function commitTimeInputs() {
  const s = state.send;
  const start = parseClock(ui.startInput.value);
  const end = parseClock(ui.endInput.value);
  const bad = start == null ? ui.startInput : end == null ? ui.endInput : null;
  if (bad) {
    bad.setAttribute("aria-invalid", "true");
    ui.trimError.textContent = "Use minutos e segundos, como 1:05 ou 1:05,5.";
    ui.trimError.hidden = false;
    bad.focus();
    return false;
  }
  if (end - start < MIN_CLIP) {
    ui.endInput.setAttribute("aria-invalid", "true");
    ui.trimError.textContent = "O fim precisa vir pelo menos 1 segundo depois do início.";
    ui.trimError.hidden = false;
    ui.endInput.focus();
    return false;
  }
  s.start = Math.max(0, Math.min(start, s.duration - MIN_CLIP));
  s.end = Math.max(s.start + MIN_CLIP, Math.min(s.duration, end));
  setEdge("end", s.end);
  return true;
}

for (const input of [ui.startInput, ui.endInput]) {
  input.addEventListener("change", () => { stopPreview(); commitTimeInputs(); });
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); input.blur(); } });
  input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); ui.trimError.hidden = true; });
}

// Prévia do trecho
let previewFrame = 0;

function startPreview() {
  const s = state.send;
  if (!s || !commitTimeInputs()) return;
  const seek = () => { ui.audio.currentTime = s.start; };
  if (ui.audio.readyState >= 1) seek();
  else ui.audio.addEventListener("loadedmetadata", seek, { once: true });
  ui.audio.play().then(() => {
    ui.previewBtn.setAttribute("aria-pressed", "true");
    setLabel(ui.previewBtn, "Parar");
    ui.playhead.hidden = false;
    const step = () => {
      const t = ui.audio.currentTime;
      ui.playhead.style.left = `${(t / s.duration) * 100}%`;
      if (t >= s.end || ui.audio.ended) { stopPreview(); return; }
      previewFrame = requestAnimationFrame(step);
    };
    previewFrame = requestAnimationFrame(step);
  }).catch(() => {
    ui.trimError.textContent = "Não foi possível tocar o áudio aqui. Confira se o aparelho não está no silencioso e tente de novo.";
    ui.trimError.hidden = false;
  });
}

function stopPreview() {
  cancelAnimationFrame(previewFrame);
  if (!ui.audio.paused) ui.audio.pause();
  ui.previewBtn.setAttribute("aria-pressed", "false");
  setLabel(ui.previewBtn, "Ouvir trecho");
  ui.playhead.hidden = true;
}

ui.previewBtn.addEventListener("click", () => {
  if (ui.previewBtn.getAttribute("aria-pressed") === "true") stopPreview();
  else startPreview();
});

// ------------------------------------------------------------------ conexão

addEventListener("offline", () => toaster.show({
  id: "net",
  tone: "error",
  title: "Sem internet",
  body: "O que estiver sendo preparado no servidor continua. A página volta a acompanhar quando a conexão voltar.",
}));
addEventListener("online", () => toaster.show({ id: "net", tone: "success", title: "Conexão de volta", duration: 3500 }));

// ------------------------------------------------------------------ demo do estado vazio

// A demo usa React e o kit stageshow; só carrega quando o estado vazio está na tela
// e sai da página assim que um vídeo é buscado, para não animar escondida.
let unmountDemo = null;

function mountDemo() {
  const slot = $("puxa-demo");
  if (!slot || unmountDemo) return;
  for (const href of ["/demo/kit/stageshow.css", "/demo/demo.css"]) {
    document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href }));
  }
  // Espera a fonte para o primeiro quadro não trocar de métrica no meio da animação
  Promise.all([import("/demo/demo.js"), document.fonts?.ready])
    .then(([mod]) => { if (!state.info && !unmountDemo) unmountDemo = mod.mount(slot); })
    .catch(() => { slot.closest(".demo").hidden = true; });
}

function dropDemo() {
  if (unmountDemo) { unmountDemo(); unmountDemo = null; }
  $("puxa-demo")?.closest(".demo")?.setAttribute("hidden", "");
}

// ------------------------------------------------------------------ início

async function boot() {
  syncSlotButtons();
  api("/api/health").then((health) => {
    ui.demoBar.hidden = !health.demo;
    if (health.file_ttl) {
      const minutes = Math.round(health.file_ttl / 60);
      ui.ttlText.textContent = minutes >= 60 && minutes % 60 === 0
        ? `${minutes / 60} hora${minutes === 60 ? "" : "s"}`
        : `${minutes} minutos`;
    }
  }).catch(() => { /* a página funciona sem isso */ });

  const params = new URLSearchParams(location.search);
  const preset = params.get("url") || params.get("v");
  if (!preset) mountDemo();
  if (preset) {
    ui.input.value = videoIdFrom(preset) && params.get("v") ? `https://youtu.be/${videoIdFrom(preset)}` : preset;
    syncSlotButtons();
    lookup(preset);
  }
}

boot();
