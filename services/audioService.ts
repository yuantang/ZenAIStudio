
export async function decodePcm(
  data: Uint8Array,
  ctx: AudioContext | OfflineAudioContext,
  sampleRate: number = 24000
): Promise<AudioBuffer> {
  const byteOffset = data.byteOffset;
  const byteLength = data.byteLength;
  let alignedBuffer = data.buffer;
  let finalByteOffset = byteOffset;

  if (byteOffset % 2 !== 0) {
    const newAb = new ArrayBuffer(byteLength);
    const newU8 = new Uint8Array(newAb);
    newU8.set(data);
    alignedBuffer = newAb;
    finalByteOffset = 0;
  }

  const samplesCount = Math.floor(byteLength / 2);
  const dataInt16 = new Int16Array(alignedBuffer, finalByteOffset, samplesCount);
  const buffer = ctx.createBuffer(1, samplesCount, sampleRate);
  const channelData = buffer.getChannelData(0);

  for (let i = 0; i < samplesCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

/**
 * 混音核心逻辑：实现商用级动态 Ducking 和无缝拼接
 */
export async function mixMeditationAudio(
  voiceBuffers: AudioBuffer[],
  pauses: number[],
  bgMusicUrl: string
): Promise<Blob> {
  const sampleRate = 44100;
  const BGM_BASE_GAIN = 0.18;   
  const BGM_DUCKED_GAIN = 0.05; 
  const VOICE_GAIN = 1.0;
  
  let currentTime = 5.0; 
  const timeline: { start: number, duration: number, buffer: AudioBuffer }[] = [];
  
  voiceBuffers.forEach((buf, i) => {
    timeline.push({ start: currentTime, duration: buf.duration, buffer: buf });
    currentTime += buf.duration + (pauses[i] || 3.0) + 1.5;
  });
  
  const totalDuration = currentTime + 10.0; 
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);

  let bgBuffer: AudioBuffer | null = null;
  try {
    console.log(`[Step 3: Mixing] 正在获取背景音乐: ${bgMusicUrl}`);
    // 关键修复：使用 mode: 'cors' 并确保服务器支持
    const resp = await fetch(bgMusicUrl, { 
      mode: 'cors',
      credentials: 'omit' 
    });
    if (!resp.ok) throw new Error(`HTTP Error ${resp.status}: 背景音资源无法获取`);
    const ab = await resp.arrayBuffer();
    bgBuffer = await offlineCtx.decodeAudioData(ab);
    console.log("[Mixing] 背景音乐解码成功");
  } catch (e) {
    console.warn("[Mixing] 背景音乐绘制跳过，切换至纯净引导模式:", e);
  }

  if (bgBuffer) {
    const bgSource = offlineCtx.createBufferSource();
    bgSource.buffer = bgBuffer;
    bgSource.loop = true;
    const bgGainNode = offlineCtx.createGain();
    
    bgGainNode.gain.setValueAtTime(0, 0);
    bgGainNode.gain.linearRampToValueAtTime(BGM_BASE_GAIN, 5.0);

    timeline.forEach((item, idx) => {
      const duckInDuration = 1.2;
      const duckOutDuration = 3.0;
      const duckStartTime = Math.max(0, item.start - duckInDuration);
      
      bgGainNode.gain.setValueAtTime(BGM_BASE_GAIN, duckStartTime);
      bgGainNode.gain.exponentialRampToValueAtTime(BGM_DUCKED_GAIN, item.start);
      bgGainNode.gain.setValueAtTime(BGM_DUCKED_GAIN, item.start + item.duration);
      
      const nextItem = timeline[idx + 1];
      const gap = nextItem ? nextItem.start - (item.start + item.duration) : Infinity;
      
      if (gap > 5.0) {
        bgGainNode.gain.exponentialRampToValueAtTime(BGM_BASE_GAIN, item.start + item.duration + duckOutDuration);
      } else if (nextItem) {
        bgGainNode.gain.setValueAtTime(BGM_DUCKED_GAIN, nextItem.start);
      }
    });

    const fadeOutStart = totalDuration - 8.0;
    bgGainNode.gain.setValueAtTime(bgGainNode.gain.value, fadeOutStart);
    bgGainNode.gain.linearRampToValueAtTime(0, totalDuration);

    bgSource.connect(bgGainNode);
    bgGainNode.connect(offlineCtx.destination);
    bgSource.start(0);
  }

  timeline.forEach(item => {
    const vSource = offlineCtx.createBufferSource();
    vSource.buffer = item.buffer;
    const vGain = offlineCtx.createGain();
    
    vGain.gain.setValueAtTime(0, item.start);
    vGain.gain.linearRampToValueAtTime(VOICE_GAIN, item.start + 0.2);
    vGain.gain.setValueAtTime(VOICE_GAIN, item.start + item.duration - 0.2);
    vGain.gain.linearRampToValueAtTime(0, item.start + item.duration);

    vSource.connect(vGain);
    vGain.connect(offlineCtx.destination);
    vSource.start(item.start);
  });

  console.log("[Step 3: Mixing] 正在开始离线渲染...");
  const renderedBuffer = await offlineCtx.startRendering();
  console.log("[Mixing] 渲染完成，转换 WAV 格式");
  return bufferToWav(renderedBuffer);
}

function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
  const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16);         
  setUint16(1);          
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);         
  setUint32(0x61746164); 
  setUint32(length - pos - 4);

  for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([outBuffer], { type: "audio/wav" });
}

/**
 * 单语音混音：接收单个连续的语音 Buffer，与背景音乐合成
 * 适用于整篇文本一次性 TTS 合成后的混音场景
 */
export async function mixSingleVoiceAudio(
  voiceBuffer: AudioBuffer,
  bgMusicUrl: string
): Promise<Blob> {
  const sampleRate = 44100;
  const BGM_BASE_GAIN = 0.20;
  const BGM_DUCKED_GAIN = 0.06;
  const VOICE_GAIN = 1.0;
  
  // 前奏 5s + 语音 + 结尾渐出 10s
  const voiceStartTime = 5.0;
  const totalDuration = voiceStartTime + voiceBuffer.duration + 10.0;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);

  // 1. 加载背景音乐
  let bgBuffer: AudioBuffer | null = null;
  try {
    const resp = await fetch(bgMusicUrl, { mode: 'cors', credentials: 'omit' });
    if (!resp.ok) throw new Error(`HTTP Error ${resp.status}`);
    const ab = await resp.arrayBuffer();
    bgBuffer = await offlineCtx.decodeAudioData(ab);
  } catch (e) {
    console.warn("[Mixing] 背景音乐加载失败，使用纯净模式:", e);
  }

  // 2. 背景音乐轨道（含 ducking）
  if (bgBuffer) {
    const bgSource = offlineCtx.createBufferSource();
    bgSource.buffer = bgBuffer;
    bgSource.loop = true;
    const bgGainNode = offlineCtx.createGain();

    // 前奏渐入
    bgGainNode.gain.setValueAtTime(0, 0);
    bgGainNode.gain.linearRampToValueAtTime(BGM_BASE_GAIN, voiceStartTime);

    // 人声开始 → duck down (1.5s 平滑过渡)
    bgGainNode.gain.setValueAtTime(BGM_BASE_GAIN, voiceStartTime);
    bgGainNode.gain.exponentialRampToValueAtTime(BGM_DUCKED_GAIN, voiceStartTime + 1.5);

    // 人声结束 → 恢复 (3s 平滑过渡)
    const voiceEndTime = voiceStartTime + voiceBuffer.duration;
    bgGainNode.gain.setValueAtTime(BGM_DUCKED_GAIN, voiceEndTime);
    bgGainNode.gain.exponentialRampToValueAtTime(BGM_BASE_GAIN, voiceEndTime + 3.0);

    // 结尾渐出
    const fadeOutStart = totalDuration - 8.0;
    bgGainNode.gain.setValueAtTime(BGM_BASE_GAIN, fadeOutStart);
    bgGainNode.gain.linearRampToValueAtTime(0, totalDuration);

    bgSource.connect(bgGainNode);
    bgGainNode.connect(offlineCtx.destination);
    bgSource.start(0);
  }

  // 3. 语音轨道（平滑淡入淡出）
  const vSource = offlineCtx.createBufferSource();
  vSource.buffer = voiceBuffer;
  const vGain = offlineCtx.createGain();

  // 0.8s 淡入
  vGain.gain.setValueAtTime(0, voiceStartTime);
  vGain.gain.linearRampToValueAtTime(VOICE_GAIN, voiceStartTime + 0.8);

  // 1.5s 淡出
  const voiceEndTime = voiceStartTime + voiceBuffer.duration;
  vGain.gain.setValueAtTime(VOICE_GAIN, voiceEndTime - 1.5);
  vGain.gain.linearRampToValueAtTime(0, voiceEndTime);

  vSource.connect(vGain);
  vGain.connect(offlineCtx.destination);
  vSource.start(voiceStartTime);

  // 4. 离线渲染
  const renderedBuffer = await offlineCtx.startRendering();
  return bufferToWav(renderedBuffer);
}
