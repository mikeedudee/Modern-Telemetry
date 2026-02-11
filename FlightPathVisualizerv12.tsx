
import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { TelemetryPacket, AppSettings, Model3DConfig } from '../types';
import { predictLanding, LandingPrediction, getWindAtAltitude } from '../utils/geo';
import { 
  Plus, Minus, Lock, Unlock, Info, Crosshair, Target, Navigation, 
  Upload, Scaling, Rotate3d, Eye, RefreshCw, X, Loader2, AlertCircle, Wind, Download, ArrowDown
} from 'lucide-react';

interface FlightPathProps {
  history: TelemetryPacket[];
  prediction: LandingPrediction | null;
  settings: AppSettings;
  active: boolean; 
  
  // AETHER: State Lifted Props
  modelConfig?: Model3DConfig;
  onUpdateModelConfig?: (config: Model3DConfig) => void;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB Limit

export const FlightPathVisualizer: React.FC<FlightPathProps> = ({ 
  history, 
  prediction, 
  settings, 
  active,
  modelConfig,
  onUpdateModelConfig
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const animationRef = useRef<number>(0);
  const compassArrowRef = useRef<HTMLDivElement>(null);
  
  // Scene Objects
  const vehicleRef = useRef<THREE.Group | null>(null); // Moves with Physics
  const internalModelRef = useRef<THREE.Group | null>(null); // Scales/Rotates with User Config
  
  const pathLineRef = useRef<THREE.Line | null>(null);
  const predLineRef = useRef<THREE.Line | null>(null);
  
  const landingMarkerRef = useRef<THREE.Group | null>(null);
  const shadowPlaneRef = useRef<THREE.Mesh | null>(null);
  
  const windParticlesRef = useRef<THREE.Points | null>(null);

  // Keep a ref to settings for the animation loop
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // View State
  const [isLocked, setIsLocked] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  
  // UI State
  const [showResize, setShowResize] = useState(false);
  const [showReorient, setShowReorient] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Helpers
  const originRef = useRef<{lat: number, lon: number} | null>(null);

  // Helper to update config safely
  const updateConfig = (updates: Partial<Model3DConfig>) => {
      if (onUpdateModelConfig && modelConfig) {
          onUpdateModelConfig({ ...modelConfig, ...updates });
      }
  };

  // Calculate current wind based on vehicle altitude
  const currentWind = useMemo(() => {
      const currentAlt = history.length > 0 ? history[history.length - 1].relAltitude : 0;
      return getWindAtAltitude(currentAlt, settings.wind);
  }, [history, settings.wind]);

  const toLocal = (lat: number, lon: number, alt: number) => {
      if (!originRef.current) return { x: 0, y: 0, z: 0 };
      
      const latRad = originRef.current.lat * Math.PI / 180;
      const metersPerDegLat = 111132.92;
      const metersPerDegLon = 111412.84 * Math.cos(latRad);

      const z = -(lat - originRef.current.lat) * metersPerDegLat; // North is -Z
      const x = (lon - originRef.current.lon) * metersPerDegLon; // East is +X
      const y = alt; // Up is +Y

      return { x, y, z };
  };

  const disposeObject = (obj: THREE.Object3D) => {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
          else child.material.dispose();
        }
      }
    });
  };

  // --- INIT SCENE ---
  useEffect(() => {
    if (!containerRef.current || !active) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617); // Slate 950
    scene.fog = new THREE.FogExp2(0x020617, 0.0005);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 20000);
    camera.position.set(20, 20, 20);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: settings.graphics.antialiasing, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio * settings.graphics.renderResolution);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.maxPolarAngle = Math.PI; // Allow looking from below
    controlsRef.current = controls;

    // --- LIGHTS ---
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    // --- GROUND GRID ---
    const gridHelper = new THREE.GridHelper(2000, 100, 0x1e293b, 0x0f172a); // 2km grid
    scene.add(gridHelper);
    
    // --- PATH LINES ---
    const historyGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(100000 * 3);
    historyGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    historyGeo.setDrawRange(0, 0);
    const historyMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, linewidth: 2 });
    const historyLine = new THREE.Line(historyGeo, historyMat);
    historyLine.frustumCulled = false;
    scene.add(historyLine);
    pathLineRef.current = historyLine;

    // --- PREDICTION LINE ---
    const predGeo = new THREE.BufferGeometry();
    const predPos = new Float32Array(2000 * 3);
    predGeo.setAttribute('position', new THREE.BufferAttribute(predPos, 3));
    predGeo.setDrawRange(0, 0);
    const predMat = new THREE.LineDashedMaterial({ 
        color: 0xf59e0b, dashSize: 3, gapSize: 2, linewidth: 2, transparent: true, opacity: 0.8
    });
    const predLine = new THREE.Line(predGeo, predMat);
    predLine.computeLineDistances(); 
    predLine.frustumCulled = false;
    scene.add(predLine);
    predLineRef.current = predLine;

    // --- LANDING MARKER ---
    const markerGroup = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0, 5, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    markerGroup.add(ring);
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 200, 8);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.2 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 100;
    markerGroup.add(beam);
    markerGroup.visible = false;
    scene.add(markerGroup);
    landingMarkerRef.current = markerGroup;

    // --- WIND PARTICLES ---
    const particleCount = settings.graphics.windParticleCount || 1000;
    const particlesGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const boxSize = 250; 
    for(let i=0; i<particleCount * 3; i++) {
        particlePositions[i] = (Math.random() - 0.5) * (boxSize * 2); 
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particlesMat = new THREE.PointsMaterial({ 
        color: settings.graphics.windColor || 0xffffff, 
        size: 0.6, transparent: true, opacity: 0.4, sizeAttenuation: true 
    });
    const windSystem = new THREE.Points(particlesGeo, particlesMat);
    windSystem.frustumCulled = false; 
    scene.add(windSystem);
    windParticlesRef.current = windSystem;

    // --- VEHICLE CONTAINER ---
    const vehicleGroup = new THREE.Group();
    const shadowGeo = new THREE.CircleGeometry(2, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadowPlaneRef.current = shadow;
    scene.add(shadow); 

    const internalGroup = new THREE.Group();
    vehicleGroup.add(internalGroup);
    internalModelRef.current = internalGroup;

    scene.add(vehicleGroup);
    vehicleRef.current = vehicleGroup;

    // Initial Load based on config or default
    if (modelConfig && modelConfig.isCustom && modelConfig.url) {
        loadCustomModel(modelConfig.url);
    } else {
        loadDefaultModel();
    }

    // --- ANIM LOOP ---
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      
      if (compassArrowRef.current && controlsRef.current && cameraRef.current) {
          const target = controlsRef.current.target;
          const pos = cameraRef.current.position;
          const dx = target.x - pos.x;
          const dz = target.z - pos.z;
          const angle = Math.atan2(dx, -dz);
          compassArrowRef.current.style.transform = `rotate(${angle}rad)`;
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      if (landingMarkerRef.current && landingMarkerRef.current.visible) {
          const s = 1 + Math.sin(Date.now() * 0.005) * 0.2;
          landingMarkerRef.current.scale.set(s, 1, s);
      }
      
      // Update Wind Particles
      if (windParticlesRef.current) {
          const windSettings = settingsRef.current.wind;
          const showWind = settingsRef.current.graphics.showWind;
          
          if (!showWind) {
              windParticlesRef.current.visible = false;
          } else {
              windParticlesRef.current.visible = true;
              (windParticlesRef.current.material as THREE.PointsMaterial).color.set(settingsRef.current.graphics.windColor);
              const centerPos = vehicleRef.current ? vehicleRef.current.position : new THREE.Vector3(0,0,0);
              windParticlesRef.current.position.copy(centerPos);

              if (windSettings.speed > 0 || (windSettings.mode === 'gradient' && windSettings.layers.length > 0)) {
                  const positions = windParticlesRef.current.geometry.attributes.position.array as Float32Array;
                  const count = positions.length / 3;
                  const boxRange = 250; 

                  for(let i=0; i<count; i++) {
                      const localY = positions[i*3+1];
                      const absoluteY = centerPos.y + localY;
                      let speed = 0;
                      let direction = 0;

                      if (windSettings.mode === 'single') {
                          speed = windSettings.speed;
                          direction = windSettings.direction;
                      } else {
                          const layers = windSettings.layers;
                          if (layers.length > 0) {
                              if (absoluteY <= layers[0].altitude) {
                                  speed = layers[0].speed; direction = layers[0].direction;
                              } else if (absoluteY >= layers[layers.length - 1].altitude) {
                                  speed = layers[layers.length - 1].speed; direction = layers[layers.length - 1].direction;
                              } else {
                                  for(let k=0; k<layers.length-1; k++) {
                                      if (absoluteY >= layers[k].altitude && absoluteY <= layers[k+1].altitude) {
                                          const r = (absoluteY - layers[k].altitude) / (layers[k+1].altitude - layers[k].altitude);
                                          speed = layers[k].speed + (layers[k+1].speed - layers[k].speed) * r;
                                          direction = layers[k].direction + (layers[k+1].direction - layers[k].direction) * r;
                                          break;
                                      }
                                  }
                              }
                          }
                      }

                      const blowRad = (direction + 180) * (Math.PI / 180);
                      const moveX = Math.sin(blowRad) * speed * 0.2; 
                      const moveZ = -Math.cos(blowRad) * speed * 0.2;

                      positions[i*3] += moveX;
                      positions[i*3+2] += moveZ;

                      if (positions[i*3] > boxRange) positions[i*3] -= boxRange * 2;
                      if (positions[i*3] < -boxRange) positions[i*3] += boxRange * 2;
                      if (positions[i*3+1] > boxRange) positions[i*3+1] -= boxRange * 2;
                      if (positions[i*3+1] < -boxRange) positions[i*3+1] += boxRange * 2;
                      if (positions[i*3+2] > boxRange) positions[i*3+2] -= boxRange * 2;
                      if (positions[i*3+2] < -boxRange) positions[i*3+2] += boxRange * 2;
                  }
                  windParticlesRef.current.geometry.attributes.position.needsUpdate = true;
              }
          }
      }
    };
    animate();

    const handleResize = () => {
        if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationRef.current);
        if (rendererRef.current) {
            rendererRef.current.dispose();
            containerRef.current?.removeChild(rendererRef.current.domElement);
        }
    };
  }, [active, settings.graphics.antialiasing, settings.graphics.renderResolution, settings.graphics.windParticleCount]);

  // --- EFFECT: DATA UPDATES (Lock Logic) ---
  useEffect(() => {
      if (!history || history.length === 0) return;

      // 1. Set Origin
      if (!originRef.current) {
          const first = history.find(p => Math.abs(p.latitude) > 0.0001);
          if (first) {
              originRef.current = { lat: first.latitude, lon: first.longitude };
          }
      }

      if (!originRef.current) return;

      // 2. Update Path Geometry
      if (pathLineRef.current) {
          const positions = pathLineRef.current.geometry.attributes.position.array as Float32Array;
          let count = 0;
          const maxPoints = 100000;
          
          const step = history.length > maxPoints ? Math.ceil(history.length / maxPoints) : 1;

          for(let i=0; i<history.length; i+=step) {
              const p = history[i];
              if (Math.abs(p.latitude) > 0.0001) {
                  const local = toLocal(p.latitude, p.longitude, p.relAltitude);
                  positions[count * 3] = local.x;
                  positions[count * 3 + 1] = local.y;
                  positions[count * 3 + 2] = local.z;
                  count++;
              }
          }
          
          pathLineRef.current.geometry.setDrawRange(0, count);
          pathLineRef.current.geometry.attributes.position.needsUpdate = true;
          pathLineRef.current.geometry.computeBoundingSphere();
      }

      // 3. Update Vehicle Position & Rotation
      const lastPacket = history[history.length - 1];
      if (vehicleRef.current && Math.abs(lastPacket.latitude) > 0.0001) {
          const local = toLocal(lastPacket.latitude, lastPacket.longitude, lastPacket.relAltitude);
          
          vehicleRef.current.position.set(local.x, local.y, local.z);
          
          // COORDINATE ALIGNMENT UPDATE:
          // gx = Pitch (90=Up, 0=Horizon). Scene North is -Z.
          // To map Pitch 0 -> North (-Z): Rotate X by (Pitch - 90).
          // Heading (Compass) -> Math: Invert sign.
          
          const pitchDeg = lastPacket.gx; 
          const headingDeg = lastPacket.heading;
          const rollDeg = lastPacket.gy;

          const pitchRad = THREE.MathUtils.degToRad(pitchDeg - 90); // Map Horizon to -Z (North)
          const headingRad = THREE.MathUtils.degToRad(-headingDeg); // Compass to Math
          const rollRad = THREE.MathUtils.degToRad(-rollDeg); // Standard Roll
          
          vehicleRef.current.rotation.order = 'YXZ'; // Important: Heading first, then Pitch
          vehicleRef.current.rotation.y = headingRad;
          vehicleRef.current.rotation.x = pitchRad;
          vehicleRef.current.rotation.z = rollRad;

          if (isLocked && controlsRef.current) {
              controlsRef.current.target.copy(vehicleRef.current.position);
          }

          // Update Shadow
          if (shadowPlaneRef.current) {
              shadowPlaneRef.current.position.set(local.x, 0.1, local.z);
              shadowPlaneRef.current.rotation.z = headingRad; 
          }
      }

      // 4. Update Prediction Line
      if (predLineRef.current) {
          if (prediction && prediction.path.length > 0) {
              const positions = predLineRef.current.geometry.attributes.position.array as Float32Array;
              let count = 0;
              prediction.path.forEach(p => {
                  const local = toLocal(p.lat, p.lon, p.alt);
                  positions[count * 3] = local.x;
                  positions[count * 3 + 1] = local.y;
                  positions[count * 3 + 2] = local.z;
                  count++;
              });
              predLineRef.current.geometry.setDrawRange(0, count);
              predLineRef.current.geometry.attributes.position.needsUpdate = true;
              predLineRef.current.visible = true;
              
              if (landingMarkerRef.current) {
                  const lastP = prediction.path[prediction.path.length-1];
                  const localLand = toLocal(lastP.lat, lastP.lon, lastP.alt);
                  landingMarkerRef.current.position.set(localLand.x, 0.2, localLand.z);
                  landingMarkerRef.current.visible = true;
              }
          } else {
              predLineRef.current.visible = false;
              if (landingMarkerRef.current) landingMarkerRef.current.visible = false;
          }
      }

  }, [history, prediction, isLocked]);

  // --- EFFECT: MODEL SWAPPING & DEFAULT LOADER ---
  useEffect(() => {
      // If we are using a custom model, the logic is handled by the props check in the next effect.
      // If we are NOT using a custom model, we need to respect the vehicleIcon setting.
      if (modelConfig?.isCustom) return;

      if (!internalModelRef.current) return;

      // Clear existing procedural meshes
      while (internalModelRef.current.children.length > 0) {
          const child = internalModelRef.current.children[0];
          internalModelRef.current.remove(child);
          disposeObject(child);
      }

      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.6 });
      let mesh = new THREE.Group();

      if (settings.graphics.vehicleIcon === 'rocket') {
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 16), mat);
          const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 16), mat);
          nose.position.y = 2.5;
          const fins = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.1), mat);
          fins.position.y = -1.5;
          mesh.add(body, nose, fins);
          updateConfig({ rotation: { x: 0, y: 0, z: 0 } });
      } else if (settings.graphics.vehicleIcon === 'drone') {
          const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), mat);
          const arm1 = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2), mat);
          const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 3), mat);
          mesh.add(body, arm1, arm2);
          updateConfig({ rotation: { x: 0, y: 0, z: 0 } });
      } else { // Plane/Default
          const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 16), mat);
          body.rotation.x = -Math.PI / 2;
          const wings = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 1), mat);
          mesh.add(body, wings);
          updateConfig({ rotation: { x: 0, y: 0, z: 0 } });
      }

      internalModelRef.current.add(mesh);
      // Reset scale for default models if needed, though 1 is standard
      if(modelConfig?.scale !== 1) updateConfig({ scale: 1 });

  }, [settings.graphics.vehicleIcon, modelConfig?.isCustom]);

  // --- EFFECT: HANDLE CUSTOM MODEL UPDATES ---
  useEffect(() => {
      if (!modelConfig) return;
      if (modelConfig.isCustom && modelConfig.url && internalModelRef.current) {
          // Check if already loaded
          // We can use a userData flag on the children to detect if the *current* model matches the URL
          const currentMesh = internalModelRef.current.children[0];
          if (!currentMesh || currentMesh.userData.url !== modelConfig.url) {
              loadCustomModel(modelConfig.url);
          }
      }
  }, [modelConfig?.url, modelConfig?.isCustom]);

  // --- EFFECT: TRANSFORM UPDATES ---
  useEffect(() => {
      if (internalModelRef.current && modelConfig) {
          internalModelRef.current.scale.set(modelConfig.scale, modelConfig.scale, modelConfig.scale);
          if (modelConfig.isCustom) {
              internalModelRef.current.rotation.set(
                  THREE.MathUtils.degToRad(modelConfig.rotation.x),
                  THREE.MathUtils.degToRad(modelConfig.rotation.y),
                  THREE.MathUtils.degToRad(modelConfig.rotation.z)
              );
          } else {
              internalModelRef.current.rotation.set(0, 0, 0);
          }
      }
  }, [modelConfig?.scale, modelConfig?.rotation, modelConfig?.isCustom]);

  const loadDefaultModel = () => {
      // Trigger effect above by setting isCustom to false via updateConfig if needed
      // But the effect depends on settings.graphics.vehicleIcon mostly.
      // We essentially just clear custom state in parent.
      updateConfig({ isCustom: false, url: null, fileName: null });
  };

  const loadCustomModel = (url: string) => {
      if (!internalModelRef.current) return;
      
      const loader = new STLLoader();
      loader.load(url, 
        (geometry) => { 
            while (internalModelRef.current!.children.length > 0) {
                const child = internalModelRef.current!.children[0];
                internalModelRef.current!.remove(child);
                disposeObject(child);
            }
            try {
              geometry.computeVertexNormals();
              geometry.center();
              geometry.computeBoundingBox();
              const box = geometry.boundingBox!;
              const size = new THREE.Vector3();
              box.getSize(size);
              const maxDim = Math.max(size.x, size.y, size.z);
              const scaleFactor = 4 / maxDim; // Base normalization
              
              const material = new THREE.MeshStandardMaterial({ 
                  color: 0x94a3b8, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide
              });
              const mesh = new THREE.Mesh(geometry, material);
              
              // Bake normalization
              mesh.geometry.scale(scaleFactor, scaleFactor, scaleFactor);
              
              mesh.userData = { url: url }; // Tag for change detection
              
              internalModelRef.current!.add(mesh);
              
              setIsLoading(false);
              setShowReorient(true); 
            } catch (err: any) {
               console.error(err);
               setErrorMsg("Failed to process STL geometry.");
               setIsLoading(false);
               loadDefaultModel();
            }
        }, 
        (xhr) => { if (xhr.lengthComputable) setLoadingProgress(Math.round((xhr.loaded / xhr.total) * 100)); },
        (err) => { console.error(err); setErrorMsg("Failed to load file."); setIsLoading(false); loadDefaultModel(); }
      );
  };

  // --- FILE UPLOAD HANDLER ---
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
            rotation: { x: -90, y: 0, z: 0 } // Standard STL orientation
        });
    } else {
        setErrorMsg("Invalid file type. Please upload .STL");
        setIsLoading(false);
    }
  };

  const handleResetToDefault = () => {
      loadDefaultModel();
  };

  const resetView = () => {
      setIsLocked(true);
      if (controlsRef.current && vehicleRef.current && cameraRef.current) {
          // Hard Reset
          const vehiclePos = vehicleRef.current.position;
          controlsRef.current.target.copy(vehiclePos);
          // Set camera to fixed offset
          cameraRef.current.position.copy(vehiclePos).add(new THREE.Vector3(0, 20, 20));
          controlsRef.current.update();
      }
  };

  const rotateMesh = (axis: 'x' | 'y' | 'z') => {
      if (modelConfig) {
          updateConfig({
              rotation: {
                  ...modelConfig.rotation,
                  [axis]: modelConfig.rotation[axis] + 90
              }
          });
      }
  };

  const handleExportPath = async () => {
      if (history.length === 0) return;
      
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 50));

      const headers = [
          "Time_ms", "True_Lat", "True_Lon", "True_Alt_m", "True_LocalX", "True_LocalY", "True_LocalZ",
          "", // Sep
          "Pred_Lat", "Pred_Lon", "Pred_Alt_m", "Pred_LocalX", "Pred_LocalY", "Pred_LocalZ",
          "", // Sep
          "Calc_Land_Lat", "Calc_Land_Lon", "Calc_Land_LocalX", "Calc_Land_LocalZ"
      ].join(",");

      const rows: string[] = [];
      const maxRows = Math.max(history.length, prediction ? prediction.path.length : 0);

      for (let i = 0; i < maxRows; i++) {
          const rowData: string[] = [];
          
          if (i < history.length) {
              const p = history[i];
              if (Math.abs(p.latitude) > 0.0001) {
                  const local = toLocal(p.latitude, p.longitude, p.relAltitude);
                  rowData.push(
                      p.timeElapsed.toFixed(0),
                      p.latitude.toFixed(6),
                      p.longitude.toFixed(6),
                      p.relAltitude.toFixed(2),
                      local.x.toFixed(2),
                      local.y.toFixed(2),
                      local.z.toFixed(2)
                  );
              } else {
                  rowData.push(p.timeElapsed.toFixed(0), "", "", "", "", "", "");
              }
          } else {
              rowData.push("", "", "", "", "", "", ""); // Empty padding
          }

          rowData.push(""); 

          if (prediction && i < prediction.path.length) {
              const pt = prediction.path[i];
              const localP = toLocal(pt.lat, pt.lon, pt.alt);
              rowData.push(
                  pt.lat.toFixed(6),
                  pt.lon.toFixed(6),
                  pt.alt.toFixed(2),
                  localP.x.toFixed(2),
                  localP.y.toFixed(2),
                  localP.z.toFixed(2)
              );
          } else {
              rowData.push("", "", "", "", "", "");
          }

          rowData.push(""); 

          let landStr = ["", "", "", ""];
          if (i < history.length && i > 5) {
              const p = history[i];
              if (Math.abs(p.latitude) > 0.0001 && p.relAltitude > 10) {
                  const histSlice = history.slice(Math.max(0, i - 5), i + 1);
                  const pred = predictLanding(
                      p.latitude, p.longitude, p.relAltitude,
                      p.vSpeed, p.hSpeed, p.heading,
                      settings.descent, settings.wind, settings.landing,
                      0, p.density, histSlice
                  );

                  if (pred) {
                      const localL = toLocal(pred.lat, pred.lon, 0);
                      landStr = [
                          pred.lat.toFixed(6),
                          pred.lon.toFixed(6),
                          localL.x.toFixed(2),
                          localL.z.toFixed(2)
                      ];
                  }
              }
          }
          rowData.push(...landStr);

          rows.push(rowData.join(","));
      }

      const csvContent = headers + "\n" + rows.join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.setAttribute("download", `flight_analysis_3d_${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setIsLoading(false);
  };

  return (
    <div className="w-full h-full relative group bg-black/40">
       <div ref={containerRef} className="w-full h-full cursor-move" />
       
       {/* COMPASS WIDGET (Bottom Left) */}
       <div className="absolute bottom-4 left-4 z-20 pointer-events-none" title="Camera Orientation">
            <div className="relative w-16 h-16 bg-slate-900/80 backdrop-blur-md rounded-full border border-slate-700 shadow-xl flex items-center justify-center">
                {/* STATIC Dial (N is Up) */}
                <div className="w-full h-full absolute inset-0 flex items-center justify-center">
                    <div className="absolute top-1 font-bold text-[10px] text-rose-500">N</div>
                    <div className="absolute bottom-1 font-bold text-[9px] text-slate-500">S</div>
                    <div className="absolute right-1.5 font-bold text-[9px] text-slate-500">E</div>
                    <div className="absolute left-1.5 font-bold text-[9px] text-slate-500">W</div>
                    
                    {/* Tick Marks */}
                    <div className="absolute w-[1px] h-full bg-slate-800/50"></div>
                    <div className="absolute w-full h-[1px] bg-slate-800/50"></div>
                    
                    {/* Small Arrow for N */}
                    <div className="absolute top-3 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[6px] border-b-rose-500"></div>
                </div>
                
                {/* ROTATING Arrow */}
                <div ref={compassArrowRef} className="z-10 transition-transform duration-75 ease-linear will-change-transform flex items-center justify-center w-full h-full absolute inset-0">
                     {/* Inner Icon Container with background */}
                     <div className="bg-slate-800 rounded-full p-1.5 border border-slate-600 shadow-sm">
                        {/* Lucide Navigation points NE (45deg). Rotate -45deg to point Up (0deg) relative to container */}
                        <Navigation className="w-4 h-4 text-cyan-400 fill-current transform -rotate-45" /> 
                     </div>
                </div>

                {/* AETHER: Dynamic Wind Direction Overlay */}
                {currentWind.speed > 0 && (
                    <div 
                      className="absolute inset-0 flex flex-col items-center justify-start pt-1 pointer-events-none z-10"
                      style={{ transform: `rotate(${currentWind.dir}deg)` }}
                    >
                        <div className="flex gap-0.5 opacity-90">
                            <ArrowDown className="w-2.5 h-2.5 text-slate-300 drop-shadow-[0_0_3px_rgba(255,255,255,0.4)] animate-pulse" />
                            <ArrowDown className="w-2.5 h-2.5 text-slate-300 drop-shadow-[0_0_3px_rgba(255,255,255,0.4)] animate-pulse delay-75" />
                        </div>
                    </div>
                )}
            </div>
       </div>

       {/* LEFT CONTROLS (Camera) */}
       <div className="absolute top-12 left-3 z-10 flex flex-col gap-1 pointer-events-auto bg-black/60 backdrop-blur rounded-lg border border-slate-800 p-1 shadow-xl scale-90 origin-top-left">
          <div className="h-px bg-slate-700 my-0.5 mx-1"></div>
          <button onClick={() => setIsLocked(!isLocked)} className={`p-1.5 rounded hover:bg-slate-700 ${isLocked ? 'text-emerald-400' : 'text-slate-400'}`} title={isLocked ? "Unlock Camera" : "Lock to Vehicle"}>
              {isLocked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
          </button>
          <button onClick={() => setShowLegend(!showLegend)} className={`p-1.5 rounded hover:bg-slate-700 ${showLegend ? 'text-indigo-400' : 'text-slate-400'}`} title="Toggle Legend"><Info className="w-4 h-4"/></button>
       </div>

       {/* RIGHT CONTROLS (Model Tools) */}
       <div className="absolute top-2 right-2 z-20 flex flex-col gap-2 items-end pointer-events-auto">
            {modelConfig?.fileName && (
                <div className="bg-indigo-900/80 backdrop-blur border border-indigo-500/30 px-2 py-1 rounded text-[9px] font-bold text-indigo-100 flex items-center gap-1 animate-in fade-in slide-in-from-right-2 mb-1">
                    <span>{modelConfig.fileName.length > 15 ? modelConfig.fileName.substring(0,12)+'...' : modelConfig.fileName}</span>
                    <button onClick={handleResetToDefault} className="hover:text-white"><X className="w-3 h-3" /></button>
                </div>
            )}
            
            <label className={`p-1.5 rounded bg-black/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700 backdrop-blur-sm cursor-pointer shadow-lg ${isLoading ? 'opacity-50 pointer-events-none' : ''}`} title="Upload Custom .STL Model (Max 15MB)">
                <Upload className="w-3.5 h-3.5" /><input type="file" accept=".stl" ref={fileInputRef} className="hidden" onChange={handleFileUpload} disabled={isLoading} />
            </label>
            <button onClick={handleExportPath} className="p-1.5 rounded bg-black/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700 backdrop-blur-sm shadow-lg" title="Download Analysis Data (CSV) - True Path, Trajectory & Landing Prediction"><Download className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setShowResize(!showResize); setShowReorient(false); }} className={`p-1.5 rounded transition-colors border backdrop-blur-sm shadow-lg ${showResize ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-black/60 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Scale Model"><Scaling className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setShowReorient(!showReorient); setShowResize(false); }} className={`p-1.5 rounded transition-colors border backdrop-blur-sm shadow-lg ${showReorient ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-black/60 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Rotate Model Axis"><Rotate3d className="w-3.5 h-3.5" /></button>
            <button onClick={resetView} className="p-1.5 rounded bg-black/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700 backdrop-blur-sm shadow-lg" title="Reset Camera View"><Eye className="w-3.5 h-3.5" /></button>
            {modelConfig?.isCustom && (<button onClick={handleResetToDefault} className="p-1.5 rounded bg-black/60 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition-colors border border-slate-700 backdrop-blur-sm shadow-lg" title="Reset to Default Model"><RefreshCw className="w-3.5 h-3.5" /></button>)}
       </div>

       {/* POPUP PANELS */}
       {showResize && modelConfig && (
            <div className="absolute top-10 right-12 z-30 bg-black/90 border border-slate-700 p-3 rounded-lg backdrop-blur-md shadow-2xl flex flex-col gap-2 w-32 animate-in fade-in slide-in-from-right-5 duration-200">
                <div className="flex justify-between items-center pb-1 border-b border-slate-700/50"><span className="text-[9px] font-bold text-slate-400 uppercase">Scale</span><button onClick={() => setShowResize(false)} className="text-slate-500 hover:text-white"><X className="w-3 h-3"/></button></div>
                <div className="flex items-center gap-2"><input type="range" min="0.1" max="5" step="0.1" value={modelConfig.scale} onChange={(e) => updateConfig({ scale: parseFloat(e.target.value) })} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"/></div>
                <div className="text-right text-[10px] font-mono text-cyan-400">{modelConfig.scale.toFixed(1)}x</div>
            </div>
       )}
       {showReorient && modelConfig?.isCustom && (
             <div className="absolute top-20 right-12 z-30 bg-black/90 border border-slate-700 p-3 rounded-lg backdrop-blur-md shadow-2xl flex flex-col gap-2 w-40 animate-in fade-in slide-in-from-right-5 duration-200">
                <div className="flex justify-between items-center pb-1 border-b border-slate-700/50"><span className="text-[9px] font-bold text-slate-400 uppercase">Align Axis</span><button onClick={() => setShowReorient(false)} className="text-slate-500 hover:text-white"><X className="w-3 h-3"/></button></div>
                <p className="text-[8px] text-slate-500 leading-tight">Rotate mesh to match sensor frame (Front/Up).</p>
                <div className="grid grid-cols-3 gap-1">
                    <button onClick={() => rotateMesh('x')} className="bg-slate-800 hover:bg-cyan-900/50 border border-slate-600 text-[10px] text-cyan-400 font-bold py-1 rounded transition-colors">X</button>
                    <button onClick={() => rotateMesh('y')} className="bg-slate-800 hover:bg-emerald-900/50 border border-slate-600 text-[10px] text-emerald-400 font-bold py-1 rounded transition-colors">Y</button>
                    <button onClick={() => rotateMesh('z')} className="bg-slate-800 hover:bg-indigo-900/50 border border-slate-600 text-[10px] text-indigo-400 font-bold py-1 rounded transition-colors">Z</button>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[8px] text-center font-mono text-slate-400"><span>{modelConfig.rotation.x % 360}°</span><span>{modelConfig.rotation.y % 360}°</span><span>{modelConfig.rotation.z % 360}°</span></div>
             </div>
       )}

       {/* LOADING & ERROR STATES */}
       {isLoading && (
          <div className="absolute inset-0 bg-black/80 z-40 flex flex-col items-center justify-center backdrop-blur-sm p-4 text-center">
             <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
             <span className="text-xs text-slate-200 font-bold mb-1">Generating 3D Analysis Data...</span>
             <p className="text-[9px] text-slate-400 mb-2">Calculating full landing predictions for history...</p>
             <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-300 ease-out" style={{ width: `${loadingProgress}%` }} />
             </div>
             <span className="text-[10px] text-slate-400 font-mono mt-1">{loadingProgress}%</span>
          </div>
       )}
       {errorMsg && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-rose-950/90 border border-rose-500 text-rose-200 px-3 py-1.5 rounded shadow-lg flex items-center gap-2 text-[10px] font-bold animate-in slide-in-from-top-2 fade-in">
                <AlertCircle className="w-3 h-3" />
                {errorMsg}
                <button onClick={() => setErrorMsg(null)}><X className="w-3 h-3 hover:text-white" /></button>
            </div>
       )}

       {/* LEGEND OVERLAY */}
       {showLegend && (
           <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-md border border-slate-700 rounded-lg p-3 shadow-2xl animate-in slide-in-from-bottom-2 z-10 pointer-events-none">
               <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 border-b border-slate-700 pb-1">3D Visualizer</h4>
               <div className="space-y-2 text-[10px] font-mono text-slate-300">
                   <div className="flex items-center gap-2">
                       <Navigation className="w-3 h-3 text-white" />
                       <span>Vehicle ({modelConfig?.isCustom ? 'Custom' : settings.graphics.vehicleIcon})</span>
                   </div>
                   <div className="flex items-center gap-2">
                       <div className="w-3 h-0.5 bg-cyan-400 rounded"></div>
                       <span>Flight Path</span>
                   </div>
                   <div className="flex items-center gap-2">
                       <div className="w-3 h-0.5 border-t border-dashed border-amber-400"></div>
                       <span>Prediction</span>
                   </div>
                   <div className="flex items-center gap-2">
                       <Crosshair className="w-3 h-3 text-rose-500" />
                       <span>Landing Zone</span>
                   </div>
                   <div className="flex items-center gap-2">
                       <Wind className="w-3 h-3 text-slate-500 opacity-50" />
                       <span>Wind Particles</span>
                   </div>
                   <div className="flex items-center gap-2">
                       <Target className="w-3 h-3 text-slate-600" />
                       <span>Origin (0,0)</span>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};
