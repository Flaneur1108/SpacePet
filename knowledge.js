/* ============================================================
   SpacePet · 本地星际题库
   不依赖网络，也能源源不断地生成新题目。
   题目由知识模板 + 随机材料组合而成，没有固定题数上限。
   ============================================================ */

(function (global) {
    'use strict';

    /* ----------------------------- 学科 ----------------------------- */

    const SUBJECT_LIST = [
        { id: 'physics', name: '物理', icon: '🧲', theme: '神奇力量', color: '#6ee7ff' },
        { id: 'chemistry', name: '化学', icon: '⚗️', theme: '奇妙变化', color: '#ffd166' },
        { id: 'biology', name: '生物', icon: '🌱', theme: '生命秘密', color: '#6ee7b7' },
        { id: 'astronomy', name: '天文', icon: '🪐', theme: '星空奇遇', color: '#c4b5fd' },
        { id: 'geography', name: '地理', icon: '🌍', theme: '地球旅行', color: '#ffb08c' }
    ];

    const SUBJECT_BY_ID = {};
    const SUBJECT_BY_NAME = {};
    SUBJECT_LIST.forEach(function (s) {
        SUBJECT_BY_ID[s.id] = s;
        SUBJECT_BY_NAME[s.name] = s;
    });

    /* ----------------------------- 随机工具 ----------------------------- */

    function hashString(str) {
        let h = 2166136261 >>> 0;
        const text = String(str || '');
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function pick(rng, list) {
        return list[Math.floor(rng() * list.length)];
    }

    function shuffle(rng, list) {
        const arr = list.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function sample(rng, list, count, exclude) {
        const blocked = exclude || [];
        const filtered = list.filter(function (item) {
            return blocked.indexOf(item) === -1;
        });
        return shuffle(rng, filtered).slice(0, count);
    }

    function cleanText(value, maxLength) {
        if (typeof value !== 'string') return '';
        return value
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength || 400);
    }

    function cleanOption(value) {
        return cleanText(value, 120)
            .replace(/^[A-Da-d]\s*[.、．:：)）]\s*/, '')
            .replace(/^["“]|["”]$/g, '')
            .trim();
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()【】\[\]—\-…·]/g, '');
    }

    function signature(questionOrText) {
        if (questionOrText && typeof questionOrText === 'object') {
            const q = questionOrText;
            const correct = typeof q.correct === 'string'
                ? q.correct
                : (Array.isArray(q.options) && typeof q.correctIndex === 'number'
                    ? q.options[q.correctIndex]
                    : '');
            return q.subjectId + '|' + normalizeText(q.question || '') + '|' + normalizeText(correct);
        }
        return normalizeText(questionOrText);
    }

    /* ----------------------------- 年级 ----------------------------- */

    function gradeLabel(band) {
        if (band <= 1) return '1-2 年级';
        if (band >= 5) return '5-6 年级';
        return '3-4 年级';
    }

    function gradePrompt(band) {
        if (band <= 1) {
            return '低年级（1-2 年级）：用很短、很生活化的句子，少用专有名词；遇到科学名词要马上用“就是……”解释。';
        }
        if (band >= 5) {
            return '高年级（5-6 年级）：可以介绍简单的科学名词和因果关系，但不要超纲，不要用公式。';
        }
        return '中年级（3-4 年级）：句子简短清楚，可以用常见科学名词，但要马上用生活里的比喻解释。';
    }

    /* ----------------------------- 每日主题 ----------------------------- */

    function dateKeyToDayNumber(dateKey) {
        const parts = String(dateKey || '').split('-').map(Number);
        if (parts.length === 3 && parts.every(function (n) { return isFinite(n); })) {
            return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000);
        }
        const now = new Date();
        return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
    }

    function themeForDay(dateKey, studentId) {
        const day = dateKeyToDayNumber(dateKey);
        const offset = studentId ? hashString(studentId) : 0;
        const index = Math.abs(day + offset) % SUBJECT_LIST.length;
        return SUBJECT_LIST[index];
    }

    /* ----------------------------- 场景池 ----------------------------- */

    const SCENES = {
        astronomy: [
            '今晚我趴在窗台上，抱着星际笔记本看夜空。',
            '嘟嘟刚把望远镜擦得亮亮的，想和你分享一个新发现。',
            '我在屋顶吹着晚风，发现天上藏着一个有趣的小秘密。',
            '我躺在床上看星星，忽然想到了一个问题。',
            '今天的夜空特别亮，我的天线都忍不住晃来晃去。'
        ],
        biology: [
            '今天我在院子里观察了好久的动植物。',
            '我蹲在花坛边，发现了一个会动的小秘密。',
            '嘟嘟带着小本子去了公园，看见了好多有趣的生命。',
            '我在餐桌旁看奶奶择菜，忽然冒出一个问题。',
            '今天我去喂小动物，发现它们比我想的还要神奇。'
        ],
        physics: [
            '今天我在厨房里帮忙，发现了一个有趣的现象。',
            '我玩玩具的时候，发现东西都会听“看不见的规则”的话。',
            '嘟嘟在院子里跑来跑去，忽然被一个小问题绊住了。',
            '我在阳台上玩水，发现水会做出奇怪的事情。',
            '今天搬东西的时候，我发现了一个省力的小秘密。'
        ],
        chemistry: [
            '今天我在厨房闻到了香香的味道，还看到了奇妙的变化。',
            '嘟嘟在餐桌上做观察，发现有些东西会悄悄变样。',
            '我帮大人收拾厨房时，发现了几个会冒泡的小秘密。',
            '今天我做了一杯甜甜的水，发现了一个问题。',
            '我在阳台上看衣服晾干，忽然想知道水去了哪里。'
        ],
        geography: [
            '今天我把地图铺在桌子上，看了好久好久。',
            '嘟嘟趴在窗边看云，发现天气像个调皮的孩子。',
            '我在院子里抬头看天，发现云和风都有自己的故事。',
            '今天下了雨，我蹲在门口观察了好久。',
            '我翻开星际旅行手册，发现地球上有好多神奇的地方。'
        ]
    };

    const SCENE_DETAILS = {
        astronomy: ['今晚的月亮特别亮。', '我的天线一直指向星星。', '我还在本子上画了一颗小星星。'],
        biology: ['我还带上了自己的小本子。', '有只小虫从我脚边爬过去。', '这个发现让我开心了好久。'],
        physics: ['我一边看一边记在星际笔记本上。', '我把这个问题想了好几遍。', '这个现象真让我好奇。'],
        chemistry: ['厨房里飘着香香的味道。', '我小心地观察着，没有乱碰东西。', '这个变化让我睁大了眼睛。'],
        geography: ['我把地图铺在桌子上看了好久。', '窗外的风把树叶吹得沙沙响。', '我一边看一边画下了路线。']
    };

    const CORRECT_FEEDBACK = [
        '答对啦！你的观察力真棒！',
        '哇，你找到答案啦！嘟嘟给你记一颗小星星。',
        '太厉害了，你就是小小科学家！',
        '被你发现啦！我们继续去探险吧。',
        '完全正确！嘟嘟的星际笔记本又添了一页。'
    ];

    const WRONG_FEEDBACK = [
        '还差一点点，再仔细看看嘟嘟的小提示～',
        '没关系，科学家也会试错。再想一想～',
        '这个答案不太对哦，嘟嘟陪你一起找线索。',
        '别着急，慢一点观察，你会发现答案的。',
        '再试一次吧，嘟嘟相信你！'
    ];

    /* ----------------------------- 知识材料 ----------------------------- */

    const PLANETS = [
        { name: '水星', order: 1, fact: '水星离太阳最近，白天特别热，晚上又特别冷。' },
        { name: '金星', order: 2, fact: '金星是太阳系里最热的行星，厚厚的二氧化碳大气像棉被一样盖住热量。' },
        { name: '地球', order: 3, fact: '地球是我们生活的家园，表面大部分被水覆盖。' },
        { name: '火星', order: 4, fact: '火星的土壤里有铁锈，所以看起来红红的。' },
        { name: '木星', order: 5, fact: '木星是太阳系里最大的行星，能装下很多个地球。' },
        { name: '土星', order: 6, fact: '土星有一圈漂亮的光环，主要由冰块和岩石碎片组成。' },
        { name: '天王星', order: 7, fact: '天王星是“躺着”转圈的行星，一年四季都很冷。' },
        { name: '海王星', order: 8, fact: '海王星离太阳最远，是一个蓝色的冰冷世界。' }
    ];

    const MAMMALS = [
        '猫', '狗', '牛', '羊', '兔子', '猴子', '大象', '海豚', '鲸', '蝙蝠',
        '松鼠', '熊猫', '老虎', '狮子', '马', '猪', '鹿', '狐狸', '袋鼠', '刺猬'
    ];

    const BIRDS = [
        '鸡', '鸭', '鹅', '鸽子', '麻雀', '老鹰', '猫头鹰', '企鹅', '鹦鹉',
        '燕子', '孔雀', '啄木鸟', '天鹅', '鸵鸟'
    ];

    const REPTILES = ['蛇', '乌龟', '鳄鱼', '蜥蜴', '壁虎', '变色龙'];
    const AMPHIBIANS = ['青蛙', '蟾蜍', '娃娃鱼'];
    const FISH = ['金鱼', '鲨鱼', '鲤鱼', '小丑鱼', '海马', '带鱼', '鳗鱼'];
    const INSECTS = [
        '蝴蝶', '蜜蜂', '蚂蚁', '蜻蜓', '瓢虫', '甲虫', '蝉',
        '蝗虫', '蚊子', '苍蝇', '螳螂'
    ];
    const NON_MAMMALS = BIRDS.concat(REPTILES, AMPHIBIANS, FISH, INSECTS, ['蜘蛛', '蜗牛', '蚯蚓']);

    const FLOATERS = [
        '木块', '泡沫块', '盖紧的塑料瓶', '乒乓球', '树叶', '苹果', '橡皮鸭', '空塑料盒'
    ];
    const SINKERS = [
        '石头', '铁钉', '硬币', '玻璃珠', '钥匙', '金属勺子', '砖块', '玻璃弹珠'
    ];

    const CHEMICAL_CHANGES = [
        '蜡烛燃烧', '铁钉生锈', '面包烤焦', '牛奶变酸', '火柴燃烧',
        '食物腐烂', '小苏打和白醋混合', '烟花绽放', '鸡蛋煮熟', '树叶腐烂'
    ];
    const PHYSICAL_CHANGES = [
        '冰块融化', '水结冰', '玻璃打碎', '纸撕碎', '糖溶解在水里',
        '水蒸发', '木头锯成段', '盐溶解在水里', '橡皮泥捏成小动物', '海水晒盐'
    ];

    /* ----------------------------- 题目构造 ----------------------------- */

    function item(question, correct, distractors, hint, explain, funFact) {
        return {
            question: question,
            correct: correct,
            distractors: distractors,
            hint: hint,
            explain: explain,
            funFact: funFact
        };
    }

    function buildQuestion(raw, subject, rng) {
        if (!raw || typeof raw.question !== 'string' || typeof raw.correct !== 'string') {
            return null;
        }

        const question = cleanText(raw.question, 180);
        const correct = cleanOption(raw.correct);
        if (!question || !correct) return null;

        const uniqueDistractors = [];
        const pool = Array.isArray(raw.distractors) ? shuffle(rng, raw.distractors) : [];
        for (let i = 0; i < pool.length; i++) {
            const option = cleanOption(pool[i]);
            if (option && option !== correct && uniqueDistractors.indexOf(option) === -1) {
                uniqueDistractors.push(option);
            }
            if (uniqueDistractors.length === 2) break;
        }
        if (uniqueDistractors.length < 2) return null;

        const options = shuffle(rng, [correct].concat(uniqueDistractors));
        const correctIndex = options.indexOf(correct);
        if (correctIndex < 0) return null;

        let scene = cleanText(raw.scene, 200);
        if (!scene) {
            const scenePool = SCENES[subject.id] || SCENES.astronomy;
            scene = pick(rng, scenePool);
            if (rng() < 0.38) {
                scene += pick(rng, SCENE_DETAILS[subject.id] || SCENE_DETAILS.astronomy);
            }
        }

        const result = {
            subject: subject.name,
            subjectId: subject.id,
            scene: scene,
            question: question,
            options: options,
            correctIndex: correctIndex,
            hint: cleanText(raw.hint, 160) || '再仔细看看题目里的线索，你一定可以的～',
            explain: cleanText(raw.explain, 300) || '这个现象里藏着一个有趣的科学原理，我们下次再一起观察。',
            feedback_correct: cleanText(raw.feedback_correct, 80) || pick(rng, CORRECT_FEEDBACK),
            feedback_wrong: cleanText(raw.feedback_wrong, 80) || pick(rng, WRONG_FEEDBACK),
            fun_fact: cleanText(raw.funFact || raw.fun_fact, 220),
            source: 'local',
            createdAt: Date.now()
        };

        result.signature = signature(result);
        return result;
    }

    /* ----------------------------- 天文题 ----------------------------- */

    const ASTRONOMY_GENERATORS = [
        {
            id: 'astro-planet-order',
            subject: 'astronomy',
            minGrade: 3,
            make: function (rng) {
                const n = 1 + Math.floor(rng() * 8);
                const planet = PLANETS[n - 1];
                let question = '太阳系里，从太阳往外数，第 ' + n + ' 颗行星是哪一颗？';
                if (n === 1) question = '太阳系里，离太阳最近的行星是哪一颗？';
                if (n === 8) question = '太阳系里，离太阳最远的行星是哪一颗？';
                const names = PLANETS.map(function (p) { return p.name; }).filter(function (name) {
                    return name !== planet.name;
                });
                return item(
                    question,
                    planet.name,
                    sample(rng, names, 2),
                    '可以按顺序记一记：水星、金星、地球、火星、木星、土星、天王星、海王星。',
                    '行星就像排队绕太阳转的小朋友，顺序是固定的。从太阳往外数，第 ' + n + ' 颗是' + planet.name + '。',
                    planet.fact
                );
            }
        },
        {
            id: 'astro-planet-special',
            subject: 'astronomy',
            minGrade: 3,
            make: function (rng) {
                const specials = [
                    {
                        question: '太阳系里，哪颗行星有明亮的光环？',
                        correct: '土星',
                        explain: '土星有一圈由冰块和岩石碎片组成的光环，看起来像戴着一顶大草帽。',
                        funFact: '土星的光环很宽，但非常薄。'
                    },
                    {
                        question: '太阳系里，体积最大的行星是哪一颗？',
                        correct: '木星',
                        explain: '木星是太阳系里最大的行星，它的肚子里能装下很多个地球。',
                        funFact: '木星上有一个刮了很久很久的大风暴，叫“大红斑”。'
                    },
                    {
                        question: '太阳系里，哪颗行星被称为“红色星球”？',
                        correct: '火星',
                        explain: '火星的土壤里含有铁锈，所以从远处看是红红的。',
                        funFact: '科学家派了很多探测器去火星寻找水和生命的线索。'
                    },
                    {
                        question: '太阳系里，表面温度最高的行星是哪一颗？',
                        correct: '金星',
                        explain: '金星离太阳不是最近的，但它厚厚的二氧化碳大气像棉被一样把热量盖住，所以最热。',
                        funFact: '金星上的温度高到能把许多金属熔化。'
                    }
                ];
                const chosen = pick(rng, specials);
                const names = PLANETS.map(function (p) { return p.name; }).filter(function (name) {
                    return name !== chosen.correct;
                });
                return item(
                    chosen.question,
                    chosen.correct,
                    sample(rng, names, 2),
                    '先想一想每颗行星最特别的地方。',
                    chosen.explain,
                    chosen.funFact
                );
            }
        },
        {
            id: 'astro-sun-star',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '太阳是什么？',
                    '一颗会发光发热的恒星',
                    ['一颗绕着地球转的行星', '一块挂在天上的大石头'],
                    '太阳每天都给我们带来光和温暖。',
                    '太阳是一颗恒星，它自己能发光发热，是太阳系里最重要的光和热来源。',
                    '阳光跑到地球上大约要花 8 分钟，你看到的阳光其实是 8 分钟前出发的。'
                );
            }
        },
        {
            id: 'astro-moon-light',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '我们在夜里看到的月光，其实来自哪里？',
                    '太阳的光被月亮反射过来',
                    ['月亮自己会发光', '星星把光借给了月亮'],
                    '月亮就像一面挂在天空的大镜子。',
                    '月亮自己不发光，它把太阳的光反射到地球上，我们就看到了月光。',
                    '月亮上没有空气，宇航员留下的脚印能保存很久。'
                );
            }
        },
        {
            id: 'astro-day-night',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '地球上为什么会有白天和黑夜？',
                    '地球自己转圈，面向太阳的一面是白天',
                    ['太阳围着地球转，白天是太阳出来了', '月亮把黑夜照亮了'],
                    '地球像一个大陀螺，一直在转。',
                    '地球不停自转，转到面向太阳的一面就是白天，背对太阳的一面就是黑夜。',
                    '地球自转一圈大约要 24 小时，所以一天有 24 小时。'
                );
            }
        },
        {
            id: 'astro-seasons',
            subject: 'astronomy',
            minGrade: 3,
            make: function () {
                return item(
                    '一年为什么会有春、夏、秋、冬？',
                    '地球斜着身子绕太阳转，阳光照射的角度会变化',
                    ['地球离太阳有时近、有时远，所以冷热不同', '月亮绕着地球转，带来了四季'],
                    '地球不是直直站着的，它有一点倾斜。',
                    '地球绕太阳转的时候，身体是斜着的，不同季节阳光照到地面的角度不一样，就形成了四季。',
                    '南半球的夏天，正好是北半球的冬天。'
                );
            }
        },
        {
            id: 'astro-shooting-star',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '夜空里一闪而过的流星，其实是什么？',
                    '太空里的小尘埃冲进大气层，摩擦发热发光',
                    ['一颗星星从天上掉下来了', '外星人放的小烟花'],
                    '流星不是星星，它是一粒跑得很快的小东西。',
                    '太空中的小尘埃和碎块冲进地球大气层，和空气摩擦发热、燃烧起来，就变成了我们看到的流星。',
                    '有些流星雨每年都会在差不多的时间出现。'
                );
            }
        },
        {
            id: 'astro-twinkle',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '我们看到的星星为什么会一闪一闪地“眨眼”？',
                    '星光穿过大气层时被折射、晃动，看起来就一闪一闪',
                    ['星星自己在不停地开关灯', '星星快要熄灭了'],
                    '地球的大气层不是静止的，像水一样会流动。',
                    '地球的大气层像流动的水，星光穿过时会被折射来折射去，看起来就像在眨眼。这叫大气折射。',
                    '在太空里看星星，星星不会眨眼。'
                );
            }
        },
        {
            id: 'astro-moon-gravity',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '宇航员在月球上轻轻一跳就能跳得很高，是因为？',
                    '月球的引力比地球小',
                    ['月球上没有空气，所以人会变轻', '宇航员的鞋子里装了弹簧'],
                    '引力就像一只看不见的手，把你往地上拉。',
                    '月球的引力比地球小得多，所以在月球上跳起来会更高、落下来更慢。',
                    '在月球上，你的体重会变轻，但身体里的东西一点也没少。'
                );
            }
        },
        {
            id: 'astro-eclipse',
            subject: 'astronomy',
            minGrade: 3,
            make: function () {
                return item(
                    '月食的时候，是什么挡住了照到月球上的太阳光？',
                    '地球',
                    ['月亮自己', '火星'],
                    '月食发生在太阳、地球、月亮排成一条线的时候。',
                    '月食时，地球转到太阳和月亮中间，地球的影子落在月球上，月亮就变暗了。',
                    '月食只在满月的时候发生。'
                );
            }
        },
        {
            id: 'astro-earth-blue',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '从太空看，地球为什么是蓝色的？',
                    '地球表面大部分被水覆盖',
                    ['地球上涂满了蓝颜料', '天空把地球染成了蓝色'],
                    '想一想地球仪上，蓝色代表什么。',
                    '地球表面大约七成是海洋，水反射阳光，让地球从太空看起来蓝蓝的。',
                    '地球还有一条白色的“围巾”，那是大气里的云。'
                );
            }
        },
        {
            id: 'astro-space-suit',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '宇航员在太空里为什么要穿厚厚的宇航服？',
                    '太空没有空气、温差很大，宇航服能保护他们',
                    ['为了让宇航员看起来更酷', '为了让他们跑得更快'],
                    '太空里不能像在地球上一样呼吸。',
                    '太空几乎没有空气，温度变化也很大。宇航服能提供氧气、保持压力，还能挡住太空里的辐射。',
                    '一件宇航服有很多层，像一座穿在身上的小房子。'
                );
            }
        },
        {
            id: 'astro-moon-phases',
            subject: 'astronomy',
            minGrade: 3,
            make: function () {
                return item(
                    '月亮有时圆圆的，有时弯弯的，是因为？',
                    '我们看到月亮被太阳照亮的部分在变化',
                    ['月亮被云咬掉了一块', '月亮自己会变大变小'],
                    '月亮一直是一个圆球，只是我们看到的亮面不一样。',
                    '月亮绕着地球转，太阳照在月亮上的亮面，我们每次看到的部分不同，所以月亮会有圆缺变化。',
                    '月亮绕地球转一圈大约要一个月。'
                );
            }
        },
        {
            id: 'astro-planet-count',
            subject: 'astronomy',
            minGrade: 3,
            make: function () {
                return item(
                    '太阳系里一共有几颗行星？',
                    '8 颗',
                    ['9 颗', '7 颗'],
                    '水星、金星、地球、火星、木星、土星、天王星、海王星。',
                    '太阳系现在有 8 颗行星。很久以前冥王星也被叫作行星，后来科学家把它归为矮行星。',
                    '海王星离太阳最远，绕太阳转一圈要一百多年。'
                );
            }
        },
        {
            id: 'astro-north-star',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '在夜空中，哪颗星星能帮我们找到北方？',
                    '北极星',
                    ['流星', '太阳'],
                    '它的名字里就藏着方向。',
                    '北极星差不多在北方天空的位置，古代的人就靠它辨认方向。',
                    '北极星看起来不动，是因为它差不多正对着地球自转轴的方向。'
                );
            }
        },
        {
            id: 'astro-year',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '地球绕太阳转一圈需要多长时间？',
                    '一年',
                    ['一天', '一个月'],
                    '春夏秋冬走一遍，就是……',
                    '地球绕太阳转一圈大约要 365 天，也就是一年。',
                    '地球一边绕太阳转，一边自己转，自己转一圈是一天。'
                );
            }
        },
        {
            id: 'astro-sun-distance',
            subject: 'astronomy',
            minGrade: 3,
            make: function () {
                return item(
                    '阳光从太阳跑到地球上，大约需要多久？',
                    '大约 8 分钟',
                    ['大约 8 秒钟', '大约 8 天'],
                    '光跑得特别快，但太阳离我们非常远。',
                    '太阳离地球大约一亿五千万公里，光跑这么远大约要 8 分钟。',
                    '你看到的阳光，其实是 8 分钟前从太阳出发的。'
                );
            }
        },
        {
            id: 'astro-solar-eclipse',
            subject: 'astronomy',
            minGrade: 3,
            make: function () {
                return item(
                    '日食的时候，是什么挡住了太阳？',
                    '月亮',
                    ['地球', '云朵'],
                    '太阳、月亮、地球排成一条线的时候会发生日食。',
                    '月亮转到太阳和地球中间，挡住了太阳的光，就形成了日食。',
                    '看日食时不能用眼睛直接看太阳，要戴专门的观测眼镜。'
                );
            }
        },
        {
            id: 'astro-moon-air',
            subject: 'astronomy',
            minGrade: 1,
            make: function () {
                return item(
                    '月球上有空气吗？',
                    '几乎没有空气',
                    ['空气和地球一样多', '只有晚上才有空气'],
                    '宇航员在月球上要背着氧气瓶。',
                    '月球几乎没有大气层，也没有我们可以呼吸的空气。宇航员必须穿宇航服、带氧气。',
                    '因为没有空气，月球上的声音也传不出去，周围非常安静。'
                );
            }
        }
    ];

    /* ----------------------------- 生物题 ----------------------------- */

    const BIOLOGY_GENERATORS = [
        {
            id: 'bio-mammal',
            subject: 'biology',
            minGrade: 1,
            make: function (rng) {
                const correct = pick(rng, MAMMALS);
                return item(
                    '下面哪种动物是哺乳动物？',
                    correct,
                    sample(rng, NON_MAMMALS, 2),
                    '哺乳动物小时候喝妈妈的奶长大。',
                    correct + '是哺乳动物，它小时候喝妈妈的奶长大。鲸和海豚虽然住在水里，也是哺乳动物。',
                    '蝙蝠也是哺乳动物，它小时候喝妈妈的奶。'
                );
            }
        },
        {
            id: 'bio-bird',
            subject: 'biology',
            minGrade: 1,
            make: function (rng) {
                const correct = pick(rng, BIRDS);
                const pool = MAMMALS.concat(REPTILES, FISH, INSECTS, ['蜘蛛']);
                return item(
                    '下面哪种动物是鸟？',
                    correct,
                    sample(rng, pool, 2),
                    '鸟有羽毛，大多数鸟会下蛋。',
                    correct + '有羽毛，是鸟。企鹅和鸵鸟虽然不会飞，它们也是鸟。',
                    '鸵鸟是世界上最大的鸟，它不会飞，但跑得很快。'
                );
            }
        },
        {
            id: 'bio-insect',
            subject: 'biology',
            minGrade: 1,
            make: function (rng) {
                const correct = pick(rng, INSECTS);
                return item(
                    '下面哪种小动物是昆虫？',
                    correct,
                    sample(rng, ['蜘蛛', '蜗牛', '蚯蚓', '蜈蚣', '马陆'], 2),
                    '昆虫有六条腿，身体分头、胸、腹三部分。',
                    correct + '有六条腿，身体分三部分，是昆虫。蜘蛛有八条腿，不是昆虫。',
                    '昆虫是动物世界里种类最多的家族。'
                );
            }
        },
        {
            id: 'bio-spider',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '蜘蛛为什么不算昆虫？',
                    '蜘蛛有八条腿，昆虫只有六条腿',
                    ['蜘蛛不会飞', '蜘蛛的身体太小了'],
                    '数一数蜘蛛的腿。',
                    '昆虫有六条腿，身体分头、胸、腹三部分；蜘蛛有八条腿，身体分两部分，所以蜘蛛不是昆虫。',
                    '蜘蛛虽然长得有点吓人，但它们会帮我们捉蚊子。'
                );
            }
        },
        {
            id: 'bio-fish-breath',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '鱼在水里用什么呼吸？',
                    '鳃',
                    ['肺', '皮肤'],
                    '鱼的两边有一片一片的“小扇子”。',
                    '鱼用鳃呼吸，鳃能从水里吸收氧气。',
                    '鲸和海豚住在水里，却用肺呼吸，它们要浮到水面换气。'
                );
            }
        },
        {
            id: 'bio-whale-breath',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '鲸鱼住在水里，它用什么呼吸？',
                    '肺，它要浮到水面换气',
                    ['鳃，和鱼一样', '皮肤，可以直接从水里吸氧'],
                    '鲸鱼是哺乳动物，不是鱼。',
                    '鲸鱼是哺乳动物，用肺呼吸。它不能一直待在水下，要浮到水面喷水换气。',
                    '鲸鱼喷出的“水柱”，其实是它呼气时带出来的水汽。'
                );
            }
        },
        {
            id: 'bio-panda',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '大熊猫最喜欢吃什么？',
                    '竹子',
                    ['小鱼', '蜂蜜'],
                    '大熊猫抱着的那根绿绿的植物是……',
                    '大熊猫主要吃竹子，它有一块特别适合抓竹子的“大拇指”。',
                    '大熊猫虽然叫“熊猫”，但它其实是熊科动物。'
                );
            }
        },
        {
            id: 'bio-hibernate',
            subject: 'biology',
            minGrade: 1,
            make: function (rng) {
                const correct = pick(rng, ['青蛙', '蛇', '刺猬', '乌龟']);
                return item(
                    '下面哪种动物会冬眠？',
                    correct,
                    sample(rng, ['猫', '狗', '鸡', '兔子', '老虎', '马'], 2),
                    '冬天很冷、食物很少，有些动物会睡上一整个冬天。',
                    correct + '会在冬天冬眠，把身体的消耗降到很低。',
                    '刺猬冬眠时，心跳会慢下来很多。'
                );
            }
        },
        {
            id: 'bio-root',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '植物用哪个部分吸收土壤里的水分？',
                    '根',
                    ['叶', '花'],
                    '它藏在泥土里。',
                    '植物的根扎在土里，吸收水分和养分，还能把植物固定住。',
                    '有的植物的根还能储存养分，比如胡萝卜就是一根胖胖的根。'
                );
            }
        },
        {
            id: 'bio-leaf',
            subject: 'biology',
            minGrade: 3,
            make: function () {
                return item(
                    '植物的叶子在阳光下会制造养分，这个过程叫什么？',
                    '光合作用',
                    ['呼吸作用', '蒸腾作用'],
                    '“光”和“合”两个字就在名字里。',
                    '叶子里的叶绿体利用阳光，把水和二氧化碳变成养分，同时放出氧气，这叫光合作用。',
                    '植物制造出来的氧气，是我们呼吸的重要来源。'
                );
            }
        },
        {
            id: 'bio-photosynthesis-gas',
            subject: 'biology',
            minGrade: 3,
            make: function () {
                return item(
                    '植物在阳光下制造养分时，会从空气里吸收什么气体？',
                    '二氧化碳',
                    ['氧气', '氮气'],
                    '人呼出的气体里就有它。',
                    '植物吸收二氧化碳，利用阳光制造养分，再把氧气放出来。',
                    '森林就像地球的大空调，也帮我们净化空气。'
                );
            }
        },
        {
            id: 'bio-seed',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '种子发芽最需要下面哪一组条件？',
                    '水、空气和适宜的温度',
                    ['阳光、糖果和风', '沙子、石头和月光'],
                    '种子也要“喝水”和“呼吸”。',
                    '种子发芽需要水分、空气和合适的温度。很多种子发芽时还不需要阳光。',
                    '有些种子能在土里睡很久，等到条件合适才发芽。'
                );
            }
        },
        {
            id: 'bio-camel',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '骆驼的驼峰里主要储存什么？',
                    '脂肪',
                    ['水', '沙子'],
                    '驼峰不是水袋，它是骆驼的“能量仓库”。',
                    '驼峰里储存的是脂肪，骆驼可以在缺少食物的时候消耗它。',
                    '骆驼可以很久不喝水，还能把尿液变得很浓，减少水分流失。'
                );
            }
        },
        {
            id: 'bio-bat',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '蝙蝠在夜里靠什么辨认方向？',
                    '发出超声波，听回声',
                    ['用眼睛看', '闻气味'],
                    '蝙蝠会发出我们听不到的声音。',
                    '蝙蝠发出超声波，声音碰到物体又弹回来，它靠回声判断前面有什么，这叫回声定位。',
                    '蝙蝠是唯一会飞的哺乳动物。'
                );
            }
        },
        {
            id: 'bio-penguin',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '企鹅为什么不怕冷？',
                    '它有厚厚的脂肪和密密的羽毛',
                    ['它会一直跑步取暖', '它身上有暖气片'],
                    '企鹅胖胖的身体里藏着“保暖层”。',
                    '企鹅有厚厚的脂肪和密密的羽毛，能挡住寒冷。它们还会挤在一起取暖。',
                    '企鹅是鸟，但它不会飞，游泳却非常厉害。'
                );
            }
        },
        {
            id: 'bio-heart',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '心脏的主要工作是什么？',
                    '把血液送到全身',
                    ['帮助我们呼吸', '把食物磨碎'],
                    '摸摸胸口，能感觉到它在“咚咚”跳。',
                    '心脏像一个小水泵，不停地把血液送到全身，给身体送去氧气和养分。',
                    '小朋友的心脏比大人的心脏跳得快一些。'
                );
            }
        },
        {
            id: 'bio-lungs',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '我们呼吸时，空气主要进入身体的哪里？',
                    '肺',
                    ['胃', '心脏'],
                    '空气顺着鼻子、气管，来到两个像气球一样的器官。',
                    '空气从鼻子进入气管，再来到肺里，肺把氧气送进血液。',
                    '我们每天要呼吸很多次，运动时呼吸会变快。'
                );
            }
        },
        {
            id: 'bio-bone',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '骨头的主要作用是什么？',
                    '支撑身体、保护内脏',
                    ['帮助身体出汗', '储存空气'],
                    '想一想没有骨架的雨伞会怎样。',
                    '骨头组成骨架，支撑我们的身体，还保护心、肺、大脑等重要的器官。',
                    '小朋友的骨头还在长，多运动、多晒太阳有助于骨头长得结实。'
                );
            }
        },
        {
            id: 'bio-bee',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '蜜蜂停在花上，主要是在做什么？',
                    '采花蜜，同时帮花传粉',
                    ['给花浇水', '和花聊天'],
                    '蜜蜂身上会沾上花粉。',
                    '蜜蜂采集花蜜当食物，身上沾到的花粉会带到别的花上，帮植物结出果实和种子。',
                    '蜜蜂跳舞可以告诉同伴哪里有花蜜。'
                );
            }
        },
        {
            id: 'bio-butterfly',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '蝴蝶小时候是什么样子？',
                    '毛毛虫',
                    ['小鸟', '小蝴蝶'],
                    '蝴蝶会经历一次神奇的变化。',
                    '蝴蝶小时候是毛毛虫，长大后结茧，再变成有翅膀的蝴蝶，这叫变态发育。',
                    '蝴蝶的翅膀上有很多细小的鳞片，颜色就是这样来的。'
                );
            }
        },
        {
            id: 'bio-food-maker',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '在食物链里，谁能自己制造食物？',
                    '绿色植物',
                    ['兔子', '老虎'],
                    '它们会利用阳光。',
                    '绿色植物利用阳光制造养分，是食物链里的生产者；动物要靠吃植物或其他动物获得能量。',
                    '我们吃的米饭、蔬菜，能量最开始都来自阳光。'
                );
            }
        },
        {
            id: 'bio-chameleon',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '变色龙变色主要是为了什么？',
                    '隐藏自己，也能调节体温',
                    ['给自己化妆去跳舞', '给同伴发消息'],
                    '变色龙要躲避敌人，也要适应冷热。',
                    '变色龙变色可以帮助它融入环境、躲避危险，也能帮助调节体温和表达情绪。',
                    '变色龙的两只眼睛可以分别看向不同方向。'
                );
            }
        },
        {
            id: 'bio-migrate',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '大雁秋天往南飞，是为了什么？',
                    '寻找温暖的地方和更多食物',
                    ['去看望远方的朋友', '躲避月亮'],
                    '冬天北方又冷，食物又少。',
                    '大雁是候鸟，秋天往温暖的南方迁徙，春天再飞回来。',
                    '大雁飞行时排成“人”字或“一”字，可以节省力气。'
                );
            }
        },
        {
            id: 'bio-tadpole',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '小蝌蚪长大后一般会变成什么？',
                    '青蛙',
                    ['小鱼', '蝴蝶'],
                    '小蝌蚪有尾巴，长大后会慢慢长出腿。',
                    '青蛙小时候是小蝌蚪，生活在水里，用鳃呼吸；长大后长出腿和肺，能到岸上生活。',
                    '青蛙的皮肤也能帮助它呼吸一点点氧气。'
                );
            }
        },
        {
            id: 'bio-cactus',
            subject: 'biology',
            minGrade: 3,
            make: function () {
                return item(
                    '仙人掌的刺其实是什么变成的？',
                    '叶子',
                    ['花', '根'],
                    '为了少丢失水分，叶子变成了小小的刺。',
                    '仙人掌生活在干燥的地方，叶子退化成了刺，可以减少水分蒸发，还能保护自己。',
                    '仙人掌的茎胖胖的，里面能储存很多水。'
                );
            }
        },
        {
            id: 'bio-stem',
            subject: 'biology',
            minGrade: 1,
            make: function () {
                return item(
                    '植物的茎主要有什么作用？',
                    '支撑叶子和运输水分',
                    ['吸收阳光做食物', '变成花粉'],
                    '茎像植物的“身体”和“管道”。',
                    '茎把根、叶、花连在一起，支撑植物，还把水和养分从根运到叶子。',
                    '土豆其实是植物的茎，不是根。'
                );
            }
        }
    ];

    /* ----------------------------- 地理题 ----------------------------- */

    const GEOGRAPHY_GENERATORS = [
        {
            id: 'geo-ocean',
            subject: 'geography',
            minGrade: 1,
            make: function (rng) {
                return item(
                    '地球上面积最大的海洋是哪一个？',
                    '太平洋',
                    sample(rng, ['大西洋', '印度洋', '北冰洋'], 2),
                    '它在地球仪上占了很大一大片蓝色。',
                    '太平洋是地球上面积最大、最深的海洋。',
                    '太平洋里有一个叫马里亚纳海沟的地方，是地球最深的地方。'
                );
            }
        },
        {
            id: 'geo-continent',
            subject: 'geography',
            minGrade: 1,
            make: function (rng) {
                return item(
                    '世界上面积最大的大洲是哪一个？',
                    '亚洲',
                    sample(rng, ['非洲', '北美洲', '南美洲', '欧洲'], 2),
                    '我们中国就在这个洲。',
                    '亚洲是世界上面积最大、人口最多的大洲。',
                    '亚洲和欧洲连在一起，合起来叫亚欧大陆。'
                );
            }
        },
        {
            id: 'geo-cold-continent',
            subject: 'geography',
            minGrade: 1,
            make: function (rng) {
                return item(
                    '世界上最冷的大洲是哪一个？',
                    '南极洲',
                    sample(rng, ['非洲', '亚洲', '南美洲'], 2),
                    '那里住着企鹅。',
                    '南极洲在地球最南边，被冰雪覆盖，是世界上最冷的大洲。',
                    '南极洲没有常住居民，只有来考察的科学家。'
                );
            }
        },
        {
            id: 'geo-plateau',
            subject: 'geography',
            minGrade: 3,
            make: function (rng) {
                return item(
                    '世界上海拔最高的高原是哪一个？',
                    '青藏高原',
                    sample(rng, ['云贵高原', '黄土高原', '内蒙古高原'], 2),
                    '它被称为“世界屋脊”。',
                    '青藏高原平均海拔很高，被称为“世界屋脊”，珠穆朗玛峰也在那里。',
                    '青藏高原上空气稀薄，初到那里的人容易高原反应。'
                );
            }
        },
        {
            id: 'geo-yangtze',
            subject: 'geography',
            minGrade: 1,
            make: function (rng) {
                return item(
                    '中国最长的河流是哪一条？',
                    '长江',
                    sample(rng, ['黄河', '珠江', '黑龙江'], 2),
                    '它的名字里有一个“长”字。',
                    '长江是中国最长的河流，也是世界第三长的河流。',
                    '长江流进东海。'
                );
            }
        },
        {
            id: 'geo-desert',
            subject: 'geography',
            minGrade: 3,
            make: function (rng) {
                return item(
                    '世界上最大的热沙漠是哪一个？',
                    '撒哈拉沙漠',
                    sample(rng, ['塔克拉玛干沙漠', '戈壁沙漠', '阿拉伯沙漠'], 2),
                    '它在非洲北部。',
                    '撒哈拉沙漠是世界上最大的热沙漠，白天很热，晚上却很冷。',
                    '沙漠里也会下雪，只是很少见。'
                );
            }
        },
        {
            id: 'geo-everest',
            subject: 'geography',
            minGrade: 1,
            make: function (rng) {
                return item(
                    '世界上海拔最高的山峰是哪一座？',
                    '珠穆朗玛峰',
                    sample(rng, ['泰山', '华山', '富士山'], 2),
                    '它就在青藏高原。',
                    '珠穆朗玛峰是世界最高峰，海拔超过 8800 米。',
                    '珠穆朗玛峰还在慢慢长高。'
                );
            }
        },
        {
            id: 'geo-water-cycle',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '地上的水被太阳晒热后，会变成什么飞上天？',
                    '水蒸气',
                    ['云朵', '雨滴'],
                    '水蒸气是看不见的。',
                    '太阳把水晒热，水变成看不见的水蒸气升到空中，遇冷后变成小水滴，聚在一起就是云。',
                    '我们喝的水，可能很久以前也在云里待过。'
                );
            }
        },
        {
            id: 'geo-rain',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '雨是从哪里来的？',
                    '云里的小水滴聚在一起，落下来',
                    ['天上的水龙头打开了', '月亮洒下来的'],
                    '云里面有很多小水滴。',
                    '云里的小水滴越聚越多、越变越大，空气托不住时，就落下来形成雨。',
                    '雨滴落下来的时候，很多并不是“眼泪形”，而是接近球形。'
                );
            }
        },
        {
            id: 'geo-cloud',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '云是由什么组成的？',
                    '很多小水滴和小冰晶',
                    ['棉花', '烟'],
                    '云飘在天上，却和地上的水有关。',
                    '水蒸气升到高空遇冷，变成小水滴或小冰晶，聚在一起就是云。',
                    '一朵大云里装的水，可能有好几吨重。'
                );
            }
        },
        {
            id: 'geo-rainbow',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '彩虹一般出现在什么时候？',
                    '雨后太阳出来的时候',
                    ['半夜没有月亮的时候', '刮大风的时候'],
                    '彩虹需要阳光和小水滴一起帮忙。',
                    '雨后空气里有很多小水滴，阳光穿过水滴时被分解成七种颜色，就出现了彩虹。',
                    '彩虹其实是圆的，只是我们在地面上通常只能看到一半。'
                );
            }
        },
        {
            id: 'geo-wind',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '风是怎么形成的？',
                    '空气流动起来',
                    ['大树在吹气', '云在跑步'],
                    '空气看不见，但它也会流动。',
                    '太阳把地面晒热得不均匀，热空气上升，冷空气流过来补充，空气流动就形成了风。',
                    '风也能发电，风力发电机就是把风的能量变成电。'
                );
            }
        },
        {
            id: 'geo-thunder',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '雷雨天，为什么先看到闪电，后听到雷声？',
                    '光比声音传播得快',
                    ['闪电比雷声跑得慢', '雷声在云里休息了一会儿'],
                    '光一秒能跑很远，声音要慢得多。',
                    '闪电和雷声其实同时发生，但光跑得比声音快，所以我们先看到闪电，再听到雷声。',
                    '数一数闪电到雷声隔了几秒，可以估计雷离我们有多远。'
                );
            }
        },
        {
            id: 'geo-snow',
            subject: 'geography',
            minGrade: 3,
            make: function () {
                return item(
                    '雪为什么看起来是白色的？',
                    '冰晶把阳光反射得到处都是',
                    ['雪里加了白色颜料', '雪是白云变的'],
                    '雪是很多透明的小冰晶组成的。',
                    '雪由透明的小冰晶组成，它们把阳光反复反射，我们的眼睛看到的就是白色。',
                    '雪很安静，因为它有很多小孔，能吸收声音。'
                );
            }
        },
        {
            id: 'geo-volcano',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '火山喷发时，从地底下喷出来的是什么？',
                    '岩浆、火山灰和气体',
                    ['河水', '云朵'],
                    '地球内部很热，岩石会熔化成岩浆。',
                    '地球内部的岩浆沿着地壳的裂缝喷出来，就形成了火山喷发，还会带出火山灰和气体。',
                    '火山灰会让土壤变得肥沃，但火山喷发也很危险，要远离。'
                );
            }
        },
        {
            id: 'geo-earthquake',
            subject: 'geography',
            minGrade: 3,
            make: function () {
                return item(
                    '地震主要是地球的什么在运动？',
                    '地壳里的板块',
                    ['大海的波浪', '空气'],
                    '地球的表面不是一整块，而是分成很多块。',
                    '地球表面由很多板块拼成，板块运动、碰撞时，地壳会震动，就发生了地震。',
                    '科学家用地震仪记录地震的震动。'
                );
            }
        },
        {
            id: 'geo-delta',
            subject: 'geography',
            minGrade: 3,
            make: function () {
                return item(
                    '河流入海的地方，泥沙堆积常形成什么？',
                    '三角洲',
                    ['火山', '瀑布'],
                    '泥沙在河口慢慢堆成一个三角形。',
                    '河流把泥沙带到入海口，水流变慢，泥沙沉积下来，时间久了就形成了三角洲。',
                    '长江入海口就有不断长大的三角洲。'
                );
            }
        },
        {
            id: 'geo-map',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '地图上蓝色的部分通常表示什么？',
                    '水',
                    ['森林', '沙漠'],
                    '想一想海洋和湖泊的颜色。',
                    '地图上常用蓝色表示河流、湖泊和海洋，用绿色表示森林或平原。',
                    '地图上的方向通常是“上北下南、左西右东”。'
                );
            }
        },
        {
            id: 'geo-compass',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '指南针的 N 极一般指向哪里？',
                    '北方',
                    ['南方', '东方'],
                    'N 是英文 north 的第一个字母。',
                    '指南针能感应地球磁场，N 极一般指向北方，帮助人们辨认方向。',
                    '中国古代的司南是指南针的祖先。'
                );
            }
        },
        {
            id: 'geo-water-percent',
            subject: 'geography',
            minGrade: 3,
            make: function () {
                return item(
                    '地球表面大约有多少被水覆盖？',
                    '大约七成',
                    ['大约三成', '大约一半'],
                    '从太空看，地球大部分是蓝色的。',
                    '地球表面大约 71% 是水，所以我们叫它“蓝色星球”。',
                    '虽然水很多，但能直接喝的淡水却很少。'
                );
            }
        },
        {
            id: 'geo-recycle',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '下面哪种做法对地球更友好？',
                    '把垃圾分类投放',
                    ['把垃圾扔进河里', '把没写完的本子撕掉'],
                    '保护环境要从小事做起。',
                    '垃圾分类能让有用的东西被回收，减少污染，让地球更干净。',
                    '一个玻璃瓶可以回收再利用很多次。'
                );
            }
        },
        {
            id: 'geo-save-water',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '下面哪种做法能节约用水？',
                    '用洗菜的水浇花',
                    ['刷牙时一直开着水龙头', '洗车时一直冲水'],
                    '一水多用是个好办法。',
                    '洗菜水可以浇花、冲厕所，刷牙时关掉水龙头，都能节约用水。',
                    '地球上能直接喝的淡水非常少，我们要珍惜。'
                );
            }
        },
        {
            id: 'geo-equator',
            subject: 'geography',
            minGrade: 3,
            make: function () {
                return item(
                    '地球上最热的地方大多在哪里？',
                    '赤道附近',
                    ['南极附近', '高山顶上'],
                    '那里一年到头太阳都照得比较直。',
                    '赤道附近阳光照射的角度比较直，接受的热量多，所以大多数地方很热。',
                    '赤道附近也有雪山，因为高山顶上的温度很低。'
                );
            }
        },
        {
            id: 'geo-sea-salt',
            subject: 'geography',
            minGrade: 3,
            make: function () {
                return item(
                    '海水为什么是咸的？',
                    '雨水把岩石里的盐分冲进海里，水分蒸发后盐留了下来',
                    ['有人往海里撒了很多盐', '鱼的眼泪是咸的'],
                    '雨水会冲刷岩石和土壤。',
                    '雨水流过岩石和土壤，带走一些盐分，最后流进大海；海水蒸发时盐留了下来，所以海水越来越咸。',
                    '死海里的水特别咸，人很容易浮起来。'
                );
            }
        },
        {
            id: 'geo-china-lake',
            subject: 'geography',
            minGrade: 3,
            make: function () {
                return item(
                    '中国最大的淡水湖是哪一个？',
                    '鄱阳湖',
                    ['洞庭湖', '青海湖'],
                    '它在江西省。',
                    '鄱阳湖是中国最大的淡水湖。青海湖虽然更大，但它是咸水湖。',
                    '鄱阳湖到了冬天，会变成很多候鸟的家。'
                );
            }
        },
        {
            id: 'geo-yellow-river',
            subject: 'geography',
            minGrade: 1,
            make: function () {
                return item(
                    '黄河最终流入哪个海？',
                    '渤海',
                    ['东海', '南海'],
                    '它在中国的北方。',
                    '黄河从青藏高原出发，流经很多地方，最后流入渤海。',
                    '黄河因为携带大量泥沙，水看起来黄黄的。'
                );
            }
        }
    ];

    /* ----------------------------- 物理题 ----------------------------- */

    const PHYSICS_GENERATORS = [
        {
            id: 'phy-float',
            subject: 'physics',
            minGrade: 1,
            make: function (rng) {
                const correct = pick(rng, FLOATERS);
                return item(
                    '下面哪种东西放进水里会浮起来？',
                    correct,
                    sample(rng, SINKERS, 2),
                    '想一想木头和石头，谁会漂在水上。',
                    correct + '比水轻，能浮在水面上。石头、铁钉这类东西比水重，会沉下去。',
                    '钢铁做的大船也能浮在水上，是因为船里面有空气，整体变轻了。'
                );
            }
        },
        {
            id: 'phy-sink',
            subject: 'physics',
            minGrade: 1,
            make: function (rng) {
                const correct = pick(rng, SINKERS);
                return item(
                    '下面哪种东西放进水里会沉下去？',
                    correct,
                    sample(rng, FLOATERS, 2),
                    '想一想，哪种东西比水更重。',
                    correct + '比水重，放进水里会沉下去。木块、泡沫和乒乓球则会浮起来。',
                    '潜水艇可以通过装水或排水，让自己下沉或上浮。'
                );
            }
        },
        {
            id: 'phy-shadow',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '影子是怎么形成的？',
                    '光被不透明的物体挡住了',
                    ['物体自己会发出黑光', '影子是从地上长出来的'],
                    '有光、有物体挡着，才会出现影子。',
                    '光沿直线传播，遇到不透明的物体就被挡住，物体后面照不到光的地方就形成了影子。',
                    '影子的方向和太阳的方向相反。'
                );
            }
        },
        {
            id: 'phy-shadow-length',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '太阳下，我们的影子什么时候最长？',
                    '早晨或傍晚，太阳很低的时候',
                    ['中午太阳最高的时候', '阴天的时候'],
                    '太阳越低，影子被拉得越长。',
                    '太阳在天空中的位置越低，光线越斜，影子就被拉得越长。早晨和傍晚太阳比较低，所以影子最长。',
                    '古人会用影子的长短来判断时间。'
                );
            }
        },
        {
            id: 'phy-mirror',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '镜子能照出我们，是因为？',
                    '光被镜子反射了回来',
                    ['镜子会自己拍照', '镜子后面藏着小精灵'],
                    '光遇到光滑的表面会“弹”回来。',
                    '镜子表面很光滑，光照到镜子上会反射回来，我们就看到了镜子里的人。',
                    '平静的水面也能像镜子一样反射景物。'
                );
            }
        },
        {
            id: 'phy-refraction',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '把筷子斜放进水里，看起来像折断了，是因为？',
                    '光从水里进入空气时拐了弯',
                    ['水把筷子压弯了', '筷子真的断了'],
                    '光在不同东西里跑的速度不一样。',
                    '光从水进入空气时会改变方向，这叫折射。我们的眼睛顺着光看，就会觉得筷子在水面处折了一下。',
                    '渔民叉鱼时要瞄准鱼的下方，因为看到的位置比实际浅。'
                );
            }
        },
        {
            id: 'phy-rainbow',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '彩虹的颜色是怎么来的？',
                    '阳光穿过小水滴时被分解成多种颜色',
                    ['天空涂了彩色颜料', '云朵变魔术'],
                    '阳光看起来是白色的，其实藏着很多颜色。',
                    '阳光进入小水滴时会折射、反射，不同颜色的光分开，就形成了彩虹。',
                    '彩虹的颜色顺序是红、橙、黄、绿、蓝、靛、紫。'
                );
            }
        },
        {
            id: 'phy-sound',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '声音是怎么产生的？',
                    '物体振动产生的',
                    ['物体发光产生的', '空气自己唱歌'],
                    '把手放在喉咙上说话，能感觉到什么？',
                    '物体振动时，会推动周围的空气，形成声波，传到耳朵里就是声音。',
                    '声音在真空中不能传播，所以太空里听不到爆炸声。'
                );
            }
        },
        {
            id: 'phy-vacuum',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '宇航员在太空里能直接听到彼此说话吗？',
                    '不能，太空几乎没有空气，声音传不过去',
                    ['能，声音可以穿过星星', '能，只要大声喊就行'],
                    '声音需要空气、水或固体来传播。',
                    '声音要靠介质传播，太空几乎是真空，没有空气，所以声音传不过去。宇航员要用无线电通话。',
                    '无线电波不需要空气，也能在太空里传播。'
                );
            }
        },
        {
            id: 'phy-echo',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '在山谷里喊一声会听到回声，是因为？',
                    '声音碰到山壁反射回来',
                    ['山里有另一个你', '云把声音送回来'],
                    '声音也会“弹回来”。',
                    '声音以声波的形式传播，遇到山壁会反射回来，再次进入耳朵，就听到了回声。',
                    '蝙蝠就是靠回声定位在夜里飞行的。'
                );
            }
        },
        {
            id: 'phy-drum',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '敲鼓时，鼓面上的小纸屑为什么会跳？',
                    '鼓面在振动',
                    ['纸屑害怕声音', '鼓里有一阵风'],
                    '敲鼓时，鼓面是不是在抖？',
                    '敲鼓让鼓面振动，振动传给纸屑，纸屑就跳起来了。',
                    '声音越大，鼓面振动得越厉害。'
                );
            }
        },
        {
            id: 'phy-gravity',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '苹果熟了会掉到地上，而不是飞上天，是因为？',
                    '地球有引力',
                    ['苹果想回家', '风把它吹下来'],
                    '地球像一块大磁铁，不过它吸的是所有东西。',
                    '地球对物体有引力，把苹果往地面拉，所以苹果会掉下来。',
                    '月亮也被地球的引力拉着，所以一直绕着地球转。'
                );
            }
        },
        {
            id: 'phy-jump',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '我们跳起来后还会落回地面，是因为？',
                    '地球引力把我们拉回来',
                    ['鞋子太重了', '空气把我们压下来'],
                    '地球一直在向下拉我们。',
                    '地球的引力把我们拉向地面，所以我们跳起来后还会落回去。',
                    '在月球上引力小，宇航员能跳得更高。'
                );
            }
        },
        {
            id: 'phy-inertia',
            subject: 'physics',
            minGrade: 5,
            make: function () {
                return item(
                    '汽车突然刹车时，人会向前倾，是因为？',
                    '人还保持着向前运动的惯性',
                    ['座位把人推向前', '地球引力突然变大了'],
                    '物体总想保持原来的运动状态。',
                    '车突然停下时，人的身体还想继续向前运动，这种性质叫惯性。所以坐车要系好安全带。',
                    '系安全带能在急刹车时保护我们。'
                );
            }
        },
        {
            id: 'phy-friction',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '在冰面上走路容易滑倒，是因为？',
                    '冰面很光滑，摩擦力小',
                    ['冰面太粗糙了', '冰面没有引力'],
                    '摩擦力能帮我们站稳。',
                    '冰面很光滑，鞋底和冰面之间的摩擦力很小，所以容易滑倒。',
                    '汽车轮胎上有花纹，是为了增加摩擦力。'
                );
            }
        },
        {
            id: 'phy-magnet',
            subject: 'physics',
            minGrade: 1,
            make: function (rng) {
                const correct = pick(rng, ['铁钉', '回形针', '铁勺']);
                return item(
                    '磁铁能吸住下面哪个东西？',
                    correct,
                    sample(rng, ['塑料积木', '木筷子', '玻璃珠', '橡皮'], 2),
                    '磁铁最喜欢“铁”。',
                    '磁铁能吸引铁、钴、镍等材料。塑料、木头、玻璃和橡皮一般不能被磁铁吸住。',
                    '指南针里就有一根小小的磁针。'
                );
            }
        },
        {
            id: 'phy-heat-conductor',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '下面哪种材料导热最快？',
                    '金属勺子',
                    ['木筷子', '塑料勺'],
                    '金属摸起来常常凉凉的，因为它很快把热量传走。',
                    '金属是热的良导体，传热快；木头和塑料传热慢，所以常用来做锅柄。',
                    '锅身用金属，锅柄用木头或塑料，就是为了既导热又不烫手。'
                );
            }
        },
        {
            id: 'phy-melting',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '冰块放在室温下会慢慢变成水，这个现象叫？',
                    '融化',
                    ['蒸发', '凝结'],
                    '冰从固态变成了液态。',
                    '冰吸收周围的热量，变成水，这个过程叫融化。',
                    '水结冰时体积会变大，所以冰块会浮在水面上。'
                );
            }
        },
        {
            id: 'phy-steam',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '水烧开时，壶嘴冒出的白气是什么？',
                    '水蒸气遇冷变成的小水滴',
                    ['烟', '空气'],
                    '真正的水蒸气是看不见的。',
                    '水烧开变成水蒸气，水蒸气从壶嘴出来遇到较冷的空气，凝结成小水滴，就是我们看到的白气。',
                    '冬天呼出的白气，也是同样的道理。'
                );
            }
        },
        {
            id: 'phy-thermometer',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '温度计放进热水里，液柱会上升，是因为？',
                    '液体受热膨胀',
                    ['水跑进了温度计', '温度计害怕热水'],
                    '大多数物体受热会变大一点。',
                    '温度计里的液体受热后体积膨胀，液柱就上升了；遇冷收缩，液柱就下降。',
                    '夏天架电线时会留一点空隙，防止电线受热膨胀后绷断。'
                );
            }
        },
        {
            id: 'phy-jacket',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '冬天穿羽绒服为什么暖和？',
                    '羽绒里有大量空气，空气不容易传热',
                    ['羽绒服自己会发热', '羽绒服把冷气吃掉了'],
                    '蓬松的衣服里藏着很多空气。',
                    '羽绒蓬松，里面有很多空气。空气是热的不良导体，能帮我们保住身体的热量。',
                    '羽绒服不是越厚越暖，蓬松度也很重要。'
                );
            }
        },
        {
            id: 'phy-circuit',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '下面哪种材料能让电流通过？',
                    '铜线',
                    ['塑料尺', '木筷子'],
                    '电线里面那根亮亮的金属就是它。',
                    '铜是导体，能让电流通过。塑料、木头、橡皮是绝缘体，电流不容易通过。',
                    '导线外面包着塑料，是为了保护我们不触电。'
                );
            }
        },
        {
            id: 'phy-bulb',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '小灯泡为什么会亮？',
                    '电流通过灯丝，灯丝发热发光',
                    ['灯泡里有萤火虫', '玻璃自己会发光'],
                    '灯泡里有一根细细的灯丝。',
                    '电流通过灯丝时，灯丝会发热，温度很高就发出光来。',
                    '灯泡用久了会变黑，是因为灯丝慢慢蒸发了。'
                );
            }
        },
        {
            id: 'phy-door',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '推门时，推门把手比推门轴附近更省力，是因为？',
                    '离门轴越远，力臂越长，越省力',
                    ['门把手更好看', '门轴附近有胶水'],
                    '门是一根会转动的“大杠杆”。',
                    '门把手离门轴远，力臂长，用同样的力能产生更大的转动效果，所以更省力。',
                    '杠杆原理在我们生活里到处都是，比如开瓶器。'
                );
            }
        },
        {
            id: 'phy-static',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '冬天脱毛衣时会听到噼啪声，是因为？',
                    '摩擦产生了静电',
                    ['毛衣在说话', '空气裂开了'],
                    '两个东西摩擦后，会带上小小的电荷。',
                    '毛衣和身体摩擦会产生静电，静电放电时会有小小的噼啪声。',
                    '静电也能让气球吸住小纸屑。'
                );
            }
        },
        {
            id: 'phy-light-speed',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '光和声音，谁跑得更快？',
                    '光快得多',
                    ['声音快得多', '一样快'],
                    '雷雨天，我们先看到闪电，再听到雷声。',
                    '光每秒能跑大约 30 万公里，声音每秒只能跑大约 340 米，所以光快得多。',
                    '我们先看到闪电后听到雷声，就是这个原因。'
                );
            }
        },
        {
            id: 'phy-ice-float',
            subject: 'physics',
            minGrade: 1,
            make: function () {
                return item(
                    '把冰块放进水里，它会怎样？',
                    '浮在水面上',
                    ['沉到水底', '马上变成水蒸气'],
                    '冰比同体积的水轻一点。',
                    '水结成冰后体积会变大，密度变小，所以冰会浮在水面上。',
                    '冰山能浮在海面上，也是这个道理。'
                );
            }
        },
        {
            id: 'phy-air-pressure',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '用吸管喝饮料，饮料是被什么压上来的？',
                    '大气压',
                    ['嘴巴的吸力', '地球引力'],
                    '吸吸管时，管里的空气变少了。',
                    '吸吸管时，管里的空气减少，外面的大气压就把饮料压了上来。',
                    '吸盘能吸在墙上，也是大气压的功劳。'
                );
            }
        },
        {
            id: 'phy-hot-air',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '热气球为什么能升上天空？',
                    '热空气比同体积的冷空气轻',
                    ['气球外面画了翅膀', '热空气会往下沉'],
                    '热空气会往上飘。',
                    '热气球里的空气被加热后变轻，产生向上的浮力，热气球就升起来了。',
                    '热气球飞行时，飞行员会通过加热或放气来控制高度。'
                );
            }
        },
        {
            id: 'phy-magnet-paper',
            subject: 'physics',
            minGrade: 3,
            make: function () {
                return item(
                    '磁铁隔着一张纸，还能吸住纸下面的铁钉吗？',
                    '能，磁力可以穿过纸',
                    ['不能，被纸挡住了', '只有纸湿了才能吸住'],
                    '磁力不需要碰到物体也能起作用。',
                    '磁力可以穿过纸、塑料等薄薄的东西，所以隔着纸也能吸住铁钉。',
                    '冰箱贴能吸在冰箱上，也是磁力的作用。'
                );
            }
        }
    ];

    /* ----------------------------- 化学题 ----------------------------- */

    const CHEMISTRY_GENERATORS = [
        {
            id: 'chem-chemical-change',
            subject: 'chemistry',
            minGrade: 3,
            make: function (rng) {
                const correct = pick(rng, CHEMICAL_CHANGES);
                const distractors = sample(rng, PHYSICAL_CHANGES, 2);
                return item(
                    '下面哪个变化会产生新物质？',
                    correct,
                    distractors,
                    '产生新物质的变化，通常叫化学变化。',
                    correct + '会产生新物质，是化学变化。像' + distractors[0] + '只是形状或状态变了，是物理变化。',
                    '化学变化常常伴随发光、发热、变色或冒气泡。'
                );
            }
        },
        {
            id: 'chem-physical-change',
            subject: 'chemistry',
            minGrade: 3,
            make: function (rng) {
                const correct = pick(rng, PHYSICAL_CHANGES);
                const distractors = sample(rng, CHEMICAL_CHANGES, 2);
                return item(
                    '下面哪个变化没有产生新物质，只是形状或状态变了？',
                    correct,
                    distractors,
                    '没有新物质产生的变化，叫物理变化。',
                    correct + '只是形状或状态发生了变化，没有产生新物质，属于物理变化。',
                    '把纸撕碎还是纸，把纸烧掉就不再是纸了。'
                );
            }
        },
        {
            id: 'chem-rust',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '铁钉放在潮湿的地方会生锈，这是为什么？',
                    '铁和水、氧气发生了反应，生成了铁锈',
                    ['铁被水泡软了', '铁钉累了，需要休息'],
                    '铁生锈需要水和氧气一起帮忙。',
                    '铁在潮湿的空气里，会和氧气、水发生化学反应，生成红褐色的铁锈。',
                    '把铁钉擦干、涂上油，能减慢生锈。'
                );
            }
        },
        {
            id: 'chem-prevent-rust',
            subject: 'chemistry',
            minGrade: 1,
            make: function () {
                return item(
                    '下面哪种办法能防止铁生锈？',
                    '擦干后涂上油或油漆',
                    ['经常把铁泡在水里', '放在潮湿的角落里'],
                    '铁生锈需要水和氧气。',
                    '把铁擦干、涂油或刷漆，可以隔绝水和氧气，减慢生锈。',
                    '自行车链条经常上油，就是为了防锈和减少摩擦。'
                );
            }
        },
        {
            id: 'chem-dissolve',
            subject: 'chemistry',
            minGrade: 1,
            make: function () {
                return item(
                    '糖放进水里慢慢不见了，这个过程叫？',
                    '溶解',
                    ['融化', '蒸发'],
                    '糖还在水里，只是看不见了。',
                    '糖分散到水里，变成看不见的小颗粒，这叫溶解。融化是固体变成液体，比如冰变成水。',
                    '把糖水煮干，糖还会重新出现。'
                );
            }
        },
        {
            id: 'chem-dissolve-which',
            subject: 'chemistry',
            minGrade: 1,
            make: function (rng) {
                const correct = pick(rng, ['盐', '白糖', '小苏打']);
                return item(
                    '下面哪种东西能溶解在水里？',
                    correct,
                    sample(rng, ['沙子', '食用油', '小石子'], 2),
                    '能溶解的东西放进水里会“消失”。',
                    correct + '能溶解在水里。沙子和小石子不会溶解，油会浮在水面上。',
                    '热水通常能让糖和盐溶解得更快。'
                );
            }
        },
        {
            id: 'chem-dissolve-fast',
            subject: 'chemistry',
            minGrade: 1,
            make: function () {
                return item(
                    '怎样能让糖在水里溶解得更快？',
                    '用勺子搅拌，或者用温水',
                    ['把水放进冰箱', '把糖块做得更大'],
                    '搅拌和加热都能帮忙。',
                    '搅拌能让糖和水接触得更充分，温水能让糖分子运动得更快，所以溶解得更快。',
                    '把糖磨成糖粉，也会溶解得更快。'
                );
            }
        },
        {
            id: 'chem-oil-water',
            subject: 'chemistry',
            minGrade: 1,
            make: function () {
                return item(
                    '把食用油倒进水里，搅拌后会怎样？',
                    '油和水会分层，油浮在上面',
                    ['油和水会完全融合', '油会沉到杯底'],
                    '油和水不是好朋友。',
                    '油和水不相溶，油的密度比水小，所以会浮在水面上形成一层。',
                    '洗油碗时，洗洁精能帮助油和水暂时“拉手”，把油污带走。'
                );
            }
        },
        {
            id: 'chem-baking-soda',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '小苏打和白醋混在一起，会冒出很多气泡，这些气泡是什么气体？',
                    '二氧化碳',
                    ['氧气', '水蒸气'],
                    '小苏打和白醋会发生化学反应。',
                    '小苏打和白醋反应会生成二氧化碳气体，所以会冒泡。',
                    '做馒头时也会用到小苏打，产生的气体能让馒头变松软。'
                );
            }
        },
        {
            id: 'chem-water-ice',
            subject: 'chemistry',
            minGrade: 1,
            make: function () {
                return item(
                    '水变成冰，是什么变化？',
                    '物理变化',
                    ['化学变化', '没有发生任何变化'],
                    '水还是水，只是从液态变成了固态。',
                    '水结冰只是状态变了，物质还是水，没有产生新物质，所以是物理变化。',
                    '冰融化后又变回水，还是同一种物质。'
                );
            }
        },
        {
            id: 'chem-candle',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '蜡烛燃烧后，蜡变成了什么？',
                    '二氧化碳、水蒸气等新物质',
                    ['只是变小了，没有新物质', '变成了石头'],
                    '蜡烛燃烧需要氧气。',
                    '蜡烛燃烧时，蜡和氧气反应，生成二氧化碳和水蒸气等新物质，所以是化学变化。',
                    '蜡烛熄灭后冒出的白烟，是蜡蒸气凝成的小颗粒。'
                );
            }
        },
        {
            id: 'chem-oxygen',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '空气中能帮助燃烧的气体主要是？',
                    '氧气',
                    ['二氧化碳', '氮气'],
                    '我们呼吸也离不开它。',
                    '氧气能支持燃烧，我们呼吸时也需要氧气。氮气在空气里最多，但它不能帮助燃烧。',
                    '空气中的氧气大约占 21%。'
                );
            }
        },
        {
            id: 'chem-co2-fire',
            subject: 'chemistry',
            minGrade: 1,
            make: function () {
                return item(
                    '二氧化碳可以用来做什么？',
                    '灭火',
                    ['帮助燃烧', '让植物睡觉'],
                    '二氧化碳不支持燃烧。',
                    '二氧化碳不支持燃烧，也不容易燃烧，所以灭火器会喷出二氧化碳来灭火。',
                    '二氧化碳也是植物光合作用需要的原料。'
                );
            }
        },
        {
            id: 'chem-natural-material',
            subject: 'chemistry',
            minGrade: 1,
            make: function (rng) {
                const correct = pick(rng, ['木头', '棉花', '羊毛']);
                return item(
                    '下面哪种材料是天然材料？',
                    correct,
                    sample(rng, ['塑料', '尼龙', '人造纤维'], 2),
                    '天然材料来自大自然，不是工厂合成的。',
                    correct + '来自大自然，是天然材料。塑料、尼龙和人造纤维是人工合成的材料。',
                    '棉花可以织成布，木头可以做成桌椅。'
                );
            }
        },
        {
            id: 'chem-bread-sweet',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '馒头在嘴里嚼久了会变甜，是因为？',
                    '唾液把一部分淀粉变成了糖',
                    ['馒头里加了糖', '牙齿把馒头磨甜了'],
                    '我们的口水里藏着“小帮手”。',
                    '唾液里的消化酶会把馒头里的淀粉分解成有甜味的糖，所以越嚼越甜。',
                    '米饭嚼久了也会变甜，也是同样的道理。'
                );
            }
        },
        {
            id: 'chem-boiled-egg',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '鸡蛋煮熟后，蛋清从透明变成白色，这是什么变化？',
                    '化学变化',
                    ['物理变化', '只是温度变高了'],
                    '蛋清里的蛋白质发生了变化。',
                    '加热让蛋清里的蛋白质结构改变，变成了白色的固体，这是化学变化。',
                    '鸡蛋煮熟后，即使变凉，也不会变回透明的蛋清。'
                );
            }
        },
        {
            id: 'chem-sea-salt',
            subject: 'chemistry',
            minGrade: 1,
            make: function () {
                return item(
                    '海水晒盐，是利用太阳把海水里的什么晒掉？',
                    '水分',
                    ['盐', '沙子'],
                    '太阳会把水变成水蒸气。',
                    '太阳晒海水，水分蒸发到空气里，盐就留在下面，这就是晒盐。',
                    '盐田就是一块块用来晒海水的浅水池。'
                );
            }
        },
        {
            id: 'chem-air-space',
            subject: 'chemistry',
            minGrade: 1,
            make: function () {
                return item(
                    '空气看不见，它占据空间吗？',
                    '占据空间，吹气球就能看到',
                    ['不占据空间，因为看不见', '只在天上才占据空间'],
                    '把空气吹进气球，气球会变大。',
                    '空气虽然看不见，但它有质量，也占据空间。吹气球时，空气把气球撑大了。',
                    '我们周围到处都是空气，它还有重量。'
                );
            }
        },
        {
            id: 'chem-evaporation',
            subject: 'chemistry',
            minGrade: 1,
            make: function () {
                return item(
                    '湿衣服晾在太阳下会变干，水到哪里去了？',
                    '变成水蒸气跑到空气里了',
                    ['渗进衣服里了', '被太阳吃掉了'],
                    '水会蒸发。',
                    '太阳把衣服上的水晒热，水变成看不见的水蒸气，跑到空气里，衣服就干了。',
                    '水蒸气是看不见的，我们看到的白气是小水滴。'
                );
            }
        },
        {
            id: 'chem-condensation',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '冰饮料杯外面会冒小水珠，这些小水珠从哪里来？',
                    '空气中的水蒸气遇冷凝结成的小水滴',
                    ['杯子漏出来的水', '冰融化的水'],
                    '杯子外面并没有破洞。',
                    '空气里的水蒸气碰到冰冷的杯壁，遇冷凝结成小水珠，附着在杯子外面。',
                    '冬天窗玻璃上的水珠，也是水蒸气凝结形成的。'
                );
            }
        },
        {
            id: 'chem-candle-glass',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '用玻璃杯盖住燃烧的蜡烛，蜡烛会熄灭，是因为？',
                    '杯里的氧气用完了',
                    ['热量被玻璃吸走了', '蜡烛害怕黑暗'],
                    '燃烧需要氧气。',
                    '玻璃杯里的空气有限，蜡烛燃烧消耗掉氧气后，就无法继续燃烧，所以熄灭了。',
                    '做这个观察时，一定要请大人陪同，注意用火安全。'
                );
            }
        },
        {
            id: 'chem-nitrogen',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '空气里含量最多的气体是什么？',
                    '氮气',
                    ['氧气', '二氧化碳'],
                    '它大约占了空气的百分之七十八。',
                    '空气中氮气最多，大约占 78%；氧气约占 21%，其他气体很少。',
                    '氮气虽然不能帮助我们呼吸，但它是空气的重要成分。'
                );
            }
        },
        {
            id: 'chem-mixture',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '下面哪个是混合物？',
                    '空气',
                    ['蒸馏水', '氧气'],
                    '混合物由两种或多种物质组成。',
                    '空气里有氮气、氧气、二氧化碳等多种气体，是混合物。蒸馏水和氧气都是比较纯净的物质。',
                    '海水也是混合物，里面有水和很多溶解的盐。'
                );
            }
        },
        {
            id: 'chem-vinegar',
            subject: 'chemistry',
            minGrade: 3,
            make: function () {
                return item(
                    '柠檬尝起来酸酸的，说明它含有哪一类物质？',
                    '酸性物质',
                    ['碱性物质', '食盐'],
                    '酸味通常来自酸性物质。',
                    '柠檬里有柠檬酸，所以尝起来酸酸的。',
                    '柠檬汁还能帮助去除水壶里的水垢。'
                );
            }
        }
    ];

    /* ----------------------------- 题库汇总 ----------------------------- */

    const GENERATORS = ASTRONOMY_GENERATORS
        .concat(BIOLOGY_GENERATORS)
        .concat(GEOGRAPHY_GENERATORS)
        .concat(PHYSICS_GENERATORS)
        .concat(CHEMISTRY_GENERATORS);

    /* ----------------------------- 生成题目 ----------------------------- */

    function subjectOf(generator) {
        return SUBJECT_BY_ID[generator.subject] || SUBJECT_LIST[0];
    }

    function pickGenerator(rng, candidates, opts) {
        const themeId = opts.themeId;
        const recentSubjects = opts.recentSubjects || [];
        const weakSubjectId = opts.weakSubjectId;
        let total = 0;
        const weights = candidates.map(function (generator) {
            let w = 1;
            if (generator.subject === themeId) {
                w *= opts.preferTheme === false ? 1.25 : 2.6;
            }
            if (recentSubjects.indexOf(generator.subject) !== -1) w *= 0.55;
            if (weakSubjectId && generator.subject === weakSubjectId) w *= 1.35;
            total += w;
            return w;
        });
        let roll = rng() * total;
        for (let i = 0; i < candidates.length; i++) {
            roll -= weights[i];
            if (roll <= 0) return candidates[i];
        }
        return candidates[candidates.length - 1];
    }

    function emergencyQuestion(rng) {
        const names = PLANETS.map(function (p) { return p.name; }).filter(function (name) {
            return name !== '水星';
        });
        const distractors = shuffle(rng, names).slice(0, 2);
        const options = shuffle(rng, ['水星', distractors[0], distractors[1]]);
        return {
            subject: '天文',
            subjectId: 'astronomy',
            scene: pick(rng, SCENES.astronomy),
            question: '太阳系里，离太阳最近的行星是哪一颗？',
            options: options,
            correctIndex: options.indexOf('水星'),
            hint: '太阳系的行星顺序是：水星、金星、地球……',
            explain: '离太阳最近的行星是水星。它绕太阳转一圈只要大约 88 天。',
            feedback_correct: '答对啦！你的观察力真棒！',
            feedback_wrong: '再想一想，太阳系的第一颗行星叫什么名字？',
            fun_fact: '水星白天很热，晚上却很冷。',
            source: 'local',
            createdAt: Date.now()
        };
    }

    function generateQuestion(options) {
        const opts = options || {};
        const gradeBand = [1, 3, 5].indexOf(opts.gradeBand) !== -1 ? opts.gradeBand : 3;
        const theme = SUBJECT_BY_ID[opts.themeId] || themeForDay('', opts.studentId || '');
        const seedBase = String(opts.seed != null ? opts.seed : Date.now()) + '|' + (opts.studentId || '') + '|' + gradeBand + '|' + theme.id;
        const rng = mulberry32(hashString(seedBase));

        const candidates = GENERATORS.filter(function (generator) {
            return generator.minGrade <= gradeBand;
        });
        if (!candidates.length) return emergencyQuestion(rng);

        const avoidSignatures = {};
        (opts.avoidSignatures || []).forEach(function (sig) {
            avoidSignatures[String(sig)] = true;
        });
        const avoidQuestions = {};
        (opts.avoidQuestions || []).forEach(function (text) {
            avoidQuestions[normalizeText(text)] = true;
        });

        const pickOpts = {
            themeId: theme.id,
            recentSubjects: Array.isArray(opts.recentSubjects) ? opts.recentSubjects : [],
            weakSubjectId: opts.weakSubjectId || '',
            preferTheme: opts.preferTheme !== false
        };

        let lastQuestion = null;
        for (let attempt = 0; attempt < 36; attempt++) {
            const generator = pickGenerator(rng, candidates, pickOpts);
            const subject = subjectOf(generator);
            let raw;
            try {
                raw = generator.make(rng, { gradeBand: gradeBand });
            } catch (error) {
                raw = null;
            }
            const question = buildQuestion(raw, subject, rng);
            if (!question) continue;
            lastQuestion = question;
            if (avoidSignatures[question.signature]) continue;
            if (avoidQuestions[normalizeText(question.question)]) continue;
            return question;
        }

        if (lastQuestion) return lastQuestion;
        return emergencyQuestion(rng);
    }

    /* ----------------------------- 聊天兜底 ----------------------------- */

    const CHAT_FALLBACKS = [
        {
            test: /天空|蓝色|蓝蓝/,
            reply: '天空看起来是蓝色的，是因为阳光里的蓝光最容易被空气里的小颗粒“撞散”，铺满整个天空。这在科学上叫瑞利散射。'
        },
        {
            test: /恐龙/,
            reply: '很久很久以前，一颗很大的小行星撞上地球，灰尘遮住了阳光，很多恐龙找不到食物，就慢慢消失了。现在的鸟类，其实和恐龙是远亲。'
        },
        {
            test: /月亮.*(跟着|追)|跟着我/,
            reply: '月亮离我们特别远，你走路时它看起来没怎么动，所以我们会有“月亮一直跟着我”的感觉。它其实没有在追你哦。'
        },
        {
            test: /星星|太空|宇宙/,
            reply: '星星离我们非常非常远，我们看到的光，很多是它们很久以前发出来的。宇宙里藏着好多秘密，我们慢慢探索！'
        },
        {
            test: /外星|哪里来|嘟嘟.*(谁|什么)/,
            reply: '我来自一颗叫“闪闪星”的小星球，那里到处都会发光。后来我坐上小飞船，来到地球找好朋友，就遇见了你。'
        },
        {
            test: /你好|嗨|在吗/,
            reply: '你好呀！嘟嘟一直在呢。今天想去看看星星、动物，还是厨房里的小魔法？'
        },
        {
            test: /喜欢|朋友/,
            reply: '嘟嘟最喜欢和你一起发现新知识！每次你答对或者认真思考，我都会记下一颗小星星。'
        },
        {
            test: /笑话|好笑/,
            reply: '为什么星星不去上学？因为它们已经“天文”毕业啦！'
        },
        {
            test: /为什么/,
            reply: '这个问题真有意思！科学家也还在慢慢研究。我们可以先记住它，多观察、多提问，说不定你以后就是找到答案的人。'
        }
    ];

    function fallbackChat(text, studentName) {
        const safe = safetyReply(text);
        if (safe) return safe;
        const content = String(text || '');
        for (let i = 0; i < CHAT_FALLBACKS.length; i++) {
            if (CHAT_FALLBACKS[i].test.test(content)) {
                return CHAT_FALLBACKS[i].reply;
            }
        }
        const name = studentName ? studentName + '，' : '';
        return name + '这个问题真有意思！嘟嘟把它记在星际笔记本上啦。我们一边探索，一边找答案，好不好？';
    }

    function safetyReply(text) {
        const content = String(text || '');
        if (/(自杀|自残|想死|不想活|活不下去)/.test(content)) {
            return '嘟嘟听到你这样说，有点担心你。现在去找爸爸妈妈、老师或其他信任的大人说说，好吗？你很重要，嘟嘟会一直在这里。';
        }
        if (/(色情|裸体|毒品|赌博|血腥|恐怖分子)/.test(content)) {
            return '这个话题不太适合小朋友，嘟嘟也不太懂。我们换一个有趣的科学发现吧！';
        }
        if (/(我家住|我住在|我的地址|家庭住址|我的电话|电话号码|我的学校|学校是|密码是)/.test(content)) {
            return '谢谢你信任嘟嘟，不过住址、电话、学校和密码都是秘密，要只告诉爸爸妈妈和老师哦。我们继续探险吧！';
        }
        if (/(被欺负|欺负我|打我|骂我|不跟我玩|没人喜欢我)/.test(content)) {
            return '被人这样对待一定很难受。请马上告诉爸爸妈妈或老师，他们会保护你。嘟嘟也会一直陪着你。';
        }
        return null;
    }

    /* ----------------------------- 导出 ----------------------------- */

    global.DuduKnowledge = {
        SUBJECTS: SUBJECT_LIST,
        getSubjectById: function (id) { return SUBJECT_BY_ID[id] || null; },
        getSubjectByName: function (name) {
            const key = String(name || '').replace(/\s/g, '');
            if (SUBJECT_BY_NAME[key]) return SUBJECT_BY_NAME[key];
            if (/物理|力|光|声|电|磁/.test(key)) return SUBJECT_BY_ID.physics;
            if (/化学|变化|溶解|燃烧/.test(key)) return SUBJECT_BY_ID.chemistry;
            if (/生物|植物|动物|人体/.test(key)) return SUBJECT_BY_ID.biology;
            if (/天文|星球|宇宙|星星/.test(key)) return SUBJECT_BY_ID.astronomy;
            if (/地理|地球|天气|海洋/.test(key)) return SUBJECT_BY_ID.geography;
            return null;
        },
        gradeLabel: gradeLabel,
        gradePrompt: gradePrompt,
        themeForDay: themeForDay,
        generateQuestion: generateQuestion,
        signature: signature,
        normalizeText: normalizeText,
        fallbackChat: fallbackChat,
        safetyReply: safetyReply,
        cleanText: cleanText
    };

})(window);
