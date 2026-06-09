/**
 * Utility for audio and haptic feedback during operational tasks
 */

export const feedback = {
  /**
   * Sound for successful operations (bip bip)
   */
  success: () => {
    // Run asynchronously to immediately free the synchronous click/render execution loop
    setTimeout(() => {
      try {
        // Safe check for sandboxed iframe boundaries
        const isIframe = typeof window !== 'undefined' && window.self !== window.top;
        if (isIframe) {
          console.log("[Feedback] Skipped audio feedback inside sandbox iframe context to avoid thread stalls.");
          return;
        }

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) return;
        const audioCtx = new AudioCtxClass();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);

        // Automatically dispose of context to prevent resource fatigue and frozen main thread
        setTimeout(() => {
          try {
            audioCtx.close();
          } catch (err) {
            // Ignore close errors
          }
        }, 200);

        // Mobile vibration
        if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
          navigator.vibrate(50);
        }
      } catch (e) {
        console.warn("Audio feedback not supported or blocked", e);
      }
    }, 0);
  },

  /**
   * Sound for error/mismatch
   */
  error: () => {
    // Run asynchronously to immediately free the synchronous click/render execution loop
    setTimeout(() => {
      try {
        // Safe check for sandboxed iframe boundaries
        const isIframe = typeof window !== 'undefined' && window.self !== window.top;
        if (isIframe) {
          console.log("[Feedback] Skipped error sound haptics inside sandbox iframe context to avoid browser locks.");
          return;
        }

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) return;
        const audioCtx = new AudioCtxClass();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);

        // Automatically dispose of context to prevent resource fatigue and frozen main thread
        setTimeout(() => {
          try {
            audioCtx.close();
          } catch (err) {
            // Ignore close errors
          }
        }, 400);

        // Mobile vibration pattern for error
        if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
          navigator.vibrate([100, 50, 100]);
        }
      } catch (e) {
        console.warn("Audio feedback not supported or blocked", e);
      }
    }, 0);
  }
};

