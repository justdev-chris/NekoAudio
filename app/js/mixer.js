// NekoAudio - Mixer Engine for Multi-Track Export

export class Mixer {
    constructor(audioContext, trackManager, timeline) {
        this.audioContext = audioContext;
        this.trackManager = trackManager;
        this.timeline = timeline;
    }

    async renderFullMix(options = {}) {
        const {
            startTime = 0,
            endTime = null,
            normalize = true,
            format = 'wav',
            bitrate = 192,
            onProgress = null
        } = options;

        // Get max duration from timeline
        const maxDuration = this.timeline.getMaxDuration();
        const duration = endTime ? Math.min(endTime, maxDuration) - startTime : maxDuration - startTime;
        
        if (duration <= 0) {
            throw new Error('Invalid duration for export');
        }

        const sampleRate = this.audioContext.sampleRate;
        const totalSamples = Math.ceil(duration * sampleRate);
        const numChannels = 2; // Stereo output

        // Create offline context for rendering
        const offlineCtx = new OfflineAudioContext(
            numChannels,
            totalSamples,
            sampleRate
        );

        // Create master gain for summing
        const masterGain = offlineCtx.createGain();
        masterGain.connect(offlineCtx.destination);

        // Collect all clips to render
        const clipsToRender = [];
        for (const [trackId, clips] of this.timeline.clips) {
            const track = this.trackManager.getTrack(trackId);
            if (!track || track.muted) continue;

            for (const clip of clips) {
                const clipStart = clip.timelineStart;
                const clipEnd = clip.timelineEnd;
                
                // Check if clip overlaps with export range
                if (clipEnd > startTime && clipStart < (endTime || maxDuration)) {
                    clipsToRender.push({
                        clip,
                        track,
                        startOffset: Math.max(0, startTime - clipStart),
                        endOffset: clip.getDuration() - Math.max(0, clipEnd - (endTime || maxDuration))
                    });
                }
            }
        }

        // Render each clip to the offline context
        let renderedCount = 0;
        const totalClips = clipsToRender.length;

        for (const item of clipsToRender) {
            await this.renderClipToOffline(offlineCtx, masterGain, item);
            
            renderedCount++;
            if (onProgress) {
                onProgress(Math.floor((renderedCount / totalClips) * 100));
            }
        }

        // Render the final mix
        const renderedBuffer = await offlineCtx.startRendering();

        // Normalize if requested
        let finalBuffer = renderedBuffer;
        if (normalize) {
            finalBuffer = this.normalizeBuffer(renderedBuffer);
        }

        // Convert to requested format
        if (format === 'wav') {
            return this.bufferToWav(finalBuffer);
        } else if (format === 'mp3') {
            return await this.bufferToMp3(finalBuffer, bitrate);
        } else {
            return this.bufferToWav(finalBuffer);
        }
    }

    async renderClipToOffline(offlineCtx, masterGain, item) {
        const { clip, track, startOffset, endOffset } = item;
        
        if (!clip.buffer) return;

        const sampleRate = offlineCtx.sampleRate;
        const renderDuration = clip.getDuration() - startOffset - endOffset;
        const renderSamples = Math.ceil(renderDuration * sampleRate);
        
        if (renderSamples <= 0) return;

        // Extract the portion of the clip we need
        const sourceStartSample = Math.floor((clip.clipStart + startOffset) * sampleRate);
        const numChannels = clip.buffer.numberOfChannels;
        
        const tempBuffer = offlineCtx.createBuffer(numChannels, renderSamples, sampleRate);
        
        for (let ch = 0; ch < numChannels; ch++) {
            const sourceData = clip.buffer.getChannelData(ch);
            const targetData = tempBuffer.getChannelData(ch);
            
            for (let i = 0; i < renderSamples; i++) {
                const srcIndex = sourceStartSample + i;
                if (srcIndex < sourceData.length) {
                    // Apply clip volume, fade in/out, and pitch shift
                    let gain = clip.volume;
                    
                    // Fade in
                    const fadeInSamples = clip.fadeIn * sampleRate;
                    if (fadeInSamples > 0 && i < fadeInSamples) {
                        gain *= (i / fadeInSamples);
                    }
                    
                    // Fade out
                    const fadeOutSamples = clip.fadeOut * sampleRate;
                    const samplesFromEnd = renderSamples - i;
                    if (fadeOutSamples > 0 && samplesFromEnd < fadeOutSamples) {
                        gain *= (samplesFromEnd / fadeOutSamples);
                    }
                    
                    targetData[i] = sourceData[srcIndex] * gain;
                }
            }
        }

        // Create buffer source for this clip section
        const source = offlineCtx.createBufferSource();
        source.buffer = tempBuffer;
        
        // Apply pitch shift and speed
        const pitchFactor = Math.pow(2, (clip.pitchShift || 0) / 12);
        const finalSpeed = (clip.speed || 1.0) * pitchFactor;
        source.playbackRate.value = finalSpeed;
        
        // Apply pan
        const panner = offlineCtx.createStereoPanner();
        panner.pan.value = clip.pan || 0;
        
        // Apply track effects
        let currentNode = source;
        
        // Track effects (same as in rebuildEffectChain but for export)
        currentNode = this.applyTrackEffects(offlineCtx, currentNode, track.effects);
        
        currentNode.connect(panner);
        panner.connect(masterGain);
        
        source.start();
        
        // Return promise that resolves when clip is done
        return new Promise((resolve) => {
            setTimeout(resolve, (renderSamples / sampleRate) * 1000);
        });
    }

    applyTrackEffects(ctx, inputNode, effects) {
        let currentNode = inputNode;
        
        // Distortion
        if (effects.distortion > 0) {
            const distortion = ctx.createWaveShaper();
            const k = effects.distortion / 40;
            const curve = new Float32Array(8192);
            for (let i = 0; i < 8192; i++) {
                const x = (i - 4096) / 4096;
                curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
            }
            distortion.curve = curve;
            currentNode.connect(distortion);
            currentNode = distortion;
        }
        
        // Lowpass
        if (effects.lowpass < 19000) {
            const lowpass = ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = Math.max(300, effects.lowpass);
            lowpass.Q.value = effects.resonance || 1;
            currentNode.connect(lowpass);
            currentNode = lowpass;
        }
        
        // Highpass
        if (effects.highpass > 50) {
            const highpass = ctx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = effects.highpass;
            currentNode.connect(highpass);
            currentNode = highpass;
        }
        
        // Reverb
        if (effects.reverb > 0) {
            const convolver = ctx.createConvolver();
            const sampleRate = ctx.sampleRate;
            const reverbTime = 2.0;
            const length = sampleRate * reverbTime;
            const impulse = ctx.createBuffer(2, length, sampleRate);
            
            for (let channel = 0; channel < 2; channel++) {
                const channelData = impulse.getChannelData(channel);
                for (let i = 0; i < length; i++) {
                    const decay = Math.exp(-i / (sampleRate * reverbTime / 2));
                    channelData[i] = (Math.random() * 2 - 1) * decay;
                }
            }
            convolver.buffer = impulse;
            
            const wet = ctx.createGain();
            wet.gain.value = effects.reverb / 100;
            const dry = ctx.createGain();
            dry.gain.value = 1 - (effects.reverb / 100);
            
            currentNode.connect(convolver);
            convolver.connect(wet);
            currentNode.connect(dry);
            
            const summer = ctx.createGain();
            wet.connect(summer);
            dry.connect(summer);
            currentNode = summer;
        }
        
        // Delay
        if (effects.delay > 0) {
            const delayNode = ctx.createDelay();
            delayNode.delayTime.value = effects.delay / 1000;
            const feedback = ctx.createGain();
            feedback.gain.value = (effects.delayFeedback || 0) / 100;
            delayNode.connect(feedback);
            feedback.connect(delayNode);
            currentNode.connect(delayNode);
            currentNode = delayNode;
        }
        
        // Volume
        const volumeNode = ctx.createGain();
        volumeNode.gain.value = (effects.volume || 100) / 100;
        currentNode.connect(volumeNode);
        currentNode = volumeNode;
        
        return currentNode;
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

    bufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const samples = buffer.length;
        const dataLen = samples * numChannels * 2;
        const wavBuffer = new ArrayBuffer(44 + dataLen);
        const view = new DataView(wavBuffer);
        
        const writeString = (offset, str) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataLen, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * 2, true);
        view.setUint16(32, numChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, dataLen, true);
        
        let offset = 44;
        for (let i = 0; i < samples; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                let sample = buffer.getChannelData(ch)[i];
                sample = Math.max(-1, Math.min(1, sample));
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, intSample, true);
                offset += 2;
            }
        }
        
        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    async bufferToMp3(buffer, bitrate = 192) {
        if (typeof lamejs === 'undefined') {
            await this.loadLameJS();
        }
        
        const wavBlob = this.bufferToWav(buffer);
        const arrayBuffer = await wavBlob.arrayBuffer();
        const wavData = this.decodeWav(arrayBuffer);
        
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
