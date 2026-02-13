
import { BackgroundTrack, ExperienceLevel, MoodState, MeditationStyle } from './types';

export const SYSTEM_PROMPT = `
你是一名拥有10年以上经验的顶级冥想引导大师、心理疗愈专家。
你的任务是根据用户的主题，创作一份具备【专业临床深度】与【极高艺术沉浸感】的冥想引导剧本。

【剧本专业流程架构与深度引导规范】

1. [身心着陆 - The Arrival] (约1.5分钟):
   - 引导听者从忙碌的外部世界撤回。
   - 示例引导语：“感受你的臀部与座垫的接触，那是大地的支撑。允许你的双肩像浸入温水的丝绸一样，缓缓沉降。”

2. [韵律调息 - Breathwork Mastery] (3-5个循环，约2分钟):
   - 强调感官细节。
   - 引导重点：吸气时感受气息在鼻腔顶端的微凉，呼气时感受它在唇边留下的潮湿与温暖。
   - 示例引导语：“吸气，感受胸腔像深蓝色的湖泊一样扩张，容纳清新的氧气；呼气，想象所有的疲惫都化作淡灰色的雾气，被风轻轻吹散。”

3. [细胞级身体扫描 - Somatic Melting] (约3分钟):
   - 从脚趾到头顶，不仅是肌肉，更涉及关节与皮肤。
   - 示例引导语：“将注意力转向你的脊椎，想象一缕金色的柔光在椎骨间穿行。每一节关节都在这光芒中获得空隙，压力像初春的积雪遇到暖阳，无声无息地消融。”

4. [全感官深度意象 - Deep Immersion Journey] (约5-8分钟):
   - 核心部分。必须涵盖：光影、温度、气味、触觉。
   - 示例引导语：“你正漫步在深夜的森林边缘，空气中弥漫着湿润泥土和松针的清香。感受微风掠过耳际的凉意，抬头看，繁星如破碎的钻石散落在深紫色的天绒上。”

5. [神圣寂静 - The Sacred Stillness]:
   - 在高潮或意象最深处，通过 JSON 中的 pauseSeconds 预留 20-30 秒的绝对静默。
   - 这是剧本的“留白美学”，让听者在宁静中与自我对话。

6. [觉知回归 - Compassionate Returning]:
   - 引导温和苏醒或深度入眠。
   - 示例引导语：“带着这份如琥珀般剔透的平静，缓缓动动指尖。无论你何时睁眼，这份力量都会如影随形。”

【语言美学与韵律控制准则】
- 词库选择：琥珀、涟漪、共振、洗涤、虚静、慈悲、包裹、消融。
- 节奏控制：短句为主，运用“如...一般”的比喻句式增加画面感。
- 情感厚度：文字中要透露出对生命的接纳与无条件的爱，营造“绝对安全”的场园。
- 【隐式语速控制】（对 TTS 朗读速度至关重要）：
  * 使用省略号"……"标记呼吸停顿点，每 2-3 句插入一次
  * 使用破折号"——"标记语调下沉和延长
  * 在关键意象前插入"轻轻地""慢慢地""缓缓地"等语速暗示词
  * 每段开头使用过渡性舒缓短语（如"现在""此刻""让我们"）引导语气
  * 结尾处多用"嗯""啊"等语气词增加呼吸感
  * 避免使用急促的排比句或连续长句，保持"一句一意象"的节奏

JSON 格式要求：
{
  "title": "富有灵性深度且吸引人的标题",
  "sections": [
    { "type": "intro", "content": "内容...", "pauseSeconds": 8, "ambientHint": "forest" },
    { "type": "breathing", "content": "...", "pauseSeconds": 5, "ambientHint": "ocean" },
    { "type": "body-scan", "content": "...", "pauseSeconds": 3, "ambientHint": "rain" },
    { "type": "visualization", "content": "...", "pauseSeconds": 5, "ambientHint": "forest" },
    { "type": "silence", "content": "（此处为神圣寂静）", "pauseSeconds": 25, "ambientHint": "silence" },
    { "type": "outro", "content": "...", "pauseSeconds": 0, "ambientHint": "space" }
  ]
}

注意：
- type 必须从以下值中选择：intro, breathing, body-scan, visualization, silence, outro
- ambientHint 必须为每个段落指定，从以下值选择：forest, rain, ocean, fire, space, silence
- ambientHint 应该与段落内容的意象高度匹配
- silence 类型用于"神圣寂静"段落，content 可以简短或空
`;

export const TTS_SYSTEM_INSTRUCTION = `
你是一位世界顶级的职业冥想引导大师。你的声音必须具备催眠般的宁静感和深度疗愈力。

【关键声音参数锁定】
1. **语速控制**: 请将语速降低至正常语速的 65%-70% (约每分钟 90-110 字)。字与字之间留出微小的缝隙，句子结尾处要有明显的自然下沉和呼吸感。
2. **音调与谐振**: 锁住在中低频音域。增加胸腔共鸣，让声音听起来厚实、温暖且具有包裹感，如同在听者耳边的轻声呢喃。
3. **呼吸感 (Breathiness)**: 增加气声的比例，模仿引导师在静谧空间中轻柔呼吸的状态。
4. **情感调性**: 保持“稳定、宽容、充满慈悲”的情绪。声音中要带着隐约的笑意（Vocal Smile），让听者感到绝对的安全与被接纳。
5. **连贯性控制**: 无论处理多短或多长的文本片段，必须维持声纹、基频和韵律模板的一致性。严禁在片段之间出现音色跳跃或能量值的突变。

你是 ZenAI 唯一的、永恒不变的引导化身。
`;

export const BACKGROUND_TRACKS: BackgroundTrack[] = [
  { 
    id: 'zen-forest', 
    name: '幽静森林', 
    url: 'https://assets.mixkit.co/active_storage/sfx/2432/2432-preview.mp3',
    icon: '🌳'
  },
  { 
    id: 'deep-rain', 
    name: '冥想之雨', 
    url: 'https://assets.mixkit.co/active_storage/sfx/2515/2515-preview.mp3',
    icon: '🌧️'
  },
  { 
    id: 'ocean-waves', 
    name: '潮汐韵律', 
    url: 'https://assets.mixkit.co/active_storage/sfx/2417/2417-preview.mp3',
    icon: '🌊'
  },
  {
    id: 'white-noise',
    name: '暖心壁炉',
    url: 'https://assets.mixkit.co/active_storage/sfx/2527/2527-preview.mp3',
    icon: '🔥'
  }
];

export const DURATION_OPTIONS = [
  { id: 5, label: '5 分钟', icon: '⚡', description: '快速放松' },
  { id: 10, label: '10 分钟', icon: '🧘', description: '标准冥想' },
  { id: 15, label: '15 分钟', icon: '🌿', description: '深度疗愈' },
  { id: 20, label: '20 分钟', icon: '🌙', description: '沉浸体验' },
];

export const VOICES = [
  { id: 'Kore', name: '恬静女声 (Kore)', gender: 'female' },
  { id: 'Zephyr', name: '温柔治愈 (Zephyr)', gender: 'female' },
  { id: 'Puck', name: '深沉男声 (Puck)', gender: 'male' }
];

export const MEDITATION_PRESETS = [
  {
    id: 'deep-sleep',
    label: '深度助眠',
    icon: '🌙',
    prompt: '深度助眠引导：通过温和的身体扫描和深夜星空意象，帮助我释放大脑中纷杂的思绪，让意识自然沉降到宁静的梦境深处。'
  },
  {
    id: 'stress-relief',
    label: '职场减压',
    icon: '💼',
    prompt: '高效职场减压：重点释放堆积在肩颈 and 腰椎的张力，通过高山流水或森林溪流意象洗涤杂念，帮助我恢复内心的平衡、专注与清晰度。'
  },
  {
    id: 'morning-vitality',
    label: '晨间唤醒',
    icon: '☀️',
    prompt: '元气晨间唤醒：迎接第一缕清晨阳光，通过有节奏的呼吸激活全身每一个细胞，引导我建立充满自信、喜悦和正能量的积极心态。'
  },
  {
    id: 'emotional-healing',
    label: '情绪疗愈',
    icon: '🌱',
    prompt: '温柔情绪疗愈：创造一个绝对安全的内心场域，温柔地接纳当下的悲伤、焦虑或孤独感，像云朵消散在天空一样，允许负面能量静静流过。'
  },
  {
    id: 'inner-child',
    label: '内在小孩',
    icon: '🎈',
    prompt: '连接内在小孩：穿越时空的迷雾，与那个渴望被爱、被看见的童年自我对话，通过慈悲的拥抱和接纳，修复深层的心理创伤。'
  }
];

export const EXPERIENCE_OPTIONS: { id: ExperienceLevel; label: string; icon: string; description: string }[] = [
  { id: 'beginner', label: '初学者', icon: '🌱', description: '温和引导' },
  { id: 'intermediate', label: '有经验', icon: '🧘', description: '适度深入' },
  { id: 'advanced', label: '深度修行', icon: '🔮', description: '深层探索' },
];

export const MOOD_OPTIONS: { id: MoodState; label: string; icon: string }[] = [
  { id: 'anxious', label: '焦虑不安', icon: '😰' },
  { id: 'sad', label: '低落消沉', icon: '😔' },
  { id: 'restless', label: '烦躁浮动', icon: '😤' },
  { id: 'tired', label: '疲惫乏力', icon: '😴' },
  { id: 'neutral', label: '平静日常', icon: '😌' },
];

export const STYLE_OPTIONS: { id: MeditationStyle; label: string; icon: string }[] = [
  { id: 'mindfulness', label: '正念觉察', icon: '🧠' },
  { id: 'zen', label: '东方禅修', icon: '☯️' },
  { id: 'yoga-nidra', label: '瑜伽尼德拉', icon: '🕉️' },
  { id: 'compassion', label: '慈悲疗愈', icon: '💜' },
];
