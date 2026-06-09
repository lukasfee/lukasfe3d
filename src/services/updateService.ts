import packageJson from '../../package.json';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  apkUrl?: string;
  publishDate?: string;
  releaseUrl?: string;
}

/**
 * Checks if the current platform is Android via Capacitor (always false as Android integration is removed)
 */
export const isAndroidNative = (): boolean => {
  return false;
};

/**
 * Helper to compare semantic versions (e.g., "1.2.0" vs "1.2.1")
 * Returns positive if v2 > v1, negative if v1 > v2, 0 if equal
 */
export const compareVersions = (v1: string, v2: string): number => {
  const parseVersion = (v: string): number[] => {
    const match = v.match(/\d+\.\d+(\.\d+)?/);
    if (!match) {
      const fallbackMatch = v.match(/\d+/);
      return fallbackMatch ? [Number(fallbackMatch[0])] : [0];
    }
    return match[0].split('.').map(Number);
  };

  const cleanV1 = parseVersion(v1);
  const cleanV2 = parseVersion(v2);

  for (let i = 0; i < Math.max(cleanV1.length, cleanV2.length); i++) {
    const num1 = cleanV1[i] || 0;
    const num2 = cleanV2[i] || 0;
    if (num2 !== num1) {
      return num2 - num1;
    }
  }
  return 0;
};

/**
 * Checks GitHub Releases for a newer version of the APK (always false as Android integration is removed)
 */
export const checkAndroidUpdate = async (
  owner?: string,
  repo?: string
): Promise<UpdateInfo> => {
  const currentVersion = packageJson.version;
  return {
    available: false,
    currentVersion,
    latestVersion: currentVersion,
    releaseNotes: '',
    releaseUrl: ''
  };
};

/**
 * Downloads a new APK file and saves it (always returns unsupported error)
 */
export const downloadAndInstallApk = async (
  apkUrl: string,
  onProgress: (progress: number) => void
): Promise<{ success: boolean; error?: string }> => {
  return { success: false, error: 'Plataforma Android não é suportada neste aplicativo.' };
};
