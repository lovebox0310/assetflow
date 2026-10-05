// 프로토타입 화면을 Node 에서 실행하기 위한 최소 하네스.
//
// 왜 만들었나:
//   화면 로직을 검증하는 방법이 없었다. temp 스크립트로만 확인했고 그건 커밋되지
//   않아서 아무도 재현하지 못했다. 여기서는 저장소에 있는 도구만으로 같은 확인을
//   되돌린다.
//
// 의존성 0개다. package.json 도 node_modules 도 쓰지 않는다(§30).
// DOM 을 전부 구현하지 않는다. 화면이 실제로 쓰는 것만 담았다. 화면이 아직
// 쓰지 않는 API 를 미리 구현해 두면 그 API 가 없어도 아무도 모른다.
//
// 경로:
//   - 저장소 절대경로를 박지 않는다. 이 파일 위치에서 상대 경로로 푼다.
//     (samples/card/tools 는 Windows 절대경로를 하드코딩해 CI 에서 전부 깨진다)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
/** design/prototype/tools -> 저장소 루트 */
export const ROOT = resolve(HERE, "..", "..", "..");
/** design/prototype */
export const PROTO_DIR = resolve(HERE, "..");
/** apps/frontend */
export const FRONTEND_SRC = resolve(ROOT, "apps", "frontend", "src");

/* ---------------------------------------------------------------- */
/* 결과 누적                                                          */
/* ---------------------------------------------------------------- */

let pass = 0;
const failures = [];

export function check(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    failures.push(name + (detail ? " — " + detail : ""));
  }
}

export function report(title) {
  const total = pass + failures.length;
  console.log(title + ": 총 " + total + "건 중 " + failures.length + "건 실패");
  failures.forEach((f) => console.log("  FAIL " + f));
  if (failures.length > 0) {
    console.log("RESULT: FAIL");
    process.exitCode = 1;
  } else {
    console.log("RESULT: PASS");
  }
  return failures.length === 0;
}

export function passed() {
  return pass;
}

/* ---------------------------------------------------------------- */
/* 최소 DOM                                                           */
/* ---------------------------------------------------------------- */

class ClassList {
  constructor(el) {
    this.el = el;
    this.set = new Set();
  }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  toggle(c, on) { if (on === undefined ? !this.set.has(c) : on) this.set.add(c); else this.set.delete(c); }
  contains(c) { return this.set.has(c); }
  get value() { return Array.from(this.set).join(" "); }
}

class Element {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.nodeType = 1;
    this.childNodes = [];
    this.parentNode = null;
    this.dataset = {};
    this.attrs = {};
    this.style = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.type = "";
    this.title = "";
    this.checked = false;
    this._className = "";
    this._text = "";
    this._classList = new ClassList(this);
  }

  /* classList 은 className 과 같은 상태를 본다. 브라우저도 그렇다. */
  get classList() { return this._classList; }
  set className(v) {
    this._className = v == null ? "" : String(v);
    this._classList.set = new Set(this._className.split(/\s+/).filter(Boolean));
  }
  get className() { return this._className; }

  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get nextElementSibling() {
    if (!this.parentNode) return null;
    const sib = this.parentNode.children;
    return sib[sib.indexOf(this) + 1] || null;
  }
  get previousElementSibling() {
    if (!this.parentNode) return null;
    const sib = this.parentNode.children;
    return sib[sib.indexOf(this) - 1] || null;
  }
  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  removeChild(node) {
    this.childNodes = this.childNodes.filter((n) => n !== node);
    node.parentNode = null;
    return node;
  }
  replaceChild(next, old) {
    const i = this.childNodes.indexOf(old);
    if (i < 0) return old;
    if (next.parentNode) next.parentNode.removeChild(next);
    this.childNodes[i] = next;
    next.parentNode = this;
    old.parentNode = null;
    return old;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === "value") this.value = String(v);
    if (k === "disabled") this.disabled = true;
    if (k === "hidden") this.hidden = true;
    if (k === "class") this.className = String(v);
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }

  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  dispatchEvent(ev) {
    const e = ev || {};
    if (!e.type) e.type = "event";
    if (!e.target) e.target = this;
    e.preventDefault = e.preventDefault || function () { e.defaultPrevented = true; };
    e.stopPropagation = e.stopPropagation || function () {};
    (this.listeners[e.type] || []).slice().forEach((fn) => fn.call(this, e));
    return !e.defaultPrevented;
  }
  click() { this.dispatchEvent({ type: "click" }); }
  focus() { harnessState.activeElement = this; }
  blur() { if (harnessState.activeElement === this) harnessState.activeElement = null; }
  setSelectionRange() {}
  select() {}

  set textContent(v) {
    this.childNodes = [];
    this._text = v == null ? "" : String(v);
  }
  get textContent() {
    if (this.childNodes.length === 0) return this.value || this._text;
    return this.childNodes.map((n) => (n.nodeType === 3 ? n._text : n.textContent)).join("");
  }
  set innerHTML(v) { this.childNodes = []; this._text = ""; void v; }

  querySelector() { return null; }
  querySelectorAll() { return []; }
  getElementsByTagName() { return []; }
  closest() { return null; }
  matches() { return false; }
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  scrollIntoView() {}
}

class TextNode {
  constructor(text) {
    this.nodeType = 3;
    this._text = text == null ? "" : String(text);
    this.parentNode = null;
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = v == null ? "" : String(v); }
}

const harnessState = { activeElement: null };

/**
 * 화면 한 개를 위한 환경을 만든다.
 * localStorage 는 메모리에 있다. 저장소가 실제로 생기는지까지 확인하려면
 * store 를 직접 들여다본다.
 */
export function createEnv() {
  const store = new Map();
  const byId = new Map();
  const docListeners = new Map();

  // 요청되지 않은 요소는 그때 만들어 body 에 붙인다.
  // 붙이지 않으면 화면이 만든 행을 문서 전체에서 못 찾아 계층 검증이 불가능하다.
  const body = new Element("body");
  function ensure(id) {
    if (!byId.has(id)) {
      const el = new Element("div");
      el.id = id;
      byId.set(id, el);
      body.appendChild(el);
    }
    return byId.get(id);
  }

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };

  const document = {
    documentElement: new Element("html"),
    body,
    head: new Element("head"),
    createElement: (t) => new Element(t),
    createElementNS: (_ns, t) => new Element(t),
    createTextNode: (t) => new TextNode(t),
    createDocumentFragment: () => new Element("#fragment"),
    getElementById: (id) => ensure(id),
    querySelector: (sel) => ensure(normalizeSelector(sel)),
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    addEventListener: (t, fn) => { (docListeners.get(t) || docListeners.set(t, []).get(t)).push(fn); },
    removeEventListener: () => {},
    dispatchEvent: (ev) => {
      (docListeners.get(ev.type) || []).slice().forEach((fn) => fn(ev));
      return true;
    },
    // 테스트가 문서 수준 키보드 이벤트(Escape 등)를 직접 흘릴 수 있게 공개한다.
    listeners: docListeners,
    execCommand: () => true,
  };

  const answers = { prompt: null, confirm: true, promptQueue: [], confirmQueue: [] };

  const window = {
    document,
    localStorage,
    name: "",
    innerWidth: 1280,
    innerHeight: 900,
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    scrollTo: () => {},
    alert: () => {},
    prompt: (msg, def) => {
      if (answers.promptQueue.length) return answers.promptQueue.shift();
      return "promptValue" in answers ? answers.prompt : def ?? null;
    },
    confirm: (msg) => {
      if (answers.confirmQueue.length) return answers.confirmQueue.shift();
      return answers.confirm;
    },
    open: () => null,
    location: { href: "http://localhost/", pathname: "/", search: "", hash: "", reload: () => {} },
  };

  const sandbox = {
    window,
    document,
    localStorage,
    console,
    location: window.location,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    alert: window.alert,
    prompt: window.prompt,
    confirm: window.confirm,
    alert_: undefined,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  return { sandbox, window, document, localStorage, store, byId, answers, docListeners, harnessState };
}

/** ".mode-bar" / "#id" 를 id 로 정규화. 클래스 선택은 지원하지 않는다. */
function normalizeSelector(sel) {
  if (typeof sel !== "string") return sel;
  if (sel.charAt(0) === "#") return sel.slice(1);
  if (sel.charAt(0) === ".") return sel.slice(1);
  return sel;
}

/**
 * 페이지 1개를 실행한다.
 *
 * 스크립트를 문서에 적힌 순서대로 그대로 실행한다.
 * common/mock-data.js 를 여기서 먼저 한 번 더 적재하면 이중 실행이 된다.
 * mock-data.js 는 `global.AF = global.AF || {}` 다음에 data 를 새로 만들어
 * 시드로 덮어쓰므로, 두 번 돌면 화면에서 바꾼 값이 조용히 리셋된다.
 * 순서를 그대로 지킨다는 이유로 미리 적재하는 방법이 위험한 이유다.
 *
 * 반환: { AF, data, store, answers, document, window, byId, queries }
 */
export function loadPage(htmlRelPath, options = {}) {
  const env = options.env || createEnv();
  const htmlPath = resolve(PROTO_DIR, htmlRelPath);
  const html = readFileSync(htmlPath, "utf8");

  const scripts = extractInlineScripts(html);
  const externals = extractExternalScripts(html);

  if (options.loadMock !== false) {
    // 페이지가 직접 참조하지 않을 때만 명시적으로 적재한다(단독 테스트용).
    const declaresMock = externals.some((s) => /mock-data\.js$/.test(s));
    if (!declaresMock) runFile(resolve(PROTO_DIR, "common", "mock-data.js"), env);
  }
  externals.forEach((src) => {
    if (/^https?:|^data:/.test(src)) return; // 외부 CDN 은 건드리지 않는다
    runFile(resolve(PROTO_DIR, src), env);
  });
  // 공통 데이터 적재 뒤, 화면 스크립트 실행 전에 상태를 바꿀 틈.
  // 예: asOf 를 미래로 밀어 upcoming = null 인 상태로 화면을 띄워 본다.
  if (typeof options.afterMock === "function") options.afterMock(env.sandbox, env);

  scripts.forEach((code) => {
    runCode(code, env, htmlRelPath);
  });

  const queries = makeQueries(env);
  return {
    AF: env.window.AF,
    data: env.window.AF ? env.window.AF.data : null,
    env,
    store: env.store,
    storeRaw: () => Object.fromEntries(env.store),
    saved: (key) => {
      const raw = env.store.get(key);
      return raw == null ? null : JSON.parse(raw);
    },
    answers: env.answers,
    document: env.document,
    window: env.window,
    byId: env.byId,
    el: (id) => queries.el(id),
    queries,
  };
}

export function extractInlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const code = m[1];
    if (code.trim() !== "") out.push(code);
  }
  return out;
}

export function extractExternalScripts(html) {
  const out = [];
  const re = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function runFile(path, env) {
  runCode(readFileSync(path, "utf8"), env, relative(ROOT, path));
}

function runCode(code, env, label) {
  try {
    vm.runInContext(code, env.sandbox, { filename: label || "page" });
  } catch (e) {
    const err = new Error(label + ": " + e.message);
    err.cause = e;
    err.stack = e.stack;
    throw err;
  }
}

/* ---------------------------------------------------------------- */
/* DOM 조회 헬퍼                                                      */
/* ---------------------------------------------------------------- */

/** 화면이 만든 DOM 을 뒤져서 쓰는 편의 함수 모음. */
function makeQueries(env) {
  const { document } = env;

  function walk(node, fn) {
    node.childNodes.forEach((c) => {
      if (c.nodeType === 1) { fn(c); walk(c, fn); }
    });
  }

  function rowsByClass(cls) {
    const out = [];
    walk(document.body, (el) => {
      if (el.tagName === "TR" && el.className.split(/\s+/).includes(cls)) out.push(el);
    });
    return out;
  }

  function allByTag(tag) {
    const out = [];
    walk(document.body, (el) => { if (el.tagName === tag) out.push(el); });
    return out;
  }

  function inputsUnder(root) {
    const out = [];
    walk(root || document.body, (el) => { if (el.tagName === "INPUT") out.push(el); });
    return out;
  }

  function buttonsUnder(root) {
    const out = [];
    walk(root || document.body, (el) => { if (el.tagName === "BUTTON") out.push(el); });
    return out;
  }

  function buttonIn(root, label) {
    return buttonsUnder(root).find((b) => b.textContent.trim() === label) || null;
  }

  function cell(row, index) { return row.children[index] || null; }

  function el(id) {
    if (!env.byId.has(id)) return null;
    return env.byId.get(id);
  }

  return {
    rowsByClass, allByTag, inputsUnder, buttonsUnder, buttonIn, cell, el,
    walk,
    text: (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : ""),
    findInput: (key, field) =>
      inputsUnder(document.body).find((i) => i.dataset.key === key && i.dataset.field === field) || null,
    /** 입력에 값을 넣고 input 이벤트를 흘린다. 실제 타이핑과 같은 경로다. */
    type: (input, value) => {
      input.value = String(value);
      input.dispatchEvent({ type: "input" });
      return input;
    },
  };
}

/* ---------------------------------------------------------------- */
/* 수학/통계                                                          */
/* ---------------------------------------------------------------- */

export const sum = (list, pick) =>
  list.reduce((acc, x) => acc + (typeof pick === "function" ? pick(x) : x[pick]), 0);

/** 화면의 천단위 표기를 그대로 비교하려고 쓴다. */
export function formatKRW(n) {
  return Math.round(Number(n) || 0).toLocaleString("ko-KR");
}