
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  Terminal, Thermometer, Wifi, WifiOff, 
  Settings, Play, Square, Pause, 
  ArrowUp, Circle, Disc, Usb, Zap, Gauge,
  ArrowUpDown, Download, AlertTriangle, HelpCircle, Trash2, RefreshCcw, LogOut, Cloud,
  ArrowDownCircle, Copy, Upload, Repeat, Timer, Eraser, Search, Radio, Sliders, X,
  Activity, Cpu, MonitorPlay, Wind, Hash, ArrowRightLeft, Ban, Scan, Mic, Calendar, Clock,
  Map as MapIcon, Rotate3d, Maximize2, Minimize2
} from 'lucide-react';

import { useSerial } from './hooks/useSerial';
import { TelemetryPacket, ConnectionStatus, AppSettings, ToastMessage, SerialConfig, HardwareMode, TimeFormat, Model3DConfig } from './types';
import { BAUD_RATES, MAX_DATA_POINTS, DEFAULT_CSV_ORDER, DEFAULT_SETTINGS, FIELD_LABELS, SKIP_FIELD } from './constants';
import { StatCard } from './components/StatCard';
import { AttitudeCube } from './components/AttitudeCube';
import { SettingsModal } from './components/SettingsModal';
import { GPSMap } from './components/GPSMap';
import { TelemetryChart } from './components/TelemetryChart';
import { ToastContainer, ConfirmModal, HelpModal, AboutModal, TechTooltip } from './components/UIElements'; 
import { FlightPathVisualizer } from './components/FlightPathVisualizer';
import { predictLanding } from './utils/geo'; 

const HirayaLogo = "https://drive.google.com/uc?export=view&id=1f0jWSq_UVz8cZp-VcZl-CSdcPu6f89wE";

// --- Sub-components ---

// AETHER: Isolated Clock Component
const FooterTime = React.memo(() => {
    const [date, setDate] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setDate(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <span className="text-indigo-400 font-bold flex items-center gap-3">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {date.toLocaleDateString()}</span>
            <span className="w-px h-3 bg-indigo-900"></span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {date.toLocaleTimeString([], { hour12: false })}</span>
        </span>
    );
});

const SystemStatusBar = React.memo<{ dataRate: number, mode: HardwareMode, graphics: HardwareMode }>(({ dataRate, mode, graphics }) => {
    const [sysLoad, setSysLoad] = useState({ cpu: 0, gpu: 0, mem: 0 });

    useEffect(() => {
        const interval = setInterval(() => {
            // @ts-ignore
            const memUsage = window.performance?.memory ? Math.round(window.performance.memory.usedJSHeapSize / 1024 / 1024) : 0;
            
            let baseCpu = 5;
            let baseGpu = 5;

            if (mode === 'cpu') baseCpu = 10;
            if (mode === 'hybrid') baseCpu = 25;
            if (mode === 'gpu') baseCpu = 45; 

            if (graphics === 'cpu') baseGpu = 5;
            if (graphics === 'hybrid') baseGpu = 30;
            if (graphics === 'gpu') baseGpu = 60; 

            const variable = Math.floor(Math.random() * 5);
            const rateLoad = dataRate > 10 ? 10 : 0;

            setSysLoad({
                cpu: baseCpu + variable + rateLoad,
                gpu: baseGpu + variable,
                mem: memUsage || (150 + variable * 10)
            });
        }, 2000);
        return () => clearInterval(interval);
    }, [dataRate, mode, graphics]);

    return (
        <div className="hidden xl:flex items-center gap-4 px-4 py-1.5 rounded-sm bg-black/40 border border-slate-800/50 clip-hex">
                <TechTooltip content={`Physics Engine: ${mode.toUpperCase()}`}>
                    <div className="flex items-center gap-2 cursor-help">
                        <Cpu className={`w-3.5 h-3.5 ${mode === 'gpu' ? 'text-rose-400' : 'text-slate-500'}`} />
                        <div className="flex flex-col leading-none">
                            <span className="text-[9px] text-slate-500 font-bold">CPU</span>
                            <span className={`text-[10px] font-mono ${sysLoad.cpu > 50 ? 'text-rose-400' : 'text-indigo-400'}`}>{sysLoad.cpu}%</span>
                        </div>
                    </div>
                </TechTooltip>
                
                <div className="w-px h-5 bg-slate-800"></div>
                
                <TechTooltip content={`WebGL Render: ${graphics.toUpperCase()}`}>
                    <div className="flex items-center gap-2 cursor-help">
                        <MonitorPlay className={`w-3.5 h-3.5 ${graphics === 'gpu' ? 'text-purple-400' : 'text-slate-500'}`} />
                        <div className="flex flex-col leading-none">
                            <span className="text-[9px] text-slate-500 font-bold">GPU</span>
                            <span className="text-[10px] font-mono text-purple-400">{sysLoad.gpu}%</span>
                        </div>
                    </div>
                </TechTooltip>

                <div className="w-px h-5 bg-slate-800"></div>
                
                <TechTooltip content="JavaScript Heap Usage">
                    <div className="flex items-center gap-2 cursor-help">
                        <Activity className="w-3.5 h-3.5 text-slate-500" />
                        <div className="flex flex-col leading-none">
                            <span className="text-[9px] text-slate-500 font-bold">MEM</span>
                            <span className="text-[10px] font-mono text-emerald-400">{sysLoad.mem}MB</span>
                        </div>
                    </div>
                </TechTooltip>
        </div>
    );
});

const INITIAL_PACKET_COUNT = 15;
const generateZeroPackets = (): TelemetryPacket[] => {
    const now = Date.now();
    return Array.from({ length: INITIAL_PACKET_COUNT }).map((_, i) => ({
        pressure: 0,
        temperature: 0,
        thermistorTemp: 0,
        latitude: 0,
        longitude: 0,
        gy: 0,
        gx: 0,
        gz: 0,
        heading: 0,
        timeElapsed: (i - INITIAL_PACKET_COUNT) * 100, 
        runTime: 0,
        absAltitude: 0,
        relAltitude: 0,
        vSpeed: 0,
        hSpeed: 0,
        density: 0,
        id: `init-${now}-${i}`
    }));
};

const DEFAULT_MODEL_CONFIG: Model3DConfig = {
    url: null,
    fileName: null,
    scale: 1,
    rotation: { x: 0, y: 0, z: 0 },
    isCustom: false
};

// ----------------------------------------------------------------

export const App: React.FC = () => {
  const [dataHistory, setDataHistory] = useState<TelemetryPacket[]>(() => generateZeroPackets());
  const [latestData, setLatestData] = useState<TelemetryPacket | null>(null);
  
  const [activeBottomView, setActiveBottomView] = useState<'serial' | 'flight'>('flight');
  const [maximizedId, setMaximizedId] = useState<string | null>(null);

  // AETHER: Lifted Model State
  const [attitudeModelConfig, setAttitudeModelConfig] = useState<Model3DConfig>(DEFAULT_MODEL_CONFIG);
  const [flightPathModelConfig, setFlightPathModelConfig] = useState<Model3DConfig>(DEFAULT_MODEL_CONFIG);

  const incomingQueueRef = useRef<TelemetryPacket[]>([]);
  const animationFrameRef = useRef<number>(0);
  
  const [serialConfig, setSerialConfig] = useState<SerialConfig>({
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none'
  });
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);

  const [selectedPortIndex, setSelectedPortIndex] = useState<string>("");
  
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Set<string>>(new Set());
  
  const acknowledgedAlertsRef = useRef(acknowledgedAlerts);
  useEffect(() => { acknowledgedAlertsRef.current = acknowledgedAlerts; }, [acknowledgedAlerts]);

  const [missionTime, setMissionTime] = useState<number>(0);
  const [missionStatus, setMissionStatus] = useState<'reset' | 'running' | 'hold'>('reset');
  const [hasReachedApogee, setHasReachedApogee] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const savedData = localStorage.getItem('HIRAYA_APP_SETTINGS');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        return {
          ...DEFAULT_SETTINGS, 
          ...parsed,
          units: { ...DEFAULT_SETTINGS.units, ...(parsed.units || {}) },
          thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(parsed.thresholds || {}) },
          graphics: { ...DEFAULT_SETTINGS.graphics, ...(parsed.graphics || {}) },
          hardware: { ...DEFAULT_SETTINGS.hardware, ...(parsed.hardware || {}) },
          voice: { ...DEFAULT_SETTINGS.voice, ...(parsed.voice || {}) },
          checksum: { ...DEFAULT_SETTINGS.checksum, ...(parsed.checksum || {}) },
          mission: { ...DEFAULT_SETTINGS.mission, ...(parsed.mission || {}) },
          wind: { ...DEFAULT_SETTINGS.wind, ...(parsed.wind || {}) },
          descent: { ...DEFAULT_SETTINGS.descent, ...(parsed.descent || {}) },
          landing: { ...DEFAULT_SETTINGS.landing, ...(parsed.landing || {}) },
          terrain: { ...DEFAULT_SETTINGS.terrain, ...(parsed.terrain || {}) }
        };
      }
    } catch (error) {
      console.error("Failed to load settings cache:", error);
    }
    return DEFAULT_SETTINGS;
  });

  const [flightPrediction, setFlightPrediction] = useState<any>(null);
  const lastPredTimeRef = useRef(0);

  useEffect(() => {
      if (activeBottomView === 'flight' && dataHistory.length > 0 && settings.landing.showPrediction) {
          const now = Date.now();
          if (now - lastPredTimeRef.current > settings.landing.predictionInterval) {
              const last = dataHistory[dataHistory.length - 1];
              if (Math.abs(last.latitude) > 0.0001) {
                  const pred = predictLanding(
                      last.latitude, last.longitude, last.relAltitude,
                      last.vSpeed, last.hSpeed, last.heading,
                      settings.descent, settings.wind, 
                      settings.landing,
                      0,
                      last.density,
                      dataHistory 
                  );
                  setFlightPrediction(pred);
                  lastPredTimeRef.current = now;
              }
          }
      }
  }, [activeBottomView, dataHistory, settings]);


  const settingsRef = useRef(settings);
  useEffect(() => {
      settingsRef.current = settings;
      localStorage.setItem('HIRAYA_APP_SETTINGS', JSON.stringify(settings));
  }, [settings]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const recordingBufferRef = useRef<TelemetryPacket[]>([]);
  const isRecordingRef = useRef(false);
  const hasWarnedBufferLimitRef = useRef(false); 

  const [isAutoScroll, setIsAutoScroll] = useState(false);
  const serialContainerRef = useRef<HTMLDivElement>(null);
  
  const [lastClearedId, setLastClearedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
     isOpen: boolean;
     title: string;
     message: string;
     onConfirm: () => void;
     isDestructive?: boolean;
     confirmText?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const speak = useCallback((text: string) => {
      if (!settingsRef.current.voice.enabled || !('speechSynthesis' in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.name === settingsRef.current.voice.voiceName);
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.volume = settingsRef.current.voice.volume;
      utterance.rate = settingsRef.current.voice.rate;
      utterance.pitch = settingsRef.current.voice.pitch;
      window.speechSynthesis.speak(utterance);
  }, []); 

  const handleAcknowledge = (key: string) => {
      if (!acknowledgedAlerts.has(key)) {
          setAcknowledgedAlerts(prev => new Set(prev).add(key));
          if ('speechSynthesis' in window) window.speechSynthesis.cancel();
          addToast(`${key.toUpperCase()} Alert Muted.`, "info");
      }
  };

  useEffect(() => {
      if (missionStatus === 'reset') {
          // AETHER UPDATE: Respect unit choice
          const isMin = settings.mission.unit === 'minutes';
          const multiplier = isMin ? 60 : 1;
          const startSecs = -(settings.mission.countDownStart * multiplier);
          setMissionTime(startSecs);
          setHasReachedApogee(false); 
      }
  }, [settings.mission.countDownStart, settings.mission.unit, missionStatus]);

  useEffect(() => {
      let interval: number;
      if (missionStatus === 'running') {
          interval = window.setInterval(() => {
              setMissionTime(prev => {
                  const next = prev + 1;
                  if (settingsRef.current.voice.enabled && settingsRef.current.voice.alerts.mission) {
                      if (next === -60) speak("T Minus One Minute");
                      if (next === -30) speak("T Minus Thirty Seconds");
                      if (next === -10) speak("Ten");
                      if (next >= -5 && next < 0) speak(Math.abs(next).toString());
                      if (next === 0) speak("Liftoff. Mission Clock Started.");
                  }
                  return next;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [missionStatus, speak]);

  const handleMissionClick = useCallback(() => {
      const allowVoice = settingsRef.current.voice.enabled && settingsRef.current.voice.alerts.mission;
      if (missionStatus === 'reset') {
          setMissionStatus('running');
          if (allowVoice) speak("Mission Clock Started");
      } else if (missionStatus === 'running') {
          setMissionStatus('hold');
          if (allowVoice) speak("Mission Hold");
      } else if (missionStatus === 'hold') {
          setMissionStatus('running');
          if (allowVoice) speak("Mission Resumed");
      }
  }, [missionStatus, speak]);

  const handleMissionReset = useCallback(() => {
      const allowVoice = settingsRef.current.voice.enabled && settingsRef.current.voice.alerts.mission;
      setMissionStatus('reset');
      setHasReachedApogee(false);
      if (allowVoice) speak("Mission Clock Reset");
  }, [speak]);

  const formatMissionTime = (totalSeconds: number) => {
      const isNegative = totalSeconds < 0;
      const absSecs = Math.abs(totalSeconds);
      const m = Math.floor(absSecs / 60);
      const s = absSecs % 60;
      return `T${isNegative ? '-' : '+'} ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
      if (!latestData || missionTime < 0) return; 
      if (!hasReachedApogee) {
          if (latestData.vSpeed < -1.0 && latestData.relAltitude > 20) {
              setHasReachedApogee(true);
          }
      }
  }, [latestData, missionTime, hasReachedApogee]); 

  const lastAlertTimeRef = useRef<Record<string, number>>({});
  const ALERT_COOLDOWN = 3000; 

  const checkThresholds = useCallback((packet: TelemetryPacket) => {
      const now = Date.now();
      const currentSettings = settingsRef.current;
      const currentAcks = acknowledgedAlertsRef.current;
      const thresholds = currentSettings.thresholds;
      
      const processAlert = (key: string, isTriggered: boolean, message: string, checkEnabled: boolean) => {
           if (isTriggered) {
               if (checkEnabled && !currentAcks.has(key)) {
                   if (currentSettings.voice.enabled) {
                       if (!lastAlertTimeRef.current[key] || (now - lastAlertTimeRef.current[key] > ALERT_COOLDOWN)) {
                           speak(message);
                           lastAlertTimeRef.current[key] = now;
                       }
                   }
               }
           } else {
               if (currentAcks.has(key)) {
                   setAcknowledgedAlerts(prev => {
                       const next = new Set(prev);
                       next.delete(key);
                       return next;
                   });
               }
           }
      };

      const isHighTemp = packet.temperature > thresholds.maxTemperature;
      const isHighAlt = packet.relAltitude > thresholds.maxAltitude;
      const isHighSpeed = packet.hSpeed > thresholds.maxSpeed || packet.vSpeed > thresholds.maxVerticalSpeed;
      const isHighPress = packet.pressure > thresholds.maxPressure;
      
      processAlert('temp', isHighTemp, 'Warning. High Temperature.', currentSettings.voice.alerts.thermal);
      processAlert('alt', isHighAlt, 'Attention. Altitude Limit Exceeded.', currentSettings.voice.alerts.altitude);
      processAlert('speed', isHighSpeed, 'Warning. Over speed.', currentSettings.voice.alerts.dynamics);
      processAlert('press', isHighPress, 'Warning. Over Pressure.', currentSettings.voice.alerts.dynamics);

  }, [speak]);

  const handleDataReceived = useCallback((packet: TelemetryPacket) => {
    const packetWithId = { ...packet, id: packet.id || Math.random().toString(36).substr(2, 9) };
    incomingQueueRef.current.push(packetWithId);
    
    if (isRecordingRef.current) {
        if (recordingBufferRef.current.length < 50000) recordingBufferRef.current.push(packetWithId);
        else if (recordingBufferRef.current.length === 50000 && !hasWarnedBufferLimitRef.current) {
           addToast("Recording buffer limit reached (50k points).", "error");
           hasWarnedBufferLimitRef.current = true;
        }
    }
  }, [addToast]);

  useEffect(() => {
      const loop = () => {
          if (incomingQueueRef.current.length > 0) {
              const batch = [...incomingQueueRef.current];
              incomingQueueRef.current = []; 

              const latest = batch[batch.length - 1];
              checkThresholds(latest);
              setLatestData(latest);

              setDataHistory(prev => {
                  const newHistory = [...prev, ...batch];
                  // AETHER UPDATE: Persist Full History for detailed analysis/maximization
                  return newHistory;
              });
          }
          animationFrameRef.current = requestAnimationFrame(loop);
      };
      
      loop();
      return () => {
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };
  }, [checkThresholds]);

  // AETHER: Sliced History REMOVED. Now using full history but optimized in charts.
  // We keep 'displayHistory' computation centralized though.
  
  const handleReconnectAttempt = useCallback(() => {
      addToast("Attempting to auto-reconnect...", "info");
      speak("Attempting Reconnection");
  }, [addToast, speak]);

  const { 
    status, errorMessage, connect, disconnect, isSimulating, isPaused, togglePause,
    isFileMode, startSimulation, stopSimulation, seekSimulation, simProgress,
    availablePorts, refreshPorts, requestAccess, isAutoReconnectEnabled, toggleAutoReconnect
  } = useSerial({ 
    serialConfig, csvOrder: settings.csvOrder, separator: settings.separator,
    simInterval: settings.simInterval, simPreset: settings.simPreset,
    windSettings: settings.wind, descentSettings: settings.descent, simConfig: settings.simulation,
    streamThrottle: settings.streamThrottle, calculationMode: settings.hardware.calculation,
    checksumMode: settings.checksum.mode, validateChecksum: settings.checksum.validate,
    onDataReceived: handleDataReceived, onAutoReconnectAttempt: handleReconnectAttempt
  });

  const isDataLive = status === ConnectionStatus.CONNECTED || (isSimulating && !isPaused);

  const prevStatusRef = useRef<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  useEffect(() => {
      if (!settings.voice.enabled || !settings.voice.alerts.connection) return;
      if (status === ConnectionStatus.CONNECTED && prevStatusRef.current !== ConnectionStatus.CONNECTED) {
          speak("Link Established");
      } else if (status === ConnectionStatus.DISCONNECTED && prevStatusRef.current === ConnectionStatus.CONNECTED) {
          speak("Link Lost");
      } else if (status === ConnectionStatus.ERROR && prevStatusRef.current !== ConnectionStatus.ERROR) {
          speak("Connection Error");
      }
      prevStatusRef.current = status;
  }, [status, settings.voice, speak]);

  useEffect(() => {
      const handleOffline = () => {
          addToast("No Internet Connection detected.", "error");
          if (settings.graphics.mapProvider !== 'local') {
              setConfirmModal({
                  isOpen: true,
                  title: "Switch to Offline Maps?",
                  message: "Internet access is lost. Switch to Localhost Tile Server?",
                  confirmText: "Switch to Local",
                  onConfirm: () => {
                      setSettings(prev => ({
                          ...prev,
                          graphics: { ...prev.graphics, mapProvider: 'local' }
                      }));
                      addToast("Map source set to Localhost.", "success");
                      setConfirmModal(prev => ({...prev, isOpen: false}));
                  }
              });
          }
      };
      const handleOnline = () => {
          addToast("Internet connection restored.", "success");
      };
      window.addEventListener('offline', handleOffline);
      window.addEventListener('online', handleOnline);
      return () => {
          window.removeEventListener('offline', handleOffline);
          window.removeEventListener('online', handleOnline);
      };
  }, [settings.graphics.mapProvider, addToast]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
    if (isRecording) {
        hasWarnedBufferLimitRef.current = false; 
    }
  }, [isRecording]);

  useEffect(() => {
    if (isAutoScroll && serialContainerRef.current) {
        serialContainerRef.current.scrollTop = serialContainerRef.current.scrollHeight;
    }
  }, [dataHistory, isAutoScroll, searchTerm]); 

  useEffect(() => {
      if (availablePorts.length > 0 && selectedPortIndex === "") {
          setSelectedPortIndex("0");
      }
  }, [availablePorts, selectedPortIndex]);

  useEffect(() => {
    if (status === ConnectionStatus.CONNECTED) {
      addToast(isSimulating ? 'Simulation Started' : 'Serial Port Connected Successfully', 'success');
    } else if (status === ConnectionStatus.ERROR && errorMessage) {
      addToast(errorMessage, 'error');
    } else if (status === ConnectionStatus.DISCONNECTED) {
        if (errorMessage) addToast(errorMessage, 'error');
    }
  }, [status, errorMessage, addToast, isSimulating]);

  const handleConnectClick = () => {
    if (selectedPortIndex !== "" && availablePorts[parseInt(selectedPortIndex)]) {
        addToast("Connecting to device...", "info");
        connect(availablePorts[parseInt(selectedPortIndex)]);
    } else {
        addToast("Please select a port from the list first.", "error");
    }
  };

  const handleDisconnectClick = () => {
      disconnect();
      addToast(isSimulating ? "Simulation stopped." : "Disconnected from device.", "info");
  };

  const handleScanClick = async () => {
      addToast("Opening device picker...", "info");
      const success = await requestAccess();
      if (success) {
          addToast("Device authorized successfully.", "success");
      } else {
          addToast("Device selection cancelled.", "info");
      }
  };

  const handleRefreshClick = async () => {
      addToast("Scanning for authorized devices...", "info");
      const ports = await refreshPorts();
      addToast(`Scan complete. ${ports.length} authorized device(s) found.`, "info");
  };

  const handleToggleAutoReconnect = () => {
      toggleAutoReconnect();
      addToast(!isAutoReconnectEnabled ? "Auto-Reconnect Enabled" : "Auto-Reconnect Disabled", "info");
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          if (text) {
              startSimulation(text);
              addToast(`Simulating playback from ${file.name}`, 'info');
          }
      };
      reader.onerror = () => addToast("Failed to read file", 'error');
      reader.readAsText(file);
      e.target.value = '';
  };

  const exportToCSV = useCallback((data: TelemetryPacket[], filenamePrefix: string) => {
    if (data.length === 0) {
      addToast("No data to export.", "error");
      return;
    }
    const fields = Object.keys(FIELD_LABELS).filter(f => f !== SKIP_FIELD) as (keyof TelemetryPacket)[];
    const headers = fields.map(f => FIELD_LABELS[f]);
    const rows = data.map(p => {
      return fields.map(f => {
          // @ts-ignore
          let val = p[f];
          if (val === undefined) return '';
          if (typeof val === 'string') {
              if (['=', '+', '-', '@'].includes(val.charAt(0))) {
                  val = "'" + val;
              }
              if (val.includes('"') || val.includes(',')) {
                  val = `"${val.replace(/"/g, '""')}"`;
              }
          }
          return val;
      }).join(",");
    });
    const csvContent = headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.setAttribute("download", `${filenamePrefix}_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast("CSV Exported Successfully", "success");
  }, [addToast]);

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      setConfirmModal({
        isOpen: true,
        title: "Stop Recording?",
        message: `You have ${recordingBufferRef.current.length} data points buffered. Stopping will save the CSV file immediately.`,
        confirmText: "Stop & Save",
        onConfirm: () => {
           setIsRecording(false);
           exportToCSV(recordingBufferRef.current, "telemetry_log");
           setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      });
    } else {
      recordingBufferRef.current = [];
      setIsRecording(true);
      addToast("Recording Started", "info");
    }
  }, [isRecording, exportToCSV, addToast]);

  const handleClearData = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      title: "Clear All Data?",
      message: "This will remove all current telemetry history from the graph and memory. This action cannot be undone.",
      isDestructive: true,
      confirmText: "Clear Data",
      onConfirm: () => {
         setDataHistory(generateZeroPackets());
         setLatestData(null);
         recordingBufferRef.current = [];
         setLastClearedId(null);
         addToast("Data history cleared and reset", "info");
         setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  }, [addToast]);

  const handleClearMonitor = () => {
     if (dataHistory.length > 0) {
        const lastId = dataHistory[dataHistory.length - 1].id;
        if (lastId) setLastClearedId(lastId);
        addToast("Serial Monitor cleared", "info");
     }
  };

  const handleExit = () => {
    setConfirmModal({
      isOpen: true,
      title: "Exit Application?",
      message: isRecording 
        ? "Recording is active. Exiting now will lose unsaved data. Are you sure?" 
        : "Are you sure you want to exit?",
      isDestructive: true,
      confirmText: "Exit",
      onConfirm: () => {
        try { window.close(); } catch (e) { console.error(e); }
        addToast("Please close the tab manually if the application does not exit.", "info");
        setConfirmModal(prev => ({...prev, isOpen: false}));
      }
    });
  };

  const handleSaveMonitorData = () => {
     if (serialMonitorData.length === 0) {
         addToast("No monitor data to save", "error");
         return;
     }
     setConfirmModal({
         isOpen: true,
         title: "Save Serial Monitor Data?",
         message: `Export ${serialMonitorData.length} rows of currently visible telemetry data to CSV?`,
         confirmText: "Download",
         onConfirm: () => {
             const visibleIds = new Set(serialMonitorData.map(d => d.id));
             const rawDataToExport = dataHistory.filter(d => visibleIds.has(d.id));
             exportToCSV(rawDataToExport, "serial_monitor_export");
             setConfirmModal(prev => ({...prev, isOpen: false}));
         }
     });
  };

  const handleCopyToClipboard = () => {
     if (serialMonitorData.length === 0) {
         addToast("No data to copy", "error");
         return;
     }
     const visibleIds = new Set(serialMonitorData.map(d => d.id));
     const rawData = dataHistory.filter(d => visibleIds.has(d.id));
     const fields = Object.keys(FIELD_LABELS).filter(f => f !== SKIP_FIELD) as (keyof TelemetryPacket)[];
     const headers = fields.map(f => FIELD_LABELS[f]);
     const rows = rawData.map(p => {
        return fields.map(f => {
            // @ts-ignore
            const val = p[f];
            return val !== undefined ? val : '';
        }).join(",");
     });
    const csvString = headers.join(",") + "\n" + rows.join("\n");
    navigator.clipboard.writeText(csvString).then(() => {
        addToast("Visible data copied to clipboard!", "success");
    }).catch(err => {
        addToast("Failed to copy data", "error");
    });
  };

  // --- KEYBOARD SHORTCUTS HANDLER ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleToggleRecording(); }
        if (e.code === 'Space' && isSimulating) { e.preventDefault(); togglePause(); }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Backspace') { e.preventDefault(); handleClearData(); }
        if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); setIsSettingsOpen(prev => !prev); }
        if (e.key === '?' && !e.ctrlKey && !e.metaKey) { setIsHelpOpen(prev => !prev); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm' && !e.shiftKey) { e.preventDefault(); handleMissionClick(); }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); handleMissionReset(); }
        // Close overlay with Esc
        if (e.key === 'Escape' && maximizedId) { e.preventDefault(); setMaximizedId(null); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSimulating, isRecording, handleToggleRecording, togglePause, handleClearData, handleMissionClick, handleMissionReset, maximizedId]);

  const formatTime = (val: number, format: TimeFormat) => {
    let seconds = 0;
    if (format === 'ms') seconds = Math.floor(val / 1000);
    else seconds = Math.floor(val);
    const minutes = Math.floor(seconds / 60);
    return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const convertDist = (val: number, unit: 'm' | 'ft') => unit === 'ft' ? val * 3.28084 : val;
  const convertTemp = (val: number, unit: '°C' | '°F' | 'K') => unit === '°F' ? (val * 9/5) + 32 : unit === 'K' ? val + 273.15 : val;
  const convertSpeed = (valMs: number, unit: 'm/s' | 'km/h' | 'mph' | 'ft/s') => {
    switch (unit) {
      case 'km/h': return valMs * 3.6;
      case 'mph': return valMs * 2.23694;
      case 'ft/s': return valMs * 3.28084;
      default: return valMs;
    }
  };
  const convertDensity = (valKgM3: number, unit: 'kg/m³' | 'lb/ft³') => unit === 'lb/ft³' ? valKgM3 * 0.06242796 : valKgM3;

  const displayHSpeed = convertSpeed(latestData?.hSpeed || 0, settings.units.speed);
  const displayVSpeed = convertSpeed(latestData?.vSpeed || 0, settings.units.speed);
  const displayDensity = convertDensity(latestData?.density || 0, settings.units.density);

  const dynamicPressureKPa = useMemo(() => {
      if (!latestData) return 0;
      const rho = latestData.density; 
      const v = Math.sqrt(Math.pow(latestData.vSpeed, 2) + Math.pow(latestData.hSpeed, 2)); 
      const q = 0.5 * rho * Math.pow(v, 2); 
      return q / 1000; 
  }, [latestData]);

  const gForceDisplay = useMemo(() => {
      if (dataHistory.length < 2) return 1.00; 
      const curr = dataHistory[dataHistory.length - 1];
      const prev = dataHistory[dataHistory.length - 2];
      let dt = (curr.timeElapsed - prev.timeElapsed) / 1000;
      if (dt <= 0) dt = 0.1; 
      const dvVertical = curr.vSpeed - prev.vSpeed;
      const dvHorizontal = curr.hSpeed - prev.hSpeed;
      const accelV = dvVertical / dt;
      const accelH = dvHorizontal / dt;
      const totalAccel = Math.sqrt(Math.pow(accelV, 2) + Math.pow(accelH, 2));
      const gLoad = Math.abs(totalAccel / 9.81);
      return gLoad < 0.1 ? 0 : gLoad;
  }, [dataHistory]);

  const displayHistory = useMemo(() => {
    return dataHistory.map(p => ({
      ...p,
      relAltitude: convertDist(p.relAltitude, settings.units.altitude),
      absAltitude: convertDist(p.absAltitude, settings.units.altitude),
      temperature: convertTemp(p.temperature, settings.units.temperature),
      thermistorTemp: convertTemp(p.thermistorTemp, settings.units.temperature),
    }));
  }, [dataHistory, settings.units]);
  
  const monitorColumns = useMemo(() => {
    return settings.csvOrder.filter(field => field !== SKIP_FIELD);
  }, [settings.csvOrder]);

  const serialMonitorData = useMemo(() => {
     let filtered = displayHistory;
     if (lastClearedId) {
         const index = displayHistory.findIndex(p => p.id === lastClearedId);
         if (index !== -1) {
             filtered = displayHistory.slice(index + 1);
         }
     }
     if (searchTerm) {
         try {
             const regex = new RegExp(searchTerm, 'i');
             filtered = filtered.filter(p => {
                 const lineStr = monitorColumns.map(f => p[f]).join(" ");
                 return regex.test(lineStr);
             });
         } catch (e) { }
     }
     return filtered.slice(-200); // Only keep recent for monitor list to prevent DOM lag
  }, [displayHistory, lastClearedId, searchTerm, monitorColumns]);

  const currentDisplay = displayHistory.length > 0 ? displayHistory[displayHistory.length - 1] : null;
  const backdropClass = settings.hardware.graphics === 'cpu' ? 'bg-slate-900' : 'backdrop-blur-md bg-slate-900/50';
  const globalFilter = useMemo(() => {
      const { globalBrightness, globalContrast, globalSaturation, nightVisionMode } = settings.graphics;
      let filter = `brightness(${globalBrightness}) contrast(${globalContrast}) saturate(${globalSaturation})`;
      if (nightVisionMode) filter += ' sepia(1) hue-rotate(-50deg) saturate(4) contrast(1.2)';
      return filter;
  }, [settings.graphics]);

  // --- MAXIMIZE RENDER LOGIC ---
  const renderMaximizedWidget = () => {
      if (!maximizedId) return null;
      
      const commonChartProps = {
          data: displayHistory,
          density: settings.density,
          thresholds: settings.thresholds,
          isMaximized: true,
          onMaximize: () => setMaximizedId(null)
      };

      return (
          <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-md p-4 lg:p-8 flex flex-col animate-in fade-in zoom-in-95 duration-200">
              <div className="flex-1 border border-slate-700 bg-slate-900/90 rounded-lg shadow-2xl relative overflow-hidden flex flex-col">
                  {/* Close Button specific to overlay */}
                  <button onClick={() => setMaximizedId(null)} className="absolute top-2 right-2 z-50 p-2 bg-slate-800 hover:bg-rose-600 text-white rounded shadow-lg transition-colors">
                      <X className="w-5 h-5" />
                  </button>

                  {maximizedId === 'chart-altitude' && (
                      <TelemetryChart 
                        {...commonChartProps}
                        title={`Altitude (${settings.units.altitude}) & Pressure`}
                        icon={ArrowUp}
                        unit={settings.units.altitude}
                        yAxisConfig={{ left: settings.altitude, right: settings.pressure }}
                        lines={[
                          { key: 'relAltitude', name: `Rel Alt (${settings.units.altitude})`, color: settings.altitude.color, dot: settings.altitude.showDots, yAxisId: 'left' },
                          { key: 'absAltitude', name: `Abs Alt (${settings.units.altitude})`, color: '#c084fc', dot: settings.altitude.showDots, yAxisId: 'left', strokeDasharray: '5 5' },
                          { key: 'pressure', name: 'Pressure (Pa)', color: settings.pressure.color, dot: settings.pressure.showDots, yAxisId: 'right' }
                        ]}
                      />
                  )}
                  {maximizedId === 'chart-thermal' && (
                      <TelemetryChart 
                        {...commonChartProps}
                        title={`Thermal Profile (${settings.units.temperature})`}
                        icon={Thermometer}
                        unit={settings.units.temperature}
                        yAxisConfig={{ left: settings.temperature }}
                        lines={[
                          { key: 'temperature', name: `Temp (${settings.units.temperature})`, color: settings.temperature.color, dot: settings.temperature.showDots },
                          { key: 'thermistorTemp', name: `Thermistor (${settings.units.temperature})`, color: '#ef4444', strokeDasharray: '5 5' }
                        ]}
                      />
                  )}
                  {maximizedId === 'chart-gyro' && (
                      <TelemetryChart 
                        {...commonChartProps}
                        title="Gyroscope Rates (deg/s)"
                        icon={Zap}
                        lines={[
                          { key: 'gx', name: 'GX', color: '#f87171', strokeWidth: 1 },
                          { key: 'gy', name: 'GY', color: '#4ade80', strokeWidth: 1 },
                          { key: 'gz', name: 'GZ', color: '#60a5fa', strokeWidth: 1 }
                        ]}
                      />
                  )}
                  {maximizedId === 'widget-attitude' && (
                      <AttitudeCube 
                        gx={latestData?.gx || 0} gy={latestData?.gy || 0} gz={latestData?.gz || 0} 
                        hardwareMode={settings.hardware.graphics} 
                        showShadows={settings.graphics.shadowQuality !== 'off'}
                        shadowQuality={settings.graphics.shadowQuality}
                        antialiasing={settings.graphics.antialiasing}
                        resolution={settings.graphics.renderResolution}
                        isMaximized={true}
                        onMaximize={() => setMaximizedId(null)}
                        modelConfig={attitudeModelConfig} // AETHER: Pass Persisted Model State
                        onUpdateModelConfig={setAttitudeModelConfig}
                      />
                  )}
                  {maximizedId === 'widget-map' && (
                      <GPSMap 
                        history={dataHistory} 
                        speedUnit={settings.units.speed} zoomSensitivity={settings.zoomSensitivity}
                        wind={settings.wind} descent={settings.descent} landing={settings.landing} terrain={settings.terrain} 
                        mapProvider={settings.graphics.mapProvider} localMapPort={settings.graphics.localMapPort}
                        vehicleIcon={settings.graphics.vehicleIcon} 
                        isMaximized={true}
                        onMaximize={() => setMaximizedId(null)}
                      />
                  )}
                  {maximizedId === 'widget-bottom' && (
                      <div className="flex flex-col h-full">
                          <div className="flex items-center justify-between border-b border-slate-700/50 p-2 bg-slate-900/50 shrink-0">
                             <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-md border border-slate-800">
                                  <button onClick={() => setActiveBottomView('serial')} className={`flex items-center gap-1.5 px-3 py-1 rounded-sm text-[10px] font-bold uppercase transition-all ${activeBottomView === 'serial' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}><Terminal className="w-3 h-3" /> Serial</button>
                                  <button onClick={() => setActiveBottomView('flight')} className={`flex items-center gap-1.5 px-3 py-1 rounded-sm text-[10px] font-bold uppercase transition-all ${activeBottomView === 'flight' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}><Rotate3d className="w-3 h-3" /> Flight Path</button>
                             </div>
                          </div>
                          <div className="flex-1 overflow-hidden relative bg-black/20">
                              {activeBottomView === 'serial' ? (
                                  <div ref={serialContainerRef} className="absolute inset-0 overflow-auto custom-scrollbar p-4 text-sm font-mono">
                                      {/* Simplified view for Maximize Serial just raw text for now or re-use list */}
                                      {serialMonitorData.map((packet, i) => (
                                          <div key={i} className="border-b border-slate-800/50 text-slate-300 py-0.5 hover:bg-slate-800/30">
                                              {monitorColumns.map(f => <span key={f as string} className="mr-4"><span className="text-slate-500 text-[10px] uppercase mr-1">{f}:</span>{packet[f]}</span>)}
                                          </div>
                                      ))}
                                  </div>
                              ) : (
                                  <FlightPathVisualizer 
                                    history={dataHistory} 
                                    prediction={flightPrediction} 
                                    settings={settings} 
                                    active={true}
                                    modelConfig={flightPathModelConfig} // AETHER: Pass Persisted Model State
                                    onUpdateModelConfig={setFlightPathModelConfig}
                                  />
                              )}
                          </div>
                      </div>
                  )}
              </div>
          </div>
      );
  };

  return (
    <div 
        className="flex flex-col h-screen w-full bg-slate-950 font-sans overflow-hidden relative selection:bg-cyan-500/30 selection:text-cyan-100"
        style={{ filter: globalFilter, transition: 'filter 0.5s ease' }}
    >
      {renderMaximizedWidget()}
      
      {/* ... (Existing Background Styles) ... */}
      <style>{`
        @keyframes wander-center {
          0% { transform: translate(-50%, 0) scale(1); opacity: calc(var(--user-opacity) * 0.5); }
          25% { transform: translate(-45%, 40px) scale(1.3); opacity: calc(var(--user-opacity) * 0.8); }
          50% { transform: translate(-50%, 80px) scale(1.5); opacity: var(--user-opacity); }
          75% { transform: translate(-55%, 40px) scale(1.3); opacity: calc(var(--user-opacity) * 0.8); }
          100% { transform: translate(-50%, 0) scale(1); opacity: calc(var(--user-opacity) * 0.5); }
        }

        @keyframes wander-corner {
          0% { transform: translate(0, 0) scale(1); opacity: calc(var(--user-opacity) * 0.4); }
          33% { transform: translate(-50px, -30px) scale(1.2); opacity: calc(var(--user-opacity) * 0.7); }
          66% { transform: translate(20px, -60px) scale(1.4); opacity: calc(var(--user-opacity) * 0.6); }
          100% { transform: translate(0, 0) scale(1); opacity: calc(var(--user-opacity) * 0.4); }
        }
      `}</style>

      {settings.graphics.showAmbient && (
        <>
            <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] blur-[120px] rounded-full pointer-events-none mix-blend-screen z-0 transition-all duration-[3000ms] ease-in-out"
                style={{ 
                    // @ts-ignore
                    '--user-opacity': settings.graphics.ambientOpacity, 
                    backgroundColor: `${settings.graphics.ambientColor}66`, 
                    animation: settings.graphics.animateAmbient 
                        ? `wander-center ${settings.graphics.ambientDuration}s infinite ease-in-out` 
                        : 'none',
                    opacity: settings.graphics.animateAmbient ? undefined : settings.graphics.ambientOpacity,
                    transform: settings.graphics.animateAmbient ? undefined : 'translate(-50%, 0) scale(1)',
                }} 
            />
            
            <div 
                className="absolute bottom-[-200px] right-[-200px] w-[600px] h-[600px] bg-emerald-500/20 blur-[100px] rounded-full pointer-events-none mix-blend-screen z-0 transition-all duration-[3000ms] ease-in-out" 
                style={{
                    // @ts-ignore
                    '--user-opacity': settings.graphics.ambientOpacity,
                    animation: settings.graphics.animateAmbient 
                        ? `wander-corner ${settings.graphics.ambientDuration * 1.3}s infinite ease-in-out reverse` 
                        : 'none',
                    opacity: settings.graphics.animateAmbient ? undefined : settings.graphics.ambientOpacity,
                    transform: settings.graphics.animateAmbient ? undefined : 'translate(0, 0) scale(1)',
                }}
            />
        </>
      )}
      
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0 mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>

      <div className="relative z-10 flex flex-col h-full w-full">
          
          <ToastContainer toasts={toasts} onRemove={removeToast} />
          
          <SettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
            settings={settings}
            onUpdate={setSettings}
          />
          
          <ConfirmModal 
            isOpen={confirmModal.isOpen}
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(prev => ({...prev, isOpen: false}))}
            isDestructive={confirmModal.isDestructive}
            confirmText={confirmModal.confirmText}
          />

          <HelpModal 
             isOpen={isHelpOpen}
             onClose={() => setIsHelpOpen(false)}
          />

          <AboutModal
             isOpen={isAboutOpen}
             onClose={() => setIsAboutOpen(false)}
          />

          <input 
             type="file" 
             ref={fileInputRef}
             onChange={handleFileImport}
             accept=".csv,.txt"
             className="hidden"
          />

          {/* HEADER SECTION (Preserved) */}
          <header className="h-16 shrink-0 border-b border-slate-800 bg-slate-950/70 backdrop-blur-md flex items-center justify-between px-6 z-50 shadow-lg">
            {/* ... (Same as original Header code) ... */}
            <div className="flex items-center gap-6">
                
                <TechTooltip content="About Hiraya GCS">
                    <button 
                    onClick={() => setIsAboutOpen(true)}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity focus:outline-none text-left"
                    >
                    <img 
                        src={HirayaLogo}
                        alt="Hiraya Logo" 
                        className="h-10 w-auto object-contain drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                    />
                    <div>
                        <h1 className="font-bold text-lg tracking-wide text-white font-space uppercase">HIRAYA <span className="text-cyan-400 text-xs font-mono ml-1">v10.0</span></h1>
                        <div className="flex items-center gap-2">
                        <p className="text-[10px] text-indigo-400 uppercase tracking-[0.3em] font-tech font-bold">Ground Station</p>
                        {settings.voice.enabled && <Mic className="w-3 h-3 text-amber-500 animate-pulse" />}
                        </div>
                    </div>
                    </button>
                </TechTooltip>
                
                <SystemStatusBar dataRate={dataHistory.length > 50 ? 50 : 1} mode={settings.hardware.calculation} graphics={settings.hardware.graphics} />

                <div className="hidden lg:flex items-center gap-2">
                    <TechTooltip content="Current Simulation Update Rate">
                        <div className="px-2 py-1 bg-slate-900/80 border border-slate-800 rounded-sm text-[9px] font-mono text-slate-400 clip-corner-br">
                            SIM: <span className="text-cyan-400 font-bold">{settings.simInterval}ms</span>
                        </div>
                    </TechTooltip>
                    
                    <TechTooltip content="Incoming Data Stream Throttle Delay">
                        <div className="px-2 py-1 bg-slate-900/80 border border-slate-800 rounded-sm text-[9px] font-mono text-slate-400 clip-corner-br">
                            THR: <span className="text-amber-400 font-bold">{settings.streamThrottle}ms</span>
                        </div>
                    </TechTooltip>
                </div>
            </div>

            <div className="flex items-center gap-2 lg:gap-3">
               {/* ... (Same as original Header Buttons) ... */}
               {isSimulating && isFileMode && (
                 <div className="flex items-center gap-2">
                     <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5 animate-in fade-in slide-in-from-top-2 w-32 lg:w-48 group relative">
                        <div className="px-2 text-[10px] text-cyan-400 font-bold uppercase border-r border-slate-800 flex items-center gap-1">
                           <Play className="w-3 h-3" /> Seek
                        </div>
                        <TechTooltip content="Scrub Simulation Timeline">
                            <input 
                                type="range"
                                min="0"
                                max="1"
                                step="0.001"
                                value={simProgress}
                                onChange={(e) => seekSimulation(parseFloat(e.target.value))}
                                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer mx-2 accent-cyan-500"
                            />
                        </TechTooltip>
                     </div>
                 </div>
               )}

               <div className="flex items-center bg-slate-900/80 border border-slate-700 rounded-sm p-0.5 hidden lg:flex relative tech-border">
                 {/* Port Selector */}
                 <div className={`flex items-center gap-2 px-3 py-1 border-r border-slate-700 relative transition-colors ${selectedPortIndex !== '' ? 'bg-indigo-500/10' : ''}`}>
                    <Usb className={`w-3 h-3 ${selectedPortIndex !== '' ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <div className={`relative ${selectedPortIndex !== '' ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-cyan-500 after:rounded-full' : ''}`}>
                        <TechTooltip content="Select Hardware Communication Port">
                            <select 
                            className={`bg-transparent text-xs outline-none border-none font-mono min-w-[120px] transition-colors cursor-pointer ${selectedPortIndex !== '' ? 'text-cyan-100 font-bold' : 'text-slate-400'}`}
                            value={selectedPortIndex}
                            onChange={(e) => setSelectedPortIndex(e.target.value)}
                            disabled={status === ConnectionStatus.CONNECTED || isSimulating}
                            >
                            {availablePorts.length === 0 && <option value="" className="bg-slate-900 text-slate-500 italic">NO DEVICES</option>}
                            {availablePorts.map((port, index) => {
                                const isSelected = index.toString() === selectedPortIndex;
                                return (
                                <option key={index} value={index} className={`bg-slate-900 font-bold ${isSelected ? 'text-cyan-400' : 'text-slate-200'}`}>
                                    {isSelected ? '✓ ' : '  '}Device {index + 1}
                                </option>
                                );
                            })}
                            </select>
                        </TechTooltip>
                    </div>
                    <TechTooltip content="Request Access to New Serial Device">
                        <button onClick={handleScanClick} className="p-1.5 hover:text-white text-emerald-400 transition-colors ml-1 rounded hover:bg-emerald-900/30" disabled={status === ConnectionStatus.CONNECTED || isSimulating}>
                        <Scan className="w-3.5 h-3.5" />
                        </button>
                    </TechTooltip>
                    <TechTooltip content="Refresh List of Authorized Devices">
                        <button onClick={handleRefreshClick} className="p-1.5 hover:text-white text-slate-500 transition-colors ml-1 rounded hover:bg-slate-700" disabled={status === ConnectionStatus.CONNECTED || isSimulating}>
                        <RefreshCcw className="w-3 h-3" />
                        </button>
                    </TechTooltip>
                 </div>
                 
                 <div className="flex items-center gap-2 px-3 py-1 border-r border-slate-700">
                    <TechTooltip content="Toggle Auto-Reconnection on Signal Loss">
                        <button onClick={handleToggleAutoReconnect} className={`flex items-center gap-1.5 text-xs font-bold uppercase transition-colors ${isAutoReconnectEnabled ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
                        <RefreshCcw className={`w-3 h-3 ${isAutoReconnectEnabled ? 'animate-spin-slow' : ''}`} />
                        <span className="hidden xl:inline">Auto-Rec</span>
                        </button>
                    </TechTooltip>
                 </div>

                 <div className="flex items-center gap-2 px-3 py-1 relative">
                    <TechTooltip content="Configure Baud Rate & Serial Parameters">
                        <button onClick={() => setShowConnectionSettings(!showConnectionSettings)} className="flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors font-mono" disabled={status === ConnectionStatus.CONNECTED || isSimulating}>
                            <Sliders className="w-3 h-3" />
                            <span>{serialConfig.baudRate}</span>
                        </button>
                    </TechTooltip>
                    {showConnectionSettings && (
                        <div className="absolute top-full right-0 mt-3 bg-slate-950 border border-slate-700 rounded-sm shadow-[0_0_30px_rgba(0,0,0,0.5)] p-4 z-[60] w-72 animate-in zoom-in-95 origin-top-right tech-border">
                            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
                                 <h4 className="text-xs font-bold text-white uppercase flex items-center gap-2 font-tech tracking-wider"><Radio className="w-3.5 h-3.5 text-indigo-400"/> Link Configuration</h4>
                                 <button onClick={() => setShowConnectionSettings(false)}><X className="w-3.5 h-3.5 text-slate-500 hover:text-white"/></button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase mb-1.5"><span>Baud Rate</span><span className="text-slate-600 font-mono text-[9px]">bps</span></label>
                                    <div className="relative">
                                        <Activity className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                                        <select className="w-full bg-slate-900 border border-slate-700 hover:border-indigo-500 rounded-sm pl-8 pr-2 py-1.5 text-xs text-white font-mono outline-none focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer" value={serialConfig.baudRate} onChange={(e) => setSerialConfig(prev => ({...prev, baudRate: parseInt(e.target.value)}))}>
                                            {BAUD_RATES.map(rate => <option key={rate} value={rate}>{rate}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {/* ... (Rest of config) ... */}
                            </div>
                        </div>
                    )}
                 </div>
              </div>

              <TechTooltip content={`Status: ${status}`}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-help transition-all duration-300 ${status === ConnectionStatus.CONNECTED ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : status === ConnectionStatus.ERROR ? 'bg-rose-500/10 border-rose-500/40 text-rose-300 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}>
                    {status === ConnectionStatus.CONNECTED ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    <span className="text-xs font-bold uppercase hidden md:inline tracking-wider">{status}</span>
                </div>
              </TechTooltip>
              <div className="h-6 w-px bg-slate-800 mx-1"></div>
              
              <TechTooltip content="Clear All Telemetry Data">
                <button onClick={handleClearData} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"><Trash2 className="w-5 h-5" /></button>
              </TechTooltip>
              <TechTooltip content="Open System Settings">
                <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"><Settings className="w-5 h-5" /></button>
              </TechTooltip>
              <TechTooltip content="Open User Manual">
                <button onClick={() => setIsHelpOpen(true)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"><HelpCircle className="w-5 h-5" /></button>
              </TechTooltip>
              <TechTooltip content="Exit Ground Station">
                <button onClick={handleExit} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"><LogOut className="w-5 h-5" /></button>
              </TechTooltip>

              <TechTooltip content={isRecording ? "Stop & Save Recording" : "Start Data Logging to Buffer"}>
                <button onClick={handleToggleRecording} className={`flex items-center gap-2 px-4 py-2 rounded-sm text-xs font-bold uppercase transition-all shadow-lg clip-corner-br ${isRecording ? 'bg-rose-500/20 border border-rose-500 text-rose-400 animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'}`}>
                    {isRecording ? <Disc className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                    {isRecording ? "REC" : "LOG"}
                    {isRecording && <span className="absolute top-0 right-0 -mt-1 -mr-1 w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping"></span>}
                </button>
              </TechTooltip>

              {status === ConnectionStatus.CONNECTED || isSimulating ? (
                 <div className="flex items-center gap-2">
                     {isSimulating && (
                         <TechTooltip content={isPaused ? "Resume Simulation" : "Pause Simulation"}>
                            <button onClick={togglePause} className={`px-4 py-2 rounded-sm shadow-[0_0_15px_rgba(251,191,36,0.4)] text-xs font-bold uppercase transition-all flex items-center gap-2 clip-corner-br ${isPaused ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse' : 'bg-slate-700 hover:bg-slate-600 text-amber-400 border border-amber-500/30'}`}>
                            {isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />} 
                            {isPaused ? "Resume" : "Pause"}
                            </button>
                         </TechTooltip>
                     )}
                     <TechTooltip content="Disconnect / Stop Simulation">
                        <button onClick={handleDisconnectClick} className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-sm shadow-[0_0_15px_rgba(225,29,72,0.4)] text-xs font-bold uppercase transition-all flex items-center gap-2 clip-corner-br">
                        <Square className="w-3 h-3 fill-current" /> Stop
                        </button>
                     </TechTooltip>
                 </div>
              ) : (
                <div className="flex gap-2">
                  <div className="flex gap-1">
                      <TechTooltip content="Start Test Simulation (Preset)">
                        <button onClick={() => startSimulation()} className="bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 px-3 py-2 rounded-l-sm text-xs font-bold uppercase transition-all flex items-center gap-2">
                            <Play className="w-3 h-3" /> Sim
                        </button>
                      </TechTooltip>
                      <TechTooltip content="Import Telemetry File for Replay">
                        <button onClick={() => fileInputRef.current?.click()} className="bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-l-0 border-slate-700 px-2 py-2 rounded-r-sm text-xs font-bold uppercase transition-all flex items-center">
                            <Upload className="w-3 h-3" />
                        </button>
                      </TechTooltip>
                  </div>
                  <div className="relative group/connect">
                    <TechTooltip content="Connect to Selected Serial Port">
                        <button onClick={handleConnectClick} disabled={selectedPortIndex === "" || availablePorts.length === 0} className={`px-4 py-2 rounded-sm shadow-lg text-xs font-bold uppercase transition-all flex items-center gap-2 clip-corner-br ${selectedPortIndex === "" || availablePorts.length === 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]'}`}>
                        <Terminal className="w-3 h-3" /> Connect
                        </button>
                    </TechTooltip>
                  </div>
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 p-2 lg:p-4 grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-4 overflow-hidden min-h-0 relative">
            
            {/* --- TOP ROW STATS --- */}
            <div className="col-span-1 lg:col-span-12 grid grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-2 shrink-0 h-auto md:h-20" title="Real-time Telemetry Dashboard Metrics">
              <StatCard label="Mission Time" value={formatMissionTime(missionTime)} unit="" onAcknowledge={handleMissionClick} onDoubleClick={handleMissionReset} isHold={missionStatus === 'hold'} isActive={missionStatus === 'running'} />
              <StatCard label="Run Time" value={latestData ? formatTime(latestData.runTime, settings.units.timeFormat) : "00:00"} unit="MM:SS" />
              <StatCard label="H-Speed" value={displayHSpeed.toFixed(2)} unit={settings.units.speed} isHigh={displayHSpeed > settings.thresholds.maxSpeed} isLow={displayHSpeed < settings.thresholds.minSpeed} isActive={!!latestData && isDataLive} onAcknowledge={() => handleAcknowledge('speed')} isMuted={acknowledgedAlerts.has('speed')} />
              <StatCard label="V-Speed" value={displayVSpeed.toFixed(2)} unit={settings.units.speed} isHigh={displayVSpeed > settings.thresholds.maxVerticalSpeed} isLow={displayVSpeed < settings.thresholds.minVerticalSpeed} isActive={!!latestData && isDataLive} onAcknowledge={() => handleAcknowledge('speed')} isMuted={acknowledgedAlerts.has('speed')} />
              <StatCard label="Rel Alt" value={currentDisplay?.relAltitude.toFixed(2) || "0.00"} unit={settings.units.altitude} isHigh={(currentDisplay?.relAltitude || 0) > settings.thresholds.maxAltitude} isLow={(currentDisplay?.relAltitude || 0) < settings.thresholds.minAltitude} isActive={!!latestData && isDataLive} onAcknowledge={() => handleAcknowledge('alt')} isMuted={acknowledgedAlerts.has('alt')} />
              <StatCard label="Abs Alt" value={currentDisplay?.absAltitude.toFixed(2) || "0.00"} unit={settings.units.altitude} isActive={!!latestData && isDataLive} />
              <StatCard label="Pressure" value={latestData?.pressure.toFixed(0) || "0"} unit="Pa" isHigh={(latestData?.pressure || 0) > settings.thresholds.maxPressure} isLow={(latestData?.pressure || 0) < settings.thresholds.minPressure && (latestData?.pressure || 0) > 0} isActive={!!latestData && isDataLive} onAcknowledge={() => handleAcknowledge('press')} isMuted={acknowledgedAlerts.has('press')} />
              <StatCard label="Temp" value={currentDisplay?.temperature.toFixed(2) || "0.00"} unit={settings.units.temperature} isHigh={(currentDisplay?.temperature || 0) > settings.thresholds.maxTemperature} isLow={(currentDisplay?.temperature || 0) < settings.thresholds.minTemperature} isActive={!!latestData && isDataLive} onAcknowledge={() => handleAcknowledge('temp')} isMuted={acknowledgedAlerts.has('temp')} />
              <StatCard label="Thermistor" value={currentDisplay?.thermistorTemp.toFixed(2) || "0.00"} unit={settings.units.temperature} isHigh={(currentDisplay?.thermistorTemp || 0) > settings.thresholds.maxTemperature} isActive={!!latestData && isDataLive} onAcknowledge={() => handleAcknowledge('temp')} isMuted={acknowledgedAlerts.has('temp')} />
              <StatCard label="Density" value={displayDensity.toFixed(4)} unit={settings.units.density} isHigh={displayDensity > settings.thresholds.maxDensity} isLow={displayDensity < settings.thresholds.minDensity} isActive={!!latestData && isDataLive} />
              <StatCard label="Max Q" value={dynamicPressureKPa.toFixed(2)} unit="kPa" isHigh={dynamicPressureKPa > settings.thresholds.maxDynamicPressure} isActive={!!latestData && isDataLive} />
              <StatCard label="G-Force" value={gForceDisplay.toFixed(2)} unit="G" isHigh={gForceDisplay > settings.thresholds.maxGForce} isLow={gForceDisplay < settings.thresholds.minGForce} isActive={!!latestData && isDataLive} />
            </div>

            {/* ... Middle Charts (unchanged) ... */}
            <div className="col-span-1 lg:col-span-8 flex flex-col gap-2 h-full overflow-y-auto pr-1" title="Telemetry History Graphs">
              <TelemetryChart 
                title={`Altitude (${settings.units.altitude}) & Pressure`}
                icon={ArrowUp}
                data={displayHistory}
                density={settings.density}
                thresholds={settings.thresholds}
                unit={settings.units.altitude}
                yAxisConfig={{ left: settings.altitude, right: settings.pressure }}
                onMaximize={() => setMaximizedId('chart-altitude')}
                lines={[
                  { key: 'relAltitude', name: `Rel Alt (${settings.units.altitude})`, color: settings.altitude.color, dot: settings.altitude.showDots, yAxisId: 'left' },
                  { key: 'absAltitude', name: `Abs Alt (${settings.units.altitude})`, color: '#c084fc', dot: settings.altitude.showDots, yAxisId: 'left', strokeDasharray: '5 5' },
                  { key: 'pressure', name: 'Pressure (Pa)', color: settings.pressure.color, dot: settings.pressure.showDots, yAxisId: 'right' }
                ]}
              />
              <TelemetryChart 
                title={`Thermal Profile (${settings.units.temperature})`}
                icon={Thermometer}
                data={displayHistory}
                density={settings.density}
                thresholds={settings.thresholds}
                unit={settings.units.temperature}
                yAxisConfig={{ left: settings.temperature }}
                onMaximize={() => setMaximizedId('chart-thermal')}
                lines={[
                  { key: 'temperature', name: `Temp (${settings.units.temperature})`, color: settings.temperature.color, dot: settings.temperature.showDots },
                  { key: 'thermistorTemp', name: `Thermistor (${settings.units.temperature})`, color: '#ef4444', strokeDasharray: '5 5' }
                ]}
              />
              <TelemetryChart 
                title="Gyroscope Rates (deg/s)"
                icon={Zap}
                data={displayHistory}
                density={settings.density}
                thresholds={settings.thresholds}
                onMaximize={() => setMaximizedId('chart-gyro')}
                lines={[
                  { key: 'gx', name: 'GX', color: '#f87171', strokeWidth: 1 },
                  { key: 'gy', name: 'GY', color: '#4ade80', strokeWidth: 1 },
                  { key: 'gz', name: 'GZ', color: '#60a5fa', strokeWidth: 1 }
                ]}
              />
            </div>

            {/* --- RIGHT COLUMN WIDGETS --- */}
            <div className="col-span-1 lg:col-span-4 flex flex-col gap-2 min-h-0">
              
              {/* 3D Attitude */}
              <div className="h-48 shrink-0 rounded-lg shadow-xl tech-border overflow-hidden" title="3D Attitude Visualization (Orientation)">
                <AttitudeCube 
                    gx={latestData?.gx || 0} 
                    gy={latestData?.gy || 0} 
                    gz={latestData?.gz || 0} 
                    hardwareMode={settings.hardware.graphics} 
                    showShadows={settings.graphics.shadowQuality !== 'off'}
                    shadowQuality={settings.graphics.shadowQuality}
                    antialiasing={settings.graphics.antialiasing}
                    resolution={settings.graphics.renderResolution}
                    onMaximize={() => setMaximizedId('widget-attitude')}
                    modelConfig={attitudeModelConfig} // AETHER: Pass Persisted State
                    onUpdateModelConfig={setAttitudeModelConfig}
                />
              </div>

              {/* GPS Map */}
              <div className="flex-1 min-h-[200px] flex flex-col tech-border rounded-lg overflow-hidden" title="Live GPS Tracking Map">
                 <GPSMap 
                   history={dataHistory} 
                   speedUnit={settings.units.speed}
                   zoomSensitivity={settings.zoomSensitivity}
                   wind={settings.wind} 
                   descent={settings.descent} 
                   landing={settings.landing} 
                   terrain={settings.terrain} 
                   mapProvider={settings.graphics.mapProvider}
                   localMapPort={settings.graphics.localMapPort}
                   vehicleIcon={settings.graphics.vehicleIcon} 
                   onMaximize={() => setMaximizedId('widget-map')}
                 />
              </div>
              
              {/* BOTTOM RIGHT: Swappable Serial Monitor / 3D Flight Path */}
              <div className={`flex-1 ${backdropClass} tech-border rounded-lg flex flex-col min-h-[150px] overflow-hidden shadow-inner`}>
                 {/* Header Tabs */}
                 <div className="flex items-center justify-between border-b border-slate-700/50 p-2 bg-slate-900/50">
                   <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-md border border-slate-800">
                        <button 
                            onClick={() => setActiveBottomView('serial')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-sm text-[10px] font-bold uppercase transition-all ${activeBottomView === 'serial' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Terminal className="w-3 h-3" /> Serial
                        </button>
                        <button 
                            onClick={() => setActiveBottomView('flight')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-sm text-[10px] font-bold uppercase transition-all ${activeBottomView === 'flight' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Rotate3d className="w-3 h-3" /> Flight Path
                        </button>
                   </div>

                   {/* Serial Monitor Controls (Only visible if active) */}
                   <div className="flex items-center gap-2">
                       {activeBottomView === 'serial' && (
                       <>
                         <div className="relative group">
                            <Search className={`w-3 h-3 absolute left-1.5 top-1.5 ${searchTerm ? 'text-indigo-400' : 'text-slate-500'}`} />
                            <TechTooltip content="Regex Filter (e.g. 'error', 'alt>500')">
                                <input 
                                type="text" 
                                placeholder="Filter..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-20 lg:w-24 bg-slate-900/80 border border-slate-700 rounded-sm pl-6 pr-2 py-0.5 text-[10px] text-white focus:w-32 transition-all outline-none focus:border-indigo-500 font-mono"
                                />
                            </TechTooltip>
                            {searchTerm && <button onClick={() => setSearchTerm("")} className="absolute right-1 top-1 text-slate-500 hover:text-white"><X className="w-3 h-3" /></button>}
                         </div>
                         <TechTooltip content="Toggle Auto-Scroll">
                            <button onClick={() => setIsAutoScroll(!isAutoScroll)} className={`p-1 rounded transition-colors ${isAutoScroll ? 'text-emerald-400 bg-emerald-950 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-transparent'}`}><ArrowDownCircle className="w-3 h-3" /></button>
                         </TechTooltip>
                         {isRecording && <span className="text-rose-500 animate-pulse text-[9px] font-bold font-mono" title="Recording in progress">● REC {recordingBufferRef.current.length}</span>}
                         <TechTooltip content="Clear Monitor View"><button onClick={handleClearMonitor} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"><Eraser className="w-3 h-3" /></button></TechTooltip>
                         <TechTooltip content="Copy View to Clipboard"><button onClick={handleCopyToClipboard} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"><Copy className="w-3 h-3" /></button></TechTooltip>
                         <TechTooltip content="Download Visible Data as CSV"><button onClick={handleSaveMonitorData} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"><Download className="w-3 h-3" /></button></TechTooltip>
                       </>
                       )}
                       {/* Maximize Button */}
                       <div className="h-3 w-px bg-slate-700 mx-1"></div>
                       <button onClick={() => setMaximizedId('widget-bottom')} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Maximize Panel"><Maximize2 className="w-3 h-3" /></button>
                   </div>
                 </div>
                 
                 {/* Content Switching */}
                 <div className="flex-1 overflow-hidden relative">
                    {activeBottomView === 'serial' ? (
                        <div ref={serialContainerRef} className="absolute inset-0 overflow-auto custom-scrollbar bg-black/20 scroll-smooth">
                            <div className="sticky top-0 z-10 flex min-w-max border-b border-slate-700/50 bg-slate-900 shadow-md">
                            {monitorColumns.map((field, idx) => (
                                <div key={`${field}-${idx}`} className="w-24 px-2 py-1 text-[9px] font-bold text-slate-500 uppercase shrink-0 text-right border-r border-slate-700/30 truncate" title={FIELD_LABELS[field] || field}>
                                    {FIELD_LABELS[field] || field}
                                </div>
                            ))}
                            </div>
                            <div className="min-w-max">
                                {serialMonitorData.map((packet, i) => {
                                    const isMatch = searchTerm && (new RegExp(searchTerm, 'i').test(monitorColumns.map(f => packet[f]).join(" ")));
                                    return (
                                    <div key={packet.id || i} className={`flex border-b border-slate-800/30 transition-colors ${isMatch ? 'bg-indigo-600/60 text-white font-bold animate-pulse' : 'hover:bg-slate-800/50'} ${!searchTerm ? 'new-line-flash' : ''}`}>
                                        {monitorColumns.map((field, idx) => {
                                        let displayVal = packet[field];
                                        if (field === 'timeElapsed') displayVal = formatTime(displayVal as number, settings.units.timeFormat);
                                        else if (typeof displayVal === 'number') displayVal = Number.isInteger(displayVal) ? displayVal.toFixed(0) : displayVal.toFixed(2);
                                        
                                        let textColor = isMatch ? 'text-white' : 'text-slate-300';
                                        if (!isMatch) {
                                            if (field.toLowerCase().includes('alt')) textColor = 'text-emerald-400';
                                            else if (field.toLowerCase().includes('press')) textColor = 'text-rose-400';
                                            else if (field.toLowerCase().includes('temp')) textColor = 'text-amber-400';
                                            else if (['gx','gy','gz'].includes(field as string)) textColor = 'text-indigo-400';
                                        }
                                        return <div key={`${field}-${idx}`} className={`w-24 px-2 py-0.5 text-[10px] font-mono shrink-0 text-right border-r border-slate-800/30 truncate ${textColor}`}>{displayVal}</div>
                                        })}
                                    </div>
                                    );
                                })}
                                {serialMonitorData.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-24 text-slate-600 text-[10px] italic w-full sticky left-0">
                                        <Terminal className="w-4 h-4 mb-1 opacity-50" />
                                        <span>{dataHistory.length > 0 ? (searchTerm ? "No matches found." : "Monitor cleared. Waiting for new data...") : "Waiting for data stream..."}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <FlightPathVisualizer 
                            history={dataHistory}
                            prediction={flightPrediction}
                            settings={settings}
                            active={activeBottomView === 'flight'}
                            modelConfig={flightPathModelConfig} // AETHER: Pass Persisted State
                            onUpdateModelConfig={setFlightPathModelConfig}
                        />
                    )}
                 </div>
              </div>
            </div>

          </main>
          
          <footer className="h-6 shrink-0 bg-slate-950/70 backdrop-blur-md border-t border-slate-800 flex items-center justify-between px-6 text-[10px] text-slate-500 z-50">
            <div className="flex items-center gap-6 flex-1">
               <div className="whitespace-nowrap flex items-center gap-2">
                 SYSTEM STATUS: <span className={status === ConnectionStatus.CONNECTED ? "text-emerald-500 font-bold" : status === ConnectionStatus.ERROR ? "text-rose-500 font-bold animate-pulse" : "text-amber-500"}>{status.toUpperCase()}</span>
               </div>
               {errorMessage && (
                 <div className="flex items-center gap-1.5 text-rose-400 animate-in fade-in slide-in-from-left-2">
                   <AlertTriangle className="w-3 h-3" />
                   <span className="font-medium">{errorMessage}</span>
                 </div>
               )}
               <div className="hidden lg:block text-slate-600 font-medium uppercase tracking-wider text-[9px]">
                   HIRAYA Ground Station • v10.0 • Licensed to HIRAYA Team • © 2026 Francis Mike John Camogao (Software Designed and Developed)
               </div>
            </div>
            
            <div className="flex gap-4 font-mono items-center">
              {/* AETHER: Use Isolated FooterTime */}
              <FooterTime />
              <div className="h-3 w-px bg-slate-800"></div>
              <span>PKT: {dataHistory.length}</span>
              <span>REC: {isRecording ? "ON" : "OFF"}</span>
              <span>BUF: {recordingBufferRef.current.length}</span>
            </div>
          </footer>
      </div>
    </div>
  );
};
