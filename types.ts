
export interface TelemetryPacket {
  pressure: number;
  temperature: number;
  thermistorTemp: number;
  latitude: number;
  longitude: number;
  gy: number;
  gx: number;
  gz: number;
  heading: number; 
  timeElapsed: number;
  runTime: number; 
  absAltitude: number;
  relAltitude: number;
  vSpeed: number;
  hSpeed: number;
  density: number;
  id?: string; 
}

export type CsvField = keyof TelemetryPacket | '__SKIP__';

export enum ConnectionStatus {
  DISCONNECTED = 'Disconnected',
  CONNECTING = 'Connecting',
  CONNECTED = 'Connected',
  ERROR = 'Error'
}

export interface SerialConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  flowControl: 'none' | 'hardware';
}

export interface SerialOptions extends SerialConfig {
  // extended options if needed
}

export interface GraphConfig {
  color: string;
  showDots: boolean;
  yMin: string | number;
  yMax: string | number;
}

export type SpeedUnit = 'm/s' | 'km/h' | 'mph' | 'ft/s';
export type TempUnit = '°C' | '°F' | 'K';
export type AltUnit = 'm' | 'ft';
export type DensityUnit = 'kg/m³' | 'lb/ft³';
export type TimeFormat = 'ms' | 's';

export interface UnitSettings {
  speed: SpeedUnit;
  temperature: TempUnit;
  altitude: AltUnit;
  density: DensityUnit;
  timeFormat: TimeFormat; 
}

export interface ThresholdSettings {
  maxTemperature: number;
  minTemperature: number;
  maxPressure: number;
  minPressure: number;
  maxAltitude: number;
  minAltitude: number;
  maxSpeed: number;
  minSpeed: number;
  maxVerticalSpeed: number;
  minVerticalSpeed: number;
  maxDensity: number;
  minDensity: number;
  maxDynamicPressure: number;
  maxGForce: number; 
  minGForce: number;
}

export interface WindLayer {
  altitude: number; // m
  speed: number;    // m/s
  direction: number; // degrees
}

export interface WindSettings {
  mode: 'single' | 'gradient';
  speed: number;       // Base speed (Single mode)
  direction: number;   // Base direction (Single mode)
  layers: WindLayer[]; // Gradient mode layers
  
  // Legacy scalar support
  windSpeed?: number;
  windDirection?: number;
}

export interface DescentSettings {
  mass: number;           // kg (Payload Mass)
  parachuteArea: number;  // m^2
  dragCoefficient: number;// Cd
}

export type LandingIndicatorShape = 'circle' | 'square' | 'x' | 'triangle' | 'crosshair';
export type HeadingSource = 'gps' | 'imu' | 'fused' | 'auto';

export interface LandingSettings {
  showPrediction: boolean;
  indicatorShape: LandingIndicatorShape;
  confidenceRadius: number; // meters
  predictionInterval: number; // ms
  headingSource: HeadingSource;
  gpsWeight: number; // 0.0 to 1.0 (1.0 = 100% GPS, 0.0 = 100% IMU)
}

export type TerrainProvider = 'none' | 'online' | 'local';

export interface TerrainSettings {
  enabled: boolean;
  provider: TerrainProvider;
  localUrl: string; 
}

export interface VoiceSettings {
  enabled: boolean;
  voiceName: string; 
  volume: number;    
  rate: number;      
  pitch: number;     
  alerts: {
    connection: boolean; 
    thermal: boolean;    
    altitude: boolean;   
    dynamics: boolean;
    mission: boolean; 
  };
}

export type ChecksumMode = 'none' | 'nmea' | 'mod256';

export interface ChecksumSettings {
  mode: ChecksumMode; 
  validate: boolean; 
}

export interface MissionTimerSettings {
  countDownStart: number; 
  unit: 'minutes' | 'seconds'; // Added unit selection
}

export type VehicleIconType = 'arrow' | 'rocket' | 'plane' | 'drone' | 'car' | 'helicopter' | 'ship';

export interface GraphicsSettings {
  animations: boolean;    
  glowEffects: boolean;   
  glassBlur: boolean;     
  mapProvider: 'local' | 'osm' | 'carto'; 
  localMapPort: number;   
  vehicleIcon: VehicleIconType;
  
  showAmbient: boolean;
  ambientColor: string;
  animateAmbient: boolean;
  ambientOpacity: number;
  ambientDuration: number;

  antialiasing: boolean;        
  shadowQuality: 'off' | 'low' | 'high'; 
  renderResolution: number;     
  windParticleCount: number; 
  showWind: boolean; 
  windColor: string; // AETHER: New setting for wind particle color
  
  globalBrightness: number;     
  globalContrast: number;       
  globalSaturation: number;     
  nightVisionMode: boolean;     
}

export type HardwareMode = 'cpu' | 'gpu' | 'hybrid';

export interface HardwareSettings {
  calculation: HardwareMode; 
  graphics: HardwareMode;    
}

// AETHER: Persistent State for uploaded 3D models
export interface Model3DConfig {
  url: string | null;
  fileName: string | null;
  scale: number;
  rotation: { x: number; y: number; z: number };
  isCustom: boolean;
}

export enum SimulationPreset {
  ROCKET_LAUNCH = 'ROCKET_LAUNCH',
  AERIAL_MANEUVERS = 'AERIAL_MANEUVERS', 
  UNSTABLE_DESCENT = 'UNSTABLE_DESCENT', 
  EMERGENCY_LANDING = 'EMERGENCY_LANDING',
  STALL_RECOVERY = 'STALL_RECOVERY',
  GPS_NAV_TEST = 'GPS_NAV_TEST',
  CUSTOM_PARAMETRIC = 'CUSTOM_PARAMETRIC',
  MANUAL_ROCKET_INPUT = 'MANUAL_ROCKET_INPUT' // AETHER: New Preset
}

// AETHER: New Parametric Sim Config
export type FailureMode = 'none' | 'no_gps' | 'main_chute_fail' | 'tumble';

export interface RocketParameters {
  motorBurnTime: number; // seconds
  averageThrust: number; // Newtons
  totalImpulse: number;  // Ns (Newtons * Seconds) - Overrides Burn Time if set
  rocketDryMass: number; // kg (Airframe without motor/payload)
  motorWetMass: number;  // kg
  motorDryMass: number;  // kg
  
  // AETHER: Aerodynamic Properties
  centerOfMass: number;     // meters from nose
  centerOfPressure: number; // meters from nose
  diameter: number;         // meters
  rocketLength: number;     // meters (Total Length)
  
  // Launch Configuration
  launchAngle: number;      // degrees (0 = Horizon, 90 = Vertical)
  launchDirection: number;  // degrees (0 = North, 90 = East)

  startLatitude: number;
  startLongitude: number;
}

export interface SimulationConfig {
  apogeeTarget: number;   // meters
  ascentDuration: number; // seconds
  noiseLevel: number;     // 0.0 to 1.0 (Variance factor)
  failureMode: FailureMode;
  rocketParams: RocketParameters; // AETHER: Added Rocket Params
}

export interface AppSettings {
  configName: string; 
  altitude: GraphConfig;
  pressure: GraphConfig;
  temperature: GraphConfig;
  density: 'high' | 'medium' | 'low';
  zoomSensitivity: number;
  csvOrder: CsvField[];
  separator: string; 
  simInterval: number;
  simPreset: SimulationPreset; 
  streamThrottle: number;
  units: UnitSettings; 
  thresholds: ThresholdSettings; 
  
  wind: WindSettings;       
  descent: DescentSettings; 
  landing: LandingSettings; 
  terrain: TerrainSettings;
  
  // AETHER: New Sim Config
  simulation: SimulationConfig;
  
  voice: VoiceSettings;
  checksum: ChecksumSettings;
  mission: MissionTimerSettings;
  graphics: GraphicsSettings; 
  hardware: HardwareSettings; 
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}
