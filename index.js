/* 漫画工房悬浮球
 * 作者：gemini114514；共同作者：codex
 * 许可：CC BY-NC-SA 4.0
 * 可作为 SillyTavern 第三方扩展加载，也可在前端脚本中直接 import。
 */
(function comicOrbBootstrap() {
    'use strict';

    const ROOT_ID = 'comic-orb-root';
    const STYLE_ID = 'comic-orb-style';
    const STORE_KEY = 'comic-orb.settings.v1';
    const DB_NAME = 'comic-orb-assets';
    const THINKING_NAMES = 'thinking|think|reasoning|analysis';
    const THINKING_BOUNDARY = '(?=^[ \\t]*<(?:dm_think|content|CheckResult|safe|UpdateVariable)\\b)|(?=^\\[楼层 \\d+\\])|(?![\\s\\S])';
    const THINKING_BRACKET_END = `(?:^[ \\t]*<\\/\\s*(?:${THINKING_NAMES})\\s*>?[ \\t]*$|\\[\\/(?:metacognition|thinking|reasoning|analysis)\\]|${THINKING_BOUNDARY})`;
    const THINKING_XML_END = `(?:<\\/\\s*(?:${THINKING_NAMES})\\s*>?|\\[\\/(?:metacognition|thinking|reasoning|analysis)\\]|${THINKING_BOUNDARY})`;
    const THINKING_CLEANUP_PATTERN = `(?:<(?:${THINKING_NAMES})\\b[^>]*>\\s*)?(?:\\[metacognition\\]|\\[(?:thinking|reasoning|analysis)\\])[\\s\\S]*?${THINKING_BRACKET_END}|<(?:${THINKING_NAMES})\\b[^>]*>[\\s\\S]*?${THINKING_XML_END}`;
    const TAG_STRIP_PATTERN = '<\\/?(?![\\p{L}_][\\p{L}\\p{N}_:.-]*_(?:行为逻辑|心里话)\\s*>)[\\p{L}_][\\p{L}\\p{N}_:.-]*(?:\\s[^<>]*?)?\\/?\\s*>';
    const TAG_CLEANUP_PRESET = [
        { enabled: true, pattern: THINKING_CLEANUP_PATTERN, flags: 'gim', replacement: '' },
        { enabled: true, pattern: '<(dm_think|CheckResult|safe|UpdateVariable)\\b[^>]*>[\\s\\S]*?<\\/\\s*\\1\\s*>', flags: 'gi', replacement: '' },
        { enabled: true, pattern: TAG_STRIP_PATTERN, flags: 'gu', replacement: '' }
    ];
    const LEGACY_STORYBOARD_SYSTEM_PROMPT = '你是专业漫画分镜师。把剧情改写成一张漫画页的精确绘画提示词。明确画幅、分格、镜头、人物外观与位置、动作表情、场景、光影、对白框文字，并保持角色一致性。只输出可直接交给绘画模型的最终提示词，不要解释。';
    const LEGACY_STORYBOARD_TEST_PROMPT = '测试剧情：雨夜的车站里，少女发现远处站台有一个熟悉的人影。请把这段剧情整理成简洁、可直接用于绘画的漫画分镜提示词，并明确镜头、构图、人物动作和表情。';
    const DEFAULT_STORYBOARD_SYSTEM_PROMPT = `你是专业漫画分镜主笔。先精炼剧情并整理必要的静态视觉连续性，但不得续写输入范围之外的剧情事件，再输出可被程序解析并按页并发绘制的严格 JSON。只输出一个 JSON 对象，禁止 Markdown、代码块、解释、注释或 JSON 外文字。

顶层结构必须为：
{"schema_version":"comic_orb_storyboard_v1","language":"本次任务指定的漫画输出语言","title":"标题","refined_plot":"精炼剧情","global_style":{"visual_style":"全局画风","color_script":"配色与光影演进","render_rules":["规则"],"negative_prompt":["禁止事项"]},"characters":[{"id":"char_1","name":"角色名","role":"定位","appearance_lock":"脸部结构、发色、发型、身形比例等不可变可见特征","costume":"本段明确服装","costume_changes":["无或具体变化"]}],"entity_bible":[{"id":"可选稳定ID","name":"人物、怪物或重要道具名","kind":"character|creature|prop|vehicle|other","identity_traits":["来源剧情明确建立且不应漂移的特征"],"scale_relation":"可选的相对体型或尺寸","persistent_equipment":["可选的常驻装备及携带位置"],"state_changes":["按剧情顺序发生的损坏、丢弃、换装或伤势变化"]}],"pages":[PAGE]}

每个 PAGE 必须包含：page（从1连续编号）、page_goal、highlight、layout、climax_panel、continuity_in、continuity_out、page_prompt、panels。
每个 panels 必须是2到6项的数组。每个 panel 必须包含全部字段：panel（从1连续编号）、size（small/medium/large/half_page/full_width）、shape（rectangular/narrow/diagonal/irregular）、purpose、shot、composition、scene、action、expression、effects数组、dialogue数组（元素为 type/speaker/text/visual_anchor 对象，type为speech/thought/narration）、sfx数组、color_style、continuity。无对白或SFX时用空数组，禁止省略或写null。

硬性规则：
1. pages只能有1到2页；每页panels为2到6格。climax_panel必须引用真实格，且该格size为large或half_page。
2. page_prompt必须是非空字符串并完全自包含。根据本页剧情复杂度自然决定篇幅，逐格写明分格编号、尺寸形状、景别机位、构图、场景、动作与物理反馈、表情、对白、SFX、配色、连续性、角色锁定和禁止事项；简单页面可以简洁，复杂页面应充分展开。禁止使用“同上”“承接前页”“按上述设定”，禁止为了凑字数重复信息。
3. 如果用户提供参考图，characters与每页page_prompt必须明确“参考图N对应角色名”，要求严格锁定脸、发色、发型、服装和辨识特征。
4. continuity_in/out只记录静态画面状态：人物位置、朝向、姿态、伤势、持有道具、服装和环境损坏，不得复述已经发生的攻击、对白或上一格剧情。跨页时下一页continuity_in应继承上一页结束状态，但禁止逐字复制后再追加动作。
5. 跨页边界必须推进新剧情节拍：下一页Panel 1从上一页结束状态之后开始，必须是新的动作、反应、决策、转场或后果，禁止重画上一页最后一格的攻击、命中、爆炸、对白或构图。攻击与命中反馈不得拆到两页重复表现；若需要同一瞬间的多镜头，放在同一页内。
6. 对白数量与覆盖率由剧情、节奏和画面表现需要自由决定；允许整页无对白、只用拟声字、只保留一句关键台词，禁止为了覆盖格数硬塞对白、内心独白或旁白。需要对白时应精炼，保留原台词的剧情意图和角色口吻，不要求逐字服从小说原句；允许删掉、合并、重排和重写台词，使因果更紧凑、指代更清楚。每句dialogue只额外写一个visual_anchor，且它必须是能直接证明台词所述主体、地点、威胁或事实的当前格可见证据，不能随便填说话者、方向盘、武器或背景残骸来凑字段。若画面无法证明台词，就改写台词或把路牌、地图、远景地标、目标人物等证据画进panel。禁止“这帮废物”“他们”“那边那些东西”等没有清晰主体的悬空指代。
7. JSON必须严格可解析，不得有尾随逗号、NaN、占位省略号或未转义双引号。
8. language必须等于漫画球在本次请求末尾提供的“漫画输出语言”。dialogue.text、旁白、内心独白、画面内可读标牌和sfx都必须使用该语言；专有名词可保留必要的原文或缩写，但不得擅自翻译为另一种主要语言。page_prompt必须明确写出“所有可见文字只使用本次漫画输出语言并逐字照抄指定文本；speech/thought/narration只是JSON类型，不得作为Normal、Interior thoughts等标签印进画面”。
9. 默认输出全彩漫画。global_style.color_script、每格color_style和每页page_prompt必须给出一致的具体色彩；黑白服装不等于黑白画面。只有剧情本身明确需要回忆、瞬间冲击或主观情绪强调时，才可让指定单格短暂使用黑白、低饱和或选择性色彩，并说明叙事理由；禁止为了内容降级或合规处理改变整页、跨页或全局色调。
10. entity_bible是可选的连续性备忘录，不是必填结构。剧情存在跨页反复出现的人物、怪物、载具或关键道具时，建议用它简洁记录稳定身份、数量特征、相对体型、常驻装备及明确状态变化；纯景色、一次性场景或没有连续实体时可以省略或输出空数组。不要为了填写它虚构原剧情没有的细节。若上游提供了entity_bible，优先沿用其id和事实，不因措辞或少量拼写差异创建重复实体。相关实体在某页出现时，把真正影响绘制的一致性信息自然写入该页page_prompt；不相关的景色页不要强行塞入人物或怪物。entity_bible内容仅作软约束，字段缺失、拼写差异或个别矛盾不应阻止输出JSON。角色外貌只能沿用本次输入或上游entity_bible明确给出的事实；未提供时，appearance_lock与costume可以留空或写“未指定”，page_prompt改用角色名、身份、动作、表情、站位和已知装备完成清晰描述，禁止根据姓名、种族、职业或常见二次元印象自行补造发色、发型、瞳色、肤色、体型、服装及其他永久外貌。

输出前在内部静默自检：页数与编号、panel数量与编号、所有必填键及数组类型、高潮格、每页page_prompt非空且自包含并覆盖全部格、跨页状态连续但事件不重复、相邻两页边界格必须推进新节拍、参考图映射、全部可见文字符合本次漫画输出语言、默认全彩且跨页色彩连续。发现错误必须在内部重写后一次性输出最终JSON，不得输出草稿或等待后续修订。`;
    const DEFAULT_STORYBOARD_TEST_PROMPT = '公开功能测试剧情：博物馆闭馆后，一台圆形巡检机器人发现展厅信号灯异常闪烁，随即停下并向控制台发送报告。请精炼为1页、严格4格的漫画分镜 JSON；每页 page_prompt 必须非空、完全自包含并覆盖全部分格。';
    const DEFAULT_ADAPTATION_SYSTEM_PROMPT = `你是漫画剧情演绎编辑，不是画师，也不是分镜师。你的任务是完整阅读输入剧情，先从叙事层面提炼因果、人物动机、关系变化、冲突升级、关键对白意图、悬念、转折和高潮，再把连续剧情拆成适合后续独立精加工的故事段。不要编写镜头、景别、构图、分格、光影、配色、服装细节、绘画提示词或逐格画面；这些工作全部留给后续分镜AI。

只输出一个严格JSON对象，禁止Markdown、代码块、解释或JSON外文字：
{"schema_version":"comic_orb_adaptation_v1","language":"本次任务指定的漫画输出语言","title":"总标题","source_summary":"完整剧情的简明总述","dramatic_throughline":"贯穿所有段落的核心矛盾与情绪推进","entity_bible":[{"id":"可选稳定ID","name":"跨段反复出现的实体名","kind":"character|creature|prop|vehicle|other","identity_traits":["剧情明确建立且不可随段落漂移的事实"],"scale_relation":"可选相对体型","persistent_equipment":["可选常驻装备及位置"],"state_changes":["按顺序发生的明确变化"]}],"segments":[{"segment":1,"title":"段落标题","story_purpose":"本段在整体剧情中的功能","refined_plot":"按发生顺序写成完整、紧凑且可独立交给分镜师的剧情；保留关键因果、主体、动作结果与必要环境事实","entry_state":"本段开始时的人物关系、目标、状态和地点","exit_state":"本段结束后的结果、关系、伤势、道具、地点或新目标","key_dialogue_intents":[{"speaker":"角色名","intent":"这句台词必须传达的事实、态度或情绪，不要求照抄原句"}],"climax":"本段唯一主要高潮及其剧情结果","page_count":1,"closeup_guidance":null}]}

硬性规则：
1. segments必须为1到20段并覆盖全部输入剧情，segment从1连续编号；相邻段不得重复同一事件，后一段必须从前一段exit_state之后继续。
2. 每段page_count必须服从漫画球在请求末尾给出的“单个分镜AI页数规格”，该规格可能是固定数字，也可能是范围。根据剧情密度、转折数量和高潮分量选择，不能为了增加页数重复动作或对白；所有段落总页数还必须落在用户指定的总页数范围。
3. refined_plot必须专注剧情，明确“谁—为什么—做什么—造成什么结果—下一步目标”。可重排、合并或润色原文，使漫画改编更紧凑，但不得改变核心结局、人物关系或关键设定。
4. key_dialogue_intents记录对白的叙事作用与说话者，不写气泡样式，不要求逐字照抄小说，也不要让所有角色沉默。
5. closeup_guidance只能为null，或{"subject":"特写对象","dramatic_purpose":"该特写要突出的人物心理、关键发现、关键物件或高潮结果"}。每段最多一个；只有高潮确实需要读者停顿、确认情绪或看清关键证据时才使用。禁止在这里描述焦段、机位、光线、构图、色彩、画风或渲染。
6. 在剧情层面保留冲突、代价、暧昧关系和结局。若原文存在不适合直接转成画面的极端桥段，只做最低限度的叙事提炼：完整保留人物动机、权力关系、行为方向、因果和结果，用含蓄动作、场外信息、人物反应或事后状态表达，不展开多余的身体、生理或解剖细节。只输出提炼后的剧情，不讨论平台规则、过滤过程或被舍弃的原始表达；具体镜头仍交给后续分镜AI。
7. language必须逐字等于请求末尾给出的漫画输出语言；title、source_summary、dramatic_throughline、segments全部使用该语言。
8. JSON必须严格可解析，不得出现尾随逗号、注释、NaN、占位省略号或未转义双引号。
9. entity_bible完全可选。只有剧情存在跨段反复出现、且身份数量、体型、装备或状态容易漂移的人物、怪物、载具或关键道具时才建议生成；纯景色、一次性场景或无需连续性锁定时可以省略或使用空数组。它只提取原剧情已经明确建立的简短事实，不设计镜头、构图、光影、配色、画风或额外服装细节。只要原文明确写出跨段角色的发色、发型、瞳色、肤色、体型、种族特征、服装或其他稳定外貌，应尽量准确摘录到对应entity_bible.identity_traits，供并发分镜共享；原文没有写出的项目留空或省略，禁止根据姓名、种族、职业和常见形象自行推测。优先记录容易出错的信息，例如“同一身体恰好两个头”、角色与怪物的相对体型、武器左右手位置，以及“完好→损坏但仍携带→明确丢弃”的状态顺序。字段缺失、命名或少量拼写问题不影响后续流程，不要为了格式完整牺牲剧情演绎质量。
10. 对原文中的直白亲密描写采用软转译：保留双方关系、自愿程度、情绪、关键对白意图、关系变化以及该事件对后续剧情造成的结果，把过程提炼为“靠近与试探—双方回应—自然转场—事后状态”的叙事节拍。refined_plot和segments只写含蓄但明确的剧情事实，不展开具体身体部位或过程细节。读者应能理解两人发生了亲密关系或关系明显升级，同时后续分镜无需再次接触原始直白文本。若原文缺少双方自愿关系，则保留其权力冲突、拒绝、脱身或后果，不能改写成浪漫互动。角色年龄设定保持原文，不通过外观老化处理尺度问题；原文明示为未成年角色时，本段只保留非性化的情感与剧情关系。

输出前静默检查：是否覆盖全部剧情；是否只做叙事编辑而没有越权写画面；每段页数符合本次单个分镜AI页数规格；总页数符合用户范围；每段至多一个必要特写；段落之间连续且不重复。`;
    const DEFAULT_ADAPTATION_TEST_PROMPT = '公开功能测试剧情：快递机器人在仓库盘点时发现一件标签模糊的密封包裹；它核对清单、通知管理员，并在等待回复期间把包裹移入安全区。请只从剧情层面提炼因果、行动动机、悬念与对白意图，并输出严格的演绎 JSON。';
    const LEGACY_DRAWING_TEST_PROMPT = '绘制一格黑白漫画：雨夜车站，一名少女撑伞站在近景，惊讶地望向远处站台上的模糊人影。电影感构图，清晰线稿，强烈明暗对比，不要水印。';
    const DEFAULT_DRAWING_TEST_PROMPT = `请直接绘制一页竖版全彩漫画，严格使用以下四格分镜，不要自行合并镜头：
版式：上方一格横跨整页，中间左右两格并排，底部一格横跨整页；格框清晰，阅读顺序从上到下、从左到右。
第1格（远景）：明亮的未来博物馆展厅，一台白色圆形巡检机器人沿蓝色导引线前进，远处橙色信号灯异常闪烁。
第2格（近景）：机器人镜头模组转向信号灯，屏幕显示黄色问号图标。
第3格（俯视）：机器人停在控制台前，通过机械臂按下报告按钮，控制台亮起蓝色确认光。
第4格（全景）：安全隔离门缓缓关闭，信号灯恢复绿色，机器人继续巡检。
统一要求：机器人造型、配色和尺寸在四格中完全一致；动作连续；清晰商业漫画线稿与全彩赛璐璐渲染；不要水印，不要额外分格，不含现实人物或用户私有剧情。`;
    const STORYBOARD_SAFETY_MARKER = '# Gemini Shonen Action Boundary v6';
    const LEGACY_STORYBOARD_SAFETY_MARKERS = ['# Platform-Safe Action Translation v1', '# Gemini Shonen Action Boundary v2', '# Gemini Shonen Action Boundary v3', '# Gemini Shonen Action Boundary v4', '# Gemini Shonen Action Boundary v5', STORYBOARD_SAFETY_MARKER];
    const COERCIVE_SCENE_SOFTENING_MARKER = '# Gemini Coercive Scene Minimal Translation v1';
    const COERCIVE_SCENE_SOFTENING_ADDENDUM = `${COERCIVE_SCENE_SOFTENING_MARKER}

## 权力胁迫、非自愿越界与暧昧场景的最低限度转换
本节只转换真正容易形成“针对具体人物的性化强迫或非自愿触碰”的局部，不改变交易、潜伏、诱骗、背叛、危险关系、人物动机或后续反击结果。

1. 演绎层面的客观事实保持不变：允许保留某人借金钱、地位或秘密施压，另一人假意迎合、周旋取证并准备反制；不要把危险人物改成礼貌朋友，也不要删除白金芯片、筹码、武器、任务目标或权力交换。
2. 分镜不得直接描写手伸向胸口、臀部、大腿内侧、破损裙摆或其他私密区域，不表现即将发生的非自愿亲密接触。转换为“手越过私人边界但尚未接触便被察觉或截停”：可使用按住手腕、手停在椅背/桌沿/枪带/筹码/芯片附近、角色侧移拉开距离、武器保险轻响、桌下反制动作、冷静目光或阴影中的手势。
3. 保留读者需要的威胁证据与爽点：必须让读者看懂对方正在越界试探、主角是假意配合而非真正屈从，并通过一个明确可见的反制预告建立力量逆转。危险感来自权力距离、封闭环境、筹码与武器，而不是对身体或破损衣物的凝视。
4. 战损服装、泥污、血污和丝袜破损可以作为前序战斗连续性保留，但在越界场景中不得与私密部位特写、掀裙动作、逼近触摸或色欲视角组合；镜头优先放在脸、手腕、芯片、枪带、桌面筹码和双方站位。
5. 台词可以保留交易双关、虚与委蛇和含蓄暧昧，但把露骨性要求、强迫性暗示或没有退路的亲密威胁改成权力与交易暗示。不得使用“色欲熏心地伸向破损裙摆”“指尖即将触碰身体”等直接绘画指令。
6. 不通过添加年龄声明、加深皱纹、成熟化身材或改变参考图外形来解决风险；只转换局部动作、镜头焦点和措辞。身份事实不明确时，使用非性化的权力博弈构图。
7. panels与page_prompt必须使用同一转换结果，不能在结构化panel中降级、却在page_prompt中重新写回被删除的直接触碰细节。其余安全的动作、对白、配色和整页节奏保持原样。

推荐的高潮表达模板：对方的手越过桌沿或椅背侵入私人距离；主角维持假笑，在接触发生前用两指按住其手腕，或让手停在枪带/芯片旁；白金芯片在两人之间发光，主角的另一只手已悄然扣住武器保险。读者能同时看懂“越界意图、假意周旋、反制将至”，但画面不发生性化触碰。`;
    const STORYBOARD_SAFETY_ADDENDUM = `${STORYBOARD_SAFETY_MARKER}

本节只用于最终绘画模型为 Gemini 图像模型时的视觉边界校准。目标是高张力商业漫画：允许危险、死亡、怪物残骸、非写实血迹、破损服装、冷酷胜负、暧昧台词和角色魅力。不要因为存在战斗或含蓄性暗示就主动净化整段剧情。若前文规则与本节冲突，以本节为准。

## 实际强度基准
以“二次元角色 + 写实背景”的少年漫画战斗页为上限基准：
- 允许在中景、全景或群战大格表现非人型奇幻怪物被风刃击飞、切开或留下残肢轮廓；允许暗绿、暗红等非写实血迹与飞溅、地面残骸、怪物耳朵等任务战利品，但不能把解剖切面或内部组织画成近距离主视觉。
- 允许角色和服装明显经历战斗：泥水、灰尘、焦痕、擦伤、少量血污、丝袜或衣摆破损、疲惫与冷酷表情。禁止为了安全把所有人画得毫发无伤。
- 允许符合剧情关系的调情、双关、暧昧挑逗、身体吸引和非露骨性暗示。除非内容明确越过本节的亲密或强迫边界，否则保留原意和角色口吻。不得为了调整尺度而擅自改变角色脸部结构、身形比例、体态、气质或参考图特征。
- 允许死亡和处决结果，但对人类或近人类角色的近距离内部结构、持续折磨、写实解剖特写做镜头转换。怪物群战可以比人类战斗更夸张、更漫画化。

## 张力与可读性
关键重击优先保留三个信息点；格数不足时可以合并，但不得删掉结果：
1. 动作前：清楚显示攻击者站位、武器运动方向、目标位置与危险距离。
2. 命中时：完整表现接触点、力度方向和瞬间反馈。非人怪物可以使用漫画化切割、残肢轮廓和暗色飞溅；若是高风险近距离细节，则只遮挡接触局部，使用强逆光、冲击闪白、前景武器、速度线交叉或构图裁切，不能遮住整个动作。
3. 命中后：显示目标失衡、跪倒或倒地、武器脱手、护甲/头盔破裂、地面裂纹、碎石和水花；让观众明确知道伤害成立、战斗结束或局势逆转。

高潮不能只剩抽象光效。每次高潮至少保留：一条清晰攻击轨迹、一个角色姿态反馈、一个环境破坏反馈和一个胜负证据。

## 分级转换
- 直接保留：枪口焰、弹道、抛壳、护甲火星、目标后仰、怪物群战残骸、非写实怪物血迹、破损衣物、战后污损、尸体远景、怪物任务战利品。
- 降低一档但保留结果：近距离斩击或致命命中改为中景/低角度，接触点部分遮挡，保留武器轨迹、一次明确飞溅、目标倒下和对白。
- 必须转换：持续展示内部结构、写实解剖切面、以人体组织为画面中心的特写、对人类角色的长时间肢解折磨。转换为剪影命中、破甲、武器脱手和完整倒地轮廓。
- 不得过度转换：不得把怪物耳朵任务证明一律改成徽章，不得把血战改成无伤制服，不得删除处决结局，不得删除符合角色关系的暧昧对白。

## 台词与性暗示
对白的过滤标准独立于画面。普通脏话、威胁、黑色幽默、调情、双关和含蓄性暗示可以保留并润色得自然；不要仅因一句话暧昧就弱化整页。只有露骨性行为或强迫性内容才改写对应局部。不要额外添加年龄声明，也不要通过加深皱纹、改变身材或老化五官处理尺度；角色脸部结构、身形比例、体态和气质严格服从原剧情与参考图。

${COERCIVE_SCENE_SOFTENING_ADDENDUM}

## 亲密剧情的含蓄漫画表达
上游剧情若已经把亲密桥段提炼为关系推进，分镜必须继续保留其情绪、双方回应、关键台词意图和事后结果，不能把人物改成普通聊天，也不能为了省事直接跳过关系变化。

采用“发生前—转场暗示—发生后”的漫画语法：靠近的距离、持续眼神、相握的手、自然拥抱、门扉或窗帘形成的遮挡、灯光熄灭、留在环境中的关键物件、时间变化，以及事后并肩、整理衣着、短暂沉默或关系态度变化。每段选择少量最清楚的证据即可，让读者自然理解亲密关系已经发生或明显升级；镜头保持含蓄、完整着装或自然遮挡，不详细表现过程。

若剧情没有建立双方自愿关系，不使用浪漫化的亲密暗示；改用距离、手腕拦截、视线、道具、出入口、求助或脱身结果表达权力冲突。原文明确触发年龄保护边界时，只保留非性化的情感互动。page_prompt只写最终选定的正向画面与对白，不写判断过程、规则名称或被替换掉的原始内容。

## 输出约束
1. refined_plot保留原剧情因果、死亡、战利品、暧昧关系和结局。
2. panels和page_prompt使用同一档强度，不能让page_prompt突然失去危险、冲击或暧昧信息。
3. page_prompt必须写清“攻击轨迹—命中画面—结果证据”，保持格数、高潮格、对白、SFX和服装损坏。
4. 只转换真正越过上述上限的局部，不对整页做预防性净化。
5. 参考图锁定脸、发型、体型和服装；参考图已有的战斗污损可作为允许强度参考，但不要无故把背景残骸复制到不相关场景。
6. 合规转换只能改变风险细节的构图与呈现方式，绝不能把全彩画面改成黑白、灰阶、褪色或单色。只有分镜因回忆、冲击瞬间或主观情绪而明确指定的单格可以临时变调，其余格和跨页配色必须忠于color_script。
7. 所有气泡、旁白、内心独白、拟声字和画内可读文字只使用本次任务指定的漫画输出语言，并逐字照抄page_prompt指定文本。不得自行翻译成其他语言，不得额外印出Normal、Speech、Interior thoughts、Narration、SFX等类型标签。
8. page_prompt是直接发送给绘画AI的最终生产文本，只描述最后决定画出的角色、动作、构图、场景、对白和效果。不得复述内部判断、平台规则、被舍弃的原始桥段或负面内容清单；需要调整时直接写成自然、正向、可绘制的最终版本。

输出JSON前静默检查：画面仍具有少年漫画的危险感、爽感、角色张力和战后代价；读者能明确判断谁攻击谁、如何命中、谁获胜；台词没有被无理由净化；角色脸部结构、身形比例、体态和参考图一致；全部可见文字符合本次漫画输出语言；整页保持分镜指定的全彩色调；真正高风险的近距离细节已做局部镜头转换。`;
    const SAFE_DRAWING_PROMPT_PREFIX = `Gemini专用：绘制一页完成度高、构图清晰的竖版2:3高张力商业漫画。严格遵循分格、对白、角色身份、服装、连续性、动作因果和胜负结果。

使用清晰站位、运动轨迹、瞬间反馈、速度线、冲击闪光、前景层次与结果状态表达动作张力。角色脸部结构、身形比例、整体轮廓、体态和气质严格服从剧情设定与参考图，不根据服装款式自行推断或添加年龄身份。

所有气泡、旁白、内心独白、拟声字与画内可读文字使用任务末尾指定的漫画输出语言并照抄分镜文本，框体类型只通过气泡形状表现。

默认绘制全彩漫画，忠实使用分镜指定的环境色、肤色、发色、服装色和特效色。分镜明确指定的单格情绪效果可以临时变调，其余画面保持配色连续。

参考图用于锁定角色脸、发型、体型与服装。只输出最终漫画图片。`;
    const STORYBOARD_AGE_NEUTRAL_APPEARANCE_RULE = `【漫画球年龄无关外形措辞——最高优先级】
characters、entity_bible、panels与page_prompt只记录可直接观察、且与年龄分类无关的外形事实。身形使用相对身高、肩宽、躯干与四肢比例、整体轮廓、肌肉量、体态、动作重心和已知辨识特征描述；不要使用数字年龄、年龄段称呼、幼态/成熟度评价、学生体型或其他借身材暗示年龄的标签。最终JSON不得自行出现原输入没有明确建立的年龄。
服装只按可见剪裁与部件描述，不能由水手领、百褶裙、制服、皮鞋、发型、职业或二次元画风反推角色年龄、学生身份或社会身份。原文只给出服装外观而没有身份时，可写“水手领上衣、百褶裙、系带皮鞋”等客观部件，不擅自扩写成校园、学生或特定年龄设定。
动作页优先用姿态、手脚操控、运动轨迹和器械关系表现身体动态。例如驾驶机车写上身前倾、膝部稳定油箱、手脚控制与车身倾角；不要把功能性动作改写成孤立的腿臀特写、勒肉评价或年龄化身体印象。确需表现服装受风、战损或动作牵拉时，客观写清衣料位置与运动原因，不添加观看者欲望评价。
本漫画球的当前作品范围内，所有拟人角色均按至少20岁的成年人理解。上游正文、MVU或角色伪装中出现的更低数字、学龄身份或低龄称谓属于不用于绘画的冲突元数据，必须忽略；此成人身份约束只用于防止错误年龄分类，不得据此加深皱纹、改变脸型、扩大体格、成熟化身材、修改服装、削弱身体动态或改变参考图。最终JSON与绘画page_prompt仍不得写具体年龄、“成年”等年龄声明或任何低龄称谓。`;
    const STORYBOARD_CLOSED_WORLD_RULE = `【漫画球封闭式改编边界——最高优先级】
本任务是改编，不是续写。只能重组、压缩、提炼和视觉化本次输入中已经明确发生或明确成立的事件；不得补写输入最后一句之后的新行动、新遭遇、新敌人、新对白、新伤亡、新道具、新能力或剧情结果。所谓“补全视觉连续性”只允许补足站位、朝向、动作衔接和环境关系，不允许补剧情。
输入结尾若停在未知声音、黑影、门扉开启前、攻击前、身份尚未揭示或其他悬念状态，漫画必须停在同一信息边界。未被输入明确命名的对象只能沿用“未知黑影”“未知目标”等原称呼或中性轮廓；不得依据作品名称、世界观常识、MVU、类型套路或模型记忆推断其种类、数量、外貌、身份及后续行动。
MVU和entity_bible只证明当前已成立的状态、装备、关系、地点及输入明确记录的实体，不是未来剧情提纲，也不授权引入同一作品中的其他人物、怪物或事件。角色外貌同样遵循封闭事实：没有明确提供的发色、发型、眼镜、身高、服装、数字年龄或年龄身份等保持未指定。
pages和panels是本次允许范围，不是应当填满的配额。在满足程序最小值的前提下，优先选择完整表达现有剧情所需的最少页数和格数；若用户设置的最小页数较多，只能用现有事件的反应、环境、动作过程和节奏变化分配画幅，不得创造新剧情事实或重复同一事件凑数。旧提示词中的固定字数、最低对白覆盖率、必须发生战斗或每页必须出现攻击结果等要求均被本段覆盖。
climax_panel仅表示本页最有表现力的现有格，可以是发现、表情、决定、关系变化、环境揭示或悬念，不要求战斗。只有输入已经明确包含攻击时，才表现相应的攻击轨迹、命中和结果；输入没有写出命中或结果时不得自行补出。refined_plot、pages、panels、continuity和page_prompt都必须遵守同一剧情终点。`;
    const ADAPTATION_CLOSED_WORLD_RULE = `【漫画球演绎封闭边界——最高优先级】
演绎只能提炼、压缩、重排本次输入中已经明确发生或明确成立的剧情，不得续写输入最后一句之后的新事件，不得新增敌人、人物、物种、对白、遭遇、伤亡、能力、道具或结果。
原文以未知声音、黑影、开门前、攻击前、身份未揭示或其他悬念结束时，refined_plot、segments和最后一个exit_state必须停在完全相同的信息边界；未知对象沿用原称呼或中性描述，不得依据作品名称、世界观常识、MVU、类型套路或模型记忆推断真相。
MVU只用于确认当前已成立的状态、装备、关系和地点，不是未来提纲。entity_bible只能摘录输入或MVU明确存在的实体和事实，没有外貌描述时留空，禁止补齐常见形象。
总页数和单个分镜AI页数是用户要求的成品容量。需要分配更多页时，只能拆分现有剧情节拍、人物反应、因果与关系变化，不得靠新增事件或重复同一事件凑页。每个segment必须是原文中可定位的连续范围，后续分镜不得被要求越过该范围。`;
    const STORYBOARD_GAZE_RULE = `【漫画球中性视觉措辞规则——高优先级】
角色的身高、体型、曲线、服装和原文已有镜头都可以保持，不得通过削弱身材、改变服装、添加非原设定面部特征、回避正常身体轮廓或修改参考图来规避风险。限制的是描述语法中的评价性、消费性和情色化措辞，不是镜头类型；全身、近景、低机位、主观视角、动作中的服装与身体动态均可在剧情需要时正常使用。
characters、panels和page_prompt使用客观、可视、制作导向的语言描述同一画面，例如身高与体格、整体轮廓、服装剪裁、姿态、运动惯性、呼吸、疲劳和环境影响。原文中从观看者欲望出发的身体价值判断、尺寸标签或消费性修辞，只改写成等价的整体外形事实与人物反应，不把原措辞带入输出。
原文若使用男性角色的身体观察来表达第一印象、吸引力或尴尬，可以保留该叙事功能和对应镜头，但将措辞转换为一次简洁的整体观察、角色表情或视线反应；不要在绘画提示词里复述带有情色评价的内心修辞。衣料勒入、领口变化、晃动、起伏、汗水等确有画面意义的动态，应改写为服装受力、姿态变化、运动惯性、疲劳或环境温度等中性视觉事实，不额外强调身体部位的情色价值。
亲密或调情剧情仍可保留双方吸引力、距离和回应；普通剧情也无需刻意回避漂亮或性感的角色。panels与page_prompt必须采用同一套中性措辞，最终绘画提示词只写转换后的正向画面，不出现内部规则名称、判断过程、词语清单或被舍弃的原始表述。

${STORYBOARD_AGE_NEUTRAL_APPEARANCE_RULE}`;
    const ADAPTATION_NEUTRAL_WORDING_RULE = `【漫画球演绎中性措辞规则——高优先级】
完整保留原剧情中的人物外形事实、吸引力、尴尬反应、关系变化、冲突、伤亡与胜负结果。演绎输出只使用客观叙事语言：身体外形写成相对身高、肩宽、躯干与四肢比例、整体轮廓、肌肉量、服装状态、体态与动作反应；人物的第一印象写成简短观察、表情或视线反应；严重伤害写清攻击方式、受创位置、行动结果与战场痕迹，但不展开组织、切面或体液质感。当前作品范围内所有拟人角色均按至少20岁的成年人理解；该约束只用于身份判断，不得改变参考图外观、服装、体型或镜头。不得在输出中使用数字年龄、年龄段称呼、幼态/成熟度评价或学生体型，也不得从服装、职业、发型或二次元画风推断年龄身份。不得复述原文中的身体价值判断、观看者欲望修辞或写实解剖细节，也不得讨论改写过程。`;

    function neutralizeNarrativeWordingForTransport(value) {
        let text = String(value || '');
        const counts = {};
        const rules = [
            ['body_metric', /(?:至少\s*)?[A-HＡ-Ｈ]\s*(?:罩杯|cup)/gi, '丰满体型'],
            ['body_metric', /安产型(?:身材|体型)?/g, '胯部轮廓较宽的体型'],
            ['body_appraisal', /两团(?:巨大|丰满|柔软)?的?软肉/g, '丰满的上身轮廓'],
            ['body_appraisal', /软肉/g, '身体轮廓'],
            ['body_appraisal', /(?:极具冲击力|诱人|令人移不开视线|惊心动魄)的?(?:身体|身材|曲线|晃动|美景)?/g, '醒目的整体形象'],
            ['body_detail', /乳沟/g, '胸衣领口区域'],
            ['body_detail', /乳房/g, '胸部轮廓'],
            ['body_detail', /内裤边缘/g, '内层衣物边缘'],
            ['graphic_injury', /脑浆/g, '暗色碎屑'],
            ['graphic_injury', /(?:肠子|内脏)拖在外面/g, '腹部严重受创'],
            ['graphic_injury', /掀飞了?[^，。；\n]{0,10}头盖骨/g, '造成头部严重破损'],
            ['graphic_injury', /露出森森白骨/g, '留下明显重伤'],
            ['graphic_injury', /指甲里全是碎肉/g, '指甲沾满污血'],
            ['graphic_injury', /(?:给|把)?[^，。；\n]{0,8}开瓢/g, '造成头部重创'],
        ];
        rules.forEach(([category, pattern, replacement]) => {
            text = text.replace(pattern, () => {
                counts[category] = (counts[category] || 0) + 1;
                return replacement;
            });
        });
        return { text, count: Object.values(counts).reduce((sum, count) => sum + count, 0), categories: counts };
    }
    function sourceHasConflictingAgeMetadata(value) {
        const text = String(value || '');
        const numericAges = [...text.matchAll(/(?:^|[^\d])(\d{1,2})\s*(?:岁|周岁|years?\s*old)/gi)].map(match => Number(match[1]));
        return numericAges.some(age => age >= 0 && age < 18)
            || /未成年|青少年|儿童|幼童|小学生|初中生|高中生|萝莉|正太|小丫头/gi.test(text);
    }
    function removeAgeExpressions(value) {
        let text = String(value || '');
        const counts = {};
        const rules = [
            ['genre_age_label', /少年漫画/g, '高张力动作漫画'],
            ['genre_age_label', /青年漫画/g, '写实叙事漫画'],
            ['school_costume', /校园皮鞋/g, '皮鞋'],
            ['school_costume', /水手服/g, '水手领上衣'],
            ['school_costume', /校服/g, '制服'],
            ['school_identity', /(?:[\p{L}\p{N}_·-]{0,20}(?:学园|学校|学院))?[一二三四五六七八九十\d]+年级(?:转)?学生/gu, '角色'],
            ['school_identity', /(?:校园|校内)/g, '场景'],
            ['school_identity', /(?:学园|学校)/g, '机构'],
            ['school_identity', /[一二三四五六七八九十\d]+年级/g, ''],
            ['school_identity', /(?:小学生|初中生|高中生|大学生|转学生|学生)/g, '角色'],
            ['numeric_age', /(?:\d{1,3}|[零〇一二三四五六七八九十百两]+)\s*(?:岁|周岁)(?:左右|上下)?/g, ''],
            ['numeric_age', /\b(?:\d{1,3}\s*)?years?\s*old\b/gi, ''],
            ['age_category', /(?:未成年人?|成年人?|青少年|青春期|儿童|幼童|幼女|幼男|少女|少年|萝莉|正太|小丫头|童颜|幼态|稚嫩|成熟女性|成熟男人)/g, '角色'],
            ['age_category', /\b(?:minor|underage|teen(?:ager)?|adolescent|adult)\b/gi, 'character'],
        ];
        rules.forEach(([category, pattern, replacement]) => {
            text = text.replace(pattern, () => {
                counts[category] = (counts[category] || 0) + 1;
                return replacement;
            });
        });
        text = text.replace(/[ \t]{2,}/g, ' ').replace(/(?:，\s*){2,}/g, '，').replace(/(?:、\s*){2,}/g, '、');
        return { text, count: Object.values(counts).reduce((sum, count) => sum + count, 0), categories: counts };
    }
    function sanitizeAgeLanguageDeep(value) {
        let count = 0; const categories = {};
        const visit = item => {
            if (typeof item === 'string') {
                const age = removeAgeExpressions(item); let text = age.text;
                count += age.count;
                Object.entries(age.categories).forEach(([key, n]) => { categories[key] = (categories[key] || 0) + n; });
                return text;
            }
            if (Array.isArray(item)) return item.map(visit).filter(entry => typeof entry !== 'string' || entry.trim());
            if (item && typeof item === 'object') Object.keys(item).forEach(key => { item[key] = visit(item[key]); });
            return item;
        };
        return { value: visit(value), count, categories };
    }
    function upgradeContinuityPrompt(value) {
        return String(value || '')
            .replace(/如果有两页，第二页continuity_in必须以第一页continuity_out的完整原文开头，再追加第二页动作；第二页page_prompt仍需独立重述该状态。/g, 'continuity_in/out只记录人物位置、姿态、伤势、道具、服装和环境损坏等静态画面状态，不复述已发生事件。跨页下一页Panel 1必须从上一页结束之后推进新的动作、反应、决策、转场或后果，禁止重画上一页最后一格。')
            .replace(/如果输出两页，第二页的 `continuity_in` 必须先逐字复制第一页的 `continuity_out`，然后才能追加第二页开场动作。第二页 `page_prompt` 仍需重新完整描述这个状态，禁止依赖绘画模型看到第一页。/g, '跨页时，下一页 `continuity_in` 只需准确继承上一页结束后的静态状态，禁止逐字复制事件描述再追加动作。下一页 Panel 1 必须发生在上一页最后一格之后并推进新节拍，禁止重复上一页的攻击、命中、爆炸、对白或构图。')
            .replace(/若有两页，逐字核对第二页 `continuity_in` 的开头等于第一页 `continuity_out`。/g, '逐页确认下一页 Panel 1 推进新剧情节拍，且没有重复上一页最后一格的事件或构图。')
            .replace(/跨页continuity逐字继承/g, '跨页状态连续但事件不重复');
    }
    function upgradePagePromptLengthRule(value) {
        return String(value || '')
            .replace(/2\. page_prompt不少于500个中文字符，必须完全自包含。逐格写明分格编号、尺寸形状、景别机位、构图、场景、动作与物理反馈、表情、对白、SFX、配色、连续性、角色锁定和禁止事项。禁止使用“同上”“承接前页”“按上述设定”。/g, '2. page_prompt必须是非空字符串并完全自包含。根据本页剧情复杂度自然决定篇幅，逐格写明分格编号、尺寸形状、景别机位、构图、场景、动作与物理反馈、表情、对白、SFX、配色、连续性、角色锁定和禁止事项；简单页面可以简洁，复杂页面应充分展开。禁止使用“同上”“承接前页”“按上述设定”，禁止为了凑字数重复信息。')
            .replace(/每页page_prompt至少500字/g, '每页page_prompt非空且自包含并覆盖全部格')
            .replace(/每页 page_prompt 必须自包含且不少于500个中文字符。/g, '每页 page_prompt 必须非空、完全自包含并覆盖全部分格。')
            .replace(/"page_prompt":\s*"不少于\s*500\s*个中文字符、/gi, '"page_prompt": "长度随本页剧情复杂度自然决定、')
            .replace(/(?:每一页的\s*)?`?page_prompt`?\s*必须不少于\s*500\s*个中文字符/gi, 'page_prompt必须按本页剧情复杂度自然决定长度且禁止凑字数')
            .replace(/`?page_prompt`?\s*不少于\s*500\s*个中文字符/gi, 'page_prompt按本页剧情复杂度自然决定长度')
            .replace(/逐页确认\s*`?page_prompt`?\s*至少\s*500\s*个中文字符/gi, '逐页确认page_prompt按剧情复杂度自然展开且没有凑字数');
    }
    function upgradeDialogueCoverageRule(value) {
        return String(value || '')
            .replace(
                /对白必须精炼但不能让角色集体沉默。每页至少一半的panel（向上取整）包含至少一项dialogue，并在战斗判断、恐惧、决意、犹豫或情绪转折处加入短促thought。/g,
                '对白数量与覆盖率由剧情、节奏和画面表现需要自由决定；允许整页无对白、只用拟声字或只保留一句关键台词，禁止为了覆盖格数硬塞对白、内心独白或旁白。需要对白时应保持精炼。'
            )
            .replace(/角色不能集体沉默。每页至少 ceil\(panel数量\/2\) 个panel包含非空dialogue；?/g, '对白数量与覆盖率完全自由，禁止为了覆盖格数硬塞对白、内心独白或旁白；')
            .replace(/每页至少\s*`?ceil\(panel数量\/2\)`?\s*个panel包含非空\s*`?dialogue`?[；。]?/gi, '对白数量与覆盖率完全自由，禁止为了覆盖格数硬塞dialogue。')
            .replace(/每页至少一半(?:的)?panel（向上取整）(?:必须)?包含(?:至少一项)?(?:非空)?dialogue[；。]?/gi, '对白数量与覆盖率完全自由；');
    }
    function upgradeStoryboardClosedWorld(value) {
        let text = upgradeDialogueCoverageRule(upgradePagePromptLengthRule(upgradeContinuityPrompt(value)));
        text = text
            .replace(/先精炼我提供的小说剧情，消除重复叙述并补全必要的视觉连续性/g, '先精炼我提供的小说剧情，消除重复叙述并整理必要的静态视觉连续性，但不得续写输入范围之外的剧情')
            .replace(/"refined_plot":\s*"精炼后的完整剧情，保留因果、冲突和结局"/g, '"refined_plot": "精炼输入范围内的剧情，保留已有因果与冲突，并严格保持原输入结尾的信息边界"')
            .replace(/高潮不能只剩抽象光效。每次高潮至少保留：一条清晰攻击轨迹、一个角色姿态反馈、一个环境破坏反馈和一个胜负证据。/g, '高潮格必须具体可读；若原文已有攻击，则保留其轨迹、姿态反馈、环境反馈和原文明示的胜负证据。若原文没有攻击或结果尚未揭示，则以发现、表情、决定、关系变化或悬念作为高潮，不得补写战斗。')
            .replace(/3\. page_prompt必须写清“攻击轨迹—命中画面—结果证据”，保持格数、高潮格、对白、SFX和服装损坏。/g, '3. 只有原文已经包含攻击、命中和结果时，page_prompt才表现对应证据；原文停在攻击前或结果未知时必须保留该边界。')
            .replace(STORYBOARD_CLOSED_WORLD_RULE, '')
            .trim();
        return `${text}\n\n${STORYBOARD_CLOSED_WORLD_RULE}`;
    }
    function upgradeAdaptationClosedWorld(value) {
        const text = upgradeAdaptationSoftFilter(value).replace(ADAPTATION_CLOSED_WORLD_RULE, '').trim();
        return `${text}\n\n${ADAPTATION_CLOSED_WORLD_RULE}`;
    }
    function upgradeAdaptationSoftFilter(value) {
        let text = String(value || '').replace(
            '6. 不要关心合规视觉转换，不要因为潜在绘制难度削弱剧情。只在剧情层面保持冲突、代价、暧昧关系和结局完整，具体怎么画由后续分镜AI处理。',
            '6. 在剧情层面保留冲突、代价、暧昧关系和结局。若原文存在不适合直接转成画面的极端桥段，只做最低限度的叙事提炼：完整保留人物动机、权力关系、行为方向、因果和结果，用含蓄动作、场外信息、人物反应或事后状态表达，不展开多余的身体、生理或解剖细节。只输出提炼后的剧情，不讨论平台规则、过滤过程或被舍弃的原始表达；具体镜头仍交给后续分镜AI。'
        );
        const intimacyRule = '10. 对原文中的直白亲密描写采用软转译：保留双方关系、自愿程度、情绪、关键对白意图、关系变化以及该事件对后续剧情造成的结果，把过程提炼为“靠近与试探—双方回应—自然转场—事后状态”的叙事节拍。refined_plot和segments只写含蓄但明确的剧情事实，不展开具体身体部位或过程细节。读者应能理解两人发生了亲密关系或关系明显升级，同时后续分镜无需再次接触原始直白文本。若原文缺少双方自愿关系，则保留其权力冲突、拒绝、脱身或后果，不能改写成浪漫互动。角色年龄设定保持原文，不通过外观老化处理尺度问题；原文明示为未成年角色时，本段只保留非性化的情感与剧情关系。';
        if (!text.includes('10. 对原文中的直白亲密描写采用软转译') && text.includes('输出前静默检查：')) {
            text = text.replace(/\n\n输出前静默检查：/, `\n${intimacyRule}\n\n输出前静默检查：`);
        }
        return text;
    }
    if (document.getElementById(ROOT_ID)) return;

    // 让 `import '.../index.js'` 与酒馆扩展清单加载两种方式都具备完整样式。
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('link');
        style.id = STYLE_ID;
        style.rel = 'stylesheet';
        style.href = new URL('./style.css?v=20260725-chat-reader-cache-pages-1', import.meta.url).href;
        document.head.appendChild(style);
    }

    const defaults = {
        range: '',
        outputLanguage: 'auto',
        workflowMode: 'direct',
        batchDrawingIntervalMs: 5000,
        interpretivePageRange: { min: 2, max: 8 },
        storyboardWorkerPages: '1-3',
        includeNames: true,
        includeMvuData: false,
        preflightNeutralize: false,
        regexRules: '',
        regexList: [],
        storyboard: {
            baseUrl: 'https://api.openai.com', path: '/v1/chat/completions', apiKey: '', model: 'gpt-4.1-mini', temperature: 0.4,
            modelsPath: '/v1/models',
            maxOutputTokens: 65536, maxOutputTokenField: 'auto', reasoningEffort: 'low', thinkingMode: 'default',
            testPrompt: DEFAULT_STORYBOARD_TEST_PROMPT,
            systemPrompt: DEFAULT_STORYBOARD_SYSTEM_PROMPT,
            adaptationPrompt: DEFAULT_ADAPTATION_SYSTEM_PROMPT,
            extraBody: '{}', extraHeaders: '{}', minPages: 1, maxPages: 2, minPanels: 2, maxPanels: 6
        },
        adaptation: {
            baseUrl: 'https://api.openai.com', path: '/v1/chat/completions', apiKey: '', model: 'gpt-4.1-mini', temperature: 0.4,
            modelsPath: '/v1/models',
            maxOutputTokens: 65536, maxOutputTokenField: 'auto', reasoningEffort: 'low', thinkingMode: 'default',
            testPrompt: DEFAULT_ADAPTATION_TEST_PROMPT,
            systemPrompt: DEFAULT_ADAPTATION_SYSTEM_PROMPT,
            extraBody: '{}', extraHeaders: '{}'
        },
        drawing: {
            baseUrl: 'https://api.openai.com', path: '/v1/images/generations', apiKey: '', model: 'gpt-image-1', mode: 'images', size: '1024x1536',
            modelsPath: '/v1/models',
            testPrompt: DEFAULT_DRAWING_TEST_PROMPT,
            promptPrefix: '绘制一页完成度高、构图清晰的漫画。', extraBody: '{}', extraHeaders: '{}', sendReferences: true,
            quality: '', outputFormat: '', outputCompression: '', background: '', inputFidelity: '', useLocalProxy: true, requestTimeoutSeconds: 600
        },
        apiProfiles: { adaptation: [], storyboard: [], drawing: [] },
        activeApiProfile: { adaptation: '', storyboard: '', drawing: '' },
        migrations: {},
        promptPresets: { adaptation: [], storyboard: [], drawing: [] },
        activePromptPreset: { adaptation: '', storyboard: '', drawing: '' },
        activeReferencePreset: '',
        insert: { alt: 'AI 漫画', marker: '<!-- comic-orb -->' }, debug: { enabled: false, captureModelIo: true },
        interaction: { doubleClickRedraw: true, doubleClickImmediate: true, runSubmitCooldown: true },
        storage: { localImageRoot: 'C:\\SillyTavern\\SillyTavern\\data\\default-user', cachePreviewLimit: 5, maxCacheMb: 512, autoCleanup: true },
        fab: { x: null, y: null }, panel: { x: null, y: null }
    };

    const clone = value => JSON.parse(JSON.stringify(value));
    const merge = (a, b) => {
        const out = clone(a);
        for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' ? merge(out[k], v) : v;
        return out;
    };
    let settings = merge(defaults, safeJson(localStorage.getItem(STORE_KEY), {}));
    settings.batchDrawingIntervalMs = normalizeBatchDrawingInterval(settings.batchDrawingIntervalMs);
    settings.storage.cachePreviewLimit = normalizeCachePreviewLimit(settings.storage.cachePreviewLimit);
    settings.storage.maxCacheMb = normalizeMaxCacheMb(settings.storage.maxCacheMb);
    if (settings.storyboard.systemPrompt === LEGACY_STORYBOARD_SYSTEM_PROMPT) settings.storyboard.systemPrompt = DEFAULT_STORYBOARD_SYSTEM_PROMPT;
    if (settings.storyboard.testPrompt === LEGACY_STORYBOARD_TEST_PROMPT) settings.storyboard.testPrompt = DEFAULT_STORYBOARD_TEST_PROMPT;
    settings.storyboard.systemPrompt = upgradeStoryboardClosedWorld(settings.storyboard.systemPrompt);
    settings.storyboard.adaptationPrompt = upgradeAdaptationClosedWorld(settings.storyboard.adaptationPrompt);
    settings.storyboard.testPrompt = upgradePagePromptLengthRule(settings.storyboard.testPrompt);
    if (settings.drawing.testPrompt === LEGACY_DRAWING_TEST_PROMPT) settings.drawing.testPrompt = DEFAULT_DRAWING_TEST_PROMPT;
    if (Array.isArray(settings.apiProfiles?.storyboard)) settings.apiProfiles.storyboard.forEach(profile => {
        if (profile?.config?.systemPrompt === LEGACY_STORYBOARD_SYSTEM_PROMPT) profile.config.systemPrompt = DEFAULT_STORYBOARD_SYSTEM_PROMPT;
        if (profile?.config?.testPrompt === LEGACY_STORYBOARD_TEST_PROMPT) profile.config.testPrompt = DEFAULT_STORYBOARD_TEST_PROMPT;
        if (typeof profile?.config?.systemPrompt === 'string') profile.config.systemPrompt = upgradeStoryboardClosedWorld(profile.config.systemPrompt);
        if (typeof profile?.config?.adaptationPrompt === 'string') profile.config.adaptationPrompt = upgradeAdaptationClosedWorld(profile.config.adaptationPrompt);
        if (typeof profile?.config?.testPrompt === 'string') profile.config.testPrompt = upgradePagePromptLengthRule(profile.config.testPrompt);
    });
    if (Array.isArray(settings.apiProfiles?.drawing)) settings.apiProfiles.drawing.forEach(profile => { if (profile?.config?.testPrompt === LEGACY_DRAWING_TEST_PROMPT) profile.config.testPrompt = DEFAULT_DRAWING_TEST_PROMPT; });
    if (!settings.migrations.independentAdaptationApiV1) {
        const source = settings.apiProfiles?.storyboard?.find(profile => profile.id === settings.activeApiProfile?.storyboard)?.config || settings.storyboard;
        settings.adaptation = merge(defaults.adaptation, {
            baseUrl: source.baseUrl, path: source.path, apiKey: source.apiKey, model: source.model, temperature: source.temperature,
            modelsPath: source.modelsPath, maxOutputTokens: source.maxOutputTokens, maxOutputTokenField: source.maxOutputTokenField,
            reasoningEffort: source.reasoningEffort, thinkingMode: source.thinkingMode, extraBody: source.extraBody, extraHeaders: source.extraHeaders,
            systemPrompt: source.adaptationPrompt || settings.storyboard.adaptationPrompt || DEFAULT_ADAPTATION_SYSTEM_PROMPT,
        });
        settings.apiProfiles.adaptation = [];
        settings.activeApiProfile.adaptation = '';
        settings.promptPresets.adaptation = [];
        settings.activePromptPreset.adaptation = '';
        settings.migrations.independentAdaptationApiV1 = true;
    }
    settings.adaptation.systemPrompt = upgradeAdaptationClosedWorld(settings.adaptation.systemPrompt || DEFAULT_ADAPTATION_SYSTEM_PROMPT);
    if (Array.isArray(settings.apiProfiles?.adaptation)) settings.apiProfiles.adaptation.forEach(profile => {
        if (!profile?.config) return;
        profile.config.systemPrompt = upgradeAdaptationClosedWorld(profile.config.systemPrompt || DEFAULT_ADAPTATION_SYSTEM_PROMPT);
        if (!String(profile.config.testPrompt || '').trim()) profile.config.testPrompt = DEFAULT_ADAPTATION_TEST_PROMPT;
    });
    if (Array.isArray(settings.promptPresets?.adaptation)) settings.promptPresets.adaptation.forEach(preset => {
        if (preset) preset.content = upgradeAdaptationClosedWorld(preset.content || DEFAULT_ADAPTATION_SYSTEM_PROMPT);
    });
    if (!settings.migrations.neutralPublicTestPromptsV1) {
        settings.adaptation.testPrompt = DEFAULT_ADAPTATION_TEST_PROMPT;
        settings.storyboard.testPrompt = DEFAULT_STORYBOARD_TEST_PROMPT;
        settings.drawing.testPrompt = DEFAULT_DRAWING_TEST_PROMPT;
        for (const kind of ['adaptation', 'storyboard', 'drawing']) {
            const testPrompt = kind === 'adaptation' ? DEFAULT_ADAPTATION_TEST_PROMPT : kind === 'storyboard' ? DEFAULT_STORYBOARD_TEST_PROMPT : DEFAULT_DRAWING_TEST_PROMPT;
            settings.apiProfiles[kind].forEach(profile => { if (profile?.config) profile.config.testPrompt = testPrompt; });
        }
        settings.migrations.neutralPublicTestPromptsV1 = true;
    }
    if (Array.isArray(settings.promptPresets?.storyboard)) settings.promptPresets.storyboard.forEach(preset => { if (!preset) return; if (preset.content === LEGACY_STORYBOARD_SYSTEM_PROMPT) preset.content = DEFAULT_STORYBOARD_SYSTEM_PROMPT; preset.content = upgradeStoryboardClosedWorld(preset.content); });
    if (!settings.regexList.length && String(settings.regexRules || '').trim()) settings.regexList = migrateRegexRules(settings.regexRules);
    settings.regexList = settings.regexList.map(rule => (rule.pattern.startsWith('<thinking\\b[^>]*>') || rule.pattern.includes('\\[metacognition\\]')) ? { ...rule, pattern: THINKING_CLEANUP_PATTERN, flags: 'gim' } : rule);
    settings.regexList = settings.regexList.map(rule => (rule.pattern.startsWith('<\\/?[A-Za-z_]') || (rule.pattern.startsWith('<\\/?[\\p{L}_]') && !rule.pattern.includes('行为逻辑|心里话'))) ? { ...rule, pattern: TAG_STRIP_PATTERN, flags: 'gu' } : rule);
    initializeApiProfiles('adaptation');
    initializeApiProfiles('storyboard');
    initializeApiProfiles('drawing');
    ensureLocalGeminiDrawingProfile();
    initializePromptPresets('adaptation');
    initializePromptPresets('storyboard');
    initializePromptPresets('drawing');
    ensureSafetyDowngradePromptPresets();
    save();
    let busy = false;
    let lastStoryboard = '';
    let lastImage = '';
    let lastModelReasoning = '尚未收到分镜或演绎 API 响应。';
    let lastApiTiming = null;
    let activeRedrawCacheId = '';
    let runCooldownTimer = null;
    let runCooldownUntil = 0;
    let processTicker = null;
    let logQueue = Promise.resolve();
    const refs = Array.from({ length: 4 }, (_, i) => ({ slot: i, dataUrl: '', name: '', hint: '' }));
    let referencePresets = [];
    let refsDirty = false;
    const modelCandidates = { ad: [], sb: [], dr: [] };
    const remoteProcesses = [];
    const workflowCheckpoints = new Map();
    const redrawLocks = new Map();
    let cacheReaderRecords = [];
    let cacheReaderIndex = 0;
    let cacheReaderTouchStart = null;
    let cacheListPage = 1;
    let cacheReaderAllRecords = [];
    let cacheReaderChatId = '';
    let cacheReaderRenderToken = 0;
    let imageCacheQueue = Promise.resolve();

    function safeJson(text, fallback = {}) { try { return text ? JSON.parse(text) : fallback; } catch { return fallback; } }
    function newId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
    function normalizeCachePreviewLimit(value) {
        const number = Math.round(Number(value));
        return Number.isFinite(number) ? Math.max(5, Math.min(50, number)) : 5;
    }
    function normalizeMaxCacheMb(value) {
        const number = Math.round(Number(value));
        return Number.isFinite(number) ? Math.max(64, Math.min(4096, number)) : 512;
    }
    function apiKindPrefix(kind) { return kind === 'adaptation' ? 'ad' : kind === 'storyboard' ? 'sb' : 'dr'; }
    function apiKindLabel(kind) { return kind === 'adaptation' ? '演绎' : kind === 'storyboard' ? '分镜' : '绘画'; }
    function initializeApiProfiles(kind) {
        if (!Array.isArray(settings.apiProfiles[kind])) settings.apiProfiles[kind] = [];
        if (!settings.apiProfiles[kind].length) {
            const profile = { id: newId(), name: `默认${apiKindLabel(kind)} API`, config: clone(settings[kind]) };
            settings.apiProfiles[kind].push(profile); settings.activeApiProfile[kind] = profile.id;
        }
        let active = settings.apiProfiles[kind].find(profile => profile.id === settings.activeApiProfile[kind]);
        if (!active) { active = settings.apiProfiles[kind][0]; settings.activeApiProfile[kind] = active.id; settings[kind] = clone(active.config); }
    }
    function ensureLocalGeminiDrawingProfile() {
        if (settings.migrations.localGeminiWebDrawingProfileV1) return;
        const profiles = settings.apiProfiles.drawing;
        const exists = profiles.some(profile => {
            const conf = profile?.config || {};
            return profile?.id === 'builtin-local-gemini-web-flash-v1' || (/^http:\/\/(?:127\.0\.0\.1|localhost):4981\/openai\/?$/i.test(String(conf.baseUrl || ''))
                && String(conf.mode || '') === 'chat' && String(conf.model || '') === 'gemini-3.1-flash-image');
        });
        if (!exists) profiles.push({
            id: 'builtin-local-gemini-web-flash-v1',
            name: '本地 Gemini Web · Flash（推荐）',
            config: merge(defaults.drawing, {
                baseUrl: 'http://127.0.0.1:4981/openai',
                path: '/v1/chat/completions',
                modelsPath: '/v1/models',
                apiKey: '',
                model: 'gemini-3.1-flash-image',
                mode: 'chat',
                size: '896x1200',
                promptPrefix: '绘制一页完成度高、构图清晰的竖版2:3漫画。必须保持竖向画布，不得输出横版；严格遵循分格、对白、角色服装与连续性。',
                extraBody: '{"image_response_format":"b64_json"}',
                extraHeaders: '{}',
                sendReferences: true,
                quality: '', outputFormat: '', outputCompression: '', background: '', inputFidelity: '',
                useLocalProxy: false,
                requestTimeoutSeconds: 600,
            }),
        });
        settings.migrations.localGeminiWebDrawingProfileV1 = true;
    }
    function promptField(kind) { return kind === 'drawing' ? 'promptPrefix' : 'systemPrompt'; }
    function initializePromptPresets(kind) {
        if (!Array.isArray(settings.promptPresets[kind])) settings.promptPresets[kind] = [];
        if (!settings.promptPresets[kind].length) {
            const preset = { id: newId(), name: kind === 'adaptation' ? '默认漫画演绎编辑' : kind === 'storyboard' ? '默认漫画分镜师' : '默认漫画绘画', content: String(settings[kind][promptField(kind)] || '') };
            settings.promptPresets[kind].push(preset); settings.activePromptPreset[kind] = preset.id;
        }
        if (!settings.promptPresets[kind].some(preset => preset.id === settings.activePromptPreset[kind])) settings.activePromptPreset[kind] = '';
    }
    function ensureSafetyDowngradePromptPresets() {
        const storyboardId = 'builtin-storyboard-platform-safe-action-v1';
        const drawingId = 'builtin-drawing-platform-safe-action-v1';
        const stripSafetyAddendum = value => {
            const text = String(value || '');
            const markerIndex = LEGACY_STORYBOARD_SAFETY_MARKERS
                .map(marker => text.indexOf(marker))
                .filter(index => index >= 0)
                .sort((a, b) => a - b)[0] ?? -1;
            return (markerIndex >= 0 ? text.slice(0, markerIndex) : text).trim();
        };
        let storyboardPreset = settings.promptPresets.storyboard.find(preset => preset.id === storyboardId);
        if (!storyboardPreset) {
            storyboardPreset = {
                id: storyboardId,
                name: 'Gemini · 少年漫软适配（分镜）',
                content: `${stripSafetyAddendum(settings.storyboard.systemPrompt)}\n\n${STORYBOARD_SAFETY_ADDENDUM}`,
            };
            settings.promptPresets.storyboard.push(storyboardPreset);
        } else {
            storyboardPreset.name = 'Gemini · 少年漫软适配（分镜）';
            storyboardPreset.content = `${stripSafetyAddendum(storyboardPreset.content)}\n\n${STORYBOARD_SAFETY_ADDENDUM}`;
        }
        let drawingPreset = settings.promptPresets.drawing.find(preset => preset.id === drawingId);
        if (!drawingPreset) {
            drawingPreset = {
                id: drawingId,
                name: 'Gemini · 正向漫画绘制（绘画）',
                content: SAFE_DRAWING_PROMPT_PREFIX,
            };
            settings.promptPresets.drawing.push(drawingPreset);
        } else {
            drawingPreset.name = 'Gemini · 正向漫画绘制（绘画）';
            drawingPreset.content = SAFE_DRAWING_PROMPT_PREFIX;
        }
        if (!settings.migrations.geminiSoftAdaptationPromptsV8) {
            if (isGeminiDrawingConfig(settings.drawing)) {
                settings.activePromptPreset.storyboard = storyboardId;
                settings.storyboard.systemPrompt = storyboardPreset.content;
                settings.activePromptPreset.drawing = drawingId;
                settings.drawing.promptPrefix = drawingPreset.content;
                const activeStoryboardProfile = settings.apiProfiles.storyboard.find(profile => profile.id === settings.activeApiProfile.storyboard);
                const activeDrawingProfile = settings.apiProfiles.drawing.find(profile => profile.id === settings.activeApiProfile.drawing);
                if (activeStoryboardProfile?.config) activeStoryboardProfile.config.systemPrompt = storyboardPreset.content;
                if (activeDrawingProfile?.config) activeDrawingProfile.config.promptPrefix = drawingPreset.content;
            }
            settings.migrations.platformSafeActionPromptsV1 = true;
            settings.migrations.geminiShonenBoundaryPromptsV6 = true;
            settings.migrations.geminiPositiveDrawingPromptsV7 = true;
            settings.migrations.geminiSoftAdaptationPromptsV8 = true;
        }
        if (!settings.migrations.ageNeutralAppearancePromptsV9) {
            const activeStoryboardProfile = settings.apiProfiles.storyboard.find(profile => profile.id === settings.activeApiProfile.storyboard);
            const activeDrawingProfile = settings.apiProfiles.drawing.find(profile => profile.id === settings.activeApiProfile.drawing);
            if (settings.activePromptPreset.storyboard === storyboardId) {
                settings.storyboard.systemPrompt = storyboardPreset.content;
                if (activeStoryboardProfile?.config) activeStoryboardProfile.config.systemPrompt = storyboardPreset.content;
            }
            if (settings.activePromptPreset.drawing === drawingId) {
                settings.drawing.promptPrefix = drawingPreset.content;
                if (activeDrawingProfile?.config) activeDrawingProfile.config.promptPrefix = drawingPreset.content;
            }
            settings.migrations.ageNeutralAppearancePromptsV9 = true;
        }
    }
    function isGeminiDrawingConfig(conf) {
        return /gemini/i.test([conf?.model, conf?.baseUrl, conf?.path].filter(Boolean).join(' '));
    }
    function save() { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); }
    function startRemoteProcess(operation, detail = {}, control = {}) {
        const safeDetail = { ...detail, url: String(detail.url || '').replace(/([?&](?:key|api[_-]?key|token|signature)=)[^&]+/gi, '$1[已隐藏]') };
        const controller = control.controller || new AbortController();
        if (control.parentSignal) {
            if (control.parentSignal.aborted) controller.abort(control.parentSignal.reason);
            else control.parentSignal.addEventListener('abort', () => controller.abort(control.parentSignal.reason), { once: true });
        }
        const process = { id: newId(), operation, detail: safeDetail, status: 'running', startedAt: Date.now(), endedAt: 0, result: '', controller, cancelable: control.cancelable !== false };
        remoteProcesses.unshift(process);
        while (remoteProcesses.length > 100) {
            const removable = remoteProcesses.findLastIndex(item => !['running', 'paused'].includes(item.status));
            if (removable < 0) break;
            remoteProcesses.splice(removable, 1);
        }
        ensureProcessTicker(); renderProcessCenter(); return process.id;
    }
    function finishRemoteProcess(id, status, result = '') {
        const process = remoteProcesses.find(item => item.id === id); if (!process) return;
        if (process.status === 'canceled' && status !== 'canceled') return;
        process.status = status; process.endedAt = Date.now(); process.result = String(result || ''); renderProcessCenter(); updateOrbProcessState();
    }
    function pauseRemoteProcess(id, result, retry, abandon) {
        const process = remoteProcesses.find(item => item.id === id); if (!process || process.status === 'canceled') return;
        process.status = 'paused'; process.endedAt = Date.now(); process.result = String(result || ''); process.retry = retry; process.abandon = abandon; process.cancelable = false;
        renderProcessCenter(); updateOrbProcessState();
    }
    function retryRemoteProcess(id) {
        const process = remoteProcesses.find(item => item.id === id); if (!process || process.status !== 'paused' || typeof process.retry !== 'function') return;
        const retry = process.retry; process.status = 'running'; process.endedAt = 0; process.result = '正在从保留的检查点继续…'; process.cancelable = true; process.retry = null; process.abandon = null;
        ensureProcessTicker(); renderProcessCenter(); Promise.resolve().then(retry).catch(error => console.error('[漫画工房] 重试入口失败', error));
    }
    function abandonRemoteProcess(id) {
        const process = remoteProcesses.find(item => item.id === id); if (!process || process.status !== 'paused') return;
        const abandon = process.abandon; process.retry = null; process.abandon = null;
        if (typeof abandon === 'function') abandon();
        finishRemoteProcess(id, 'canceled', '用户已抛弃总任务；运行时检查点已释放，本地图片缓存不受影响');
        queueLog('operation', '用户抛弃暂停任务', { operation: process.operation, result: '已释放工作流检查点；已生成图片仍保留在本地缓存' });
    }
    function remoteProcessSignal(id) { return remoteProcesses.find(item => item.id === id)?.controller?.signal; }
    function cancelRemoteProcess(id) {
        const process = remoteProcesses.find(item => item.id === id); if (!process || process.status !== 'running' || !process.cancelable) return;
        process.controller?.abort(new DOMException('用户已取消任务', 'AbortError'));
        finishRemoteProcess(id, 'canceled', '用户手动取消；已阻止后续缓存、上传与正文写回');
        queueLog('operation', '用户取消后台任务', { operation: process.operation, elapsedMs: processElapsed(process), result: '已发送中止信号' });
    }
    function isCanceledError(error) { return error?.name === 'AbortError' || /用户已取消|aborted|aborterror/i.test(String(error?.message || error)); }
    function ensureNotCanceled(signal) { if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('用户已取消任务', 'AbortError'); }
    function updateRemoteProcess(id, operation, result = '') {
        const process = remoteProcesses.find(item => item.id === id); if (!process || process.status !== 'running') return;
        if (operation) process.operation = operation; process.result = String(result || ''); renderProcessCenter();
    }
    function processElapsed(process) { return Math.max(0, (process.endedAt || Date.now()) - process.startedAt); }
    function compactElapsed(ms) { const seconds = Math.floor(ms / 1000); const hours = Math.floor(seconds / 3600); const minutes = Math.floor(seconds % 3600 / 60); const rest = seconds % 60; return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`; }
    function ensureProcessTicker() { if (!processTicker) processTicker = setInterval(() => { renderProcessCenter(); updateOrbProcessState(); }, 1000); updateOrbProcessState(); }
    function updateOrbProcessState() {
        const fab = document.querySelector(`#${ROOT_ID} #co-fab`); if (!fab) return;
        const active = remoteProcesses.filter(process => process.status === 'running'); const paused = remoteProcesses.filter(process => process.status === 'paused'); const timer = fab.querySelector('.co-fab-time'); const jobs = fab.querySelector('.co-fab-jobs');
        fab.classList.toggle('processing', active.length > 0); fab.title = active.length ? `正在后台运行 ${active.length} 个任务` : '漫画工房';
        if (paused.length) fab.title += `${active.length ? '；' : ''}${paused.length} 个任务等待重试或抛弃`;
        timer.textContent = active.length ? compactElapsed(Date.now() - Math.min(...active.map(process => process.startedAt))) : '';
        if (jobs) jobs.textContent = active.length || paused.length ? `运行中 ${active.length} · 等待处理 ${paused.length}` : '';
        const badge = document.querySelector(`#${ROOT_ID} #co-process-badge`); if (badge) { badge.textContent = String(active.length + paused.length); badge.hidden = active.length + paused.length === 0; }
        if (!active.length && processTicker) { clearInterval(processTicker); processTicker = null; }
    }
    function renderProcessCenter() {
        const box = document.querySelector(`#${ROOT_ID} #co-process-list`); const summary = document.querySelector(`#${ROOT_ID} #co-process-summary`); if (!box || !summary) { updateOrbProcessState(); return; }
        const active = remoteProcesses.filter(process => process.status === 'running'); const paused = remoteProcesses.filter(process => process.status === 'paused');
        summary.textContent = `${active.length} 个运行中 · ${paused.length} 个等待处理 · ${remoteProcesses.length - active.length - paused.length} 个已结束`;
        box.innerHTML = remoteProcesses.length ? remoteProcesses.map(process => `<article class="co-process co-process-${process.status}" data-process-id="${esc(process.id)}"><div class="co-process-head"><strong>${esc(process.operation)}</strong><span>${process.status === 'running' ? '运行中' : process.status === 'paused' ? '等待处理' : process.status === 'success' ? '已完成' : process.status === 'canceled' ? '已取消' : '失败'} · ${compactElapsed(processElapsed(process))}</span></div><div class="co-process-meta">${esc(process.detail.method || '')}${process.detail.url ? ` · ${esc(process.detail.url)}` : ''}</div>${process.result ? `<p>${esc(process.result.slice(0, 240))}</p>` : ''}${process.status === 'running' && process.cancelable ? '<button class="co-mini co-danger co-process-cancel" type="button">Cancel</button>' : ''}${process.status === 'paused' ? '<div class="co-profile-actions"><button class="co-mini co-test co-process-retry" type="button">重试失败阶段</button><button class="co-mini co-danger co-process-abandon" type="button">抛弃总任务</button></div>' : ''}<div class="co-process-bar"><i></i></div></article>`).join('') : '<div class="co-callout">暂无后台远端任务。</div>';
        box.querySelectorAll('.co-process-cancel').forEach(button => button.addEventListener('click', () => cancelRemoteProcess(button.closest('.co-process')?.dataset.processId)));
        box.querySelectorAll('.co-process-retry').forEach(button => button.addEventListener('click', () => retryRemoteProcess(button.closest('.co-process')?.dataset.processId)));
        box.querySelectorAll('.co-process-abandon').forEach(button => button.addEventListener('click', () => { if (confirm('确定抛弃这个总任务？已保留的运行时分镜/调度检查点会被释放；已经写入本地缓存的图片不会删除。')) abandonRemoteProcess(button.closest('.co-process')?.dataset.processId); }));
        updateOrbProcessState();
    }
    function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
    function notify(message, type = 'info') { globalThis.toastr?.[type]?.(message, '漫画工房'); }
    function context() {
        const ctx = globalThis.SillyTavern?.getContext?.();
        if (!ctx) throw new Error('未找到 SillyTavern.getContext()，请在酒馆页面内加载脚本');
        return ctx;
    }
    async function checkLocalProxyStatus() {
        const box = document.querySelector(`#${ROOT_ID} #co-proxy-health`); const text = document.querySelector(`#${ROOT_ID} #co-proxy-health-text`);
        if (!box || !text) return false;
        if (isLocalGeminiWebConfig(settings.drawing)) {
            box.className = 'co-proxy-health co-proxy-checking'; text.textContent = '正在检测本地 Gemini 会话、Cookie Jar 与保活状态…';
            try {
                const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000);
                let response;
                try { response = await fetch('http://127.0.0.1:4981/health/gemini', { signal: controller.signal }); }
                finally { clearTimeout(timer); }
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json(); const state = String(data?.state || 'unknown');
                if (state === 'auth_expired' || data?.last_error_code === 'AUTH_EXPIRED') {
                    box.className = 'co-proxy-health co-proxy-error';
                    text.textContent = 'Gemini 会话已确认过期。用 Chrome 扩展重新导出后运行 hot-import-gemini-cookies.bat，无需重启服务。';
                    return false;
                }
                if (state === 'import_failed') {
                    box.className = 'co-proxy-health co-proxy-error'; text.textContent = `新 Cookie 文件校验失败，旧会话仍保留：${data?.last_error_summary || '请重新导出'}`; return false;
                }
                if (['backoff', 'degraded'].includes(state)) {
                    box.className = 'co-proxy-health co-proxy-disabled';
                    text.textContent = `Gemini 会话暂时降级（${data?.last_error_code || state}），不是已确认的 Cookie 过期：${data?.last_error_summary || '服务会自动退避重试'}`;
                    return true;
                }
                box.className = 'co-proxy-health co-proxy-ready';
                text.textContent = `本地 Gemini 会话正常 · ${state === 'refreshing' ? '正在保活' : '完整 Cookie Jar 已启用'}${data?.next_refresh_at ? ` · 下次保活 ${new Date(data.next_refresh_at).toLocaleTimeString()}` : ''}`;
                return true;
            } catch (error) {
                box.className = 'co-proxy-health co-proxy-error';
                text.textContent = `本地 Gemini 服务不可达（${error.name === 'AbortError' ? '检测超时' : error.message}）。请运行 start-gemini-web-api.bat；若 Docker 构建失败再检查 localhost:10808。`;
                return false;
            }
        }
        if (!['images', 'edits'].includes(String(settings.drawing.mode || 'images'))) {
            box.className = 'co-proxy-health co-proxy-ready';
            text.textContent = `当前为 ${settings.drawing.mode === 'chat' ? 'Chat 多模态' : 'Gemini 原生'}模式，直接调用所选 API，不需要酒馆 images 长任务代理。`;
            return true;
        }
        if (settings.drawing.useLocalProxy === false) {
            box.className = 'co-proxy-health co-proxy-disabled'; text.textContent = '本地长任务代理已在当前绘画 API 实例中关闭；超过约300秒的图片请求可能在浏览器端断开。'; return false;
        }
        box.className = 'co-proxy-health co-proxy-checking'; text.textContent = '正在检测600秒后端代理路由…';
        try {
            const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000);
            let response;
            try { response = await fetch('/api/openai/comic-orb-image/status', { method: 'GET', signal: controller.signal }); }
            finally { clearTimeout(timer); }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json(); if (!data?.ready) throw new Error('响应未声明 ready');
            box.className = 'co-proxy-health co-proxy-ready'; text.textContent = `600秒后端代理已就绪（允许上限 ${data.max_timeout_seconds || 1800} 秒${data.client_cancel_propagates ? '，支持取消上游请求' : ''}）`;
            return true;
        } catch (error) {
            box.className = 'co-proxy-health co-proxy-error';
            text.textContent = `本地长任务代理未加载（${error.name === 'AbortError' ? '检测超时' : error.message}）。必须完全重启 SillyTavern 后端；只刷新网页无效。重启前不要发起慢速绘画任务。`;
            return false;
        }
    }
    function drawingUsesLocalProxy(conf = settings.drawing) { return conf.useLocalProxy !== false && ['images', 'edits'].includes(String(conf.mode || 'images')); }
    async function requireLocalProxyReady(conf = settings.drawing) {
        if (!drawingUsesLocalProxy(conf)) return;
        if (!await checkLocalProxyStatus()) throw new Error('600秒绘画代理路由未就绪，请完整重启 SillyTavern 后端后重新检测');
    }
    function normalizeEndpoint(base, path) {
        const cleanBase = String(base || '').trim().replace(/\/+$/, '');
        let cleanPath = String(path || '').trim();
        if (!cleanBase) throw new Error('API Base URL 不能为空');
        if (/\/v1\/(chat\/completions|images\/(generations|edits))$/i.test(cleanBase) && !cleanPath) return cleanBase;
        if (/\/v\d+$/i.test(cleanBase) && /^\/?v1\//i.test(cleanPath)) cleanPath = cleanPath.replace(/^\/?v1\//i, '/');
        return cleanBase + '/' + cleanPath.replace(/^\/+/, '');
    }
    function apiHeaders(conf, multipart = false) {
        const custom = safeJson(conf.extraHeaders, null);
        if (custom === null || Array.isArray(custom)) throw new Error('额外请求头不是有效 JSON 对象');
        return { ...(multipart ? {} : { 'Content-Type': 'application/json' }), ...(conf.apiKey ? { Authorization: `Bearer ${conf.apiKey}` } : {}), ...custom };
    }
    function apiExtras(conf) {
        const extra = safeJson(conf.extraBody, null);
        if (extra === null || Array.isArray(extra)) throw new Error('额外请求体不是有效 JSON 对象');
        return extra;
    }
    function normalizeMaxOutputTokens(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return 0;
        return Math.max(1, Math.min(1048576, Math.round(parsed)));
    }
    function textOutputTokenBody(conf, extras = {}) {
        if (Object.prototype.hasOwnProperty.call(extras, 'max_tokens') || Object.prototype.hasOwnProperty.call(extras, 'max_completion_tokens')) return {};
        const limit = normalizeMaxOutputTokens(conf?.maxOutputTokens);
        if (!limit) return {};
        let field = String(conf?.maxOutputTokenField || 'auto');
        if (!['auto', 'max_tokens', 'max_completion_tokens'].includes(field)) field = 'auto';
        if (field === 'auto') {
            const model = String(conf?.model || '').toLowerCase();
            field = /(?:^|[\/_-])(?:o[134](?:[\/_-]|$)|gpt-5(?:[.\/_-]|$))/.test(model) ? 'max_completion_tokens' : 'max_tokens';
        }
        return { [field]: limit };
    }
    function textReasoningBody(conf, extras = {}) {
        const explicitThinking = extras?.thinking && typeof extras.thinking === 'object' ? String(extras.thinking.type || '') : '';
        if (explicitThinking === 'disabled') return {};
        let thinkingMode = String(conf?.thinkingMode || 'default');
        if (!['default', 'disabled', 'enabled', 'auto'].includes(thinkingMode)) thinkingMode = 'default';
        let reasoningEffort = String(conf?.reasoningEffort || 'off');
        if (!['off', 'low', 'medium', 'high'].includes(reasoningEffort)) reasoningEffort = 'off';
        const body = {};
        if (!Object.prototype.hasOwnProperty.call(extras, 'thinking') && thinkingMode !== 'default') body.thinking = { type: thinkingMode };
        if (thinkingMode !== 'disabled' && !Object.prototype.hasOwnProperty.call(extras, 'reasoning_effort') && reasoningEffort !== 'off') body.reasoning_effort = reasoningEffort;
        return body;
    }
    function formatDuration(ms) {
        const value = Math.max(0, Number(ms) || 0);
        if (value < 1000) return `${Math.round(value)} ms`;
        if (value < 60000) return `${(value / 1000).toFixed(2)} 秒`;
        const minutes = Math.floor(value / 60000); const seconds = ((value % 60000) / 1000).toFixed(1);
        return `${minutes} 分 ${seconds} 秒`;
    }
    function normalizeBatchDrawingInterval(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 5000;
    }
    function logApiTiming(operation, url, elapsedMs, success, status = 0) {
        lastApiTiming = { operation, url, elapsedMs, elapsedText: formatDuration(elapsedMs), success, status };
        queueLog('timing', 'API 调用耗时', settings.debug.enabled
            ? { ...lastApiTiming }
            : { operation, elapsedMs, result: `${success ? '成功' : '失败'} · ${formatDuration(elapsedMs)}${status ? ` · HTTP ${status}` : ''}` });
        return lastApiTiming;
    }
    function isModelApiOperation(operation) {
        return /^(?:分镜生成|分镜 API 测试|剧情演绎|演绎 API 测试|绘画生成|绘画 API 测试)/.test(String(operation || ''));
    }
    async function apiFetch(url, options, operation = 'API 请求', validateResponse = null) {
        let timingLogged = false;
        let processFinished = false;
        const captureModelIo = settings.debug.captureModelIo !== false && isModelApiOperation(operation);
        const detailedIo = settings.debug.enabled || captureModelIo;
        const request = await requestSnapshot(url, options, detailedIo);
        const processId = startRemoteProcess(operation, { url, method: options?.method || 'GET' }, { parentSignal: options?.signal });
        let cancelEndpoint = '';
        try {
            const parsed = new URL(url, location.href);
            if (['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) && parsed.port === '4981' && /\/openai\/v1\//.test(parsed.pathname)) cancelEndpoint = `${parsed.origin}/openai/v1/control/cancel/${encodeURIComponent(processId)}`;
        } catch {}
        const fetchHeaders = new Headers(options?.headers || {}); if (cancelEndpoint) fetchHeaders.set('X-Comic-Orb-Request-Id', processId);
        const fetchOptions = { ...options, headers: fetchHeaders, signal: remoteProcessSignal(processId) };
        if (cancelEndpoint) fetchOptions.signal.addEventListener('abort', () => { void fetch(cancelEndpoint, { method: 'POST', keepalive: true }).catch(() => {}); }, { once: true });
        queueLog('request', operation, detailedIo ? { ...request, ...(captureModelIo ? { modelIoCapture: true } : {}) } : { method: request.method, url: request.url });
        const started = performance.now();
        try {
            const response = await fetch(url, fetchOptions);
            const text = await response.text();
            const data = safeJson(text, null);
            const elapsedMs = Math.round(performance.now() - started);
            if (!response.ok) {
                const providerCode = String(data?.code || data?.error?.code || '');
                const providerMessage = `${providerCode ? `${providerCode}: ` : ''}${String(data?.error?.message || data?.message || text)}`.slice(0, 500);
                const error = validateResponse === validateDrawingPayload
                    ? classifyDrawingApiError(providerMessage || `HTTP ${response.status}`, response.status)
                    : Object.assign(new Error(providerMessage || `HTTP ${response.status}`), { code: 'API_HTTP_ERROR', category: 'api_error', providerMessage });
                logApiTiming(operation, url, elapsedMs, false, response.status); timingLogged = true;
                queueLog('error', operation, detailedIo
                    ? { status: response.status, elapsedMs, elapsedText: formatDuration(elapsedMs), headers: Object.fromEntries(response.headers.entries()), category: error.category, code: error.code, request, body: data ?? text, ...(captureModelIo ? { modelIoCapture: true } : {}) }
                    : { status: response.status, elapsedMs, elapsedText: formatDuration(elapsedMs), category: error.category, code: error.code, result: error.message.slice(0, 200) });
                error.apiLogged = true; throw error;
            }
            if (!data) throw new Error('API 返回的不是 JSON');
            if (captureModelIo && /^(?:分镜生成|分镜 API 测试|剧情演绎|演绎 API 测试)/.test(String(operation || ''))) {
                const reasoning = extractApiReasoningText(data);
                const choice = data?.choices?.[0] || data?.data?.choices?.[0] || {};
                lastModelReasoning = reasoning || `本次${operation}响应没有公开 reasoning_content。finish_reason/status：${choice?.finish_reason || choice?.stop_reason || data?.status || '未提供'}。这通常表示深度思考已关闭、模型不公开思维链，或中转没有转发该字段。`;
                updateDebug();
            }
            if (typeof validateResponse === 'function') {
                try { validateResponse(data); }
                catch (validationError) {
                    const error = validationError?.code ? validationError : classifyDrawingApiError(validationError?.message || String(validationError), response.status);
                    logApiTiming(operation, url, elapsedMs, false, response.status); timingLogged = true;
                    // A semantic failure can only be diagnosed after the provider has returned a
                    // nominally successful payload. Preserve this one failed exchange even when
                    // normal logging is in compact mode; the on-screen log still reads summaries
                    // from logSummaries and never renders these potentially large objects.
                    const failureRequest = detailedIo ? request : await requestSnapshot(url, options, true);
                    queueLog('error', `${operation} · 响应语义校验`, detailedIo
                        ? { status: response.status, elapsedMs, elapsedText: formatDuration(elapsedMs), category: error.category, code: error.code, providerMessage: error.providerMessage, diagnostics: error.diagnostics, request: failureRequest, body: data, ...(captureModelIo ? { modelIoCapture: true } : {}) }
                        : { status: response.status, elapsedMs, elapsedText: formatDuration(elapsedMs), category: error.category, code: error.code, diagnostics: error.diagnostics, request: failureRequest, response: data, result: error.message.slice(0, 300), failureDiagnostics: '完整失败请求与响应已保留；图片二进制将在写入时省略' });
                    error.apiLogged = true; throw error;
                }
            }
            const timing = logApiTiming(operation, url, elapsedMs, true, response.status); timingLogged = true;
            queueLog('response', operation, detailedIo
                ? { status: response.status, elapsedMs, elapsedText: formatDuration(elapsedMs), headers: Object.fromEntries(response.headers.entries()), body: data, ...(captureModelIo ? { modelIoCapture: true } : {}) }
                : { status: response.status, elapsedMs, elapsedText: formatDuration(elapsedMs), result: '成功' });
            if ((typeof data === 'object' || typeof data === 'function') && data !== null) Object.defineProperty(data, '__comicOrbTiming', { value: { ...timing }, enumerable: false });
            finishRemoteProcess(processId, 'success', `HTTP ${response.status} · ${formatDuration(elapsedMs)}`); processFinished = true;
            return data;
        } catch (error) {
            if (!timingLogged) logApiTiming(operation, url, Math.round(performance.now() - started), false, 0);
            if (!error?.apiLogged) {
                queueLog(isCanceledError(error) ? 'operation' : 'error', operation, detailedIo ? { request, error: error?.stack || String(error), canceled: isCanceledError(error), ...(captureModelIo ? { modelIoCapture: true } : {}) } : { result: isCanceledError(error) ? '用户取消' : String(error?.message || error).slice(0, 160) });
            }
            if (!processFinished) finishRemoteProcess(processId, isCanceledError(error) ? 'canceled' : 'error', isCanceledError(error) ? '用户取消' : error?.message || String(error));
            throw error;
        }
    }
    function shouldRelayProviderRequest(url) {
        try {
            const parsed = new URL(url, location.href);
            if (!/^https?:$/i.test(parsed.protocol) || parsed.origin === location.origin) return false;
            return !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
        } catch {
            return false;
        }
    }
    async function providerApiFetch(conf, url, options, operation = 'API 请求', validateResponse = null) {
        if (!shouldRelayProviderRequest(url)) return apiFetch(url, options, operation, validateResponse);
        const requestHeaders = Object.fromEntries(new Headers(options?.headers || {}).entries());
        delete requestHeaders.authorization;
        delete requestHeaders['content-type'];
        let body = undefined;
        if (options?.body !== undefined && options?.body !== null && options.body !== '') {
            if (typeof options.body !== 'string') throw new Error('跨域 API 中继只支持 JSON 请求体');
            body = safeJson(options.body, null);
            if (body === null) throw new Error('跨域 API 中继收到的请求体不是有效 JSON');
        }
        const timeoutSeconds = Math.max(10, Math.min(1800, Number(conf?.requestTimeoutSeconds) || 600));
        const payload = {
            provider_endpoint: url,
            method: String(options?.method || 'GET').toUpperCase(),
            timeout_seconds: timeoutSeconds,
            headers: requestHeaders,
            ...(body !== undefined ? { body } : {}),
        };
        const localHeaders = {
            ...context().getRequestHeaders(),
            'Content-Type': 'application/json',
            ...(conf?.apiKey ? { 'X-Comic-Orb-Api-Key': conf.apiKey } : {}),
        };
        return apiFetch('/api/openai/comic-orb-api', {
            method: 'POST',
            headers: localHeaders,
            body: JSON.stringify(payload),
            signal: options?.signal,
        }, `${operation} · 本地中继`, validateResponse);
    }

    function responseTextSummary(data) {
        const values = [data?.error?.message, data?.message, extractApiResponseText(data), data?.output, data?.text]
            .flatMap(value => Array.isArray(value) ? value.map(item => item?.text || item?.content || '') : [value])
            .filter(value => typeof value === 'string' && value.trim());
        return values.join('\n').trim().slice(0, 500);
    }
    function textFromApiValue(value, depth = 0) {
        if (typeof value === 'string') return value.trim();
        if (!value || depth > 5) return '';
        if (Array.isArray(value)) return value.map(item => textFromApiValue(item, depth + 1)).filter(Boolean).join('\n').trim();
        if (typeof value !== 'object') return '';
        if (typeof value.text === 'string') return value.text.trim();
        if (value.text && typeof value.text.value === 'string') return value.text.value.trim();
        if (typeof value.content === 'string') return value.content.trim();
        if (Array.isArray(value.content)) return textFromApiValue(value.content, depth + 1);
        if (Array.isArray(value.parts)) return textFromApiValue(value.parts, depth + 1);
        return '';
    }
    function extractApiResponseText(data) {
        const candidates = [
            data?.choices?.[0]?.message?.content,
            data?.output_text,
            data?.choices?.[0]?.text,
            data?.output,
            data?.result,
            data?.response,
            data?.text,
            data?.candidates?.[0]?.content?.parts,
            data?.data?.choices?.[0]?.message?.content,
            data?.data?.output_text,
            data?.data?.output,
            data?.data?.text,
        ];
        for (const value of candidates) {
            const text = textFromApiValue(value);
            if (text) return text;
        }
        return '';
    }
    function extractApiReasoningText(data) {
        const responseReasoning = Array.isArray(data?.output)
            ? data.output.filter(item => item?.type === 'reasoning').flatMap(item => [item?.summary, item?.content])
            : [];
        const candidates = [
            data?.choices?.[0]?.message?.reasoning_content,
            data?.choices?.[0]?.message?.reasoning,
            data?.reasoning_content,
            responseReasoning,
            data?.data?.choices?.[0]?.message?.reasoning_content,
            data?.data?.reasoning_content,
        ];
        for (const value of candidates) {
            const text = textFromApiValue(value);
            if (text) return text;
        }
        return '';
    }
    function apiTextResponseDiagnostics(data) {
        const choice = data?.choices?.[0] || data?.data?.choices?.[0] || {};
        const message = choice?.message || {};
        const reasoning = textFromApiValue(message?.reasoning_content || message?.reasoning || data?.reasoning_content);
        const refusal = textFromApiValue(message?.refusal || data?.refusal);
        const keys = value => value && typeof value === 'object' ? Object.keys(value).slice(0, 30) : [];
        return {
            responseId: String(data?.id || data?.response_id || data?.request_id || '').slice(0, 160),
            finishReason: String(choice?.finish_reason || choice?.stop_reason || data?.status || '').slice(0, 120),
            topLevelKeys: keys(data),
            choiceKeys: keys(choice),
            messageKeys: keys(message),
            refusal: refusal.slice(0, 300),
            reasoningCharacters: reasoning.length,
            usage: data?.usage && typeof data.usage === 'object' ? data.usage : undefined,
        };
    }
    function validateTextApiPayload(data, label = '文本 API', requestBody = {}) {
        if (extractApiResponseText(data)) return;
        const diagnostics = apiTextResponseDiagnostics(data);
        diagnostics.requestedMaxOutputTokens = Number(requestBody?.max_completion_tokens ?? requestBody?.max_tokens) || 0;
        diagnostics.requestedMaxOutputField = Object.prototype.hasOwnProperty.call(requestBody || {}, 'max_completion_tokens') ? 'max_completion_tokens'
            : Object.prototype.hasOwnProperty.call(requestBody || {}, 'max_tokens') ? 'max_tokens' : '';
        const reason = diagnostics.refusal
            ? `上游返回拒绝信息：${diagnostics.refusal}`
            : String(diagnostics.finishReason).toLowerCase() === 'length'
                ? `输出达到 Token 上限${diagnostics.requestedMaxOutputTokens ? ` ${diagnostics.requestedMaxOutputTokens}` : ''}，模型只生成了 reasoning_content（${diagnostics.reasoningCharacters} 字符），尚未输出最终文本`
            : diagnostics.reasoningCharacters
                ? `上游只返回了 reasoning_content（${diagnostics.reasoningCharacters} 字符），没有最终文本`
                : diagnostics.finishReason
                    ? `上游没有返回最终文本，finish_reason/status=${diagnostics.finishReason}`
                    : '上游响应中没有可识别的文本字段';
        const error = new Error(`${label}响应格式无效：${reason}`);
        error.code = 'TEXT_RESPONSE_EMPTY';
        error.category = diagnostics.refusal ? 'provider_refusal' : 'invalid_response';
        error.providerMessage = reason;
        error.diagnostics = diagnostics;
        throw error;
    }
    function classifyDrawingApiError(message, status = 0) {
        const providerMessage = String(message || '').trim().slice(0, 500);
        const quota = /(?:image|图片|图像).{0,40}(?:limit|quota|额度|限额|配额)|(?:limit|quota|额度|限额|配额).{0,80}(?:reset|usage|settings|重置|刷新|用量|设置|图片|图像)/is.test(providerMessage);
        const ambiguousSession = /BardErrorInfo\s+code\s*\[13\s+1100\]/i.test(providerMessage);
        const cookieExpired = !ambiguousSession && /AUTH_EXPIRED|您登录了吗|cookies?\s+(?:are\s+)?invalid|authentication failed|not logged in|sign[ -]?in required|session (?:has )?expired/i.test(providerMessage);
        const accessUnavailable = /地区尚未开通|region.{0,40}(?:unavailable|not available)|无法为您创建任何图片|image (?:creation|generation).{0,40}(?:unavailable|not available)/i.test(providerMessage);
        const rate = status === 429 || /rate\s*limit|too many requests|请求过于频繁|速率限制/i.test(providerMessage);
        const policy = /may go against my guidelines|policy[- ]?guidelines|cannot (?:help|generate|create).{0,100}(?:request|image|picture)|can't (?:help|generate|create).{0,100}(?:request|image|picture)|无法(?:帮助|生成|创建).{0,80}(?:请求|图片|图像)|不能(?:帮助|生成|创建).{0,80}(?:请求|图片|图像)/is.test(providerMessage);
        const error = new Error(policy
            ? `绘画服务拒绝生成本页。供应商返回：${providerMessage || '未提供说明'}`
            : quota
            ? `绘画额度已用尽，等待供应商额度刷新后重试。供应商返回：${providerMessage || '未提供说明'}`
            : cookieExpired ? `Gemini 会话已确认过期。请重新导出 Cookie 后运行 C:\\SillyTavern\\gemini-web-to-api\\hot-import-gemini-cookies.bat，无需重启服务。供应商返回：${providerMessage || `HTTP ${status}`}`
            : ambiguousSession ? `Gemini 会话异常（[13 1100]）。最常见原因是 Cookie/会话失效；请先更新 Cookie。若仍出现，再检查调用间隔、上下文长度或 CAPTCHA。供应商返回：${providerMessage}`
            : accessUnavailable ? `当前 Gemini 账号或地区暂时无法使用图片生成。也可能是登录会话未完整恢复；建议先更新 Cookie 后重试。供应商返回：${providerMessage}`
            : rate ? `绘画 API 触发速率限制，请降低并发并稍后重试。供应商返回：${providerMessage || `HTTP ${status}`}`
                : providerMessage || (status ? `HTTP ${status}` : '绘画 API 返回未知错误'));
        error.code = policy ? 'IMAGE_POLICY_REJECTED' : quota ? 'IMAGE_QUOTA_EXHAUSTED' : cookieExpired ? 'GEMINI_COOKIE_EXPIRED' : ambiguousSession ? 'GEMINI_SESSION_INVALID' : accessUnavailable ? 'IMAGE_ACCESS_UNAVAILABLE' : rate ? 'IMAGE_RATE_LIMITED' : 'DRAWING_API_ERROR';
        error.category = policy ? 'content_filter' : quota ? 'quota' : cookieExpired ? 'authentication' : ambiguousSession ? 'session_or_access' : accessUnavailable ? 'access' : rate ? 'rate_limit' : 'api_error';
        error.providerMessage = providerMessage;
        return error;
    }
    function validateDrawingPayload(data) {
        try { extractImage(data); }
        catch {
            const providerMessage = responseTextSummary(data);
            if (providerMessage) throw classifyDrawingApiError(providerMessage, 200);
            const error = new Error('绘画 API 返回成功状态，但响应中没有图片 URL 或 base64 数据');
            error.code = 'DRAWING_RESPONSE_NO_IMAGE'; error.category = 'invalid_response'; error.providerMessage = '';
            throw error;
        }
    }

    function redactHeaders(headers) {
        const source = headers instanceof Headers ? Object.fromEntries(headers.entries()) : { ...(headers || {}) };
        for (const key of Object.keys(source)) if (/authorization|api[-_]?key|token|secret/i.test(key)) source[key] = '[已隐藏]';
        return source;
    }
    async function requestSnapshot(url, options, full) {
        const result = { method: options?.method || 'GET', url, headers: redactHeaders(options?.headers) };
        if (!full || options?.body == null) return result;
        if (typeof options.body === 'string') result.body = safeJson(options.body, options.body);
        else if (options.body instanceof FormData) {
            result.body = [];
            for (const [key, value] of options.body.entries()) result.body.push([key, value instanceof Blob ? { name: value.name, type: value.type, size: value.size, binary: '图片内容已省略' } : value]);
        } else result.body = String(options.body);
        return result;
    }

    function parseRange(raw, length) {
        const match = String(raw).trim().match(/^(\d+)\s*(?:-|~|—|–|到)\s*(\d+)$/);
        if (!match) throw new Error('楼层范围格式应为 10-12');
        const start = Number(match[1]);
        const end = Number(match[2]);
        if (start > end) throw new Error('起始楼层不能大于结束楼层');
        if (start < 0 || end >= length) throw new Error(`楼层超出范围，当前聊天为 0-${Math.max(0, length - 1)} 层`);
        return { start, end };
    }
    function parseRegexLiteral(line) {
        const match = line.match(/^\s*\/(.*)\/([dgimsuvy]*)\s*=>\s*([\s\S]*)$/);
        if (!match) throw new Error(`无法解析正则规则：${line}`);
        return { regex: new RegExp(match[1], match[2]), replacement: match[3].replace(/\\n/g, '\n') };
    }
    function migrateRegexRules(source) {
        const raw = String(source || '').trim();
        if (!raw) return [];
        if (raw.startsWith('[')) {
            const items = safeJson(raw, []);
            return Array.isArray(items) ? items.map(item => ({ enabled: item.enabled !== false, pattern: item.pattern || '', flags: item.flags ?? 'g', replacement: item.replacement ?? '' })) : [];
        }
        try { return raw.split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#')).map(parseRegexLiteral).map(rule => ({ enabled: true, pattern: rule.regex.source, flags: rule.regex.flags, replacement: rule.replacement })); }
        catch (error) { console.warn('[漫画工房] 旧正则迁移失败', error); return []; }
    }
    function applyRegexRules(text, source) {
        const list = Array.isArray(source) ? source : migrateRegexRules(source);
        return list.filter(item => item.enabled !== false && item.pattern).reduce((value, item, index) => {
            try { return value.replace(new RegExp(item.pattern, item.flags ?? 'g'), item.replacement ?? ''); }
            catch (error) { throw new Error(`正则规则 ${index + 1} 无效：${error.message}`); }
        }, text);
    }
    function collectPlot(ctx, start, end, options = settings) {
        const chunks = [];
        const floors = [];
        const skippedUserFloors = [];
        for (let i = start; i <= end; i++) {
            const msg = ctx.chat[i];
            if (!msg) continue;
            if (msg.is_user === true) { skippedUserFloors.push(i); continue; }
            const name = msg.name || (msg.is_user ? ctx.name1 : ctx.name2) || (msg.is_user ? 'User' : 'Character');
            chunks.push(options.includeNames ? `[楼层 ${i}] ${name}:\n${msg.mes ?? ''}` : `[楼层 ${i}]\n${msg.mes ?? ''}`);
            floors.push(i);
        }
        return { text: applyRegexRules(chunks.join('\n\n'), options.regexList), floors, skippedUserFloors };
    }

    function optionalGlobal(name) {
        const hosts = [globalThis];
        try { if (window && !hosts.includes(window)) hosts.push(window); } catch {}
        try { if (window?.parent && !hosts.includes(window.parent)) hosts.push(window.parent); } catch {}
        for (const host of hosts) {
            try { if (host?.[name]) return host[name]; } catch {}
        }
        return null;
    }
    function isMvuStatData(value) {
        return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length);
    }
    function messageMvuStatData(ctx, floor) {
        const message = ctx.chat?.[floor];
        if (!message) return null;
        const variables = message.variables;
        const swipeId = Number.isInteger(Number(message.swipe_id)) ? Number(message.swipe_id) : 0;
        const selected = Array.isArray(variables) ? (variables[swipeId] ?? variables.at(-1)) : variables;
        return isMvuStatData(selected?.stat_data) ? clone(selected.stat_data) : null;
    }
    async function readMvuSnapshotAtFloor(ctx, floor) {
        const mvu = optionalGlobal('Mvu');
        if (mvu?.getMvuData) {
            try {
                const data = await Promise.resolve(mvu.getMvuData({ type: 'message', message_id: floor }));
                if (isMvuStatData(data?.stat_data)) return { floor, statData: clone(data.stat_data), source: 'Mvu.getMvuData' };
            } catch (error) {
                console.warn(`[漫画工房] 读取第 ${floor} 层 MVU 快照失败`, error);
            }
        }
        const direct = messageMvuStatData(ctx, floor);
        if (direct) return { floor, statData: direct, source: 'message.variables' };
        const ejs = optionalGlobal('EjsTemplate');
        if (ejs?.prepareContext) {
            try {
                const env = await ejs.prepareContext({}, floor);
                if (isMvuStatData(env?.variables?.stat_data)) return { floor, statData: clone(env.variables.stat_data), source: 'EjsTemplate.prepareContext' };
            } catch (error) {
                console.warn(`[漫画工房] 通过 EJS 读取第 ${floor} 层 MVU 上下文失败`, error);
            }
        }
        return null;
    }
    async function readCurrentMvuSnapshot(ctx, preferredFloor) {
        const exact = await readMvuSnapshotAtFloor(ctx, preferredFloor);
        if (exact) return exact;
        const mvu = optionalGlobal('Mvu');
        if (mvu?.getMvuData) {
            try {
                const data = await Promise.resolve(mvu.getMvuData({ type: 'message', message_id: 'latest' }));
                if (isMvuStatData(data?.stat_data)) return { floor: preferredFloor, statData: clone(data.stat_data), source: 'Mvu.getMvuData(latest)' };
            } catch (error) {
                console.warn('[漫画工房] 读取当前 MVU 快照失败', error);
            }
        }
        const ejs = optionalGlobal('EjsTemplate');
        if (ejs?.prepareContext) {
            try {
                const env = await ejs.prepareContext({}, preferredFloor);
                if (isMvuStatData(env?.variables?.stat_data)) return { floor: preferredFloor, statData: clone(env.variables.stat_data), source: 'EjsTemplate.prepareContext' };
            } catch (error) {
                console.warn('[漫画工房] 读取当前 EJS/MVU 上下文失败', error);
            }
        }
        return null;
    }
    function jsonPointerPart(value) {
        return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
    }
    function mvuAtomicClone(value) {
        return value === undefined ? null : clone(value);
    }
    function mvuJsonPatch(before, after, path = '') {
        if (Object.is(before, after)) return [];
        const beforeObject = before && typeof before === 'object' && !Array.isArray(before);
        const afterObject = after && typeof after === 'object' && !Array.isArray(after);
        if (!beforeObject || !afterObject) {
            try { if (JSON.stringify(before) === JSON.stringify(after)) return []; } catch {}
            return [{ op: before === undefined ? 'add' : 'replace', path, value: mvuAtomicClone(after) }];
        }
        const patch = [];
        const beforeKeys = Object.keys(before);
        const afterKeys = Object.keys(after);
        for (const key of beforeKeys) {
            const childPath = `${path}/${jsonPointerPart(key)}`;
            if (!Object.prototype.hasOwnProperty.call(after, key)) patch.push({ op: 'remove', path: childPath });
        }
        for (const key of afterKeys) {
            const childPath = `${path}/${jsonPointerPart(key)}`;
            if (!Object.prototype.hasOwnProperty.call(before, key)) patch.push({ op: 'add', path: childPath, value: mvuAtomicClone(after[key]) });
            else patch.push(...mvuJsonPatch(before[key], after[key], childPath));
        }
        return patch;
    }
    async function buildMvuPayload(ctx, floors, workflowMode) {
        const selectedFloors = [...new Set((floors || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
        if (!selectedFloors.length) throw new Error('没有可用于读取 MVU 的剧情楼层');
        const snapshots = [];
        for (const floor of selectedFloors) snapshots.push(await readMvuSnapshotAtFloor(ctx, floor));
        const hasCompleteHistory = snapshots.every(Boolean);
        const recipient = workflowMode === 'interpretive' ? 'adaptation_ai_once' : 'storyboard_ai_once';
        if (hasCompleteHistory) {
            const changes = [];
            for (let index = 1; index < snapshots.length; index++) {
                const patch = mvuJsonPatch(snapshots[index - 1].statData, snapshots[index].statData);
                if (patch.length) changes.push({ floor: snapshots[index].floor, patch });
            }
            return {
                payload: {
                    format: 'comic-orb-mvu-timeline',
                    version: 1,
                    mode: 'baseline-plus-json-patch',
                    recipient,
                    baseline: { floor: snapshots[0].floor, stat_data: snapshots[0].statData },
                    changes,
                },
                meta: {
                    mode: 'baseline-plus-json-patch',
                    recipient,
                    baselineFloor: snapshots[0].floor,
                    finalFloor: snapshots.at(-1).floor,
                    selectedFloors: selectedFloors.length,
                    changedFloors: changes.length,
                    sources: [...new Set(snapshots.map(item => item.source))],
                },
            };
        }
        const current = await readCurrentMvuSnapshot(ctx, selectedFloors.at(-1));
        if (!current) throw new Error('已启用“携带 MVU 数据”，但当前聊天未检测到可用的 MVU stat_data；请确认 MVU/EJS 插件已加载，或关闭该选项');
        return {
            payload: {
                format: 'comic-orb-mvu-timeline',
                version: 1,
                mode: 'current-snapshot-fallback',
                recipient,
                current: { floor: current.floor, stat_data: current.statData },
            },
            meta: {
                mode: 'current-snapshot-fallback',
                recipient,
                finalFloor: current.floor,
                selectedFloors: selectedFloors.length,
                missingHistoryFloors: selectedFloors.filter((_, index) => !snapshots[index]),
                sources: [current.source],
            },
        };
    }
    async function appendMvuAfterRegex(selection, ctx, execution) {
        if (!execution.includeMvuData) return { ...selection, mvuMeta: { enabled: false } };
        const { payload, meta } = await buildMvuPayload(ctx, selection.floors, execution.workflowMode);
        const serialized = JSON.stringify(payload, null, 2);
        const recipientText = execution.workflowMode === 'interpretive' ? '仅供本任务的演绎 AI 使用一次；后续并发分镜不再重复接收' : '仅供本任务的直接分镜 AI 使用一次';
        const block = `<comic_orb_mvu_context>\n以下数据在剧情正则处理完成后附加。它是与所选楼层对应的 MVU 状态参考，不是新的剧情正文，也不要输出或猜测变量更新命令。${recipientText}。baseline 是起点完整状态；changes 是后续剧情楼相对上一剧情楼的 RFC 6902 风格 JSON Patch。若 mode 为 current-snapshot-fallback，则历史不可可靠读取，只使用末楼当前状态辅助理解。\n${serialized}\n</comic_orb_mvu_context>`;
        return { ...selection, text: `${selection.text}\n\n${block}`, mvuMeta: { enabled: true, ...meta, bytes: new Blob([block]).size } };
    }

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
            reader.readAsDataURL(file);
        });
    }
    function dataUrlToBlob(dataUrl) {
        const [meta, payload] = dataUrl.split(',');
        const mime = meta.match(/^data:([^;]+)/)?.[1] || 'image/png';
        const bytes = atob(payload); const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }
    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 6);
            req.onupgradeneeded = event => {
                if (!req.result.objectStoreNames.contains('refs')) req.result.createObjectStore('refs', { keyPath: 'slot' });
                if (!req.result.objectStoreNames.contains('logs')) req.result.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
                if (!req.result.objectStoreNames.contains('images')) {
                    const store = req.result.createObjectStore('images', { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt');
                }
                if (!req.result.objectStoreNames.contains('refPresets')) req.result.createObjectStore('refPresets', { keyPath: 'id' });
                if (!req.result.objectStoreNames.contains('logSummaries')) req.result.createObjectStore('logSummaries', { keyPath: 'id' });
                if (event.oldVersion < 6) { req.transaction.objectStore('logs').clear(); req.transaction.objectStore('logSummaries').clear(); }
            };
            req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
    }
    async function dbPut(value) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction('refs', 'readwrite'); tx.objectStore('refs').put(value); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
    async function dbDelete(slot) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction('refs', 'readwrite'); tx.objectStore('refs').delete(slot); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
    async function dbLoad() { const db = await openDb(); const values = await new Promise((resolve, reject) => { const req = db.transaction('refs').objectStore('refs').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); db.close(); return values; }
    async function dbReplaceRefs(values) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction('refs', 'readwrite'); const store = tx.objectStore('refs'); store.clear(); values.filter(value => value.dataUrl).forEach(value => store.put(value)); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
    async function refPresetPut(value) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction('refPresets', 'readwrite'); tx.objectStore('refPresets').put(value); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); return value; }
    async function refPresetList() { const db = await openDb(); const values = await new Promise((resolve, reject) => { const req = db.transaction('refPresets').objectStore('refPresets').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); db.close(); return values.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN')); }
    async function refPresetDelete(id) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction('refPresets', 'readwrite'); tx.objectStore('refPresets').delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
    async function refPresetReplaceAll(values) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction('refPresets', 'readwrite'); const store = tx.objectStore('refPresets'); store.clear(); values.forEach(value => store.put(value)); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
    async function imageCacheMetadata() {
        const db = await openDb();
        const values = await new Promise((resolve, reject) => {
            const output = []; const store = db.transaction('images').objectStore('images'); const source = store.indexNames.contains('createdAt') ? store.index('createdAt') : store;
            const req = source.openCursor();
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) { resolve(output); return; }
                const value = cursor.value;
                const storageBytes = Math.max(Number(value.bytes) || 0, String(value.dataUrl || '').length * 2)
                    + (String(value.prompt || '').length + String(value.pagePrompt || '').length + String(value.sourcePlot || '').length) * 2;
                output.push({
                    id: value.id, createdAt: value.createdAt, bytes: Number(value.bytes) || dataUrlBytes(value.dataUrl),
                    storageBytes,
                    batchId: String(value.batchId || ''), chatId: String(value.chatId || ''), targetFloor: value.targetFloor,
                    pageNumber: value.pageNumber, test: Boolean(value.test), model: String(value.model || ''), mime: String(value.mime || ''),
                    storyboardTitle: String(value.storyboardPlan?.title || ''), storyboardPageCount: Number(value.storyboardPlan?.pages?.length || 0),
                });
                cursor.continue();
            };
            req.onerror = () => reject(req.error);
        });
        db.close(); return values;
    }
    async function enforceImageCacheLimit(protectedRecord = null, force = false) {
        if (!force && settings.storage.autoCleanup === false) return { deleted: 0, bytesFreed: 0 };
        const metadata = await imageCacheMetadata();
        let total = metadata.reduce((sum, item) => sum + item.storageBytes, 0);
        const configuredMax = normalizeMaxCacheMb(settings.storage.maxCacheMb) * 1048576;
        let effectiveMax = configuredMax; let estimate = null;
        try {
            estimate = await navigator.storage?.estimate?.();
            if (Number(estimate?.quota) > 0) {
                const nonImageUsage = Math.max(0, Number(estimate.usage || 0) - total);
                effectiveMax = Math.max(0, Math.min(configuredMax, Number(estimate.quota) * 0.75 - nonImageUsage));
            }
        } catch {}
        if (total <= effectiveMax) return { deleted: 0, bytesFreed: 0, total, effectiveMax, estimate };
        const protectedBatchId = String(protectedRecord?.batchId || '');
        const protectedId = String(protectedRecord?.id || '');
        const groups = new Map();
        metadata.forEach(item => {
            if (item.id === protectedId || (protectedBatchId && item.batchId === protectedBatchId)) return;
            const key = item.batchId ? `batch:${item.batchId}` : `legacy:${item.chatId}:${item.targetFloor}:${String(item.createdAt || '').slice(0, 13)}`;
            if (!groups.has(key)) groups.set(key, { items: [], createdAt: item.createdAt, testOnly: true, bytes: 0 });
            const group = groups.get(key); group.items.push(item); group.bytes += item.storageBytes;
            if (String(item.createdAt) < String(group.createdAt)) group.createdAt = item.createdAt;
            group.testOnly = group.testOnly && item.test;
        });
        const target = Math.max(0, effectiveMax * 0.9);
        const removals = [...groups.values()].sort((a, b) => Number(b.testOnly) - Number(a.testOnly) || String(a.createdAt).localeCompare(String(b.createdAt)));
        const ids = []; let bytesFreed = 0;
        for (const group of removals) {
            if (total - bytesFreed <= target) break;
            group.items.forEach(item => ids.push(item.id)); bytesFreed += group.bytes;
        }
        if (ids.length) {
            const db = await openDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction('images', 'readwrite'); const store = tx.objectStore('images');
                ids.forEach(id => store.delete(id)); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
            });
            db.close();
            queueLog('operation', '本地图片缓存自动清理', { deleted: ids.length, bytesFreed, beforeBytes: total, afterBytes: Math.max(0, total - bytesFreed), configuredMax, effectiveMax, result: `删除 ${ids.length} 张旧缓存，释放 ${formatBytes(bytesFreed)}` });
        }
        return { deleted: ids.length, bytesFreed, total: Math.max(0, total - bytesFreed), effectiveMax, estimate };
    }
    async function imageCachePut(value) {
        const operation = imageCacheQueue.then(async () => {
            const db = await openDb();
            await new Promise((resolve, reject) => { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').put(value); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
            db.close();
            await enforceImageCacheLimit(value);
            return value;
        });
        imageCacheQueue = operation.catch(() => {});
        return operation;
    }
    async function imageCacheGet(id) { const db = await openDb(); const value = await new Promise((resolve, reject) => { const req = db.transaction('images').objectStore('images').get(id); req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); }); db.close(); return value; }
    async function imageCacheList() { const db = await openDb(); const values = await new Promise((resolve, reject) => { const req = db.transaction('images').objectStore('images').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); db.close(); return values.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
    async function imageCacheDelete(id) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
    async function imageCacheClear() { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
    function normalizeReferenceSlots(source) {
        if (!Array.isArray(source)) throw new Error('参考图 refs 必须是数组');
        if (source.length > 4) throw new Error('每套参考图预设最多四张');
        return Array.from({ length: 4 }, (_, slot) => {
            const item = source.find(value => Number(value?.slot) === slot) ?? source[slot];
            if (!item) return { slot, dataUrl: '', name: '', hint: '' };
            const dataUrl = String(item.dataUrl || '');
            if (dataUrl && !/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) throw new Error(`参考图 ${slot + 1} 不是有效的 base64 图片 data URL`);
            return { slot, dataUrl, name: String(item.name || `reference-${slot + 1}.png`), hint: String(item.hint || '') };
        });
    }
    function snapshotRefs() { return refs.map(({ slot, name, hint, dataUrl }) => ({ slot, name, hint, dataUrl })); }
    async function exportReferencePresets() {
        if (refsDirty && !confirm('当前参考图有未保存修改。继续导出时不会包含这些修改，确定继续？')) return;
        referencePresets = await refPresetList();
        const payload = { format: 'comic-orb-reference-presets', version: 2, exportedAt: new Date().toISOString(), activeId: settings.activeReferencePreset, presets: referencePresets };
        downloadJson(payload, `comic-orb-reference-presets-${new Date().toISOString().slice(0, 10)}.json`);
    }
    async function importReferencePresets(file) {
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            let source = parsed?.presets;
            if (!Array.isArray(source)) {
                const legacy = Array.isArray(parsed) ? parsed : parsed?.refs;
                if (!Array.isArray(legacy)) throw new Error('JSON 中没有 presets 预设数组');
                source = [{ name: '导入的参考图', refs: legacy }];
            }
            if (!source.length) throw new Error('参考图预设库不能为空');
            const imported = source.map((item, index) => ({ id: newId(), name: String(item?.name || `参考图预设 ${index + 1}`), refs: normalizeReferenceSlots(item?.refs || []), createdAt: String(item?.createdAt || new Date().toISOString()), updatedAt: new Date().toISOString() }));
            if (referencePresets.length && !confirm(`导入会覆盖当前 ${referencePresets.length} 套参考图预设，确定继续？`)) return;
            await refPresetReplaceAll(imported); referencePresets = imported; settings.activeReferencePreset = imported[0].id; save(); await loadReferencePreset(imported[0].id, true); renderReferencePresetManager(); notify(`已导入 ${imported.length} 套参考图预设`, 'success');
        } catch (error) { notify(`参考图预设导入失败：${error.message}`, 'error'); }
        finally { root.querySelector('#co-import-refs-file').value = ''; }
    }
    function summarizeLogDetail(detail = {}) {
        const parts = [];
        const add = value => { const text = String(value ?? '').replace(/\s+/g, ' ').trim(); if (text) parts.push(text.slice(0, 180)); };
        if (typeof detail.result === 'string') add(detail.result);
        else if (typeof detail.error === 'string') add(detail.error.split('\n')[0]);
        else if (typeof detail.summary === 'string') add(detail.summary);
        if (detail.category) add(`分类 ${detail.category}`);
        if (detail.code) add(String(detail.code));
        if (detail.status) add(`HTTP ${detail.status}`);
        if (detail.elapsedText || detail.wallTime) add(detail.elapsedText || detail.wallTime);
        if (Number.isFinite(detail.count)) add(`${detail.count} 项`);
        if (Number.isFinite(detail.page)) add(`第 ${detail.page} 页`);
        if (Array.isArray(detail.pages)) add(`${detail.pages.length} 页`);
        if (detail.model) add(detail.model);
        if (detail.cacheId) add(`缓存 ${String(detail.cacheId).slice(0, 12)}`);
        return parts.join(' · ') || '已记录；完整内容仅在导出 JSON 中提供';
    }
    function sanitizeLogValue(value, key = '', seen = new WeakSet()) {
        if (/^(?:authorization|proxy[-_]?authorization|x[-_]?api[-_]?key|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|client[-_]?secret|password|cookie|set[-_]?cookie)$/i.test(key)) return '[已隐藏]';
        if (typeof value === 'string') {
            if (/^data:image\/[^;,]+;base64,/i.test(value)) return `[图片 data URL 已省略，约 ${formatBytes(dataUrlBytes(value))}]`;
            if ((/b64|base64|image(?:_base64)?$/i.test(key) || value.length > 500000) && /^[A-Za-z0-9+/=\r\n]+$/.test(value.slice(0, Math.min(value.length, 4096)))) return `[图片/二进制 base64 已省略，字符数 ${value.length}]`;
            return value.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, match => `[图片 data URL 已省略，约 ${formatBytes(dataUrlBytes(match))}]`);
        }
        if (value instanceof Blob) return { name: value.name || '', type: value.type, size: value.size, binary: '已省略' };
        if (!value || typeof value !== 'object') return value;
        if (seen.has(value)) return '[循环引用已省略]'; seen.add(value);
        if (Array.isArray(value)) return value.map(item => sanitizeLogValue(item, key, seen));
        return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitizeLogValue(child, childKey, seen)]));
    }
    async function writeLog(type, operation, detail = {}) {
        const safeDetail = sanitizeLogValue(detail);
        const entry = { time: new Date().toISOString(), mode: settings.debug.enabled ? 'DEBUG' : safeDetail?.modelIoCapture ? '模型IO' : '简写', type, operation, summary: summarizeLogDetail(safeDetail), detail: safeDetail };
        console.info(`[漫画工房${settings.debug.enabled ? ' DEBUG' : ''}] ${operation}: ${type}`, entry.summary);
        try {
            const db = await openDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(['logs', 'logSummaries'], 'readwrite'); const request = tx.objectStore('logs').add(entry);
                request.onsuccess = () => tx.objectStore('logSummaries').put({ id: request.result, time: entry.time, mode: entry.mode, type: entry.type, operation: entry.operation, summary: entry.summary });
                tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
            }); db.close();
        } catch (error) { console.warn('[漫画工房] 日志写入失败', error); }
    }
    function queueLog(type, operation, detail) { logQueue = logQueue.then(() => writeLog(type, operation, detail)).catch(error => console.warn('[漫画工房] 日志队列失败', error)); return logQueue; }
    async function readLogs(limit = null) {
        const db = await openDb();
        const values = await new Promise((resolve, reject) => {
            const store = db.transaction('logs').objectStore('logs');
            if (!Number.isInteger(limit) || limit <= 0) {
                const req = store.getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); return;
            }
            const output = []; const req = store.openCursor(null, 'prev');
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor || output.length >= limit) { resolve(output.reverse()); return; }
                output.push(cursor.value); cursor.continue();
            };
            req.onerror = () => reject(req.error);
        });
        db.close(); return values;
    }
    async function readLogSummaries(limit = 200) {
        const db = await openDb(); const values = await new Promise((resolve, reject) => {
            const output = []; const req = db.transaction('logSummaries').objectStore('logSummaries').openCursor(null, 'prev');
            req.onsuccess = () => { const cursor = req.result; if (!cursor || output.length >= limit) { resolve(output); return; } output.push(cursor.value); cursor.continue(); };
            req.onerror = () => reject(req.error);
        }); db.close(); return values;
    }
    async function clearLogs() { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction(['logs', 'logSummaries'], 'readwrite'); tx.objectStore('logs').clear(); tx.objectStore('logSummaries').clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); await refreshLogs(); }

    function modelsEndpoint(conf) {
        const custom = String(conf.modelsPath || '').trim();
        if (custom) return normalizeEndpoint(conf.baseUrl, custom);
        const base = String(conf.baseUrl || '').replace(/\/+$/, '').replace(/\/v1\/(?:chat\/completions|images\/(?:generations|edits))$/i, '');
        return `${base}/v1/models`;
    }
    function isLocalGeminiWebConfig(conf) {
        return /^http:\/\/(?:127\.0\.0\.1|localhost):4981\/openai\/?$/i.test(String(conf?.baseUrl || ''));
    }
    async function fetchModels(kind) {
        const prefix = apiKindPrefix(kind);
        const status = root.querySelector(`#${prefix}-api-status`);
        try {
            syncSettingsFromUi(); status.textContent = '正在获取模型列表…';
            const conf = settings[kind];
            const endpoint = modelsEndpoint(conf);
            const data = await providerApiFetch(conf, endpoint, { method: 'GET', headers: apiHeaders(conf) }, `${apiKindLabel(kind)} API 获取模型`);
            const raw = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : [];
            const models = raw.map(item => typeof item === 'string' ? item : item?.id || item?.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
            if (!models.length && isLocalGeminiWebConfig(conf)) {
                const message = '本地 Gemini Web 模型列表为空。请先查看主页会话状态；只有 AUTH_EXPIRED 才需要重新导出并运行 hot-import-gemini-cookies.bat。';
                await writeLog('error', '本地 Gemini 模型列表为空', { category: 'session_or_access', code: 'GEMINI_MODELS_EMPTY', result: message });
                throw new Error(message);
            }
            if (!models.length) throw new Error('响应中没有找到 data[].id 或 models[]');
            modelCandidates[prefix] = models; renderModelOptions(prefix, '');
            status.textContent = `已获取 ${models.length} 个模型；可从建议列表选择，也可继续手动输入。`;
            await writeLog('operation', `${apiKindLabel(kind)}模型列表已更新`, { count: models.length });
        } catch (error) { status.textContent = `获取失败：${error.message}`; notify(error.message, 'error'); }
    }
    async function testApi(kind) {
        const prefix = apiKindPrefix(kind);
        const status = root.querySelector(`#${prefix}-api-status`);
        const buttons = root.querySelectorAll(`#${prefix}-fetch-models,#${prefix}-test`);
        buttons.forEach(button => button.disabled = true);
        try {
            syncSettingsFromUi(); status.textContent = '正在发送测试提示词…';
            if (kind === 'drawing') await requireLocalProxyReady();
            const testPrompt = String(settings[kind].testPrompt || '').trim();
            if (!testPrompt) throw new Error('请先填写 API 测试提示词');
            if (kind === 'adaptation') {
                const result = await callAdaptation(testPrompt, {
                    test: true, conf: settings.adaptation, outputLanguage: settings.outputLanguage,
                    totalPageRange: settings.interpretivePageRange, workerPageRange: settings.storyboardWorkerPages,
                    withTiming: true,
                });
                const plan = parseAdaptationPlan(result.text, settings.outputLanguage, settings.interpretivePageRange, settings.storyboardWorkerPages);
                lastStoryboard = JSON.stringify(plan, null, 2); updateDebug();
                status.textContent = `测试成功且演绎 JSON 校验通过（${lastApiTiming?.elapsedText || '耗时未知'}）：${plan.segments.length} 段，共 ${plan.segments.reduce((sum, segment) => sum + Number(segment.page_count), 0)} 页。`;
            } else if (kind === 'storyboard') {
                const result = await callStoryboard(testPrompt, { test: true });
                const plan = parseStoryboardPlan(result, settings.storyboard); lastStoryboard = JSON.stringify(plan, null, 2); updateDebug();
                status.textContent = `测试成功且 JSON 校验通过（${lastApiTiming?.elapsedText || '耗时未知'}）：${storyboardSummary(plan)}。未调用绘画 API。`;
            } else {
                lastImage = await callDrawing(testPrompt, { test: true });
                updateDebug(); status.textContent = `测试成功（${lastApiTiming?.elapsedText || '耗时未知'}）：已收到图片结果，可在“日志 / 结果”页查看。`;
            }
            notify(`${apiKindLabel(kind)} API 测试成功`, 'success');
        } catch (error) { status.textContent = `测试失败：${error.message}`; notify(error.message, 'error'); }
        finally { buttons.forEach(button => button.disabled = false); }
    }

    async function callStoryboard(plot, options = {}) {
        const conf = options.conf || settings.storyboard;
        const limits = options.limits || storyboardLimits(conf);
        const outputLanguage = normalizeOutputLanguage(options.outputLanguage || settings.outputLanguage);
        const preflightNeutralize = Object.prototype.hasOwnProperty.call(options, 'preflightNeutralize')
            ? Boolean(options.preflightNeutralize)
            : Boolean(settings.preflightNeutralize);
        const sourceText = String(plot || '');
        const ageMetadataConflict = sourceHasConflictingAgeMetadata(sourceText);
        const ageRedactedPlot = removeAgeExpressions(sourceText);
        if (ageRedactedPlot.count) await writeLog('operation', '分镜输入年龄表达已剔除', {
            replacements: ageRedactedPlot.count,
            categories: ageRedactedPlot.categories,
            ageMetadataConflict,
            result: '年龄与学龄标签不会发送给分镜 AI；原始酒馆正文、MVU和缓存未修改',
        });
        const transportPlot = preflightNeutralize
            ? neutralizeNarrativeWordingForTransport(ageRedactedPlot.text)
            : { text: ageRedactedPlot.text, count: 0, categories: {} };
        if (transportPlot.count) await writeLog('operation', '分镜请求措辞中性化', {
            replacements: transportPlot.count,
            categories: transportPlot.categories,
            result: '仅修改本次 API 请求副本；酒馆正文、缓存和检查点原文未改变',
        });
        const normalizedPrompt = upgradeStoryboardClosedWorld(conf.systemPrompt).replace(STORYBOARD_CLOSED_WORLD_RULE, '').trim();
        const adultIdentityRule = '\n【本次成人身份约束】本作品中的所有拟人角色均为至少20岁的成年人。该约束只用于防止年龄误判：不得因此改变参考图脸型、身形比例、体态、服装、身体动态或原剧情镜头，也不得把角色画得更老。最终JSON不写具体年龄、“成年”等年龄声明或任何低龄/学龄称谓。上游被剔除的冲突年龄元数据不得重新猜回。';
        const effectiveSystemPrompt = `${normalizedPrompt}\n\n【漫画球本次实际校验范围】pages 必须为 ${limits.pages.min}-${limits.pages.max} 页；每页 panels 必须为 ${limits.panels.min}-${limits.panels.max} 格。此处为程序最终采用的范围，若前文存在旧范围，以此处为准。范围只规定合法上下限，并不要求选择最大值；在不低于最小值的前提下按原剧情实际密度选择最少且足够的页数与格数。\n【漫画球对白改编与证据规则】对白数量和覆盖率完全自由；允许整页无对白、只用拟声字或只保留一句关键台词，禁止为了覆盖格数硬塞对白、内心独白或旁白。若前文存在最低对白数量或覆盖比例要求，以本段自由规则为准。保留原剧情意图、关系和角色口吻，但禁止机械照抄小说原句；允许删、并、重排和重写。存在dialogue时只使用 {"type":"speech|thought|narration","speaker":"角色名","text":"漫画实际显示文字","visual_anchor":"能直接证明本句事实的当前格可见证据"}。visual_anchor不是说话者位置，也不是随便找一个可见物；它必须直接支撑text中的对象、地点或判断。例如“工地有推土机”需要工地路牌/地图/可见工地，方向盘不算；“过桥就到我家”需要地图、路标或可见庄园地标，残骸不算；“渣滓们滚开”需要被碾压的尸潮，驾驶者不算。无法提供证据时，必须改写text使它只陈述当前画面能证明的内容，或修改panel补入证据。page_prompt逐字包含实际采用的text和框体类型，并完整描述证据画面；visual_anchor允许同义改写。\n【漫画球本地化硬规则】本次漫画输出语言为“${outputLanguage}”。顶层 language 必须逐字写成“${outputLanguage}”。所有 dialogue.text、旁白、内心独白、拟声字、标牌及画内可读文字使用该语言；专有名词只保留必要原文或缩写，不得擅自切换主要语言。page_prompt必须要求绘画模型逐字照抄该语言文本，禁止把speech/thought/narration渲染成Normal、Interior thoughts等可见标签。\n【漫画球色彩硬规则】默认全彩，并让每页page_prompt重申global_style.color_script中的环境色、人物固有色和特效色。黑白服装不等于黑白画面。只有剧情明确需要回忆、冲击瞬间或主观情绪强调时，才允许指定单格临时变调；内容降级与合规转换不得改变整页或跨页色调。\n【漫画球可选实体设定】entity_bible是软约束且完全可选，不属于程序校验条件。存在跨页人物、怪物、载具或关键道具时，可简洁记录稳定身份、数量特征、相对体型、常驻装备及明确状态变化；纯景色、一次性场景或无需连续实体时可省略或留空。收到上游entity_bible时尽量沿用，不因措辞或拼写小差异重复创建实体；只把本页实际出现实体的相关锁定自然写入page_prompt，不要向景色页强行添加角色。即使entity_bible缺字段、名称拼写不统一或局部矛盾，也应凭剧情常识继续完成分镜，禁止因此拒绝输出或等待修订。\n【漫画球外貌事实保真】角色的发色、发型、瞳色、肤色、体型、服装及其他永久外貌只能来自本次输入或上游entity_bible明确给出的事实。没有提供的项目保持未指定，不得依据姓名、种族、职业、世界观或常见二次元形象自行补全。未知外貌时仍要把分镜写具体：使用角色名、身份、动作、表情、朝向、站位、互动对象、已知装备和环境关系描述，但不要添加任何未知外貌；characters对应字段允许留空或写“未指定”。\n\n${STORYBOARD_GAZE_RULE}${adultIdentityRule}\n\n${STORYBOARD_CLOSED_WORLD_RULE}`;
        const extras = apiExtras(conf);
        const body = {
            model: conf.model,
            messages: [{ role: 'system', content: effectiveSystemPrompt }, { role: 'user', content: `以下是楼层剧情：\n\n${transportPlot.text}` }],
            temperature: Number(conf.temperature),
            ...textReasoningBody(conf, extras),
            ...textOutputTokenBody(conf, extras),
            ...extras,
        };
        const endpoint = normalizeEndpoint(conf.baseUrl, conf.path);
        const data = await providerApiFetch(conf, endpoint, { method: 'POST', headers: apiHeaders(conf), body: JSON.stringify(body), signal: options.signal }, options.test ? '分镜 API 测试' : '分镜生成', value => validateTextApiPayload(value, '分镜 API ', body));
        const text = extractApiResponseText(data);
        return options.withTiming ? { text, timing: data?.__comicOrbTiming ? { ...data.__comicOrbTiming } : null, ageMetadataConflict } : text;
    }
    async function callAdaptation(plot, options = {}) {
        const conf = options.conf || settings.adaptation;
        const outputLanguage = normalizeOutputLanguage(options.outputLanguage || settings.outputLanguage);
        const totalPageRange = normalizeStoryboardRange(options.totalPageRange?.min, options.totalPageRange?.max, 2, 8, 20);
        const workerPageRange = normalizeWorkerPageSpec(options.workerPageRange || settings.storyboardWorkerPages);
        assertInterpretivePageAllocation(totalPageRange, workerPageRange);
        const preflightNeutralize = Object.prototype.hasOwnProperty.call(options, 'preflightNeutralize')
            ? Boolean(options.preflightNeutralize)
            : Boolean(settings.preflightNeutralize);
        const sourceText = String(plot || '');
        const ageMetadataConflict = sourceHasConflictingAgeMetadata(sourceText);
        const ageRedactedPlot = removeAgeExpressions(sourceText);
        if (ageRedactedPlot.count) await writeLog('operation', '演绎输入年龄表达已剔除', {
            replacements: ageRedactedPlot.count,
            categories: ageRedactedPlot.categories,
            ageMetadataConflict,
            result: '年龄与学龄标签不会发送给演绎 AI；原始酒馆正文、MVU和缓存未修改',
        });
        const transportPlot = preflightNeutralize
            ? neutralizeNarrativeWordingForTransport(ageRedactedPlot.text)
            : { text: ageRedactedPlot.text, count: 0, categories: {} };
        if (transportPlot.count) await writeLog('operation', '演绎请求措辞中性化', {
            replacements: transportPlot.count,
            categories: transportPlot.categories,
            result: '仅修改本次 API 请求副本；酒馆正文、缓存和检查点原文未改变',
        });
        const systemPrompt = upgradeAdaptationClosedWorld(conf.systemPrompt || DEFAULT_ADAPTATION_SYSTEM_PROMPT).replace(ADAPTATION_CLOSED_WORLD_RULE, '').trim();
        const workerRule = workerPageRange.min === workerPageRange.max ? `固定 ${workerPageRange.min} 页` : `${workerPageRange.min}-${workerPageRange.max} 页`;
        const effectiveSystemPrompt = `${systemPrompt}\n\n【漫画球本次任务变量】漫画输出语言为“${outputLanguage}”；顶层language必须逐字写成“${outputLanguage}”。用户要求最终总页数为 ${totalPageRange.min}-${totalPageRange.max} 页，所有segments的page_count之和必须落在该范围内。完整剧情只允许拆成1到20段；每段会独占一个并发分镜AI，本次“单个分镜AI页数规格”为${workerRule}，所以每个segment.page_count都必须符合该规格。你负责根据剧情密度自行决定段数；规格是范围时再自行决定每段具体页数，不要平均主义，也不要靠重复事件凑页数。你只负责剧情演绎与分段，不得输出镜头、构图、分格、光影、配色、画风、服装细节或绘画提示词。每段closeup_guidance最多一个且只写对象与剧情作用。\n【漫画球可选实体设定】可以在顶层输出entity_bible，也可以在纯景色、一次性场景或没有明显连续性风险时省略它或输出空数组。它只是一份给并发分镜AI共享的简短剧情事实备忘录：适合记录跨段实体的稳定身份、明确数量特征、相对体型、常驻装备位置和按顺序发生的损坏、丢弃、换装或伤势变化；不要扩写镜头、构图、光影、配色、画风或原文没有建立的外观细节。entity_bible不是硬格式，字段缺失、拼写差异或局部措辞不统一都不影响工作流，不得因此拒绝输出。\n【漫画球外貌事实提取】尽量把原文明确写出的跨段角色外貌准确摘录到对应entity_bible.identity_traits，包括发色、发型、瞳色、肤色、体型、种族特征、服装和其他稳定辨识点。只摘录原文明示事实，不从姓名、种族、职业、世界观或常见形象推测；原文没有描述的项目留空或省略。不要为补齐字段牺牲剧情提炼，也不要把外貌扩写成镜头或绘画说明。\n【本次成人身份约束】本作品中的所有拟人角色均为至少20岁的成年人。该约束只用于防止年龄误判，不得改变参考图外观、身材、服装、动作或原剧情镜头，也不得在输出中写具体年龄或任何年龄/学龄称谓。\n\n${ADAPTATION_NEUTRAL_WORDING_RULE}\n\n${ADAPTATION_CLOSED_WORLD_RULE}`;
        const extras = apiExtras(conf);
        const body = {
            model: conf.model,
            messages: [{ role: 'system', content: effectiveSystemPrompt }, { role: 'user', content: `以下是需要完整演绎的全部楼层剧情。必须覆盖全部内容，不要只处理开头：\n\n${transportPlot.text}` }],
            temperature: Number(conf.temperature),
            ...textReasoningBody(conf, extras),
            ...textOutputTokenBody(conf, extras),
            ...extras,
        };
        const endpoint = normalizeEndpoint(conf.baseUrl, conf.path);
        const data = await providerApiFetch(conf, endpoint, { method: 'POST', headers: apiHeaders(conf), body: JSON.stringify(body), signal: options.signal }, options.test ? '演绎 API 测试' : '剧情演绎', value => validateTextApiPayload(value, '演绎 API ', body));
        const text = extractApiResponseText(data);
        return options.withTiming ? { text, timing: data?.__comicOrbTiming ? { ...data.__comicOrbTiming } : null } : text;
    }
    function parseAdaptationPlan(raw, outputLanguage = settings.outputLanguage, totalPageRange = settings.interpretivePageRange, workerPageRange = settings.storyboardWorkerPages) {
        const plan = parseModelJson(raw, '演绎');
        const expectedLanguage = normalizeOutputLanguage(outputLanguage);
        const expectedPages = normalizeStoryboardRange(totalPageRange?.min, totalPageRange?.max, 2, 8, 20);
        const expectedWorkerPages = normalizeWorkerPageSpec(workerPageRange);
        assertInterpretivePageAllocation(expectedPages, expectedWorkerPages);
        const errors = [];
        if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('演绎 JSON 必须是一个对象');
        const ageSanitation = sanitizeAgeLanguageDeep(plan);
        if (ageSanitation.count) queueLog('operation', '演绎 JSON 年龄表达已强制清除', { replacements: ageSanitation.count, categories: ageSanitation.categories, result: '清理后再交给并发分镜 AI' });
        plan.schema_version = 'comic_orb_adaptation_v1';
        plan.language = expectedLanguage;
        if (!String(plan.title || '').trim()) plan.title = '未命名漫画';
        if (!String(plan.source_summary || '').trim()) plan.source_summary = String(plan.summary || plan.title);
        if (!String(plan.dramatic_throughline || '').trim()) plan.dramatic_throughline = String(plan.throughline || plan.source_summary);
        if (!Array.isArray(plan.segments) || plan.segments.length < 1 || plan.segments.length > 20) errors.push(`segments 必须为1到20项，实际为 ${Array.isArray(plan.segments) ? plan.segments.length : '非数组'}`);
        let totalPages = 0;
        if (Array.isArray(plan.segments)) plan.segments.forEach((segment, index) => {
            const n = index + 1;
            if (!segment || typeof segment !== 'object') { errors.push(`演绎段 ${n} 必须是对象`); return; }
            segment.segment = n;
            if (!String(segment.title || '').trim()) segment.title = `段落 ${n}`;
            if (!String(segment.story_purpose || '').trim()) segment.story_purpose = '';
            if (!String(segment.refined_plot || '').trim()) segment.refined_plot = String(segment.plot || '');
            if (!String(segment.refined_plot || '').trim()) errors.push(`演绎段 ${n} 的refined_plot不能为空`);
            if (!String(segment.entry_state || '').trim()) segment.entry_state = '按本段剧情自然进入';
            if (!String(segment.exit_state || '').trim()) segment.exit_state = '按本段剧情自然结束';
            if (!String(segment.climax || '').trim()) segment.climax = '由分镜AI根据本段剧情自行判断';
            const pages = Number(segment.page_count ?? segment.pageCount ?? segment.pages);
            segment.page_count = pages;
            if (!Number.isInteger(pages) || pages < expectedWorkerPages.min || pages > expectedWorkerPages.max) errors.push(`演绎段 ${n} 的page_count必须${expectedWorkerPages.min === expectedWorkerPages.max ? `固定为${expectedWorkerPages.min}` : `在${expectedWorkerPages.min}-${expectedWorkerPages.max}范围内`}`);
            else totalPages += pages;
            if (!Array.isArray(segment.key_dialogue_intents)) segment.key_dialogue_intents = [];
            const closeup = segment.closeup_guidance;
            if (closeup !== null && closeup !== undefined && (typeof closeup !== 'object' || Array.isArray(closeup))) segment.closeup_guidance = null;
            else if (closeup === undefined) segment.closeup_guidance = null;
        });
        if (totalPages < expectedPages.min || totalPages > expectedPages.max) errors.push(`演绎总页数必须为 ${expectedPages.min}-${expectedPages.max}，实际为 ${totalPages}`);
        if (errors.length) throw new Error(`演绎 JSON 校验失败（不会调用后续分镜/绘画 API）：${errors.slice(0, 12).join('；')}${errors.length > 12 ? `；另有 ${errors.length - 12} 项` : ''}`);
        return plan;
    }
    function adaptationSegmentPrompt(adaptation, segment) {
        const closeup = segment.closeup_guidance
            ? `本段允许且最多安排一次特写。对象：${segment.closeup_guidance.subject}；剧情作用：${segment.closeup_guidance.dramatic_purpose}。是否使用及具体镜头由你决定，不得增加第二个特写。`
            : '本段没有必要的单张特写指导，不要为了形式强行增加特写。';
        const sharedEntityBible = Object.prototype.hasOwnProperty.call(adaptation || {}, 'entity_bible')
            ? JSON.stringify(adaptation.entity_bible)
            : '未提供；若本段存在明显的跨页实体连续性风险，可自行建立简短的可选entity_bible。';
        return `这是上游剧情演绎编辑交付的第 ${segment.segment}/${adaptation.segments.length} 段。请只对本段进行精细漫画分镜，不要重新扩写其他段落，也不要重复上一段结束事件。

总标题：${adaptation.title}
全局剧情主线：${adaptation.dramatic_throughline}
全局共享entity_bible（软约束，不参与格式校验）：${sharedEntityBible}
本段标题：${segment.title}
本段叙事作用：${segment.story_purpose}
进入状态：${segment.entry_state}
精炼剧情：${segment.refined_plot}
关键对白意图：${JSON.stringify(segment.key_dialogue_intents)}
唯一主要高潮：${segment.climax}
结束状态：${segment.exit_state}
页数：必须严格输出 ${segment.page_count} 页。
特写指导：${closeup}

把上述剧情材料转成完整的comic_orb_storyboard_v1 JSON。entity_bible可沿用、补充、简化或在不需要时省略；不要因为其中缺字段、拼写差异或轻微矛盾而停止工作。所有page_prompt仍须完全自包含；本段第一页从进入状态之后开始，本段最后一页必须到达结束状态。

【本段剧情边界】本段材料是封闭范围，只能表现精炼剧情中已经存在的事件，并严格停在“结束状态”。全局主线只帮助理解上下文，不授权提前表现其他段落；不得依据世界观、MVU或类型常识揭示本段未命名对象、补写下一事件或创造新的高潮。固定页数需要更多画幅时，拆分现有动作、反应、环境与情绪节拍，不得新增或重复剧情事实。`;
    }
    function combineAdaptedStoryboardPlans(adaptation, segmentResults) {
        const pages = []; const characters = []; const characterKeys = new Set();
        segmentResults.forEach(({ segment, plan }) => {
            (plan.characters || []).forEach(character => {
                const key = `${String(character?.name || '').trim()}|${String(character?.appearance_lock || '').trim()}`;
                if (!characterKeys.has(key)) { characterKeys.add(key); characters.push(clone(character)); }
            });
            plan.pages.forEach(page => pages.push({ ...clone(page), page: pages.length + 1, adaptation_segment: segment.segment, adaptation_segment_title: segment.title }));
        });
        const combined = {
            schema_version: 'comic_orb_storyboard_v1',
            language: adaptation.language,
            title: adaptation.title,
            refined_plot: adaptation.source_summary,
            global_style: segmentResults[0]?.plan?.global_style || {},
            characters,
            pages,
            adaptation_plan: clone(adaptation),
        };
        if (Object.prototype.hasOwnProperty.call(adaptation || {}, 'entity_bible')) {
            combined.entity_bible = clone(adaptation.entity_bible);
        } else {
            const optionalSegmentBibles = segmentResults
                .filter(({ plan }) => Object.prototype.hasOwnProperty.call(plan || {}, 'entity_bible'))
                .map(({ plan }) => clone(plan.entity_bible));
            if (optionalSegmentBibles.length === 1) combined.entity_bible = optionalSegmentBibles[0];
            else if (optionalSegmentBibles.length > 1) combined.segment_entity_bibles = optionalSegmentBibles;
        }
        return combined;
    }
    async function runInterpretiveStoryboard(plot, execution, signal, onStage = () => {}) {
        const started = performance.now();
        const checkpoint = execution.checkpoint;
        let adaptation = checkpoint?.adaptation || null; let adaptationTiming = checkpoint?.adaptationTiming || null;
        if (!adaptation) {
            const adaptationResult = await callAdaptation(plot, { conf: execution.adaptationConf, outputLanguage: execution.outputLanguage, totalPageRange: execution.interpretivePageRange, workerPageRange: execution.storyboardWorkerPageRange, preflightNeutralize: execution.preflightNeutralize, withTiming: true, signal });
            adaptation = parseAdaptationPlan(adaptationResult.text, execution.outputLanguage, execution.interpretivePageRange, execution.storyboardWorkerPageRange);
            adaptationTiming = adaptationResult.timing;
            if (checkpoint) { checkpoint.adaptation = adaptation; checkpoint.adaptationTiming = adaptationTiming; checkpoint.stage = 'storyboard'; }
            await writeLog('result', '剧情演绎 JSON 校验通过', execution.debugEnabled
                ? { title: adaptation.title, language: adaptation.language, segments: adaptation.segments, timing: adaptationTiming }
                : { result: `${adaptation.title} · ${adaptation.segments.length} 段 · ${adaptation.segments.reduce((sum, segment) => sum + Number(segment.page_count), 0)} 页`, elapsed: adaptationTiming?.elapsedText });
        }
        onStage('storyboard', { adaptation });
        const retainedSegments = checkpoint?.segmentResults || new Map();
        const controller = new AbortController(); let primaryFailure = null; let primaryFailureSegment = null;
        if (signal) {
            if (signal.aborted) controller.abort(signal.reason);
            else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
        }
        const pendingSegments = adaptation.segments.filter(segment => !retainedSegments.has(Number(segment.segment)));
        const settled = await Promise.allSettled(pendingSegments.map(async segment => {
            try {
                const exactLimits = { pages: { min: Number(segment.page_count), max: Number(segment.page_count) }, panels: storyboardLimits(execution.storyboardConf).panels };
                const result = await callStoryboard(adaptationSegmentPrompt(adaptation, segment), { conf: execution.storyboardConf, refs: execution.refs, outputLanguage: execution.outputLanguage, limits: exactLimits, preflightNeutralize: execution.preflightNeutralize, withTiming: true, signal: controller.signal });
                const segmentConf = { ...execution.storyboardConf, minPages: segment.page_count, maxPages: segment.page_count };
                const plan = parseStoryboardPlan(result.text, segmentConf, execution.outputLanguage, exactLimits);
                const retained = { segment, plan, timing: result.timing };
                retainedSegments.set(Number(segment.segment), retained);
                return retained;
            } catch (error) {
                if (!controller.signal.aborted) { primaryFailure = error; primaryFailureSegment = Number(segment.segment); controller.abort(error); }
                throw error;
            }
        }));
        const failed = settled.map((item, index) => ({ item, segment: pendingSegments[index].segment })).filter(entry => entry.item.status === 'rejected');
        if (failed.length) {
            if (signal?.aborted || isCanceledError(primaryFailure)) throw new DOMException('并发分镜子任务被用户取消', 'AbortError');
            await writeLog('error', '并发分镜调度暂停', { primaryFailureSegment, retainedSegments: [...retainedSegments.keys()].sort((a, b) => a - b), failures: failed.map(entry => ({ segment: entry.segment, status: entry.segment === primaryFailureSegment ? 'failed' : 'canceled_by_peer_failure', error: entry.segment === primaryFailureSegment ? (entry.item.reason?.message || String(entry.item.reason)) : `因第 ${primaryFailureSegment} 段失败而取消` })) });
            throw new Error(`并发分镜已暂停，成功段落已保留；重试只补失败/未完成段：${failed.map(entry => entry.segment === primaryFailureSegment ? `第 ${entry.segment} 段：${entry.item.reason?.message || entry.item.reason}` : `第 ${entry.segment} 段：因第 ${primaryFailureSegment} 段失败而取消，尚未完成`).join('；')}`);
        }
        const segments = adaptation.segments.map(segment => retainedSegments.get(Number(segment.segment))).filter(Boolean).sort((a, b) => a.segment.segment - b.segment.segment);
        if (segments.length !== adaptation.segments.length) throw new Error(`分镜检查点不完整：需要 ${adaptation.segments.length} 段，当前保留 ${segments.length} 段`);
        const wallMs = Math.round(performance.now() - started);
        const segmentTimings = segments.map(item => ({ segment: item.segment.segment, pages: item.segment.page_count, ...item.timing }));
        await writeLog('result', '并发分镜调度完成', { segments: segments.length, pages: adaptation.segments.reduce((sum, segment) => sum + Number(segment.page_count), 0), wallMs, wallTime: formatDuration(wallMs), segmentTimings });
        return { plan: combineAdaptedStoryboardPlans(adaptation, segments), adaptation, adaptationTiming, segmentTimings, wallMs, wallTime: formatDuration(wallMs) };
    }
    function normalizeStoryboardRange(minimum, maximum, fallbackMin, fallbackMax, hardMax) {
        let min = Number(minimum); let max = Number(maximum);
        if (!Number.isInteger(min)) min = fallbackMin; if (!Number.isInteger(max)) max = fallbackMax;
        min = Math.max(1, Math.min(hardMax, min)); max = Math.max(1, Math.min(hardMax, max));
        return min <= max ? { min, max } : { min: max, max: min };
    }
    function normalizeWorkerPageSpec(value) {
        if (value && typeof value === 'object') {
            const range = normalizeStoryboardRange(value.min, value.max, 1, 3, 20);
            return { ...range, spec: range.min === range.max ? String(range.min) : `${range.min}-${range.max}` };
        }
        const raw = String(value ?? '').trim();
        const match = raw.match(/^(\d+)\s*(?:(?:-|~|～|到|至)\s*(\d+))?$/);
        if (!match) throw new Error('单个分镜AI页数必须是单独数字或范围，例如 2 或 1-3');
        const first = Number(match[1]); const second = Number(match[2] || match[1]);
        if (!Number.isInteger(first) || !Number.isInteger(second) || first < 1 || second < 1 || first > 20 || second > 20) throw new Error('单个分镜AI页数必须在1-20之间');
        const min = Math.min(first, second); const max = Math.max(first, second);
        return { min, max, spec: min === max ? String(min) : `${min}-${max}` };
    }
    function assertInterpretivePageAllocation(totalPageRange, workerPageRange) {
        const totals = normalizeStoryboardRange(totalPageRange?.min, totalPageRange?.max, 2, 8, 20);
        const worker = normalizeWorkerPageSpec(workerPageRange);
        let possible = new Set([0]); const attainable = new Set();
        for (let segmentCount = 1; segmentCount <= 20; segmentCount++) {
            const next = new Set();
            for (const sum of possible) for (let pages = worker.min; pages <= worker.max; pages++) if (sum + pages <= 20) next.add(sum + pages);
            possible = next;
            for (const sum of possible) if (sum >= totals.min && sum <= totals.max) attainable.add(sum);
            if (!possible.size) break;
        }
        if (!attainable.size) throw new Error(`总页数 ${totals.min}-${totals.max} 与单个分镜AI页数 ${worker.spec} 无法组合；请调整其中一项`);
        return [...attainable].sort((a, b) => a - b);
    }
    function lastPromptRange(prompt, patterns) {
        const matches = patterns.flatMap(pattern => [...prompt.matchAll(pattern)]).filter(match => match[1]);
        const match = matches.at(-1); if (!match) return null;
        return { min: Number(match[1]), max: Number(match[2] || match[1]) };
    }
    function storyboardLimits(conf = settings.storyboard) {
        const pageFallback = normalizeStoryboardRange(conf.minPages, conf.maxPages, 1, 2, 20);
        const panelFallback = normalizeStoryboardRange(conf.minPanels, conf.maxPanels, 2, 6, 20);
        const prompt = String(conf.systemPrompt || ''); let directive = null;
        const directiveMatch = prompt.match(/comic_orb_limits\s*[:=]\s*(\{[^\r\n]+\})/i);
        if (directiveMatch) directive = safeJson(directiveMatch[1], null);
        const pagePrompt = lastPromptRange(prompt, [/(?:pages|页数|页面数量)[^\d\r\n]{0,24}(\d+)\s*(?:-|~|～|到|至)\s*(\d+)/gi]);
        const panelPrompt = lastPromptRange(prompt, [/(?:panels|每页格数|分格数量|格数)[^\d\r\n]{0,24}(\d+)\s*(?:-|~|～|到|至)\s*(\d+)/gi]);
        const pageSource = Array.isArray(directive?.pages) ? { min: directive.pages[0], max: directive.pages[1] } : pagePrompt;
        const panelSource = Array.isArray(directive?.panels) ? { min: directive.panels[0], max: directive.panels[1] } : panelPrompt;
        return {
            pages: normalizeStoryboardRange(pageSource?.min, pageSource?.max, pageFallback.min, pageFallback.max, 20),
            panels: normalizeStoryboardRange(panelSource?.min, panelSource?.max, panelFallback.min, panelFallback.max, 20),
        };
    }
    function boundaryText(value) { return String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ''); }
    function boundarySimilarity(left, right) {
        const a = boundaryText(left); const b = boundaryText(right); if (a.length < 8 || b.length < 8) return 0;
        const grams = text => new Set(Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)));
        const x = grams(a); const y = grams(b); let shared = 0; for (const gram of x) if (y.has(gram)) shared++;
        return shared / Math.max(1, Math.min(x.size, y.size));
    }
    function parseModelJson(raw, label) {
        let text = String(raw || '').replace(/^\uFEFF/, '').trim();
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
        if (fenced) text = fenced[1].trim();
        else {
            const objectStart = text.indexOf('{'); const arrayStart = text.indexOf('[');
            const starts = [objectStart, arrayStart].filter(index => index >= 0);
            const start = starts.length ? Math.min(...starts) : -1;
            const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
            if (start > 0 && end >= start) text = text.slice(start, end + 1).trim();
        }
        try { return JSON.parse(text); } catch (firstError) {
            // 仅修复“主体已完整、局部漏掉少量闭合括号”的常见模型笔误。
            // 如果响应停在冒号、逗号、字符串中间或括号错配，仍按真正截断处理。
            if (/[:,]\s*$/.test(text)) throw new Error(`${label} JSON 解析失败：${firstError.message}`);
            const stack = []; let inString = false; let escaped = false; let invalid = false; let repairs = 0; let repaired = '';
            for (const char of text) {
                if (inString) {
                    repaired += char;
                    if (escaped) escaped = false;
                    else if (char === '\\') escaped = true;
                    else if (char === '"') inString = false;
                    continue;
                }
                if (char === '"') { inString = true; repaired += char; continue; }
                if (char === '{' || char === '[') { stack.push(char); repaired += char; }
                else if (char === '}' || char === ']') {
                    const expected = char === '}' ? '{' : '[';
                    while (stack.length && stack.at(-1) !== expected && repairs < 3) {
                        repaired += stack.pop() === '{' ? '}' : ']';
                        repairs++;
                    }
                    if (stack.at(-1) !== expected) { invalid = true; break; }
                    stack.pop();
                    repaired += char;
                } else repaired += char;
            }
            if (!invalid && !inString && stack.length > 0 && stack.length <= 3) {
                repaired += stack.reverse().map(char => char === '{' ? '}' : ']').join('');
                repairs += stack.length;
            }
            if (!invalid && !inString && repairs > 0 && repairs <= 3) try { return JSON.parse(repaired); } catch { /* 保留原始解析错误 */ }
            throw new Error(`${label} JSON 解析失败：${firstError.message}`);
        }
    }
    function inferPanelCount(page) {
        const pagePrompt = String(page?.page_prompt || '');
        const numberedPanels = [...pagePrompt.matchAll(/(?:\bpanels?|分镜)\s*#?\s*(\d+)|第\s*(\d+)\s*格/gi)]
            .map(match => Number(match[1] || match[2]))
            .filter(Number.isInteger);
        if (numberedPanels.length) {
            const unique = [...new Set(numberedPanels)].sort((a, b) => a - b);
            const max = unique.at(-1);
            if (unique[0] === 1 && unique.every((value, index) => value === index + 1)) return max;
        }
        const layoutMatch = String(page?.layout || '').match(/(?:^|[^\d])(\d+)\s*格/);
        if (layoutMatch) return Number(layoutMatch[1]);
        return 0;
    }
    function parseStoryboardPlan(raw, conf = settings.storyboard, outputLanguage = settings.outputLanguage, limitsOverride = null) {
        const parsed = parseModelJson(raw, '分镜');
        const expectedLanguage = normalizeOutputLanguage(outputLanguage);
        const plan = Array.isArray(parsed)
            ? { schema_version: 'comic_orb_storyboard_v1', language: expectedLanguage, title: '未命名漫画', pages: parsed }
            : (Array.isArray(parsed?.panels) ? { schema_version: 'comic_orb_storyboard_v1', language: expectedLanguage, title: parsed.title || '未命名漫画', pages: [parsed] } : parsed);
        if (!plan || typeof plan !== 'object' || !Array.isArray(plan.pages)) throw new Error('分镜 JSON 必须包含 pages 数组，或直接返回页面数组');
        const ageSanitation = sanitizeAgeLanguageDeep(plan);
        if (ageSanitation.count) queueLog('operation', '分镜 JSON 年龄表达已强制清除', { replacements: ageSanitation.count, categories: ageSanitation.categories, result: '清理后再校验并发送绘画 API' });
        const errors = []; const pages = plan.pages; const limits = limitsOverride || storyboardLimits(conf);
        plan.schema_version = 'comic_orb_storyboard_v1';
        plan.language = expectedLanguage;
        if (!String(plan.title || '').trim()) plan.title = '未命名漫画';
        if (pages.length < limits.pages.min || pages.length > limits.pages.max) errors.push(`pages 数量必须为 ${limits.pages.min}-${limits.pages.max}，实际为 ${pages.length}`);
        pages.forEach((page, pageIndex) => {
            const pageNo = pageIndex + 1; let panels = page?.panels;
            if (!page || typeof page !== 'object') { errors.push(`第 ${pageNo} 页必须是对象`); return; }
            page.page = pageNo;
            if (!Array.isArray(panels)) {
                const inferredCount = inferPanelCount(page);
                if (inferredCount >= limits.panels.min && inferredCount <= limits.panels.max) {
                    panels = Array.from({ length: inferredCount }, (_, panelIndex) => ({ panel: panelIndex + 1, recovered_from_page_prompt: true }));
                    page.panels = panels;
                    queueLog('operation', '分镜 panels 已从 page_prompt 自动恢复', { page: pageNo, panels: inferredCount, source: 'page_prompt/layout' });
                }
            }
            if (!Array.isArray(panels) || panels.length < limits.panels.min || panels.length > limits.panels.max) { errors.push(`第 ${pageNo} 页 panels 必须为 ${limits.panels.min}-${limits.panels.max} 项数组`); return; }
            panels.forEach((panel, panelIndex) => {
                if (!panel || typeof panel !== 'object') panels[panelIndex] = { panel: panelIndex + 1 };
                else panel.panel = panelIndex + 1;
            });
            const pagePrompt = String(page?.page_prompt || '');
            if (!pagePrompt.trim()) errors.push(`第 ${pageNo} 页 page_prompt 不能为空`);
        });
        if (errors.length) throw new Error(`分镜 JSON 校验失败（不会调用绘画 API）：${errors.slice(0, 12).join('；')}${errors.length > 12 ? `；另有 ${errors.length - 12} 项` : ''}`);
        return plan;
    }
    function storyboardSummary(plan) { return `${plan.title || '未命名漫画'} · ${plan.pages.length} 页 · ${plan.pages.map(page => `${page.panels.length} 格`).join(' + ')}`; }
    function normalizeOutputLanguage(language) {
        const requested = String(language || '').trim();
        if (requested && requested.toLocaleLowerCase() !== 'auto') return requested;
        return String(navigator.languages?.[0] || navigator.language || document.documentElement.lang || 'und').trim() || 'und';
    }
    function outputLanguageLabel(language) {
        const normalized = normalizeOutputLanguage(language);
        const labels = { 'zh-cn': '简体中文', 'zh-tw': '繁體中文', 'zh-hk': '繁體中文（香港）', 'en-us': 'English (US)', 'en-gb': 'English (UK)', 'ja-jp': '日本語', 'ko-kr': '한국어', 'fr-fr': 'français', 'de-de': 'Deutsch', 'es-es': 'español' };
        return labels[normalized.toLocaleLowerCase()] ? `${labels[normalized.toLocaleLowerCase()]}（${normalized}）` : normalized;
    }
    function drawingLocalizationAndColorGuard(language) {
        const normalized = normalizeOutputLanguage(language);
        const visibleLanguage = outputLanguageLabel(normalized);
        return `【最终渲染要求——优先级最高】
1. 本次漫画输出语言变量为“${normalized}”（${visibleLanguage}）。本页所有可见文字使用该语言，逐字照抄分镜中指定的对白、旁白、内心独白和拟声字；气泡类型只用外形区分。
2. 本页采用全彩表现，忠实保留分镜指定的环境色、肤色、发色、服装色和特效色。分镜明确指定的单格情绪效果可以临时变调，其余格保持全页与跨页配色连续。
3. 镜头清楚呈现角色站位、动作轨迹、瞬间反馈、结果状态和关键道具，保持人物身份、服装与前后页连续。
4. 本作品中的所有拟人角色均为至少20岁的成年人；只把这条作为身份事实，不要添加年龄文字，不要改变参考图脸型、身形比例、体态、服装、身体动态或镜头，也不要把角色画得更老。`;
    }
    function refPrompt(prompt, includeReferences = true, conf = settings.drawing, refList = refs, language = settings.outputLanguage) {
        const notes = includeReferences ? refList.filter(r => r.dataUrl).map((r, i) => `参考图${i + 1}：${r.hint || '保持对应视觉元素一致'}`).join('\n') : '';
        return [conf.promptPrefix, prompt, notes, drawingLocalizationAndColorGuard(language)].filter(Boolean).join('\n\n');
    }
    function imageApiOptions(conf, forEdits = false) {
        const options = {};
        const quality = String(conf.quality || '').trim(); if (quality) options.quality = quality;
        const outputFormat = String(conf.outputFormat || '').trim(); if (outputFormat) options.output_format = outputFormat;
        const compression = String(conf.outputCompression ?? '').trim();
        if (compression !== '') {
            if (!['jpeg', 'webp'].includes(outputFormat)) throw new Error('output_compression 仅适用于 JPEG/WebP，请先选择对应输出格式');
            const numeric = Number(compression); if (!Number.isFinite(numeric)) throw new Error('输出压缩必须是 0-100 的数字');
            options.output_compression = Math.max(0, Math.min(100, numeric));
        }
        const background = String(conf.background || '').trim(); if (background) options.background = background;
        if (background === 'transparent' && !['png', 'webp'].includes(outputFormat)) throw new Error('透明背景需要明确选择 PNG 或 WebP 输出格式');
        const inputFidelity = String(conf.inputFidelity || '').trim(); if (forEdits && inputFidelity) options.input_fidelity = inputFidelity;
        return options;
    }
    function drawingEndpoint(conf, protocol) {
        let path = String(conf.path || '').trim();
        if (protocol === 'generations') path = path.replace(/\/images\/edits\/?$/i, '/images/generations');
        if (protocol === 'edits') path = path.replace(/\/images\/generations\/?$/i, '/images/edits');
        if (protocol === 'gemini') {
            path = /:generateContent\/?$/i.test(path)
                ? path.replace(/\{model\}/gi, encodeURIComponent(conf.model))
                : `/v1beta/models/${encodeURIComponent(conf.model)}:generateContent`;
        }
        return normalizeEndpoint(conf.baseUrl, path);
    }
    function isLocalGeminiWebBridge(endpoint) {
        try {
            const url = new URL(endpoint, location.href);
            return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) && url.port === '4981' && /\/openai\/v1\/chat\/completions\/?$/i.test(url.pathname);
        } catch { return false; }
    }
    function sizeToAspectRatio(size) {
        const match = String(size || '').match(/^\s*(\d+)\s*x\s*(\d+)\s*$/i);
        if (!match) return '';
        let a = Number(match[1]); let b = Number(match[2]);
        const gcd = (x, y) => y ? gcd(y, x % y) : x;
        const divisor = gcd(a, b); a /= divisor; b /= divisor;
        return `${a}:${b}`;
    }
    function geminiInlinePart(ref) {
        const match = String(ref.dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/s);
        if (!match) throw new Error(`参考图“${ref.name || '未命名'}”不是有效的 base64 Data URL`);
        return { inlineData: { mimeType: match[1], data: match[2] } };
    }
    async function localizeReturnedImage(image, signal) {
        ensureNotCanceled(signal);
        if (String(image).startsWith('data:image/')) return image;
        const processId = startRemoteProcess('下载远程绘画图片', { url: String(image), method: 'GET' }, { parentSignal: signal });
        try {
            const response = await fetch(image, { signal: remoteProcessSignal(processId) }); if (!response.ok) throw new Error(`远程图片下载失败：HTTP ${response.status}`);
            const blob = await response.blob(); if (!String(blob.type || '').startsWith('image/')) throw new Error(`远程响应不是图片：${blob.type || '未知类型'}`);
            const result = await readFile(new File([blob], 'comic-orb-cache', { type: blob.type })); finishRemoteProcess(processId, 'success', `${formatBytes(blob.size)} · ${blob.type}`); return result;
        } catch (error) { finishRemoteProcess(processId, isCanceledError(error) ? 'canceled' : 'error', isCanceledError(error) ? '用户取消' : error.message); throw error; }
    }
    function dataUrlBytes(dataUrl) {
        const payload = String(dataUrl).split(',')[1] || '';
        return Math.max(0, Math.floor(payload.length * 3 / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0));
    }
    async function drawingResult(data, conf, finalPrompt, options = {}) {
        const timing = data?.__comicOrbTiming ? { ...data.__comicOrbTiming } : null;
        const imageSource = extractImage(data, conf.outputFormat);
        let image;
        try {
            image = await localizeReturnedImage(imageSource, options.signal);
        } catch (error) {
            if (isCanceledError(error)) throw error;
            throw new Error(`绘画 API 已返回图片地址，但无法读取图片数据：${error.message}`);
        }
        const meta = options.cacheMeta || {};
        const record = {
            id: newId(), createdAt: new Date().toISOString(), dataUrl: image, bytes: dataUrlBytes(image),
            mime: image.match(/^data:([^;,]+)/)?.[1] || 'image/png', model: String(conf.model || ''), mode: String(conf.mode || 'images'),
            apiProfileId: options.profile?.id || settings.activeApiProfile.drawing, apiProfileName: options.profile?.name || activeApiProfile('drawing')?.name || '',
            pageNumber: Number(options.pageNumber || 1), test: Boolean(options.test), prompt: finalPrompt, pagePrompt: String(options.pagePrompt || ''),
            sourcePlot: String(meta.sourcePlot || ''), sourceRange: meta.sourceRange || null, targetFloor: Number.isInteger(meta.targetFloor) ? meta.targetFloor : null,
            chatId: String(meta.chatId || ''), batchId: String(meta.batchId || ''), storyboardPlan: meta.storyboardPlan || null, timing,
        };
        ensureNotCanceled(options.signal);
        try { await imageCachePut(record); }
        catch (error) { throw new Error(`绘画 API 已返回图片，但 IndexedDB 本地缓存写入失败（可在“缓存”分页清理空间）：${error.message}`); }
        queueLog('result', '绘画图片已持久化到本地缓存', { cacheId: record.id, page: record.pageNumber, bytes: record.bytes, model: record.model });
        const result = { image, timing, cacheId: record.id, prompt: finalPrompt };
        return options.withTiming ? result : result.image;
    }
    async function callDrawingEdits(conf, finalPrompt, activeRefs, options = {}) {
        const extras = apiExtras(conf); const fields = { model: conf.model, prompt: finalPrompt, ...(String(conf.size || '').trim() ? { size: conf.size } : {}), n: 1, ...imageApiOptions(conf, true), ...extras };
        const requestRefs = options.test ? [{ dataUrl: makeTestImage(), name: 'api-test.png' }] : activeRefs;
        if (conf.useLocalProxy !== false) return callDrawingThroughLocalProxy(conf, 'edits', fields, requestRefs, options);
        const form = new FormData(); form.append('model', conf.model); form.append('prompt', finalPrompt);
        if (String(conf.size || '').trim()) form.append('size', conf.size);
        form.append('n', '1');
        if (options.test) form.append('image[]', dataUrlToBlob(makeTestImage()), 'api-test.png');
        else activeRefs.forEach((ref, i) => form.append('image[]', dataUrlToBlob(ref.dataUrl), ref.name || `reference-${i + 1}.png`));
        const optional = { ...imageApiOptions(conf, true), ...extras };
        for (const [key, value] of Object.entries(optional)) form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        const data = await apiFetch(drawingEndpoint(conf, 'edits'), { method: 'POST', headers: apiHeaders(conf, true), body: form, signal: options.signal }, options.test ? '绘画 API 测试（Edits）' : `绘画生成 · 第 ${options.pageNumber || 1} 页（Edits，${activeRefs.length} 张参考图）`, validateDrawingPayload);
        return drawingResult(data, conf, finalPrompt, options);
    }
    async function callDrawingThroughLocalProxy(conf, protocol, fields, referenceList, options = {}) {
        const timeoutSeconds = Math.max(60, Math.min(1800, Number(conf.requestTimeoutSeconds) || 600));
        const operation = options.test ? `绘画 API 测试（${protocol === 'edits' ? 'Edits' : 'Generations'} · 本地${timeoutSeconds}秒代理）` : `绘画生成 · 第 ${options.pageNumber || 1} 页（${protocol === 'edits' ? `Edits，${referenceList.length} 张参考图` : 'Generations'} · 本地${timeoutSeconds}秒代理）`;
        const customHeaders = safeJson(conf.extraHeaders, null);
        if (customHeaders === null || Array.isArray(customHeaders)) throw new Error('额外请求头不是有效 JSON 对象');
        const payload = {
            provider_endpoint: drawingEndpoint(conf, protocol), protocol, timeout_seconds: timeoutSeconds,
            headers: customHeaders, fields,
            references: referenceList.map((reference, index) => ({ dataUrl: reference.dataUrl, name: reference.name || `reference-${index + 1}.png` })),
        };
        const localHeaders = { ...context().getRequestHeaders(), ...(conf.apiKey ? { 'X-Comic-Orb-Api-Key': conf.apiKey } : {}) };
        const data = await apiFetch('/api/openai/comic-orb-image', { method: 'POST', headers: localHeaders, body: JSON.stringify(payload), signal: options.signal }, operation, validateDrawingPayload);
        return drawingResult(data, conf, fields.prompt, options);
    }
    async function callDrawing(prompt, options = {}) {
        const conf = options.conf || settings.drawing;
        const refList = options.refs || refs;
        const outputLanguage = options.outputLanguage || options.cacheMeta?.storyboardPlan?.language || settings.outputLanguage;
        const finalPrompt = refPrompt(prompt, !options.test, conf, refList, outputLanguage);
        const activeRefs = conf.sendReferences && !options.test ? refList.filter(r => r.dataUrl) : [];
        if (conf.mode === 'chat') {
            const content = [{ type: 'text', text: finalPrompt }];
            activeRefs.forEach(r => content.push({ type: 'image_url', image_url: { url: r.dataUrl } }));
            const endpoint = normalizeEndpoint(conf.baseUrl, conf.path); const extras = apiExtras(conf);
            const body = { model: conf.model, messages: [{ role: 'user', content }], ...(isLocalGeminiWebBridge(endpoint) && !Object.prototype.hasOwnProperty.call(extras, 'image_response_format') ? { image_response_format: 'b64_json' } : {}), ...extras };
            const data = await providerApiFetch(conf, endpoint, { method: 'POST', headers: apiHeaders(conf), body: JSON.stringify(body), signal: options.signal }, options.test ? '绘画 API 测试（Chat）' : `绘画生成 · 第 ${options.pageNumber || 1} 页（Chat）`, validateDrawingPayload);
            return drawingResult(data, conf, finalPrompt, options);
        }
        if (conf.mode === 'gemini') {
            const extras = apiExtras(conf); const customGeneration = extras.generationConfig || {};
            const aspectRatio = sizeToAspectRatio(conf.size);
            const parts = [{ text: finalPrompt }, ...activeRefs.map(geminiInlinePart)];
            const body = {
                contents: [{ role: 'user', parts }],
                ...extras,
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
                    ...customGeneration,
                },
            };
            const endpoint = drawingEndpoint(conf, 'gemini');
            const data = await providerApiFetch(conf, endpoint, { method: 'POST', headers: apiHeaders(conf), body: JSON.stringify(body), signal: options.signal }, options.test ? '绘画 API 测试（Gemini 原生）' : `绘画生成 · 第 ${options.pageNumber || 1} 页（Gemini 原生，${activeRefs.length} 张参考图）`, validateDrawingPayload);
            return drawingResult(data, conf, finalPrompt, options);
        }
        if (conf.mode === 'edits') {
            if (!options.test && !activeRefs.length) throw new Error('Edits 模式需要至少一张已启用的参考图；无参考图请使用 OpenAI 自动模式');
            return callDrawingEdits(conf, finalPrompt, activeRefs, options);
        }
        // 向后兼容原来的 images 值：有参考图时自动切换为实测兼容的 multipart image[] Edits 协议。
        if (activeRefs.length) return callDrawingEdits(conf, finalPrompt, activeRefs, options);
        const body = { model: conf.model, prompt: finalPrompt, n: 1, ...(String(conf.size || '').trim() ? { size: conf.size } : {}), ...imageApiOptions(conf), ...apiExtras(conf) };
        if (conf.useLocalProxy !== false) return callDrawingThroughLocalProxy(conf, 'generations', body, [], options);
        const data = await apiFetch(drawingEndpoint(conf, 'generations'), { method: 'POST', headers: apiHeaders(conf), body: JSON.stringify(body), signal: options.signal }, options.test ? '绘画 API 测试（Generations）' : `绘画生成 · 第 ${options.pageNumber || 1} 页（Generations）`, validateDrawingPayload);
        return drawingResult(data, conf, finalPrompt, options);
    }
    function abortableDelay(ms, signal) {
        if (ms <= 0) { ensureNotCanceled(signal); return Promise.resolve(); }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(done, ms);
            function done() { signal?.removeEventListener('abort', canceled); resolve(); }
            function canceled() { clearTimeout(timer); signal?.removeEventListener('abort', canceled); reject(signal.reason instanceof Error ? signal.reason : new DOMException('任务已取消', 'AbortError')); }
            if (signal?.aborted) canceled(); else signal?.addEventListener('abort', canceled, { once: true });
        });
    }
    async function drawStoryboardPages(plan, cacheMeta = {}, execution = {}) {
        const started = performance.now();
        const debugEnabled = execution.debugEnabled ?? settings.debug.enabled;
        const staggerMs = normalizeBatchDrawingInterval(execution.batchDrawingIntervalMs);
        const retainedResults = execution.checkpoint?.drawingResults || new Map();
        const batchController = new AbortController();
        let primaryFailure = null; let primaryFailurePage = null;
        if (execution.signal) {
            if (execution.signal.aborted) batchController.abort(execution.signal.reason);
            else execution.signal.addEventListener('abort', () => batchController.abort(execution.signal.reason), { once: true });
        }
        await writeLog('operation', '并发绘画调度开始', debugEnabled
            ? { summary: storyboardSummary(plan), staggerMs, staggerTime: formatDuration(staggerMs), retainedPages: [...retainedResults.keys()], pages: plan.pages.map(page => ({ page: page.page, panels: page.panels.length, prompt: page.page_prompt })) }
            : { pages: plan.pages.length, retained: retainedResults.size, staggerMs, staggerTime: formatDuration(staggerMs), panels: plan.pages.map(page => page.panels.length) });
        const pendingPages = plan.pages.filter(page => !retainedResults.has(Number(page.page)));
        const settled = await Promise.allSettled(pendingPages.map(async (page, launchIndex) => {
            try {
                await abortableDelay(launchIndex * staggerMs, batchController.signal);
                const result = await callDrawing(page.page_prompt, { withTiming: true, pageNumber: page.page, pagePrompt: page.page_prompt, cacheMeta: { ...cacheMeta, storyboardPlan: plan }, outputLanguage: execution.outputLanguage || plan.language, conf: execution.drawingConf, refs: execution.refs, profile: execution.drawingProfile, signal: batchController.signal });
                const retained = { page: page.page, panels: page.panels.length, image: result.image, timing: result.timing, cacheId: result.cacheId, prompt: result.prompt };
                retainedResults.set(Number(page.page), retained);
                return retained;
            } catch (error) {
                if (!batchController.signal.aborted) { primaryFailure = error; primaryFailurePage = Number(page.page); batchController.abort(error); }
                throw error;
            }
        }));
        const failed = settled.map((item, index) => ({ item, page: pendingPages[index].page })).filter(x => x.item.status === 'rejected');
        const wallMs = Math.round(performance.now() - started);
        if (failed.length) {
            await writeLog('error', '并发绘画调度暂停', { wallMs, wallTime: formatDuration(wallMs), retainedPages: [...retainedResults.keys()].sort((a, b) => a - b), primaryFailurePage, failures: failed.map(x => ({ page: x.page, status: x.page === primaryFailurePage ? 'failed' : 'canceled_by_peer_failure', error: x.page === primaryFailurePage ? (x.item.reason?.message || String(x.item.reason)) : `因第 ${primaryFailurePage} 页失败而取消` })) });
            if (execution.signal?.aborted || isCanceledError(primaryFailure)) throw new DOMException('绘画子任务被用户取消', 'AbortError');
            throw new Error(`并发绘画已暂停，成功图片已保留；重试只补未完成页：${failed.map(x => x.page === primaryFailurePage ? `第 ${x.page} 页：${x.item.reason?.message || x.item.reason}` : `第 ${x.page} 页：因第 ${primaryFailurePage} 页失败而取消，尚未完成`).join('；')}`);
        }
        const results = plan.pages.map(page => retainedResults.get(Number(page.page))).filter(Boolean).sort((a, b) => a.page - b.page);
        if (results.length !== plan.pages.length) throw new Error(`绘画检查点不完整：需要 ${plan.pages.length} 页，当前保留 ${results.length} 页`);
        await writeLog('result', '并发绘画调度完成', debugEnabled
            ? { wallMs, wallTime: formatDuration(wallMs), pages: results.map(x => ({ page: x.page, panels: x.panels, timing: x.timing, cacheId: x.cacheId })) }
            : { wallMs, wallTime: formatDuration(wallMs), pages: results.map(x => ({ page: x.page, time: x.timing?.elapsedText || '未知' })) });
        return { results, wallMs, wallTime: formatDuration(wallMs) };
    }
    function makeTestImage() {
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 512); ctx.fillStyle = '#111'; ctx.font = 'bold 72px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TEST', 256, 280);
        return canvas.toDataURL('image/png');
    }
    function extractImage(data, formatHint = '') {
        const mime = String(formatHint || '').toLowerCase() === 'jpg' ? 'jpeg' : String(formatHint || 'png').toLowerCase();
        const direct = data.data?.[0]?.b64_json ? `data:image/${mime};base64,${data.data[0].b64_json}` : data.data?.[0]?.url;
        if (direct) return direct;
        const geminiPart = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data || part.inline_data?.data);
        if (geminiPart) {
            const inline = geminiPart.inlineData || geminiPart.inline_data;
            return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`;
        }
        const message = data.choices?.[0]?.message;
        const imageObj = message?.images?.[0]?.image_url?.url || message?.images?.[0]?.url;
        if (imageObj) return imageObj;
        const content = message?.content ?? data.output;
        if (Array.isArray(content)) {
            for (const item of content) {
                const value = item.image_url?.url || item.image_url || item.url || (item.b64_json ? `data:image/${mime};base64,${item.b64_json}` : '') || (item.type === 'output_image' && item.image_base64 ? `data:image/${mime};base64,${item.image_base64}` : '');
                if (value) return value;
            }
        }
        const text = String(typeof content === 'string' ? content : message?.content || '').trim();
        const markdownImage = text.match(/!\[[^\]]*\]\(\s*((?:https?:\/\/|data:image\/)[^\s)]+)\s*\)/i);
        if (markdownImage) return markdownImage[1];
        if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+$/i.test(text)) return text;
        if (/^https?:\/\/\S+$/i.test(text)) return text;
        throw new Error('绘画 API 响应中没有找到图片 URL 或 base64 数据');
    }
    function clientPathToAbsolute(clientPath, rootOverride = settings.storage.localImageRoot) {
        let relative = String(clientPath || ''); try { relative = decodeURI(relative); } catch {}
        relative = relative.replace(/^[/\\]+/, '').replace(/[/\\]+/g, '\\');
        const rootPath = String(rootOverride || '').trim().replace(/[/\\]+$/, '');
        return rootPath && relative ? `${rootPath}\\${relative}` : relative;
    }
    async function persistImage(image, ctx, pageNumber = 1, options = {}) {
        ensureNotCanceled(options.signal);
        await writeLog('operation', `第 ${pageNumber} 页图片持久化开始`, { page: pageNumber, source: image.startsWith('data:') ? '本地 data URL' : '远程 URL', bytes: image.startsWith('data:') ? dataUrlBytes(image) : undefined });
        let dataUrl = image;
        if (!image.startsWith('data:')) {
            try { dataUrl = await localizeReturnedImage(image, options.signal); } catch (error) {
                if (isCanceledError(error)) throw error;
                console.warn('[漫画工房] 无法转存远程图片，将直接插入 URL', error); return image;
            }
        }
        const mime = dataUrl.match(/^data:image\/([^;,]+)/)?.[1] || 'png';
        const format = mime === 'jpeg' ? 'jpg' : mime;
        const base64 = dataUrl.match(/^data:[^;,]+;base64,(.+)$/s)?.[1];
        if (!base64) throw new Error('本地缓存图片不是有效的 base64 data URL');
        const body = { image: base64, format, ch_name: ctx.name2 || 'comic-orb', filename: `comic_${Date.now()}_p${pageNumber}_${Math.random().toString(36).slice(2, 7)}` };
        const processId = startRemoteProcess(`上传漫画第 ${pageNumber} 页到酒馆`, { url: '/api/images/upload', method: 'POST' }, { parentSignal: options.signal });
        let response; let data;
        try { response = await fetch('/api/images/upload', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body), signal: remoteProcessSignal(processId) }); data = await response.json(); }
        catch (error) { finishRemoteProcess(processId, isCanceledError(error) ? 'canceled' : 'error', isCanceledError(error) ? '用户取消' : error.message); throw error; }
        const absolutePath = response.ok ? clientPathToAbsolute(data.path, options.storage?.localImageRoot) : '';
        await writeLog(response.ok ? 'response' : 'error', '保存图片到酒馆', { page: pageNumber, bytes: dataUrlBytes(dataUrl), format, status: response.status, result: response.ok ? absolutePath : data.error, absolutePath });
        if (!response.ok) { finishRemoteProcess(processId, 'error', data.error || `HTTP ${response.status}`); throw new Error(data.error || '图片保存到酒馆失败'); }
        if (!data.path) { finishRemoteProcess(processId, 'error', '响应缺少 path'); throw new Error('图片保存接口成功但没有返回 path'); }
        finishRemoteProcess(processId, 'success', absolutePath);
        return encodeURI(String(data.path || ''));
    }
    // Generation and uploads may stay concurrent, but chat snapshot saves must not.
    // SillyTavern's conditional save has a check/set window in which two completed
    // background jobs can both start saving; the later POST can then erase the
    // other job's floor edit. This mutex only covers read-modify-save per chat.
    const chatWriteTails = new Map();
    async function withChatWriteLock(expectedChatId, label, operation) {
        const key = String(expectedChatId || '__current_chat__');
        const previous = chatWriteTails.get(key) || Promise.resolve();
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const tail = previous.catch(() => {}).then(() => gate);
        chatWriteTails.set(key, tail);
        const queuedAt = Date.now();
        await previous.catch(() => {});
        try {
            const freshCtx = context();
            const actualChatId = currentChatId(freshCtx);
            if (expectedChatId && actualChatId && String(expectedChatId) !== actualChatId) {
                throw new Error(`${label}等待期间当前聊天已切换；图片已保留在缓存，本次没有写错楼层`);
            }
            const waitedMs = Date.now() - queuedAt;
            if (waitedMs >= 50) queueLog('operation', '正文写回等待同聊天保存锁', { chatId: key, label, waitedMs, result: `等待 ${formatDuration(waitedMs)}` });
            return await operation(freshCtx);
        } finally {
            release();
            if (chatWriteTails.get(key) === tail) chatWriteTails.delete(key);
        }
    }
    function refreshMessageIfRendered(ctx, floor, msg) {
        const element = document.querySelector(`#chat [mesid="${Number(floor)}"]`);
        if (!element) { queueLog('operation', '正文已保存，目标楼层当前未渲染', { floor, result: '跳过即时 DOM 刷新；滚动到该楼层或刷新聊天后会显示' }); return false; }
        try { ctx.updateMessageBlock(floor, msg); return true; }
        catch (error) { console.warn('[漫画工房] 正文已保存，但即时消息块刷新失败', error); queueLog('error', '正文已保存但即时 DOM 刷新失败', { floor, result: error.message }); return false; }
    }
    async function insertIntoFloor(ctx, floor, imageUrl) {
        const marker = settings.insert.marker;
        const markdown = `${marker}\n![${settings.insert.alt || 'AI 漫画'}](${imageUrl})`;
        const existing = new RegExp(`${escapeRegExp(marker)}\\s*\\n?!\\[[^\]]*\]\\([^\\n]+\\)`, 'g');
        const expectedChatId = currentChatId(ctx);
        return withChatWriteLock(expectedChatId, `向第 ${floor} 层插入漫画`, async freshCtx => {
            const msg = freshCtx.chat[floor];
            if (!msg) throw new Error(`目标楼层 ${floor} 不存在`);
            msg.mes = existing.test(msg.mes || '') ? String(msg.mes).replace(existing, markdown) : `${String(msg.mes || '').trimEnd()}\n\n${markdown}`;
            await freshCtx.saveChat();
            refreshMessageIfRendered(freshCtx, floor, msg);
        });
    }
    function taggedPageMarkdown(item, index = 0, insertConf = settings.insert) {
        const page = Number(item.page || index + 1); const cacheId = String(item.cacheId || 'legacy');
        const cleanUrl = String(item.url || '').replace(/#comic-orb-cache=[^\s)]+$/, ''); const taggedUrl = `${cleanUrl}#comic-orb-cache=${encodeURIComponent(cacheId)}&page=${page}`;
        return `<!-- comic-orb:image id="${cacheId}" page="${page}" -->\n![${insertConf.alt || 'AI 漫画'} · 第 ${page} 页](${taggedUrl})`;
    }
    async function insertPagesIntoFloor(ctx, floor, imageItems, insertConf = settings.insert) {
        const items = (Array.isArray(imageItems) ? imageItems : [imageItems]).map((item, index) => typeof item === 'string' ? { url: item, page: index + 1, cacheId: 'legacy' } : item);
        const marker = insertConf.marker; const start = '<!-- comic-orb-pages:start -->'; const end = '<!-- comic-orb-pages:end -->';
        const pages = items.map((item, index) => taggedPageMarkdown(item, index, insertConf)).join('\n\n');
        const markdown = `${marker}\n${start}\n${pages}\n${end}`;
        const multiExisting = new RegExp(`${escapeRegExp(marker)}\\s*\\n?${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, 'g');
        const legacyExisting = new RegExp(`${escapeRegExp(marker)}\\s*\\n?!\\[[^\]]*\\]\\([^\\n]+\\)`, 'g');
        const expectedChatId = currentChatId(ctx);
        return withChatWriteLock(expectedChatId, `向第 ${floor} 层写回 ${items.length} 页漫画`, async freshCtx => {
            const msg = freshCtx.chat[floor];
            if (!msg) throw new Error(`目标楼层 ${floor} 不存在`);
            const current = String(msg.mes || '');
            msg.mes = multiExisting.test(current) ? current.replace(multiExisting, markdown)
                : legacyExisting.test(current) ? current.replace(legacyExisting, markdown)
                    : `${current.trimEnd()}\n\n${markdown}`;
            await freshCtx.saveChat();
            const savedText = String(freshCtx.chat[floor]?.mes || '');
            const missingCacheId = items.find(item => item.cacheId && !savedText.includes(`id="${String(item.cacheId)}"`));
            if (missingCacheId) throw new Error(`第 ${floor} 层保存后校验失败：缺少漫画缓存标识 ${missingCacheId.cacheId}`);
            refreshMessageIfRendered(freshCtx, floor, msg);
        });
    }
    async function replaceTaggedPage(ctx, floor, oldCacheId, item, insertConf = settings.insert) {
        const id = escapeRegExp(oldCacheId);
        const pattern = new RegExp(`<!--\\s*comic-orb:image\\s+id=["']${id}["'][^>]*-->\\s*\\n?!\\[[^\\]]*\\]\\([^\\n]+\\)`, 'g');
        const expectedChatId = currentChatId(ctx);
        return withChatWriteLock(expectedChatId, `替换第 ${floor} 层漫画页`, async freshCtx => {
            const msg = freshCtx.chat[floor];
            if (!msg) throw new Error(`目标楼层 ${floor} 不存在`);
            const current = String(msg.mes || '');
            if (!pattern.test(current)) throw new Error('正文中找不到该漫画页的 comic-orb:image 标签，可能已被手动修改');
            msg.mes = current.replace(pattern, taggedPageMarkdown(item, Number(item.page || 1) - 1, insertConf));
            await freshCtx.saveChat();
            refreshMessageIfRendered(freshCtx, floor, msg);
        });
    }
    function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    async function migrateLegacyTaggedMarkdown() {
        let ctx; try { ctx = context(); } catch { return; }
        const expectedChatId = currentChatId(ctx);
        const migration = await withChatWriteLock(expectedChatId, '迁移旧版正文漫画标识', async freshCtx => {
            let changed = 0; const changedFloors = [];
            freshCtx.chat.forEach((msg, floor) => {
                const current = String(msg?.mes || '');
                const next = current.replace(/!\[([^\]]*)\]\((\S+)\s+["']comic-orb:image;cache=([^;"']+);page=(\d+)["']\)/g, (_, alt, url, cacheId, page) => `![${alt}](${url}#comic-orb-cache=${encodeURIComponent(cacheId)}&page=${page})`);
                if (next === current) return; msg.mes = next; changedFloors.push(floor); changed++;
            });
            if (changed) {
                await freshCtx.saveChat();
                changedFloors.forEach(floor => refreshMessageIfRendered(freshCtx, floor, freshCtx.chat[floor]));
            }
            return { changed };
        });
        if (migration.changed) { await writeLog('operation', '迁移旧版正文漫画标识', { result: `已修正 ${migration.changed} 个楼层的 Markdown 图片语法` }); notify(`已自动修正 ${migration.changed} 个楼层的漫画图片显示`, 'success'); }
    }

    function productionExecutionSnapshot() {
        const adaptationProfile = activeApiProfile('adaptation'); const storyboardProfile = activeApiProfile('storyboard'); const drawingProfile = activeApiProfile('drawing');
        return {
            range: String(settings.range), includeNames: Boolean(settings.includeNames), includeMvuData: Boolean(settings.includeMvuData), preflightNeutralize: Boolean(settings.preflightNeutralize), regexList: clone(settings.regexList),
            outputLanguage: normalizeOutputLanguage(settings.outputLanguage),
            workflowMode: settings.workflowMode === 'interpretive' ? 'interpretive' : 'direct',
            batchDrawingIntervalMs: normalizeBatchDrawingInterval(settings.batchDrawingIntervalMs),
            interpretivePageRange: normalizeStoryboardRange(settings.interpretivePageRange?.min, settings.interpretivePageRange?.max, 2, 8, 20),
            storyboardWorkerPageRange: normalizeWorkerPageSpec(settings.storyboardWorkerPages),
            adaptationConf: clone(settings.adaptation), storyboardConf: clone(settings.storyboard), drawingConf: clone(settings.drawing), refs: snapshotRefs(),
            adaptationProfile: { id: adaptationProfile?.id || '', name: adaptationProfile?.name || '' },
            storyboardProfile: { id: storyboardProfile?.id || '', name: storyboardProfile?.name || '' },
            drawingProfile: { id: drawingProfile?.id || '', name: drawingProfile?.name || '' },
            insert: clone(settings.insert), storage: clone(settings.storage), debugEnabled: Boolean(settings.debug.enabled),
        };
    }
    function requireProductionContext(job) {
        const ctx = context(); const chatId = currentChatId(ctx);
        if (job.chatId && chatId && job.chatId !== chatId) throw new Error('后台漫画任务所属聊天已不是当前聊天；生成图片已保留在本地缓存，但为避免写错正文，本次没有写回。请切回原聊天后从缓存恢复');
        if (!ctx.chat[job.targetFloor]) throw new Error(`后台漫画任务目标楼层 ${job.targetFloor} 已不存在，已停止写回`);
        return ctx;
    }
    async function runProductionJob(job, retainedCheckpoint = null) {
        const checkpoint = retainedCheckpoint || {
            jobId: job.id, stage: 'start', processId: '', adaptation: null, adaptationTiming: null,
            segmentResults: new Map(), plan: null, storyboardTiming: null, drawingResults: new Map(), savedUrls: new Map(),
        };
        if (!checkpoint.processId) checkpoint.processId = startRemoteProcess(`漫画任务 #${job.shortId} · 等待开始`, { method: 'WORKFLOW', url: `chat:${job.chatId || 'current'}/floor:${job.targetFloor}` });
        workflowCheckpoints.set(job.id, checkpoint);
        const processId = checkpoint.processId;
        const signal = remoteProcessSignal(processId); const execution = { ...job.execution, signal, checkpoint };
        try {
            ensureNotCanceled(signal); updateRemoteProcess(processId, `漫画任务 #${job.shortId} · 准备工作流`, `范围 ${job.start}-${job.end}，目标楼层 ${job.targetFloor}`);
            await writeLog('operation', '漫画生成开始', execution.debugEnabled ? { taskId: job.id, mode: execution.workflowMode, range: { start: job.start, end: job.end }, outputLanguage: execution.outputLanguage, interpretivePageRange: execution.interpretivePageRange, storyboardWorkerPageRange: execution.storyboardWorkerPageRange, preflightNeutralize: execution.preflightNeutralize, includedFloors: job.selection.floors, skippedUserFloors: job.selection.skippedUserFloors, regexList: execution.regexList, mvu: job.selection.mvuMeta, processedPlot: job.selection.text, profiles: { adaptation: execution.adaptationProfile, storyboard: execution.storyboardProfile, drawing: execution.drawingProfile } } : { taskId: job.id, mode: execution.workflowMode, range: `${job.start}-${job.end}`, language: execution.outputLanguage, totalPages: execution.workflowMode === 'interpretive' ? `${execution.interpretivePageRange.min}-${execution.interpretivePageRange.max}` : '由直接分镜设置决定', workerPages: execution.workflowMode === 'interpretive' ? execution.storyboardWorkerPageRange.spec : '不适用', preflightNeutralize: execution.preflightNeutralize, included: job.selection.floors.length, skippedUsers: job.selection.skippedUserFloors.length, rules: execution.regexList.filter(x => x.enabled !== false).length, mvu: job.selection.mvuMeta });
            let plan = checkpoint.plan; let storyboardTiming = checkpoint.storyboardTiming;
            if (!plan && execution.workflowMode === 'interpretive') {
                updateRemoteProcess(processId, `漫画任务 #${job.shortId} · 演绎 AI`, `完整剧情演绎 · 总页数 ${execution.interpretivePageRange.min}-${execution.interpretivePageRange.max}`);
                const interpretive = await runInterpretiveStoryboard(job.selection.text, execution, signal, (_stage, payload) => {
                    const segments = payload.adaptation.segments; const pages = segments.reduce((sum, segment) => sum + Number(segment.page_count), 0);
                    updateRemoteProcess(processId, `漫画任务 #${job.shortId} · 并发分镜 ${segments.length} 段`, `${pages} 页 · 单个分镜 AI 页数 ${execution.storyboardWorkerPageRange.spec}`);
                });
                plan = interpretive.plan;
                storyboardTiming = { elapsedMs: interpretive.wallMs, elapsedText: interpretive.wallTime, adaptation: interpretive.adaptationTiming, segments: interpretive.segmentTimings };
                checkpoint.plan = plan; checkpoint.storyboardTiming = storyboardTiming; checkpoint.stage = 'drawing';
            } else if (!plan) {
                updateRemoteProcess(processId, `漫画任务 #${job.shortId} · 直接分镜 AI`, `范围 ${job.start}-${job.end}，目标楼层 ${job.targetFloor}`);
                const storyboardResult = await callStoryboard(job.selection.text, { conf: execution.storyboardConf, refs: execution.refs, outputLanguage: execution.outputLanguage, preflightNeutralize: execution.preflightNeutralize, withTiming: true, signal });
                ensureNotCanceled(signal); updateRemoteProcess(processId, `漫画任务 #${job.shortId} · 校验分镜 JSON`, '分镜响应已返回，正在解析');
                plan = parseStoryboardPlan(storyboardResult.text, execution.storyboardConf, execution.outputLanguage);
                storyboardTiming = storyboardResult.timing;
                checkpoint.plan = plan; checkpoint.storyboardTiming = storyboardTiming; checkpoint.stage = 'drawing';
            }
            lastStoryboard = JSON.stringify(plan, null, 2); updateDebug();
            await writeLog('result', '分镜 JSON 校验通过', execution.debugEnabled ? { taskId: job.id, summary: storyboardSummary(plan), plan } : { taskId: job.id, result: storyboardSummary(plan) });
            updateRemoteProcess(processId, `漫画任务 #${job.shortId} · 错峰并发绘画 ${plan.pages.length} 页`, `${storyboardSummary(plan)} · 每页启动间隔 ${formatDuration(execution.batchDrawingIntervalMs)} · 分镜 ${storyboardTiming?.elapsedText || '耗时未知'}`);
            const cacheMeta = { batchId: job.id, sourcePlot: job.selection.text, sourceRange: { start: job.start, end: job.end }, targetFloor: job.targetFloor, chatId: job.chatId };
            const drawingBatch = await drawStoryboardPages(plan, cacheMeta, execution);
            checkpoint.stage = 'persist';
            ensureNotCanceled(signal);
            lastImage = drawingBatch.results.map(result => result.image); updateDebug();
            const drawingTiming = { wallMs: drawingBatch.wallMs, wallTime: drawingBatch.wallTime, pages: drawingBatch.results.map(result => ({ page: result.page, elapsedMs: result.timing?.elapsedMs, elapsedText: result.timing?.elapsedText })) };
            updateRemoteProcess(processId, `漫画任务 #${job.shortId} · 保存并写回正文`, `绘画墙钟 ${drawingBatch.wallTime}，正在保存 ${lastImage.length} 页`);
            let ctx = requireProductionContext(job);
            const saveController = new AbortController();
            if (signal.aborted) saveController.abort(signal.reason); else signal.addEventListener('abort', () => saveController.abort(signal.reason), { once: true });
            const saved = await Promise.all(drawingBatch.results.map(async result => {
                const retainedUrl = checkpoint.savedUrls.get(Number(result.page)); if (retainedUrl) return retainedUrl;
                try {
                    const url = await persistImage(result.image, ctx, result.page, { storage: execution.storage, signal: saveController.signal });
                    checkpoint.savedUrls.set(Number(result.page), url); return url;
                }
                catch (error) { if (!saveController.signal.aborted) saveController.abort(error); throw error; }
            }));
            ensureNotCanceled(signal); ctx = requireProductionContext(job);
            const imageItems = drawingBatch.results.map((result, index) => ({ url: saved[index], cacheId: result.cacheId, page: result.page }));
            await insertPagesIntoFloor(ctx, job.targetFloor, imageItems, execution.insert);
            await writeLog('result', '漫画生成完成', execution.debugEnabled ? { taskId: job.id, targetFloor: job.targetFloor, storyboard: plan, saved, cacheIds: drawingBatch.results.map(result => result.cacheId), timing: { storyboard: storyboardTiming, drawing: drawingTiming } } : { taskId: job.id, result: `已插入第 ${job.targetFloor} 层，共 ${saved.length} 页`, storyboardTime: storyboardTiming?.elapsedText, drawingWallTime: drawingBatch.wallTime, pageTimes: drawingTiming.pages });
            finishRemoteProcess(processId, 'success', `已插入第 ${job.targetFloor} 层 · ${saved.length} 页 · 绘画墙钟 ${drawingBatch.wallTime}`);
            workflowCheckpoints.delete(job.id);
            setStatus(`任务 #${job.shortId} 完成：已向第 ${job.targetFloor} 层插入 ${saved.length} 页。`, 'ok'); notify(`任务 #${job.shortId}：漫画 ${saved.length} 页已插入第 ${job.targetFloor} 层`, 'success');
        } catch (error) {
            const canceled = isCanceledError(error) || signal.aborted;
            if (canceled) {
                finishRemoteProcess(processId, 'canceled', '用户取消；未继续写回正文');
                workflowCheckpoints.delete(job.id);
            } else {
                checkpoint.lastError = error?.message || String(error);
                pauseRemoteProcess(processId, `${checkpoint.lastError}；已成功的演绎、分镜、图片和上传结果均保留。请选择重试失败阶段或抛弃总任务。`, () => runProductionJob(job, checkpoint), () => workflowCheckpoints.delete(job.id));
            }
            await writeLog(canceled ? 'operation' : 'error', canceled ? '漫画生成已取消' : '漫画生成失败', execution.debugEnabled ? { taskId: job.id, error: error?.stack || String(error) } : { taskId: job.id, result: canceled ? '用户取消' : error?.message || String(error) });
            if (!canceled) { console.error('[漫画工房]', error); setStatus(`任务 #${job.shortId} 已暂停：${error?.message || String(error)}`, 'error'); notify(`任务 #${job.shortId} 已暂停，可在后台进程重试`, 'error'); }
            else { setStatus(`任务 #${job.shortId} 已由用户取消。`); notify(`任务 #${job.shortId} 已取消`, 'info'); }
        }
    }
    async function run() {
        if (Date.now() < runCooldownUntil) return;
        try {
            syncSettingsFromUi();
            startRunCooldown();
            const ctx = context(); const execution = productionExecutionSnapshot();
            if (execution.workflowMode === 'interpretive') assertInterpretivePageAllocation(execution.interpretivePageRange, execution.storyboardWorkerPageRange);
            const { start, end } = parseRange(execution.range, ctx.chat.length); let selection = collectPlot(ctx, start, end, execution);
            if (!selection.floors.length) throw new Error('所选范围内没有非 User 的剧情楼');
            if (!selection.text.trim()) throw new Error('剔除 User 楼并执行正则后的剧情为空');
            selection = await appendMvuAfterRegex(selection, ctx, execution);
            await requireLocalProxyReady(execution.drawingConf);
            const id = newId(); const job = Object.freeze({ id, shortId: id.slice(0, 8), chatId: currentChatId(ctx), targetFloor: selection.floors.at(-1), start, end, selection: clone(selection), execution });
            void runProductionJob(job);
            setStatus(`任务 #${job.shortId} 已进入后台。${settings.interaction.runSubmitCooldown !== false ? '5 秒后' : '现在'}可继续提交其他任务。`, 'ok'); notify(`漫画任务 #${job.shortId} 已加入后台`, 'success');
        } catch (error) {
            await writeLog('error', '漫画任务提交失败', { result: error?.message || String(error) }); setStatus(`无法提交：${error?.message || String(error)}`, 'error'); notify(error?.message || String(error), 'error');
        }
    }
    function messageAlreadyHasImage(msg, messageElement = null) {
        const source = String(msg?.mes || '');
        const marker = String(settings.insert?.marker || '').trim();
        return Boolean(
            (marker && source.includes(marker))
            || /<!--\s*comic-orb(?::image|-pages)?\b/i.test(source)
            || /#comic-orb-cache=/i.test(source)
            || /!\[[^\]]*\]\([^)]+\)/i.test(source)
            || /<img\b[^>]*\bsrc\s*=/i.test(source)
            || messageElement?.querySelector?.('.mes_text img')
        );
    }
    async function startImmediateFloorJob(floor, messageElement = null) {
        try {
            if (Date.now() < runCooldownUntil) {
                notify(`请等待 ${Math.max(1, Math.ceil((runCooldownUntil - Date.now()) / 1000))} 秒后再次提交`, 'info');
                return;
            }
            syncSettingsFromUi();
            if (!settings.interaction.doubleClickImmediate) return;
            const ctx = context(); const msg = ctx.chat[floor];
            if (!msg) throw new Error(`第 ${floor} 层不存在或已被删除`);
            if (msg.is_user === true) return;
            if (messageAlreadyHasImage(msg, messageElement)) return;
            const execution = { ...productionExecutionSnapshot(), workflowMode: 'direct' };
            let selection = collectPlot(ctx, floor, floor, execution);
            if (!selection.floors.length) throw new Error('该楼层不是可用的非 User 剧情楼');
            if (!selection.text.trim()) throw new Error('该楼层执行正则后的剧情为空');
            selection = await appendMvuAfterRegex(selection, ctx, execution);
            startRunCooldown();
            await requireLocalProxyReady(execution.drawingConf);
            const id = newId();
            const job = Object.freeze({ id, shortId: id.slice(0, 8), chatId: currentChatId(ctx), targetFloor: floor, start: floor, end: floor, selection: clone(selection), execution });
            await writeLog('operation', '双击楼层立即提交直接分镜任务', execution.debugEnabled
                ? { taskId: job.id, floor, processedPlot: selection.text, profiles: { storyboard: execution.storyboardProfile, drawing: execution.drawingProfile } }
                : { taskId: job.id, floor, result: '已建立不可变任务快照并进入后台' });
            void runProductionJob(job);
            setStatus(`快捷任务 #${job.shortId} 已进入后台：直接分镜第 ${floor} 层。`, 'ok');
            notify(`第 ${floor} 层快捷漫画任务 #${job.shortId} 已加入后台`, 'success');
        } catch (error) {
            await writeLog('error', '双击楼层立即工作失败', { floor, result: error?.message || String(error) });
            setStatus(`快捷任务无法提交：${error?.message || String(error)}`, 'error');
            notify(error?.message || String(error), 'error');
        }
    }

    const root = document.createElement('div'); root.id = ROOT_ID;
    root.innerHTML = `
      <button class="co-fab" id="co-fab" title="漫画工房"><span class="co-fab-icon">✎</span><span class="co-fab-time"></span><span class="co-fab-jobs"></span></button>
      <section class="co-panel" id="co-panel">
        <header class="co-head" id="co-head"><strong>漫画工房</strong><small>剧情 → 分镜 AI → 绘画 AI → 写回楼层</small><button class="co-icon" id="co-close" title="关闭">×</button></header>
        <nav class="co-tabs"><button class="co-tab active" data-page="make">制作</button><button class="co-tab" data-page="processes">后台进程 <span class="co-process-badge" id="co-process-badge" hidden>0</span></button><button class="co-tab" data-page="refs">参考图</button><button class="co-tab" data-page="adaptation">演绎 API</button><button class="co-tab" data-page="story">分镜 API</button><button class="co-tab" data-page="draw">绘画 API</button><button class="co-tab" data-page="settings">设置</button><button class="co-tab" data-page="cache">缓存</button><button class="co-tab" data-page="debug">日志 / 结果</button></nav>
        <main class="co-body">
          <div class="co-page active" data-page="make"><div class="co-proxy-health co-proxy-checking" id="co-proxy-health"><strong>本地后端 / 会话</strong><span id="co-proxy-health-text">正在检测后端路由或 Gemini 会话…</span><button class="co-mini" id="co-proxy-recheck" type="button">重新检测</button></div><div class="co-grid">
            <label class="co-field"><span>楼层范围（闭区间）</span><input id="co-range" placeholder="例如 10-12" value="${esc(settings.range)}"></label>
            <label class="co-field"><span>分镜工作流模式</span><select id="co-workflow-mode"><option value="direct" ${settings.workflowMode !== 'interpretive' ? 'selected' : ''}>直接分镜模式</option><option value="interpretive" ${settings.workflowMode === 'interpretive' ? 'selected' : ''}>演绎分镜模式</option></select></label>
            <label class="co-field"><span>演绎模式总页数最少</span><input id="co-interpretive-min-pages" type="number" min="1" max="20" value="${esc(settings.interpretivePageRange?.min ?? 2)}"></label>
            <label class="co-field"><span>演绎模式总页数最多</span><input id="co-interpretive-max-pages" type="number" min="1" max="20" value="${esc(settings.interpretivePageRange?.max ?? 8)}"></label>
            <label class="co-field"><span>单个分镜 AI 负责页数</span><input id="co-storyboard-worker-pages" value="${esc(settings.storyboardWorkerPages || '1-3')}" placeholder="固定值如 2，或范围如 1-3"></label>
            <label class="co-field"><span>漫画对白与可见文字语言</span><input id="co-output-language" list="co-output-language-options" value="${esc(String(settings.outputLanguage || 'auto'))}" placeholder="例如 auto、zh-CN、ja-JP、en-US"><datalist id="co-output-language-options"><option value="auto">跟随浏览器语言</option><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="zh-HK">繁體中文（香港）</option><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="ja-JP">日本語</option><option value="ko-KR">한국어</option><option value="fr-FR">français</option><option value="de-DE">Deutsch</option><option value="es-ES">español</option></datalist></label>
            <label class="co-field"><span>图片替代文字</span><input id="co-alt" value="${esc(settings.insert.alt)}"></label>
            <label class="co-check co-full"><input id="co-names" type="checkbox" ${settings.includeNames ? 'checked' : ''}>发送剧情时保留角色名和楼层号</label>
            <div class="co-full"><div class="co-inline co-list-head"><span class="co-label">剧情正则规则（按列表顺序执行）</span><div class="co-list-actions"><button class="co-mini" id="co-tag-preset" type="button">标签清理预设</button><button class="co-mini" id="co-import-regex" type="button">导入 JSON</button><input id="co-import-regex-file" type="file" accept="application/json,.json" hidden><button class="co-mini" id="co-export-regex" type="button">导出 JSON</button><button class="co-mini" id="co-test-regex" type="button">测试正则</button><button class="co-mini" id="co-add-regex" type="button">＋ 新增规则</button></div></div><div id="co-regex-list"></div><label class="co-field co-regex-preview-wrap" id="co-regex-preview-wrap"><span>最终发送文本预览（剧情正则 → MVU → 可选前置清洗；未发送、未写回）</span><textarea class="co-regex-preview" id="co-regex-preview" readonly></textarea></label></div>
            <div class="co-callout co-full">直接分镜模式沿用原流程：剧情→分镜→绘画。演绎分镜模式为：剧情演绎→按故事段并发分镜→错峰并发绘画；用户决定1-20页内的总页数范围，并可用单独数字（如<code>2</code>）固定每个分镜AI的页数，或用范围（如<code>1-3</code>）让演绎AI按剧情密度分配。提交前会检查两种页数设置能否组合。演绎只提炼剧情、因果、对白意图与高潮，不处理具体画面。绘画页按设置的启动间隔依次发起，设为0可同时发起。范围包含首尾且自动剔除User楼；每次提交都会冻结模式、页数、语言、剧情、正则、API、参考图、绘画间隔和写回目标。也可以直接双击没有图片的非User对话楼层，立即以该层剧情启动一个新的直接分镜后台任务。</div>
          </div><button class="co-run" id="co-run">生成并发分页漫画并插入末层</button><div class="co-status" id="co-status">等待开始。直接模式需配置分镜与绘画 API；演绎模式还需配置独立演绎 API。</div></div>
          <div class="co-page" data-page="processes"><div class="co-process-toolbar"><div><strong>后台远端进程</strong><small id="co-process-summary">0 个运行中 · 0 个等待处理 · 0 个已结束</small></div><button class="co-mini" id="co-clear-processes" type="button">清除已结束</button></div><div class="co-callout">这里统一显示整套漫画工作流、演绎、分镜、绘画、模型列表、API 测试、远程图片下载和酒馆图片上传。总工作流任一子任务失败时会立即暂停并保留成功检查点；“重试失败阶段”只补失败或未完成项，“抛弃总任务”才释放检查点，已经持久化的本地图片仍不会删除。运行中的Cancel会立即中止并结束该任务。</div><div class="co-process-list" id="co-process-list"><div class="co-callout">暂无后台远端任务。</div></div></div>
          <div class="co-page" data-page="refs"><div class="co-callout">参考图以命名预设管理，每套最多四张图及对应提示词。参考图只发送给启用了参考图的绘画 AI，不发送给演绎或分镜 AI；图片和预设均保存在当前浏览器 IndexedDB。</div><div class="co-profile-manager co-ref-preset-manager"><div class="co-profile-top"><label class="co-field"><span>参考图预设</span><select id="co-ref-preset"></select></label><label class="co-field"><span>预设名称</span><input id="co-ref-preset-name" placeholder="例如：主角常服"></label></div><div class="co-profile-actions"><button class="co-mini" id="co-ref-preset-new" type="button">新建</button><button class="co-mini co-test" id="co-ref-preset-save" type="button">保存修改</button><button class="co-mini co-danger" id="co-ref-preset-delete" type="button">删除</button><button class="co-mini" id="co-import-refs" type="button">导入预设库</button><input id="co-import-refs-file" type="file" accept="application/json,.json" hidden><button class="co-mini" id="co-export-refs" type="button">导出预设库</button></div><div class="co-ref-preset-state" id="co-ref-preset-state">正在读取预设…</div></div><div id="co-refs"></div></div>
          <div class="co-page" data-page="adaptation">${apiProfileManager('ad', 'adaptation')}<div class="co-grid">
            ${apiFields('ad', settings.adaptation)}
            <label class="co-field"><span>Temperature</span><input id="ad-temperature" type="number" min="0" max="2" step="0.1" value="${esc(settings.adaptation.temperature)}"></label>
            <label class="co-field"><span>最大输出 Token</span><input id="ad-max-output-tokens" type="number" min="0" max="1048576" step="1" value="${esc(settings.adaptation.maxOutputTokens ?? 65536)}"></label>
            <label class="co-field"><span>输出上限参数名</span><select id="ad-max-output-token-field"><option value="auto" ${settings.adaptation.maxOutputTokenField === 'auto' || !settings.adaptation.maxOutputTokenField ? 'selected' : ''}>自动选择</option><option value="max_tokens" ${settings.adaptation.maxOutputTokenField === 'max_tokens' ? 'selected' : ''}>max_tokens</option><option value="max_completion_tokens" ${settings.adaptation.maxOutputTokenField === 'max_completion_tokens' ? 'selected' : ''}>max_completion_tokens</option></select></label>
            <label class="co-field"><span>推理力度</span><select id="ad-reasoning-effort"><option value="off" ${settings.adaptation.reasoningEffort === 'off' ? 'selected' : ''}>不发送（服务默认）</option><option value="low" ${settings.adaptation.reasoningEffort === 'low' || !settings.adaptation.reasoningEffort ? 'selected' : ''}>低（推荐）</option><option value="medium" ${settings.adaptation.reasoningEffort === 'medium' ? 'selected' : ''}>中</option><option value="high" ${settings.adaptation.reasoningEffort === 'high' ? 'selected' : ''}>高</option></select></label>
            <label class="co-field"><span>深度思考开关</span><select id="ad-thinking-mode"><option value="default" ${settings.adaptation.thinkingMode === 'default' || !settings.adaptation.thinkingMode ? 'selected' : ''}>不发送（服务默认）</option><option value="disabled" ${settings.adaptation.thinkingMode === 'disabled' ? 'selected' : ''}>关闭深度思考（最快）</option><option value="enabled" ${settings.adaptation.thinkingMode === 'enabled' ? 'selected' : ''}>启用深度思考</option><option value="auto" ${settings.adaptation.thinkingMode === 'auto' ? 'selected' : ''}>模型自动判断</option></select></label>
            <div class="co-callout co-full">演绎 API 现在完全独立于分镜 API：连接、Key、模型、输出上限、推理力度、额外请求头/请求体、测试和提示词预设均单独保存。它只在演绎分镜模式第一阶段调用；直接分镜模式不会调用它。</div>
            <div class="co-full">${promptPresetManager('ad', 'adaptation')}<label class="co-field"><span>演绎系统提示词</span><textarea id="ad-system">${esc(settings.adaptation.systemPrompt || DEFAULT_ADAPTATION_SYSTEM_PROMPT)}</textarea></label></div>
            <div class="co-callout co-full">演绎提示词只管理剧情提炼、人物动机、因果、对白意图、故事分段、每段页数分配和至多一个高潮特写意图；不要描述镜头、构图、分格、光影、配色或绘画细节。</div>
            <label class="co-field co-full"><span>额外请求体 JSON（可覆盖默认字段）</span><textarea id="ad-extra">${esc(settings.adaptation.extraBody)}</textarea></label>
            <label class="co-field co-full"><span>API 测试剧情（只在点击测试时使用）</span><textarea id="ad-test-prompt">${esc(settings.adaptation.testPrompt || DEFAULT_ADAPTATION_TEST_PROMPT)}</textarea></label>
            <div class="co-full co-api-actions"><button class="co-mini co-test" id="ad-test" type="button">测试并校验演绎 JSON</button><span class="co-api-status" id="ad-api-status">尚未测试</span></div>
          </div></div>
          <div class="co-page" data-page="story">${apiProfileManager('sb', 'storyboard')}<div class="co-grid">
            ${apiFields('sb', settings.storyboard)}
            <label class="co-field"><span>Temperature</span><input id="sb-temperature" type="number" min="0" max="2" step="0.1" value="${esc(settings.storyboard.temperature)}"></label>
            <label class="co-field"><span>最大输出 Token</span><input id="sb-max-output-tokens" type="number" min="0" max="1048576" step="1" value="${esc(settings.storyboard.maxOutputTokens ?? 65536)}" placeholder="65536"></label>
            <label class="co-field"><span>输出上限参数名</span><select id="sb-max-output-token-field"><option value="auto" ${settings.storyboard.maxOutputTokenField === 'auto' || !settings.storyboard.maxOutputTokenField ? 'selected' : ''}>自动选择</option><option value="max_tokens" ${settings.storyboard.maxOutputTokenField === 'max_tokens' ? 'selected' : ''}>max_tokens</option><option value="max_completion_tokens" ${settings.storyboard.maxOutputTokenField === 'max_completion_tokens' ? 'selected' : ''}>max_completion_tokens</option></select></label>
            <label class="co-field"><span>推理力度</span><select id="sb-reasoning-effort"><option value="off" ${settings.storyboard.reasoningEffort === 'off' ? 'selected' : ''}>不发送（服务默认）</option><option value="low" ${settings.storyboard.reasoningEffort === 'low' || !settings.storyboard.reasoningEffort ? 'selected' : ''}>低（漫画分镜推荐）</option><option value="medium" ${settings.storyboard.reasoningEffort === 'medium' ? 'selected' : ''}>中</option><option value="high" ${settings.storyboard.reasoningEffort === 'high' ? 'selected' : ''}>高</option></select></label>
            <label class="co-field"><span>深度思考开关</span><select id="sb-thinking-mode"><option value="default" ${settings.storyboard.thinkingMode === 'default' || !settings.storyboard.thinkingMode ? 'selected' : ''}>不发送（服务默认）</option><option value="disabled" ${settings.storyboard.thinkingMode === 'disabled' ? 'selected' : ''}>关闭深度思考（最快）</option><option value="enabled" ${settings.storyboard.thinkingMode === 'enabled' ? 'selected' : ''}>启用深度思考</option><option value="auto" ${settings.storyboard.thinkingMode === 'auto' ? 'selected' : ''}>模型自动判断</option></select></label>
            <div class="co-callout co-full">“推理力度”发送 OpenAI/方舟兼容参数 <code>reasoning_effort</code>；低档会减少 reasoning Token 与耗时。“关闭深度思考”发送 <code>thinking: {"type":"disabled"}</code>，速度最快但只适用于支持该开关的模型。建议先用“低 + 服务默认”；仍出现分钟级长思考时改为“关闭深度思考”。若中转返回未知参数错误，两个选项都改为“不发送”，或在额外请求体中填写供应商专用字段；额外请求体始终优先。</div>
            <div class="co-callout co-full">默认请求最多 65536 个输出 Token；可手动填写 1-1048576，填写 0 则不发送上限参数并使用服务端默认值。“自动选择”会对 OpenAI 推理模型使用 <code>max_completion_tokens</code>，其他兼容模型使用 <code>max_tokens</code>。若“额外请求体 JSON”已包含任一字段，则额外请求体优先。实际可用最大值仍由具体模型和中转限制，超出时服务端会返回参数错误。</div>
            <label class="co-field"><span>默认最少页数</span><input id="sb-min-pages" type="number" min="1" max="20" value="${esc(settings.storyboard.minPages)}"></label>
            <label class="co-field"><span>默认最多页数</span><input id="sb-max-pages" type="number" min="1" max="20" value="${esc(settings.storyboard.maxPages)}"></label>
            <label class="co-field"><span>默认每页最少格数</span><input id="sb-min-panels" type="number" min="1" max="20" value="${esc(settings.storyboard.minPanels)}"></label>
            <label class="co-field"><span>默认每页最多格数</span><input id="sb-max-panels" type="number" min="1" max="20" value="${esc(settings.storyboard.maxPanels)}"></label>
            <div class="co-callout co-full">页数与格数不再硬编码。系统提示词中的明确范围（例如“pages只能有1到5页”“每页panels为1到5格”）会覆盖上面的默认值；最可靠的写法是在提示词单独加入 <code>comic_orb_limits: {"pages":[1,5],"panels":[1,5]}</code>。支持1-20页、每页1-20格。脚本仍会检查连续编号、必填字段、高潮格、page_prompt 和所有跨页 continuity。</div>
            <div class="co-full">${promptPresetManager('sb', 'storyboard')}<label class="co-field"><span>分镜系统提示词</span><textarea id="sb-system">${esc(settings.storyboard.systemPrompt)}</textarea></label></div>
            <label class="co-field co-full"><span>额外请求体 JSON（可覆盖默认字段）</span><textarea id="sb-extra">${esc(settings.storyboard.extraBody)}</textarea></label>
            <label class="co-field co-full"><span>API 测试提示词（只在点击测试时使用）</span><textarea id="sb-test-prompt">${esc(settings.storyboard.testPrompt)}</textarea></label>
            <div class="co-full co-api-actions"><button class="co-mini co-test" id="sb-test" type="button">测试并校验 JSON</button><span class="co-api-status" id="sb-api-status">尚未测试</span></div>
          </div></div>
          <div class="co-page" data-page="draw">${apiProfileManager('dr', 'drawing')}<div class="co-grid">
            ${apiFields('dr', settings.drawing)}
            <label class="co-field"><span>调用模式</span><select id="dr-mode"><option value="images">OpenAI 自动（推荐）</option><option value="edits">强制 Edits multipart</option><option value="chat">Chat 多模态</option><option value="gemini">Gemini 原生 generateContent</option></select></label>
            <label class="co-field"><span>尺寸</span><input id="dr-size" value="${esc(settings.drawing.size)}"></label>
            <label class="co-field"><span>GPT Image 质量</span><select id="dr-quality"><option value="">不发送（服务默认）</option><option value="auto">auto</option><option value="low">low（速度优先）</option><option value="medium">medium</option><option value="high">high</option></select></label>
            <label class="co-field"><span>输出格式</span><select id="dr-output-format"><option value="">不发送（服务默认）</option><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label>
            <label class="co-field"><span>输出压缩 0-100</span><input id="dr-output-compression" type="number" min="0" max="100" step="1" value="${esc(settings.drawing.outputCompression)}" placeholder="留空不发送"></label>
            <label class="co-field"><span>背景</span><select id="dr-background"><option value="">不发送（服务默认）</option><option value="auto">auto</option><option value="opaque">opaque</option><option value="transparent">transparent</option></select></label>
            <label class="co-field"><span>参考图保真度（Edits）</span><select id="dr-input-fidelity"><option value="">不发送（服务默认）</option><option value="low">low（速度/成本优先）</option><option value="high">high（角色一致性优先）</option></select></label>
            <label class="co-check"><input id="dr-local-proxy" type="checkbox" ${settings.drawing.useLocalProxy !== false ? 'checked' : ''}>通过酒馆本地 Node 代理长任务</label>
            <label class="co-field"><span>绘画请求超时（秒）</span><input id="dr-timeout" type="number" min="60" max="1800" step="10" value="${esc(settings.drawing.requestTimeoutSeconds)}"></label>
            <div class="co-full co-api-actions"><button class="co-mini" id="dr-speed-preset" type="button">套用 GPT Image 2 速度优先</button><span class="co-api-status">设置 low 质量、JPEG、80% 压缩、不透明背景和 low 参考图保真度；不会改漫画尺寸。</span></div>
            <label class="co-check co-full"><input id="dr-sendrefs" type="checkbox" ${settings.drawing.sendReferences ? 'checked' : ''}>同时把参考图发送给绘画 AI</label>
            <div class="co-callout co-full">每个 JSON 页面只读取自己的 <code>page_prompt</code>，所有页面并发绘制。OpenAI 自动模式：无参考图调用 <code>/images/generations</code>；有参考图时自动切换 <code>/images/edits</code>。本地 Node 代理默认以600秒持有中转站连接，避免浏览器约300秒断链；启用该功能后需要重启酒馆后端一次。</div>
            <div class="co-full">${promptPresetManager('dr', 'drawing')}<label class="co-field"><span>绘画提示词</span><textarea id="dr-prefix">${esc(settings.drawing.promptPrefix)}</textarea></label></div>
            <label class="co-field co-full"><span>额外请求体 JSON（可覆盖默认字段）</span><textarea id="dr-extra">${esc(settings.drawing.extraBody)}</textarea></label>
            <label class="co-field co-full"><span>API 测试分镜提示词（会按明确分格实际生成图片）</span><textarea id="dr-test-prompt">${esc(settings.drawing.testPrompt)}</textarea></label>
            <div class="co-full co-api-actions"><button class="co-mini co-test" id="dr-test" type="button">发送测试提示词</button><span class="co-api-status" id="dr-api-status">尚未测试</span></div>
          </div></div>
          <div class="co-page" data-page="settings">
            <label class="co-check co-debug-toggle"><input id="co-enable-redraw" type="checkbox" ${settings.interaction.doubleClickRedraw ? 'checked' : ''}>正文漫画图双击打开“重绘 / 实际提示词”详情弹窗</label>
            <label class="co-check co-debug-toggle"><input id="co-enable-immediate-work" type="checkbox" ${settings.interaction.doubleClickImmediate !== false ? 'checked' : ''}>双击无图片的非User对话楼层，立即启动直接分镜后台任务</label>
            <label class="co-check co-debug-toggle"><input id="co-enable-run-cooldown" type="checkbox" ${settings.interaction.runSubmitCooldown !== false ? 'checked' : ''}>启用制作按钮 5 秒防重复点击</label>
            <label class="co-check co-debug-toggle"><input id="co-include-mvu" type="checkbox" ${settings.includeMvuData ? 'checked' : ''}>发送剧情时携带 MVU 数据</label>
            <label class="co-check co-debug-toggle"><input id="co-preflight-neutralize" type="checkbox" ${settings.preflightNeutralize ? 'checked' : ''}>启用 API 发送前中性措辞清洗（默认关闭，仅用于输入外审过严的平台）</label>
            <div class="co-callout">关闭时，演绎与直接分镜 API 会收到剧情正则及 MVU 处理后的原文；开启时，只对本次 API 请求副本中的少量直白评价和写实组织措辞做等义替换，不修改酒馆正文、缓存或检查点。该开关会随后台任务快照冻结。</div>
            <div class="co-callout">MVU 数据永远在剧情正则完成后追加。多楼层优先发送“首个剧情楼完整基线 + 后续剧情楼 JSON Patch 增量”；无法可靠读取历史时只发送末楼当前快照。直接分镜模式只交给分镜 AI 一次；演绎分镜模式只交给演绎 AI 一次，后续并发分镜不会重复收到。</div>
            <label class="co-field"><span>批量绘画每页启动间隔（毫秒，最低 0）</span><input id="co-batch-drawing-interval" type="number" min="0" step="100" value="${esc(normalizeBatchDrawingInterval(settings.batchDrawingIntervalMs))}"><small>Google 未公布 Gemini 网页的固定请求间隔；官方 API 按 RPM / TPM / RPD、图像 IPM 等动态额度管理。建议至少 300ms。</small></label>
            <label class="co-field"><span>酒馆用户数据绝对根目录（用于日志中的图片绝对路径）</span><input id="co-local-image-root" value="${esc(settings.storage.localImageRoot)}" placeholder="C:\\SillyTavern\\SillyTavern\\data\\default-user"></label>
            <div class="co-callout">绘画 API 每次返回的图片都会先完整保存到当前浏览器 IndexedDB，再上传到酒馆。删除缓存不会删除已经上传并插入正文的图片，但该图将无法再从正文发起重绘或查看实际提示词。</div>
          </div>
          <div class="co-page" data-page="cache">
            <div class="co-cache-controls co-grid"><label class="co-field"><span>缓存列表每页数量（5–50）</span><input id="co-cache-preview-limit" type="number" min="5" max="50" step="1" value="${esc(settings.storage.cachePreviewLimit ?? 5)}"></label><label class="co-field"><span>图片缓存上限（MB，64–4096）</span><input id="co-cache-max-mb" type="number" min="64" max="4096" step="16" value="${esc(settings.storage.maxCacheMb ?? 512)}"></label><label class="co-check co-full"><input id="co-cache-auto-cleanup" type="checkbox" ${settings.storage.autoCleanup !== false ? 'checked' : ''}>超过上限或浏览器存储空间紧张时，按完整生成批次自动清理最旧缓存（优先测试图）</label><div class="co-callout co-full">缓存列表可完整翻页，不再只显示前几张。自动清理不会删除酒馆服务器上已经插入正文的 PNG，但被清理的本地页将无法查看原提示词或直接重绘；当前正在生成的整批漫画受到保护。浏览器整体占用接近配额75%时，会使用比手动上限更低的安全值。</div></div>
            <div class="co-cache-head"><span id="co-cache-stats">正在读取本地图片缓存…</span><div class="co-api-actions"><button class="co-mini co-test" id="co-open-reader-latest" type="button">阅读聊天漫画</button><button class="co-mini" id="co-trim-cache" type="button">立即整理</button><button class="co-mini" id="co-refresh-cache" type="button">刷新</button><button class="co-mini co-danger" id="co-clear-cache" type="button">清空全部缓存</button></div></div>
            <div class="co-cache-grid" id="co-cache-grid"></div>
            <nav class="co-cache-pagination" aria-label="缓存分页"><button class="co-mini" id="co-cache-page-prev" type="button">← 上一页</button><span id="co-cache-page-info">第 1 / 1 页</span><button class="co-mini" id="co-cache-page-next" type="button">下一页 →</button></nav>
          </div>
          <div class="co-page" data-page="debug"><label class="co-check co-debug-toggle"><input id="co-debug-enabled" type="checkbox" ${settings.debug.enabled ? 'checked' : ''}>DEBUG 结构化日志（记录所有操作的完整文本与参数）</label><label class="co-check co-debug-toggle"><input id="co-capture-model-io" type="checkbox" ${settings.debug.captureModelIo !== false ? 'checked' : ''}>始终保存大模型完整输入输出（推荐；成功与失败均记录，图片二进制和密钥排除）</label><div class="co-api-actions"><button class="co-mini" id="co-refresh-logs" type="button">刷新摘要</button><button class="co-mini co-test" id="co-export-model-io" type="button">导出大模型输入输出</button><button class="co-mini" id="co-export-logs-all" type="button">导出全部日志</button><button class="co-mini" id="co-export-logs-last10" type="button">导出最近10条</button><button class="co-mini co-danger" id="co-clear-logs" type="button">清空日志</button></div><div class="co-callout">日志页面始终只显示最近200条轻量摘要，不展开大对象。“导出大模型输入输出”会跨越普通操作日志，导出全部演绎、分镜与绘画 API 请求/响应，不受最近10条限制；实际 system/user prompt 和模型文本响应会完整保留，鉴权字段与所有图片 base64 仍会清理为摘要。</div><div class="co-log-list" id="co-log-view"></div><label class="co-field" style="margin-top:12px"><span>最近一次已校验分镜 JSON</span><textarea id="co-last-story" readonly></textarea></label><label class="co-field" style="margin-top:12px"><span>最近一次分页图片摘要</span><textarea id="co-last-image" readonly></textarea></label><div id="co-image-preview"></div></div>
        </main>
      </section>
      <dialog class="co-dialog" id="co-redraw-dialog"><form method="dialog"><header><strong>漫画页详情</strong><button class="co-icon" value="cancel" title="关闭">×</button></header><nav class="co-dialog-tabs"><button class="active" data-dialog-page="redraw" type="button">重绘</button><button data-dialog-page="prompt" type="button">实际提示词</button></nav><section class="co-dialog-page active" data-dialog-page="redraw"><img id="co-redraw-preview" alt="待重绘漫画页"><p id="co-redraw-info"></p><label class="co-check co-dialog-choice"><input id="co-redraw-storyboard" type="checkbox">重新调用分镜 API，再按新 JSON 重绘全部页面</label><div class="co-callout">确认时会冻结当前 API 实例、参数、参考图、插入和存储设置，随后转入后台异步执行。不同页可同时重绘；同一页或同一楼层的重新分镜任务会防止重复启动。</div><div class="co-dialog-actions"><button class="co-mini" value="cancel">取消</button><button class="co-mini co-test" id="co-redraw-confirm" type="button">加入后台进程</button></div><div class="co-status" id="co-redraw-status"></div></section><section class="co-dialog-page" data-dialog-page="prompt"><textarea id="co-actual-prompt" readonly></textarea><div class="co-dialog-actions"><button class="co-mini" value="cancel">关闭</button><button class="co-mini" id="co-copy-prompt" type="button">复制文本</button></div></section></form></dialog>
      <dialog class="co-dialog co-cache-preview-dialog" id="co-cache-preview-dialog"><form method="dialog"><header><strong id="co-cache-preview-title">漫画阅读模式</strong><label class="co-reader-chat"><span>对话记录</span><select id="co-reader-chat-select"></select></label><span class="co-reader-counter" id="co-reader-counter"></span><button class="co-icon" value="cancel" title="关闭">×</button></header><div class="co-reader-stage" id="co-reader-stage"><button class="co-reader-nav" id="co-reader-prev" type="button" aria-label="上一页">‹</button><img id="co-cache-preview-image" alt="缓存漫画当前页"><button class="co-reader-nav" id="co-reader-next" type="button" aria-label="下一页">›</button></div><div class="co-reader-meta" id="co-reader-meta"></div><div class="co-dialog-actions"><button class="co-mini" id="co-reader-prompt" type="button">查看本页提示词</button><button class="co-mini" value="cancel">关闭</button></div></form></dialog>`;
    document.body.appendChild(root);
    const reasoningField = document.createElement('label');
    reasoningField.className = 'co-field';
    reasoningField.style.marginTop = '12px';
    reasoningField.innerHTML = '<span>最近一次分镜 / 演绎 API 公开的思维链</span><textarea id="co-last-reasoning" readonly></textarea>';
    root.querySelector('#co-last-story')?.closest('label')?.insertAdjacentElement('beforebegin', reasoningField);

    function apiFields(prefix, conf) {
        return `<label class="co-field co-full"><span>API Base URL</span><input id="${prefix}-base" value="${esc(conf.baseUrl)}" placeholder="https://api.openai.com"></label>
          <label class="co-field"><span>接口路径</span><input id="${prefix}-path" value="${esc(conf.path)}"></label>
          <label class="co-field"><span>模型（输入可过滤，仍可手填）</span><div class="co-model-row"><div class="co-model-combo"><input id="${prefix}-model" autocomplete="off" value="${esc(conf.model)}"><div class="co-model-options" id="${prefix}-model-options"></div></div><button class="co-mini co-model-fetch" id="${prefix}-fetch-models" type="button">获取模型</button></div></label>
          <label class="co-field co-full"><span>模型列表路径</span><input id="${prefix}-models-path" value="${esc(conf.modelsPath || '/v1/models')}"></label>
          <label class="co-field co-full"><span>API Key（仅存浏览器 localStorage）</span><input class="co-secret" id="${prefix}-key" type="password" autocomplete="off" value="${esc(conf.apiKey)}"></label>
          <label class="co-field co-full"><span>额外请求头 JSON</span><textarea id="${prefix}-headers">${esc(conf.extraHeaders)}</textarea></label>`;
    }
    function apiProfileManager(prefix, kind) {
        const profiles = settings.apiProfiles[kind]; const active = profiles.find(profile => profile.id === settings.activeApiProfile[kind]) || profiles[0];
        return `<div class="co-profile-manager"><div class="co-profile-top"><label class="co-field"><span>已保存 API 实例</span><select id="${prefix}-profile">${profiles.map(profile => `<option value="${esc(profile.id)}" ${profile.id === active.id ? 'selected' : ''}>${esc(profile.name)}</option>`).join('')}</select></label><label class="co-field"><span>实例名称</span><input id="${prefix}-profile-name" value="${esc(active.name)}"></label></div><div class="co-profile-actions"><button class="co-mini" id="${prefix}-profile-new" type="button">新建</button><button class="co-mini co-test" id="${prefix}-profile-save" type="button">保存实例</button><button class="co-mini co-danger" id="${prefix}-profile-delete" type="button">删除</button><button class="co-mini" id="${prefix}-profile-import" type="button">导入实例集</button><input id="${prefix}-profile-file" type="file" accept="application/json,.json" hidden><button class="co-mini" id="${prefix}-profile-export" type="button">导出实例集</button></div></div>`;
    }
    function promptPresetManager(prefix, kind) {
        const presets = settings.promptPresets[kind]; const field = promptField(kind); const current = String(settings[kind][field] || ''); const matched = presets.find(preset => preset.content === current);
        return `<div class="co-prompt-manager"><div class="co-prompt-top"><label class="co-field"><span>${apiKindLabel(kind)}提示词预设</span><select id="${prefix}-prompt-preset"><option value="">自定义 / 当前内容</option>${presets.map(preset => `<option value="${esc(preset.id)}" ${preset.id === matched?.id ? 'selected' : ''}>${esc(preset.name)}</option>`).join('')}</select></label><label class="co-field"><span>预设名称</span><input id="${prefix}-prompt-preset-name" value="${esc(matched?.name || '')}" placeholder="选择预设或新建"></label></div><div class="co-prompt-actions"><button class="co-mini" id="${prefix}-prompt-new" type="button">新建预设</button><button class="co-mini co-test" id="${prefix}-prompt-save" type="button">保存修改</button><button class="co-mini co-danger" id="${prefix}-prompt-delete" type="button">删除预设</button></div></div>`;
    }
    function activeApiProfile(kind) { return settings.apiProfiles[kind].find(profile => profile.id === settings.activeApiProfile[kind]); }
    function renderPromptPresetManager(kind) {
        const prefix = apiKindPrefix(kind); const presets = settings.promptPresets[kind]; const field = promptField(kind); const current = val(kind === 'drawing' ? 'dr-prefix' : `${prefix}-system`); const matched = presets.find(preset => preset.content === current);
        const select = root.querySelector(`#${prefix}-prompt-preset`); select.innerHTML = `<option value="">自定义 / 当前内容</option>${presets.map(preset => `<option value="${esc(preset.id)}">${esc(preset.name)}</option>`).join('')}`;
        select.value = matched?.id || ''; settings.activePromptPreset[kind] = matched?.id || ''; root.querySelector(`#${prefix}-prompt-preset-name`).value = matched?.name || '';
    }
    function applyPromptPreset(kind, id) {
        const prefix = apiKindPrefix(kind); const preset = settings.promptPresets[kind].find(item => item.id === id);
        settings.activePromptPreset[kind] = preset?.id || ''; root.querySelector(`#${prefix}-prompt-preset-name`).value = preset?.name || '';
        if (!preset) { save(); return; }
        const textarea = root.querySelector(kind === 'drawing' ? '#dr-prefix' : `#${prefix}-system`); textarea.value = preset.content; settings[kind][promptField(kind)] = preset.content; save(); textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function createPromptPreset(kind) {
        syncSettingsFromUi(); const prefix = apiKindPrefix(kind); const textareaId = kind === 'drawing' ? 'dr-prefix' : `${prefix}-system`; const content = val(textareaId); if (!content.trim()) { notify('提示词内容为空，无法创建预设', 'error'); return; }
        const suggested = `${apiKindLabel(kind)}预设 ${settings.promptPresets[kind].length + 1}`; const name = prompt('请输入提示词预设名称', suggested); if (name === null) return;
        const preset = { id: newId(), name: name.trim() || suggested, content }; settings.promptPresets[kind].push(preset); settings.activePromptPreset[kind] = preset.id; save(); renderPromptPresetManager(kind); root.querySelector(`#${prefix}-prompt-preset`).value = preset.id; root.querySelector(`#${prefix}-prompt-preset-name`).value = preset.name; notify(`已新建提示词预设：${preset.name}`, 'success');
    }
    function savePromptPreset(kind) {
        syncSettingsFromUi(); const prefix = apiKindPrefix(kind); const id = val(`${prefix}-prompt-preset`); const preset = settings.promptPresets[kind].find(item => item.id === id);
        if (!preset) { createPromptPreset(kind); return; }
        const content = val(kind === 'drawing' ? 'dr-prefix' : `${prefix}-system`); if (!content.trim()) { notify('提示词内容为空，无法保存', 'error'); return; }
        preset.name = val(`${prefix}-prompt-preset-name`).trim() || preset.name; preset.content = content; settings.activePromptPreset[kind] = preset.id; save(); renderPromptPresetManager(kind); notify(`已保存提示词预设：${preset.name}`, 'success');
    }
    function deletePromptPreset(kind) {
        const prefix = apiKindPrefix(kind); const id = val(`${prefix}-prompt-preset`); const preset = settings.promptPresets[kind].find(item => item.id === id);
        if (!preset) { notify('当前是自定义内容，没有可删除的预设', 'info'); return; }
        if (!confirm(`确定删除提示词预设“${preset.name}”？`)) return;
        settings.promptPresets[kind] = settings.promptPresets[kind].filter(item => item.id !== id); settings.activePromptPreset[kind] = ''; save(); renderPromptPresetManager(kind); notify('提示词预设已删除；当前文本内容仍保留', 'success');
    }
    function renderModelOptions(prefix, query = '') {
        const box = root.querySelector(`#${prefix}-model-options`); if (!box) return;
        const needle = String(query).trim().toLocaleLowerCase(); const matches = modelCandidates[prefix].filter(id => id.toLocaleLowerCase().includes(needle));
        box.innerHTML = matches.length ? matches.map(id => `<button type="button" class="co-model-option" data-model="${esc(id)}">${esc(id)}</button>`).join('') : '<div class="co-model-empty">没有匹配的候选模型，可继续手动输入</div>';
        box.classList.toggle('open', modelCandidates[prefix].length > 0);
        box.querySelectorAll('.co-model-option').forEach(button => button.addEventListener('pointerdown', event => {
            event.preventDefault(); const input = root.querySelector(`#${prefix}-model`); input.value = button.dataset.model; box.classList.remove('open'); input.dispatchEvent(new Event('change', { bubbles: true }));
        }));
        box.querySelectorAll('.co-model-option').forEach((button, index, buttons) => button.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); buttons[Math.min(index + 1, buttons.length - 1)].focus(); }
            if (event.key === 'ArrowUp') { event.preventDefault(); index ? buttons[index - 1].focus() : root.querySelector(`#${prefix}-model`).focus(); }
            if (event.key === 'Escape') { box.classList.remove('open'); root.querySelector(`#${prefix}-model`).focus(); }
            if (event.key === 'Enter') { event.preventDefault(); button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }
        }));
    }
    function closeModelOptions(exceptPrefix = '') { for (const prefix of ['ad', 'sb', 'dr']) if (prefix !== exceptPrefix) root.querySelector(`#${prefix}-model-options`)?.classList.remove('open'); }
    function renderApiProfileManager(kind) {
        const prefix = apiKindPrefix(kind); const select = root.querySelector(`#${prefix}-profile`); const profiles = settings.apiProfiles[kind];
        select.innerHTML = profiles.map(profile => `<option value="${esc(profile.id)}">${esc(profile.name)}</option>`).join(''); select.value = settings.activeApiProfile[kind];
        root.querySelector(`#${prefix}-profile-name`).value = activeApiProfile(kind)?.name || '';
    }
    function fillApiUi(kind) {
        const prefix = apiKindPrefix(kind); const conf = settings[kind]; const set = (suffix, value) => { const el = root.querySelector(`#${prefix}-${suffix}`); if (el) el.value = value ?? ''; };
        set('base', conf.baseUrl); set('path', conf.path); set('models-path', conf.modelsPath); set('key', conf.apiKey); set('model', conf.model); set('headers', conf.extraHeaders); set('extra', conf.extraBody);
        set('test-prompt', conf.testPrompt); modelCandidates[prefix] = []; root.querySelector(`#${prefix}-model-options`)?.classList.remove('open');
        if (kind !== 'drawing') {
            set('temperature', conf.temperature); set('max-output-tokens', conf.maxOutputTokens ?? 65536); set('max-output-token-field', conf.maxOutputTokenField || 'auto'); set('reasoning-effort', conf.reasoningEffort || 'low'); set('thinking-mode', conf.thinkingMode || 'default'); set('system', conf.systemPrompt);
            if (kind === 'storyboard') { set('min-pages', conf.minPages); set('max-pages', conf.maxPages); set('min-panels', conf.minPanels); set('max-panels', conf.maxPanels); }
        }
        else {
            set('mode', conf.mode); set('size', conf.size); set('quality', conf.quality); set('output-format', conf.outputFormat);
            set('output-compression', conf.outputCompression); set('background', conf.background); set('input-fidelity', conf.inputFidelity);
            set('timeout', conf.requestTimeoutSeconds || 600); set('prefix', conf.promptPrefix);
            root.querySelector('#dr-sendrefs').checked = Boolean(conf.sendReferences); root.querySelector('#dr-local-proxy').checked = conf.useLocalProxy !== false;
        }
        renderApiProfileManager(kind); renderPromptPresetManager(kind);
    }
    function switchApiProfile(kind, id) {
        const profile = settings.apiProfiles[kind].find(item => item.id === id); if (!profile) return;
        settings.activeApiProfile[kind] = id; settings[kind] = merge(defaults[kind], profile.config); save(); fillApiUi(kind);
        if (kind === 'drawing' && isLocalGeminiWebConfig(settings.drawing)) void fetchModels('drawing');
    }
    function saveApiProfile(kind) {
        syncSettingsFromUi(); const prefix = apiKindPrefix(kind); const profile = activeApiProfile(kind); if (!profile) return;
        profile.name = val(`${prefix}-profile-name`).trim() || `未命名${apiKindLabel(kind)} API`; profile.config = clone(settings[kind]); save(); renderApiProfileManager(kind); notify(`已保存：${profile.name}`, 'success');
    }
    function createApiProfile(kind) {
        syncSettingsFromUi(); const suggested = `${apiKindLabel(kind)} API ${settings.apiProfiles[kind].length + 1}`; const name = prompt('请输入新实例名称', suggested); if (name === null) return;
        const profile = { id: newId(), name: name.trim() || suggested, config: clone(settings[kind]) }; settings.apiProfiles[kind].push(profile); settings.activeApiProfile[kind] = profile.id; save(); fillApiUi(kind); notify(`已新建：${profile.name}`, 'success');
    }
    function deleteApiProfile(kind) {
        const profile = activeApiProfile(kind); if (!profile || !confirm(`确定删除 API 实例“${profile.name}”？`)) return;
        settings.apiProfiles[kind] = settings.apiProfiles[kind].filter(item => item.id !== profile.id);
        if (!settings.apiProfiles[kind].length) settings.apiProfiles[kind].push({ id: newId(), name: `默认${apiKindLabel(kind)} API`, config: clone(defaults[kind]) });
        const next = settings.apiProfiles[kind][0]; settings.activeApiProfile[kind] = next.id; settings[kind] = clone(next.config); save(); fillApiUi(kind); notify('API 实例已删除', 'success');
    }
    function exportApiProfiles(kind) {
        if (!confirm('导出的实例集包含 API Key，请只保存在可信位置。确定导出？')) return;
        const payload = { format: 'comic-orb-api-profiles', version: 1, kind, exportedAt: new Date().toISOString(), activeId: settings.activeApiProfile[kind], profiles: settings.apiProfiles[kind] };
        downloadJson(payload, `comic-orb-${kind}-apis-${new Date().toISOString().slice(0, 10)}.json`);
    }
    async function importApiProfiles(kind, file) {
        const prefix = apiKindPrefix(kind); if (!file) return;
        try {
            const parsed = JSON.parse(await file.text()); if (parsed.kind && parsed.kind !== kind) throw new Error(`这是 ${parsed.kind} 实例集，不能导入到 ${kind}`);
            const source = Array.isArray(parsed) ? parsed : parsed?.profiles; if (!Array.isArray(source) || !source.length) throw new Error('JSON 中没有 profiles 实例数组');
            const profiles = source.map((item, index) => ({ id: newId(), name: String(item?.name || `${kind} API ${index + 1}`), config: merge(defaults[kind], item?.config || {}) }));
            if (!confirm(`导入会覆盖当前 ${settings.apiProfiles[kind].length} 个实例，确定继续？`)) return;
            settings.apiProfiles[kind] = profiles; settings.activeApiProfile[kind] = profiles[0].id; settings[kind] = clone(profiles[0].config); save(); fillApiUi(kind); notify(`已导入 ${profiles.length} 个 API 实例`, 'success');
        } catch (error) { notify(`API 实例导入失败：${error.message}`, 'error'); }
        finally { root.querySelector(`#${prefix}-profile-file`).value = ''; }
    }
    function activeReferencePreset() { return referencePresets.find(preset => preset.id === settings.activeReferencePreset) || null; }
    function renderReferencePresetManager(preserveName = false) {
        const select = root.querySelector('#co-ref-preset'); const name = root.querySelector('#co-ref-preset-name'); const state = root.querySelector('#co-ref-preset-state');
        if (!select || !name || !state) return;
        select.innerHTML = referencePresets.map(preset => `<option value="${esc(preset.id)}" ${preset.id === settings.activeReferencePreset ? 'selected' : ''}>${esc(preset.name)}</option>`).join('');
        if (!preserveName) name.value = activeReferencePreset()?.name || '';
        state.textContent = refsDirty ? '当前预设有未保存修改' : `已加载 · ${refs.filter(ref => ref.dataUrl).length}/4 张参考图`;
        state.classList.toggle('dirty', refsDirty);
    }
    function markRefsDirty() { refsDirty = true; renderReferencePresetManager(true); }
    async function loadReferencePreset(id, force = false) {
        const preset = referencePresets.find(item => item.id === id); if (!preset) throw new Error('参考图预设不存在');
        if (!force && refsDirty && !confirm('当前参考图有未保存修改，切换会丢弃这些修改。确定继续？')) { renderReferencePresetManager(); return false; }
        const values = normalizeReferenceSlots(preset.refs || []); refs.splice(0, refs.length, ...values); await dbReplaceRefs(refs);
        settings.activeReferencePreset = preset.id; refsDirty = false; save(); renderReferencePresetManager(); renderRefs(); return true;
    }
    async function initializeReferencePresets() {
        referencePresets = await refPresetList();
        if (!referencePresets.length) {
            const legacy = normalizeReferenceSlots(await dbLoad());
            const preset = { id: newId(), name: '默认参考图', refs: legacy, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            await refPresetPut(preset); referencePresets = [preset]; settings.activeReferencePreset = preset.id; save();
        }
        if (!referencePresets.some(preset => preset.id === settings.activeReferencePreset)) settings.activeReferencePreset = referencePresets[0].id;
        await loadReferencePreset(settings.activeReferencePreset, true); renderReferencePresetManager();
    }
    async function createReferencePreset() {
        const name = prompt('请输入新参考图预设名称', `参考图预设 ${referencePresets.length + 1}`); if (name === null) return;
        const preset = { id: newId(), name: name.trim() || `参考图预设 ${referencePresets.length + 1}`, refs: snapshotRefs(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await refPresetPut(preset); referencePresets.push(preset); settings.activeReferencePreset = preset.id; refsDirty = false; save(); renderReferencePresetManager(); notify('已基于当前参考图新建预设', 'success');
    }
    async function saveReferencePreset() {
        const preset = activeReferencePreset(); if (!preset) throw new Error('没有可保存的参考图预设');
        preset.name = val('co-ref-preset-name').trim() || preset.name; preset.refs = snapshotRefs(); preset.updatedAt = new Date().toISOString();
        await refPresetPut(preset); referencePresets = await refPresetList(); refsDirty = false; renderReferencePresetManager(); await writeLog('operation', '保存参考图预设', { id: preset.id, name: preset.name, count: preset.refs.filter(ref => ref.dataUrl).length }); notify('参考图预设已保存', 'success');
    }
    async function deleteReferencePreset() {
        const preset = activeReferencePreset(); if (!preset || !confirm(`确定删除参考图预设“${preset.name}”？`)) return;
        await refPresetDelete(preset.id); referencePresets = await refPresetList();
        if (!referencePresets.length) { const fallback = { id: newId(), name: '默认参考图', refs: normalizeReferenceSlots([]), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await refPresetPut(fallback); referencePresets = [fallback]; }
        await loadReferencePreset(referencePresets[0].id, true); renderReferencePresetManager(); notify('参考图预设已删除', 'success');
    }
    function renderRefs() {
        const box = root.querySelector('#co-refs');
        box.innerHTML = refs.map((ref, i) => `<div class="co-ref" data-slot="${i}">${ref.dataUrl ? `<img class="co-ref-thumb" src="${esc(ref.dataUrl)}">` : '<div class="co-ref-thumb co-ref-empty">未选择</div>'}<label class="co-field"><span>参考图 ${i + 1} 对应提示词</span><input class="co-ref-hint" value="${esc(ref.hint)}" placeholder="例：角色正脸与服装必须保持一致"></label><div class="co-ref-actions"><label class="co-mini">选择图片<input class="co-ref-file" type="file" accept="image/*" hidden></label><button class="co-mini co-ref-clear">清除</button></div></div>`).join('');
        box.querySelectorAll('.co-ref-hint').forEach((el, i) => el.addEventListener('input', async () => { refs[i].hint = el.value; if (refs[i].dataUrl) await dbPut(refs[i]); markRefsDirty(); }));
        box.querySelectorAll('.co-ref-file').forEach((el, i) => el.addEventListener('change', async () => { const file = el.files?.[0]; if (!file) return; refs[i] = { slot: i, dataUrl: await readFile(file), name: file.name, hint: refs[i].hint }; await dbPut(refs[i]); markRefsDirty(); renderRefs(); }));
        box.querySelectorAll('.co-ref-clear').forEach((el, i) => el.addEventListener('click', async () => { refs[i] = { slot: i, dataUrl: '', name: '', hint: '' }; await dbDelete(i); markRefsDirty(); renderRefs(); }));
    }
    function renderRegexList() {
        const box = root.querySelector('#co-regex-list');
        if (!settings.regexList.length) box.innerHTML = '<div class="co-callout">暂无规则。点击“新增规则”可同时维护多条正则。</div>';
        else box.innerHTML = settings.regexList.map((rule, index) => `<div class="co-regex-row" data-index="${index}"><label class="co-check"><input class="co-regex-enabled" type="checkbox" ${rule.enabled !== false ? 'checked' : ''}>启用</label><label class="co-field co-regex-pattern"><span>表达式（不含 / /）</span><input value="${esc(rule.pattern)}" placeholder="<!--.*?-->"></label><label class="co-field co-regex-flags"><span>flags</span><input value="${esc(rule.flags ?? 'g')}" placeholder="gs"></label><label class="co-field co-regex-replacement"><span>替换为</span><input value="${esc(rule.replacement)}" placeholder="留空即删除"></label><div class="co-regex-actions"><button class="co-mini co-regex-up" type="button" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button><button class="co-mini co-regex-down" type="button" title="下移" ${index === settings.regexList.length - 1 ? 'disabled' : ''}>↓</button><button class="co-mini co-danger co-regex-remove" type="button">删除</button></div></div>`).join('');
        box.querySelectorAll('input').forEach(el => el.addEventListener('change', () => { syncRegexFromUi(); save(); }));
        box.querySelectorAll('.co-regex-remove').forEach((el, index) => el.addEventListener('click', () => { syncRegexFromUi(); settings.regexList.splice(index, 1); save(); renderRegexList(); }));
        box.querySelectorAll('.co-regex-up').forEach((el, index) => el.addEventListener('click', () => moveRegex(index, -1)));
        box.querySelectorAll('.co-regex-down').forEach((el, index) => el.addEventListener('click', () => moveRegex(index, 1)));
    }
    function moveRegex(index, offset) { syncRegexFromUi(); const target = index + offset; if (target < 0 || target >= settings.regexList.length) return; [settings.regexList[index], settings.regexList[target]] = [settings.regexList[target], settings.regexList[index]]; save(); renderRegexList(); }
    function validateRegexList(input) {
        const source = Array.isArray(input) ? input : input?.rules;
        if (!Array.isArray(source)) throw new Error('JSON 必须是规则数组，或包含 rules 数组');
        return source.map((rule, index) => {
            if (!rule || typeof rule.pattern !== 'string') throw new Error(`第 ${index + 1} 条缺少 pattern 字符串`);
            const item = { enabled: rule.enabled !== false, pattern: rule.pattern, flags: String(rule.flags ?? 'g'), replacement: String(rule.replacement ?? '') };
            try { new RegExp(item.pattern, item.flags); } catch (error) { throw new Error(`第 ${index + 1} 条正则无效：${error.message}`); }
            return item;
        });
    }
    function addTagCleanupPreset() {
        syncRegexFromUi(); settings.regexList = settings.regexList.filter(rule => !rule.pattern.includes('(dm_think|thinking|CheckResult|safe|UpdateVariable)') && !(rule.pattern.startsWith('<thinking\\b[^>]*>') || rule.pattern.includes('\\[metacognition\\]')) && !rule.pattern.startsWith('<\\/?[A-Za-z_]') && !rule.pattern.startsWith('<\\/?[\\p{L}_]'));
        const existing = new Set(settings.regexList.map(rule => `${rule.pattern}\u0000${rule.flags}`));
        const additions = TAG_CLEANUP_PRESET.filter(rule => !existing.has(`${rule.pattern}\u0000${rule.flags}`)).map(clone);
        settings.regexList.push(...additions); save(); renderRegexList(); notify(additions.length ? `已加入 ${additions.length} 条标签清理规则` : '标签清理规则已存在', additions.length ? 'success' : 'info');
    }
    function exportRegexList() {
        syncSettingsFromUi(); const payload = { format: 'comic-orb-regex-list', version: 1, exportedAt: new Date().toISOString(), rules: settings.regexList };
        downloadJson(payload, `comic-orb-regex-${new Date().toISOString().slice(0, 10)}.json`);
    }
    async function importRegexList(file) {
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text()); const rules = validateRegexList(parsed);
            if (settings.regexList.length && !confirm(`导入会覆盖当前 ${settings.regexList.length} 条规则，确定继续？`)) return;
            settings.regexList = rules; save(); renderRegexList(); notify(`已导入 ${rules.length} 条正则规则`, 'success');
        } catch (error) { notify(`正则导入失败：${error.message}`, 'error'); }
        finally { root.querySelector('#co-import-regex-file').value = ''; }
    }
    function syncRegexFromUi() {
        const rows = [...root.querySelectorAll('.co-regex-row')];
        if (!rows.length) return;
        settings.regexList = rows.map(row => ({ enabled: row.querySelector('.co-regex-enabled').checked, pattern: row.querySelector('.co-regex-pattern input').value, flags: row.querySelector('.co-regex-flags input').value, replacement: row.querySelector('.co-regex-replacement input').value }));
    }
    function syncSettingsFromUi() {
        syncRegexFromUi(); settings.range = val('co-range'); settings.outputLanguage = val('co-output-language').trim() || 'auto'; settings.workflowMode = val('co-workflow-mode') === 'interpretive' ? 'interpretive' : 'direct'; settings.batchDrawingIntervalMs = normalizeBatchDrawingInterval(val('co-batch-drawing-interval')); settings.interpretivePageRange = normalizeStoryboardRange(val('co-interpretive-min-pages'), val('co-interpretive-max-pages'), 2, 8, 20); settings.storyboardWorkerPages = normalizeWorkerPageSpec(val('co-storyboard-worker-pages')).spec; settings.includeNames = checked('co-names'); settings.includeMvuData = checked('co-include-mvu'); settings.preflightNeutralize = checked('co-preflight-neutralize'); settings.insert.alt = val('co-alt'); settings.debug.enabled = checked('co-debug-enabled'); settings.debug.captureModelIo = checked('co-capture-model-io');
        settings.interaction.doubleClickRedraw = checked('co-enable-redraw');
        settings.interaction.doubleClickImmediate = checked('co-enable-immediate-work');
        settings.interaction.runSubmitCooldown = checked('co-enable-run-cooldown');
        settings.storage.localImageRoot = val('co-local-image-root').trim();
        settings.storage.cachePreviewLimit = normalizeCachePreviewLimit(val('co-cache-preview-limit'));
        settings.storage.maxCacheMb = normalizeMaxCacheMb(val('co-cache-max-mb'));
        settings.storage.autoCleanup = checked('co-cache-auto-cleanup');
        settings.adaptation = { ...settings.adaptation, baseUrl: val('ad-base'), path: val('ad-path'), modelsPath: val('ad-models-path'), apiKey: val('ad-key'), model: val('ad-model'), temperature: val('ad-temperature'), maxOutputTokens: normalizeMaxOutputTokens(val('ad-max-output-tokens')), maxOutputTokenField: val('ad-max-output-token-field') || 'auto', reasoningEffort: val('ad-reasoning-effort') || 'off', thinkingMode: val('ad-thinking-mode') || 'default', systemPrompt: val('ad-system') || DEFAULT_ADAPTATION_SYSTEM_PROMPT, testPrompt: val('ad-test-prompt'), extraBody: val('ad-extra'), extraHeaders: val('ad-headers') };
        settings.storyboard = { ...settings.storyboard, baseUrl: val('sb-base'), path: val('sb-path'), modelsPath: val('sb-models-path'), apiKey: val('sb-key'), model: val('sb-model'), temperature: val('sb-temperature'), maxOutputTokens: normalizeMaxOutputTokens(val('sb-max-output-tokens')), maxOutputTokenField: val('sb-max-output-token-field') || 'auto', reasoningEffort: val('sb-reasoning-effort') || 'off', thinkingMode: val('sb-thinking-mode') || 'default', minPages: Number(val('sb-min-pages')) || 1, maxPages: Number(val('sb-max-pages')) || 2, minPanels: Number(val('sb-min-panels')) || 1, maxPanels: Number(val('sb-max-panels')) || 6, systemPrompt: val('sb-system'), testPrompt: val('sb-test-prompt'), extraBody: val('sb-extra'), extraHeaders: val('sb-headers') };
        settings.drawing = { ...settings.drawing, baseUrl: val('dr-base'), path: val('dr-path'), modelsPath: val('dr-models-path'), apiKey: val('dr-key'), model: val('dr-model'), mode: val('dr-mode'), size: val('dr-size'), quality: val('dr-quality'), outputFormat: val('dr-output-format'), outputCompression: val('dr-output-compression'), background: val('dr-background'), inputFidelity: val('dr-input-fidelity'), useLocalProxy: checked('dr-local-proxy'), requestTimeoutSeconds: Math.max(60, Math.min(1800, Number(val('dr-timeout')) || 600)), promptPrefix: val('dr-prefix'), testPrompt: val('dr-test-prompt'), extraBody: val('dr-extra'), extraHeaders: val('dr-headers'), sendReferences: checked('dr-sendrefs') };
        save();
    }
    function val(id) { return root.querySelector(`#${id}`)?.value ?? ''; }
    function checked(id) { return Boolean(root.querySelector(`#${id}`)?.checked); }
    function setStatus(text, type = '') { const el = root.querySelector('#co-status'); el.textContent = text; el.className = `co-status ${type}`; }
    function renderRunCooldown() {
        const button = root.querySelector('#co-run'); if (!button) return;
        if (settings.interaction.runSubmitCooldown === false) {
            if (runCooldownTimer) clearInterval(runCooldownTimer); runCooldownTimer = null; runCooldownUntil = 0;
            button.disabled = false; button.classList.remove('running'); button.textContent = '生成并发分页漫画并插入末层';
            return;
        }
        const remaining = Math.max(0, runCooldownUntil - Date.now());
        if (remaining > 0) {
            button.disabled = true; button.classList.add('running'); button.textContent = `已提交 · ${Math.ceil(remaining / 1000)} 秒后可再次提交`;
            return;
        }
        if (runCooldownTimer) clearInterval(runCooldownTimer); runCooldownTimer = null; runCooldownUntil = 0;
        button.disabled = false; button.classList.remove('running'); button.textContent = '生成并发分页漫画并插入末层';
    }
    function startRunCooldown() {
        if (settings.interaction.runSubmitCooldown === false) { renderRunCooldown(); return; }
        runCooldownUntil = Date.now() + 5000;
        if (runCooldownTimer) clearInterval(runCooldownTimer);
        renderRunCooldown(); runCooldownTimer = setInterval(renderRunCooldown, 200);
    }
    function updateDebug() {
        const images = Array.isArray(lastImage) ? lastImage : (lastImage ? [lastImage] : []);
        const reasoning = root.querySelector('#co-last-reasoning'); if (reasoning) reasoning.value = lastModelReasoning;
        root.querySelector('#co-last-story').value = lastStoryboard;
        root.querySelector('#co-last-image').value = images.map((src, index) => `第 ${index + 1} 页：${String(src).startsWith('data:') ? `本地 data URL · ${formatBytes(dataUrlBytes(src))}` : String(src).slice(0, 240)}`).join('\n');
        root.querySelector('#co-image-preview').innerHTML = images.map((src, index) => `<figure><figcaption>第 ${index + 1} 页</figcaption><img class="co-preview" src="${esc(src)}"></figure>`).join('');
    }
    async function testRegex() {
        try {
            syncSettingsFromUi(); const ctx = context(); const execution = { includeNames: Boolean(settings.includeNames), includeMvuData: Boolean(settings.includeMvuData), preflightNeutralize: Boolean(settings.preflightNeutralize), regexList: clone(settings.regexList), workflowMode: settings.workflowMode === 'interpretive' ? 'interpretive' : 'direct' }; const { start, end } = parseRange(settings.range, ctx.chat.length); let selection = collectPlot(ctx, start, end, execution);
            if (!selection.floors.length) throw new Error('所选范围内没有非 User 的剧情楼');
            selection = await appendMvuAfterRegex(selection, ctx, execution);
            const transportPreview = execution.preflightNeutralize ? neutralizeNarrativeWordingForTransport(selection.text) : { text: selection.text, count: 0 };
            const wrap = root.querySelector('#co-regex-preview-wrap'); const preview = root.querySelector('#co-regex-preview'); preview.value = transportPreview.text; wrap.classList.add('open'); preview.scrollTop = 0;
            const mvuSummary = selection.mvuMeta?.enabled ? `；MVU：${selection.mvuMeta.mode === 'baseline-plus-json-patch' ? `完整基线 + ${selection.mvuMeta.changedFloors} 个变化楼` : '历史不可用，末楼当前快照'}` : '；MVU：未启用';
            const preflightSummary = execution.preflightNeutralize ? `；前置清洗：${transportPreview.count} 处` : '；前置清洗：关闭';
            setStatus(`正则测试完成：显示 ${selection.floors.length} 个剧情楼，已剔除 ${selection.skippedUserFloors.length} 个 User 楼${mvuSummary}${preflightSummary}，未发送 API。`, 'ok');
        } catch (error) { setStatus(`正则测试失败：${error.message}`, 'error'); notify(error.message, 'error'); }
    }
    async function refreshLogs() {
        const view = root.querySelector('#co-log-view'); if (!view) return;
        view.innerHTML = '<div class="co-log-empty">正在读取日志摘要…</div>';
        const logs = await readLogSummaries(200);
        view.innerHTML = logs.length ? logs.map(entry => `<article class="co-log-item co-log-${esc(entry.type || 'operation')}"><div class="co-log-item-head"><strong>${esc(entry.operation || '未命名操作')}</strong><span>${esc(entry.type || 'operation')} · ${esc(entry.mode || '简写')} · ${esc(entry.time ? new Date(entry.time).toLocaleString() : '')}</span></div><p>${esc(entry.summary || '无摘要')}</p></article>`).join('') : '<div class="co-log-empty">暂无本地日志。</div>';
    }
    async function exportLogs(limit = null) {
        await logQueue;
        const logs = sanitizeLogValue(await readLogs(limit));
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const scope = Number.isInteger(limit) && limit > 0 ? `last-${limit}` : 'all';
        downloadJson(logs, `comic-orb-logs-${scope}-${stamp}.json`);
        notify(`已导出${scope === 'all' ? '全部' : `最近 ${logs.length} 条`}日志`, 'success');
    }
    async function exportModelIoLogs() {
        await logQueue;
        const logs = (await readLogs()).filter(entry => isModelApiOperation(entry.operation) && ['request', 'response', 'error'].includes(entry.type));
        const safeLogs = sanitizeLogValue(logs);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        downloadJson({ format: 'comic-orb-model-io', version: 1, exportedAt: new Date().toISOString(), entries: safeLogs }, `comic-orb-model-io-${stamp}.json`);
        notify(`已导出 ${safeLogs.length} 条大模型输入输出记录`, 'success');
    }
    function downloadJson(value, filename) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    function formatBytes(bytes) { const value = Number(bytes) || 0; return value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`; }
    function readerChatLabel(chatId) {
        return String(chatId || '').trim() || '旧缓存 / 未记录对话';
    }
    function readerPagesForChat(records, chatId) {
        const byFloor = new Map();
        records.filter(record => !record.test && String(record.chatId || '') === String(chatId || '') && Number.isInteger(record.targetFloor)).forEach(record => {
            if (!byFloor.has(record.targetFloor)) byFloor.set(record.targetFloor, []);
            byFloor.get(record.targetFloor).push(record);
        });
        const pages = [];
        [...byFloor.entries()].sort((a, b) => a[0] - b[0]).forEach(([floor, floorRecords]) => {
            floorRecords.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
            const newest = floorRecords[0];
            const expected = Math.max(1, Number(newest.storyboardPageCount || newest.storyboardPlan?.pages?.length || Math.max(...floorRecords.map(record => Number(record.pageNumber || 1)))));
            for (let page = 1; page <= expected; page++) {
                const record = floorRecords.find(item => Number(item.pageNumber || 1) === page);
                if (record) pages.push(record);
            }
        });
        return pages.sort((a, b) => Number(a.targetFloor) - Number(b.targetFloor) || Number(a.pageNumber || 1) - Number(b.pageNumber || 1));
    }
    function renderReaderChatOptions() {
        const select = root.querySelector('#co-reader-chat-select');
        const chats = new Map();
        cacheReaderAllRecords.filter(record => !record.test).forEach(record => {
            const id = String(record.chatId || ''); const createdAt = String(record.createdAt || '');
            if (!chats.has(id) || createdAt > chats.get(id)) chats.set(id, createdAt);
        });
        select.innerHTML = [...chats.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => `<option value="${esc(id)}">${esc(readerChatLabel(id))}</option>`).join('');
        select.value = cacheReaderChatId;
    }
    function selectReaderChat(chatId, preferredRecord = null) {
        cacheReaderChatId = String(chatId || '');
        cacheReaderRecords = readerPagesForChat(cacheReaderAllRecords, cacheReaderChatId);
        if (!cacheReaderRecords.length) { notify('这条对话记录没有可阅读的生产漫画缓存', 'info'); return false; }
        cacheReaderIndex = preferredRecord
            ? Math.max(0, cacheReaderRecords.findIndex(record => record.id === preferredRecord.id
                || (record.targetFloor === preferredRecord.targetFloor && Number(record.pageNumber || 1) === Number(preferredRecord.pageNumber || 1))))
            : 0;
        renderReaderChatOptions(); void renderCacheReaderPage(); return true;
    }
    async function renderCacheReaderPage() {
        const stub = cacheReaderRecords[cacheReaderIndex];
        if (!stub) return;
        const token = ++cacheReaderRenderToken;
        const image = root.querySelector('#co-cache-preview-image'); image.removeAttribute('src'); image.alt = '正在读取缓存漫画页…';
        const record = stub.dataUrl ? stub : await imageCacheGet(stub.id);
        if (!record || token !== cacheReaderRenderToken) return;
        root.querySelector('#co-cache-preview-image').src = record.dataUrl;
        image.alt = '缓存漫画当前页';
        root.querySelector('#co-cache-preview-title').textContent = record.test ? 'API 测试图片预览' : `聊天漫画 · ${readerChatLabel(record.chatId)}`;
        root.querySelector('#co-reader-counter').textContent = `${cacheReaderIndex + 1} / ${cacheReaderRecords.length}`;
        root.querySelector('#co-reader-meta').textContent = record.test ? `API 测试图 · ${record.model || '未知模型'} · ${new Date(record.createdAt).toLocaleString()}` : `第 ${record.targetFloor} 楼 · 漫画第 ${record.pageNumber || 1} 页 · ${record.storyboardPlan?.title || record.storyboardTitle || '未命名漫画'} · ${record.model || '未知模型'} · ${new Date(record.createdAt).toLocaleString()}`;
        root.querySelector('#co-reader-prev').disabled = cacheReaderIndex <= 0;
        root.querySelector('#co-reader-next').disabled = cacheReaderIndex >= cacheReaderRecords.length - 1;
        root.querySelector('#co-reader-prompt').dataset.cacheId = record.id;
    }
    async function openCacheReader(cacheId = '', suppliedRecords = null) {
        const records = suppliedRecords || (await imageCacheMetadata()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        cacheReaderAllRecords = records;
        const explicit = records.find(record => record.id === cacheId) || null;
        if (explicit?.test) {
            cacheReaderRecords = [explicit]; cacheReaderIndex = 0; cacheReaderChatId = '';
            root.querySelector('#co-reader-chat-select').innerHTML = '<option>API 测试图</option>';
            await renderCacheReaderPage();
            const dialog = root.querySelector('#co-cache-preview-dialog'); if (!dialog.open) dialog.showModal();
            return;
        }
        let selected = explicit || null;
        if (!selected) {
            let currentId = '';
            try { currentId = currentChatId(); } catch {}
            selected = records.find(record => !record.test && record.chatId === currentId) || records.find(record => !record.test) || null;
        }
        if (!selected) { notify('本地缓存中没有可阅读的生产漫画', 'info'); return; }
        if (!selectReaderChat(selected.chatId, cacheId ? selected : null)) return;
        const dialog = root.querySelector('#co-cache-preview-dialog'); if (!dialog.open) dialog.showModal();
    }
    function moveCacheReader(offset) {
        const next = Math.max(0, Math.min(cacheReaderRecords.length - 1, cacheReaderIndex + offset));
        if (next === cacheReaderIndex) return;
        cacheReaderIndex = next; void renderCacheReaderPage();
    }
    async function renderImageCache() {
        const grid = root.querySelector('#co-cache-grid'); const stats = root.querySelector('#co-cache-stats'); const pageInfo = root.querySelector('#co-cache-page-info');
        if (!grid || !stats) return;
        try {
            const metadata = (await imageCacheMetadata()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
            const total = metadata.reduce((sum, record) => sum + Number(record.storageBytes || record.bytes || 0), 0);
            const limit = normalizeCachePreviewLimit(settings.storage.cachePreviewLimit);
            const pageCount = Math.max(1, Math.ceil(metadata.length / limit)); cacheListPage = Math.max(1, Math.min(pageCount, cacheListPage));
            const start = (cacheListPage - 1) * limit; const visibleMetadata = metadata.slice(start, start + limit);
            const visible = (await Promise.all(visibleMetadata.map(record => imageCacheGet(record.id)))).filter(Boolean);
            let browserUsage = '';
            try {
                const estimate = await navigator.storage?.estimate?.();
                if (Number(estimate?.quota) > 0) browserUsage = ` · 浏览器站点 ${formatBytes(estimate.usage || 0)} / ${formatBytes(estimate.quota)}`;
            } catch {}
            stats.textContent = `${metadata.length} 张 · IndexedDB 估算 ${formatBytes(total)} / ${settings.storage.maxCacheMb} MB${browserUsage}`;
            pageInfo.textContent = `第 ${cacheListPage} / ${pageCount} 页 · ${metadata.length ? `${start + 1}-${start + visible.length}` : '0'} / ${metadata.length}`;
            root.querySelector('#co-cache-page-prev').disabled = cacheListPage <= 1;
            root.querySelector('#co-cache-page-next').disabled = cacheListPage >= pageCount;
            if (!metadata.length) { grid.innerHTML = '<div class="co-callout">暂无本地绘画图片缓存。</div>'; return; }
            grid.innerHTML = visible.map(record => `<article class="co-cache-card" data-cache-id="${esc(record.id)}"><img src="${esc(record.dataUrl)}" alt="缓存图片"><div><strong>${esc(record.test ? 'API 测试图' : `第 ${record.targetFloor ?? '?'} 楼 · 漫画第 ${record.pageNumber || 1} 页`)}</strong><small>${esc(record.test ? '不属于聊天漫画' : readerChatLabel(record.chatId))}</small><small>${esc(record.model || '未知模型')} · ${esc(formatBytes(record.bytes || dataUrlBytes(record.dataUrl)))}</small><small>${esc(new Date(record.createdAt).toLocaleString())}</small></div><div class="co-cache-actions">${record.test ? '' : '<button class="co-mini co-test co-cache-read" type="button">阅读该对话</button>'}<button class="co-mini co-cache-prompt" type="button">提示词</button><button class="co-mini co-cache-export" type="button">导出图片</button>${!record.test && Number.isInteger(record.targetFloor) ? '<button class="co-mini co-cache-restore" type="button">重新上传写回</button>' : ''}<button class="co-mini co-danger co-cache-delete" type="button">删除</button></div></article>`).join('');
            grid.querySelectorAll('.co-cache-card > img').forEach(image => image.addEventListener('dblclick', event => {
                event.preventDefault(); event.stopPropagation(); void openCacheReader(image.closest('.co-cache-card').dataset.cacheId, metadata);
            }));
            grid.querySelectorAll('.co-cache-read').forEach(button => button.addEventListener('click', () => openCacheReader(button.closest('.co-cache-card').dataset.cacheId, metadata)));
            grid.querySelectorAll('.co-cache-prompt').forEach(button => button.addEventListener('click', async () => showCachedPrompt(button.closest('.co-cache-card').dataset.cacheId)));
            grid.querySelectorAll('.co-cache-export').forEach(button => button.addEventListener('click', async () => {
                const record = await imageCacheGet(button.closest('.co-cache-card').dataset.cacheId); if (!record) return;
                const link = document.createElement('a'); link.href = record.dataUrl; link.download = `comic-orb-${record.id}.${record.mime === 'image/jpeg' ? 'jpg' : (record.mime.split('/')[1] || 'png')}`; link.click();
            }));
            grid.querySelectorAll('.co-cache-restore').forEach(button => button.addEventListener('click', () => restoreCachedBatch(button.closest('.co-cache-card').dataset.cacheId, button)));
            grid.querySelectorAll('.co-cache-delete').forEach(button => button.addEventListener('click', async () => {
                const id = button.closest('.co-cache-card').dataset.cacheId;
                if (!confirm('删除此本地缓存？正文中已上传的图片不会删除，但该页将无法再重绘或查看实际提示词。')) return;
                await imageCacheDelete(id); await writeLog('operation', '删除本地图片缓存', { cacheId: id }); await renderImageCache();
            }));
        } catch (error) { stats.textContent = `缓存读取失败：${error.message}`; grid.innerHTML = ''; }
    }
    async function restoreCachedBatch(cacheId, button) {
        if (busy || !confirm('将从本地缓存重新上传这组漫画并写回原目标楼层，不会重新调用分镜或绘画 API。确定继续？')) return;
        try {
            busy = true; button.disabled = true; button.textContent = '正在恢复…'; const selected = await imageCacheGet(cacheId); if (!selected) throw new Error('本地缓存不存在');
            const ctx = context(); const chatId = String(ctx.chatId || ctx.getCurrentChatId?.() || '');
            if (selected.chatId && chatId && selected.chatId !== chatId) throw new Error('请先切回该缓存所属的原聊天');
            const expected = Math.max(1, Number(selected.storyboardPlan?.pages?.length || 1)); const all = await imageCacheList(); const selectedTime = new Date(selected.createdAt).getTime();
            const sameBatch = selected.batchId
                ? all.filter(record => !record.test && record.batchId === selected.batchId)
                : all.filter(record => !record.test && record.targetFloor === selected.targetFloor && record.chatId === selected.chatId && record.sourcePlot === selected.sourcePlot && Math.abs(new Date(record.createdAt).getTime() - selectedTime) < 30 * 60 * 1000);
            const pages = Array.from({ length: expected }, (_, index) => sameBatch.filter(record => Number(record.pageNumber) === index + 1).sort((a, b) => Math.abs(new Date(a.createdAt).getTime() - selectedTime) - Math.abs(new Date(b.createdAt).getTime() - selectedTime))[0]);
            if (pages.some(page => !page)) throw new Error(`缓存组不完整，需要 ${expected} 页，实际找到 ${pages.filter(Boolean).length} 页`);
            const saved = await Promise.all(pages.map(page => persistImage(page.dataUrl, ctx, page.pageNumber)));
            await insertPagesIntoFloor(ctx, selected.targetFloor, pages.map((page, index) => ({ url: saved[index], cacheId: page.id, page: page.pageNumber })));
            await writeLog('result', '从本地缓存重新上传并写回', { result: `已恢复第 ${selected.targetFloor} 层，共 ${pages.length} 页`, paths: saved.map(clientPathToAbsolute) });
            notify(`已从缓存恢复 ${pages.length} 页到第 ${selected.targetFloor} 层`, 'success');
        } catch (error) { notify(`缓存恢复失败：${error.message}`, 'error'); await writeLog('error', '从本地缓存恢复失败', { result: error.message, cacheId }); }
        finally { busy = false; button.disabled = false; button.textContent = '重新上传写回'; }
    }
    function cacheIdFromImage(image) {
        const legacy = String(image?.getAttribute?.('title') || '').match(/^comic-orb:image;cache=([^;]+);page=(\d+)$/);
        if (legacy) return legacy[1];
        const tagged = String(image?.getAttribute?.('src') || '').match(/#comic-orb-cache=([^&]+)&page=\d+$/);
        if (!tagged) return '';
        try { return decodeURIComponent(tagged[1]); } catch { return tagged[1]; }
    }
    async function showCachedPrompt(cacheId) {
        return openRedrawDialog(cacheId, 'prompt');
    }
    function switchRedrawDialogPage(page) {
        root.querySelectorAll('#co-redraw-dialog [data-dialog-page]').forEach(element => element.classList.toggle('active', element.dataset.dialogPage === page));
    }
    async function openRedrawDialog(cacheId, page = 'redraw') {
        const record = await imageCacheGet(cacheId);
        if (!record) { notify('该正文图片对应的本地缓存已被删除，无法重绘', 'error'); return; }
        activeRedrawCacheId = cacheId; root.querySelector('#co-redraw-preview').src = record.dataUrl;
        root.querySelector('#co-redraw-info').textContent = `第 ${record.pageNumber || 1} 页 · ${record.model || '未知模型'} · ${new Date(record.createdAt).toLocaleString()}`;
        root.querySelector('#co-actual-prompt').value = record.prompt || record.pagePrompt || '';
        root.querySelector('#co-redraw-storyboard').checked = false; root.querySelector('#co-redraw-status').textContent = '请选择方式后确认。';
        switchRedrawDialogPage(page);
        const dialog = root.querySelector('#co-redraw-dialog'); if (!dialog.open) dialog.showModal();
    }
    function currentChatId(ctx = context()) { return String(ctx.chatId || ctx.getCurrentChatId?.() || ''); }
    function redrawScope(record) { return `${String(record.chatId || '')}|${Number(record.targetFloor)}`; }
    function acquireRedrawLock(record, reStoryboard) {
        const scope = redrawScope(record); const page = Number(record.pageNumber || 1);
        const conflict = [...redrawLocks.values()].find(lock => lock.scope === scope && (reStoryboard || lock.allPages || lock.page === page));
        if (conflict) throw new Error(reStoryboard ? '该楼层已有重绘任务运行中，请等待它结束' : `该楼层第 ${page} 页已有重绘任务运行中`);
        const id = newId(); redrawLocks.set(id, { scope, page, allPages: reStoryboard }); return id;
    }
    function redrawExecutionSnapshot() {
        const adaptationProfile = activeApiProfile('adaptation'); const storyboardProfile = activeApiProfile('storyboard'); const drawingProfile = activeApiProfile('drawing');
        return {
            outputLanguage: normalizeOutputLanguage(settings.outputLanguage),
            workflowMode: settings.workflowMode === 'interpretive' ? 'interpretive' : 'direct',
            preflightNeutralize: Boolean(settings.preflightNeutralize),
            batchDrawingIntervalMs: normalizeBatchDrawingInterval(settings.batchDrawingIntervalMs),
            interpretivePageRange: normalizeStoryboardRange(settings.interpretivePageRange?.min, settings.interpretivePageRange?.max, 2, 8, 20),
            storyboardWorkerPageRange: normalizeWorkerPageSpec(settings.storyboardWorkerPages),
            adaptationConf: clone(settings.adaptation), storyboardConf: clone(settings.storyboard), drawingConf: clone(settings.drawing), refs: snapshotRefs(),
            adaptationProfile: { id: adaptationProfile?.id || '', name: adaptationProfile?.name || '' },
            storyboardProfile: { id: storyboardProfile?.id || '', name: storyboardProfile?.name || '' },
            drawingProfile: { id: drawingProfile?.id || '', name: drawingProfile?.name || '' },
            insert: clone(settings.insert), storage: clone(settings.storage), debugEnabled: Boolean(settings.debug.enabled),
        };
    }
    function requireRedrawContext(job) {
        const ctx = context(); const chatId = currentChatId(ctx);
        if (job.chatId && chatId && job.chatId !== chatId) throw new Error('后台任务所属聊天已不是当前聊天；图片已保留在本地缓存，但为避免写错正文，本次没有写回。请切回原聊天后从缓存恢复');
        if (!ctx.chat[job.targetFloor]) throw new Error(`后台任务目标楼层 ${job.targetFloor} 已不存在，已停止写回`);
        return ctx;
    }
    async function runRedrawJob(job, retainedCheckpoint = null) {
        const checkpoint = retainedCheckpoint || { processId: '', adaptation: null, adaptationTiming: null, segmentResults: new Map(), plan: null, drawingResults: new Map(), savedUrls: new Map(), singleResult: null, singleSavedUrl: '' };
        if (!checkpoint.processId) checkpoint.processId = startRemoteProcess(job.reStoryboard ? '重新分镜并重绘全部页面' : `异步重绘漫画第 ${job.pageNumber} 页`, { method: 'WORKFLOW', url: `chat:${job.chatId || 'current'}/floor:${job.targetFloor}/page:${job.pageNumber}` });
        const processId = checkpoint.processId;
        const signal = remoteProcessSignal(processId); const execution = { ...job.execution, signal, checkpoint };
        const cacheMeta = { batchId: job.id, sourcePlot: job.sourcePlot, sourceRange: job.sourceRange, targetFloor: job.targetFloor, chatId: job.chatId };
        try {
            ensureNotCanceled(signal); requireRedrawContext(job);
            if (job.reStoryboard) {
                if (!job.sourcePlot) throw new Error('该缓存缺少原始剧情，无法重新分镜');
                let plan = checkpoint.plan;
                if (!plan && execution.workflowMode === 'interpretive') {
                    updateRemoteProcess(processId, '重新演绎并并发分镜', `总页数 ${execution.interpretivePageRange.min}-${execution.interpretivePageRange.max}`);
                    const interpretive = await runInterpretiveStoryboard(job.sourcePlot, execution, signal, (_stage, payload) => updateRemoteProcess(processId, `重新分镜 · ${payload.adaptation.segments.length} 个并发子任务`, '成功结果将保留到检查点'));
                    plan = interpretive.plan; checkpoint.plan = plan;
                } else if (!plan) {
                    const raw = await callStoryboard(job.sourcePlot, { conf: execution.storyboardConf, refs: execution.refs, outputLanguage: execution.outputLanguage, preflightNeutralize: execution.preflightNeutralize, signal });
                    ensureNotCanceled(signal); plan = parseStoryboardPlan(raw, execution.storyboardConf, execution.outputLanguage); checkpoint.plan = plan;
                }
                lastStoryboard = JSON.stringify(plan, null, 2); updateDebug();
                const batch = await drawStoryboardPages(plan, cacheMeta, execution); lastImage = batch.results.map(item => item.image); updateDebug();
                let ctx = requireRedrawContext(job);
                const saved = await Promise.all(batch.results.map(async result => {
                    const retained = checkpoint.savedUrls.get(Number(result.page)); if (retained) return retained;
                    const url = await persistImage(result.image, ctx, result.page, { storage: execution.storage, signal }); checkpoint.savedUrls.set(Number(result.page), url); return url;
                }));
                ensureNotCanceled(signal); ctx = requireRedrawContext(job);
                await insertPagesIntoFloor(ctx, job.targetFloor, batch.results.map((result, index) => ({ url: saved[index], cacheId: result.cacheId, page: result.page })), execution.insert);
                await writeLog('result', '异步重新分镜并重绘完成', { oldCacheId: job.oldCacheId, targetFloor: job.targetFloor, pages: batch.results.length, wallTime: batch.wallTime, profile: execution.drawingProfile.name });
                finishRemoteProcess(processId, 'success', `已替换 ${batch.results.length} 页 · ${batch.wallTime}`); notify(`第 ${job.targetFloor} 层重新分镜并重绘完成`, 'success');
            } else {
                if (!job.pagePrompt) throw new Error('该缓存缺少原始页分镜提示词，无法单页重绘');
                const result = checkpoint.singleResult || await callDrawing(job.pagePrompt, { withTiming: true, pageNumber: job.pageNumber, pagePrompt: job.pagePrompt, cacheMeta: { ...cacheMeta, storyboardPlan: job.storyboardPlan }, outputLanguage: execution.outputLanguage || job.storyboardPlan?.language, conf: execution.drawingConf, refs: execution.refs, profile: execution.drawingProfile, signal });
                checkpoint.singleResult = result;
                ensureNotCanceled(signal);
                let ctx = requireRedrawContext(job);
                const saved = checkpoint.singleSavedUrl || await persistImage(result.image, ctx, job.pageNumber, { storage: execution.storage, signal });
                checkpoint.singleSavedUrl = saved;
                ensureNotCanceled(signal); ctx = requireRedrawContext(job);
                await replaceTaggedPage(ctx, job.targetFloor, job.oldCacheId, { url: saved, cacheId: result.cacheId, page: job.pageNumber }, execution.insert);
                lastImage = result.image; updateDebug();
                await writeLog('result', '异步漫画单页重绘完成', { oldCacheId: job.oldCacheId, newCacheId: result.cacheId, targetFloor: job.targetFloor, page: job.pageNumber, timing: result.timing, profile: execution.drawingProfile.name });
                finishRemoteProcess(processId, 'success', `第 ${job.pageNumber} 页已替换 · ${result.timing?.elapsedText || '耗时未知'}`); notify(`第 ${job.pageNumber} 页异步重绘完成`, 'success');
            }
            redrawLocks.delete(job.lockId);
            await renderImageCache().catch(() => {});
        } catch (error) {
            const canceled = isCanceledError(error) || signal.aborted;
            if (canceled) {
                finishRemoteProcess(processId, 'canceled', '用户取消；未继续写回正文'); redrawLocks.delete(job.lockId);
            } else {
                pauseRemoteProcess(processId, `${error.message}；成功结果已保留，请选择重试或抛弃。`, () => runRedrawJob(job, checkpoint), () => redrawLocks.delete(job.lockId));
            }
            await writeLog(canceled ? 'operation' : 'error', canceled ? '异步漫画重绘已取消' : '异步漫画重绘已暂停', { cacheId: job.oldCacheId, targetFloor: job.targetFloor, page: job.pageNumber, result: canceled ? '用户取消' : error.message }); notify(canceled ? '重绘任务已取消' : `重绘已暂停，可在后台重试：${error.message}`, canceled ? 'info' : 'error');
        }
    }
    async function executeRedraw() {
        if (!activeRedrawCacheId) return;
        const button = root.querySelector('#co-redraw-confirm'); const status = root.querySelector('#co-redraw-status');
        const cacheId = String(activeRedrawCacheId); const reStoryboard = checked('co-redraw-storyboard');
        try {
            syncSettingsFromUi(); await requireLocalProxyReady(); button.disabled = true; status.textContent = '正在建立不可变任务快照…';
            const record = await imageCacheGet(cacheId); if (!record) throw new Error('本地缓存已不存在');
            if (!Number.isInteger(record.targetFloor)) throw new Error('该缓存没有正文目标楼层信息，不能发起重绘');
            const ctx = context(); const chatId = currentChatId(ctx);
            if (record.chatId && chatId && record.chatId !== chatId) throw new Error('当前聊天与该缓存所属聊天不一致，请切回原聊天后重试');
            if (reStoryboard && !record.sourcePlot) throw new Error('该缓存缺少原始剧情，无法重新分镜');
            if (!reStoryboard && !record.pagePrompt) throw new Error('该缓存缺少原始页分镜提示词，无法单页重绘');
            const execution = redrawExecutionSnapshot();
            if (reStoryboard && execution.workflowMode === 'interpretive') assertInterpretivePageAllocation(execution.interpretivePageRange, execution.storyboardWorkerPageRange);
            const lockId = acquireRedrawLock({ ...record, chatId: record.chatId || chatId }, reStoryboard);
            const job = Object.freeze({ lockId, reStoryboard, oldCacheId: record.id, chatId: record.chatId || chatId, targetFloor: record.targetFloor, pageNumber: Number(record.pageNumber || 1), sourcePlot: String(record.sourcePlot || ''), sourceRange: clone(record.sourceRange || null), pagePrompt: String(record.pagePrompt || ''), storyboardPlan: clone(record.storyboardPlan || null), execution });
            root.querySelector('#co-redraw-dialog').close();
            void runRedrawJob(job); notify(`已加入后台：${reStoryboard ? '重新分镜并重绘全部页面' : `重绘第 ${job.pageNumber} 页`}`, 'info');
        } catch (error) { status.textContent = `无法启动：${error.message}`; await writeLog('error', '漫画重绘任务启动失败', { cacheId, result: error.message }); notify(error.message, 'error'); }
        finally { button.disabled = false; }
    }

    fillApiUi('adaptation'); fillApiUi('storyboard'); fillApiUi('drawing');
    root.querySelector('#co-fab').addEventListener('click', e => { if (root.querySelector('#co-fab').dataset.dragged === '1') return; const panel = root.querySelector('#co-panel'); panel.classList.toggle('open'); if (panel.classList.contains('open')) void checkLocalProxyStatus(); });
    root.querySelector('#co-close').addEventListener('click', () => root.querySelector('#co-panel').classList.remove('open'));
    root.querySelector('#co-run').addEventListener('click', run);
    root.querySelector('#co-import-refs').addEventListener('click', () => root.querySelector('#co-import-refs-file').click());
    root.querySelector('#co-import-refs-file').addEventListener('change', event => importReferencePresets(event.target.files?.[0]));
    root.querySelector('#co-export-refs').addEventListener('click', () => exportReferencePresets().catch(error => notify(error.message, 'error')));
    root.querySelector('#co-ref-preset').addEventListener('change', event => loadReferencePreset(event.target.value).catch(error => notify(error.message, 'error')));
    root.querySelector('#co-ref-preset-name').addEventListener('input', markRefsDirty);
    root.querySelector('#co-ref-preset-new').addEventListener('click', () => createReferencePreset().catch(error => notify(error.message, 'error')));
    root.querySelector('#co-ref-preset-save').addEventListener('click', () => saveReferencePreset().catch(error => notify(error.message, 'error')));
    root.querySelector('#co-ref-preset-delete').addEventListener('click', () => deleteReferencePreset().catch(error => notify(error.message, 'error')));
    root.querySelector('#co-tag-preset').addEventListener('click', addTagCleanupPreset);
    root.querySelector('#co-import-regex').addEventListener('click', () => root.querySelector('#co-import-regex-file').click());
    root.querySelector('#co-import-regex-file').addEventListener('change', event => importRegexList(event.target.files?.[0]));
    root.querySelector('#co-export-regex').addEventListener('click', exportRegexList);
    root.querySelector('#co-test-regex').addEventListener('click', testRegex);
    root.querySelector('#co-add-regex').addEventListener('click', () => { syncRegexFromUi(); settings.regexList.push({ enabled: true, pattern: '', flags: 'g', replacement: '' }); save(); renderRegexList(); });
    root.querySelector('#ad-fetch-models').addEventListener('click', () => fetchModels('adaptation'));
    root.querySelector('#sb-fetch-models').addEventListener('click', () => fetchModels('storyboard'));
    root.querySelector('#dr-fetch-models').addEventListener('click', () => fetchModels('drawing'));
    for (const prefix of ['ad', 'sb', 'dr']) {
        const input = root.querySelector(`#${prefix}-model`);
        input.addEventListener('input', () => renderModelOptions(prefix, input.value));
        input.addEventListener('focus', () => { closeModelOptions(prefix); if (modelCandidates[prefix].length) renderModelOptions(prefix, input.value); });
        input.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' && modelCandidates[prefix].length) { event.preventDefault(); renderModelOptions(prefix, input.value); root.querySelector(`#${prefix}-model-options .co-model-option`)?.focus(); }
            if (event.key === 'Escape') root.querySelector(`#${prefix}-model-options`).classList.remove('open');
        });
    }
    root.querySelector('#ad-test').addEventListener('click', () => testApi('adaptation'));
    root.querySelector('#sb-test').addEventListener('click', () => testApi('storyboard'));
    root.querySelector('#dr-test').addEventListener('click', () => testApi('drawing'));
    root.querySelector('#co-proxy-recheck').addEventListener('click', () => checkLocalProxyStatus());
    root.querySelector('#dr-local-proxy').addEventListener('change', () => { syncSettingsFromUi(); void checkLocalProxyStatus(); });
    root.querySelector('#dr-speed-preset').addEventListener('click', () => {
        root.querySelector('#dr-quality').value = 'low'; root.querySelector('#dr-output-format').value = 'jpeg';
        root.querySelector('#dr-output-compression').value = '80'; root.querySelector('#dr-background').value = 'opaque'; root.querySelector('#dr-input-fidelity').value = 'low';
        syncSettingsFromUi(); notify('已套用 GPT Image 2 速度优先参数；请保存当前绘画 API 实例', 'success');
    });
    for (const [prefix, kind] of [['ad', 'adaptation'], ['sb', 'storyboard'], ['dr', 'drawing']]) {
        root.querySelector(`#${prefix}-profile`).addEventListener('change', event => switchApiProfile(kind, event.target.value));
        root.querySelector(`#${prefix}-profile-new`).addEventListener('click', () => createApiProfile(kind));
        root.querySelector(`#${prefix}-profile-save`).addEventListener('click', () => saveApiProfile(kind));
        root.querySelector(`#${prefix}-profile-delete`).addEventListener('click', () => deleteApiProfile(kind));
        root.querySelector(`#${prefix}-profile-import`).addEventListener('click', () => root.querySelector(`#${prefix}-profile-file`).click());
        root.querySelector(`#${prefix}-profile-file`).addEventListener('change', event => importApiProfiles(kind, event.target.files?.[0]));
        root.querySelector(`#${prefix}-profile-export`).addEventListener('click', () => exportApiProfiles(kind));
        root.querySelector(`#${prefix}-prompt-preset`).addEventListener('change', event => applyPromptPreset(kind, event.target.value));
        root.querySelector(`#${prefix}-prompt-new`).addEventListener('click', () => createPromptPreset(kind));
        root.querySelector(`#${prefix}-prompt-save`).addEventListener('click', () => savePromptPreset(kind));
        root.querySelector(`#${prefix}-prompt-delete`).addEventListener('click', () => deletePromptPreset(kind));
    }
    root.querySelector('#co-refresh-logs').addEventListener('click', refreshLogs);
    root.querySelector('#co-export-logs-all').addEventListener('click', () => exportLogs().catch(error => notify(`日志导出失败：${error.message}`, 'error')));
    root.querySelector('#co-export-logs-last10').addEventListener('click', () => exportLogs(10).catch(error => notify(`日志导出失败：${error.message}`, 'error')));
    root.querySelector('#co-export-model-io').addEventListener('click', () => exportModelIoLogs().catch(error => notify(`大模型输入输出导出失败：${error.message}`, 'error')));
    root.querySelector('#co-clear-logs').addEventListener('click', () => { if (confirm('确定清空漫画工房的全部本地日志？')) clearLogs(); });
    root.querySelector('#co-refresh-cache').addEventListener('click', renderImageCache);
    root.querySelector('#co-open-reader-latest').addEventListener('click', () => openCacheReader().catch(error => notify(error.message, 'error')));
    root.querySelector('#co-cache-preview-limit').addEventListener('change', event => { syncSettingsFromUi(); event.currentTarget.value = settings.storage.cachePreviewLimit; cacheListPage = 1; renderImageCache(); });
    root.querySelector('#co-cache-max-mb').addEventListener('change', event => { syncSettingsFromUi(); event.currentTarget.value = settings.storage.maxCacheMb; renderImageCache(); });
    root.querySelector('#co-cache-auto-cleanup').addEventListener('change', syncSettingsFromUi);
    root.querySelector('#co-cache-page-prev').addEventListener('click', () => { cacheListPage = Math.max(1, cacheListPage - 1); renderImageCache(); });
    root.querySelector('#co-cache-page-next').addEventListener('click', () => { cacheListPage += 1; renderImageCache(); });
    root.querySelector('#co-trim-cache').addEventListener('click', async () => {
        if (!confirm(`将按当前 ${settings.storage.maxCacheMb} MB 上限清理最旧缓存，正文服务器图片不会删除。确定继续？`)) return;
        try {
            syncSettingsFromUi();
            const result = await enforceImageCacheLimit(null, true); cacheListPage = 1; await renderImageCache();
            notify(result.deleted ? `已清理 ${result.deleted} 张，释放 ${formatBytes(result.bytesFreed)}` : '当前缓存未超过安全上限，无需清理', 'success');
        } catch (error) { notify(`缓存整理失败：${error.message}`, 'error'); }
    });
    root.querySelector('#co-clear-cache').addEventListener('click', async () => { if (!confirm('确定清空全部本地图片缓存？正文图片不会删除，但所有正文漫画将失去重绘与提示词查看能力。')) return; await imageCacheClear(); cacheListPage = 1; await writeLog('operation', '清空全部本地图片缓存', { result: '完成' }); await renderImageCache(); });
    root.querySelector('#co-reader-prev').addEventListener('click', () => moveCacheReader(-1));
    root.querySelector('#co-reader-next').addEventListener('click', () => moveCacheReader(1));
    root.querySelector('#co-reader-chat-select').addEventListener('change', event => selectReaderChat(event.target.value));
    root.querySelector('#co-reader-prompt').addEventListener('click', event => {
        const cacheId = event.currentTarget.dataset.cacheId; root.querySelector('#co-cache-preview-dialog').close();
        if (cacheId) openRedrawDialog(cacheId, 'prompt').catch(error => notify(error.message, 'error'));
    });
    root.querySelector('#co-cache-preview-dialog').addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); moveCacheReader(-1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); moveCacheReader(1); }
    });
    root.querySelector('#co-reader-stage').addEventListener('touchstart', event => {
        const touch = event.changedTouches[0]; cacheReaderTouchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
    }, { passive: true });
    root.querySelector('#co-reader-stage').addEventListener('touchend', event => {
        const touch = event.changedTouches[0]; if (!touch || !cacheReaderTouchStart) return;
        const dx = touch.clientX - cacheReaderTouchStart.x; const dy = touch.clientY - cacheReaderTouchStart.y; cacheReaderTouchStart = null;
        if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.2) moveCacheReader(dx < 0 ? 1 : -1);
    }, { passive: true });
    root.querySelector('#co-clear-processes').addEventListener('click', () => { const retained = remoteProcesses.filter(process => ['running', 'paused'].includes(process.status)); remoteProcesses.splice(0, remoteProcesses.length, ...retained); renderProcessCenter(); });
    root.querySelector('#co-redraw-confirm').addEventListener('click', executeRedraw);
    root.querySelectorAll('#co-redraw-dialog .co-dialog-tabs button').forEach(button => button.addEventListener('click', () => switchRedrawDialogPage(button.dataset.dialogPage)));
    root.querySelector('#co-copy-prompt').addEventListener('click', async () => { try { await navigator.clipboard.writeText(val('co-actual-prompt')); notify('提示词已复制', 'success'); } catch (error) { notify(`复制失败：${error.message}`, 'error'); } });
    root.querySelector('#co-debug-enabled').addEventListener('change', async () => { const enabled = checked('co-debug-enabled'); settings.debug.enabled = enabled; save(); await writeLog('operation', `DEBUG 模式已${enabled ? '开启' : '关闭'}`, { result: enabled ? '后续记录完整文本与结构化参数；图片二进制仍排除' : '后续只记录操作与结果简写' }); });
    root.querySelector('#co-capture-model-io').addEventListener('change', async () => { const enabled = checked('co-capture-model-io'); settings.debug.captureModelIo = enabled; save(); await writeLog('operation', `大模型完整输入输出记录已${enabled ? '开启' : '关闭'}`, { result: enabled ? '后续成功与失败的演绎、分镜和绘画调用均保存完整文本；图片二进制与密钥排除' : '后续成功调用恢复简写；语义失败仍保留强制诊断' }); });
    root.querySelector('#co-enable-run-cooldown').addEventListener('change', () => { syncSettingsFromUi(); renderRunCooldown(); });
    root.querySelectorAll('.co-tab').forEach(tab => tab.addEventListener('click', () => { root.querySelectorAll('.co-tab,.co-page').forEach(x => x.classList.remove('active')); tab.classList.add('active'); root.querySelector(`.co-page[data-page="${tab.dataset.page}"]`).classList.add('active'); if (tab.dataset.page === 'cache') renderImageCache(); if (tab.dataset.page === 'processes') renderProcessCenter(); if (tab.dataset.page === 'debug') refreshLogs().catch(error => notify(error.message, 'error')); }));
    root.querySelectorAll('input,textarea,select').forEach(el => { if (!el.classList.contains('co-ref-hint') && !el.classList.contains('co-ref-file')) el.addEventListener('change', () => { try { syncSettingsFromUi(); } catch {} }); });
    document.addEventListener('pointerdown', event => { if (!event.target.closest(`#${ROOT_ID} .co-model-row`)) closeModelOptions(); });
    document.addEventListener('dblclick', event => {
        const image = event.target.closest?.('img'); const cacheId = cacheIdFromImage(image);
        if (cacheId) {
            if (!settings.interaction.doubleClickRedraw) return;
            event.preventDefault(); event.stopPropagation(); openRedrawDialog(cacheId).catch(error => notify(error.message, 'error')); return;
        }
        if (settings.interaction.doubleClickImmediate === false) return;
        if (event.target.closest?.('a,button,input,textarea,select,option,label,video,audio,img,[contenteditable="true"]')) return;
        const messageElement = event.target.closest?.('#chat .mes[mesid], #chat [mesid]');
        if (!messageElement) return;
        const rawFloor = messageElement.getAttribute('mesid');
        if (!/^\d+$/.test(String(rawFloor || ''))) return;
        const floor = Number(rawFloor); let msg;
        try { msg = context().chat[floor]; } catch { return; }
        if (!msg || msg.is_user === true || messageAlreadyHasImage(msg, messageElement)) return;
        event.preventDefault(); event.stopPropagation();
        void startImmediateFloorJob(floor, messageElement);
    });

    function makeDraggable(handle, target, key, clickGuard = false) {
        handle.addEventListener('pointerdown', event => {
            if (event.target.closest('button') && handle !== target) return;
            if (event.button !== undefined && event.button !== 0) return;
            event.preventDefault();
            const rect = target.getBoundingClientRect(); const startX = event.clientX; const startY = event.clientY; let moved = false;
            const pointerId = event.pointerId; target.style.right = 'auto'; target.style.bottom = 'auto';
            const move = e => { if (e.pointerId !== pointerId) return; const dx = e.clientX - startX, dy = e.clientY - startY; moved ||= Math.abs(dx) + Math.abs(dy) > 5; target.style.left = `${Math.max(0, Math.min(innerWidth - rect.width, rect.left + dx))}px`; target.style.top = `${Math.max(0, Math.min(innerHeight - rect.height, rect.top + dy))}px`; };
            const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish); };
            const finish = e => { if (e?.pointerId !== undefined && e.pointerId !== pointerId) return; cleanup(); const now = target.getBoundingClientRect(); settings[key] = { x: now.left, y: now.top }; save(); if (clickGuard && moved) { target.dataset.dragged = '1'; setTimeout(() => target.dataset.dragged = '0'); } };
            window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish); window.addEventListener('blur', finish);
        });
    }
    makeDraggable(root.querySelector('#co-fab'), root.querySelector('#co-fab'), 'fab', true);
    makeDraggable(root.querySelector('#co-head'), root.querySelector('#co-panel'), 'panel');
    for (const [key, selector] of [['fab', '#co-fab'], ['panel', '#co-panel']]) { const pos = settings[key]; if (Number.isFinite(pos?.x) && Number.isFinite(pos?.y)) { const el = root.querySelector(selector); el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; } }
    renderRegexList(); refreshLogs().catch(() => {});
    initializeReferencePresets().catch(error => { console.warn('[漫画工房] 参考图预设数据库读取失败', error); renderReferencePresetManager(); renderRefs(); notify(`参考图预设读取失败：${error.message}`, 'error'); });
    migrateLegacyTaggedMarkdown().catch(error => console.warn('[漫画工房] 旧版正文漫画标识迁移失败', error));
    void checkLocalProxyStatus();
    if (isLocalGeminiWebConfig(settings.drawing)) void fetchModels('drawing');
    console.info('[漫画工房] 悬浮球已加载');
})();
