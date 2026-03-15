/**
 * ═══════════════════════════════════════════════════════════════════
 *  VISUALIZATION MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Responsibility:
 *    All graphical / visual rendering for the HESS diagnostic UI.
 *    Combines two subsystems:
 *
 *    1. Diagnostic Visuals
 *       • SVG arc gauges (speed, power)
 *       • SOC progress bars with colour-coded thresholds
 *       • Chart.js real-time line charts (current, speed/power)
 *       • Mode-HUD colour styling
 *       • System event log
 *
 *    2. Canvas Animation (absorbed from animation.js)
 *       • Multi-layer parallax background
 *       • Procedural road with scrolling lane markings
 *       • Animated EV with suspension oscillation, pitch, and
 *         rotating wheels with spoked rims
 *       • Brake light rendering
 *       • Tyre click detection
 *
 *  This module is render-only. It reads settled state from the
 *  simulation models; it does NOT modify simulation state.
 *
 *  Key Public Methods:
 *    update(vehicle, battery, supercap, emsState)  – diagnostics
 *    renderAnimation(vehicle, dt)                  – canvas scene
 *    logEvent(message)                             – system log
 * ═══════════════════════════════════════════════════════════════════
 */
export class Visualization {
    constructor() {
        this.charts = {};
        this.dataPoints = 60; // Keep last 60 points
        this.lastMode = null;

        // Logs
        this.eventLog = [];
        this.maxLogs = 8;

        // Interaction
        this.onTyreClick = null; // Callback for UI
        this.wheelHitboxes = []; // Store wheel regions: {x, y, r}

        this.initCharts();
        this.initGauges();
        this.cacheElements();
        this.initAnimation();
    }

    // ───────────────── DOM Cache ─────────────────
    cacheElements() {
        this.els = {
            log: document.getElementById('system-log'),
            modeHUD: document.getElementById('ems-mode-display'),
            battBar: document.getElementById('bar-batt-soc'),
            scBar: document.getElementById('bar-sc-soc'),
            battSocText: document.getElementById('val-batt-soc'),
            scSocText: document.getElementById('val-sc-soc')
        };
    }

    // ───────────────── Chart.js Setup ─────────────────
    initCharts() {
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { display: false },
                y: {
                    grid: { color: '#30363d' },
                    ticks: { color: '#8b949e', font: { size: 10 } }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#c9d1d9', font: { size: 10 }, boxWidth: 10 }
                }
            },
            elements: {
                line: { tension: 0.3, borderWidth: 2 },
                point: { radius: 0 }
            }
        };

        // Current Chart
        this.charts.current = new Chart(document.getElementById('chart-current'), {
            type: 'line',
            data: {
                labels: Array(this.dataPoints).fill(''),
                datasets: [
                    { label: 'Battery (A)', borderColor: '#58a6ff', data: Array(this.dataPoints).fill(0) },
                    { label: 'Supercap (A)', borderColor: '#d29922', data: Array(this.dataPoints).fill(0) }
                ]
            },
            options: commonOptions
        });

        // Speed & Power Chart
        this.charts.speedPower = new Chart(document.getElementById('chart-speed-power'), {
            type: 'line',
            data: {
                labels: Array(this.dataPoints).fill(''),
                datasets: [
                    { label: 'Speed (km/h)', borderColor: '#3fb950', data: Array(this.dataPoints).fill(0) },
                    { label: 'Power (kW)', borderColor: '#f85149', data: Array(this.dataPoints).fill(0) }
                ]
            },
            options: commonOptions
        });
    }

    // ───────────────── SVG Gauges ─────────────────
    initGauges() {
        this.setupGauge('gauge-speed', '#58a6ff', 180); // 180 km/h max
        this.setupGauge('gauge-power', '#f85149', 100); // 100 kW max
    }

    setupGauge(id, color, max) {
        const container = document.getElementById(id);
        if (!container) return;

        container.innerHTML = `
            <svg viewBox="0 0 100 60" style="width: 100%; height: 100%;">
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#21262d" stroke-width="8" stroke-linecap="round"/>
                <path id="${id}-fill" d="M 10 50 A 40 40 0 0 1 10 50" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/>
                <text x="50" y="45" id="${id}-val" text-anchor="middle" fill="#fff" font-family="JetBrains Mono" font-weight="700" font-size="12">0</text>
            </svg>
        `;
    }

    updateGauge(id, val, max) {
        const fill = document.getElementById(`${id}-fill`);
        const text = document.getElementById(`${id}-val`);
        if (!fill || !text) return;

        const absVal = Math.abs(val);
        const ratio = Math.min(absVal / max, 1);

        const startAngle = Math.PI;
        const currentAngle = startAngle - (ratio * Math.PI);

        const x = 50 + 40 * Math.cos(currentAngle);
        const y = 50 - 40 * Math.sin(currentAngle);

        // For a semi-circle gauge (180 deg), the arc never exceeds 180, so largeArc is always 0
        fill.setAttribute('d', `M 10 50 A 40 40 0 0 1 ${x} ${y}`);
        text.textContent = Math.round(val);
    }

    // ───────────────── SOC Bars ─────────────────
    updateSOCBar(bar, text, soc) {
        if (!bar || !text) return;
        bar.style.width = `${soc.toFixed(1)}%`;
        text.textContent = `${soc.toFixed(1)}%`;

        if (soc > 50) {
            bar.style.backgroundColor = 'var(--neon-green)';
            bar.style.boxShadow = '0 0 10px rgba(63, 185, 80, 0.4)';
        } else if (soc > 20) {
            bar.style.backgroundColor = 'var(--neon-yellow)';
            bar.style.boxShadow = '0 0 10px rgba(210, 153, 34, 0.4)';
        } else {
            bar.style.backgroundColor = 'var(--neon-red)';
            bar.style.boxShadow = '0 0 10px rgba(248, 81, 73, 0.4)';
        }
    }

    // ───────────────── Chart Data Push ─────────────────
    updateChartData(chart, values) {
        chart.data.datasets.forEach((dataset, i) => {
            dataset.data.shift();
            dataset.data.push(values[i]);
        });
        chart.update('none');
    }

    // ───────────────── Diagnostic Update (per frame) ─────────────────
    update(vehicle, battery, supercap, emsState) {
        // 1. Mode change log + HUD colour
        if (this.lastMode !== emsState.mode) {
            this.logEvent(`System entered ${emsState.mode} mode`);
            this.lastMode = emsState.mode;

            if (this.els.modeHUD) {
                this.els.modeHUD.textContent = emsState.mode + " MODE";
                this.els.modeHUD.className = 'mode-text';
                if (emsState.mode === 'BOOST') this.els.modeHUD.style.color = 'var(--neon-yellow)';
                else if (emsState.mode === 'REGEN') this.els.modeHUD.style.color = 'var(--neon-green)';
                else this.els.modeHUD.style.color = 'var(--neon-blue)';
            }
        }

        // 2. Gauges
        this.updateGauge('gauge-speed', vehicle.getSpeedKmh(), 180);
        this.updateGauge('gauge-power', vehicle.getPowerDemand(), 100);

        // 3. SOC Bars
        this.updateSOCBar(this.els.battBar, this.els.battSocText, battery.soc);
        this.updateSOCBar(this.els.scBar, this.els.scSocText, supercap.soc);

        // 4. Charts
        this.updateChartData(this.charts.current, [battery.current, supercap.current]);
        this.updateChartData(this.charts.speedPower, [vehicle.getSpeedKmh(), vehicle.getPowerDemand()]);
    }

    // ───────────────── System Log ─────────────────
    logEvent(message) {
        if (!this.els.log) return;
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        entry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
        this.els.log.prepend(entry);

        if (this.els.log.children.length > 50) {
            this.els.log.removeChild(this.els.log.lastChild);
        }
    }

    // ═══════════════════════════════════════════════
    //  ANIMATION (absorbed from animation.js)
    // ═══════════════════════════════════════════════

    initAnimation() {
        this.canvas = document.getElementById('simulation-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Handle resizing
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Load assets
        this.carImg = new Image();
        this.carImg.src = 'assets/car.svg';

        this.bgImg = new Image();
        this.bgImg.src = 'assets/background.svg';

        this.bgOffset = 0;
        this.wheelRotation = 0;
        this.animTime = 0;

        // Parallax Layers - Cityscape inspired by reference image
        this.layers = [
            // Background city block (tallest, darkest grey for depth)
            { type: 'city', speed: 0.05, offset: 0, color: '#30363d', height: 350, windowColor: '#161b22' },
            // Mid city block (medium grey)
            { type: 'city', speed: 0.15, offset: 0, color: '#484f58', height: 260, windowColor: '#21262d' },
            // Foreground city block (lightest grey)
            { type: 'city', speed: 0.40, offset: 0, color: '#8b949e', height: 160, windowColor: '#30363d' },
            // Road background hills mask
            { type: 'hills', speed: 1.0, offset: 0, color: '#1c2128', height: 40 }
        ];

        this.canvas.addEventListener('click', (e) => this.handleClick(e));
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();

        // Calculate click coordinates relative to internal canvas resolution
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;

        // Check against wheel hitboxes
        for (let box of this.wheelHitboxes) {
            const dx = clickX - box.x;
            const dy = clickY - box.y;
            // Add a little padding to the radius for easier clicking
            if (dx * dx + dy * dy <= (box.r + 20) * (box.r + 20)) {
                if (typeof this.onTyreClick === 'function') {
                    this.onTyreClick();
                }
                break; // Handled
            }
        }
    }

    resizeCanvas() {
        let dpr = window.devicePixelRatio || 1;
        let rect = this.canvas.parentElement.getBoundingClientRect();

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        this.ctx.scale(dpr, dpr);
        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
    }

    renderAnimation(vehicle, suspension, dt) {
        this.animTime += dt;
        this.wheelHitboxes = []; // Clear for this frame

        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        // 1. Parallax Background
        this.ctx.fillStyle = '#010409';
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        this.layers.forEach((layer) => {
            layer.offset -= vehicle.speed * dt * layer.speed * 50;
            // The cityscape needs an offset that loops seamlessly on a wider boundary, modulo trick
            if (layer.offset <= -this.canvasWidth * 2) layer.offset = 0;

            if (layer.type === 'city') {
                this.drawProceduralCity(layer);
            } else {
                this.ctx.fillStyle = layer.color;
                this.drawProceduralLayer(layer);
            }
        });

        // 2. Road
        this.drawRoad(vehicle, suspension, dt);

        // 3. Car
        this.drawCar(vehicle, suspension, dt);
    }

    drawProceduralCity(layer) {
        const h = this.canvasHeight - 50; // Road level

        let startX = Math.floor(-layer.offset / 150) * 150;
        let endX = startX + this.canvasWidth + 300;

        for (let bx = startX; bx < endX; bx += 150) {
            const seed = bx * 137.5;

            // Varied building architecture
            const bWidth = 80 + (Math.abs(Math.sin(seed)) * 60);
            const bHeight = layer.height + (Math.sin(seed * 1.3) * 60);

            const screenX = layer.offset + bx;

            // Ensure gap between some buildings
            if (Math.abs(Math.cos(seed * 2)) > 0.8 && layer.speed < 0.2) continue;

            this.ctx.fillStyle = layer.color;

            // Base block
            this.ctx.fillRect(screenX, h - bHeight, bWidth, bHeight);

            // Roof features (stepped roof or spire)
            const roofType = Math.abs(Math.sin(seed * 3));
            if (roofType > 0.6) {
                // Stepped roof like a skyscraper
                const stepW = bWidth * 0.6;
                const stepH = 30 + (roofType * 20);
                this.ctx.fillRect(screenX + (bWidth - stepW) / 2, h - bHeight - stepH, stepW, stepH);

                // Second step?
                if (roofType > 0.8) {
                    const step2W = stepW * 0.5;
                    const step2H = 20 + (roofType * 10);
                    this.ctx.fillRect(screenX + (bWidth - step2W) / 2, h - bHeight - stepH - step2H, step2W, step2H);
                }
            } else if (roofType < 0.2) {
                // Antenna
                this.ctx.fillRect(screenX + bWidth / 2 - 2, h - bHeight - 40, 4, 40);
                // Top rim
                this.ctx.fillRect(screenX - 5, h - bHeight, bWidth + 10, 8);
            }

            // Draw clean vector window grids
            this.ctx.fillStyle = layer.windowColor;
            const windowW = 10;
            const windowH = 15;
            const gapX = 8;
            const gapY = 10;

            const cols = Math.floor(bWidth / (windowW + gapX));
            const rows = Math.floor((bHeight - 20) / (windowH + gapY));

            const offsetX = (bWidth - (cols * (windowW + gapX) - gapX)) / 2;

            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    const winX = screenX + offsetX + c * (windowW + gapX);
                    const winY = h - bHeight + 20 + r * (windowH + gapY);

                    // Specific window patterns (strips vs single blocks)
                    const styleSeed = Math.abs(Math.cos(seed));
                    if (styleSeed > 0.7) {
                        // Horizontal strip windows
                        if (c === 0 && r % 2 === 0) {
                            this.ctx.fillRect(screenX + offsetX, winY, bWidth - offsetX * 2, windowH);
                        }
                    } else if (styleSeed < 0.3) {
                        // Vertical strip windows
                        if (r === 0 && c % 2 === 0) {
                            this.ctx.fillRect(winX, h - bHeight + 20, windowW, bHeight - 40);
                        }
                    } else {
                        // Standard blocks, maybe skip some randomly for realism
                        if (Math.abs(Math.sin(seed + c * 7 + r * 13)) < 0.8) {
                            this.ctx.fillRect(winX, winY, windowW, windowH);
                        }
                    }
                }
            }
        }
    }

    drawProceduralLayer(layer) {
        const h = this.canvasHeight - layer.height - 50;
        this.ctx.beginPath();
        this.ctx.moveTo(layer.offset, h);

        for (let x = 0; x <= this.canvasWidth * 4; x += 100) {
            const seed = (Math.floor((x - layer.offset) / 100) * 100);
            const randH = (Math.abs(Math.sin(seed * 0.01)) * layer.height);
            this.ctx.lineTo(layer.offset + x, h - randH);
            this.ctx.lineTo(layer.offset + x + 80, h - randH);
            this.ctx.lineTo(layer.offset + x + 100, h);
        }

        this.ctx.lineTo(layer.offset + this.canvasWidth * 4, this.canvasHeight);
        this.ctx.lineTo(layer.offset, this.canvasHeight);
        this.ctx.closePath();
        this.ctx.fill();
    }

    drawRoad(vehicle, suspension, dt) {
        const roadY = this.canvasHeight - 50;

        // Draw physical road disturbance (wavy surface)
        this.ctx.fillStyle = '#1c2128';
        this.ctx.strokeStyle = '#30363d'; // Add border to separate from background
        this.ctx.lineWidth = 4;

        this.ctx.beginPath();
        this.ctx.moveTo(-100, this.canvasHeight);
        this.ctx.lineTo(-100, roadY);

        this.bgOffset -= vehicle.speed * dt * 50; // Visual scroll speed

        // Use the physics engine's computeRoadDisplacement function to draw the actual road profile
        // We draw the profile from -100px to canvasWidth + 100px
        const points = 100;
        const dx = (this.canvasWidth + 200) / points;

        for (let i = 0; i <= points; i++) {
            const screenX = -100 + i * dx;
            // Map screen X to simulation time offset.
            // 50 visual pixels roughly equals 1 meter, speed is m/s.
            const distanceOffset = (screenX - 150) / 200; // carX is around 150

            // Evaluate road displacement cleanly at this spatial offset without mutating physics core time
            let roadH = suspension.computeRoadDisplacement(vehicle.speed, dt, distanceOffset) * 400; // Unified scale 400

            this.ctx.lineTo(screenX, roadY - roadH);
        }

        this.ctx.lineTo(this.canvasWidth + 100, this.canvasHeight);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // Draw road dashed line
        this.ctx.strokeStyle = '#30363d';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([20, 20]);
        this.ctx.lineDashOffset = this.bgOffset; // Scroll dash line
        this.ctx.beginPath();
        this.ctx.moveTo(0, roadY + 25);
        this.ctx.lineTo(this.canvasWidth, roadY + 25);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawCar(vehicle, suspension, dt) {
        let carWidth = 400;
        let carHeight = 120;
        let carX = 130;

        // SCALE_FACTOR unifies `bodyPosition` (car chassis movement) with `roadDisplacement` (physical bump amplitude)
        // 1 meter = 400 pixels on screen
        const SCALE_FACTOR = 400;

        // Base coordinate constraints
        let urlRoadY = this.canvasHeight - 50;
        let wheelRadius = 22 * 0.9; // 19.8px
        let wheelBaseY = 35; // Aligns perfectly with the cy=95 centers in the 120h SVG

        // Calculate global coordinates such that at neutral 0 compression, tyres exactly touch the road
        let globalWheelYWhenFlat = urlRoadY - wheelRadius;
        let carCenterYBase = globalWheelYWhenFlat - wheelBaseY;

        // Body simulation effects
        let osc = Math.sin(this.animTime * 8) * (Math.abs(vehicle.acceleration) * 0.2);
        let pitch = vehicle.acceleration * -0.5;

        // Immersive "feel": High-velocity suspension movements translate to subtle camera jitter
        let cameraShakeY = (Math.random() - 0.5) * Math.min(Math.abs(suspension.suspensionVelocity) * 3, 5);
        let cameraShakeX = (Math.random() - 0.5) * Math.min(Math.abs(suspension.suspensionVelocity) * 1, 3);

        // Calculate active physical center of the car body in canvas space
        let activeCarCenterY = carCenterYBase + osc - (suspension.bodyPosition * SCALE_FACTOR) + cameraShakeY;
        let activeCarCenterX = carX + carWidth / 2 + cameraShakeX;

        // Dynamic Drop Shadow (Darkens and tightens when vehicle compresses towards road)
        this.ctx.save();
        this.ctx.translate(activeCarCenterX, urlRoadY + 5);
        this.ctx.scale(1, 0.15); // Squash to an ellipse
        this.ctx.beginPath();
        let shadowWidth = carWidth * 0.9 - (suspension.bodyPosition * 400) * 1.5;
        this.ctx.arc(0, 0, Math.max(shadowWidth / 2, 50), 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(0, 0, 0, ${0.4 - suspension.bodyPosition})`;
        this.ctx.fill();
        this.ctx.restore();

        // Save layout context for Car render stack
        this.ctx.save();
        this.ctx.translate(activeCarCenterX, activeCarCenterY);
        this.ctx.rotate(pitch * Math.PI / 180);

        // Anti-aliased Kinematics: 
        // Prevent "wagon-wheel" effect by capping angular velocity steps visually
        let omega = vehicle.speed / 0.33;
        let visualOmega = omega;
        let maxStep = Math.PI / 3;
        if (visualOmega * dt > maxStep) {
            visualOmega = maxStep / dt;
        }
        this.wheelRotation += visualOmega * dt;

        // Physical compression forces the wheel closer to the chassis
        let wheelLocalY = wheelBaseY + (suspension.suspensionCompression * SCALE_FACTOR);

        // Render Car Body First
        if (this.carImg.complete) {
            this.ctx.drawImage(this.carImg, -carWidth / 2, -carHeight / 2, carWidth, carHeight);
        } else {
            this.ctx.fillStyle = '#58a6ff';
            this.ctx.fillRect(-carWidth / 2, -carHeight / 2, carWidth, carHeight);
        }

        // Draw Brake Light over the body (Now at the rear/left)
        if (vehicle.brake > 0) {
            this.drawBrakeLight(-carWidth / 2 + 15, -carHeight / 2 + 55);
        }

        // Render Wheels & Struts AFTER the body so they are certainly visible (diagnostic prioritize)
        // Corrected wheel base positions for the orange car profile
        const rearWheelX = -110;
        const frontWheelX = 110;

        this.drawSuspensionStrut(rearWheelX, 0, wheelLocalY);
        this.drawSuspensionStrut(frontWheelX, 0, wheelLocalY);
        this.drawWheel(rearWheelX, wheelLocalY, wheelRadius, omega);
        this.drawWheel(frontWheelX, wheelLocalY, wheelRadius, omega);

        this.ctx.restore();
    }

    drawBrakeLight(x, y) {
        this.ctx.save();
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#f85149';
        this.ctx.fillStyle = '#f85149';
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, 10, 25, [2, 0, 0, 2]);
        this.ctx.fill();
        this.ctx.restore();
    }

    drawSuspensionStrut(x, startY, endY) {
        this.ctx.save();

        // 1. Damper body (attached to chassis)
        this.ctx.fillStyle = '#1c2128';
        this.ctx.strokeStyle = '#30363d';
        this.ctx.lineWidth = 1;
        const damperLen = Math.max(10, (endY - startY) * 0.6); // Covers 60% of distance
        this.ctx.fillRect(x - 5, startY, 10, damperLen);
        this.ctx.strokeRect(x - 5, startY, 10, damperLen);

        // 2. Damper rod (metallic rod plunging into body)
        this.ctx.strokeStyle = '#c9d1d9';
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(x, startY + damperLen);
        this.ctx.lineTo(x, endY);
        this.ctx.stroke();

        // 3. Coil spring (drawn as a zig-zag wrapped around damper)
        this.ctx.strokeStyle = '#d29922'; // Neon yellow accent for energy harvesting spring
        this.ctx.lineWidth = 3;
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();

        const numCoils = 6;
        const totalHeight = endY - startY;
        const coilHeight = totalHeight / numCoils;

        this.ctx.moveTo(x, startY);
        for (let i = 0; i < numCoils; i++) {
            let y1 = startY + (i + 0.25) * coilHeight;
            let y2 = startY + (i + 0.75) * coilHeight;
            let y3 = startY + (i + 1) * coilHeight;
            this.ctx.lineTo(x - 8, y1);
            this.ctx.lineTo(x + 8, y2);
            this.ctx.lineTo(x, y3);
        }
        this.ctx.stroke();

        this.ctx.restore();
    }

    drawWheel(x, y, radius, omega) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(this.wheelRotation);

        // Store hitbox for interaction
        this.wheelHitboxes.push({ x: this.ctx.getTransform().e, y: this.ctx.getTransform().f, r: radius });

        // Tire
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#0d1117';
        this.ctx.fill();
        this.ctx.strokeStyle = '#161b22';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        // Rim
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
        this.ctx.fillStyle = '#21262d';
        this.ctx.fill();

        // Spokes
        this.ctx.strokeStyle = '#c9d1d9';
        this.ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(radius * 0.65, 0);
            this.ctx.stroke();
            this.ctx.rotate(Math.PI * 2 / 8);
        }

        // Asymmetric Detail: Valve Stem / Marker to make rotation highly visible
        this.ctx.fillStyle = '#f85149'; // Bright red marker
        this.ctx.beginPath();
        this.ctx.arc(radius * 0.55, 0, 3, 0, Math.PI * 2);
        this.ctx.fill();

        // Hub
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
        this.ctx.fillStyle = '#484f58';
        this.ctx.fill();

        // Speed Blur Ring for Kinetic Immersive Effect
        if (omega && Math.abs(omega) > 20) {
            this.ctx.beginPath();
            this.ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
            let alpha = Math.min((Math.abs(omega) - 20) / 100, 0.4);
            this.ctx.strokeStyle = `rgba(201, 209, 217, ${alpha})`;
            this.ctx.lineWidth = 6;
            this.ctx.stroke();
        }

        this.ctx.restore();
    }
}
