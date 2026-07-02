// NekoAudio - UI Controller (Multi-Track Version)

export class UI {
    constructor(audioEngine, effects, trackManager, timeline) {
        this.audioEngine = audioEngine;
        this.effects = effects;
        this.trackManager = trackManager;
        this.timeline = timeline;
        
        this.trackElements = new Map();
        this.clipElements = new Map();
        
        this.setupTabSwitching();
        this.setupExportModal();
        this.setupSpatialControls();
        this.setupFxTargetSelector();
        
        this.renderAllTracks();
        this.renderTimeline();
    }

    setupTabSwitching() {
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const activeContent = document.getElementById(`tab-${tabId}`);
                if (activeContent) activeContent.classList.add('active');
            });
        });
    }

    setupExportModal() {
        const exportBtn = document.getElementById('exportBtn');
        const exportModal = document.getElementById('exportModal');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const cancelExportBtn = document.getElementById('cancelExportBtn');
        const exportFormatSelect = document.getElementById('exportFormat');
        const mp3BitrateSetting = document.getElementById('mp3BitrateSetting');
        
        if (exportBtn && exportModal) {
            exportBtn.addEventListener('click', () => exportModal.classList.add('active'));
        }
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => exportModal.classList.remove('active'));
        }
        if (cancelExportBtn) {
            cancelExportBtn.addEventListener('click', () => exportModal.classList.remove('active'));
        }
        if (exportFormatSelect && mp3BitrateSetting) {
            exportFormatSelect.addEventListener('change', (e) => {
                mp3BitrateSetting.style.display = e.target.value === 'mp3' ? 'flex' : 'none';
            });
        }
    }

    setupSpatialControls() {
        const posX = document.getElementById('posX');
        const posY = document.getElementById('posY');
        const posZ = document.getElementById('posZ');
        const roomSize = document.getElementById('roomSize');
        const startMotionBtn = document.getElementById('startMotionBtn');
        const stopMotionBtn = document.getElementById('stopMotionBtn');
        
        if (posX) {
            posX.addEventListener('input', (e) => {
                document.getElementById('posXVal').textContent = e.target.value;
            });
        }
        if (posY) {
            posY.addEventListener('input', (e) => {
                document.getElementById('posYVal').textContent = e.target.value;
            });
        }
        if (posZ) {
            posZ.addEventListener('input', (e) => {
                document.getElementById('posZVal').textContent = e.target.value;
            });
        }
        if (roomSize) {
            roomSize.addEventListener('input', (e) => {
                document.getElementById('roomSizeVal').textContent = e.target.value + '%';
            });
        }
    }

    setupFxTargetSelector() {
        const select = document.getElementById('fxTargetTrack');
        if (!select) return;
        
        select.addEventListener('change', (e) => {
            const targetId = e.target.value;
            const trackName = targetId === 'master' ? 'Master' : this.trackManager.getTrack(parseInt(targetId))?.name;
            const headerSpan = document.querySelector('#fxDrawer .drawer-header span');
            if (headerSpan) {
                headerSpan.innerHTML = `🎛️ EFFECTS RACK <span style="font-size:11px">(${trackName || 'Master'})</span>`;
            }
        });
    }

    renderAllTracks() {
        const trackList = document.getElementById('trackList');
        if (!trackList) return;
        
        trackList.innerHTML = '';
        this.trackElements.clear();
        
        const tracks = this.trackManager.getAllTracks();
        tracks.forEach((track, idx) => {
            this.addTrackToUI(track, idx);
        });
        
        this.updateFxTrackSelector();
    }

    addTrackToUI(track, index) {
        const trackList = document.getElementById('trackList');
        if (!trackList) return;
        
        const trackDiv = document.createElement('div');
        trackDiv.className = 'track-strip';
        trackDiv.dataset.trackId = track.id;
        trackDiv.dataset.trackIndex = index;
        
        trackDiv.innerHTML = `
            <div class="track-info">
                <input type="text" class="track-name" value="${track.name}" data-track-id="${track.id}">
            </div>
            <div class="track-controls">
                <button class="track-btn mute" data-track-id="${track.id}" data-action="mute">${track.muted ? '🔇 MUTE' : '🎤 MUTE'}</button>
                <button class="track-btn solo" data-track-id="${track.id}" data-action="solo">${track.soloed ? '⭐ SOLO' : '☆ SOLO'}</button>
                <input type="range" class="track-volume" data-track-id="${track.id}" data-action="volume" min="0" max="100" value="${track.volume * 100}">
                <div class="track-meter" data-track-id="${track.id}" data-meter="true"></div>
                <button class="track-btn delete" data-track-id="${track.id}" data-action="delete">🗑️</button>
            </div>
        `;
        
        const nameInput = trackDiv.querySelector('.track-name');
        nameInput.addEventListener('change', (e) => {
            this.trackManager.renameTrack(track.id, e.target.value);
        });
        
        const muteBtn = trackDiv.querySelector('.track-btn.mute');
        muteBtn.addEventListener('click', () => {
            this.trackManager.muteTrack(track.id);
            this.updateTrackUI(track);
        });
        
        const soloBtn = trackDiv.querySelector('.track-btn.solo');
        soloBtn.addEventListener('click', () => {
            this.trackManager.soloTrack(track.id);
            this.renderAllTracks();
        });
        
        const volumeSlider = trackDiv.querySelector('.track-volume');
        volumeSlider.addEventListener('input', (e) => {
            this.trackManager.setTrackVolume(track.id, parseInt(e.target.value) / 100);
        });
        
        const deleteBtn = trackDiv.querySelector('.track-btn.delete');
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Delete ${track.name}?`)) {
                this.trackManager.removeTrack(track.id);
                this.renderAllTracks();
                this.renderTimeline();
            }
        });
        
        trackList.appendChild(trackDiv);
        this.trackElements.set(track.id, trackDiv);
        
        const meterContainer = trackDiv.querySelector('.track-meter');
        if (meterContainer) {
            meterContainer.style.background = '#2a2a35';
            meterContainer.style.borderRadius = '3px';
        }
    }

    updateTrackUI(track) {
        const trackDiv = this.trackElements.get(track.id);
        if (!trackDiv) return;
        
        const muteBtn = trackDiv.querySelector('.track-btn.mute');
        const soloBtn = trackDiv.querySelector('.track-btn.solo');
        const volumeSlider = trackDiv.querySelector('.track-volume');
        
        if (muteBtn) muteBtn.textContent = track.muted ? '🔇 MUTE' : '🎤 MUTE';
        if (soloBtn) soloBtn.textContent = track.soloed ? '⭐ SOLO' : '☆ SOLO';
        if (volumeSlider) volumeSlider.value = track.volume * 100;
    }

    removeTrackFromUI(trackId) {
        const trackDiv = this.trackElements.get(trackId);
        if (trackDiv) {
            trackDiv.remove();
            this.trackElements.delete(trackId);
        }
    }

    updateFxTrackSelector() {
        const select = document.getElementById('fxTargetTrack');
        if (!select) return;
        
        const currentValue = select.value;
        select.innerHTML = '<option value="master">Master</option>';
        
        const tracks = this.trackManager.getAllTracks();
        tracks.forEach(track => {
            const option = document.createElement('option');
            option.value = track.id;
            option.textContent = track.name;
            select.appendChild(option);
        });
        
        if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        }
    }

    renderTimeline() {
        const canvas = document.getElementById('timelineCanvas');
        if (!canvas) return;
        
        const tracks = this.trackManager.getAllTracks();
        const trackHeight = 70;
        const height = Math.max(200, tracks.length * trackHeight);
        
        canvas.width = canvas.parentElement?.clientWidth || 1000;
        canvas.height = Math.max(200, tracks.length * 70);
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, height);
        
        // Draw track backgrounds
        tracks.forEach((track, i) => {
            const y = i * trackHeight;
            ctx.fillStyle = i % 2 === 0 ? '#1a1a2e' : '#222';
            ctx.fillRect(0, y, canvas.width, trackHeight);
            ctx.fillStyle = '#aaa';
            ctx.font = '12px monospace';
            ctx.fillText(track.name, 5, y + 20);
        });
        
        // Draw clips
        const viewStart = this.timeline.viewStart;
        const viewEnd = this.timeline.viewEnd;
        const viewDuration = viewEnd - viewStart;
        
        if (viewDuration > 0) {
            for (const [trackId, clips] of this.timeline.clips) {
                const trackIndex = tracks.findIndex(t => t.id === trackId);
                if (trackIndex === -1) continue;
                
                const y = trackIndex * trackHeight;
                
                for (const clip of clips) {
                    if (clip.timelineEnd < viewStart || clip.timelineStart > viewEnd) continue;
                    
                    const x = ((clip.timelineStart - viewStart) / viewDuration) * canvas.width;
                    const width = ((clip.timelineEnd - clip.timelineStart) / viewDuration) * canvas.width;
                    
                    ctx.fillStyle = clip.color || '#ff6d5a';
                    ctx.fillRect(x, y + 25, width, trackHeight - 30);
                    ctx.strokeStyle = '#fff';
                    ctx.strokeRect(x, y + 25, width, trackHeight - 30);
                    ctx.fillStyle = '#fff';
                    ctx.font = '10px monospace';
                    ctx.fillText(clip.name || 'clip', x + 5, y + 40);
                }
            }
        }
        
        // Draw timeline border
        ctx.strokeStyle = '#333';
        ctx.strokeRect(0, 0, canvas.width, height);
    }

    updateEffectsUI() {
        const params = this.effects.getCurrentParams();
        for (const [key, value] of Object.entries(params)) {
            const slider = document.getElementById(key);
            const span = document.getElementById(`${key}Val`);
            if (slider) {
                slider.value = value;
                if (span) {
                    if (key === 'speed') span.textContent = parseFloat(value).toFixed(2) + 'x';
                    else if (key === 'pitch') span.textContent = Math.round(value) + ' st';
                    else if (['lowpass', 'highpass', 'bandpass', 'notch'].includes(key)) span.textContent = Math.round(value) + ' Hz';
                    else if (key === 'downsample') span.textContent = Math.round(value) + ' kHz';
                    else span.textContent = Math.round(value) + '%';
                }
            }
        }
    }

    updateFileInfo(info) {
        const fileDetailsDiv = document.getElementById('fileDetails');
        if (fileDetailsDiv && info) {
            fileDetailsDiv.textContent = `${info.duration?.toFixed(1)}s · ${info.sampleRate}Hz`;
        }
    }
}
