
import { TelemetryPacket, CsvField, SimulationPreset, ChecksumMode, WindSettings, DescentSettings, SimulationConfig } from '../types';
import { SKIP_FIELD } from '../constants';
import { getAirDensity } from './geo';

// Physics Limits for Validation (used by parser)
const LIMITS = {
  MIN_TEMP: -273.15, // Absolute Zero
  MAX_TEMP: 200,     // Reasonable upper limit for standard electronics/environment
  MIN_ABS_ALT: -500, // Dead Sea is around -430m
  MAX_ABS_ALT: 100000, // Edge of space (ish)
  MAX_SPEED: 10000, // Hypersonic
};

// Throttle logger to prevent console spam freezing the browser
let lastLogTime = 0;
const throttleLog = (msg: string, ...args: any[]) => {
    const now = Date.now();
    // Only log once every 2 seconds per type of error roughly
    if (now - lastLogTime > 2000) {
        console.warn(msg, ...args);
        lastLogTime = now;
    }
};

// AETHER: Checksum Verification Logic
const verifyChecksum = (line: string, mode: ChecksumMode): { isValid: boolean; cleanLine: string } => {
    if (mode === 'none') return { isValid: true, cleanLine: line };

    // Standard format is: DATA*CS
    const starIndex = line.lastIndexOf('*');
    
    if (starIndex === -1) {
        throttleLog("[Checksum] Integrity Check Failed: No '*' separator found.");
        return { isValid: false, cleanLine: line };
    }

    const dataContent = line.substring(0, starIndex);
    const providedHex = line.substring(starIndex + 1).trim();
    
    // NMEA Style: $ prefix is ignored in calculation if present
    // Calculation is XOR of all bytes between $ and * (or start and *)
    let calcStart = 0;
    if (dataContent.startsWith('$')) calcStart = 1;

    let calculated = 0;
    
    if (mode === 'nmea') {
        for (let i = calcStart; i < dataContent.length; i++) {
            calculated ^= dataContent.charCodeAt(i);
        }
    } else if (mode === 'mod256') {
        for (let i = calcStart; i < dataContent.length; i++) {
            calculated = (calculated + dataContent.charCodeAt(i)) % 256;
        }
    }

    const calculatedHex = calculated.toString(16).toUpperCase().padStart(2, '0');
    const isValid = calculatedHex === providedHex.toUpperCase();

    if (!isValid) {
        throttleLog(`[Checksum] Mismatch! Calc: ${calculatedHex}, Recv: ${providedHex}`);
    }

    return { isValid, cleanLine: dataContent };
};

export const parseTelemetryLine = (
    line: string, 
    order: CsvField[], 
    separator: string = ',', 
    checksumMode: ChecksumMode = 'none',
    validateChecksum: boolean = false
): TelemetryPacket | null => {
  try {
    const rawLine = line.trim();
    if (!rawLine) return null;

    // AETHER: Integrity Verification
    if (validateChecksum && checksumMode !== 'none') {
        const { isValid, cleanLine } = verifyChecksum(rawLine, checksumMode);
        if (!isValid) return null; // Discard corrupted packet
        
        // Use the cleaned line (without *CS) for parsing
        return processLine(cleanLine, order, separator);
    }

    return processLine(rawLine, order, separator);

  } catch (e) {
    throttleLog("[Parser] Critical error parsing line:", e);
    return null;
  }
};

const processLine = (cleanLine: string, order: CsvField[], separator: string): TelemetryPacket | null => {
    // Handle escaped tab character string if passed from UI input
    const actualSeparator = separator === '\\t' ? '\t' : separator;

    const parts = cleanLine.split(actualSeparator).map(s => {
      const val = parseFloat(s.trim());
      // Graceful handling: map actual NaNs to 0, but allow legitimate 0s
      return isNaN(val) ? 0 : val;
    });

    // Logging for debugging malformed lines
    if (parts.length < 3) { // Arbitrary minimum threshold for "useful" data
       return null;
    }

    // Initialize with zeros
    const packet: TelemetryPacket = {
      pressure: 0,
      temperature: 0,
      thermistorTemp: 0,
      latitude: 0,
      longitude: 0,
      gy: 0,
      gx: 0,
      gz: 0,
      heading: 0, 
      timeElapsed: 0,
      runTime: 0,
      absAltitude: 0,
      relAltitude: 0,
      vSpeed: 0,
      hSpeed: 0,
      density: 0
    };
    
    let validFieldsFound = 0;

    order.forEach((field, index) => {
      if (index < parts.length && field !== SKIP_FIELD) {
         // @ts-ignore - ensured key safety via CsvField type
         packet[field] = parts[index];
         validFieldsFound++;
      }
    });

    if (validFieldsFound === 0) {
        return null;
    }

    // Sync Time Fields
    if (packet.runTime !== 0 && packet.timeElapsed === 0) {
        packet.timeElapsed = packet.runTime;
    } else if (packet.timeElapsed !== 0 && packet.runTime === 0) {
        packet.runTime = packet.timeElapsed;
    }

    // --- Validation Checks (Throttled) ---
    if (packet.temperature < LIMITS.MIN_TEMP || packet.temperature > LIMITS.MAX_TEMP) {
        throttleLog(`[Parser] Suspicious Temperature detected: ${packet.temperature}`);
    }
    if (packet.absAltitude < LIMITS.MIN_ABS_ALT || packet.absAltitude > LIMITS.MAX_ABS_ALT) {
         throttleLog(`[Parser] Suspicious Altitude detected: ${packet.absAltitude}`);
    }
    if (packet.hSpeed > LIMITS.MAX_SPEED || packet.vSpeed > LIMITS.MAX_SPEED) {
         throttleLog(`[Parser] Extreme Speed detected: H:${packet.hSpeed} V:${packet.vSpeed}`);
    }

    return packet;
};

// --- ADVANCED SIMULATION ENGINE ---

export interface SimContext {
    wind: WindSettings;
    descent: DescentSettings;
    config: SimulationConfig;
}

enum SimPhase {
  // Universal
  INIT,
  
  // Rocket Profile
  R_IDLE, R_IGNITION, R_BOOST, R_COAST, R_APOGEE, R_DROGUE, R_MAIN, R_LANDED,
  
  // Aerial (Drone/Plane) Profile
  A_TAKEOFF, A_LOITER, A_FIGURE_8, A_DIVE, A_LANDING,
  
  // Unstable Profile
  U_FREEFALL, U_SPIN_FLAT, U_RECOVERY, U_LANDED,

  // Emergency Landing Profile
  E_CRUISE, E_ENGINE_FAIL, E_GLIDE, E_SPIRAL, E_FLARE, E_CRASH_LAND,

  // Stall Profile
  S_CLIMB, S_PITCH_UP_CRITICAL, S_STALL_ONSET, S_NOSE_DROP, S_RECOVERY_DIVE, S_LEVEL_OUT,

  // GPS Nav
  G_LEG_1, G_TURN_1, G_LEG_2, G_TURN_2, G_LEG_3, G_TURN_3, G_LEG_4, G_RETURN,

  // Manual Rocket Logic
  M_IDLE, M_BURN, M_COAST, M_DESCENT, M_GROUND
}

// Persistent Simulation State
let state = {
  scenario: SimulationPreset.ROCKET_LAUNCH,
  phase: SimPhase.INIT,
  timer: 0,
  lastTick: 0,
  
  // Kinematics
  lat: 10.3157, 
  lon: 123.8854, // Cebu IT Park area approx
  startLat: 10.3157,
  startLon: 123.8854,
  alt: 0,
  vel: { x: 0, y: 0, z: 0 }, // Local frame: x=North(m/s), y=East(m/s), z=Up(m/s)
  
  // Attitude
  heading: 0,
  pitch: 0,
  roll: 0,
  
  // Rates
  gyro: { x: 0, y: 0, z: 0 }, // Actual angular velocity state (deg/s)
  
  // Manual Physics Specifics
  propellantConsumed: 0
};

// Helper for randomness
const noise = (amp: number) => (Math.random() - 0.5) * 2 * amp;
// Perlin-ish smooth noise tracker
let timeOffset = 0;

export const setSimScenario = (preset: SimulationPreset) => {
    resetSim(preset);
};

const resetSim = (scenario: SimulationPreset, coords?: {lat: number, lon: number}) => {
    state.scenario = scenario;
    state.timer = 0;
    state.alt = 0;
    state.vel = { x: 0, y: 0, z: 0 };
    state.gyro = { x: 0, y: 0, z: 0 };
    state.heading = 0;
    state.pitch = 0;
    state.roll = 0;
    state.propellantConsumed = 0;
    
    // Update Start Coords if provided (from Context usually)
    if (coords) {
        state.startLat = coords.lat;
        state.startLon = coords.lon;
    }

    // Reset to origin (defaults)
    state.lat = state.startLat + noise(0.0001);
    state.lon = state.startLon + noise(0.0001);
    
    if (scenario === SimulationPreset.ROCKET_LAUNCH || scenario === SimulationPreset.CUSTOM_PARAMETRIC) state.phase = SimPhase.R_IDLE;
    if (scenario === SimulationPreset.AERIAL_MANEUVERS) state.phase = SimPhase.A_TAKEOFF;
    if (scenario === SimulationPreset.UNSTABLE_DESCENT) {
        state.phase = SimPhase.U_FREEFALL;
        state.alt = 3000; 
    }
    if (scenario === SimulationPreset.EMERGENCY_LANDING) {
        state.phase = SimPhase.E_CRUISE;
        state.alt = 800;
        state.vel.x = 25; // Cruise speed North
    }
    if (scenario === SimulationPreset.STALL_RECOVERY) {
        state.phase = SimPhase.S_CLIMB;
        state.alt = 300;
        state.vel.x = 20;
    }
    if (scenario === SimulationPreset.GPS_NAV_TEST) {
        state.phase = SimPhase.G_LEG_1;
        state.alt = 100;
        state.vel.x = 15;
    }
    if (scenario === SimulationPreset.MANUAL_ROCKET_INPUT) {
        state.phase = SimPhase.M_IDLE;
    }
};

const getWindVector = (altitude: number, settings: WindSettings) => {
    let speed = 0;
    let dir = 0;

    if (settings.mode === 'single') {
        speed = settings.speed;
        dir = settings.direction;
    } else {
        // Gradient logic
        if (settings.layers.length > 0) {
            // Find layers
            const sorted = [...settings.layers].sort((a,b) => a.altitude - b.altitude);
            if (altitude <= sorted[0].altitude) {
                speed = sorted[0].speed; dir = sorted[0].direction;
            } else if (altitude >= sorted[sorted.length-1].altitude) {
                speed = sorted[sorted.length-1].speed; dir = sorted[sorted.length-1].direction;
            } else {
                for(let i=0; i<sorted.length-1; i++) {
                    if (altitude >= sorted[i].altitude && altitude <= sorted[i+1].altitude) {
                        const ratio = (altitude - sorted[i].altitude) / (sorted[i+1].altitude - sorted[i].altitude);
                        speed = sorted[i].speed + (sorted[i+1].speed - sorted[i].speed) * ratio;
                        dir = sorted[i].direction + (sorted[i+1].direction - sorted[i].direction) * ratio;
                        break;
                    }
                }
            }
        }
    }
    
    // Convert to vectors (North/East)
    // Wind Direction is "Coming From". 
    // If wind is 90 (East), it blows towards West (270).
    // Math: Blow To = (Dir + 180) % 360.
    const rad = ((dir + 180) % 360) * Math.PI / 180;
    return {
        x: speed * Math.cos(rad), // North component (assuming 0 is North in standard nav, but math usually 0 is East. Adjusting: 0=N, 90=E)
        // Standard Navigation: 0=N, 90=E. 
        // Component N = Speed * cos(rad)
        // Component E = Speed * sin(rad)
        n: speed * Math.cos(rad), 
        e: speed * Math.sin(rad)
    };
};

export const generateMockData = (totalTimeMs: number, preset: SimulationPreset, context: SimContext): TelemetryPacket => {
  // AETHER UPDATE: Detect if Manual Mode GPS inputs have updated or if scenario changed
  const needsReset = state.scenario !== preset;
  const isManualMode = preset === SimulationPreset.MANUAL_ROCKET_INPUT;
  
  if (needsReset) {
      resetSim(preset, isManualMode ? {
          lat: context.config.rocketParams.startLatitude,
          lon: context.config.rocketParams.startLongitude
      } : undefined);
  } else if (isManualMode && state.timer < 0.1) {
      // FORCE SYNC at simulation start (t=0) to catch any setting changes made while stopped
      state.startLat = context.config.rocketParams.startLatitude;
      state.startLon = context.config.rocketParams.startLongitude;
      state.lat = state.startLat;
      state.lon = state.startLon;
  }

  let dt = (totalTimeMs - state.lastTick) / 1000;
  
  if (dt < 0 || dt > 1 || state.phase === SimPhase.INIT) {
      dt = 0.05;
      if (state.phase === SimPhase.INIT) {
          resetSim(preset, isManualMode ? {
              lat: context.config.rocketParams.startLatitude,
              lon: context.config.rocketParams.startLongitude
          } : undefined);
      }
  }
  state.lastTick = totalTimeMs;
  state.timer += dt;

  // --- PHYSICS CONSTANTS ---
  const g = 9.81;
  // AETHER FIX: Use standardized ISA density model to match prediction engine
  const rho = getAirDensity(state.alt);

  // --- SCENARIO STATE MACHINE ---
  switch (state.scenario) {
      case SimulationPreset.ROCKET_LAUNCH: 
      case SimulationPreset.CUSTOM_PARAMETRIC:
          runRocketPhysics(dt, context, rho, g); 
          break;
      case SimulationPreset.AERIAL_MANEUVERS: runAerialLogic(dt); break;
      case SimulationPreset.UNSTABLE_DESCENT: runUnstableLogic(dt); break;
      case SimulationPreset.EMERGENCY_LANDING: runEmergencyLogic(dt); break;
      case SimulationPreset.STALL_RECOVERY: runStallLogic(dt); break;
      case SimulationPreset.GPS_NAV_TEST: runGPSNavLogic(dt); break;
      case SimulationPreset.MANUAL_ROCKET_INPUT: runManualRocketLogic(dt, context, rho, g); break;
  }

  // --- INTEGRATE POSITION ---
  const latDegPerM = 1 / 111320;
  const lonDegPerM = 1 / (111320 * Math.cos(state.lat * Math.PI / 180));
  
  state.lat += state.vel.x * dt * latDegPerM;
  state.lon += state.vel.y * dt * lonDegPerM;
  state.alt += state.vel.z * dt;
  
  if (state.alt < 0) { 
      state.alt = 0; 
      state.vel.z = 0; 
      state.vel.x *= 0.8; // Ground friction
      state.vel.y *= 0.8;
  }

  // --- SENSOR SYNTHESIS ---
  let temp = 30 - (state.alt / 1000 * 6.5);
  const pressure = 101325 * Math.pow(1 - 2.25577e-5 * state.alt, 5.25588) + noise(5);
  
  // Failure Mode Injection
  let latOut = state.lat;
  let lonOut = state.lon;
  
  if (context.config.failureMode === 'no_gps') {
      // Simulate loss of lock
      latOut = 0;
      lonOut = 0;
  } else {
      // Add GPS noise
      latOut += noise(0.000005 * (1 + context.config.noiseLevel));
      lonOut += noise(0.000005 * (1 + context.config.noiseLevel));
  }

  return {
    pressure,
    temperature: temp + noise(0.2),
    thermistorTemp: temp + 5 + noise(0.1), 
    latitude: latOut, 
    longitude: lonOut,
    // AETHER FIX: Mapping Absolute Orientation angles to GX/GY for Visualizer
    // The Visualizer is expecting PITCH in GX and ROLL in GY for this mode.
    gy: state.roll + noise(0.5 + context.config.noiseLevel), 
    gx: state.pitch + noise(0.5 + context.config.noiseLevel), 
    gz: state.gyro.z + noise(0.5 + context.config.noiseLevel), // Keeping Yaw Rate
    heading: state.heading,
    timeElapsed: totalTimeMs,
    runTime: totalTimeMs,
    absAltitude: state.alt + 50, 
    relAltitude: state.alt + noise(0.2), 
    vSpeed: state.vel.z + noise(0.1),
    hSpeed: Math.sqrt(state.vel.x**2 + state.vel.y**2) + noise(0.1),
    density: rho
  };
};

// --- SCENARIO LOGIC IMPLEMENTATIONS ---

// AETHER FIX 3: Coupled Aerodynamics & Moment of Inertia
// Now uses Torque -> Alpha -> Omega (Gyro) integration for realistic wind response.
function runManualRocketLogic(dt: number, ctx: SimContext, rho: number, g: number) {
    const params = ctx.config.rocketParams;
    const descent = ctx.descent;
    // Calculate wind based on altitude (automatically handles Gradient vs Single via Settings)
    const wind = getWindVector(state.alt, ctx.wind);

    // Rocket Parameters
    const payloadMass = descent.mass || 1.0; 
    const motorFuelMass = params.motorWetMass - params.motorDryMass;
    const dia = params.diameter || 0.1;
    const length = params.rocketLength || 2.0; // New: Total Length
    const area = Math.PI * Math.pow(dia / 2, 2);
    const cm = params.centerOfMass || 1.0;
    const cp = params.centerOfPressure || 1.2;
    
    // AETHER UPDATE: Integrate Total Impulse
    let effectiveBurnTime = params.motorBurnTime;
    if (params.totalImpulse && params.totalImpulse > 0 && params.averageThrust > 0) {
        effectiveBurnTime = params.totalImpulse / params.averageThrust;
    }

    // Mass Flow Rate (kg/s) based on effective duration
    const burnRate = effectiveBurnTime > 0 ? (motorFuelMass / effectiveBurnTime) : 0; 

    // Coefficients
    const rocketCd = 0.55; 
    const CnAlpha = 2.5; // Normal force coefficient slope (per radian)

    switch (state.phase) {
        case SimPhase.M_IDLE:
            state.vel = { x: 0, y: 0, z: 0 };
            state.gyro = { x: 0, y: 0, z: 0 }; // Reset Gyros
            state.propellantConsumed = 0;
            // AETHER: Set Initial Attitude based on Launch Settings
            state.pitch = params.launchAngle !== undefined ? params.launchAngle : 90;
            state.heading = params.launchDirection !== undefined ? params.launchDirection : 0;
            state.roll = 0;
            
            if (state.timer > 2) { 
                state.phase = SimPhase.M_BURN; 
                state.timer = 0; 
            }
            break;

        case SimPhase.M_BURN:
            // Mass Update
            state.propellantConsumed += burnRate * dt;
            if (state.propellantConsumed > motorFuelMass) state.propellantConsumed = motorFuelMass;
            const currentMotorMass = params.motorWetMass - state.propellantConsumed;
            const currentTotalMass = params.rocketDryMass + payloadMass + currentMotorMass;

            // Moment of Inertia (I) - Approximation for hollow cylinder/rocket
            // I = k * m * L^2. For rod I=1/12 mL^2. For cylinder I=1/4 mR^2 + 1/12 mL^2.
            // Using 0.06 as a generic factor for distributed mass
            const I = 0.06 * currentTotalMass * (length * length);

            // Thrust Vector
            const thrust = params.averageThrust;
            const pitchRad = state.pitch * Math.PI / 180;
            const headingRad = state.heading * Math.PI / 180;
            
            // Thrust Components (Z is Up)
            // Pitch 90 = Vertical. Pitch 0 = Horizontal.
            const thrustZ = thrust * Math.sin(pitchRad); // Vertical Component
            const thrustH = thrust * Math.cos(pitchRad); // Horizontal Component
            
            // Map Horizontal Thrust to North/East (North = 0 deg heading)
            // Assuming standard map coordinates: N=0 deg, E=90 deg.
            // If Math expects 0=East, we need to shift.
            // Standard: X=North, Y=East
            const thrustX = thrustH * Math.cos(headingRad); // North
            const thrustY = thrustH * Math.sin(headingRad); // East

            // Aerodynamics (Relative Velocity)
            const vAirX = state.vel.x - wind.n;
            const vAirY = state.vel.y - wind.e;
            const vAirZ = state.vel.z;
            const vAirSq = vAirX*vAirX + vAirY*vAirY + vAirZ*vAirZ;
            const vAirMag = Math.sqrt(vAirSq);

            // Drag Force
            const dragMag = 0.5 * rho * vAirSq * rocketCd * area;
            const dragX = vAirMag > 0 ? -dragMag * (vAirX / vAirMag) : 0;
            const dragY = vAirMag > 0 ? -dragMag * (vAirY / vAirMag) : 0;
            const dragZ = vAirMag > 0 ? -dragMag * (vAirZ / vAirMag) : 0;

            // Coupled Aerodynamic Torque & Gyro Physics
            if (vAirMag > 10) { 
                const stabilityMargin = cp - cm; // Positive = Stable
                
                // Calculate "Air Angle" (velocity vector angle)
                const airPitch = Math.asin(vAirZ / vAirMag) * 180 / Math.PI;
                const airHeading = Math.atan2(vAirY, vAirX) * 180 / Math.PI;
                
                // Angle of Attack (Alpha) - Difference between Nose and Velocity
                let deltaPitch = airPitch - state.pitch;
                let deltaHeading = airHeading - state.heading;
                if (deltaHeading > 180) deltaHeading -= 360;
                if (deltaHeading < -180) deltaHeading += 360;

                // Restoring Torque = q * A * CnAlpha * alpha * (CP-CG)
                // We calculate this per axis
                const q = 0.5 * rho * vAirSq;
                const torqueFactor = q * area * CnAlpha * stabilityMargin;
                
                // Convert angles to radians for calculation
                const torquePitch = torqueFactor * (deltaPitch * Math.PI / 180);
                const torqueHeading = torqueFactor * (deltaHeading * Math.PI / 180);

                // Damping Torque (opposes rotation)
                // T_damp = -k * omega * V
                const dampingFactor = 0.8 * vAirMag * rho * area * (length * length);
                const dampPitch = -dampingFactor * (state.gyro.y * Math.PI / 180); // Gyro Y is Pitch Rate
                const dampHeading = -dampingFactor * (state.gyro.z * Math.PI / 180); // Gyro Z is Yaw Rate (simplification)

                // Angular Acceleration (alpha = Torque / I)
                const alphaPitch = (torquePitch + dampPitch) / I;
                const alphaHeading = (torqueHeading + dampHeading) / I;

                // Integrate to get Angular Velocity (Omega)
                // Convert rad/s^2 to deg/s
                state.gyro.y += alphaPitch * (180 / Math.PI) * dt;
                state.gyro.z += alphaHeading * (180 / Math.PI) * dt;
                
                // Integrate Omega to get Attitude
                state.pitch += state.gyro.y * dt;
                state.heading += state.gyro.z * dt;

            } else {
                // Low speed instability
                state.gyro.y = noise(2); 
            }

            // Linear Acceleration
            const accelX = (thrustX + dragX) / currentTotalMass;
            const accelY = (thrustY + dragY) / currentTotalMass;
            const accelZ = (thrustZ + dragZ - (currentTotalMass * g)) / currentTotalMass;

            state.vel.x += accelX * dt;
            state.vel.y += accelY * dt;
            state.vel.z += accelZ * dt;

            if (state.timer >= effectiveBurnTime) {
                state.phase = SimPhase.M_COAST;
                state.timer = 0;
            }
            break;

        case SimPhase.M_COAST:
            // Mass Continuity
            const coastMass = params.rocketDryMass + payloadMass + params.motorDryMass;
            // Coast Inertia (Mass changed slightly)
            const I_coast = 0.06 * coastMass * (length * length);
            
            // Coast Physics
            const vSqC = state.vel.z*state.vel.z + state.vel.x*state.vel.x + state.vel.y*state.vel.y;
            const vMagC = Math.sqrt(vSqC);
            const dragMagC = 0.5 * rho * vSqC * rocketCd * area;
            
            const dragXC = vMagC > 0 ? -dragMagC * (state.vel.x / vMagC) : 0;
            const dragYC = vMagC > 0 ? -dragMagC * (state.vel.y / vMagC) : 0;
            const dragZC = vMagC > 0 ? -dragMagC * (state.vel.z / vMagC) : 0;

            state.vel.x += (dragXC / coastMass) * dt;
            state.vel.y += (dragYC / coastMass) * dt;
            state.vel.z += ((dragZC / coastMass) - g) * dt;
            
            // Gravity Turn Logic (Velocity Vector Coupling)
            if (vMagC > 5) {
                const flightPathAngle = Math.asin(state.vel.z / vMagC) * 180 / Math.PI;
                const deltaPitch = flightPathAngle - state.pitch;
                
                // Aerodynamic restoring force + Damping (Same logic as boost, but no thrust)
                const q = 0.5 * rho * vSqC;
                const stabilityMargin = cp - cm;
                const torque = q * area * CnAlpha * stabilityMargin * (deltaPitch * Math.PI/180);
                const damp = -0.5 * vMagC * rho * area * (length*length) * (state.gyro.y * Math.PI/180);
                
                const alpha = (torque + damp) / I_coast;
                state.gyro.y += alpha * (180/Math.PI) * dt;
                state.pitch += state.gyro.y * dt;
            }

            if (state.vel.z <= 0 && state.alt > 0) {
                state.phase = SimPhase.M_DESCENT;
                state.timer = 0;
                // Ejection Shock Event
                state.gyro.x = 200; // Simulates physical kick
                state.gyro.y = 50; 
                state.gyro.z = 50;
                state.pitch = 0; // Tumble
            } else if (state.alt <= 0) {
                state.phase = SimPhase.M_GROUND;
            }
            break;

        case SimPhase.M_DESCENT:
            // Descent Physics (Parachute)
            const descentMass = descent.mass; // Payload only
            const chuteArea = descent.parachuteArea;
            const chuteCd = descent.dragCoefficient;

            const vSqD = state.vel.z*state.vel.z + state.vel.x*state.vel.x + state.vel.y*state.vel.y;
            const vMagD = Math.sqrt(vSqD);
            
            // AETHER: Ensure drag matches prediction engine (ISA Density)
            // `rho` is already calculated via getAirDensity() in the main loop
            const dragD = 0.5 * rho * vSqD * chuteCd * chuteArea;
            
            const vAirDX = state.vel.x - wind.n;
            const vAirDY = state.vel.y - wind.e;
            const vAirDZ = state.vel.z;
            const vAirMagD = Math.sqrt(vAirDX*vAirDX + vAirDY*vAirDY + vAirDZ*vAirDZ);
            
            const forceDX = vAirMagD > 0 ? -dragD * (vAirDX / vAirMagD) : 0;
            const forceDY = vAirMagD > 0 ? -dragD * (vAirDY / vAirMagD) : 0;
            const forceDZ = vAirMagD > 0 ? -dragD * (vAirDZ / vAirMagD) : 0;

            state.vel.x += (forceDX / descentMass) * dt;
            state.vel.y += (forceDY / descentMass) * dt;
            state.vel.z += ((forceDZ / descentMass) - g) * dt;

            // Pendulum Swing Dynamics for Gyro
            // Period T = 2*pi*sqrt(L_line/g). Assume line length 1m.
            // Omega = Omega_0 * cos(wt) * decay
            const decay = Math.exp(-state.timer * 0.1);
            state.gyro.x = Math.sin(state.timer * 3) * 30 * decay + noise(2);
            state.gyro.y = Math.cos(state.timer * 2.5) * 30 * decay + noise(2);
            state.gyro.z = noise(5); // Spin under chute

            state.pitch = 0 + state.gyro.y * 0.1; // Small attitude wobble

            if (state.alt <= 0) {
                state.phase = SimPhase.M_GROUND;
                state.alt = 0;
            }
            break;

        case SimPhase.M_GROUND:
            state.vel = { x: 0, y: 0, z: 0 };
            state.gyro.x = 0; state.gyro.y = 0; state.gyro.z = 0;
            state.pitch = 0;
            break;
    }
}

function runRocketPhysics(dt: number, ctx: SimContext, rho: number, g: number) {
    // Basic Rocket Equation approximation
    // Drag = 0.5 * rho * v^2 * Cd * A
    const Cd = 0.75; // Rocket drag coeff
    const A = 0.01;  // Cross section
    const Mass = 2.0; // Launch mass
    
    // Wind handling
    const wind = getWindVector(state.alt, ctx.wind);
    
    switch (state.phase) {
        case SimPhase.R_IDLE:
            if (state.timer > 3) { state.phase = SimPhase.R_IGNITION; state.timer = 0; }
            break;
        case SimPhase.R_IGNITION:
            state.gyro.x = noise(5); state.gyro.y = noise(5); 
            if (state.timer > 1.0) { state.phase = SimPhase.R_BOOST; state.timer = 0; }
            break;
        case SimPhase.R_BOOST:
            // Thrust
            const thrust = 150; // Newtons
            const drag = 0.5 * rho * (state.vel.z**2) * Cd * A;
            const netForce = thrust - (Mass * g) - drag;
            const accel = netForce / Mass;
            
            state.vel.z += accel * dt;
            
            // Weathercocking (turn into wind slightly)
            state.vel.x += (wind.n * 0.1) * dt; 
            state.vel.y += (wind.e * 0.1) * dt;
            
            state.pitch = 85 + noise(1);
            state.gyro.z += dt * 50; // Spin stability
            
            // Target Apogee Logic (Parametric)
            const target = ctx.config.apogeeTarget || 1000;
            // Cutoff if projected height > target (simplistic)
            // or fixed burn time
            if (state.timer > 2.5) { state.phase = SimPhase.R_COAST; state.timer = 0; }
            break;
        case SimPhase.R_COAST:
            const dragC = 0.5 * rho * (state.vel.z**2) * Cd * A;
            const dir = state.vel.z > 0 ? -1 : 1;
            const accelC = -g + (dir * dragC / Mass);
            
            state.vel.z += accelC * dt;
            state.pitch = Math.max(0, state.pitch - 10 * dt); // Nose over
            
            if (state.vel.z <= 0) { state.phase = SimPhase.R_APOGEE; state.timer = 0; }
            break;
        case SimPhase.R_APOGEE:
            // Deployment event
            state.gyro.x = 100; // Shock
            if (state.timer > 1) { state.phase = SimPhase.R_DROGUE; state.timer = 0; }
            break;
        case SimPhase.R_DROGUE:
            // Physics descent
            // F_drag = Weight
            // 0.5 * rho * v^2 * Cd_drogue * A_drogue = m * g
            // v = sqrt( 2mg / rho Cd A )
            // But we iterate velocity:
            
            // Drogue specific settings? Let's assume drogue is 1/5th main area
            const areaD = ctx.descent.parachuteArea ? ctx.descent.parachuteArea * 0.2 : 0.1;
            const cdD = ctx.descent.dragCoefficient || 1.5;
            const massD = ctx.descent.mass || 1.0;
            
            const vSq = state.vel.z * state.vel.z;
            const dragD = 0.5 * rho * vSq * cdD * areaD;
            const accelD = (-massD * g + dragD) / massD; // Drag opposes gravity (which is negative) -> drag is positive
            
            state.vel.z += accelD * dt;
            
            // Drift with wind
            state.vel.x += (wind.n - state.vel.x) * 0.5 * dt;
            state.vel.y += (wind.e - state.vel.y) * 0.5 * dt;
            
            state.gyro.y = Math.sin(state.timer * 3) * 40; // Swing
            
            if (state.alt < 300) { state.phase = SimPhase.R_MAIN; state.timer = 0; }
            break;
        case SimPhase.R_MAIN:
            const areaM = ctx.descent.parachuteArea || 0.8;
            const cdM = ctx.descent.dragCoefficient || 1.5;
            const massM = ctx.descent.mass || 1.0;
            
            const vSqM = state.vel.z * state.vel.z;
            const dragM = 0.5 * rho * vSqM * cdM * areaM;
            const accelM = (-massM * g + dragM) / massM;
            
            state.vel.z += accelM * dt;
            
            // Tight coupling with wind
            state.vel.x += (wind.n - state.vel.x) * 1.0 * dt;
            state.vel.y += (wind.e - state.vel.y) * 1.0 * dt;
            
            state.gyro.y = Math.sin(state.timer) * 10;
            
            if (state.alt <= 0) { state.phase = SimPhase.R_LANDED; state.timer = 0; }
            break;
        case SimPhase.R_LANDED:
            state.vel = {x:0, y:0, z:0}; 
            state.gyro = {x:0, y:0, z:0};
            break;
    }
}

function runAerialLogic(dt: number) {
    // Fixed Wing Drone Logic
    const speed = 25; // m/s
    const turnRate = 15; // deg/s
    
    switch (state.phase) {
        case SimPhase.A_TAKEOFF:
            state.vel.z += (5 - state.vel.z) * dt; // Climb 5m/s
            state.vel.x = speed; 
            state.heading = 0;
            if (state.alt > 150) { state.phase = SimPhase.A_LOITER; state.timer = 0; }
            break;
        case SimPhase.A_LOITER:
            // Circle Loiter
            state.vel.z += (0 - state.vel.z) * dt; // Level out
            state.heading += turnRate * dt;
            state.gyro.z = turnRate;
            state.gyro.x = 20; // Bank angle
            
            const rad = state.heading * Math.PI / 180;
            state.vel.x = speed * Math.cos(rad);
            state.vel.y = speed * Math.sin(rad);
            
            if (state.timer > 30) { state.phase = SimPhase.A_FIGURE_8; state.timer = 0; }
            break;
        case SimPhase.A_FIGURE_8:
            // Figure 8 Pattern
            const t = state.timer;
            // Bank left then right
            if (t < 10) {
                state.heading -= turnRate * dt;
                state.gyro.x = -25;
            } else if (t < 20) {
                state.heading += turnRate * dt;
                state.gyro.x = 25;
            } else {
                state.timer = 0; // Loop
            }
            
            const rad8 = state.heading * Math.PI / 180;
            state.vel.x = speed * Math.cos(rad8);
            state.vel.y = speed * Math.sin(rad8);
            
            if (state.timer > 60) { state.phase = SimPhase.A_DIVE; state.timer = 0; }
            break;
        case SimPhase.A_DIVE:
            state.pitch = -45;
            state.vel.z = -20;
            state.vel.x = speed * 1.5;
            state.gyro.x = 0;
            if (state.alt < 50) { state.phase = SimPhase.A_LANDING; state.timer = 0; }
            break;
        case SimPhase.A_LANDING:
            state.vel.z = -2;
            state.vel.x *= 0.98; // Flare
            state.pitch = 5;
            if (state.alt <= 0) { state.alt = 0; }
            break;
    }
}

function runUnstableLogic(dt: number) {
    // Chaotic Tumble
    switch (state.phase) {
        case SimPhase.U_FREEFALL:
            state.vel.z -= 9.81 * dt;
            // 3-Axis Spin
            state.gyro.x += Math.sin(state.timer * 2.5) * 50 * dt;
            state.gyro.y += Math.cos(state.timer * 1.7) * 40 * dt;
            state.gyro.z += Math.sin(state.timer * 0.5) * 10 * dt;
            
            // Drag limiting speed
            if (state.vel.z < -60) state.vel.z = -60;
            
            // Random Lateral Velocity
            state.vel.x += noise(5) * dt;
            state.vel.y += noise(5) * dt;

            if (state.alt < 500) { state.phase = SimPhase.U_RECOVERY; state.timer = 0; }
            break;
        case SimPhase.U_RECOVERY:
            // Sudden stabilization
            const targetV = -5;
            state.vel.z += (targetV - state.vel.z) * 2 * dt;
            state.gyro.x *= 0.9;
            state.gyro.y *= 0.9;
            state.gyro.z = 20; // Stable spin
            if (state.alt <= 0) { state.alt = 0; }
            break;
    }
}

function runEmergencyLogic(dt: number) {
    // Engine out glide
    switch (state.phase) {
        case SimPhase.E_CRUISE:
            state.vel.z = 0; state.vel.x = 30; 
            if (state.timer > 3) { state.phase = SimPhase.E_ENGINE_FAIL; state.timer = 0; }
            break;
        case SimPhase.E_ENGINE_FAIL:
            state.vel.x *= 0.98; 
            state.gyro.y = noise(5); // Shudder
            if (state.vel.x < 20) { state.phase = SimPhase.E_GLIDE; state.timer = 0; }
            break;
        case SimPhase.E_GLIDE:
            // Best glide ratio 10:1 approx
            state.vel.z = -3; 
            state.vel.x = 22; 
            if (state.timer > 10) { state.phase = SimPhase.E_SPIRAL; state.timer = 0; }
            break;
        case SimPhase.E_SPIRAL:
            state.vel.z = -15; // Rapid descent
            state.heading += 45 * dt;
            state.gyro.z = 45;
            state.gyro.x = 45; // Bank
            
            const rad = state.heading * Math.PI / 180;
            state.vel.x = 15 * Math.cos(rad);
            state.vel.y = 15 * Math.sin(rad);
            
            if (state.alt < 50) { state.phase = SimPhase.E_FLARE; state.timer = 0; }
            break;
        case SimPhase.E_FLARE:
            state.vel.z += (0 - state.vel.z) * 3 * dt; 
            state.vel.x *= 0.8; 
            state.gyro.x = 0; 
            if (state.alt <= 0) { state.phase = SimPhase.E_CRASH_LAND; state.timer = 0; }
            break;
        case SimPhase.E_CRASH_LAND:
            state.vel = {x:0,y:0,z:0};
            break;
    }
}

function runStallLogic(dt: number) {
    // Stall -> Spin -> Recovery
    switch (state.phase) {
        case SimPhase.S_CLIMB:
            state.vel.z = 10; state.vel.x = 25;
            state.pitch = 20;
            if (state.timer > 3) { state.phase = SimPhase.S_PITCH_UP_CRITICAL; state.timer = 0; }
            break;
        case SimPhase.S_PITCH_UP_CRITICAL:
            state.pitch += 10 * dt; // Pitch up
            state.vel.x -= 8 * dt;  // Speed bleed
            if (state.vel.x < 8) { state.phase = SimPhase.S_STALL_ONSET; state.timer = 0; }
            break;
        case SimPhase.S_STALL_ONSET:
            state.pitch = -30; // Nose drop
            state.gyro.x = -60;
            state.vel.z = -15; 
            if (state.timer > 1) { state.phase = SimPhase.S_NOSE_DROP; state.timer = 0; }
            break;
        case SimPhase.S_NOSE_DROP:
            state.gyro.z = 120; // Spin
            state.vel.z = -30;
            if (state.timer > 3) { state.phase = SimPhase.S_RECOVERY_DIVE; state.timer = 0; }
            break;
        case SimPhase.S_RECOVERY_DIVE:
            state.gyro.z *= 0.9; // Stop spin
            state.vel.x += 10 * dt; // Gain speed
            state.pitch += 20 * dt; // Pull up
            if (state.pitch > 0) { state.phase = SimPhase.S_LEVEL_OUT; state.timer = 0; }
            break;
        case SimPhase.S_LEVEL_OUT:
            state.vel.z = 0;
            state.pitch = 0;
            if (state.timer > 2) state.phase = SimPhase.S_CLIMB; 
            break;
    }
}

function runGPSNavLogic(dt: number) {
    // Square Pattern
    // Leg 1: North, Leg 2: East, Leg 3: South, Leg 4: West
    const speed = 15;
    
    const flyLeg = (headingTarget: number, duration: number, nextPhase: SimPhase) => {
        // Turn towards heading
        let diff = headingTarget - state.heading;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        const turnRate = diff * 2; // Proportional turn
        state.heading += turnRate * dt;
        state.gyro.z = turnRate;
        state.gyro.x = -turnRate * 0.5; // Bank
        
        const rad = state.heading * Math.PI / 180;
        state.vel.x = speed * Math.cos(rad); // North
        state.vel.y = speed * Math.sin(rad); // East
        
        if (state.timer > duration) {
            state.phase = nextPhase;
            state.timer = 0;
        }
    };

    switch(state.phase) {
        case SimPhase.G_LEG_1: flyLeg(0, 10, SimPhase.G_TURN_1); break;
        case SimPhase.G_TURN_1: flyLeg(90, 3, SimPhase.G_LEG_2); break;
        case SimPhase.G_LEG_2: flyLeg(90, 10, SimPhase.G_TURN_2); break;
        case SimPhase.G_TURN_2: flyLeg(180, 3, SimPhase.G_LEG_3); break;
        case SimPhase.G_LEG_3: flyLeg(180, 10, SimPhase.G_TURN_3); break;
        case SimPhase.G_TURN_3: flyLeg(270, 3, SimPhase.G_LEG_4); break;
        case SimPhase.G_LEG_4: flyLeg(270, 10, SimPhase.G_RETURN); break;
        case SimPhase.G_RETURN: flyLeg(0, 3, SimPhase.G_LEG_1); break;
    }
}
