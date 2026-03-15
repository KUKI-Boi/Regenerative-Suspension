# ⚡ EV Regenerative Suspension Simulator

### Hybrid Energy Storage + Regenerative Suspension System
 
🔗 **Live Demo:**
https://kuki-boi.github.io/Regenerative-Suspension/

An interactive **Electric Vehicle (EV) energy system simulator** that demonstrates how **hybrid energy storage and regenerative suspension technologies work together** to improve vehicle efficiency.

This simulation models the **mechanical, electrical, and control interactions inside an EV**, including vehicle dynamics, suspension energy harvesting, hybrid storage systems, and real-time energy flow visualization.

The project is designed as an **educational and engineering demonstration tool** to visualize advanced EV technologies.

---

# 🚗 System Overview

The simulator integrates multiple EV subsystems into a unified interactive platform.

Key subsystems include:

* Vehicle Dynamics Simulation
* Hybrid Energy Storage System (Battery + Supercapacitor)
* Energy Management System (EMS)
* Regenerative Suspension Energy Harvesting
* Digital Twin Suspension Analysis
* Real-Time Energy Flow Visualization
* Interactive Engineering Dashboard

The platform allows users to **observe energy generation, storage, and power flow in real time** while the simulated vehicle operates under different driving conditions.

---

# ⚙️ Core Features

## Hybrid Energy Storage System (HESS)

The simulator models a **battery–supercapacitor hybrid architecture**.

Functions include:

* Battery supplies steady driving power
* Supercapacitor supports acceleration bursts
* Energy captured during regenerative braking

This architecture improves **power delivery efficiency and battery lifespan**.

---

## Regenerative Suspension System

The suspension converts **road-induced mechanical vibrations into electrical energy**.

Working principle:

```text
Road Disturbance
      ↓
Suspension Motion
      ↓
Mechanical Generator
      ↓
Electrical Energy
      ↓
Supercapacitor Storage
```

This harvested energy is stored and later used by the vehicle.

---

## Digital Twin Suspension Analysis

The simulator includes a **digital twin interface** for suspension diagnostics.

Features:

* Real-time spring compression visualization
* Damper force analysis
* Generator torque monitoring
* Suspension power generation tracking

This helps illustrate the **mechanical-to-electrical energy conversion process**.

---

## Real-Time Energy Flow Visualization

A dynamic energy flow system shows how power moves through the EV.

Energy paths include:

```text
Battery → Motor
Supercapacitor → Motor
Motor → Supercapacitor (Regenerative Braking)
Suspension Generator → Supercapacitor
```

Animated flow indicators represent **power direction and magnitude**.

---

## Interactive Suspension Inspection

Clicking the vehicle tyres opens a **suspension inspection window** showing:

* Spring compression
* Damper motion
* Generator rotation
* Real-time suspension forces

This allows users to explore the regenerative suspension mechanism in detail.

---

# 📊 Dashboard & Controls

The simulator provides an engineering-style dashboard displaying:

* Vehicle Speed
* Battery State of Charge (SOC)
* Supercapacitor Voltage
* Generated Suspension Power
* System Power Flow

User controls include:

* Throttle Control
* Braking Control
* Cruise Mode
* Boost Surge
* Simulation Demo Mode

---

# 🧠 Simulation Architecture

The simulator follows a modular architecture.

```text
project/
│
├── index.html
├── main.js
├── style.css
│
├── assets/
│
└── modules/
    vehicle.js
    battery.js
    supercap.js
    ems.js
    circuit.js
    suspensionSystem.js
    suspensionUI.js
    energyFlowVisualization.js
    dashboard.js
```

Each subsystem is implemented as an independent module to ensure **maintainability and scalability**.

---

# 🔬 Technologies Used

* JavaScript (ES6 Modules)
* HTML5 Canvas Rendering
* CSS UI Design
* Real-Time Physics Simulation
* Interactive Visualization Techniques

The project is designed to run in browser-based environments.

---

# 🎮 How to Use

1. Open the **Live Demo** link above.
2. Adjust the **Throttle** and **Braking** controls.
3. Observe the **vehicle movement and suspension behavior**.
4. Click on a **tyre** to open the suspension inspection interface.
5. Watch how **energy flows between the generator, supercapacitor, battery, and motor**.

---

# 🎯 Educational Objectives

This simulator demonstrates important EV engineering concepts including:

* Hybrid Energy Storage Systems
* Regenerative Energy Recovery
* Suspension Dynamics
* Energy Management Strategies
* Real-Time System Visualization

It serves as a **visual learning platform for electric vehicle energy systems**.

---

# 🚀 Future Improvements

Planned enhancements include:

* Advanced driving cycle simulations
* Suspension stiffness adjustment
* Energy efficiency analytics
* Multi-vehicle simulation scenarios
* Enhanced graphical visualization

---

# 👨‍💻 Author

**Likith Kumar B M**

Engineering student exploring **electric vehicle systems, simulation technologies, and energy recovery mechanisms**.

🔗 LinkedIn
https://www.linkedin.com/in/likith-kumar-b-m-602ba8315/

---

# 📜 License

This project is intended for **educational and research purposes**.
