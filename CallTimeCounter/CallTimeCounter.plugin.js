/**
 * @name CallTimeCounter
 * @author Abdualrahman
 * @authorLink https://discord.com/users/1333264984817401944
 * @version 1.0.0
 * @description Shows how much time you are in a voice chat..
 * @donate https://www.if-you-want-to-help-me-please-dm.me
 * @updateUrl 
 */

const { Webpack, Data } = BdApi;

module.exports = class CallTimeCounter {
    constructor() {
        this.startTime = null;
        this.timerId = null;
        this.observer = null;
        this.originalText = null;
        this.node = null;

        this.UserStore = null;
        this.RTCStore = null;
        this.VoiceStateStore = null;

        this.meta = {
            name: "CallTimeCounter",
            version: "1.0.0",
            changelogMessage: "✨ CallTimeCounter is now active! It shows a live call timer in your voice panel."
        };
    }

    start() {
        try {
            this.initModules();
            if (!this.UserStore || !this.RTCStore || !this.VoiceStateStore) {
                throw new Error("Discord modules not found");
            }
            this.showChangelogBannerOnce();
            this.startLoop();
        } catch (err) {
            BdApi.showToast(`CallTimeCounter error: ${err.message}`, { type: "error" });
        }
    }

    stop() {
        if (this.timerId) cancelAnimationFrame(this.timerId);
        if (this.observer) this.observer.disconnect();
        this.restoreOriginal();
        this.removeBanner();
    }

    // --- Setup ---
    initModules() {
        const byProps = (...props) => Webpack.getModule(m => props.every(p => m?.[p] !== undefined));
        this.UserStore = byProps("getCurrentUser");
        this.RTCStore = Webpack.getModule(m => m?.isConnected && m?.getChannelId);
        this.VoiceStateStore = Webpack.getModule(m => m?.getVoiceState);
    }

    getSelfId() {
        return this.UserStore?.getCurrentUser?.()?.id ?? null;
    }

    getChannelId() {
        if (this.RTCStore?.isConnected()) return this.RTCStore.getChannelId();
        const uid = this.getSelfId();
        return this.VoiceStateStore?.getVoiceState?.(uid)?.channelId ?? null;
    }

    findNode() {
        if (this.node && document.contains(this.node)) return this.node;
        const parent = document.querySelector('[class*="rtcConnectionStatus"], [class*="voiceUserInfo"]');
        this.node = parent?.querySelector('[class*="subtext"], [class*="channelName"]') || parent;
        return this.node;
    }

    format(ms) {
        const s = Math.floor(ms / 1000);
        const h = String(Math.floor(s / 3600)).padStart(2, "0");
        const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
        const sec = String(s % 60).padStart(2, "0");
        return `${h}:${m}:${sec}`;
    }

    // --- Main Loop ---
    startLoop() {
        const tick = () => {
            const connected = Boolean(this.getChannelId());

            if (connected && !this.startTime) {
                this.startTime = Date.now();
                this.originalText = this.findNode()?.textContent;
                this.observePanel();
            }

            if (!connected && this.startTime) {
                this.restoreOriginal();
                this.startTime = null;
                if (this.observer) this.observer.disconnect();
            }

            this.render();
            this.timerId = requestAnimationFrame(tick);
        };
        tick();
    }

    observePanel() {
        const panel = document.querySelector('[class*="rtcConnectionStatus"], [class*="voiceUserInfo"]');
        if (!panel) return;
        this.observer = new MutationObserver(() => {
            this.node = null; // re-find node
            this.render();
        });
        this.observer.observe(panel, { childList: true, subtree: true });
    }

    render() {
        const node = this.findNode();
        if (!node) return;
        if (this.startTime) {
            node.textContent = this.format(Date.now() - this.startTime);
            node.style.fontVariantNumeric = "tabular-nums";
            node.style.fontWeight = "600";
        }
    }

    restoreOriginal() {
        const node = this.findNode();
        if (node && this.originalText) {
            node.textContent = this.originalText;
            node.style.fontVariantNumeric = "";
            node.style.fontWeight = "";
        }
        this.originalText = null;
    }

    // --- Banner Changelog ---
    showChangelogBannerOnce() {
        const savedVersion = Data.load(this.meta.name, "version");
        if (savedVersion === this.meta.version) return;

        this.showBanner(this.meta.changelogMessage);
        Data.save(this.meta.name, "version", this.meta.version);
    }

    showBanner(message) {
        this.removeBanner();
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
        banner.onclick = () => this.removeBanner();

        const container = document.querySelector('[class*="sidebar"]')?.parentElement;
        if (container) container.prepend(banner);

        setTimeout(() => this.removeBanner(), 8000);
    }

    removeBanner() {
        const existing = document.getElementById("calltimecounter-banner");
        if (existing) existing.remove();
    }
};
