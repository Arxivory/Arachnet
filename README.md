# NetArch-3D

> **A Spatially-Aware Network Design and Simulation Platform**

<img src="public/NetArch-Preview.png" alt="NetArch Preview">

NetArch-3D is a high-fidelity network designer and simulator designed to bridge the gap between abstract 2D logical diagrams and 3D physical constraints. Inspired by the architecture of professional CAD tools like Sketchup and SolidWorks, it allows network engineers to validate designs within a realistic 3D environment, preventing costly physical deployment errors.

## Project Overview

Traditional network tools often ignore spatial reality. NetArch-3D integrates **CAD-based modeling** with **functional network logic**, allowing users to define rectangular/polygonal domains (campuses, offices) and place networking hardware with centimeter-level precision.

### Key Features

- **Dual-Mode Workflow:** Toggle between **Logical Mode** (topology mapping) and **Physical Mode** (3D spatial placement).
- **Spatially-Aware Simulation:** Real-time connectivity testing that accounts for physical cable lengths and environmental boundaries (Walls/Rooms).
- **Hierarchical Navigation:** Navigate through a site-folder structure to manage complex environments.
- **Undo/Redo Command System:** Robust history management for non-destructive design editing.

---

## Tech Stack

- **Frontend Library:** React JS
- **3D Engine:** Three JS (WebGL)
- **Desktop Container:** Electron JS

---

## Setup & Installation

Follow these steps to get your development environment running:

**Step 1:** Clone the repository.\
**Step 2:** Head to the '**master**' branch to run the recent and latest update\
**Step 3:** enter `npm install` or `npm i` to install dependencies on the terminal.\
**Step 4:** To run the software, enter `npm run start` for development mode (software will run on browser), on the other hand, enter `npm run electron-build` for production mode (software will run on the dedicated container using electron).\
**Step 5:** If there are any issues regarding running the software, run these commands in your terminal in order: \
`Remove-Item -Recurse -Force node_modules`\
`Remove-Item package-lock.json`\
`npm install`

**Note:** The software is currently on development mode so it is better to run it in the browser for smooth flows using `npm run start` command for now. For a better 3D experience, please enable GPU acceleration on your browser.

---

Designed by BSCS3A students for the Software Engineering course.
