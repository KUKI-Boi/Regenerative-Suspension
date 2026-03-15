/**
 * ═══════════════════════════════════════════════════════════════════
 *  CIRCUIT / POWER FLOW LAYER MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Responsibility:
 *    Visualises the simplified DC power bus connecting the Battery,
 *    Supercapacitor, and Motor. Each branch shows:
 *      • Glow colour    — blue (idle), red (discharging), green (charging)
 *      • Glow intensity — proportional to |power|
 *      • Flow animation — dashed-line direction and speed
 *
 *  This module is render-only. It reads settled state from the EMS
 *  and storage models; it does NOT modify simulation state.
 *
 *  DOM Dependencies (set in index.html):
 *    circuit-batt-box, circuit-sc-box, circuit-motor-box
 *    anim-batt, anim-sc, anim-motor
 * ═══════════════════════════════════════════════════════════════════
 */
export class Circuit {
    constructor() {
        // Cache SVG DOM elements once at startup
        this.els = {
            battBox: document.getElementById('circuit-batt-box'),
            scBox: document.getElementById('circuit-sc-box'),
            motorBox: document.getElementById('circuit-motor-box'),
            battPathAnim: document.getElementById('anim-batt'),
            scPathAnim: document.getElementById('anim-sc'),
            motorPathAnim: document.getElementById('anim-motor'),
            suspPathAnim: document.getElementById('anim-susp'),
            suspBox: document.getElementById('circuit-susp-box')
        };
    }

    /**
     * Update all three circuit branches for the current frame.
     *
     * @param {object} emsState – { powerBatt, powerSC, … }
     * @param {object} battery  – Battery model instance
     * @param {object} supercap – Supercapacitor model instance
     * @param {object} vehicle  – Vehicle model instance
     * @param {number} suspensionPower_kW – Power from suspension generator
     */
    update(emsState, battery, supercap, vehicle, suspensionPower_kW = 0) {
        if (!this.els.battBox) return; // fail-safe if SVG missing

        const pBatt = emsState.powerBatt;
        const pSCNet = emsState.powerSC; // SC flow already inclusive of suspension in EMS
        const pMotor = vehicle.getPowerDemand();

        // Update Battery flow
        this.updateBranch(this.els.battBox, this.els.battPathAnim, pBatt);

        // Update Supercap flow (Net including suspension)
        this.updateBranch(this.els.scBox, this.els.scPathAnim, pSCNet);

        // Update Motor flow
        this.updateBranch(this.els.motorBox, this.els.motorPathAnim, pMotor);

        // Update Suspension flow (Generator output is always >= 0, flows TOWARDS DC Bus)
        // We use negative power here to indicate GENERATION (Green Flow towards Bus)
        this.updateBranch(this.els.suspBox, this.els.suspPathAnim, -suspensionPower_kW);
    }

    /**
     * Set glow / flow visuals for a single circuit branch.
     *
     * @param {SVGElement} box      – the component box (<g>)
     * @param {SVGElement} pathAnim – the animated flow path
     * @param {number}     power    – power through this branch (kW)
     */
    updateBranch(box, pathAnim, power) {
        const threshold = 0.5; // kW dead-band

        // Reset visual classes
        box.classList.remove('glow-red', 'glow-green', 'glow-blue');
        pathAnim.classList.remove('flow-fwd-red', 'flow-rev-green', 'flow-idle');

        // Intensity mapping: 0 – 50 kW → 0.0 – 1.0
        const intensity = Math.min(Math.abs(power) / 50, 1);
        const blur = 5 + (intensity * 15);

        if (Math.abs(power) < threshold) {
            // Idle state — subtle blue glow
            box.classList.add('glow-blue');
            box.style.filter = 'drop-shadow(0 0 5px rgba(88, 166, 255, 0.5))';
            pathAnim.classList.add('flow-idle');
            return;
        }

        if (power > 0) {
            // Discharging / consuming — red glow, forward flow
            box.classList.add('glow-red');
            box.style.filter = `drop-shadow(0 0 ${blur}px rgba(248, 81, 73, ${0.3 + intensity * 0.7}))`;
            pathAnim.classList.add('flow-fwd-red');
        } else {
            // Charging / generating — green glow, reverse flow
            box.classList.add('glow-green');
            box.style.filter = `drop-shadow(0 0 ${blur}px rgba(63, 185, 80, ${0.3 + intensity * 0.7}))`;
            pathAnim.classList.add('flow-rev-green');
        }

        // Animation speed: higher power → faster dash animation
        const speed = Math.max(0.2, 2.0 - (Math.abs(power) / 200));
        pathAnim.style.animationDuration = `${speed}s`;
    }
}
