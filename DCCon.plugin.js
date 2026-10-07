/**
 * @name DCCon
 * @description 디스코드에서 디시콘을 쉽게 사용할 수 있게 도와주는 플러그인입니다.
 * @version 2.6.0
 * @author 80ROkWOC4j
 * @website https://github.com/80ROkWOC4j/betterdiscord_dccon
 * @source https://github.com/80ROkWOC4j/betterdiscord_dccon
 * @authorLink https://github.com/80ROkWOC4j
 */

// Derived from DCCon2 by minibox (Discord author ID: 310247242546151434).
// Original repository: https://github.com/minibox24/DCCon2 (no longer available).
// Modified version maintained by 80ROkWOC4j; modified on 2026-10-07.
// Distributed under GNU GPL version 3; see LICENSE. Original attribution retained.
// Reference: https://github.com/Dastan21/BDAddons/blob/main/plugins/FavoriteMedia/FavoriteMedia.plugin.js

/* global BdApi */

const DCConBaseURL = "https://dcimg5.dcinside.com/dccon.php?no=";
const DCConProxyURL = "https://dccon-proxy.minibox.workers.dev/?no=";

const ManduIcon = (props) => {
  const size = props.size || "24px";

  return BdApi.React.createElement(
    "svg",
    {
      viewBox: "0 0 512 512",
      className: classes.icon.icon,
      "aria-hidden": "false",
      width: size,
      height: size,
    },
    BdApi.React.createElement("path", {
      transform: "translate(0,512) scale(0.1,-0.1)",
      fill: "currentColor",
      d: "M2490 4778 c-142 -20 -270 -116 -332 -248 -30 -65 -35 -70 -58 -65 -60 14 -195 17 -249 5 -179 -39 -278 -147 -360 -391 -26 -79 -30 -85 -72 -108 -341 -182 -501 -295 -723 -511 -340 -331 -569 -722 -654 -1120 -91 -420 -29 -784 190 -1112 74 -111 257 -298 373 -380 480 -339 1130 -509 1955 -509 733 0 1322 133 1785 401 148 86 244 159 365 280 169 167 278 341 344 545 119 368 71 803 -133 1220 -126 255 -278 462 -497 675 -222 216 -383 329 -723 511 -44 23 -45 26 -82 137 -21 63 -50 134 -65 159 -53 91 -150 164 -263 199 -56 18 -182 19 -245 3 -26 -6 -48 -10 -49 -8 -2 2 -18 35 -36 72 -61 126 -192 226 -316 242 -27 3 -59 7 -70 9 -11 2 -49 -1 -85 -6z m-470 -1163 c62 -32 92 -105 72 -174 -17 -55 -364 -396 -409 -403 -111 -16 -198 72 -178 179 6 32 32 64 173 207 92 92 181 177 197 187 36 23 105 25 145 4z m621 -8 c64 -42 70 -68 67 -284 -3 -177 -5 -194 -24 -220 -47 -63 -132 -84 -195 -47 -70 41 -74 54 -77 267 -2 168 0 196 15 227 26 50 76 80 133 80 32 0 58 -7 81 -23z m597 9 c15 -8 104 -92 199 -188 187 -189 198 -207 174 -288 -13 -45 -69 -96 -112 -102 -74 -11 -86 -4 -276 185 -192 189 -211 216 -200 284 8 46 30 79 70 103 38 24 106 26 145 6z",
    })
  );
};

// These events are private to DCCon; no Discord dispatcher is needed.
const eventListeners = new Map();
const PluginEvents = {
  subscribe(type, listener) {
    if (!eventListeners.has(type)) eventListeners.set(type, new Set());
    eventListeners.get(type).add(listener);
  },
  unsubscribe(type, listener) {
    const listeners = eventListeners.get(type);
    listeners?.delete(listener);
    if (listeners?.size === 0) eventListeners.delete(type);
  },
  dispatch(event) {
    for (const listener of [...(eventListeners.get(event.type) ?? [])]) {
      listener(event);
    }
  },
};
const LocaleStore = BdApi.Webpack.getByKeys("locale", "initialize");
const ChannelTextArea = BdApi.Webpack.getModule((m) =>
  m?.type?.render?.toString?.()?.includes?.("CHANNEL_TEXT_AREA")
);
const Permissions = BdApi.Webpack.getByKeys("computePermissions");
const PermissionsConstants = BdApi.Webpack.getModule(
  BdApi.Webpack.Filters.byKeys("ADD_REACTIONS"),
  { searchExports: true }
);
const FilesUpload = BdApi.Webpack.getModule(
  BdApi.Webpack.Filters.byKeys("addFiles")
);

const classes = {
  icon: BdApi.Webpack.getByKeys("icon", "active", "buttonWrapper") ?? {},
  textarea: BdApi.Webpack.getByKeys("channelTextArea", "buttonContainer", "button") ?? {},
};

let currentChannelId = "";

// 다국어 처리를 위한 번역 리소스
const translations = {
  en: {
    // English
    search: "Search for DCCons",
    addDccons: "Add DCCons in the plugin settings!",
    recent: "Recent",
    settings: {
      addDccon: "Add DCCon",
      remove: "Remove",
      added: "Added",
      adding: "Adding...",
      noResults: "No results",
      searchDccon: "Search for DCCon",
    },
    contextMenu: {
      edit: "Edit",
      download: "Download",
      copyColor: "Copy Color",
      moveTo: "Move To",
      addTo: "Add To",
      removeFrom: "Remove From Category",
      setThumbnail: "Set as Thumbnail",
      unsetThumbnail: "Unset Thumbnail",
      delete: "Delete",
    },
    media: {
      placeholder: "DCCon name",
      removeFrom: "Remove from category",
      emptyHint: "Click the star in the corner of a DCCon to favorite it!",
      upload: {
        title: "Upload",
        normal: "Normal",
        spoiler: "Spoiler",
      },
      controls: {
        show: "Show controls",
        hide: "Hide controls",
      },
    },
  },
  ko: {
    // Korean
    search: "디시콘 검색하기",
    addDccons: "플러그인 설정에서 디시콘을 추가해보세요!",
    recent: "최근 사용",
    settings: {
      addDccon: "디시콘 추가",
      remove: "제거",
      added: "추가됨",
      adding: "추가 중...",
      noResults: "검색 결과가 없습니다",
      searchDccon: "디시콘 검색",
    },
    contextMenu: {
      edit: "수정",
      download: "다운로드",
      copyColor: "색상 복사",
      moveTo: "이동",
      addTo: "추가",
      removeFrom: "카테고리에서 제거",
      setThumbnail: "썸네일로 설정",
      unsetThumbnail: "썸네일 해제",
      delete: "삭제",
    },
    media: {
      placeholder: "디시콘 이름",
      removeFrom: "카테고리에서 제거",
      emptyHint: "디시콘 모서리의 별표를 클릭하여 즐겨찾기에 추가하세요!",
      upload: {
        title: "업로드",
        normal: "일반",
        spoiler: "스포일러",
      },
      controls: {
        show: "컨트롤 표시",
        hide: "컨트롤 숨기기",
      },
    },
  },
};

// 현재 사용자 언어에 맞는 문자열 가져오기
function getLocaleStrings() {
  const locale = LocaleStore.locale?.toLowerCase() || "en";
  const language = locale.split("-")[0];
  return translations[language] || translations.en;
}

// 디시콘 API 관련 함수
const getDCCon = (idx) => {
  return new Promise((resolve, reject) => {
    BdApi.Net.fetch("https://dccon.dcinside.com/index/package_detail", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
      },
      body: `package_idx=${idx}`,
    })
      .then((r) => r.text())
      .then((body) => {
        const original = JSON.parse(body);

        const info = {
          package_idx: original.info.package_idx,
          title: original.info.title,
          main_img_path: original.info.main_img_path,
          list_img_path: original.info.list_img_path,
        };

        const detail = original.detail.map((x) => {
          return { idx: x.idx, title: x.title, ext: x.ext, path: x.path };
        });

        resolve({ info, detail });
      })
      .catch((err) => {
        reject(err);
      });
  });
};

// DCCon 버튼 컴포넌트
class DCConButton extends BdApi.React.Component {
  constructor(props) {
    super(props);
    this.state = { active: false, page: "picker", left: 0, top: 0, height: 480 };
    this.close = this.close.bind(this);
    this.onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.close();
        this.button?.focus();
      }
    };
  }

  componentDidMount() {
    PluginEvents.subscribe("DCCON_CLOSE", this.close);
    PluginEvents.subscribe("DCCON_UNPATCH_ALL", this.close);
    window.addEventListener("resize", this.close);
    document.addEventListener("keydown", this.onKeyDown, true);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.channelId !== this.props.channelId) this.close();
  }

  componentWillUnmount() {
    PluginEvents.unsubscribe("DCCON_CLOSE", this.close);
    PluginEvents.unsubscribe("DCCON_UNPATCH_ALL", this.close);
    window.removeEventListener("resize", this.close);
    document.removeEventListener("keydown", this.onKeyDown, true);
  }

  close(event) {
    if (event?.channelId && event.channelId !== this.props.channelId) return;
    if (this.state.active) this.setState({ active: false });
  }

  toggle(event) {
    if (this.state.active) return this.close();
    PluginEvents.dispatch({ type: "DCCON_CLOSE" });
    currentChannelId = this.props.channelId;
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(520, window.innerWidth - 16);
    const height = Math.min(540, window.innerHeight - 16);
    this.setState({
      active: true,
      page: "picker",
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: Math.max(8, rect.top - height - 8),
      height,
    });
  }

  render() {
    const h = BdApi.React.createElement;
    return h("div", { className: (classes.textarea.buttonContainer ?? "") + " dccon-buttonContainer" },
      h("button", {
        type: "button",
        className: "dccon-button dccon-trigger",
        "aria-label": "디시콘",
        "aria-haspopup": "dialog",
        "aria-expanded": this.state.active,
        ref: (button) => { this.button = button; },
        onClick: (event) => this.toggle(event),
      }, h(ManduIcon)),
      this.state.active && BdApi.ReactDOM.createPortal(
        h("div", { className: "dccon-overlay", onMouseDown: this.close },
          h("section", {
            className: "dccon-popover",
            role: "dialog",
            "aria-label": "디시콘 선택",
            style: { left: this.state.left, top: this.state.top, height: this.state.height },
            onMouseDown: (event) => event.stopPropagation(),
          },
            h("div", { className: "dccon-popover-toolbar" },
              ...[["picker", "내 디시콘"], ["packs", "팩 추가 / 관리"], ["settings", "설정"]].map(([page, label]) =>
                h("button", { key: page, type: "button", "aria-pressed": this.state.page === page,
                  onClick: () => this.setState({ page }) }, label)),
              h("button", { type: "button", "aria-label": "닫기", onClick: this.close }, "×")
            ),
            h("div", { className: "dccon-popover-body" },
              this.state.page !== "picker" ? h(DCConSettingsPanel, { key: this.state.page, section: this.state.page }) : h(DCConPanel, { type: "dccon", onManage: () => this.setState({ page: "packs" }) })
            )
          )
        ), document.body
      )
    );
  }
}

// #region DCConPanel

// Disk cache uses hashed names so remote paths never become filesystem paths.
const imageRequests = new Map();
async function getDCConImage(con) {
  const key = con.path + ":" + con.ext;
  if (imageRequests.has(key)) return imageRequests.get(key);
  const request = (async () => {
    let fs, cachePath;
    try {
      if (typeof require === "function" && BdApi.Plugins?.folder) {
        // BetterDiscord's fs polyfill exposes callbacks, not fs.promises.
        const filesystem = require("fs");
        fs = Object.fromEntries(["readFile", "mkdir", "writeFile", "rename"].map(method => [method,
          (...args) => new Promise((resolve, reject) => filesystem[method](...args,
            (error, result) => error ? reject(error) : resolve(result))),
        ]));
        const directory = require("path").join(BdApi.Plugins.folder, "DCCon-cache");
        cachePath = require("path").join(directory, require("crypto").createHash("sha256").update(key).digest("hex"));
        const cached = await fs.readFile(cachePath, null);
        // BetterDiscord defaults to UTF-8, unlike Node. Never construct an image from text.
        if (typeof cached === "string") throw Object.assign(new Error("Cache returned text"), {code: "CACHE_NOT_BINARY"});
        if (cached.length) {
          return new File([cached], `dccon.${con.ext}`, { type: `image/${con.ext}` });
        }
      }
    } catch { /* Missing or unreadable cache: fetch the original. */ }
    const response = await BdApi.Net.fetch(DCConBaseURL + con.path, {
      responseType: "arraybuffer", headers: { Referer: "https://dcimg5.dcinside.com" },
    });
    if (response.ok === false || response.status >= 400) throw new Error("디시콘 다운로드에 실패했습니다.");
    const contentType = response.headers?.get?.("content-type");
    if (contentType && /text\/html|application\/json/i.test(contentType)) throw new Error("이미지가 아닌 응답을 받았습니다.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error("디시콘 이미지가 비어 있습니다.");
    if (fs && cachePath) {
      try {
        await fs.mkdir(require("path").dirname(cachePath), { recursive: true });
        await fs.writeFile(cachePath + ".tmp", bytes);
        await fs.rename(cachePath + ".tmp", cachePath);
      } catch (error) {
        BdApi.Logger.error("DCCon", "Image cache write failed", error);
      }
    }
    return new File([bytes], `dccon.${con.ext}`, { type: `image/${con.ext}` });
  })();
  imageRequests.set(key, request);
  try { return await request; } finally { imageRequests.delete(key); }
}

let cacheGeneration = 0;
let cacheWork = Promise.resolve();
function warmCache(cons) {
  if (typeof require !== "function" || !BdApi.Plugins?.folder) return;
  const generation = cacheGeneration;
  cacheWork = cacheWork.then(async () => {
    for (const con of cons) {
      if (generation !== cacheGeneration) return;
      try { await getDCConImage(con); } catch (error) { BdApi.Logger.error("DCCon", "Cache preload failed", error); }
    }
  });
}

let lastMessageNonce = 0n;
let lastSendAttempt = null;
const queuedCons = new Map();
const channelTasks = new Map();
const sendingChannels = new Set();
function activeQueue(channelId) { return queuedCons.get(channelId) ?? []; }
function updateQueue(channelId, entries) {
  queuedCons.set(channelId, entries);
  PluginEvents.dispatch({ type: "DCCON_BUFFER_UPDATE", channelId });
}
function removeBuffered(channelId, entry) {
  if (sendingChannels.has(channelId)) return;
  updateQueue(channelId, entry ? activeQueue(channelId).filter(item => item !== entry) : []);
}
async function stageCon(channelId, file) {
  await FilesUpload.addFiles({ channelId, draftType: 0, files: [{file, platform: 1}], showLargeMessageDialog: false });
}

function markSend(attempt, phase, details = {}) {
  Object.assign(attempt, details, { phase, updatedAt: new Date().toISOString() });
}

function sendErrorDetails(error) {
  return {
    name: error?.name || "Error",
    message: String(error?.message || "오류 설명 없음").replace(/https?:\/\/\S+/g, "[URL]").slice(0, 400),
    status: error?.status ?? error?.statusCode ?? null,
    code: error?.body?.code ?? error?.code ?? null,
  };
}

function isDiscordRest(value) {
  return value !== null && typeof value === "object" &&
    ["post", "get", "put", "del"].every(key => typeof value[key] === "function");
}

function responseShape(response) {
  const body = response?.body;
  const header = response?.headers?.get?.("content-type") ?? response?.headers?.["content-type"];
  const keys = value => value && typeof value === "object" ? Object.keys(value).slice(0, 30) : [];
  return {
    responseType: typeof response,
    responseKeys: keys(response),
    bodyType: body === null ? "null" : Array.isArray(body) ? "array" : typeof body,
    bodyKeys: keys(body),
    contentType: typeof header === "string" ? header.slice(0, 100) : null,
    looksLikeHtml: [body, response?.text].some(value => typeof value === "string" && /^\s*(?:<!doctype\s+html|<html)/i.test(value)),
    bodyStringLength: typeof body === "string" ? body.length : null,
    hasTopLevelId: Boolean(response?.id),
    hasDataId: Boolean(response?.data?.id),
  };
}

async function sendImagesDirectly(files, channelId, attempt) {
  markSend(attempt, "모듈 조회");
  const CloudUpload = BdApi.Webpack.getModule(value => typeof value === "function" &&
    typeof value.prototype?.trackUploadFinished === "function" && typeof value.prototype?.upload === "function",
    { searchExports: true });
  const rest = BdApi.Webpack.getModule(isDiscordRest, { searchExports: true });
  if (!CloudUpload || !rest) throw new Error("즉시 전송 모듈을 찾지 못했습니다. 진단 탭을 확인해 주세요.");
  attempt.restModule = {
    keys: Object.keys(rest).slice(0, 40),
    postParameterCount: rest.post.length,
    // Function source contains code only, not request arguments or closure values.
    postImplementation: Function.prototype.toString.call(rest.post).slice(0, 600),
  };
  const attachments = [];
  for (const [index, file] of files.entries()) {
    markSend(attempt, "업로드 객체 생성", { attachmentIndex: index + 1, attachmentCount: files.length, imageBytes: files.reduce((sum, image) => sum + image.size, 0) });
    const upload = new CloudUpload({ file, isThumbnail: false, platform: 1 }, channelId);
    markSend(attempt, "Discord 파일 업로드", {
      listenerCleanup: typeof upload.off === "function" ? "off" : typeof upload.removeListener === "function" ? "removeListener" : "none",
    });
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        // Listener cleanup must not prevent a completed upload from settling.
        try {
          const remove = upload.off ?? upload.removeListener;
          remove?.call(upload, "complete", complete);
          remove?.call(upload, "error", fail);
        } catch (error) { attempt.cleanupError = sendErrorDetails(error); }
      };
      const complete = () => { cleanup(); markSend(attempt, "Discord 업로드 완료", { hasUploadedFilename: Boolean(upload.uploadedFilename) }); resolve(); };
      const fail = error => {
        cleanup();
        attempt.uploadError = sendErrorDetails(error || upload.error);
        reject(new Error("이미지 업로드에 실패했습니다. 진단 탭의 마지막 전송 결과를 확인해 주세요."));
      };
      const timer = setTimeout(() => {
        cleanup();
        try { upload.cancel(); } catch { /* Preserve the timeout error if cancellation also fails. */ }
        reject(new Error("이미지 업로드 시간이 초과되었습니다."));
      }, 120000);
      upload.on("complete", complete);
      upload.on("error", fail);
      try { Promise.resolve(upload.upload()).catch(fail); } catch (error) { fail(error); }
    });
    if (!upload.uploadedFilename) throw new Error("업로드 결과에 파일 경로가 없습니다.");
    attachments.push({ id: String(index), filename: upload.filename || file.name, uploaded_filename: upload.uploadedFilename });
  }
  await postDCCon(rest, channelId, attempt, attachments);
}

async function postDCCon(rest, channelId, attempt, attachments = [], content = "") {
  const timestampNonce = (BigInt(Date.now()) - 1420070400000n) << 22n;
  lastMessageNonce = timestampNonce > lastMessageNonce ? timestampNonce : lastMessageNonce + 1n;
  // Send only plugin-owned files; leave composer text and reply untouched.
  markSend(attempt, "메시지 생성 요청");
  const response = await rest.post({
    url: `/channels/${channelId}/messages`,
    body: {
      content, nonce: String(lastMessageNonce), enforce_nonce: true,
      type: 0, sticker_ids: [], allowed_mentions: { parse: [] },
      attachments,
    },
  });
  markSend(attempt, "메시지 생성 응답", {
    responseShape: responseShape(response),
    httpStatus: response?.status ?? null,
    apiCode: response?.body?.code ?? null,
    hasMessageId: Boolean(response?.body?.id),
  });
  if (response?.ok === false || response?.status >= 400) {
    throw new Error(`메시지 전송 실패 (HTTP ${response.status ?? "오류"}).`);
  }
  if (!response?.body?.id) throw new Error("전송 성공을 확인할 수 없습니다. 채널과 진단 결과를 확인해 주세요. 자동 재전송하지 않습니다.");
}

function sendMode() {
  const selected = loadData("sendMode", null);
  if (["image", "link", "attach"].includes(selected)) return selected;
  const legacyAttachOnly = loadData("attachOnly", null);
  if (typeof legacyAttachOnly === "boolean") return legacyAttachOnly ? "attach" : "image";
  return "link";
}
let bufferGeneration = 0;
function changeSendMode(mode) {
  if (mode === sendMode()) return;
  saveData("sendMode", mode);
  bufferGeneration++;
  queuedCons.clear();
  PluginEvents.dispatch({type: "DCCON_BUFFER_UPDATE"});
}
async function sendLinkDirectly(con, channelId, attempt) {
  const content = DCConProxyURL + encodeURIComponent(con.path);
  if (content.length > 2000) throw new Error("디시콘 링크가 메시지 길이 제한을 초과합니다.");
  markSend(attempt, "링크 전송 모듈 조회", {linkCount: 1});
  const rest = BdApi.Webpack.getModule(isDiscordRest, {searchExports: true});
  if (!rest) throw new Error("메시지 전송 모듈을 찾지 못했습니다.");
  await postDCCon(rest, channelId, attempt, [], content);
}

// 디시콘 메시지 전송 함수
const sendDCConMessage = (con, { keepOpen = false } = {}) => {
  const startedAt = new Date().toISOString();
  const channelId = currentChannelId;
  const mode = sendMode();
  const attachOnly = mode === "attach";
  const linkMode = mode === "link";
  if (linkMode) keepOpen = false;
  const generation = bufferGeneration;
  if (sendingChannels.has(channelId)) return Promise.resolve(false);
  const sending = !attachOnly && !keepOpen;
  if (sending) sendingChannels.add(channelId);
  PluginEvents.dispatch({ type: "DCCON_BUFFER_UPDATE", channelId });
  const attempt = { startedAt, outcome: "진행 중", keepOpen, phase: "작업 대기",
    mode: attachOnly ? "첨부 누적" : keepOpen ? "버퍼 누적" : linkMode ? "링크 즉시 전송" : "누적 즉시 전송" };
  const task = (channelTasks.get(channelId) ?? Promise.resolve()).then(async () => {
    lastSendAttempt = attempt;
    try {
      if (generation !== bufferGeneration) { attempt.outcome = "모드 변경으로 취소"; return false; }
      markSend(attempt, "채널 확인", { hasChannel: Boolean(channelId) });
      if (!channelId) throw new Error("현재 채널을 찾을 수 없습니다.");
      if (!attachOnly && keepOpen && activeQueue(channelId).length >= 9)
        throw new Error("최대 9개까지 모을 수 있습니다. 일반 클릭으로 마지막 콘과 함께 보내세요.");
      markSend(attempt, "캐시 / 이미지 준비");
      const image = linkMode ? null : await getDCConImage(con);
      attempt.imageBytes = image?.size ?? 0;
      if (generation !== bufferGeneration) { attempt.outcome = "모드 변경으로 취소"; return false; }
      markSend(attempt, "전송 준비");
      let sentCons = [con];
      if (attachOnly) {
        markSend(attempt, "입력창 첨부");
        await stageCon(channelId, image);
        markSend(attempt, "완료", { outcome: "첨부 누적 완료" });
      } else if (keepOpen) {
        markSend(attempt, "버퍼 추가");
        updateQueue(channelId, [...activeQueue(channelId), {file: image, con}]);
        markSend(attempt, "완료", { outcome: "버퍼 누적 완료", queuedCount: activeQueue(channelId).length });
      } else {
        const queued = linkMode ? [] : activeQueue(channelId);
        if (linkMode) await sendLinkDirectly(con, channelId, attempt);
        else {
          const files = [];
          for (const entry of queued) files.push(entry.file);
          await sendImagesDirectly([...files, image], channelId, attempt);
        }
        if (generation === bufferGeneration) updateQueue(channelId, []);
        sentCons = [...queued.map(entry => entry.con), con];
        markSend(attempt, "완료", { outcome: "전송 성공 확인", sentCount: sentCons.length });
      }
      let recent = loadData("recent", []);
      for (const item of sentCons) recent = [item, ...recent.filter(entry => entry.path !== item.path)].slice(0, 20);
      saveData("recent", recent);
      PluginEvents.dispatch({ type: "DCCON_RECENT_UPDATE" });
      if (sending) PluginEvents.dispatch({ type: "DCCON_CLOSE", channelId });
      return true;
    } catch (error) {
      attempt.outcome = "실패";
      attempt.error = sendErrorDetails(error);
      attempt.updatedAt = new Date().toISOString();
      BdApi.Logger.error("DCCon", "Failed to send DCCon:", error);
      BdApi.UI.showToast("디시콘 전송 실패 (" + attempt.phase + "): " + error.message, { type: "error", timeout: 10000 });
      return false;
    } finally {
      if (sending) sendingChannels.delete(channelId);
      PluginEvents.dispatch({ type: "DCCON_BUFFER_UPDATE", channelId });
    }
  });
  channelTasks.set(channelId, task);
  task.then(() => { if (channelTasks.get(channelId) === task) channelTasks.delete(channelId); });
  return task;
};

class BufferTray extends BdApi.React.Component {
  constructor(props) {
    super(props);
    this.refresh = () => this.forceUpdate();
  }
  componentDidMount() { PluginEvents.subscribe("DCCON_BUFFER_UPDATE", this.refresh); }
  componentWillUnmount() { PluginEvents.unsubscribe("DCCON_BUFFER_UPDATE", this.refresh); }
  render() {
    const h = BdApi.React.createElement;
    const channelId = this.props.channelId;
    const entries = activeQueue(channelId);
    const busy = sendingChannels.has(channelId);
    if (!entries.length && !busy) return null;
    return h("section", { className: "dccon-buffer", "aria-label": "전송 대기 디시콘" },
      h("div", { className: "dccon-buffer-heading" },
        h("span", {role: "status"}, busy ? "전송 중…" : "모아둔 콘 " + entries.length + "/9"),
        h("button", {type: "button", disabled: busy, onClick: () => removeBuffered(channelId)}, "전체 비우기")),
      h("div", {className: "dccon-buffer-items"}, entries.map((entry, index) => h("button", {
        key: index, type: "button", disabled: busy, title: entry.con.title + " 제거",
        "aria-label": entry.con.title + " 제거", onClick: () => removeBuffered(channelId, entry),
      }, h(BufferImage, {file: entry.file, title: entry.con.title}), h("span", null, "×")))));
  }
}
class BufferImage extends BdApi.React.Component {
  constructor(props) { super(props); this.state = {url: null}; }
  componentDidMount() { this.setState({url: URL.createObjectURL(this.props.file)}); }
  componentDidUpdate(previous) {
    if (previous.file !== this.props.file) {
      URL.revokeObjectURL(this.state.url);
      this.setState({url: URL.createObjectURL(this.props.file)});
    }
  }
  componentWillUnmount() { if (this.state.url) URL.revokeObjectURL(this.state.url); }
  render() { return this.state.url && BdApi.React.createElement("img", {src: this.state.url, alt: this.props.title}); }
}

class PackThumbnail extends BdApi.React.Component {
  constructor(props) {
    super(props);
    this.state = { index: 0 };
  }

  render() {
    const { pack, className } = this.props;
    const paths = [...new Set([pack.info.main_img_path, pack.detail[0]?.path, pack.info.list_img_path].filter(Boolean))];
    if (!paths[this.state.index]) {
      return BdApi.React.createElement("span", { className, "aria-hidden": true }, pack.info.title.slice(0, 1));
    }
    const next = () => this.setState(state => ({ index: state.index + 1 }));
    return BdApi.React.createElement("img", {
      className, alt: "", src: DCConProxyURL + paths[this.state.index], loading: "lazy",
      onError: next,
      onLoad: event => { if (event.currentTarget.naturalWidth <= 1 || event.currentTarget.naturalHeight <= 1) next(); },
    });
  }
}

// 카테고리 컴포넌트
class DCConCategory extends BdApi.React.Component {
  constructor(props) {
    super(props);
    this.state = {
      expanded: true,
    };
  }

  render() {
    const { dccon } = this.props;
    const strings = getLocaleStrings();

    return BdApi.React.createElement(
      "div",
      { className: "dccon-category" },
      BdApi.React.createElement(
        "button",
        {
          type: "button",
          "aria-expanded": this.state.expanded,
          className: `dccon-category-header ${
            this.state.expanded ? "expanded" : "collapsed"
          }`,
          onClick: () =>
            this.setState((state) => ({ expanded: !state.expanded })),
        },
        BdApi.React.createElement(PackThumbnail, {
          pack: dccon,
          className: "dccon-category-icon",
        }),
        BdApi.React.createElement(
          "div",
          { className: "dccon-category-name" },
          dccon.info.title
        ),
        BdApi.React.createElement(
          "div",
          { className: "dccon-category-toggle" },
          BdApi.React.createElement(
            "svg",
            {
              width: "24",
              height: "24",
              viewBox: "0 0 24 24",
            },
            BdApi.React.createElement("path", {
              fill: "currentColor",
              d: this.state.expanded
                ? "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"
                : "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z",
            })
          )
        )
      ),
      this.state.expanded &&
        BdApi.React.createElement(
          "div",
          { className: "dccon-items" },
          dccon.detail.map((con) =>
            BdApi.React.createElement(DCConItem, {
              key: con.idx,
              con: con,
              packageIdx: dccon.info.package_idx,
            })
          )
        )
    );
  }
}

// 디시콘 아이템 컴포넌트
class DCConItem extends BdApi.React.Component {
  constructor(props) {
    super(props);
    this.state = { error: false, busy: false, favorite: loadData("favorites", []).some(con => con.path === props.con.path) };
    this.refreshFavorite = () => this.setState({ favorite: loadData("favorites", []).some(con => con.path === this.props.con.path) });
  }

  componentDidMount() { PluginEvents.subscribe("DCCON_FAVORITES_UPDATE", this.refreshFavorite); }
  componentWillUnmount() { PluginEvents.unsubscribe("DCCON_FAVORITES_UPDATE", this.refreshFavorite); }

  toggleFavorite() {
    const con = { ...this.props.con, packageIdx: this.props.packageIdx };
    const favorites = loadData("favorites", []);
    saveData("favorites", favorites.some(item => item.path === con.path)
      ? favorites.filter(item => item.path !== con.path) : [...favorites, con]);
    PluginEvents.dispatch({ type: "DCCON_FAVORITES_UPDATE" });
  }

  async attach(event) {
    if (this.sending) return;
    const keepOpen = event.shiftKey;
    this.sending = true;
    this.setState({ busy: true });
    try {
      await sendDCConMessage({ ...this.props.con, packageIdx: this.props.packageIdx }, { keepOpen });
    } finally {
      this.sending = false;
      this.setState({ busy: false });
    }
  }

  render() {
    const h = BdApi.React.createElement;
    const { con } = this.props;
    return h("div", { className: "dccon-tile" },
      h("button", { type: "button", title: con.title + (sendMode() === "link" ? " · 클릭: 링크 하나 전송" : sendMode() === "attach" ? " · 클릭: 첨부파일 추가" : " · Shift+클릭: 모아두기"),
        "aria-label": con.title, className: "dccon-item", disabled: this.state.busy || this.state.error,
        onClick: event => this.attach(event),
      }, this.state.error ? h("span", { className: "dccon-item-error" }, "이미지 로드 실패")
        : h("img", { src: DCConProxyURL + con.path, alt: con.title, loading: "lazy", onError: () => this.setState({ error: true }) }),
        this.state.busy && h("span", { className: "dccon-loading", role: "status" }, "처리 중…")
      ),
      h("button", { type: "button", className: "dccon-favorite", "aria-label": this.state.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가",
        title: this.state.favorite ? "즐겨찾기 해제" : "즐겨찾기 추가", "aria-pressed": this.state.favorite, onClick: () => this.toggleFavorite(),
      }, this.state.favorite ? "★" : "☆")
    );
  }
}

// 디시콘 패널 컴포넌트 업데이트
class DCConPanel extends BdApi.React.Component {
  constructor(props) {
    super(props);
    this.state = { textFilter: "", selected: "all", dccons: loadPacks() };
    this.clearSearch = () => this.setState({ textFilter: "" });
    this.refresh = () => this.setState({ revision: (this.state.revision ?? 0) + 1 });
  }

  componentDidMount() {
    PluginEvents.subscribe("DCCON_FAVORITES_UPDATE", this.refresh);
    PluginEvents.subscribe("DCCON_RECENT_UPDATE", this.refresh);
  }

  componentWillUnmount() {
    PluginEvents.unsubscribe("DCCON_FAVORITES_UPDATE", this.refresh);
    PluginEvents.unsubscribe("DCCON_RECENT_UPDATE", this.refresh);
  }

  filterDccons() {
    const query = this.state.textFilter.trim().toLowerCase();
    return this.state.dccons
      .filter(pack => this.state.selected === "all" || String(pack.info.package_idx) === this.state.selected)
      .map(pack => ({ ...pack, detail: !query || pack.info.title.toLowerCase().includes(query)
        ? pack.detail : pack.detail.filter(con => con.title.toLowerCase().includes(query)) }))
      .filter(pack => pack.detail.length > 0);
  }

  render() {
    if (this.props.type !== "dccon") return null;
    const h = BdApi.React.createElement;
    const packs = this.filterDccons();
    const query = this.state.textFilter.trim().toLowerCase();
    const isFavorites = this.state.selected === "favorites";
    const recent = loadData(isFavorites ? "favorites" : "recent", []).filter(con => !query || con.title.toLowerCase().includes(query));
    const select = id => {
      this.setState({ selected: id });
      this.content?.scrollTo?.({ top: 0 });
    };
    const navButton = (id, label, child) => h("button", {
      key: id, type: "button", className: "dccon-rail-button",
      title: label, "aria-label": label, "aria-pressed": this.state.selected === id,
      onClick: () => select(id),
    }, child);
    return h("div", { className: "dccon-pickerContainer" },
      h("div", { className: "dccon-header" },
        h("div", { className: "dccon-search-field" },
          h("svg", { "aria-hidden": true, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
            h("circle", { cx: 10, cy: 10, r: 6 }), h("path", { d: "m15 15 6 6" })),
          h("input", { className: "dccon-search-input", "aria-label": "디시콘 검색", placeholder: "디시콘 이름이나 팩 검색하기",
            autoFocus: true, value: this.state.textFilter,
            onChange: e => this.setState({ textFilter: e.target.value }),
          }),
          this.state.textFilter && h("button", { type: "button", "aria-label": "검색 지우기", onClick: this.clearSearch }, "×")
        )
      ),
      h("div", { className: "dccon-browser" },
        h("nav", { className: "dccon-rail", "aria-label": "디시콘 팩" },
          navButton("all", "전체 디시콘", h(ManduIcon)),
          navButton("recent", "최근 사용", "◷"),
          navButton("favorites", "즐겨찾기", "★"),
          h("div", { className: "dccon-rail-divider" }),
          ...this.state.dccons.map(pack => navButton(String(pack.info.package_idx), pack.info.title,
            h(PackThumbnail, { pack }))),
          h("button", { type: "button", className: "dccon-rail-button", "aria-label": "팩 추가 / 관리", title: "팩 추가 / 관리", onClick: this.props.onManage }, "+")
        ),
        h("div", { className: "dccon-browser-content", ref: element => { this.content = element; } },
          (this.state.selected === "recent" || isFavorites)
            ? h("section", null, h("h3", { className: "dccon-section-title" }, isFavorites ? "즐겨찾기" : "최근 사용"),
                recent.length ? h("div", { className: "dccon-items" }, recent.map(con => h(DCConItem, { key: con.idx, con, packageIdx: con.packageIdx })))
                  : h("div", { className: "dccon-empty-state", role: "status" }, query ? "검색 결과가 없습니다." : isFavorites ? "콘의 ☆ 버튼으로 즐겨찾기를 추가하세요." : "사용한 디시콘이 여기에 표시됩니다."))
            : packs.length ? packs.map(pack => h(DCConCategory, { key: pack.info.package_idx, dccon: pack }))
              : h("div", { className: "dccon-empty-state", role: "status" },
                  this.state.dccons.length ? "검색 결과가 없습니다. 다른 이름으로 검색해 보세요." : "아직 등록한 디시콘이 없습니다.",
                  !this.state.dccons.length && h("button", { type: "button", onClick: this.props.onManage }, "팩 추가하기"))
        )
      ),
      h(BufferTray, {channelId: currentChannelId}),
      h("div", { className: "dccon-footer" }, sendMode() === "attach"
        ? "첨부 전용 · 클릭 / Shift+클릭: 첨부 누적 · 창 유지"
        : sendMode() === "link" ? "링크 전송 · 클릭 / Shift+클릭: 한 개씩 즉시 전송"
        : "클릭: 누적 콘과 함께 전송 · Shift+클릭: 모아두기 (최대 9개)")
    );
  }
}

// #region Settings
// 데이터 저장/로드 유틸리티 함수들
function loadData(key, defaultData) {
  defaultData = structuredClone(defaultData);

  // BetterDiscord can return the cached object. Never share it with React state.
  const data = structuredClone(BdApi.Data.load("DCCon", key));
  if (data == null) return defaultData;

  // 기본값 처리
  for (const k in defaultData) {
    if (data[k] == null && defaultData[k] != null) {
      data[k] = defaultData[k];
    }
  }

  return data;
}

function saveData(key, data) {
  BdApi.Data.save("DCCon", key, data);
}

function uniquePacks(packs) {
  const seen = new Set();
  return packs.filter(pack => {
    const id = String(pack.info.package_idx);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function loadPacks() {
  return uniquePacks(loadData("dccons", []));
}

// 디시콘 검색 결과를 가져오는 함수
const getDCConSearchResult = (query) => {
  return new Promise((resolve, reject) => {
    BdApi.Net.fetch(
      encodeURI("https://dccon.dcinside.com/hot/1/title/" + query)
    )
      .then((r) => r.text())
      .then((body) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(body, "text/html");

        if (doc.getElementsByClassName("dccon_search_none").length > 0) {
          resolve([]);
          return;
        }

        const results = [...doc.getElementsByClassName("link_product")].map(
          (el) => {
            const idx = el.href.split("#")[1];
            const thumbId = el.children[0].src.split("=")[1];
            const name = el.children[1].innerText;
            const seller = el.children[2].innerText;

            return { idx, thumbId, name, seller };
          }
        );

        resolve(results);
      })
      .catch((err) => reject(err));
  });
};

// 버튼 컴포넌트
const Button = (props) => {
  return BdApi.React.createElement(
    "button",
    {
      type: "button",
      className: `bd-button dccon-button ${props.color || ""}`,
      onClick: props.onClick,
      disabled: props.disabled,
      style: { ...props.style },
    },
    props.text
  );
};

// 디시콘 카드 컴포넌트 (검색 결과용)
class DCConCard extends BdApi.React.Component {
  constructor(props) {
    super(props);

    this.state = {
      isAdding: false,
    };
  }

  render() {
    const { item } = this.props;
    const existingDccon = this.props.savedDccons.find(
      (d) => String(d.info?.package_idx) === String(item.idx)
    );

    const strings = getLocaleStrings();

    return BdApi.React.createElement(
      "div",
      {
        className: "dccon-card",
      },
      BdApi.React.createElement("img", {
        src: `${DCConProxyURL}${item.thumbId}`,
        style: { borderRadius: "8px" },
      }),
      BdApi.React.createElement(
        "div",
        { className: "dccon-card-content" },
        BdApi.React.createElement("h3", {}, item.name),
        BdApi.React.createElement("span", {}, item.seller),
        BdApi.React.createElement(Button, {
          text: existingDccon
            ? strings.settings.added
            : this.state.isAdding
            ? strings.settings.adding
            : strings.settings.addDccon,
          disabled: existingDccon !== undefined || this.state.isAdding,
          onClick: async () => {
            if (this.adding || existingDccon) return;
            this.adding = true;
            this.setState({ isAdding: true });

            try {
              const dcconData = await getDCCon(item.idx);
              // Re-read after the request so concurrent additions cannot duplicate a pack.
              saveData("dccons", uniquePacks([...loadPacks(), dcconData]));
              warmCache(dcconData.detail);

              this.props.onAdd(dcconData);
              BdApi.UI.showToast("디시콘이 추가되었습니다.", {
                type: "success",
              });
            } catch (err) {
              BdApi.Logger.error("DCCon", "디시콘 추가 실패:", err);
              BdApi.UI.showToast("디시콘 추가에 실패했습니다.", {
                type: "error",
              });
            } finally {
              this.adding = false;
              this.setState({ isAdding: false });
            }
          },
          style: {
            marginTop: "auto",
            marginLeft: "auto",
          },
        })
      )
    );
  }
}

// 저장된 디시콘 카드 컴포넌트 (추가된 디시콘 관리용)
class SavedDCConCard extends BdApi.React.Component {
  render() {
    const { dccon } = this.props;
    const strings = getLocaleStrings();

    return BdApi.React.createElement(
      "div",
      {
        className: "dccon-card",
      },
      BdApi.React.createElement(PackThumbnail, {
        pack: dccon,
        style: { borderRadius: "8px" },
      }),
      BdApi.React.createElement(
        "div",
        { className: "dccon-card-content" },
        BdApi.React.createElement("h3", {}, dccon.info.title),
        BdApi.React.createElement(
          "span",
          {},
          `${dccon.detail.length}개의 디시콘`
        ),
        BdApi.React.createElement(Button, {
          text: strings.settings.remove,
          color: "dccon-item-error",
          onClick: () => {
            const dccons = loadPacks();
            const newDccons = dccons.filter(
              (d) => String(d.info.package_idx) !== String(dccon.info.package_idx)
            );
            saveData("dccons", newDccons);
            this.props.onRemove(dccon.info.package_idx);
            BdApi.UI.showToast("디시콘이 제거되었습니다.", { type: "success" });
          },
          style: {
            marginTop: "auto",
            marginLeft: "auto",
          },
        })
      )
    );
  }
}

function inspectInstantSend() {
  const { Webpack } = BdApi;
  const report = {};
  const check = (name, inspect) => {
    try { report[name] = inspect(); }
    catch (error) { report[name] = `Lookup failed: ${error.message}`; }
  };
  check("CloudUpload", () => Boolean(Webpack.getModule(
    value => typeof value === "function" &&
      typeof value.prototype?.trackUploadFinished === "function" &&
      typeof value.prototype?.upload === "function",
    { searchExports: true }
  )));
  check("REST post/get/put/del", () => Boolean(Webpack.getModule(
    isDiscordRest,
    { searchExports: true }
  )));
  check("MessageActions.sendMessage", () => Boolean(Webpack.getByKeys("sendMessage")));
  check("Existing attachment staging", () => Boolean(Webpack.getByKeys("addFiles")));
  for (const name of ["DraftStore", "UploadAttachmentStore", "PendingReplyStore", "SelectedChannelStore"]) {
    check(name, () => Boolean(Webpack.getStore?.(name)));
  }
  report.lastSendAttempt = lastSendAttempt ? structuredClone(lastSendAttempt) : "아직 전송 시도 없음";
  return report;
}

// 설정 패널 컴포넌트
class DCConSettingsPanel extends BdApi.React.Component {
  constructor(props) {
    super(props);

    this.state = {
      activeTab: "saved",
      searchQuery: "",
      searchResults: [],
      isSearching: false,
      savedDccons: loadPacks(),
      sendMode: sendMode(),
    };

    this.handleSearch = this.handleSearch.bind(this);
    this.handleTabChange = this.handleTabChange.bind(this);
  }

  async handleSearch() {
    if (this.state.searchQuery.trim() === "") return;

    this.setState({ isSearching: true });

    try {
      const results = await getDCConSearchResult(this.state.searchQuery);
      this.setState({ searchResults: results });
    } catch (err) {
      BdApi.Logger.error("DCCon", "디시콘 검색 실패:", err);
      BdApi.UI.showToast("디시콘 검색에 실패했습니다.", { type: "error" });
    }

    this.setState({ isSearching: false });
  }

  handleTabChange(tab) {
    this.setState({ activeTab: tab });
  }

  renderSearch() {
    const strings = getLocaleStrings();

    return BdApi.React.createElement(
      "div",
      { className: "dccon-search-container" },
      BdApi.React.createElement(
        "div",
        { className: "dccon-search-bar" },
        BdApi.React.createElement("input", {
          type: "text",
          placeholder: strings.settings.searchDccon,
          value: this.state.searchQuery,
          onChange: (e) => this.setState({ searchQuery: e.target.value }),
          onKeyDown: (e) => {
            if (e.key === "Enter") this.handleSearch();
          },
        }),
        BdApi.React.createElement(Button, {
          text: this.state.isSearching ? "검색 중…" : "검색",
          disabled:
            this.state.isSearching || this.state.searchQuery.trim() === "",
          onClick: this.handleSearch,
          style: { marginLeft: "8px" },
        })
      ),
      BdApi.React.createElement(
        "div",
        { className: "dccon-search-results" },
        this.state.searchResults.length > 0
          ? this.state.searchResults.map((result) =>
              BdApi.React.createElement(DCConCard, {
                key: result.idx,
                item: result,
                savedDccons: this.state.savedDccons,
                onAdd: () => {
                  this.setState({ savedDccons: loadPacks() });
                },
              })
            )
          : this.state.searchQuery !== "" && !this.state.isSearching
          ? BdApi.React.createElement(
              "div",
              { className: "dccon-empty-state" },
              strings.settings.noResults
            )
          : null
      )
    );
  }

  renderOptions() {
    const h = BdApi.React.createElement;
    return h("fieldset", { className: "dccon-options" },
      h("legend", null, "디시콘 클릭 동작"),
      ...[
        ["link", "클릭 시 링크 전송(빠름)", "링크 바로 보냅니다. 디스코드 이미지 임베딩에 의존합니다."],
        ["image", "클릭 시 이미지 전송", "이미지를 바로 보냅니다. Shift+클릭으로 모은 콘은 다음 일반 클릭 때 함께 전송합니다. 공앱 같은 작동."],
        ["attach", "클릭 시 첨부파일 추가", "입력창에 파일을 추가합니다. Shift+클릭도 동일합니다."],
      ].map(([mode, title, description]) => h("label", {key: mode, className: "dccon-mode-choice"},
        h("input", {type: "radio", name: "dccon-send-mode", value: mode, checked: this.state.sendMode === mode,
          onChange: () => { changeSendMode(mode); this.setState({sendMode: mode}); }}),
        h("span", null, h("strong", null, title), h("small", null, description)))),
      h("p", null, "전송 방식을 변경하면 모든 채널에서 입력하려고 모아둔 콘 버퍼가 비워집니다."),
      this.state.sendMode === "link" && h("p", null, "링크 전송은 디시콘 원본 이미지 링크를 보냅니다.")
    );
  }

  renderDiagnostics() {
    const h = BdApi.React.createElement;
    return h("div", { className: "dccon-diagnostics" },
      h("h3", null, "문제 해결 · 버그 제보"),
      h("p", null, "디시콘이 보내지지 않거나 오류가 발생했나요? 문제가 발생한 직후 진단 정보를 만들어 제보에 첨부해 주세요."),
      h("ol", {className: "dccon-report-steps"},
        h("li", null, "문제가 발생한 조작과 기대했던 동작을 적어 주세요."),
        h("li", null, "아래에서 진단 정보를 생성하고 복사해 주세요."),
        h("li", null, "복사한 정보와 재현 순서를 버그 제보에 함께 붙여넣어 주세요.")),
      h("p", null, "진단은 자동으로 제출되지 않으며, 메시지를 보내거나 입력 중인 내용을 변경하지 않습니다."),
      h(Button, { text: this.state.diagnosticReport ? "진단 정보 새로고침" : "진단 정보 만들기", onClick: () => {
        const report = inspectInstantSend();
        this.setState({ diagnosticReport: JSON.stringify({ pluginVersion: "2.6.0", generatedAt: new Date().toISOString(), sendMode: sendMode(), ...report }, null, 2),
          copyStatus: "" });
      } }),
      this.state.diagnosticReport && h("div", null,
        h("textarea", { className: "dccon-diagnostic-report", "aria-label": "진단 결과", readOnly: true,
          value: this.state.diagnosticReport, ref: element => { this.reportInput = element; }, onFocus: event => event.target.select(),
        }),
        h(Button, { text: "제보용 정보 복사", onClick: async () => {
          this.reportInput?.focus();
          this.reportInput?.select();
          try {
            await navigator.clipboard.writeText(this.state.diagnosticReport);
            this.setState({ copyStatus: "복사했습니다. 버그 제보에 재현 순서와 함께 붙여넣어 주세요." });
          } catch {
            this.setState({ copyStatus: "결과를 선택했습니다. Ctrl+C로 복사해 주세요." });
          }
        } }),
        h("p", { role: "status" }, this.state.copyStatus || "제보 전에 내용을 확인해 주세요. 계정 토큰이나 인증 정보는 추가하지 마세요.")
      )
    );
  }

  renderSaved() {
    const strings = getLocaleStrings();

    return BdApi.React.createElement(
      "div",
      { className: "dccon-saved-container" },
      this.state.savedDccons.length > 0
        ? this.state.savedDccons.map((dccon) =>
            BdApi.React.createElement(SavedDCConCard, {
              key: dccon.info.package_idx,
              dccon: dccon,
              onRemove: () => {
                this.setState({ savedDccons: loadPacks() });
              },
            })
          )
        : BdApi.React.createElement(
            "div",
            { className: "dccon-empty-state" },
            "추가된 디시콘이 없습니다. '디시콘샵' 탭에서 디시콘을 추가해보세요."
          )
    );
  }

  render() {
    const h = BdApi.React.createElement;
    if (this.props.section === "settings") {
      return h("div", {className: "dccon-settings-panel dccon-user-settings"},
        this.renderOptions(), this.renderDiagnostics());
    }
    return h("div", {className: "dccon-settings-panel"},
      h("div", {className: "dccon-tab-menu"},
        ...[["saved", "내 디시콘"], ["shop", "디시콘샵"]].map(([tab, label]) => h("button", {
          key: tab, type: "button", className: "dccon-tab-item " + (this.state.activeTab === tab ? "active" : ""),
          onClick: () => this.handleTabChange(tab),
        }, label))),
      h("div", {className: "dccon-tab-content"}, this.state.activeTab === "saved" ? this.renderSaved() : this.renderSearch()));
  }

}
// #endregion

// 메인 플러그인 클래스
module.exports = class DCCon {
  constructor(meta) {
    this.meta = meta;
    this.strings = getLocaleStrings();
  }

  getSettingsPanel() {
    return BdApi.React.createElement(DCConSettingsPanel, {section: "settings"});
  }

  start() {


    // 기존 데이터 초기화
    if (loadData("dccons") === undefined) {
      saveData("dccons", []);
    }
    const savedPacks = loadData("dccons", []);
    const repairedPacks = uniquePacks(savedPacks);
    if (savedPacks.length !== repairedPacks.length) {
      if (loadData("dcconsBeforeDedup") === undefined) {
        saveData("dcconsBeforeDedup", savedPacks);
      }
      saveData("dccons", repairedPacks);
    }

    if (loadData("recent") === undefined) {
      saveData("recent", []);
    }


    warmCache(repairedPacks.flatMap(pack => pack.detail));
    this.patchChannelTextArea();


    BdApi.DOM.addStyle(this.meta.name, this.css);

    // 언어 변경 리스너 추가
    LocaleStore.addChangeListener(() => {
      this.strings = getLocaleStrings();
    });
  }

  stop() {
    cacheGeneration++;
    BdApi.Patcher.unpatchAll(this.meta.name);
    PluginEvents.dispatch({ type: "DCCON_UNPATCH_ALL" });
    BdApi.DOM.removeStyle(this.meta.name);
  }

  patchChannelTextArea() {
    BdApi.Patcher.after(
      this.meta.name,
      ChannelTextArea.type,
      "render",
      (_, [props], returnValue) => {
        const isProfilePopout = BdApi.Utils.findInTree(
          returnValue,
          (e) =>
            Array.isArray(e?.value) &&
            e.value.some((v) => v === "bite size profile popout"),
          { walkable: ["children", "props"] }
        );
        if (isProfilePopout) return;

        const chatBar = BdApi.Utils.findInTree(
          returnValue,
          (e) =>
            Array.isArray(e?.children) &&
            e.children.some((c) =>
              c?.props?.className?.startsWith("attachButton")
            ),
          { walkable: ["children", "props"] }
        );
        if (!chatBar) return;


        const channel = props.channel;
        const perms = Permissions.can(
          PermissionsConstants.SEND_MESSAGES,
          channel
        );
        if (!channel.type && !perms) return;

        chatBar.children.push(
          BdApi.React.createElement(DCConButton, {
            pickerType: props.type,
            channelId: props.channel.id,
          })
        );
      }
    );
  }

  get css() {
    return `
.dccon-popover, .dccon-settings-panel {
  --dc-text: var(--text-default, var(--text-normal, #dbdee1));
  --dc-muted: var(--text-muted, #949ba4);
  --dc-bg: var(--background-base-low, var(--background-secondary, #2b2d31));
  --dc-inset: var(--background-base-lowest, var(--background-tertiary, #1e1f22));
  --dc-hover: var(--background-modifier-hover, #ffffff12);
  --dc-selected: var(--background-modifier-selected, #ffffff20);
  --dc-accent: var(--blurple-50, #5865f2);
  font-family: var(--font-primary, "gg sans", "Noto Sans", sans-serif);
  font-size: 14px; line-height: 1.4; color: var(--dc-text); background: var(--dc-bg);
}
.theme-light .dccon-popover, .theme-light .dccon-settings-panel { --dc-text: var(--text-default, var(--text-normal, #313338)); --dc-muted: var(--text-muted, #5c5e66); --dc-bg: var(--background-base-low, var(--background-secondary, #f2f3f5)); --dc-inset: var(--background-base-lowest, var(--background-tertiary, #e3e5e8)); --dc-hover: var(--background-modifier-hover, #0000000a); --dc-selected: var(--background-modifier-selected, #00000014); }
.dccon-popover *, .dccon-settings-panel * { box-sizing: border-box; }
.dccon-popover button, .dccon-settings-panel button, .dccon-popover input, .dccon-settings-panel input { font: inherit; color: var(--dc-text); }
.dccon-popover button, .dccon-settings-panel button { border: 0; cursor: pointer; }
.dccon-popover button:disabled, .dccon-settings-panel button:disabled { opacity: .5; cursor: default; }
.dccon-popover button:focus-visible, .dccon-settings-panel button:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: -2px; }
.dccon-trigger { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; padding: 8px; border: 0; background: transparent; cursor: pointer; color: var(--interactive-normal, #b5bac1); }
.dccon-trigger:hover, .dccon-trigger[aria-expanded="true"] { color: var(--interactive-active, #fff); }
.dccon-buttonContainer { margin-left: 8px; }
.dccon-overlay { position: fixed; inset: 0; z-index: 10000; }
.dccon-popover { position: fixed; width: min(520px, calc(100vw - 16px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-subtle, #80808033); border-radius: 8px; box-shadow: 0 8px 32px #0006; }
.dccon-popover-toolbar { display: flex; gap: 8px; padding: 12px 12px 4px; }
.dccon-popover-toolbar button { padding: 7px 12px; background: transparent; border-radius: 6px; font-weight: 600; color: var(--dc-muted); }
.dccon-popover-toolbar button:hover { background: var(--dc-hover); color: var(--dc-text); }
.dccon-popover-toolbar button[aria-pressed="true"] { background: var(--dc-selected); color: var(--dc-text); }
.dccon-popover-toolbar button:last-child { margin-left: auto; font-size: 20px; padding: 2px 10px; }
.dccon-popover-body { flex: 1; min-height: 0; overflow: auto; }
.dccon-pickerContainer { height: 100%; display: flex; flex-direction: column; }
.dccon-header { padding: 12px; }
.dccon-search-field { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--dc-inset); border-radius: 6px; border: 2px solid transparent; }
.dccon-search-field:focus-within { border-color: var(--dc-accent); }
.dccon-search-input { min-width: 0; flex: 1; width: 100%; border: 0; outline: 0; background: transparent; }
.dccon-search-input::placeholder, .dccon-search-bar input::placeholder { color: var(--dc-muted); opacity: 1; }
.dccon-search-field button { background: transparent; font-size: 20px; }
.dccon-browser { flex: 1; min-height: 0; display: flex; border-top: 1px solid var(--border-subtle, #80808033); }
.dccon-rail { flex: 0 0 60px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 6px; overflow-y: auto; background: var(--dc-inset); }
.dccon-rail-button { position: relative; width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: transparent; font-size: 26px !important; }
.dccon-rail-button img { width: 32px; height: 32px; border-radius: 6px; object-fit: contain; }
.dccon-rail-button:hover { background: var(--dc-hover); }
.dccon-rail-button[aria-pressed="true"] { background: var(--dc-selected); }
.dccon-rail-button[aria-pressed="true"]::before { content: ""; position: absolute; left: -6px; width: 3px; height: 26px; border-radius: 0 3px 3px 0; background: var(--dc-text); }
.dccon-rail-divider { width: 28px; min-height: 1px; background: #80808033; margin: 3px 0; }
.dccon-browser-content { flex: 1; min-width: 0; overflow-y: auto; padding: 8px; }
.dccon-browser-content, .dccon-rail, .dccon-popover-body { scrollbar-width: thin; scrollbar-color: var(--dc-muted) transparent; }
.dccon-category { margin-bottom: 12px; }
.dccon-category-header, .dccon-section-title { display: flex; align-items: center; width: 100%; padding: 6px 4px; background: transparent; color: var(--dc-text); font-size: 14px; font-weight: 600; text-align: left; cursor: pointer; }
.dccon-category-header:hover { background: var(--dc-hover); border-radius: 4px; }
.dccon-category-icon { width: 20px; height: 20px; border-radius: 4px; margin-right: 8px; }
.dccon-category-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dccon-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px; padding: 6px 0; }
.dccon-tile { position: relative; min-width: 0; }
.dccon-popover .dccon-favorite { position: absolute; top: 3px; right: 3px; width: 26px; height: 26px; padding: 0; border-radius: 5px; background: var(--dc-inset); color: var(--dc-text); opacity: 0; }
.dccon-tile:hover .dccon-favorite, .dccon-tile:focus-within .dccon-favorite, .dccon-favorite[aria-pressed="true"] { opacity: 1; }
.dccon-popover .dccon-favorite[aria-pressed="true"] { color: var(--text-warning, #f0b232); }
.dccon-loading { position: absolute; bottom: 4px; left: 4px; right: 4px; padding: 3px; border-radius: 4px; background: var(--dc-inset); font-size: 11px; }
.dccon-item { display: flex; align-items: center; justify-content: center; padding: 4px; width: 100%; aspect-ratio: 1; min-width: 0; overflow: hidden; border-radius: 8px; background: transparent; }
.dccon-item:hover { background: var(--dc-hover); }
.dccon-item img { max-width: 100%; max-height: 100%; object-fit: contain; }
.dccon-item-error { color: var(--text-danger, #f47b82); font-size: 12px; }
.dccon-buffer { flex-shrink: 0; padding: 8px 12px; border-top: 1px solid #80808033; color: var(--dc-text); }
.dccon-buffer-heading { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
.dccon-buffer button { color: inherit; background: transparent; border: 0; cursor: pointer; }
.dccon-buffer button:disabled { opacity: .5; cursor: wait; }
.dccon-buffer-items { display: flex; gap: 6px; overflow-x: auto; margin-top: 6px; }
.dccon-buffer-items button { position: relative; flex: 0 0 44px; height: 44px; border-radius: 6px; background: #80808022; }
.dccon-buffer-items img { width: 36px; height: 36px; object-fit: contain; }
.dccon-buffer-items span { position: absolute; top: 0; right: 0; border-radius: 4px; background: var(--background-secondary, #232428); }
.dccon-footer { padding: 8px 12px; color: var(--dc-muted); font-size: 11px; border-top: 1px solid #80808033; }
.dccon-empty-state { padding: 32px 16px; text-align: center; color: var(--dc-muted); grid-column: 1 / -1; }
.dccon-empty-state button { display: block; margin: 16px auto 0; border-radius: 4px; padding: 8px 12px; background: var(--dc-accent); color: #fff; }
.dccon-settings-panel { padding: 12px; }
.dccon-user-settings { overflow-y: auto; }
.dccon-user-settings h3 { margin: 0 0 12px; font-size: 16px; color: var(--dc-text); }
.dccon-user-settings .dccon-diagnostics { border-top: 1px solid #80808033; margin-top: 20px; padding-top: 20px; }
.dccon-report-steps { padding-left: 20px; color: var(--dc-muted); line-height: 1.7; margin: 0 0 12px; }
.dccon-options { border: 0; margin: 0; padding: 0; min-width: 0; }
.dccon-options legend { font-size: 16px; font-weight: 600; padding: 0 0 12px; }
.dccon-mode-choice { display: flex; align-items: flex-start; gap: 10px; padding: 12px; margin-bottom: 8px; border: 1px solid #80808044; border-radius: 8px; cursor: pointer; background: var(--dc-inset); }
.dccon-mode-choice:has(input:checked) { border-color: var(--dc-accent); background: var(--dc-selected); }
.dccon-mode-choice:focus-within { outline: 2px solid var(--dc-accent); outline-offset: 2px; }
.dccon-mode-choice input { accent-color: var(--dc-accent); flex-shrink: 0; width: 18px; height: 18px; margin: 2px 0 0; }
.dccon-mode-choice strong { display: block; font-size: 14px; }
.dccon-mode-choice small { display: block; color: var(--dc-muted); font-size: 12px; margin-top: 5px; line-height: 1.5; }
.dccon-options p { color: var(--dc-muted); margin: 12px 0; }
.dccon-diagnostics p { color: var(--dc-muted); margin: 0 0 12px; }
.dccon-diagnostic-report { display: block; width: 100%; min-height: 240px; box-sizing: border-box; resize: vertical; margin: 12px 0; padding: 10px; background: var(--dc-inset); color: var(--dc-text); border: 1px solid #80808033; border-radius: 4px; font: 12px/1.5 monospace; user-select: text; }
.dccon-tab-menu { display: flex; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid #80808033; margin-bottom: 16px; }
.dccon-tab-item { padding: 8px 12px; cursor: pointer; color: var(--dc-muted); background: transparent; }
.dccon-tab-item.active { color: var(--dc-text); border-bottom: 2px solid var(--dc-accent); font-weight: 600; }
.dccon-search-bar { display: flex; gap: 8px; margin-bottom: 16px; }
.dccon-search-bar input { flex: 1; min-width: 0; padding: 8px 10px; background: var(--dc-inset); border: 1px solid #80808033; border-radius: 4px; }
.dccon-search-bar input:focus { outline: 2px solid var(--dc-accent); }
.dccon-settings-panel .dccon-button { padding: 7px 12px; background: var(--dc-accent); color: #fff; border-radius: 4px; }
.dccon-search-results, .dccon-saved-container { display: grid; gap: 8px; }
.dccon-card { display: flex; gap: 12px; padding: 12px; border-radius: 8px; background: var(--dc-inset); }
.dccon-card > img { width: 72px; height: 72px; object-fit: contain; }
.dccon-card-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dccon-card-content h3 { color: var(--dc-text); font-size: 14px; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
.dccon-card-content span { color: var(--dc-muted); font-size: 12px; }
`;
  }
};
