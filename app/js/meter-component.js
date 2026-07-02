// NekoAudio - Meter Component
// Reusable volume meter UI component for tracks and master

export class MeterComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            width: options.width || 60,
            height: options.height || 120,
            orientation: options.orientation || 'vertical', // 'vertical' or 'horizontal'
            showPeak: options.showPeak !== false,
            showClip: options.showClip !== false,
            showLabels: options.showLabels || false,
            label: options.label || '',
            ...options
        };
        
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.currentLevel = 0;
        this.peakLevel = 0;
        this.clipState = false;
        this.peakHoldFrames = 0;
        this.clipHoldFrames = 0;
        
        this.init();
    }
    
    init() {
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.options.width;
        this.canvas.height = this.options.height;
        this.canvas.className = 'volume-meter-canvas';
        this.canvas.style.display = 'block';
        
        // Add label if needed
        if (this.options.showLabels && this.options.label) {
            const label = document.createElement('div');
            label.textContent = this.options.label;
            label.style.fontSize = '10px';
            label.style.textAlign = 'center';
            label.style.marginBottom = '4px';
            label.style.color = '#aaa';
            this.container.appendChild(label);
        }
        
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        this.drawBackground();
        this.start();
    }
    
    drawBackground() {
        if (!this.ctx) return;
        
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        this.ctx.fillStyle = '#1a1a24';
        this.ctx.fillRect(0, 0, w, h);
        
        // Draw tick marks
        this.ctx.strokeStyle = '#3a3a48';
        this.ctx.lineWidth = 0.5;
        this.ctx.font = '8px monospace';
        this.ctx.fillStyle = '#666';
        
        if (this.options.orientation === 'vertical') {
            // Vertical meter ticks
            for (let db = -60; db <= 0; db += 10) {
                const y = h - (db + 60) / 60 * h;
                if (y > 0 && y < h) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(w - 8, y);
                    this.ctx.lineTo(w, y);
                    this.ctx.stroke();
                    
                    if (this.options.showLabels && db % 20 === 0) {
                        this.ctx.fillStyle = '#666';
                        this.ctx.fillText(`${db}dB`, 2, y - 2);
                    }
                }
            }
            
            // Color zones
            const greenEnd = h * 0.5;
            const yellowEnd = h * 0.25;
            
            this.ctx.fillStyle = 'rgba(46, 204, 113, 0.1)';
            this.ctx.fillRect(0, greenEnd, w, h - greenEnd);
            this.ctx.fillStyle = 'rgba(243, 156, 18, 0.1)';
            this.ctx.fillRect(0, yellowEnd, w, greenEnd - yellowEnd);
            this.ctx.fillStyle = 'rgba(231, 76, 60, 0.1)';
            this.ctx.fillRect(0, 0, w, yellowEnd);
        } else {
            // Horizontal meter ticks
            for (let db = -60; db <= 0; db += 10) {
                const x = (db + 60) / 60 * w;
                if (x > 0 && x < w) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, 0);
                    this.ctx.lineTo(x, 8);
                    this.ctx.stroke();
                }
            }
        }
    }
    
    update(level, peak = null, clipped = false) {
        // level: 0-1 range
        this.currentLevel = Math.min(1, Math.max(0, level));
        
        if (peak !== null) {
            this.peakLevel = Math.min(1, Math.max(0, peak));
            this.peakHoldFrames = 30; // Hold peak for ~0.5 seconds at 60fps
        } else if (this.currentLevel > this.peakLevel) {
            this.peakLevel = this.currentLevel;
            this.peakHoldFrames = 30;
        }
        
        if (clipped) {
            this.clipState = true;
            this.clipHoldFrames = 60; // Hold clip indicator for 1 second
        }
        
        this.draw();
    }
    
    draw() {
        if (!this.ctx) return;
        
        this.drawBackground();
        
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        if (this.options.orientation === 'vertical') {
            // Vertical bar (bottom to top)
            const barHeight = this.currentLevel * h;
            const barY = h - barHeight;
            
            // Choose color based on level
            let gradient;
            if (this.currentLevel > 0.8) {
                gradient = this.ctx.createLinearGradient(0, barY, 0, h);
                gradient.addColorStop(0, '#e74c3c');
                gradient.addColorStop(1, '#c0392b');
            } else if (this.currentLevel > 0.5) {
                gradient = this.ctx.createLinearGradient(0, barY, 0, h);
                gradient.addColorStop(0, '#f39c12');
                gradient.addColorStop(1, '#e67e22');
            } else {
                gradient = this.ctx.createLinearGradient(0, barY, 0, h);
                gradient.addColorStop(0, '#2ecc71');
                gradient.addColorStop(1, '#27ae60');
            }
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, barY, w, barHeight);
            
            // Draw peak hold line
            if (this.options.showPeak && this.peakHoldFrames > 0) {
                const peakY = h - (this.peakLevel * h);
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(0, peakY, w, 2);
                this.peakHoldFrames--;
                if (this.peakHoldFrames === 0) {
                    this.peakLevel = this.currentLevel;
                }
            }
            
            // Draw clip indicator
            if (this.options.showClip && this.clipHoldFrames > 0) {
                this.ctx.fillStyle = '#e74c3c';
                this.ctx.fillRect(0, 0, w, 4);
                this.clipHoldFrames--;
                if (this.clipHoldFrames === 0) {
                    this.clipState = false;
                }
            }
        } else {
            // Horizontal bar (left to right)
            const barWidth = this.currentLevel * w;
            
            this.ctx.fillStyle = this.currentLevel > 0.8 ? '#e74c3c' : (this.currentLevel > 0.5 ? '#f39c12' : '#2ecc71');
            this.ctx.fillRect(0, 0, barWidth, h);
            
            if (this.options.showPeak && this.peakHoldFrames > 0) {
                const peakX = this.peakLevel * w;
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(peakX, 0, 2, h);
                this.peakHoldFrames--;
            }
        }
    }
    
    start() {
        if (this.animationId) return;
        
        const drawLoop = () => {
            this.animationId = requestAnimationFrame(drawLoop);
        };
        drawLoop();
    }
    
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    reset() {
        this.currentLevel = 0;
        this.peakLevel = 0;
        this.clipState = false;
        this.peakHoldFrames = 0;
        this.clipHoldFrames = 0;
        this.draw();
    }
    
    setValue(db) {
        // Convert dB (‑60 to 0) to level (0-1)
        const level = Math.pow(10, db / 20);
        this.update(level);
    }
    
    destroy() {
        this.stop();
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.ctx = null;
        this.canvas = null;
    }
}

// Master meter (summing all tracks)
export class MasterMeter {
    constructor(container, trackManager) {
        this.container = container;
        this.trackManager = trackManager;
        this.meter = null;
        this.animationId = null;
        this.init();
    }
    
    init() {
        this.meter = document.createElement('div');
        this.meter.style.height = '100%';
        this.meter.style.width = '0%';
        this.meter.style.background = 'linear-gradient(90deg, #2ecc71, #f39c12, #e74c3c)';
        this.meter.style.borderRadius = '20px';
        this.meter.style.transition = 'width 0.05s linear';
        this.container.appendChild(this.meter);
        this.start();
    }
    
    start() {
        const updateMeter = () => {
            // Calculate master volume from all playing tracks
            let maxLevel = 0;
            const tracks = this.trackManager.getAllTracks();
            
            for (const track of tracks) {
                if (track.isPlaying && track.sourceNode && track.gainNode) {
                    // Approximate level from gain value
                    const level = track.volume;
                    if (level > maxLevel) maxLevel = level;
                }
            }
            
            // Also check if master audio engine has a buffer
            if (window.audioEngine && window.audioEngine.isPlaying) {
                const masterLevel = window.audioEngine.gainNode?.gain?.value || 0;
                if (masterLevel > maxLevel) maxLevel = masterLevel;
            }
            
            // Convert to percentage (0-100%)
            const percent = Math.min(100, Math.floor(maxLevel * 100));
            this.meter.style.width = `${percent}%`;
            
            // Change color based on level
            if (percent > 80) {
                this.meter.style.background = '#e74c3c';
            } else if (percent > 50) {
                this.meter.style.background = '#f39c12';
            } else {
                this.meter.style.background = '#2ecc71';
            }
            
            this.animationId = requestAnimationFrame(updateMeter);
        };
        
        updateMeter();
    }
    
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    destroy() {
        this.stop();
        if (this.meter) this.meter.remove();
    }
}
