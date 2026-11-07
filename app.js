/* ============================================================
   SpacePet · 星际宠物嘟嘟
   主程序：学生档案、无限题目、即时反馈、错题宝盒、声音与聊天
   ============================================================ */

(function () {
    'use strict';

    /* ----------------------------- 常量 ----------------------------- */

    const APP_VERSION = 3;
    const STORAGE = {
        students: 'dudu_v3_students',
        dataPrefix: 'dudu_v3_data::',
        settings: 'dudu_v3_settings',
        lastStudent: 'dudu_v3_last_student',
        legacyMigrated: 'dudu_v3_legacy_migrated'
    };
    const LEGACY_NAME_KEY = 'dudu_student_name';
    const LEGACY_WRONG_KEY = 'dudu_wrong_book';
    const MAX_STUDENTS = 50;
    const MAX_SEEN = 180;
    const MAX_WRONG = 120;
    const MAX_RECENT_SUBJECTS = 8;
    const PENDING_MAX_AGE = 2 * 60 * 60 * 1000;

    const LEVELS = [
        { min: 0, name: '星际新朋友' },
        { min: 10, name: '好奇小探险家' },
        { min: 25, name: '星光观察员' },
        { min: 45, name: '科学小侦探' },
        { min: 70, name: '星球研究员' },
        { min: 100, name: '银河小学者' },
        { min: 140, name: '星际领航员' },
        { min: 190, name: '宇宙探索家' },
        { min: 250, name: '传说级探险家' },
        { min: 320, name: '星光守护者' }
    ];

    const DEFAULT_SETTINGS = {
        muted: false,
        autoRead: true,
        sfx: true,
        ambient: false,
        volume: 0.9,
        rate: 0.95,
        pitch: 1.05,
        voiceURI: ''
    };

    const FALLBACK_SUBJECT = {
        id: 'astronomy',
        name: '天文',
        icon: '🪐',
        theme: '星空奇遇',
        color: '#c4b5fd'
    };

    const FALLBACK_QUESTION = {
        subject: '天文',
        subjectId: 'astronomy',
        scene: '今晚的星星特别亮，嘟嘟抬头看了好久。',
        question: '太阳系里，离太阳最近的行星是哪一颗？',
        options: ['水星', '金星', '地球'],
        correctIndex: 0,
        hint: '太阳系的行星顺序是：水星、金星、地球……',
        explain: '离太阳最近的行星是水星。它绕太阳转一圈只要大约 88 天。',
        feedback_correct: '答对啦！你的观察力真棒！',
        feedback_wrong: '再想一想，太阳系的第一颗行星叫什么名字？',
        fun_fact: '水星白天很热，晚上却很冷。',
        source: 'local'
    };

    const CORRECT_WORDS = [
        '答对啦！你的观察力真棒！',
        '哇，你找到答案啦！嘟嘟给你记一颗小星星。',
        '太厉害了，你就是小小科学家！',
        '被你发现啦！我们继续去探险吧。'
    ];
    const WRONG_WORDS = [
        '还差一点点，再仔细看看嘟嘟的小提示～',
        '没关系，科学家也会试错。再想一想～',
        '这个答案不太对哦，嘟嘟陪你一起找线索。'
    ];

    const CONFETTI_COLORS = ['#6ee7ff', '#ffd166', '#6ee7b7', '#ff9ad5', '#a78bfa', '#ffb08c'];

    const knowledge = window.DuduKnowledge || null;

    /* ----------------------------- 小工具 ----------------------------- */

    function $(id) {
        return document.getElementById(id);
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = String(text);
        return node;
    }

    function makeButton(className, text) {
        const button = el('button', className, text);
        button.type = 'button';
        return button;
    }

    function append(parent, node) {
        if (node) parent.appendChild(node);
        return node;
    }

    function clampNumber(value, min, max, fallback) {
        const number = Number(value);
        if (!isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function hash32(value) {
        let hash = 2166136261 >>> 0;
        const text = String(value || '');
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function debounce(fn, wait) {
        let timer = null;
        return function () {
            const args = arguments;
            const self = this;
            clearTimeout(timer);
            timer = setTimeout(function () {
                fn.apply(self, args);
            }, wait);
        };
    }

    function randomId(prefix) {
        return (prefix || 'id_') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function normalizeText(value) {
        return String(value == null ? '' : value)
            .toLowerCase()
            .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()【】\[\]—\-…·]/g, '');
    }

    function cleanTextValue(value, maxLength) {
        if (knowledge && typeof knowledge.cleanText === 'function') {
            return knowledge.cleanText(value, maxLength);
        }
        if (typeof value !== 'string') return '';
        return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength || 400);
    }

    function cleanOptionText(value) {
        return cleanTextValue(value, 120)
            .replace(/^[A-Da-d]\s*[.、．:：)）]\s*/, '')
            .replace(/^["“]|["”]$/g, '')
            .trim();
    }

    function stripMarkdown(value) {
        return String(value == null ? '' : value)
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/`([^`]*)`/g, '$1')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/https?:\/\/\S+/gi, '')
            .replace(/[*_~#>]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function softenChildText(value) {
        return String(value == null ? '' : value)
            .replace(/主人/g, '你')
            .replace(/哈哈+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function dateKey(date) {
        const d = date || new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function parseDateKey(key) {
        const parts = String(key || '').split('-').map(Number);
        if (parts.length !== 3 || parts.some(function (n) { return !isFinite(n); })) return null;
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        if (d.getFullYear() !== parts[0] || d.getMonth() !== parts[1] - 1 || d.getDate() !== parts[2]) return null;
        return d;
    }

    function daysBetween(fromKey, toKey) {
        const from = parseDateKey(fromKey);
        const to = parseDateKey(toKey);
        if (!from || !to) return null;
        return Math.round((to.getTime() - from.getTime()) / 86400000);
    }

    function gradeLabel(grade) {
        if (knowledge && typeof knowledge.gradeLabel === 'function') return knowledge.gradeLabel(grade);
        if (grade <= 1) return '1-2 年级';
        if (grade >= 5) return '5-6 年级';
        return '3-4 年级';
    }

    function gradePrompt(grade) {
        if (knowledge && typeof knowledge.gradePrompt === 'function') return knowledge.gradePrompt(grade);
        return '用小学生能懂的短句，遇到科学名词要解释。';
    }

    function getSubjectById(id) {
        if (knowledge && typeof knowledge.getSubjectById === 'function') {
            return knowledge.getSubjectById(id);
        }
        return null;
    }

    function getSubjectByName(name) {
        if (knowledge && typeof knowledge.getSubjectByName === 'function') {
            return knowledge.getSubjectByName(name);
        }
        const text = String(name || '');
        if (/物理/.test(text)) return { id: 'physics', name: '物理', icon: '🧲' };
        if (/化学/.test(text)) return { id: 'chemistry', name: '化学', icon: '⚗️' };
        if (/生物/.test(text)) return { id: 'biology', name: '生物', icon: '🌱' };
        if (/地理/.test(text)) return { id: 'geography', name: '地理', icon: '🌍' };
        if (/天文/.test(text)) return { id: 'astronomy', name: '天文', icon: '🪐' };
        return null;
    }

    function themeForDay(day, studentId) {
        if (knowledge && typeof knowledge.themeForDay === 'function') {
            return knowledge.themeForDay(day, studentId);
        }
        return FALLBACK_SUBJECT;
    }

    function signatureOf(question) {
        if (knowledge && typeof knowledge.signature === 'function') {
            return knowledge.signature(question);
        }
        if (typeof question === 'string') return '|' + normalizeText(question) + '|';
        const q = question || {};
        return normalizeText(q.subjectId) + '|' + normalizeText(q.question) + '|' + normalizeText(q.options && q.options[q.correctIndex]);
    }

    function safetyReply(text) {
        if (knowledge && typeof knowledge.safetyReply === 'function') {
            return knowledge.safetyReply(text);
        }
        return null;
    }

    function fallbackChat(text, studentName) {
        if (knowledge && typeof knowledge.fallbackChat === 'function') {
            return knowledge.fallbackChat(text, studentName);
        }
        return '这个问题真有意思！嘟嘟把它记在星际笔记本上啦，我们一边探索，一边找答案，好不好？';
    }

    function levelInfo(stars) {
        const value = Math.max(0, Number(stars) || 0);
        let index = 0;
        for (let i = 0; i < LEVELS.length; i++) {
            if (value >= LEVELS[i].min) index = i;
        }
        const current = LEVELS[index];
        const next = LEVELS[index + 1] || null;
        const progress = next
            ? Math.min(100, Math.max(0, Math.round((value - current.min) / (next.min - current.min) * 100)))
            : 100;
        return { index: index, name: current.name, progress: progress, next: next };
    }

    function avatarLetter(name) {
        const chars = Array.from(String(name || '').trim());
        return chars.length ? chars[0] : '?';
    }

    function normalizeStudentName(raw) {
        let name = String(raw == null ? '' : raw)
            .replace(/[^\u4e00-\u9fffA-Za-z0-9·・\-_ ]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        const chars = Array.from(name);
        if (chars.length > 12) name = chars.slice(0, 12).join('');
        return name;
    }

    function studentIdFor(name) {
        // 不再截断编码结果，避免两个较长的中文名字因为截断而共用同一份档案。
        return 's_' + encodeURIComponent(normalizeStudentName(name));
    }

    function shuffleArray(list) {
        const arr = list.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
        }
        return arr;
    }

    function timeGreeting() {
        const hour = new Date().getHours();
        if (hour < 6) return '晚上好';
        if (hour < 11) return '早上好';
        if (hour < 14) return '中午好';
        if (hour < 18) return '下午好';
        return '晚上好';
    }

    /* ----------------------------- 存储 ----------------------------- */

    const memoryStore = Object.create(null);
    let localStorageAvailable = true;

    try {
        const probe = '__dudu_probe__';
        window.localStorage.setItem(probe, '1');
        window.localStorage.removeItem(probe);
    } catch (error) {
        localStorageAvailable = false;
    }

    function readRaw(key) {
        // 本次会话中已经降级到内存的值优先，避免被旧 localStorage 值盖住。
        if (Object.prototype.hasOwnProperty.call(memoryStore, key)) return memoryStore[key];
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            localStorageAvailable = false;
            return null;
        }
    }

    function writeRaw(key, value) {
        try {
            if (localStorageAvailable) {
                window.localStorage.setItem(key, value);
                if (Object.prototype.hasOwnProperty.call(memoryStore, key)) delete memoryStore[key];
                return true;
            }
        } catch (error) {
            localStorageAvailable = false;
        }
        memoryStore[key] = value;
        return false;
    }

    function readJSON(key, fallback) {
        const raw = readRaw(key);
        if (!raw) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch (error) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        let raw;
        try {
            raw = JSON.stringify(value);
        } catch (error) {
            return false;
        }
        return writeRaw(key, raw);
    }

    function loadSettings() {
        const stored = readJSON(STORAGE.settings, {});
        const source = stored && typeof stored === 'object' ? stored : {};
        return {
            muted: !!source.muted,
            autoRead: source.autoRead !== false,
            sfx: source.sfx !== false,
            ambient: !!source.ambient,
            volume: clampNumber(source.volume, 0, 1, DEFAULT_SETTINGS.volume),
            rate: clampNumber(source.rate, 0.7, 1.3, DEFAULT_SETTINGS.rate),
            pitch: clampNumber(source.pitch, 0.8, 1.4, DEFAULT_SETTINGS.pitch),
            voiceURI: typeof source.voiceURI === 'string' ? source.voiceURI : ''
        };
    }

    function saveSettings() {
        writeJSON(STORAGE.settings, state.settings);
    }

    /* ----------------------------- 运行状态 ----------------------------- */

    const state = {
        settings: loadSettings(),
        data: null,
        theme: FALLBACK_SUBJECT,
        currentQuestion: null,
        pending: null,
        answerLocked: false,
        answerCooldownUntil: 0,
        nextLocked: false,
        nextCooldownUntil: 0,
        starting: false,
        entered: false,
        questionSerial: 0,
        moodToken: 0,
        sessionEpoch: 0,

        aiMode: 'checking',
        aiCooldownUntil: 0,
        aiFailures: 0,
        aiQueue: null,
        prefetching: false,
        prefetchTimer: null,

        voices: [],
        speechSupported: false,

        welcomeGrade: 3,
        selectedRecentId: '',

        wrongFilters: { status: 'due', subject: 'all' },
        practice: {},
        deleteConfirmId: '',
        deleteArmedAt: 0,
        clearArmed: false,
        clearArmedAt: 0,
        clearTimer: null,
        resetArmedAt: 0,

        chatBusy: false,
        chatHistory: [],
        chatInitialized: false,

        legacy: { name: '', wrongBook: [] },
        lastFocus: null,
        toastTimer: null,
        storageWarned: false,
        reducedMotion: false
    };

    /* ----------------------------- DOM ----------------------------- */

    const dom = {
        appShell: $('appShell'),
        starCanvas: $('starCanvas'),
        confettiCanvas: $('confettiCanvas'),

        avatar: $('avatar'),
        helloName: $('helloName'),
        levelName: $('levelName'),
        levelFill: $('levelFill'),
        starPill: $('starPill'),
        starCount: $('starCount'),
        streakPill: $('streakPill'),
        streakCount: $('streakCount'),
        soundToggle: $('soundToggle'),
        soundIcon: $('soundIcon'),
        wrongBookBtn: $('wrongBookBtn'),
        wrongBadge: $('wrongBadge'),
        settingsBtn: $('settingsBtn'),

        themeChip: $('themeChip'),
        themeIcon: $('themeIcon'),
        themeText: $('themeText'),
        mascotZone: $('mascotZone'),
        mascotWrap: $('mascotWrap'),
        stageMascot: $('stageMascot'),
        mascotBubble: $('mascotBubble'),
        soundWave: $('soundWave'),
        chatContainer: $('chatContainer'),
        optionsGrid: $('optionsGrid'),
        nextRow: $('nextRow'),
        nextBtn: $('nextBtn'),
        chatToggle: $('chatToggle'),
        dockNote: $('dockNote'),

        welcomeOverlay: $('welcomeOverlay'),
        welcomeSub: $('welcomeSub'),
        welcomeForm: $('welcomeForm'),
        nameInput: $('nameInput'),
        nameError: $('nameError'),
        gradeGrid: $('gradeGrid'),
        startBtn: $('startBtn'),
        recentBlock: $('recentBlock'),
        recentList: $('recentList'),
        welcomeSoundBtn: $('welcomeSoundBtn'),

        wrongOverlay: $('wrongOverlay'),
        wrongCloseBtn: $('wrongCloseBtn'),
        wrongSummary: $('wrongSummary'),
        wrongStatusRow: $('wrongStatusRow'),
        wrongSubjectRow: $('wrongSubjectRow'),
        wrongList: $('wrongList'),
        clearMasteredBtn: $('clearMasteredBtn'),

        settingsOverlay: $('settingsOverlay'),
        settingsCloseBtn: $('settingsCloseBtn'),
        settingsAvatar: $('settingsAvatar'),
        settingsName: $('settingsName'),
        settingsGrade: $('settingsGrade'),
        switchStudentBtn: $('switchStudentBtn'),
        autoReadToggle: $('autoReadToggle'),
        sfxToggle: $('sfxToggle'),
        ambientToggle: $('ambientToggle'),
        volumeRange: $('volumeRange'),
        volumeValue: $('volumeValue'),
        rateRange: $('rateRange'),
        rateValue: $('rateValue'),
        voiceSelect: $('voiceSelect'),
        voicePreviewBtn: $('voicePreviewBtn'),
        voiceHint: $('voiceHint'),
        aiStatus: $('aiStatus'),
        modeStatus: $('modeStatus'),
        totalQuestionsStatus: $('totalQuestionsStatus'),
        wrongBookStatus: $('wrongBookStatus'),
        resetProgressBtn: $('resetProgressBtn'),
        resetConfirm: $('resetConfirm'),
        resetCancelBtn: $('resetCancelBtn'),
        resetConfirmBtn: $('resetConfirmBtn'),

        chatOverlay: $('chatOverlay'),
        chatCloseBtn: $('chatCloseBtn'),
        chatThread: $('chatThread'),
        chatSuggestions: $('chatSuggestions'),
        chatForm: $('chatForm'),
        chatInput: $('chatInput'),
        chatSendBtn: $('chatSendBtn'),

        toast: $('toast')
    };

    /* ----------------------------- 声音：语音 ----------------------------- */

    const SpeechService = (function () {
        const synth = window.speechSynthesis;
        const supported = !!(synth && typeof window.SpeechSynthesisUtterance === 'function');
        let voices = [];
        let epoch = 0;
        let currentAnchor = null;
        let watchdog = null;

        function prepareText(text) {
            let value = String(text == null ? '' : text);
            value = value
                .replace(/```[\s\S]*?```/g, ' ')
                .replace(/https?:\/\/\S+/gi, ' ')
                .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
                .replace(/[*_`#>~]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (value.length > 700) value = value.slice(0, 700);
            return value;
        }

        function chunkText(text, maxLength) {
            const limit = maxLength || 80;
            const pieces = text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) || [text];
            const chunks = [];
            let current = '';
            pieces.forEach(function (piece) {
                const value = piece.trim();
                if (!value) return;
                if (value.length > limit) {
                    if (current) {
                        chunks.push(current);
                        current = '';
                    }
                    const parts = value.match(/[^，、,]+[，、,]?/g) || [value];
                    let buffer = '';
                    parts.forEach(function (part) {
                        if ((buffer + part).length > limit && buffer) {
                            chunks.push(buffer);
                            buffer = '';
                        }
                        if (part.length > limit) {
                            for (let i = 0; i < part.length; i += limit) {
                                chunks.push(part.slice(i, i + limit));
                            }
                        } else {
                            buffer += part;
                        }
                    });
                    if (buffer) chunks.push(buffer);
                    return;
                }
                if ((current + value).length > limit && current) {
                    chunks.push(current);
                    current = '';
                }
                current += value;
            });
            if (current) chunks.push(current);
            return chunks.length ? chunks : [text];
        }

        function scoreVoice(voice) {
            const name = String(voice.name || '');
            const lang = String(voice.lang || '').toLowerCase();
            let score = 0;
            if (lang.indexOf('zh') === 0) score += 100;
            if (lang === 'zh-cn' || lang === 'zh_cn') score += 20;
            if (/xiaoxiao|xiaoyi|yunxi|yunyang|yunyi|xiaomo|huihui|yaoyao|tingting|meijia|sinji|kangkang|google.*普通话|mandarin/i.test(name)) {
                score += 45;
            }
            if (/natural|online/i.test(name)) score += 25;
            if (voice.localService === true) score += 10;
            if (/espeak/i.test(name)) score -= 55;
            return score;
        }

        function refreshVoices() {
            if (!supported) {
                voices = [];
                state.voices = voices;
                return;
            }
            try {
                voices = Array.prototype.slice.call(synth.getVoices() || []);
            } catch (error) {
                voices = [];
            }
            voices.sort(function (a, b) {
                return scoreVoice(b) - scoreVoice(a);
            });
            state.voices = voices;
            populateSelect();
        }

        function getBestVoice() {
            if (!voices.length) return null;
            if (state.settings.voiceURI) {
                for (let i = 0; i < voices.length; i++) {
                    if (voices[i].voiceURI === state.settings.voiceURI) return voices[i];
                }
            }
            const chinese = voices.filter(function (voice) {
                return String(voice.lang || '').toLowerCase().indexOf('zh') === 0;
            });
            if (!chinese.length) return voices[0] || null;
            return chinese[0];
        }

        function populateSelect() {
            if (!dom.voiceSelect) return;
            const previous = state.settings.voiceURI || '';
            dom.voiceSelect.textContent = '';
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '自动挑选（推荐）';
            dom.voiceSelect.appendChild(option);

            const chinese = voices.filter(function (voice) {
                return String(voice.lang || '').toLowerCase().indexOf('zh') === 0;
            });
            const list = chinese.length ? chinese : voices;
            list.forEach(function (voice) {
                const item = document.createElement('option');
                item.value = voice.voiceURI || voice.name;
                item.textContent = (voice.name || '声音') +
                    (voice.lang ? ' · ' + voice.lang : '') +
                    (voice.localService ? ' · 本机' : '');
                dom.voiceSelect.appendChild(item);
            });

            let hasPrevious = false;
            for (let i = 0; i < dom.voiceSelect.options.length; i++) {
                if (dom.voiceSelect.options[i].value === previous) {
                    hasPrevious = true;
                    break;
                }
            }
            dom.voiceSelect.value = hasPrevious ? previous : '';

            if (!supported) {
                dom.voiceHint.textContent = '这台设备暂时不能朗读。文字内容都写在气泡里，仍然可以正常答题。';
            } else if (!chinese.length) {
                dom.voiceHint.textContent = '暂时没有找到中文声音。可以在电脑的“语音设置”里添加中文语音包，再回来试听。';
            } else {
                dom.voiceHint.textContent = '找到 ' + chinese.length + ' 个中文声音。推荐“晓晓、云希、婷婷”等自然音色；不同电脑的声音会略有不同。';
            }
        }

        function setSpeaking(value) {
            if (!dom.mascotZone) return;
            if (value) {
                dom.mascotZone.classList.add('is-speaking');
                if (dom.stageMascot) dom.stageMascot.classList.add('speaking');
            } else {
                dom.mascotZone.classList.remove('is-speaking');
                if (dom.stageMascot) dom.stageMascot.classList.remove('speaking');
            }
        }

        function stop() {
            epoch++;
            if (watchdog) {
                clearTimeout(watchdog);
                watchdog = null;
            }
            currentAnchor = null;
            setSpeaking(false);
            if (supported) {
                try { synth.cancel(); } catch (error) { /* ignore */ }
            }
        }

        function speak(text, options) {
            const opts = options || {};
            if (!supported) {
                if (opts.showUnsupported && !state.settings.muted) {
                    showToast('这台设备暂时不能朗读，嘟嘟把话写在气泡里啦。');
                }
                return false;
            }
            if (state.settings.muted) return false;

            const prepared = prepareText(text);
            if (!prepared) return false;

            stop();
            const myEpoch = ++epoch;
            currentAnchor = opts.anchor || null;
            const chunks = chunkText(prepared);
            const voice = getBestVoice();
            let index = 0;

            setSpeaking(true);

            function finish() {
                if (myEpoch !== epoch) return;
                if (watchdog) {
                    clearTimeout(watchdog);
                    watchdog = null;
                }
                currentAnchor = null;
                setSpeaking(false);
            }

            function next() {
                if (myEpoch !== epoch) return;
                if (index >= chunks.length) {
                    finish();
                    return;
                }
                const chunk = chunks[index++];
                const utterance = new window.SpeechSynthesisUtterance(chunk);
                utterance.lang = voice && voice.lang ? voice.lang : 'zh-CN';
                if (voice) utterance.voice = voice;
                utterance.rate = clampNumber(state.settings.rate, 0.7, 1.3, 0.95);
                utterance.pitch = clampNumber(state.settings.pitch, 0.8, 1.4, 1.05);
                utterance.volume = clampNumber(state.settings.volume, 0, 1, 0.9);

                let done = false;
                function proceed() {
                    if (done) return;
                    done = true;
                    if (watchdog) {
                        clearTimeout(watchdog);
                        watchdog = null;
                    }
                    if (myEpoch !== epoch) return;
                    setTimeout(next, 35);
                }

                utterance.onend = proceed;
                utterance.onerror = function (event) {
                    const reason = event && event.error;
                    if (reason === 'interrupted' || reason === 'canceled') {
                        done = true;
                        return;
                    }
                    proceed();
                };

                watchdog = setTimeout(function () {
                    if (done || myEpoch !== epoch) return;
                    done = true;
                    try { synth.cancel(); } catch (error) { /* ignore */ }
                    next();
                }, Math.max(5000, chunk.length * 320 + 3000));

                try {
                    synth.speak(utterance);
                } catch (error) {
                    proceed();
                }
            }

            setTimeout(next, 40);
            return true;
        }

        function preview() {
            if (state.settings.muted) {
                showToast('声音现在是关闭的，先点右上角的喇叭打开吧。');
                return;
            }
            speak('你好呀，我是嘟嘟。今天我们一起去看星星吧！', { force: true, showUnsupported: true });
        }

        if (supported) {
            refreshVoices();
            if (typeof synth.addEventListener === 'function') {
                synth.addEventListener('voiceschanged', refreshVoices);
            } else {
                synth.onvoiceschanged = refreshVoices;
            }
            setTimeout(refreshVoices, 400);
            setTimeout(refreshVoices, 1500);
        } else if (dom.voiceHint) {
            dom.voiceHint.textContent = '这台设备暂时不能朗读。文字内容都写在气泡里，仍然可以正常答题。';
        }
        state.speechSupported = supported;

        return {
            supported: supported,
            speak: speak,
            stop: stop,
            preview: preview,
            refreshVoices: refreshVoices,
            getVoices: function () { return voices.slice(); },
            getBestVoice: getBestVoice
        };
    })();

    /* ----------------------------- 声音：音效 ----------------------------- */

    const AudioFX = (function () {
        let ctx = null;
        let master = null;
        let ambientNodes = null;
        let ambientGain = null;

        function supported() {
            return !!(window.AudioContext || window.webkitAudioContext);
        }

        function ensure() {
            if (!supported()) return null;
            if (!ctx) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                try {
                    ctx = new Ctx();
                    master = ctx.createGain();
                    master.gain.value = state.settings.muted ? 0 : clampNumber(state.settings.volume, 0, 1, 0.9);
                    master.connect(ctx.destination);
                } catch (error) {
                    ctx = null;
                    return null;
                }
            }
            if (ctx.state === 'suspended') {
                try { ctx.resume(); } catch (error) { /* ignore */ }
            }
            updateMaster();
            return ctx;
        }

        function updateMaster() {
            if (!master || !ctx) return;
            const value = state.settings.muted ? 0 : clampNumber(state.settings.volume, 0, 1, 0.9);
            try {
                master.gain.setTargetAtTime(value, ctx.currentTime, 0.02);
            } catch (error) {
                master.gain.value = value;
            }
        }

        function effectsOn() {
            return state.settings.sfx && !state.settings.muted;
        }

        function tone(freq, delay, duration, type, gainValue, slideTo) {
            const audio = ensure();
            if (!audio) return;
            const start = audio.currentTime + (delay || 0);
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            oscillator.type = type || 'sine';
            oscillator.frequency.setValueAtTime(freq, start);
            if (slideTo) {
                oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
            }
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue || 0.08), start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            oscillator.connect(gain);
            gain.connect(master);
            oscillator.start(start);
            oscillator.stop(start + duration + 0.03);
        }

        function click() {
            if (!effectsOn()) return;
            tone(620, 0, 0.06, 'triangle', 0.045);
        }

        function correct() {
            if (!effectsOn()) return;
            tone(659.25, 0, 0.16, 'sine', 0.09);
            tone(783.99, 0.1, 0.18, 'sine', 0.09);
            tone(1046.5, 0.21, 0.28, 'sine', 0.075);
        }

        function wrong() {
            if (!effectsOn()) return;
            tone(246.94, 0, 0.16, 'sine', 0.055, 196);
            tone(196, 0.12, 0.2, 'sine', 0.04, 164.81);
        }

        function sparkle() {
            if (!effectsOn()) return;
            tone(1318.5, 0, 0.12, 'sine', 0.05);
            tone(1760, 0.08, 0.16, 'sine', 0.04);
            tone(2093, 0.16, 0.2, 'sine', 0.03);
        }

        function levelUp() {
            if (!effectsOn()) return;
            [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, index) {
                tone(freq, index * 0.11, 0.24, 'triangle', 0.07);
            });
        }

        function stopAmbient() {
            if (!ctx || !ambientNodes) return;
            const nodes = ambientNodes;
            ambientNodes = null;
            try {
                if (ambientGain) {
                    ambientGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
                }
                setTimeout(function () {
                    nodes.forEach(function (node) {
                        try { node.stop(); } catch (error) { /* ignore */ }
                        try { node.disconnect(); } catch (error) { /* ignore */ }
                    });
                }, 900);
            } catch (error) {
                /* ignore */
            }
            ambientGain = null;
        }

        function startAmbient() {
            if (!state.settings.ambient || state.settings.muted) return;
            const audio = ensure();
            if (!audio || ambientNodes) return;
            try {
                ambientGain = audio.createGain();
                ambientGain.gain.value = 0.015;
                const filter = audio.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 720;
                filter.Q.value = 0.6;
                ambientGain.connect(filter);
                filter.connect(master);

                const oscA = audio.createOscillator();
                oscA.type = 'sine';
                oscA.frequency.value = 110;
                const oscB = audio.createOscillator();
                oscB.type = 'sine';
                oscB.frequency.value = 164.81;
                const oscC = audio.createOscillator();
                oscC.type = 'triangle';
                oscC.frequency.value = 220;
                const oscGain = audio.createGain();
                oscGain.gain.value = 0.35;
                oscA.connect(oscGain);
                oscB.connect(oscGain);
                oscC.connect(oscGain);
                oscGain.connect(ambientGain);

                const lfo = audio.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.value = 0.07;
                const lfoGain = audio.createGain();
                lfoGain.gain.value = 0.008;
                lfo.connect(lfoGain);
                lfoGain.connect(ambientGain.gain);

                [oscA, oscB, oscC, lfo].forEach(function (node) {
                    node.start();
                });
                ambientNodes = [oscA, oscB, oscC, lfo];
            } catch (error) {
                stopAmbient();
            }
        }

        function syncAmbient() {
            if (state.settings.ambient && !state.settings.muted) {
                startAmbient();
            } else {
                stopAmbient();
            }
        }

        return {
            supported: supported,
            ensure: ensure,
            updateMaster: updateMaster,
            click: click,
            correct: correct,
            wrong: wrong,
            sparkle: sparkle,
            levelUp: levelUp,
            startAmbient: startAmbient,
            stopAmbient: stopAmbient,
            syncAmbient: syncAmbient
        };
    })();

    /* ----------------------------- 星空与彩纸 ----------------------------- */

    let starfield = null;
    let confettiState = null;

    function initStarfield() {
        const canvas = dom.starCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = 0;
        let height = 0;
        let dpr = 1;
        let stars = [];
        let shooting = null;
        let raf = 0;
        let running = false;

        function resize() {
            width = window.innerWidth || document.documentElement.clientWidth || 800;
            height = window.innerHeight || document.documentElement.clientHeight || 600;
            dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            buildStars();
            draw(performance.now());
        }

        function buildStars() {
            const count = Math.min(170, Math.max(70, Math.round(width * height / 15000)));
            stars = [];
            for (let i = 0; i < count; i++) {
                stars.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    radius: Math.random() * 1.5 + 0.35,
                    base: Math.random() * 0.45 + 0.2,
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.0005 + Math.random() * 0.0012,
                    hue: Math.random() > 0.82 ? 'pink' : (Math.random() > 0.7 ? 'cyan' : 'white')
                });
            }
        }

        function draw(time) {
            if (!width || !height) return;
            ctx.clearRect(0, 0, width, height);
            for (let i = 0; i < stars.length; i++) {
                const star = stars[i];
                let alpha = star.base;
                if (!state.reducedMotion) {
                    alpha = star.base + Math.sin(time * star.speed + star.phase) * 0.28;
                }
                alpha = Math.max(0.05, Math.min(0.9, alpha));
                ctx.beginPath();
                if (star.hue === 'pink') {
                    ctx.fillStyle = 'rgba(255, 190, 230, ' + alpha + ')';
                } else if (star.hue === 'cyan') {
                    ctx.fillStyle = 'rgba(150, 235, 255, ' + alpha + ')';
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
                }
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                ctx.fill();
            }

            if (shooting) {
                const progress = Math.min(1, (time - shooting.start) / shooting.life);
                const x = shooting.x + shooting.dx * progress;
                const y = shooting.y + shooting.dy * progress;
                const tailX = x - shooting.dx * 0.16;
                const tailY = y - shooting.dy * 0.16;
                const gradient = ctx.createLinearGradient(tailX, tailY, x, y);
                gradient.addColorStop(0, 'rgba(255,255,255,0)');
                gradient.addColorStop(1, 'rgba(180,240,255,' + (1 - progress) * 0.9 + ')');
                ctx.strokeStyle = gradient;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(tailX, tailY);
                ctx.lineTo(x, y);
                ctx.stroke();
                if (progress >= 1) shooting = null;
            } else if (!state.reducedMotion && Math.random() < 0.0012) {
                const startX = Math.random() * width * 0.7 + width * 0.2;
                const startY = Math.random() * height * 0.4;
                shooting = {
                    x: startX,
                    y: startY,
                    dx: -130 - Math.random() * 100,
                    dy: 70 + Math.random() * 60,
                    start: time,
                    life: 1000 + Math.random() * 500
                };
            }
        }

        function loop(time) {
            if (!running) return;
            draw(time);
            raf = window.requestAnimationFrame(loop);
        }

        function start() {
            if (state.reducedMotion) {
                draw(performance.now());
                return;
            }
            if (running) return;
            running = true;
            raf = window.requestAnimationFrame(loop);
        }

        function stop() {
            running = false;
            if (raf) window.cancelAnimationFrame(raf);
            raf = 0;
        }

        const onResize = debounce(resize, 180);
        window.addEventListener('resize', onResize);
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                stop();
            } else {
                start();
            }
        });

        resize();
        start();

        starfield = { start: start, stop: stop, resize: resize };
    }

    function resizeConfetti() {
        const canvas = dom.confettiCanvas;
        if (!canvas) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = window.innerWidth || 800;
        const height = window.innerHeight || 600;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (!confettiState) {
            confettiState = { pieces: [], raf: 0, running: false, width: width, height: height };
        }
        confettiState.width = width;
        confettiState.height = height;
    }

    function burstConfetti() {
        if (state.reducedMotion || !dom.confettiCanvas) return;
        const canvas = dom.confettiCanvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        resizeConfetti();
        const width = confettiState.width;
        const height = confettiState.height;
        const originX = width * (0.35 + Math.random() * 0.3);
        const originY = height * (0.25 + Math.random() * 0.15);
        for (let i = 0; i < 90; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
            const speed = 3 + Math.random() * 8;
            confettiState.pieces.push({
                x: originX + (Math.random() - 0.5) * 100,
                y: originY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                gravity: 0.16 + Math.random() * 0.08,
                size: 4 + Math.random() * 6,
                color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
                rotation: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 0.3,
                life: 1,
                decay: 0.008 + Math.random() * 0.006
            });
        }
        if (!confettiState.running) {
            confettiState.running = true;
            confettiState.raf = window.requestAnimationFrame(confettiLoop);
        }
    }

    function confettiLoop() {
        const canvas = dom.confettiCanvas;
        if (!canvas || !confettiState) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = confettiState.width;
        const height = confettiState.height;
        ctx.clearRect(0, 0, width, height);
        const pieces = confettiState.pieces;
        for (let i = pieces.length - 1; i >= 0; i--) {
            const piece = pieces[i];
            piece.vy += piece.gravity;
            piece.x += piece.vx;
            piece.y += piece.vy;
            piece.vx *= 0.995;
            piece.rotation += piece.spin;
            piece.life -= piece.decay;
            if (piece.life <= 0 || piece.y > height + 30) {
                pieces.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.translate(piece.x, piece.y);
            ctx.rotate(piece.rotation);
            ctx.globalAlpha = Math.max(0, piece.life);
            ctx.fillStyle = piece.color;
            ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
            ctx.restore();
        }
        if (pieces.length) {
            confettiState.raf = window.requestAnimationFrame(confettiLoop);
        } else {
            confettiState.running = false;
            ctx.clearRect(0, 0, width, height);
        }
    }

    /* ----------------------------- 表情与提示 ----------------------------- */

    const MOOD_CLASSES = ['happy', 'thinking', 'curious', 'celebrate'];

    function setMood(mood) {
        if (!dom.stageMascot) return;
        MOOD_CLASSES.forEach(function (name) {
            dom.stageMascot.classList.remove(name);
        });
        if (mood) dom.stageMascot.classList.add(mood);
        state.moodToken++;
    }

    function setMascotBubble(text) {
        if (dom.mascotBubble) dom.mascotBubble.textContent = text;
    }

    function showToast(text, duration) {
        if (!dom.toast) return;
        if (state.toastTimer) clearTimeout(state.toastTimer);
        dom.toast.textContent = text;
        dom.toast.classList.add('show');
        state.toastTimer = setTimeout(function () {
            dom.toast.classList.remove('show');
            state.toastTimer = null;
        }, duration || 2400);
    }

    function bumpElement(node) {
        if (!node) return;
        node.classList.remove('bump');
        void node.offsetWidth;
        node.classList.add('bump');
        setTimeout(function () {
            node.classList.remove('bump');
        }, 520);
    }

    /* ----------------------------- 数据：学生档案 ----------------------------- */

    function freshData(name, grade) {
        const now = Date.now();
        const today = dateKey();
        return {
            version: APP_VERSION,
            name: name,
            grade: grade,
            studentId: studentIdFor(name),
            createdAt: now,
            updatedAt: now,
            firstVisitDate: today,
            lastVisitDate: today,
            streak: 1,
            totalStars: 0,
            totalQuestions: 0,
            todayDate: today,
            todayQuestions: 0,
            todayStars: 0,
            wrongBook: [],
            seen: [],
            recentSubjects: [],
            subjectStats: {},
            pending: null
        };
    }

    function ensureSubjectStats(data) {
        if (!data.subjectStats || typeof data.subjectStats !== 'object') data.subjectStats = {};
        Object.keys(data.subjectStats).forEach(function (id) {
            const stat = data.subjectStats[id];
            if (!stat || typeof stat !== 'object' || Array.isArray(stat)) {
                data.subjectStats[id] = { attempts: 0, correct: 0, wrong: 0 };
            } else {
                stat.attempts = Math.max(0, Number(stat.attempts) || 0);
                stat.correct = Math.max(0, Number(stat.correct) || 0);
                stat.wrong = Math.max(0, Number(stat.wrong) || 0);
            }
        });
        return data.subjectStats;
    }

    function normalizeWrongItem(raw) {
        if (!raw) return null;
        if (typeof raw === 'string') {
            const q = cleanTextValue(raw, 180);
            if (!q) return null;
            const id = 'w_' + hash32(normalizeText(q)).toString(36);
            return {
                id: id,
                subject: '科学',
                subjectId: '',
                scene: '',
                question: q,
                options: [],
                correctIndex: -1,
                answerText: '',
                hint: '',
                explain: '这道题来自以前的记录，暂时不能重新作答。可以看看解析，或者把它移出宝盒。',
                fun_fact: '',
                wrongCount: 1,
                correctCount: 0,
                mastered: false,
                lastAnswer: '',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                legacy: true
            };
        }
        if (typeof raw !== 'object') return null;

        const question = cleanTextValue(raw.question || raw.q || raw.title || '', 180);
        if (!question) return null;

        let options = [];
        if (Array.isArray(raw.options)) {
            const seen = {};
            raw.options.forEach(function (option) {
                const value = cleanOptionText(option);
                if (value && !seen[normalizeText(value)]) {
                    seen[normalizeText(value)] = true;
                    options.push(value);
                }
            });
        }

        let correctIndex = -1;
        if (Number.isInteger(raw.correctIndex) && raw.correctIndex >= 0 && raw.correctIndex < options.length) {
            correctIndex = raw.correctIndex;
        } else {
            const rawCorrect = raw.correct != null ? raw.correct : (raw.answer != null ? raw.answer : raw.correctAnswer);
            if (typeof rawCorrect === 'number' && Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < options.length) {
                correctIndex = rawCorrect;
            } else if (typeof rawCorrect === 'string') {
                const correctText = cleanOptionText(rawCorrect);
                for (let i = 0; i < options.length; i++) {
                    if (normalizeText(options[i]) === normalizeText(correctText)) {
                        correctIndex = i;
                        break;
                    }
                }
            }
        }

        const subjectInfo = getSubjectByName(raw.subject || raw.subjectName || '');
        const subject = subjectInfo ? subjectInfo.name : (cleanTextValue(raw.subject, 12) || '科学');
        const subjectId = subjectInfo ? subjectInfo.id : '';

        let answerText = '';
        if (typeof raw.correct === 'string') answerText = cleanTextValue(raw.correct, 120);
        if (!answerText && typeof raw.answer === 'string') answerText = cleanTextValue(raw.answer, 120);
        if (!answerText && typeof raw.correctAnswer === 'string') answerText = cleanTextValue(raw.correctAnswer, 120);

        let correctCount = Math.round(clampNumber(raw.correctCount, 0, 3, 0));
        if (raw.mastered === true && correctCount < 3) correctCount = 3;
        const mastered = correctCount >= 3;
        let legacy = !!raw.legacy || options.length !== 3 || correctIndex < 0;
        if (legacy && options.length !== 3) options = [];
        if (legacy && correctIndex < 0) correctIndex = -1;
        if (legacy) {
            answerText = answerText || (options.length === 3 && correctIndex >= 0 ? options[correctIndex] : '');
        }

        const id = typeof raw.id === 'string' && raw.id ? raw.id : 'w_' + hash32(normalizeText(question) + '|' + subject).toString(36);
        return {
            id: id,
            subject: subject,
            subjectId: subjectId,
            scene: cleanTextValue(raw.scene, 200),
            question: question,
            options: options,
            correctIndex: correctIndex,
            answerText: answerText,
            hint: cleanTextValue(raw.hint, 160) || '再仔细看看题目里的线索，你一定可以的。',
            explain: cleanTextValue(raw.explain || raw.explanation || raw.analysis, 300) ||
                '这道题里藏着一个科学小原理，我们慢慢把它记住。',
            fun_fact: cleanTextValue(raw.fun_fact || raw.funFact, 220),
            wrongCount: Math.round(clampNumber(raw.wrongCount, 1, 99, 1)),
            correctCount: correctCount,
            mastered: mastered,
            lastAnswer: cleanTextValue(raw.lastAnswer, 120),
            createdAt: Number(raw.createdAt) || Date.now(),
            updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now(),
            legacy: legacy
        };
    }

    function dedupeWrongBook(list) {
        const byQuestion = Object.create(null);
        const result = [];
        list.forEach(function (item) {
            const normalized = normalizeWrongItem(item);
            if (!normalized) return;
            const key = normalizeText(normalized.question);
            if (!byQuestion[key]) {
                byQuestion[key] = normalized;
                result.push(normalized);
                return;
            }
            const existing = byQuestion[key];
            existing.wrongCount = Math.min(99, existing.wrongCount + normalized.wrongCount);
            existing.correctCount = Math.max(existing.correctCount, normalized.correctCount);
            existing.mastered = existing.correctCount >= 3;
            if (!existing.lastAnswer && normalized.lastAnswer) existing.lastAnswer = normalized.lastAnswer;
            if (normalized.updatedAt > existing.updatedAt) existing.updatedAt = normalized.updatedAt;
            if (existing.legacy && !normalized.legacy) {
                existing.options = normalized.options;
                existing.correctIndex = normalized.correctIndex;
                existing.hint = normalized.hint;
                existing.explain = normalized.explain;
                existing.fun_fact = normalized.fun_fact;
                existing.legacy = false;
            }
        });
        return result;
    }

    function pruneWrongBook(list) {
        const sorted = list.slice().sort(function (a, b) {
            if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
            return a.updatedAt - b.updatedAt;
        });
        while (sorted.length > MAX_WRONG) {
            sorted.shift();
        }
        return sorted;
    }

    function normalizeSeen(raw) {
        if (!Array.isArray(raw)) return [];
        const result = [];
        raw.forEach(function (entry) {
            if (!entry) return;
            if (typeof entry === 'string') {
                const question = cleanTextValue(entry, 180);
                if (question) {
                    result.push({
                        sig: signatureOf(question),
                        question: question,
                        subjectId: '',
                        at: 0
                    });
                }
                return;
            }
            if (typeof entry !== 'object') return;
            const question = cleanTextValue(entry.question || entry.q, 180);
            if (!question) return;
            let sig = typeof entry.sig === 'string' ? entry.sig : '';
            if (!sig) sig = signatureOf(question);
            result.push({
                sig: sig,
                question: question,
                subjectId: typeof entry.subjectId === 'string' ? entry.subjectId : '',
                at: Number(entry.at) || 0
            });
        });
        return result.slice(-MAX_SEEN);
    }

    function normalizeData(raw, name, grade) {
        if (!raw || typeof raw !== 'object') return freshData(name, grade);
        const today = dateKey();
        const data = {
            version: APP_VERSION,
            name: name,
            grade: grade,
            studentId: studentIdFor(name),
            createdAt: Number(raw.createdAt) || Date.now(),
            updatedAt: Date.now(),
            firstVisitDate: typeof raw.firstVisitDate === 'string' ? raw.firstVisitDate : today,
            lastVisitDate: typeof raw.lastVisitDate === 'string' ? raw.lastVisitDate : today,
            streak: Math.max(1, Math.floor(Number(raw.streak) || 1)),
            totalStars: Math.max(0, Math.floor(Number(raw.totalStars) || 0)),
            totalQuestions: Math.max(0, Math.floor(Number(raw.totalQuestions) || 0)),
            todayDate: typeof raw.todayDate === 'string' ? raw.todayDate : today,
            todayQuestions: Math.max(0, Math.floor(Number(raw.todayQuestions) || 0)),
            todayStars: Math.max(0, Math.floor(Number(raw.todayStars) || 0)),
            wrongBook: dedupeWrongBook(Array.isArray(raw.wrongBook) ? raw.wrongBook : []),
            seen: normalizeSeen(raw.seen),
            recentSubjects: Array.isArray(raw.recentSubjects)
                ? raw.recentSubjects.filter(function (id) { return typeof id === 'string'; }).slice(-MAX_RECENT_SUBJECTS)
                : [],
            subjectStats: raw.subjectStats && typeof raw.subjectStats === 'object' ? raw.subjectStats : {},
            pending: raw.pending && typeof raw.pending === 'object' ? raw.pending : null
        };
        data.wrongBook = pruneWrongBook(data.wrongBook);
        return data;
    }

    function loadStudents() {
        const list = readJSON(STORAGE.students, []);
        if (!Array.isArray(list)) return [];
        const seen = Object.create(null);
        const result = [];
        list.forEach(function (item) {
            if (!item || typeof item !== 'object') return;
            const name = normalizeStudentName(item.name);
            if (!name) return;
            // 学号始终由名字推导，避免旧摘要或损坏记录把同一个孩子分到两份档案。
            const id = studentIdFor(name);
            if (seen[id]) return;
            seen[id] = true;
            result.push({
                id: id,
                name: name,
                grade: [1, 3, 5].indexOf(item.grade) !== -1 ? item.grade : 3,
                avatar: avatarLetter(name),
                updatedAt: Number(item.updatedAt) || 0,
                createdAt: Number(item.createdAt) || 0
            });
        });
        result.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
        return result.slice(0, MAX_STUDENTS);
    }

    function saveStudents(list) {
        writeJSON(STORAGE.students, list.slice(0, MAX_STUDENTS));
    }

    function persistData() {
        if (!state.data) return;
        if (state.currentQuestion && state.pending) {
            state.pending.savedAt = Date.now();
            state.pending.dateKey = dateKey();
            state.pending.question = state.currentQuestion;
        }
        state.data.pending = state.pending || null;
        state.data.updatedAt = Date.now();
        const ok = writeJSON(STORAGE.dataPrefix + state.data.studentId, state.data);
        if (!ok && !state.storageWarned) {
            state.storageWarned = true;
            showToast('这台电脑的存储空间有点满，记录可能保存不完整，可以告诉老师。', 4000);
        }
        const students = loadStudents();
        const summary = {
            id: state.data.studentId,
            name: state.data.name,
            grade: state.data.grade,
            avatar: avatarLetter(state.data.name),
            updatedAt: Date.now(),
            createdAt: state.data.createdAt
        };
        let found = false;
        for (let i = 0; i < students.length; i++) {
            if (students[i].id === summary.id) {
                students[i] = summary;
                found = true;
                break;
            }
        }
        if (!found) students.unshift(summary);
        students.sort(function (a, b) {
            return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
        });
        saveStudents(students);
        writeRaw(STORAGE.lastStudent, summary.id);
        updateHUD();
        updateWrongBadge();
        updateSettingsStatus();
    }

    function ensureDailyState(data) {
        if (!data) return false;
        const today = dateKey();
        let changed = false;
        if (!data.todayDate) {
            data.todayDate = today;
            changed = true;
        }
        if (data.todayDate !== today) {
            const gap = data.lastVisitDate ? daysBetween(data.lastVisitDate, today) : null;
            data.streak = gap === 1 ? Math.max(1, (Number(data.streak) || 0) + 1) : 1;
            data.todayDate = today;
            data.todayQuestions = 0;
            data.todayStars = 0;
            data.recentSubjects = [];
            data.pending = null;
            changed = true;
        }
        if (data.lastVisitDate !== today) {
            data.lastVisitDate = today;
            changed = true;
        }
        return changed;
    }

    function getDataKey(id) {
        return STORAGE.dataPrefix + id;
    }

    function loadDataForStudent(id) {
        const raw = readJSON(getDataKey(id), null);
        return raw && typeof raw === 'object' ? raw : null;
    }

    /* ----------------------------- 旧版记录迁移 ----------------------------- */

    function readLegacyName() {
        let raw = readRaw(LEGACY_NAME_KEY);
        if (!raw) return '';
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'string') raw = parsed;
            else if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string') raw = parsed.name;
        } catch (error) {
            /* 旧值可能直接就是名字 */
        }
        return normalizeStudentName(raw);
    }

    function readLegacyWrongBook() {
        let data = readJSON(LEGACY_WRONG_KEY, []);
        if (data && !Array.isArray(data) && typeof data === 'object') {
            if (Array.isArray(data.items)) data = data.items;
            else if (Array.isArray(data.wrongBook)) data = data.wrongBook;
            else if (Array.isArray(data.list)) data = data.list;
            else data = Object.keys(data).map(function (key) { return data[key]; });
        }
        if (!Array.isArray(data)) return [];
        return data.slice(0, 60);
    }

    function maybeImportLegacy(data) {
        if (!data || !state.legacy.name) return 0;
        if (normalizeStudentName(state.legacy.name) !== normalizeStudentName(data.name)) return 0;
        if (readRaw(STORAGE.legacyMigrated) === '1') return 0;
        if (data.wrongBook.length > 0) {
            writeRaw(STORAGE.legacyMigrated, '1');
            return 0;
        }
        const imported = dedupeWrongBook(state.legacy.wrongBook || []);
        if (imported.length) {
            data.wrongBook = pruneWrongBook(imported);
        }
        writeRaw(STORAGE.legacyMigrated, '1');
        return imported.length;
    }

    /* ----------------------------- 界面：HUD ----------------------------- */

    function updateHUD() {
        if (!state.data) {
            if (dom.helloName) dom.helloName.textContent = '小探险家';
            if (dom.avatar) dom.avatar.textContent = '?';
            if (dom.levelName) dom.levelName.textContent = LEVELS[0].name;
            if (dom.levelFill) dom.levelFill.style.width = '0%';
            if (dom.starCount) dom.starCount.textContent = '0';
            if (dom.streakCount) dom.streakCount.textContent = '1';
            return;
        }
        const data = state.data;
        const level = levelInfo(data.totalStars);
        if (dom.helloName) dom.helloName.textContent = data.name;
        if (dom.avatar) dom.avatar.textContent = avatarLetter(data.name);
        if (dom.levelName) dom.levelName.textContent = level.name;
        if (dom.levelFill) dom.levelFill.style.width = level.progress + '%';
        if (dom.starCount) dom.starCount.textContent = String(data.totalStars);
        if (dom.streakCount) dom.streakCount.textContent = String(data.streak || 1);
        if (dom.starPill) dom.starPill.title = '已经收集 ' + data.totalStars + ' 颗星星';
        if (dom.streakPill) dom.streakPill.title = '连续探索 ' + (data.streak || 1) + ' 天';
        updateDockNote();
        updateSettingsProfile();
        updateWrongBadge();
        updateSettingsStatus();
    }

    function updateDockNote() {
        if (!dom.dockNote) return;
        const data = state.data;
        if (!data) {
            dom.dockNote.textContent = '每天都有新发现';
            return;
        }
        const due = data.wrongBook.filter(function (item) { return !item.mastered; }).length;
        if (due > 0) {
            dom.dockNote.textContent = '📕 ' + due + ' 道题在宝盒里等你';
        } else if (data.todayQuestions > 0) {
            dom.dockNote.textContent = '今天已发现 ' + data.todayQuestions + ' 个新知识';
        } else {
            dom.dockNote.textContent = '题目永远出不完，慢慢来';
        }
    }

    function updateWrongBadge() {
        if (!dom.wrongBadge) return;
        const data = state.data;
        const due = data ? data.wrongBook.filter(function (item) { return !item.mastered; }).length : 0;
        dom.wrongBadge.textContent = String(due);
        dom.wrongBadge.setAttribute('data-empty', due === 0 ? 'true' : 'false');
        if (dom.wrongBookBtn) {
            dom.wrongBookBtn.setAttribute('aria-label', '打开错题宝盒，' + due + ' 道待复习');
        }
        updateDockNote();
    }

    function updateSettingsProfile() {
        if (dom.settingsAvatar) dom.settingsAvatar.textContent = state.data ? avatarLetter(state.data.name) : '?';
        if (dom.settingsName) dom.settingsName.textContent = state.data ? state.data.name : '小探险家';
        if (dom.settingsGrade) dom.settingsGrade.textContent = state.data ? gradeLabel(state.data.grade) : '3-4 年级';
    }

    function updateSettingsStatus() {
        const data = state.data;
        if (dom.totalQuestionsStatus) {
            dom.totalQuestionsStatus.textContent = data ? data.totalQuestions + ' 个' : '0 个';
        }
        if (dom.wrongBookStatus) {
            const due = data ? data.wrongBook.filter(function (item) { return !item.mastered; }).length : 0;
            dom.wrongBookStatus.textContent = due ? due + ' 道待复习' : '没有待复习的题';
        }
        updateAIStatus();
    }

    function updateThemeChip() {
        const studentId = state.data ? state.data.studentId : '';
        state.theme = themeForDay(dateKey(), studentId) || FALLBACK_SUBJECT;
        if (dom.themeIcon) dom.themeIcon.textContent = state.theme.icon || '🪐';
        if (dom.themeText) dom.themeText.textContent = '今日星际主题 · ' + (state.theme.theme || '星空奇遇');
        if (dom.themeChip) {
            dom.themeChip.title = '今日主题：' + (state.theme.name || '天文') + ' · ' + (state.theme.theme || '星空奇遇');
        }
    }

    /* ----------------------------- 界面：声音状态 ----------------------------- */

    function applySoundUI() {
        const muted = state.settings.muted;
        if (dom.soundIcon) dom.soundIcon.textContent = muted ? '🔇' : '🔊';
        if (dom.soundToggle) {
            dom.soundToggle.setAttribute('aria-label', muted ? '打开声音' : '关闭声音');
            dom.soundToggle.title = muted ? '声音已关闭' : '声音已打开';
        }
        if (dom.welcomeSoundBtn) {
            dom.welcomeSoundBtn.textContent = muted ? '🔇 声音已关闭' : '🔊 声音已打开';
            dom.welcomeSoundBtn.setAttribute('aria-label', muted ? '打开声音' : '关闭声音');
        }
        if (dom.autoReadToggle) dom.autoReadToggle.checked = !!state.settings.autoRead;
        if (dom.sfxToggle) dom.sfxToggle.checked = !!state.settings.sfx;
        if (dom.ambientToggle) dom.ambientToggle.checked = !!state.settings.ambient;
        if (dom.volumeRange) dom.volumeRange.value = String(state.settings.volume);
        if (dom.volumeValue) dom.volumeValue.textContent = Math.round(state.settings.volume * 100) + '%';
        if (dom.rateRange) dom.rateRange.value = String(state.settings.rate);
        if (dom.rateValue) dom.rateValue.textContent = state.settings.rate.toFixed(2);
        AudioFX.updateMaster();
        AudioFX.syncAmbient();
    }

    function toggleSound() {
        state.settings.muted = !state.settings.muted;
        saveSettings();
        applySoundUI();
        if (state.settings.muted) {
            SpeechService.stop();
            showToast('声音关掉啦，文字还在气泡里。');
        } else {
            AudioFX.ensure();
            showToast('声音打开啦！');
            if (state.settings.autoRead) {
                SpeechService.speak('声音打开啦，我们继续探险吧。');
            }
        }
        updateHUD();
    }

    /* ----------------------------- 欢迎页 ----------------------------- */

    function setWelcomeGrade(grade) {
        state.welcomeGrade = [1, 3, 5].indexOf(grade) !== -1 ? grade : 3;
        if (!dom.gradeGrid) return;
        const buttons = dom.gradeGrid.querySelectorAll('.grade-btn');
        for (let i = 0; i < buttons.length; i++) {
            const value = Number(buttons[i].getAttribute('data-grade'));
            const active = value === state.welcomeGrade;
            buttons[i].classList.toggle('active', active);
            buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    }

    function renderRecentStudents() {
        if (!dom.recentList || !dom.recentBlock) return;
        dom.recentList.textContent = '';
        const students = loadStudents();
        const list = [];
        const seenIds = {};
        students.forEach(function (student) {
            if (seenIds[student.id]) return;
            seenIds[student.id] = true;
            list.push(student);
        });

        if (!list.length && state.legacy.name) {
            list.push({
                id: 'legacy_' + studentIdFor(state.legacy.name),
                name: state.legacy.name,
                grade: 3,
                avatar: avatarLetter(state.legacy.name),
                legacy: true
            });
        }

        list.slice(0, 6).forEach(function (student) {
            const chip = makeButton('recent-chip');
            chip.title = '用 ' + student.name + ' 的名字进入（' + gradeLabel(student.grade) + '）';
            const mini = el('span', 'mini-avatar', student.avatar || avatarLetter(student.name));
            mini.setAttribute('aria-hidden', 'true');
            chip.appendChild(mini);
            chip.appendChild(document.createTextNode(student.name));
            chip.addEventListener('click', function () {
                state.selectedRecentId = student.id;
                if (dom.nameInput) {
                    dom.nameInput.value = student.name;
                    dom.nameInput.focus();
                }
                setWelcomeGrade(student.grade || 3);
                if (dom.nameError) dom.nameError.textContent = '';
                if (dom.welcomeSub) {
                    dom.welcomeSub.textContent = '又见面啦，' + student.name + '！确认名字后，点“出发去探险”就能接着玩。';
                }
            });
            dom.recentList.appendChild(chip);
        });

        dom.recentBlock.hidden = list.length === 0;
    }

    function prefillWelcome() {
        const students = loadStudents();
        const lastId = readRaw(STORAGE.lastStudent);
        let prefill = null;
        if (lastId) {
            for (let i = 0; i < students.length; i++) {
                if (students[i].id === lastId) {
                    prefill = students[i];
                    break;
                }
            }
        }
        if (!prefill && students.length) prefill = students[0];
        if (!prefill && state.legacy.name) {
            prefill = {
                name: state.legacy.name,
                grade: 3,
                id: 'legacy_' + studentIdFor(state.legacy.name)
            };
        }
        if (prefill) {
            if (dom.nameInput) dom.nameInput.value = prefill.name;
            setWelcomeGrade(prefill.grade || 3);
            if (dom.welcomeSub) {
                dom.welcomeSub.textContent = '欢迎回来，' + prefill.name + '！嘟嘟一直在等你。确认名字后，我们就出发吧。';
            }
        } else {
            setWelcomeGrade(3);
        }
        renderRecentStudents();
    }

    function showWelcome(options) {
        if (!dom.welcomeOverlay) return;
        const opts = options || {};
        // 换同学时先清掉屏幕上的旧档案，避免下一位孩子看到上一位的名字和星星。
        state.data = null;
        state.currentQuestion = null;
        state.pending = null;
        state.entered = false;
        state.answerLocked = true;
        state.aiQueue = null;
        clearMainChat();
        resetChatSession();
        updateHUD();
        updateWrongBadge();
        updateSettingsProfile();
        dom.welcomeOverlay.hidden = false;
        dom.welcomeOverlay.setAttribute('aria-hidden', 'false');
        if (dom.nameError) dom.nameError.textContent = '';
        if (!opts.keepFields) {
            if (dom.nameInput) dom.nameInput.value = '';
            if (dom.welcomeSub) {
                dom.welcomeSub.textContent = '换一位小探险家啦！告诉我你的名字，我们一起出发去发现地球的小秘密吧。';
            }
            setWelcomeGrade(3);
        }
        renderRecentStudents();
        setTimeout(function () {
            if (dom.nameInput) dom.nameInput.focus();
        }, 60);
    }

    function hideWelcome() {
        if (!dom.welcomeOverlay) return;
        dom.welcomeOverlay.hidden = true;
        dom.welcomeOverlay.setAttribute('aria-hidden', 'true');
    }

    /* ----------------------------- 开始与切换 ----------------------------- */

    function validateNameInput() {
        const raw = dom.nameInput ? dom.nameInput.value : '';
        const name = normalizeStudentName(raw);
        if (!name) {
            return { ok: false, name: '', message: '先告诉嘟嘟你的名字或小名吧。' };
        }
        if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(name)) {
            return { ok: false, name: name, message: '名字里要有文字哦，比如：小明、果果、星星。' };
        }
        return { ok: true, name: name, message: '' };
    }

    function startSession(event) {
        if (event) event.preventDefault();
        if (state.starting) return;
        if (!knowledge) {
            if (dom.nameError) dom.nameError.textContent = '星际引擎没有加载成功，请刷新页面或告诉老师。';
            return;
        }
        const validation = validateNameInput();
        if (!validation.ok) {
            if (dom.nameError) dom.nameError.textContent = validation.message;
            if (dom.nameInput) dom.nameInput.focus();
            return;
        }

        state.starting = true;
        if (dom.startBtn) {
            dom.startBtn.disabled = true;
            dom.startBtn.textContent = '🚀 正在出发…';
        }
        if (dom.nameError) dom.nameError.textContent = '';
        AudioFX.ensure();

        setTimeout(function () {
            try {
                const name = validation.name;
                const grade = state.welcomeGrade;
                const id = studentIdFor(name);
                const rawData = loadDataForStudent(id);
                const existing = !!rawData;
                const previousToday = rawData && typeof rawData.todayDate === 'string' ? rawData.todayDate : '';
                let data = existing ? normalizeData(rawData, name, grade) : freshData(name, grade);

                if (!existing) {
                    const imported = maybeImportLegacy(data);
                    if (imported > 0) {
                        setTimeout(function () {
                            showToast('把以前的 ' + imported + ' 道错题搬进新宝盒啦。', 3200);
                        }, 900);
                    }
                } else if (data.wrongBook.length === 0) {
                    maybeImportLegacy(data);
                }

                data.name = name;
                data.grade = grade;
                data.updatedAt = Date.now();
                ensureDailyState(data);

                state.data = data;
                state.entered = true;
                state.currentQuestion = null;
                state.pending = validatePending(data.pending);
                state.answerLocked = false;
                state.nextLocked = false;
                state.nextCooldownUntil = 0;
                state.answerCooldownUntil = 0;
                state.aiQueue = null;
                if (state.prefetchTimer) {
                    clearTimeout(state.prefetchTimer);
                    state.prefetchTimer = null;
                }
                state.practice = {};
                state.deleteConfirmId = '';
                state.deleteArmedAt = 0;
                state.clearArmed = false;
                state.clearArmedAt = 0;
                state.resetArmedAt = 0;
                state.wrongFilters = { status: 'due', subject: 'all' };
                state.chatHistory = [];
                state.chatInitialized = false;
                state.chatBusy = false;
                state.selectedRecentId = '';

                hideWelcome();
                updateThemeChip();
                updateHUD();
                updateWrongBadge();
                updateSettingsProfile();
                applySoundProfileToInputs();
                clearMainChat();
                resetChatSession();
                setMood('thinking');
                setMascotBubble('我们一起看看这个问题。');
                AudioFX.syncAmbient();

                const isBrandNew = !existing;
                const isNewDay = !previousToday || previousToday !== data.todayDate;
                const greeting = greetingFor(data, isBrandNew, isNewDay);
                addPetMessage(greeting, { speak: false });

                if (state.pending) {
                    addPetMessage('欢迎回来，我们接着刚才的问题。', { speak: false });
                    restorePendingQuestion();
                } else {
                    const first = getNextQuestion(true);
                    showQuestion(first, { prefixSpeech: greeting });
                }

                persistData();
                renderRecentStudents();
                updateSettingsStatus();
            } catch (error) {
                console.error('startSession failed', error);
                showWelcome({ keepFields: true });
                if (dom.nameError) dom.nameError.textContent = '星际飞船有点忙，请再点一次“出发去探险”。';
                if (dom.welcomeSub) {
                    dom.welcomeSub.textContent = '嗨！我是来自星星的嘟嘟。告诉我你的名字，我们一起出发吧！';
                }
            } finally {
                state.starting = false;
                if (dom.startBtn) {
                    dom.startBtn.disabled = false;
                    dom.startBtn.textContent = '🚀 出发去探险';
                }
            }
        }, 80);
    }

    function greetingFor(data, isBrandNew, isNewDay) {
        const name = data.name;
        const theme = state.theme || FALLBACK_SUBJECT;
        const due = data.wrongBook.filter(function (item) { return !item.mastered; }).length;
        let dueText = '';
        if (due > 0 && !isBrandNew) {
            dueText = due > 5 ? '错题宝盒里还有几道题，等你慢慢复习。' : '错题宝盒里有 ' + due + ' 道题，等你慢慢复习。';
        }
        if (isBrandNew) {
            return '嗨，' + name + '！我是嘟嘟，来自闪闪星。今天我们的星际主题是「' + theme.theme + '」，一起出发去发现地球的小秘密吧！' + dueText;
        }
        if (isNewDay) {
            return timeGreeting() + '，' + name + '！这是你连续第 ' + (data.streak || 1) + ' 天来探险，嘟嘟真开心。今天的主题是「' + theme.theme + '」，看看有什么新发现！' + dueText;
        }
        return '欢迎回来，' + name + '！嘟嘟又把星际笔记本翻到新的一页啦。今天我们去看看「' + theme.theme + '」。' + dueText;
    }

    function clearMainChat() {
        if (dom.chatContainer) dom.chatContainer.textContent = '';
        if (dom.optionsGrid) dom.optionsGrid.textContent = '';
        if (dom.nextRow) dom.nextRow.hidden = true;
        if (dom.nextBtn) dom.nextBtn.disabled = false;
    }

    function resetChatSession() {
        // 换同学/重置时递增，让上一轮还在路上的 AI 回复和预取题失效。
        state.sessionEpoch++;
        if (state.prefetchTimer) {
            clearTimeout(state.prefetchTimer);
            state.prefetchTimer = null;
        }
        state.prefetching = false;
        state.aiQueue = null;
        if (dom.chatThread) dom.chatThread.textContent = '';
        if (dom.chatInput) {
            dom.chatInput.value = '';
            dom.chatInput.disabled = false;
        }
        if (dom.chatSendBtn) {
            dom.chatSendBtn.disabled = false;
            dom.chatSendBtn.textContent = '发送';
        }
        state.chatBusy = false;
        state.chatHistory = [];
        state.chatInitialized = false;
    }

    function switchStudent() {
        if (!state.data) return;
        closeSettings();
        SpeechService.stop();
        AudioFX.stopAmbient();
        state.entered = false;
        state.answerLocked = true;
        persistData();
        resetChatSession();
        showWelcome();
        updateSettingsStatus();
    }

    /* ----------------------------- 题目：获取与展示 ----------------------------- */

    function seenSignatures() {
        if (!state.data) return [];
        return state.data.seen.map(function (entry) { return entry.sig; }).filter(Boolean);
    }

    function seenQuestions() {
        if (!state.data) return [];
        return state.data.seen.map(function (entry) { return entry.question; }).filter(Boolean);
    }

    function weakSubjectId() {
        if (!state.data || !state.data.subjectStats) return '';
        let best = '';
        let bestScore = 0;
        Object.keys(state.data.subjectStats).forEach(function (id) {
            const stat = state.data.subjectStats[id];
            if (!stat) return;
            const wrong = Number(stat.wrong) || 0;
            const correct = Number(stat.correct) || 0;
            const score = wrong - correct * 0.45;
            if (wrong > 0 && score > bestScore) {
                bestScore = score;
                best = id;
            }
        });
        return best;
    }

    function emergencyQuestion() {
        const q = {
            subject: FALLBACK_QUESTION.subject,
            subjectId: FALLBACK_QUESTION.subjectId,
            scene: FALLBACK_QUESTION.scene,
            question: FALLBACK_QUESTION.question,
            options: FALLBACK_QUESTION.options.slice(),
            correctIndex: FALLBACK_QUESTION.correctIndex,
            hint: FALLBACK_QUESTION.hint,
            explain: FALLBACK_QUESTION.explain,
            feedback_correct: FALLBACK_QUESTION.feedback_correct,
            feedback_wrong: FALLBACK_QUESTION.feedback_wrong,
            fun_fact: FALLBACK_QUESTION.fun_fact,
            source: 'local',
            createdAt: Date.now()
        };
        q.signature = signatureOf(q);
        return q;
    }

    function getNextQuestion(isFirst) {
        if (!state.data) return emergencyQuestion();
        state.questionSerial++;
        const avoidSignatures = seenSignatures();
        if (state.currentQuestion) avoidSignatures.push(signatureOf(state.currentQuestion));
        const seed = Date.now() + '|' + state.data.studentId + '|' + state.questionSerial + '|' + Math.random();
        try {
            if (knowledge && typeof knowledge.generateQuestion === 'function') {
                const q = knowledge.generateQuestion({
                    seed: seed,
                    studentId: state.data.studentId,
                    gradeBand: state.data.grade,
                    themeId: state.theme.id,
                    preferTheme: isFirst || state.data.todayQuestions < 3,
                    avoidSignatures: avoidSignatures,
                    avoidQuestions: seenQuestions(),
                    recentSubjects: state.data.recentSubjects,
                    weakSubjectId: weakSubjectId()
                });
                if (q && Array.isArray(q.options) && q.options.length === 3 && Number.isInteger(q.correctIndex)) {
                    return normalizeQuestionObject(q);
                }
            }
        } catch (error) {
            console.warn('local question failed', error);
        }
        return emergencyQuestion();
    }

    function normalizeQuestionObject(q) {
        const subject = getSubjectByName(q.subject) || getSubjectById(q.subjectId) || state.theme || FALLBACK_SUBJECT;
        const options = [];
        if (Array.isArray(q.options)) {
            q.options.forEach(function (option) {
                const value = cleanOptionText(option);
                if (value && options.indexOf(value) === -1) options.push(value);
            });
        }
        let correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : 0;
        if (correctIndex < 0 || correctIndex >= options.length) correctIndex = 0;
        const result = {
            subject: subject.name || q.subject || '科学',
            subjectId: subject.id || q.subjectId || '',
            scene: cleanTextValue(q.scene, 200) || '我刚从星际笔记本里翻到一个有趣的问题。',
            question: cleanTextValue(q.question, 180) || FALLBACK_QUESTION.question,
            options: options.length === 3 ? options : FALLBACK_QUESTION.options.slice(),
            correctIndex: options.length === 3 ? correctIndex : FALLBACK_QUESTION.correctIndex,
            hint: cleanTextValue(q.hint, 160) || '再仔细看看题目里的线索，你一定可以的。',
            explain: cleanTextValue(q.explain, 300) || '这个现象里藏着一个科学小原理，我们一起记住它。',
            feedback_correct: cleanTextValue(q.feedback_correct, 80) || CORRECT_WORDS[Math.floor(Math.random() * CORRECT_WORDS.length)],
            feedback_wrong: cleanTextValue(q.feedback_wrong, 80) || WRONG_WORDS[Math.floor(Math.random() * WRONG_WORDS.length)],
            fun_fact: cleanTextValue(q.fun_fact || q.funFact, 220),
            source: q.source === 'ai' ? 'ai' : 'local',
            themeId: q.themeId || (state.theme ? state.theme.id : ''),
            createdAt: Number(q.createdAt) || Date.now()
        };
        result.signature = q.signature || signatureOf(result);
        return result;
    }

    function validatePending(rawPending) {
        if (!rawPending || typeof rawPending !== 'object') return null;
        if (!state.data) return null;
        if (rawPending.dateKey && rawPending.dateKey !== dateKey()) return null;
        const age = Date.now() - (Number(rawPending.savedAt) || 0);
        if (!isFinite(age) || age < 0 || age > PENDING_MAX_AGE) return null;
        const rawQuestion = rawPending.question;
        if (!rawQuestion || typeof rawQuestion !== 'object') return null;
        if (!Array.isArray(rawQuestion.options) || rawQuestion.options.length !== 3) return null;
        if (!Number.isInteger(rawQuestion.correctIndex) || rawQuestion.correctIndex < 0 || rawQuestion.correctIndex >= 3) {
            return null;
        }
        if (!rawQuestion.question) return null;
        const question = normalizeQuestionObject(rawQuestion);
        const tried = Array.isArray(rawPending.triedIndices)
            ? rawPending.triedIndices.filter(function (index) { return Number.isInteger(index) && index >= 0 && index < 3; })
            : [];
        const attempts = Math.max(0, Math.min(2, Number(rawPending.attempts) || 0));
        const answered = !!rawPending.answered;
        const revealed = !!rawPending.revealed;
        const feedbackKind = rawPending.feedbackKind === 'correct' || rawPending.feedbackKind === 'revealed'
            ? rawPending.feedbackKind
            : (answered ? (revealed ? 'revealed' : 'correct') : null);
        return {
            question: question,
            answered: answered,
            wasCorrect: !!rawPending.wasCorrect,
            attempts: attempts,
            triedIndices: tried,
            revealed: revealed,
            feedbackKind: feedbackKind,
            selectedIndex: Number.isInteger(rawPending.selectedIndex) ? rawPending.selectedIndex : null,
            savedAt: Number(rawPending.savedAt) || Date.now(),
            dateKey: rawPending.dateKey || dateKey()
        };
    }

    function trimMainChat() {
        if (!dom.chatContainer) return;
        while (dom.chatContainer.children.length > 70) {
            dom.chatContainer.removeChild(dom.chatContainer.firstElementChild);
        }
    }

    function scrollChat() {
        if (!dom.chatContainer) return;
        window.requestAnimationFrame(function () {
            dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
        });
    }

    function addBubbleAudio(bubble, text) {
        if (!SpeechService.supported) return;
        const button = makeButton('bubble-audio', '🔈 听嘟嘟说');
        button.setAttribute('aria-label', '听嘟嘟朗读这段话');
        button.addEventListener('click', function () {
            if (state.settings.muted) {
                showToast('先打开声音，才能听嘟嘟朗读哦。');
                return;
            }
            SpeechService.speak(text, { force: true });
        });
        bubble.appendChild(button);
    }

    function addPetMessage(text, options) {
        const opts = options || {};
        trimMainChat();
        const row = el('div', 'bubble-row pet');
        const avatar = el('span', 'pet-avatar', '嘟');
        avatar.setAttribute('aria-hidden', 'true');
        row.appendChild(avatar);
        const bubble = el('div', 'bubble pet-bubble');
        const paragraph = el('p', null, text);
        bubble.appendChild(paragraph);
        if (opts.audio !== false) addBubbleAudio(bubble, text);
        row.appendChild(bubble);
        if (dom.chatContainer) dom.chatContainer.appendChild(row);
        if (opts.speak && state.settings.autoRead && !state.settings.muted) {
            SpeechService.speak(text);
        }
        scrollChat();
        return bubble;
    }

    function addUserMessage(text) {
        const row = el('div', 'bubble-row user');
        const bubble = el('div', 'bubble user-bubble');
        bubble.appendChild(el('p', null, text));
        row.appendChild(bubble);
        if (dom.chatContainer) dom.chatContainer.appendChild(row);
        scrollChat();
        return bubble;
    }

    function questionSpeechText(q, prefix) {
        const optionsText = q.options.map(function (option, index) {
            return 'ABC'[index] + '，' + option;
        }).join('；');
        return (prefix ? prefix + ' ' : '') + q.scene + ' ' + q.question + '。选项是：' + optionsText + '。';
    }

    function addQuestionRow(q) {
        const row = el('div', 'bubble-row pet');
        const avatar = el('span', 'pet-avatar', '嘟');
        avatar.setAttribute('aria-hidden', 'true');
        row.appendChild(avatar);
        const bubble = el('div', 'bubble pet-bubble');
        const scene = el('p', 'line-soft', q.scene);
        const question = el('p');
        const strong = el('strong', null, q.question);
        question.appendChild(strong);
        bubble.appendChild(scene);
        bubble.appendChild(question);
        addBubbleAudio(bubble, questionSpeechText(q, ''));
        row.appendChild(bubble);
        if (dom.chatContainer) dom.chatContainer.appendChild(row);
        return { row: row, bubble: bubble };
    }

    function renderOptions(q, restore) {
        if (!dom.optionsGrid) return;
        dom.optionsGrid.textContent = '';
        const restoreState = restore || {};
        q.options.forEach(function (option, index) {
            const button = makeButton('option-btn');
            const key = el('span', 'option-key', 'ABC'[index]);
            const text = el('span', 'option-text', option);
            button.appendChild(key);
            button.appendChild(text);
            button.setAttribute('aria-label', '选项 ' + 'ABC'[index] + '：' + option);
            const tried = restoreState.triedIndices && restoreState.triedIndices.indexOf(index) !== -1;
            const isCorrect = index === q.correctIndex;
            if ((restoreState.revealed || restoreState.wasCorrect) && isCorrect) button.classList.add('correct');
            if (tried) {
                button.classList.add('wrong');
                button.disabled = true;
            }
            if (restoreState.answered) button.disabled = true;
            button.addEventListener('click', function () {
                handleOptionSelect(index, button);
            });
            dom.optionsGrid.appendChild(button);
        });
    }

    function showQuestion(q, options) {
        const opts = options || {};
        if (!state.data) return;
        trimMainChat();
        state.currentQuestion = q;
        state.pending = {
            question: q,
            answered: false,
            wasCorrect: false,
            attempts: 0,
            triedIndices: [],
            revealed: false,
            feedbackKind: null,
            selectedIndex: null,
            savedAt: Date.now(),
            dateKey: dateKey()
        };
        state.answerLocked = false;
        state.answerCooldownUntil = 0;
        state.nextLocked = false;
        if (dom.nextRow) dom.nextRow.hidden = true;
        if (dom.nextBtn) dom.nextBtn.disabled = false;

        const questionRow = addQuestionRow(q);
        renderOptions(q);

        if (!opts.restored) {
            dataCountQuestion(q);
        }

        if (opts.prefixSpeech && state.settings.autoRead && !state.settings.muted) {
            SpeechService.speak(questionSpeechText(q, opts.prefixSpeech));
        } else if (state.settings.autoRead && !state.settings.muted) {
            SpeechService.speak(questionSpeechText(q, ''));
        }

        updateHUD();
        scrollChat();
        schedulePrefetch(1200);
        if (questionRow && questionRow.bubble) questionRow.bubble.setAttribute('data-current', 'true');
    }

    function dataCountQuestion(q) {
        if (!state.data) return;
        state.data.totalQuestions++;
        state.data.todayQuestions++;
        const sig = q.signature || signatureOf(q);
        let exists = false;
        for (let i = 0; i < state.data.seen.length; i++) {
            if (state.data.seen[i].sig === sig) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            state.data.seen.push({
                sig: sig,
                question: q.question,
                subjectId: q.subjectId || '',
                at: Date.now()
            });
        }
        if (state.data.seen.length > MAX_SEEN) {
            state.data.seen = state.data.seen.slice(-MAX_SEEN);
        }
        if (q.subjectId) {
            const recent = state.data.recentSubjects.filter(function (id) { return id !== q.subjectId; });
            recent.push(q.subjectId);
            state.data.recentSubjects = recent.slice(-MAX_RECENT_SUBJECTS);
        }
        state.data.updatedAt = Date.now();
        persistData();
    }

    function restorePendingQuestion() {
        const pending = state.pending;
        if (!pending || !pending.question) {
            state.pending = null;
            const q = getNextQuestion(true);
            showQuestion(q);
            return;
        }
        const q = pending.question;
        state.currentQuestion = q;
        state.answerLocked = true;
        if (dom.nextRow) dom.nextRow.hidden = true;
        addQuestionRow(q);
        renderOptions(q, {
            triedIndices: pending.triedIndices,
            revealed: pending.revealed,
            answered: pending.answered,
            wasCorrect: pending.wasCorrect
        });
        updateHUD();
        scrollChat();

        if (pending.answered) {
            if (pending.feedbackKind === 'correct' || pending.wasCorrect) {
                showCorrectFeedback(q, true);
            } else {
                showRevealedFeedback(q, true);
            }
            showNextButton();
        } else if (pending.attempts > 0) {
            addWrongHintFeedback(q, true);
            state.answerLocked = false;
            if (state.settings.autoRead && !state.settings.muted) {
                SpeechService.speak(questionSpeechText(q, ''));
            }
        } else {
            state.answerLocked = false;
            if (state.settings.autoRead && !state.settings.muted) {
                SpeechService.speak(questionSpeechText(q, ''));
            }
        }
        schedulePrefetch(1500);
    }

    /* ----------------------------- 答题 ----------------------------- */

    function handleOptionSelect(index, button) {
        if (!state.data || !state.currentQuestion || !state.pending) return;
        if (state.answerLocked || state.pending.answered) return;
        if (Date.now() < state.answerCooldownUntil) return;
        const q = state.currentQuestion;
        if (index === q.correctIndex) {
            answerCorrect(index, button);
        } else {
            answerWrong(index, button);
        }
    }

    function disableAllOptions() {
        if (!dom.optionsGrid) return;
        const buttons = dom.optionsGrid.querySelectorAll('.option-btn');
        for (let i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    }

    function answerCorrect(index, button) {
        const q = state.currentQuestion;
        const pending = state.pending;
        if (!q || !pending) return;
        state.answerLocked = true;
        if (button) button.classList.add('correct');
        disableAllOptions();
        pending.answered = true;
        pending.wasCorrect = true;
        pending.revealed = false;
        pending.feedbackKind = 'correct';
        pending.selectedIndex = index;
        pending.savedAt = Date.now();

        const data = state.data;
        const oldLevel = levelInfo(data.totalStars);
        data.totalStars++;
        data.todayStars++;
        const stat = ensureSubjectStats(data)[q.subjectId || q.subject];
        if (!stat) {
            data.subjectStats[q.subjectId || q.subject] = { attempts: 0, correct: 0, wrong: 0 };
        }
        const currentStat = data.subjectStats[q.subjectId || q.subject];
        currentStat.attempts = (Number(currentStat.attempts) || 0) + 1;
        currentStat.correct = (Number(currentStat.correct) || 0) + 1;

        const credit = creditWrongBookAnswer(q);
        const newLevel = levelInfo(data.totalStars);
        AudioFX.correct();
        burstConfetti();
        setMood('celebrate');
        const token = state.moodToken;
        setTimeout(function () {
            if (token === state.moodToken) setMood('happy');
        }, 1150);
        setMascotBubble('答对啦！你太棒了！');
        bumpElement(dom.starPill);

        showCorrectFeedback(q, false);
        showNextButton();
        persistData();

        if (newLevel.name !== oldLevel.name) {
            setTimeout(function () {
                AudioFX.levelUp();
                burstConfetti();
                showToast('升级啦！你现在是「' + newLevel.name + '」', 3400);
            }, 650);
        }
        if (credit && credit.justMastered) {
            setTimeout(function () {
                showToast('这道题已经答对 3 次，可以在错题宝盒里移出啦。', 3600);
            }, 1100);
        }
        updateHUD();
    }

    function answerWrong(index, button) {
        const q = state.currentQuestion;
        const pending = state.pending;
        if (!q || !pending) return;
        state.answerLocked = true;
        state.answerCooldownUntil = Date.now() + 480;
        pending.attempts = Math.min(2, (Number(pending.attempts) || 0) + 1);
        pending.selectedIndex = index;
        pending.savedAt = Date.now();
        if (pending.triedIndices.indexOf(index) === -1) pending.triedIndices.push(index);
        if (button) {
            button.classList.add('wrong');
            button.disabled = true;
        }

        const data = state.data;
        const stat = ensureSubjectStats(data)[q.subjectId || q.subject];
        if (!stat) {
            data.subjectStats[q.subjectId || q.subject] = { attempts: 0, correct: 0, wrong: 0 };
        }
        const currentStat = data.subjectStats[q.subjectId || q.subject];
        currentStat.attempts = (Number(currentStat.attempts) || 0) + 1;
        currentStat.wrong = (Number(currentStat.wrong) || 0) + 1;

        recordWrong(q, q.options[index]);

        if (pending.attempts <= 1) {
            pending.answered = false;
            pending.revealed = false;
            pending.feedbackKind = null;
            addWrongHintFeedback(q, false);
            state.answerLocked = false;
            const buttons = dom.optionsGrid ? dom.optionsGrid.querySelectorAll('.option-btn') : [];
            for (let i = 0; i < buttons.length; i++) {
                if (!pending.triedIndices || pending.triedIndices.indexOf(i) === -1) {
                    buttons[i].disabled = false;
                }
            }
            AudioFX.wrong();
            setMood('curious');
            setMascotBubble('没关系，再想一想。');
            persistData();
        } else {
            pending.answered = true;
            pending.revealed = true;
            pending.feedbackKind = 'revealed';
            disableAllOptions();
            const correctButton = dom.optionsGrid
                ? dom.optionsGrid.querySelectorAll('.option-btn')[q.correctIndex]
                : null;
            if (correctButton) correctButton.classList.add('correct');
            showRevealedFeedback(q, false);
            showNextButton();
            AudioFX.wrong();
            setMood('thinking');
            setMascotBubble('我们一起记住它。');
            persistData();
        }
        updateHUD();
    }

    function showCorrectFeedback(q, restored) {
        if (!dom.chatContainer) return;
        trimMainChat();
        const row = el('div', 'bubble-row pet');
        const avatar = el('span', 'pet-avatar', '嘟');
        avatar.setAttribute('aria-hidden', 'true');
        row.appendChild(avatar);
        const bubble = el('div', 'bubble pet-bubble feedback-bubble good');
        const head = el('div', 'feedback-head');
        head.appendChild(el('span', null, '🌟 答对啦！'));
        if (!restored) {
            head.appendChild(el('span', 'star-gain', '+1 ⭐'));
        }
        bubble.appendChild(head);
        bubble.appendChild(el('div', 'feedback-text', q.feedback_correct || CORRECT_WORDS[0]));

        const explainCard = el('div', 'info-card');
        explainCard.appendChild(el('div', 'info-title', '嘟嘟的解释'));
        explainCard.appendChild(el('p', null, q.explain));
        bubble.appendChild(explainCard);

        if (q.fun_fact) {
            const funCard = el('div', 'info-card fun');
            funCard.appendChild(el('div', 'info-title', '✨ 星际冷知识'));
            funCard.appendChild(el('p', null, q.fun_fact));
            bubble.appendChild(funCard);
        }

        const speech = (q.feedback_correct || '答对啦！') + ' ' + q.explain + (q.fun_fact ? ' 小知识：' + q.fun_fact : '');
        addBubbleAudio(bubble, speech);
        row.appendChild(bubble);
        dom.chatContainer.appendChild(row);
        scrollChat();
        if (!restored && state.settings.autoRead && !state.settings.muted) {
            SpeechService.speak((q.feedback_correct || '答对啦！') + ' ' + q.explain);
        }
    }

    function addWrongHintFeedback(q, restored) {
        if (!dom.chatContainer) return;
        trimMainChat();
        const row = el('div', 'bubble-row pet');
        const avatar = el('span', 'pet-avatar', '嘟');
        avatar.setAttribute('aria-hidden', 'true');
        row.appendChild(avatar);
        const bubble = el('div', 'bubble pet-bubble feedback-bubble bad');
        const head = el('div', 'feedback-head');
        head.appendChild(el('span', null, '💡 再想一想'));
        bubble.appendChild(head);
        bubble.appendChild(el('div', 'feedback-text', q.feedback_wrong || WRONG_WORDS[0]));
        const hintCard = el('div', 'info-card fun');
        hintCard.appendChild(el('div', 'info-title', '嘟嘟的小提示'));
        hintCard.appendChild(el('p', null, q.hint));
        bubble.appendChild(hintCard);
        const speech = (q.feedback_wrong || '再想一想。') + ' ' + q.hint;
        addBubbleAudio(bubble, speech);
        row.appendChild(bubble);
        dom.chatContainer.appendChild(row);
        scrollChat();
        if (!restored && state.settings.autoRead && !state.settings.muted) {
            SpeechService.speak(speech);
        }
    }

    function showRevealedFeedback(q, restored) {
        if (!dom.chatContainer) return;
        trimMainChat();
        const row = el('div', 'bubble-row pet');
        const avatar = el('span', 'pet-avatar', '嘟');
        avatar.setAttribute('aria-hidden', 'true');
        row.appendChild(avatar);
        const bubble = el('div', 'bubble pet-bubble feedback-bubble bad');
        const head = el('div', 'feedback-head');
        head.appendChild(el('span', null, '🌱 我们一起看看'));
        bubble.appendChild(head);
        bubble.appendChild(el('div', 'feedback-text', q.feedback_wrong || '没关系，我们一起来找答案。'));
        const answerLine = el('p', 'meta-answer', '正确答案是：' + q.options[q.correctIndex]);
        bubble.appendChild(answerLine);

        const explainCard = el('div', 'info-card');
        explainCard.appendChild(el('div', 'info-title', '嘟嘟的解释'));
        explainCard.appendChild(el('p', null, q.explain));
        bubble.appendChild(explainCard);

        if (q.fun_fact) {
            const funCard = el('div', 'info-card fun');
            funCard.appendChild(el('div', 'info-title', '✨ 星际冷知识'));
            funCard.appendChild(el('p', null, q.fun_fact));
            bubble.appendChild(funCard);
        }

        const speech = '正确答案是' + q.options[q.correctIndex] + '。' + q.explain +
            (q.fun_fact ? ' 小知识：' + q.fun_fact : '');
        addBubbleAudio(bubble, speech);
        row.appendChild(bubble);
        dom.chatContainer.appendChild(row);
        scrollChat();
        if (!restored && state.settings.autoRead && !state.settings.muted) {
            SpeechService.speak('没关系，我们一起来看答案。正确答案是' + q.options[q.correctIndex] + '。' + q.explain);
        }
    }

    function showNextButton() {
        if (!dom.nextRow || !dom.nextBtn) return;
        dom.nextRow.hidden = false;
        dom.nextBtn.disabled = false;
        setTimeout(function () {
            if (dom.nextBtn && !dom.nextRow.hidden) {
                dom.nextBtn.focus({ preventScroll: true });
            }
        }, 180);
    }

    function nextQuestion() {
        if (!state.data || state.nextLocked) return;
        if (Date.now() < state.nextCooldownUntil) return;
        state.nextLocked = true;
        if (dom.nextBtn) dom.nextBtn.disabled = true;
        AudioFX.click();
        setMood('thinking');
        setMascotBubble('新的发现来啦！');
        state.pending = null;
        state.answerLocked = true;
        state.currentQuestion = null;
        if (state.data) state.data.pending = null;
        persistData();
        if (dom.nextRow) dom.nextRow.hidden = true;
        if (dom.optionsGrid) dom.optionsGrid.textContent = '';

        ensureDailyState(state.data);
        updateThemeChip();
        const q = consumeAIQuestion() || getNextQuestion(false);
        showQuestion(q);
        state.nextLocked = false;
        state.nextCooldownUntil = Date.now() + 450;
        if (dom.nextBtn) dom.nextBtn.disabled = false;
    }

    /* ----------------------------- 错题宝盒数据 ----------------------------- */

    function wrongBookQuestionKey(q) {
        return normalizeText(q.question);
    }

    function findWrongItem(q) {
        if (!state.data) return null;
        const key = wrongBookQuestionKey(q);
        for (let i = 0; i < state.data.wrongBook.length; i++) {
            if (normalizeText(state.data.wrongBook[i].question) === key) return state.data.wrongBook[i];
        }
        return null;
    }

    function recordWrong(q, selectedText) {
        if (!state.data) return;
        const key = wrongBookQuestionKey(q);
        let item = findWrongItem(q);
        const now = Date.now();
        if (!item) {
            item = {
                id: 'w_' + hash32(key + '|' + q.subjectId).toString(36),
                subject: q.subject,
                subjectId: q.subjectId,
                scene: q.scene,
                question: q.question,
                options: q.options.slice(),
                correctIndex: q.correctIndex,
                answerText: '',
                hint: q.hint,
                explain: q.explain,
                fun_fact: q.fun_fact,
                wrongCount: 1,
                correctCount: 0,
                mastered: false,
                lastAnswer: selectedText || '',
                createdAt: now,
                updatedAt: now,
                legacy: false
            };
            state.data.wrongBook.push(item);
        } else {
            item.wrongCount = Math.min(99, (Number(item.wrongCount) || 0) + 1);
            item.lastAnswer = selectedText || item.lastAnswer;
            item.updatedAt = now;
            if (item.mastered) {
                item.mastered = false;
                item.correctCount = 0;
            }
            if (item.legacy && q.options && q.options.length === 3 && Number.isInteger(q.correctIndex)) {
                item.options = q.options.slice();
                item.correctIndex = q.correctIndex;
                item.hint = q.hint;
                item.explain = q.explain;
                item.fun_fact = q.fun_fact;
                item.legacy = false;
            }
        }
        state.data.wrongBook = pruneWrongBook(dedupeWrongBook(state.data.wrongBook));
        persistData();
        updateWrongBadge();
    }

    function creditWrongBookAnswer(q) {
        if (!state.data) return null;
        const item = findWrongItem(q);
        if (!item || item.mastered) return null;
        if (item.legacy) return null;
        item.correctCount = Math.min(3, (Number(item.correctCount) || 0) + 1);
        item.updatedAt = Date.now();
        const justMastered = item.correctCount >= 3;
        item.mastered = justMastered;
        persistData();
        updateWrongBadge();
        if (justMastered) AudioFX.sparkle();
        return { found: true, count: item.correctCount, mastered: item.mastered, justMastered: justMastered };
    }

    /* ----------------------------- 错题宝盒界面 ----------------------------- */

    function countWrong() {
        if (!state.data) return { total: 0, due: 0, mastered: 0 };
        let due = 0;
        let mastered = 0;
        state.data.wrongBook.forEach(function (item) {
            if (item.mastered) mastered++;
            else due++;
        });
        return { total: state.data.wrongBook.length, due: due, mastered: mastered };
    }

    function openWrongBook() {
        if (!state.data || !state.entered || !dom.wrongOverlay) return;
        SpeechService.stop();
        state.practice = {};
        state.deleteConfirmId = '';
        state.deleteArmedAt = 0;
        state.clearArmed = false;
        state.clearArmedAt = 0;
        if (state.clearTimer) {
            clearTimeout(state.clearTimer);
            state.clearTimer = null;
        }
        const counts = countWrong();
        if (state.wrongFilters.status === 'due' && counts.due === 0 && counts.total > 0) {
            state.wrongFilters.status = 'all';
        }
        dom.wrongOverlay.hidden = false;
        dom.wrongOverlay.setAttribute('aria-hidden', 'false');
        renderWrongBook({ resetScroll: true });
        setTimeout(function () {
            if (dom.wrongCloseBtn) dom.wrongCloseBtn.focus();
        }, 40);
    }

    function closeWrongBook() {
        if (!dom.wrongOverlay) return;
        dom.wrongOverlay.hidden = true;
        dom.wrongOverlay.setAttribute('aria-hidden', 'true');
        state.deleteConfirmId = '';
        if (dom.wrongBookBtn) dom.wrongBookBtn.focus();
    }

    function renderWrongBook(options) {
        if (!state.data || !dom.wrongList) return;
        const opts = options || {};
        const previousScroll = dom.wrongList.scrollTop;
        const counts = countWrong();

        dom.wrongSummary.textContent = '';
        dom.wrongSummary.appendChild(summaryChip('共 ' + counts.total + ' 道', ''));
        dom.wrongSummary.appendChild(summaryChip(counts.due + ' 道待复习', 'due'));
        dom.wrongSummary.appendChild(summaryChip(counts.mastered + ' 道已掌握', 'mastered'));

        renderStatusFilters(counts);
        renderSubjectFilters();

        if (!state.data.wrongBook.length) {
            dom.wrongList.textContent = '';
            dom.wrongList.appendChild(emptyWrongState(
                '🌱',
                '错题宝盒还是空的，继续保持！',
                '答错的题会自动来到这里。重新作答并答对 3 次，就可以把它移出宝盒。',
                ''
            ));
            updateClearMasteredButton();
            if (opts.resetScroll) dom.wrongList.scrollTop = 0;
            return;
        }

        const visible = getVisibleWrongItems();
        dom.wrongList.textContent = '';
        if (!visible.length) {
            dom.wrongList.appendChild(emptyWrongState(
                '🔍',
                '这个筛选下没有题目。',
                '换一个筛选，就能看到宝盒里的其他题。',
                '看全部错题'
            ));
            updateClearMasteredButton();
            return;
        }

        const groups = groupWrongItems(visible);
        const grouped = state.wrongFilters.subject === 'all' && groups.length > 1;
        if (grouped) {
            groups.forEach(function (group) {
                const head = el('div', 'wrong-group-title');
                head.appendChild(document.createTextNode((group.icon ? group.icon + ' ' : '') + group.subject));
                head.appendChild(el('span', null, group.items.length + ' 道'));
                dom.wrongList.appendChild(head);
                group.items.forEach(function (item) {
                    dom.wrongList.appendChild(renderWrongCard(item));
                });
            });
        } else {
            visible.forEach(function (item) {
                dom.wrongList.appendChild(renderWrongCard(item));
            });
        }

        updateClearMasteredButton();
        if (opts.resetScroll) {
            dom.wrongList.scrollTop = 0;
        } else {
            const target = previousScroll;
            window.requestAnimationFrame(function () {
                if (dom.wrongList) dom.wrongList.scrollTop = target;
            });
        }
    }

    function summaryChip(text, kind) {
        const chip = el('span', 'summary-chip' + (kind ? ' ' + kind : ''));
        const parts = String(text).split(' ');
        const bold = el('b', null, parts[0]);
        chip.appendChild(bold);
        if (parts.length > 1) chip.appendChild(document.createTextNode(' ' + parts.slice(1).join(' ')));
        return chip;
    }

    function renderStatusFilters(counts) {
        if (!dom.wrongStatusRow) return;
        dom.wrongStatusRow.textContent = '';
        const definitions = [
            { id: 'all', label: '全部 ' + counts.total },
            { id: 'due', label: '待复习 ' + counts.due },
            { id: 'mastered', label: '已掌握 ' + counts.mastered }
        ];
        definitions.forEach(function (definition) {
            const button = makeButton('filter-chip' + (state.wrongFilters.status === definition.id ? ' active' : ''), definition.label);
            button.setAttribute('aria-pressed', state.wrongFilters.status === definition.id ? 'true' : 'false');
            button.addEventListener('click', function () {
                state.wrongFilters.status = definition.id;
                state.deleteConfirmId = '';
                renderWrongBook();
            });
            dom.wrongStatusRow.appendChild(button);
        });
    }

    function renderSubjectFilters() {
        if (!dom.wrongSubjectRow) return;
        dom.wrongSubjectRow.textContent = '';
        const counts = Object.create(null);
        state.data.wrongBook.forEach(function (item) {
            counts[item.subject] = (counts[item.subject] || 0) + 1;
        });
        const subjects = Object.keys(counts);
        if (state.wrongFilters.subject !== 'all' && !counts[state.wrongFilters.subject]) {
            state.wrongFilters.subject = 'all';
        }
        const all = makeButton('filter-chip' + (state.wrongFilters.subject === 'all' ? ' active' : ''), '全部学科');
        all.setAttribute('aria-pressed', state.wrongFilters.subject === 'all' ? 'true' : 'false');
        all.addEventListener('click', function () {
            state.wrongFilters.subject = 'all';
            state.deleteConfirmId = '';
            renderWrongBook();
        });
        dom.wrongSubjectRow.appendChild(all);

        const order = ['物理', '化学', '生物', '天文', '地理'];
        subjects.sort(function (a, b) {
            const ai = order.indexOf(a);
            const bi = order.indexOf(b);
            if (ai === -1 && bi === -1) return a.localeCompare(b, 'zh');
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
        subjects.forEach(function (subject) {
            const info = getSubjectByName(subject);
            const label = (info && info.icon ? info.icon + ' ' : '') + subject + ' ' + counts[subject];
            const button = makeButton('filter-chip' + (state.wrongFilters.subject === subject ? ' active' : ''), label);
            button.setAttribute('aria-pressed', state.wrongFilters.subject === subject ? 'true' : 'false');
            button.addEventListener('click', function () {
                state.wrongFilters.subject = subject;
                state.deleteConfirmId = '';
                renderWrongBook();
            });
            dom.wrongSubjectRow.appendChild(button);
        });
    }

    function getVisibleWrongItems() {
        if (!state.data) return [];
        const status = state.wrongFilters.status;
        const subject = state.wrongFilters.subject;
        return state.data.wrongBook.filter(function (item) {
            if (status === 'due' && item.mastered) return false;
            if (status === 'mastered' && !item.mastered) return false;
            if (subject !== 'all' && item.subject !== subject) return false;
            return true;
        }).sort(function (a, b) {
            if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
            return b.updatedAt - a.updatedAt;
        });
    }

    function groupWrongItems(items) {
        const groups = [];
        const map = Object.create(null);
        items.forEach(function (item) {
            const key = item.subject || '科学';
            if (!map[key]) {
                const info = getSubjectByName(key);
                map[key] = {
                    subject: key,
                    icon: info && info.icon ? info.icon : '🔎',
                    items: []
                };
                groups.push(map[key]);
            }
            map[key].items.push(item);
        });
        const order = ['物理', '化学', '生物', '天文', '地理'];
        groups.sort(function (a, b) {
            const ai = order.indexOf(a.subject);
            const bi = order.indexOf(b.subject);
            if (ai === -1 && bi === -1) return a.subject.localeCompare(b.subject, 'zh');
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
        return groups;
    }

    function emptyWrongState(icon, title, text, actionLabel) {
        const box = el('div', 'wrong-empty');
        box.appendChild(el('div', 'empty-icon', icon));
        box.appendChild(el('p', null, title));
        box.appendChild(el('p', null, text));
        if (actionLabel) {
            const button = makeButton('small-btn primary', actionLabel);
            button.style.marginTop = '10px';
            button.addEventListener('click', function () {
                state.wrongFilters = { status: 'all', subject: 'all' };
                state.deleteConfirmId = '';
                renderWrongBook();
            });
            box.appendChild(button);
        }
        return box;
    }

    function renderWrongCard(item) {
        const card = el('div', 'wrong-card' + (item.mastered ? ' mastered' : ''));
        card.setAttribute('data-id', item.id);

        const top = el('div', 'wrong-card-top');
        const subjectTag = el('span', 'subject-tag', item.subject || '科学');
        subjectTag.setAttribute('data-subject', item.subject || '科学');
        top.appendChild(subjectTag);
        const status = el('span', 'status-tag' + (item.mastered ? ' mastered' : ''), item.mastered ? '已掌握' : '待复习');
        top.appendChild(status);
        top.appendChild(el('span', 'wrong-count-tag', '错过 ' + item.wrongCount + ' 次'));
        card.appendChild(top);

        card.appendChild(el('p', 'wrong-question', item.question));

        const meta = el('div', 'wrong-meta');
        if (item.legacy) {
            if (item.answerText) {
                meta.appendChild(el('span', 'meta-answer', '答案：' + item.answerText));
            }
            meta.appendChild(el('span', null, '旧版记录'));
        } else {
            if (item.lastAnswer) {
                meta.appendChild(el('span', null, '上次选了：' + item.lastAnswer));
            }
            const progress = el('span', 'progress-dots');
            progress.appendChild(el('span', null, '答对 '));
            for (let i = 0; i < 3; i++) {
                progress.appendChild(el('span', 'progress-dot' + (i < item.correctCount ? ' on' : '')));
            }
            progress.appendChild(document.createTextNode(' ' + item.correctCount + '/3'));
            meta.appendChild(progress);
        }
        card.appendChild(meta);

        if (item.legacy && item.explain) {
            const explain = el('div', 'explain-box');
            explain.appendChild(el('b', null, '嘟嘟的解释：'));
            explain.appendChild(document.createTextNode(item.explain));
            card.appendChild(explain);
        }

        const actions = el('div', 'wrong-actions');
        if (state.deleteConfirmId === item.id) {
            actions.appendChild(el('span', 'locked-note', '确定要移出错题宝盒吗？'));
            const cancel = makeButton('small-btn', '我再想想');
            cancel.addEventListener('click', function () {
                state.deleteConfirmId = '';
                state.deleteArmedAt = 0;
                renderWrongBook();
            });
            const confirm = makeButton('small-btn danger', '确定移出');
            confirm.addEventListener('click', function () {
                // 防止第一次点击“移出”后，双击的第二次点击正好落在新出现的确认按钮上。
                if (Date.now() - state.deleteArmedAt < 650) return;
                deleteWrongItem(item.id);
            });
            actions.appendChild(cancel);
            actions.appendChild(confirm);
        } else if (item.legacy) {
            actions.appendChild(el('span', 'locked-note', '旧版记录不能重新作答，可直接移出'));
            const remove = makeButton('small-btn danger', '移出错题本');
            remove.addEventListener('click', function () {
                state.deleteConfirmId = item.id;
                state.deleteArmedAt = Date.now();
                renderWrongBook();
            });
            actions.appendChild(remove);
        } else {
            const practice = state.practice[item.id];
            const practiceOpen = practice && practice.open;
            const practiceButton = makeButton('small-btn primary', practiceOpen ? '收起练习' : (item.mastered ? '再复习' : '重新作答'));
            practiceButton.addEventListener('click', function () {
                if (practiceOpen) {
                    delete state.practice[item.id];
                } else {
                    state.practice[item.id] = newPracticeState(item);
                }
                state.deleteConfirmId = '';
                renderWrongBook();
            });
            actions.appendChild(practiceButton);

            if (item.mastered) {
                const remove = makeButton('small-btn danger', '移出错题本');
                remove.addEventListener('click', function () {
                    state.deleteConfirmId = item.id;
                    state.deleteArmedAt = Date.now();
                    renderWrongBook();
                });
                actions.appendChild(remove);
                actions.appendChild(el('span', 'locked-note', '已答对 3 次，可以移出'));
            } else {
                const locked = makeButton('small-btn danger', '移出错题本');
                locked.disabled = true;
                actions.appendChild(locked);
                actions.appendChild(el('span', 'locked-note', '还差 ' + Math.max(0, 3 - item.correctCount) + ' 次答对'));
            }
        }
        card.appendChild(actions);

        const practice = state.practice[item.id];
        if (practice && practice.open && !item.legacy) {
            card.appendChild(renderPracticeBox(item, practice));
        }
        return card;
    }

    function newPracticeState(item) {
        const order = [0, 1, 2];
        return {
            open: true,
            order: shuffleArray(order),
            answered: false,
            selected: null,
            correct: false,
            revealed: false,
            attempts: 0,
            tried: [],
            message: '',
            kind: ''
        };
    }

    function renderPracticeBox(item, practice) {
        const box = el('div', 'practice-box');
        box.appendChild(el('p', 'practice-hint', '答对 3 次就能移出宝盒。当前已答对 ' + item.correctCount + ' 次。'));

        const optionsWrap = el('div', 'practice-options');
        practice.order.forEach(function (actualIndex) {
            const option = item.options[actualIndex];
            if (option == null) return;
            const button = makeButton('practice-option');
            const key = el('span', 'practice-key', 'ABC'[practice.order.indexOf(actualIndex)]);
            button.appendChild(key);
            button.appendChild(el('span', null, option));
            const tried = practice.tried.indexOf(actualIndex) !== -1;
            const isCorrect = actualIndex === item.correctIndex;
            if (practice.answered && isCorrect) button.classList.add('correct');
            if (tried) button.classList.add('wrong');
            if (practice.answered || tried) button.disabled = true;
            button.addEventListener('click', function () {
                handlePracticeAnswer(item, practice, actualIndex);
            });
            optionsWrap.appendChild(button);
        });
        box.appendChild(optionsWrap);

        if (practice.message) {
            const feedback = el('div', 'practice-feedback ' + (practice.kind || ''), practice.message);
            box.appendChild(feedback);
        }

        if (practice.answered) {
            const explain = el('div', 'explain-box');
            explain.appendChild(el('b', null, '嘟嘟的解释：'));
            explain.appendChild(document.createTextNode(item.explain));
            box.appendChild(explain);
            const again = makeButton('small-btn primary', '再练一次');
            again.style.marginTop = '9px';
            again.addEventListener('click', function () {
                state.practice[item.id] = newPracticeState(item);
                renderWrongBook();
            });
            box.appendChild(again);
        }

        return box;
    }

    function handlePracticeAnswer(item, practice, actualIndex) {
        if (!practice || practice.answered) return;
        if (practice.tried.indexOf(actualIndex) !== -1) return;
        const isCorrect = actualIndex === item.correctIndex;
        practice.selected = actualIndex;
        if (isCorrect) {
            practice.correct = true;
            practice.answered = true;
            item.correctCount = Math.min(3, (Number(item.correctCount) || 0) + 1);
            item.updatedAt = Date.now();
            const justMastered = item.correctCount >= 3;
            item.mastered = justMastered;
            practice.message = justMastered
                ? '太棒啦！你已经答对 3 次，可以把它移出错题本了。'
                : '答对啦！这是第 ' + item.correctCount + ' 次答对，还差 ' + (3 - item.correctCount) + ' 次。';
            practice.kind = 'good';
            persistData();
            updateWrongBadge();
            AudioFX.correct();
            if (justMastered) {
                AudioFX.sparkle();
                showToast('太棒了！这道题已经掌握，可以移出错题本啦。', 3200);
            }
        } else {
            practice.attempts = (Number(practice.attempts) || 0) + 1;
            practice.tried.push(actualIndex);
            if (practice.attempts >= 2) {
                practice.revealed = true;
                practice.answered = true;
                practice.message = '正确答案是「' + item.options[item.correctIndex] + '」。先看看下面的解释，再练一次吧。';
                practice.kind = 'bad';
            } else {
                practice.message = '还差一点点。嘟嘟的小提示：' + (item.hint || '再仔细看看题目。');
                practice.kind = 'bad';
            }
            AudioFX.wrong();
        }
        renderWrongBook();
    }

    function deleteWrongItem(id) {
        if (!state.data) return;
        const before = state.data.wrongBook.length;
        state.data.wrongBook = state.data.wrongBook.filter(function (item) { return item.id !== id; });
        if (state.data.wrongBook.length === before) return;
        delete state.practice[id];
        state.deleteConfirmId = '';
        state.deleteArmedAt = 0;
        persistData();
        updateWrongBadge();
        renderWrongBook();
        showToast('已经移出错题本，做得棒！');
        AudioFX.sparkle();
    }

    function updateClearMasteredButton() {
        if (!dom.clearMasteredBtn) return;
        const counts = countWrong();
        dom.clearMasteredBtn.disabled = counts.mastered === 0;
        if (state.clearArmed && counts.mastered > 0) {
            dom.clearMasteredBtn.textContent = '再点一次，确认清理 ' + counts.mastered + ' 道';
        } else {
            dom.clearMasteredBtn.textContent = '🧹 清理已掌握';
        }
    }

    function clearMastered() {
        if (!state.data) return;
        const counts = countWrong();
        if (!counts.mastered) {
            showToast('现在还没有已掌握的题，再练几次吧。');
            return;
        }
        // 防止双击把“再点一次”和确认操作连在一起。
        if (state.clearArmed && Date.now() - state.clearArmedAt < 650) return;
        if (!state.clearArmed) {
            state.clearArmed = true;
            state.clearArmedAt = Date.now();
            updateClearMasteredButton();
            if (state.clearTimer) clearTimeout(state.clearTimer);
            state.clearTimer = setTimeout(function () {
                state.clearArmed = false;
                state.clearArmedAt = 0;
                updateClearMasteredButton();
            }, 4200);
            return;
        }
        if (state.clearTimer) {
            clearTimeout(state.clearTimer);
            state.clearTimer = null;
        }
        const removed = counts.mastered;
        state.data.wrongBook = state.data.wrongBook.filter(function (item) { return !item.mastered; });
        state.clearArmed = false;
        state.clearArmedAt = 0;
        state.deleteConfirmId = '';
        state.deleteArmedAt = 0;
        Object.keys(state.practice).forEach(function (id) {
            if (!state.data.wrongBook.some(function (item) { return item.id === id; })) {
                delete state.practice[id];
            }
        });
        persistData();
        updateWrongBadge();
        renderWrongBook();
        showToast('清理了 ' + removed + ' 道已掌握的题。');
    }

    /* ----------------------------- 设置 ----------------------------- */

    function applySoundProfileToInputs() {
        if (dom.autoReadToggle) dom.autoReadToggle.checked = !!state.settings.autoRead;
        if (dom.sfxToggle) dom.sfxToggle.checked = !!state.settings.sfx;
        if (dom.ambientToggle) dom.ambientToggle.checked = !!state.settings.ambient;
        if (dom.volumeRange) dom.volumeRange.value = String(state.settings.volume);
        if (dom.volumeValue) dom.volumeValue.textContent = Math.round(state.settings.volume * 100) + '%';
        if (dom.rateRange) dom.rateRange.value = String(state.settings.rate);
        if (dom.rateValue) dom.rateValue.textContent = state.settings.rate.toFixed(2);
        if (SpeechService.supported) SpeechService.refreshVoices();
    }

    function openSettings() {
        if (!state.data || !state.entered || !dom.settingsOverlay) return;
        SpeechService.stop();
        updateSettingsProfile();
        updateSettingsStatus();
        applySoundProfileToInputs();
        if (dom.resetConfirm) dom.resetConfirm.hidden = true;
        dom.settingsOverlay.hidden = false;
        dom.settingsOverlay.setAttribute('aria-hidden', 'false');
        const body = dom.settingsOverlay.querySelector('.settings-body');
        if (body) body.scrollTop = 0;
        setTimeout(function () {
            if (dom.settingsCloseBtn) dom.settingsCloseBtn.focus();
        }, 40);
    }

    function closeSettings() {
        if (!dom.settingsOverlay) return;
        dom.settingsOverlay.hidden = true;
        dom.settingsOverlay.setAttribute('aria-hidden', 'true');
        if (dom.resetConfirm) dom.resetConfirm.hidden = true;
        if (dom.settingsBtn) dom.settingsBtn.focus();
    }

    function resetProgress() {
        if (!state.data) return;
        const name = state.data.name;
        const grade = state.data.grade;
        const createdAt = state.data.createdAt;
        const fresh = freshData(name, grade);
        fresh.createdAt = createdAt;
        fresh.updatedAt = Date.now();
        state.data = fresh;
        state.pending = null;
        state.currentQuestion = null;
        state.answerLocked = false;
        state.nextLocked = false;
        state.nextCooldownUntil = 0;
        state.answerCooldownUntil = 0;
        state.aiQueue = null;
        state.practice = {};
        state.deleteConfirmId = '';
        state.deleteArmedAt = 0;
        state.clearArmed = false;
        state.clearArmedAt = 0;
        state.resetArmedAt = 0;
        state.wrongFilters = { status: 'due', subject: 'all' };
        state.chatHistory = [];
        state.chatInitialized = false;
        if (dom.resetConfirm) dom.resetConfirm.hidden = true;
        closeSettings();
        clearMainChat();
        resetChatSession();
        setMood('thinking');
        setMascotBubble('我们重新出发啦！');
        updateThemeChip();
        updateHUD();
        updateWrongBadge();
        persistData();
        const greeting = '我们重新出发啦，' + name + '！星星、错题和今天的进度都重新开始。嘟嘟会一直陪着你。';
        addPetMessage(greeting, { speak: false });
        const q = getNextQuestion(true);
        showQuestion(q, { prefixSpeech: greeting });
        showToast('记录已经重置，我们重新出发！');
    }

    /* ----------------------------- AI 连接 ----------------------------- */

    function getDirectKey() {
        const config = window.DUDU_CONFIG || {};
        const key = typeof config.DEEPSEEK_API_KEY === 'string' ? config.DEEPSEEK_API_KEY.trim() : '';
        if (!key) return '';
        if (/在这里|你的KEY|your.key|sk-xxx/i.test(key)) return '';
        return key;
    }

    let cachedClientId = '';

    function getClientId() {
        if (cachedClientId) return cachedClientId;
        try {
            const stored = window.sessionStorage.getItem('dudu_v3_client');
            if (stored) {
                cachedClientId = stored;
                return cachedClientId;
            }
        } catch (error) {
            /* ignore */
        }
        cachedClientId = 'c_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
        try { window.sessionStorage.setItem('dudu_v3_client', cachedClientId); } catch (error) { /* ignore */ }
        return cachedClientId;
    }

    function canUseAI() {
        if (typeof fetch !== 'function') return false;
        if (state.aiMode !== 'proxy' && state.aiMode !== 'direct') return false;
        if (Date.now() < state.aiCooldownUntil) return false;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        return true;
    }

    function updateAIStatus() {
        if (!dom.aiStatus || !dom.modeStatus) return;
        if (state.aiMode === 'checking') {
            dom.aiStatus.textContent = '正在检查…';
            dom.modeStatus.textContent = '自动选择';
            return;
        }
        if (state.aiMode === 'proxy' || state.aiMode === 'direct') {
            if (canUseAI()) {
                dom.aiStatus.textContent = '已连接';
                dom.modeStatus.textContent = state.aiMode === 'proxy'
                    ? 'AI + 星际题库'
                    : 'AI + 星际题库（本机测试）';
            } else {
                dom.aiStatus.textContent = '暂时休息';
                dom.modeStatus.textContent = '星际题库（不卡顿）';
            }
            return;
        }
        dom.aiStatus.textContent = '离线也能玩';
        dom.modeStatus.textContent = '星际题库（不卡顿）';
    }

    async function checkAIMode() {
        state.aiMode = 'checking';
        updateAIStatus();
        const directKey = getDirectKey();
        if (typeof fetch === 'function' && location.protocol !== 'file:') {
            try {
                const response = await fetchWithTimeout('/api/health', {
                    method: 'GET',
                    cache: 'no-store',
                    headers: { Accept: 'application/json' }
                }, 3500);
                if (response.ok) {
                    const payload = await response.json().catch(function () { return null; });
                    if (payload && payload.ok && payload.ai === true) {
                        state.aiMode = 'proxy';
                        state.aiCooldownUntil = 0;
                        state.aiFailures = 0;
                        updateAIStatus();
                        if (state.entered && !state.aiQueue) schedulePrefetch(600);
                        return;
                    }
                }
            } catch (error) {
                /* 静态托管没有代理时，继续检查本机测试模式 */
            }
        }
        if (directKey) {
            state.aiMode = 'direct';
            state.aiCooldownUntil = 0;
            state.aiFailures = 0;
        } else {
            state.aiMode = 'off';
        }
        updateAIStatus();
        if (state.entered && state.aiMode !== 'off') schedulePrefetch(800);
    }

    function fetchWithTimeout(url, options, timeoutMs) {
        if (typeof AbortController === 'function') {
            const controller = new AbortController();
            const timer = setTimeout(function () {
                try { controller.abort(); } catch (error) { /* ignore */ }
            }, timeoutMs);
            const opts = Object.assign({}, options || {}, { signal: controller.signal });
            return fetch(url, opts).finally(function () {
                clearTimeout(timer);
            });
        }
        return fetch(url, options || {});
    }

    function extractAIContent(payload) {
        if (!payload) return '';
        if (typeof payload.content === 'string') return payload.content;
        if (payload.choices && payload.choices[0] && payload.choices[0].message &&
            typeof payload.choices[0].message.content === 'string') {
            return payload.choices[0].message.content;
        }
        return '';
    }

    async function requestAI(messages, options) {
        const opts = options || {};
        const timeout = opts.timeout || 20000;
        let url;
        let headers;
        let body;
        if (state.aiMode === 'proxy') {
            url = '/api/chat';
            headers = {
                'Content-Type': 'application/json',
                'x-dudu-client': getClientId()
            };
            body = {
                messages: messages,
                temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.85,
                max_tokens: opts.max_tokens || 700
            };
        } else if (state.aiMode === 'direct') {
            const key = getDirectKey();
            if (!key) {
                const err = new Error('no_key');
                err.offline = true;
                throw err;
            }
            url = 'https://api.deepseek.com/chat/completions';
            headers = {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + key
            };
            body = {
                model: 'deepseek-chat',
                messages: messages,
                temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.85,
                max_tokens: opts.max_tokens || 700,
                stream: false
            };
        } else {
            const err = new Error('ai_off');
            err.offline = true;
            throw err;
        }

        let response;
        try {
            response = await fetchWithTimeout(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            }, timeout);
        } catch (error) {
            if (error && error.name === 'AbortError') {
                const timeoutError = new Error('timeout');
                timeoutError.timeout = true;
                throw timeoutError;
            }
            throw error;
        }

        if (!response.ok) {
            const error = new Error('ai_status_' + response.status);
            error.status = response.status;
            throw error;
        }
        let payload;
        try {
            payload = await response.json();
        } catch (error) {
            const parseError = new Error('bad_json');
            parseError.badResponse = true;
            throw parseError;
        }
        const content = extractAIContent(payload);
        if (!content) {
            const emptyError = new Error('empty_ai');
            emptyError.badResponse = true;
            throw emptyError;
        }
        return content;
    }

    function tripAICooldown(duration) {
        state.aiCooldownUntil = Date.now() + duration;
        updateAIStatus();
    }

    async function aiRequest(messages, options) {
        const opts = options || {};
        if (!canUseAI()) {
            const error = new Error('ai_off');
            error.offline = true;
            throw error;
        }
        const retries = opts.retries == null ? 1 : opts.retries;
        try {
            const content = await requestAI(messages, opts);
            state.aiFailures = 0;
            updateAIStatus();
            return content;
        } catch (error) {
            if (error.status === 401) {
                tripAICooldown(30 * 60 * 1000);
                throw error;
            }
            if (error.status === 429) {
                tripAICooldown(2 * 60 * 1000);
                throw error;
            }
            state.aiFailures++;
            if (state.aiFailures >= 3) {
                tripAICooldown(5 * 60 * 1000);
            }
            if (retries > 0) {
                await sleep(550);
                if (!canUseAI()) throw error;
                try {
                    const content = await requestAI(messages, opts);
                    state.aiFailures = 0;
                    updateAIStatus();
                    return content;
                } catch (secondError) {
                    if (secondError.status === 401) {
                        tripAICooldown(30 * 60 * 1000);
                    } else if (secondError.status === 429) {
                        tripAICooldown(2 * 60 * 1000);
                    } else {
                        state.aiFailures++;
                        if (state.aiFailures >= 3) tripAICooldown(5 * 60 * 1000);
                    }
                    throw secondError;
                }
            }
            throw error;
        }
    }

    /* ----------------------------- AI 出题 ----------------------------- */

    function recentQuestionTexts(limit) {
        if (!state.data) return [];
        const seen = state.data.seen.slice(-limit).map(function (entry) { return entry.question; });
        const current = state.currentQuestion ? [state.currentQuestion.question] : [];
        return seen.concat(current).filter(Boolean).slice(-limit);
    }

    function buildQuestionMessages() {
        if (!state.data) return null;
        const theme = state.theme || FALLBACK_SUBJECT;
        const data = state.data;
        const weakId = weakSubjectId();
        const weak = weakId ? getSubjectById(weakId) : null;
        const recentSubjects = data.recentSubjects.map(function (id) {
            const subject = getSubjectById(id);
            return subject ? subject.name : id;
        }).filter(Boolean);
        const recent = recentQuestionTexts(18);
        const system = [
            '你是“嘟嘟”，一只来自闪闪星的外星小宠物，正在陪一位中国小学生探索科学。',
            '你的语气温暖、好奇、简短，像一个好朋友，不居高临下，也不要过度撒娇。',
            '孩子的年级：' + gradeLabel(data.grade) + '。' + gradePrompt(data.grade),
            '请出 1 道三选一的科学单选题，围绕今日主题「' + theme.name + ' · ' + theme.theme + '」。',
            '题目要求：',
            '1. 必须是科学准确的常识或简单原理，适合小学生，不超纲，不出偏题怪题。',
            '2. 不涉及危险实验、火、电、药物、医疗诊断、暴力、恐怖、色情、政治或隐私内容。',
            '3. 三个选项互不重复、互不包含，只有一个正确答案；不要出现“以上都对”“以上都不对”。',
            '4. 场景用嘟嘟第一人称，像在讲自己今天的小发现；题目用“你”称呼孩子。',
            '5. 不要出现“主人”“哈哈”“作为AI”等词。',
            '6. 不要重复最近出现过的题目。',
            '7. subject 必须从“物理、化学、生物、天文、地理”中选一个。',
            '8. hint 不能直接说出正确答案，要给孩子一个思考方向。',
            '9. feedback_correct 和 feedback_wrong 要短、温暖，不要说教。',
            '返回严格 JSON，不要 markdown，不要代码块，不要多余文字。格式：',
            '{"subject":"天文","scene":"...","question":"...","options":["...","...","..."],"correct":"与某个选项完全一致","hint":"...","explain":"...","feedback_correct":"...","feedback_wrong":"...","fun_fact":"..."}'
        ];
        if (recentSubjects.length) {
            system.push('最近出现过的学科：' + recentSubjects.join('、') + '。可以换一换，让内容更丰富。');
        }
        if (weak) {
            system.push('孩子在' + weak.name + '题上最近错得稍多。可以多出一点该学科的基础题，但绝不要提“你错了”或让孩子感到被批评。');
        }
        const user = [
            '今天是 ' + dateKey() + '，请围绕「' + theme.theme + '」出一道全新的题。',
            recent.length ? '最近出现过的题目（不要重复）：\n' + recent.map(function (q, index) {
                return (index + 1) + '. ' + q;
            }).join('\n') : ''
        ].filter(Boolean).join('\n');
        return [
            { role: 'system', content: system.join('\n') },
            { role: 'user', content: user }
        ];
    }

    function parseAIQuestion(content, theme) {
        let text = String(content || '').trim();
        if (!text) return null;
        text = text.replace(/```(?:json)?/gi, '').trim();
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first < 0 || last <= first) return null;
        text = text.slice(first, last + 1);
        text = text.replace(/,\s*([}\]])/g, '$1');
        let raw;
        try {
            raw = JSON.parse(text);
        } catch (error) {
            return null;
        }
        if (!raw || typeof raw !== 'object') return null;

        const question = cleanTextValue(raw.question, 180).replace(/^(题目|问题)[:：]\s*/, '');
        if (question.length < 4) return null;
        if (!Array.isArray(raw.options) || raw.options.length !== 3) return null;

        const options = [];
        raw.options.forEach(function (option) {
            const value = cleanOptionText(option);
            if (value) options.push(value);
        });
        if (options.length !== 3) return null;
        const seenOptions = Object.create(null);
        for (let i = 0; i < options.length; i++) {
            const key = normalizeText(options[i]);
            if (!key || seenOptions[key]) return null;
            seenOptions[key] = true;
            if (/以上都|都不对|都正确|全都对/.test(options[i])) return null;
        }

        let correctIndex = -1;
        const correctValue = raw.correct != null ? raw.correct : raw.answer;
        if (Number.isInteger(raw.correctIndex)) {
            correctIndex = raw.correctIndex;
        } else if (typeof correctValue === 'number' && Number.isInteger(correctValue)) {
            correctIndex = correctValue;
        } else if (typeof correctValue === 'string') {
            const value = cleanOptionText(correctValue);
            if (/^[A-Ca-c]$/.test(value)) {
                correctIndex = 'ABC'.indexOf(value.toUpperCase());
            } else {
                for (let i = 0; i < options.length; i++) {
                    if (normalizeText(options[i]) === normalizeText(value)) {
                        correctIndex = i;
                        break;
                    }
                }
            }
        }
        if (correctIndex < 0 || correctIndex >= options.length) return null;

        const subjectInfo = getSubjectByName(raw.subject) || theme || FALLBACK_SUBJECT;
        const subject = subjectInfo.name || '科学';
        let scene = cleanTextValue(raw.scene, 200) || '我刚从星际笔记本里翻到一个有趣的问题。';
        scene = scene.replace(/帮你/g, '陪你').replace(/看你/g, '和你一起看');
        const unsafe = /(自杀|自残|色情|裸体|毒品|赌博|血腥|杀人|恐怖|爆炸|枪|点燃|点火|触电|药物)/;
        if (unsafe.test(question + scene + options.join(''))) return null;

        const result = {
            subject: subject,
            subjectId: subjectInfo.id || '',
            scene: scene,
            question: question,
            options: options,
            correctIndex: correctIndex,
            hint: cleanTextValue(raw.hint, 160) || '再仔细看看题目里的线索，你一定可以的。',
            explain: cleanTextValue(raw.explain, 300) || '这个现象里藏着一个科学原理，我们一起记住它。',
            feedback_correct: cleanTextValue(raw.feedback_correct, 80) || CORRECT_WORDS[Math.floor(Math.random() * CORRECT_WORDS.length)],
            feedback_wrong: cleanTextValue(raw.feedback_wrong, 80) || WRONG_WORDS[Math.floor(Math.random() * WRONG_WORDS.length)],
            fun_fact: cleanTextValue(raw.fun_fact || raw.funFact, 220),
            source: 'ai',
            themeId: theme ? theme.id : (state.theme ? state.theme.id : ''),
            createdAt: Date.now()
        };
        ['scene', 'question', 'hint', 'explain', 'feedback_correct', 'feedback_wrong', 'fun_fact'].forEach(function (key) {
            result[key] = softenChildText(result[key]);
        });
        result.signature = signatureOf(result);
        return result;
    }

    function consumeAIQuestion() {
        const queued = state.aiQueue;
        if (!queued) return null;
        state.aiQueue = null;
        if (!state.data) return null;
        if (Date.now() - queued.createdAt > 15 * 60 * 1000) return null;
        if (!state.theme || queued.themeId !== state.theme.id) return null;
        if (queued.dateKey !== dateKey()) return null;
        const sig = queued.signature || signatureOf(queued);
        if (seenSignatures().indexOf(sig) !== -1) return null;
        return queued;
    }

    function schedulePrefetch(delay) {
        if (!state.entered || !state.data || !canUseAI()) return;
        if (state.aiQueue || state.prefetching) return;
        if (state.prefetchTimer) clearTimeout(state.prefetchTimer);
        state.prefetchTimer = setTimeout(function () {
            state.prefetchTimer = null;
            prefetchAIQuestion();
        }, delay == null ? 1000 : delay);
    }

    async function prefetchAIQuestion() {
        if (!state.entered || !state.data || !canUseAI()) return;
        if (state.aiQueue || state.prefetching) return;
        const messages = buildQuestionMessages();
        if (!messages) return;
        const epoch = state.sessionEpoch;
        state.prefetching = true;
        try {
            const content = await aiRequest(messages, { temperature: 0.95, max_tokens: 760, timeout: 18000, retries: 0 });
            if (epoch !== state.sessionEpoch) return;
            const theme = state.theme || FALLBACK_SUBJECT;
            const q = parseAIQuestion(content, theme);
            if (!q) return;
            if (!state.entered || !state.data || epoch !== state.sessionEpoch) return;
            const sig = q.signature || signatureOf(q);
            if (seenSignatures().indexOf(sig) !== -1) return;
            q.dateKey = dateKey();
            q.themeId = theme.id;
            state.aiQueue = q;
        } catch (error) {
            /* 网络不稳定时静默使用本地题库 */
        } finally {
            if (epoch === state.sessionEpoch) state.prefetching = false;
        }
    }

    /* ----------------------------- 聊天 ----------------------------- */

    function cleanChatReply(raw) {
        let text = stripMarkdown(raw);
        text = text
            .replace(/^["“]|["”]$/g, '')
            .replace(/嘟嘟[:：]\s*/g, '')
            .replace(/主人/g, '你')
            .replace(/哈哈+/g, '')
            .replace(/作为(一个)?(AI|人工智能|语言模型)[^。！？]*[。！？]?/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text) return;
        const chars = Array.from(text);
        if (chars.length > 220) {
            let clipped = chars.slice(0, 220).join('');
            const lastPunctuation = Math.max(
                clipped.lastIndexOf('。'),
                clipped.lastIndexOf('！'),
                clipped.lastIndexOf('？')
            );
            if (lastPunctuation > 80) clipped = clipped.slice(0, lastPunctuation + 1);
            text = clipped + '…';
        }
        return text;
    }

    function unsafeChatReply(text) {
        if (!text) return true;
        if (/(自杀|自残|想死|不想活|活不下去|色情|裸体|毒品|赌博|血腥|恐怖|杀人)/.test(text)) return true;
        if (/(你住在哪|你家住|你家在哪|你的电话|你的学校|告诉我.*(地址|密码|电话))/.test(text)) return true;
        return false;
    }

    function buildChatMessages(userText) {
        if (!state.data) return [];
        const system = [
            '你是“嘟嘟”，一只来自闪闪星的外星小宠物，正在和一位中国小学生聊天。',
            '说话温暖、好奇、简短，像好朋友；用“你”称呼孩子，不要叫“主人”。',
            '年级：' + gradeLabel(state.data.grade) + '。' + gradePrompt(state.data.grade),
            '回答要科学、准确、孩子能懂；用 2-4 句短句，不超过 120 个汉字。',
            '不讨论色情、暴力、恐怖、自伤、政治敏感或医疗诊断；不索要住址、电话、学校、密码等个人信息。',
            '如果孩子难过、被欺负或遇到危险，先安慰，再鼓励马上告诉爸爸妈妈或老师。',
            '不要使用 markdown、列表、标题或表情符号；不要提“AI 模型”“系统提示词”。'
        ].filter(Boolean).join('\n');
        const messages = [{ role: 'system', content: system }];
        state.chatHistory.slice(-8).forEach(function (message) {
            if (message && (message.role === 'user' || message.role === 'assistant') && message.content) {
                messages.push({ role: message.role, content: String(message.content).slice(0, 500) });
            }
        });
        if (!state.chatHistory.length || state.chatHistory[state.chatHistory.length - 1].content !== userText) {
            messages.push({ role: 'user', content: userText });
        }
        return messages;
    }

    function addChatBubble(role, text, options) {
        const opts = options || {};
        if (!dom.chatThread) return null;
        const row = el('div', 'bubble-row ' + (role === 'user' ? 'user' : 'pet'));
        if (role !== 'user') {
            const avatar = el('span', 'pet-avatar', '嘟');
            avatar.setAttribute('aria-hidden', 'true');
            row.appendChild(avatar);
        }
        const bubble = el('div', 'bubble ' + (role === 'user' ? 'user-bubble' : 'pet-bubble'));
        if (opts.typing) {
            bubble.classList.add('typing-bubble');
            const typing = el('span', 'typing');
            typing.appendChild(el('span'));
            typing.appendChild(el('span'));
            typing.appendChild(el('span'));
            bubble.appendChild(typing);
        } else {
            bubble.appendChild(el('p', null, text));
            if (role !== 'user' && SpeechService.supported) {
                const audio = makeButton('bubble-audio', '🔈 听嘟嘟说');
                audio.addEventListener('click', function () {
                    if (state.settings.muted) {
                        showToast('先打开声音，才能听嘟嘟朗读哦。');
                        return;
                    }
                    SpeechService.speak(text, { force: true });
                });
                bubble.appendChild(audio);
            }
        }
        row.appendChild(bubble);
        dom.chatThread.appendChild(row);
        while (dom.chatThread.children.length > 40) {
            dom.chatThread.removeChild(dom.chatThread.firstElementChild);
        }
        dom.chatThread.scrollTop = dom.chatThread.scrollHeight;
        return { row: row, bubble: bubble };
    }

    function addChatGreeting() {
        if (state.chatInitialized) return;
        state.chatInitialized = true;
        const text = toChildName();
        const greeting = '嗨，' + text + '！这里是我们的秘密基地。想问星星、动物，还是厨房里的小变化？';
        addChatBubble('pet', greeting);
        state.chatHistory.push({ role: 'assistant', content: greeting });
    }

    function toChildName() {
        if (!state.data) return '小探险家';
        return state.data.name;
    }

    function openChat() {
        if (!state.data || !state.entered || !dom.chatOverlay) return;
        SpeechService.stop();
        addChatGreeting();
        dom.chatOverlay.hidden = false;
        dom.chatOverlay.setAttribute('aria-hidden', 'false');
        setTimeout(function () {
            if (dom.chatInput) dom.chatInput.focus();
        }, 50);
    }

    function closeChat() {
        if (!dom.chatOverlay) return;
        SpeechService.stop();
        dom.chatOverlay.hidden = true;
        dom.chatOverlay.setAttribute('aria-hidden', 'true');
        if (dom.chatToggle) dom.chatToggle.focus();
    }

    function setChatBusy(busy) {
        state.chatBusy = busy;
        if (dom.chatSendBtn) {
            dom.chatSendBtn.disabled = busy;
            dom.chatSendBtn.textContent = busy ? '想一想…' : '发送';
        }
        if (dom.chatInput) dom.chatInput.disabled = busy;
    }

    async function sendChat(rawText) {
        if (!state.data || !state.entered || state.chatBusy) return;
        const text = String(rawText == null ? '' : rawText).trim().slice(0, 80);
        if (!text) return;
        const epoch = state.sessionEpoch;
        setChatBusy(true);
        if (dom.chatInput) dom.chatInput.value = '';
        addChatBubble('user', text);
        state.chatHistory.push({ role: 'user', content: text });
        if (state.chatHistory.length > 12) state.chatHistory = state.chatHistory.slice(-12);

        const typing = addChatBubble('pet', '', { typing: true });
        let reply = '';
        try {
            const safety = safetyReply(text);
            if (safety) {
                await sleep(320);
                reply = safety;
            } else if (!canUseAI()) {
                await sleep(280);
                reply = fallbackChat(text, toChildName());
            } else {
                const messages = buildChatMessages(text);
                const content = await aiRequest(messages, {
                    temperature: 0.8,
                    max_tokens: 360,
                    timeout: 14000,
                    retries: 0
                });
                reply = cleanChatReply(content);
                if (!reply || unsafeChatReply(reply)) {
                    reply = fallbackChat(text, toChildName());
                }
            }
        } catch (error) {
            reply = fallbackChat(text, toChildName());
        }

        if (epoch !== state.sessionEpoch) return;
        if (typing && typing.row && typing.row.parentNode) {
            typing.row.parentNode.removeChild(typing.row);
        }
        reply = cleanChatReply(reply) || '这个问题真有意思！嘟嘟把它记在星际笔记本上啦。';
        addChatBubble('pet', reply);
        state.chatHistory.push({ role: 'assistant', content: reply });
        if (state.chatHistory.length > 12) state.chatHistory = state.chatHistory.slice(-12);
        if (state.settings.autoRead && !state.settings.muted && dom.chatOverlay && !dom.chatOverlay.hidden) {
            SpeechService.speak(reply);
        }
        setChatBusy(false);
        if (dom.chatInput && dom.chatOverlay && !dom.chatOverlay.hidden) dom.chatInput.focus();
    }

    /* ----------------------------- 弹层管理 ----------------------------- */

    function openOverlay(overlay, focusNode) {
        if (!overlay) return;
        state.lastFocus = document.activeElement;
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        setTimeout(function () {
            if (focusNode && typeof focusNode.focus === 'function') focusNode.focus();
        }, 40);
    }

    function closeOverlay(overlay) {
        if (!overlay) return;
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        if (state.lastFocus && typeof state.lastFocus.focus === 'function') {
            try { state.lastFocus.focus(); } catch (error) { /* ignore */ }
        }
    }

    function anyModalOpen() {
        return (dom.chatOverlay && !dom.chatOverlay.hidden) ||
            (dom.settingsOverlay && !dom.settingsOverlay.hidden) ||
            (dom.wrongOverlay && !dom.wrongOverlay.hidden);
    }

    function closeTopOverlay() {
        if (dom.chatOverlay && !dom.chatOverlay.hidden) {
            closeChat();
            return true;
        }
        if (dom.settingsOverlay && !dom.settingsOverlay.hidden) {
            if (dom.resetConfirm && !dom.resetConfirm.hidden) {
                dom.resetConfirm.hidden = true;
                return true;
            }
            closeSettings();
            return true;
        }
        if (dom.wrongOverlay && !dom.wrongOverlay.hidden) {
            closeWrongBook();
            return true;
        }
        return false;
    }

    /* ----------------------------- 事件绑定 ----------------------------- */

    function bindEvents() {
        if (dom.welcomeForm) {
            dom.welcomeForm.addEventListener('submit', startSession);
        }
        if (dom.nameInput) {
            dom.nameInput.addEventListener('input', function () {
                if (dom.nameError) dom.nameError.textContent = '';
                if (dom.welcomeSub && dom.nameInput.value.trim()) {
                    dom.welcomeSub.textContent = '你好，' + normalizeStudentName(dom.nameInput.value) + '！准备好就点下面的按钮，我们出发吧。';
                }
            });
        }
        if (dom.gradeGrid) {
            dom.gradeGrid.addEventListener('click', function (event) {
                const button = event.target.closest ? event.target.closest('.grade-btn') : null;
                if (!button) return;
                setWelcomeGrade(Number(button.getAttribute('data-grade')));
                AudioFX.click();
            });
        }
        if (dom.soundToggle) dom.soundToggle.addEventListener('click', toggleSound);
        if (dom.welcomeSoundBtn) dom.welcomeSoundBtn.addEventListener('click', toggleSound);
        if (dom.wrongBookBtn) dom.wrongBookBtn.addEventListener('click', openWrongBook);
        if (dom.wrongCloseBtn) dom.wrongCloseBtn.addEventListener('click', closeWrongBook);
        if (dom.clearMasteredBtn) dom.clearMasteredBtn.addEventListener('click', clearMastered);
        if (dom.settingsBtn) dom.settingsBtn.addEventListener('click', openSettings);
        if (dom.settingsCloseBtn) dom.settingsCloseBtn.addEventListener('click', closeSettings);
        if (dom.switchStudentBtn) dom.switchStudentBtn.addEventListener('click', switchStudent);
        if (dom.chatToggle) dom.chatToggle.addEventListener('click', openChat);
        if (dom.chatCloseBtn) dom.chatCloseBtn.addEventListener('click', closeChat);
        if (dom.nextBtn) dom.nextBtn.addEventListener('click', nextQuestion);

        if (dom.chatForm) {
            dom.chatForm.addEventListener('submit', function (event) {
                event.preventDefault();
                if (dom.chatInput) sendChat(dom.chatInput.value);
            });
        }
        if (dom.chatSuggestions) {
            dom.chatSuggestions.addEventListener('click', function (event) {
                const chip = event.target.closest ? event.target.closest('.suggest-chip') : null;
                if (!chip) return;
                if (dom.chatInput) dom.chatInput.value = chip.textContent;
                sendChat(chip.textContent);
            });
        }

        if (dom.autoReadToggle) {
            dom.autoReadToggle.addEventListener('change', function () {
                state.settings.autoRead = !!dom.autoReadToggle.checked;
                saveSettings();
                if (!state.settings.autoRead) {
                    SpeechService.stop();
                } else if (!state.settings.muted) {
                    SpeechService.speak('好的，嘟嘟会继续给你朗读。');
                }
            });
        }
        if (dom.sfxToggle) {
            dom.sfxToggle.addEventListener('change', function () {
                state.settings.sfx = !!dom.sfxToggle.checked;
                saveSettings();
                if (state.settings.sfx) AudioFX.click();
            });
        }
        if (dom.ambientToggle) {
            dom.ambientToggle.addEventListener('change', function () {
                state.settings.ambient = !!dom.ambientToggle.checked;
                saveSettings();
                AudioFX.syncAmbient();
                showToast(state.settings.ambient ? '太空背景音打开啦。' : '太空背景音关掉啦。');
            });
        }
        if (dom.volumeRange) {
            dom.volumeRange.addEventListener('input', function () {
                state.settings.volume = clampNumber(dom.volumeRange.value, 0, 1, 0.9);
                if (dom.volumeValue) dom.volumeValue.textContent = Math.round(state.settings.volume * 100) + '%';
                AudioFX.updateMaster();
                saveSettings();
                if (state.settings.volume === 0) SpeechService.stop();
            });
            dom.volumeRange.addEventListener('change', function () {
                if (state.settings.volume > 0) {
                    SpeechService.speak('这个声音大小可以吗？', { force: true });
                }
            });
        }
        if (dom.rateRange) {
            dom.rateRange.addEventListener('input', function () {
                state.settings.rate = clampNumber(dom.rateRange.value, 0.7, 1.3, 0.95);
                if (dom.rateValue) dom.rateValue.textContent = state.settings.rate.toFixed(2);
                saveSettings();
            });
            dom.rateRange.addEventListener('change', function () {
                SpeechService.speak('这样说话的速度合适吗？', { force: true });
            });
        }
        if (dom.voiceSelect) {
            dom.voiceSelect.addEventListener('change', function () {
                state.settings.voiceURI = dom.voiceSelect.value || '';
                saveSettings();
                SpeechService.speak('你好呀，我是嘟嘟。', { force: true });
            });
        }
        if (dom.voicePreviewBtn) {
            dom.voicePreviewBtn.addEventListener('click', function () {
                SpeechService.preview();
            });
        }

        if (dom.resetProgressBtn) {
            dom.resetProgressBtn.addEventListener('click', function () {
                if (dom.resetConfirm) {
                    state.resetArmedAt = Date.now();
                    dom.resetConfirm.hidden = false;
                }
            });
        }
        if (dom.resetCancelBtn) {
            dom.resetCancelBtn.addEventListener('click', function () {
                state.resetArmedAt = 0;
                if (dom.resetConfirm) dom.resetConfirm.hidden = true;
            });
        }
        if (dom.resetConfirmBtn) {
            dom.resetConfirmBtn.addEventListener('click', function () {
                // 和错题本一样，避免双击直接穿过两步确认。
                if (Date.now() - state.resetArmedAt < 650) return;
                resetProgress();
            });
        }

        [dom.wrongOverlay, dom.settingsOverlay, dom.chatOverlay].forEach(function (overlay) {
            if (!overlay) return;
            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) {
                    if (overlay === dom.wrongOverlay) closeWrongBook();
                    else if (overlay === dom.settingsOverlay) closeSettings();
                    else if (overlay === dom.chatOverlay) closeChat();
                }
            });
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                if (closeTopOverlay()) {
                    event.preventDefault();
                }
                return;
            }
            if (anyModalOpen()) return;
            if (!state.entered || !state.data || !state.currentQuestion) return;
            const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            let index = -1;
            if (event.key === '1' || event.key === 'a' || event.key === 'A') index = 0;
            else if (event.key === '2' || event.key === 'b' || event.key === 'B') index = 1;
            else if (event.key === '3' || event.key === 'c' || event.key === 'C') index = 2;
            if (index === -1) return;
            const buttons = dom.optionsGrid ? dom.optionsGrid.querySelectorAll('.option-btn') : [];
            if (buttons[index] && !buttons[index].disabled) {
                event.preventDefault();
                buttons[index].click();
            }
        });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                persistData();
                SpeechService.stop();
            } else if (state.data) {
                const changed = ensureDailyState(state.data);
                if (changed) {
                    updateThemeChip();
                    updateHUD();
                }
            }
        });
        window.addEventListener('pagehide', function () {
            persistData();
        });
        window.addEventListener('online', function () {
            if (state.aiMode === 'off' || state.aiMode === 'direct' || state.aiMode === 'proxy') {
                checkAIMode();
            }
        });
        window.addEventListener('offline', function () {
            updateAIStatus();
        });
    }

    /* ----------------------------- 初始化 ----------------------------- */

    function init() {
        state.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (!knowledge) {
            if (dom.welcomeSub) {
                dom.welcomeSub.textContent = '星际引擎没有加载成功。请刷新页面；如果还是不行，请告诉老师。';
            }
            if (dom.startBtn) dom.startBtn.disabled = true;
        }

        state.legacy = {
            name: readLegacyName(),
            wrongBook: readLegacyWrongBook()
        };

        updateThemeChip();
        updateHUD();
        updateWrongBadge();
        updateSettingsProfile();
        updateSettingsStatus();
        applySoundUI();
        applySoundProfileToInputs();
        prefillWelcome();
        initStarfield();
        resizeConfetti();
        bindEvents();
        updateAIStatus();
        checkAIMode();

        if (dom.welcomeOverlay) {
            dom.welcomeOverlay.hidden = false;
            dom.welcomeOverlay.setAttribute('aria-hidden', 'false');
        }
        setMood('curious');
        setTimeout(function () {
            setMascotBubble('嗨，我在这里等你！');
        }, 1600);
        if (state.settings.muted) {
            setMascotBubble('嗨，准备出发啦！');
        }
        setTimeout(function () {
            if (dom.welcomeOverlay && !dom.welcomeOverlay.hidden && dom.nameInput) {
                dom.nameInput.focus();
            }
        }, 120);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
