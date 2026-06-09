// Centralized performance tracking utility for Nexus ERP
// Controlled by DEBUG_PERFORMANCE flag to avoid polluting production logs.

export const DEBUG_PERFORMANCE = typeof window !== 'undefined' && 
  (localStorage.getItem('DEBUG_PERFORMANCE') !== 'false'); // Defaults to true, can be disabled manually with localStorage.setItem('DEBUG_PERFORMANCE', 'false')

const startTimeMap = new Map<string, number>();
const renderCountMap = new Map<string, number>();

export const perfLogger = {
  // Start measuring an operation
  start: (label: string) => {
    if (!DEBUG_PERFORMANCE) return;
    startTimeMap.set(label, performance.now());
  },

  // Check if a measurement has started
  hasStarted: (label: string): boolean => {
    return startTimeMap.has(label);
  },

  // Stop measuring and log the duration
  end: (label: string, extraData?: Record<string, any>) => {
    if (!DEBUG_PERFORMANCE) return null;
    if (!startTimeMap.has(label)) {
      return null;
    }
    const startTime = startTimeMap.get(label)!;
    const duration = performance.now() - startTime;
    startTimeMap.delete(label);

    console.log(
      `%c[PERF] ${label}%c completed in %c${duration.toFixed(2)}ms%c`,
      'color: #10b981; font-weight: bold; background: rgba(16,185,129,0.1); padding: 2px 4px; border-radius: 4px;',
      'color: #94a3b8;',
      'color: #38bdf8; font-weight: bold;',
      'color: #94a3b8;',
      extraData ? extraData : ''
    );
    return duration;
  },

  // Increments and logs renders for a component/menu
  logRender: (componentName: string) => {
    if (!DEBUG_PERFORMANCE) return;
    const count = (renderCountMap.get(componentName) || 0) + 1;
    renderCountMap.set(componentName, count);

    // Limit logging frequency for fast updating elements to avoid dragging performance
    if (count % 1 === 0) {
      console.log(
        `%c[PERF_RENDER] ${componentName}%c - Render Count: %c${count}%c`,
        'color: #f59e0b; font-weight: bold; background: rgba(245,158,11,0.1); padding: 2px 4px; border-radius: 4px;',
        'color: #94a3b8;',
        'color: #f43f5e; font-weight: bold;',
        'color: #94a3b8;'
      );
    }
  },

  // Reset render counters
  resetRenderCount: (componentName?: string) => {
    if (componentName) {
      renderCountMap.delete(componentName);
    } else {
      renderCountMap.clear();
    }
  },

  // Log payload size
  logDataLoaded: (collectionName: string, itemsCount: number, dataSizeEstimateBytes?: number) => {
    if (!DEBUG_PERFORMANCE) return;
    const sizeStr = dataSizeEstimateBytes 
      ? `(~${(dataSizeEstimateBytes / 1024).toFixed(2)} KB)` 
      : '';
    console.log(
      `%c[PERF_DATA] Collection "${collectionName}" loaded%c: %c${itemsCount} items%c ${sizeStr}`,
      'color: #ec4899; font-weight: bold; background: rgba(236,72,153,0.1); padding: 2px 4px; border-radius: 4px;',
      'color: #94a3b8;',
      'color: #f472b6; font-weight: bold;',
      'color: #94a3b8;'
    );
  }
};
