/**
 * Self-Driving Car 2D Canvas Simulation Engine
 */
class SimulationEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Dimensions
        this.width = 600;
        this.height = 600;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Road lanes
        this.laneWidth = 100;
        this.roadWidth = this.laneWidth * 3;
        this.roadLeft = (this.width - this.roadWidth) / 2; // 150
        this.laneCenters = [
            this.roadLeft + this.laneWidth * 0.5, // 200 (Left)
            this.roadLeft + this.laneWidth * 1.5, // 300 (Center)
            this.roadLeft + this.laneWidth * 2.5  // 400 (Right)
        ];

        // Vehicle Setup (cyberpunk style)
        this.car = {
            x: this.laneCenters[1],
            y: 480,
            width: 36,
            height: 64,
            speed: 0,
            maxSpeed: 8,
            lane: 1, // 0: Left, 1: Center, 2: Right
            targetX: this.laneCenters[1],
            brakePressure: 0,
            gForce: 0,
            isCrashed: false,
            crashReason: '',
            isFinished: false
        };

        // Obstacles
        this.obstacles = [];

        // Environment
        this.roadOffset = 0;
        this.weather = 'clear'; // 'clear', 'rain', 'fog'
        this.particles = [];
        this.weatherParticles = [];
        
        // LiDAR sweep angle
        this.lidarAngle = 0;

        // Screen shake flag
        this.shakeTimer = 0;
    }

    reset() {
        this.car.x = this.laneCenters[1];
        this.car.y = 480;
        this.car.speed = 0;
        this.car.lane = 1;
        this.car.targetX = this.laneCenters[1];
        this.car.brakePressure = 0;
        this.car.gForce = 0;
        this.car.isCrashed = false;
        this.car.crashReason = '';
        this.car.isFinished = false;
        this.obstacles = [];
        this.particles = [];
        this.weatherParticles = [];
        this.shakeTimer = 0;
        document.getElementById('canvas-container').classList.remove('shake');
    }

    setWeather(type) {
        this.weather = type;
        this.weatherParticles = [];
        if (type === 'rain') {
            for (let i = 0; i < 80; i++) {
                this.weatherParticles.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    len: Math.random() * 15 + 10,
                    yspeed: Math.random() * 8 + 8
                });
            }
        } else if (type === 'fog') {
            for (let i = 0; i < 15; i++) {
                this.weatherParticles.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    r: Math.random() * 80 + 50,
                    xspeed: Math.random() * 0.4 - 0.2,
                    yspeed: Math.random() * 0.3 + 0.1
                });
            }
        }
    }

    spawnScenarioObstacles(scenarioType) {
        this.reset();
        this.activeScenario = scenarioType;
        
        // Spawning y coordinate is negative, objects scroll down
        if (scenarioType === 'crossing') {
            // SCENARIO 1: The Sudden Crossing (Pedestrian walks out)
            // Spawn pedestrian on the right shoulder, who starts crossing as car approaches
            this.obstacles.push({
                id: 'p1',
                type: 'pedestrian',
                x: this.roadLeft + this.roadWidth + 20, // Shoulder
                y: -100,
                width: 20,
                height: 20,
                speedX: -1.2, // Will move left
                triggerY: 280, // Trigger crossing when car is this distance away (Y coordinate relative difference)
                isTriggered: false,
                heading: 'left'
            });
            this.car.speed = 7;
        } 
        else if (scenarioType === 'dilemma') {
            // SCENARIO 2: Ethical Dilemma (Trolley Problem)
            // Center lane blocked by 3 pedestrians (group)
            // Right lane has a concrete barrier (fatal to driver)
            // Left lane has 1 pedestrian
            // Brakes fail or road is extremely short, forcing a choice!
            
            // Group of 3 pedestrians in center lane
            this.obstacles.push({
                id: 'group',
                type: 'group',
                x: this.laneCenters[1],
                y: -80,
                width: 50,
                height: 25
            });

            // Concrete barrier in right lane
            this.obstacles.push({
                id: 'barrier',
                type: 'barrier',
                x: this.laneCenters[2],
                y: -80,
                width: 60,
                height: 35
            });

            // Single pedestrian in left lane
            this.obstacles.push({
                id: 'single',
                type: 'pedestrian',
                x: this.laneCenters[0],
                y: -80,
                width: 20,
                height: 20
            });
            
            this.car.speed = 8;
        } 
        else if (scenarioType === 'ice') {
            // SCENARIO 3: Bad Weather Brake out
            // Heavy rain, a large box drops/blocks the lane ahead suddenly
            this.obstacles.push({
                id: 'box',
                type: 'box',
                x: this.laneCenters[1],
                y: -150,
                width: 45,
                height: 40
            });
            this.car.speed = 8;
            this.setWeather('rain');
        }
    }

    update(controlSignals) {
        if (this.car.isCrashed) {
            this.car.speed = 0;
            this.updateParticles();
            this.handleShake();
            return;
        }

        // Apply control signals (Throttle / Brake)
        const dt = 1;
        const targetBrake = controlSignals.brake;
        this.car.brakePressure = targetBrake;

        // Apply throttle & brake deceleration
        if (targetBrake > 0) {
            const decelFactor = this.activeScenario === 'dilemma' ? 0.35 : 1.0;
            const decelRate = 0.15 * targetBrake * decelFactor * (this.weather === 'rain' ? 0.6 : 1.0);
            this.car.speed = Math.max(0, this.car.speed - decelRate);
            
            // Brake dust particles
            if (this.car.speed > 1 && Math.random() < 0.3) {
                this.createBrakeParticles();
            }
        } else {
            const accelRate = 0.08 * controlSignals.throttle;
            this.car.speed = Math.min(this.car.maxSpeed, this.car.speed + accelRate);
        }

        // Lane steering lateral physics
        if (controlSignals.steer !== 0) {
            const newLane = Math.max(0, Math.min(2, this.car.lane + controlSignals.steer));
            if (newLane !== this.car.lane) {
                this.car.lane = newLane;
                this.car.targetX = this.laneCenters[this.car.lane];
            }
        }

        // Smooth steering lateral interpolation
        const steeringSpeed = 4.5;
        const oldX = this.car.x;
        this.car.x += (this.car.targetX - this.car.x) * 0.15;
        this.car.gForce = Math.abs(this.car.x - oldX) * 0.35; // G force estimation

        // Road scroll physics
        if (this.car.speed > 0) {
            this.roadOffset = (this.roadOffset + this.car.speed) % 40;
        }

        // Update obstacles
        this.obstacles.forEach(obs => {
            // Objects scroll down relative to car speed
            obs.y += this.car.speed;

            // Scenario crossing pedestrian motion
            if (obs.type === 'pedestrian' && obs.speedX) {
                const distanceToCar = this.car.y - obs.y;
                if (distanceToCar < obs.triggerY) {
                    obs.isTriggered = true;
                }
                if (obs.isTriggered) {
                    obs.x += obs.speedX;
                    // Keep walking back and forth slightly or cross lane
                    if (obs.x < this.roadLeft - 20) {
                        obs.speedX = 0; // stop after crossing
                    }
                }
            }
        });

        // Check Collisions
        this.checkCollisions();

        // Check if scenario is finished (e.g. car successfully stopped before obstacles or passed them)
        this.checkScenarioSuccess();

        // Update particles
        this.updateParticles();
        this.updateWeatherParticles();
        this.handleShake();

        // Rotate LiDAR sweep
        this.lidarAngle = (this.lidarAngle + 0.06) % (Math.PI * 2);
    }

    checkCollisions() {
        const carBox = {
            left: this.car.x - this.car.width / 2,
            right: this.car.x + this.car.width / 2,
            top: this.car.y - this.car.height / 2,
            bottom: this.car.y + this.car.height / 2
        };

        for (let i = 0; i < this.obstacles.length; i++) {
            const obs = this.obstacles[i];
            const obsBox = {
                left: obs.x - obs.width / 2,
                right: obs.x + obs.width / 2,
                top: obs.y - obs.height / 2,
                bottom: obs.y + obs.height / 2
            };

            // Intersection
            if (carBox.left < obsBox.right &&
                carBox.right > obsBox.left &&
                carBox.top < obsBox.bottom &&
                carBox.bottom > obsBox.top) {
                
                // CRASH!
                this.car.isCrashed = true;
                this.triggerCrashParticles(obs.x, obs.y);
                this.shakeTimer = 20; // 20 frames of shake
                document.getElementById('canvas-container').classList.add('shake');

                // Generate detail summary
                if (obs.type === 'pedestrian') {
                    this.car.crashReason = 'Fatality: Hit a pedestrian in the lane.';
                } else if (obs.type === 'group') {
                    this.car.crashReason = 'Catastrophe: Hit a crowd of pedestrians.';
                } else if (obs.type === 'barrier') {
                    this.car.crashReason = 'Impact: Hit concrete barrier. Cabin structure compromised.';
                } else if (obs.type === 'box') {
                    this.car.crashReason = 'Accident: Collided with heavy cargo debris.';
                }
                break;
            }
        }
    }

    checkScenarioSuccess() {
        if (this.obstacles.length === 0) return;

        // Check if all obstacles are behind the vehicle
        const allBehind = this.obstacles.every(obs => obs.y > this.car.y + 80);
        
        // Or if vehicle is stopped safely at 0 speed and lead obstacles are in front
        const stoppedSafely = this.car.speed === 0 && this.obstacles.some(obs => obs.y < this.car.y && obs.y > 0);

        if (allBehind) {
            this.car.isFinished = true;
            this.car.success = true;
            this.car.endMessage = 'Success: Obstacle bypassed safely.';
        } else if (stoppedSafely && !this.car.isCrashed) {
            this.car.isFinished = true;
            this.car.success = true;
            this.car.endMessage = 'Success: Collision avoided. Full stop completed.';
        }
    }

    createBrakeParticles() {
        // Rear tire coordinate offsets
        const leftTireX = this.car.x - 12;
        const rightTireX = this.car.x + 12;
        const tireY = this.car.y + 25;

        for (let i = 0; i < 2; i++) {
            this.particles.push({
                x: leftTireX + Math.random() * 4 - 2,
                y: tireY,
                vx: Math.random() * 1 - 0.5,
                vy: Math.random() * 2 + 1,
                size: Math.random() * 3 + 2,
                color: 'rgba(100, 116, 139, 0.4)', // grey smoke
                alpha: 0.8,
                decay: 0.03
            });
            this.particles.push({
                x: rightTireX + Math.random() * 4 - 2,
                y: tireY,
                vx: Math.random() * 1 - 0.5,
                vy: Math.random() * 2 + 1,
                size: Math.random() * 3 + 2,
                color: 'rgba(100, 116, 139, 0.4)',
                alpha: 0.8,
                decay: 0.03
            });
        }
    }

    triggerCrashParticles(x, y) {
        // Metal sparks
        for (let i = 0; i < 40; i++) {
            this.particles.push({
                x: x + Math.random() * 20 - 10,
                y: y + Math.random() * 20 - 10,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.6) * 10,
                size: Math.random() * 3 + 1,
                color: Math.random() > 0.3 ? '#ff7c1e' : '#ffea00', // orange/yellow sparks
                alpha: 1.0,
                decay: 0.015
            });
        }
        // Black smoke
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x: x + Math.random() * 10 - 5,
                y: y + Math.random() * 10 - 5,
                vx: (Math.random() - 0.5) * 3,
                vy: -Math.random() * 2 - 1,
                size: Math.random() * 15 + 10,
                color: 'rgba(30, 30, 30, 0.6)',
                alpha: 0.7,
                decay: 0.008
            });
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= p.decay;
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    updateWeatherParticles() {
        if (this.weather === 'rain') {
            this.weatherParticles.forEach(p => {
                p.y += p.yspeed;
                p.x -= 1; // slanted fall
                if (p.y > this.height) {
                    p.y = -10;
                    p.x = Math.random() * this.width;
                }
            });
        } else if (this.weather === 'fog') {
            this.weatherParticles.forEach(p => {
                p.x += p.xspeed;
                p.y += p.yspeed;
                if (p.y > this.height + p.r) {
                    p.y = -p.r;
                    p.x = Math.random() * this.width;
                }
                if (p.x > this.width + p.r || p.x < -p.r) {
                    p.x = Math.random() * this.width;
                }
            });
        }
    }

    handleShake() {
        if (this.shakeTimer > 0) {
            this.shakeTimer--;
            if (this.shakeTimer === 0) {
                document.getElementById('canvas-container').classList.remove('shake');
            }
        }
    }

    draw(sensorActive, sensorRanges) {
        // Clear canvas
        this.ctx.fillStyle = '#060813';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // 1. Draw Scrolling Road
        this.drawRoad();

        // 2. Draw Active Sensor Waves/Cones (Under obstacles & car)
        if (!this.car.isCrashed) {
            this.drawSensorCones(sensorActive, sensorRanges);
        }

        // 3. Draw Obstacles
        this.drawObstacles();

        // 4. Draw Particles (Smoke & Sparks)
        this.drawParticles();

        // 5. Draw Autonomous Car
        this.drawCar();

        // 6. Draw Weather Overlays (rain/fog)
        this.drawWeather();
    }

    drawRoad() {
        // Road surface
        this.ctx.fillStyle = '#0f1122';
        this.ctx.fillRect(this.roadLeft, 0, this.roadWidth, this.height);

        // Grass/Shoulder borders (high-tech cyber line)
        this.ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(this.roadLeft, 0);
        this.ctx.lineTo(this.roadLeft, this.height);
        this.ctx.moveTo(this.roadLeft + this.roadWidth, 0);
        this.ctx.lineTo(this.roadLeft + this.roadWidth, this.height);
        this.ctx.stroke();

        // Lane separators
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([20, 20]); // dashed
        
        // Left divider
        this.ctx.beginPath();
        this.ctx.moveTo(this.roadLeft + this.laneWidth, -this.roadOffset);
        this.ctx.lineTo(this.roadLeft + this.laneWidth, this.height + 40);
        this.ctx.stroke();

        // Right divider
        this.ctx.beginPath();
        this.ctx.moveTo(this.roadLeft + this.laneWidth * 2, -this.roadOffset);
        this.ctx.lineTo(this.roadLeft + this.laneWidth * 2, this.height + 40);
        this.ctx.stroke();

        this.ctx.setLineDash([]); // Reset dash
    }

    drawSensorCones(active, ranges) {
        const carFrontX = this.car.x;
        const carFrontY = this.car.y - this.car.height / 2;

        this.ctx.save();

        // CAMERA: Yellow forward viewing wedge
        if (active.camera && ranges.camera > 0) {
            const grad = this.ctx.createRadialGradient(carFrontX, carFrontY, 10, carFrontX, carFrontY, ranges.camera);
            grad.addColorStop(0, 'rgba(234, 179, 8, 0.2)');
            grad.addColorStop(1, 'rgba(234, 179, 8, 0.0)');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.moveTo(carFrontX, carFrontY);
            // 40 degrees cone
            this.ctx.arc(carFrontX, carFrontY, ranges.camera, -Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35);
            this.ctx.closePath();
            this.ctx.fill();
        }

        // RADAR: Light blue sweeping concentric arcs
        if (active.radar && ranges.radar > 0) {
            const pulseRadius = (Date.now() / 6) % ranges.radar;
            this.ctx.strokeStyle = 'rgba(14, 165, 233, 0.15)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(carFrontX, carFrontY, pulseRadius, -Math.PI / 2 - 0.7, -Math.PI / 2 + 0.7);
            this.ctx.stroke();

            // Radar outer limit border
            this.ctx.strokeStyle = 'rgba(14, 165, 233, 0.05)';
            this.ctx.beginPath();
            this.ctx.arc(carFrontX, carFrontY, ranges.radar, -Math.PI / 2 - 0.7, -Math.PI / 2 + 0.7);
            this.ctx.stroke();
        }

        // LIDAR: Rapidly rotating red thin lasers
        if (active.lidar && ranges.lidar > 0) {
            this.ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
            this.ctx.lineWidth = 1;
            
            // Sweep multiple rays centered around front
            for (let i = -6; i <= 6; i++) {
                const angle = -Math.PI / 2 + (i * 0.12) + Math.sin(this.lidarAngle) * 0.15;
                const endX = carFrontX + Math.cos(angle) * ranges.lidar;
                const endY = carFrontY + Math.sin(angle) * ranges.lidar;

                this.ctx.beginPath();
                this.ctx.moveTo(carFrontX, carFrontY);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
            }
        }

        // ULTRASONIC: Green shield/short range circle around car
        if (active.ultrasonic && ranges.ultrasonic > 0) {
            this.ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
            this.ctx.lineWidth = 1.5;
            this.ctx.setLineDash([4, 4]);

            // Draw oval around car coordinates
            this.ctx.beginPath();
            this.ctx.ellipse(this.car.x, this.car.y, ranges.ultrasonic * 0.7, ranges.ultrasonic, 0, 0, Math.PI * 2);
            this.ctx.stroke();

            // Glow overlay
            this.ctx.fillStyle = 'rgba(16, 185, 129, 0.02)';
            this.ctx.beginPath();
            this.ctx.ellipse(this.car.x, this.car.y, ranges.ultrasonic * 0.7, ranges.ultrasonic, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.setLineDash([]);
        }

        this.ctx.restore();
    }

    drawCar() {
        this.ctx.save();
        this.ctx.translate(this.car.x, this.car.y);

        // Tire elements
        this.ctx.fillStyle = '#1e293b';
        // Front left
        this.ctx.fillRect(-this.car.width/2 - 4, -this.car.height/2 + 8, 4, 12);
        // Front right
        this.ctx.fillRect(this.car.width/2, -this.car.height/2 + 8, 4, 12);
        // Rear left
        this.ctx.fillRect(-this.car.width/2 - 4, this.car.height/2 - 20, 4, 12);
        // Rear right
        this.ctx.fillRect(this.car.width/2, this.car.height/2 - 20, 4, 12);

        // Vehicle body base
        this.ctx.fillStyle = this.car.isCrashed ? '#334155' : '#4f46e5';
        this.ctx.strokeStyle = this.car.isCrashed ? '#1e293b' : '#818cf8';
        this.ctx.lineWidth = 2.5;

        // Rounded body
        this.ctx.beginPath();
        this.ctx.roundRect(-this.car.width/2, -this.car.height/2, this.car.width, this.car.height, [8, 8, 4, 4]);
        this.ctx.fill();
        this.ctx.stroke();

        // Neon design decals (glowing stripes)
        if (!this.car.isCrashed) {
            this.ctx.fillStyle = 'rgba(99, 102, 241, 0.8)';
            this.ctx.fillRect(-10, -18, 4, 30);
            this.ctx.fillRect(6, -18, 4, 30);

            // Glowing cockpit windshield
            this.ctx.fillStyle = 'rgba(129, 140, 248, 0.4)';
            this.ctx.beginPath();
            this.ctx.roundRect(-12, -22, 24, 14, 3);
            this.ctx.fill();

            // Headlights (cyan beam)
            this.ctx.fillStyle = 'rgba(14, 165, 233, 0.5)';
            this.ctx.fillRect(-14, -this.car.height/2 - 1, 6, 3);
            this.ctx.fillRect(8, -this.car.height/2 - 1, 6, 3);
            
            // Tail lights (red glow)
            this.ctx.fillStyle = this.car.brakePressure > 0 ? '#ef4444' : '#991b1b';
            this.ctx.shadowColor = this.car.brakePressure > 0 ? '#ef4444' : 'transparent';
            this.ctx.shadowBlur = this.car.brakePressure > 0 ? 8 : 0;
            this.ctx.fillRect(-14, this.car.height/2 - 2, 6, 3);
            this.ctx.fillRect(8, this.car.height/2 - 2, 6, 3);
        } else {
            // Draw crash damage/charring
            this.ctx.fillStyle = '#111827';
            this.ctx.beginPath();
            this.ctx.arc(0, -this.car.height/2 + 5, 12, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    drawObstacles() {
        this.obstacles.forEach(obs => {
            this.ctx.save();
            this.ctx.translate(obs.x, obs.y);

            // Bounding box/glow based on detection
            if (obs.detected) {
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = obs.classified ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)';
            }

            if (obs.type === 'pedestrian') {
                // Draw Pedestrian (circle head, torso, arm glows)
                this.ctx.fillStyle = '#fca5a5';
                
                // Head
                this.ctx.beginPath();
                this.ctx.arc(0, -5, 6, 0, Math.PI*2);
                this.ctx.fill();
                
                // Body (Neon orange jacket)
                this.ctx.fillStyle = '#f97316';
                this.ctx.beginPath();
                this.ctx.arc(0, 5, 8, 0, Math.PI, true);
                this.ctx.fill();
            } 
            else if (obs.type === 'group') {
                // Draw Group (three overlapping smaller heads/bodies)
                this.ctx.fillStyle = '#fca5a5';
                
                // Pedestrian 1 (Left)
                this.ctx.beginPath();
                this.ctx.arc(-14, -4, 5, 0, Math.PI*2);
                this.ctx.fill();
                this.ctx.fillStyle = '#ec4899';
                this.ctx.beginPath();
                this.ctx.arc(-14, 5, 7, 0, Math.PI, true);
                this.ctx.fill();

                // Pedestrian 2 (Center)
                this.ctx.fillStyle = '#fca5a5';
                this.ctx.beginPath();
                this.ctx.arc(0, -8, 6, 0, Math.PI*2);
                this.ctx.fill();
                this.ctx.fillStyle = '#f97316';
                this.ctx.beginPath();
                this.ctx.arc(0, 2, 8, 0, Math.PI, true);
                this.ctx.fill();

                // Pedestrian 3 (Right)
                this.ctx.fillStyle = '#fca5a5';
                this.ctx.beginPath();
                this.ctx.arc(14, -3, 5, 0, Math.PI*2);
                this.ctx.fill();
                this.ctx.fillStyle = '#06b6d4';
                this.ctx.beginPath();
                this.ctx.arc(14, 6, 7, 0, Math.PI, true);
                this.ctx.fill();
            } 
            else if (obs.type === 'barrier') {
                // Concrete/hazard barrier (grey with yellow/black warnings)
                this.ctx.fillStyle = '#374151';
                this.ctx.fillRect(-obs.width/2, -obs.height/2, obs.width, obs.height);

                // Warning stripes
                this.ctx.strokeStyle = '#fbbf24';
                this.ctx.lineWidth = 4;
                this.ctx.beginPath();
                for (let x = -obs.width/2 + 5; x < obs.width/2; x += 12) {
                    this.ctx.moveTo(x, -obs.height/2);
                    this.ctx.lineTo(x + 8, obs.height/2);
                }
                this.ctx.stroke();

                // Border
                this.ctx.strokeStyle = '#1f2937';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(-obs.width/2, -obs.height/2, obs.width, obs.height);
            } 
            else if (obs.type === 'box') {
                // Industrial cargo box
                this.ctx.fillStyle = '#78350f';
                this.ctx.fillRect(-obs.width/2, -obs.height/2, obs.width, obs.height);

                // Cross strap markings
                this.ctx.strokeStyle = '#b45309';
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(-obs.width/2 + 4, -obs.height/2 + 4, obs.width - 8, obs.height - 8);
                this.ctx.beginPath();
                this.ctx.moveTo(-obs.width/2, -obs.height/2);
                this.ctx.lineTo(obs.width/2, obs.height/2);
                this.ctx.moveTo(obs.width/2, -obs.height/2);
                this.ctx.lineTo(-obs.width/2, obs.height/2);
                this.ctx.stroke();
            }

            // Draw HUD target locking frame if detected
            if (obs.detected) {
                this.ctx.strokeStyle = obs.classified ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
                this.ctx.lineWidth = 1;
                
                const frameSize = Math.max(obs.width, obs.height) + 12;
                // Draw corner brackets
                // Top Left
                this.ctx.beginPath();
                this.ctx.moveTo(-frameSize/2, -frameSize/2 + 6);
                this.ctx.lineTo(-frameSize/2, -frameSize/2);
                this.ctx.lineTo(-frameSize/2 + 6, -frameSize/2);
                this.ctx.stroke();

                // Top Right
                this.ctx.beginPath();
                this.ctx.moveTo(frameSize/2, -frameSize/2 + 6);
                this.ctx.lineTo(frameSize/2, -frameSize/2);
                this.ctx.lineTo(frameSize/2 - 6, -frameSize/2);
                this.ctx.stroke();

                // Bottom Left
                this.ctx.beginPath();
                this.ctx.moveTo(-frameSize/2, frameSize/2 - 6);
                this.ctx.lineTo(-frameSize/2, frameSize/2);
                this.ctx.lineTo(-frameSize/2 + 6, frameSize/2);
                this.ctx.stroke();

                // Bottom Right
                this.ctx.beginPath();
                this.ctx.moveTo(frameSize/2, frameSize/2 - 6);
                this.ctx.lineTo(frameSize/2, frameSize/2);
                this.ctx.lineTo(frameSize/2 - 6, frameSize/2);
                this.ctx.stroke();

                // Draw label above
                if (obs.classified) {
                    this.ctx.fillStyle = '#10b981';
                    this.ctx.font = '700 8px Orbitron';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText(obs.type.toUpperCase(), 0, -frameSize/2 - 4);
                } else {
                    this.ctx.fillStyle = '#ef4444';
                    this.ctx.font = '700 8px Orbitron';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('UNKNOWN', 0, -frameSize/2 - 4);
                }
            }

            this.ctx.restore();
        });
    }

    drawParticles() {
        this.particles.forEach(p => {
            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });
    }

    drawWeather() {
        this.ctx.save();
        if (this.weather === 'rain') {
            this.ctx.strokeStyle = 'rgba(156, 163, 175, 0.4)';
            this.ctx.lineWidth = 1;
            this.weatherParticles.forEach(p => {
                this.ctx.beginPath();
                this.ctx.moveTo(p.x, p.y);
                this.ctx.lineTo(p.x - 2, p.y + p.len);
                this.ctx.stroke();
            });
        } 
        else if (this.weather === 'fog') {
            this.weatherParticles.forEach(p => {
                const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
                grad.addColorStop(0, 'rgba(203, 213, 225, 0.15)');
                grad.addColorStop(1, 'rgba(203, 213, 225, 0.0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
                this.ctx.fill();
            });
        }
        this.ctx.restore();
    }
}
