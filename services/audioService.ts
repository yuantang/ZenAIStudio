
/**
 * Lanczos-3 内核：sinc(x) * sinc(x/a)，窗口大小 a=3
 * 比线性插值质量高很多，接近专业重采样器
 */
function lanczos3(x: number): number {
  if (x === 0) return 1;
  if (Math.abs(x) >= 3) return 0;
  const px = Math.PI * x;
  return (Math.sin(px) / px) * (Math.sin(px / 3) / (px / 3));
}

/**
 * 高质量重采样：使用 Lanczos-3 插值将音频从 srcRate 转换到 dstRate
 */
function resampleLanczos(srcData: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return srcData;
  
  const ratio = srcRate / dstRate;
  const dstLength = Math.ceil(srcData.length / ratio);
  const result = new Float32Array(dstLength);
  const a = 3; // Lanczos 核窗口
  
  for (let i = 0; i < dstLength; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    let sample = 0;
    
    for (let j = srcIndex - a + 1; j <= srcIndex + a; j++) {
      if (j >= 0 && j < srcData.length) {
        sample += srcData[j] * lanczos3(srcPos - j);
      }
    }
    
    result[i] = sample;
  }
  
  return result;
}

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
  
  // 先解码到 Float32
  const rawSamples = new Float32Array(samplesCount);
  for (let i = 0; i < samplesCount; i++) {
    rawSamples[i] = dataInt16[i] / 32768.0;
  }

  // 如果上下文采样率与源不同，执行 Lanczos-3 高质量重采样
  const targetRate = ctx.sampleRate;
  let finalSamples: Float32Array;
  
  if (Math.abs(targetRate - sampleRate) > 1) {
    console.log(`[PCM] Lanczos-3 重采样: ${sampleRate}Hz → ${targetRate}Hz`);
    finalSamples = resampleLanczos(rawSamples, sampleRate, targetRate);
  } else {
    finalSamples = rawSamples;
  }
  
  const buffer = ctx.createBuffer(1, finalSamples.length, targetRate);
  buffer.getChannelData(0).set(finalSamples);
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
    console.log(`[Mixing] 加载背景音乐: ${bgMusicUrl}`);
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
 * 生成混响脉冲响应（IR）— 三层结构的冥想教室空间
 * Layer 1: Pre-delay (15-25ms 静默)
 * Layer 2: Early reflections (6 个离散延迟线，模拟墙壁反射)
 * Layer 3: Diffuse tail (指数衰减噪声 + 高频阻尼)
 */
function generateReverbIR(
  ctx: OfflineAudioContext,
  duration: number = 2.5,
  decay: number = 2.0
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, sampleRate);
  
  // Pre-delay: 20ms 的静默（模拟直达声到第一次反射的距离）
  const preDelaySamples = Math.ceil(sampleRate * 0.020);

  // Early reflections: 6 个离散反射点（模拟小房间的墙壁/天花板）
  const earlyReflections = [
    { delay: 0.023, gain: 0.72 },  // 左墙
    { delay: 0.031, gain: 0.58 },  // 右墙
    { delay: 0.041, gain: 0.45 },  // 天花板
    { delay: 0.053, gain: 0.38 },  // 后墙
    { delay: 0.067, gain: 0.28 },  // 角落反射
    { delay: 0.079, gain: 0.20 },  // 二次反射
  ];

  // Late reverb 起始点 (约 80ms 后)
  const lateStart = Math.ceil(sampleRate * 0.080);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);

    // Layer 2: 写入早期反射（左右声道略有差异以增加空间感）
    for (const ref of earlyReflections) {
      const delaySamples = Math.ceil(sampleRate * (ref.delay + (ch === 1 ? 0.003 : 0)));
      if (delaySamples < length) {
        // 短脉冲 + 微量随机性
        const impulseLen = Math.min(Math.ceil(sampleRate * 0.002), length - delaySamples);
        for (let i = 0; i < impulseLen; i++) {
          data[delaySamples + i] += ref.gain * (1 - i / impulseLen) * (0.9 + Math.random() * 0.2);
        }
      }
    }

    // Layer 3: 扩散尾巴（从 lateStart 开始，指数衰减 + 高频阻尼）
    let lpState = 0; // 低通滤波器状态（模拟空气吸收高频）
    const lpCoeff = 0.7; // 截止约 4kHz，越低声音越温暖
    for (let i = lateStart; i < length; i++) {
      const t = (i - lateStart) / sampleRate;
      const white = Math.random() * 2 - 1;
      // 高频阻尼低通滤波
      lpState = lpState * lpCoeff + white * (1 - lpCoeff);
      // 指数衰减包络
      const envelope = Math.exp(-t * decay);
      // 微妙的调制（增加有机感）
      const modulation = 1 + 0.05 * Math.sin(2 * Math.PI * 0.5 * t);
      data[i] += lpState * envelope * modulation * 0.3;
    }
  }

  return buffer;
}

/**
 * 合成藏传颂钵声 v2（Tibetan Singing Bowl）
 * 升级：7 层泛音 + 双阶段击打 + 谐波游走 + 金属微光噪声
 */
function generateSingingBowl(
  ctx: OfflineAudioContext,
  duration: number = 8.0,
  fundamentalFreq: number = 220
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, sampleRate); // 立体声
  const dataL = buffer.getChannelData(0);
  const dataR = buffer.getChannelData(1);

  // 颂钵声学测量值：非整数倍泛音比是金属碗的核心特征
  // 每个泛音有独立的衰减率、振幅、和立体声偏移
  const harmonics = [
    { ratio: 1.0,    amp: 1.0,  decay: 0.7,  pan: 0.0,  drift: 0.001  },  // 基频
    { ratio: 2.71,   amp: 0.55, decay: 0.9,  pan: 0.15, drift: 0.0015 },  // 第 2 泛音
    { ratio: 4.95,   amp: 0.3,  decay: 1.1,  pan: -0.1, drift: 0.002  },  // 第 3 泛音
    { ratio: 7.77,   amp: 0.18, decay: 1.5,  pan: 0.2,  drift: 0.0018 },  // 第 4 泛音
    { ratio: 11.2,   amp: 0.09, decay: 1.9,  pan: -0.15,drift: 0.0025 },  // 第 5 泛音
    { ratio: 15.1,   amp: 0.05, decay: 2.3,  pan: 0.25, drift: 0.003  },  // 第 6 泛音（金属高光）
    { ratio: 19.8,   amp: 0.025,decay: 2.8,  pan: -0.2, drift: 0.004  },  // 第 7 泛音（空气感）
  ];

  // 随机初始相位，避免每次颂钵听起来一模一样
  const phases = harmonics.map(() => Math.random() * Math.PI * 2);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let sampleL = 0;
    let sampleR = 0;

    for (let h = 0; h < harmonics.length; h++) {
      const { ratio, amp, decay, pan, drift } = harmonics[h];
      const freq = fundamentalFreq * ratio;

      // 指数衰减包络
      const envelope = Math.exp(-t * decay);

      // 双阶段击打瞬态：硬击（2ms）+ 软扩散（18ms）
      const hardAttack = t < 0.002 ? t / 0.002 : 1.0;
      const softSpread = t < 0.02 ? 0.7 + 0.3 * (t / 0.02) : 1.0;
      const attack = hardAttack * softSpread;

      // 谐波游走：每个泛音独立的缓慢频率漂移（模拟碗体温度微变）
      const freqWander = 1 + drift * Math.sin(2 * Math.PI * (0.3 + h * 0.1) * t);

      // 吟唱颤音（较低泛音更明显）
      const vibDepth = h < 3 ? 0.003 : 0.001;
      const vibrato = 1 + vibDepth * Math.sin(2 * Math.PI * (4.5 + h * 0.3) * t);

      const osc = Math.sin(2 * Math.PI * freq * freqWander * vibrato * t + phases[h]);
      const val = amp * envelope * attack * osc;

      // 立体声分配
      const gainL = 0.5 + pan * 0.5;
      const gainR = 0.5 - pan * 0.5;
      sampleL += val * gainL;
      sampleR += val * gainR;
    }

    // 金属微光层：高频噪声脉冲，仅在击打后 0.5s 内显著
    const shimmerEnvelope = Math.exp(-t * 5);
    if (shimmerEnvelope > 0.01) {
      const shimmer = (Math.random() * 2 - 1) * 0.03 * shimmerEnvelope;
      sampleL += shimmer;
      sampleR += shimmer * 0.8; // 略微不同增加空间感
    }

    dataL[i] = sampleL * 0.15;
    dataR[i] = sampleR * 0.15;
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
 * 等时节拍（Isochronal Tones）— 无需耳机也能生效的脑波引导
 * 原理：单一频率的节律性 AM 调制，通过亮度脉冲让大脑同步
 * 与双耳节拍形成互补：耳机用户双重引导，扬声器用户也能受益
 */
function addIsochronalTones(
  ctx: OfflineAudioContext,
  startTime: number,
  duration: number,
  baseFreq: number = 400,    // 载波频率（比双耳节拍高，更易感知）
  pulseRate: number = 8      // 脉冲频率 = 目标脑波频率
): void {
  const gainValue = 0.015; // 极低音量

  const osc = ctx.createOscillator();
  osc.frequency.value = baseFreq;
  osc.type = 'sine';

  // AM 调制：用低频方波调制载波的音量
  const modGain = ctx.createGain();
  // 使用 setValueCurveAtTime 模拟脉冲 —— 更简洁的方式是用多段线性
  // 这里用简易方法：通过 LFO 方波实现节律性 on/off
  const lfoOsc = ctx.createOscillator();
  lfoOsc.frequency.value = pulseRate;
  lfoOsc.type = 'square'; // 方波 → 节律性开关

  // 将 LFO 映射到 0~1 范围（方波输出 -1~1，需要偏移到 0~1）
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.5; // 将 -1~1 缩放到 -0.5~0.5
  const lfoOffset = ctx.createGain();
  lfoOffset.gain.value = gainValue;

  // 淡入淡出
  const envGain = ctx.createGain();
  envGain.gain.setValueAtTime(0, startTime);
  envGain.gain.linearRampToValueAtTime(1, startTime + 4);
  envGain.gain.setValueAtTime(1, startTime + duration - 4);
  envGain.gain.linearRampToValueAtTime(0, startTime + duration);

  // 用 GainNode 做 AM 调制：osc → modGain (由 LFO 控制) → envGain → destination
  // 简化实现：直接用 gain 调参实现脉冲效果
  osc.connect(modGain).connect(envGain).connect(ctx.destination);
  
  // LFO 控制 modGain 的 gain 参数
  lfoOsc.connect(lfoGain);
  lfoGain.connect(modGain.gain);
  modGain.gain.value = 0.5; // 中心偏移值

  osc.start(startTime);
  osc.stop(startTime + duration);
  lfoOsc.start(startTime);
  lfoOsc.stop(startTime + duration);
}
/**
 * 生成自然声境纹理（有机演变版 v2）
 * v2 升级：泊松分布鸟鸣 / 互质周期海浪 / 阵性雨强 / 立体声空间自动化
 */
function generateAmbientTexture(
  ctx: OfflineAudioContext,
  hint: string,
  duration: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, sampleRate);

  // 简易伪随机种子（让同一 hint 的不同段落也有变化）
  let seed = duration * 1000;
  const seededRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  switch (hint) {
    case 'rain': {
      // ── 有机雨声 v2 ──
      // 阵性强度调制（40s 为一个大呼吸周期）+ 随机大雨滴脉冲
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        let prev = 0;
        const burstPeriod = 40 + ch * 7; // 左右声道不同周期，避免同步
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          // 阵性雨势：缓慢起伏的强度包络
          const intensity = 0.5 + 0.5 * Math.sin(2 * Math.PI * t / burstPeriod);
          // 基础雨声密度随强度变化
          const dropProb = 0.001 + 0.004 * intensity;
          const drop = Math.random() < dropProb ? (Math.random() * 0.4 * intensity) : 0;
          // 低通滤波 + 动态截止频率
          const lpCoeff = 0.96 + 0.02 * intensity; // 强雨时更亮
          prev = prev * lpCoeff + (Math.random() * 2 - 1 + drop) * (1 - lpCoeff);
          // 立体声空间随机化
          const panJitter = 1 + (ch === 0 ? 0.1 : -0.1) * Math.sin(t * 0.3);
          data[i] = prev * 0.04 * panJitter;
        }
      }
      break;
    }
    case 'ocean': {
      // ── 有机海浪 v2 ──
      // 3 个互质周期叠加 → 永不重复的浪涛节奏
      const wavePeriods = [7.3, 11.7, 19.1]; // 互质秒数
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        const phaseOffset = ch * 0.4; // 左右声道相位偏移
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          // 叠加三层不同周期的浪涛
          let waveEnv = 0;
          for (let w = 0; w < wavePeriods.length; w++) {
            const period = wavePeriods[w];
            const phase = (t + phaseOffset + w * 2.3) / period;
            // 不对称波形：上升快（浪涌），下降慢（回退）
            const saw = phase % 1;
            const asymmetric = saw < 0.3 
              ? Math.pow(saw / 0.3, 0.7)     // 快速涌起
              : Math.pow(1 - (saw - 0.3) / 0.7, 1.5); // 缓慢回退
            waveEnv += asymmetric * (1 / (w + 1)); // 长周期权重更低
          }
          waveEnv = Math.min(1, waveEnv / 1.5); // 归一化

          // 噪声纹理（浪涛声）
          const noise = Math.random() * 2 - 1;
          // 高浪时高频更多（浪花飞溅）
          const brightness = 0.7 + 0.3 * waveEnv;
          data[i] = noise * waveEnv * brightness * 0.035;
        }
      }
      break;
    }
    case 'forest': {
      // ── 有机森林 v2 ──
      // 泊松随机鸟鸣 + 频率滑动 + 立体声随机定位

      // 预生成泊松分布的鸟鸣事件
      const birdEvents: { time: number; freq: number; pan: number; type: number }[] = [];
      let birdTime = 2 + seededRandom() * 5; // 首次鸟鸣在 2-7s
      while (birdTime < duration - 2) {
        birdEvents.push({
          time: birdTime,
          freq: 1800 + seededRandom() * 1200,     // 1.8-3kHz 随机基频
          pan: (seededRandom() - 0.5) * 1.2,       // 立体声位置 -0.6 ~ +0.6
          type: Math.floor(seededRandom() * 3),     // 0=啁啾 1=啼鸣 2=颤音
        });
        // 泊松间隔：平均 8s，指数分布，最短 3s
        birdTime += 3 + (-Math.log(1 - seededRandom())) * 8;
      }

      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        let windState = 0;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;

          // 微风底噪（缓慢起伏）
          const gustEnv = 0.7 + 0.3 * Math.sin(2 * Math.PI * t / 23) * Math.sin(2 * Math.PI * t / 37);
          windState = windState * 0.995 + (Math.random() * 2 - 1) * 0.005;
          let sample = windState * 0.03 * gustEnv;

          // 渲染鸟鸣事件
          for (const bird of birdEvents) {
            const dt = t - bird.time;
            if (dt < 0 || dt > 1.5) continue; // 每只鸟鸣持续 ~1.5s

            // 立体声定位增益
            const chGain = ch === 0 
              ? Math.max(0, 1 - bird.pan) 
              : Math.max(0, 1 + bird.pan);

            let birdSample = 0;
            const env = Math.exp(-dt * 4) * (1 - Math.exp(-dt * 30)); // 快速起始 + 衰减

            if (bird.type === 0) {
              // 啁啾：快速频率下滑
              const chirpFreq = bird.freq * (1 + 0.3 * Math.exp(-dt * 8));
              birdSample = Math.sin(2 * Math.PI * chirpFreq * dt) * env;
            } else if (bird.type === 1) {
              // 啼鸣：两个短音符
              const note1 = dt < 0.3 ? Math.sin(2 * Math.PI * bird.freq * dt) : 0;
              const note2 = dt > 0.5 && dt < 0.8 
                ? Math.sin(2 * Math.PI * bird.freq * 1.2 * (dt - 0.5)) : 0;
              birdSample = (note1 + note2) * env;
            } else {
              // 颤音：快速振幅调制
              const trill = Math.sin(2 * Math.PI * 25 * dt); // 25Hz 颤动
              birdSample = Math.sin(2 * Math.PI * bird.freq * dt) * trill * env;
            }

            sample += birdSample * chGain * 0.012;
          }

          data[i] = sample;
        }
      }
      break;
    }
    case 'fire': {
      // ── 有机壁炉 v2 ──
      // 低频温暖呼吸 + 泊松噼啪 + 偶尔的木柴断裂
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        let prev = 0;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          // 温暖呼吸感（火焰亮暗周期）
          const breathe = 0.7 + 0.3 * Math.sin(2 * Math.PI * t / 8) * Math.sin(2 * Math.PI * t / 13);
          // 温暖噪底
          prev = prev * 0.98 + (Math.random() * 2 - 1) * 0.02;
          let sample = prev * 0.025 * breathe;
          // 噼啪声（泊松分布，平均每秒 0.3 次）
          if (Math.random() < 0.3 / sampleRate * 100) {
            const crackle = (Math.random() * 2 - 1) * 0.08 * (0.5 + 0.5 * seededRandom());
            sample += crackle * (ch === 0 ? 0.7 + seededRandom() * 0.3 : 0.7 + seededRandom() * 0.3);
          }
          // 偶尔的木柴断裂（低频 thud）
          if (Math.random() < 0.02 / sampleRate) {
            for (let j = 0; j < Math.min(1000, length - i); j++) {
              data[Math.min(i + j, length - 1)] += 
                Math.sin(2 * Math.PI * 80 * j / sampleRate) * Math.exp(-j / sampleRate * 10) * 0.02;
            }
          }
          data[i] = sample;
        }
      }
      break;
    }
    case 'space': {
      // ── 有机宇宙 v2 ──
      // 深空 drone + 缓慢演变的共振 + 偶尔的遥远脉冲
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          // 缓慢演变的 drone（频率微漂移）
          const drift = Math.sin(2 * Math.PI * 0.02 * t) * 5; // ±5Hz 漂移
          const drone1 = Math.sin(2 * Math.PI * (60 + drift) * t) * 0.008;
          const drone2 = Math.sin(2 * Math.PI * (90 + drift * 0.7 + ch * 2) * t) * 0.006;
          // AM 调制产生"呼吸"的宇宙脉动
          const pulse = (1 + Math.sin(2 * Math.PI * 0.03 * t)) * 0.5;
          const drone3 = Math.sin(2 * Math.PI * (120 + drift * 0.5) * t) * 0.004 * pulse;
          // 偶尔的深空脉冲（像遥远的恒星闪烁）
          let sparkle = 0;
          const sparkleCycle = 17 + ch * 7;
          const sparklePhase = (t % sparkleCycle) / sparkleCycle;
          if (sparklePhase > 0.96 && sparklePhase < 0.99) {
            const sp = (sparklePhase - 0.96) / 0.03;
            sparkle = Math.sin(2 * Math.PI * 3000 * t) * Math.exp(-sp * 15) * 0.003;
          }
          data[i] = drone1 + drone2 + drone3 + sparkle;
        }
      }
      break;
    }
    default: {
      // silence 或未知：极微弱的粉噪声
      let b0 = 0, b1 = 0, b2 = 0;
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99 * b0 + white * 0.01;
          b1 = 0.96 * b1 + white * 0.04;
          b2 = 0.80 * b2 + white * 0.20;
          data[i] = (b0 + b1 + b2) * 0.002;
        }
      }
    }
  }
  return buffer;
}

/**
 * 从 script sections 中提取主要的 ambientHint（出现最多的）
 */
function getDominantAmbientHint(sections?: { ambientHint?: string }[]): string {
  if (!sections || sections.length === 0) return 'forest';
  const counts: Record<string, number> = {};
  for (const s of sections) {
    const hint = s.ambientHint || 'forest';
    if (hint !== 'silence') {
      counts[hint] = (counts[hint] || 0) + 1;
    }
  }
  let maxHint = 'forest';
  let maxCount = 0;
  for (const [hint, count] of Object.entries(counts)) {
    if (count > maxCount) { maxCount = count; maxHint = hint; }
  }
  return maxHint;
}

/**
 * ============================================================
 *  主混音函数（商用级 v2）
 *  v2 升级：段落级声境切换 / soft limiter / 过渡铃声 / 三段双耳节拍
 * ============================================================
 */
export async function mixSingleVoiceAudio(
  voiceBuffer: AudioBuffer,
  bgMusicUrl: string,
  scriptSections?: { type?: string; ambientHint?: string; pauseSeconds?: number }[],
  onProgress?: (stage: string, percent: number) => void
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
  // 0. 主总线 Soft Limiter（防止多层叠加削波）
  // ────────────────────────────────────────────
  const masterLimiter = offlineCtx.createDynamicsCompressor();
  masterLimiter.threshold.value = -3.0;   // 超过 -3dB 开始压缩
  masterLimiter.knee.value = 6.0;         // 柔和转折
  masterLimiter.ratio.value = 12.0;       // 高压缩比 ≈ limiter
  masterLimiter.attack.value = 0.003;     // 3ms 极快响应
  masterLimiter.release.value = 0.25;     // 250ms 释放
  masterLimiter.connect(offlineCtx.destination);

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

    // ── 段落感知动态 Ducking ──
    // 不同段落类型使用不同的 ducking 深度
    const getDuckLevel = (sectionType?: string): number => {
      switch (sectionType) {
        case 'breathing':     return 0.10;  // 呼吸段 BGM 较高（有停顿空间）
        case 'body-scan':     return 0.04;  // 身体扫描需要极安静的背景
        case 'visualization': return 0.04;  // 冥想想象也需要极安静
        case 'intro':         return 0.07;  // 开场介绍中等
        case 'closing':       return 0.07;  // 结束语中等
        default:              return BGM_DUCKED_GAIN;
      }
    };

    if (scriptSections && scriptSections.length > 0) {
      // 估算每个段落在时间线中的位置
      const voiceDuration = voiceBuffer.duration;
      const totalTextLength = scriptSections.reduce((sum, s) => 
        sum + (s.pauseSeconds || 0) + 1, 0);
      
      let currentTime = voiceStartTime;
      for (let si = 0; si < scriptSections.length; si++) {
        const section = scriptSections[si];
        const sectionWeight = ((section.pauseSeconds || 0) + 1) / totalTextLength;
        const sectionDuration = voiceDuration * sectionWeight;
        const duckLevel = getDuckLevel(section.type);
        const rampTime = 0.8; // 段落间过渡时间

        // 过渡到此段落的 ducking 深度
        bgGain.gain.setValueAtTime(bgGain.gain.value || BGM_BASE_GAIN, currentTime);
        bgGain.gain.exponentialRampToValueAtTime(
          Math.max(duckLevel, 0.001), 
          currentTime + rampTime
        );

        // 如果有 pauseSeconds（段落间的安静间隙），在间隙中短暂恢复 BGM
        const pause = section.pauseSeconds || 0;
        if (pause > 2 && si < scriptSections.length - 1) {
          const pauseStart = currentTime + sectionDuration - pause;
          const breatheGain = Math.min(BGM_BASE_GAIN * 0.6, duckLevel * 3);
          bgGain.gain.setValueAtTime(duckLevel, pauseStart);
          bgGain.gain.exponentialRampToValueAtTime(breatheGain, pauseStart + 1.0);
          bgGain.gain.setValueAtTime(breatheGain, pauseStart + pause - 1.0);
          bgGain.gain.exponentialRampToValueAtTime(
            getDuckLevel(scriptSections[si + 1]?.type), 
            pauseStart + pause
          );
        }

        currentTime += sectionDuration;
      }

      // 语音结束后恢复
      bgGain.gain.setValueAtTime(BGM_DUCKED_GAIN, voiceEndTime);
      bgGain.gain.exponentialRampToValueAtTime(BGM_BASE_GAIN, voiceEndTime + 3.0);
    } else {
      // 无段落信息时的 fallback：简单全程 ducking
      bgGain.gain.setValueAtTime(BGM_BASE_GAIN, voiceStartTime);
      bgGain.gain.exponentialRampToValueAtTime(BGM_DUCKED_GAIN, voiceStartTime + 1.5);
      bgGain.gain.setValueAtTime(BGM_DUCKED_GAIN, voiceEndTime);
      bgGain.gain.exponentialRampToValueAtTime(BGM_BASE_GAIN, voiceEndTime + 3.0);
    }

    // 结尾渐出
    const fadeStart = totalDuration - fadeOutTail;
    bgGain.gain.setValueAtTime(BGM_BASE_GAIN, fadeStart);
    bgGain.gain.linearRampToValueAtTime(0, totalDuration);

    bgSource.connect(bgGain).connect(masterLimiter);
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
  introGain.gain.value = 0.9;
  introSrc.connect(introGain).connect(masterLimiter);
  introSrc.start(0);

  // 结束颂钵（略高频 330Hz，明亮唤醒）
  const outroSB = generateSingingBowl(offlineCtx, bowlOutroDuration, 330);
  const outroSrc = offlineCtx.createBufferSource();
  outroSrc.buffer = outroSB;
  const outroGain = offlineCtx.createGain();
  outroGain.gain.value = 0.7;
  outroSrc.connect(outroGain).connect(masterLimiter);
  outroSrc.start(voiceEndTime + outroGap);

  // ────────────────────────────────────────────
  // 3. 语音轨道 + De-esser + Haas 展宽 + 混响 + 暖色 EQ
  // ────────────────────────────────────────────
  console.log("[Mixing] 应用语音 De-esser + Haas 展宽 + 混响 + 暖色 EQ...");
  onProgress?.('处理语音轨道', 30);

  const vSource = offlineCtx.createBufferSource();
  vSource.buffer = voiceBuffer;

  // 暖色 EQ：低频增益
  const warmEQ = offlineCtx.createBiquadFilter();
  warmEQ.type = 'lowshelf';
  warmEQ.frequency.value = 300;
  warmEQ.gain.value = 3.0; // +3dB 低频温暖度

  // ── 频率感知 De-esser（替代之前的 highshelf 一刀切）──
  // 原理：将信号分为两路（全频 + 齿音频段），齿音频段通过侧链压缩器动态衰减
  // 仅当 4-8kHz 能量超阈值时才压缩，保留正常辅音清晰度

  // (A) 齿音频段隔离滤波器 (bandpass 4-8kHz)
  const deEssBP = offlineCtx.createBiquadFilter();
  deEssBP.type = 'bandpass';
  deEssBP.frequency.value = 5800; // 中心频率
  deEssBP.Q.value = 1.5; // 覆盖 ~4kHz-8kHz

  // (B) 齿音频段压缩器
  const deEssCompressor = offlineCtx.createDynamicsCompressor();
  deEssCompressor.threshold.value = -30; // 较低阈值，敏感检测齿音
  deEssCompressor.knee.value = 6;
  deEssCompressor.ratio.value = 8; // 高压缩比
  deEssCompressor.attack.value = 0.003; // 3ms 快速响应
  deEssCompressor.release.value = 0.05; // 50ms 释放

  // (C) 齿音频段衰减增益（使压缩后的齿音不要太重、与全频段混合）
  const deEssGain = offlineCtx.createGain();
  deEssGain.gain.value = 0.4; // 齿音频段只保留 40%

  // (D) 非齿音频段通路（中低频 notch 过滤掉齿音频段）
  const deEssNotch = offlineCtx.createBiquadFilter();
  deEssNotch.type = 'notch';
  deEssNotch.frequency.value = 5800;
  deEssNotch.Q.value = 1.5; // 与 bandpass 对应

  // (E) 合并节点
  const deEssMerge = offlineCtx.createGain();
  deEssMerge.gain.value = 1.0;

  // 淡入淡出包络
  const voiceEnvelope = offlineCtx.createGain();
  voiceEnvelope.gain.setValueAtTime(0, voiceStartTime);
  voiceEnvelope.gain.linearRampToValueAtTime(1, voiceStartTime + 0.8);
  voiceEnvelope.gain.setValueAtTime(1, voiceEndTime - 1.5);
  voiceEnvelope.gain.linearRampToValueAtTime(0, voiceEndTime);

  // ── Haas Effect 立体声展宽 ──
  const haasDelay = offlineCtx.createDelay(0.01);
  haasDelay.delayTime.value = 0.0006; // 0.6ms

  // 左声道（正常）
  const panL = offlineCtx.createStereoPanner();
  panL.pan.value = -0.15;
  const gainL = offlineCtx.createGain();
  gainL.gain.value = VOICE_GAIN * (1 - REVERB_MIX);

  // 右声道（延迟 0.6ms）
  const panR = offlineCtx.createStereoPanner();
  panR.pan.value = 0.15;
  const gainR = offlineCtx.createGain();
  gainR.gain.value = VOICE_GAIN * (1 - REVERB_MIX) * 0.95;

  // 湿声（混响）通路
  const wetGain = offlineCtx.createGain();
  wetGain.gain.value = VOICE_GAIN * REVERB_MIX;
  const reverbIR = generateReverbIR(offlineCtx, 2.5, 2.0);
  const convolver = offlineCtx.createConvolver();
  convolver.buffer = reverbIR;

  // 信号链:
  // vSource → warmEQ ──┬── deEssBP → compressor → deEssGain ──┬── voiceEnvelope → ...
  //                     └── deEssNotch ────────────────────────┘
  // voiceEnvelope ──┬── gainL → panL → limiter  (左·干声)
  //                 ├── haasDelay → gainR → panR → limiter  (右·Haas)
  //                 └── convolver → wetGain → limiter  (混响)
  vSource.connect(warmEQ);
  warmEQ.connect(deEssBP).connect(deEssCompressor).connect(deEssGain).connect(deEssMerge);
  warmEQ.connect(deEssNotch).connect(deEssMerge);
  deEssMerge.connect(voiceEnvelope);
  voiceEnvelope.connect(gainL).connect(panL).connect(masterLimiter);
  voiceEnvelope.connect(haasDelay).connect(gainR).connect(panR).connect(masterLimiter);
  voiceEnvelope.connect(convolver).connect(wetGain).connect(masterLimiter);
  vSource.start(voiceStartTime);

  // ────────────────────────────────────────────
  // 4. 三段双耳节拍 + 等时节拍（Alpha → Theta → Delta 渐变）
  // ────────────────────────────────────────────
  console.log("[Mixing] 注入三段双耳节拍 + 等时节拍...");
  onProgress?.('注入脑波引导', 45);
  
  const binauralTotalDuration = voiceBuffer.duration + outroGap + bowlOutroDuration;
  const thirdPoint = binauralTotalDuration / 3;
  
  // 双耳节拍（需要耳机）
  addBinauralBeats(offlineCtx, voiceStartTime, thirdPoint, 180, 10);
  addBinauralBeats(offlineCtx, voiceStartTime + thirdPoint, thirdPoint, 180, 6);
  addBinauralBeats(offlineCtx, voiceStartTime + thirdPoint * 2, binauralTotalDuration - thirdPoint * 2, 180, 4);
  
  // 等时节拍（无需耳机，互补引导）
  addIsochronalTones(offlineCtx, voiceStartTime, thirdPoint, 400, 10);
  addIsochronalTones(offlineCtx, voiceStartTime + thirdPoint, thirdPoint, 380, 6);
  addIsochronalTones(offlineCtx, voiceStartTime + thirdPoint * 2, binauralTotalDuration - thirdPoint * 2, 360, 4);

  // ────────────────────────────────────────────
  // 5. 段落级声境纹理（根据每段 ambientHint 动态切换 + crossfade）
  // ────────────────────────────────────────────
  console.log("[Mixing] 生成段落级声境纹理...");
  onProgress?.('生成声境纹理', 55);
  
  if (scriptSections && scriptSections.length > 0) {
    // 估算每段在时间线上的位置（按 content 字数比例分配语音时长）
    const totalChars = scriptSections.reduce((s, sec) => s + ((sec as any).content?.length || 100), 0);
    let currentPos = voiceStartTime;
    
    const sectionTimings: { start: number; end: number; hint: string; type: string }[] = [];
    
    scriptSections.forEach((sec, i) => {
      const charLen = (sec as any).content?.length || 100;
      const voiceDur = (charLen / totalChars) * voiceBuffer.duration;
      const pauseDur = sec.pauseSeconds || 3;
      const sectionEnd = currentPos + voiceDur + pauseDur;
      
      sectionTimings.push({
        start: currentPos,
        end: Math.min(sectionEnd, voiceEndTime + outroGap),
        hint: sec.ambientHint || 'forest',
        type: sec.type || 'visualization',
      });
      currentPos = sectionEnd;
    });

    console.log(`[Mixing] 段落声境: ${sectionTimings.map(s => `${s.hint}(${s.start.toFixed(1)}-${s.end.toFixed(1)}s)`).join(' → ')}`);

    // 为每个段落生成独立的声境纹理并叠加
    const crossfadeDur = 2.0; // 2秒 crossfade 过渡
    
    sectionTimings.forEach((timing, i) => {
      const dur = timing.end - timing.start;
      if (dur <= 0) return;
      
      const textureBuffer = generateAmbientTexture(offlineCtx, timing.hint, dur + crossfadeDur);
      const src = offlineCtx.createBufferSource();
      src.buffer = textureBuffer;
      const gainNode = offlineCtx.createGain();
      
      // 每段纹理柔和渐入渐出（crossfade 效果）
      const fadeIn = i === 0 ? 3.0 : crossfadeDur;
      const fadeOut = i === sectionTimings.length - 1 ? fadeOutTail : crossfadeDur;
      
      gainNode.gain.setValueAtTime(0, timing.start);
      gainNode.gain.linearRampToValueAtTime(1, timing.start + fadeIn);
      gainNode.gain.setValueAtTime(1, timing.end - fadeOut);
      gainNode.gain.linearRampToValueAtTime(0, timing.end);
      
      src.connect(gainNode).connect(masterLimiter);
      src.start(timing.start);
    });

    // ────────────────────────────────────────────
    // 5.5 段落过渡铃声（在段落切换点插入微妙的水晶铃）
    // ────────────────────────────────────────────
    for (let i = 1; i < sectionTimings.length; i++) {
      const transitionTime = sectionTimings[i].start;
      const prevHint = sectionTimings[i - 1].hint;
      if (prevHint === 'silence') continue;
      
      const bellBuffer = generateTransitionBell(offlineCtx, 2.5, 1200 + i * 100);
      const bellSrc = offlineCtx.createBufferSource();
      bellSrc.buffer = bellBuffer;
      const bellGain = offlineCtx.createGain();
      bellGain.gain.value = 0.5;
      bellSrc.connect(bellGain).connect(masterLimiter);
      bellSrc.start(Math.max(0, transitionTime - 0.5));
    }

    // ────────────────────────────────────────────
    // 5.6 呼吸引导同步音效（在 breathing 段落生成柔和 swell tone）
    // ────────────────────────────────────────────
    sectionTimings.forEach((timing) => {
      if (timing.type === 'breathing') {
        console.log(`[Mixing] 呼吸引导音效: ${timing.start.toFixed(1)}-${timing.end.toFixed(1)}s`);
        const dur = timing.end - timing.start;
        if (dur > 2) {
          const breathBuffer = generateBreathingGuide(offlineCtx, dur);
          const breathSrc = offlineCtx.createBufferSource();
          breathSrc.buffer = breathBuffer;
          const breathGain = offlineCtx.createGain();
          breathGain.gain.value = 0.6;
          breathSrc.connect(breathGain).connect(masterLimiter);
          breathSrc.start(timing.start);
        }
      }
    });

  } else {
    // 降级：无段落信息时使用单一声境
    const dominantHint = getDominantAmbientHint(scriptSections);
    console.log(`[Mixing] 生成单一声境纹理: ${dominantHint}`);
    const textureBuffer = generateAmbientTexture(offlineCtx, dominantHint, totalDuration);
    const textureSrc = offlineCtx.createBufferSource();
    textureSrc.buffer = textureBuffer;
    const textureGain = offlineCtx.createGain();
    textureGain.gain.setValueAtTime(0, 0);
    textureGain.gain.linearRampToValueAtTime(1, 3.0);
    textureGain.gain.setValueAtTime(1, totalDuration - fadeOutTail);
    textureGain.gain.linearRampToValueAtTime(0, totalDuration);
    textureSrc.connect(textureGain).connect(masterLimiter);
    textureSrc.start(0);
  }

  // ────────────────────────────────────────────
  // 6. 离线渲染 + LUFS 标准化
  // ────────────────────────────────────────────
  console.log(`[Mixing] 开始离线渲染 (${totalDuration.toFixed(1)}s)...`);
  onProgress?.('离线渲染中', 65);
  const renderedBuffer = await offlineCtx.startRendering();
  console.log("[Mixing] 渲染完成，执行 LUFS 标准化...");
  onProgress?.('LUFS 标准化', 85);
  
  // 应用 LUFS 响度标准化（目标 -16 LUFS）
  normalizeLUFS(renderedBuffer, -16);
  
  // 优先尝试压缩格式（Opus/WebM），失败则回退到 WAV
  console.log("[Mixing] 编码输出...");
  onProgress?.('编码输出', 92);
  const blob = await encodeAudio(renderedBuffer);
  console.log(`[Mixing] 完成！格式: ${blob.type}, 大小: ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
  onProgress?.('完成', 100);
  return blob;
}

// ============================================================
//  新增：呼吸引导同步音效生成器
// ============================================================

/**
 * 生成呼吸引导音效：柔和的正弦波 swell
 * 节奏：吸气 4s (升调) → 屏息 2s → 呼气 6s (降调)，循环至指定时长
 */
function generateBreathingGuide(
  ctx: OfflineAudioContext,
  duration: number,
  baseFreq: number = 160
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, sampleRate);

  // 呼吸周期参数
  const inhale = 4.0;   // 吸气 4 秒
  const hold = 2.0;     // 屏息 2 秒
  const exhale = 6.0;   // 呼气 6 秒
  const cycle = inhale + hold + exhale;

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const phase = t % cycle;
      let envelope = 0;
      let freqMod = 1.0;

      if (phase < inhale) {
        // 吸气阶段：音量升高，频率微升
        const p = phase / inhale;
        envelope = p * p; // 二次曲线（缓慢启动→快速上升）
        freqMod = 1.0 + 0.08 * p; // 频率微升 8%
      } else if (phase < inhale + hold) {
        // 屏息阶段：音量保持峰值
        envelope = 1.0;
        freqMod = 1.08;
      } else {
        // 呼气阶段：音量缓慢下降，频率微降
        const p = (phase - inhale - hold) / exhale;
        envelope = (1 - p) * (1 - p); // 二次曲线（快速启动→缓慢收尾）
        freqMod = 1.08 - 0.08 * p;
      }

      // 柔和的正弦波 + 泛音
      const freq = baseFreq * freqMod;
      const sample =
        0.6 * Math.sin(2 * Math.PI * freq * t) +
        0.3 * Math.sin(2 * Math.PI * freq * 2 * t) * 0.5 +
        0.1 * Math.sin(2 * Math.PI * freq * 3 * t) * 0.25;

      // 整体轻柔渐入渐出
      const globalFade = Math.min(t / 2.0, (duration - t) / 2.0, 1.0);
      data[i] = sample * envelope * globalFade * 0.025; // 极低音量，潜意识引导
    }
  }
  return buffer;
}

// ============================================================
//  新增：LUFS 响度标准化
// ============================================================

/**
 * 简化的 LUFS 测量与标准化
 * 1. 测量 RMS 响度（近似 integrated LUFS）
 * 2. 计算到目标 LUFS 的增益差
 * 3. 应用增益（原地修改 AudioBuffer）
 */
function normalizeLUFS(buffer: AudioBuffer, targetLUFS: number = -16): void {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  
  // 1. 测量所有声道的 RMS 能量
  let sumSquared = 0;
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      sumSquared += data[i] * data[i];
    }
  }
  const rms = Math.sqrt(sumSquared / (length * channels));
  
  // 2. RMS → 近似 LUFS（简化公式，实际 LUFS 需要 K-weighting 滤波器）
  const currentLUFS = rms > 0 ? 20 * Math.log10(rms) - 0.691 : -100;
  
  // 3. 计算增益差
  const gainDB = targetLUFS - currentLUFS;
  // 限制最大调整幅度（防止极端情况）
  const clampedGainDB = Math.max(-12, Math.min(12, gainDB));
  const gainLinear = Math.pow(10, clampedGainDB / 20);
  
  console.log(`[LUFS] 当前: ${currentLUFS.toFixed(1)} LUFS → 目标: ${targetLUFS} LUFS, 增益: ${clampedGainDB.toFixed(1)} dB`);
  
  // 4. 应用增益
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] *= gainLinear;
      // 硬限幅保护
      if (data[i] > 1.0) data[i] = 1.0;
      if (data[i] < -1.0) data[i] = -1.0;
    }
  }
}

// ============================================================
//  新增：输出格式编码器（优先 Opus → 兜底 WAV）
// ============================================================

/**
 * 优先尝试浏览器原生 Opus/WebM 编码（体积减少 90%+）
 * 不支持时回退到 WAV
 */
async function encodeAudio(buffer: AudioBuffer): Promise<Blob> {
  // 检测浏览器是否支持 MediaRecorder + Opus
  const opusMime = 'audio/webm;codecs=opus';
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(opusMime)) {
    try {
      console.log("[Encode] 使用 Opus/WebM 编码...");
      return await encodeWithMediaRecorder(buffer, opusMime);
    } catch (e) {
      console.warn("[Encode] Opus 编码失败，回退 WAV:", e);
    }
  }
  
  // 回退到 WAV
  console.log("[Encode] 使用 WAV 编码");
  return bufferToWav(buffer);
}

/**
 * 通过 MediaRecorder API 将 AudioBuffer 编码为压缩格式
 */
function encodeWithMediaRecorder(buffer: AudioBuffer, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(dest);

    const recorder = new MediaRecorder(dest.stream, { 
      mimeType,
      audioBitsPerSecond: 128000 // 128kbps — 高质量
    });
    
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    
    recorder.onstop = () => {
      audioCtx.close();
      resolve(new Blob(chunks, { type: mimeType }));
    };
    
    recorder.onerror = (e) => {
      audioCtx.close();
      reject(e);
    };

    recorder.start();
    source.start(0);
    
    // 在音频播放完毕后停止录制
    source.onended = () => {
      setTimeout(() => recorder.stop(), 200); // 200ms 缓冲确保完整捕获
    };
  });
}
