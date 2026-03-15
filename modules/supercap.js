/**
 * ═══════════════════════════════════════════════════════════════════
 *  SUPERCAPACITOR MODEL MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Responsibility:
 *    Models an ultracapacitor bank for the HESS. The supercapacitor
 *    excels at absorbing / delivering high-power transients (boost
 *    and regenerative braking) that would otherwise stress the
 *    battery pack.
 *
 *  State Variables:
 *    voltage  – terminal voltage (V) [0 … V_max]
 *    current  – terminal current (A), positive = discharge
 *    power    – power delivered / absorbed (kW)
 *    soc      – State of Charge (%) based on energy ratio
 *
 *  Energy:
 *    E = 0.5 × C × V²
 *    SOC = (V² / V_max²) × 100
 *
 *  Stability Notes:
 *    • Voltage is clamped to [0, V_max] every frame.
 *    • When discriminant < 0 (demand exceeds capability),
 *      current is capped at V / (2R).
 *    • SOC is clamped to [0, 100].
 *
 *  Parameters:
 *    C     = 300 F    (capacitance)
 *    V_max = 48 V     (maximum voltage)
 *    R     = 0.01 Ω   (ESR)
 * ═══════════════════════════════════════════════════════════════════
 */
export class Supercapacitor {
    constructor() {
        // ── Cell Parameters ──
        this.C = 300;                // Capacitance (F)
        this.V_max = 48;             // Maximum voltage (V)
        this.R = 0.01;               // Equivalent series resistance (Ω)

        // ── State Variables ──
        this.voltage = 36;           // Initial voltage (V)
        this.current = 0;            // Terminal current (A)
        this.power = 0;              // Power (kW), + = discharge
        this.soc = this.calculateSOC();
    }

    /**
     * Advance supercapacitor state by one simulation timestep.
     *
     * Current solve:  P = (V − I·R)·I  ⟹  I²R − V·I + P = 0
     * Voltage update:  dV = −(I / C) × dt
     *
     * @param {number} netPower_kW     – net power (kW), + = discharge, − = charge
     * @param {number} dt               – timestep in seconds
     */
    update(netPower_kW, dt) {
        this.power = netPower_kW;
        const P_watts = this.power * 1000;

        // ── Quadratic current solve ──
        const discriminant = this.voltage * this.voltage - 4 * this.R * P_watts;

        if (discriminant >= 0) {
            this.current = (this.voltage - Math.sqrt(discriminant)) / (2 * this.R);
        } else {
            // Clamp at maximum power transfer current
            this.current = this.voltage / (2 * this.R);
        }

        // Hard clamp on current to prevent mathematical explosions
        const MAX_SC_CURRENT = 1000; // 1000A limit
        if (this.current > MAX_SC_CURRENT) this.current = MAX_SC_CURRENT;
        if (this.current < -MAX_SC_CURRENT) this.current = -MAX_SC_CURRENT;

        // Overcharge/Discharge Protection: Prevent integrating impossible currents
        if (this.voltage >= this.V_max && this.current < 0) {
            // Dump resistor: excess charging energy shed as heat
            this.current = 0;
        } else if (this.voltage <= 0 && this.current > 0) {
            // Deep discharge block
            this.current = 0;
        }

        // ── Voltage integration ──
        // dV = −I/C × dt   (positive current discharges → voltage drops)
        this.voltage -= (this.current / this.C) * dt;

        // Clamp voltage to physical limits
        if (this.voltage > this.V_max) this.voltage = this.V_max;
        if (this.voltage < 0) this.voltage = 0;

        this.soc = this.calculateSOC();
    }

    /**
     * Compute State of Charge based on stored energy.
     * SOC = (V² / V_max²) × 100   (energy-proportional metric)
     *
     * @returns {number} SOC in percent [0 … 100]
     */
    calculateSOC() {
        const soc = ((this.voltage * this.voltage) / (this.V_max * this.V_max)) * 100;
        return Math.max(0, Math.min(100, soc));
    }

    /**
     * Compute stored energy in the supercapacitor.
     * E = 0.5 × C × V²
     *
     * @returns {number} Stored energy in Joules
     */
    getStoredEnergy() {
        return 0.5 * this.C * this.voltage * this.voltage;
    }
}
