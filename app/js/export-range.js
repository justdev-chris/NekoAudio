// NekoAudio - Export Range Manager
// Handles exporting selected time ranges from the timeline

export class ExportRangeManager {
    constructor(audioContext, trackManager, timeline) {
        this.audioContext = audioContext;
        this.trackManager = trackManager;
        this.timeline = timeline;
        
        // Export settings
        this.exportStart = 0;
        this.exportEnd = 60;
        this.selectionMode = 'full'; // 'full', 'selection', 'custom'
        
        // Callbacks
        this.onExportProgress = null;
        this.onExportComplete = null;
    }
    
    setExportRange(start, end) {
        this.exportStart = Math.max(0, start);
        this.exportEnd = Math.max(this.exportStart + 0.1, end);
        this.selectionMode = 'custom';
    }
    
    setFullSong() {
        const maxDuration = this.timeline.getMaxDuration();
        this.exportStart = 0;
        this.exportEnd = maxDuration;
        this.selectionMode = 'full';
    }
    
    setTimelineSelection() {
        if (this.timeline.selectionStart !== null && this.timeline.selectionEnd !== null) {
            this.exportStart = this.timeline.selectionStart;
            this.exportEnd = this.timeline.selectionEnd;
            this.selectionMode = 'selection';
        }
    }
    
    getExportDuration() {
        return this.exportEnd - this.exportStart;
    }
    
    async exportToWAV(options = {}) {
        const {
            normalize = false,
            bitDepth = 16
        } = options;
        
        const duration = this.getExportDuration();
        const sampleRate = this.audioContext.sampleRate;
        const numChannels = 2; // Stereo output
        const totalSamples = Math.floor(duration * sampleRate);
        
        // Create offline context for rendering
        const offlineCtx = new OfflineAudioContext(
            numChannels,
            totalSamples,
            sampleRate
        );
        
        // Create master gain for summing
        const masterGain = offlineCtx.createGain();
        masterGain.connect(offlineCtx.destination);
        
        // Render each track's clips within the range
        const tracks = this.trackManager.getAllTracks();
        const renderPromises = [];
        
        for (const track of tracks) {
            if (track.muted) continue;
            
            const trackClips = this.timeline.clips.get(track.id) || [];
            const relevantClips = trackClips.filter(clip => 
                clip.timelineEnd > this.exportStart && 
                clip.timelineStart < this.exportEnd
            );
            
            for (const clip of relevantClips) {
                const promise = this.renderClipToOffline(offlineCtx, clip, track);
                renderPromises.push(promise);
            }
        }
        
        // Report progress
        let renderedCount = 0;
        for (const promise of renderPromises) {
            await promise;
            renderedCount++;
            if (this.onExportProgress) {
                this.onExportProgress(renderedCount / renderPromises.length);
            }
        }
        
        // Render the final mix
        const renderedBuffer = await offlineCtx.startRendering();
        
        // Normalize if requested
        let finalBuffer = renderedBuffer;
        if (normalize) {
            finalBuffer = this.normalizeBuffer(renderedBuffer);
        }
        
        // Convert to WAV
        return this.bufferToWav(finalBuffer, bitDepth);
    }
    
    async renderClipToOffline(offlineCtx, clip, track) {
        if (!clip.buffer) return;
        
        const sampleRate = offlineCtx.sampleRate;
        const clipStartOffset = Math.max(0, this.exportStart - clip.timelineStart);
        const clipEndOffset = Math.min(clip.getDuration(), this.exportEnd - clip.timelineStart);
        
        if (clipStartOffset >= clipEndOffset) return;
        
        const renderStartSample = Math.floor(clipStartOffset * sampleRate);
        const renderEndSample = Math.floor(clipEndOffset * sampleRate);
        const renderLength = renderEndSample - renderStartSample;
        
        if (renderLength <= 0) return;
        
        // Extract portion of clip buffer
        const numChannels = clip.buffer.numberOfChannels;
        const tempBuffer = offlineCtx.createBuffer(numChannels, renderLength, sampleRate);
        
        for (let ch = 0; ch < numChannels; ch++) {
            const sourceData = clip.buffer.getChannelData(ch);
            const targetData = tempBuffer.getChannelData(ch);
            const bufferStart = Math.floor(clip.clipStart * sampleRate) + renderStartSample;
            
            for (let i = 0; i < renderLength; i++) {
                const srcIndex = bufferStart + i;
                if (srcIndex < sourceData.length) {
                    targetData[i] = sourceData[srcIndex] * clip.volume;
                }
            }
        }
        
        // Create source node in offline context
        const source = offlineCtx.createBufferSource();
        source.buffer = tempBuffer;
        
        // Apply clip effects (pitch, speed, pan)
        if (clip.pitchShift !== 0) {
            const pitchFactor = Math.pow(2, clip.pitchShift / 12);
            source.playbackRate.value = pitchFactor;
        }
        
        if (clip.speed !== 1.0) {
            source.playbackRate.value *= clip.speed;
        }
        
        // Apply pan
        const panner = offlineCtx.createStereoPanner();
        panner.pan.value = clip.pan;
        source.connect(panner);
        panner.connect(offlineCtx.destination);
        
        // Apply fade in/out
        const gainNode = offlineCtx.createGain();
        source.connect(gainNode);
        gainNode.connect(panner);
        
        const fadeInSamples = Math.floor(clip.fadeIn * sampleRate);
        const fadeOutSamples = Math.floor(clip.fadeOut * sampleRate);
        
        if (fadeInSamples > 0 || fadeOutSamples > 0) {
            const now = offlineCtx.currentTime;
            if (fadeInSamples > 0) {
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(1, now + clip.fadeIn);
            }
            if (fadeOutSamples > 0) {
                const fadeOutStart = renderLength / sampleRate - clip.fadeOut;
                gainNode.gain.setValueAtTime(1, now + fadeOutStart);
                gainNode.gain.linearRampToValueAtTime(0, now + fadeOutStart + clip.fadeOut);
            }
        }
        
        source.start();
        
        // Return promise that resolves when clip is done
        return new Promise((resolve) => {
            setTimeout(resolve, (renderLength / sampleRate) * 1000);
        });
    }
    
    async exportToMP3(options = {}) {
        const { bitrate = 192, normalize = false } = options;
        
        // First render to WAV
        const wavBlob = await this.exportToWAV({ normalize });
        
        // Convert WAV to MP3 using lamejs
        if (typeof lamejs === 'undefined') {
            await this.loadLameJS();
        }
        
        // Read WAV data
        const arrayBuffer = await wavBlob.arrayBuffer();
        const wavData = this.decodeWav(arrayBuffer);
        
        // Encode to MP3
        const encoder = new lamejs.Mp3Encoder(2, wavData.sampleRate, bitrate);
        const mp3Data = [];
        const sampleBlock = 1152;
        
        for (let i = 0; i < wavData.samples; i += sampleBlock) {
            const leftChunk = wavData.left.subarray(i, i + sampleBlock);
            const rightChunk = wavData.right.subarray(i, i + sampleBlock);
            const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
        }
        
        const mp3buf = encoder.flush();
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
        
        return new Blob(mp3Data, { type: 'audio/mp3' });
    }
    
    async exportToOGG(options = {}) {
        const { quality = 0.5, normalize = false } = options;
        
        const wavBlob = await this.exportToWAV({ normalize });
        const arrayBuffer = await wavBlob.arrayBuffer();
        
        // Use MediaRecorder with OGG container
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        const stream = this.bufferToStream(audioBuffer);
        const mediaRecorder = new MediaRecorder(stream, { 
            mimeType: 'audio/ogg' 
        });
        
        return new Promise((resolve) => {
            const chunks = [];
            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/ogg' }));
            mediaRecorder.start();
            setTimeout(() => mediaRecorder.stop(), 100);
        });
    }
    
    bufferToStream(buffer) {
        const numChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const sampleRate = buffer.sampleRate;
        
        const offlineCtx = new OfflineAudioContext(numChannels, length, sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start();
        
        const destination = offlineCtx.createMediaStreamDestination();
        source.connect(destination);
        
        return destination.stream;
    }
    
    normalizeBuffer(buffer) {
        let maxVal = 0;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
                maxVal = Math.max(maxVal, Math.abs(data[i]));
            }
        }
        
        if (maxVal === 0 || maxVal >= 0.99) return buffer;
        
        const gain = 0.95 / maxVal;
        const numChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const newBuffer = this.audioContext.createBuffer(numChannels, length, buffer.sampleRate);
        
        for (let ch = 0; ch < numChannels; ch++) {
            const oldData = buffer.getChannelData(ch);
            const newData = newBuffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                newData[i] = oldData[i] * gain;
            }
        }
        
        return newBuffer;
    }
    
    bufferToWav(buffer, bitDepth = 16) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const samples = buffer.length;
        const bytesPerSample = bitDepth / 8;
        const dataLen = samples * numChannels * bytesPerSample;
        
        const wavBuffer = new ArrayBuffer(44 + dataLen);
        const view = new DataView(wavBuffer);
        
        function writeString(offset, str) {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        }
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataLen, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
        view.setUint16(32, numChannels * bytesPerSample, true);
        view.setUint16(34, bitDepth, true);
        writeString(36, 'data');
        view.setUint32(40, dataLen, true);
        
        let offset = 44;
        const scale = bitDepth === 16 ? 0x7FFF : 0x7F;
        
        for (let i = 0; i < samples; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                let sample = buffer.getChannelData(ch)[i];
                sample = Math.max(-1, Math.min(1, sample));
                const intSample = sample < 0 ? sample * scale : sample * scale;
                if (bitDepth === 16) {
                    view.setInt16(offset, intSample, true);
                } else {
                    view.setInt8(offset, intSample);
                }
                offset += bytesPerSample;
            }
        }
        
        return new Blob([wavBuffer], { type: 'audio/wav' });
    }
    
    decodeWav(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const sampleRate = view.getUint32(24, true);
        const numChannels = view.getUint16(22, true);
        const samples = (arrayBuffer.byteLength - 44) / (numChannels * 2);
        
        const left = new Int16Array(samples);
        const right = new Int16Array(samples);
        
        let offset = 44;
        for (let i = 0; i < samples; i++) {
            if (numChannels >= 2) {
                left[i] = view.getInt16(offset, true);
                right[i] = view.getInt16(offset + 2, true);
                offset += 4;
            } else {
                left[i] = view.getInt16(offset, true);
                right[i] = left[i];
                offset += 2;
            }
        }
        
        return { left, right, sampleRate, samples, numChannels };
    }
    
    loadLameJS() {
        return new Promise((resolve, reject) => {
            if (typeof lamejs !== 'undefined') {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
}
