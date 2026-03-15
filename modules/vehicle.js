/**
 * ═══════════════════════════════════════════════════════════════════
 *  VEHICLE DYNAMICS MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Responsibility:
 *    Simulates longitudinal vehicle dynamics for a 1600 kg EV.
 *    Computes net force from traction, aerodynamic drag, rolling
 *    resistance, and mechanical braking. Integrates acceleration
 *    to produce speed and distance each frame.
 *
 *  State Variables:
 *    speed        – vehicle speed (m/s)
 *    acceleration – instantaneous acceleration (m/s²)
 *    distance     – cumulative distance travelled (m)
 *    throttle     – normalised throttle input [0 … 1]
 *    brake        – normalised brake input   [0 … 1]
 *    isBoosting   – transient boost flag (1.5× traction)
 *
 *  Stability Notes:
 *    • Speed is clamped to ≥ 0 to prevent numerical reversal.
 *    • Rolling resistance and braking are zeroed at near-standstill
 *      when no traction is applied, preventing creep / oscillation.
 *    • Net traction force is cached per frame so getPowerDemand()
 *      returns a value consistent with the last update() call.
 *
 *  Future extension point:
 *    A suspension energy harvester would inject additional negative
 *    force here (road-surface excitation absorbed by the damper).
 * ═══════════════════════════════════════════════════════════════════
 */
export class Vehicle {
    constructor() {
        // ── Physical Constants ──
        this.mass = 1600;            // Vehicle mass (kg)
        this.Cd = 0.28;              // Drag coefficient
        this.A = 2.2;                // Frontal area (m²)
        this.rho = 1.225;            // Air density (kg/m³)
        this.Crr = 0.015;            // Rolling resistance coefficient
        this.g = 9.81;               // Gravitational acceleration (m/s²)
        this.wheelRadius = 0.3;      // Wheel radius (m)
        this.maxTraction = 5000;     // Maximum traction force (N)
        this.maxBrake = 8000;        // Maximum braking force (N)

        // ── State Variables ──
        this.speed = 0;              // Longitudinal speed (m/s)
        this.acceleration = 0;       // Current acceleration (m/s²)
        this.distance = 0;           // Odometer (m)

        // ── Driver Inputs ──
        this.throttle = 0;           // Normalised throttle [0 … 1]
        this.brake = 0;              // Normalised brake    [0 … 1]
        this.isBoosting = false;     // Boost surge flag

        // ── Cached per-frame forces (for getPowerDemand consistency) ──
        this._F_traction = 0;
        this._F_brake = 0;
    }

    /**
     * Advance vehicle state by one simulation timestep.
     * @param {number} dt – timestep in seconds (clamped externally to ≤ 0.1 s)
     */
    update(dt) {
        // Effective traction ceiling (boost = 1.5×)
        const currentMaxTraction = this.isBoosting
            ? this.maxTraction * 1.5
            : this.maxTraction;

        // ── Force budget ──
        this._F_traction = this.throttle * currentMaxTraction;

        const F_drag = 0.5 * this.rho * this.Cd * this.A * this.speed * this.speed;

        // Rolling resistance: acts against motion, but must NOT
        // pull the vehicle backward when effectively stationary.
        let F_roll = this.Crr * this.mass * this.g;
        if (this.speed < 0.1 && this._F_traction === 0) {
            F_roll = 0;
        }

        // Mechanical braking: separate into electrical regen vs physical friction
        const totalBrakeRequest = this.brake * this.maxBrake;

        // Motor can only apply a limited amount of regenerative torque
        const maxRegenForce = 2500; // max 2.5kN of regen braking
        this._F_regen = Math.min(totalBrakeRequest, maxRegenForce);

        // The rest is shed as heat via friction brakes
        this._F_friction_brake = totalBrakeRequest - this._F_regen;

        if (this.speed < 0.1 && this._F_traction === 0) {
            this._F_regen = 0;
            this._F_friction_brake = 0;
        }

        const F_net = this._F_traction - F_drag - F_roll - this._F_regen - this._F_friction_brake;

        // ── Integration (semi-implicit Euler) ──
        this.acceleration = F_net / this.mass;
        this.speed += this.acceleration * dt;

        // Clamp: the vehicle cannot reverse under braking alone.
        if (this.speed < 0) {
            this.speed = 0;
            this.acceleration = 0;
        }

        this.distance += this.speed * dt;
    }

    /**
     * Compute the current mechanical power demand at the wheels.
     * Positive = motoring (energy drawn from storage).
     * Negative = regenerative braking (energy returned).
     *
     * Uses the cached traction/regen forces from the latest update()
     * to guarantee consistency. Friction brakes do NOT generate power.
     *
     * @returns {number} Power demand in kW
     */
    getPowerDemand() {
        const mechanicalPower = (this._F_traction - this._F_regen) * this.speed;
        return mechanicalPower / 1000; // W → kW
    }

    /**
     * @returns {number} Speed in km/h (for dashboard display)
     */
    getSpeedKmh() {
        return this.speed * 3.6;
    }
}
