import { useState, useRef, useCallback, useEffect } from 'react';
import { ConnectionStatus, TelemetryPacket, CsvField, SerialConfig, SimulationPreset, HardwareMode, ChecksumMode, WindSettings, DescentSettings, SimulationConfig } from '../types';
import { parseTelemetryLine, generateMockData, setSimScenario } from '../utils/parser';

interface UseSerialProps {
  serialConfig: SerialConfig;
  csvOrder: CsvField[];
  separator?: string;
  simInterval?: number;
  simPreset?: SimulationPreset;
  
  // AETHER: Updated to accept full settings objects
  windSettings?: WindSettings;
  descentSettings?: DescentSettings;
  simConfig?: SimulationConfig;

  streamThrottle?: number;
  calculationMode?: HardwareMode;
  
  checksumMode?: ChecksumMode;
  validateChecksum?: boolean;

  onDataReceived: (data: TelemetryPacket) => void;
  onAutoReconnectAttempt?: () => void;
}

export const useSerial = ({ 
  serialConfig, 
  csvOrder, 
  separator = ',', 
  simInterval = 100,
  simPreset = SimulationPreset.ROCKET_LAUNCH,
  
  windSettings,
  descentSettings,
  simConfig,

  streamThrottle = 0,
  calculationMode = 'hybrid',
  
  checksumMode = 'none',
  validateChecksum = false,

  onDataReceived, 
  onAutoReconnectAttempt 
}: UseSerialProps) => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [availablePorts, setAvailablePorts] = useState<any[]>([]);
  
  const [isAutoReconnectEnabled, setIsAutoReconnectEnabled] = useState(true);
  const [simProgress, setSimProgress] = useState(0); 
  const [fileLength, setFileLength] = useState(0);

  const portRef = useRef<any>(null); 
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const keepReadingRef = useRef(false);
  
  const simulationIntervalRef = useRef<number | null>(null);
  const lastSimTickRef = useRef<number>(0); 
  const accumulatedSimTimeRef = useRef<number>(0);

  const fileLinesRef = useRef<string[]>([]);
  const fileIndexRef = useRef<number>(0);
  const isFileModeRef = useRef<boolean>(false);
  
  // Refs for Props (to access in callbacks/intervals)
  const csvOrderRef = useRef(csvOrder);
  const separatorRef = useRef(separator);
  const lastStreamEmitRef = useRef(0);
  const effectiveThrottleRef = useRef(streamThrottle);
  
  const simIntervalRef = useRef(simInterval);
  const simPresetRef = useRef(simPreset);
  
  // AETHER: Deep Refs for Physics
  const windSettingsRef = useRef(windSettings);
  const descentSettingsRef = useRef(descentSettings);
  const simConfigRef = useRef(simConfig);
  
  const checksumModeRef = useRef(checksumMode);
  const validateChecksumRef = useRef(validateChecksum);
  
  const onDataReceivedRef = useRef(onDataReceived);
  const onAutoReconnectAttemptRef = useRef(onAutoReconnectAttempt);

  useEffect(() => { csvOrderRef.current = csvOrder; }, [csvOrder]);
  useEffect(() => { separatorRef.current = separator; }, [separator]);
  useEffect(() => { simIntervalRef.current = simInterval; }, [simInterval]);
  
  useEffect(() => { windSettingsRef.current = windSettings; }, [windSettings]);
  useEffect(() => { descentSettingsRef.current = descentSettings; }, [descentSettings]);
  useEffect(() => { simConfigRef.current = simConfig; }, [simConfig]);

  useEffect(() => { checksumModeRef.current = checksumMode; }, [checksumMode]);
  useEffect(() => { validateChecksumRef.current = validateChecksum; }, [validateChecksum]);

  useEffect(() => {
      let minDelay = 0;
      if (calculationMode === 'cpu') minDelay = 100;
      if (calculationMode === 'hybrid') minDelay = 30;
      if (calculationMode === 'gpu') minDelay = 0;
      effectiveThrottleRef.current = Math.max(streamThrottle, minDelay);
  }, [streamThrottle, calculationMode]);

  useEffect(() => {
     if (simPreset !== simPresetRef.current) {
         simPresetRef.current = simPreset;
         if (isSimulating && !isFileModeRef.current) {
             setSimScenario(simPreset);
         }
     }
  }, [simPreset, isSimulating]);
  
  useEffect(() => { onDataReceivedRef.current = onDataReceived; }, [onDataReceived]);
  useEffect(() => { onAutoReconnectAttemptRef.current = onAutoReconnectAttempt; }, [onAutoReconnectAttempt]);
  
  const reconnectIntervalRef = useRef<number | null>(null);

  const checkPorts = useCallback(async () => {
    if ('serial' in navigator) {
      try {
        // @ts-ignore
        const ports = await navigator.serial.getPorts();
        setAvailablePorts(ports);
        return ports;
      } catch (e) {
        console.error("Error checking ports", e);
        return [];
      }
    }
    return [];
  }, []);

  useEffect(() => {
    const init = async () => { await checkPorts(); };
    init();
    const handleConnectEvent = () => { checkPorts(); };
    const handleDisconnectEvent = () => { checkPorts(); };

    if ('serial' in navigator) {
        // @ts-ignore
        navigator.serial.addEventListener('connect', handleConnectEvent);
        // @ts-ignore
        navigator.serial.addEventListener('disconnect', handleDisconnectEvent);
    }
    return () => {
        if ('serial' in navigator) {
            // @ts-ignore
            navigator.serial.removeEventListener('connect', handleConnectEvent);
            // @ts-ignore
            navigator.serial.removeEventListener('disconnect', handleDisconnectEvent);
        }
    };
  }, [checkPorts]);

  const cleanup = useCallback(async () => {
    keepReadingRef.current = false;
    
    if (reconnectIntervalRef.current) {
      clearInterval(reconnectIntervalRef.current);
      reconnectIntervalRef.current = null;
    }
    
    // SAFE CLEANUP: Unlock Reader First
    if (readerRef.current) {
      try { 
          await readerRef.current.cancel();
          // Small delay to allow lock release
          await new Promise(resolve => setTimeout(resolve, 50));
          readerRef.current.releaseLock();
      } catch (e) { 
          console.warn("Error releasing reader lock", e); 
      }
      readerRef.current = null;
    }
    
    // CLOSE PORT
    if (portRef.current) {
      try { 
          await portRef.current.close(); 
      } catch (e) { 
          console.warn("Error closing port (may be already closed)", e); 
      }
      portRef.current = null;
    }
  }, []);

  const requestAccess = useCallback(async () => {
    setErrorMessage(null);
    if (!('serial' in navigator)) {
        alert("Web Serial API is not supported.");
        return false;
    }
    try {
        // @ts-ignore
        await navigator.serial.requestPort();
        await checkPorts();
        return true;
    } catch (e: any) {
        if (e.name === 'NotFoundError') {
            setErrorMessage("Device selection cancelled by user.");
        } else {
            setErrorMessage(`Device selection failed: ${e.message}`);
        }
        return false;
    }
  }, [checkPorts]);

  const connectToPort = async (port: any) => {
    try {
      setErrorMessage(null);
      setStatus(ConnectionStatus.CONNECTING);
      
      try {
        await port.open({ 
            baudRate: serialConfig.baudRate,
            dataBits: serialConfig.dataBits,
            stopBits: serialConfig.stopBits,
            parity: serialConfig.parity,
            flowControl: serialConfig.flowControl
        });
      } catch (err: any) {
        if (err.name === 'InvalidStateError' || (err.message && err.message.includes('already open'))) {
            // Force cleanup and retry once
            await cleanup();
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
                await port.open({ 
                    baudRate: serialConfig.baudRate,
                    dataBits: serialConfig.dataBits,
                    stopBits: serialConfig.stopBits,
                    parity: serialConfig.parity,
                    flowControl: serialConfig.flowControl
                });
            } catch (retryErr) {
                 throw new Error("Port is locked by system. Unplug device and try again.");
            }
        } else {
            throw err;
        }
      }
      
      portRef.current = port;
      keepReadingRef.current = true;
      setStatus(ConnectionStatus.CONNECTED);
      lastStreamEmitRef.current = 0; 
      
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
        reconnectIntervalRef.current = null;
      }

      readLoop(port);
    } catch (error: any) {
      console.error("Connection failed", error);
      setErrorMessage(error.message || "Failed to open serial port.");
      setStatus(ConnectionStatus.ERROR);
      portRef.current = null;
    }
  };

  const connect = useCallback(async (specificPort?: any) => {
    if (isSimulating) return;
    if (!('serial' in navigator)) {
      alert("Web Serial API is not supported.");
      return;
    }
    try {
      setErrorMessage(null);
      let port = specificPort;
      if (!port) throw new Error("No port selected.");
      await connectToPort(port);
    } catch (error: any) {
      setErrorMessage(error.message || "Connection failed.");
      setStatus(ConnectionStatus.ERROR);
    }
  }, [serialConfig, isSimulating]);

  const disconnect = useCallback(async () => {
    setErrorMessage(null);
    await cleanup();
    stopSimulation();
    setStatus(ConnectionStatus.DISCONNECTED);
  }, [cleanup]);

  const readLoop = async (port: any) => {
    if (port.readable.locked) {
        setErrorMessage("Port stream is locked. Try disconnecting and reconnecting.");
        setStatus(ConnectionStatus.ERROR);
        return;
    }

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    let buffer = '';
    const MAX_BUFFER_SIZE = 1 * 1024 * 1024; 

    try {
      while (keepReadingRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        
        if (value) {
            buffer += value;
            if (buffer.length > MAX_BUFFER_SIZE) {
                buffer = ''; // Prevent memory overflow on spam
                continue;
            }

            const lines = buffer.split('\n');
            
            // Process all complete lines
            for (let i = 0; i < lines.length - 1; i++) {
              const now = Date.now();
              if (now - lastStreamEmitRef.current >= effectiveThrottleRef.current) {
                  const packet = parseTelemetryLine(
                      lines[i], 
                      csvOrderRef.current, 
                      separatorRef.current,
                      checksumModeRef.current,
                      validateChecksumRef.current
                  );
                  
                  if (packet) {
                    if (onDataReceivedRef.current) onDataReceivedRef.current(packet);
                    lastStreamEmitRef.current = now;
                  }
              }
            }
            // Keep the last partial line
            buffer = lines[lines.length - 1];
        }
      }
    } catch (error: any) {
      if (error.name === 'NetworkError') {
          setErrorMessage("Connection Lost: Device was disconnected.");
      } else {
          setErrorMessage(`Stream Error: ${error.message}`);
      }
      setStatus(ConnectionStatus.ERROR);
      triggerAutoReconnect();
    } finally {
      // Clean exit logic
      keepReadingRef.current = false;
      try { 
          reader.releaseLock(); 
      } catch (e) {}
      
      // Ensure we don't auto-reconnect if user intentionally disconnected
      if (status !== ConnectionStatus.DISCONNECTED) {
          triggerAutoReconnect();
      }
    }
  };

  const triggerAutoReconnect = useCallback(() => {
     if (reconnectIntervalRef.current || !isAutoReconnectEnabled) return;
     
     // Only trigger if we aren't intentionally disconnected
     reconnectIntervalRef.current = window.setInterval(async () => {
        if (onAutoReconnectAttemptRef.current) onAutoReconnectAttemptRef.current();
        
        try {
            // @ts-ignore
            const ports = await navigator.serial.getPorts();
            if (ports.length > 0) {
                 // Try first available port
                 await connectToPort(ports[0]);
            }
        } catch(e) { console.warn("Auto-reconnect scan failed", e); }

     }, 3000); 
  }, [serialConfig, isAutoReconnectEnabled]);

  useEffect(() => {
    if (!('serial' in navigator)) return;
    const handleDisconnect = (e: Event) => {
        // @ts-ignore
       if (portRef.current && e.target === portRef.current) {
          keepReadingRef.current = false; 
          portRef.current = null;
          setStatus(ConnectionStatus.ERROR);
          setErrorMessage("Alert: Device physically disconnected.");
          triggerAutoReconnect();
       }
    };
    // @ts-ignore
    navigator.serial.addEventListener('disconnect', handleDisconnect);
    // @ts-ignore
    return () => navigator.serial.removeEventListener('disconnect', handleDisconnect);
  }, [triggerAutoReconnect]);

  const runSimulationTick = useCallback(() => {
    if (isFileModeRef.current) {
        if (fileIndexRef.current < fileLinesRef.current.length) {
            const line = fileLinesRef.current[fileIndexRef.current];
            const packet = parseTelemetryLine(
                line, 
                csvOrderRef.current, 
                separatorRef.current,
                checksumModeRef.current,
                validateChecksumRef.current
            );
            if (packet && onDataReceivedRef.current) onDataReceivedRef.current(packet);
            fileIndexRef.current++;
            setSimProgress(fileIndexRef.current / fileLinesRef.current.length);
        } else {
            stopSimulation();
            setErrorMessage("Simulation playback finished.");
        }
    } else {
        const now = Date.now();
        const dt = now - lastSimTickRef.current;
        lastSimTickRef.current = now;
        accumulatedSimTimeRef.current += dt;

        // AETHER: PASS SIMULATION CONTEXT
        const simContext = {
            wind: windSettingsRef.current || { mode: 'single', speed: 0, direction: 0, layers: [] },
            descent: descentSettingsRef.current || { mass: 1, parachuteArea: 1, dragCoefficient: 1.5 },
            config: simConfigRef.current || { 
                apogeeTarget: 1000, 
                ascentDuration: 10, 
                noiseLevel: 0.1, 
                failureMode: 'none',
                rocketParams: {
                    motorBurnTime: 2.5,
                    averageThrust: 150,
                    totalImpulse: 0,
                    rocketDryMass: 1.0,
                    motorWetMass: 0.5,
                    motorDryMass: 0.2,
                    centerOfMass: 1.0, // Default 1m from nose
                    centerOfPressure: 1.2, // Default 1.2m from nose (Stable)
                    diameter: 0.1, // Default 10cm
                    rocketLength: 2.0, // Default 2m
                    launchAngle: 85, // Default
                    launchDirection: 0, // Default
                    startLatitude: 10.3157,
                    startLongitude: 123.8854
                }
            }
        };

        const mockData = generateMockData(
            accumulatedSimTimeRef.current, 
            simPresetRef.current, 
            simContext
        );
        if (onDataReceivedRef.current) onDataReceivedRef.current(mockData);
    }
  }, []);

  const startSimulation = useCallback((fileContent?: string) => {
    setIsSimulating(true);
    setIsPaused(false); 
    setErrorMessage(null);
    setStatus(ConnectionStatus.CONNECTED); 
    
    accumulatedSimTimeRef.current = 0;
    lastSimTickRef.current = Date.now();
    
    if (fileContent) {
        isFileModeRef.current = true;
        const lines = fileContent.split('\n').filter(l => l.trim().length > 0);
        fileLinesRef.current = lines;
        setFileLength(lines.length);
        fileIndexRef.current = 0;
        setSimProgress(0);
    } else {
        isFileModeRef.current = false;
        fileLinesRef.current = [];
        setFileLength(0);
        setSimScenario(simPresetRef.current);
    }
  }, []);

  const stopSimulation = useCallback(() => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
    setIsSimulating(false);
    setIsPaused(false);
    isFileModeRef.current = false;
    fileLinesRef.current = [];
    setStatus(ConnectionStatus.DISCONNECTED);
  }, []);

  const togglePause = useCallback(() => {
      setIsPaused(prev => {
          const nextState = !prev;
          if (!nextState) {
              lastSimTickRef.current = Date.now();
          }
          return nextState;
      });
  }, []);

  const seekSimulation = useCallback((percentage: number) => {
    if (!isFileModeRef.current || fileLinesRef.current.length === 0) return;
    const newIndex = Math.floor(percentage * fileLinesRef.current.length);
    fileIndexRef.current = newIndex;
    setSimProgress(percentage);
  }, []);

  useEffect(() => {
      if (isSimulating && !isPaused) {
          if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
          const tickRate = Math.max(simInterval, effectiveThrottleRef.current);
          simulationIntervalRef.current = window.setInterval(runSimulationTick, tickRate);
      } else {
          if (simulationIntervalRef.current) {
              clearInterval(simulationIntervalRef.current);
              simulationIntervalRef.current = null;
          }
      }
      return () => {
          if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
      };
  }, [simInterval, isSimulating, isPaused, runSimulationTick, calculationMode]);

  const toggleAutoReconnect = useCallback(() => { setIsAutoReconnectEnabled(prev => !prev); }, []);

  useEffect(() => { return () => { cleanup(); }; }, [cleanup]);

  return {
    status,
    errorMessage,
    connect,
    disconnect,
    isSimulating,
    isPaused, 
    togglePause, 
    isFileMode: isFileModeRef.current,
    startSimulation,
    stopSimulation,
    seekSimulation,
    simProgress,
    availablePorts,
    refreshPorts: checkPorts,
    requestAccess, 
    isAutoReconnectEnabled,
    toggleAutoReconnect
  };
};