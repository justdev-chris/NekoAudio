// NekoAudio - Main Entry Point

import { AudioEngine } from './audio-engine.js';
import { TrackManager } from './track-manager.js';
import { Timeline } from './timeline.js';
import { DragDropHandler } from './drag-drop-handler.js';
import { ExportRangeManager } from './export-range.js';
import { MasterMeter } from './meter-component.js';
import { EffectsProcessor } from './effects.js';
import { UI } from './ui.js';
import { Presets } from './presets.js';
import { playRandomMeow } from './meow.js';
import { Mixer } from './mixer.js';

let audioEngine;
let trackManager;
let timeline;
let mixer;
let dragDropHandler;
let exportManager;
let masterMeter;
let effects;
let ui;
let presets;

let playBtn, pauseBtn, stopBtn, loopBtn, masterVolume, volumePercent;
let addTrackBtn, exportBtn, exportFullBtn, exportSelectionBtn, exportStart, exportEnd;
let fxDrawerBtn, closeDrawerBtn, fxDrawer, presetManagerBtn;
let timelineCanvas, timelinePlayhead, trackList;
let statusMsg;

async function init() {
    console.log('[INIT] Starting...');
    
    audioEngine = new AudioEngine();
    await audioEngine.init();
    console.log('[INIT] AudioEngine initialized');
    
    trackManager = new TrackManager(audioEngine.getContext(), audioEngine);
    
    timeline = new Timeline(trackManager, audioEngine.getContext());
    mixer = new Mixer(audioEngine.getContext(), trackManager, timeline);
    dragDropHandler = new DragDropHandler(timeline, trackManager, audioEngine, null);
    exportManager = new ExportRangeManager(audioEngine.getContext(), trackManager, timeline);
    effects = new EffectsProcessor(audioEngine, trackManager);
    ui = new UI(audioEngine, effects, trackManager, timeline);
    presets = new Presets(effects, ui, trackManager, timeline);
    
    // Make available globally for debugging
    window.audioEngine = audioEngine;
    window.trackManager = trackManager;
    window.timeline = timeline;
   
    window.mixer = mixer;
    window.ui = ui;
    window.effects = effects;
    
    const masterMeterContainer = document.getElementById('masterMeter');
    if (masterMeterContainer) {
        masterMeter = new MasterMeter(masterMeterContainer, trackManager);
    }
    
    trackManager.onTrackAdded = (track, index) => {
        ui.addTrackToUI(track, index);
        updateFxTrackSelector();
        updateActiveTrackSelect();
    };
    
    trackManager.onTrackRemoved = (trackId, index) => {
        ui.removeTrackFromUI(trackId);
        updateFxTrackSelector();
        updateActiveTrackSelect();
    };
    
    trackManager.onTrackUpdated = (track) => {
        ui.updateTrackUI(track);
        updateActiveTrackSelect();
    };
    
    timeline.onClipsChanged = () => {
        ui.renderTimeline();
    };
    
    timeline.onTimelineUpdate = (time) => {
        updatePlayheadPosition(time);
        updateTimeDisplay(time);
    };
    
    setupDOMReferences();
    setupTimelineSeek();
    setupEventListeners();
    setupKeyboardShortcuts();
    
    ui.renderAllTracks();
    ui.renderTimeline();
    updateFxTrackSelector();
    updateActiveTrackSelect();
    
    await audioEngine.audioContext.resume();
    
    statusMsg.textContent = 'Ready — select a track, then load audio';
    console.log('[INIT] Complete');
}

function setupDOMReferences() {
    playBtn = document.getElementById('playBtn');
    pauseBtn = document.getElementById('pauseBtn');
    stopBtn = document.getElementById('stopBtn');
    loopBtn = document.getElementById('loopBtn');
    masterVolume = document.getElementById('masterVolume');
    volumePercent = document.getElementById('volumePercent');
    addTrackBtn = document.getElementById('addTrackBtn');
    exportBtn = document.getElementById('exportBtn');
    exportFullBtn = document.getElementById('exportFullBtn');
    exportSelectionBtn = document.getElementById('exportSelectionBtn');
    exportStart = document.getElementById('exportStart');
    exportEnd = document.getElementById('exportEnd');
    fxDrawerBtn = document.getElementById('fxDrawerBtn');
    closeDrawerBtn = document.getElementById('closeDrawerBtn');
    fxDrawer = document.getElementById('fxDrawer');
    presetManagerBtn = document.getElementById('presetManagerBtn');
    timelineCanvas = document.getElementById('timelineCanvas');
    timelinePlayhead = document.getElementById('timelinePlayhead');
    trackList = document.getElementById('trackList');
    statusMsg = document.getElementById('statusMsg');
}

function setupTimelineSeek() {
    const canvas = document.getElementById('timelineCanvas');
    if (!canvas) return;
    
    canvas.style.cursor = 'pointer';
    
    canvas.addEventListener('click', (e) => {
        if (!audioEngine) return;
        
        const rect = canvas.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const duration = audioEngine.getDuration();
        if (duration <= 0) return;
        
        const seekTime = percent * duration;
        audioEngine.seek(seekTime);
        
        const leftPercent = `${percent * 100}%`;
        const timelinePlayhead = document.getElementById('timelinePlayhead');
        const waveformPlayhead = document.getElementById('playhead');
        if (timelinePlayhead) timelinePlayhead.style.left = leftPercent;
        if (waveformPlayhead) waveformPlayhead.style.left = leftPercent;
        
        updateTimeDisplay(seekTime);
    });
}

function updatePlayheadPosition(time) {
    const duration = audioEngine.getDuration();
    if (duration > 0) {
        let percent = (time / duration) * 100;
        percent = Math.min(100, Math.max(0, percent));
        
        const timelinePlayhead = document.getElementById('timelinePlayhead');
        const waveformPlayhead = document.getElementById('playhead');
        if (timelinePlayhead) timelinePlayhead.style.left = `${percent}%`;
        if (waveformPlayhead) waveformPlayhead.style.left = `${percent}%`;
    }
}

function updateActiveTrackSelect() {
    const select = document.getElementById('activeTrackSelect');
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="master">Master (global effects)</option>';
    
    trackManager.getAllTracks().forEach(track => {
        const option = document.createElement('option');
        option.value = track.id;
        option.textContent = `${track.name} (load audio here)`;
        select.appendChild(option);
    });
    
    if (currentValue && Array.from(select.options).some(opt => opt.value == currentValue)) {
        select.value = currentValue;
    }
}

function setupEventListeners() {
    // Play button - plays ALL tracks
    if (playBtn) {
        playBtn.addEventListener('click', async () => {
            console.log('[PLAY] Button clicked');
            
            if (audioEngine.audioContext && audioEngine.audioContext.state === 'suspended') {
                await audioEngine.audioContext.resume();
            }
            
            trackManager.playAll();
            
            updateTransportButtons('play');
            statusMsg.textContent = 'Playing';
        });
    }
    
    // Pause button
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            trackManager.pauseAll();
            updateTransportButtons('pause');
            statusMsg.textContent = 'Paused';
        });
    }
    
    // Stop button
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            trackManager.stopAll();
            updateTransportButtons('stop');
            statusMsg.textContent = 'Stopped';
            if (timelinePlayhead) timelinePlayhead.style.left = '0%';
            const currentTimeSpan = document.getElementById('currentTime');
            if (currentTimeSpan) currentTimeSpan.textContent = '0:00';
        });
    }
    
    // Loop button
    if (loopBtn) {
        loopBtn.addEventListener('click', () => {
            const tracks = trackManager.getAllTracks();
            const newLoopState = !audioEngine.loopEnabled;
            audioEngine.loopEnabled = newLoopState;
            tracks.forEach(track => {
                track.loopEnabled = newLoopState;
                if (track.sourceNode) track.sourceNode.loop = newLoopState;
            });
            loopBtn.classList.toggle('active', newLoopState);
        });
    }
    
    // Master volume
    if (masterVolume && volumePercent) {
        masterVolume.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            volumePercent.textContent = val + '%';
            const gainVal = val / 100;
            trackManager.setMasterVolume(gainVal);
            if (audioEngine.masterGain) audioEngine.masterGain.gain.value = gainVal;
        });
    }
    
    // Add track
    if (addTrackBtn) {
        addTrackBtn.addEventListener('click', () => {
            const trackCount = trackManager.getTrackCount();
            trackManager.createTrack(`Track ${trackCount + 1}`);
            statusMsg.textContent = `Added track ${trackCount + 1}`;
            updateActiveTrackSelect();
            updateFxTrackSelector();
        });
    }
    
    // Upload button
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            const trackId = document.getElementById('activeTrackSelect').value;
            
            if (trackId === 'master') {
                alert('Select a track first (not Master)');
                return;
            }
            
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*,video/*';
            input.style.display = 'none';
            document.body.appendChild(input);
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    document.body.removeChild(input);
                    return;
                }
                
                const track = trackManager.getTrack(parseInt(trackId));
                if (!track) {
                    alert('Track not found');
                    document.body.removeChild(input);
                    return;
                }
                
                statusMsg.textContent = `Loading: ${file.name}...`;
                
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const buffer = await audioEngine.decodeAudioData(arrayBuffer);
                    
                    track.setBuffer(buffer);
                    audioEngine.buffer = buffer;
                    timeline.addClip(track.id, buffer, 0, 0, null, file.name);
                    ui.renderTimeline();
                    
                    const canvas = document.getElementById('waveformCanvas');
                    if (canvas && buffer) {
                        const ctx = canvas.getContext('2d');
                        const data = buffer.getChannelData(0);
                        const width = canvas.clientWidth;
                        const height = canvas.clientHeight;
                        canvas.width = width;
                        canvas.height = height;
                        const step = Math.ceil(data.length / width);
                        ctx.fillStyle = '#0a0a10';
                        ctx.fillRect(0, 0, width, height);
                        ctx.beginPath();
                        ctx.strokeStyle = '#ff6d5a';
                        for (let i = 0; i < width; i++) {
                            let min = 1, max = -1;
                            for (let j = 0; j < step; j++) {
                                const idx = i * step + j;
                                if (idx < data.length) {
                                    const val = data[idx];
                                    if (val < min) min = val;
                                    if (val > max) max = val;
                                }
                            }
                            const y1 = (1 + min) * height / 2;
                            const y2 = (1 + max) * height / 2;
                            ctx.beginPath();
                            ctx.moveTo(i, y1);
                            ctx.lineTo(i, y2);
                            ctx.stroke();
                        }
                    }
                    
                    const fileInfo = document.getElementById('fileInfo');
                    const durationSpan = document.getElementById('duration');
                    if (fileInfo) fileInfo.textContent = `${file.name} · ${buffer.duration.toFixed(1)}s → ${track.name}`;
                    if (durationSpan) {
                        const mins = Math.floor(buffer.duration / 60);
                        const secs = Math.floor(buffer.duration % 60);
                        durationSpan.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                    }
                    
                    statusMsg.textContent = `Loaded: ${file.name}`;
                    playRandomMeow();
                } catch (err) {
                    console.error(err);
                    alert('Failed to load audio');
                    statusMsg.textContent = 'Failed to load audio';
                }
                
                document.body.removeChild(input);
            };
            
            input.click();
        });
    }
    
    // Export modal
    if (exportBtn) {
        const modal = document.getElementById('exportModal');
        const closeModal = document.getElementById('closeModalBtn');
        const cancelExport = document.getElementById('cancelExportBtn');
        const confirmExport = document.getElementById('confirmExportBtn');
        const exportFormatSelect = document.getElementById('exportFormat');
        const mp3BitrateSetting = document.getElementById('mp3BitrateSetting');
        
        if (exportFormatSelect && mp3BitrateSetting) {
            exportFormatSelect.addEventListener('change', (e) => {
                mp3BitrateSetting.style.display = e.target.value === 'mp3' ? 'flex' : 'none';
            });
        }
        
        exportBtn.addEventListener('click', () => modal.classList.add('active'));
        if (closeModal) closeModal.addEventListener('click', () => modal.classList.remove('active'));
        if (cancelExport) cancelExport.addEventListener('click', () => modal.classList.remove('active'));
        
        if (confirmExport) {
            confirmExport.addEventListener('click', async () => {
                const format = exportFormatSelect?.value || 'wav';
                const bitrate = parseInt(document.getElementById('mp3Bitrate')?.value || 192);
                const normalize = document.getElementById('exportNormalize')?.checked || false;
                
                const title = document.getElementById('metaTitle')?.value || null;
                const artist = document.getElementById('metaArtist')?.value || null;
                const album = document.getElementById('metaAlbum')?.value || null;
                
                const progressContainer = document.getElementById('exportProgressContainer');
                const progressBar = document.getElementById('exportProgress');
                const progressPercent = document.getElementById('exportPercent');
                
                if (progressContainer) progressContainer.style.display = 'flex';
                if (progressBar) progressBar.value = 0;
                if (progressPercent) progressPercent.textContent = '0%';
                
                const modalContent = document.querySelector('.modal-content');
                if (modalContent) modalContent.style.pointerEvents = 'none';
                
                statusMsg.textContent = `Exporting full mix as ${format.toUpperCase()}...`;
                
                const onProgress = (percent) => {
                    if (progressBar) progressBar.value = percent;
                    if (progressPercent) progressPercent.textContent = `${percent}%`;
                    statusMsg.textContent = `Exporting: ${percent}%`;
                };
                
                let blob = null;
                try {
                    blob = await mixer.renderFullMix({
                        startTime: 0,
                        endTime: null,
                        normalize: normalize,
                        format: format,
                        bitrate: bitrate,
                        onProgress: onProgress
                    });
                } catch (err) {
                    console.error('Export error:', err);
                    statusMsg.textContent = 'Export failed: ' + err.message;
                    if (progressContainer) progressContainer.style.display = 'none';
                    if (modalContent) modalContent.style.pointerEvents = '';
                    modal.classList.remove('active');
                    return;
                }
                
                if (progressContainer) progressContainer.style.display = 'none';
                if (modalContent) modalContent.style.pointerEvents = '';
                modal.classList.remove('active');
                
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    let filename = title || 'nekoaudio_mix';
                    filename = filename.replace(/[^a-z0-9]/gi, '_');
                    a.href = url;
                    a.download = `${filename}.${format}`;
                    a.click();
                    URL.revokeObjectURL(url);
                    statusMsg.textContent = 'Export complete!';
                    playRandomMeow();
                } else {
                    statusMsg.textContent = 'Export failed';
                }
            });
        }
    
    // FX Drawer
    if (fxDrawerBtn && closeDrawerBtn && fxDrawer) {
        fxDrawerBtn.addEventListener('click', () => fxDrawer.classList.add('open'));
        closeDrawerBtn.addEventListener('click', () => fxDrawer.classList.remove('open'));
    }
    
    // Preset Manager
    if (presetManagerBtn) {
        const presetDrawer = document.getElementById('presetManagerDrawer');
        const closePreset = document.getElementById('closePresetManagerBtn');
        if (presetDrawer) {
            presetManagerBtn.addEventListener('click', () => presetDrawer.classList.add('open'));
            if (closePreset) closePreset.addEventListener('click', () => presetDrawer.classList.remove('open'));
        }
    }
    
    // Close drawers on outside click
    document.addEventListener('click', (e) => {
        const presetDrawer = document.getElementById('presetManagerDrawer');
        if (presetDrawer?.classList.contains('open')) {
            if (!presetDrawer.contains(e.target) && !presetManagerBtn?.contains(e.target)) {
                presetDrawer.classList.remove('open');
            }
        }
        if (fxDrawer?.classList.contains('open')) {
            if (!fxDrawer.contains(e.target) && !fxDrawerBtn?.contains(e.target)) {
                fxDrawer.classList.remove('open');
            }
        }
    });
}

function updateTransportButtons(action) {
    const play = document.getElementById('playBtn');
    const pause = document.getElementById('pauseBtn');
    if (action === 'play') {
        play?.classList.add('active');
        pause?.classList.remove('active');
    } else if (action === 'pause') {
        pause?.classList.add('active');
        play?.classList.remove('active');
    } else {
        play?.classList.remove('active');
        pause?.classList.remove('active');
    }
}

function updateTimeDisplay(time) {
    const currentSpan = document.getElementById('currentTime');
    if (currentSpan) {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        currentSpan.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

function updateFxTrackSelector() {
    const select = document.getElementById('fxTargetTrack');
    if (!select) return;
    select.innerHTML = '<option value="master">Master</option>';
    trackManager.getAllTracks().forEach(track => {
        const option = document.createElement('option');
        option.value = track.id;
        option.textContent = track.name;
        select.appendChild(option);
    });
}

function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        
        switch (e.key) {
            case ' ': e.preventDefault(); playBtn?.click(); break;
            case 's': case 'S': stopBtn?.click(); break;
            case 'l': case 'L': loopBtn?.click(); break;
            case 't': case 'T': addTrackBtn?.click(); break;
            case 'ArrowLeft': audioEngine?.seek((audioEngine.getCurrentTime() || 0) - 5); break;
            case 'ArrowRight': audioEngine?.seek((audioEngine.getCurrentTime() || 0) + 5); break;
            case 'ArrowUp': 
                if (masterVolume) {
                    masterVolume.value = Math.min(100, parseInt(masterVolume.value) + 5);
                    masterVolume.dispatchEvent(new Event('input'));
                }
                break;
            case 'ArrowDown':
                if (masterVolume) {
                    masterVolume.value = Math.max(0, parseInt(masterVolume.value) - 5);
                    masterVolume.dispatchEvent(new Event('input'));
                }
                break;
        }
    });
}

function updatePlayheadLoop() {
    if (audioEngine && audioEngine.isPlaying) {
        const pos = audioEngine.getCurrentTime();
        updatePlayheadPosition(pos);
        updateTimeDisplay(pos);
    }
    requestAnimationFrame(updatePlayheadLoop);
}

init().catch(console.error);
updatePlayheadLoop();
