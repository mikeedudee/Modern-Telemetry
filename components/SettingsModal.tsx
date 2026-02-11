
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  X, Save, BarChart, GripVertical, FileSpreadsheet, ZoomIn, Plus, Trash2, Ban, 
  Download, RotateCcw, ListPlus, Eraser, Upload, Timer, Settings2, Gauge, 
  Thermometer, ArrowUpDown, Cloud, ChevronDown, Split, AlertTriangle, Wind, 
  Monitor, Layers, Box, Zap, Globe, Sparkles, Cpu, CircuitBoard, Gamepad2, 
  Plane, Rocket, Anchor, Activity, Lightbulb, Eye, Check, Volume2, Mic, 
  ShieldCheck, Clock, Crosshair, Mountain, ArrowDown, Navigation, Target, Car, Fan, Ship, MapPin, Hash, Ruler, Flame, MoveVertical, Circle
} from 'lucide-react';
import { 
  AppSettings, GraphConfig, CsvField, SpeedUnit, TempUnit, AltUnit, DensityUnit, 
  GraphicsSettings, HardwareMode, SimulationPreset, VoiceSettings, WindLayer, VehicleIconType, ChecksumMode 
} from '../types';
import { FIELD_LABELS, SKIP_FIELD, DEFAULT_SETTINGS } from '../constants';
import { ConfirmModal } from './UIElements';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
}

// Helper for stable IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdate }) => {
  const [localItems, setLocalItems] = useState<{ id: string; field: CsvField }[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  
  // Visual Save Feedback State
  const [isSaved, setIsSaved] = useState(false);
  
  // Voice State
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const [confirmModal, setConfirmModal] = useState<{
     isOpen: boolean;
     title: string;
     message: string;
     onConfirm: () => void;
     isDestructive?: boolean;
     confirmText?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && !isInitialized) {
      setLocalItems(settings.csvOrder.map(f => ({ id: generateId(), field: f })));
      setIsInitialized(true);
      
      // Load Voices
      const loadVoices = () => {
          const voices = window.speechSynthesis.getVoices();
          setAvailableVoices(voices);
      };
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
    if (!isOpen) {
      setIsInitialized(false);
      setIsSaved(false); 
    }
  }, [isOpen, isInitialized, settings.csvOrder]);

  const syncToParent = useCallback((newItems: { id: string; field: CsvField }[]) => {
      const newOrder = newItems.map(i => i.field);
      onUpdate({ ...settings, csvOrder: newOrder });
  }, [settings, onUpdate]);

  const handleChange = (key: keyof AppSettings, field: keyof GraphConfig, value: any) => {
    onUpdate({
      ...settings,
      [key]: {
        // @ts-ignore
        ...settings[key],
        [field]: value
      }
    });
  };

  // --- GENERIC UPDATERS ---
  
  const updateNested = (section: keyof AppSettings, key: string, value: any) => {
      onUpdate({
          ...settings,
          [section]: {
              // @ts-ignore
              ...settings[section],
              [key]: value
          }
      });
  };

  // Deep updater for Simulation Rocket Params
  const updateRocketParam = (key: string, value: any) => {
      onUpdate({
          ...settings,
          simulation: {
              ...settings.simulation,
              rocketParams: {
                  // @ts-ignore
                  ...settings.simulation.rocketParams,
                  [key]: value
              }
          }
      });
  };

  const addWindLayer = () => {
      const newLayer: WindLayer = { altitude: 1000, speed: 5, direction: 0 };
      onUpdate({
          ...settings,
          wind: {
              ...settings.wind,
              layers: [...settings.wind.layers, newLayer].sort((a, b) => a.altitude - b.altitude)
          }
      });
  };

  const removeWindLayer = (index: number) => {
      const newLayers = [...settings.wind.layers];
      newLayers.splice(index, 1);
      onUpdate({
          ...settings,
          wind: { ...settings.wind, layers: newLayers }
      });
  };

  const updateWindLayer = (index: number, field: keyof WindLayer, value: number) => {
      const newLayers = [...settings.wind.layers];
      newLayers[index] = { ...newLayers[index], [field]: value };
      if (field === 'altitude') {
          newLayers.sort((a, b) => a.altitude - b.altitude);
      }
      onUpdate({
          ...settings,
          wind: { ...settings.wind, layers: newLayers }
      });
  };

  // ------------------------------------------------

  const handleDensityChange = (val: 'high' | 'medium' | 'low') => {
    onUpdate({ ...settings, density: val });
  };

  const handleZoomChange = (val: number) => {
    onUpdate({ ...settings, zoomSensitivity: val });
  };
  
  const handleSeparatorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ ...settings, separator: e.target.value });
  };

  const handleSimIntervalChange = (val: number) => {
    onUpdate({ ...settings, simInterval: val });
  };

  const handleStreamThrottleChange = (val: number) => {
    onUpdate({ ...settings, streamThrottle: val });
  };

  const handleGraphicsChange = (key: keyof GraphicsSettings, value: any) => {
      onUpdate({
          ...settings,
          graphics: {
              ...settings.graphics,
              [key]: value
          }
      });
  };

  const handleHardwareChange = (type: 'calculation' | 'graphics', mode: HardwareMode) => {
      onUpdate({
          ...settings,
          hardware: {
              ...settings.hardware,
              [type]: mode
          }
      });
  };

  const handleSimPresetChange = (preset: SimulationPreset) => {
      onUpdate({ ...settings, simPreset: preset });
  }

  // --- Voice Handlers ---
  const handleVoiceChange = (key: keyof VoiceSettings, value: any) => {
      onUpdate({
          ...settings,
          voice: {
              ...settings.voice,
              [key]: value
          }
      });
  };
  
  const handleVoiceAlertToggle = (key: keyof VoiceSettings['alerts']) => {
      onUpdate({
          ...settings,
          voice: {
              ...settings.voice,
              alerts: {
                  ...settings.voice.alerts,
                  [key]: !settings.voice.alerts[key]
              }
          }
      });
  };

  const testVoice = () => {
      if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance("HIRAYA Ground Station. Voice Test Active.");
          const selectedVoice = availableVoices.find(v => v.name === settings.voice.voiceName);
          if (selectedVoice) utterance.voice = selectedVoice;
          utterance.volume = settings.voice.volume;
          utterance.rate = settings.voice.rate;
          utterance.pitch = settings.voice.pitch;
          window.speechSynthesis.speak(utterance);
      } else {
          alert("TTS not supported in this browser.");
      }
  };

  // --- UNIT CONVERSION HELPERS ---
  const handleUnitChange = (type: keyof AppSettings['units'], newValue: string) => {
      onUpdate({
          ...settings,
          units: {
              ...settings.units,
              [type]: newValue
          }
      });
  };

  const handleThresholdChange = (key: keyof AppSettings['thresholds'], value: string) => {
      const numVal = parseFloat(value);
      onUpdate({
          ...settings,
          thresholds: {
              ...settings.thresholds,
              [key]: isNaN(numVal) ? 0 : numVal
          }
      });
  };

  const handleExportSettings = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `telemetry_settings_${settings.configName.replace(/\s+/g, '_').toLowerCase()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const text = event.target?.result as string;
            const importedSettings = JSON.parse(text);
            
            if (importedSettings && Array.isArray(importedSettings.csvOrder)) {
                 importedSettings.configName = file.name;
                 onUpdate(importedSettings);
                 const newLocalItems = importedSettings.csvOrder.map((f: CsvField) => ({ id: generateId(), field: f }));
                 setLocalItems(newLocalItems);
                 alert(`Settings loaded from ${file.name}`);
            } else {
                 alert("Invalid settings file format.");
            }
        } catch (err) {
            console.error(err);
            alert("Failed to parse settings file.");
        }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const handleLoadDefaults = () => {
    setConfirmModal({
        isOpen: true,
        title: "Revert to Defaults?",
        message: "Are you sure you want to revert all settings to their default values? This action cannot be undone.",
        isDestructive: true,
        confirmText: "Revert",
        onConfirm: () => {
            const defaults = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            onUpdate(defaults);
            const newLocalItems = defaults.csvOrder.map((f: CsvField) => ({ id: generateId(), field: f }));
            setLocalItems(newLocalItems);
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
    });
  };

  const handleManualSave = () => {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
  };

  const handleRemoveAll = () => {
    if (localItems.length === 0) return;
    setConfirmModal({
        isOpen: true,
        title: "Clear Parser List?",
        message: "Are you sure you want to clear the entire parser list?",
        isDestructive: true,
        confirmText: "Clear All",
        onConfirm: () => {
            setLocalItems([]);
            syncToParent([]);
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
    });
  };

  const handleAddAll = () => {
    const currentFields = localItems.map(i => i.field);
    const allFields = Object.keys(FIELD_LABELS).filter(f => f !== SKIP_FIELD) as CsvField[];
    const missingFields = allFields.filter(f => !currentFields.includes(f));
    
    if (missingFields.length === 0) return;

    const newItems = missingFields.map(f => ({ id: generateId(), field: f }));
    const updatedList = [...localItems, ...newItems];
    setLocalItems(updatedList);
    syncToParent(updatedList);
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetId) return;

    const sourceIndex = localItems.findIndex(i => i.id === draggedItemId);
    const targetIndex = localItems.findIndex(i => i.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const newItems = [...localItems];
    const [movedItem] = newItems.splice(sourceIndex, 1);
    newItems.splice(targetIndex, 0, movedItem);

    setLocalItems(newItems);
  };

  const onDragEnd = () => {
    setDraggedItemId(null);
    syncToParent(localItems);
  };
  
  const addField = (field: CsvField) => {
    const newItems = [...localItems, { id: generateId(), field }];
    setLocalItems(newItems);
    syncToParent(newItems);
  };

  const removeField = (id: string) => {
    const newItems = localItems.filter(i => i.id !== id);
    setLocalItems(newItems);
    syncToParent(newItems);
  };

  const availableFields = useMemo(() => {
    const currentFields = localItems.map(i => i.field);
    const allFields = Object.keys(FIELD_LABELS).filter(f => f !== SKIP_FIELD) as CsvField[];
    return allFields.filter(f => !currentFields.includes(f));
  }, [localItems]);

  const renderThresholdInputs = (label: string, minKey: keyof AppSettings['thresholds'], maxKey: keyof AppSettings['thresholds']) => (
    <div className="flex items-center gap-2">
        <label className="text-[10px] font-bold font-tech uppercase text-slate-400 w-16">{label}</label>
        <div className="flex-1 flex gap-2">
            <div className="flex-1 relative">
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 font-bold">MIN</span>
                <input 
                    type="number"
                    step="any" 
                    value={settings.thresholds[minKey]} 
                    onChange={(e) => handleThresholdChange(minKey, e.target.value)}
                    className="w-full bg-slate-900 border-b border-slate-700 pl-8 pr-2 py-1 text-xs font-mono text-orange-400 focus:border-orange-500 outline-none transition-colors" 
                    title={`Set lower threshold for ${label}`}
                />
            </div>
            <div className="flex-1 relative">
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 font-bold">MAX</span>
                <input 
                    type="number"
                    step="any"
                    value={settings.thresholds[maxKey]} 
                    onChange={(e) => handleThresholdChange(maxKey, e.target.value)}
                    className="w-full bg-slate-900 border-b border-slate-700 pl-8 pr-2 py-1 text-xs font-mono text-rose-400 focus:border-rose-500 outline-none transition-colors" 
                    title={`Set upper threshold for ${label}`}
                />
            </div>
        </div>
    </div>
  );

  const renderHardwareButtons = (type: 'calculation' | 'graphics', current: HardwareMode) => (
      <div className="flex bg-slate-950 rounded p-1 border border-slate-800">
          <button 
             onClick={() => handleHardwareChange(type, 'cpu')}
             className={`flex-1 py-1.5 px-2 rounded text-[9px] font-bold uppercase transition-all ${current === 'cpu' ? 'bg-indigo-900/50 text-indigo-200 shadow border border-indigo-500/30' : 'text-slate-500 hover:text-white'}`}
          >
              CPU
          </button>
          <button 
             onClick={() => handleHardwareChange(type, 'hybrid')}
             className={`flex-1 py-1.5 px-2 rounded text-[9px] font-bold uppercase transition-all ${current === 'hybrid' ? 'bg-indigo-900/50 text-indigo-200 shadow border border-indigo-500/30' : 'text-slate-500 hover:text-white'}`}
          >
              Hybrid
          </button>
          <button 
             onClick={() => handleHardwareChange(type, 'gpu')}
             className={`flex-1 py-1.5 px-2 rounded text-[9px] font-bold uppercase transition-all ${current === 'gpu' ? 'bg-indigo-900/50 text-indigo-200 shadow border border-indigo-500/30' : 'text-slate-500 hover:text-white'}`}
          >
              GPU
          </button>
      </div>
  );

  const renderSimOption = (id: SimulationPreset, label: string, icon: React.ReactNode, desc: string) => {
      const isActive = settings.simPreset === id;
      return (
          <button
            onClick={() => handleSimPresetChange(id)}
            className={`w-full text-left p-2 rounded-sm border mb-2 transition-all flex items-start gap-3 group relative overflow-hidden ${
                isActive 
                ? 'bg-emerald-900/30 border-emerald-500/50 shadow-lg' 
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-600 hover:bg-slate-800'
            }`}
          >
              {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>}
              <div className={`p-2 rounded-sm ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-950 text-slate-500 group-hover:text-slate-300'}`}>
                  {icon}
              </div>
              <div className="flex-1">
                  <h5 className={`text-[10px] font-bold uppercase mb-0.5 ${isActive ? 'text-emerald-300' : 'text-slate-300'}`}>{label}</h5>
                  <p className="text-[9px] text-slate-500 leading-tight">{desc}</p>
              </div>
          </button>
      );
  };

  const renderVehicleIconOption = (id: VehicleIconType, label: string, Icon: React.ElementType) => {
      const isActive = settings.graphics.vehicleIcon === id;
      return (
          <button
            onClick={() => handleGraphicsChange('vehicleIcon', id)}
            className={`flex flex-col items-center justify-center p-2 rounded-sm border transition-all ${
                isActive 
                ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]' 
                : 'bg-slate-950 border-slate-800 text-slate-500 hover:bg-slate-800 hover:text-slate-300 hover:border-slate-600'
            }`}
            title={`Set Map Icon to ${label}`}
          >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-[9px] font-bold uppercase">{label}</span>
          </button>
      );
  };

  const renderGraphConfig = (title: string, key: keyof AppSettings) => (
    <div className="mb-4 bg-slate-950/30 border border-slate-800 p-3 rounded">
      <h3 className="text-[10px] font-bold text-slate-400 uppercase mb-2 border-b border-slate-800 pb-1 font-tech tracking-wider">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] text-slate-500 mb-0.5 uppercase">Color</label>
          <div className="flex items-center gap-2">
            {/* @ts-ignore */}
            <input 
                type="color" 
                // @ts-ignore
                value={settings[key].color}
                onChange={(e) => handleChange(key, 'color', e.target.value)}
                className="w-full h-5 bg-transparent border-0 p-0 cursor-pointer"
            />
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input 
                type="checkbox" 
                // @ts-ignore
                checked={settings[key].showDots}
                onChange={(e) => handleChange(key, 'showDots', e.target.checked)}
                className="w-3 h-3 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                />
                <span className="text-[9px] text-slate-400">Dots</span>
            </label>
          </div>
        </div>
        <div>
          <div className="flex gap-2">
              <div className="flex-1">
                  <label className="block text-[9px] text-slate-500 mb-0.5 uppercase">Min</label>
                  <input 
                    type="text" 
                    // @ts-ignore
                    value={settings[key].yMin}
                    placeholder="auto"
                    onChange={(e) => handleChange(key, 'yMin', e.target.value)}
                    className="w-full bg-slate-900 border-b border-slate-700 px-1 py-0.5 text-[10px] text-white font-mono outline-none focus:border-indigo-500 transition-colors"
                  />
              </div>
              <div className="flex-1">
                  <label className="block text-[9px] text-slate-500 mb-0.5 uppercase">Max</label>
                  <input 
                    type="text" 
                     // @ts-ignore
                    value={settings[key].yMax}
                    placeholder="auto"
                    onChange={(e) => handleChange(key, 'yMax', e.target.value)}
                    className="w-full bg-slate-900 border-b border-slate-700 px-1 py-0.5 text-[10px] text-white font-mono outline-none focus:border-indigo-500 transition-colors"
                  />
              </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 transition-all duration-300">
      
      <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.5)] w-full max-w-7xl h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 clip-corner-tl tech-border">
        
        {/* ... Header Code ... */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800/50 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3">
              <div className="bg-indigo-500/10 p-2 rounded-sm border border-indigo-500/20">
                  <Settings2 className="w-5 h-5 text-indigo-400" /> 
              </div>
              <div>
                  <h2 className="text-lg font-bold text-white tracking-widest font-space uppercase">System Config</h2>
                  <div className="flex items-center gap-2">
                      <p className="text-[10px] text-indigo-400 font-mono tracking-wider">PARAMETERS // PERSONALIZATION</p>
                      <div className="h-3 w-px bg-slate-700 mx-1"></div>
                      <span className="text-[10px] text-emerald-400 font-mono italic tracking-wide">
                        Loaded: {settings.configName || 'Unknown Preset'}
                      </span>
                  </div>
              </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden sm:flex items-center gap-1">
                <button onClick={handleLoadDefaults} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded text-[10px] font-bold text-slate-400 hover:text-white transition-colors border border-transparent hover:border-slate-700">
                    <RotateCcw className="w-3.5 h-3.5" /> DEFAULTS
                </button>
                <div className="w-px h-4 bg-slate-800 mx-1"></div>
                <button onClick={handleImportClick} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded text-[10px] font-bold text-slate-400 hover:text-white transition-colors border border-transparent hover:border-slate-700">
                    <Upload className="w-3.5 h-3.5" /> IMPORT
                </button>
                <button onClick={handleExportSettings} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded text-[10px] font-bold text-slate-400 hover:text-white transition-colors border border-transparent hover:border-slate-700">
                    <Download className="w-3.5 h-3.5" /> EXPORT
                </button>
             </div>

             <div className="w-px h-8 bg-slate-800"></div>

             <button onClick={handleManualSave} className={`flex items-center gap-2 px-6 py-2 font-bold uppercase clip-corner-br shadow-[0_0_15px_rgba(79,70,229,0.4)] text-xs tracking-wider transition-all hover:scale-105 active:scale-95 ${isSaved ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
                {isSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {isSaved ? 'Saved!' : 'Save Changes'}
             </button>

             <button onClick={onClose} className="text-slate-500 hover:text-rose-400 transition-colors p-2" title="Close Settings">
                <X className="w-6 h-6" />
             </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          
          <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".json" className="hidden" />

          {/* LEFT COLUMN: Visuals, Hardware, Voice, Performance */}
          <div className="w-full lg:w-[320px] xl:w-[350px] border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/50 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 shrink-0">
              <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-[0.2em] border-b border-indigo-900/30 pb-2 mb-[-10px] flex items-center gap-2 font-space">
                  <Monitor className="w-4 h-4" /> Visuals & Performance
              </h3>

              {/* RESTORED: PERFORMANCE CONTROLS (Manual Number Inputs) */}
              <div className="bg-slate-900/30 border border-slate-800 p-4 rounded-sm">
                 <h4 className="text-[11px] font-bold text-cyan-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider">
                    <Activity className="w-3.5 h-3.5" /> Data Stream & Simulation
                 </h4>
                 <div className="space-y-3">
                     <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Serial Throttle (ms)</label>
                        <input 
                            type="number" min="0" max="1000" step="10" 
                            value={settings.streamThrottle} 
                            onChange={(e) => handleStreamThrottleChange(parseInt(e.target.value))} 
                            className="w-20 bg-slate-950 border-b border-slate-700 px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-cyan-500" 
                        />
                     </div>
                     <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Sim Speed (ms)</label>
                        <input 
                            type="number" min="10" max="1000" step="10" 
                            value={settings.simInterval} 
                            onChange={(e) => handleSimIntervalChange(parseInt(e.target.value))} 
                            className="w-20 bg-slate-950 border-b border-slate-700 px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-cyan-500" 
                        />
                     </div>
                 </div>
              </div>

              {/* HARDWARE */}
              <div className="bg-slate-900/30 border border-slate-800 p-4 rounded-sm">
                 <h4 className="text-[11px] font-bold text-emerald-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider">
                    <CircuitBoard className="w-3.5 h-3.5" /> Hardware Acceleration
                 </h4>
                 <div className="space-y-4">
                     <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Calculation Mode</label>
                            <span className="text-[9px] text-indigo-400 font-mono">{settings.hardware.calculation.toUpperCase()}</span>
                        </div>
                        {renderHardwareButtons('calculation', settings.hardware.calculation)}
                     </div>
                     <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Graphics Mode</label>
                            <span className="text-[9px] text-indigo-400 font-mono">{settings.hardware.graphics.toUpperCase()}</span>
                        </div>
                        {renderHardwareButtons('graphics', settings.hardware.graphics)}
                     </div>
                 </div>
              </div>
              
              {/* ... Voice ... */}
              <div className="bg-slate-900/30 border border-slate-800 p-4 rounded-sm">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-[11px] font-bold text-amber-400 uppercase flex items-center gap-2 font-tech tracking-wider">
                        <Mic className="w-3.5 h-3.5" /> Voice Annunciator
                    </h4>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={settings.voice.enabled} onChange={(e) => handleVoiceChange('enabled', e.target.checked)} className="sr-only peer" />
                        <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>
                  
                  <div className={`${settings.voice.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'} transition-opacity space-y-4`}>
                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Synthesizer Voice</label>
                          <select value={settings.voice.voiceName} onChange={(e) => handleVoiceChange('voiceName', e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-sm px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-amber-500">
                             {availableVoices.map(v => (
                                 <option key={v.name} value={v.name}>{v.name.length > 25 ? v.name.substring(0,25) + '...' : v.name}</option>
                             ))}
                          </select>
                      </div>
                      <div className="flex gap-2">
                          <div className="flex-1">
                             <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Vol</label>
                             <input type="range" min="0" max="1" step="0.1" value={settings.voice.volume} onChange={(e) => handleVoiceChange('volume', parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded accent-amber-500" />
                          </div>
                          <div className="flex-1">
                             <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Rate</label>
                             <input type="range" min="0.5" max="2" step="0.1" value={settings.voice.rate} onChange={(e) => handleVoiceChange('rate', parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded accent-amber-500" />
                          </div>
                      </div>
                      <div className="bg-slate-950 p-2 rounded-sm border border-slate-800 grid grid-cols-2 gap-2">
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={settings.voice.alerts.connection} onChange={() => handleVoiceAlertToggle('connection')} className="w-3 h-3 accent-amber-500" /><span className="text-[9px] text-slate-400">Connection</span></label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={settings.voice.alerts.thermal} onChange={() => handleVoiceAlertToggle('thermal')} className="w-3 h-3 accent-amber-500" /><span className="text-[9px] text-slate-400">Thermal</span></label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={settings.voice.alerts.altitude} onChange={() => handleVoiceAlertToggle('altitude')} className="w-3 h-3 accent-amber-500" /><span className="text-[9px] text-slate-400">Altitude</span></label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={settings.voice.alerts.dynamics} onChange={() => handleVoiceAlertToggle('dynamics')} className="w-3 h-3 accent-amber-500" /><span className="text-[9px] text-slate-400">Dynamics</span></label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={settings.voice.alerts.mission} onChange={() => handleVoiceAlertToggle('mission')} className="w-3 h-3 accent-amber-500" /><span className="text-[9px] text-slate-400">Mission Timer</span></label>
                      </div>
                      <button onClick={testVoice} className="w-full py-1.5 border border-slate-700 hover:bg-amber-900/20 text-amber-500 text-[10px] font-bold uppercase rounded-sm transition-colors flex items-center justify-center gap-2">
                          <Volume2 className="w-3 h-3" /> Test Voice
                      </button>
                  </div>
              </div>

              {/* ... 3D Engine ... */}
              <div className="bg-slate-900/30 border border-slate-800 p-4 rounded-sm">
                 <h4 className="text-[11px] font-bold text-indigo-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider">
                    <Box className="w-3.5 h-3.5" /> 3D Rendering Engine
                 </h4>
                 <div className="space-y-4">
                     <label className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Anti-Aliasing (MSAA)</span>
                        <input type="checkbox" checked={settings.graphics.antialiasing} onChange={(e) => handleGraphicsChange('antialiasing', e.target.checked)} className="w-3.5 h-3.5 accent-indigo-500" />
                     </label>
                     <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Show Wind Particles</span>
                            <input type="checkbox" checked={settings.graphics.showWind} onChange={(e) => handleGraphicsChange('showWind', e.target.checked)} className="w-3.5 h-3.5 accent-indigo-500" />
                        </label>
                        {settings.graphics.showWind && (
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] text-slate-500 uppercase font-bold">Color</span>
                                <input type="color" value={settings.graphics.windColor} onChange={(e) => handleGraphicsChange('windColor', e.target.value)} className="w-5 h-5 rounded border-0 p-0 cursor-pointer" />
                            </div>
                        )}
                     </div>
                     <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Shadow Quality</label>
                            <span className="text-[9px] text-indigo-400 font-mono uppercase">{settings.graphics.shadowQuality}</span>
                        </div>
                        <div className="flex bg-slate-950 rounded-sm p-1 border border-slate-800">
                            {['off', 'low', 'high'].map(q => (
                                <button key={q} onClick={() => handleGraphicsChange('shadowQuality', q)} className={`flex-1 py-1 text-[9px] font-bold uppercase rounded-sm transition-colors ${settings.graphics.shadowQuality === q ? 'bg-indigo-900/50 text-indigo-300' : 'text-slate-500 hover:text-white'}`}>{q}</button>
                            ))}
                        </div>
                     </div>
                     <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Render Scale</label>
                            <span className="text-[9px] text-indigo-400 font-mono">{(settings.graphics.renderResolution * 100).toFixed(0)}%</span>
                        </div>
                        <input type="range" min="0.5" max="2.0" step="0.25" value={settings.graphics.renderResolution} onChange={(e) => handleGraphicsChange('renderResolution', parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                     </div>
                     <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Wind Particle Count</label>
                            <span className="text-[9px] text-indigo-400 font-mono">{settings.graphics.windParticleCount}</span>
                        </div>
                        <input type="range" min="100" max="10000" step="100" value={settings.graphics.windParticleCount} onChange={(e) => handleGraphicsChange('windParticleCount', parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                     </div>
                 </div>
              </div>

              {/* ... Ambient ... */}
              <div className="bg-slate-900/30 border border-slate-800 p-4 rounded-sm">
                 <h4 className="text-[11px] font-bold text-purple-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider">
                    <Lightbulb className="w-3.5 h-3.5" /> Ambient Atmosphere
                 </h4>
                 <div className="space-y-3">
                    <label className="flex items-center justify-between p-2 rounded-sm bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-600 transition-colors group">
                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200 uppercase">Enable Glow</span>
                        <input type="checkbox" checked={settings.graphics.showAmbient} onChange={(e) => handleGraphicsChange('showAmbient', e.target.checked)} className="w-3.5 h-3.5 accent-indigo-500 rounded-sm" />
                    </label>
                    {settings.graphics.showAmbient && (
                        <div className="animate-in fade-in slide-in-from-top-1 space-y-4 pt-2">
                            <div>
                                <label className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Glow Color</label>
                                <div className="flex gap-2">
                                    <input type="color" value={settings.graphics.ambientColor} onChange={(e) => handleGraphicsChange('ambientColor', e.target.value)} className="w-8 h-8 bg-transparent border-0 p-0 cursor-pointer shrink-0 rounded" />
                                    <input type="text" value={settings.graphics.ambientColor} onChange={(e) => handleGraphicsChange('ambientColor', e.target.value)} className="w-full bg-slate-950 border border-slate-700 px-2 text-[10px] text-white font-mono uppercase rounded-sm" />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between mb-1">
                                    <label className="text-[9px] text-slate-500 font-bold uppercase">Intensity</label>
                                    <span className="text-[9px] text-indigo-400 font-mono">{(settings.graphics.ambientOpacity * 100).toFixed(0)}%</span>
                                </div>
                                <input type="range" min="0.05" max="1.0" step="0.05" value={settings.graphics.ambientOpacity} onChange={(e) => handleGraphicsChange('ambientOpacity', parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                            <div className="p-2 rounded-sm bg-slate-950 border border-slate-800">
                                <label className="flex items-center justify-between cursor-pointer group mb-2">
                                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200 uppercase">Dynamic Breathing</span>
                                    <input type="checkbox" checked={settings.graphics.animateAmbient} onChange={(e) => handleGraphicsChange('animateAmbient', e.target.checked)} className="w-3.5 h-3.5 accent-purple-500 rounded-sm" />
                                </label>
                                {settings.graphics.animateAmbient && (
                                    <div className="pt-2 border-t border-slate-800/50">
                                        <div className="flex justify-between mb-1">
                                            <label className="text-[9px] text-slate-500 font-bold uppercase">Cycle Speed</label>
                                            <span className="text-[9px] text-purple-400 font-mono">{settings.graphics.ambientDuration}s</span>
                                        </div>
                                        <input type="range" min="2" max="30" step="1" value={settings.graphics.ambientDuration} onChange={(e) => handleGraphicsChange('ambientDuration', parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                 </div>
              </div>

              {/* ... Graph Config ... */}
              <div className="bg-slate-900/30 border border-slate-800 p-4 rounded-sm flex-1">
                 <h4 className="text-[11px] font-bold text-rose-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider">
                    <BarChart className="w-3.5 h-3.5" /> Graph Config
                 </h4>
                 <div className="mb-4">
                     <label className="text-[10px] text-slate-500 font-bold uppercase block mb-2">Sampling Density</label>
                     <div className="flex bg-slate-950 rounded-sm p-1 border border-slate-800">
                       {(['low', 'medium', 'high'] as const).map((level) => (
                         <button key={level} onClick={() => handleDensityChange(level)} className={`flex-1 py-1 px-2 rounded-sm text-[9px] font-bold uppercase transition-all ${settings.density === level ? 'bg-rose-900/40 text-rose-200 border border-rose-500/30' : 'text-slate-500 hover:text-white'}`}>{level}</button>
                       ))}
                     </div>
                 </div>
                 <div className="space-y-3">
                    {renderGraphConfig('Altitude', 'altitude')}
                    {renderGraphConfig('Pressure', 'pressure')}
                    {renderGraphConfig('Temperature', 'temperature')}
                 </div>
              </div>
          </div>

          {/* RIGHT COLUMN: Physics, Maps, CSV */}
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-transparent flex flex-col gap-6">
              
              {/* ... General Settings ... */}
              <div className="bg-slate-900/20 border border-slate-800 p-4 rounded-sm">
                  <h4 className="text-[11px] font-bold text-white uppercase mb-3 flex items-center gap-2 font-tech tracking-wider">
                      <Settings2 className="w-3.5 h-3.5" /> General Configuration
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* ... Units, Mission, Checksum ... */}
                      <div className="space-y-2">
                          <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1"><Ruler className="w-3 h-3"/> Measurement Units</label>
                          <div className="grid grid-cols-2 gap-2">
                              <select value={settings.units.speed} onChange={(e) => handleUnitChange('speed', e.target.value)} className="bg-slate-950 border border-slate-700 rounded-sm px-1 py-1 text-[9px] text-white outline-none">
                                  <option value="m/s">m/s</option><option value="km/h">km/h</option><option value="mph">mph</option><option value="ft/s">ft/s</option>
                              </select>
                              <select value={settings.units.altitude} onChange={(e) => handleUnitChange('altitude', e.target.value)} className="bg-slate-950 border border-slate-700 rounded-sm px-1 py-1 text-[9px] text-white outline-none">
                                  <option value="m">Meters</option><option value="ft">Feet</option>
                              </select>
                              <select value={settings.units.temperature} onChange={(e) => handleUnitChange('temperature', e.target.value)} className="bg-slate-950 border border-slate-700 rounded-sm px-1 py-1 text-[9px] text-white outline-none">
                                  <option value="°C">Celsius</option><option value="°F">Fahrenheit</option><option value="K">Kelvin</option>
                              </select>
                              <select value={settings.units.density} onChange={(e) => handleUnitChange('density', e.target.value)} className="bg-slate-950 border border-slate-700 rounded-sm px-1 py-1 text-[9px] text-white outline-none">
                                  <option value="kg/m³">kg/m³</option><option value="lb/ft³">lb/ft³</option>
                              </select>
                          </div>
                      </div>

                      {/* MISSION TIME */}
                      <div>
                          <label className="text-[10px] text-slate-500 font-bold uppercase block mb-2 flex items-center gap-1"><Clock className="w-3 h-3"/> Mission Timer</label>
                          <div className="flex gap-2">
                              <input 
                                type="number" 
                                min="0" 
                                max={settings.mission.unit === 'minutes' ? 60 : 3600}
                                value={settings.mission.countDownStart} 
                                onChange={(e) => updateNested('mission', 'countDownStart', parseInt(e.target.value))} 
                                className="w-20 bg-slate-950 border-b border-slate-700 px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-indigo-500" 
                              />
                              <select 
                                value={settings.mission.unit || 'minutes'} 
                                onChange={(e) => updateNested('mission', 'unit', e.target.value)} 
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-sm px-2 py-1 text-[9px] text-white outline-none focus:border-indigo-500"
                              >
                                  <option value="minutes">Minutes</option>
                                  <option value="seconds">Seconds</option>
                              </select>
                          </div>
                      </div>

                      {/* CHECKSUM */}
                      <div>
                          <label className="text-[10px] text-slate-500 font-bold uppercase block mb-2 flex items-center gap-1"><Hash className="w-3 h-3"/> Data Integrity</label>
                          <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                  <span className="text-[9px] text-slate-400">Checksum Mode</span>
                                  <select value={settings.checksum.mode} onChange={(e) => updateNested('checksum', 'mode', e.target.value)} className="w-20 bg-slate-950 border border-slate-700 rounded-sm px-1 py-1 text-[9px] text-white outline-none">
                                      <option value="none">None</option>
                                      <option value="nmea">NMEA (*)</option>
                                      <option value="mod256">MOD 256</option>
                                  </select>
                              </div>
                              <label className="flex items-center justify-between cursor-pointer">
                                  <span className="text-[9px] text-slate-400">Validate Checksum</span>
                                  <input type="checkbox" checked={settings.checksum.validate} onChange={(e) => updateNested('checksum', 'validate', e.target.checked)} className="accent-indigo-500" />
                              </label>
                          </div>
                      </div>

                  </div>
              </div>

              {/* --- AETHER: PHYSICS & NAVIGATION MODULE --- */}
              <div>
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-[0.2em] border-b border-indigo-900/30 pb-2 mb-4 flex items-center gap-2 font-space">
                      <Wind className="w-4 h-4" /> Physics & Navigation
                  </h3>
                  
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {/* DESCENT PHYSICS */}
                      <div className="bg-slate-900/20 border border-slate-800 p-4 rounded-sm">
                          <h4 className="text-[11px] font-bold text-cyan-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider"><Anchor className="w-3.5 h-3.5" /> Descent Modeling</h4>
                          <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] text-slate-500 font-bold uppercase">Payload Mass (kg)</label>
                                  <input type="number" step="0.1" value={settings.descent.mass} onChange={(e) => updateNested('descent', 'mass', parseFloat(e.target.value))} className="w-20 bg-slate-950 border-b border-slate-700 px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-cyan-500" />
                              </div>
                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] text-slate-500 font-bold uppercase">Parachute Area (m²)</label>
                                  <input type="number" step="0.1" value={settings.descent.parachuteArea} onChange={(e) => updateNested('descent', 'parachuteArea', parseFloat(e.target.value))} className="w-20 bg-slate-950 border-b border-slate-700 px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-cyan-500" />
                              </div>
                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] text-slate-500 font-bold uppercase">Drag Coeff (Cd)</label>
                                  <input type="number" step="0.1" value={settings.descent.dragCoefficient} onChange={(e) => updateNested('descent', 'dragCoefficient', parseFloat(e.target.value))} className="w-20 bg-slate-950 border-b border-slate-700 px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-cyan-500" />
                              </div>
                              <p className="text-[8px] text-slate-600 italic mt-2">* Used to calculate terminal velocity and predict drift for the payload/CanSat.</p>
                          </div>
                      </div>

                      {/* LANDING PREDICTION & HEADING */}
                      <div className="bg-slate-900/20 border border-slate-800 p-4 rounded-sm">
                          <h4 className="text-[11px] font-bold text-rose-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider"><Crosshair className="w-3.5 h-3.5" /> Landing Zone</h4>
                          <div className="space-y-3">
                              <label className="flex items-center justify-between cursor-pointer">
                                  <span className="text-[10px] text-slate-400 font-bold uppercase">Show Prediction</span>
                                  <input type="checkbox" checked={settings.landing.showPrediction} onChange={(e) => updateNested('landing', 'showPrediction', e.target.checked)} className="accent-rose-500" />
                              </label>
                              
                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] text-slate-500 font-bold uppercase">Heading Source</label>
                                  <select value={settings.landing.headingSource} onChange={(e) => updateNested('landing', 'headingSource', e.target.value)} className="w-24 bg-slate-950 border border-slate-700 rounded-sm px-1 py-1 text-[9px] text-white outline-none">
                                      <option value="auto">Auto</option>
                                      <option value="gps">GPS Only</option>
                                      <option value="imu">IMU Only</option>
                                      <option value="fused">Fused</option>
                                  </select>
                              </div>

                              {(settings.landing.headingSource === 'fused' || settings.landing.headingSource === 'auto') && (
                                  <div className="animate-in fade-in slide-in-from-top-1">
                                      <div className="flex justify-between items-center mb-1">
                                          <label className="text-[10px] text-slate-500 font-bold uppercase">Sensor Weight</label>
                                          <span className="text-[9px] text-indigo-400 font-mono">
                                              {settings.landing.headingSource === 'auto' ? 'Auto (Speed)' : `${(settings.landing.gpsWeight * 100).toFixed(0)}% GPS`}
                                          </span>
                                      </div>
                                      {settings.landing.headingSource === 'fused' && (
                                          <div className="flex items-center gap-2">
                                              <span className="text-[8px] text-slate-500">IMU</span>
                                              <input type="range" min="0" max="1" step="0.1" value={settings.landing.gpsWeight} onChange={(e) => updateNested('landing', 'gpsWeight', parseFloat(e.target.value))} className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500" />
                                              <span className="text-[8px] text-slate-500">GPS</span>
                                          </div>
                                      )}
                                  </div>
                              )}

                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] text-slate-500 font-bold uppercase">Update Rate (ms)</label>
                                  <input type="number" value={settings.landing.predictionInterval} onChange={(e) => updateNested('landing', 'predictionInterval', parseFloat(e.target.value))} className="w-20 bg-slate-950 border-b border-slate-700 px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-rose-500" />
                              </div>

                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] text-slate-500 font-bold uppercase">Confidence Radius</label>
                                  <input type="number" value={settings.landing.confidenceRadius} onChange={(e) => updateNested('landing', 'confidenceRadius', parseFloat(e.target.value))} className="w-20 bg-slate-950 border-b border-slate-700 px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-rose-500" />
                              </div>
                          </div>
                      </div>

                      {/* WIND GRADIENT ENGINE */}
                      <div className="bg-slate-900/20 border border-slate-800 p-4 rounded-sm flex flex-col">
                          <div className="flex justify-between items-center mb-3">
                              <h4 className="text-[11px] font-bold text-white uppercase flex items-center gap-2 font-tech tracking-wider"><Wind className="w-3.5 h-3.5" /> Wind Engine</h4>
                              <div className="flex bg-slate-950 rounded p-0.5 border border-slate-700">
                                  <button onClick={() => updateNested('wind', 'mode', 'single')} className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-sm transition-colors ${settings.wind.mode === 'single' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}>Single</button>
                                  <button onClick={() => updateNested('wind', 'mode', 'gradient')} className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-sm transition-colors ${settings.wind.mode === 'gradient' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}>Gradient</button>
                              </div>
                          </div>

                          {settings.wind.mode === 'single' ? (
                              <div className="space-y-3 animate-in fade-in">
                                  <div className="flex justify-between items-center">
                                      <label className="text-[10px] text-slate-500 font-bold uppercase">Speed (m/s)</label>
                                      <input type="number" value={settings.wind.speed} onChange={(e) => updateNested('wind', 'speed', parseFloat(e.target.value))} className="w-20 bg-slate-950 border-b border-slate-700 px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-indigo-500" />
                                  </div>
                                  <div className="flex justify-between items-center">
                                      <label className="text-[10px] text-slate-500 font-bold uppercase">Direction (From °)</label>
                                      <input type="number" value={settings.wind.direction} onChange={(e) => updateNested('wind', 'direction', parseFloat(e.target.value))} className="w-20 bg-slate-950 border-b border-slate-700 px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-indigo-500" />
                                  </div>
                              </div>
                          ) : (
                              <div className="flex-1 flex flex-col min-h-[100px] animate-in fade-in">
                                  <div className="grid grid-cols-4 gap-1 text-[8px] font-bold text-slate-500 uppercase mb-1 px-1">
                                      <span>Alt (m)</span><span>Spd</span><span>Dir</span><span></span>
                                  </div>
                                  <div className="flex-1 overflow-y-auto max-h-[100px] custom-scrollbar space-y-1">
                                      {settings.wind.layers.map((layer, idx) => (
                                          <div key={idx} className="grid grid-cols-4 gap-1 items-center bg-slate-950/50 p-1 rounded-sm border border-slate-800">
                                              <input type="number" value={layer.altitude} onChange={(e) => updateWindLayer(idx, 'altitude', parseFloat(e.target.value))} className="bg-transparent text-[9px] text-white font-mono outline-none border-b border-slate-700 focus:border-indigo-500 w-full" />
                                              <input type="number" value={layer.speed} onChange={(e) => updateWindLayer(idx, 'speed', parseFloat(e.target.value))} className="bg-transparent text-[9px] text-cyan-400 font-mono outline-none border-b border-slate-700 focus:border-cyan-500 w-full" />
                                              <input type="number" value={layer.direction} onChange={(e) => updateWindLayer(idx, 'direction', parseFloat(e.target.value))} className="bg-transparent text-[9px] text-amber-400 font-mono outline-none border-b border-slate-700 focus:border-amber-500 w-full" />
                                              <button onClick={() => removeWindLayer(idx)} className="text-rose-500 hover:text-white flex justify-center"><Trash2 className="w-3 h-3" /></button>
                                          </div>
                                      ))}
                                  </div>
                                  <button onClick={addWindLayer} className="mt-2 w-full py-1 border border-dashed border-slate-700 text-slate-500 hover:text-white hover:border-slate-500 text-[9px] uppercase font-bold rounded-sm flex items-center justify-center gap-1 transition-colors"><Plus className="w-3 h-3" /> Add Layer</button>
                              </div>
                          )}
                      </div>

                      {/* TERRAIN AWARENESS */}
                      <div className="bg-slate-900/20 border border-slate-800 p-4 rounded-sm">
                          <h4 className="text-[11px] font-bold text-emerald-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider"><Mountain className="w-3.5 h-3.5" /> Terrain Awareness</h4>
                          <div className="space-y-3">
                              <label className="flex items-center justify-between cursor-pointer">
                                  <span className="text-[10px] text-slate-400 font-bold uppercase">Enable Correction</span>
                                  <input type="checkbox" checked={settings.terrain.enabled} onChange={(e) => updateNested('terrain', 'enabled', e.target.checked)} className="accent-emerald-500" />
                              </label>
                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] text-slate-500 font-bold uppercase">Provider</label>
                                  <select value={settings.terrain.provider} onChange={(e) => updateNested('terrain', 'provider', e.target.value)} className="w-24 bg-slate-950 border border-slate-700 rounded-sm px-1 py-1 text-[9px] text-white outline-none">
                                      <option value="none">None</option>
                                      <option value="online">Online (Google/Mapbox)</option>
                                      <option value="local">Local Server</option>
                                  </select>
                              </div>
                              {settings.terrain.provider === 'local' && (
                                  <div className="animate-in fade-in slide-in-from-top-1">
                                      <label className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Local Elevation URL</label>
                                      <input type="text" value={settings.terrain.localUrl} onChange={(e) => updateNested('terrain', 'localUrl', e.target.value)} className="w-full bg-slate-950 border border-slate-700 px-2 py-1 text-[9px] text-emerald-400 font-mono outline-none" />
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
              </div>

              {/* ... Safety & Map ... */}
              <div className="flex flex-col xl:flex-row gap-4">
                  <div className="flex flex-col gap-4 xl:w-[350px] shrink-0">
                      <div className="bg-slate-900/20 border border-slate-800 p-4 rounded-sm">
                        <h4 className="text-[11px] font-bold text-rose-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider">
                            <AlertTriangle className="w-3.5 h-3.5" /> Safety Limits
                        </h4>
                        <div className="space-y-3">
                            {renderThresholdInputs("Temp", 'minTemperature', 'maxTemperature')}
                            {renderThresholdInputs("Altitude", 'minAltitude', 'maxAltitude')}
                            {renderThresholdInputs("Pressure", 'minPressure', 'maxPressure')}
                            {renderThresholdInputs("Speed H", 'minSpeed', 'maxSpeed')}
                            {renderThresholdInputs("Speed V", 'minVerticalSpeed', 'maxVerticalSpeed')}
                            {renderThresholdInputs("Density", 'minDensity', 'maxDensity')}
                            {renderThresholdInputs("G-Force", 'minGForce', 'maxGForce')}
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] font-bold font-tech uppercase text-slate-400 w-16">Max Q</label>
                                <div className="flex-1">
                                    <div className="relative">
                                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 font-bold">MAX</span>
                                        <input 
                                            type="number"
                                            step="any"
                                            value={settings.thresholds.maxDynamicPressure} 
                                            onChange={(e) => handleThresholdChange('maxDynamicPressure', e.target.value)}
                                            className="w-full bg-slate-900 border-b border-slate-700 pl-8 pr-2 py-1 text-xs font-mono text-rose-400 focus:border-rose-500 outline-none transition-colors" 
                                            title="Set maximum dynamic pressure (Max Q) threshold in kPa"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/20 border border-slate-800 p-4 rounded-sm">
                         <h4 className="text-[11px] font-bold text-cyan-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider">
                            <Globe className="w-3.5 h-3.5" /> Map Provider
                         </h4>
                         {/* ... Map Provider Inputs ... */}
                         <div className="space-y-3">
                            <select 
                                value={settings.graphics.mapProvider}
                                onChange={(e) => handleGraphicsChange('mapProvider', e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-sm px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-500 transition-colors font-mono"
                            >
                                <option value="local">Localhost (Offline)</option>
                                <option value="osm">OpenStreetMap</option>
                                <option value="carto">CartoDB Dark</option>
                            </select>
                            
                            {settings.graphics.mapProvider === 'local' && (
                                <div className="flex items-center gap-0">
                                     <div className="bg-slate-950 border border-r-0 border-slate-700 rounded-l-sm px-2 py-1.5 text-[10px] text-slate-500 font-mono">
                                        http://localhost:
                                     </div>
                                     <input 
                                        type="number" 
                                        value={settings.graphics.localMapPort || 8000}
                                        onChange={(e) => handleGraphicsChange('localMapPort', parseInt(e.target.value))}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-r-sm px-2 py-1.5 text-xs text-white font-mono outline-none focus:border-cyan-500"
                                     />
                                </div>
                            )}

                            <div className="pt-2 border-t border-slate-800">
                                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex justify-between">
                                    <span>Zoom Sensitivity</span>
                                    <span className="text-cyan-400 font-mono">{(settings.zoomSensitivity * 1000).toFixed(0)}</span>
                                </label>
                                <input 
                                type="range" 
                                min="1" 
                                max="10" 
                                step="0.5"
                                value={settings.zoomSensitivity * 1000}
                                onChange={(e) => handleZoomChange(Number(e.target.value) / 1000)}
                                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                />
                            </div>
                            
                            <div className="pt-2 border-t border-slate-800">
                                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-2">Vehicle Icon</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {renderVehicleIconOption('arrow', 'Arrow', Navigation)}
                                    {renderVehicleIconOption('rocket', 'Rocket', Rocket)}
                                    {renderVehicleIconOption('plane', 'Plane', Plane)}
                                    {renderVehicleIconOption('drone', 'Drone', Target)}
                                    {renderVehicleIconOption('helicopter', 'Heli', Fan)}
                                    {renderVehicleIconOption('car', 'Rover', Car)}
                                    {renderVehicleIconOption('ship', 'Ship', Ship)}
                                </div>
                            </div>
                         </div>
                      </div>
                  </div>

                  {/* ... CSV Parser ... */}
                  <div className="flex flex-col flex-1 bg-slate-900/20 border border-slate-800 p-4 rounded-sm min-h-[300px]">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-[11px] font-bold text-emerald-400 uppercase flex items-center gap-2 font-tech tracking-wider">
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Data Parser (CSV Map)
                        </h4>
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Separator</label>
                            <select 
                                value={settings.separator || ','}
                                onChange={handleSeparatorChange}
                                className="bg-slate-950 border border-slate-700 rounded-sm px-2 py-1 text-[10px] text-white outline-none focus:border-emerald-500 font-mono"
                            >
                                <option value=",">Comma (,)</option>
                                <option value=";">Semi (;)</option>
                                <option value=":">Colon (:)</option>
                                <option value="|">Pipe (|)</option>
                                <option value="\t">Tab</option>
                                <option value=" ">Space</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 bg-black/40 p-2 border border-slate-800 overflow-y-auto custom-scrollbar shadow-inner mb-4">
                        {localItems.map((item, index) => (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, item.id)}
                            onDragOver={(e) => onDragOver(e, item.id)}
                            onDragEnd={onDragEnd}
                            className={`flex items-center gap-2 p-2 mb-1 border-l-2 text-xs font-mono cursor-move select-none transition-all group ${
                              draggedItemId === item.id
                                ? 'bg-indigo-900/40 border-indigo-500 text-indigo-200 opacity-50' 
                                : item.field === SKIP_FIELD 
                                  ? 'bg-slate-900/30 border-slate-700 border-dashed text-slate-500'
                                  : 'bg-slate-900/80 border-slate-600 text-slate-300 hover:bg-slate-800 hover:border-emerald-500 hover:text-white'
                            }`}
                          >
                            <span className="text-slate-600 font-bold w-6 text-[10px] text-center font-space">{index}</span>
                            <GripVertical className="w-3 h-3 text-slate-600" />
                            {item.field === SKIP_FIELD ? (
                                <span className="italic text-slate-500">SKIP_INDEX</span>
                            ) : (
                                <span className="font-bold text-emerald-400">{FIELD_LABELS[item.field]}</span>
                            )}
                            <button 
                              onClick={() => removeField(item.id)}
                              className="ml-auto p-1 text-slate-600 hover:text-rose-400 hover:bg-rose-950 rounded transition-colors"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                    </div>

                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <button onClick={handleAddAll} disabled={availableFields.length === 0} className="flex-1 py-2 bg-slate-900 hover:bg-indigo-900/30 text-indigo-300 border border-slate-800 rounded-sm text-[10px] font-bold uppercase transition-colors disabled:opacity-50 tracking-wider">Add All</button>
                            <button onClick={handleRemoveAll} disabled={localItems.length === 0} className="flex-1 py-2 bg-slate-900 hover:bg-rose-900/30 text-rose-300 border border-slate-800 rounded-sm text-[10px] font-bold uppercase transition-colors disabled:opacity-50 tracking-wider">Clear</button>
                        </div>
                        <div className="border-t border-slate-800 pt-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Available Fields</span>
                            <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto custom-scrollbar">
                                {availableFields.map(field => (
                                    <button
                                      key={field}
                                      onClick={() => addField(field)}
                                      className="px-2 py-1 bg-slate-950 hover:bg-emerald-900/30 border border-slate-800 hover:border-emerald-500/50 text-[10px] text-slate-400 hover:text-emerald-300 rounded-sm transition-colors font-mono"
                                    >
                                        + {FIELD_LABELS[field]}
                                    </button>
                                ))}
                                <button onClick={() => addField(SKIP_FIELD)} className="px-2 py-1 bg-slate-950 border border-dashed border-slate-700 text-[10px] text-slate-500 rounded-sm hover:text-white font-mono">+ SKIP</button>
                            </div>
                        </div>
                    </div>
                  </div>
              </div>

              <div>
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-[0.2em] border-b border-indigo-900/30 pb-2 mb-4 flex items-center gap-2 font-space">
                      <Gamepad2 className="w-4 h-4" /> Local Simulation Scenarios
                  </h3>
                  
                  {/* ... Preset Buttons (Preserved) ... */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                      {renderSimOption(
                          SimulationPreset.MANUAL_ROCKET_INPUT, 
                          "Manual Input Rocket", 
                          <Settings2 className="w-4 h-4" />,
                          "Custom physics based on your Thrust, Mass, and Location."
                      )}
                      {/* ... other presets ... */}
                      {renderSimOption(
                          SimulationPreset.ROCKET_LAUNCH, 
                          "Rocket Launch (Demo)", 
                          <Rocket className="w-4 h-4" />,
                          "Standard demo profile."
                      )}
                      {renderSimOption(
                          SimulationPreset.AERIAL_MANEUVERS, 
                          "Aerial Maneuvers", 
                          <Plane className="w-4 h-4" />,
                          "High-G turns and dives."
                      )}
                      {renderSimOption(
                          SimulationPreset.UNSTABLE_DESCENT, 
                          "Unstable Tumble", 
                          <RotateCcw className="w-4 h-4" />,
                          "Chaotic freefall simulation."
                      )}
                      {renderSimOption(
                          SimulationPreset.EMERGENCY_LANDING, 
                          "Emergency Landing", 
                          <AlertTriangle className="w-4 h-4" />,
                          "Engine failure simulation."
                      )}
                      {renderSimOption(
                          SimulationPreset.STALL_RECOVERY, 
                          "Stall Recovery", 
                          <Activity className="w-4 h-4" />,
                          "Critical angle recovery."
                      )}
                      {renderSimOption(
                          SimulationPreset.GPS_NAV_TEST, 
                          "GPS Navigation", 
                          <Globe className="w-4 h-4" />,
                          "Waypoint following pattern."
                      )}
                  </div>

                  {/* AETHER: Conditional Manual Rocket Config Form */}
                  {settings.simPreset === SimulationPreset.MANUAL_ROCKET_INPUT && (
                      <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-sm animate-in fade-in slide-in-from-top-2">
                          <h4 className="text-[11px] font-bold text-indigo-400 uppercase mb-3 flex items-center gap-2 font-tech tracking-wider">
                              <Rocket className="w-3.5 h-3.5" /> Rocket Parameters
                          </h4>
                          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                              
                              {/* Re-ordered: Rocket Length is now PRIMARY */}
                              <div className="lg:col-span-3 border-b border-indigo-500/30 pb-3 mb-1 grid grid-cols-4 gap-4">
                                  <div>
                                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1"><Ruler className="w-3 h-3 text-cyan-400"/> Total Length (m)</label>
                                      <input type="number" step="0.01" value={settings.simulation.rocketParams.rocketLength} onChange={(e) => updateRocketParam('rocketLength', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-cyan-500/50 px-2 py-1 text-[10px] text-cyan-300 font-mono outline-none" title="Total length of the rocket (Nosecone Tip to Tail)" />
                                  </div>
                                  <div>
                                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1"><Circle className="w-3 h-3"/> Diameter (m)</label>
                                      <input type="number" step="0.01" value={settings.simulation.rocketParams.diameter} onChange={(e) => updateRocketParam('diameter', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-indigo-500/50 px-2 py-1 text-[10px] text-white font-mono outline-none" />
                                  </div>
                                  <div>
                                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1"><MoveVertical className="w-3 h-3"/> C.G. (from Nose)</label>
                                      <input type="number" step="0.01" value={settings.simulation.rocketParams.centerOfMass} onChange={(e) => updateRocketParam('centerOfMass', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-emerald-500/50 px-2 py-1 text-[10px] text-emerald-300 font-mono outline-none" title="Center of Gravity measured from nose cone tip (0)" />
                                  </div>
                                  <div>
                                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1"><MoveVertical className="w-3 h-3"/> C.P. (from Nose)</label>
                                      <input type="number" step="0.01" value={settings.simulation.rocketParams.centerOfPressure} onChange={(e) => updateRocketParam('centerOfPressure', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-rose-500/50 px-2 py-1 text-[10px] text-rose-300 font-mono outline-none" title="Center of Pressure measured from nose cone tip (0)" />
                                  </div>
                              </div>

                              {/* NEW: LAUNCH CONFIGURATION */}
                              <div className="lg:col-span-3 border-b border-indigo-500/30 pb-3 mb-1 grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1"><RotateCcw className="w-3 h-3 text-amber-400"/> Launch Pitch (°)</label>
                                      <input type="number" min="0" max="90" step="1" value={settings.simulation.rocketParams.launchAngle || 90} onChange={(e) => updateRocketParam('launchAngle', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-amber-500/50 px-2 py-1 text-[10px] text-amber-300 font-mono outline-none" title="Launch Angle from Horizon (90 = Vertical)" />
                                  </div>
                                  <div>
                                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1"><Navigation className="w-3 h-3 text-amber-400"/> Launch Heading (°)</label>
                                      <input type="number" min="0" max="360" step="1" value={settings.simulation.rocketParams.launchDirection || 0} onChange={(e) => updateRocketParam('launchDirection', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-amber-500/50 px-2 py-1 text-[10px] text-amber-300 font-mono outline-none" title="Compass Heading (0 = North, 90 = East)" />
                                  </div>
                              </div>

                              {/* Standard Motor Params */}
                              <div>
                                  <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Burn Duration (s)</label>
                                  <input type="number" step="0.1" value={settings.simulation.rocketParams.motorBurnTime} onChange={(e) => updateRocketParam('motorBurnTime', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-indigo-500/50 px-2 py-1 text-[10px] text-white font-mono outline-none" />
                              </div>
                              <div>
                                  <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Avg Thrust (N)</label>
                                  <input type="number" step="1" value={settings.simulation.rocketParams.averageThrust} onChange={(e) => updateRocketParam('averageThrust', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-indigo-500/50 px-2 py-1 text-[10px] text-white font-mono outline-none" />
                              </div>
                              <div>
                                  <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1"><Flame className="w-3 h-3 text-amber-500"/> Total Impulse (Ns)</label>
                                  <input type="number" step="1" placeholder="Auto" value={settings.simulation.rocketParams.totalImpulse || ''} onChange={(e) => updateRocketParam('totalImpulse', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-indigo-500/50 px-2 py-1 text-[10px] text-amber-400 font-mono outline-none" title="Overrides Burn Time if set" />
                              </div>
                              
                              {/* Mass Properties */}
                              <div>
                                  <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Rocket Dry Mass (kg)</label>
                                  <input type="number" step="0.01" value={settings.simulation.rocketParams.rocketDryMass} onChange={(e) => updateRocketParam('rocketDryMass', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-indigo-500/50 px-2 py-1 text-[10px] text-white font-mono outline-none" />
                              </div>
                              <div>
                                  <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Motor Full (kg)</label>
                                  <input type="number" step="0.01" value={settings.simulation.rocketParams.motorWetMass} onChange={(e) => updateRocketParam('motorWetMass', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-indigo-500/50 px-2 py-1 text-[10px] text-white font-mono outline-none" />
                              </div>
                              <div>
                                  <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Motor Empty (kg)</label>
                                  <input type="number" step="0.01" value={settings.simulation.rocketParams.motorDryMass} onChange={(e) => updateRocketParam('motorDryMass', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-indigo-500/50 px-2 py-1 text-[10px] text-white font-mono outline-none" />
                              </div>

                              {/* Launch Site */}
                              <div className="lg:col-span-3 border-t border-indigo-500/30 pt-3 mt-1 grid grid-cols-2 gap-4">
                                  <div className="mb-2">
                                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Start Lat</label>
                                      <input type="number" step="0.0001" value={settings.simulation.rocketParams.startLatitude} onChange={(e) => updateRocketParam('startLatitude', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-indigo-500/50 px-2 py-1 text-[10px] text-emerald-400 font-mono outline-none" />
                                  </div>
                                  <div>
                                      <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Start Lon</label>
                                      <input type="number" step="0.0001" value={settings.simulation.rocketParams.startLongitude} onChange={(e) => updateRocketParam('startLongitude', parseFloat(e.target.value))} className="w-full bg-slate-950 border-b border-indigo-500/50 px-2 py-1 text-[10px] text-emerald-400 font-mono outline-none" />
                                  </div>
                              </div>
                          </div>
                          
                          {/* Stability Check Display */}
                          <div className="mt-3 flex items-center gap-4 text-[9px] font-mono border-t border-indigo-500/20 pt-2">
                              <span className="text-slate-500">Stability Margin:</span>
                              {(() => {
                                  const cm = settings.simulation.rocketParams.centerOfMass || 0;
                                  const cp = settings.simulation.rocketParams.centerOfPressure || 0;
                                  const dia = settings.simulation.rocketParams.diameter || 0.1;
                                  const margin = (cp - cm) / dia;
                                  const isStable = margin > 1.0;
                                  return (
                                      <span className={isStable ? "text-emerald-400 font-bold" : "text-rose-400 font-bold blink"}>
                                          {margin.toFixed(2)} Cal {isStable ? '(STABLE)' : '(UNSTABLE)'}
                                      </span>
                                  );
                              })()}
                              <span className="text-slate-600 ml-auto">Datum: Nosecone (0)</span>
                          </div>
                      </div>
                  )}
              </div>

          </div>

        </div>
      </div>
      
      <ConfirmModal 
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(prev => ({...prev, isOpen: false}))}
          isDestructive={confirmModal.isDestructive}
          confirmText={confirmModal.confirmText}
      />
    </div>
  );
};
