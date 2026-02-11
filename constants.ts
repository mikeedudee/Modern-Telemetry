
import { CsvField, AppSettings, SimulationPreset } from './types';

export const BAUD_RATES = [
  4800,
  9600,
  19200,
  38400,
  57600,
  115200,
  230400,
  460800,
  921600
];

export const MAX_DATA_POINTS = 500;
export const SKIP_FIELD = '__SKIP__';

export const DEFAULT_CSV_ORDER: CsvField[] = [
  'pressure', 
  'temperature', 
  'thermistorTemp', 
  'latitude', 
  'longitude', 
  'gy', 
  'gx', 
  'gz', 
  'heading', 
  'timeElapsed',
  'runTime',
  'absAltitude', 
  'relAltitude',
  'vSpeed',
  'hSpeed',
  'density'
];

export const FIELD_LABELS: Record<string, string> = {
  pressure: "Pressure",
  temperature: "Temperature",
  thermistorTemp: "Thermistor",
  latitude: "Latitude",
  longitude: "Longitude",
  gy: "Gyro Y",
  gx: "Gyro X",
  gz: "Gyro Z",
  heading: "Compass Heading", 
  timeElapsed: "Time Elapsed",
  runTime: "Run Time",
  absAltitude: "Abs Altitude",
  relAltitude: "Rel Altitude",
  vSpeed: "Vertical Speed",
  hSpeed: "Horizontal Speed",
  density: "Air Density",
  [SKIP_FIELD]: "NULL (Skip Index)"
};

export const DEFAULT_SETTINGS: AppSettings = {
  configName: 'Default Configuration', 
  
  altitude: { color: '#22d3ee', showDots: false, yMin: 'auto', yMax: 'auto' },
  pressure: { color: '#34d399', showDots: false, yMin: 'auto', yMax: 'auto' },
  temperature: { color: '#fbbf24', showDots: false, yMin: 'auto', yMax: 'auto' },
  density: 'high',
  zoomSensitivity: 0.005,
  csvOrder: DEFAULT_CSV_ORDER,
  separator: ',',
  simInterval: 100,
  simPreset: SimulationPreset.ROCKET_LAUNCH, 
  streamThrottle: 100,
  units: {
    speed: 'm/s',
    temperature: '°C',
    altitude: 'm',
    density: 'kg/m³',
    timeFormat: 'ms' 
  },
  thresholds: {
    maxTemperature: 60,
    minTemperature: -0,
    maxPressure: 110000,
    minPressure: 50000, 
    maxAltitude: 1500, 
    minAltitude: 0,
    maxSpeed: 340, 
    minSpeed: 0,
    maxVerticalSpeed: 100,
    minVerticalSpeed: 0,
    maxDensity: 1.5,
    minDensity: 0,
    maxDynamicPressure: 20, 
    maxGForce: 12, 
    minGForce: -2 
  },
  
  wind: {
    mode: 'single',
    speed: 5,
    direction: 0,
    layers: [
      { altitude: 0, speed: 2, direction: 45 },    
      { altitude: 500, speed: 5, direction: 90 },  
      { altitude: 1000, speed: 12, direction: 120 } 
    ]
  },

  descent: {
    mass: 1.0,            
    parachuteArea: 0.5,   
    dragCoefficient: 1.5  
  },

  landing: {
    showPrediction: true,
    indicatorShape: 'crosshair',
    confidenceRadius: 50,
    predictionInterval: 2000,
    headingSource: 'auto',
    gpsWeight: 0.7
  },

  terrain: {
    enabled: false, 
    provider: 'local',
    localUrl: 'http://localhost:5000/api/elevation'
  },

  simulation: {
    apogeeTarget: 1000,
    ascentDuration: 10,
    noiseLevel: 0.1,
    failureMode: 'none',
    // AETHER: New Rocket Params Defaults
    rocketParams: {
        motorBurnTime: 2.5,
        averageThrust: 150,
        totalImpulse: 0, 
        rocketDryMass: 1.0,
        motorWetMass: 0.5,
        motorDryMass: 0.2,
        centerOfMass: 1.0, 
        centerOfPressure: 1.2, 
        diameter: 0.10, 
        rocketLength: 2.0, 
        launchAngle: 85, // 85 degrees pitch
        launchDirection: 0, // North
        startLatitude: 10.3157,
        startLongitude: 123.8854
    }
  },
  
  voice: {
    enabled: false,
    voiceName: '', 
    volume: 1.0,
    rate: 1.0,
    pitch: 1.0,
    alerts: {
      connection: true,
      thermal: true,
      altitude: true,
      dynamics: true,
      mission: true 
    }
  },

  checksum: {
    mode: 'nmea',
    validate: false
  },

  mission: {
    countDownStart: 10,
    unit: 'minutes' // Added default
  },

  graphics: {
    animations: true,
    glowEffects: true,
    glassBlur: true,
    mapProvider: 'osm',
    localMapPort: 8000,
    vehicleIcon: 'rocket', 
    
    showAmbient: true,
    ambientColor: '#4f46e5',
    animateAmbient: true,
    ambientOpacity: 0.3,
    ambientDuration: 15,

    antialiasing: true,
    shadowQuality: 'high',
    renderResolution: 1.0,
    windParticleCount: 2000, 
    showWind: true, 
    windColor: '#ffffff', // AETHER: Default Wind Color
    
    globalBrightness: 1.0,
    globalContrast: 1.0,
    globalSaturation: 1.0,
    nightVisionMode: false
  },
  hardware: {
    calculation: 'hybrid',
    graphics: 'hybrid'
  }
};
