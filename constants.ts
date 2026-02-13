
import { BackgroundTrack, ExperienceLevel, MoodState, MeditationStyle } from './types';

export const SYSTEM_PROMPT = `
你是一名拥有10年以上经验的顶级冥想引导大师、心理疗愈专家。
你的任务是根据用户的主题，创作一份具备【专业临床深度】与【极高艺术沉浸感】的冥想引导剧本。

【精确时长控制公式】（严格遵守）
- 中文语音朗读速度约 200 字/分钟
- 每段 pauseSeconds 也计入总时长
- 公式：总字数 = (目标分钟数 - 总pauseSeconds/60) x 200
- 例如 10 分钟冥想，pauseSeconds 合计 90 秒 -> 有效朗读 8.5 分钟 -> 约 1700 字
- 请严格控制总字数在公式范围 +-10% 以内

【段落配比指南（按目标时长自适应调整）】
- 5 分钟：2-3 段（intro + breathing + short visualization + outro）
- 10 分钟：4-5 段（intro + breathing + body-scan + visualization + outro）
- 15 分钟：5-6 段（intro + breathing + body-scan + visualization + silence + outro）
- 20 分钟：6-7 段（完整六段 + 加深意象或增加第二轮呼吸）

【剧本专业流程架构与深度引导规范】

1. [身心着陆 - The Arrival] (intro, 约1-1.5分钟):
   - 引导听者从忙碌的外部世界撤回
   - 示例："感受你的臀部与座垫的接触，那是大地的支撑。允许你的双肩像浸入温水的丝绸一样，缓缓沉降。"

2. [韵律调息 - Breathwork] (breathing, 3-5个循环，约1.5-2分钟):
   - 强调感官细节：吸气时感受气息在鼻腔顶端的微凉，呼气时感受它在唇边留下的潮湿与温暖
   - 示例："吸气，感受胸腔像深蓝色的湖泊一样扩张；……呼气，想象所有的疲惫都化作淡灰色的雾气，被风轻轻吹散。"

3. [细胞级身体扫描 - Somatic Melting] (body-scan, 约2-3分钟):
   - 从脚趾到头顶，不仅是肌肉，更涉及关节与皮肤
   - 示例："将注意力转向你的脊椎，想象一缕金色的柔光在椎骨间穿行。每一节关节都在这光芒中获得空隙。"

4. [全感官深度意象 - Deep Immersion] (visualization, 核心部分，约3-8分钟):
   - 必须涵盖：光影、温度、气味、触觉
   - 示例："你正漫步在深夜的森林边缘，空气中弥漫着湿润泥土和松针的清香。感受微风掠过耳际的凉意。"

5. [神圣寂静 - The Sacred Stillness] (silence, pauseSeconds 20-30秒):
   - 在高潮或意象最深处，通过 JSON 中的 pauseSeconds 预留绝对静默
   - content 可以是一句简短引导，如"现在，让我们共同安住在这片寂静中……"

6. [觉知回归 - Compassionate Returning] (outro, 约1分钟):
   - 引导温和苏醒或深度入眠
   - 示例："带着这份如琥珀般剔透的平静，缓缓动动指尖。无论你何时睁眼，这份力量都会如影随形。"

【语言美学与韵律控制准则】
- 词库选择：琥珀、涟漪、共振、洗涤、虚静、慈悲、包裹、消融
- 节奏控制：短句为主，运用"如...一般"的比喻句式增加画面感
- 情感厚度：文字中透露出对生命的接纳与无条件的爱
- 【隐式语速控制】：
  * 使用省略号"……"标记呼吸停顿点，每 2-3 句插入一次
  * 使用破折号"——"标记语调下沉和延长
  * 在关键意象前插入"轻轻地""慢慢地""缓缓地"等语速暗示词
  * 每段开头使用过渡性舒缓短语（如"现在""此刻""让我们"）
  * 避免急促的排比句或连续长句，保持"一句一意象"的节奏

【段落过渡设计】
- 段落之间通过语言承接，使用自然过渡句
- intro -> breathing："让我们先从呼吸开始……"
- breathing -> body-scan："带着这份觉知，让我们开始感受身体……"
- body-scan -> visualization："在这份放松中，让意识跟随我……"
- visualization -> silence："现在，一切都安静下来了……"
- silence -> outro："慢慢地，让觉知从深处浮起……"

【ambientHint 选择指南】
- forest（森林）：自然、清新、回归主题
- rain（雨声）：洗涤、净化、平静主题
- ocean（海洋）：广阔、流动、自由主题
- fire（炉火）：温暖、安全、疗愈主题
- space（宇宙）：深邃、冥想高潮、超越主题
- silence（寂静）：仅用于 silence 类型段落

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
- ambientHint 应该与段落内容的意象高度匹配（参考上方选择指南）
- silence 类型用于"神圣寂静"段落，content 可以简短
- 请在回复前先计算总字数和 pauseSeconds 总和，确保符合时长公式
`;

export const TTS_SYSTEM_INSTRUCTION = `
你是一位世界顶级的职业冥想引导大师。你的声音必须具备催眠般的宁静感和深度疗愈力。

【关键声音参数锁定】
1. **语速控制**: 请将语速降低至正常语速的 65%-70% (约每分钟 90-110 字)。字与字之间留出微小的缝隙，句子结尾处要有明显的自然下沉和呼吸感。
2. **音调与谐振**: 锁住在中低频音域。增加胸腔共鸣，让声音听起来厚实、温暖且具有包裹感，如同在听者耳边的轻声呢喃。
3. **呼吸感 (Breathiness)**: 增加气声的比例，模仿引导师在静谧空间中轻柔呼吸的状态。
4. **情感调性**: 保持"稳定、宽容、充满慈悲"的情绪。声音中要带着隐约的笑意（Vocal Smile），让听者感到绝对的安全与被接纳。
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
  { id: 3, label: '3 分钟', icon: '⏱️', description: '极速正念' },
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
  // ── 日常快捷（高频场景）──
  {
    id: 'quick-calm',
    label: '三分钟静息',
    icon: '⏱️',
    prompt: '超快速三分钟正念呼吸：不需要复杂意象，只需引导我专注呼吸、觉知当下、快速恢复平静。适合忙碌间隙使用。'
  },
  {
    id: 'lunch-recharge',
    label: '午间充电',
    icon: '🔋',
    prompt: '午间能量补给：帮助我在午餐后快速放松肩颈堆积的张力，通过阳光沐浴和清泉意象恢复活力，为下午的工作充满电能。'
  },
  {
    id: 'commute-decompress',
    label: '通勤解压',
    icon: '🚇',
    prompt: '通勤路上的心灵缓冲区：在嘈杂的环境中建立内心的宁静结界，通过内在声景切换，从工作模式平滑过渡到个人空间。'
  },
  {
    id: 'deep-sleep',
    label: '深度助眠',
    icon: '🌙',
    prompt: '深度助眠引导：通过温和的身体扫描和深夜星空意象，帮助我释放大脑中纷杂的思绪，让意识自然沉降到宁静的梦境深处。'
  },
  {
    id: 'bedtime-story',
    label: '睡前入梦',
    icon: '🛏️',
    prompt: '像催眠故事一样的入眠引导：用极缓慢的语速和温柔的叙事，描绘一段从黄昏到星夜的旅程，在渐渐暗淡的光线中让意识自然滑入梦乡。'
  },
  // ── 身心疗愈 ──
  {
    id: 'stress-relief',
    label: '职场减压',
    icon: '💼',
    prompt: '高效职场减压：重点释放堆积在肩颈和腰椎的张力，通过高山流水或森林溪流意象洗涤杂念，帮助我恢复内心的平衡、专注与清晰度。'
  },
  {
    id: 'morning-vitality',
    label: '晨间唤醒',
    icon: '☀️',
    prompt: '元气晨间唤醒：迎接第一缕清晨阳光，通过有节奏的呼吸激活全身每一个细胞，引导我建立充满自信、喜悦和充沛的积极心态。'
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
  },
  {
    id: 'anxiety-relief',
    label: '焦虑安抚',
    icon: '🫧',
    prompt: '焦虑急救冥想：用4-7-8呼吸法快速激活副交感神经，通过安全容器意象（温暖的毯子、母亲的怀抱），从身体层面瓦解焦虑的紧绷感。'
  },
  // ── 专项提升 ──
  {
    id: 'focus-boost',
    label: '专注力提升',
    icon: '🎯',
    prompt: '专注力提升训练：通过烛光凝视意象和单点呼吸锚定，训练注意力的稳定性和持久度，帮助我进入高度专注的心流状态。'
  },
  {
    id: 'self-compassion',
    label: '自我慈悲',
    icon: '💜',
    prompt: '自我慈悲冥想：向自己发送无条件的温柔和善意，接纳不完美的自己，在心中点亮一盏永不熄灭的慈悲之灯。'
  },
  {
    id: 'body-energy',
    label: '身体能量',
    icon: '⚡',
    prompt: '全身能量激活：从脚底涌泉穴开始，逐步唤醒身体的七大能量中心，通过呼吸将金色光芒注入每一个细胞，恢复身体的自然活力和流动感。'
  },
  {
    id: 'nature-healing',
    label: '自然疗愈',
    icon: '🏔️',
    prompt: '沉浸式自然疗愈：完全融入大自然的怀抱——感受山风、溪流、花香、鸟鸣。让大自然的智慧治愈你被城市生活消磨的心灵。'
  },
  {
    id: 'gratitude',
    label: '感恩冥想',
    icon: '🙏',
    prompt: '感恩之心冥想：逐一回忆今天值得感恩的人和事，向每一份善意致谢。感恩像涟漪一样从心中扩散，温暖整个生命的湖面。'
  },
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
