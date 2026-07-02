// NekoAudio - Track Class
// Each track represents an independent audio channel with its own buffer and effect chain

export class Track {
        constructor(id, index, audioContext, audioEngine) {
        this.id = id;
        this.index = index;
        this.audioContext = audioContext;
        this.audioEngine = audioEngine;   // ✅ FIXED
        
        // Audio nodes
        this.sourceNode = null;
        this.gainNode = null;
        this.panNode = null;
        this.effectsChain = [];
        
        // Buffer data
        this.buffer = null;
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseOffset = 0;
        this.loopEnabled = false;
        
        // Track state
        this.muted = false;
        this.soloed = false;
        this.armed = false;
        this.volume = 0.8;
        this.pan = 0;
        
        // Effect parameters
        this.effects = {
            speed: 1.0,
            pitch: 0,
            reverb: 0,
            delay: 0,
            delayFeedback: 0,
            lowpass: 20000,
            highpass: 20,
            bandpass: 1000,
            notch: 1000,
            resonance: 1,
            distortion: 0,
            bitcrush: 0,
            ringmod: 0,
            noisegate: 0,
            downsample: 44,
            chorus: 0,
            flanger: 0,
            phaser: 0,
            tremolo: 0,
            vibrato: 0,
            autopan: 0,
            stutter: 0,
            robotvoice: 0,
            compressor: 0,
            stereowidth: 100,
            // Spatial effects (work through audio-engine)
            posX: 0,
            posY: 0,
            posZ: 0,
            roomSize: 0,
            motionPath: 'none'
        };
        
        this.initNodes();
    }
    
    initNodes() {
            if (!this.audioContext) return;
            
            // Create gain node
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.volume;
            
            // Create stereo panner
            this.panNode = this.audioContext.createStereoPanner();
            this.panNode.pan.value = this.pan;
            
            // Connect gain → pan
            this.gainNode.connect(this.panNode);
            // Do NOT connect to destination here.
            // play() will handle: panNode → this.audioEngine.masterGain
        }

    
    setBuffer(buffer) {
        this.buffer = buffer;
        this.pauseOffset = 0;
        this.stop();
    }
    
    updateEffectParam(param, value) {
            if (this.effects.hasOwnProperty(param)) {
                this.effects[param] = value;
                // Always rebuild the effect chain to apply changes immediately
                this.rebuildEffectChain();
            }
       }
    
    updateEffects(params) {
        Object.assign(this.effects, params);
        if (this.isPlaying) {
            this.rebuildEffectChain();
        }
    }
    
    play() {
        if (!this.buffer || !this.audioContext) return;
    
        // If track is muted, don't start a source at all
        if (this.muted) return;
    
        // Stop existing source if any
        if (this.sourceNode) {
            try { this.sourceNode.stop(); } catch(e) {}
            this.sourceNode = null;
        }
    
        // Create a NEW source for THIS track
        const source = this.audioContext.createBufferSource();
        source.buffer = this.buffer;
        source.loop = this.loopEnabled;
    
        // Apply pitch/speed
        const pitchFactor = Math.pow(2, (this.effects.pitch || 0) / 12);
        const finalSpeed = (this.effects.speed || 1.0) * pitchFactor;
        source.playbackRate.value = finalSpeed;
    
        // CONNECT SIGNAL CHAIN
        // source → gain → pan → MASTER
        source.connect(this.gainNode);
        this.gainNode.connect(this.panNode);
    
        // IMPORTANT: connect to MASTER, not destination
        this.panNode.connect(this.audioEngine.masterGain);
    
        // Start playback
        const offset = this.pauseOffset % (this.buffer.duration || 1);
        source.start(0, offset);
    
        // Save state
        this.sourceNode = source;
        this.startTime = this.audioContext.currentTime - offset;
        this.isPlaying = true;
    }

    
        rebuildEffectChain() {
            if (!this.buffer || !this.audioContext) return;
            
            // Stop old source if playing
            if (this.sourceNode) {
                try { this.sourceNode.stop(); } catch(e) {}
                this.sourceNode = null;
            }
            
            // Save current playback position
            const wasPlaying = this.isPlaying;
            const currentOffset = this.pauseOffset;
            
            // Create new source
            this.sourceNode = this.audioContext.createBufferSource();
            this.sourceNode.buffer = this.buffer;
            this.sourceNode.loop = this.loopEnabled;
            
            // Apply pitch and speed
            const pitchFactor = Math.pow(2, (this.effects.pitch || 0) / 12);
            const finalSpeed = (this.effects.speed || 1.0) * pitchFactor;
            this.sourceNode.playbackRate.value = finalSpeed;
            
            // Start building effect chain from source
            let currentNode = this.sourceNode;
            
            // ---- DISTORTION ----
            if (this.effects.distortion > 0) {
                const distortion = this.audioContext.createWaveShaper();
                const k = this.effects.distortion / 40;
                const curve = new Float32Array(8192);
                for (let i = 0; i < 8192; i++) {
                    const x = (i - 4096) / 4096;
                    curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
                }
                distortion.curve = curve;
                currentNode.connect(distortion);
                currentNode = distortion;
            }
            
            // ---- BITCRUSH ----
            if (this.effects.bitcrush > 0) {
                const bitcrush = this.audioContext.createWaveShaper();
                const steps = Math.pow(2, 8 - Math.floor(this.effects.bitcrush / 15));
                const curve = new Float32Array(4096);
                for (let i = 0; i < 4096; i++) {
                    const x = (i - 2048) / 2048;
                    curve[i] = Math.round(x * steps) / steps;
                }
                bitcrush.curve = curve;
                currentNode.connect(bitcrush);
                currentNode = bitcrush;
            }
            
            // ---- LOWPASS ----
            if (this.effects.lowpass < 19000) {
                const lowpass = this.audioContext.createBiquadFilter();
                lowpass.type = 'lowpass';
                lowpass.frequency.value = Math.max(300, this.effects.lowpass);
                lowpass.Q.value = this.effects.resonance || 1;
                currentNode.connect(lowpass);
                currentNode = lowpass;
            }
            
            // ---- HIGHPASS ----
            if (this.effects.highpass > 50) {
                const highpass = this.audioContext.createBiquadFilter();
                highpass.type = 'highpass';
                highpass.frequency.value = this.effects.highpass;
                currentNode.connect(highpass);
                currentNode = highpass;
            }
            
            // ---- REVERB ----
            if (this.effects.reverb > 0) {
                const convolver = this.audioContext.createConvolver();
                const irLen = this.audioContext.sampleRate * 2.2;
                const impulse = this.audioContext.createBuffer(2, irLen, this.audioContext.sampleRate);
                for (let c = 0; c < 2; c++) {
                    const ch = impulse.getChannelData(c);
                    for (let i = 0; i < irLen; i++) {
                        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 1.5);
                    }
                }
                convolver.buffer = impulse;
                
                const wet = this.audioContext.createGain();
                wet.gain.value = this.effects.reverb / 100;
                const dry = this.audioContext.createGain();
                dry.gain.value = 1 - (this.effects.reverb / 100);
                
                currentNode.connect(convolver);
                convolver.connect(wet);
                currentNode.connect(dry);
                
                const summer = this.audioContext.createGain();
                wet.connect(summer);
                dry.connect(summer);
                currentNode = summer;
            }
            
            // ---- DELAY ----
            if (this.effects.delay > 0) {
                const delayNode = this.audioContext.createDelay();
                delayNode.delayTime.value = this.effects.delay / 1000;
                const feedback = this.audioContext.createGain();
                feedback.gain.value = (this.effects.delayFeedback || 0) / 100;
                delayNode.connect(feedback);
                feedback.connect(delayNode);
                currentNode.connect(delayNode);
                currentNode = delayNode;
            }
            
            // ---- TREMOLO ----
            if (this.effects.tremolo > 0) {
                const tremoloGain = this.audioContext.createGain();
                const lfo = this.audioContext.createOscillator();
                lfo.frequency.value = 5;
                lfo.type = 'sine';
                const lfoGain = this.audioContext.createGain();
                lfoGain.gain.value = this.effects.tremolo / 100;
                lfo.connect(lfoGain);
                lfoGain.connect(tremoloGain.gain);
                lfo.start();
                currentNode.connect(tremoloGain);
                currentNode = tremoloGain;
            }
            
            // ---- AUTO-PAN ----
            if (this.effects.autopan > 0) {
                const autoPanner = this.audioContext.createStereoPanner();
                const panLFO = this.audioContext.createOscillator();
                panLFO.frequency.value = 0.6;
                panLFO.type = 'sine';
                const panGain = this.audioContext.createGain();
                panGain.gain.value = this.effects.autopan / 100;
                panLFO.connect(panGain);
                panGain.connect(autoPanner.pan);
                panLFO.start();
                currentNode.connect(autoPanner);
                currentNode = autoPanner;
            }
            
            // ---- Connect effect chain to gainNode ----
            currentNode.connect(this.gainNode);
            
            // ---- Ensure gainNode → panNode → masterGain is connected ----
            try { this.gainNode.disconnect(); } catch(e) {}
            try { this.panNode.disconnect(); } catch(e) {}
            
            this.gainNode.connect(this.panNode);
            this.panNode.connect(this.audioEngine.masterGain);
            
            // ---- Start playback if it was playing ----
            if (wasPlaying) {
                const offset = currentOffset % (this.buffer.duration || 1);
                this.sourceNode.start(0, offset);
                this.startTime = this.audioContext.currentTime - offset;
                this.isPlaying = true;
            }
        }
    
    pause() {
        if (!this.isPlaying || !this.sourceNode || !this.audioContext) return;
        this.pauseOffset = this.getCurrentTime();
        this.sourceNode.stop();
        this.sourceNode = null;
        this.isPlaying = false;
    }
    
    stop() {
        if (this.sourceNode) {
            try { this.sourceNode.stop(); } catch(e) {}
            this.sourceNode = null;
        }
        this.isPlaying = false;
        this.pauseOffset = 0;
    }
    
    seek(time) {
        if (!this.buffer) return;
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.pause();
        this.pauseOffset = Math.min(Math.max(time, 0), this.buffer.duration);
        if (wasPlaying) this.play();
    }
    
    getCurrentTime() {
        if (!this.isPlaying || !this.audioContext) return this.pauseOffset;
        const elapsed = this.audioContext.currentTime - this.startTime;
        const pitchFactor = Math.pow(2, (this.effects.pitch || 0) / 12);
        const finalSpeed = (this.effects.speed || 1.0) * pitchFactor;
        const correctedElapsed = elapsed * finalSpeed;
        let position = this.pauseOffset + correctedElapsed;
        const duration = this.buffer ? this.buffer.duration : Infinity;
        if (this.loopEnabled && position >= duration && duration !== Infinity) {
            position = position % duration;
        }
        return Math.min(position, duration);
    }
    
    getDuration() {
        return this.buffer ? this.buffer.duration : 0;
    }
    
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.gainNode) this.gainNode.gain.value = this.volume;
    }
    
    setPan(value) {
        this.pan = Math.max(-1, Math.min(1, value));
        if (this.panNode) this.panNode.pan.value = this.pan;
    }
    
    setMuted(muted) {
        this.muted = muted;
        if (this.muted) {
            if (this.gainNode) this.gainNode.gain.value = 0;
        } else {
            this.setVolume(this.volume);
        }
    }
    
    setSoloed(soloed) {
        this.soloed = soloed;
    }
    
    toggleLoop() {
        this.loopEnabled = !this.loopEnabled;
        if (this.sourceNode) this.sourceNode.loop = this.loopEnabled;
    }
    
    getOutputNode() {
        return this.panNode;
    }
    
    dispose() {
        this.stop();
        if (this.gainNode) this.gainNode.disconnect();
        if (this.panNode) this.panNode.disconnect();
        this.sourceNode = null;
        this.gainNode = null;
        this.panNode = null;
        this.buffer = null;
    }
}
