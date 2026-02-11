import React from 'react';
import { VolumeX, Pause } from 'lucide-react'; 

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  isHigh?: boolean; // Critical Maximum (Red)
  isLow?: boolean;  // Critical Minimum (Orange) - Used for Descent
  
  // AETHER: Status Props
  isHold?: boolean;   // Mission Hold (Now Orange)
  isActive?: boolean; // Data is flowing (Blue/Cyan)
  
  onAcknowledge?: () => void;
  onDoubleClick?: () => void;
  isMuted?: boolean; 
}

export const StatCard: React.FC<StatCardProps> = ({ 
  label, 
  value, 
  unit, 
  isHigh = false, 
  isLow = false,
  isHold = false,
  isActive = false,
  onAcknowledge,
  onDoubleClick,
  isMuted = false
}) => {
  
  // Base Styles: Left border is 2px (accent), others are 1px (default)
  let containerClass = "relative flex flex-col p-3 clip-corner-br transition-all duration-300 backdrop-blur-md border-t border-r border-b border-l-2 select-none ";
  
  let labelClass = "text-[9px] uppercase tracking-widest font-tech opacity-80 mb-1 flex items-center gap-2 ";
  
  let valueClass = "text-xl md:text-2xl font-space font-bold leading-none tracking-wide drop-shadow-md whitespace-nowrap ";
  
  let unitClass = "text-[10px] font-bold font-mono text-slate-500 ml-1";
  let cornerClass = "border-slate-600/30"; 

  const isInteractive = onAcknowledge || onDoubleClick;

  if (isInteractive) {
      containerClass += "cursor-pointer hover:brightness-110 active:scale-95 ";
  }

  // --- STATE STYLING LOGIC ---

  // 1. HOLD STATE -> ORANGE (Amber) - ALWAYS PULSE
  if (isHold) {
      containerClass += "bg-amber-900/60 border-slate-800 border-l-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse ";
      labelClass += "text-amber-400 font-bold ";
      valueClass += "text-amber-100 drop-shadow-[0_0_10px_rgba(245,158,11,0.9)] ";
      unitClass = "text-[10px] font-bold font-mono text-amber-500 ml-1";
      cornerClass = "border-amber-500/80";
  }
  // 2. HIGH CRITICAL -> RED
  else if (isHigh) {
      // Always GLOW (Shadow/Border)
      containerClass += "bg-rose-900/40 border-slate-800 border-l-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] ";
      
      // AETHER FIX: Pulse ONLY when NOT active (Paused/Stopped)
      if (!isActive) containerClass += "animate-pulse "; 
      
      labelClass += "text-rose-400 font-bold ";
      valueClass += "text-white drop-shadow-[0_0_10px_rgba(244,63,94,0.9)] ";
      unitClass = "text-[10px] font-bold font-mono text-rose-500 ml-1";
      cornerClass = "border-rose-500/80";
  }
  // 3. LOW CRITICAL -> ORANGE
  else if (isLow) {
      // Always GLOW
      containerClass += "bg-orange-900/40 border-slate-800 border-l-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)] ";
      
      // AETHER FIX: Pulse ONLY when NOT active (Paused/Stopped)
      if (!isActive) containerClass += "animate-pulse ";

      labelClass += "text-orange-400 font-bold ";
      valueClass += "text-orange-50 drop-shadow-[0_0_10px_rgba(249,115,22,0.9)] ";
      unitClass = "text-[10px] font-bold font-mono text-orange-500 ml-1";
      cornerClass = "border-orange-500/80";
  }
  // 4. ACTIVE -> CYAN
  else if (isActive) {
      containerClass += "bg-cyan-950/30 border-cyan-900/30 border-l-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.25)] ";
      labelClass += "text-cyan-400/90 ";
      valueClass += "text-cyan-50 drop-shadow-[0_0_6px_rgba(6,182,212,0.6)] ";
      unitClass = "text-[10px] font-bold font-mono text-cyan-600 ml-1";
      cornerClass = "border-cyan-500/50";
  }
  // 5. DEFAULT -> SLATE
  else {
      containerClass += "bg-slate-900/40 border-slate-800 border-l-slate-600 ";
      labelClass += "text-slate-400 ";
      valueClass += "text-slate-200 ";
  }

  const handleClick = (e: React.MouseEvent) => {
      if (onAcknowledge) {
          onAcknowledge();
      }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onDoubleClick) onDoubleClick();
  };

  return (
    <div className={containerClass} onClick={handleClick} onDoubleClick={handleDoubleClick} title={isHold ? "Double-click to Reset" : (isHigh ? "Click to Acknowledge" : "Tap to Hold / Dbl-Click Reset")}>
      <div className="flex justify-between items-start">
          <span className={labelClass}>
            {label}
          </span>
          {/* Status Indicators */}
          <div className="flex gap-1">
              {isHold && <Pause className="w-3 h-3 text-amber-500 animate-pulse" />}
              
              {isHigh && isMuted && (
                  <VolumeX className="w-3 h-3 text-white/50 animate-in fade-in" />
              )}
              {isHigh && !isMuted && !isHold && (
                 <span className={`w-2 h-2 rounded-full animate-ping bg-red-500`}></span>
              )}
              {isLow && !isMuted && !isHold && (
                  <span className={`w-2 h-2 rounded-full animate-ping bg-orange-500`}></span>
              )}
          </div>
      </div>
      
      <div className="flex items-baseline gap-1 mt-1">
        <span className={valueClass}>
          {value}
        </span>
        {unit && <span className={unitClass}>{unit}</span>}
      </div>

      <div className={`absolute bottom-0 right-0 w-2 h-2 border-b border-r ${cornerClass}`}></div>
    </div>
  );
};