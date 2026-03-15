/**
 * ═══════════════════════════════════════════════════════════════════
 *  SUSPENSION INSPECTION UI MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Responsibility:
 *    Manages the interactive overlay popup that visualizes the
 *    mechanical-to-electrical energy conversion in high detail.
 *
 *  Features:
 *    - Real-time animated mechanical linkage (damper, rack, pinion, generator)
 *    - Live engineering readouts
 *    - Animated energy flow indicators
 *
 *  Architecture:
 *    - Strict read-only access to the Simulation state (`suspension`).
 *    - Uses its own local `requestAnimationFrame` loop when open to
 *      decouple its rendering from the main simulation loop, while
 *      still reading the latest physics state.
 * ═══════════════════════════════════════════════════════════════════
 */
export class SuspensionUI {
    constructor() {
        this.cacheElements();

        this.isOpen = false;
        this.suspensionRef = null;
        this.generatorAngle = 0;

        this.generatorAngle = 0;

        if (this.els.canvas) {
            this.ctx = this.els.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => {
                if (this.isOpen) this.resizeCanvas();
            });
        }

        if (this.els.closeBtn) {
            this.els.closeBtn.addEventListener('click', () => this.close());
        }
    }

    cacheElements() {
        this.els = {
            overlay: document.getElementById('suspension-overlay'),
            closeBtn: document.getElementById('suspension-close'),
            canvas: document.getElementById('suspension-popup-canvas'),

            // Readouts
            valComp: document.getElementById('popup-val-comp'),
            valVel: document.getElementById('popup-val-vel'),
            valSpringForce: document.getElementById('popup-val-spring-force'),
            valDamperForce: document.getElementById('popup-val-damper-force'),
            valTorque: document.getElementById('popup-val-torque'),
            valPower: document.getElementById('popup-val-power')
        };
    }

    resizeCanvas() {
        if (!this.els.canvas) return;
        const rect = this.els.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.els.canvas.width = rect.width * dpr;
        this.els.canvas.height = rect.height * dpr;

        this.els.canvas.style.width = `${rect.width}px`;
        this.els.canvas.style.height = `${rect.height}px`;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
    }

    /**
     * Opens the inspection overlay and starts the render loop.
     * @param {object} suspension - Reference to the SuspensionSystem physics model
     */
    open(suspension) {
        if (!this.els.overlay) return;

        this.suspensionRef = suspension;
        this.isOpen = true;
        this.els.overlay.classList.add('active');

        this.resizeCanvas();
    }

    /**
     * Closes the inspection overlay and stops the render loop.
     */
    close() {
        this.isOpen = false;
        this.suspensionRef = null;
        if (this.els.overlay) {
            this.els.overlay.classList.remove('active');
        }
    }

    /**
     * Internal render loop called by main.js
     */
    update(dt) {
        if (!this.isOpen) return;

        this.render(dt);
        this.updateMetrics();
    }

    /**
     * Renders the mechanical diagram based on suspension state.
     */
    render(dt) {
        if (!this.ctx || !this.suspensionRef) return;

        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        const state = this.suspensionRef.getState();

        // Advance generator rotation based on physical omega
        this.generatorAngle += state.generatorOmega * dt;

        const centerX = this.canvasWidth / 2;
        const baseY = this.canvasHeight * 0.7; // Lower part of canvas (Wheel side)
        const topY = this.canvasHeight * 0.2;  // Upper part (Chassis side)

        // Scale compression for visual exaggeration in the popup
        const visualCompression = state.suspensionCompression * 300;

        const wheelY = baseY - visualCompression;

        this.drawMechanism(centerX, topY, wheelY, state);
    }

    drawMechanism(x, topY, bottomY, state) {
        this.ctx.save();

        // 1. Chassis Mount (Top)
        this.ctx.fillStyle = '#21262d';
        this.ctx.fillRect(x - 60, topY - 20, 120, 20);
        this.ctx.fillStyle = '#c9d1d9';
        this.ctx.textAlign = 'center';
        this.ctx.font = '12px "JetBrains Mono"';
        this.ctx.fillText('CHASSIS MOUNT', x, topY - 30);

        // 2. Damper Body (attached to chassis)
        const damperLen = Math.max(40, (bottomY - topY) * 0.5);
        this.ctx.fillStyle = '#161b22';
        this.ctx.strokeStyle = '#58a6ff';
        this.ctx.lineWidth = 2;
        this.ctx.fillRect(x - 20, topY, 40, damperLen);
        this.ctx.strokeRect(x - 20, topY, 40, damperLen);

        // 3. Damper Rod (attached to wheel)
        this.ctx.fillStyle = '#8b949e';
        this.ctx.fillRect(x - 8, topY + damperLen, 16, bottomY - (topY + damperLen));

        // 4. Spring
        this.ctx.strokeStyle = '#d29922'; // Neon yellow
        this.ctx.lineWidth = 6;
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();

        const numCoils = 8;
        const totalHeight = bottomY - topY;
        const coilHeight = totalHeight / numCoils;

        this.ctx.moveTo(x, topY);
        for (let i = 0; i < numCoils; i++) {
            let y1 = topY + (i + 0.25) * coilHeight;
            let y2 = topY + (i + 0.75) * coilHeight;
            let y3 = topY + (i + 1) * coilHeight;
            this.ctx.lineTo(x - 35, y1);
            this.ctx.lineTo(x + 35, y2);
            this.ctx.lineTo(x, y3);
        }
        this.ctx.stroke();

        // 5. Wheel Hub (Bottom)
        this.ctx.fillStyle = '#21262d';
        this.ctx.fillRect(x - 40, bottomY, 80, 20);
        this.ctx.fillStyle = '#c9d1d9';
        this.ctx.fillText('WHEEL AXLE', x, bottomY + 35);

        // 6. Rack and Pinion / Generator
        this.drawGenerator(x + 50, topY + damperLen * 0.5, bottomY, state);

        // 7. Force Vectors (Digital Twin Overlays)
        this.drawForceVectorLinear(x - 50, topY + (bottomY - topY) / 2, state.springForce, 0.015, '#3fb950', 'F_spring'); // Green
        this.drawForceVectorLinear(x + 10, topY + (bottomY - topY) / 2, state.damperForce, 0.015, '#ff9900', 'F_damper'); // Orange

        this.ctx.restore();
    }

    drawForceVectorLinear(x, y, magnitude, scale, color, label) {
        const length = magnitude * scale;
        if (Math.abs(length) < 2) return;

        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = 2;

        // Positive force pointing UP (chassis pushed up, normally y decreases)
        const sign = magnitude >= 0 ? 1 : -1;
        const endY = y - length; // if magnitude > 0, endY < y (UP)

        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x, endY);
        this.ctx.stroke();

        // Arrow head
        this.ctx.beginPath();
        this.ctx.moveTo(x, endY);
        this.ctx.lineTo(x - 4, endY + 8 * sign);
        this.ctx.lineTo(x + 4, endY + 8 * sign);
        this.ctx.fill();

        this.ctx.textAlign = 'left';
        this.ctx.font = '10px "JetBrains Mono"';
        this.ctx.fillText(label, x + 8, y - length / 2);

        this.ctx.restore();
    }

    drawTorqueVector(x, y, radius, magnitude, scale, color, label) {
        const angleEnd = magnitude * scale;
        if (Math.abs(angleEnd) < 0.1) return;

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = 2;

        this.ctx.beginPath();
        const startAng = -Math.PI / 2;
        const endAng = startAng + angleEnd;
        this.ctx.arc(0, 0, radius + 10, startAng, endAng, angleEnd < 0);
        this.ctx.stroke();

        // Arrow head
        const headAng = endAng;
        const arrowX = (radius + 10) * Math.cos(headAng);
        const arrowY = (radius + 10) * Math.sin(headAng);

        this.ctx.translate(arrowX, arrowY);
        this.ctx.rotate(headAng + (angleEnd > 0 ? Math.PI / 2 : -Math.PI / 2));

        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-4, 8);
        this.ctx.lineTo(4, 8);
        this.ctx.fill();
        this.ctx.restore();

        this.ctx.fillStyle = color;
        this.ctx.font = '10px "JetBrains Mono"';
        this.ctx.fillText(label, x + radius + 15, y - radius - 15);
    }

    drawGenerator(x, topY, bottomY, state) {
        this.ctx.save();

        // Rack (attached to moving wheel axle)
        this.ctx.fillStyle = '#c9d1d9';
        this.ctx.fillRect(x, topY, 10, bottomY - topY);
        // Rack teeth
        this.ctx.fillStyle = '#30363d';
        for (let ty = topY; ty < bottomY; ty += 8) {
            this.ctx.fillRect(x + 10, ty, 5, 4);
        }

        const pinionX = x + 15 + 20; // x + rackWidth + teethWidth + pinionRadius
        const pinionY = topY + 40;   // fixed relative to chassis/damper body

        // Pinion Gear
        this.ctx.translate(pinionX, pinionY);
        this.ctx.rotate(this.generatorAngle);

        this.ctx.beginPath();
        this.ctx.arc(0, 0, 20, 0, Math.PI * 2);
        this.ctx.fillStyle = '#484f58';
        this.ctx.fill();
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#8b949e';
        this.ctx.stroke();

        // Gear spokes for visibility
        this.ctx.beginPath();
        this.ctx.moveTo(-20, 0); this.ctx.lineTo(20, 0);
        this.ctx.moveTo(0, -20); this.ctx.lineTo(0, 20);
        this.ctx.stroke();

        // Generator Body (Background)
        this.ctx.rotate(-this.generatorAngle); // reset rotation
        this.ctx.beginPath();
        this.ctx.arc(20, 0, 30, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(63, 185, 80, 0.1)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#3fb950';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();

        this.ctx.setLineDash([]);
        this.ctx.fillStyle = '#3fb950';
        this.ctx.font = '10px "JetBrains Mono"';
        this.ctx.fillText('GENERATOR', 20, 45);

        // Torque Vector Overlay (Cyan)
        this.drawTorqueVector(20, 0, 30, state.generatorTorque, 0.005, '#00ffff', 'T_gen');

        // Energy Flow Particles representing generation
        if (state.generatedPower > 5) {
            this.ctx.fillStyle = '#3fb950';
            this.ctx.strokeStyle = '#3fb950';
            this.ctx.lineWidth = 1;

            // Flow towards the right (storage)
            this.ctx.beginPath();
            this.ctx.moveTo(60, 0);
            this.ctx.lineTo(120, 0);
            this.ctx.stroke();

            // Traveling particles
            const particleSpeed = 100; // pixels per sec
            const offset = (performance.now() / 1000 * particleSpeed) % 60;

            for (let i = 0; i < 3; i++) {
                let px = 60 + ((offset + i * 20) % 60);
                let py = 0;
                this.ctx.beginPath();
                this.ctx.arc(px, py, 3, 0, Math.PI * 2);
                this.ctx.fill();

                // Little arrow tips
                this.ctx.beginPath();
                this.ctx.moveTo(px + 4, py);
                this.ctx.lineTo(px - 2, py - 3);
                this.ctx.lineTo(px - 2, py + 3);
                this.ctx.fill();
            }

            this.ctx.font = '10px "JetBrains Mono"';
            this.ctx.fillText('TO HESS', 125, 4);
        }

        this.ctx.restore();
    }

    /**
     * Updates numeric engineering text readouts.
     */
    updateMetrics() {
        if (!this.suspensionRef) return;
        const s = this.suspensionRef.getState();

        if (this.els.valComp) this.els.valComp.textContent = (s.suspensionCompression * 1000).toFixed(1) + ' mm';
        if (this.els.valVel) this.els.valVel.textContent = s.suspensionVelocity.toFixed(2) + ' m/s';

        if (this.els.valSpringForce) this.els.valSpringForce.textContent = s.springForce.toFixed(0) + ' N';
        if (this.els.valDamperForce) this.els.valDamperForce.textContent = s.damperForce.toFixed(0) + ' N';

        if (this.els.valTorque) this.els.valTorque.textContent = s.generatorTorque.toFixed(2) + ' Nm';
        if (this.els.valPower) this.els.valPower.textContent = s.generatedPower.toFixed(0) + ' W';
    }
}
