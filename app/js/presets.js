// NekoAudio - Presets Manager (Full with fixed Lo-Fi)

export class Presets {
    constructor(effects, ui, trackManager, timeline) {
        this.effects = effects;
        this.ui = ui;
        this.trackManager = trackManager;
        this.timeline = timeline;
        this.userPresets = this.loadUserPresets();
        this.setupPresetButtons();
        this.loadUserPresetButtons();
        this.setupPresetManager();
    }

    getPresets() {
        return {
            clean: {
                speed: 1.0, pitch: 0, reverb: 0, delay: 0, delayFeedback: 0,
                lowpass: 20000, highpass: 20, bandpass: 1000, notch: 1000, resonance: 1,
                distortion: 0, bitcrush: 0, ringmod: 0, noisegate: 0, downsample: 44,
                chorus: 0, flanger: 0, phaser: 0, tremolo: 0, vibrato: 0, autopan: 0,
                stutter: 0, robotvoice: 0, compressor: 0, stereowidth: 100, volume: 100
            },
            slowed: {
                speed: 0.75, pitch: -1, reverb: 15, delay: 0, delayFeedback: 0,
                lowpass: 20000, highpass: 20, bandpass: 1000, notch: 1000, resonance: 1,
                distortion: 0, bitcrush: 0, ringmod: 0, noisegate: 0, downsample: 44,
                chorus: 0, flanger: 0, phaser: 0, tremolo: 0, vibrato: 0, autopan: 0,
                stutter: 0, robotvoice: 0, compressor: 0, stereowidth: 100, volume: 90
            },
            interlude: {
                speed: 0.73, pitch: -2, reverb: 72, delay: 30, delayFeedback: 28,
                lowpass: 3800, highpass: 45, bandpass: 1000, notch: 1000, resonance: 1,
                distortion: 0, bitcrush: 0, ringmod: 0, noisegate: 0, downsample: 44,
                chorus: 0, flanger: 0, phaser: 0, tremolo: 0, vibrato: 0, autopan: 0,
                stutter: 0, robotvoice: 0, compressor: 0, stereowidth: 100, volume: 80
            },
            reverb: {
                speed: 1.0, pitch: 0, reverb: 70, delay: 20, delayFeedback: 0,
                lowpass: 12000, highpass: 20, bandpass: 1000, notch: 1000, resonance: 1,
                distortion: 0, bitcrush: 0, ringmod: 0, noisegate: 0, downsample: 44,
                chorus: 0, flanger: 0, phaser: 0, tremolo: 0, vibrato: 0, autopan: 0,
                stutter: 0, robotvoice: 0, compressor: 0, stereowidth: 100, volume: 85
            },
            lofi: {
                speed: 0.94, pitch: 0, reverb: 18, delay: 0, delayFeedback: 0,
                lowpass: 6500, highpass: 60, bandpass: 1000, notch: 1000, resonance: 0.8,
                distortion: 5, bitcrush: 12, ringmod: 0, noisegate: 0, downsample: 44,
                chorus: 0, flanger: 0, phaser: 0, tremolo: 3, vibrato: 0, autopan: 0,
                stutter: 0, robotvoice: 0, compressor: 6, stereowidth: 90, volume: 85
            },
            dream: {
                speed: 0.82, pitch: -3, reverb: 85, delay: 55, delayFeedback: 30,
                lowpass: 5000, highpass: 30, bandpass: 1000, notch: 1000, resonance: 1,
                distortion: 0, bitcrush: 0, ringmod: 0, noisegate: 0, downsample: 44,
                chorus: 35, flanger: 20, phaser: 25, tremolo: 0, vibrato: 15, autopan: 30,
                stutter: 0, robotvoice: 0, compressor: 0, stereowidth: 120, volume: 78
            },
            '8d': {
                speed: 1.0, pitch: 0, reverb: 65, delay: 30, delayFeedback: 20,
                lowpass: 8000, highpass: 20, bandpass: 1000, notch: 1000, resonance: 1,
                distortion: 0, bitcrush: 0, ringmod: 0, noisegate: 0, downsample: 44,
                chorus: 0, flanger: 0, phaser: 0, tremolo: 0, vibrato: 0, autopan: 100,
                stutter: 0, robotvoice: 0, compressor: 0, stereowidth: 160, volume: 80
            }
        };
    }

    setupPresetButtons() {
        const presetBtns = document.querySelectorAll('.preset-btn[data-preset]');
        presetBtns.forEach(btn => {
            const presetName = btn.dataset.preset;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const presets = this.getPresets();
                if (presets[presetName]) {
                    this.effects.applyPreset(presets[presetName]);
                    if (this.ui && this.ui.updateEffectsUI) this.ui.updateEffectsUI();
                }
            });
        });
    }

    saveUserPreset(name) {
        if (!name) return;
        const sessionData = {
            name: name,
            tracks: this.trackManager.getTrackState(),
            timeline: this.timeline.exportTimelineState(),
            effects: this.effects.getCurrentParams(),
            masterVolume: this.trackManager.getMasterVolume(),
            timestamp: Date.now()
        };
        this.userPresets[name] = sessionData;
        localStorage.setItem('nekoaudio_user_presets', JSON.stringify(this.userPresets));
        this.addUserPresetButton(name);
    }

    loadUserPreset(name) {
        const session = this.userPresets[name];
        if (!session) return;
        const tracks = this.trackManager.getAllTracks();
        for (let i = tracks.length - 1; i >= 1; i--) this.trackManager.removeTrack(tracks[i].id);
        if (session.tracks && session.tracks.length > 0) {
            const firstTrack = this.trackManager.getTrackByIndex(0);
            if (firstTrack) {
                this.trackManager.renameTrack(firstTrack.id, session.tracks[0].name);
                this.trackManager.setTrackVolume(firstTrack.id, session.tracks[0].volume);
                this.trackManager.setTrackPan(firstTrack.id, session.tracks[0].pan);
            }
            for (let i = 1; i < session.tracks.length; i++) {
                const t = session.tracks[i];
                const newTrack = this.trackManager.createTrack(t.name);
                this.trackManager.setTrackVolume(newTrack.id, t.volume);
                this.trackManager.setTrackPan(newTrack.id, t.pan);
            }
        }
        if (session.timeline) this.timeline.importTimelineState(session.timeline, {});
        if (session.effects) this.effects.applyPreset(session.effects);
        if (session.masterVolume !== undefined) this.trackManager.setMasterVolume(session.masterVolume);
        this.ui.renderAllTracks();
        this.ui.renderTimeline();
        if (this.ui.updateEffectsUI) this.ui.updateEffectsUI();
    }

    deleteUserPreset(name) {
        if (this.userPresets[name]) {
            delete this.userPresets[name];
            localStorage.setItem('nekoaudio_user_presets', JSON.stringify(this.userPresets));
            this.refreshUserPresetsList();
        }
    }

    exportPreset(name) {
        const preset = this.userPresets[name];
        if (!preset) return;
        const dataStr = JSON.stringify(preset, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/[^a-z0-9]/gi, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importPreset(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const session = JSON.parse(e.target.result);
                if (session.name && session.tracks) {
                    this.userPresets[session.name] = session;
                    localStorage.setItem('nekoaudio_user_presets', JSON.stringify(this.userPresets));
                    this.addUserPresetButton(session.name);
                    this.refreshUserPresetsList();
                }
            } catch (err) { console.error('Invalid preset file'); }
        };
        reader.readAsText(file);
    }

    exportAllPresets() {
        const dataStr = JSON.stringify(this.userPresets, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nekoaudio_all_sessions.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    loadUserPresets() {
        const saved = localStorage.getItem('nekoaudio_user_presets');
        return saved ? JSON.parse(saved) : {};
    }

    addUserPresetButton(name) {
        const container = document.getElementById('userPresetsList');
        if (!container) return;
        if (container.querySelector(`.preset-item[data-preset-name="${name}"]`)) return;
        const presetItem = document.createElement('div');
        presetItem.className = 'preset-item';
        presetItem.dataset.presetName = name;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'preset-item-name';
        nameSpan.textContent = name;
        nameSpan.addEventListener('click', () => { if (this.userPresets[name]) this.loadUserPreset(name); });
        const btnContainer = document.createElement('div');
        btnContainer.className = 'preset-item-buttons';
        const exportBtn = document.createElement('button');
        exportBtn.textContent = '📤';
        exportBtn.className = 'preset-item-btn';
        exportBtn.addEventListener('click', (e) => { e.stopPropagation(); this.exportPreset(name); });
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.className = 'preset-item-btn';
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteUserPreset(name); });
        btnContainer.appendChild(exportBtn);
        btnContainer.appendChild(deleteBtn);
        presetItem.appendChild(nameSpan);
        presetItem.appendChild(btnContainer);
        container.appendChild(presetItem);
    }

    loadUserPresetButtons() {
        for (const name of Object.keys(this.userPresets)) this.addUserPresetButton(name);
    }

    refreshUserPresetsList() {
        const container = document.getElementById('userPresetsList');
        if (container) { container.innerHTML = ''; this.loadUserPresetButtons(); }
    }

    setupPresetManager() {
        const saveUserPresetBtn = document.getElementById('saveUserPresetBtn');
        const newPresetNameInput = document.getElementById('newPresetName');
        const importPresetBtn = document.getElementById('importPresetBtn');
        const exportAllPresetsBtn = document.getElementById('exportAllPresetsBtn');
        if (saveUserPresetBtn && newPresetNameInput) {
            saveUserPresetBtn.addEventListener('click', () => {
                const name = newPresetNameInput.value.trim();
                if (name) { this.saveUserPreset(name); newPresetNameInput.value = ''; }
            });
        }
        if (importPresetBtn) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'application/json';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
            importPresetBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => { if (e.target.files[0]) this.importPreset(e.target.files[0]); fileInput.value = ''; });
        }
        if (exportAllPresetsBtn) exportAllPresetsBtn.addEventListener('click', () => this.exportAllPresets());
    }
}
