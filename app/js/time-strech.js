// NekoAudio - Time Stretch & Pitch Shift Engine
// Independent pitch shift without tempo change, and tempo change without pitch shift

export class TimeStretchEngine {
    constructor(audioContext) {
        this.audioContext = audioContext;
    }

    // Pitch shift without changing tempo using granular synthesis
    async pitchShiftOnly(buffer, semitones) {
        if (!buffer) return null;
        
        const pitchFactor = Math.pow(2, semitones / 12);
        const sampleRate = buffer.sampleRate;
        const numChannels = buffer.numberOfChannels;
        const length = buffer.length;
        
        // Create offline context for processing
        const offlineCtx = new OfflineAudioContext(
            numChannels,
            length,
            sampleRate
        );
        
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        
        // Apply pitch via playbackRate, but we need to preserve duration
        // So we'll play faster/slower and then resample back
        const pitchSource = offlineCtx.createBufferSource();
        pitchSource.buffer = buffer;
        pitchSource.playbackRate.value = pitchFactor;
        
        // Record the pitched audio
        const recorder = offlineCtx.createScriptProcessor(4096, numChannels, numChannels);
        const pitchedSamples = [];
        
        pitchSource.connect(recorder);
        recorder.connect(offlineCtx.destination);
        
        recorder.onaudioprocess = (e) => {
            for (let ch = 0; ch < numChannels; ch++) {
                if (!pitchedSamples[ch]) pitchedSamples[ch] = [];
                const inputData = e.inputBuffer.getChannelData(ch);
                pitchedSamples[ch].push(...inputData);
            }
        };
        
        pitchSource.start();
        
        // Resample back to original duration
        const expectedLength = length;
        const actualLength = pitchedSamples[0]?.length || length;
        const ratio = actualLength / expectedLength;
        
        // Create final buffer
        const resultBuffer = offlineCtx.createBuffer(numChannels, expectedLength, sampleRate);
        
        for (let ch = 0; ch < numChannels; ch++) {
            const channelData = resultBuffer.getChannelData(ch);
            const sourceData = pitchedSamples[ch] || [];
            
            for (let i = 0; i < expectedLength; i++) {
                const srcIndex = Math.floor(i * ratio);
                channelData[i] = sourceData[srcIndex] || 0;
            }
        }
        
        await offlineCtx.startRendering();
        return resultBuffer;
    }
    
    // Change tempo without changing pitch using granular synthesis
    async tempoOnly(buffer, tempoRatio) {
        if (!buffer) return null;
        if (tempoRatio <= 0) return buffer;
        
        const sampleRate = buffer.sampleRate;
        const numChannels = buffer.numberOfChannels;
        const originalLength = buffer.length;
        const newLength = Math.floor(originalLength / tempoRatio);
        
        // Create offline context
        const offlineCtx = new OfflineAudioContext(
            numChannels,
            newLength,
            sampleRate
        );
        
        // Granular synthesis parameters
        const grainSize = Math.floor(sampleRate * 0.02); // 20ms grains
        const overlap = 0.5;
        const stride = Math.floor(grainSize * overlap);
        
        const resultBuffer = offlineCtx.createBuffer(numChannels, newLength, sampleRate);
        
        for (let ch = 0; ch < numChannels; ch++) {
            const sourceData = buffer.getChannelData(ch);
            const targetData = resultBuffer.getChannelData(ch);
            const windowSize = grainSize;
            
            let srcPos = 0;
            let dstPos = 0;
            
            while (dstPos < newLength && srcPos < originalLength) {
                // Apply Hanning window for smooth transitions
                for (let i = 0; i < grainSize && dstPos + i < newLength && srcPos + i < originalLength; i++) {
                    const windowVal = 0.5 * (1 - Math.cos(2 * Math.PI * i / grainSize));
                    targetData[dstPos + i] += sourceData[srcPos + i] * windowVal;
                }
                
                srcPos += grainSize * tempoRatio;
                dstPos += grainSize;
            }
        }
        
        await offlineCtx.startRendering();
        return resultBuffer;
    }
    
    // Both pitch and tempo change (traditional)
    async pitchAndTempo(buffer, semitones, tempoRatio) {
        if (!buffer) return null;
        
        // First apply tempo change without pitch shift
        let tempBuffer = await this.tempoOnly(buffer, tempoRatio);
        
        // Then apply pitch shift on the tempo-changed buffer
        const finalBuffer = await this.pitchShiftOnly(tempBuffer, semitones);
        
        return finalBuffer;
    }
    
    // Granular time stretch with formant preservation (higher quality)
    async granularTimeStretch(buffer, ratio, options = {}) {
        if (!buffer) return null;
        
        const {
            grainSize = 0.02,      // seconds
            overlap = 0.5,         // overlap factor
            pitchPreserve = true    // preserve pitch while stretching
        } = options;
        
        const sampleRate = buffer.sampleRate;
        const numChannels = buffer.numberOfChannels;
        const originalLength = buffer.length;
        const newLength = Math.floor(originalLength / ratio);
        
        const offlineCtx = new OfflineAudioContext(
            numChannels,
            newLength,
            sampleRate
        );
        
        const grainSamples = Math.floor(sampleRate * grainSize);
        const stride = Math.floor(grainSamples * overlap);
        const step = Math.floor(grainSamples * ratio);
        
        const resultBuffer = offlineCtx.createBuffer(numChannels, newLength, sampleRate);
        
        for (let ch = 0; ch < numChannels; ch++) {
            const sourceData = buffer.getChannelData(ch);
            const targetData = resultBuffer.getChannelData(ch);
            
            let srcPos = 0;
            let dstPos = 0;
            
            while (dstPos < newLength && srcPos < originalLength) {
                const remainingDst = newLength - dstPos;
                const remainingSrc = originalLength - srcPos;
                const currentGrainSize = Math.min(grainSamples, remainingSrc, remainingDst);
                
                // Apply Hanning window
                for (let i = 0; i < currentGrainSize; i++) {
                    const windowVal = 0.5 * (1 - Math.cos(2 * Math.PI * i / currentGrainSize));
                    targetData[dstPos + i] += sourceData[srcPos + i] * windowVal;
                }
                
                srcPos += step;
                dstPos += stride;
            }
            
            // Normalize to prevent clipping
            let maxVal = 0;
            for (let i = 0; i < newLength; i++) {
                maxVal = Math.max(maxVal, Math.abs(targetData[i]));
            }
            if (maxVal > 0) {
                const gain = 0.95 / maxVal;
                for (let i = 0; i < newLength; i++) {
                    targetData[i] *= gain;
                }
            }
        }
        
        await offlineCtx.startRendering();
        return resultBuffer;
    }
    
    // Real-time pitch shift using delay line (for live playback)
    setupRealtimePitchShift(sourceNode, semitones) {
        if (!this.audioContext) return sourceNode;
        
        const pitchFactor = Math.pow(2, semitones / 12);
        const pitchNode = this.audioContext.createBufferSource();
        
        // Use a simple resampling approach for real-time
        // Clone the source's buffer and resample
        if (sourceNode.buffer) {
            const originalBuffer = sourceNode.buffer;
            const newLength = Math.floor(originalBuffer.length / pitchFactor);
            const offlineCtx = new OfflineAudioContext(
                originalBuffer.numberOfChannels,
                newLength,
                originalBuffer.sampleRate
            );
            
            const tempSource = offlineCtx.createBufferSource();
            tempSource.buffer = originalBuffer;
            tempSource.playbackRate.value = pitchFactor;
            tempSource.connect(offlineCtx.destination);
            tempSource.start();
            
            offlineCtx.startRendering().then(resampledBuffer => {
                sourceNode.buffer = resampledBuffer;
            });
        }
        
        return sourceNode;
    }
    
    // Detect BPM from audio buffer (basic onset detection)
    detectBPM(buffer, minBPM = 80, maxBPM = 160) {
        if (!buffer) return 120;
        
        const channelData = buffer.getChannelData(0);
        const sampleRate = buffer.sampleRate;
        
        // Simple energy-based onset detection
        const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
        const energy = [];
        
        for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
            let sum = 0;
            for (let j = 0; j < windowSize; j++) {
                sum += Math.abs(channelData[i + j]);
            }
            energy.push(sum / windowSize);
        }
        
        // Find peaks
        const peaks = [];
        const threshold = Math.max(...energy) * 0.3;
        
        for (let i = 1; i < energy.length - 1; i++) {
            if (energy[i] > threshold && energy[i] > energy[i-1] && energy[i] > energy[i+1]) {
                peaks.push(i);
            }
        }
        
        if (peaks.length < 2) return 120;
        
        // Calculate average beat interval
        let totalInterval = 0;
        for (let i = 1; i < peaks.length; i++) {
            totalInterval += peaks[i] - peaks[i-1];
        }
        const avgInterval = totalInterval / (peaks.length - 1);
        
        // Convert to BPM
        const secondsPerBeat = (avgInterval * windowSize) / sampleRate;
        let bpm = 60 / secondsPerBeat;
        
        // Clamp to reasonable range
        bpm = Math.max(minBPM, Math.min(maxBPM, bpm));
        
        return Math.round(bpm);
    }
    
    // Time-stretch to target BPM
    async stretchToBPM(buffer, sourceBPM, targetBPM) {
        if (!buffer || sourceBPM <= 0 || targetBPM <= 0) return buffer;
        
        const ratio = sourceBPM / targetBPM;
        return await this.granularTimeStretch(buffer, ratio, { pitchPreserve: true });
    }
}
