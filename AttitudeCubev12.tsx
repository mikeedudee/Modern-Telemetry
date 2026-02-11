
import React, { useState, useRef, useEffect } from 'react';
import { Move3d, RefreshCw, Upload, Scaling, Eye, RotateCcw, X, Loader2, AlertCircle, Rotate3d, ArrowRight, Maximize2, Minimize2 } from 'lucide-react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { HardwareMode, Model3DConfig } from '../types';

interface AttitudeCubeProps {
  gx: number; // Pitch
  gy: number; // Roll
  gz: number; // Heading
  showShadows?: boolean;
  hardwareMode?: HardwareMode;
  shadowQuality?: 'off' | 'low' | 'high';
  antialiasing?: boolean;
  resolution?: number;
  onMaximize?: () => void;
  isMaximized?: boolean;
  
  modelConfig?: Model3DConfig; 
  onUpdateModelConfig?: (config: Model3DConfig) => void;
}

const LABEL_NAMES = ['FRONT', 'BACK', 'RIGHT', 'LEFT', 'TOP', 'BOTTOM'];
const LERP_FACTOR = 0.1; 
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB Security Limit

export const AttitudeCube: React.FC<AttitudeCubeProps> = ({ 
  gx, 
  gy, 
  gz, 
  showShadows = true, 
  hardwareMode = 'hybrid',
  shadowQuality = 'high',
  antialiasing = true,
  resolution = 1.0,
  onMaximize,
  isMaximized = false,
  modelConfig,
  onUpdateModelConfig
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  
  // Scene Graph Refs
  const pivotRef = useRef<THREE.Group | null>(null); 
  const modelContainerRef = useRef<THREE.Group | null>(null); // AETHER: Stable container for transforms
  
  const animationReqRef = useRef<number>(0);
  
  const targetRot = useRef({ x: 0, y: 0, z: 0 });
  const currentRot = useRef({ x: 0, y: 0, z: 0 });

  const labelDivsRef = useRef<(HTMLDivElement | null)[]>([]);
  const markersRef = useRef<{ [key: string]: THREE.Mesh }>({});
  
  // Local UI State
  const [showResize, setShowResize] = useState(false);
  const [showReorient, setShowReorient] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateConfig = (updates: Partial<Model3DConfig>) => {
      if (onUpdateModelConfig && modelConfig) {
          onUpdateModelConfig({ ...modelConfig, ...updates });
      }
  };

  const disposeObject = (obj: THREE.Object3D) => {
    if (!obj) return;
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m: THREE.Material) => m.dispose());
          else child.material.dispose();
        }
      }
    });
  };

  const clearContainer = (container: THREE.Group) => {
      while (container.children.length > 0) {
          const child = container.children[0];
          container.remove(child);
          disposeObject(child);
      }
  };

  // Shadow updates
  useEffect(() => {
    if (rendererRef.current && sceneRef.current) {
        const effectiveShadows = hardwareMode === 'cpu' ? false : showShadows;
        rendererRef.current.shadowMap.enabled = effectiveShadows;
        
        if (shadowQuality === 'low') {
            rendererRef.current.shadowMap.type = THREE.BasicShadowMap;
        } else {
            rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        sceneRef.current.traverse((child) => {
             if (child instanceof THREE.Mesh) {
                 child.castShadow = effectiveShadows;
                 child.receiveShadow = effectiveShadows;
             }
             if (child instanceof THREE.DirectionalLight) {
                 child.castShadow = effectiveShadows;
                 const shadowRes = (shadowQuality === 'high' || hardwareMode === 'gpu') ? 1024 : 512;
                 if (child.shadow.mapSize.width !== shadowRes) {
                     child.shadow.mapSize.width = shadowRes;
                     child.shadow.mapSize.height = shadowRes;
                     if (child.shadow.map) {
                         child.shadow.map.dispose();
                         // @ts-ignore
                         child.shadow.map = null; 
                     }
                 }
             }
        });
    }
  }, [showShadows, hardwareMode, shadowQuality]);

  useEffect(() => {
      // COORDINATE SYSTEM ALIGNMENT:
      // Physics Pitch: 90 = Up, 0 = Horizon.
      // Scene (Y-Up): Up = +Y, Forward (North) = -Z.
      //
      // If Pitch = 90 -> RotX(0). Cylinder stays Y-Up.
      // If Pitch = 0 -> RotX(-90). Cylinder rotates Y -> -Z. (North).
      //
      // Heading: Clockwise is positive in Compass. 
      // Math: Counter-clockwise positive around Y.
      // So Heading = -gz.
      //
      // Order YXZ: Apply Heading (Y), then Pitch (X), then Roll (Z).
      
      targetRot.current = {
          x: THREE.MathUtils.degToRad(gx - 90), // Maps 90->0, 0->-90
          y: THREE.MathUtils.degToRad(-gz),     // Invert for Math
          z: THREE.MathUtils.degToRad(-gy)      // Roll (Inverted to match plane convention usually, let's test)
      };
  }, [gx, gy, gz]);

  // Init Three.js
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
        window.requestAnimationFrame(() => {
            if (!Array.isArray(entries) || !entries.length) return;
            for (let entry of entries) {
                if (rendererRef.current && cameraRef.current) {
                    const { width, height } = entry.contentRect;
                    if (height === 0) return; 
                    cameraRef.current.aspect = width / height;
                    cameraRef.current.updateProjectionMatrix();
                    rendererRef.current.setSize(width, height);
                }
            }
        });
    });
    resizeObserver.observe(containerRef.current);

    const width = containerRef.current.clientWidth || 300;
    const height = containerRef.current.clientHeight || 300;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(2.5, 2.0, 2.5); 
    cameraRef.current = camera;

    const powerPref = hardwareMode === 'gpu' ? 'high-performance' : (hardwareMode === 'cpu' ? 'low-power' : 'default');
    const effectiveAA = hardwareMode === 'cpu' ? false : antialiasing;

    const renderer = new THREE.WebGLRenderer({ 
        alpha: true, 
        antialias: effectiveAA, 
        preserveDrawingBuffer: true,
        powerPreference: powerPref
    });
    renderer.setSize(width, height);
    
    const pixelRatio = window.devicePixelRatio * resolution;
    renderer.setPixelRatio(pixelRatio);
    
    const effectiveShadows = hardwareMode === 'cpu' ? false : showShadows;
    renderer.shadowMap.enabled = effectiveShadows; 
    renderer.shadowMap.type = shadowQuality === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    
    renderer.domElement.style.pointerEvents = 'auto'; 
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    
    containerRef.current.innerHTML = ''; 
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 10;
    controls.target.set(0, 0, 0); 
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = effectiveShadows;
    const shadowRes = (shadowQuality === 'high' || hardwareMode === 'gpu') ? 1024 : 512;
    dirLight.shadow.mapSize.width = shadowRes;
    dirLight.shadow.mapSize.height = shadowRes;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.5);
    fillLight.position.set(-5, 0, -5);
    scene.add(fillLight);

    const bottomLight = new THREE.DirectionalLight(0xffffff, 0.3);
    bottomLight.position.set(0, -10, 0);
    scene.add(bottomLight);

    // ROOT PIVOT (Rotates by Telemetry)
    const pivot = new THREE.Group();
    scene.add(pivot);
    pivotRef.current = pivot;

    // MODEL CONTAINER (Rotates by User Config)
    const modelContainer = new THREE.Group();
    pivot.add(modelContainer);
    modelContainerRef.current = modelContainer;

    // Axes
    const axisGroup = new THREE.Group();
    const axisRadius = 0.025;
    const axisLength = 2.0;
    const axisMatConfig = { depthTest: false, transparent: true, opacity: 0.9, toneMapped: false };

    const xGeo = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 12);
    xGeo.rotateZ(-Math.PI / 2);
    xGeo.translate(axisLength/2, 0, 0);
    const xAxis = new THREE.Mesh(xGeo, new THREE.MeshBasicMaterial({ color: 0xff4444, ...axisMatConfig }));
    axisGroup.add(xAxis);

    const yGeo = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 12);
    yGeo.translate(0, axisLength/2, 0);
    const yAxis = new THREE.Mesh(yGeo, new THREE.MeshBasicMaterial({ color: 0x44ff44, ...axisMatConfig }));
    axisGroup.add(yAxis);

    const zGeo = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 12);
    zGeo.rotateX(Math.PI / 2);
    zGeo.translate(0, 0, axisLength/2);
    const zAxis = new THREE.Mesh(zGeo, new THREE.MeshBasicMaterial({ color: 0x4488ff, ...axisMatConfig }));
    axisGroup.add(zAxis);

    const originGeo = new THREE.SphereGeometry(axisRadius * 2.5, 16, 16);
    const originMesh = new THREE.Mesh(originGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, ...axisMatConfig }));
    axisGroup.add(originMesh);

    pivot.add(axisGroup);

    // Markers
    // Fixed: 'FRONT' is now -Z to match North logic
    const markerGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const markerMat = new THREE.MeshBasicMaterial({ visible: false });
    const createMarker = (x: number, y: number, z: number, name: string) => {
        const mesh = new THREE.Mesh(markerGeo, markerMat);
        mesh.position.set(x, y, z);
        pivot.add(mesh);
        markersRef.current[name] = mesh;
    };
    createMarker(0, 0, -1.5, 'FRONT');
    createMarker(0, 0, 1.5, 'BACK');
    createMarker(1.5, 0, 0, 'RIGHT');
    createMarker(-1.5, 0, 0, 'LEFT');
    createMarker(0, 1.5, 0, 'TOP');
    createMarker(0, -1.5, 0, 'BOTTOM');

    // THE ANIMATION LOOP
    const tempV = new THREE.Vector3();
    const animate = () => {
      animationReqRef.current = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();

      if (pivotRef.current) {
          currentRot.current.x += (targetRot.current.x - currentRot.current.x) * LERP_FACTOR;
          currentRot.current.y += (targetRot.current.y - currentRot.current.y) * LERP_FACTOR;
          currentRot.current.z += (targetRot.current.z - currentRot.current.z) * LERP_FACTOR;

          pivotRef.current.rotation.order = 'YXZ'; // Changed from ZYX to YXZ for consistent Heading/Pitch
          pivotRef.current.rotation.x = currentRot.current.x;
          pivotRef.current.rotation.y = currentRot.current.y; 
          pivotRef.current.rotation.z = currentRot.current.z; 
      }

      if (cameraRef.current && pivotRef.current && containerRef.current) {
          const canvasWidth = containerRef.current.clientWidth;
          const canvasHeight = containerRef.current.clientHeight;

          LABEL_NAMES.forEach((name, index) => {
             const mesh = markersRef.current[name];
             const div = labelDivsRef.current[index];
             if (mesh && div) {
                 mesh.getWorldPosition(tempV);
                 tempV.project(cameraRef.current!);
                 if (tempV.z < 1) {
                     const x = (tempV.x * 0.5 + 0.5) * canvasWidth;
                     const y = (-(tempV.y * 0.5) + 0.5) * canvasHeight;
                     div.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
                     div.style.display = 'block';
                 } else {
                     div.style.display = 'none';
                 }
             }
          });
      }

      if (rendererRef.current && scene && cameraRef.current) {
        rendererRef.current.render(scene, cameraRef.current);
      }
    };
    animate();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationReqRef.current);
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) object.material.forEach((m: any) => m.dispose());
                    else object.material.dispose();
                }
            }
        });
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (containerRef.current && rendererRef.current.domElement.parentNode === containerRef.current) {
            containerRef.current.removeChild(rendererRef.current.domElement);
        }
      }
    };
  }, [hardwareMode, antialiasing, resolution]);

  // --- MODEL SWAPPING ---
  // ... (Rest of component same as before, truncated for brevity as no logic change needed here)
  useEffect(() => {
      if (!modelConfig) return;
      if (!modelContainerRef.current) return;

      const container = modelContainerRef.current;
      const currentChild = container.children[0];
      const currentUrl = currentChild?.userData?.url;
      const isCurrentlyCustom = currentChild?.userData?.isCustom;

      // 1. Should be Default, but is Custom -> Reset
      if (!modelConfig.isCustom && isCurrentlyCustom) {
          loadDefaultModel();
      } 
      // 2. Should be Custom, but URL doesn't match current -> Load New
      else if (modelConfig.isCustom && modelConfig.url && currentUrl !== modelConfig.url) {
          loadCustomModel(modelConfig.url);
      } 
      // 3. Container is empty -> Initial Load
      else if (container.children.length === 0) {
          if (modelConfig.isCustom && modelConfig.url) loadCustomModel(modelConfig.url);
          else loadDefaultModel();
      }
  }, [modelConfig?.url, modelConfig?.isCustom]);

  useEffect(() => {
    if (modelContainerRef.current && modelConfig) {
      modelContainerRef.current.scale.set(modelConfig.scale, modelConfig.scale, modelConfig.scale);
      
      if (modelConfig.isCustom) {
          modelContainerRef.current.rotation.set(
              THREE.MathUtils.degToRad(modelConfig.rotation.x),
              THREE.MathUtils.degToRad(modelConfig.rotation.y),
              THREE.MathUtils.degToRad(modelConfig.rotation.z)
          );
      } else {
          modelContainerRef.current.rotation.set(0, 0, 0);
      }
    }
  }, [modelConfig?.scale, modelConfig?.rotation, modelConfig?.isCustom]);

  const loadDefaultModel = () => {
    if (!modelContainerRef.current) return;
    clearContainer(modelContainerRef.current);

    const group = new THREE.Group();
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 32);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x06b6d4, metalness: 0.6, roughness: 0.2, transparent: true, opacity: 0.8
    });
    const cylinder = new THREE.Mesh(geometry, material);
    cylinder.castShadow = true;
    cylinder.receiveShadow = true;
    
    const inner = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 1.2, 0.35),
        new THREE.MeshBasicMaterial({ color: 0x10b981, wireframe: true })
    );
    
    const capGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.1, 32);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
    const topCap = new THREE.Mesh(capGeo, capMat);
    topCap.position.y = 0.75; topCap.castShadow = true;
    const botCap = new THREE.Mesh(capGeo, capMat);
    botCap.position.y = -0.75; botCap.castShadow = true;
    
    const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0 })
    );
    ant.position.set(0.3, 1.15, 0); ant.castShadow = true;
    
    group.add(cylinder, inner, topCap, botCap, ant);
    group.userData = { isCustom: false };
    
    modelContainerRef.current.add(group);
    
    setErrorMsg(null);
    setShowReorient(false);
  };

  const loadCustomModel = (url: string) => {
      if (!modelContainerRef.current) return;
      const loader = new STLLoader();
      loader.load(url, 
        (geometry) => { 
            if (modelContainerRef.current) {
                clearContainer(modelContainerRef.current);
                try {
                  geometry.computeVertexNormals();
                  geometry.center();
                  geometry.computeBoundingBox();
                  const box = geometry.boundingBox!;
                  const size = new THREE.Vector3();
                  box.getSize(size);
                  const maxDim = Math.max(size.x, size.y, size.z);
                  const baseScale = maxDim > 0 ? 2 / maxDim : 1;
                  const material = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide });
                  const mesh = new THREE.Mesh(geometry, material);
                  mesh.geometry.scale(baseScale, baseScale, baseScale);
                  mesh.castShadow = true;
                  mesh.receiveShadow = true;
                  mesh.userData = { isCustom: true, url: url };
                  modelContainerRef.current.add(mesh);
                  setIsLoading(false);
                  setShowReorient(true); 
                } catch (err: any) {
                   console.error(err);
                   setErrorMsg(err.message || "Failed to process STL geometry.");
                   setIsLoading(false);
                   loadDefaultModel(); 
                }
            }
        }, 
        (xhr) => { if (xhr.lengthComputable) setLoadingProgress(Math.round((xhr.loaded / xhr.total) * 100)); },
        (err) => { console.error(err); setErrorMsg("Failed to load file."); setIsLoading(false); loadDefaultModel(); }
      );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateModelConfig) return;
    setErrorMsg(null);
    if (file.size > MAX_FILE_SIZE) {
        setErrorMsg(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 15MB.`);
        e.target.value = ''; 
        return;
    }
    setIsLoading(true);
    setLoadingProgress(0);
    const url = URL.createObjectURL(file);
    const extension = file.name.split('.').pop()?.toLowerCase();
    e.target.value = '';
    if (extension === 'stl') {
        updateConfig({
            url: url,
            fileName: file.name,
            isCustom: true,
            scale: 1, 
            rotation: { x: -90, y: 0, z: 0 } 
        });
    } else {
        setErrorMsg("Invalid file type. Please upload .STL");
        setIsLoading(false);
    }
  };

  const handleResetToDefault = () => {
      updateConfig({ url: null, fileName: null, isCustom: false, scale: 1, rotation: { x: 0, y: 0, z: 0 } });
      loadDefaultModel();
  };

  const resetView = () => {
    if (controlsRef.current && cameraRef.current) {
        controlsRef.current.reset();
        controlsRef.current.target.set(0, 0, 0); 
        cameraRef.current.position.set(2.5, 2.0, 2.5);
        cameraRef.current.lookAt(0, 0, 0);
        controlsRef.current.update();
    }
  };

  const rotateMesh = (axis: 'x' | 'y' | 'z') => {
      if (modelConfig) {
          updateConfig({
              rotation: { ...modelConfig.rotation, [axis]: modelConfig.rotation[axis] + 90 }
          });
      }
  };

  return (
    <div className={`w-full h-full relative group ${isMaximized ? 'bg-transparent' : 'bg-slate-900/50'}`}>
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <div className="bg-slate-950/80 backdrop-blur border border-slate-700 p-1.5 rounded-md text-cyan-400 shadow-lg">
                    <Move3d className="w-4 h-4" />
                </div>
                {modelConfig?.isCustom && modelConfig.fileName && (
                    <div className="bg-indigo-900/80 backdrop-blur border border-indigo-500/30 px-2 py-1 rounded text-[9px] font-bold text-indigo-100 flex items-center gap-1 animate-in fade-in slide-in-from-left-2">
                        <span>{modelConfig.fileName.length > 15 ? modelConfig.fileName.substring(0,12)+'...' : modelConfig.fileName}</span>
                        <button onClick={handleResetToDefault} className="hover:text-white"><X className="w-3 h-3" /></button>
                    </div>
                )}
            </div>
        </div>
        {errorMsg && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-rose-950/90 border border-rose-500 text-rose-200 px-3 py-1.5 rounded shadow-lg flex items-center gap-2 text-[10px] font-bold animate-in slide-in-from-top-2 fade-in">
                <AlertCircle className="w-3 h-3" />
                {errorMsg}
                <button onClick={() => setErrorMsg(null)}><X className="w-3 h-3 hover:text-white" /></button>
            </div>
        )}
        <div ref={containerRef} className="w-full h-full cursor-move" title="Drag to Rotate View" />
        {isLoading && (
          <div className="absolute inset-0 bg-black/80 z-40 flex flex-col items-center justify-center backdrop-blur-sm p-4 text-center">
             <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
             <span className="text-xs text-slate-200 font-bold mb-1">Loading 3D Model...</span>
             <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-300 ease-out" style={{ width: `${loadingProgress}%` }} />
             </div>
             <span className="text-[10px] text-slate-400 font-mono mt-1">{loadingProgress}%</span>
          </div>
        )}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            {LABEL_NAMES.map((name, i) => (
                <div key={name} ref={(el) => { labelDivsRef.current[i] = el; }} className="absolute text-[8px] font-bold font-mono text-slate-500 bg-black/30 px-1 rounded backdrop-blur-[1px]" style={{ left: 0, top: 0, display: 'none', opacity: 0.7, transform: 'translate(-50%, -50%)', willChange: 'transform' }}>{name}</div>
            ))}
        </div>
        <div className="absolute top-2 right-2 z-20 flex flex-col gap-2 items-end pointer-events-auto">
            {onMaximize && (
                <button onClick={onMaximize} className="p-1.5 rounded bg-black/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700 backdrop-blur-sm shadow-lg mb-1" title={isMaximized ? "Minimize" : "Maximize"}>
                    {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
            )}
            <label className={`p-1.5 rounded bg-black/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700 backdrop-blur-sm cursor-pointer shadow-lg ${isLoading ? 'opacity-50 pointer-events-none' : ''}`} title="Upload Custom .STL Model (Max 15MB)">
                <Upload className="w-3.5 h-3.5" /><input type="file" accept=".stl" ref={fileInputRef} className="hidden" onChange={handleFileUpload} disabled={isLoading} />
            </label>
            <button onClick={() => { setShowResize(!showResize); setShowReorient(false); }} className={`p-1.5 rounded transition-colors border backdrop-blur-sm shadow-lg ${showResize ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-black/60 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'}`}><Scaling className="w-3.5 h-3.5" /></button>
            {modelConfig?.isCustom && (<button onClick={() => { setShowReorient(!showReorient); setShowResize(false); }} className={`p-1.5 rounded transition-colors border backdrop-blur-sm shadow-lg ${showReorient ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-black/60 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'}`}><Rotate3d className="w-3.5 h-3.5" /></button>)}
            <button onClick={resetView} className="p-1.5 rounded bg-black/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700 backdrop-blur-sm shadow-lg"><Eye className="w-3.5 h-3.5" /></button>
            {modelConfig?.isCustom && (<button onClick={handleResetToDefault} className="p-1.5 rounded bg-black/60 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition-colors border border-slate-700 backdrop-blur-sm shadow-lg"><RefreshCw className="w-3.5 h-3.5" /></button>)}
        </div>
        {showResize && modelConfig && (
            <div className="absolute top-10 right-10 z-30 bg-black/80 border border-slate-700 p-3 rounded-lg backdrop-blur-md shadow-2xl flex flex-col gap-2 w-32 animate-in fade-in slide-in-from-right-5 duration-200">
                <div className="flex justify-between items-center pb-1 border-b border-slate-700/50"><span className="text-[9px] font-bold text-slate-400 uppercase">Model Scale</span><button onClick={() => setShowResize(false)} className="text-slate-500 hover:text-white"><X className="w-3 h-3"/></button></div>
                <div className="flex items-center gap-2"><input type="range" min="0.1" max="3" step="0.1" value={modelConfig.scale} onChange={(e) => updateConfig({ scale: parseFloat(e.target.value) })} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"/></div>
                <div className="text-right text-[10px] font-mono text-cyan-400">{modelConfig.scale.toFixed(1)}x</div>
            </div>
        )}
        {showReorient && modelConfig?.isCustom && (
             <div className="absolute top-10 right-10 z-30 bg-black/80 border border-slate-700 p-3 rounded-lg backdrop-blur-md shadow-2xl flex flex-col gap-2 w-40 animate-in fade-in slide-in-from-right-5 duration-200">
                <div className="flex justify-between items-center pb-1 border-b border-slate-700/50"><span className="text-[9px] font-bold text-slate-400 uppercase">Align Model</span><button onClick={() => setShowReorient(false)} className="text-slate-500 hover:text-white"><X className="w-3 h-3"/></button></div>
                <p className="text-[8px] text-slate-500 leading-tight">Rotate mesh to match sensor frame (Front/Up).</p>
                <div className="grid grid-cols-3 gap-1">
                    <button onClick={() => rotateMesh('x')} className="bg-slate-800 hover:bg-cyan-900/50 border border-slate-600 text-[10px] text-cyan-400 font-bold py-1 rounded transition-colors">X</button>
                    <button onClick={() => rotateMesh('y')} className="bg-slate-800 hover:bg-emerald-900/50 border border-slate-600 text-[10px] text-emerald-400 font-bold py-1 rounded transition-colors">Y</button>
                    <button onClick={() => rotateMesh('z')} className="bg-slate-800 hover:bg-indigo-900/50 border border-slate-600 text-[10px] text-indigo-400 font-bold py-1 rounded transition-colors">Z</button>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[8px] text-center font-mono text-slate-400"><span>{modelConfig.rotation.x % 360}°</span><span>{modelConfig.rotation.y % 360}°</span><span>{modelConfig.rotation.z % 360}°</span></div>
             </div>
        )}
        <div className="absolute bottom-6 left-3 text-right text-[10px] font-mono text-slate-500 pointer-events-none drop-shadow-md z-10">
            <div className="flex items-center justify-end gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]"></span><span>PITCH: {gx.toFixed(1)}°</span></div>
            <div className="flex items-center justify-end gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span><span>ROLL: {gy.toFixed(1)}°</span></div>
            <div className="flex items-center justify-end gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]"></span><span>YAW: {gz.toFixed(1)}°</span></div>
        </div>
        <div className="absolute bottom-2 left-3 text-[9px] font-mono text-slate-600 pointer-events-none z-10">{modelConfig?.fileName && <span className="text-indigo-400/80">Model: {modelConfig.fileName.length > 12 ? modelConfig.fileName.substring(0,12)+'...' : modelConfig.fileName}</span>}</div>
    </div>
  );
};
