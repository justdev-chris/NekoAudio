// NekoAudio - Effects Processor

export class EffectsProcessor {
    constructor(audioEngine, trackManager) {
        this.audioEngine = audioEngine;
        this.trackManager = trackManager;
        this.currentTargetId = 'master';
        this.params = this.getDefaultParams();
        this.motionAnimationId = null;
        this.fourDAnimationId = null;
        this.setupEventListeners();
        this.setupTargetSelector();
        this.setupSpatialControls();
        this.setupMotionPath();
        this.setup4DEffect();
        console.log('EffectsProcessor initialized');
    }

    getDefaultParams() {
        return {
            speed: 1.0, pitch: 0, reverb: 0, delay: 0, delayFeedback: 0,
            lowpass: 20000, highpass: 20, bandpass: 1000, notch: 1000, resonance: 1,
            distortion: 0, bitcrush: 0, ringmod: 0, noisegate: 0, downsample: 44,
            chorus: 0, flanger: 0, phaser: 0, tremolo: 0, vibrato: 0, autopan: 0,
            stutter: 0, robotvoice: 0, compressor: 0, stereowidth: 100, volume: 100,
            posX: 0, posY: 0, posZ: 0, roomSize: 0
        };
    }

    getCurrentParams() { return { ...this.params }; }

    setupTargetSelector() {
        const select = document.getElementById('fxTargetTrack');
        if (select) {
            select.addEventListener('change', (e) => {
                this.currentTargetId = e.target.value;
                this.loadParamsForTarget();
                console.log('FX target changed to:', this.currentTargetId);
            });
        }
    }

    loadParamsForTarget() {
        if (this.currentTargetId === 'master') {
            this.params = { ...this.audioEngine.currentParams };
        } else {
            const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
            if (track) {
                this.params = { ...track.effects };
                if (track.buffer) {
                    this.audioEngine.buffer = track.buffer;
                    this.audioEngine.currentParams = { ...this.audioEngine.currentParams, ...track.effects };
                }
            }
        }
        this.updateAllSliders();
    }

    updateAllSliders() {
        for (const [key, value] of Object.entries(this.params)) {
            const slider = document.getElementById(key);
            if (slider) {
                slider.value = value;
                this.updateDisplayValue(key, value);
            }
        }
    }

    setupSpatialControls() {
        const spatialSliders = ['posX', 'posY', 'posZ', 'roomSize'];
        spatialSliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    const span = document.getElementById(`${id}Val`);
                    if (span) span.textContent = value;
                    
                    if (this.currentTargetId === 'master') {
                        if (this.audioEngine.pannerNode) {
                            if (id === 'posX') this.audioEngine.pannerNode.positionX.value = value;
                            else if (id === 'posY') this.audioEngine.pannerNode.positionY.value = value;
                            else if (id === 'posZ') this.audioEngine.pannerNode.positionZ.value = value;
                        }
                        this.audioEngine.currentParams[id] = value;
                    } else {
                        const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
                        if (track && track.pannerNode) {
                            if (id === 'posX') track.pannerNode.positionX.value = value;
                            else if (id === 'posY') track.pannerNode.positionY.value = value;
                            else if (id === 'posZ') track.pannerNode.positionZ.value = value;
                        }
                        if (track) track.effects[id] = value;
                    }
                    this.params[id] = value;
                });
            }
        });
    }

    setupMotionPath() {
        const startBtn = document.getElementById('startMotionBtn');
        const stopBtn = document.getElementById('stopMotionBtn');
        const pathSelect = document.getElementById('motionPath');
        
        if (startBtn) startBtn.addEventListener('click', () => this.startMotionPath());
        if (stopBtn) stopBtn.addEventListener('click', () => this.stopMotionPath());
        
        if (pathSelect) {
            pathSelect.addEventListener('change', (e) => {
                if (this.currentTargetId !== 'master') {
                    const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
                    if (track) track.effects.motionPath = e.target.value;
                }
            });
        }
    }

    startMotionPath() {
        if (this.motionAnimationId) cancelAnimationFrame(this.motionAnimationId);
        
        const isMaster = this.currentTargetId === 'master';
        let pannerNode = null;
        let path = null;
        
        if (isMaster) {
            if (!this.audioEngine.pannerNode && this.audioEngine.audioContext) {
                this.audioEngine.pannerNode = this.audioEngine.audioContext.createPanner();
                this.audioEngine.pannerNode.panningModel = 'HRTF';
                if (this.audioEngine.gainNode) {
                    this.audioEngine.gainNode.disconnect();
                    this.audioEngine.gainNode.connect(this.audioEngine.pannerNode);
                    this.audioEngine.pannerNode.connect(this.audioEngine.audioContext.destination);
                }
            }
            pannerNode = this.audioEngine.pannerNode;
            path = document.getElementById('motionPath')?.value || 'none';
        } else {
            const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
            if (!track) return;
            path = track.effects.motionPath || 'none';
            if (!track.pannerNode && track.audioContext) {
                track.pannerNode = track.audioContext.createPanner();
                track.pannerNode.panningModel = 'HRTF';
                if (track.gainNode) {
                    track.gainNode.disconnect();
                    track.gainNode.connect(track.pannerNode);
                    track.pannerNode.connect(track.audioContext.destination);
                }
            }
            pannerNode = track.pannerNode;
        }
        
        if (path === 'none' || !pannerNode) return;
        
        let time = 0;
        const animate = () => {
            time += 0.016;
            
            let x = 0, y = 0, z = 0;
            switch(path) {
                case 'circle': x = Math.sin(time) * 3; z = Math.cos(time) * 3; break;
                case 'figure8': x = Math.sin(time) * 3; z = Math.sin(time * 2) * 2; break;
                case 'bounce': y = Math.abs(Math.sin(time)) * 2; break;
                default: return;
            }
            
            if (pannerNode) {
                pannerNode.positionX.value = x;
                pannerNode.positionY.value = y;
                pannerNode.positionZ.value = z;
            }
            
            const updateSlider = (id, val) => {
                const slider = document.getElementById(id);
                const span = document.getElementById(`${id}Val`);
                if (slider) { slider.value = val; if (span) span.textContent = val.toFixed(2); }
            };
            updateSlider('posX', x);
            updateSlider('posY', y);
            updateSlider('posZ', z);
            
            this.motionAnimationId = requestAnimationFrame(animate);
        };
        
        this.motionAnimationId = requestAnimationFrame(animate);
    }

    stopMotionPath() {
        if (this.motionAnimationId) {
            cancelAnimationFrame(this.motionAnimationId);
            this.motionAnimationId = null;
        }
    }

    setup4DEffect() {
        const fourDMode = document.getElementById('fourDMode');
        const startBtn = document.getElementById('start4DBtn');
        const stopBtn = document.getElementById('stop4DBtn');
        
        if (!fourDMode || !startBtn) return;
        
        let savedPos = { posX: 0, posY: 0, posZ: 0 };
        
        const savePos = () => {
            if (this.currentTargetId === 'master') {
                savedPos = {
                    posX: this.audioEngine.currentParams.posX || 0,
                    posY: this.audioEngine.currentParams.posY || 0,
                    posZ: this.audioEngine.currentParams.posZ || 0
                };
            } else {
                const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
                if (track) {
                    savedPos = {
                        posX: track.effects.posX || 0,
                        posY: track.effects.posY || 0,
                        posZ: track.effects.posZ || 0
                    };
                }
            }
        };
        
        const restorePos = () => {
            if (this.currentTargetId === 'master') {
                if (this.audioEngine.pannerNode) {
                    this.audioEngine.pannerNode.positionX.value = savedPos.posX;
                    this.audioEngine.pannerNode.positionY.value = savedPos.posY;
                    this.audioEngine.pannerNode.positionZ.value = savedPos.posZ;
                }
                this.audioEngine.currentParams.posX = savedPos.posX;
                this.audioEngine.currentParams.posY = savedPos.posY;
                this.audioEngine.currentParams.posZ = savedPos.posZ;
            } else {
                const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
                if (track && track.pannerNode) {
                    track.pannerNode.positionX.value = savedPos.posX;
                    track.pannerNode.positionY.value = savedPos.posY;
                    track.pannerNode.positionZ.value = savedPos.posZ;
                }
                if (track) {
                    track.effects.posX = savedPos.posX;
                    track.effects.posY = savedPos.posY;
                    track.effects.posZ = savedPos.posZ;
                }
            }
            
            const updateSlider = (id, val) => {
                const slider = document.getElementById(id);
                const span = document.getElementById(`${id}Val`);
                if (slider) { slider.value = val; if (span) span.textContent = val.toFixed(2); }
            };
            updateSlider('posX', savedPos.posX);
            updateSlider('posY', savedPos.posY);
            updateSlider('posZ', savedPos.posZ);
        };
        
        const getPanner = () => {
            if (this.currentTargetId === 'master') return this.audioEngine.pannerNode;
            const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
            return track?.pannerNode;
        };
        
        let time = 0;
        const animate4D = () => {
            if (!this.fourDAnimationId) return;
            const mode = fourDMode.value;
            if (mode === 'none') {
                cancelAnimationFrame(this.fourDAnimationId);
                this.fourDAnimationId = null;
                return;
            }
            
            time += 0.016;
            let posX = 0, posY = 0, posZ = 0;
            
            switch(mode) {
                case 'tesseract':
                    posX = Math.sin(time * 0.8) * 3;
                    posY = Math.cos(time * 0.6) * 2;
                    posZ = Math.sin(time * 0.7) * 4;
                    break;
                case 'hypersphere':
                    posX = Math.sin(time) * 4;
                    posY = Math.cos(time * 1.3) * 2.5;
                    posZ = Math.cos(time) * 3;
                    break;
                case 'timewarp':
                    posX = Math.sin(time) * 2;
                    posY = Math.sin(time * 2) * 1.5;
                    posZ = Math.sin(time * 1.5) * 3;
                    break;
            }
            
            const panner = getPanner();
            if (panner) {
                panner.positionX.value = posX;
                panner.positionY.value = posY;
                panner.positionZ.value = posZ;
            }
            
            const updateSlider = (id, val) => {
                const slider = document.getElementById(id);
                const span = document.getElementById(`${id}Val`);
                if (slider) { slider.value = val; if (span) span.textContent = val.toFixed(2); }
            };
            updateSlider('posX', posX);
            updateSlider('posY', posY);
            updateSlider('posZ', posZ);
            
            this.fourDAnimationId = requestAnimationFrame(animate4D);
        };
        
        startBtn.addEventListener('click', () => {
            if (this.fourDAnimationId) cancelAnimationFrame(this.fourDAnimationId);
            savePos();
            time = 0;
            this.fourDAnimationId = requestAnimationFrame(animate4D);
        });
        
        stopBtn.addEventListener('click', () => {
            if (this.fourDAnimationId) {
                cancelAnimationFrame(this.fourDAnimationId);
                this.fourDAnimationId = null;
            }
            restorePos();
        });
    }

    setupEventListeners() {
        const sliders = [
            'speed', 'pitch', 'reverb', 'delay', 'delayFeedback',
            'lowpass', 'highpass', 'bandpass', 'notch', 'resonance',
            'distortion', 'bitcrush', 'ringmod', 'noisegate', 'downsample',
            'chorus', 'flanger', 'phaser', 'tremolo', 'vibrato', 'autopan',
            'stutter', 'robotvoice', 'compressor', 'stereowidth', 'volume'
        ];
        
        sliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    this.params[id] = value;
                    this.updateDisplayValue(id, value);
                    this.applyToCurrentTarget(id, value);
                    console.log(`Slider ${id} changed to ${value}`);
                });
            }
        });

        const reverseBtn = document.getElementById('reverseBtn');
        if (reverseBtn) {
            reverseBtn.addEventListener('click', () => {
                if (this.currentTargetId !== 'master') {
                    const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
                    if (track && track.buffer) {
                        this.audioEngine.buffer = track.buffer;
                        this.audioEngine.reverseAudio();
                        track.setBuffer(this.audioEngine.buffer);
                    }
                } else if (this.audioEngine.buffer) {
                    this.audioEngine.reverseAudio();
                }
            });
        }

        const tapeStopBtn = document.getElementById('tapestopBtn');
        if (tapeStopBtn) {
            tapeStopBtn.addEventListener('click', () => {
                if (this.currentTargetId !== 'master') {
                    const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
                    if (track && track.sourceNode && track.isPlaying) {
                        this.audioEngine.tapeStop();
                    }
                } else {
                    this.audioEngine.tapeStop();
                }
            });
        }

        const normalizeBtn = document.getElementById('normalizeBtn');
        if (normalizeBtn) {
            normalizeBtn.addEventListener('click', () => {
                if (this.currentTargetId !== 'master') {
                    const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
                    if (track && track.buffer) {
                        this.audioEngine.buffer = track.buffer;
                        this.audioEngine.normalizeAudio();
                        track.setBuffer(this.audioEngine.buffer);
                    }
                } else if (this.audioEngine.buffer) {
                    this.audioEngine.normalizeAudio();
                }
            });
        }
        
        const resetBtn = document.getElementById('resetEffectsBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetEffects());
        }
    }

    ensurePannerExists() {
        if (this.currentTargetId === 'master') {
            if (!this.audioEngine.pannerNode && this.audioEngine.audioContext) {
                this.audioEngine.pannerNode = this.audioEngine.audioContext.createPanner();
                this.audioEngine.pannerNode.panningModel = 'HRTF';
                if (this.audioEngine.gainNode) {
                    this.audioEngine.gainNode.disconnect();
                    this.audioEngine.gainNode.connect(this.audioEngine.pannerNode);
                    this.audioEngine.pannerNode.connect(this.audioEngine.audioContext.destination);
                }
            }
        } else {
            const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
            if (track && !track.pannerNode && track.audioContext) {
                track.pannerNode = track.audioContext.createPanner();
                track.pannerNode.panningModel = 'HRTF';
                if (track.gainNode) {
                    track.gainNode.disconnect();
                    track.gainNode.connect(track.pannerNode);
                    track.pannerNode.connect(track.audioContext.destination);
                }
            }
        }
    }
    
    resetEffects() {
        const defaultParams = this.getDefaultParams();
    
        const reconnectPanner = (gainNode, pannerNode, audioContext) => {
            if (!gainNode || !audioContext) return;
    
            try {
                gainNode.disconnect();
            } catch(e) {}
    
            try {
                if (pannerNode) pannerNode.disconnect();
            } catch(e) {}
    
            if (!pannerNode) {
                pannerNode = audioContext.createPanner();
                pannerNode.panningModel = "HRTF";
            }
    
            gainNode.connect(pannerNode);
            pannerNode.connect(audioContext.destination);
    
            return pannerNode;
        };
    
        if (this.currentTargetId === "master") {
            this.audioEngine.currentParams = { ...defaultParams };
            this.audioEngine.updateEffects(defaultParams);
            this.params = { ...defaultParams };
    
            if (this.audioEngine.pannerNode) {
                this.audioEngine.pannerNode.positionX.value = 0;
                this.audioEngine.pannerNode.positionY.value = 0;
                this.audioEngine.pannerNode.positionZ.value = 0;
            }
    
            this.audioEngine.pannerNode = reconnectPanner(
                this.audioEngine.gainNode,
                this.audioEngine.pannerNode,
                this.audioEngine.audioContext
            );
    
        } else {
            const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
            if (track) {
                track.effects = { ...defaultParams };
                track.updateEffects(defaultParams);
                this.params = { ...defaultParams };
    
                if (track.pannerNode) {
                    track.pannerNode.positionX.value = 0;
                    track.pannerNode.positionY.value = 0;
                    track.pannerNode.positionZ.value = 0;
                }
    
                track.pannerNode = reconnectPanner(
                    track.gainNode,
                    track.pannerNode,
                    track.audioContext
                );
    
                if (track.buffer === this.audioEngine.buffer) {
                    this.audioEngine.currentParams = { ...defaultParams };
                    this.audioEngine.updateEffects(defaultParams);
                }
            }
        }
    
        this.stopMotionPath();
        if (this.fourDAnimationId) {
            cancelAnimationFrame(this.fourDAnimationId);
            this.fourDAnimationId = null;
        }
    
        this.updateAllSliders();
        console.log("Effects reset for:", this.currentTargetId);
    }

    applyToCurrentTarget(param, value) {
        if (this.currentTargetId === 'master') {
            this.audioEngine.updateEffects({ [param]: value });
        } else {
            const track = this.trackManager.getTrack(parseInt(this.currentTargetId));
            if (track) {
                track.updateEffectParam(param, value);
                if (track.buffer === this.audioEngine.buffer) {
                    this.audioEngine.updateEffects({ [param]: value });
                }
            }
        }
    }

    updateDisplayValue(id, val) {
        const span = document.getElementById(`${id}Val`);
        if (!span) return;
        if (id === 'speed') span.textContent = parseFloat(val).toFixed(2) + 'x';
        else if (id === 'pitch') span.textContent = Math.round(val) + ' st';
        else if (['lowpass', 'highpass', 'bandpass', 'notch'].includes(id)) span.textContent = Math.round(val) + ' Hz';
        else if (id === 'downsample') span.textContent = Math.round(val) + ' kHz';
        else span.textContent = Math.round(val) + '%';
    }

    applyPreset(presetValues) {
        console.log('Applying preset:', presetValues);
        for (const [key, value] of Object.entries(presetValues)) {
            if (this.params.hasOwnProperty(key)) {
                this.params[key] = value;
                const slider = document.getElementById(key);
                if (slider) slider.value = value;
                this.updateDisplayValue(key, value);
            }
        }
        for (const [key, value] of Object.entries(presetValues)) {
            this.applyToCurrentTarget(key, value);
        }
    }
}
