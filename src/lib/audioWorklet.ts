// AudioWorklet module for real-time audio processing and level metering
// Replaces deprecated ScriptProcessorNode with high-performance audio thread processing

const workletCode = `
class VolumeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._volume = 0;
    this._lastUpdate = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0];
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    this._volume = Math.max(rms, this._volume * 0.95);

    const currentTime = currentTime || 0;
    if (currentTime - this._lastUpdate > 0.05) {
      this.port.postMessage({ volume: this._volume });
      this._lastUpdate = currentTime;
    }

    return true;
  }
}

registerProcessor('volume-processor', VolumeProcessor);
`;

export async function createVolumeMeterWorklet(
  audioContext: AudioContext,
  mediaStream: MediaStream,
  onVolumeChange: (vol: number) => void
): Promise<{ node: AudioWorkletNode | null; disconnect: () => void }> {
  try {
    if (!audioContext.audioWorklet) {
      // Fallback for browsers without AudioWorklet
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let animId: number;
      const update = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length / 255;
        onVolumeChange(avg);
        animId = requestAnimationFrame(update);
      };
      update();

      return {
        node: null,
        disconnect: () => {
          cancelAnimationFrame(animId);
          try { source.disconnect(); } catch (e) {}
        }
      };
    }

    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const source = audioContext.createMediaStreamSource(mediaStream);
    const workletNode = new AudioWorkletNode(audioContext, 'volume-processor');

    workletNode.port.onmessage = (event) => {
      if (typeof event.data?.volume === 'number') {
        onVolumeChange(event.data.volume);
      }
    };

    source.connect(workletNode);

    return {
      node: workletNode,
      disconnect: () => {
        try { source.disconnect(); } catch (e) {}
        try { workletNode.disconnect(); } catch (e) {}
      }
    };
  } catch (err) {
    console.warn('[AudioWorklet setup error, using silent fallback]:', err);
    return {
      node: null,
      disconnect: () => {}
    };
  }
}
