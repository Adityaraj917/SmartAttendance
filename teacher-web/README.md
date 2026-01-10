# Smart Attendance System (Web-Only)

A production-grade, web-only attendance system using React, Vite, Firebase, and Logical BLE Simulation.

## Features
- **Teacher Dashboard**: Create sessions, Geolocation enforcement, Dynamic QR (rotates every 3 mins), Heartbeat/Liveness check.
- **Student Dashboard**: Auto-join via GPS, QR Scanning, Manual Entry (Session ID / UUID), Heartbeat response logic.
- **Security**: Device Binding (one device per student), Location Validation (Haversine), Role-based Auth.

## Setup & Run

1.  **Install Dependencies**:
    ```bash
    cd teacher-web
    npm install
    ```

2.  **Start Development Server**:
    ```bash
    npm run dev
    ```

3.  **Seed Database (First Time Only)**:
    - Open the app (usually `http://localhost:5173`).
    - On the **Login Page**, scroll down.
    - Click **"Reset/Seed Database"**.
    - Confirm the prompt. This will create users like `Aditya@VGU` and `PirAhmad@VGU`.

## Usage Guide for Demo

### 1. Teacher Flow
- Login as **Teacher (Pir Ahmad)** using the Quick Login badge or `PirAhmad@VGU` / `PirAhmad@123`.
- Enable "Use my current location".
- Select a Classroom and click **Launch Session**.
- Share the **Session ID** or let students scan the **Dynamic QR**.
- Monitor the "Live Attendance" list.

### 2. Student Flow (Simulate on Mobile or 2nd Browser Window)
- Open a new Incognito window (to simulate a new device).
- Login as **Student (Aditya)** using the Quick Login badge or `Aditya@VGU` / `Aditya@123`.
- **Auto-Join**: If you are physically "close" (or simulating GPS), the session will appear automatically.
- **Manual Join**: If auto-join doesn't trigger, click "Manual Check-in" and enter the **Session ID** or **BLE UUID** displayed on Teacher's screen.
- Wait for verification. Once "Checked In", leave the tab open.
- **Heartbeat**: Every 10 minutes, the teacher updates the session. Your client will auto-respond to remain "LIVE".

## Tech Stack
- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Firebase Firestore (Realtime updates)
- **Logic**: Geolocation API, Haversine Distance, Logical UUID Binding.

## Deployment
This project is Vercel-ready. Simply push the `teacher-web` folder to Vercel and set up environment variables or firebase config if needed (currently using hardcoded/public config in `lib/firebase.ts` - ensure to secure this for production).
