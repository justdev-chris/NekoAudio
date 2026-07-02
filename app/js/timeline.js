// NekoAudio - Timeline Manager
// Handles clip arrangement, drag-drop, zoom, snap, and timeline playback coordination
import { Clip } from './clip.js';

export class Timeline {
    constructor(trackManager, audioContext) {
        this.trackManager = trackManager;
        this.audioContext = audioContext;
        
        // Clips storage: Map<trackId, Array<Clip>>
        this.clips = new Map();
        
        // Timeline state
        this.currentTime = 0;
        this.isPlaying = false;
        this.loopEnabled = false;
        this.loopStart = 0;
        this.loopEnd = 60;  // Default 60 seconds
        
        // Viewport (seconds visible)
        this.viewStart = 0;
        this.viewEnd = 30;   // Show 30 seconds by default
        
        // Zoom level (seconds per pixel)
        this.zoom = 0.1;     // 100px = 10 seconds
        
        // Snap settings
        this.snapEnabled = true;
        this.snapInterval = 1.0;  // Snap to 1 second intervals
        
        // Selection
        this.selectedClipIds = new Set();
        this.selectionStart = null;
        this.selectionEnd = null;
        
        // Drag state
        this.dragState = {
            active: false,
            type: null,  // 'clip', 'selection', 'timeline'
            clipId: null,
            startX: 0,
            startTimeline: 0,
            originalStart: 0
        };
        
        // Animation frame
        this.animationId = null;
        
        // Callbacks
        this.onClipsChanged = null;
        this.onTimelineUpdate = null;
        this.onSelectionChanged = null;
        
        this.init();
    }
    
    init() {
        // Initialize clips map for existing tracks
        const tracks = this.trackManager.getAllTracks();
        tracks.forEach(track => {
            if (!this.clips.has(track.id)) {
                this.clips.set(track.id, []);
            }
        });
    }
    
    addClip(trackId, buffer, timelineStart, trimStart = 0, duration = null, fileName = null) {
        const track = this.trackManager.getTrack(trackId);
        if (!track || !buffer) return null;
        
        const clipId = Date.now() + Math.random() * 10000;
        const clipDuration = duration || buffer.duration;
        
        const clip = new Clip(clipId, trackId, buffer, trimStart, clipDuration, fileName);
        clip.timelineStart = timelineStart;
        clip.timelineEnd = timelineStart + clipDuration;
        
        if (!this.clips.has(trackId)) {
            this.clips.set(trackId, []);
        }
        
        this.clips.get(trackId).push(clip);
        this.sortClipsOnTrack(trackId);
        
        if (this.onClipsChanged) {
            this.onClipsChanged();
        }
        
        return clip;
    }
    
    removeClip(trackId, clipId) {
        const trackClips = this.clips.get(trackId);
        if (!trackClips) return false;
        
        const index = trackClips.findIndex(c => c.id === clipId);
        if (index !== -1) {
            trackClips.splice(index, 1);
            this.selectedClipIds.delete(clipId);
            
            if (this.onClipsChanged) {
                this.onClipsChanged();
            }
            if (this.onSelectionChanged) {
                this.onSelectionChanged(this.selectedClipIds);
            }
            return true;
        }
        return false;
    }
    
    updateClip(clipId, updates) {
        for (const [trackId, trackClips] of this.clips.entries()) {
            const clip = trackClips.find(c => c.id === clipId);
            if (clip) {
                Object.assign(clip, updates);
                this.sortClipsOnTrack(trackId);
                if (this.onClipsChanged) {
                    this.onClipsChanged();
                }
                return true;
            }
        }
        return false;
    }
    
    moveClip(clipId, newTimelineStart) {
        for (const [trackId, trackClips] of this.clips.entries()) {
            const clip = trackClips.find(c => c.id === clipId);
            if (clip) {
                const duration = clip.getDuration();
                clip.timelineStart = this.snapEnabled ? this.snapToGrid(newTimelineStart) : newTimelineStart;
                clip.timelineEnd = clip.timelineStart + duration;
                this.sortClipsOnTrack(trackId);
                
                if (this.onClipsChanged) {
                    this.onClipsChanged();
                }
                return true;
            }
        }
        return false;
    }
    
    moveClipToTrack(clipId, newTrackId) {
        let sourceClip = null;
        let sourceTrackId = null;
        
        // Find and remove from current track
        for (const [trackId, trackClips] of this.clips.entries()) {
            const clip = trackClips.find(c => c.id === clipId);
            if (clip) {
                sourceClip = clip;
                sourceTrackId = trackId;
                const index = trackClips.indexOf(clip);
                trackClips.splice(index, 1);
                break;
            }
        }
        
        if (!sourceClip) return false;
        
        // Add to new track
        sourceClip.trackId = newTrackId;
        if (!this.clips.has(newTrackId)) {
            this.clips.set(newTrackId, []);
        }
        this.clips.get(newTrackId).push(sourceClip);
        this.sortClipsOnTrack(newTrackId);
        
        if (this.onClipsChanged) {
            this.onClipsChanged();
        }
        
        return true;
    }
    
    sortClipsOnTrack(trackId) {
        const trackClips = this.clips.get(trackId);
        if (trackClips) {
            trackClips.sort((a, b) => a.timelineStart - b.timelineStart);
        }
    }
    
    getClipsAtTime(timelineTime) {
        const playingClips = [];
        
        for (const [trackId, trackClips] of this.clips.entries()) {
            const track = this.trackManager.getTrack(trackId);
            if (track && track.muted) continue;
            
            for (const clip of trackClips) {
                if (clip.isPlayingAtTimelinePosition(timelineTime)) {
                    playingClips.push({
                        clip,
                        trackId,
                        bufferOffset: clip.getBufferOffsetAtTimelineTime(timelineTime)
                    });
                }
            }
        }
        
        return playingClips;
    }
    
    renderTimelinePlayback(currentTime) {
        if (!this.isPlaying) return;
        
        this.currentTime = currentTime;
        
        // Handle looping
        if (this.loopEnabled && this.currentTime >= this.loopEnd) {
            this.currentTime = this.loopStart;
            this.seekAll(this.loopStart);
        }
        
        // Get clips that should be playing at this moment
        const activeClips = this.getClipsAtTime(this.currentTime);
        
        // For each active clip, ensure track is playing the correct buffer section
        for (const { clip, trackId, bufferOffset } of activeClips) {
            const track = this.trackManager.getTrack(trackId);
            if (track && track.buffer === clip.buffer && bufferOffset >= 0) {
                // Track is already playing this buffer at correct position
                if (!track.isPlaying) {
                    track.play();
                }
                // Optionally seek if far off
                const trackTime = track.getCurrentTime();
                if (Math.abs(trackTime - bufferOffset) > 0.05) {
                    track.seek(bufferOffset);
                }
            }
        }
        
        if (this.onTimelineUpdate) {
            this.onTimelineUpdate(this.currentTime);
        }
        
        this.animationId = requestAnimationFrame(() => this.renderTimelinePlayback(this.currentTime + 0.033));
    }
    
    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.renderTimelinePlayback(this.currentTime);
    }
    
    pause() {
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.trackManager.pauseAll();
    }
    
    stop() {
        this.pause();
        this.currentTime = 0;
        this.seekAll(0);
        if (this.onTimelineUpdate) {
            this.onTimelineUpdate(0);
        }
    }
    
    seek(time) {
        this.currentTime = Math.max(0, Math.min(time, this.getMaxDuration()));
        this.seekAll(this.currentTime);
        if (this.onTimelineUpdate) {
            this.onTimelineUpdate(this.currentTime);
        }
    }
    
    seekAll(time) {
        this.trackManager.seekAll(time);
    }
    
    getMaxDuration() {
        let maxDuration = 0;
        for (const trackClips of this.clips.values()) {
            for (const clip of trackClips) {
                maxDuration = Math.max(maxDuration, clip.timelineEnd);
            }
        }
        return Math.max(maxDuration, 60);
    }
    
    snapToGrid(value) {
        if (!this.snapEnabled) return value;
        return Math.round(value / this.snapInterval) * this.snapInterval;
    }
    
    zoomIn() {
        const center = (this.viewStart + this.viewEnd) / 2;
        const range = (this.viewEnd - this.viewStart) * 0.7;
        this.viewStart = center - range / 2;
        this.viewEnd = center + range / 2;
        this.viewStart = Math.max(0, this.viewStart);
        if (this.onClipsChanged) this.onClipsChanged();
    }
    
    zoomOut() {
        const center = (this.viewStart + this.viewEnd) / 2;
        const range = (this.viewEnd - this.viewStart) * 1.4;
        this.viewStart = center - range / 2;
        this.viewEnd = center + range / 2;
        this.viewStart = Math.max(0, this.viewStart);
        if (this.onClipsChanged) this.onClipsChanged();
    }
    
    selectClip(clipId, addToSelection = false) {
        if (!addToSelection) {
            this.selectedClipIds.clear();
        }
        this.selectedClipIds.add(clipId);
        
        if (this.onSelectionChanged) {
            this.onSelectionChanged(this.selectedClipIds);
        }
    }
    
    deselectClip(clipId) {
        this.selectedClipIds.delete(clipId);
        if (this.onSelectionChanged) {
            this.onSelectionChanged(this.selectedClipIds);
        }
    }
    
    clearSelection() {
        this.selectedClipIds.clear();
        if (this.onSelectionChanged) {
            this.onSelectionChanged(this.selectedClipIds);
        }
    }
    
    setSelectionRange(start, end) {
        this.selectionStart = start;
        this.selectionEnd = end;
        if (this.onSelectionChanged) {
            this.onSelectionChanged({ start, end, type: 'range' });
        }
    }
    
    getClipsInRange(start, end) {
        const clipsInRange = [];
        for (const trackClips of this.clips.values()) {
            for (const clip of trackClips) {
                if (clip.timelineStart <= end && clip.timelineEnd >= start) {
                    clipsInRange.push(clip);
                }
            }
        }
        return clipsInRange;
    }
    
    exportTimelineState() {
        const timelineData = {
            currentTime: this.currentTime,
            loopEnabled: this.loopEnabled,
            loopStart: this.loopStart,
            loopEnd: this.loopEnd,
            viewStart: this.viewStart,
            viewEnd: this.viewEnd,
            zoom: this.zoom,
            clips: []
        };
        
        for (const [trackId, trackClips] of this.clips.entries()) {
            for (const clip of trackClips) {
                timelineData.clips.push({
                    ...clip.toJSON(),
                    trackId
                });
            }
        }
        
        return timelineData;
    }
    
    importTimelineState(data, bufferMap) {
        this.currentTime = data.currentTime || 0;
        this.loopEnabled = data.loopEnabled || false;
        this.loopStart = data.loopStart || 0;
        this.loopEnd = data.loopEnd || 60;
        this.viewStart = data.viewStart || 0;
        this.viewEnd = data.viewEnd || 30;
        
        this.clips.clear();
        
        if (data.clips) {
            for (const clipData of data.clips) {
                const clip = Clip.fromJSON(clipData, bufferMap);
                if (!this.clips.has(clip.trackId)) {
                    this.clips.set(clip.trackId, []);
                }
                this.clips.get(clip.trackId).push(clip);
            }
        }
        
        // Sort all tracks
        for (const [trackId] of this.clips) {
            this.sortClipsOnTrack(trackId);
        }
        
        if (this.onClipsChanged) {
            this.onClipsChanged();
        }
    }
    
    dispose() {
        this.pause();
        this.clips.clear();
        this.selectedClipIds.clear();
    }
}
