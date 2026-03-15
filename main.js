/**
 * ═══════════════════════════════════════════════════════════════════
 *  HESS EV DIAGNOSTIC SIMULATOR — MAIN ENTRY POINT
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Architecture:
 *    mainLoop(currentTime)
 *    ├── updateSimulation(dt)       ← pure state, no DOM
 *    │   ├── vehicle.update(dt)
 *    │   ├── ems.update(demand, soc)
 *    │   ├── battery.update(power, dt)
 *    │   ├── supercap.update(power, dt)
 *    │   └── dashboard.recordData(…)
 *    │
 *    └── renderScene(dt)            ← all visual output
 *        ├── visualization.renderAnimation(…)
 *        ├── dashboard.update(…)
 *        ├── circuit.update(…)
 *        ├── visualization.update(…)
 *        └── surge indicator toggle
 *
 *  Timing:
 *    • requestAnimationFrame drives the loop (~60 fps).
 *    • dt is clamped to 100 ms to prevent physics instability
 *      when the browser tab is backgrounded or paused.
 *
 *  Module Dependency Graph:
 *    vehicle ──┐
 *    battery ──┤
 *    supercap ─┤──▸ ems ──▸ emsState ──┐
 *              │                        ├──▸ dashboard
 *              │                        ├──▸ circuit
 *              └────────────────────────┴──▸ visualization
 * ═══════════════════════════════════════════════════════════════════
 */
import { Vehicle } from './modules/vehicle.js';
import { Battery } from './modules/battery.js';
import { Supercapacitor } from './modules/supercap.js';
import { EMS } from './modules/ems.js';
import { Dashboard } from './modules/dashboard.js';
import { Circuit } from './modules/circuit.js';
import { Visualization } from './modules/visualization.js';
import { SuspensionSystem } from './modules/suspensionSystem.js';
import { SuspensionUI } from './modules/suspensionUI.js';
import { EnergyFlowVisualization } from './modules/energyFlowVisualization.js';

class Simulator {
    constructor() {
        // Initialize Simulation Models
        this.vehicle = new Vehicle();
        this.suspension = new SuspensionSystem();
        this.battery = new Battery();
        this.supercap = new Supercapacitor();
        this.ems = new EMS();

        // Initialize UI / Visualization
        this.visualization = new Visualization('sim-canvas');
        this.dashboard = new Dashboard();
        this.circuit = new Circuit('circuit-canvas');
        this.suspensionUI = new SuspensionUI();
        this.energyFlow = new EnergyFlowVisualization('energy-flow-canvas');

        // Link tyre click to opening the suspension inspector
        this.visualization.onTyreClick = () => this.suspensionUI.open(this.suspension);

        // Control DOM
        this.throttleInput = document.getElementById('throttle-input');
        this.brakeInput = document.getElementById('brake-input');
        this.boostBtn = document.getElementById('boost-btn');
        this.cruiseBtn = document.getElementById('cruise-btn');
        this.demoBtn = document.getElementById('demo-btn');
        this.exportBtn = document.getElementById('export-btn');

        this.throttleVal = document.getElementById('throttle-val');
        this.brakeVal = document.getElementById('brake-val');
        this.surgeIndicator = document.getElementById('surge-indicator');

        this.setupEventListeners();

        // Simulation state shared between update and render
        this.emsState = { mode: 'CRUISE', powerBatt: 0, powerSC: 0, pctBatt: 0, pctSC: 0 };

        // Timing
        this.lastTime = performance.now();

        // Start main loop
        requestAnimationFrame((t) => this.mainLoop(t));

        this.visualization.logEvent("HESS Diagnostic System Online");
        this.visualization.logEvent("Phase 6: Presentation Mode Ready");
    }

    setupEventListeners() {
        this.throttleInput.addEventListener('input', (e) => {
            if (this.dashboard.demoActive) return;
            this.vehicle.throttle = e.target.value / 100;
            this.throttleVal.textContent = `${e.target.value}%`;
            // Cancel brake if throttle is pressed
            if (this.vehicle.throttle > 0) {
                this.brakeInput.value = 0;
                this.vehicle.brake = 0;
                this.brakeVal.textContent = `0%`;
            }
        });

        this.brakeInput.addEventListener('input', (e) => {
            if (this.dashboard.demoActive) return;
            this.vehicle.brake = e.target.value / 100;
            this.brakeVal.textContent = `${e.target.value}%`;
            // Cancel throttle if brake is pressed
            if (this.vehicle.brake > 0) {
                this.throttleInput.value = 0;
                this.vehicle.throttle = 0;
                this.throttleVal.textContent = `0%`;
            }
        });

        if (this.boostBtn) {
            this.boostBtn.addEventListener('mousedown', () => {
                this.vehicle.isBoosting = true;
                this.visualization.logEvent("BOOST EVENT TRIGGERED");
            });
            this.boostBtn.addEventListener('mouseup', () => this.vehicle.isBoosting = false);
            this.boostBtn.addEventListener('mouseleave', () => this.vehicle.isBoosting = false);
            this.boostBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.vehicle.isBoosting = true; });
            this.boostBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.vehicle.isBoosting = false; });
        }

        if (this.cruiseBtn) {
            this.cruiseBtn.addEventListener('click', () => {
                if (this.dashboard.demoActive) return;
                // Set to 25% throttle for cruise demonstration
                const cruiseThrottle = 25;
                this.vehicle.throttle = cruiseThrottle / 100;
                this.throttleInput.value = cruiseThrottle;
                this.throttleVal.textContent = `${cruiseThrottle}%`;
                this.vehicle.brake = 0;
                this.brakeInput.value = 0;
                this.brakeVal.textContent = `0%`;
                this.visualization.logEvent("CRUISE MODE ACTIVATED (25% Throttle)");
            });
        }

        if (this.demoBtn) {
            this.demoBtn.addEventListener('click', () => this.dashboard.startDemo(this));
        }

        if (this.exportBtn) {
            this.exportBtn.addEventListener('click', () => this.dashboard.exportCSV());
        }

        const btnReset = document.getElementById('reset-btn'); // Re-declare for scope or assume it's a class property
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                this.dashboard.reset();
            });
        }

        const roadSelect = document.getElementById('road-select');
        if (roadSelect) {
            roadSelect.addEventListener('change', (e) => {
                this.suspension.setRoadProfile(e.target.value);
                this.visualization.logEvent(`Road profile changed to: ${e.target.value}`);
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SIMULATION UPDATE — Pure state computation, no DOM/canvas
    // ═══════════════════════════════════════════════════════════════
    updateSimulation(dt) {
        // 1. Vehicle dynamics (forces → acceleration → speed → distance)
        this.vehicle.update(dt);

        // 2. Suspension physics & generator power
        this.suspension.update(dt, this.vehicle.speed);
        const suspensionPower_kW = this.suspension.generatedPower_kW;

        // 3. EMS power-split decision
        // (Includes suspension awareness, though primary split remains deterministic)
        const powerDemand = this.vehicle.getPowerDemand();
        this.emsState = this.ems.update(powerDemand, this.supercap.soc, suspensionPower_kW);

        // 4. Battery electrochemical state update
        this.battery.update(this.emsState.powerBatt, dt);

        // 5. Supercapacitor storage update
        // Net power is now integrated into emsState.powerSC (which includes suspension offset)
        this.supercap.update(this.emsState.powerSC, dt);

        // 6. Record telemetry snapshot for CSV export
        this.dashboard.recordData(this.vehicle, this.battery, this.supercap, this.suspension);
    }

    // ═══════════════════════════════════════════════════════════════
    //  RENDER SCENE — All visual / UI updates (DOM + Canvas)
    // ═══════════════════════════════════════════════════════════════
    renderScene(dt) {
        const ems = this.emsState;

        // 1. Canvas animation scene (parallax, road, car dynamics)
        this.visualization.renderAnimation(this.vehicle, this.suspension, dt);

        // 2. Numeric dashboard readouts (speed, V/I, SOC text, mode badge)
        this.dashboard.update(this.vehicle, this.battery, this.supercap, ems, this.suspension);

        // 3. SVG circuit power-flow diagram (glows, animated paths)
        // Combine EMS power and suspension power for the supercap branch visualization
        this.circuit.update(ems, this.battery, this.supercap, this.vehicle, this.suspension.generatedPower_kW);

        // 4. Energy Flow Particle Visualization (Canvas Overlay)
        this.energyFlow.update(dt, {
            pBatt: ems.powerBatt,
            pSC: ems.powerSC,
            pMotor: this.vehicle.getPowerDemand(),
            pSusp: this.suspension.generatedPower_kW
        });

        // 5. Diagnostic visuals (gauges, SOC bars, charts, system log)
        this.visualization.update(this.vehicle, this.battery, this.supercap, ems);

        // 5. Surge indicator overlay
        if (this.surgeIndicator) {
            if (ems.mode === 'BOOST' && Math.abs(ems.powerSC) > 5) {
                this.surgeIndicator.classList.add('active');
            } else {
                this.surgeIndicator.classList.remove('active');
            }
        }

        // 6. Suspension Digital Twin Popup (if open)
        if (this.suspensionUI) {
            this.suspensionUI.update(dt);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  MAIN LOOP — requestAnimationFrame driver
    // ═══════════════════════════════════════════════════════════════
    mainLoop(currentTime) {
        // Compute dt in seconds, clamped to 100 ms to prevent
        // physics explosions when the tab is backgrounded / paused.
        let dt = (currentTime - this.lastTime) / 1000;
        if (dt > 0.1) dt = 0.1;
        this.lastTime = currentTime;

        // Phase 1 — deterministic state update (no side-effects on DOM)
        this.updateSimulation(dt);

        // Phase 2 — visual render pass (reads settled state, writes to DOM/canvas)
        this.renderScene(dt);

        // Schedule next frame
        requestAnimationFrame((t) => this.mainLoop(t));
    }
}

// Start app when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.app = new Simulator();
});
