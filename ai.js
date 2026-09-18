/**
 * Self-Driving Car AI Decision Engine
 */
class AutonomousAI {
    constructor() {
        this.lastLogTime = 0;
        this.loggedEvents = new Set();
    }

    reset() {
        this.lastLogTime = 0;
        this.loggedEvents.clear();
    }

    /**
     * Main decision loop
     * @param {Object} car - Vehicle state (speed, x, y, lane, width, height)
     * @param {Array} obstacles - List of obstacles on the road
     * @param {Object} config - Active user upgrades (sensors, systems, moral)
     * @param {String} weather - Weather condition ('clear', 'rain', 'fog')
     * @returns {Object} Control signals and AI logs
     */
    decide(car, obstacles, config, weather) {
        const decision = {
            throttle: 1.0,
            brake: 0.0,
            steer: 0, // Target lane relative offset
            logs: [],
            threatLevel: 'low',
            activeSensors: { radar: false, lidar: false, camera: false, ultrasonic: false },
            brakingDistance: 0
        };

        // 1. Evaluate Sensor Capabilities under Weather conditions
        const sensorRanges = this.getSensorRanges(config, weather, decision.activeSensors);
        
        // 2. Scan and Classify Obstacles
        const detectedObstacles = this.scanObstacles(car, obstacles, sensorRanges, config);

        // 3. Calculate Physics Parameters (Headway, Braking Distance)
        const roadFriction = this.getRoadFriction(weather, config.systems.weatherAdaptation);
        
        // Deceleration rate per frame in pixels matching simulation.js physics
        const decelRatePerFrame = 0.15 * (weather === 'rain' ? 0.6 : 1.0);
        
        // Reaction time in frames (60 FPS base)
        const reactionFrames = config.systems.collisionAvoidance ? 8 : 28;
        
        // Braking distance in pixels = reaction distance + physical deceleration distance
        const brakingDistancePx = (car.speed * reactionFrames) + ((car.speed * car.speed) / (2 * decelRatePerFrame));
        
        // Convert braking distance back to display metric meters (10px = 1m)
        decision.brakingDistance = brakingDistancePx / 10;

        // 4. Identify threats in current lane
        const currentLaneObstacles = detectedObstacles.filter(obs => {
            const obsLane = this.getLaneFromX(obs.x);
            return obsLane === car.lane && obs.y < car.y; // ahead of us
        });

        // Sort by distance (closest first)
        currentLaneObstacles.sort((a, b) => b.y - a.y); // y flows top-to-bottom, so higher y is closer to car (car is at bottom)
        const leadObstacle = currentLaneObstacles[0];

        if (leadObstacle) {
            const distancePx = car.y - (leadObstacle.y + leadObstacle.height / 2) - car.height / 2;
            const distanceM = distancePx / 10;

            // Threat level mapping
            if (distancePx < brakingDistancePx * 0.5) {
                decision.threatLevel = 'critical';
            } else if (distancePx < brakingDistancePx) {
                decision.threatLevel = 'high';
            } else if (distancePx < brakingDistancePx * 2) {
                decision.threatLevel = 'medium';
            }

            // Log detection events (throttled to avoid spamming)
            if (leadObstacle.classified) {
                this.addLog(decision.logs, `info`, `Detected ${leadObstacle.type} in lane at ${distanceM.toFixed(1)}m`);
            } else {
                this.addLog(decision.logs, `warn`, `Radar echo: Unidentified object in lane at ${distanceM.toFixed(1)}m`);
            }

            // 5. Control Calculations (Throttle & Brake)
            if (distancePx < brakingDistancePx * 1.5) {
                // Proportional braking
                decision.throttle = 0;
                const brakingStrength = Math.min(1.0, (brakingDistancePx * 1.5 - distancePx) / brakingDistancePx);
                decision.brake = Math.max(0.1, brakingStrength);
                
                if (weather === 'rain' && !config.systems.weatherAdaptation && decision.brake > 0.6) {
                    this.addLog(decision.logs, `danger`, `WARNING: Braking lock-up. Traction lost (Aquaplaning)!`);
                }
            }

            // 6. Collision Avoidance & Ethical Reasoning
            if (distancePx < brakingDistancePx && decision.brake > 0.5) {
                if (config.systems.collisionAvoidance) {
                    this.addLog(decision.logs, `warn`, `Collision imminent. Time-to-Collision: ${(distancePx / Math.max(1, car.speed)).toFixed(2)}s. Planning avoidance path...`);
                    
                    // Determine possible lanes to swerve into
                    const leftLaneObstacles = detectedObstacles.filter(obs => this.getLaneFromX(obs.x) === car.lane - 1 && Math.abs(obs.y - car.y) < 350);
                    const rightLaneObstacles = detectedObstacles.filter(obs => this.getLaneFromX(obs.x) === car.lane + 1 && Math.abs(obs.y - car.y) < 350);
                    
                    const leftLaneClear = car.lane > 0 && leftLaneObstacles.length === 0;
                    const rightLaneClear = car.lane < 2 && rightLaneObstacles.length === 0;

                    // Execute ethical decision tree
                    const pathPlan = this.applyEthicalFramework(
                        car.lane,
                        leadObstacle,
                        leftLaneObstacles[0],
                        rightLaneObstacles[0],
                        leftLaneClear,
                        rightLaneClear,
                        config.moralDirective,
                        decision.logs
                    );

                    decision.steer = pathPlan.steer;
                    if (pathPlan.brakeOverride !== undefined) {
                        decision.brake = pathPlan.brakeOverride;
                    }
                } else {
                    this.addLog(decision.logs, `danger`, `Collision risk high! Swerve systems inactive. Full emergency braking only.`);
                }
            }
        } else {
            // Speed adaptation for weather
            let targetSpeed = 8; // Max default speed
            if (weather === 'rain') targetSpeed = config.systems.weatherAdaptation ? 5.5 : 8;
            if (weather === 'fog') targetSpeed = config.systems.weatherAdaptation ? 4.0 : 8;

            if (car.speed < targetSpeed) {
                decision.throttle = 1.0;
                decision.brake = 0.0;
            } else {
                decision.throttle = 0.2; // Cruise
                decision.brake = 0.0;
            }
        }

        return decision;
    }

    /**
     * Calculate effective sensor ranges based on configuration and weather
     */
    getSensorRanges(config, weather, activeTracker) {
        const ranges = { radar: 0, lidar: 0, camera: 0, ultrasonic: 0 };

        // Camera: Excellent range in clear weather, severely limited by fog and rain
        if (config.sensors.camera) {
            activeTracker.camera = true;
            if (weather === 'clear') ranges.camera = 350;
            else if (weather === 'rain') ranges.camera = 200;
            else if (weather === 'fog') ranges.camera = 90;
        }

        // Radar: Very long range, unaffected by weather, but low classification detail
        if (config.sensors.radar) {
            activeTracker.radar = true;
            ranges.radar = 480; // High penetration
        }

        // LiDAR: Medium-long range, high precision, slightly degraded by heavy rain/fog scattering
        if (config.sensors.lidar) {
            activeTracker.lidar = true;
            if (weather === 'clear') ranges.lidar = 320;
            else if (weather === 'rain') ranges.lidar = 260;
            else if (weather === 'fog') ranges.lidar = 180;
        }

        // Ultrasonic: Extremely short range (around vehicle), unaffected by weather
        if (config.sensors.ultrasonic) {
            activeTracker.ultrasonic = true;
            ranges.ultrasonic = 90;
        }

        return ranges;
    }

    /**
     * Filter obstacles by sensor range and check classification status
     */
    scanObstacles(car, obstacles, ranges, config) {
        return obstacles.map(obs => {
            const distance = Math.hypot(car.x - obs.x, car.y - obs.y);
            let detected = false;
            let classified = false;

            // Radar detects presence only
            if (ranges.radar > 0 && distance < ranges.radar) {
                detected = true;
                // Radar alone cannot classify pedestrians vs trash
                classified = false;
            }

            // LiDAR detects bounding shape and presence
            if (ranges.lidar > 0 && distance < ranges.lidar) {
                detected = true;
                // LiDAR provides shape matching
                if (config.systems.pedestrianDetection) {
                    classified = true;
                }
            }

            // Camera is crucial for color, classification, and labels
            if (ranges.camera > 0 && distance < ranges.camera) {
                detected = true;
                if (config.systems.pedestrianDetection) {
                    classified = true;
                }
            }

            // Ultrasonic handles immediate blind spots
            if (ranges.ultrasonic > 0 && distance < ranges.ultrasonic) {
                detected = true;
                if (config.systems.pedestrianDetection && distance < 60) {
                    classified = true;
                }
            }

            return {
                ...obs,
                detected,
                classified: detected && classified
            };
        }).filter(obs => obs.detected);
    }

    getRoadFriction(weather, weatherAdaptation) {
        if (weather === 'clear') return 1.0;
        if (weather === 'rain') return weatherAdaptation ? 0.65 : 0.45; // Wet sliding
        if (weather === 'fog') return 0.85; // Moist surface
        return 1.0;
    }

    getLaneFromX(x) {
        // Lanes: 0 (Left), 1 (Center), 2 (Right)
        // Road is centered, width = 360, let's assume road spans x: 120 to 480
        // Lane width = 120
        if (x < 240) return 0;
        if (x < 360) return 1;
        return 2;
    }

    /**
     * Core ethical decision maker (The Trolley Problem calculator)
     */
    applyEthicalFramework(currentLane, leadObstacle, leftObstacle, rightObstacle, leftClear, rightClear, moralDirective, logs) {
        // Default behavior: brake and stay
        const plan = { steer: 0, brakeOverride: 1.0 };

        // Translate lead obstacle classification
        const leadType = leadObstacle.classified ? leadObstacle.type : 'unidentified barrier';

        // Check if swerving is safe or if it contains lives
        const leftType = leftObstacle ? (leftObstacle.classified ? leftObstacle.type : 'unidentified obstacle') : 'clear';
        const rightType = rightObstacle ? (rightObstacle.classified ? rightObstacle.type : 'unidentified obstacle') : 'clear';

        // Helper to count human lives in obstacle
        const getLifeValue = (type) => {
            if (type === 'pedestrian') return 1;
            if (type === 'group') return 3;
            if (type === 'barrier') return 0; // Solid wall (dangerous to driver, 0 pedestrians)
            if (type === 'box') return 0; // Minor debris
            return 0;
        };

        const leadLives = getLifeValue(leadType);
        const leftLives = leftObstacle ? getLifeValue(leftType) : 0;
        const rightLives = rightObstacle ? getLifeValue(rightType) : 0;

        switch (moralDirective) {
            case 'egoism':
                // EGOISM: Prioritize vehicle passenger/occupant survival.
                // Avoid crashing into high-mass barriers (walls, trucks) at all costs.
                // Swerving into pedestrians is preferred over hitting a solid wall that kills the driver.
                this.addLog(logs, 'system', `MORAL FRAMEWORK: Egoism (Self-Preservation Active)`);
                
                if (leadType === 'barrier') {
                    // Hit pedestrians to save passenger
                    if (leftClear) {
                        this.addLog(logs, 'warn', `Egoism: Avoiding barrier (fatal to driver). Swerving left.`);
                        plan.steer = -1;
                    } else if (rightClear) {
                        this.addLog(logs, 'warn', `Egoism: Avoiding barrier. Swerving right.`);
                        plan.steer = 1;
                    } else {
                        // Choose the target that has the lowest mass / resistance
                        const leftIsSoft = leftType !== 'barrier';
                        const rightIsSoft = rightType !== 'barrier';
                        if (leftIsSoft && currentLane > 0) {
                            this.addLog(logs, 'danger', `Egoism: Occupant safety threat. Swerving left into ${leftType} to avoid concrete barrier.`);
                            plan.steer = -1;
                        } else if (rightIsSoft && currentLane < 2) {
                            this.addLog(logs, 'danger', `Egoism: Occupant safety threat. Swerving right into ${rightType} to avoid concrete barrier.`);
                            plan.steer = 1;
                        } else {
                            this.addLog(logs, 'danger', `Egoism: Direct impact with barrier unavoidable. Bracing for crash.`);
                        }
                    }
                } else {
                    // Lead is a pedestrian/debris - check if occupant is safer by staying in lane or swerving
                    this.addLog(logs, 'info', `Egoism: Staying in lane. Pedestrian impact will not breach cabin structure.`);
                }
                break;

            case 'utilitarian':
                // UTILITARIANISM: Minimize total casualties.
                // 1 life lost is better than 3 lives. Saving 3 pedestrians is better than saving 1 driver or 1 pedestrian.
                this.addLog(logs, 'system', `MORAL FRAMEWORK: Utilitarianism (Minimize Casualty Count)`);
                
                // Compare targets
                const leadCasualties = leadLives;
                // Occupant counts as 1 life if we hit a barrier
                const leftCasualties = leftObstacle ? (leftType === 'barrier' ? 1 : leftLives) : 0;
                const rightCasualties = rightObstacle ? (rightType === 'barrier' ? 1 : rightLives) : 0;

                let options = [];
                options.push({ laneDiff: 0, casualties: leadCasualties, name: leadType });
                if (currentLane > 0) options.push({ laneDiff: -1, casualties: leftCasualties, name: leftType });
                if (currentLane < 2) options.push({ laneDiff: 1, casualties: rightCasualties, name: rightType });

                // Sort options by casualty count (ascending)
                options.sort((a, b) => a.casualties - b.casualties);

                const bestOption = options[0];
                if (bestOption.laneDiff !== 0) {
                    this.addLog(logs, 'success', `Utilitarian: Calculated path of minimal harm. Swerving from ${leadType} (${leadCasualties} lives) to ${bestOption.name} (${bestOption.casualties} lives).`);
                    plan.steer = bestOption.laneDiff;
                } else {
                    this.addLog(logs, 'info', `Utilitarian: Staying in current lane is path of minimal harm.`);
                }
                break;

            case 'deontology':
                // DEONTOLOGY: Rule-based ethics.
                // Duty to obey traffic laws. Never steer out of the lane over solid yellow lines/borders.
                // Do not actively choose to kill someone else to save a group (no active sacrifice).
                // Action: Apply maximum braking inside the lane. No illegal maneuvers.
                this.addLog(logs, 'system', `MORAL FRAMEWORK: Deontology (Strict Duty & Rules Adherence)`);
                this.addLog(logs, 'warn', `Deontology: Swerve avoided to prevent lane breach / crossing markings. emergency brake engaged.`);
                plan.steer = 0; // Stay in lane
                break;

            case 'none':
            default:
                // No ethics programmed!
                // AI suffers "decision freeze" under extreme threat.
                this.addLog(logs, 'danger', `ERROR: No moral framework selected! AI decision paralysis. Emergency brakes failing.`);
                plan.steer = 0;
                plan.brakeOverride = 0.3; // Insufficient braking
                break;
        }

        return plan;
    }

    addLog(logs, level, text) {
        const now = Date.now();
        const eventKey = `${level}:${text}`;
        
        // Log only if event is different or enough time has passed (e.g. 1.5s) to avoid spamming the terminal
        if (!this.loggedEvents.has(eventKey) || (now - this.lastLogTime > 1500)) {
            const timeStr = new Date().toLocaleTimeString().split(' ')[0];
            logs.push({ level, text, timestamp: timeStr });
            this.loggedEvents.add(eventKey);
            this.lastLogTime = now;
        }
    }
}
