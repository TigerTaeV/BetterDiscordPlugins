/**
 * @name CallTimeCounter
 * @author tigertaev
 * @authorLink https://discord.com/users/1333264984817401944
 * @version 1.0.0
 * @description Call duration timer replacing the voice channel & server name in Discord’s voice panel.
 * @donate BTC: 1Kyf8uLgGrco8FdVuYpqi5CqVaVNxvnfDJ
 * @patreon USDT TRC20: TV5jZrPGJJcxrdS7wWpmNJZzqihZ6HBqQZ
 * @website if you want to support me please feel free to dm me discord: tigertaev
 * @updateUrl https://raw.githubusercontent.com/TigerTaeV/BetterDiscordPlugins/refs/heads/main/CallTimer/CallTimeCounter.plugin.js
 */

"use strict";

const { Webpack, UI } = BdApi;

module.exports = class CallTimeCounter {
    constructor() {
        this.meta = {
            name: "CallTimeCounter",
            version: "1.0.0",
            author: "tigertaev",
            authorLink: "https://discord.com/users/1333264984817401944",
            description: "Call timer in the voice panel."
        };

        this._timerId = null;
        this._observer = null;
        this._startTime = null;
        this._lastConnected = false;
        this._originalText = null;
        this._voiceDetailsNode = null;

        this._UserStore = null;
        this._RTCConnectionStore = null;
        this._VoiceStateStore = null;
    }

    start() {
        this._initModules();

        // Guard for missing modules
        if (!this._UserStore || !this._RTCConnectionStore || !this._VoiceStateStore) {
            BdApi.showToast("CallTimeCounter: Required modules not found. Plugin may be broken after a Discord update.", { type: "error" });
            return;
        }

        this._showWelcome();
        this._beginLoops();
    }

    stop() {
        this._teardownLoops();
        this._restoreOriginal();
    }

    _initModules() {
        const byProps = (...props) =>
            Webpack.getModule(m => props.every(p => m?.[p] !== undefined));

        this._UserStore = byProps("getCurrentUser");
        this._RTCConnectionStore = Webpack.getModule(m => typeof m?.isConnected === "function" && typeof m?.getChannelId === "function");
        this._VoiceStateStore = Webpack.getModule(m =>
            typeof m?.getAllVoiceStates === "function" ||
            typeof m?.getVoiceState === "function" ||
            typeof m?.getVoiceStatesForChannel === "function"
        );
    }

    _findVoiceDetailsNode() {
        if (this._voiceDetailsNode && document.contains(this._voiceDetailsNode)) {
            return this._voiceDetailsNode;
        }
        const parent = document.querySelector('[class*="rtcConnectionStatus"], [class*="voiceUserInfo"]');
        if (!parent) return null;
        this._voiceDetailsNode = parent.querySelector('[class*="subtext"]') ||
                                  parent.querySelector('[class*="channelName"]') ||
                                  parent;
        return this._voiceDetailsNode;
    }

    _beginLoops() {
        let lastFrameTime = performance.now();

        const loop = (time) => {
            const delta = time - lastFrameTime;
            if (delta >= 1000) {
                // align to actual elapsed time to reduce drift
                lastFrameTime = time - (delta % 1000);
                this._tick();
            }
            this._timerId = requestAnimationFrame(loop);
        };
        this._timerId = requestAnimationFrame(loop);

        const panel = document.querySelector('[class*="rtcConnectionStatus"], [class*="voiceUserInfo"]');
        if (panel) {
            this._observer = new MutationObserver(() => {
                this._voiceDetailsNode = null; // invalidate cache when DOM mutates
                this._render();
            });
            this._observer.observe(panel, { childList: true, subtree: true });
        }

        this._tick();
    }

    _teardownLoops() {
        if (this._timerId) cancelAnimationFrame(this._timerId);
        if (this._observer) this._observer.disconnect();
        this._timerId = null;
        this._observer = null;
        this._startTime = null;
        this._lastConnected = false;
        this._voiceDetailsNode = null;
    }

    _getSelfId() {
        return this._UserStore?.getCurrentUser?.()?.id ?? null;
    }

    _getConnectedChannelId() {
        if (this._RTCConnectionStore?.isConnected?.()) {
            return this._RTCConnectionStore.getChannelId?.() ?? null;
        }
        const uid = this._getSelfId();
        if (!uid || !this._VoiceStateStore) return null;
        if (typeof this._VoiceStateStore.getAllVoiceStates === "function") {
            const all = this._VoiceStateStore.getAllVoiceStates();
            for (const [, users] of Object.entries(all)) {
                const vs = users instanceof Map ? users.get(uid) : users[uid];
                if (vs?.channelId) return vs.channelId;
            }
        }
        if (typeof this._VoiceStateStore.getVoiceState === "function") {
            return this._VoiceStateStore.getVoiceState(uid)?.channelId ?? null;
        }
        return null;
    }

    _tick() {
        const connected = Boolean(this._getConnectedChannelId());
        if (connected && !this._lastConnected) {
            this._startTime = Date.now();
            if (this._originalText === null) {
                const node = this._findVoiceDetailsNode();
                if (node) this._originalText = node.textContent;
            }
        }
        if (!connected && this._lastConnected) {
            this._restoreOriginal();
            this._startTime = null;
        }
        this._lastConnected = connected;
        this._render();
    }

    _format(ms) {
        const secTotal = Math.floor(ms / 1000);
        const hours = Math.floor(secTotal / 3600);
        const mins = Math.floor((secTotal % 3600) / 60);
        const secs = secTotal % 60;
        const pad = n => String(n).padStart(2, "0");
        return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    }

    _render() {
        const node = this._findVoiceDetailsNode();
        if (!node) return;
        if (this._lastConnected) {
            if (!this._startTime) this._startTime = Date.now();
            node.textContent = this._format(Date.now() - this._startTime);
            Object.assign(node.style, {
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "0.3px",
                fontWeight: "600"
            });
        } else {
            this._restoreOriginal();
        }
    }

    _restoreOriginal() {
        const node = this._findVoiceDetailsNode();
        if (node && this._originalText !== null && node.textContent !== this._originalText) {
            node.textContent = this._originalText;
            Object.assign(node.style, {
                fontVariantNumeric: "",
                letterSpacing: "",
                fontWeight: ""
            });
        }
        this._originalText = null;
    }

    _showWelcome() {
        UI.showConfirmationModal(
            "🎉 Welcome to CallTimeCounter",
            BdApi.React.createElement("div", { style: { lineHeight: "1.5", color: "#ffffff" } }, [
                BdApi.React.createElement("p", { style: { marginBottom: "8px" } }, "Thanks for installing CallTimeCounter!"),
                BdApi.React.createElement("p", {}, "This plugin replaces your voice channel & server name with a live HH:MM:SS timer showing how long you’ve been in a call."),
                BdApi.React.createElement("h4", { style: { marginTop: "12px" } }, "Changelog"),
                BdApi.React.createElement("ul", {
                    style: {
                        paddingLeft: "20px",
                        listStyle: "disc"
                    }
                }, [
                    BdApi.React.createElement("li", { style: { color: "#4CAF50", fontWeight: "bold" } }, "Added: Real-time call duration display"),
                    BdApi.React.createElement("li", { style: { color: "#FF9800", fontWeight: "bold" } }, "Fixed: UI restore after call disconnect"),
                    BdApi.React.createElement("li", { style: { color: "#4CAF50", fontWeight: "bold" } }, "Added: Popup changelog on plugin start")
                ]),
                BdApi.React.createElement("p", {
                    style: { marginTop: "12px", fontSize: "0.9em", opacity: 0.9 }
                }, "Donations: BTC 1Kyf8uLgGrco8FdVuYpqi5CqVaVNxvnfDJ | USDT (TRC20) TV5jZrPGJJcxrdS7wWpmNJZzqihZ6HBqQZ")
            ]),
            { confirmText: "Got it!", cancelText: "Close" }
        );
    }

    getName() { return this.meta.name; }
    getDescription() { return this.meta.description; }
    getVersion() { return this.meta.version; }
    getAuthor() { return this.meta.author; }
    getAuthorLink() { return this.meta.authorLink; }
};
