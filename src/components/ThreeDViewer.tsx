import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { Minimize2, Maximize2, RotateCcw, Loader2, AlertCircle } from 'lucide-react';

interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

interface ThreeDViewerProps {
  file: {
    name: string;
    type: string;
    data: string; // Base64 or DataURL
  };
  onClose?: () => void;
}

function dataURItoBlob(dataURI: string): Blob {
  const isDataURI = dataURI.startsWith('data:');
  let byteString: string;
  let mimeString: string = 'application/octet-stream';
  
  if (isDataURI) {
    const parts = dataURI.split(',');
    const meta = parts[0];
    const mimeMatch = meta.match(/data:([^;]+)/);
    if (mimeMatch) {
      mimeString = mimeMatch[1];
    }
    if (meta.indexOf('base64') >= 0) {
      byteString = atob(parts[1]);
    } else {
      byteString = decodeURIComponent(parts[1]);
    }
  } else {
    byteString = atob(dataURI);
  }
  
  const ia = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  return new Blob([ia], { type: mimeString });
}

export const ThreeDViewer: React.FC<ThreeDViewerProps> = ({ file, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Refs to controls to trigger actions from outside the three.js loop
  const resetCameraRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let controls: OrbitControls | null = null;
    let animationFrameId: number | null = null;
    let objectUrl: string | null = null;
    let resizeObserver: ResizeObserver | null = null;

    try {
      // 1. Scene initialization
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0d); // Very elegant off-black slate dark mode background

      // 2. Camera setup
      const containerWidth = containerRef.current.clientWidth || 400;
      const containerHeight = containerRef.current.clientHeight || 400;
      camera = new THREE.PerspectiveCamera(45, containerWidth / containerHeight, 0.1, 1000);
      camera.position.set(100, 100, 100);

      // 3. Renderer setup
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(containerWidth, containerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x0a0a0d, 1);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Clear existing canvas elements
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(renderer.domElement);

      // 4. Controls setup
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI / 1.8; // Don't orbit below ground
      controls.minDistance = 2;
      controls.maxDistance = 500;

      // 5. Lighting setup
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight1.position.set(100, 150, 50);
      dirLight1.castShadow = true;
      scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0x06b6d4, 0.4); // Subtle cyan tint secondary light
      dirLight2.position.set(-100, 100, -50);
      scene.add(dirLight2);

      const pointLight = new THREE.PointLight(0xffffff, 0.5, 300);
      pointLight.position.set(0, 50, 0);
      scene.add(pointLight);

      // Grid helper to establish a sense of 3D spatial ground
      const gridHelper = new THREE.GridHelper(200, 50, 0x33333f, 0x1f1f25);
      gridHelper.position.y = -0.5;
      scene.add(gridHelper);

      // 6. Convert file data to Object URL
      const blob = dataURItoBlob(file.data);
      objectUrl = URL.createObjectURL(blob);

      // Helper function to process the loaded geometry/group
      const processLoadedObject = (object: THREE.Object3D) => {
        if (!scene || !camera || !controls) return;

        // Add to scene
        scene.add(object);

        // Calculate Bounding Box
        const box = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        box.getCenter(center);
        
        // Center the model at 0, 0, 0
        object.position.sub(center);
        
        // Offset relative height to sit nicely on the grid helper
        const boxMinY = box.min.y - center.y;
        object.position.y -= boxMinY;

        // Recalculate dimensions
        const size = new THREE.Vector3();
        box.getSize(size);
        setDimensions({
          width: Math.round(size.x * 10) / 10,
          height: Math.round(size.y * 10) / 10,
          depth: Math.round(size.z * 10) / 10,
        });

        // Smart zoom: adjust camera distance based on computed dimensions
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 2.2; // Extra room factor

        const offsetPosition = new THREE.Vector3(cameraZ, cameraZ * 0.8, cameraZ);
        camera.position.copy(offsetPosition);
        camera.lookAt(0, maxDim * 0.3, 0);

        controls.target.set(0, maxDim * 0.1, 0);
        controls.update();

        // Create resets
        resetCameraRef.current = () => {
          if (!camera || !controls) return;
          camera.position.copy(offsetPosition);
          controls.target.set(0, maxDim * 0.1, 0);
          controls.update();
        };

        setLoading(false);
      };

      const fileType = file.type.toLowerCase();

      if (fileType === 'stl') {
        const loader = new STLLoader();
        loader.load(
          objectUrl,
          (geometry) => {
            // STL returns geometry. Create a nice default material.
            const material = new THREE.MeshStandardMaterial({
              color: 0x06b6d4, // Beautiful Cyan metallic color
              roughness: 0.3,
              metalness: 0.7,
              side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            processLoadedObject(mesh);
          },
          () => {},
          (err) => {
            console.error('Error loading STL:', err);
            setError('Não foi possível carregar o modelo STL.');
            setLoading(false);
          }
        );
      } else if (fileType === 'glb' || fileType === 'gltf') {
        const loader = new GLTFLoader();
        loader.load(
          objectUrl,
          (gltf) => {
            const model = gltf.scene;
            model.traverse((child: any) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // If material is completely blank, give it a stylish metallic look
                if (!child.material || (child.material as any).transparent && (child.material as any).opacity === 0) {
                  child.material = new THREE.MeshStandardMaterial({
                    color: 0x94a3b8,
                    roughness: 0.4,
                    metalness: 0.5,
                  });
                }
              }
            });
            processLoadedObject(model);
          },
          () => {},
          (err) => {
            console.error('Error loading GLTF/GLB:', err);
            setError('Não foi possível carregar o modelo 3D.');
            setLoading(false);
          }
        );
      } else if (fileType === '3mf') {
        // 3MF support
        try {
          const loader = new ThreeMFLoader();
          loader.load(
            objectUrl,
            (object) => {
              object.traverse((child: any) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });
              processLoadedObject(object);
            },
            () => {},
            (err) => {
              console.error('Error loading 3MF inside load callback:', err);
              setError('Visualização 3MF indisponível neste ambiente. Use GLB/GLTF para melhor compatibilidade.');
              setLoading(false);
            }
          );
        } catch (ex) {
          console.error('3MFLoader initialization error:', ex);
          setError('Visualização 3MF indisponível neste ambiente. Use GLB/GLTF para melhor compatibilidade.');
          setLoading(false);
        }
      } else {
        setError(`Formato de arquivo '.${fileType}' não suportado. Use GLB, GLTF, STL ou 3MF.`);
        setLoading(false);
      }

      // 7. Animation Loop
      const animate = () => {
        if (!renderer || !scene || !camera || !controls) return;
        animationFrameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // 8. Resize Handling with ResizeObserver
      resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0) return;
        const width = entries[0].contentRect.width || containerRef.current?.clientWidth || 400;
        const height = entries[0].contentRect.height || containerRef.current?.clientHeight || 400;
        if (camera && renderer) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        }
      });
      resizeObserver.observe(containerRef.current);

    } catch (err) {
      console.error('ThreeDViewer runtime exception:', err);
      setError('Ocorreu um erro ao carregar o visualizador 3D.');
      setLoading(false);
    }

    return () => {
      // Clean up resources to prevent memory leaks in the Single Page Application format (and Totem modal closures)
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (controls) {
        controls.dispose();
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      if (scene) {
        scene.traverse((obj: any) => {
          if (obj.isMesh) {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose());
              } else {
                obj.material.dispose();
              }
            }
          }
        });
      }
      if (renderer) {
        renderer.dispose();
      }
    };
  }, [file]);

  const handleResetCamera = () => {
    if (resetCameraRef.current) {
      resetCameraRef.current();
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={`relative flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-[#0a0a0d] p-6' : 'w-full h-full'}`}>
      
      {/* Viewer Canvas Area */}
      <div 
        ref={containerRef} 
        className="w-full flex-1 rounded-3xl overflow-hidden bg-[#0a0a0c] relative select-none border border-white/5 shadow-inner"
        style={{ minHeight: isFullscreen ? 'auto' : '260px' }}
      />

      {/* Elegant Loading overlay */}
      {loading && !error && (
        <div className="absolute inset-0 bg-[#0a0a0d]/80 rounded-3xl flex flex-col items-center justify-center gap-3 z-10">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <span className="text-[9px] font-black uppercase text-cyan-400 tracking-widest">Carregando modelo 3D...</span>
        </div>
      )}

      {/* Elegant Error override */}
      {error && (
        <div className="absolute inset-0 bg-[#0a0a0d] rounded-3xl flex flex-col items-center justify-center gap-2.5 p-6 text-center border border-dashed border-red-500/20 z-10">
          <AlertCircle className="w-8 h-8 text-rose-500" />
          <p className="text-[10px] font-black text-rose-500 uppercase tracking-wider">Aviso do Sistema</p>
          <p className="text-xs text-zinc-400 max-w-xs">{error}</p>
          {onClose && (
            <button 
              onClick={onClose} 
              className="mt-2 px-3 py-1.5 bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg text-[9px] font-black uppercase text-white tracking-widest cursor-pointer transition-all"
            >
              Voltar para Imagens
            </button>
          )}
        </div>
      )}

      {/* Controls HUD */}
      {!loading && !error && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          <button 
            onClick={handleResetCamera}
            className="p-2 bg-black/60 border border-white/5 hover:bg-black/90 text-white rounded-xl active:scale-90 transition-all cursor-pointer flex items-center justify-center shadow-md hover:border-cyan-500/20"
            title="Resetar Câmera"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
          </button>
          <button 
            onClick={toggleFullscreen}
            className="p-2 bg-black/60 border border-white/5 hover:bg-black/90 text-white rounded-xl active:scale-90 transition-all cursor-pointer flex items-center justify-center shadow-md hover:border-cyan-500/20"
            title={isFullscreen ? "Minimizar" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-cyan-400" /> : <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />}
          </button>
        </div>
      )}

      {/* Metadata Panel: Dimensions Display */}
      {!loading && !error && dimensions && (
        <div className="absolute bottom-3 left-3 bg-black/60 border border-white/5 rounded-xl px-3 py-2 text-[8px] md:text-[9px] font-mono uppercase tracking-wider text-zinc-400 z-10 max-w-[180px] pointer-events-none backdrop-blur-sm">
          <p className="text-cyan-400 font-extrabold mb-1">Dimensões Reais</p>
          <div className="grid grid-cols-3 gap-x-2">
            <div>L: <span className="text-white font-bold">{dimensions.width}</span> mm</div>
            <div>A: <span className="text-white font-bold">{dimensions.height}</span> mm</div>
            <div>P: <span className="text-white font-bold">{dimensions.depth}</span> mm</div>
          </div>
        </div>
      )}

      {/* Close Fullscreen Overlay (if fullscreen mode is active) */}
      {isFullscreen && (
        <button 
          onClick={toggleFullscreen}
          className="absolute top-6 left-6 px-4 py-2 bg-black/60 border border-white/10 hover:bg-black/90 text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer"
        >
          Sair da Visualização
        </button>
      )}
    </div>
  );
};
