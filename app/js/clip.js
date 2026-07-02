// NekoAudio - Clip Class
// Represents an audio clip on the timeline (reference to a track's buffer with timeline positioning)

export class Clip {
    constructor(id, trackId, buffer, startTime = 0, duration = null, fileName = null) {
        this.id = id;
        this.trackId = trackId;
        this.buffer = buffer;
        
        // Timeline position (in seconds)
        this.timelineStart = 0;
        this.timelineEnd = duration || (buffer ? buffer.duration : 0);
        
        // Clip editing properties
        this.clipStart = startTime;
        this.clipEnd = duration || (buffer ? buffer.duration : 0);
        this.volume = 1.0;
        this.pan = 0;
        this.pitchShift = 0;
        this.speed = 1.0;
        
        // Visual
        this.color = this.generateColor();
        
        // Set name from filename or generate one
        if (fileName) {
            // Remove file extension
            this.name = fileName.replace(/\.[^/.]+$/, '');
            // Truncate if too long
            if (this.name.length > 25) {
                this.name = this.name.substring(0, 22) + '...';
            }
        } else {
            this.name = `Clip ${id}`;
        }
        
        this.selected = false;
        
        // Fade in/out
        this.fadeIn = 0;
        this.fadeOut = 0;
        
        // Loop within clip
        this.loopEnabled = false;
        this.loopStart = 0;
        this.loopEnd = this.clipEnd - this.clipStart;
    }
    
    generateColor() {
        const hue = (this.id * 37) % 360;
        return `hsl(${hue}, 65%, 55%)`;
    }
    
    getDuration() {
        return this.timelineEnd - this.timelineStart;
    }
    
    getBufferDuration() {
        return (this.clipEnd - this.clipStart) / this.speed;
    }
    
    setTimelinePosition(startSec) {
        const duration = this.getDuration();
        this.timelineStart = startSec;
        this.timelineEnd = startSec + duration;
    }
    
    setTimelineEnd(endSec) {
        if (endSec > this.timelineStart) {
            this.timelineEnd = endSec;
        }
    }
    
    trimStart(newStart) {
        if (newStart >= this.clipStart && newStart < this.clipEnd) {
            this.clipStart = newStart;
            // Adjust timeline duration to maintain sync
            const newDuration = (this.clipEnd - this.clipStart) / this.speed;
            this.timelineEnd = this.timelineStart + newDuration;
        }
    }
    
    trimEnd(newEnd) {
        if (newEnd > this.clipStart && newEnd <= this.getBufferDuration()) {
            this.clipEnd = newEnd;
            const newDuration = (this.clipEnd - this.clipStart) / this.speed;
            this.timelineEnd = this.timelineStart + newDuration;
        }
    }
    
    setSpeed(speed) {
        this.speed = Math.max(0.25, Math.min(4, speed));
        // Adjust timeline duration
        const newDuration = (this.clipEnd - this.clipStart) / this.speed;
        this.timelineEnd = this.timelineStart + newDuration;
    }
    
    setPitchShift(semitones) {
        this.pitchShift = Math.max(-12, Math.min(12, semitones));
    }
    
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(2, volume));
    }
    
    setPan(pan) {
        this.pan = Math.max(-1, Math.min(1, pan));
    }
    
    setFadeIn(duration) {
        this.fadeIn = Math.max(0, Math.min(this.getDuration() / 2, duration));
    }
    
    setFadeOut(duration) {
        this.fadeOut = Math.max(0, Math.min(this.getDuration() / 2, duration));
    }
    
    toggleLoop() {
        this.loopEnabled = !this.loopEnabled;
    }
    
    setLoopRange(start, end) {
        this.loopStart = Math.max(0, start);
        this.loopEnd = Math.min(this.clipEnd - this.clipStart, end);
    }
    
    isPlayingAtTimelinePosition(currentTime) {
        return currentTime >= this.timelineStart && currentTime <= this.timelineEnd;
    }
    
    getBufferOffsetAtTimelineTime(timelineTime) {
        if (!this.isPlayingAtTimelinePosition(timelineTime)) return -1;
        
        const elapsedInClip = timelineTime - this.timelineStart;
        const bufferProgress = elapsedInClip * this.speed;
        
        let bufferOffset = this.clipStart + bufferProgress;
        
        if (this.loopEnabled && bufferOffset > this.clipStart + this.loopEnd) {
            const loopLength = this.loopEnd - this.loopStart;
            if (loopLength > 0) {
                const loopProgress = (bufferOffset - (this.clipStart + this.loopStart)) % loopLength;
                bufferOffset = this.clipStart + this.loopStart + loopProgress;
            }
        }
        
        return Math.min(bufferOffset, this.clipEnd);
    }
    
    applyFadeToBuffer(samples, sampleRate) {
        // Returns fade envelope for a chunk of samples
        const totalSamples = (this.clipEnd - this.clipStart) * sampleRate;
        const fadeInSamples = Math.floor(this.fadeIn * sampleRate);
        const fadeOutSamples = Math.floor(this.fadeOut * sampleRate);
        
        return (sampleIndex, channelIndex) => {
            let gain = 1.0;
            
            // Fade in
            if (sampleIndex < fadeInSamples && this.fadeIn > 0) {
                gain = sampleIndex / fadeInSamples;
            }
            
            // Fade out
            if (sampleIndex > totalSamples - fadeOutSamples && this.fadeOut > 0) {
                const fadeOutProgress = (sampleIndex - (totalSamples - fadeOutSamples)) / fadeOutSamples;
                gain *= (1 - fadeOutProgress);
            }
            
            return gain * this.volume;
        };
    }
    
    clone() {
        const clip = new Clip(
            this.id + 1000,  // Generate new ID pattern
            this.trackId,
            this.buffer,
            this.clipStart,
            this.clipEnd - this.clipStart
        );
        clip.timelineStart = this.timelineStart;
        clip.timelineEnd = this.timelineEnd;
        clip.volume = this.volume;
        clip.pan = this.pan;
        clip.pitchShift = this.pitchShift;
        clip.speed = this.speed;
        clip.fadeIn = this.fadeIn;
        clip.fadeOut = this.fadeOut;
        clip.name = `${this.name} (copy)`;
        return clip;
    }
    
    toJSON() {
        return {
            id: this.id,
            trackId: this.trackId,
            timelineStart: this.timelineStart,
            timelineEnd: this.timelineEnd,
            clipStart: this.clipStart,
            clipEnd: this.clipEnd,
            volume: this.volume,
            pan: this.pan,
            pitchShift: this.pitchShift,
            speed: this.speed,
            fadeIn: this.fadeIn,
            fadeOut: this.fadeOut,
            loopEnabled: this.loopEnabled,
            loopStart: this.loopStart,
            loopEnd: this.loopEnd,
            name: this.name,
            color: this.color
        };
    }
    
    static fromJSON(data, bufferMap) {
        const clip = new Clip(
            data.id,
            data.trackId,
            bufferMap[data.trackId] || null,
            data.clipStart,
            data.clipEnd - data.clipStart
        );
        clip.timelineStart = data.timelineStart;
        clip.timelineEnd = data.timelineEnd;
        clip.volume = data.volume;
        clip.pan = data.pan;
        clip.pitchShift = data.pitchShift;
        clip.speed = data.speed;
        clip.fadeIn = data.fadeIn;
        clip.fadeOut = data.fadeOut;
        clip.loopEnabled = data.loopEnabled;
        clip.loopStart = data.loopStart;
        clip.loopEnd = data.loopEnd;
        clip.name = data.name;
        clip.color = data.color;
        return clip;
    }
}
