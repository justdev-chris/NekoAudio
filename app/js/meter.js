// NekoAudio - Volume Meter

export class VolumeMeter {
    constructor(audioEngine, options = {}) {
        this.audioEngine = audioEngine;
        this.analyserNode = null;
        this.dataArray = null;
        this.isRunning = false;
        this.animationId = null;
        
        // Meter settings
        this.smoothing = options.smoothing || 0.8;
        this.updateInterval = options.updateInterval || 30; // ms between updates
        this.lastUpdate = 0;
        
        // Current levels (0-1 range)
        this.leftLevel = 0;
        this.rightLevel = 0;
        this.peakLeft = 0;
        this.peakRight = 0;
        this.clipLeft = false;
        this.clipRight = false;
        
        // Callbacks
        this.onUpdate = options.onUpdate || null;
        
        this.init();
    }
    
    init() {
        if (!this.audioEngine || !this.audioEngine.audioContext) {
            console.warn('Audio engine not ready, waiting for context');
            return;
        }
        
        // Create analyser node
        this.analyserNode = this.audioEngine.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.analyserNode.smoothingTimeConstant = this.smoothing;
        
        // Buffer for time domain data
        const bufferLength = this.analyserNode.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
        
        // Insert analyser into audio chain after gain
        this.connectToChain();
    }
    
    connectToChain() {
        if (!this.analyserNode || !this.audioEngine.gainNode) return;
        
        // Disconnect existing connections to avoid duplicates
        try {
            if (this.audioEngine.gainNode.numberOfOutputs > 0) {
                this.audioEngine.gainNode.disconnect();
            }
        } catch(e) {}
        
        // Insert analyser between gain and destination
        this.audioEngine.gainNode.connect(this.analyserNode);
        this.analyserNode.connect(this.audioEngine.audioContext.destination);
    }
    
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.updateLoop();
    }
    
    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.resetPeaks();
    }
    
    updateLoop() {
        if (!this.isRunning) return;
        
        this.updateLevels();
        
        if (this.onUpdate) {
            this.onUpdate({
                left: this.leftLevel,
                right: this.rightLevel,
                peakLeft: this.peakLeft,
                peakRight: this.peakRight,
                clipLeft: this.clipLeft,
                clipRight: this.clipRight
            });
        }
        
        this.animationId = requestAnimationFrame(() => this.updateLoop());
    }
    
    updateLevels() {
        if (!this.analyserNode || !this.dataArray) return;
        
        // Get time domain data
        this.analyserNode.getByteTimeDomainData(this.dataArray);
        
        // Calculate RMS for left and right channels (simple mono for now, upgrade for stereo)
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            const v = (this.dataArray[i] - 128) / 128;
            sum += v * v;
        }
        
        let rms = Math.sqrt(sum / this.dataArray.length);
        rms = Math.min(1, Math.max(0, rms * 1.5)); // Scale for better visibility
        
        // Same level for both channels (mono), upgrade later for true stereo
        this.leftLevel = rms;
        this.rightLevel = rms;
        
        // Update peaks
        if (rms > this.peakLeft) {
            this.peakLeft = rms;
            setTimeout(() => { if (this.peakLeft === rms) this.peakLeft = this.leftLevel; }, 500);
        }
        
        if (rms > this.peakRight) {
            this.peakRight = rms;
            setTimeout(() => { if (this.peakRight === rms) this.peakRight = this.rightLevel; }, 500);
        }
        
        // Check for clipping (if signal is at max)
        let clipped = false;
        for (let i = 0; i < this.dataArray.length; i++) {
            if (this.dataArray[i] === 255 || this.dataArray[i] === 0) {
                clipped = true;
                break;
            }
        }
        
        if (clipped) {
            this.clipLeft = true;
            this.clipRight = true;
            setTimeout(() => {
                this.clipLeft = false;
                this.clipRight = false;
            }, 1000);
        }
    }
    
    resetPeaks() {
        this.peakLeft = 0;
        this.peakRight = 0;
        this.clipLeft = false;
        this.clipRight = false;
    }
    
    getLevels() {
        return {
            left: this.leftLevel,
            right: this.rightLevel,
            peakLeft: this.peakLeft,
            peakRight: this.peakRight
        };
    }
    
    disconnect() {
        this.stop();
        if (this.analyserNode) {
            try {
                this.analyserNode.disconnect();
            } catch(e) {}
        }
    }
}
