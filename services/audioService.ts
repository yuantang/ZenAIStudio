
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
 * 生成极低音量的粉噪声作为 CORS 兜底 fallback
 * 当无法加载任何背景音乐时，用微弱噪底代替死寂
 */
function generateAmbientFallback(ctx: OfflineAudioContext, duration: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  
  // 粉噪声生成（1/f 特性，比白噪声更自然）
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.003; // 极低音量
    b6 = white * 0.115926;
  }
  return buffer;
}

/**
 * 将短背景音频扩展为指定时长，在循环接缝处做 crossfade
 */
function loopWithCrossfade(
  ctx: OfflineAudioContext,
  source: AudioBuffer,
  targetDuration: number,
  crossfadeSec: number = 2.0
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const targetLength = Math.ceil(sampleRate * targetDuration);
  const channels = source.numberOfChannels;
  const result = ctx.createBuffer(channels, targetLength, sampleRate);
  
  const crossfadeSamples = Math.floor(sampleRate * crossfadeSec);
  // 每次循环的有效长度（去掉 crossfade 重叠区域）
  const effectiveLength = source.length - crossfadeSamples;
  
  if (effectiveLength <= 0) {
    // 素材太短，无法做 crossfade，直接简单循环
    for (let ch = 0; ch < channels; ch++) {
      const srcData = source.getChannelData(ch);
      const dstData = result.getChannelData(ch);
      for (let i = 0; i < targetLength; i++) {
        dstData[i] = srcData[i % source.length];
      }
    }
    return result;
  }

  for (let ch = 0; ch < channels; ch++) {
    const srcData = source.getChannelData(ch);
    const dstData = result.getChannelData(ch);
    let writePos = 0;
    let isFirstLoop = true;

    while (writePos < targetLength) {
      if (isFirstLoop) {
        // 第一次完整写入
        const copyLen = Math.min(source.length, targetLength - writePos);
        for (let i = 0; i < copyLen; i++) {
          dstData[writePos + i] = srcData[i];
        }
        writePos += effectiveLength;
        isFirstLoop = false;
      } else {
        // 后续循环：crossfade 区域 + 正常区域
        for (let i = 0; i < crossfadeSamples && writePos + i < targetLength; i++) {
          const fadeOut = 1 - (i / crossfadeSamples); // 上一轮尾部淡出
          const fadeIn = i / crossfadeSamples;         // 新一轮头部淡入
          const tailSample = srcData[effectiveLength + i] * fadeOut;
          const headSample = srcData[i] * fadeIn;
          dstData[writePos + i] = tailSample + headSample;
        }
        // crossfade 之后的正常部分
        const normalStart = crossfadeSamples;
        const normalLen = Math.min(effectiveLength - crossfadeSamples, targetLength - writePos - crossfadeSamples);
        for (let i = 0; i < normalLen && writePos + crossfadeSamples + i < targetLength; i++) {
          dstData[writePos + crossfadeSamples + i] = srcData[normalStart + i];
        }
        writePos += effectiveLength;
      }
    }
  }
  return result;
}

/**
 * ============================================================
 *  音频后处理工具集
 * ============================================================
 */

/**
 * 生成混响脉冲响应（IR）— 模拟温暖的冥想教室空间
 * 使用指数衰减的随机噪声，不需要任何外部文件
 */
function generateReverbIR(
  ctx: OfflineAudioContext,
  duration: number = 2.5,
  decay: number = 2.0
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, sampleRate);
  
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // 指数衰减 × 随机噪声 = 自然混响尾巴
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay);
    }
  }
  return buffer;
}

/**
 * 合成藏传颂钵声（Tibetan Singing Bowl）
 * 加法合成：基频 + 多个非谐波泛音 + 慢速调制 = 真实颂钵的金属共鸣
 */
function generateSingingBowl(
  ctx: OfflineAudioContext,
  duration: number = 8.0,
  fundamentalFreq: number = 220
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  // 颂钵的特征泛音（非整数倍，这是金属碗的声学特征）
  const harmonics = [
    { ratio: 1.0,   amp: 1.0,  decay: 0.8  },  // 基频
    { ratio: 2.71,  amp: 0.6,  decay: 1.0  },  // 第二泛音
    { ratio: 4.95,  amp: 0.35, decay: 1.3  },  // 第三泛音
    { ratio: 7.77,  amp: 0.2,  decay: 1.8  },  // 第四泛音
    { ratio: 11.2,  amp: 0.1,  decay: 2.2  },  // 高次泛音
  ];

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let sample = 0;
    
    for (const h of harmonics) {
      const freq = fundamentalFreq * h.ratio;
      const envelope = Math.exp(-t * h.decay);
      // 击打瞬态：前 20ms 的强烈冲击
      const attack = t < 0.02 ? (t / 0.02) : 1.0;
      // 微妙的频率颤动（颂钵的"吟唱"效果）
      const vibrato = 1 + 0.002 * Math.sin(2 * Math.PI * 4.5 * t);
      sample += h.amp * envelope * attack * Math.sin(2 * Math.PI * freq * vibrato * t);
    }
    
    data[i] = sample * 0.15; // 总体音量控制
  }

  return buffer;
}

/**
 * 生成柔和的水晶铃声（过渡标记用）
 */
function generateTransitionBell(
  ctx: OfflineAudioContext,
  duration: number = 3.0,
  freq: number = 880
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 2.5);
    const attack = t < 0.005 ? (t / 0.005) : 1.0;
    // 双频叠加产生清脆的铃声
    const sample = 
      0.6 * Math.sin(2 * Math.PI * freq * t) +
      0.3 * Math.sin(2 * Math.PI * freq * 1.5 * t) +
      0.1 * Math.sin(2 * Math.PI * freq * 3.0 * t);
    data[i] = sample * envelope * attack * 0.08;
  }

  return buffer;
}

/**
 * 在 OfflineAudioContext 中添加双耳节拍轨道
 * 左右耳微差频率诱导特定脑波状态
 */
function addBinauralBeats(
  ctx: OfflineAudioContext,
  startTime: number,
  duration: number,
  baseFreq: number = 200,    // 载波频率（听不太到，越低越好）
  beatFreq: number = 8       // 差频 = 目标脑波频率 (Alpha: 8-12Hz, Theta: 4-8Hz)
): void {
  const gainValue = 0.025; // 极低音量，仅潜意识感知

  // 左耳
  const oscL = ctx.createOscillator();
  oscL.frequency.value = baseFreq;
  oscL.type = 'sine';
  const panL = ctx.createStereoPanner();
  panL.pan.value = -1;
  const gainL = ctx.createGain();
  gainL.gain.setValueAtTime(0, startTime);
  gainL.gain.linearRampToValueAtTime(gainValue, startTime + 3);
  gainL.gain.setValueAtTime(gainValue, startTime + duration - 3);
  gainL.gain.linearRampToValueAtTime(0, startTime + duration);
  oscL.connect(gainL).connect(panL).connect(ctx.destination);
  oscL.start(startTime);
  oscL.stop(startTime + duration);

  // 右耳（频率微差）
  const oscR = ctx.createOscillator();
  oscR.frequency.value = baseFreq + beatFreq;
  oscR.type = 'sine';
  const panR = ctx.createStereoPanner();
  panR.pan.value = 1;
  const gainR = ctx.createGain();
  gainR.gain.setValueAtTime(0, startTime);
  gainR.gain.linearRampToValueAtTime(gainValue, startTime + 3);
  gainR.gain.setValueAtTime(gainValue, startTime + duration - 3);
  gainR.gain.linearRampToValueAtTime(0, startTime + duration);
  oscR.connect(gainR).connect(panR).connect(ctx.destination);
  oscR.start(startTime);
  oscR.stop(startTime + duration);
}

/**
 * ============================================================
 *  主混音函数（商用级）
 *  特性：混响+EQ / crossfade循环 / 颂钵仪式 / 双耳节拍 / 动态ducking
 * ============================================================
 */
export async function mixSingleVoiceAudio(
  voiceBuffer: AudioBuffer,
  bgMusicUrl: string
): Promise<Blob> {
  const sampleRate = 44100;
  const BGM_BASE_GAIN = 0.18;
  const BGM_DUCKED_GAIN = 0.05;
  const VOICE_GAIN = 0.85; // 略低于 1.0，为混响留出余量避免削波
  const REVERB_MIX = 0.15; // 混响湿声比例（15% 湿声 = 温暖但不模糊）
  
  // 时间线：颂钵 3s → 过渡 2s → 语音 → 结束颂钵 → 渐出
  const bowlIntroDuration = 8.0;  // 开场颂钵自然衰减
  const voiceStartTime = 5.0;     // 语音在颂钵衰减后开始
  const voiceEndTime = voiceStartTime + voiceBuffer.duration;
  const outroGap = 2.0;           // 语音结束后的短暂静默
  const bowlOutroDuration = 8.0;  // 结束颂钵
  const fadeOutTail = 5.0;        // 最终渐出
  const totalDuration = voiceEndTime + outroGap + bowlOutroDuration + fadeOutTail;
  
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);

  // ────────────────────────────────────────────
  // 1. 背景音乐轨道（含 CORS 兜底 + crossfade 循环）
  // ────────────────────────────────────────────
  let bgBuffer: AudioBuffer | null = null;
  try {
    const resp = await fetch(bgMusicUrl, { mode: 'cors', credentials: 'omit' });
    if (!resp.ok) throw new Error(`HTTP Error ${resp.status}`);
    const ab = await resp.arrayBuffer();
    const rawBg = await offlineCtx.decodeAudioData(ab);
    
    if (rawBg.duration < totalDuration) {
      console.log(`[Mixing] 背景 crossfade 循环: ${rawBg.duration.toFixed(1)}s → ${totalDuration.toFixed(1)}s`);
      bgBuffer = loopWithCrossfade(offlineCtx, rawBg, totalDuration, 2.0);
    } else {
      bgBuffer = rawBg;
    }
  } catch (e) {
    console.warn("[Mixing] CDN 不可用，fallback 到粉噪声:", e);
    bgBuffer = generateAmbientFallback(offlineCtx, totalDuration);
  }

  if (bgBuffer) {
    const bgSource = offlineCtx.createBufferSource();
    bgSource.buffer = bgBuffer;
    const bgGain = offlineCtx.createGain();

    // 前奏渐入
    bgGain.gain.setValueAtTime(0, 0);
    bgGain.gain.linearRampToValueAtTime(BGM_BASE_GAIN, voiceStartTime);
    // 人声 ducking
    bgGain.gain.setValueAtTime(BGM_BASE_GAIN, voiceStartTime);
    bgGain.gain.exponentialRampToValueAtTime(BGM_DUCKED_GAIN, voiceStartTime + 1.5);
    bgGain.gain.setValueAtTime(BGM_DUCKED_GAIN, voiceEndTime);
    bgGain.gain.exponentialRampToValueAtTime(BGM_BASE_GAIN, voiceEndTime + 3.0);
    // 结尾渐出
    const fadeStart = totalDuration - fadeOutTail;
    bgGain.gain.setValueAtTime(BGM_BASE_GAIN, fadeStart);
    bgGain.gain.linearRampToValueAtTime(0, totalDuration);

    bgSource.connect(bgGain).connect(offlineCtx.destination);
    bgSource.start(0);
  }

  // ────────────────────────────────────────────
  // 2. 颂钵仪式声（开场 + 结束）
  // ────────────────────────────────────────────
  console.log("[Mixing] 合成颂钵仪式声...");
  
  // 开场颂钵（低频 220Hz，温暖深沉）
  const introSB = generateSingingBowl(offlineCtx, bowlIntroDuration, 220);
  const introSrc = offlineCtx.createBufferSource();
  introSrc.buffer = introSB;
  const introGain = offlineCtx.createGain();
  introGain.gain.value = 1.0;
  introSrc.connect(introGain).connect(offlineCtx.destination);
  introSrc.start(0);

  // 结束颂钵（略高频 330Hz，明亮唤醒）
  const outroSB = generateSingingBowl(offlineCtx, bowlOutroDuration, 330);
  const outroSrc = offlineCtx.createBufferSource();
  outroSrc.buffer = outroSB;
  const outroGain = offlineCtx.createGain();
  outroGain.gain.value = 0.8;
  outroSrc.connect(outroGain).connect(offlineCtx.destination);
  outroSrc.start(voiceEndTime + outroGap);

  // ────────────────────────────────────────────
  // 3. 语音轨道 + 混响 + 暖色 EQ
  // ────────────────────────────────────────────
  console.log("[Mixing] 应用语音混响 + 暖色 EQ...");

  const vSource = offlineCtx.createBufferSource();
  vSource.buffer = voiceBuffer;

  // 干声通路
  const dryGain = offlineCtx.createGain();
  dryGain.gain.value = VOICE_GAIN * (1 - REVERB_MIX);

  // 湿声（混响）通路
  const wetGain = offlineCtx.createGain();
  wetGain.gain.value = VOICE_GAIN * REVERB_MIX;
  const reverbIR = generateReverbIR(offlineCtx, 2.5, 2.0);
  const convolver = offlineCtx.createConvolver();
  convolver.buffer = reverbIR;

  // 暖色 EQ：低频增益 + 高频滚降
  const warmEQ = offlineCtx.createBiquadFilter();
  warmEQ.type = 'lowshelf';
  warmEQ.frequency.value = 300;
  warmEQ.gain.value = 3.0; // +3dB 低频温暖度

  const deEss = offlineCtx.createBiquadFilter();
  deEss.type = 'highshelf';
  deEss.frequency.value = 6000;
  deEss.gain.value = -4.0; // -4dB 高频滚降，去除 TTS 的尖锐感

  // 淡入淡出包络
  const voiceEnvelope = offlineCtx.createGain();
  voiceEnvelope.gain.setValueAtTime(0, voiceStartTime);
  voiceEnvelope.gain.linearRampToValueAtTime(1, voiceStartTime + 0.8);
  voiceEnvelope.gain.setValueAtTime(1, voiceEndTime - 1.5);
  voiceEnvelope.gain.linearRampToValueAtTime(0, voiceEndTime);

  // 信号链: source → EQ → envelope → (dry + wet/reverb) → destination
  vSource.connect(warmEQ).connect(deEss).connect(voiceEnvelope);
  voiceEnvelope.connect(dryGain).connect(offlineCtx.destination);
  voiceEnvelope.connect(convolver).connect(wetGain).connect(offlineCtx.destination);
  vSource.start(voiceStartTime);

  // ────────────────────────────────────────────
  // 4. 双耳节拍（Alpha → Theta 渐变）
  // ────────────────────────────────────────────
  console.log("[Mixing] 注入双耳节拍...");
  
  const binauralDuration = voiceBuffer.duration + outroGap + bowlOutroDuration;
  // 开始用 Alpha 波（10Hz 放松），后半段过渡到 Theta 波（6Hz 深度冥想）
  const halfPoint = binauralDuration / 2;
  
  // 前半段：Alpha 波 (10Hz)
  addBinauralBeats(offlineCtx, voiceStartTime, halfPoint, 180, 10);
  // 后半段：Theta 波 (6Hz)
  addBinauralBeats(offlineCtx, voiceStartTime + halfPoint, binauralDuration - halfPoint, 180, 6);

  // ────────────────────────────────────────────
  // 5. 离线渲染
  // ────────────────────────────────────────────
  console.log(`[Mixing] 开始离线渲染 (${totalDuration.toFixed(1)}s)...`);
  const renderedBuffer = await offlineCtx.startRendering();
  console.log("[Mixing] 渲染完成！");
  return bufferToWav(renderedBuffer);
}
