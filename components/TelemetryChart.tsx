
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend, 
  Filler,
  ChartOptions,
  ScriptableContext,
  ActiveElement
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { TelemetryPacket, GraphConfig, ThresholdSettings } from '../types';
import { LucideIcon, MousePointerClick, Eye, EyeOff, Filter, Baseline, Crosshair, Pin, PinOff, Maximize2, Minimize2 } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface LineConfig {
  key: keyof TelemetryPacket;
  name: string;
  color: string;
  yAxisId?: string;
  dot?: boolean;
  strokeDasharray?: string; // Mapped to borderDash
  strokeWidth?: number;
}

interface TelemetryChartProps {
  title: string;
  icon: LucideIcon;
  data: TelemetryPacket[];
  lines: LineConfig[];
  yAxisConfig?: {
    left?: GraphConfig;
    right?: GraphConfig;
  };
  density?: 'high' | 'medium' | 'low';
  thresholds?: ThresholdSettings;
  unit?: string;
  onMaximize?: () => void;
  isMaximized?: boolean;
}

// --- GRADIENT GENERATOR ---
const createGradient = (context: ScriptableContext<'line'>, color: string) => {
  const ctx = context.chart.ctx;
  const gradient = ctx.createLinearGradient(0, 0, 0, context.chart.height);
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255, 255, 255';
  }
  const rgb = hexToRgb(color);
  gradient.addColorStop(0, `rgba(${rgb}, 0.25)`);
  gradient.addColorStop(1, `rgba(${rgb}, 0.0)`);
  return gradient;
};

// --- CUSTOM PLUGIN: REFERENCE LINES ---
const referenceLinesPlugin = {
  id: 'referenceLines',
  afterDatasetsDraw(chart: any, args: any, options: any) {
    if (!options.enable || !options.lines || options.lines.length === 0) return;
    
    const { ctx, scales } = chart;
    const { left, right, top, bottom } = chart.chartArea;

    ctx.save();
    
    options.lines.forEach((line: any) => {
        const scaleId = line.scaleId || 'left';
        const yScale = scales[scaleId];
        if (!yScale) return;

        const yPos = yScale.getPixelForValue(line.value);
        if (yPos < top || yPos > bottom) return;

        // Draw Line
        ctx.beginPath();
        ctx.strokeStyle = line.color || '#fff';
        ctx.lineWidth = 1;
        ctx.setLineDash(line.dash || [5, 5]);
        ctx.moveTo(left, yPos);
        ctx.lineTo(right, yPos);
        ctx.stroke();

        // Draw Label Background & Text
        if (line.label) {
            ctx.font = 'bold 9px "JetBrains Mono"';
            const textWidth = ctx.measureText(line.label).width;
            const padding = 4;
            const xPos = line.align === 'right' ? right - textWidth - padding * 2 : left;
            
            // Background Box
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fillRect(xPos, yPos - 8, textWidth + padding * 2, 16);
            
            // Text
            ctx.fillStyle = line.color || '#fff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(line.label, xPos + padding, yPos);
        }
    });

    ctx.restore();
  }
};

// --- CUSTOM PLUGIN: CROSSHAIR & MAX MARKER ---
const crosshairPlugin = {
  id: 'crosshairSmart',
  defaults: {
      width: 1,
      color: 'rgba(148, 163, 184, 0.5)',
      dash: [3, 3]
  },
  afterInit: (chart: any) => { chart.crosshair = { x: null, y: null, pinned: false, pinnedIndex: null }; },
  afterEvent: (chart: any, args: any) => {
      if (args.event.type === 'mousemove' && chart.crosshair.pinned) {
          return;
      }
      
      const { inChartArea } = args;
      const { x, y } = args.event;
      
      if (!chart.crosshair.pinned) {
          chart.crosshair.x = x;
          chart.crosshair.y = y;
          chart.crosshair.draw = inChartArea;
      }
      args.changed = true; 
  },
  afterDraw: (chart: any, args: any, options: any) => {
      const { ctx, chartArea: { top, bottom, left, right }, scales } = chart;
      
      const isPinned = options.pinnedState?.isPinned;
      const pinnedIndex = options.pinnedState?.index;

      let drawX = chart.crosshair.x;
      let drawY = chart.crosshair.y;
      let shouldDraw = chart.crosshair.draw;

      if (isPinned && pinnedIndex !== null && pinnedIndex !== undefined) {
          const meta = chart.getDatasetMeta(0);
          if (meta.data[pinnedIndex]) {
             drawX = meta.data[pinnedIndex].x;
             drawY = meta.data[pinnedIndex].y; 
             shouldDraw = true;
          }
      }

      if (!shouldDraw) return;

      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = options.width;
      
      if (isPinned) {
          ctx.strokeStyle = '#22d3ee'; 
          ctx.setLineDash([]); 
          ctx.shadowColor = '#22d3ee';
          ctx.shadowBlur = 5;
      } else {
          ctx.strokeStyle = options.color;
          ctx.setLineDash(options.dash);
          ctx.shadowBlur = 0;
      }

      if (drawY >= top && drawY <= bottom) {
          ctx.moveTo(left, drawY);
          ctx.lineTo(right, drawY);
      }

      let snapX = drawX;
      
      if (!isPinned) {
         const activeElements = chart.tooltip?.dataPoints;
         if (activeElements && activeElements.length > 0) {
            snapX = activeElements[0].element.x;
         }
      }

      if (snapX >= left && snapX <= right) {
          ctx.moveTo(snapX, top);
          ctx.lineTo(snapX, bottom);
      }
      ctx.stroke();

      ctx.font = 'bold 10px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      const yValue = scales.left.getValueForPixel(drawY);
      if (yValue !== undefined) {
          const text = yValue.toFixed(1);
          const textW = ctx.measureText(text).width + 8;
          
          ctx.fillStyle = isPinned ? '#164e63' : '#0f172a'; 
          ctx.fillRect(left - textW, drawY - 8, textW, 16);
          ctx.fillStyle = isPinned ? '#22d3ee' : '#94a3b8'; 
          ctx.fillRect(left - 2, drawY - 8, 2, 16); 
          
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(text, left - textW / 2 - 2, drawY);
      }

      const xValueIndex = scales.x.getValueForPixel(snapX);
      const labels = chart.data.labels;
      
      let labelText = "";
      if (isPinned && pinnedIndex !== null && labels[pinnedIndex]) {
          labelText = `T+ ${labels[pinnedIndex]}s`;
      } else if (labels && xValueIndex >= 0 && xValueIndex < labels.length) {
          labelText = `T+ ${labels[xValueIndex]}s`;
      }

      if (labelText) {
          const textW = ctx.measureText(labelText).width + 10;
          
          ctx.fillStyle = isPinned ? '#164e63' : '#0f172a';
          ctx.fillRect(snapX - textW/2, bottom, textW, 16);
          ctx.fillStyle = isPinned ? '#22d3ee' : '#38bdf8'; 
          ctx.fillRect(snapX - textW/2, bottom, textW, 2); 

          ctx.fillStyle = isPinned ? '#22d3ee' : '#38bdf8';
          ctx.fillText(labelText, snapX, bottom + 8);
      }

      ctx.restore();
  }
};

export const TelemetryChart = React.memo<TelemetryChartProps>(({ 
  title, 
  icon: Icon, 
  data, 
  lines, 
  yAxisConfig,
  density = 'high',
  thresholds,
  unit = '',
  onMaximize,
  isMaximized = false
}) => {
  const chartRef = useRef<any>(null);
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([]);
  const [showRefLines, setShowRefLines] = useState(true);
  
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);

  const [timeWindow, setTimeWindow] = useState<number | null>(null); 
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // --- Statistics Calculation (for Ref Lines) ---
  const stats = useMemo(() => {
    if (data.length === 0) return { apogee: 0, maxTemps: {} as Record<string, number>, maxVal: 0 };

    let maxAlt = -Infinity;
    let globalMax = -Infinity;
    const maxTemps: Record<string, number> = {};

    for (let i = data.length - 1; i >= 0; i--) {
        const d = data[i];
        if (d.relAltitude > maxAlt) maxAlt = d.relAltitude;

        lines.forEach(line => {
            // @ts-ignore
            const val = d[line.key] as number;
            if (val > globalMax) globalMax = val;
            if (line.key === 'temperature' || line.key === 'thermistorTemp') {
                if (!maxTemps[line.key] || val > maxTemps[line.key]) {
                    maxTemps[line.key as string] = val;
                }
            }
        });
    }

    return { apogee: maxAlt, maxTemps, maxVal: globalMax };
  }, [data, lines]);

  // --- Data Sampling (Dynamic for Full History) ---
  const chartData = useMemo(() => {
    let startIndex = 0;
    
    if (timeWindow !== null && data.length > 0) {
      const lastTime = data[data.length - 1].timeElapsed;
      const cutoff = lastTime - (timeWindow * 1000);
      for(let i = data.length - 1; i >= 0; i--) {
          if (data[i].timeElapsed < cutoff) {
              startIndex = i + 1;
              break;
          }
      }
    }

    // Dynamic Step Calculation
    // Target ~600 points max to keep canvas performant while showing full shape
    const MAX_VISIBLE_POINTS = isMaximized ? 2000 : 600;
    const visibleRange = data.length - startIndex;
    const dynamicStep = Math.max(1, Math.ceil(visibleRange / MAX_VISIBLE_POINTS));
    
    const step = Math.max(dynamicStep, density === 'high' ? 1 : (density === 'medium' ? 2 : 5));
    
    const labels: string[] = [];
    const datasets: any[] = [];

    lines.forEach(line => {
        datasets.push({
            label: line.name,
            data: [],
            borderColor: line.color,
            backgroundColor: (context: ScriptableContext<'line'>) => createGradient(context, line.color),
            fill: true,
            borderWidth: isMaximized ? (line.strokeWidth || 2) + 1 : (line.strokeWidth || 2),
            borderDash: line.strokeDasharray ? line.strokeDasharray.split(' ').map(Number) : [],
            yAxisID: line.yAxisId || 'left',
            pointRadius: line.dot ? (isMaximized ? 4 : 3) : 0, 
            pointHoverRadius: isMaximized ? 7 : 5,
            pointBackgroundColor: '#0f172a',
            pointBorderColor: line.color,
            pointBorderWidth: 2,
            tension: 0.35, 
            key: line.key 
        });
    });

    const totalLen = data.length;
    for (let i = startIndex; i < totalLen; i += step) {
        const packet = data[i];
        labels.push((packet.timeElapsed / 1000).toFixed(1));
        
        datasets.forEach((ds, idx) => {
            // @ts-ignore
            ds.data.push(packet[lines[idx].key]);
        });
    }

    return { labels, datasets };
  }, [data, density, timeWindow, lines, isMaximized]);

  // --- Effect: Handle Pinned Tooltip Persistence ---
  useEffect(() => {
      const chart = chartRef.current;
      if (chart && pinnedIndex !== null) {
          const maxIndex = chart.data.labels.length - 1;
          const safeIndex = Math.min(pinnedIndex, maxIndex);
          
          if (safeIndex >= 0) {
            const activeElements: ActiveElement[] = [];
            chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
                if (!chart.isDatasetVisible(datasetIndex)) return;
                const meta = chart.getDatasetMeta(datasetIndex);
                const element = meta.data[safeIndex];
                if (element) {
                    activeElements.push({ datasetIndex, index: safeIndex, element });
                }
            });
            
            if (activeElements.length > 0) {
                chart.tooltip.setActiveElements(activeElements, { x: 0, y: 0 }); 
                chart.update(); 
            }
          }
      }
  }, [pinnedIndex, chartData]);

  // --- Reference Lines Config ---
  const refLinesConfig = useMemo(() => {
      const linesArr = [];
      const hasAltitude = lines.some(l => l.key === 'relAltitude');
      const hasTemperature = lines.some(l => l.key === 'temperature');
      const hasPressure = lines.some(l => l.key === 'pressure');
      const hasSpeed = lines.some(l => l.key === 'hSpeed' || l.key === 'vSpeed');

      if (showRefLines && thresholds) {
          if (hasTemperature) {
              if (thresholds.maxTemperature) linesArr.push({ value: thresholds.maxTemperature, color: '#ef4444', label: `MAX TEMP: ${thresholds.maxTemperature}`, align: 'right', dash: [2, 2] });
              if (thresholds.minTemperature !== undefined) linesArr.push({ value: thresholds.minTemperature, color: '#3b82f6', label: `MIN TEMP: ${thresholds.minTemperature}`, align: 'right', dash: [2, 2] });
          }
          if (hasPressure) {
              if (thresholds.maxPressure) linesArr.push({ value: thresholds.maxPressure, color: '#ef4444', label: `MAX PRESS`, align: 'right', scaleId: 'right' });
              if (thresholds.minPressure) linesArr.push({ value: thresholds.minPressure, color: '#3b82f6', label: `MIN PRESS`, align: 'right', scaleId: 'right' });
          }
          if (hasAltitude) {
              if (thresholds.maxAltitude) linesArr.push({ value: thresholds.maxAltitude, color: '#f97316', label: `CEILING: ${thresholds.maxAltitude}${unit}`, align: 'left', dash: [10, 5] });
              if (thresholds.minAltitude !== undefined) linesArr.push({ value: thresholds.minAltitude, color: '#3b82f6', label: `FLOOR: ${thresholds.minAltitude}${unit}`, align: 'left', dash: [10, 5] });
              
              if (stats.apogee > 5) linesArr.push({ value: stats.apogee, color: '#f43f5e', label: `APOGEE: ${stats.apogee.toFixed(1)}${unit}`, align: 'left', dash: [5, 2] });
          }
          if (hasSpeed) {
              if (thresholds.maxSpeed) linesArr.push({ value: thresholds.maxSpeed, color: '#ef4444', label: `VNE: ${thresholds.maxSpeed}`, align: 'right', dash: [2, 2] });
          }
      }
      return linesArr;
  }, [showRefLines, thresholds, stats, lines, unit]);

  const handleChartClick = useCallback((event: any, elements: any[], chart: any) => {
      if (pinnedIndex !== null) {
          setPinnedIndex(null); 
      } else {
          if (elements && elements.length > 0) {
              const index = elements[0].index;
              setPinnedIndex(index);
          }
      }
  }, [pinnedIndex]);

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    onClick: handleChartClick, 
    events: pinnedIndex !== null ? ['click', 'touchstart', 'touchend'] : ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
    interaction: {
      mode: pinnedIndex !== null ? 'index' : 'index', 
      intersect: false,
    },
    hover: {
        mode: pinnedIndex !== null ? undefined : 'index', 
        intersect: false
    },
    layout: {
        padding: { left: 0, right: 0, top: 20, bottom: 0 }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#94a3b8',
        bodyColor: '#e2e8f0',
        borderColor: '#334155',
        borderWidth: 1,
        titleFont: { family: 'JetBrains Mono', size: isMaximized ? 12 : 10 },
        bodyFont: { family: 'JetBrains Mono', size: isMaximized ? 13 : 11, weight: 'bold' },
        padding: isMaximized ? 12 : 8,
        cornerRadius: 2,
        displayColors: true,
        boxPadding: 4,
        callbacks: {
            title: (items) => `MET: T+ ${items[0].label}s`,
            label: (item) => {
               // @ts-ignore
               return ` ${item.dataset.label}: ${Number(item.raw).toFixed(2)}`;
            }
        }
      },
      // @ts-ignore
      referenceLines: {
          enable: true,
          lines: refLinesConfig
      },
      // @ts-ignore
      crosshairSmart: {
          color: 'rgba(148, 163, 184, 0.4)',
          width: 1,
          dash: [4, 4],
          pinnedState: { isPinned: pinnedIndex !== null, index: pinnedIndex }
      }
    },
    scales: {
      x: {
        display: false,
        grid: { display: false }
      },
      left: {
        display: true,
        type: 'linear',
        position: 'left',
        grid: {
            color: '#1e293b',
            tickLength: 4
        },
        ticks: {
            color: yAxisConfig?.left?.color || '#94a3b8',
            font: { family: 'JetBrains Mono', size: 10 },
            maxTicksLimit: isMaximized ? 12 : 6,
            padding: 5
        },
        border: { display: false },
        min: yAxisConfig?.left?.yMin === 'auto' ? undefined : Number(yAxisConfig?.left?.yMin),
        max: yAxisConfig?.left?.yMax === 'auto' ? undefined : Number(yAxisConfig?.left?.yMax),
      },
      right: {
        display: !!yAxisConfig?.right, 
        type: 'linear',
        position: 'right',
        grid: { display: false }, 
        ticks: {
            color: yAxisConfig?.right?.color || '#94a3b8',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (val) => {
                const num = Number(val);
                if (num >= 1000) return (num/1000).toFixed(0) + 'k';
                return num.toFixed(0);
            },
            padding: 5
        },
        border: { display: false },
        min: yAxisConfig?.right?.yMin === 'auto' ? undefined : Number(yAxisConfig?.right?.yMin),
        max: yAxisConfig?.right?.yMax === 'auto' ? undefined : Number(yAxisConfig?.right?.yMax),
      }
    }
  }), [yAxisConfig, refLinesConfig, pinnedIndex, handleChartClick, isMaximized]);

  const toggleSeries = (key: string) => {
    const chart = chartRef.current;
    if (chart) {
        const datasetIndex = chart.data.datasets.findIndex((ds: any) => ds.key === key);
        if (datasetIndex !== -1) {
            const meta = chart.getDatasetMeta(datasetIndex);
            meta.hidden = meta.hidden === null ? !chart.data.datasets[datasetIndex].hidden : null;
            chart.update();
            setHiddenSeries(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
        }
    }
  };

  return (
    <div className={`flex-1 tech-border rounded-lg p-2 flex flex-col min-h-[200px] relative group transition-all ${isMaximized ? 'bg-slate-950/0 border-none' : ''}`}>
       {/* HEADER */}
       <div className="flex justify-between items-center mb-1 shrink-0 px-1">
          <h3 className={`text-slate-300 font-bold uppercase flex items-center gap-2 font-tech tracking-wider ${isMaximized ? 'text-lg' : 'text-xs'}`}>
            <Icon className={`${isMaximized ? 'w-5 h-5' : 'w-3 h-3'} text-cyan-400`} /> {title}
          </h3>
          <div className="flex items-center gap-2">
             
             {/* PIN TOGGLE */}
             <button
               onClick={() => setPinnedIndex(null)}
               className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border transition-colors ${pinnedIndex !== null ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-500 opacity-50 hover:opacity-100 hover:text-white'}`}
               title={pinnedIndex !== null ? "Click to Unpin Data" : "Click chart to Pin Data"}
               disabled={pinnedIndex === null}
             >
                {pinnedIndex !== null ? <Pin className="w-3 h-3 fill-current" /> : <PinOff className="w-3 h-3" />}
             </button>

             <div className="h-3 w-px bg-slate-700 mx-1"></div>

             <button
               onClick={() => setShowRefLines(!showRefLines)}
               className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border transition-colors ${showRefLines ? 'bg-indigo-900/50 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
               title="Toggle Ref Lines"
             >
                <Baseline className="w-3 h-3" />
             </button>

             <div className="relative">
                <button 
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border transition-colors ${timeWindow ? 'bg-indigo-900/50 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                  title="Time Filter"
                >
                  <Filter className="w-3 h-3" />
                  <span className="text-[9px] font-mono">{timeWindow ? `${timeWindow}s` : 'ALL'}</span>
                </button>
                
                {showFilterMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-950 border border-slate-700 rounded-sm shadow-xl z-20 flex flex-col min-w-[80px] p-1 animate-in zoom-in-95 origin-top-right">
                     <button onClick={() => { setTimeWindow(null); setShowFilterMenu(false); }} className="text-[10px] text-left px-2 py-1 hover:bg-slate-800 rounded text-slate-300">Show All</button>
                     <button onClick={() => { setTimeWindow(30); setShowFilterMenu(false); }} className="text-[10px] text-left px-2 py-1 hover:bg-slate-800 rounded text-slate-300">Last 30s</button>
                     <button onClick={() => { setTimeWindow(60); setShowFilterMenu(false); }} className="text-[10px] text-left px-2 py-1 hover:bg-slate-800 rounded text-slate-300">Last 60s</button>
                     <button onClick={() => { setTimeWindow(300); setShowFilterMenu(false); }} className="text-[10px] text-left px-2 py-1 hover:bg-slate-800 rounded text-slate-300">Last 5m</button>
                  </div>
                )}
             </div>

             {onMaximize && (
                 <button 
                    onClick={onMaximize} 
                    className="p-1 rounded-sm bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors ml-1"
                    title={isMaximized ? "Minimize" : "Maximize Chart"}
                 >
                    {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                 </button>
             )}
          </div>
       </div>
       
       {/* CHART BODY */}
       <div className="flex-1 w-full min-h-[150px] relative">
         <div className="absolute inset-0">
           {chartData.datasets.length > 0 ? (
               <Line 
                 ref={chartRef}
                 data={chartData} 
                 options={options} 
                 plugins={[referenceLinesPlugin, crosshairPlugin]}
               />
           ) : (
               <div className="flex items-center justify-center h-full text-slate-600 text-xs italic">
                   No data points in this range
               </div>
           )}
         </div>
       </div>

       {/* Interactive Legend */}
       <div className="flex items-center gap-3 mt-1 px-1 flex-wrap justify-end">
          {lines.map((line) => {
             const isHidden = hiddenSeries.includes(line.key as string);
             return (
               <button 
                 key={line.key as string}
                 onClick={() => toggleSeries(line.key as string)}
                 className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-sm border transition-all ${
                   isHidden 
                   ? 'bg-slate-900/50 text-slate-600 border-slate-800 opacity-75' 
                   : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 shadow-sm'
                 }`}
                 title={isHidden ? `Click to Show ${line.name}` : `Click to Hide ${line.name}`}
               >
                 <div 
                   className={`w-2 h-2 rounded-full transition-colors ${isHidden ? 'bg-slate-600' : ''}`}
                   style={{ backgroundColor: isHidden ? undefined : line.color }} 
                 />
                 <span className={`${isHidden ? 'line-through text-slate-500' : 'font-medium'}`}>{line.name}</span>
                 {isHidden ? <EyeOff className="w-2.5 h-2.5 opacity-50" /> : <Eye className="w-2.5 h-2.5 text-indigo-400" />}
               </button>
             );
          })}
       </div>
    </div>
  );
});
