/**
 * ═══════════════════════════════════════════════════════════════════
 *  BATTERY MODEL MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Responsibility:
 *    Simplified real-time lithium-ion battery model for the HESS
 *    simulator. Uses a quadratic current solve derived from
 *    P = (Voc − I·R)·I to determine terminal voltage and current
 *    for a given power demand.
 *
 *  State Variables:
 *    soc     – State of Charge (%) [0 … 100]
 *    current – terminal current (A), positive = discharge
 *    voltage – terminal voltage (V)
 *    power   – power delivered / absorbed (kW)
 *
 *  Stability Notes:
 *    • SOC is hard-clamped to [0, 100] every frame.
 *    • When discriminant < 0 (demand exceeds cell capability),
 *      current is safely capped at Voc / (2R)  — the maximum
 *      power transfer point.
 *    • Terminal voltage is floored at 0.5 × Voc to prevent
 *      unrealistically low voltage under extreme load.
 *
 *  Parameters:
 *    Voc      = 400 V   (nominal open-circuit voltage)
 *    R        = 0.05 Ω  (internal resistance)
 *    capacity = 50 kWh  (usable energy)
 * ═══════════════════════════════════════════════════════════════════
 */
export class Battery {
    constructor() {
        // ── Cell Parameters ──
        this.Voc = 400;              // Open-circuit voltage (V)
        this.R = 0.05;               // Internal resistance (Ω)
        this.capacity = 50;          // Usable energy capacity (kWh)

        // ── State Variables ──
        this.soc = 80;               // State of Charge (%)
        this.current = 0;            // Terminal current (A)
        this.voltage = this.Voc;     // Terminal voltage (V)
        this.power = 0;              // Power (kW), + = discharge
    }

    /**
     * Advance battery state by one simulation timestep.
     *
     * Current solve:  P = (Voc − I·R)·I  ⟹  I²R − Voc·I + P = 0
     *   I = (Voc − √(Voc² − 4·R·P)) / (2R)
     *
     * @param {number} powerDemand_kW – power from EMS (kW), + = discharge
     * @param {number} dt – timestep in seconds
     */
    update(powerDemand_kW, dt) {
        this.power = powerDemand_kW;
        const P_watts = this.power * 1000;

        // ── Quadratic current solve ──
        const discriminant = this.Voc * this.Voc - 4 * this.R * P_watts;

        if (discriminant >= 0) {
            this.current = (this.Voc - Math.sqrt(discriminant)) / (2 * this.R);
        } else {
            // Power demand exceeds cell capability — clamp at
            // maximum power transfer current: I_max = Voc / (2R)
            this.current = this.Voc / (2 * this.R);
        }

        // Hard clamp on current to prevent mathematical explosions
        const MAX_BATTERY_CURRENT = 1000; // 1000A limit
        if (this.current > MAX_BATTERY_CURRENT) this.current = MAX_BATTERY_CURRENT;
        if (this.current < -MAX_BATTERY_CURRENT) this.current = -MAX_BATTERY_CURRENT;

        // ── Terminal voltage ──
        // V = Voc − I·R  (discharge: positive I lowers voltage)
        this.voltage = this.Voc - (this.current * this.R);

        // Stability guard: prevent unrealistically low terminal voltage
        const V_min = this.Voc * 0.5;
        if (this.voltage < V_min) this.voltage = V_min;

        // ── SOC integration ──
        // Energy used this frame: ΔE = P × Δt  (kW × s → kWs, convert to kWh)
        const energyUsed_kWh = this.power * (dt / 3600);
        const socChange = (energyUsed_kWh / this.capacity) * 100;
        this.soc -= socChange;

        // Hard-clamp SOC to valid range
        if (this.soc < 0) this.soc = 0;
        if (this.soc > 100) this.soc = 100;
    }
}
