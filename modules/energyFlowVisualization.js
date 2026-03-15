/**
 * ═══════════════════════════════════════════════════════════════════
 *  ENERGY FLOW VISUALIZATION MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Responsibility:
 *    Renders a high-performance particle system overlay on the circuit
 *    diagram. Illustrates the movement of energy between components:
 *      • Battery ↔ DC Bus
 *      • Supercapacitor ↔ DC Bus
 *      • Motor ↔ DC Bus
 *      • Suspension Gen → Supercapacitor
 *
 *  Visualization Attributes:
 *    - Particle Velocity ∝ Power Magnitude
 *    - Particle Density  ∝ Power Magnitude
 *    - Flow Direction    ∝ Power Sign
 *    - Component Glow    ∝ Activity Level
 * ═══════════════════════════════════════════════════════════════════
 */
export class EnergyFlowVisualization {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Define paths (matching index.html SVG viewbox 600x340)
        // coordinates: { x1, y1, x2, y2 }
        this.paths = {
            batt: { x1: 150, y1: 70, x2: 300, y2: 70, color: '#f85149' }, // Batt to Bus
            sc: { x1: 150, y1: 230, x2: 300, y2: 230, color: '#3fb950' }, // SC to Bus
            motor: { x1: 300, y1: 150, x2: 450, y2: 150, color: '#f85149' }, // Bus to Motor 
            susp: { x1: 450, y1: 230, x2: 300, y2: 230, color: '#3fb950' }  // Susp to Bus
        };

        this.particles = [];
        this.maxParticlesPerPath = 30;

        // Spawn timers for each path
        this.timers = { batt: 0, sc: 0, motor: 0, susp: 0 };
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.viewScale = rect.width / 600; // Scaling factor for 600px wide SVG
    }

    /**
     * Update and render the flow particles.
     * @param {number} dt - Timestep
     * @param {object} pValues - { pBatt, pSC, pMotor, pSusp } (kW)
     */
    update(dt, pValues) {
        if (!this.ctx) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.scale(this.viewScale, this.viewScale);

        this.handlePath('batt', pValues.pBatt, '#f85149', dt);
        this.handlePath('sc', pValues.pSC, '#3fb950', dt);
        this.handlePath('motor', pValues.pMotor, '#f85149', dt);
        this.handlePath('susp', pValues.pSusp, '#3fb950', dt);

        this.updateAndDrawParticles(dt);

        this.ctx.restore();
    }

    handlePath(id, power, color, dt) {
        const absPower = Math.abs(power);
        if (absPower < 0.2) return; // Deadzone

        // Calculate spawn rate: Higher power = more frequent particles
        // 0.1s to 0.01s interval
        const spawnInterval = Math.max(0.01, 0.2 / (1 + absPower / 5));

        this.timers[id] -= dt;
        if (this.timers[id] <= 0) {
            this.spawnParticle(id, power, color);
            this.timers[id] = spawnInterval;
        }
    }

    spawnParticle(pathId, power, color) {
        const path = this.paths[pathId];
        const dir = power > 0 ? 1 : -1;

        // Motor path is physically reversed in SVG (450 -> 300)
        // so if pMotor > 0 (consuming), it flows from Bus (300) to Motor (450).
        // My path is defined x1:450, x2:300. 
        // If dir is 1, it flows x1 to x2. 
        // Let's normalize everything.

        const speed = Math.min(100 + Math.abs(power) * 10, 500);

        this.particles.push({
            pathId,
            progress: dir > 0 ? 0 : 1,
            speed: (speed / 150) * dir, // Normalised progress speed
            color: power > 0 ? color : '#3fb950', // Red for out, Green for in
            opacity: 1.0
        });
    }

    updateAndDrawParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const path = this.paths[p.pathId];

            p.progress += p.speed * dt;

            // Remove if finished
            if (p.progress > 1 || p.progress < 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Interpolate position
            const x = path.x1 + (path.x2 - path.x1) * p.progress;
            const y = path.y1 + (path.y2 - path.y1) * p.progress;

            // Draw particle pulse
            this.ctx.fillStyle = p.color;
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = p.color;

            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
}
