/**
 * ═══════════════════════════════════════════════════════════════════
 *  ENERGY MANAGEMENT SYSTEM (EMS) MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Responsibility:
 *    Determines how power demand is split between the battery and
 *    supercapacitor. Implements three deterministic operating modes:
 *
 *    CRUISE  – Normal driving (0 < P ≤ 20 kW)
 *              Battery 90 %, Supercap 10 %
 *
 *    BOOST   – High-power demand (P > 20 kW)
 *              Supercap 70 %, Battery 30 %  (if SC SOC > 5 %)
 *
 *    REGEN   – Regenerative braking (P < 0)
 *              Supercap absorbs 100 %       (if SC SOC < 90 %)
 *
 *  Output:
 *    Returns an emsState object consumed by every render module:
 *    { mode, powerBatt, powerSC, pctBatt, pctSC }
 *
 *  Stability Notes:
 *    • Logic is stateless per-frame: mode depends only on current
 *      powerDemand and supercapSoc. This guarantees determinism.
 *    • All split percentages sum to 100 % (or 0 % when coasting).
 *    • Fallback to battery-only when supercap is depleted/full.
 *
 *  Future extension point:
 *    Regenerative suspension energy could be injected as an
 *    additional negative-power input alongside regen braking.
 * ═══════════════════════════════════════════════════════════════════
 */
export class EMS {
    constructor() {
        this.mode = 'CRUISE';
        this.boostThreshold = 20;    // kW — demand above this triggers BOOST

        // ── Output allocations ──
        this.powerBatt = 0;          // kW allocated to battery
        this.powerSC = 0;            // kW allocated to supercapacitor

        // ── Contribution percentages (for UI display) ──
        this.pctBatt = 0;
        this.pctSC = 0;
    }

    /**
     * Execute power-split decision for the current frame.
     *
     * @param {number} powerDemand_kW    – total power demand (kW),
     *                                      + = motoring, − = regen
     * @param {number} supercapSoc       – current SC state of charge (%)
     * @param {number} suspensionPower_kW – power harvested from suspension (kW)
     * @returns {{ mode: string, powerBatt: number, powerSC: number,
     *             pctBatt: number, pctSC: number }}
     */
    update(powerDemand_kW, supercapSoc, suspensionPower_kW) {
        if (powerDemand_kW < 0) {
            // ── REGEN MODE ── (energy flows back into storage)
            this.mode = 'REGEN';
            const regenPower = Math.abs(powerDemand_kW);

            if (supercapSoc < 90) {
                // Supercapacitor absorbs 100 % of regen energy
                this.powerSC = -regenPower;
                this.powerBatt = 0;
                this.pctSC = 100;
                this.pctBatt = 0;
            } else {
                // Supercap near full — regen into battery instead
                this.powerSC = 0;
                this.powerBatt = -regenPower;
                this.pctSC = 0;
                this.pctBatt = 100;
            }

        } else if (powerDemand_kW > this.boostThreshold) {
            // ── BOOST MODE ── (high-power surge)
            this.mode = 'BOOST';

            if (supercapSoc > 5) {
                // Supercap handles 70 % of the surge
                this.powerSC = powerDemand_kW * 0.70;
                this.powerBatt = powerDemand_kW * 0.30;
                this.pctSC = 70;
                this.pctBatt = 30;
            } else {
                // Supercap depleted — battery takes full load
                this.powerSC = 0;
                this.powerBatt = powerDemand_kW;
                this.pctSC = 0;
                this.pctBatt = 100;
            }

        } else if (powerDemand_kW > 0) {
            // ── CRUISE MODE ── (normal driving)
            this.mode = 'CRUISE';
            this.powerBatt = powerDemand_kW * 0.90;
            this.powerSC = powerDemand_kW * 0.10;
            this.pctBatt = 90;
            this.pctSC = 10;

        } else {
            // ── COASTING ── (0 kW demand)
            this.mode = 'CRUISE';
            this.powerBatt = 0;
            this.powerSC = 0;
            this.pctBatt = 0;
            this.pctSC = 0;
        }

        // ── SUSPENSION INTEGRATION ──
        // Suspension power is "gifted" energy. We subtract it from the SC demand
        // so that the EMS naturally throttles supercap draw when harvesting is active.
        this.powerSC -= (suspensionPower_kW || 0);

        return {
            mode: this.mode,
            powerBatt: this.powerBatt,
            powerSC: this.powerSC,
            pctBatt: this.pctBatt,
            pctSC: this.pctSC
        };
    }
}
