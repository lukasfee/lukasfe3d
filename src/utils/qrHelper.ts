import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface StartScannerOptions {
  fps?: number;
  qrboxSelection?: (viewWidth: number, viewHeight: number) => { width: number; height: number };
}

/**
 * Selects the preferred camera ID based on platform environment:
 * - Desktop: No rear focus filter. Select the last used if saved in localStorage ('nexus.qrscanner.preferredCameraId'), otherwise the first.
 * - Mobile: Uses the rear camera detection heuristic.
 */
export function selecionarIdCameraPreferida(
  dispositivos: { id: string; label: string }[] | MediaDeviceInfo[],
  isMobile: boolean
): string | undefined {
  if (!dispositivos || dispositivos.length === 0) return undefined;

  // Map to a common structure
  const devList = dispositivos.map((d: any) => ({
    id: d.id || d.deviceId,
    label: d.label || ''
  }));

  // Prioritize previously saved preferred camera both in mobile and desktop
  const savedId = localStorage.getItem('nexus.qrscanner.preferredCameraId');
  if (savedId) {
    const exists = devList.some(d => d.id === savedId);
    if (exists) {
      return savedId;
    }
  }

  if (isMobile) {
    // Keep standard rear-camera heuristics for mobile
    const rearDevice = devList.find(d => {
      const label = (d.label || '').toLowerCase();
      return label.includes('back') || 
             label.includes('traseira') || 
             label.includes('rear') || 
             label.includes('environment') ||
             label.includes('reverso') ||
             label.includes('traseiro') ||
             label.includes('tras');
    });
    return rearDevice ? rearDevice.id : devList[0].id;
  } else {
    // Desktop: If not saved or not existing, return the first one
    return devList[0].id;
  }
}

/**
 * Robustly starts the HTML5 QR Code scanner under a series of fallbacks.
 * Specifically handles the differences between PC (typically single front camera) 
 * and Mobile (typically rear camera and multiple options), and mitigates iframe issues.
 */
export async function startScannerWithFallback(
  html5QrCode: Html5Qrcode,
  onScanSuccess: (decodedText: string) => void,
  onScanFailure: (errorMessage: string) => void = () => {},
  options: StartScannerOptions = {}
): Promise<void> {
  if ((window as any).__nexusQrScannerAtivo) {
    const errMsg = "Outro leitor já está ativo, feche-o primeiro";
    alert(errMsg);
    throw new Error(errMsg);
  }
  (window as any).__nexusQrScannerAtivo = true;

  const originalStop = html5QrCode.stop.bind(html5QrCode);
  html5QrCode.stop = async function() {
    (window as any).__nexusQrScannerAtivo = false;
    return originalStop();
  };

  const originalClear = html5QrCode.clear.bind(html5QrCode);
  html5QrCode.clear = function() {
    (window as any).__nexusQrScannerAtivo = false;
    return originalClear();
  };

  try {
    const { fps = 20 } = options; // Boost FPS to 20 for smoother scanning and faster response times

    // Custom high-resolution camera constraints targeting rear camera with crisp focus
    const defaultVideoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "environment"
    };

    const baseConfig: any = {
      fps: fps,
      videoConstraints: defaultVideoConstraints,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: false
      }
    };

    // Add a responsive qrbox if a selector callback is provided
    if (options.qrboxSelection) {
      baseConfig.qrbox = options.qrboxSelection;
    } else {
      // Default smart proportional scanner box if none specified
      baseConfig.qrbox = (viewWidth: number, viewHeight: number) => {
        const minEdge = Math.min(viewWidth, viewHeight);
        const size = Math.floor(minEdge * 0.75);
        return { width: size, height: size };
      };
    }

    // Ensure clean camera resolution mapping without duplicate pre-permission tracks that lock the resource.

    try {
      // 1. Try querying available camera devices first
      const devices = await Html5Qrcode.getCameras().catch((e) => {
        console.warn("Html5Qrcode.getCameras() rejected/failed, likely missing permission initially:", e);
        return [];
      });

      if (devices && devices.length > 0) {
        console.log("Found device cameras:", devices);
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
        const selectedCameraId = selecionarIdCameraPreferida(devices, isMobile);
        const activeDev = devices.find(d => d.id === selectedCameraId);
        console.log(`Starting with camera ID: ${selectedCameraId} (Label: ${activeDev?.label ?? devices[0].label})`);

        try {
          await html5QrCode.start(
            selectedCameraId!,
            baseConfig,
            onScanSuccess,
            onScanFailure
          );
          
          // Attempt to apply active continuous focus to stream track if supported
          try {
            const track = (html5QrCode as any).getRunningTrack();
            if (track) {
              const capabilities = track.getCapabilities() as any;
              if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                await track.applyConstraints({
                  advanced: [{ focusMode: 'continuous' }]
                } as any);
              }
            }
          } catch (focusErr) {
            console.warn("Unable to force continuous focus constraint:", focusErr);
          }
          
          return; // Success!
        } catch (idStartError) {
          console.warn("Failed starting with specific camera ID, trying constraints fallback:", idStartError);
        }
      }
    } catch (error) {
      console.warn("Exception during camera list discovery, continuing to constraint-based fallback:", error);
    }

    // 2. Constraint fallbacks
    const attemptConstraints = [
      { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      { facingMode: "environment" },
      { facingMode: "user" },
      {} // Absolute baseline fallback
    ];

    for (const constraint of attemptConstraints) {
      try {
        console.log("Attempting scanner with constraint:", constraint);
        await html5QrCode.start(
          constraint as any,
          {
            ...baseConfig,
            videoConstraints: constraint
          },
          onScanSuccess,
          onScanFailure
        );
        console.log("Successfully started scanner with fallback constraint:", constraint);
        return; // Success, stop trying!
      } catch (constraintErr) {
        console.warn(`Failed start with constraint ${JSON.stringify(constraint)}:`, constraintErr);
      }
    }

    // 3. Absolute minimum fallback with no custom constraints
    console.log("All robust options failed. Initiating absolute baseline start...");
    await html5QrCode.start(
      { facingMode: "environment" },
      baseConfig,
      onScanSuccess,
      onScanFailure
    );
  } catch (err) {
    (window as any).__nexusQrScannerAtivo = false;
    throw err;
  }
}
