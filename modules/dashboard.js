/**
 * ═══════════════════════════════════════════════════════════════════
 *  DASHBOARD MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Responsibility:
 *    Owns all numeric readout DOM elements and updates them each
 *    frame from settled simulation state. Also manages:
 *      • Demo mode sequencing  (automated throttle/brake profile)
 *      • Telemetry recording   (per-frame data history buffer)
 *      • CSV export            (download recorded telemetry)
 *      • System reset          (page reload)
 *
 *  Dependency:
 *    Receives a Visualization reference at construction for
 *    logEvent() calls during demo mode playback.
 *
 *  DOM Elements Owned:
 *    val-speed, val-accel, val-power,
 *    val-batt-v, val-batt-i, val-batt-soc, val-batt-p,
 *    val-sc-v, val-sc-i, val-sc-soc, val-sc-p,
 *    summary-batt-pct, summary-sc-pct, ems-mode-display (text)
 * ═══════════════════════════════════════════════════════════════════
 */
export class Dashboard {
    constructor(visualization) {
        // Reference to Visualization for logEvent calls (used in demo mode)
        this.visualization = visualization;

        // Cache DOM elements for all numeric readouts
        this.els = {
            speed: document.getElementById('val-speed'),
            accel: document.getElementById('val-accel'),
            power: document.getElementById('val-power'),
            battV: document.getElementById('val-batt-v'),
            battI: document.getElementById('val-batt-i'),
            battSoc: document.getElementById('val-batt-soc'),
            battP: document.getElementById('val-batt-p'),
            battPct: document.getElementById('summary-batt-pct'),
            scV: document.getElementById('val-sc-v'),
            scI: document.getElementById('val-sc-i'),
            scSoc: document.getElementById('val-sc-soc'),
            scP: document.getElementById('val-sc-p'),
            scPct: document.getElementById('summary-sc-pct'),
            modeBadge: document.getElementById('ems-mode-display'),
            // Suspension signals
            suspV: document.getElementById('val-susp-v'),
            suspP: document.getElementById('val-susp-p'),
            suspTotal: document.getElementById('val-susp-total')
        };

        // ── Presentation / Demo state ──
        this.demoActive = false;
        this.history = [];
        this.startTime = Date.now();
    }

    // ───────────────── Per-Frame Readout Update ─────────────────
    /**
     * Updates all numeric readouts on the dashboard.
     *
     * @param {object} vehicle  – Vehicle model instance
     * @param {object} battery  – Battery model instance
     * @param {object} supercap – Supercapacitor model instance
     * @param {object} emsState – { mode, powerBatt, powerSC, pctBatt, pctSC }
     * @param {object} suspension – SuspensionSystem model instance
     */
    update(vehicle, battery, supercap, emsState, suspension) {
        if (!this.els.speed) return; // fail-safe

        // ── 1. Vehicle Metrics ──
        this.els.speed.textContent = `${(vehicle.speed * 3.6).toFixed(1)} km/h`;
        if (this.els.accel) this.els.accel.textContent = `${vehicle.acceleration.toFixed(2)} m/s²`;
        if (this.els.power) this.els.power.textContent = `${vehicle.getPowerDemand().toFixed(1)} kW`;

        // ── 2. Battery Metrics ──
        this.els.battV.textContent = `${battery.voltage.toFixed(1)} V`;
        this.els.battI.textContent = `${battery.current.toFixed(1)} A`;
        this.els.battSoc.textContent = `${battery.soc.toFixed(1)}%`;
        if (this.els.battP) this.els.battP.textContent = `${battery.power.toFixed(1)} kW`;
        this.els.battPct.textContent = `${emsState.pctBatt}%`;

        // ── 3. Supercapacitor Metrics ──
        this.els.scV.textContent = `${supercap.voltage.toFixed(1)} V`;
        this.els.scI.textContent = `${supercap.current.toFixed(1)} A`;
        this.els.scSoc.textContent = `${supercap.soc.toFixed(1)}%`;
        if (this.els.scP) this.els.scP.textContent = `${supercap.power.toFixed(1)} kW`;
        this.els.scPct.textContent = `${emsState.pctSC}%`;

        // ── 4. Suspension Metrics ──
        if (this.els.suspV) this.els.suspV.textContent = `${suspension.generatedVoltage.toFixed(1)} V`;
        if (this.els.suspP) this.els.suspP.textContent = `${suspension.generatedPower.toFixed(0)} W`;
        if (this.els.suspTotal) this.els.suspTotal.textContent = `${suspension.getHarvestedEnergy_Wh().toFixed(3)} Wh`;

        // ── 5. EMS Mode Badge ──
        this.els.modeBadge.textContent = `${emsState.mode} MODE`;
    }

    // ═══════════════════════════════════════════════
    //  PRESENTATION (absorbed from presentation.js)
    // ═══════════════════════════════════════════════

    // ── Data Recording ──
    /**
     * Snapshots the current frame into the telemetry buffer.
     *
     * @param {object} vehicle    – Vehicle model instance
     * @param {object} battery    – Battery model instance
     * @param {object} supercap   – Supercapacitor model instance
     * @param {object} suspension – SuspensionSystem model instance
     */
    recordData(vehicle, battery, supercap, suspension) {
        if (!this.history) return;

        this.history.push({
            time: (Date.now() - this.startTime) / 1000,
            speed: vehicle.speed * 3.6,
            power: vehicle.getPowerDemand(),
            battSoc: battery.soc,
            scSoc: supercap.soc,
            battCurrent: battery.current,
            scCurrent: supercap.current,
            battPower: battery.power,
            scPower: supercap.power,
            suspPower: suspension.generatedPower,
            harvestedEnergy: suspension.totalEnergyHarvested
        });

        // Prevent memory leak: cap telemetry history array to max 5000 entries (~80 seconds of data at 60fps) 
        // older entries are discarded to maintain browser stability
        if (this.history.length > 5000) {
            this.history.shift();
        }
    }

    // ── CSV Export ──
    exportCSV() {
        if (this.history.length === 0) {
            alert("No simulation data to export.");
            return;
        }

        const headers = ["Time (s)", "Speed (km/h)", "Power Demand (kW)", "Battery SOC (%)", "Supercap SOC (%)", "Battery Current (A)", "Supercap Current (A)"];
        const rows = this.history.map(d => [d.time, d.speed, d.power, d.battSoc, d.scSoc, d.battCurrent, d.scCurrent].join(","));
        const csvContent = [headers.join(","), ...rows].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `simulation_data_${new Date().toISOString().slice(0, 19)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ── Demo Mode Sequencing ──
    async startDemo(app) {
        if (this.demoActive) return;
        this.demoActive = true;

        const setThrottle = (val) => {
            app.vehicle.throttle = val / 100;
            app.throttleInput.value = val;
            app.throttleVal.textContent = `${val}%`;
            app.vehicle.brake = 0;
            app.brakeInput.value = 0;
            app.brakeVal.textContent = `0%`;
        };

        const setBrake = (val) => {
            app.vehicle.brake = val / 100;
            app.brakeInput.value = val;
            app.brakeVal.textContent = `${val}%`;
            app.vehicle.throttle = 0;
            app.throttleInput.value = 0;
            app.throttleVal.textContent = `0%`;
        };

        try {
            this.visualization.logEvent("DEMO MODE STARTED");

            // 1. Gradual Acceleration
            this.visualization.logEvent("Phase 1: Gradual Acceleration (Battery Dominant)");
            for (let i = 0; i <= 20; i += 2) {
                if (!this.demoActive) return;
                setThrottle(i);
                await this._wait(200);
            }
            await this._wait(2000);

            // 2. Acceleration Surge (Boost)
            this.visualization.logEvent("Phase 2: Acceleration Surge (Supercapacitor Boost)");
            setThrottle(80);
            app.vehicle.isBoosting = true;
            await this._wait(3000);
            app.vehicle.isBoosting = false;

            // 3. Steady Cruise
            this.visualization.logEvent("Phase 3: Steady Cruise (High Efficiency)");
            setThrottle(15);
            await this._wait(4000);

            // 4. Regenerative Braking
            this.visualization.logEvent("Phase 4: Regenerative Braking (Energy Recovery)");
            setBrake(60);
            await this._wait(4000);

            setBrake(0);
            this.visualization.logEvent("DEMO SEQUENCE COMPLETE");
        } finally {
            this.demoActive = false;
        }
    }

    _wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ── Reset ──
    reset() {
        window.location.reload();
    }
}
