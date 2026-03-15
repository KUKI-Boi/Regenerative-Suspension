/**
 * ═══════════════════════════════════════════════════════════════════
 *  REGENERATIVE SUSPENSION ENERGY HARVESTING MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Responsibility:
 *    Simulates a quarter-car suspension system that converts road-
 *    induced vertical motion into electrical energy via a linear
 *    electromagnetic generator coupled to the damper.
 *
 *  Physics Model:
 *    ┌──────────────────────────────┐
 *    │  Quarter-Car Suspension      │
 *    │                              │
 *    │  Road surface  ──▶  x_road   │  (sinusoidal disturbance)
 *    │                     │        │
 *    │           ┌─────────┘        │
 *    │           │                  │
 *    │     ┌─────┤─────┐            │
 *    │     │ k   │  c  │            │  k = spring, c = damper
 *    │     └─────┤─────┘            │
 *    │           │                  │
 *    │        Sprung mass           │  (quarter of vehicle mass)
 *    │           │                  │
 *    │     Generator (Ke)           │  V = Ke × ω_gen
 *    └──────────────────────────────┘
 *
 *  Governing Equation:
 *    F_spring = −k × (x_body − x_road)
 *    F_damper = −c × (v_body − v_road)
 *    a_body   = (F_spring + F_damper) / m_quarter
 *
 *  Generator:
 *    The damper velocity drives a rotary generator through a
 *    rack-and-pinion mechanism (simplified as a linear constant).
 *
 *    ω_gen  = |v_rel| / r_pinion        (rad/s)
 *    V_gen  = Ke × ω_gen                (open-circuit voltage)
 *    I_gen  = V_gen / (R_gen + R_load)  (current into load)
 *    P_gen  = V_gen × I_gen             (electrical power, W)
 *
 *  State Variables (all exposed for visualization):
 *    suspensionCompression  – relative displacement x_body − x_road (m)
 *    suspensionVelocity     – relative velocity v_body − v_road (m/s)
 *    springForce            – spring force (N)
 *    damperForce            – damper force (N)
 *    generatorOmega         – generator rotational speed (rad/s)
 *    generatedVoltage       – generator terminal voltage (V)
 *    generatedCurrent       – generator current (A)
 *    generatedPower         – instantaneous power output (W)
 *    generatedPower_kW      – same, in kW (for EMS compatibility)
 *
 *  Stability Notes:
 *    • Uses semi-implicit Euler integration: velocity is updated
 *      first, then position uses the new velocity. This is
 *      unconditionally more stable than explicit Euler for
 *      spring-damper systems.
 *    • Suspension compression is soft-clamped to ±0.15 m to
 *      represent bump-stop limits.
 *    • Road amplitude scales with vehicle speed to model the
 *      physical reality that faster driving = more disturbance.
 *    • Generator power is always ≥ 0 (rectified output).
 *
 *  Integration Point:
 *    Called from main.js updateSimulation(dt) BEFORE EMS so
 *    that Phase 3 can route generated power into the storage
 *    system.
 * ═══════════════════════════════════════════════════════════════════
 */
export class SuspensionSystem {
    constructor() {
        // ══════════════════════════════════════════════
        //  MECHANICAL PARAMETERS
        // ══════════════════════════════════════════════

        /** Spring stiffness (N/m) — typical passenger EV */
        this.k = 25000;

        /** Damping coefficient (N·s/m) — slightly under-damped for energy harvest */
        this.c = 1500;

        /** Quarter-car sprung mass (kg) — ¼ of 1600 kg vehicle */
        this.m = 400;

        /** Maximum suspension travel (m) — bump-stop limit */
        this.maxCompression = 0.15;

        // ══════════════════════════════════════════════
        //  ROAD DISTURBANCE PARAMETERS
        // ══════════════════════════════════════════════

        this.roadProfiles = {
            'smooth': { amplitude: 0.005, freq1: 2.0, freq2: 5.0, ratio2: 0.2 },
            'city': { amplitude: 0.015, freq1: 3.0, freq2: 7.5, ratio2: 0.4 },
            'rough': { amplitude: 0.040, freq1: 4.5, freq2: 12.0, ratio2: 0.6 },
            'speed-breaker': { type: 'transient' } // Handled procedurally
        };

        this.currentProfileName = 'city'; // Default

        /** Active base road amplitude (m) */
        this.roadAmplitude = this.roadProfiles['city'].amplitude;
        /** Active primary road frequency (Hz) */
        this.roadFrequency = this.roadProfiles['city'].freq1;
        /** Secondary harmonic */
        this.roadFrequency2 = this.roadProfiles['city'].freq2;
        /** Secondary amplitude ratio */
        this.roadAmplitude2Ratio = this.roadProfiles['city'].ratio2;

        /** Internal state for speed breaker logic */
        this.speedBreakerPosition = 0;
        this.speedBreakerActive = false;

        // ══════════════════════════════════════════════
        //  GENERATOR PARAMETERS
        // ══════════════════════════════════════════════

        /** Generator EMF constant (V·s/rad) */
        this.Ke = 0.6;

        /** Pinion radius for rack-and-pinion conversion (m) */
        this.r_pinion = 0.02;

        /** Generator internal resistance (Ω) */
        this.R_gen = 1.5;

        /** External load resistance (Ω) */
        this.R_load = 3.0;

        // ══════════════════════════════════════════════
        //  STATE VARIABLES
        // ══════════════════════════════════════════════

        /** Sprung mass vertical position relative to equilibrium (m) */
        this.bodyPosition = 0;

        /** Sprung mass vertical velocity (m/s) */
        this.bodyVelocity = 0;

        /** Current road surface displacement (m) */
        this.roadDisplacement = 0;

        /** Road surface velocity (m/s) */
        this.roadVelocity = 0;

        /** Simulation time accumulator (s) — for road profile */
        this.time = 0;

        // ── Derived outputs (updated each frame) ──

        /** Relative compression: x_body − x_road (m) */
        this.suspensionCompression = 0;

        /** Relative velocity: v_body − v_road (m/s) */
        this.suspensionVelocity = 0;

        /** Spring force (N) */
        this.springForce = 0;

        /** Damper force (N) */
        this.damperForce = 0;

        /** Generator torque mapped back to linear force (N) */
        this.generatorTorque = 0;

        /** Generator rotational speed (rad/s) */
        this.generatorOmega = 0;

        /** Generator open-circuit voltage (V) */
        this.generatedVoltage = 0;

        /** Generator current through load (A) */
        this.generatedCurrent = 0;

        /** Instantaneous generated electrical power (W) */
        this.generatedPower = 0;

        /** Same in kW for compatibility with EMS interface */
        this.generatedPower_kW = 0;

        /** Cumulative energy harvested (J) — running total */
        this.totalEnergyHarvested = 0;
    }

    // ═══════════════════════════════════════════════════════════════
    //  ROAD DISTURBANCE MODEL
    // ═══════════════════════════════════════════════════════════════

    /**
     * Change the currently active road profile.
     * @param {string} profileName - 'smooth', 'city', 'rough', or 'speed-breaker'
     */
    setRoadProfile(profileName) {
        if (!this.roadProfiles[profileName]) return;

        this.currentProfileName = profileName;

        if (profileName !== 'speed-breaker') {
            const p = this.roadProfiles[profileName];
            this.roadAmplitude = p.amplitude;
            this.roadFrequency = p.freq1;
            this.roadFrequency2 = p.freq2;
            this.roadAmplitude2Ratio = p.ratio2;
        } else {
            // Setup for a transient bump. We wait for the car to move.
            this.speedBreakerActive = true;
            this.speedBreakerPosition = 0; // Starts 0 meters into the bump sequence
        }
    }

    /**
     * Get the available road profiles and the currently active one.
     */
    getRoadState() {
        return {
            profiles: Object.keys(this.roadProfiles),
            active: this.currentProfileName
        };
    }

    /**
     * Compute road surface displacement at the current time.
     *
     * Uses a two-harmonic sinusoidal model:
     *   x_road = A × sin(ω₁t) + A₂ × sin(ω₂t)
     *
     * Amplitude scales with vehicle speed:
     *   - At 0 km/h the road is flat (no disturbance).
     *   - Full amplitude reached at ~60 km/h.
     *   - Slight increase beyond that for highway roughness.
     *
     * @param {number} vehicleSpeed – vehicle speed in m/s
     * @param {number} dt           – timestep
     * @returns {number} road surface displacement in metres
     */
    computeRoadDisplacement(vehicleSpeed, dt, distanceOffset = 0) {
        if (vehicleSpeed < 0.1) return 0; // No disturbance at standstill

        // Speed limit scalar
        const speedFactor = Math.min(vehicleSpeed / 16.67, 1.2);

        if (this.currentProfileName === 'speed-breaker') {
            // Procedurally generate a bump
            // distanceOffset > 0 is ahead of the car.
            const pos = this.speedBreakerPosition + distanceOffset;
            const distanceInCycle = pos % 20; // 20m spacing

            // Bump is between 0 and 0.5m in the cycle
            if (distanceInCycle > 0 && distanceInCycle < 0.5) {
                // Half-sine wave bump shape
                const H = 0.08; // 8cm high bump
                const W = 0.5;  // 0.5m wide
                return H * Math.sin(Math.PI * distanceInCycle / W);
            }
            // Add a tiny bit of base texture otherwise
            const localTime = this.time + (distanceOffset / Math.max(vehicleSpeed, 0.1));
            return 0.005 * speedFactor * Math.sin(2 * Math.PI * 5.0 * localTime);
        }

        // Standard harmonic profiles
        const A1 = this.roadAmplitude * speedFactor;
        const A2 = this.roadAmplitude * this.roadAmplitude2Ratio * speedFactor;

        const omega1 = 2 * Math.PI * this.roadFrequency;
        const omega2 = 2 * Math.PI * this.roadFrequency2;

        const localTime = this.time + (distanceOffset / Math.max(vehicleSpeed, 0.1));

        return A1 * Math.sin(omega1 * localTime)
            + A2 * Math.sin(omega2 * localTime);
    }

    /**
     * Compute road surface velocity (time-derivative of displacement).
     *
     * @param {number} vehicleSpeed – vehicle speed in m/s
     * @param {number} dt           – timestep
     * @returns {number} road surface velocity in m/s
     */
    computeRoadVelocity(vehicleSpeed, dt) {
        if (vehicleSpeed < 0.1) return 0;

        const speedFactor = Math.min(vehicleSpeed / 16.67, 1.2);

        if (this.currentProfileName === 'speed-breaker') {
            const distanceInCycle = this.speedBreakerPosition % 20;
            if (distanceInCycle < 0.5) {
                // Derivative of half-sine relative to time:
                // dh/dt = dh/dx * dx/dt = (H * pi / W * cos(pi * x / W)) * v
                const H = 0.08;
                const W = 0.5;
                return (H * Math.PI / W) * Math.cos(Math.PI * distanceInCycle / W) * vehicleSpeed;
            }
            return 0.005 * speedFactor * (2 * Math.PI * 5.0) * Math.cos(2 * Math.PI * 5.0 * this.time);
        }

        const A1 = this.roadAmplitude * speedFactor;
        const A2 = this.roadAmplitude * this.roadAmplitude2Ratio * speedFactor;

        const omega1 = 2 * Math.PI * this.roadFrequency;
        const omega2 = 2 * Math.PI * this.roadFrequency2;

        return A1 * omega1 * Math.cos(omega1 * this.time)
            + A2 * omega2 * Math.cos(omega2 * this.time);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MAIN UPDATE — called once per simulation frame
    // ═══════════════════════════════════════════════════════════════

    /**
     * Advance the suspension system by one timestep.
     *
     * Pipeline:
     *   1. Compute road disturbance (position + velocity)
     *   2. Compute spring & damper forces
     *   3. Integrate sprung-mass dynamics (semi-implicit Euler)
     *   4. Clamp compression to bump-stop limits
     *   5. Compute generator electrical output
     *
     * @param {number} dt           – timestep in seconds (≤ 0.1 s)
     * @param {number} vehicleSpeed – current vehicle speed in m/s
     */
    update(dt, vehicleSpeed) {
        // ── 1. Road disturbance input ──
        this.time += dt;

        // Update distance-based disturbances (Speed Breakers)
        if (this.currentProfileName === 'speed-breaker') {
            this.speedBreakerPosition += vehicleSpeed * dt;
        }

        this.roadDisplacement = this.computeRoadDisplacement(vehicleSpeed, dt);
        this.roadVelocity = this.computeRoadVelocity(vehicleSpeed, dt);

        // ── 2. Relative motion ──
        this.suspensionCompression = this.bodyPosition - this.roadDisplacement;
        this.suspensionVelocity = this.bodyVelocity - this.roadVelocity;

        // ── 3. Spring and damper forces ──
        //   F_spring = −k × x_rel   (restoring force)
        //   F_damper = −c × v_rel   (energy-dissipating force)
        this.springForce = -this.k * this.suspensionCompression;
        this.damperForce = -this.c * this.suspensionVelocity;

        const F_total = this.springForce + this.damperForce;

        // ── 4. Semi-implicit Euler integration ──
        //   Update velocity first, then use new velocity for position.
        //   This provides better energy conservation than explicit Euler
        //   for oscillatory spring-damper systems.
        const acceleration = F_total / this.m;
        this.bodyVelocity += acceleration * dt;
        this.bodyPosition += this.bodyVelocity * dt;

        // ── 5. Bump-stop clamping ──
        //   Prevents compression beyond physical travel limits.
        //   When hitting the bump stop, velocity is zeroed (inelastic).
        if (this.suspensionCompression > this.maxCompression) {
            this.bodyPosition = this.roadDisplacement + this.maxCompression;
            if (this.bodyVelocity > 0) this.bodyVelocity = 0;
        } else if (this.suspensionCompression < -this.maxCompression) {
            this.bodyPosition = this.roadDisplacement - this.maxCompression;
            if (this.bodyVelocity < 0) this.bodyVelocity = 0;
        }

        // Recompute after clamping
        this.suspensionCompression = this.bodyPosition - this.roadDisplacement;
        this.suspensionVelocity = this.bodyVelocity - this.roadVelocity;

        // ── 6. Generator electrical output ──
        this.computeGeneratorOutput();

        // ── 7. Accumulate harvested energy ──
        this.totalEnergyHarvested += this.generatedPower * dt; // Joules
    }

    // ═══════════════════════════════════════════════════════════════
    //  GENERATOR MODEL
    // ═══════════════════════════════════════════════════════════════

    /**
     * Compute electrical output from the electromagnetic generator.
     *
     * The damper's relative velocity drives a rotary generator via
     * a rack-and-pinion mechanism:
     *
     *   ω_gen = |v_rel| / r_pinion          (linear → rotary)
     *   V_gen = Ke × ω_gen                  (back-EMF)
     *   I_gen = V_gen / (R_gen + R_load)    (Ohm's law)
     *   P_gen = V_gen × I_gen               (electrical power)
     *
     * The generator torque mapped back to a linear braking force:
     *   F_gen = Ke × I_gen / r_pinion
     *
     * Note: power is always ≥ 0 (rectified output). The generator
     * harvests energy from motion in either direction.
     */
    computeGeneratorOutput() {
        const v_rel = Math.abs(this.suspensionVelocity);

        // Linear-to-rotary conversion
        this.generatorOmega = v_rel / this.r_pinion;

        // Back-EMF voltage
        this.generatedVoltage = this.Ke * this.generatorOmega;

        // Current through total circuit (generator + load)
        this.generatedCurrent = this.generatedVoltage / (this.R_gen + this.R_load);

        // Electrical power output (always positive — rectified)
        this.generatedPower = this.generatedVoltage * this.generatedCurrent;

        // Convert to kW for EMS compatibility
        this.generatedPower_kW = this.generatedPower / 1000;

        // Generator reaction torque mapped to linear force on damper
        this.generatorTorque = (this.Ke * this.generatedCurrent) / this.r_pinion;
    }

    // ═══════════════════════════════════════════════════════════════
    //  PUBLIC ACCESSORS — for visualization and future integration
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get a snapshot of all suspension state variables.
     * Useful for dashboard display and telemetry recording.
     *
     * @returns {object} Current suspension state
     */
    getState() {
        return {
            suspensionCompression: this.suspensionCompression,
            suspensionVelocity: this.suspensionVelocity,
            springForce: this.springForce,
            damperForce: this.damperForce,
            generatorTorque: this.generatorTorque,
            generatorOmega: this.generatorOmega,
            generatedVoltage: this.generatedVoltage,
            generatedCurrent: this.generatedCurrent,
            generatedPower: this.generatedPower,
            generatedPower_kW: this.generatedPower_kW,
            totalEnergyHarvested: this.totalEnergyHarvested,
            roadDisplacement: this.roadDisplacement
        };
    }

    /**
     * Get cumulative harvested energy in watt-hours.
     * @returns {number} Energy in Wh
     */
    getHarvestedEnergy_Wh() {
        return this.totalEnergyHarvested / 3600;
    }
}
