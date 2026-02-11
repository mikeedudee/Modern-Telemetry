
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { TelemetryPacket, WindSettings, DescentSettings, LandingSettings, TerrainSettings, VehicleIconType } from '../types';
import { 
  Map as MapIcon, Compass, Navigation, Lock, Unlock, Layers, Signal, RotateCcw, 
  Tag, Satellite, Home, Activity, Plus, Minus, ChevronUp, ChevronDown, 
  Crosshair, MapPin, MessageSquare, Wind, LocateFixed, X, Cpu, Info, Move, 
  ArrowUp, ArrowDown, Globe, Anchor, Target, Maximize2, Minimize2
} from 'lucide-react';
import { calculateDistance, calculateTotalDistance, calculateSmoothedSpeed, predictLanding, LandingPrediction, getWindAtAltitude } from '../utils/geo';

interface GPSMapProps {
  history: TelemetryPacket[];
  speedUnit: string;
  zoomSensitivity: number;
  wind: WindSettings;
  descent: DescentSettings;
  landing: LandingSettings;
  terrain: TerrainSettings;
  mapProvider: 'local' | 'osm' | 'carto';
  localMapPort?: number;
  vehicleIcon?: VehicleIconType; 
  onMaximize?: () => void;
  isMaximized?: boolean;
}

type MapSource = 'local' | 'osm' | 'carto';

// AETHER: Wrapped in React.memo to prevent re-renders when unrelated settings (like Voice/Theme) change
export const GPSMap = React.memo<GPSMapProps>(({ 
  history, 
  speedUnit, 
  zoomSensitivity, 
  wind, 
  descent, 
  landing, 
  terrain, 
  mapProvider, 
  localMapPort = 8000,
  vehicleIcon = 'arrow',
  onMaximize,
  isMaximized = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Viewport State
  const [zoom, setZoom] = useState(15); 
  const [manualCenter, setManualCenter] = useState({ lat: 0, lon: 0 }); 
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [showMapTiles, setShowMapTiles] = useState(true); 
  const [showCoordinates, setShowCoordinates] = useState(true); 
  const [showTooltips, setShowTooltips] = useState(false); 
  
  const [signalStrength, setSignalStrength] = useState(0); 
  const [heading, setHeading] = useState(0);
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  // Prediction State
  const [prediction, setPrediction] = useState<LandingPrediction | null>(null);
  
  // AETHER: Throttling Ref to limit Physics Calculations
  const lastPredictionTime = useRef<number>(0);

  // Map Tile Cache
  const tileCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const failedTiles = useRef<Set<string>>(new Set()); 
  const [redrawTrigger, setRedrawTrigger] = useState(0);

  // Mouse Telemetry State
  const [mouseGeo, setMouseGeo] = useState<{lat: number, lon: number, x: number, y: number} | null>(null);
  const [hoveringHome, setHoveringHome] = useState(false);

  const homePosRef = useRef<{x: number, y: number, lat: number, lon: number} | null>(null);

  // Reset failed tiles when source changes
  useEffect(() => {
      failedTiles.current.clear();
      tileCache.current.clear();
      setRedrawTrigger(t => t + 1);
  }, [mapProvider, localMapPort]);

  // Robust Filter for Valid GPS Fixes (ignores 0,0)
  const validHistory = useMemo(() => {
    return history.filter(p => Math.abs(p.latitude) > 0.0001 || Math.abs(p.longitude) > 0.0001);
  }, [history]);

  const hasFix = validHistory.length > 0;

  // Calculate current active wind based on vehicle altitude
  const currentWind = useMemo(() => {
      const currentAlt = validHistory.length > 0 ? validHistory[validHistory.length - 1].relAltitude : 0;
      return getWindAtAltitude(currentAlt, wind);
  }, [validHistory, wind]);

  const isSignalLost = useMemo(() => {
    if (history.length === 0) return false;
    const lastRaw = history[history.length - 1];
    return (Math.abs(lastRaw.latitude) < 0.0001 && Math.abs(lastRaw.longitude) < 0.0001) && validHistory.length > 0;
  }, [history, validHistory]);

  const center = useMemo(() => {
    if (isLocked && validHistory.length > 0) {
        const last = validHistory[validHistory.length - 1];
        if (last) return { lat: last.latitude, lon: last.longitude };
    } else if (manualCenter.lat !== 0 || manualCenter.lon !== 0) {
        return manualCenter;
    } else if (validHistory.length > 0) {
         const first = validHistory[0];
         if (first) return { lat: first.latitude, lon: first.longitude };
    }
    return { lat: 0, lon: 0 };
  }, [isLocked, validHistory, manualCenter]);

  // Derived GPS Speed (Smoothed)
  const gpsDerivedSpeed = useMemo(() => {
      // @ts-ignore
      const speedMs = calculateSmoothedSpeed(validHistory, 12);

      if (speedUnit === 'km/h') return speedMs * 3.6;
      if (speedUnit === 'mph') return speedMs * 2.237;
      if (speedUnit === 'ft/s') return speedMs * 3.281;
      return speedMs;
  }, [validHistory, speedUnit]);

  // --- AETHER: OPTIMIZED PREDICTION TRIGGER ---
  useEffect(() => {
      // 1. Basic Guard Clauses
      if (!hasFix || !landing.showPrediction) {
          setPrediction(null);
          return;
      }

      const now = Date.now();
      
      // 2. THROTTLING LOGIC (Prevent physics engine from eating CPU)
      if (prediction !== null && (now - lastPredictionTime.current < landing.predictionInterval)) {
          return;
      }

      const last = validHistory[validHistory.length - 1];
      if (!last) return; 
      
      // 3. Execute Physics Engine with Full History
      const pred = predictLanding(
          last.latitude, 
          last.longitude, 
          last.relAltitude,
          last.vSpeed, 
          last.hSpeed, 
          last.heading,
          descent,
          wind,
          landing, // Pass full landing settings
          0,
          last.density, // Pass live air density
          validHistory  // Pass history for vector calculation
      );
      
      setPrediction(pred);
      lastPredictionTime.current = now;

  }, [validHistory, wind, descent, landing, hasFix]); 

  useEffect(() => {
      if (!isLocked && hasFix && manualCenter.lat === 0 && manualCenter.lon === 0 && validHistory.length > 0) {
           const last = validHistory[validHistory.length - 1];
           if (last) setManualCenter({ lat: last.latitude, lon: last.longitude });
      }
  }, [isLocked, hasFix, validHistory, manualCenter.lat, manualCenter.lon]);

  useEffect(() => {
    if (!hasFix || isSignalLost) {
        setSignalStrength(0);
        return;
    }
    const interval = setInterval(() => {
      setSignalStrength(Math.floor(Math.random() * 2) + 3); 
    }, 3000);
    return () => clearInterval(interval);
  }, [hasFix, isSignalLost]);

  useEffect(() => {
    if (validHistory.length === 0) return;
    const lastPacket = validHistory[validHistory.length - 1];
    if (!lastPacket) return;

    const targetHeading = lastPacket.heading;
    if (typeof targetHeading === 'number') {
        setHeading(prev => {
            const normalizedPrev = prev % 360;
            let diff = targetHeading - normalizedPrev;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            return prev + diff;
        });
    }
  }, [validHistory]);

  const displayHeading = useMemo(() => {
      return ((heading % 360) + 360) % 360;
  }, [heading]);

  const project = (lat: number, lon: number, zoom: number) => {
    const n = Math.pow(2, zoom);
    const x = n * ((lon + 180) / 360) * 256;
    const latRad = lat * Math.PI / 180;
    const y = n * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2 * 256;
    return { x, y };
  };

  const unproject = (x: number, y: number, zoom: number) => {
    const n = Math.pow(2, zoom);
    const lon = (x / (256 * n)) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / (256 * n))));
    const lat = latRad * 180 / Math.PI;
    return { lat, lon };
  };

  const stats = useMemo(() => {
    if (validHistory.length < 2) return { traveled: 0, fromStart: 0 };
    const traveled = calculateTotalDistance(validHistory);
    const start = validHistory[0];
    const current = validHistory[validHistory.length - 1];
    if (!start || !current) return { traveled: 0, fromStart: 0 };
    const fromStart = calculateDistance(start.latitude, start.longitude, current.latitude, current.longitude);
    return { traveled, fromStart };
  }, [validHistory]);

  const handleWheel = (e: React.WheelEvent) => {
    if (!containerRef.current) return;
    e.stopPropagation();
    e.preventDefault(); 

    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const centerPoint = project(center.lat, center.lon, zoom);
    const offsetX = mx - rect.width / 2;
    const offsetY = my - rect.height / 2;
    const mouseWorldX = centerPoint.x + offsetX;
    const mouseWorldY = centerPoint.y + offsetY;
    const mouseGeoLoc = unproject(mouseWorldX, mouseWorldY, zoom);

    const zoomDelta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.max(2, Math.min(22, zoom + zoomDelta));

    const newMouseWorld = project(mouseGeoLoc.lat, mouseGeoLoc.lon, newZoom);
    const newCenterWorldX = newMouseWorld.x - offsetX;
    const newCenterWorldY = newMouseWorld.y - offsetY;
    const newCenterGeo = unproject(newCenterWorldX, newCenterWorldY, newZoom);

    setZoom(newZoom);
    setManualCenter({ lat: newCenterGeo.lat, lon: newCenterGeo.lon });
    setIsLocked(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
    setIsLocked(false);
    setManualCenter(center);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isDragging) {
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;
        const n = Math.pow(2, zoom);
        const degPerPixelX = 360 / (256 * n);
        const degPerPixelY = 360 / (256 * n) * Math.cos(center.lat * Math.PI/180);
        setManualCenter(prev => ({
            lon: prev.lon - dx * degPerPixelX,
            lat: prev.lat + dy * degPerPixelY
        }));
        setLastMousePos({ x: e.clientX, y: e.clientY });
    }

    const centerPoint = project(center.lat, center.lon, zoom);
    const projectedX = mx - rect.width/2 + centerPoint.x;
    const projectedY = my - rect.height/2 + centerPoint.y;
    
    const geo = unproject(projectedX, projectedY, zoom);
    setMouseGeo({ lat: geo.lat, lon: geo.lon, x: mx, y: my });

    if (homePosRef.current) {
       const dist = Math.sqrt(Math.pow(mx - homePosRef.current.x, 2) + Math.pow(my - homePosRef.current.y, 2));
       setHoveringHome(dist < 20); 
    } else {
       setHoveringHome(false);
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const getTileUrl = (x: number, y: number, z: number, source: MapSource) => {
      switch(source) {
          case 'local': return `http://localhost:${localMapPort}/${z}/${x}/${y}.png`;
          case 'osm': return `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`;
          case 'carto': return `https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/${z}/${x}/${y}.png`;
          default: return '';
      }
  };

  // --- DRAWING EFFECT ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = isMaximized ? '#020617' : '#0f172a';
    ctx.fillRect(0,0, canvas.width, canvas.height);

    drawGrid(ctx, canvas.width, canvas.height, 50, '#1e293b');

    const centerPoint = project(center.lat, center.lon, zoom);
    
    if (showMapTiles) {
       const intZoom = Math.floor(zoom);
       const scale = Math.pow(2, zoom - intZoom);
       const tileSize = 256 * scale;
       const centerTileX = (center.lon + 180) / 360 * Math.pow(2, intZoom);
       const latRad = center.lat * Math.PI / 180;
       const centerTileY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, intZoom);
       const numTilesX = Math.ceil(canvas.width / tileSize) + 2;
       const numTilesY = Math.ceil(canvas.height / tileSize) + 2;
       const startTileX = Math.floor(centerTileX - numTilesX/2);
       const startTileY = Math.floor(centerTileY - numTilesY/2);

       for (let x = startTileX; x < startTileX + numTilesX; x++) {
         for (let y = startTileY; y < startTileY + numTilesY; y++) {
             const wrappedX = ((x % Math.pow(2, intZoom)) + Math.pow(2, intZoom)) % Math.pow(2, intZoom);
             if (y >= 0 && y < Math.pow(2, intZoom)) {
                 const tileKey = `${mapProvider}-${intZoom}-${wrappedX}-${y}`;
                 const destX = (canvas.width/2) + (x - centerTileX) * tileSize;
                 const destY = (canvas.height/2) + (y - centerTileY) * tileSize;

                 if (failedTiles.current.has(tileKey)) continue;

                 let img = tileCache.current.get(tileKey);
                 if (!img) {
                     if (tileCache.current.size > 150) {
                         const firstKey = tileCache.current.keys().next().value;
                         if (firstKey) tileCache.current.delete(firstKey);
                     }
                     
                     img = new Image();
                     img.crossOrigin = "Anonymous";
                     img.src = getTileUrl(wrappedX, y, intZoom, mapProvider);
                     
                     img.onload = () => {
                         setRedrawTrigger(t => t + 1);
                     };
                     
                     img.onerror = () => {
                         failedTiles.current.add(tileKey); 
                         tileCache.current.delete(tileKey); 
                     };

                     tileCache.current.set(tileKey, img);
                 }

                 if (img.complete && img.naturalWidth > 0) {
                     ctx.save();
                     if (mapProvider !== 'carto') {
                        ctx.filter = 'invert(1) grayscale(1) brightness(1.5) sepia(1) hue-rotate(140deg) saturate(4) contrast(1.1)';
                     }
                     ctx.drawImage(img, destX, destY, tileSize, tileSize);
                     ctx.restore();
                 }
             }
         }
       }
    }

    const toScreen = (lat: number, lon: number) => {
        const p = project(lat, lon, zoom);
        return {
            x: (p.x - centerPoint.x) + canvas.width/2,
            y: (p.y - centerPoint.y) + canvas.height/2
        };
    };

    const latRad = center.lat * Math.PI / 180;
    const metersPerPixel = (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);

    if (validHistory.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = showMapTiles ? '#f43f5e' : '#10b981'; 
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = showMapTiles ? '#f43f5e' : '#10b981';
        ctx.shadowBlur = 10;
        
        const p0 = validHistory[0];
        if (p0) {
            const start = toScreen(p0.latitude, p0.longitude);
            ctx.moveTo(start.x, start.y);
            let lastScreenX = start.x;
            let lastScreenY = start.y;
            for (let i = 1; i < validHistory.length; i++) {
              const ptRaw = validHistory[i];
              if (!ptRaw) continue;
              const pt = toScreen(ptRaw.latitude, ptRaw.longitude);
              // Optimization: Only draw if moved more than 2 pixels
              const dist = Math.abs(pt.x - lastScreenX) + Math.abs(pt.y - lastScreenY);
              if (dist > 2 || i === validHistory.length - 1) {
                  ctx.lineTo(pt.x, pt.y);
                  lastScreenX = pt.x;
                  lastScreenY = pt.y;
              }
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    if (validHistory.length > 0) {
      const startNode = validHistory[0];
      if (startNode) {
          const startPos = toScreen(startNode.latitude, startNode.longitude);
          homePosRef.current = { ...startPos, lat: startNode.latitude, lon: startNode.longitude };
          
          ctx.save();
          ctx.translate(startPos.x, startPos.y);
          ctx.shadowColor = 'black';
          ctx.shadowBlur = 5;
          
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fillStyle = hoveringHome ? '#10b981' : '#059669'; 
          ctx.fill();
          ctx.strokeStyle = '#ecfdf5';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = 'white';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('H', 0, 1);
          
          ctx.restore();
      }
    }

    if (prediction && landing.showPrediction && validHistory.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = '#06b6d4'; 
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); 
        
        const lastNode = validHistory[validHistory.length - 1];
        if (lastNode) {
            const dronePos = toScreen(lastNode.latitude, lastNode.longitude);
            ctx.moveTo(dronePos.x, dronePos.y);
            
            prediction.path.forEach(p => {
                const screenP = toScreen(p.lat, p.lon);
                ctx.lineTo(screenP.x, screenP.y);
            });
            ctx.stroke();
            ctx.setLineDash([]); 

            const impactPos = toScreen(prediction.lat, prediction.lon);
            const radiusPx = prediction.confidenceRadius / metersPerPixel;

            ctx.save();
            ctx.translate(impactPos.x, impactPos.y);

            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusPx);
            gradient.addColorStop(0, 'rgba(244, 63, 94, 0.4)'); 
            gradient.addColorStop(1, 'rgba(244, 63, 94, 0)');   
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
            ctx.stroke();

            drawLandingIcon(ctx, 0, 0, landing.indicatorShape);
            
            ctx.fillStyle = '#f43f5e';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`ETA: ${prediction.timeToImpact.toFixed(0)}s`, 0, -radiusPx - 5);
            
            ctx.restore();
        }
    }

    // --- DRAW VEHICLE ICON ---
    if (validHistory.length > 0) {
        const lastNode = validHistory[validHistory.length - 1];
        if (lastNode) {
            const dronePos = toScreen(lastNode.latitude, lastNode.longitude);
            
            ctx.save();
            ctx.translate(dronePos.x, dronePos.y);
            ctx.rotate(heading * Math.PI / 180);
            
            // Draw Specific Icon Shape based on Prop
            drawVehicle(ctx, vehicleIcon);

            ctx.restore();

            if (showCoordinates) {
                 ctx.save();
                 const boxOffset = 20;
                 const boxW = 105;
                 const boxH = 32;
                 const x = dronePos.x + boxOffset;
                 const y = dronePos.y - boxH / 2;

                 ctx.beginPath();
                 ctx.moveTo(dronePos.x + 10, dronePos.y);
                 ctx.lineTo(x, dronePos.y);
                 ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
                 ctx.lineWidth = 1;
                 ctx.stroke();

                 ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                 ctx.strokeStyle = 'rgba(51, 65, 85, 1)';
                 ctx.lineWidth = 1;
                 
                 if (ctx.roundRect) {
                     ctx.beginPath();
                     ctx.roundRect(x, y, boxW, boxH, 4);
                     ctx.fill();
                     ctx.stroke();
                 } else {
                     ctx.fillRect(x, y, boxW, boxH);
                     ctx.strokeRect(x, y, boxW, boxH);
                 }

                 ctx.fillStyle = '#06b6d4';
                 ctx.fillRect(x, y + 6, 2, boxH - 12);

                 ctx.font = 'bold 9px monospace';
                 ctx.textAlign = 'left';
                 ctx.textBaseline = 'middle';
                 
                 ctx.fillStyle = '#64748b'; 
                 ctx.fillText('LAT', x + 8, y + 8);
                 ctx.fillStyle = '#e2e8f0'; 
                 ctx.fillText(lastNode.latitude.toFixed(6), x + 30, y + 8);

                 ctx.fillStyle = '#64748b'; 
                 ctx.fillText('LON', x + 8, y + 24);
                 ctx.fillStyle = '#e2e8f0'; 
                 ctx.fillText(lastNode.longitude.toFixed(6), x + 30, y + 24);

                 ctx.restore();
            }
        }
    }

    if (isHovering && mouseGeo) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(mouseGeo.x, 0);
        ctx.lineTo(mouseGeo.x, canvas.height);
        ctx.moveTo(0, mouseGeo.y);
        ctx.lineTo(canvas.width, mouseGeo.y);
        ctx.stroke();
        ctx.restore();
    }

  }, [validHistory, zoom, center, showMapTiles, showCoordinates, showTooltips, heading, isHovering, mouseGeo, hoveringHome, canvasRef.current?.width, prediction, landing, hasFix, redrawTrigger, mapProvider, isLocked, localMapPort, vehicleIcon, isMaximized]);

  const drawVehicle = (ctx: CanvasRenderingContext2D, type: string) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#0f172a'; // Outline color for contrast
      ctx.lineWidth = 1;
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 8;

      ctx.beginPath();

      // All shapes drawn facing -Y (Up)
      switch (type) {
          case 'rocket':
              // Cylinder Body
              ctx.ellipse(0, 0, 4, 12, 0, 0, Math.PI * 2);
              // Nose Cone
              ctx.moveTo(-4, -5); 
              ctx.quadraticCurveTo(0, -18, 4, -5);
              // Fins
              ctx.moveTo(-4, 8); ctx.lineTo(-10, 14); ctx.lineTo(-4, 12);
              ctx.moveTo(4, 8); ctx.lineTo(10, 14); ctx.lineTo(4, 12);
              break;

          case 'plane':
              // Fuselage
              ctx.moveTo(0, -14);
              ctx.lineTo(3, -5); ctx.lineTo(3, 8); ctx.lineTo(0, 14); ctx.lineTo(-3, 8); ctx.lineTo(-3, -5);
              // Main Wings
              ctx.moveTo(0, -4); ctx.lineTo(14, 2); ctx.lineTo(14, 6); ctx.lineTo(0, 2);
              ctx.moveTo(0, -4); ctx.lineTo(-14, 2); ctx.lineTo(-14, 6); ctx.lineTo(0, 2);
              // Tail
              ctx.moveTo(0, 8); ctx.lineTo(6, 12); ctx.lineTo(0, 12);
              ctx.moveTo(0, 8); ctx.lineTo(-6, 12); ctx.lineTo(0, 12);
              break;

          case 'drone':
              // X Frame
              ctx.moveTo(-8, -8); ctx.lineTo(8, 8);
              ctx.moveTo(8, -8); ctx.lineTo(-8, 8);
              // Motors (Circles)
              ctx.moveTo(-8 + 3, -8); ctx.arc(-8, -8, 3, 0, Math.PI*2);
              ctx.moveTo(8 + 3, -8); ctx.arc(8, -8, 3, 0, Math.PI*2);
              ctx.moveTo(-8 + 3, 8); ctx.arc(-8, 8, 3, 0, Math.PI*2);
              ctx.moveTo(8 + 3, 8); ctx.arc(8, 8, 3, 0, Math.PI*2);
              // Center indicator
              ctx.moveTo(3, 0); ctx.arc(0, 0, 3, 0, Math.PI*2);
              break;

          case 'helicopter':
              // Body Bubble
              ctx.ellipse(0, 2, 5, 8, 0, 0, Math.PI * 2);
              // Tail Boom
              ctx.moveTo(0, 8); ctx.lineTo(0, 16);
              // Tail Rotor
              ctx.moveTo(-3, 16); ctx.lineTo(3, 16);
              // Main Rotor Blades
              ctx.moveTo(0, 2); ctx.lineTo(16, 4); // Blade 1
              ctx.moveTo(0, 2); ctx.lineTo(-16, 0); // Blade 2
              break;

          case 'car':
              // Rounded Rect Body
              if (ctx.roundRect) {
                  ctx.roundRect(-6, -10, 12, 20, 2);
              } else {
                  ctx.rect(-6, -10, 12, 20);
              }
              // Windshield
              ctx.moveTo(-5, -4); ctx.lineTo(5, -4);
              // Headlights
              ctx.moveTo(-4, -10); ctx.lineTo(-4, -8);
              ctx.moveTo(4, -10); ctx.lineTo(4, -8);
              break;
          
          case 'ship':
              // Pointed Bow
              ctx.moveTo(0, -14); 
              ctx.quadraticCurveTo(6, -6, 6, 8); // Starboard side
              ctx.lineTo(-6, 8); // Stern
              ctx.quadraticCurveTo(-6, -6, 0, -14); // Port side
              break;

          default: // 'arrow'
              ctx.moveTo(0, -12);
              ctx.lineTo(9, 9);
              ctx.lineTo(0, 5);
              ctx.lineTo(-9, 9);
              break;
      }
      
      ctx.closePath();
      ctx.fill();
      ctx.stroke(); // Draw outline
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number, step: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let x=0; x<w; x+=step) { ctx.moveTo(x,0); ctx.lineTo(x, h); }
      for(let y=0; y<h; y+=step) { ctx.moveTo(0,y); ctx.lineTo(w, y); }
      ctx.stroke();
  };

  const drawLandingIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, shape: string) => {
      ctx.strokeStyle = '#f43f5e'; 
      ctx.lineWidth = 2;
      ctx.beginPath();
      const s = 8; 
      
      switch (shape) {
          case 'crosshair':
              ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
              ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
              ctx.arc(x, y, s/2, 0, Math.PI * 2);
              break;
          case 'x':
              ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
              ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
              break;
          case 'square':
              ctx.rect(x - s/2, y - s/2, s, s);
              break;
          case 'triangle':
              ctx.moveTo(x, y - s);
              ctx.lineTo(x + s, y + s);
              ctx.lineTo(x - s, y + s);
              ctx.closePath();
              break;
          default: // circle
              ctx.arc(x, y, s, 0, Math.PI * 2);
      }
      ctx.stroke();
  };

  return (
    <div 
      ref={containerRef}
      className={`flex-1 ${isMaximized ? 'bg-transparent border-none' : 'bg-slate-900/50 border border-slate-800'} rounded-xl p-0 relative flex flex-col overflow-hidden h-full w-full shadow-lg group touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { handleMouseUp(); setIsHovering(false); setHoveringHome(false); }}
      onMouseEnter={() => setIsHovering(true)}
      onWheel={handleWheel}
      title="Interactive GPS Map. Drag to pan, scroll to zoom. Double-click to reset."
    >
      {/* ... Content ... */}
      <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start z-10 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        {/* ... Header ... */}
        <h3 className={`text-slate-300 font-bold uppercase flex items-center gap-2 drop-shadow-md ${isMaximized ? 'text-lg' : 'text-sm'}`}>
          <MapIcon className={`${isMaximized ? 'w-5 h-5' : 'w-4 h-4'} text-cyan-400`} /> GPS Track
        </h3>
        <div className="flex flex-col items-end gap-2">
          {/* ... Signal Bars ... */}
          <div className="flex gap-1 items-end">
             <Signal className={`w-3 h-3 ${signalStrength > 0 ? 'text-emerald-400' : 'text-slate-600'}`} />
             <div className="flex gap-[2px] items-end h-3">
                <div className={`w-1 rounded-sm ${signalStrength >= 1 ? 'h-1.5 bg-emerald-400' : 'h-1.5 bg-slate-700'}`}></div>
                <div className={`w-1 rounded-sm ${signalStrength >= 2 ? 'h-2 bg-emerald-400' : 'h-2 bg-slate-700'}`}></div>
                <div className={`w-1 rounded-sm ${signalStrength >= 3 ? 'h-2.5 bg-emerald-400' : 'h-2.5 bg-slate-700'}`}></div>
                <div className={`w-1 rounded-sm ${signalStrength >= 4 ? 'h-3 bg-emerald-400' : 'h-3 bg-slate-700'}`}></div>
             </div>
          </div>
          <span className="text-[9px] text-slate-400 font-mono mt-0.5 shadow-black drop-shadow-md">{hasFix && !isSignalLost ? 'GPS FIX' : 'NO SIGNAL'}</span>
        </div>
      </div>
      
      {!hasFix && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="relative">
               <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-ping"></div>
               <Satellite className="w-12 h-12 text-slate-700 relative z-10" />
            </div>
            <span className="mt-4 text-xs font-mono text-slate-500 animate-pulse">WAITING FOR GPS FIX...</span>
            <span className="text-[9px] text-slate-600">(lat/lon are 0,0)</span>
        </div>
      )}

      {/* CONTROLS (Top Left) - Always Visible */}
      <div 
        className="absolute top-12 left-3 z-20 flex flex-col gap-1 pointer-events-auto bg-black/60 backdrop-blur rounded-lg border border-slate-800 p-1 shadow-xl scale-90 origin-top-left"
        onMouseDown={(e) => e.stopPropagation()} 
      >
          {/* ... Controls ... */}
          <button onClick={() => setZoom(z => Math.min(22, z + 1))} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white" title="Zoom In"><Plus className="w-4 h-4"/></button>
          <button onClick={() => setZoom(z => Math.max(2, z - 1))} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white" title="Zoom Out"><Minus className="w-4 h-4"/></button>
          <div className="h-px bg-slate-700 my-0.5 mx-1"></div>
          
          <button onClick={() => { setIsLocked(!isLocked); setManualCenter(center); }} className={`p-1.5 rounded hover:bg-slate-700 ${isLocked ? 'text-emerald-400' : 'text-slate-400'}`} title={isLocked ? "Unlock Map (Free Pan)" : "Lock to Drone Position"} >
              {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
          <button onClick={() => { setZoom(15); setIsLocked(true); }} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white" title="Reset View to Drone"><RotateCcw className="w-4 h-4"/></button>
          <div className="h-px bg-slate-700 my-0.5 mx-1"></div>
          <button onClick={() => setShowMapTiles(!showMapTiles)} className={`p-1.5 rounded hover:bg-slate-700 ${showMapTiles ? 'text-indigo-400' : 'text-slate-400'}`} title="Toggle Satellite Tiles"><Layers className="w-4 h-4"/></button>
          <button onClick={() => setShowCoordinates(!showCoordinates)} className={`p-1.5 rounded hover:bg-slate-700 ${showCoordinates ? 'text-cyan-400' : 'text-slate-400'}`} title="Toggle Drone Coordinates"><Tag className="w-4 h-4"/></button>
          <button onClick={() => setShowTooltips(!showTooltips)} className={`p-1.5 rounded hover:bg-slate-700 ${showTooltips ? 'text-amber-400' : 'text-slate-400'}`} title={showTooltips ? "Hide Sensor Info Panel" : "Show Sensor Info Panel"}><Info className="w-4 h-4"/></button>
          
          {/* Maximize Button in Control Stack */}
          {onMaximize && (
              <>
                <div className="h-px bg-slate-700 my-0.5 mx-1"></div>
                <button onClick={onMaximize} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white" title={isMaximized ? "Minimize" : "Maximize"}>
                    {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </>
          )}
      </div>

      {/* COMPASS + WIND INDICATOR */}
      {hasFix && (
          <div className="absolute top-14 right-3 z-20 group cursor-help" title="Compass & Wind Direction (Arrow Color = Speed)">
              <div className="relative w-20 h-20 bg-black/40 backdrop-blur-sm rounded-full border border-slate-700 shadow-xl flex items-center justify-center hover:border-cyan-500/50 transition-colors">
                  <div className="absolute inset-0 rounded-full border border-slate-600/50" />
                  <div className="absolute text-[9px] font-bold text-slate-400 top-1 left-1/2 -translate-x-1/2">N</div>
                  <div className="absolute text-[9px] font-bold text-slate-500 bottom-1 left-1/2 -translate-x-1/2">S</div>
                  <div className="absolute text-[9px] font-bold text-slate-500 left-1 top-1/2 -translate-y-1/2">W</div>
                  <div className="absolute text-[9px] font-bold text-slate-500 right-1 top-1/2 -translate-y-1/2">E</div>
                  
                  <div 
                    className="w-full h-full flex items-center justify-center transition-transform duration-300 ease-out"
                    style={{ transform: `rotate(${heading}deg)` }} 
                  >
                      <Navigation className="w-7 h-7 text-cyan-400 fill-cyan-400/20 -rotate-45 filter drop-shadow-[0_0_2px_rgba(34,211,238,0.5)]" />
                  </div>

                  {/* AETHER: Dynamic Wind Direction Overlay (Supports Gradient Mode) */}
                  {currentWind.speed > 0 && (
                      <div 
                        className="absolute inset-0 flex flex-col items-center justify-start pt-1.5 pointer-events-none"
                        style={{ transform: `rotate(${currentWind.dir}deg)` }}
                      >
                          <div className="flex gap-0.5 opacity-90 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">
                             {/* Arrow Color Mapping based on Speed (Green < 5, Yellow < 10, Red > 10) */}
                             <ArrowDown 
                                className={`w-3 h-3 animate-pulse ${
                                    currentWind.speed < 5 ? 'text-emerald-400' : 
                                    currentWind.speed < 10 ? 'text-amber-400' : 'text-rose-500'
                                }`} 
                             />
                             <ArrowDown 
                                className={`w-3 h-3 animate-pulse delay-75 ${
                                    currentWind.speed < 5 ? 'text-emerald-400' : 
                                    currentWind.speed < 10 ? 'text-amber-400' : 'text-rose-500'
                                }`} 
                             />
                          </div>
                      </div>
                  )}

                  <div className="absolute bottom-[-16px] bg-black/60 px-1.5 py-0.5 rounded text-[9px] font-mono text-cyan-400 border border-slate-800 shadow-sm font-bold">
                      {displayHeading.toFixed(0)}°
                  </div>
              </div>
          </div>
      )}

      {/* SENSOR FUSION INFO PANEL */}
      {hasFix && showTooltips && (
         <div className="absolute top-12 left-16 z-20 bg-black/80 backdrop-blur-md border border-slate-700 rounded-lg p-3 shadow-2xl animate-in fade-in slide-in-from-left-4 pointer-events-none max-w-[200px]">
             {/* ... */}
             <div className="flex items-center gap-2 mb-2 pb-1 border-b border-slate-700">
                 <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                 <span className="text-[10px] font-bold text-indigo-100 uppercase">Sensor Fusion</span>
             </div>
             <div className="space-y-2 text-[10px] text-slate-300 leading-snug">
                 <p><span className="text-emerald-400 font-bold">POS:</span> GNSS/GPS constellation data.</p>
                 <p><span className="text-cyan-400 font-bold">HEADING:</span> IMU fusion.</p>
                 <p><span className="text-amber-400 font-bold">ALT:</span> Baro + GPS.</p>
             </div>
         </div>
      )}

      {/* LEGEND & STATS (Bottom Right) */}
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 z-20 pointer-events-none">
           {/* ... */}
           {hasFix && (
               <div className="pointer-events-auto flex items-end gap-2 mb-1">
                   <div className={`bg-black/60 backdrop-blur border border-slate-700 rounded-lg px-2 py-1.5 shadow-xl flex items-center gap-2 ${currentWind.speed > 8 ? 'animate-pulse border-amber-500/50' : ''}`} title="Wind Conditions at Current Altitude">
                       <Wind className={`w-3 h-3 ${currentWind.speed < 5 ? 'text-cyan-400' : currentWind.speed < 10 ? 'text-amber-400' : 'text-rose-500'}`} />
                       <div className="flex flex-col leading-none">
                           {wind.mode === 'single' ? (
                               <>
                                   <span className="text-[9px] font-bold text-white">{wind.speed} m/s</span>
                                   <span className="text-[8px] font-mono text-slate-400">@{wind.direction}°</span>
                               </>
                           ) : (
                               <>
                                   {/* AETHER: Dynamic Display for Gradient Mode */}
                                   <span className="text-[9px] font-bold text-white">{currentWind.speed.toFixed(1)} m/s</span>
                                   <span className="text-[8px] font-mono text-slate-400">GRADIENT @{currentWind.dir.toFixed(0)}°</span>
                               </>
                           )}
                       </div>
                   </div>
                   {/* ... Legend Dropdown ... */}
                   <div className="flex flex-col items-end">
                        {isLegendOpen && (
                            <div className="bg-black/80 backdrop-blur border border-slate-700 rounded-t-lg p-3 w-32 shadow-xl text-[9px] text-slate-300 space-y-2 animate-in slide-in-from-bottom-2 mb-[-1px] z-10">
                                {/* Legend Items */}
                                <div className="flex items-center justify-between text-[8px] font-bold text-slate-500 uppercase border-b border-slate-800 pb-1 mb-2">Map Legend</div>
                                <div className="flex items-center gap-2"><Tag className="w-3 h-3 text-cyan-400" /><span>Live Telemetry</span></div>
                                <div className="flex items-center gap-2"><div className={`w-4 h-0.5 rounded shadow-sm ${showMapTiles ? 'bg-rose-500' : 'bg-emerald-500'}`}></div><span>Flight Path</span></div>
                                {prediction && landing.showPrediction && <div className="flex items-center gap-2"><div className="w-4 h-0.5 rounded shadow-sm bg-cyan-500/50 border-dashed border-t border-cyan-400"></div><span>Predicted Path</span></div>}
                                <div className="flex items-center gap-2"><div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-white"></div><span>Drone Pos</span></div>
                                <div className="flex items-center gap-2"><Home className="w-3 h-3 text-emerald-500" /><span>Home Point</span></div>
                                {prediction && landing.showPrediction && <div className="flex items-center gap-2"><Target className="w-3 h-3 text-rose-500" /><span className="text-rose-400">Impact Zone</span></div>}
                            </div>
                        )}
                        <button onClick={() => setIsLegendOpen(!isLegendOpen)} className={`flex items-center gap-2 bg-black/60 backdrop-blur border border-slate-700 px-3 py-1.5 ${isLegendOpen ? 'rounded-b-lg border-t-0' : 'rounded-lg'} text-[10px] font-bold text-slate-400 hover:text-white transition-all hover:bg-slate-800 shadow-xl`}>
                            {isLegendOpen ? <ChevronDown className="w-3 h-3"/> : <ChevronUp className="w-3 h-3"/>} LEGEND
                        </button>
                   </div>
               </div>
           )}
           {/* ... Cursor Tooltip & Stats ... */}
           <div className="flex items-end gap-2">
               {/* ... */}
               <div className="flex flex-col gap-1 pointer-events-none">
                 <div className="bg-black/60 backdrop-blur border border-slate-700 rounded px-2 py-1 flex items-center justify-between gap-3 min-w-[120px] shadow-lg">
                     <span className="text-[9px] text-slate-400 uppercase flex items-center gap-1"><Activity className="w-3 h-3" /> GPS Speed</span>
                     <span className="text-xs font-mono text-white font-bold">{gpsDerivedSpeed.toFixed(1)} <span className="text-[9px] font-normal text-slate-500">{speedUnit}</span></span>
                 </div>
                 <div className="bg-black/60 backdrop-blur border border-slate-700 rounded px-2 py-1 flex items-center justify-between gap-3 min-w-[120px] shadow-lg">
                     <span className="text-[9px] text-slate-400 uppercase flex items-center gap-1"><Navigation className="w-3 h-3" /> Range</span>
                     <span className="text-xs font-mono text-cyan-400">{stats.fromStart > 1000 ? (stats.fromStart/1000).toFixed(2) + 'km' : stats.fromStart.toFixed(0) + 'm'}</span>
                 </div>
                 <div className="bg-black/60 backdrop-blur border border-slate-700 rounded px-2 py-1 flex items-center justify-between gap-3 min-w-[120px] shadow-lg">
                     <span className="text-[9px] text-slate-400 uppercase flex items-center gap-1"><Compass className="w-3 h-3" /> Trip</span>
                     <span className="text-xs font-mono text-emerald-400">{stats.traveled > 1000 ? (stats.traveled/1000).toFixed(2) + 'km' : stats.traveled.toFixed(0) + 'm'}</span>
                 </div>
               </div>
           </div>
      </div>

      <div className="flex-1 bg-slate-950 relative w-full h-full">
        <canvas ref={canvasRef} width={containerRef.current?.clientWidth || 400} height={containerRef.current?.clientHeight || 300} className="w-full h-full block"/>
      </div>
    </div>
  );
});
