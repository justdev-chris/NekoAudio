// NekoAudio - Drag & Drop Handler
// Manages file drag-drop to timeline, clip dragging, and reordering

export class DragDropHandler {
    constructor(timeline, trackManager, audioEngine, ui) {
        this.timeline = timeline;
        this.trackManager = trackManager;
        this.audioEngine = audioEngine;
        this.ui = ui;
        
        // DOM elements
        this.timelineContainer = null;
        this.trackListContainer = null;
        
        // Drag state
        this.isDragging = false;
        this.dragType = null; // 'file', 'clip', 'timeline-selection'
        this.dragClip = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartTimeline = 0;
        this.dragStartTrackIndex = 0;
        
        // Drop preview
        this.dropPreview = null;
        
        // Callbacks
        this.onFileDropped = null;
        this.onClipMoved = null;
        this.onTrackReordered = null;
        
        this.init();
    }
    
    init() {
        this.setupGlobalDragDrop();
        this.setupTimelineDragDrop();
        this.setupClipDragging();
    }
    
    setupGlobalDragDrop() {
        // Prevent default drag behavior on entire page
        document.body.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        document.body.addEventListener('drop', (e) => {
            e.preventDefault();
        });
        
        // File drop zone (the waveform container area)
        const dropZone = document.getElementById('dropzone');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = '#ff6d5a';
            });
            
            dropZone.addEventListener('dragleave', () => {
                dropZone.style.borderColor = '#3a3a48';
            });
            
            dropZone.addEventListener('drop', async (e) => {
                e.preventDefault();
                dropZone.style.borderColor = '#3a3a48';
                const files = Array.from(e.dataTransfer.files);
                const audioFiles = files.filter(f => f.type.includes('audio') || f.type.includes('video'));
                
                if (audioFiles.length > 0) {
                    await this.handleFileDrop(audioFiles[0], e.clientX, e.clientY);
                }
            });
        }
    }
    
    async handleFileDrop(file, mouseX, mouseY) {
        const statusMsg = document.getElementById('statusMsg');
        if (statusMsg) statusMsg.textContent = 'Loading audio...';
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = await this.audioEngine.decodeAudioData(arrayBuffer);
            
            let targetTrack = this.trackManager.getTrackByIndex(0);
            if (!targetTrack) {
                targetTrack = this.trackManager.createTrack();
            }
            
            let timelinePos = this.getTimelinePositionFromX(mouseX);
            timelinePos = this.timeline.snapEnabled ? 
                this.timeline.snapToGrid(timelinePos) : timelinePos;
            
            // Pass the filename to addClip
            const clip = this.timeline.addClip(targetTrack.id, buffer, timelinePos, 0, null, file.name);
            
            if (clip && this.onFileDropped) {
                this.onFileDropped(clip, file);
            }
            
            if (statusMsg) statusMsg.textContent = `Loaded: ${file.name}`;
            
            if (this.ui && this.ui.renderTimeline) {
                this.ui.renderTimeline();
            }
        } catch (err) {
            console.error('Failed to load audio:', err);
            if (statusMsg) statusMsg.textContent = 'Failed to load audio';
        }
    }
    
    setupTimelineDragDrop() {
        // This will be called when timeline container is available
        this.timelineContainer = document.getElementById('timelineCanvas');
        
        if (this.timelineContainer) {
            this.timelineContainer.addEventListener('mousedown', (e) => {
                this.startTimelineSelectionDrag(e);
            });
            
            this.timelineContainer.addEventListener('mousemove', (e) => {
                if (this.isDragging && this.dragType === 'timeline-selection') {
                    this.updateTimelineSelection(e);
                }
            });
            
            document.addEventListener('mouseup', () => {
                if (this.isDragging && this.dragType === 'timeline-selection') {
                    this.endTimelineSelectionDrag();
                }
            });
        }
    }
    
    setupClipDragging() {
        // Delegate clip drag events - to be attached when clips are rendered
        document.addEventListener('mousedown', (e) => {
            const clipElement = e.target.closest('.timeline-clip');
            if (clipElement) {
                this.startClipDrag(e, clipElement);
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging && this.dragType === 'clip') {
                this.updateClipDrag(e);
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isDragging && this.dragType === 'clip') {
                this.endClipDrag();
            }
        });
    }
    
    startClipDrag(e, clipElement) {
        e.preventDefault();
        
        const clipId = parseInt(clipElement.dataset.clipId);
        const trackId = parseInt(clipElement.dataset.trackId);
        
        this.dragClip = this.findClipById(clipId, trackId);
        if (!this.dragClip) return;
        
        this.isDragging = true;
        this.dragType = 'clip';
        this.dragStartX = e.clientX;
        this.dragStartTimeline = this.dragClip.timelineStart;
        this.dragStartTrackIndex = this.trackManager.getTrack(trackId)?.index || 0;
        
        // Create drag preview
        this.createDropPreview(clipElement);
        
        // Add dragging class
        clipElement.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
    }
    
    updateClipDrag(e) {
        if (!this.dragClip) return;
        
        const deltaX = e.clientX - this.dragStartX;
        const deltaTimeline = this.pixelsToSeconds(deltaX);
        let newTimelineStart = this.dragStartTimeline + deltaTimeline;
        
        if (this.timeline.snapEnabled) {
            newTimelineStart = this.timeline.snapToGrid(newTimelineStart);
        }
        
        // Update preview position
        if (this.dropPreview) {
            const previewX = this.secondsToPixels(newTimelineStart);
            this.dropPreview.style.left = `${previewX}px`;
        }
        
        // Check for track change (vertical movement)
        const deltaY = e.clientY - this.dragStartY;
        const trackHeight = 80; // Approximate track height in pixels
        const trackDelta = Math.round(deltaY / trackHeight);
        const newTrackIndex = Math.max(0, this.dragStartTrackIndex + trackDelta);
        const newTrack = this.trackManager.getTrackByIndex(newTrackIndex);
        
        if (newTrack && newTrack.id !== this.dragClip.trackId) {
            // Highlight potential new track
            this.highlightTrack(newTrackIndex);
        }
    }
    
    endClipDrag() {
        if (!this.dragClip) return;
        
        // Apply final position
        const finalPreview = this.dropPreview;
        if (finalPreview) {
            const finalLeft = parseFloat(finalPreview.style.left);
            const finalTimelinePos = this.pixelsToSeconds(finalLeft);
            
            this.timeline.moveClip(this.dragClip.id, finalTimelinePos);
        }
        
        // Clean up
        this.removeDropPreview();
        this.clearTrackHighlights();
        
        const draggingElement = document.querySelector('.timeline-clip.dragging');
        if (draggingElement) draggingElement.classList.remove('dragging');
        
        this.isDragging = false;
        this.dragType = null;
        this.dragClip = null;
        document.body.style.cursor = '';
        
        if (this.onClipMoved) {
            this.onClipMoved(this.dragClip);
        }
        
        if (this.ui && this.ui.renderTimeline) {
            this.ui.renderTimeline();
        }
    }
    
    startTimelineSelectionDrag(e) {
        const rect = this.timelineContainer?.getBoundingClientRect();
        if (!rect) return;
        
        this.isDragging = true;
        this.dragType = 'timeline-selection';
        this.dragStartX = e.clientX;
        this.dragStartTimeline = this.pixelsToSeconds(e.clientX - rect.left);
        
        // Start selection
        this.timeline.setSelectionRange(this.dragStartTimeline, this.dragStartTimeline);
        this.createSelectionRect(e.clientX - rect.left);
    }
    
    updateTimelineSelection(e) {
        const rect = this.timelineContainer?.getBoundingClientRect();
        if (!rect) return;
        
        const currentX = e.clientX - rect.left;
        const currentTimeline = this.pixelsToSeconds(currentX);
        
        const start = Math.min(this.dragStartTimeline, currentTimeline);
        const end = Math.max(this.dragStartTimeline, currentTimeline);
        
        this.timeline.setSelectionRange(start, end);
        this.updateSelectionRect(currentX);
    }
    
    endTimelineSelectionDrag() {
        this.isDragging = false;
        this.dragType = null;
        this.removeSelectionRect();
        
        if (this.onClipMoved) {
            this.onClipMoved({ type: 'selection', range: this.timeline });
        }
    }
    
    createDropPreview(clipElement) {
        this.removeDropPreview();
        
        this.dropPreview = clipElement.cloneNode(true);
        this.dropPreview.classList.add('drop-preview');
        this.dropPreview.style.position = 'absolute';
        this.dropPreview.style.opacity = '0.5';
        this.dropPreview.style.pointerEvents = 'none';
        this.dropPreview.style.zIndex = '9999';
        
        const rect = clipElement.getBoundingClientRect();
        this.dropPreview.style.left = `${rect.left}px`;
        this.dropPreview.style.top = `${rect.top}px`;
        this.dropPreview.style.width = `${rect.width}px`;
        
        document.body.appendChild(this.dropPreview);
    }
    
    removeDropPreview() {
        if (this.dropPreview) {
            this.dropPreview.remove();
            this.dropPreview = null;
        }
    }
    
    createSelectionRect(startX) {
        this.removeSelectionRect();
        
        this.selectionRect = document.createElement('div');
        this.selectionRect.className = 'timeline-selection-rect';
        this.selectionRect.style.position = 'absolute';
        this.selectionRect.style.top = '0';
        this.selectionRect.style.left = `${startX}px`;
        this.selectionRect.style.width = '0';
        this.selectionRect.style.height = '100%';
        this.selectionRect.style.backgroundColor = 'rgba(255, 109, 90, 0.2)';
        this.selectionRect.style.border = '1px solid #ff6d5a';
        this.selectionRect.style.pointerEvents = 'none';
        this.selectionRect.style.zIndex = '100';
        
        if (this.timelineContainer) {
            this.timelineContainer.style.position = 'relative';
            this.timelineContainer.appendChild(this.selectionRect);
        }
    }
    
    updateSelectionRect(currentX) {
        if (!this.selectionRect) return;
        
        const startX = this.secondsToPixels(this.dragStartTimeline);
        const left = Math.min(startX, currentX);
        const width = Math.abs(currentX - startX);
        
        this.selectionRect.style.left = `${left}px`;
        this.selectionRect.style.width = `${width}px`;
    }
    
    removeSelectionRect() {
        if (this.selectionRect) {
            this.selectionRect.remove();
            this.selectionRect = null;
        }
    }
    
    highlightTrack(trackIndex) {
        this.clearTrackHighlights();
        const trackElement = document.querySelector(`.track-strip[data-track-index="${trackIndex}"]`);
        if (trackElement) {
            trackElement.classList.add('track-highlight');
            this.highlightedTrack = trackIndex;
        }
    }
    
    clearTrackHighlights() {
        if (this.highlightedTrack !== undefined) {
            const prevTrack = document.querySelector(`.track-strip[data-track-index="${this.highlightedTrack}"]`);
            if (prevTrack) prevTrack.classList.remove('track-highlight');
            this.highlightedTrack = undefined;
        }
    }
    
    findClipById(clipId, trackId) {
        const trackClips = this.timeline.clips.get(trackId);
        if (trackClips) {
            return trackClips.find(c => c.id === clipId);
        }
        return null;
    }
    
    getTimelinePositionFromX(clientX) {
        const rect = this.timelineContainer?.getBoundingClientRect();
        if (!rect) return 0;
        
        const x = clientX - rect.left;
        return this.pixelsToSeconds(x);
    }
    
    pixelsToSeconds(pixels) {
        const timelineWidth = this.timelineContainer?.clientWidth || 1000;
        const visibleDuration = this.timeline.viewEnd - this.timeline.viewStart;
        return this.timeline.viewStart + (pixels / timelineWidth) * visibleDuration;
    }
    
    secondsToPixels(seconds) {
        const timelineWidth = this.timelineContainer?.clientWidth || 1000;
        const visibleDuration = this.timeline.viewEnd - this.timeline.viewStart;
        return ((seconds - this.timeline.viewStart) / visibleDuration) * timelineWidth;
    }
    
    setTimelineContainer(container) {
        this.timelineContainer = container;
        this.setupTimelineDragDrop();
    }
    
    setTrackListContainer(container) {
        this.trackListContainer = container;
    }
}
