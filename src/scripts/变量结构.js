import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
// Shared only by the three existing panel bridges and the MVU schema.
// Validate effect input without filling defaults or changing unrelated character fields.
// Calculation instructions live only in changes; this release targets new saves.
function canonicalDndEffect(effect, index) {
  const out = {...effect};
  for (const key of ['target','mode','value','selector']) delete out[key];
  return {
    ...out,
    id: effect.id ?? `fx-${index + 1}`,
    name: effect.name ?? `效果 ${index + 1}`,
    enabled: effect.enabled ?? true,
    priority: effect.priority ?? 0,
    stackKey: effect.stackKey ?? '',
    stackRule: effect.stackRule ?? 'stack',
    requiresEquipped: effect.requiresEquipped ?? false,
    changes: effect.changes.map((change, i) => ({
      ...change,
      id: change.id ?? `change-${i + 1}`,
      target: change.target,
      mode: change.mode ?? 'add',
      enabled: change.enabled ?? true,
      priority: change.priority ?? 0,
      selector: change.selector ? {...change.selector} : {}
    }))
  };
}

function normalizeDndEffects(effects = []) {
  validateDndEffects({角色列表:{校验:{临时效果:effects}}}, (path,message)=>{throw new Error(path.join('.')+'：'+message);});
  return effects.map(canonicalDndEffect);
}

function normalizeDndRootEffects(root) {
  validateDndEffects(root, (path,message)=>{throw new Error(path.join('.')+'：'+message);});
  const object = value=>value && typeof value==='object' && !Array.isArray(value);
  const source = value=>{if (object(value) && value.effects !== undefined) value.effects=value.effects.map(canonicalDndEffect);};
  for (const c of Object.values(root?.角色列表 || {})) {
    if (!object(c)) continue;
    // Panels still use grouped inventories internally; this is not a legacy effect format.
    for (const [key,item] of Object.entries(c.物品 || {})) {
      if (['武器','护甲','奇物','杂物'].includes(key) && object(item) && !item.类别 && !item.描述) Object.values(item).forEach(source);
      else source(item);
    }
    for (const group of Object.values(c.特性 || {})) if (object(group)) Object.values(group).forEach(source);
    if (c.临时效果 !== undefined) c.临时效果=c.临时效果.map(canonicalDndEffect);
  }
  return root;
}


function validateDndEffects(root, issue) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const targets = new Set(['ac.bonus','initiative.bonus','speed.bonus','hp.max','save.all','skill.all','spell.attack','spell.dc','weapon.attack','weapon.damage','weapon.damage.dice']);
  const skills = new Set(['运动','特技','巧手','隐匿','奥秘','历史','调查','自然','宗教','驯兽','洞悉','医药','察觉','求生','欺瞒','威吓','表演','游说']);
  const vars = new Set(['pb','prof','level','str','dex','con','int','wis','cha','strmod','dexmod','conmod','intmod','wismod','chamod','str_mod','dex_mod','con_mod','int_mod','wis_mod','cha_mod','ac','speed','hpmax','hpcurrent','weaponmagic']);
  const fail = (path, message) => issue(path, message);
  function source(value, path) {
    if (!object(value)) return;
    if (['effectTags','效果标签','效果'].some(key=>Object.hasOwn(value,key))) fail(path,'新档只使用 effects 数组，不接受旧标签或字段别名');
    const raw = value.effects;
    if (raw === undefined) return;
    if (!Array.isArray(raw)) { fail([...path,'effects'],'effects 必须是数组；清空请写 []'); return; }
    raw.forEach((effect, i) => {
      const p = [...path,'effects',i];
      if (!object(effect)) { fail(p,'效果必须是对象'); return; }
      for (const key of ['enabled','requiresEquipped']) if (effect[key] !== undefined && typeof effect[key] !== 'boolean') fail([...p,key],`${key} 必须是真/假`);
      if (effect.priority !== undefined && !Number.isFinite(effect.priority)) fail([...p,'priority'],'优先级必须是有限数值');
      if (effect.stackRule !== undefined && !['stack','highest','lowest','replace'].includes(effect.stackRule)) fail([...p,'stackRule'],'不支持的叠加规则');
      for (const key of ['path','key','amount','operator','修改']) if (Object.hasOwn(effect,key)) fail([...p,key],'不支持字段别名；请使用 changes 内的 target/mode/value');
      const changes = effect.changes;
      if (!Array.isArray(changes) || !changes.length) { fail([...p,'changes'],'效果需要至少一条 changes'); return; }
      changes.forEach((change,j) => {
        const cp = [...p,'changes',j];
        if (!object(change)) { fail(cp,'变化项必须是对象'); return; }
        for (const key of ['path','key','amount','operator']) if (Object.hasOwn(change,key)) fail([...cp,key],'不支持字段别名；请使用 target/mode/value');
        const target = change.target;
        if (!targets.has(target) && !/^save\.(str|dex|con|int|wis|cha)$/.test(target || '') && !(typeof target === 'string' && target.startsWith('skill.') && skills.has(target.slice(6)))) fail([...cp,'target'],`不支持的效果目标：${target}`);
        const mode = change.mode ?? 'add';
        if (!['add','multiply','override','upgrade','downgrade'].includes(mode)) fail([...cp,'mode'],`不支持的运算方式：${mode}`);
        for (const key of ['enabled']) if (change[key] !== undefined && typeof change[key] !== 'boolean') fail([...cp,key],`${key} 必须是真/假`);
        if (change.priority !== undefined && !Number.isFinite(change.priority)) fail([...cp,'priority'],'优先级必须是有限数值');
        const rawValue = change.value;
        if (target === 'weapon.damage.dice') {
          if (!['add','override'].includes(mode) || typeof rawValue !== 'string' || !/^\d+d\d+(?:[+-]\d+)?$/i.test(rawValue.trim()) || !rawValue.match(/^([1-9]\d*)d([1-9]\d*)/i)) fail([...cp,'value'],'额外伤害骰仅支持 add/override 和正整数骰式，例如 1d4');
          if (['highest','lowest'].includes(effect.stackRule)) fail([...cp,'value'],'伤害骰不支持 highest/lowest；请由 AI 决定启用哪一个');
        } else if (!Number.isFinite(rawValue)) {
          if (typeof rawValue !== 'string' || !rawValue.trim()) fail([...cp,'value'],'数值效果需要数字或已支持的公式');
          else {
            let valid = true;
            if (/@weaponmagic\b/i.test(rawValue) && !String(target).startsWith('weapon.')) fail([...cp,'value'],'@weaponmagic 仅可用于武器目标');
            const expression = rawValue.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g,(_,key) => { if (!vars.has(key.toLowerCase())) valid = false; return '1'; });
            if (!valid || !/^[\d+\-*/().\s]+$/.test(expression)) fail([...cp,'value'],'公式包含不支持的变量或字符');
            else { try { Function(`"use strict"; return (${expression});`); } catch { fail([...cp,'value'],'公式语法错误'); } }
          }
        }
        if (change.selector !== undefined) {
          if (!object(change.selector)) fail([...cp,'selector'],'筛选条件必须是对象');
          else for (const [key,v] of Object.entries(change.selector)) {
            if (!['sourceType','sourceNameIncludes','weaponNameIncludes','weaponTypeIncludes','weaponTagIncludes','requiresEquipped'].includes(key)) fail([...cp,'selector',key],`程序不支持这个条件：${key}；请由 AI 维护 enabled`);
            else if (key === 'requiresEquipped' ? typeof v !== 'boolean' : typeof v !== 'string') fail([...cp,'selector',key],'筛选条件类型不正确');
            else if (key === 'sourceType' && !['weapon','equipment','feature-class','feature-race','feature-feats','temporary'].includes(v)) fail([...cp,'selector',key],'来源类型无效');
          }
        }
      });
    });
  }
  if (!object(root?.角色列表)) return;
  for (const [name,c] of Object.entries(root.角色列表)) {
    if (!object(c)) continue;
    const p = ['角色列表',name];
    for (const [key,item] of Object.entries(c.物品 || {})) {
      if (['武器','护甲','奇物','杂物'].includes(key) && object(item) && !item.类别 && !item.描述) for (const [n,v] of Object.entries(item)) source(v,[...p,'物品',key,n]);
      else source(item,[...p,'物品',key]);
    }
    for (const [group,features] of Object.entries(c.特性 || {})) if (object(features)) for (const [n,v] of Object.entries(features)) source(v,[...p,'特性',group,n]);
    source({effects:c.临时效果},[...p,'临时效果']);
  }
}

// The build inserts existing panel helpers here; UI and MVU execute this same code.
const DndArmor = (() => {
const ABILITY_TO_KEY = { 力量: 'str', 敏捷: 'dex', 体质: 'con', 智力: 'int', 感知: 'wis', 魅力: 'cha', 无: 'none' };

const ARMOR_TYPE_TO_KEY = { 轻甲: 'light', 中甲: 'medium', 重甲: 'heavy', 盾牌: 'shield', 无甲效果: 'unarmoredEffect', 法师护甲: 'light', 无: 'none' };

const ARMOR_ABILITY_LABELS = { dex: '敏捷', con: '体质', wis: '感知' };

const EFFECT_MODES = new Set(['add', 'multiply', 'override', 'upgrade', 'downgrade']);

const EFFECT_STACK_RULES = new Set(['stack', 'highest', 'lowest', 'replace']);

const normalizeNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const normalizeString = (value, fallback = '') => {
    return typeof value === 'string' ? value : (value ?? fallback);
};

const normalizeNullableNumber = (value) => {
    if (value === '' || value === null || typeof value === 'undefined') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const normalizeAcMode = (value, fallback = 'auto') => {
    const mode = String(value || '').trim().toLowerCase();
    const modeMap = {
        auto: 'auto',
        自动: 'auto',
        custom: 'custom',
        自定义: 'custom',
        armor: 'armor',
        护甲: 'armor',
        unarmored: 'unarmored',
        无甲: 'unarmored',
        monk: 'monk',
        武僧: 'monk',
        barbarian: 'barbarian',
        野蛮人: 'barbarian',
        'mage-armor': 'mage-armor',
        magearmor: 'mage-armor',
        'mage armor': 'mage-armor',
        法师护甲: 'mage-armor'
    };
    return modeMap[mode] || fallback;
};

const getModifier = (score) => Math.floor((parseInt(score, 10) - 10) / 2);

function normalizeEffects(rawEffects = []) {
    return normalizeDndEffects(rawEffects);
}

function normalizeEffectMode(mode = 'add') {
    if (!EFFECT_MODES.has(mode)) throw new Error(`不支持的运算方式：${mode}`);
    return mode;
}

function normalizeEffectStackRule(rule = 'stack') {
    if (!EFFECT_STACK_RULES.has(rule)) throw new Error(`不支持的叠加规则：${rule}`);
    return rule;
}

function normalizeEffectTarget(targetRaw) {
    return targetRaw ?? '';
}

function getCombinedSourceEffects(sourceObj) {
    return normalizeEffects(sourceObj?.effects);
}

function convertWeaponFromSchema(name, raw = {}) {
    const attackStat = ABILITY_TO_KEY[raw.映射属性] || raw.映射属性 || 'str';
    const attackBonusOverride = normalizeNullableNumber(
        raw.攻击加值覆盖 ?? raw.攻击加值 ?? raw.命中加值 ?? raw.命中加值覆盖 ?? raw.attackBonusOverride
    );
    return {
        name,
        attackStat,
        damage: normalizeString(raw.伤害公式, ''),
        type: normalizeString(raw.伤害类型, ''),
        magicBonus: normalizeNumber(raw.魔法加值, 0),
        proficient: !!raw.熟练,
        attackBonusOverride,
        details: normalizeString(raw.描述, ''),
        tags: normalizeString(raw.属性特征 ?? raw.标签 ?? '', ''),
        mastery: normalizeString(raw.专精特质 ?? raw.武器专精 ?? '', ''),
        isMastered: !!raw.已掌握,
        quantity: normalizeNumber(raw.数量, 1),
        weight: normalizeNumber(raw.重量, 0),
        value: normalizeString(raw.价值, ''),
        isEquipped: !!raw.已装备,
        requiresAttunement: !!raw.需要同调,
        isAttuned: !!raw.已同调,
        effects: normalizeEffects(raw.effects)
    };
}

function convertEquipmentFromSchema(name, raw = {}, category = 'misc') {
    const armorTypeLabel = raw.护甲类型 || raw.护甲类别 || '无';
    let armorType = ARMOR_TYPE_TO_KEY[armorTypeLabel] || raw.armorType || 'none';
    const detailsText = normalizeString(raw.描述, '');
    const mageArmorHint = /法师护甲|mage\s*armor/i.test(String(name || ''))
        || /ac\s*变为|13\s*\+\s*敏捷|13\s*\+\s*dex/i.test(detailsText);
    if (category === 'armor' && armorType === 'none' && mageArmorHint) {
        armorType = 'light';
    }
    const base = {
        name,
        category,
        type: category === 'armor' ? 'armor' : 'item',
        quantity: normalizeNumber(raw.数量, 1),
        weight: normalizeNumber(raw.重量, 0),
        value: normalizeString(raw.价值, ''),
        isEquipped: !!raw.已装备,
        requiresAttunement: !!raw.需要同调,
        isAttuned: !!raw.已同调,
        details: normalizeString(raw.描述, ''),
        tags: normalizeString(raw.属性特征 ?? raw.标签 ?? '', ''),
        customData: normalizeString(raw.自定义数据 || '', ''),
        effects: normalizeEffects(raw.effects)
    };

    if (category === 'armor') {
        const defaultBaseAc = mageArmorHint ? 13 : 10;
        const baseAcOverride = normalizeNullableNumber(
            raw.护甲值覆盖
            ?? raw.基础护甲覆盖
            ?? raw.护甲基值覆盖
            ?? raw.baseAcOverride
        );
        return {
            ...base,
            armorType,
            baseAc: normalizeNumber(raw.基础护甲值 ?? raw.基础护甲 ?? raw.baseAc, defaultBaseAc),
            baseAcOverride,
            magicBonus: normalizeNumber(raw.魔法加值, 0),
            dexCap: normalizeNumber(raw.最大敏捷加值 ?? raw.最大敏捷豁免 ?? raw.最大敏捷 ?? (armorType === 'medium' ? 2 : 99), armorType === 'medium' ? 2 : 99),
            stealthDisadvantage: !!raw.隐匿劣势,
            strRequirement: normalizeNumber(raw.力量需求, 0)
        };
    }

    return base;
}

function isMageArmorLike(...inputs) {
    const text = inputs.map(value => String(value || '')).join(' ');
    return /法师护甲|mage\s*armor/i.test(text)
        || /ac\s*变为\s*13|13\s*\+\s*(敏捷|dex)/i.test(text);
}

function normalizeEquipmentItem(item) {
    if (!item || typeof item !== 'object') return item;
    item.name = normalizeString(item.name, '自定义装备');
    item.details = normalizeString(item.details, '');
    item.tags = normalizeString(item.tags, '');
    item.customData = normalizeString(item.customData, '');
    item.quantity = normalizeNumber(item.quantity, 1);
    item.weight = normalizeNumber(item.weight, 0);
    item.value = normalizeString(item.value, '');

    item.effects = normalizeEffects(item.effects);

    const mageArmorDetected = isMageArmorLike(item.name, item.details, item.customData, item.tags);
    if (mageArmorDetected) {
        item.type = 'armor';
        item.category = 'armor';
        item.armorType = 'light';
        item.baseAc = Number.isFinite(item.baseAc) ? item.baseAc : 13;
        if (!item.details.trim()) item.details = '按轻甲处理，基础AC 13';
    }

    if (item.type === 'armor' || ['light', 'medium', 'heavy', 'shield', 'unarmoredEffect'].includes(item.armorType)) {
        item.type = 'armor';
        item.category = 'armor';
        item.armorType = item.armorType || 'none';
        if (!Number.isFinite(item.baseAc)) {
            if (item.armorType === 'shield') item.baseAc = 2;
            else if (item.armorType === 'unarmoredEffect') item.baseAc = 13;
            else item.baseAc = 10;
        }
    } else if (!item.category) {
        item.category = 'misc';
    }

    const parsedBaseOverride = parseInt(item.baseAcOverride, 10);
    item.baseAcOverride = Number.isFinite(parsedBaseOverride) ? parsedBaseOverride : null;
    return item;
}

function fromSchema(raw) {
  const object=v=>v && typeof v==='object' && !Array.isArray(v);
  const levels=object(raw.职业)?raw.职业:raw.职业详情?.classLevels || {};
  const stats=Object.fromEntries(Object.entries(ABILITY_TO_KEY).filter(([,v])=>v!=='none').map(([cn,key])=>[key,normalizeNumber(raw.属性?.[cn],10)]));
  const features={class:[],race:[],feats:[]}, inventory={weapons:[],equipment:[]};
  for (const [cn,key] of [['职业','class'],['种族','race'],['专长','feats']]) {
    for (const [name,item] of Object.entries(raw.特性?.[cn] || {})) features[key].push({name,details:typeof item==='string'?item:item.描述 || '',effects:normalizeEffects(item?.effects)});
  }
  const add=(name,item,group)=>{
    if (!object(item)) return;
    const category=item.类别 || group || (item.伤害公式?'武器':item.护甲类型?'护甲':'杂物');
    if (category==='武器') inventory.weapons.push(convertWeaponFromSchema(name,item));
    else inventory.equipment.push(normalizeEquipmentItem(convertEquipmentFromSchema(name,item,category==='护甲'?'armor':category==='奇物'?'wondrous':'misc')));
  };
  for (const [name,item] of Object.entries(raw.物品 || {})) {
    if (['武器','护甲','奇物','杂物'].includes(name) && object(item) && !item.类别 && !item.描述) {
      for (const [n,v] of Object.entries(item)) add(n,v,name);
    } else add(name,item);
  }
  return {
    stats,features,inventory,race:raw.种族 || '',
    class:typeof raw.职业==='string'?raw.职业:Object.keys(levels).join(' / '),
    level:Object.values(levels).reduce((n,v)=>n+Number(v || 0),0) || Number(raw.等级 || 1),
    proficiencyBonus:normalizeNumber(raw.熟练加值,2),
    maxHp:normalizeNumber(raw.生命值?.最大,1),currentHp:normalizeNumber(raw.生命值?.当前,0),
    speed:normalizeNumber(raw.速度?.步行,0),
    acMode:raw.护甲模式 || 'auto',overrides:{ac:raw.基础AC覆盖},
    useUnarmoredDefense:raw.无甲防御!==false,temporaryEffects:normalizeEffects(raw.临时效果)
  };
}

function evaluate(characterData, detailsOnly=false, selectedMode=characterData.acMode || 'auto') {
function hasFeature(featureName) {
    if (!characterData || !characterData.features) return false;
    const lowerCaseName = normalizeString(featureName, '').toLowerCase().trim();
    if (lowerCaseName === "") return false;
    
    const classFeatures = characterData.features.class || [];
    const raceFeatures = characterData.features.race || [];
    const featFeatures = characterData.features.feats || [];
    const allFeatures = [...classFeatures, ...raceFeatures, ...featFeatures];
    
    // 检查特性名称是否 *包含* 关键字 (例如, "专长: 警觉" 也能匹配 "警觉")
    const check = (feature) => {
        const sourceName = typeof feature === 'string' ? feature : feature?.name;
        return normalizeString(sourceName, '').toLowerCase().includes(lowerCaseName);
    };
    
    return allFeatures.some(check);
}

function getArmorBaseValue(item, fallback = 0) {
    if (!item) return fallback;
    const base=Number.isFinite(item.baseAcOverride)?item.baseAcOverride:(Number.isFinite(item.baseAc)?item.baseAc:fallback);
    const magic=item.requiresAttunement && !item.isAttuned ? 0 : normalizeNumber(item.magicBonus,0);
    return base + magic;
}

function formatAbilityPart(label, value) {
    if (!Number.isFinite(value) || value === 0) return '';
    return `${label}(${value})`;
}

function formatItemPart(item, value, fallbackLabel) {
    if (!item || !Number.isFinite(value) || value === 0) return '';
    const name = (item.name || fallbackLabel || '护甲').trim();
    return `${name}(${value})`;
}

function buildNormalArmorDescription({ armorItem, armorBase, dexValue, shieldItem, shieldBonus, defenseBonus }) {
    const parts = [];
    if (armorItem && Number.isFinite(armorBase)) {
        parts.push(`${(armorItem.name || '护甲').trim()}（${armorBase}）`);
    }
    if (shieldItem && Number.isFinite(shieldBonus) && shieldBonus !== 0) {
        parts.push(`${(shieldItem.name || '盾牌').trim()}（${shieldBonus}）`);
    }
    const dexPart = formatAbilityPart(ARMOR_ABILITY_LABELS.dex, dexValue);
    if (dexPart) parts.push(dexPart);
    if (defenseBonus) parts.push(`战斗风格：防御（${defenseBonus}）`);
    return parts.length ? parts.join(' + ') : '—';
}

function buildSpecialArmorDescription(sourceLabel, parts) {
    const formulaParts = parts.filter(part => part);
    const formula = formulaParts.join('+');
    return `${sourceLabel}：${formula || '—'}`;
}

function isDefenseArmorSource(name) {
    return /战斗风格\s*[:：]\s*防御|fighting\s*style\s*[:：]\s*defen[cs]e/i.test(String(name || ''));
}

function armorDefenseBonus(baseArmor) {
    if (!baseArmor) return 0;
    const sources = getEffectSourceContainers();
    const hasDefense = sources.some(source => isDefenseArmorSource(source.sourceName));
    if (!hasDefense) return 0;
    const tagged = collectActiveEffectEntries(['ac.bonus'])
        .some(entry => isDefenseArmorSource(entry.source?.sourceName));
    return tagged ? 0 : 1;
}

function armorEffectDescription(baseDescription, trace) {
    let text = baseDescription || '—';
    for (const step of trace) {
        let label = step.entry.source?.sourceName || step.entry.effect?.name || '护甲效果';
        if (isDefenseArmorSource(label)) label = '战斗风格：防御';
        else if (step.entry.source?.sourceType === 'temporary') label = step.entry.effect?.name || label;
        if (step.mode === 'add') {
            text += `${step.value < 0 ? ' − ' : ' + '}${label}（${Math.abs(step.value)}）`;
        } else {
            const operation = {multiply:'×',override:'设为',upgrade:'至少',downgrade:'至多'}[step.mode] || '';
            text += ` → ${label}（${operation}${step.value}）`;
        }
    }
    return text;
}

function calculateACDetails(mode = (characterData.acMode || 'auto')) {
    if (!characterData || !characterData.stats) return { value: 10, description: '—', usingArmor: false };
    mode = normalizeAcMode(mode, 'auto');
    
    const dexMod = getModifier(characterData.stats.dex);
    const conMod = getModifier(characterData.stats.con);
    const wisMod = getModifier(characterData.stats.wis);
    const useClassUnarmoredDefense = characterData.useUnarmoredDefense !== false;
    const isArmorLike = (item) => {
        if (!item || typeof item !== 'object') return false;
        if (item.type === 'armor' || item.category === 'armor') return true;
        return ['light', 'medium', 'heavy', 'shield', 'unarmoredEffect'].includes(item.armorType);
    };
    const isMageArmorEffectItem = (item) => {
        if (!item || typeof item !== 'object') return false;
        if (item.armorType === 'unarmoredEffect') return true;
        const nameText = String(item.name || '');
        const detailText = String(item.details || '');
        return /法师护甲|mage\s*armor/i.test(nameText)
            || /ac\s*变为|13\s*\+\s*敏捷|13\s*\+\s*dex/i.test(detailText);
    };
    const equippedItems = (characterData.inventory.equipment || []).filter(item => item.isEquipped && isArmorLike(item));
    
    const baseArmor = equippedItems.find(item => ['light', 'medium', 'heavy'].includes(item.armorType));
    const unarmoredEffect = equippedItems.find(item => isMageArmorEffectItem(item));
    const shield = equippedItems.find(item => item.armorType === 'shield');
    
    const shieldBonus = shield ? getArmorBaseValue(shield, 0) : 0;
    const armorBase = baseArmor ? getArmorBaseValue(baseArmor, 10) : null;
    const armorDex = baseArmor
        ? (baseArmor.armorType === 'light'
            ? Math.min(dexMod, normalizeNumber(baseArmor.dexCap,99))
            : baseArmor.armorType === 'medium'
                ? Math.min(dexMod, normalizeNumber(baseArmor.dexCap,2))
                : 0)
        : dexMod;
    const armorAc = baseArmor ? armorBase + armorDex : 10 + dexMod;
    const defenseBonus = armorDefenseBonus(baseArmor);

    const shieldPart = (allowShield) => allowShield ? formatItemPart(shield, shieldBonus, '盾牌') : '';
    const dexPart = formatAbilityPart(ARMOR_ABILITY_LABELS.dex, dexMod);
    const conPart = formatAbilityPart(ARMOR_ABILITY_LABELS.con, conMod);
    const wisPart = formatAbilityPart(ARMOR_ABILITY_LABELS.wis, wisMod);

    if (mode === 'armor') {
        if (baseArmor) {
            return {
                value: armorAc + shieldBonus + defenseBonus,
                description: buildNormalArmorDescription({
                    armorItem: baseArmor,
                    armorBase,
                    dexValue: armorDex,
                    shieldItem: shield,
                    shieldBonus,
                    defenseBonus
                }),
                usingArmor: true
            };
        }
        return {
            value: 10 + dexMod + shieldBonus,
            description: buildSpecialArmorDescription('无甲', ['10', dexPart, shieldPart(true)]),
            usingArmor: false
        };
    }

    if (mode === 'monk') {
        const monkBase = 10 + dexMod + wisMod;
        return {
            value: monkBase,
            description: buildSpecialArmorDescription('无甲防御', ['10', dexPart, wisPart]),
            usingArmor: false
        };
    }
    if (mode === 'barbarian') {
        const barbBase = 10 + dexMod + conMod;
        return {
            value: barbBase + shieldBonus,
            description: buildSpecialArmorDescription('无甲防御', ['10', dexPart, conPart, shieldPart(true)]),
            usingArmor: false
        };
    }
    if (mode === 'mage-armor') {
        const effectBase = unarmoredEffect ? getArmorBaseValue(unarmoredEffect, 13) : 13;
        const effectLabel = (unarmoredEffect?.name || '法师护甲').trim();
        return {
            value: effectBase + dexMod + shieldBonus,
            description: buildSpecialArmorDescription(effectLabel, [String(effectBase), dexPart, shieldPart(true)]),
            usingArmor: false
        };
    }

    const buildUnarmoredOptions = () => {
        const options = [
            {
                value: 10 + dexMod + shieldBonus,
                description: buildSpecialArmorDescription('无甲', ['10', dexPart, shieldPart(true)]),
                allowShield: true
            }
        ];
        if (characterData.race === '鲨华鱼人') options.push({value:12+dexMod+shieldBonus,description:buildSpecialArmorDescription('天生护甲',['12',dexPart,shieldPart(true)]),allowShield:true});
        if (unarmoredEffect) {
            const effectBase = getArmorBaseValue(unarmoredEffect, 13);
            const effectLabel = (unarmoredEffect.name || '法师护甲').trim();
            options.push({
                value: effectBase + dexMod + shieldBonus,
                description: buildSpecialArmorDescription(effectLabel, [String(effectBase), dexPart, shieldPart(true)]),
                allowShield: true
            });
        }
        const hasUnarmoredDefense = useClassUnarmoredDefense && hasFeature("无甲防御");
        if (hasUnarmoredDefense) {
            const isBarbarian = (characterData.class || '').toLowerCase().includes('野蛮人');
            if (isBarbarian) {
                options.push({
                    value: 10 + dexMod + conMod + shieldBonus,
                    description: buildSpecialArmorDescription('无甲防御', ['10', dexPart, conPart, shieldPart(true)]),
                    allowShield: true
                });
            }
            const isMonk = (characterData.class || '').toLowerCase().includes('武僧');
            if (isMonk && !shield) {
                options.push({
                    value: 10 + dexMod + wisMod,
                    description: buildSpecialArmorDescription('无甲防御', ['10', dexPart, wisPart]),
                    allowShield: false
                });
            }
        }
        return options;
    };

    if (mode === 'unarmored') {
        const options = buildUnarmoredOptions();
        const best = options.reduce((acc, cur) => cur.value > acc.value ? cur : acc, options[0]);
        return { value: best.value, description: best.description, usingArmor: false };
    }

    if (baseArmor) {
        return {
            value: armorAc + shieldBonus + defenseBonus,
            description: buildNormalArmorDescription({
                armorItem: baseArmor,
                armorBase,
                dexValue: armorDex,
                shieldItem: shield,
                shieldBonus,
                defenseBonus
            }),
            usingArmor: true
        };
    }

    const autoOptions = buildUnarmoredOptions();
    const bestAuto = autoOptions.reduce((acc, cur) => cur.value > acc.value ? cur : acc, autoOptions[0]);
    return { value: bestAuto.value, description: bestAuto.description, usingArmor: false };
}

function calculateAC(mode = (characterData.acMode || 'auto')) {
    return calculateACDetails(mode).value;
}

function buildEffectVariableMap(context = {}) {
    const stats = characterData?.stats || {};
    const profile = {
        prof: normalizeNumber(characterData?.proficiencyBonus, 0),
        level: normalizeNumber(characterData?.level, 1),
        str: normalizeNumber(stats.str, 10),
        dex: normalizeNumber(stats.dex, 10),
        con: normalizeNumber(stats.con, 10),
        int: normalizeNumber(stats.int, 10),
        wis: normalizeNumber(stats.wis, 10),
        cha: normalizeNumber(stats.cha, 10)
    };
    const modProfile = {
        strmod: getModifier(profile.str),
        dexmod: getModifier(profile.dex),
        conmod: getModifier(profile.con),
        intmod: getModifier(profile.int),
        wismod: getModifier(profile.wis),
        chamod: getModifier(profile.cha)
    };
    const all = {
        ...profile,
        ...modProfile,
        pb: profile.prof,
        ac: characterData.acMode === 'custom' ? normalizeNumber(characterData.overrides?.ac, 10) : calculateAC(characterData.acMode),
        speed: normalizeNumber(characterData?.speed, 0),
        hpmax: normalizeNumber(characterData?.maxHp, 1),
        hpcurrent: normalizeNumber(characterData?.currentHp, 0),
        str_mod: modProfile.strmod,
        dex_mod: modProfile.dexmod,
        con_mod: modProfile.conmod,
        int_mod: modProfile.intmod,
        wis_mod: modProfile.wismod,
        cha_mod: modProfile.chamod
    };
    const weapon = context.weapon;
    if (weapon && typeof weapon === 'object') {
        all.weaponmagic = normalizeNumber(weapon.magicBonus, 0);
    }
    return all;
}

function evaluateEffectNumber(rawValue, context = {}) {
    if (Number.isFinite(rawValue)) return Number(rawValue);
    if (typeof rawValue !== 'string') return 0;
    const text = rawValue.trim();
    if (!text) return 0;
    if (/^[+-]?\d+(\.\d+)?$/.test(text)) return Number(text);
    const vars = buildEffectVariableMap(context);
    const expr = text.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, token) => {
        const key = String(token || '').toLowerCase();
        if (!Number.isFinite(vars[key])) throw new Error('效果公式变量不可用：@'+key);
        return '('+vars[key]+')';
    });
    if (!/^[\d+\-*/().\s]+$/.test(expr)) return 0;
    try {
        const value = Function(`"use strict"; return (${expr});`)();
        if (!Number.isFinite(value)) throw new Error('效果公式结果无效：'+text);
        return value;
    } catch (_) {
        throw new Error('无法计算效果公式：'+text);
    }
}

function getEffectSourceContainers() {
    const containers = [];
    containers.push({
        sourceType: 'temporary',
        sourceName: '临时效果',
        sourceObj: characterData,
        effects: getCombinedSourceEffects({ effects: characterData?.temporaryEffects || [] })
    });
    (characterData?.inventory?.weapons || []).forEach((item, index) => {
        containers.push({
            sourceType: 'weapon',
            sourceName: normalizeString(item?.name, `武器 ${index + 1}`),
            sourceObj: item,
            sourceIndex: index,
            effects: getCombinedSourceEffects(item)
        });
    });
    (characterData?.inventory?.equipment || []).forEach((item, index) => {
        containers.push({
            sourceType: 'equipment',
            sourceName: normalizeString(item?.name, `装备 ${index + 1}`),
            sourceObj: item,
            sourceIndex: index,
            effects: getCombinedSourceEffects(item)
        });
    });
    (characterData?.features?.class || []).forEach((item, index) => {
        containers.push({
            sourceType: 'feature-class',
            sourceName: normalizeString(item?.name, `职业特性 ${index + 1}`),
            sourceObj: item,
            sourceIndex: index,
            effects: getCombinedSourceEffects(item)
        });
    });
    (characterData?.features?.race || []).forEach((item, index) => {
        containers.push({
            sourceType: 'feature-race',
            sourceName: normalizeString(item?.name, `种族特性 ${index + 1}`),
            sourceObj: item,
            sourceIndex: index,
            effects: getCombinedSourceEffects(item)
        });
    });
    (characterData?.features?.feats || []).forEach((item, index) => {
        containers.push({
            sourceType: 'feature-feats',
            sourceName: normalizeString(item?.name, `专长 ${index + 1}`),
            sourceObj: item,
            sourceIndex: index,
            effects: getCombinedSourceEffects(item)
        });
    });
    return containers;
}

function doesEffectSelectorMatch(selector = {}, context = {}, sourceMeta = {}) {
    if (!selector || typeof selector !== 'object') return true;
    const sourceType = String(sourceMeta.sourceType || '').toLowerCase();
    const sourceName = normalizeString(sourceMeta.sourceName, '');
    if (selector.sourceType && selector.sourceType !== sourceType) return false;
    if (selector.sourceNameIncludes) {
        if (!sourceName.toLowerCase().includes(String(selector.sourceNameIncludes).toLowerCase())) return false;
    }
    const weapon = context.weapon;
    if (selector.weaponNameIncludes) {
        if (!weapon) return false;
        const weaponName = normalizeString(weapon.name, '').toLowerCase();
        if (!weaponName.includes(String(selector.weaponNameIncludes).toLowerCase())) return false;
    }
    if (selector.weaponTypeIncludes) {
        if (!weapon) return false;
        const weaponType = normalizeString(weapon.type, '').toLowerCase();
        if (!weaponType.includes(String(selector.weaponTypeIncludes).toLowerCase())) return false;
    }
    if (selector.weaponTagIncludes) {
        if (!weapon) return false;
        const tagText = `${normalizeString(weapon.tags, '')} ${normalizeString(weapon.details, '')}`.toLowerCase();
        if (!tagText.includes(String(selector.weaponTagIncludes).toLowerCase())) return false;
    }
    if (selector.requiresEquipped === true) {
        const equipped = sourceMeta.sourceObj?.isEquipped === true;
        if (!equipped) return false;
    }
    return true;
}

function collectActiveEffectEntries(targetKeys, context = {}) {
    const keyList = Array.isArray(targetKeys) ? targetKeys : [targetKeys];
    const normalizedTargets = keyList.map(key => normalizeEffectTarget(key)).filter(Boolean);
    if (normalizedTargets.length === 0) return [];
    const entries = [];
    let order = 0;
    getEffectSourceContainers().forEach(source => {
        const sourceType = String(source?.sourceType || '').toLowerCase();
        if (['weapon','equipment'].includes(sourceType)) {
            if (source.sourceObj?.isEquipped !== true) return;
            if (source.sourceObj?.requiresAttunement === true && source.sourceObj?.isAttuned !== true) return;
        }
        const effects = normalizeEffects(source.effects);
        effects.forEach(effect => {
            if (effect.enabled === false) return;
            if (effect.requiresEquipped === true && source.sourceObj?.isEquipped !== true) return;
            effect.changes.forEach(change => {
                if (!change || change.enabled === false) return;
                if (!normalizedTargets.includes(change.target)) return;
                // Weapon-owned weapon.* effects only apply to the currently evaluated weapon.
                if (sourceType === 'weapon' && String(change.target || '').startsWith('weapon.')) {
                    if (!context.weapon || source.sourceObj !== context.weapon) return;
                }
                if (!doesEffectSelectorMatch(change.selector, context, source)) return;
                entries.push({
                    source,
                    effect,
                    change,
                    order: order++
                });
            });
        });
    });
    return entries;
}

function compareEffectEntryOrder(a, b) {
    const effectPriorityA = normalizeNumber(a.effect?.priority, 0);
    const effectPriorityB = normalizeNumber(b.effect?.priority, 0);
    if (effectPriorityA !== effectPriorityB) return effectPriorityA - effectPriorityB;
    const changePriorityA = normalizeNumber(a.change?.priority, 0);
    const changePriorityB = normalizeNumber(b.change?.priority, 0);
    if (changePriorityA !== changePriorityB) return changePriorityA - changePriorityB;
    return normalizeNumber(a.order, 0) - normalizeNumber(b.order, 0);
}

function reduceStackedEffectEntries(entries, context = {}) {
    const sorted = [...entries].sort(compareEffectEntryOrder);
    const stackBuckets = new Map();
    const passthrough = [];
    sorted.forEach(entry => {
        const stackKey = normalizeString(entry.effect?.stackKey, '').trim();
        const stackRule = normalizeEffectStackRule(entry.effect?.stackRule);
        if (!stackKey || stackRule === 'stack') {
            passthrough.push(entry);
            return;
        }
        const mode = normalizeEffectMode(entry.change?.mode);
        const bucketKey = `${stackKey}::${mode}::${entry.change?.target}`;
        if (!stackBuckets.has(bucketKey)) {
            stackBuckets.set(bucketKey, { rule: stackRule, entries: [] });
        }
        stackBuckets.get(bucketKey).entries.push(entry);
    });

    stackBuckets.forEach(bucket => {
        const { rule, entries: group } = bucket;
        if (!group.length) return;
        if (rule === 'replace') {
            passthrough.push(group[group.length - 1]);
            return;
        }
        if (rule === 'highest' || rule === 'lowest') {
            const ranked = group.map(entry => ({
                entry,
                value: evaluateEffectNumber(entry.change?.value, context)
            }));
            ranked.sort((a, b) => (rule === 'highest' ? b.value - a.value : a.value - b.value));
            passthrough.push(ranked[0].entry);
            return;
        }
        passthrough.push(...group);
    });

    return passthrough.sort(compareEffectEntryOrder);
}

function applyNumericEffects(baseValue, targetKeys, context = {}, trace = null) {
    const base = Number.isFinite(baseValue) ? Number(baseValue) : 0;
    const rawEntries = collectActiveEffectEntries(targetKeys, context);
    if (!rawEntries.length) return base;
    const entries = reduceStackedEffectEntries(rawEntries, context);
    let value = base;
    entries.forEach(entry => {
        const mode = normalizeEffectMode(entry.change?.mode);
        const next = evaluateEffectNumber(entry.change?.value, context);
        if (!Number.isFinite(next)) throw new Error('效果公式没有得到有限数值');
        const previous = value;
        if (mode === 'add') value += next;
        else if (mode === 'multiply') value *= next;
        else if (mode === 'override') value = next;
        else if (mode === 'upgrade') value = Math.max(value, next);
        else if (mode === 'downgrade') value = Math.min(value, next);
        if (Array.isArray(trace) && value !== previous) trace.push({entry,mode,value:next,before:previous,after:value});
    });
    return Number.isFinite(value) ? value : base;
}
  const mode=selectedMode;
  if (!['auto','custom','armor','unarmored','monk','barbarian','mage-armor'].includes(mode)) throw new Error('护甲模式无效：'+mode);
  if (mode==='custom' && !Number.isFinite(characterData.overrides?.ac)) throw new Error('手动模式必须填写基础AC覆盖');
  const base=mode==='custom'?{value:characterData.overrides.ac,description:`手动基础AC：${characterData.overrides.ac}`} : calculateACDetails(mode);
  if (detailsOnly) return base;
  const trace=[];
  const total=Math.floor(applyNumericEffects(base.value,['ac.bonus'],{},trace));
  return {base:base.value,total,description:armorEffectDescription(base.description,trace)};
}

function syncCharacter(raw) {
  // Do not fabricate combat statistics for a prose-only archive.
  if (!['属性','物品','护甲模式','基础AC覆盖','护甲等级'].some(key=>Object.hasOwn(raw,key))) return raw;
  raw.护甲模式 ||= 'auto';
  if (raw.护甲模式!=='custom') delete raw.基础AC覆盖;
  const result=evaluate(fromSchema(raw));
  raw.护甲等级=result.base;
  raw._有效AC=result.total;
  raw.护甲说明=result.description;
  return raw;
}
function syncRoot(root) {
  for (const c of Object.values(root?.角色列表 || {})) if (c && typeof c==='object' && !Array.isArray(c)) syncCharacter(c);
  return root;
}
return {fromSchema,syncCharacter,syncRoot,calculate:character=>evaluate(character),details:(character,mode)=>evaluate(character,true,mode)};
})();

export const Schema = z.object({当前角色ID:z.any().optional(),角色列表:z.any().optional()}).passthrough().transform((data,ctx)=>{
  const migrated=JSON.parse(JSON.stringify(data));
  try { normalizeDndRootEffects(migrated); DndArmor.syncRoot(migrated); }
  catch(error) { ctx.addIssue({code:'custom',message:error.message}); return z.NEVER; }
  return migrated;
});
$(() => { registerMvuSchema(Schema); });
