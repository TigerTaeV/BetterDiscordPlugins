/**
 * @name BTStartup
 * @version 7.0.0
 * @description 시작 시 지정한 텍스트 채널로 이동하고, 설정 시 음성 채널에 안정적으로 자동 접속합니다.
 * @author BTDev
 * @website https://x.com/bts_twt
 */

const { Data, UI, Webpack } = BdApi;

class BTStartup {
    constructor() {
        this.settings = this.loadSettings();
        this.isActive = false;
        this.voiceJoined = false;
        this.originalTextPath = null;
        this._voiceRetryTimeout = null;
        this._voiceFallbackTimeout = null;
        this._unsubscribeConn = null;
        this._unsubscribeVoice = null;
    }

    // ===== Lifecycle =====
    start() {
        if (this.isActive) return;
        this.isActive = true;
        this._bindConnectionEvents();
        this.navigateToChannel();
    }

    stop() {
        this.isActive = false;
        this.voiceJoined = false;
        if (this._voiceRetryTimeout) clearTimeout(this._voiceRetryTimeout);
        if (this._voiceFallbackTimeout) clearTimeout(this._voiceFallbackTimeout);
        if (this._unsubscribeConn) this._unsubscribeConn();
        if (this._unsubscribeVoice) this._unsubscribeVoice();
    }

    // ===== Settings =====
    loadSettings() {
        return Data.load("BTStartup", "settings") || {
            channelServerId: "",
            channelChannelId: "",
            voiceChannelId: ""
        };
    }

    saveSettings() {
        Data.save("BTStartup", "settings", this.settings);
    }

    // ===== Navigation =====
    getTransitionTo() {
        const fn = Webpack.getByStrings?.(["transitionTo - Transitioning to"], { searchExports: true });
        if (typeof fn === "function") return fn;
        const router = Webpack.getModule(m => m && typeof m.transitionTo === "function", { searchExports: true });
        return router?.transitionTo || null;
    }

    performNavigation(path) {
        const transitionTo = this.getTransitionTo();
        if (transitionTo) transitionTo(path);
        else window.location.pathname = path;
    }

    isValidId(id) {
        return /^\d+$/.test((id || "").trim());
    }

    navigateToChannel() {
        const sid = (this.settings.channelServerId || "").trim();
        const tid = (this.settings.channelChannelId || "").trim();
        if (!this.isValidId(sid) || !this.isValidId(tid)) return;
        this.originalTextPath = `/channels/${sid}/${tid}`;
        this.performNavigation(this.originalTextPath);
        this.scheduleVoiceJoinIfNeeded();
    }

    // ===== Voice Join (Adaptive Delay) =====
    _bindConnectionEvents() {
        const Dispatcher = Webpack.getModule(m => m?.dispatch && m?.subscribe);
        if (!Dispatcher) return;

        const onReconnect = () => {
            if (!this.isActive || this.voiceJoined) return;
            this.scheduleVoiceJoinIfNeeded(true);
        };
        Dispatcher.subscribe?.("CONNECTION_OPEN", onReconnect);
        this._unsubscribeConn = () => Dispatcher.unsubscribe?.("CONNECTION_OPEN", onReconnect);

        const onVoiceSelected = (payload) => {
            const selectedId = payload?.channelId || payload?.channel?.id;
            if (!this.isActive || this.voiceJoined) return;
            if (selectedId && selectedId === (this.settings.voiceChannelId || "").trim()) {
                this.voiceJoined = true;
                UI.showToast("Voice channel joined successfully", { type: "success" });
            }
        };

        const voiceEvents = ["VOICE_CHANNEL_SELECT", "RTC_CONNECTED", "RTC_CONNECTION_STATE"];
        voiceEvents.forEach(t => Dispatcher.subscribe?.(t, onVoiceSelected));
        this._unsubscribeVoice = () => voiceEvents.forEach(t => Dispatcher.unsubscribe?.(t, onVoiceSelected));
    }

    scheduleVoiceJoinIfNeeded(immediate = false) {
        const sid = (this.settings.channelServerId || "").trim();
        const vid = (this.settings.voiceChannelId || "").trim();
        if (!this.isValidId(sid) || !this.isValidId(vid)) return;

        const delays = immediate
            ? [250, 600, 900, 1300, 1800, 2500, 3500, 5000]
            : [1500, 1000, 1400, 1800, 2300, 3000, 4000, 5500];

        let attempt = 0;

        const tryJoin = () => {
            if (!this.isActive || this.voiceJoined) return;
            attempt++;

            if (this.attemptVoiceJoin(sid, vid)) {
                this.voiceJoined = true;
                UI.showToast("Attempting voice channel join…", { type: "info" });
                return;
            }

            if (attempt < delays.length) {
                this._voiceRetryTimeout = setTimeout(tryJoin, delays[attempt]);
            } else {
                const voicePath = `/channels/${sid}/${vid}`;
                this.performNavigation(voicePath);
                this._voiceFallbackTimeout = setTimeout(() => {
                    if (this.originalTextPath) this.performNavigation(this.originalTextPath);
                    this.voiceJoined = true;
                    UI.showToast("Voice channel joined (fallback)", { type: "success" });
                }, 1600);
            }
        };

        UI.showToast("Preparing to auto-join voice channel…", { type: "info" });
        this._voiceRetryTimeout = setTimeout(tryJoin, delays[0]);
    }

    attemptVoiceJoin(guildId, voiceChannelId) {
        const VoiceActions = Webpack.getModule(
            m => m && typeof m.selectVoiceChannel === "function" && typeof m.disconnect === "function",
            { searchExports: true }
        );
        if (VoiceActions) {
            try {
                VoiceActions.selectVoiceChannel(voiceChannelId, false);
                return true;
            } catch {}
        }

        const VoiceModule = Webpack.getModule(
            m => m && typeof m.joinVoiceChannel === "function" && typeof m.setSelfMute === "function",
            { searchExports: true }
        );
        if (VoiceModule) {
            try {
                VoiceModule.joinVoiceChannel({
                    channelId: voiceChannelId,
                    guildId: guildId,
                    selfMute: false,
                    selfDeaf: false
                });
                return true;
            } catch {}
        }
        return false;
    }

    // ===== Settings Panel =====
    getSettingsPanel() {
        const container = document.createElement("div");
        const scopeClass = "btstartup-scope";
        container.className = scopeClass;
        container.style.padding = "16px";
        container.style.color = "white";

        const style = document.createElement("style");
        style.textContent = `
            .${scopeClass} select,
            .${scopeClass} input {
                width: 100%;
                padding: 8px;
                background: #1e1f22;
                color: #ffffff;
                border: 1px solid #2b2d31;
                border-radius: 4px;
                outline: none;
            }
            .${scopeClass} select option {
                background: #1e1f22;
                color: #ffffff;
            }
            .${scopeClass} .label {
                font-weight: 600;
                margin-bottom: 6px;
                color: #ffffff;
            }
            .${scopeClass} .row {
                margin-bottom: 12px;
            }
            .${scopeClass} .hint {
                opacity: 0.85;
                font-size: 12px;
                margin-top: 6px;
                color: #ffffff;
            }
            .${scopeClass} .title {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 12px;
                color: #ffffff;
            }
        `;
        container.appendChild(style);

        const GuildStore = Webpack.getModule(m => m?.getGuilds && m?.getGuild);
        const serverOptions = () =>
            Object.values(GuildStore?.getGuilds?.() || {}).map(g => ({ label: g.name, value: g.id }));

        const build = () => {
            container.innerHTML = "";
            container.appendChild(style);

            const title = document.createElement("div");
            title.className = "title";
            title.textContent = "BTStartup Settings";
            container.appendChild(title);

            const row = (label, node, note) => {
                const wrap = document.createElement("div");
                wrap.className = "row";

                const lab = document.createElement("div");
                lab.className = "label";
                lab.textContent = label;
                wrap.appendChild(lab);

                wrap.appendChild(node);

                if (note) {
                    const hint = document.createElement("div");
                    hint.className = "hint";
                    hint.textContent = note;
                    wrap.appendChild(hint);
                }
                container.appendChild(wrap);
            };

            // Server dropdown
            const serverSelect = document.createElement("select");
            const options = serverOptions();
            if (!options.length) {
                const opt = document.createElement("option");
                opt.value = "";
                opt.text = "No servers";
                serverSelect.appendChild(opt);
                        } else {
                const placeholder = document.createElement("option");
                placeholder.value = "";
                placeholder.text = "Select a server…";
                serverSelect.appendChild(placeholder);
                for (const o of options) {
                    const opt = document.createElement("option");
                    opt.value = o.value;
                    opt.text = o.label;
                    if (o.value === (this.settings.channelServerId || "").trim()) opt.selected = true;
                    serverSelect.appendChild(opt);
                }
            }

            serverSelect.addEventListener("change", () => {
                this.settings.channelServerId = serverSelect.value;
                this.saveSettings();
                build(); // live refresh UI
            });
            row("Server", serverSelect, "Server containing the startup text channel");

            // Text Channel ID field
            const textInput = document.createElement("input");
            textInput.type = "text";
            textInput.placeholder = "Text Channel ID";
            textInput.value = this.settings.channelChannelId || "";
            textInput.addEventListener("input", () => {
                this.settings.channelChannelId = textInput.value.trim();
                this.saveSettings();
            });
            row("Text Channel ID", textInput, "Paste the text channel ID to open on startup");

            // Voice Channel ID field
            const voiceInput = document.createElement("input");
            voiceInput.type = "text";
            voiceInput.placeholder = "Voice Channel ID";
            voiceInput.value = this.settings.voiceChannelId || "";
            voiceInput.addEventListener("input", () => {
                this.settings.voiceChannelId = voiceInput.value.trim();
                this.saveSettings();
            });
            row("Voice Channel ID (optional)", voiceInput, "If set, will attempt to auto-join after startup");
        };

        build();
        return container;
    }
}

module.exports = BTStartup;
