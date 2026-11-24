// BLC 1.10.4 configurator message factories.
export function createBlivechatSimulation({ random = Math.random, now = Date.now } = {}) {
 const constants={AUTHOR_TYPE_NORMAL:0,AUTHOR_TYPE_MEMBER:1,AUTHOR_TYPE_ADMIN:2,AUTHOR_TYPE_OWNER:3,MESSAGE_TYPE_TEXT:0,MESSAGE_TYPE_GIFT:1,MESSAGE_TYPE_MEMBER:2,MESSAGE_TYPE_SUPER_CHAT:3};
 let serial=0;
 const defaults=(method,values)=>({id:`source:${now()}:${++serial}`,avatarUrl:'/media/noface.gif',timestamp:now()/1000,uid:'',num:1,translation:'',authorType:0,privilegeType:0,...(method==='onAddGift'?{totalCoin:0,totalFreeCoin:0}:{}),...values,...(method==='onAddMember'?{totalCoin:values.total_coin}:{} )});
const NAMES = [
  '成龙',
  '杨戬',
  '孙悟空',
  '哈基米',
  '大张伟',
  '周冠宇',
  '五条悟',
  '博丽灵梦',
  '御剑侍伶',
  '田所浩二',
  '小岛秀夫',
  '長崎そよ',
  '柚木つばめ',
  '空條承太郎',
  'みもりあいの',
  'ディオ・ブランドー',
  'Dante',
  'xQcOW',
  'Makarov',
  'xfgryujk',
  'Jim Hacker',
  'Rick Astley',
  'Tifa Lockhart',
  'Arthur Morgan',
]

const CONTENTS = [
  '草',
  '会赢的',
  '让我看看',
  '卑鄙的外乡人',
  '我不做人了，JOJO',
  '想吃广东菜✋😭✋',
  '已经没有什么好怕的了',
  '你这猴子，真令我欢喜',
  '[dog]文本[比心]表情[喝彩]',
  '阿祖，投降吧，外面全是警察',
  '無駄無駄無駄無駄無駄無駄無駄無駄',
  '我衰咗三年，我等緊個機會，爭番口氣',
  '因为你的缘故，我的心中萌生了多余的情感',
  'CJK令化天家少房所沪港漢澳直真空角言门骨',
  '迷えば、敗れる',
  '逃げるんだよォ！',
  '届かない恋をしていても',
  'なんで春日影やったの！？',
  'kksk',
  'Y.M.C.A.',
  '8888888888',
  'text[吃瓜]emoticon',
  'Remember... no Russian',
  'Never gonna give you up',
  'DU↗DU→DU↗DU↓ Max Verstappen',
  'Farewell, ashen one. May the flame guide thee',
  'Hey Vergil, your portal opening days are over. Give me the Yamato',
  '<script>alert("CHECK YOUR CODE")</script>',
  '<img src=1 onerror="alert(\'CHECK YOUR CODE\')">',
]

const EMOTICONS = [
  '233',
  'miaoa',
  'lipu',
  'huangdou_xihuan',
  'sakaban_jiayu_yutou',
].map(name => '/media/style-preview-big-emote.png')

const TRANSLATIONS = [
  '这是翻译',
  'これは翻訳です',
  'blah blah blah',
]

const AUTHOR_TYPES = [
  { weight: 10, value: constants.AUTHOR_TYPE_NORMAL },
  { weight: 5, value: constants.AUTHOR_TYPE_MEMBER },
  { weight: 2, value: constants.AUTHOR_TYPE_ADMIN },
  { weight: 1, value: constants.AUTHOR_TYPE_OWNER }
]

const GUARD_LEVEL_TO_PRICE = [
  0, 19998, 1998, 198
]

function randGuardInfo() {
  let authorType = randomChoose(AUTHOR_TYPES)
  let privilegeType
  if (authorType === constants.AUTHOR_TYPE_MEMBER) {
    privilegeType = randInt(1, 3)
  } else if (authorType === constants.AUTHOR_TYPE_ADMIN) {
    privilegeType = randInt(0, 3)
  } else {
    privilegeType = 0
  }
  return { authorType, privilegeType }
}

const MEDAL_NAMES = [
  'ikun',
  'K学姐',
  '小孤独',
  'Go学长',
  '不登校',
]

function randMedalInfo() {
  let medalLevel = randInt(1, 4) <= 1 ? 0 : randInt(1, 40)
  let medalName = medalLevel === 0 ? '' : randomChoose(MEDAL_NAMES)
  return { medalLevel, medalName }
}

const GIFT_INFO_LIST = [
  { giftId: 1, giftName: '粉丝团灯牌', totalFreeCoin: 200, num: 10, giftIconUrl: '//s1.hdslb.com/bfs/live/e051dfd4557678f8edcac4993ed00a0935cbd9cc.png' },
  { giftId: 2, giftName: '可爱捏', totalCoin: 9900, giftIconUrl: '//s1.hdslb.com/bfs/live/6dab14826b531c731521345e00d6b56a6708a449.png' },
  { giftId: 3, giftName: '花式夸夸', totalCoin: 29900, giftIconUrl: '//s1.hdslb.com/bfs/live/28186596880db45a7b843f17d6ebb70feeac06f9.png' },
  { giftId: 4, giftName: '情书', totalCoin: 52000, num: 10, giftIconUrl: '//s1.hdslb.com/bfs/live/14dafbf217618f0931c08897e0b3eefc00d0da22.png' },
  { giftId: 5, giftName: '极速超跑', totalCoin: 100000, giftIconUrl: '//s1.hdslb.com/bfs/live/27b9734d1a5f77ea6fc94957e3fcbeb55505c6b9.png' },
  { giftId: 6, giftName: '为你摘星', totalCoin: 520000, giftIconUrl: '//s1.hdslb.com/bfs/live/5bd584b6fdfb03d66de56102e775582fb29ceab7.png' },
  { giftId: 7, giftName: '次元之城', totalCoin: 1245000, giftIconUrl: '//s1.hdslb.com/bfs/live/cdae8136b1ee767609aeec688bca8124651d4d01.png' }
]

const SC_PRICES = [
  30, 50, 100, 200, 500, 1000
]

const MESSAGE_GENERATORS = [
  // 文字
  {
    filterType: 'text',  // 取值和样式生成器中的消息类型设置相同
    weight: 20,
    value() {
      return {
        type: constants.MESSAGE_TYPE_TEXT,
        message: defaults('onAddText', {
          ...randGuardInfo(),
          ...randMedalInfo(),
          authorName: randomChoose(NAMES),
          content: randomChoose(CONTENTS),
          isGiftDanmaku: randInt(1, 10) <= 1,
          authorLevel: randInt(1, 60),
          isNewbie: randInt(1, 10) <= 1,
          isMobileVerified: randInt(1, 10) <= 9,
          translation: randInt(1, 10) <= 1 ? randomChoose(TRANSLATIONS) : '',
        })
      }
    }
  },
  // 表情
  {
    filterType: 'emoticon',
    weight: 5,
    value() {
      return {
        type: constants.MESSAGE_TYPE_TEXT,
        message: defaults('onAddText', {
          ...randGuardInfo(),
          ...randMedalInfo(),
          authorName: randomChoose(NAMES),
          authorLevel: randInt(1, 60),
          isNewbie: randInt(1, 10) <= 1,
          isMobileVerified: randInt(1, 10) <= 9,
          emoticon: randomChoose(EMOTICONS),
        })
      }
    }
  },
  // 礼物
  {
    filterType: 'gift',
    weight: 1,
    value() {
      return {
        type: constants.MESSAGE_TYPE_GIFT,
        message: defaults('onAddGift', {
          ...randMedalInfo(),
          ...randomChoose(GIFT_INFO_LIST),
          authorName: randomChoose(NAMES),
          privilegeType: randInt(0, 3),
        })
      }
    }
  },
  // SC
  {
    filterType: 'superChat',
    weight: 3,
    value() {
      return {
        type: constants.MESSAGE_TYPE_SUPER_CHAT,
        message: defaults('onAddSuperChat', {
          ...randMedalInfo(),
          authorName: randomChoose(NAMES),
          price: randomChoose(SC_PRICES),
          content: randomChoose(CONTENTS),
          translation: randInt(1, 10) <= 1 ? randomChoose(TRANSLATIONS) : '',
          privilegeType: randInt(0, 3),
        })
      }
    }
  },
  // 新舰长
  {
    filterType: 'member',
    weight: 1,
    value() {
      let privilegeType = randInt(1, 3)
      return {
        type: constants.MESSAGE_TYPE_MEMBER,
        message: defaults('onAddMember', {
          ...randMedalInfo(),
          authorName: randomChoose(NAMES),
          privilegeType: privilegeType,
          total_coin: GUARD_LEVEL_TO_PRICE[privilegeType] * 1000,
        })
      }
    }
  }
]

function randomChoose(nodes) {
  if (nodes.length === 0) {
    return null
  }
  for (let node of nodes) {
    if (node.weight === undefined || node.value === undefined) {
      return nodes[randInt(0, nodes.length - 1)]
    }
  }

  let totalWeight = 0
  for (let node of nodes) {
    totalWeight += node.weight
  }
  let remainWeight = randInt(1, totalWeight)
  for (let node of nodes) {
    remainWeight -= node.weight
    if (remainWeight > 0) {
      continue
    }
    if (node.value instanceof Array) {
      return randomChoose(node.value)
    }
    return node.value
  }
  return null
}

function randInt(min, max) {
  return Math.floor(min + ((max - min + 1) * random()))
}


 return {
   next({types={text:true,emoticon:true,gift:true,superChat:true,member:true},gifts,prices,guards}={}) {
     const nodes=MESSAGE_GENERATORS.filter(node=>types[node.filterType] && (node.filterType!=='gift'||gifts===undefined||gifts.length) && (node.filterType!=='superChat'||prices===undefined||prices.length) && (node.filterType!=='member'||guards===undefined||guards.length));
     const factory=randomChoose(nodes);if(!factory)return null;
     const {type,message}=factory();const method=['onAddText','onAddGift','onAddMember','onAddSuperChat'][type];
     if(method==='onAddGift'&&gifts){delete message.totalFreeCoin;message.totalCoin=0;Object.assign(message,randomChoose(gifts));}
     if(method==='onAddSuperChat'&&prices)message.price=randomChoose(prices);
     if(method==='onAddMember'&&guards){message.privilegeType=randomChoose(guards);message.totalCoin=GUARD_LEVEL_TO_PRICE[message.privilegeType]*1000;}
     delete message.translation;
     return {method,payload:message,receivedAt:now()};
   },gifts:GIFT_INFO_LIST,prices:SC_PRICES,guards:[1,2,3],
 };
}
