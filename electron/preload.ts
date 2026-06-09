import { contextBridge, ipcRenderer } from 'electron';

// Expose the printDocument capability securely to the renderer process
contextBridge.exposeInMainWorld('electron', {
  printDocument: (
    html: string,
    widthMm: number,
    heightMm: number
  ): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('print-html-job', {
      html,
      widthMm,
      heightMm
    });
  }
});
