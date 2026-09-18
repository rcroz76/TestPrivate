/**
 * Main Application Controller
 */

// Initialize engines
const sim = new SimulationEngine('sim-canvas');
const ai = new AutonomousAI();

// State
let animationFrameId = null;
let isPaused = false;
let activeScenario = 'crossing'; // default

// Configuration State
const config = {
    sensors: {
        radar: false,
        lidar: false,
        camera: false,
        ultrasonic: false
    },
    systems: {
        collisionAvoidance: false,
        weatherAdaptation: false,
        pedestrianDetection: false
    },
    moralDirective: 'none' // 'none', 'egoism', 'utilitarian', 'deontology'
};

// DOM Elements
const speedVal = document.getElementById('telemetry-speed');
const brakeVal = document.getElementById('telemetry-brake');
const gforceVal = document.getElementById('telemetry-gforce');
const threatBadge = document.getElementById('threat-badge');
const terminalBody = document.getElementById('terminal-body');
const statusBadge = document.getElementById('status-badge');
const canvasContainer = document.getElementById('canvas-container');

// Sound synthesis using Web Audio API (optional, nice touch)
let audioCtx = null;

function initAudio() {
    if (audioCtx) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    } catch (e) {
        console.warn('Web Audio API not supported');
    }
}

function playSynthesizedSound(type) {
    if (!audioCtx) return;
    
    // Resume context if suspended (browser security)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'crash') {
            // Explosive low-pass filtered noise/crackle
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.6);
            gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.6);
        } else if (type === 'beep') {
            // High pitch alarm beep
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
        }
    } catch(err) {
        console.error(err);
    }
}

// Event Listeners for Config Upgrades
function setupEventListeners() {
    // Sensor toggles
    document.querySelectorAll('.sensor-toggle').forEach(input => {
        input.addEventListener('change', (e) => {
            const sensor = e.target.dataset.sensor;
            config.sensors[sensor] = e.target.checked;
            
            const stateText = e.target.checked ? 'ENABLED' : 'DISABLED';
            const statusClass = e.target.checked ? 'success' : 'warn';
            addSystemLog(statusClass, `SYSTEM: ${sensor.toUpperCase()} sensor module ${stateText}`);
            playSynthesizedSound('beep');
            loadScenario(activeScenario);
        });
    });

    // System/Software toggles
    document.querySelectorAll('.system-toggle').forEach(input => {
        input.addEventListener('change', (e) => {
            const system = e.target.dataset.system;
            config.systems[system] = e.target.checked;

            const stateText = e.target.checked ? 'INITIALIZED' : 'DEACTIVATED';
            const statusClass = e.target.checked ? 'success' : 'warn';
            addSystemLog(statusClass, `SOFTWARE: ${system.replace(/([A-Z])/g, ' $1').toUpperCase()} suite ${stateText}`);
            playSynthesizedSound('beep');
            loadScenario(activeScenario);
        });
    });

    // Moral Directives (Radio buttons)
    document.querySelectorAll('input[name="moral"]').forEach(input => {
        input.addEventListener('change', (e) => {
            config.moralDirective = e.target.value;
            addSystemLog('system', `AI CORE: Updated ethical directive to: ${config.moralDirective.toUpperCase()}`);
            playSynthesizedSound('beep');
            loadScenario(activeScenario);
        });
    });

    // Scenario Selection
    document.querySelectorAll('.scenario-btn').forEach(btn => {
        btn.addEventListener('change', (e) => {
            // In case of radio scenarios
            activeScenario = e.target.value;
            loadScenario(activeScenario);
        });
        
        // Handle click style changes
        btn.addEventListener('click', () => {
            document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeScenario = btn.dataset.scenario;
            loadScenario(activeScenario);
            initAudio(); // Initialize audio on user interaction
        });
    });

    // Primary Buttons
    document.getElementById('btn-reset').addEventListener('click', () => {
        loadScenario(activeScenario);
        addSystemLog('info', 'SIMULATION: System reset executed.');
    });

    document.getElementById('btn-pause').addEventListener('click', (e) => {
        isPaused = !isPaused;
        e.target.textContent = isPaused ? 'RESUME' : 'PAUSE';
        statusBadge.textContent = isPaused ? 'PAUSED' : 'AUTONOMOUS ACTIVE';
        statusBadge.style.borderColor = isPaused ? '#f59e0b' : '#10b981';
        statusBadge.style.color = isPaused ? '#f59e0b' : '#10b981';
        statusBadge.style.background = isPaused ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)';
        addSystemLog('info', `SIMULATION: Loop ${isPaused ? 'PAUSED' : 'RESUMED'}.`);
    });
}

function loadScenario(scenario) {
    sim.reset();
    ai.reset();
    
    // Clear terminal screen
    terminalBody.innerHTML = '';
    
    // Add scenario boot-up logs
    addSystemLog('system', `BOOT: Initializing Autonomous Drive System v4.9`);
    
    if (scenario === 'crossing') {
        sim.spawnScenarioObstacles('crossing');
        sim.setWeather('fog');
        addSystemLog('info', `SCENARIO: 'Foggy crossing' activated. Visibility < 25m. Low road luminance.`);
    } else if (scenario === 'dilemma') {
        sim.spawnScenarioObstacles('dilemma');
        sim.setWeather('clear');
        addSystemLog('info', `SCENARIO: 'The Ethical Dilemma' activated. Highway brake failure simulated. High obstacle presence.`);
    } else if (scenario === 'ice') {
        sim.spawnScenarioObstacles('ice');
        sim.setWeather('rain');
        addSystemLog('info', `SCENARIO: 'Wet Skidding Out' activated. Heavy downpour. Friction coefficient: 0.45.`);
    }

    // Hide any previous overlays
    removeOverlays();

    // Reset controls UI state
    isPaused = false;
    document.getElementById('btn-pause').textContent = 'PAUSE';
    statusBadge.textContent = 'AUTONOMOUS ACTIVE';
    statusBadge.style.borderColor = '#10b981';
    statusBadge.style.color = '#10b981';
    statusBadge.style.background = 'rgba(16, 185, 129, 0.1)';

    if (!animationFrameId) {
        tick();
    }
}

function addSystemLog(level, text) {
    const timeStr = new Date().toLocaleTimeString().split(' ')[0];
    const line = document.createElement('div');
    line.className = `terminal-line ${level}`;
    line.innerHTML = `<span class="timestamp">[${timeStr}]</span> ${text}`;
    terminalBody.appendChild(line);

    // Bound limits
    while (terminalBody.childNodes.length > 100) {
        terminalBody.removeChild(terminalBody.firstChild);
    }
    terminalBody.scrollTop = terminalBody.scrollHeight;
}

// Loop execution
function tick() {
    if (!isPaused) {
        // Run AI decision logic
        const decision = ai.decide(sim.car, sim.obstacles, config, sim.weather);

        // Feed logs into terminal UI
        decision.logs.forEach(log => {
            const line = document.createElement('div');
            line.className = `terminal-line ${log.level}`;
            line.innerHTML = `<span class="timestamp">[${log.timestamp}]</span> ${log.text}`;
            terminalBody.appendChild(line);
            
            // Beep for warning logs
            if (log.level === 'warn' || log.level === 'danger') {
                playSynthesizedSound('beep');
            }
        });
        if (decision.logs.length > 0) {
            terminalBody.scrollTop = terminalBody.scrollHeight;
        }

        // Apply decisions to physics simulation
        sim.update(decision);

        // Update telemetry readouts
        const speedKmh = Math.max(0, (sim.car.speed * 16.5).toFixed(0));
        speedVal.innerHTML = `${speedKmh}<span class="telemetry-unit"> km/h</span>`;
        brakeVal.innerHTML = `${(sim.car.brakePressure * 100).toFixed(0)}<span class="telemetry-unit">%</span>`;
        gforceVal.innerHTML = `${sim.car.gForce.toFixed(2)}<span class="telemetry-unit"> G</span>`;
        
        // Update threat indicator badge
        threatBadge.textContent = decision.threatLevel.toUpperCase();
        threatBadge.className = 'status-badge';
        if (decision.threatLevel === 'critical') {
            threatBadge.classList.add('danger');
            threatBadge.style.borderColor = '#ef4444';
            threatBadge.style.color = '#ef4444';
            threatBadge.style.background = 'rgba(239, 68, 68, 0.1)';
        } else if (decision.threatLevel === 'high') {
            threatBadge.style.borderColor = '#f97316';
            threatBadge.style.color = '#f97316';
            threatBadge.style.background = 'rgba(249, 115, 22, 0.1)';
        } else if (decision.threatLevel === 'medium') {
            threatBadge.style.borderColor = '#fbbf24';
            threatBadge.style.color = '#fbbf24';
            threatBadge.style.background = 'rgba(251, 191, 36, 0.1)';
        } else {
            threatBadge.style.borderColor = '#10b981';
            threatBadge.style.color = '#10b981';
            threatBadge.style.background = 'rgba(16, 185, 129, 0.1)';
        }

        // Render scene
        sim.draw(decision.activeSensors, {
            radar: decision.activeSensors.radar ? ai.getSensorRanges(config, sim.weather, {}).radar : 0,
            lidar: decision.activeSensors.lidar ? ai.getSensorRanges(config, sim.weather, {}).lidar : 0,
            camera: decision.activeSensors.camera ? ai.getSensorRanges(config, sim.weather, {}).camera : 0,
            ultrasonic: decision.activeSensors.ultrasonic ? ai.getSensorRanges(config, sim.weather, {}).ultrasonic : 0
        });

        // Handle overlay modals on completion
        if (sim.car.isCrashed) {
            playSynthesizedSound('crash');
            showOutcomeModal(false, sim.car.crashReason);
            isPaused = true;
            statusBadge.textContent = 'SYSTEM FAILURE';
            statusBadge.style.borderColor = '#ef4444';
            statusBadge.style.color = '#ef4444';
            statusBadge.style.background = 'rgba(239, 68, 68, 0.1)';
        } else if (sim.car.isFinished && sim.car.success) {
            showOutcomeModal(true, sim.car.endMessage);
            isPaused = true;
            statusBadge.textContent = 'SAFE SHUTDOWN';
            statusBadge.style.borderColor = '#10b981';
            statusBadge.style.color = '#10b981';
            statusBadge.style.background = 'rgba(16, 185, 129, 0.1)';
        }
    }

    animationFrameId = requestAnimationFrame(tick);
}

function showOutcomeModal(isSuccess, reason) {
    removeOverlays();

    const modal = document.createElement('div');
    modal.className = 'canvas-modal';
    modal.id = 'outcome-modal';

    const titleClass = isSuccess ? 'success' : 'danger';
    const titleText = isSuccess ? 'CRITICAL AVOIDANCE SUCCESSFUL' : 'SYSTEM CRASH COLLISION';

    modal.innerHTML = `
        <div class="canvas-modal-title ${titleClass}">${titleText}</div>
        <div class="canvas-modal-desc">${reason}</div>
        <button class="control-btn" id="btn-modal-restart">RUN SIMULATION AGAIN</button>
    `;

    canvasContainer.appendChild(modal);

    document.getElementById('btn-modal-restart').addEventListener('click', () => {
        loadScenario(activeScenario);
    });
}

function removeOverlays() {
    const existing = document.getElementById('outcome-modal');
    if (existing) {
        existing.remove();
    }
}

// Initial Setup
window.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    // Default boot
    loadScenario('crossing');
});
