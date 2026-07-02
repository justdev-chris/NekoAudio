// NekoAudio - Track Manager
// Manages all tracks, master output, and solo/mute logic

import { Track } from './track.js';

export class TrackManager {
    constructor(audioContext, audioEngine) {
        this.audioContext = audioContext;
        this.audioEngine = audioEngine;
        this.tracks = [];
        this.masterGain = null;
        this.masterMeter = null;
        this.nextTrackId = 0;
        this.masterVolume = 0.8;
        
        // Callbacks
        this.onTrackAdded = null;
        this.onTrackRemoved = null;
        this.onTrackUpdated = null;
        
        this.initMaster();
    }
    
    initMaster() {
        if (!this.audioContext) return;
        
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.masterVolume;
        this.masterGain.connect(this.audioContext.destination);
    }
    
    createTrack(name = null) {
        const track = new Track(
            this.nextTrackId++,
            this.tracks.length,
            this.audioContext,
            this.audioEngine
        );
        
        if (name) track.name = name;
        
        // Connect track output to master
        track.getOutputNode().connect(this.masterGain);
        
        this.tracks.push(track);
        
        if (this.onTrackAdded) {
            this.onTrackAdded(track, this.tracks.length - 1);
        }
        
        return track;
    }
    
    removeTrack(trackId) {
        const index = this.tracks.findIndex(t => t.id === trackId);
        if (index === -1) return;
        
        const track = this.tracks[index];
        track.dispose();
        this.tracks.splice(index, 1);
        
        // Re-index remaining tracks
        this.tracks.forEach((t, i) => t.index = i);
        
        if (this.onTrackRemoved) {
            this.onTrackRemoved(trackId, index);
        }
        
        return true;
    }
    
    getTrack(trackId) {
        return this.tracks.find(t => t.id === trackId);
    }
    
    getTrackByIndex(index) {
        return this.tracks[index];
    }
    
    getAllTracks() {
        return [...this.tracks];
    }
    
    getTrackCount() {
        return this.tracks.length;
    }
    
    playAll() {
        const hasSolo = this.tracks.some(t => t.soloed);
        
        this.tracks.forEach(track => {
            if (!track.buffer) return;
            
            let shouldPlay = !track.muted;
            if (hasSolo) shouldPlay = track.soloed;
            
            if (shouldPlay) {
                track.play();
            }
        });
    }
    
    pauseAll() {
        this.tracks.forEach(track => track.pause());
    }
    
    stopAll() {
        this.tracks.forEach(track => track.stop());
    }
    
    seekAll(time) {
        this.tracks.forEach(track => track.seek(time));
    }

    toggleLoopAll() {
        const newState = !(this.tracks[0]?.loopEnabled || false);
        this.tracks.forEach(track => {
            track.loopEnabled = newState;
            if (track.sourceNode) track.sourceNode.loop = newState;
        });
        return newState;
    }
    
    updateSoloMuteState() {
        const hasSolo = this.hasSolo();
        
        this.tracks.forEach(track => {
            if (hasSolo) {
                // If any track is soloed, only soloed tracks play
                const shouldPlay = track.soloed;
                if (!shouldPlay && track.isPlaying) {
                    track.pause();
                }
            } else {
                // No solo: respect mute state
                if (track.muted && track.isPlaying) {
                    track.pause();
                } else if (!track.muted && track.buffer && !track.isPlaying) {
                    // Don't auto-play, just ready
                }
            }
        });
    }
    
    hasSolo() {
        return this.tracks.some(track => track.soloed);
    }
    
    setMasterVolume(value) {
        this.masterVolume = Math.max(0, Math.min(1, value));
        if (this.masterGain) {
            this.masterGain.gain.value = this.masterVolume;
        }
    }
    
    getMasterVolume() {
        return this.masterVolume;
    }
    
    getMasterOutput() {
        return this.masterGain;
    }
    
    loadBufferToTrack(trackId, buffer) {
        const track = this.getTrack(trackId);
        if (track) {
            track.setBuffer(buffer);
            if (this.onTrackUpdated) {
                this.onTrackUpdated(track);
            }
        }
    }
    
    applyEffectToTrack(trackId, effectName, value) {
        const track = this.getTrack(trackId);
        if (track) {
            track.updateEffectParam(effectName, value);
            if (this.onTrackUpdated) {
                this.onTrackUpdated(track);
            }
        }
    }
    
    applyEffectToAllTracks(effectName, value) {
        this.tracks.forEach(track => {
            track.updateEffectParam(effectName, value);
        });
        if (this.onTrackUpdated) {
            this.onTrackUpdated(null); // null = update all
        }
    }
    
    soloTrack(trackId) {
        const targetTrack = this.getTrack(trackId);
        if (!targetTrack) return;
        
        // If this track is already soloed, unsolo it
        if (targetTrack.soloed) {
            targetTrack.setSoloed(false);
        } else {
            // Unsolo all, then solo this one
            this.tracks.forEach(track => track.setSoloed(false));
            targetTrack.setSoloed(true);
        }
        
        this.updateSoloMuteState();
        
        if (this.onTrackUpdated) {
            this.onTrackUpdated(targetTrack);
        }
    }
    
    muteTrack(trackId) {
        const track = this.getTrack(trackId);
        if (track) {
            track.setMuted(!track.muted);
            this.updateSoloMuteState();
            if (this.onTrackUpdated) {
                this.onTrackUpdated(track);
            }
        }
    }
    
    setTrackVolume(trackId, volume) {
        const track = this.getTrack(trackId);
        if (track) {
            track.setVolume(volume);
            if (this.onTrackUpdated) {
                this.onTrackUpdated(track);
            }
        }
    }
    
    setTrackPan(trackId, pan) {
        const track = this.getTrack(trackId);
        if (track) {
            track.setPan(pan);
            if (this.onTrackUpdated) {
                this.onTrackUpdated(track);
            }
        }
    }
    
    renameTrack(trackId, newName) {
        const track = this.getTrack(trackId);
        if (track) {
            track.name = newName;
            if (this.onTrackUpdated) {
                this.onTrackUpdated(track);
            }
        }
    }
    
    getTrackState() {
        return this.tracks.map(track => ({
            id: track.id,
            name: track.name,
            index: track.index,
            muted: track.muted,
            soloed: track.soloed,
            armed: track.armed,
            volume: track.volume,
            pan: track.pan,
            hasBuffer: !!track.buffer,
            duration: track.getDuration(),
            effects: { ...track.effects }
        }));
    }
    
    dispose() {
        this.tracks.forEach(track => track.dispose());
        this.tracks = [];
        if (this.masterGain) {
            this.masterGain.disconnect();
        }
    }
    
    // Export all tracks as a session
    exportSession() {
        return {
            tracks: this.tracks.map(track => ({
                name: track.name,
                volume: track.volume,
                pan: track.pan,
                muted: track.muted,
                soloed: track.soloed,
                effects: { ...track.effects },
                // Note: buffer data not included (too large), just metadata
                hasBuffer: !!track.buffer,
                duration: track.getDuration()
            }))
        };
    }
}
