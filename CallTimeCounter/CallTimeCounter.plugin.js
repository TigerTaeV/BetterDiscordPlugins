/**
 * @name CallTimeCounter
 * @author tigertaev
 * @authorLink https://discord.com/users/1333264984817401944
 * @version 1.2.1
 * @description Shows how much time you are in a voice chat.
 * @donate https://www.if-you-want-to-help-me-please-dm.me
 * @updateUrl https://raw.githubusercontent.com/TigerTaeV/BetterDiscordPlugins/refs/heads/main/CallTimeCounter/CallTimeCounter.plugin.js
 */

module.exports = class CallTimeCounter {
    constructor() {
        this.BD = window.BdApi ?? {};
        this.Webpack = this.BD.Webpack ?? this.BD.WebpackModules ?? null;
        this.Patcher = this.BD.Patcher ?? null;
        this.DataApi = this.BD.Data ?? this.BD.DataStore ?? null;
        this.UIApi = this.BD.UI ?? null;
        this.React = this.BD.React ?? window.React ?? null;

        this.meta = {
            name: "CallTimeCounter",
            version: "1.2.1",
            changelogMessage: "✨ Timer updates are smoother and lighter; improved BetterDiscord API compatibility."
        };

        this.UserStore = null;
        this.RTCStore = null;
        this.VoiceStateStore = null;

        this.startTime = null;
        this.lastChannelId = null;
        this.domFallbackActive = false;

        this.timerId = null;        
        this.observer = null;
        this.node = null;
        this.originalText = null;
    }


    toast(message, options = {}) {
        if (this.UIApi?.showToast) this.UIApi.showToast(message, options);
        else console.log(`[${this.meta.name}] ${message}`);
    }

    start() {
        try {
            if (!this.Webpack || !this.Patcher || !this.DataApi || !this.React) {
                throw new Error("Incompatible BetterDiscord API (missing Webpack/Patcher/Data/React)");
            }

            this.setupModules();
            if (!this.UserStore || !this.RTCStore || !this.VoiceStateStore) {
                throw new Error("Couldn’t find Discord modules");
            }

            const patched = this.patchVoiceComponents();
            if (!patched) {
                this.domFallbackActive = true;
                this.startDomTimer();
            }

            this.showChangelogIfNew();
        } catch (err) {
            this.toast(`CallTimeCounter failed: ${err.message}`, { type: "error" });
        }
    }

    stop() {
        try {
            if (this.Patcher?.unpatchAll) this.Patcher.unpatchAll(this.meta.name);
        } catch {}

        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.resetDom();
        this.hideBanner();

        this.startTime = null;
        this.lastChannelId = null;
        this.node = null;
        this.originalText = null;
    }

    setupModules() {
        const WM = this.Webpack;


        const hasFilters = Boolean(WM?.getModule && WM?.Filters);
        if (hasFilters) {
            const { getModule, Filters } = WM;
            this.UserStore = getModule(Filters.byProps("getCurrentUser"));
            this.RTCStore = getModule(Filters.byProps("isConnected", "getChannelId"));
            this.VoiceStateStore = getModule(Filters.byProps("getVoiceState"));
            this._getByDisplayName = (name) => getModule(Filters.byDisplayName(name));
            return;
        }


        if (WM?.getByProps) {
            this.UserStore = WM.getByProps("getCurrentUser");
            this.RTCStore = WM.getByProps("isConnected", "getChannelId");
            this.VoiceStateStore = WM.getByProps("getVoiceState");
            this._getByDisplayName = (name) => WM.getByDisplayName?.(name);
            return;
        }

        throw new Error("Unsupported Webpack API surface");
    }

    getSelfId() {
        return this.UserStore?.getCurrentUser?.()?.id ?? null;
    }

    getChannelId() {
        if (this.RTCStore?.isConnected?.()) {
            const id = this.RTCStore.getChannelId?.();
            if (id) return id;
        }
        const uid = this.getSelfId();
        return this.VoiceStateStore?.getVoiceState?.(uid)?.channelId ?? null;
    }

    patchVoiceComponents() {
        const RTCModule = this._getByDisplayName?.("RTCConnectionStatus");
        const VoiceInfoModule = this._getByDisplayName?.("VoiceUserInfo");
        const Patcher = this.Patcher;

        let patchedCount = 0;

        const patchComponent = (mod) => {
            if (!mod?.default || !Patcher?.instead) return false;
            Patcher.instead(this.meta.name, mod, "default", (_this, args, original) => {
                const tree = original(...args);
                if (!tree) return tree;

                const channelId = this.getChannelId();
                const connected = Boolean(channelId);

                if (connected) {
                    if (!this.startTime || this.lastChannelId !== channelId) {
                        this.startTime = Date.now();
                        this.lastChannelId = channelId;
                    }
                } else if (this.startTime) {
                    this.startTime = null;
                    this.lastChannelId = null;
                }

                return this.addTimerToTree(tree, connected);
            });
            return true;
        };

        if (patchComponent(RTCModule)) patchedCount++;
        if (patchComponent(VoiceInfoModule)) patchedCount++;

        return patchedCount > 0;
    }

    addTimerToTree(root, connected) {
        const React = this.React;

        const matchClass = (cn) => {
            if (!cn) return false;
            if (typeof cn === "string") return cn.includes("subtext") || cn.includes("channelName");
            if (Array.isArray(cn)) return cn.some(x => x?.includes?.("subtext") || x?.includes?.("channelName"));
            if (typeof cn === "object") {
                const joined = Object.values(cn).filter(Boolean).join(" ");
                return joined.includes("subtext") || joined.includes("channelName");
            }
            return false;
        };


        const TimerText = ({ startTime, format }) => {
            const [now, setNow] = React.useState(Date.now());

            React.useEffect(() => {
                let timeout = null;
                const tick = () => {
                    setNow(Date.now());
                    const drift = Date.now() - startTime;
                    const untilNextSecond = 1000 - (drift % 1000);
                    timeout = setTimeout(tick, Math.max(250, untilNextSecond));
                };
                tick();

                const onVis = () => setNow(Date.now());
                document.addEventListener("visibilitychange", onVis);

                return () => {
                    if (timeout) clearTimeout(timeout);
                    document.removeEventListener("visibilitychange", onVis);
                };
            }, [startTime]);

            const ms = Math.max(0, now - startTime);
            return format(ms);
        };

        const transform = (node, replacedRef) => {
            if (!node || replacedRef.done) return node;
            if (!this.React.isValidElement(node)) return node;

            const cn = node.props?.className;
            const isTarget = matchClass(cn);

            if (!isTarget) {
                const children = node.props?.children;
                if (!children) return node;

                if (Array.isArray(children)) {
                    const nextChildren = children.map(child => transform(child, replacedRef));
                    for (let i = 0; i < children.length; i++) {
                        if (nextChildren[i] !== children[i]) {
                            return this.React.cloneElement(node, node.props, nextChildren);
                        }
                    }
                    return node;
                } else {
                    const nextChild = transform(children, replacedRef);
                    if (nextChild !== children) {
                        return this.React.cloneElement(node, node.props, nextChild);
                    }
                    return node;
                }
            }

            if (!connected) return node;

            replacedRef.done = true;

            const styled = {
                ...node.props?.style,
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600
            };

            const timerElement = this.React.createElement(TimerText, {
                startTime: this.startTime,
                format: (ms) => this.formatTime(ms)
            });

            return this.React.cloneElement(node, { ...node.props, style: styled }, timerElement);
        };

        const replacedRef = { done: false };
        return transform(root, replacedRef);
    }

    formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const h = String(Math.floor(s / 3600)).padStart(2, "0");
        const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
        const sec = String(s % 60).padStart(2, "0");
        return `${h}:${m}:${sec}`;
    }

    startDomTimer() {
        const tick = () => {
            const channelId = this.getChannelId();
            const connected = Boolean(channelId);

            if (connected) {
                if (!this.startTime || this.lastChannelId !== channelId) {
                    this.startTime = Date.now();
                    this.lastChannelId = channelId;

                    this.originalText = this.findDomNode()?.textContent ?? this.originalText;
                    this.watchPanel();
                }
            } else if (this.startTime) {
                this.resetDom();
                this.startTime = null;
                this.lastChannelId = null;
                if (this.observer) this.observer.disconnect();
            }

            this.updateDom();

            const base = this.startTime ?? Date.now();
            const drift = Date.now() - base;
            const untilNextSecond = 1000 - (drift % 1000);
            this.timerId = setTimeout(tick, Math.max(250, untilNextSecond));
        };

        // Kick off once
        tick();

        // Immediate refresh when tab becomes visible again
        const onVis = () => this.updateDom();
        document.addEventListener("visibilitychange", onVis);
        this._onVisibility = onVis;
    }

    findDomNode() {
        
        if (this.node && document.contains(this.node)) return this.node;
        const parent = document.querySelector('[class*="rtcConnectionStatus"], [class*="voiceUserInfo"]');
        this.node = parent?.querySelector('[class*="subtext"], [class*="channelName"]') || parent || null;
        return this.node;
    }

    watchPanel() {
        const panel = document.querySelector('[class*="rtcConnectionStatus"], [class*="voiceUserInfo"]');
        if (!panel) return;
        if (this.observer) this.observer.disconnect();
        this.observer = new MutationObserver(() => {
            this.node = null;
            this.updateDom();
        });
        this.observer.observe(panel, { childList: true, subtree: true });
    }

    updateDom() {
        if (!this.domFallbackActive) return;
        const node = this.findDomNode();
        if (!node || !this.startTime) return;

        
        node.textContent = this.formatTime(Date.now() - this.startTime);
        node.style.fontVariantNumeric = "tabular-nums";
        node.style.fontWeight = "600";
    }

    resetDom() {
        const node = this.findDomNode();
        if (node && this.originalText != null) {
            node.textContent = this.originalText;
            node.style.fontVariantNumeric = "";
            node.style.fontWeight = "";
        }
        this.originalText = null;

        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        if (this._onVisibility) {
            document.removeEventListener("visibilitychange", this._onVisibility);
            this._onVisibility = null;
        }
    }

    showChangelogIfNew() {
        const savedVersion = this.DataApi?.load?.(this.meta.name, "version");
        if (savedVersion === this.meta.version) return;
        this.showBanner(this.meta.changelogMessage);
        this.DataApi?.save?.(this.meta.name, "version", this.meta.version);
    }

    showBanner(message) {
        this.hideBanner();
        const banner = document.createElement("div");
        banner.id = "calltimecounter-banner";
        banner.textContent = message;
        banner.style.cssText = `
            background-color: #5865F2;
            color: white;
            padding: 8px;
            text-align: center;
            font-weight: 500;
            font-size: 14px;
            cursor: pointer;
        `;
        banner.onclick = () => this.hideBanner();
        const container = document.querySelector('[class*="sidebar"]')?.parentElement;
        if (container) container.prepend(banner);
        setTimeout(() => this.hideBanner(), 8000);
    }

    hideBanner() {
        const banner = document.getElementById("calltimecounter-banner");
        if (banner) banner.remove();
    }
};
