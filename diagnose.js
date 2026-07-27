const DOCTOR_VERSION = '1.0.0';
const EXTENSION_VERSION = '1.25.12';
const SETTINGS_KEY = 'comic-orb.settings.v1';
const TRACE_KEY = 'comic-orb.doctor.trace.v1';
const EVENTS_KEY = 'comic-orb.doctor.events.v1';
const ROOT_ID = 'comic-orb-root';
const STYLE_ID = 'comic-orb-style';
const moduleBase = new URL('.', import.meta.url).href;

function scrub(value) {
    return String(value ?? '')
        .replace(/([?&](?:key|api[_-]?key|token|signature)=)[^&#\s]+/gi, '$1[hidden]')
        .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;"']+/gi, '$1[hidden]')
        .replace(/("(?:apiKey|api_key|token|authorization)"\s*:\s*")[^"]+/gi, '$1[hidden]');
}

function safeJson(value, fallback) {
    try { return JSON.parse(value); } catch { return fallback; }
}

function storedEvents() {
    try {
        const value = safeJson(sessionStorage.getItem(EVENTS_KEY), []);
        return Array.isArray(value) ? value : [];
    } catch { return []; }
}

function saveEvents(events) {
    try { sessionStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-80))); } catch {}
}

function record(stage, detail = {}) {
    const events = storedEvents();
    events.push({
        time: new Date().toISOString(),
        stage: scrub(stage),
        detail: Object.fromEntries(Object.entries(detail || {}).map(([key, value]) => [key, scrub(value).slice(0, 2000)])),
    });
    saveEvents(events);
    return events.at(-1);
}

function elementSnapshot(selector) {
    const elements = [...document.querySelectorAll(selector)];
    const element = elements[0];
    if (!element) return { count: 0, exists: false };
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
        count: elements.length,
        exists: true,
        connected: element.isConnected,
        childCount: element.childElementCount,
        rect: {
            left: Math.round(rect.left), top: Math.round(rect.top),
            right: Math.round(rect.right), bottom: Math.round(rect.bottom),
            width: Math.round(rect.width), height: Math.round(rect.height),
        },
        inViewport: rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
    };
}

function settingsSnapshot() {
    let raw = null;
    try { raw = localStorage.getItem(SETTINGS_KEY); } catch (error) { return { readable: false, error: scrub(error.message) }; }
    if (!raw) return { readable: true, exists: false };
    const value = safeJson(raw, null);
    if (!value) return { readable: true, exists: true, validJson: false, bytes: raw.length };
    return {
        readable: true,
        exists: true,
        validJson: true,
        bytes: raw.length,
        backendMode: value.backendMode,
        outputLanguage: value.outputLanguage,
        workflowMode: value.workflowMode,
        fab: value.fab,
        panel: value.panel,
        debugEnabled: Boolean(value.debug?.enabled),
        captureModelIo: Boolean(value.debug?.captureModelIo),
        apiProfileCounts: {
            adaptation: Array.isArray(value.apiProfiles?.adaptation) ? value.apiProfiles.adaptation.length : 0,
            storyboard: Array.isArray(value.apiProfiles?.storyboard) ? value.apiProfiles.storyboard.length : 0,
            drawing: Array.isArray(value.apiProfiles?.drawing) ? value.apiProfiles.drawing.length : 0,
        },
    };
}

function contextSnapshot() {
    const api = globalThis.SillyTavern;
    const result = { globalExists: Boolean(api), getContextExists: typeof api?.getContext === 'function' };
    if (!result.getContextExists) return result;
    try {
        const context = api.getContext();
        return {
            ...result,
            contextAvailable: Boolean(context),
            chatArray: Array.isArray(context?.chat),
            chatLength: Array.isArray(context?.chat) ? context.chat.length : null,
            requestHeadersFunction: typeof context?.getRequestHeaders === 'function',
            saveChatFunction: typeof context?.saveChat === 'function',
        };
    } catch (error) {
        return { ...result, contextAvailable: false, error: scrub(error.message) };
    }
}

function resourceSnapshot() {
    return performance.getEntriesByType('resource')
        .filter(entry => /comic-orb|diagnose\.js/i.test(entry.name))
        .slice(-20)
        .map(entry => ({
            name: scrub(entry.name),
            durationMs: Math.round(entry.duration),
            transferSize: entry.transferSize,
            decodedBodySize: entry.decodedBodySize,
        }));
}

async function probeUrl(url) {
    const started = performance.now();
    try {
        const response = await fetch(url, { cache: 'no-store' });
        const text = await response.text();
        return {
            url: scrub(url),
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get('content-type') || '',
            bytes: text.length,
            elapsedMs: Math.round(performance.now() - started),
            startsWithHtml: /^\s*<!doctype|^\s*<html/i.test(text),
            version: url.endsWith('manifest.json') ? safeJson(text, {})?.version || null : null,
        };
    } catch (error) {
        return { url: scrub(url), ok: false, error: scrub(error.message), elapsedMs: Math.round(performance.now() - started) };
    }
}

export async function collect() {
    const pending = Array.isArray(globalThis.__comicOrbBootEvents) ? globalThis.__comicOrbBootEvents : [];
    const storageEstimate = await navigator.storage?.estimate?.().catch(() => null);
    return {
        format: 'comic-orb-headless-diagnostics',
        version: 1,
        doctorVersion: DOCTOR_VERSION,
        extensionVersion: globalThis.__comicOrbExpectedVersion || EXTENSION_VERSION,
        exportedAt: new Date().toISOString(),
        page: {
            origin: location.origin,
            pathname: location.pathname,
            readyState: document.readyState,
            visibilityState: document.visibilityState,
            viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
            secureContext: isSecureContext,
        },
        browser: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            touchPoints: navigator.maxTouchPoints,
            indexedDbAvailable: 'indexedDB' in globalThis,
            localStorageAvailable: (() => { try { return Boolean(localStorage); } catch { return false; } })(),
            storageEstimate: storageEstimate ? { usage: storageEstimate.usage, quota: storageEstimate.quota } : null,
        },
        sillyTavern: contextSnapshot(),
        dom: {
            root: elementSnapshot(`#${ROOT_ID}`),
            fab: elementSnapshot(`#${ROOT_ID} #co-fab`),
            panel: elementSnapshot(`#${ROOT_ID} #co-panel`),
            style: elementSnapshot(`#${STYLE_ID}`),
        },
        settings: settingsSnapshot(),
        resources: resourceSnapshot(),
        probes: {
            manifest: await probeUrl(new URL('manifest.json', moduleBase).href),
            script: await probeUrl(new URL('index.js', moduleBase).href),
            style: await probeUrl(new URL('style.css', moduleBase).href),
        },
        traceEnabled: localStorage.getItem(TRACE_KEY) === '1',
        bootEvents: pending.map(item => ({
            time: item.time,
            stage: scrub(item.stage),
            detail: Object.fromEntries(Object.entries(item.detail || {}).map(([key, value]) => [key, scrub(value).slice(0, 2000)])),
        })),
        capturedEvents: storedEvents(),
    };
}

export async function print() {
    const report = await collect();
    console.group('[漫画工房 Doctor] 无界面诊断报告');
    console.log(report);
    console.table([
        { check: '扩展版本', result: report.extensionVersion },
        { check: '酒馆上下文', result: report.sillyTavern.contextAvailable ? 'OK' : '不可用' },
        { check: '悬浮球 DOM', result: report.dom.fab.exists ? (report.dom.fab.inViewport ? '可见区域内' : '存在但在视口外/无尺寸') : '不存在' },
        { check: '样式资源', result: report.probes.style.ok ? `HTTP ${report.probes.style.status}` : report.probes.style.error || `HTTP ${report.probes.style.status}` },
        { check: '脚本资源', result: report.probes.script.ok ? `HTTP ${report.probes.script.status}` : report.probes.script.error || `HTTP ${report.probes.script.status}` },
        { check: '设置 JSON', result: report.settings.validJson === false ? '损坏' : 'OK' },
    ]);
    console.groupEnd();
    return report;
}

export async function download() {
    const report = await collect();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comic-orb-headless-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return report;
}

export function enableTrace() {
    localStorage.setItem(TRACE_KEY, '1');
    record('headless-trace-enabled', { result: 'reload required' });
    console.info('[漫画工房 Doctor] 启动追踪已开启，请刷新页面；刷新后运行 await ComicOrbDoctor.download()');
}

export function disableTrace() {
    localStorage.removeItem(TRACE_KEY);
    record('headless-trace-disabled');
}

export function resetPosition() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const value = safeJson(raw, null);
    if (!value) throw new Error('漫画球设置不存在或 JSON 已损坏，未自动覆盖');
    value.fab = { x: null, y: null };
    value.panel = { x: null, y: null };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
    record('positions-reset', { result: 'reload required' });
    console.info('[漫画工房 Doctor] 悬浮球与面板坐标已重置，请刷新页面');
}

function readFabVisibility() {
    try {
        const value = safeJson(localStorage.getItem(SETTINGS_KEY), {});
        return value?.interaction?.showFab !== false;
    } catch { return true; }
}

function writeFabVisibility(visible) {
    const parsed = safeJson(localStorage.getItem(SETTINGS_KEY), {});
    const value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    if (!value.interaction || typeof value.interaction !== 'object') value.interaction = {};
    value.interaction.showFab = Boolean(visible);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
}

export function setFabVisible(visible) {
    const next = Boolean(visible);
    writeFabVisibility(next);
    const fab = document.querySelector(`#${ROOT_ID} #co-fab`);
    if (fab) { fab.hidden = !next; fab.style.display = next ? '' : 'none'; }
    dispatchEvent(new CustomEvent('comic-orb:set-fab-visible', { detail: { visible: next } }));
    record('fab-visibility-changed', { visible: next, rootExists: Boolean(document.getElementById(ROOT_ID)) });
    return Boolean(fab);
}

export function openOrb() {
    const root = document.getElementById(ROOT_ID);
    const panel = root?.querySelector('#co-panel');
    if (!root || !panel) {
        record('open-orb-failed', { reason: 'root-or-panel-missing' });
        return false;
    }
    panel.classList.add('open');
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    const width = panel.offsetWidth || Math.min(430, innerWidth);
    const height = panel.offsetHeight || Math.min(640, innerHeight);
    panel.style.left = `${Math.max(0, Math.min(12, innerWidth - Math.min(width, innerWidth)))}px`;
    panel.style.top = `${Math.max(0, Math.min(12, innerHeight - Math.min(height, innerHeight)))}px`;
    dispatchEvent(new CustomEvent('comic-orb:open-panel'));
    record('orb-opened-from-extension-settings', { panelWidth: width, panelHeight: height });
    return true;
}

function diagnosticSummary(report) {
    const fatal = [...report.bootEvents, ...report.capturedEvents].reverse().find(item => /fatal|error|rejection/i.test(item.stage));
    return [
        `漫画球版本：${report.extensionVersion}`,
        `酒馆接口：${report.sillyTavern.contextAvailable ? '正常' : '不可用'}`,
        `主界面 DOM：${report.dom.root.exists ? '存在' : '不存在'}`,
        `悬浮球：${report.dom.fab.exists ? (report.dom.fab.inViewport ? '位于可视区' : '存在但不在可视区或尺寸为 0') : '不存在'}`,
        `脚本资源：${report.probes.script.ok ? `HTTP ${report.probes.script.status}` : report.probes.script.error || `HTTP ${report.probes.script.status}`}`,
        `样式资源：${report.probes.style.ok ? `HTTP ${report.probes.style.status}` : report.probes.style.error || `HTTP ${report.probes.style.status}`}`,
        `设置文件：${report.settings.validJson === false ? 'JSON 损坏' : '可读取'}`,
        fatal ? `最近异常：${fatal.stage} · ${fatal.detail?.message || fatal.detail?.reason || fatal.detail?.result || '详见报告'}` : '最近异常：未捕获',
    ].join('\n');
}

function installSettingsPanel() {
    if (document.getElementById('comic-orb-extension-settings')) return true;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;
    const container = document.createElement('div');
    container.id = 'comic-orb-extension-settings';
    container.className = 'extension_container';
    container.innerHTML = `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>漫画工房悬浮球</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display:none">
          <label class="checkbox_label" title="只控制悬浮球按钮；后台任务与扩展设置不会被停用">
            <input id="comic-orb-settings-show-fab" type="checkbox">
            <span>显示悬浮球</span>
          </label>
          <div class="flex-container flexGap5" style="flex-wrap:wrap;margin:.5em 0">
            <button id="comic-orb-settings-open" class="menu_button" type="button">打开漫画球界面</button>
            <button id="comic-orb-settings-run-diagnostic" class="menu_button" type="button">运行无界面诊断</button>
            <button id="comic-orb-settings-export-diagnostic" class="menu_button" type="button">导出 DEBUG</button>
            <button id="comic-orb-settings-reset-position" class="menu_button" type="button">重置悬浮窗位置</button>
            <button id="comic-orb-settings-trace-reload" class="menu_button" type="button">开启启动追踪并刷新</button>
          </div>
          <div id="comic-orb-settings-diagnostic-status" class="mes_text" style="white-space:pre-wrap;word-break:break-word;padding:.6em;border:1px solid var(--SmartThemeBorderColor);border-radius:6px">尚未运行诊断。</div>
          <textarea id="comic-orb-settings-diagnostic-json" readonly style="display:none;width:100%;height:220px;margin-top:.5em;font-family:monospace;font-size:.85em"></textarea>
          <small>报告不会导出 API Key、Authorization、聊天正文、参考图或图片 base64。若主脚本发生语法错误导致本项也未出现，可在 F12 控制台手动导入 diagnose.js。</small>
        </div>
      </div>`;
    host.prepend(container);
    const header = container.querySelector('.inline-drawer-header');
    const content = container.querySelector('.inline-drawer-content');
    const icon = container.querySelector('.inline-drawer-icon');
    header.addEventListener('click', event => {
        event.stopPropagation();
        const open = content.style.display === 'none';
        content.style.display = open ? '' : 'none';
        icon.classList.toggle('down', !open);
        icon.classList.toggle('up', open);
    });
    const visibility = container.querySelector('#comic-orb-settings-show-fab');
    visibility.checked = readFabVisibility();
    visibility.addEventListener('change', () => setFabVisible(visibility.checked));
    const status = container.querySelector('#comic-orb-settings-diagnostic-status');
    const json = container.querySelector('#comic-orb-settings-diagnostic-json');
    container.querySelector('#comic-orb-settings-open').addEventListener('click', () => {
        if (openOrb()) status.textContent = '漫画球主界面已打开；即使关闭了“显示悬浮球”，也可以从这里再次打开。';
        else status.textContent = '漫画球主界面尚未创建。请点击“运行无界面诊断”并导出 DEBUG。';
    });
    container.querySelector('#comic-orb-settings-run-diagnostic').addEventListener('click', async () => {
        status.textContent = '正在检查脚本、样式、酒馆接口、DOM 与本地设置…';
        try {
            const report = await collect();
            status.textContent = diagnosticSummary(report);
            json.value = JSON.stringify(report, null, 2);
            json.style.display = '';
        } catch (error) {
            status.textContent = `诊断失败：${scrub(error.message)}`;
        }
    });
    container.querySelector('#comic-orb-settings-export-diagnostic').addEventListener('click', () => download().catch(error => { status.textContent = `导出失败：${scrub(error.message)}`; }));
    container.querySelector('#comic-orb-settings-reset-position').addEventListener('click', () => {
        try {
            resetPosition();
            status.textContent = '位置已重置。正在刷新页面…';
            setTimeout(() => location.reload(), 300);
        } catch (error) { status.textContent = `重置失败：${scrub(error.message)}`; }
    });
    container.querySelector('#comic-orb-settings-trace-reload').addEventListener('click', () => {
        enableTrace();
        status.textContent = '启动追踪已开启。正在刷新页面…';
        setTimeout(() => location.reload(), 300);
    });
    record('extension-settings-panel-installed', { host: host.id });
    return true;
}

function scheduleSettingsPanel() {
    if (installSettingsPanel()) return;
    const observer = new MutationObserver(() => {
        if (installSettingsPanel()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 30000);
}

export function install(meta = {}) {
    globalThis.__comicOrbExpectedVersion = meta.version || globalThis.__comicOrbExpectedVersion || EXTENSION_VERSION;
    if (!globalThis.__comicOrbDoctorListenersInstalled) {
        globalThis.__comicOrbDoctorListenersInstalled = true;
        addEventListener('error', event => {
            const relevant = /comic-orb|漫画工房/i.test(`${event.filename || ''}\n${event.message || ''}\n${event.error?.stack || ''}`);
            if (relevant || localStorage.getItem(TRACE_KEY) === '1') record('window-error', { message: event.message, filename: event.filename, line: event.lineno, column: event.colno, stack: event.error?.stack || '' });
        });
        addEventListener('unhandledrejection', event => {
            const reason = event.reason?.stack || event.reason?.message || String(event.reason || '');
            if (/comic-orb|漫画工房/i.test(reason) || localStorage.getItem(TRACE_KEY) === '1') record('unhandled-rejection', { reason });
        });
    }
    record('doctor-installed', { moduleBase, extensionVersion: globalThis.__comicOrbExpectedVersion });
    globalThis.ComicOrbDoctor = { collect, print, download, enableTrace, disableTrace, resetPosition, setFabVisible, openOrb, record, version: DOCTOR_VERSION };
    scheduleSettingsPanel();
    if (localStorage.getItem(TRACE_KEY) === '1' && !globalThis.__comicOrbDoctorAutoPrintScheduled) {
        globalThis.__comicOrbDoctorAutoPrintScheduled = true;
        queueMicrotask(() => print().catch(error => console.warn('[漫画工房 Doctor] 自动诊断失败', error)));
    }
    return globalThis.ComicOrbDoctor;
}

install();
