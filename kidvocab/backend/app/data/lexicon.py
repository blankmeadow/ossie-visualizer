"""Offline linguistic assets.

The Vision LLM does the heavy lifting (OCR, restoration, meanings), but the
normalisation that follows it must be deterministic and testable, so the tables
that drive lemmatisation, phrase detection and filtering live here in code.

Everything below is scoped to Chinese primary school English (grades 1-6).
"""
from __future__ import annotations

# --------------------------------------------------------------------------
# Function words -- filtered out of recommendations (section 9.2)
# --------------------------------------------------------------------------
FUNCTION_WORDS: frozenset[str] = frozenset(
    """
    a an the this that these those my your his her its our their
    i you he she it we they me him them us
    am is are was were be been being
    do does did done doing
    have has had having
    will would shall should can could may might must
    and or but so because if then than as
    of to in on at by for with from into onto about over under
    up down out off again very too also just only not no yes
    there here where when what which who whom whose why how
    some any all both each every few many much more most other
    one two three four five six seven eight nine ten
    """.split()
)

#: Words that look like content words but carry no learning value on their own.
LOW_VALUE_WORDS: frozenset[str] = frozenset(
    """
    unit lesson page name class number part exercise answer question
    listen read write draw circle match choose fill complete
    ok okay hi hello bye yeah oh ah wow hmm
    """.split()
)

# --------------------------------------------------------------------------
# Lemmatisation (section 11)
# --------------------------------------------------------------------------
IRREGULAR_VERBS: dict[str, str] = {
    "went": "go", "gone": "go", "goes": "go", "going": "go",
    "was": "be", "were": "be", "been": "be", "being": "be", "is": "be", "am": "be", "are": "be",
    "had": "have", "has": "have", "having": "have",
    "did": "do", "does": "do", "done": "do", "doing": "do",
    "said": "say", "says": "say", "saying": "say",
    "made": "make", "making": "make",
    "took": "take", "taken": "take", "taking": "take",
    "came": "come", "coming": "come",
    "saw": "see", "seen": "see", "seeing": "see",
    "got": "get", "gotten": "get", "getting": "get",
    "gave": "give", "given": "give", "giving": "give",
    "found": "find", "finding": "find",
    "told": "tell", "telling": "tell",
    "became": "become", "becoming": "become",
    "left": "leave", "leaving": "leave",
    "felt": "feel", "feeling": "feel",
    "brought": "bring", "bringing": "bring",
    "began": "begin", "begun": "begin", "beginning": "begin",
    "kept": "keep", "keeping": "keep",
    "held": "hold", "holding": "hold",
    "wrote": "write", "written": "write", "writing": "write",
    "stood": "stand", "standing": "stand",
    "heard": "hear", "hearing": "hear",
    "let": "let", "letting": "let",
    "meant": "mean", "meaning": "mean",
    "met": "meet", "meeting": "meet",
    "ran": "run", "running": "run",
    "paid": "pay", "paying": "pay",
    "sat": "sit", "sitting": "sit",
    "spoke": "speak", "spoken": "speak", "speaking": "speak",
    "lay": "lie", "lain": "lie", "lying": "lie",
    "led": "lead", "leading": "lead",
    "grew": "grow", "grown": "grow", "growing": "grow",
    "lost": "lose", "losing": "lose",
    "fell": "fall", "fallen": "fall", "falling": "fall",
    "sent": "send", "sending": "send",
    "built": "build", "building": "build",
    "understood": "understand", "understanding": "understand",
    "drew": "draw", "drawn": "draw", "drawing": "draw",
    "broke": "break", "broken": "break", "breaking": "break",
    "spent": "spend", "spending": "spend",
    "cut": "cut", "cutting": "cut",
    "rose": "rise", "risen": "rise", "rising": "rise",
    "drove": "drive", "driven": "drive", "driving": "drive",
    "bought": "buy", "buying": "buy",
    "wore": "wear", "worn": "wear", "wearing": "wear",
    "chose": "choose", "chosen": "choose", "choosing": "choose",
    "ate": "eat", "eaten": "eat", "eating": "eat",
    "slept": "sleep", "sleeping": "sleep",
    "flew": "fly", "flown": "fly", "flying": "fly", "flies": "fly",
    "swam": "swim", "swum": "swim", "swimming": "swim",
    "sang": "sing", "sung": "sing", "singing": "sing",
    "drank": "drink", "drunk": "drink", "drinking": "drink",
    "threw": "throw", "thrown": "throw", "throwing": "throw",
    "caught": "catch", "catching": "catch", "catches": "catch",
    "taught": "teach", "teaching": "teach", "teaches": "teach",
    "thought": "think", "thinking": "think",
    "knew": "know", "known": "know", "knowing": "know",
    "put": "put", "putting": "put",
    "read": "read", "reading": "read",
    "hid": "hide", "hidden": "hide", "hiding": "hide",
    "woke": "wake", "woken": "wake", "waking": "wake",
    "rode": "ride", "ridden": "ride", "riding": "ride",
    "sold": "sell", "selling": "sell",
    "won": "win", "winning": "win",
    "hurt": "hurt", "hurting": "hurt",
    "shone": "shine", "shining": "shine",
}

IRREGULAR_NOUNS: dict[str, str] = {
    "children": "child", "men": "man", "women": "woman", "people": "person",
    "feet": "foot", "teeth": "tooth", "mice": "mouse", "geese": "goose",
    "sheep": "sheep", "fish": "fish", "deer": "deer",
    "leaves": "leaf", "wolves": "wolf", "knives": "knife", "wives": "wife",
    "lives": "life", "shelves": "shelf", "halves": "half", "thieves": "thief",
    "potatoes": "potato", "tomatoes": "tomato", "heroes": "hero",
    "buses": "bus", "boxes": "box", "dishes": "dish", "watches": "watch",
    "babies": "baby", "cities": "city", "stories": "story", "families": "family",
    "countries": "country", "parties": "party", "ladies": "lady", "candies": "candy",
    "glasses": "glass", "classes": "class", "brushes": "brush", "foxes": "fox",
    "better": "good", "best": "good", "worse": "bad", "worst": "bad",
    "more": "much", "most": "much",
}

#: Words whose -ing / -ed / -s form must not be stripped.
NEVER_STRIP: frozenset[str] = frozenset(
    """
    news glass class grass dress press cross bus gas yes this his its
    during morning evening spring string thing king ring sing bring
    wing everything something nothing anything ceiling
    bed red need seed feed speed weed bread head
    """.split()
)

# --------------------------------------------------------------------------
# Phrase inventory (sections 9.1 / 9.3) -- phrases are first-class items
# --------------------------------------------------------------------------
#: Multi-word items worth learning. Matching is longest-first, so "look after"
#: beats "look" and "be afraid of" beats "afraid".
PHRASE_LEXICON: dict[str, str] = {
    # phrasal verbs
    "look for": "寻找",
    "look after": "照顾",
    "look at": "看",
    "look like": "看起来像",
    "look up": "查找",
    "look out": "小心",
    "look forward to": "期待",
    "find out": "弄清楚",
    "take care of": "照顾",
    "take off": "脱下；起飞",
    "take out": "拿出",
    "take away": "拿走",
    "put on": "穿上",
    "put away": "收起来",
    "put up": "举起；张贴",
    "pick up": "捡起；接（人）",
    "give up": "放弃",
    "give back": "归还",
    "get up": "起床",
    "get on": "上车",
    "get off": "下车",
    "get ready": "准备好",
    "turn on": "打开",
    "turn off": "关掉",
    "turn around": "转身",
    "wake up": "醒来",
    "stand up": "站起来",
    "sit down": "坐下",
    "come back": "回来",
    "come on": "快点；加油",
    "come in": "进来",
    "go out": "出去",
    "go back": "回去",
    "go on": "继续",
    "go to bed": "去睡觉",
    "grow up": "长大",
    "run away": "跑开；逃跑",
    "keep going": "继续前进",
    "keep on": "继续",
    "clean up": "打扫干净",
    "try on": "试穿",
    "write down": "写下",
    "hurry up": "快点",
    "wait for": "等待",
    "listen to": "听",
    "talk about": "谈论",
    "think about": "考虑",
    "care about": "在乎",
    "ask for": "请求",
    "point at": "指向",
    "laugh at": "嘲笑",
    "arrive at": "到达",
    "belong to": "属于",
    "help with": "帮忙做",
    "fall down": "摔倒",
    "fall asleep": "睡着",
    "set off": "出发",
    "hold on": "等一下",
    "call back": "回电话",
    # be + adjective + preposition
    "be afraid of": "害怕",
    "be good at": "擅长",
    "be interested in": "对……感兴趣",
    "be full of": "充满",
    "be proud of": "为……自豪",
    "be ready for": "为……做好准备",
    "be late for": "……迟到",
    "be kind to": "对……友好",
    "be angry with": "生……的气",
    "be different from": "与……不同",
    "be made of": "由……制成",
    "be busy with": "忙于",
    "be sorry for": "为……感到抱歉",
    # fixed collocations
    "a lot of": "许多",
    "lots of": "许多",
    "a little": "一点",
    "a few": "一些",
    "a piece of": "一片；一块",
    "a kind of": "一种",
    "plenty of": "大量的",
    "at last": "最后",
    "at first": "起初",
    "at once": "立刻",
    "at home": "在家",
    "at school": "在学校",
    "at night": "在夜里",
    "in front of": "在……前面",
    "in the end": "最后",
    "in a hurry": "匆忙",
    "on time": "准时",
    "right now": "现在；立刻",
    "just now": "刚才",
    "all day": "整天",
    "all over": "遍及",
    "of course": "当然",
    "for example": "例如",
    "after school": "放学后",
    "from now on": "从现在起",
    "as soon as": "一……就……",
    "more and more": "越来越",
    "each other": "彼此",
    "far away": "遥远",
    "next to": "紧挨着",
    "instead of": "代替；而不是",
    "because of": "因为",
    "thanks to": "多亏了",
    "make friends": "交朋友",
    "have a look": "看一看",
    "have fun": "玩得开心",
    "take a walk": "散步",
    "do one's best": "尽某人最大努力",
    "make a mistake": "犯错误",
}

#: Prepositions/particles that a phrase cloze prefers to blank out (section 20).
PHRASE_PARTICLES: frozenset[str] = frozenset(
    """
    for after at up on off out in to of about with from away back down
    around forward like ready asleep
    """.split()
)

# --------------------------------------------------------------------------
# Single-word dictionary -- meaning, phonetic, earliest sensible grade
# --------------------------------------------------------------------------
#: lemma -> (chinese meaning, phonetic, grade band)
DICTIONARY: dict[str, tuple[str, str, int]] = {
    "forest": ("森林", "/ˈfɒrɪst/", 3),
    "river": ("河流", "/ˈrɪvə(r)/", 2),
    "mountain": ("山", "/ˈmaʊntən/", 3),
    "grass": ("草地", "/ɡrɑːs/", 2),
    "house": ("房子", "/haʊs/", 1),
    "school": ("学校", "/skuːl/", 1),
    "garden": ("花园", "/ˈɡɑːdn/", 2),
    "field": ("田野", "/fiːld/", 3),
    "village": ("村庄", "/ˈvɪlɪdʒ/", 4),
    "city": ("城市", "/ˈsɪti/", 2),
    "street": ("街道", "/striːt/", 3),
    "bridge": ("桥", "/brɪdʒ/", 3),
    "island": ("岛", "/ˈaɪlənd/", 4),
    "beach": ("海滩", "/biːtʃ/", 3),
    "cave": ("山洞", "/keɪv/", 4),
    "suddenly": ("突然", "/ˈsʌdənli/", 4),
    "quickly": ("很快地", "/ˈkwɪkli/", 3),
    "slowly": ("慢慢地", "/ˈsləʊli/", 3),
    "quietly": ("安静地", "/ˈkwaɪətli/", 4),
    "carefully": ("仔细地", "/ˈkeəfəli/", 4),
    "finally": ("最后", "/ˈfaɪnəli/", 4),
    "together": ("一起", "/təˈɡeðə(r)/", 2),
    "always": ("总是", "/ˈɔːlweɪz/", 2),
    "usually": ("通常", "/ˈjuːʒuəli/", 3),
    "never": ("从不", "/ˈnevə(r)/", 2),
    "because": ("因为", "/bɪˈkɒz/", 2),
    "afraid": ("害怕的", "/əˈfreɪd/", 3),
    "happy": ("开心的", "/ˈhæpi/", 1),
    "sad": ("伤心的", "/sæd/", 1),
    "angry": ("生气的", "/ˈæŋɡri/", 2),
    "tired": ("疲倦的", "/ˈtaɪəd/", 2),
    "hungry": ("饥饿的", "/ˈhʌŋɡri/", 2),
    "thirsty": ("口渴的", "/ˈθɜːsti/", 2),
    "excited": ("兴奋的", "/ɪkˈsaɪtɪd/", 3),
    "surprised": ("惊讶的", "/səˈpraɪzd/", 4),
    "brave": ("勇敢的", "/breɪv/", 3),
    "clever": ("聪明的", "/ˈklevə(r)/", 3),
    "friendly": ("友好的", "/ˈfrendli/", 3),
    "beautiful": ("美丽的", "/ˈbjuːtɪfl/", 2),
    "delicious": ("美味的", "/dɪˈlɪʃəs/", 3),
    "important": ("重要的", "/ɪmˈpɔːtnt/", 4),
    "difficult": ("困难的", "/ˈdɪfɪkəlt/", 3),
    "easy": ("容易的", "/ˈiːzi/", 2),
    "dangerous": ("危险的", "/ˈdeɪndʒərəs/", 4),
    "fox": ("狐狸", "/fɒks/", 2),
    "rabbit": ("兔子", "/ˈræbɪt/", 1),
    "mouse": ("老鼠", "/maʊs/", 1),
    "bird": ("鸟", "/bɜːd/", 1),
    "dog": ("狗", "/dɒɡ/", 1),
    "cat": ("猫", "/kæt/", 1),
    "horse": ("马", "/hɔːs/", 2),
    "monkey": ("猴子", "/ˈmʌŋki/", 2),
    "elephant": ("大象", "/ˈelɪfənt/", 2),
    "tiger": ("老虎", "/ˈtaɪɡə(r)/", 2),
    "lion": ("狮子", "/ˈlaɪən/", 2),
    "bear": ("熊", "/beə(r)/", 2),
    "duck": ("鸭子", "/dʌk/", 1),
    "chicken": ("鸡", "/ˈtʃɪkɪn/", 2),
    "food": ("食物", "/fuːd/", 1),
    "water": ("水", "/ˈwɔːtə(r)/", 1),
    "bread": ("面包", "/bred/", 1),
    "apple": ("苹果", "/ˈæpl/", 1),
    "dinner": ("晚餐", "/ˈdɪnə(r)/", 2),
    "breakfast": ("早餐", "/ˈbrekfəst/", 2),
    "mother": ("妈妈", "/ˈmʌðə(r)/", 1),
    "father": ("爸爸", "/ˈfɑːðə(r)/", 1),
    "brother": ("兄弟", "/ˈbrʌðə(r)/", 1),
    "sister": ("姐妹", "/ˈsɪstə(r)/", 1),
    "friend": ("朋友", "/frend/", 1),
    "teacher": ("老师", "/ˈtiːtʃə(r)/", 1),
    "student": ("学生", "/ˈstjuːdnt/", 2),
    "child": ("孩子", "/tʃaɪld/", 1),
    "family": ("家庭", "/ˈfæməli/", 1),
    "pencil": ("铅笔", "/ˈpensl/", 1),
    "book": ("书", "/bʊk/", 1),
    "bag": ("书包", "/bæɡ/", 1),
    "door": ("门", "/dɔː(r)/", 1),
    "window": ("窗户", "/ˈwɪndəʊ/", 1),
    "picture": ("图画", "/ˈpɪktʃə(r)/", 2),
    "story": ("故事", "/ˈstɔːri/", 2),
    "letter": ("信；字母", "/ˈletə(r)/", 2),
    "present": ("礼物", "/ˈpreznt/", 3),
    "money": ("钱", "/ˈmʌni/", 2),
    "clothes": ("衣服", "/kləʊðz/", 2),
    "walk": ("走", "/wɔːk/", 1),
    "run": ("跑", "/rʌn/", 1),
    "jump": ("跳", "/dʒʌmp/", 1),
    "swim": ("游泳", "/swɪm/", 1),
    "fly": ("飞", "/flaɪ/", 1),
    "sing": ("唱歌", "/sɪŋ/", 1),
    "dance": ("跳舞", "/dɑːns/", 1),
    "eat": ("吃", "/iːt/", 1),
    "drink": ("喝", "/drɪŋk/", 1),
    "sleep": ("睡觉", "/sliːp/", 1),
    "help": ("帮助", "/help/", 1),
    "find": ("找到", "/faɪnd/", 2),
    "lose": ("丢失", "/luːz/", 3),
    "carry": ("搬运", "/ˈkæri/", 3),
    "catch": ("抓住", "/kætʃ/", 2),
    "throw": ("扔", "/θrəʊ/", 3),
    "climb": ("爬", "/klaɪm/", 2),
    "hide": ("躲藏", "/haɪd/", 3),
    "follow": ("跟随", "/ˈfɒləʊ/", 3),
    "discover": ("发现", "/dɪˈskʌvə(r)/", 5),
    "arrive": ("到达", "/əˈraɪv/", 4),
    "decide": ("决定", "/dɪˈsaɪd/", 4),
    "remember": ("记得", "/rɪˈmembə(r)/", 3),
    "forget": ("忘记", "/fəˈɡet/", 3),
    "understand": ("理解", "/ˌʌndəˈstænd/", 4),
    "believe": ("相信", "/bɪˈliːv/", 4),
    "promise": ("承诺", "/ˈprɒmɪs/", 4),
    "share": ("分享", "/ʃeə(r)/", 3),
    "grow": ("生长", "/ɡrəʊ/", 2),
    "change": ("改变", "/tʃeɪndʒ/", 3),
    "answer": ("回答", "/ˈɑːnsə(r)/", 2),
    "visit": ("拜访", "/ˈvɪzɪt/", 2),
    "travel": ("旅行", "/ˈtrævl/", 3),
    "first": ("第一", "/fɜːst/", 1),
    "morning": ("早上", "/ˈmɔːnɪŋ/", 1),
    "night": ("夜晚", "/naɪt/", 1),
    "winter": ("冬天", "/ˈwɪntə(r)/", 2),
    "summer": ("夏天", "/ˈsʌmə(r)/", 2),
    "spring": ("春天", "/sprɪŋ/", 2),
    "autumn": ("秋天", "/ˈɔːtəm/", 2),
    "weather": ("天气", "/ˈweðə(r)/", 2),
    "rain": ("雨", "/reɪn/", 1),
    "snow": ("雪", "/snəʊ/", 1),
    "wind": ("风", "/wɪnd/", 2),
    "sun": ("太阳", "/sʌn/", 1),
    "moon": ("月亮", "/muːn/", 1),
    "star": ("星星", "/stɑː(r)/", 1),
    "sky": ("天空", "/skaɪ/", 1),
    "tree": ("树", "/triː/", 1),
    "flower": ("花", "/ˈflaʊə(r)/", 1),
}

#: Plausible-but-wrong Chinese meanings, grouped so a T1 distractor stays in the
#: same semantic neighbourhood instead of being obviously absurd (section 19).
MEANING_GROUPS: dict[str, list[str]] = {
    "place": ["森林", "河流", "山", "草地", "房子", "学校", "花园", "田野", "村庄", "城市", "街道", "桥", "海滩", "山洞"],
    "animal": ["狐狸", "兔子", "老鼠", "鸟", "狗", "猫", "马", "猴子", "大象", "老虎", "狮子", "熊", "鸭子", "鸡"],
    "feeling": ["害怕的", "开心的", "伤心的", "生气的", "疲倦的", "饥饿的", "口渴的", "兴奋的", "惊讶的", "勇敢的", "聪明的"],
    "action": ["走", "跑", "跳", "游泳", "飞", "唱歌", "跳舞", "吃", "喝", "睡觉", "帮助", "找到", "抓住", "扔", "爬", "躲藏", "跟随"],
    "manner": ["突然", "很快地", "慢慢地", "安静地", "仔细地", "最后", "一起", "总是", "通常", "从不"],
    "phrase": ["寻找", "照顾", "弄清楚", "放弃", "起床", "打开", "关掉", "继续前进", "害怕", "擅长", "许多", "当然", "等待", "听"],
    "people": ["妈妈", "爸爸", "兄弟", "姐妹", "朋友", "老师", "学生", "孩子", "家庭"],
    "thing": ["铅笔", "书", "书包", "门", "窗户", "图画", "故事", "礼物", "钱", "衣服", "食物", "水", "面包", "苹果"],
}

#: lemma -> semantic group, used to pick same-neighbourhood distractors.
WORD_GROUP: dict[str, str] = {}
for _group, _meanings in MEANING_GROUPS.items():
    for _m in _meanings:
        for _lemma, (_meaning, _p, _g) in DICTIONARY.items():
            if _meaning == _m:
                WORD_GROUP[_lemma] = _group
for _lemma, _meaning in PHRASE_LEXICON.items():
    WORD_GROUP.setdefault(_lemma, "phrase")
