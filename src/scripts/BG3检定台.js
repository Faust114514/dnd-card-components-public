/* D&D 2024 BG3 风格 3D 检定台与全队 Buff 识别引擎 (v1) */
(() => {
  const host = (typeof window !== 'undefined' && window.top && window.top !== window)
    ? (() => { try { void window.top.document; return window.top; } catch { return window; } })()
    : (typeof window !== 'undefined' ? window : globalThis);
  host.__dndBg3Check?.dispose?.();
  const doc = host.document;

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const SKILL_MAP = {
    '运动': { ability: '力量', key: '运动', aliases: ['运动', 'Athletics'] },
    '特技': { ability: '敏捷', key: '特技', aliases: ['特技', '体操', 'Acrobatics'] },
    '巧手': { ability: '敏捷', key: '巧手', aliases: ['巧手', 'Sleight of Hand'] },
    '隐匿': { ability: '敏捷', key: '隐匿', aliases: ['隐匿', '潜行', 'Stealth'] },
    '奥秘': { ability: '智力', key: '奥秘', aliases: ['奥秘', '奥术', 'Arcana'] },
    '历史': { ability: '智力', key: '历史', aliases: ['历史', 'History'] },
    '调查': { ability: '智力', key: '调查', aliases: ['调查', 'Investigation'] },
    '自然': { ability: '智力', key: '自然', aliases: ['自然', 'Nature'] },
    '宗教': { ability: '智力', key: '宗教', aliases: ['宗教', 'Religion'] },
    '驯兽': { ability: '感知', key: '驯兽', aliases: ['驯兽', '动物驯养', 'Animal Handling'] },
    '洞察': { ability: '感知', key: '洞悉', aliases: ['洞察', '洞悉', 'Insight'] },
    '医药': { ability: '感知', key: '医药', aliases: ['医药', '医疗', 'Medicine'] },
    '察觉': { ability: '感知', key: '察觉', aliases: ['察觉', '感知检定', 'Perception'] },
    '求生': { ability: '感知', key: '求生', aliases: ['求生', '生存', 'Survival'] },
    '欺瞒': { ability: '魅力', key: '欺瞒', aliases: ['欺瞒', '欺骗', 'Deception'] },
    '威吓': { ability: '魅力', key: '威吓', aliases: ['威吓', '恐吓', 'Intimidation'] },
    '表演': { ability: '魅力', key: '表演', aliases: ['表演', 'Performance'] },
    '游说': { ability: '魅力', key: '游说', aliases: ['游说', '说服', 'Persuasion'] },
  };
  const ABILITIES = ['力量', '敏捷', '体质', '智力', '感知', '魅力'];
  const AB_EN = { '力量': 'str', '敏捷': 'dex', '体质': 'con', '智力': 'int', '感知': 'wis', '魅力': 'cha' };
  const PRIMAL_KNOWLEDGE_SKILLS = new Set(['特技', '威吓', '察觉', '隐匿', '求生']);

  function csprngInt(sides) {
    if (host.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / sides) * sides;
      let v = 0;
      do { host.crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
      return (v % sides) + 1;
    }
    return Math.floor(Math.random() * sides) + 1;
  }

  function resolveSkillInfo(rawSkill) {
    const s = String(rawSkill || '').trim();
    const isSave = /豁免|Save/i.test(s);
    const cleaned = s.replace(/豁免|检定|Save|Check/gi, '').trim();
    if (isSave) {
      const ab = ABILITIES.find((a) => cleaned.includes(a)) || '敏捷';
      return { name: ab + '豁免', canon: ab, ability: ab, isSave: true, isRawAbility: false };
    }
    for (const [canon, info] of Object.entries(SKILL_MAP)) {
      if (info.aliases.some((al) => cleaned.toLowerCase() === al.toLowerCase() || cleaned.includes(al))) {
        return { name: canon, canon, ability: info.ability, isSave: false, isRawAbility: false };
      }
    }
    const rawAb = ABILITIES.find((a) => cleaned.includes(a));
    if (rawAb) {
      return { name: rawAb + '检定', canon: rawAb, ability: rawAb, isSave: false, isRawAbility: true };
    }
    return { name: s || '属性检定', canon: s || '通用', ability: '敏捷', isSave: false, isRawAbility: true };
  }

  function getClassLevel(actor, re) {
    if (!actor) return 0;
    const map = actor.classLevels || {};
    let best = 0;
    for (const [k, lv] of Object.entries(map)) {
      if (re.test(k)) best = Math.max(best, Number(lv) || 0);
    }
    if (best > 0) return best;
    return re.test(actor.cls || '') ? (actor.level || 1) : 0;
  }

  function isItemActive(it) {
    if (!it || typeof it !== 'object') return false;
    const equipped = it['已装备'] ?? it.isEquipped;
    if (!equipped) return false;
    const reqAtt = Boolean(it['需要同调'] ?? it.requiresAttunement);
    const isAtt = Boolean(it['已同调'] ?? it.isAttuned);
    if (reqAtt && !isAtt) return false;
    return true;
  }

  function collectActiveItems(c) {
    const items = [];
    const rawItems = c?.['物品'];
    if (rawItems && typeof rawItems === 'object' && !Array.isArray(rawItems)) {
      const buckets = ['武器', '护甲', '奇物', '杂物'];
      const hasBuckets = buckets.some((b) => rawItems[b] && typeof rawItems[b] === 'object' && !Array.isArray(rawItems[b]));
      if (hasBuckets) {
        for (const b of buckets) {
          for (const [n, v] of Object.entries(rawItems[b] || {})) {
            if (n !== '$meta' && isItemActive(v)) items.push([n, v]);
          }
        }
      } else {
        for (const [n, v] of Object.entries(rawItems)) {
          if (n !== '$meta' && isItemActive(v)) items.push([n, v]);
        }
      }
    }
    return items;
  }

  function evalFormulaNum(val, baseAttrs, pb, level) {
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
    let s = String(val ?? '').trim();
    if (!s) return 0;
    if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);
    const mod = (ab) => Math.floor(((baseAttrs[ab] ?? 10) - 10) / 2);
    const vars = {
      pb, prof: pb, level,
      str: baseAttrs['力量'] ?? 10, dex: baseAttrs['敏捷'] ?? 10, con: baseAttrs['体质'] ?? 10,
      int: baseAttrs['智力'] ?? 10, wis: baseAttrs['感知'] ?? 10, cha: baseAttrs['魅力'] ?? 10,
      strmod: mod('力量'), dexmod: mod('敏捷'), conmod: mod('体质'),
      intmod: mod('智力'), wismod: mod('感知'), chamod: mod('魅力'),
      str_mod: mod('力量'), dex_mod: mod('敏捷'), con_mod: mod('体质'),
      int_mod: mod('智力'), wis_mod: mod('感知'), cha_mod: mod('魅力'),
    };
    s = s.replace(/@([a-z_]+)/gi, (_, k) => String(vars[k.toLowerCase()] ?? 0));
    if (!/^[0-9+\-*/().\s]+$/.test(s)) return 0;
    try {
      const r = Function('"use strict";return (' + s + ')')();
      return Number.isFinite(r) ? Math.trunc(r) : 0;
    } catch {
      return 0;
    }
  }

  function collectActiveEffectGroups(c) {
    const groups = [];
    const pushArr = (arr, fallbackName) => {
      if (!Array.isArray(arr)) return;
      for (const g of arr) {
        if (!g || typeof g !== 'object' || g.enabled === false || !Array.isArray(g.changes)) continue;
        groups.push({ name: g.name || fallbackName, changes: g.changes });
      }
    };
    for (const [itemName, item] of collectActiveItems(c)) {
      pushArr(item.effects, itemName);
    }
    for (const bucket of ['职业', '种族', '专长']) {
      const entries = c?.['特性']?.[bucket];
      if (!entries || typeof entries !== 'object') continue;
      for (const [fName, fVal] of Object.entries(entries)) {
        if (fName !== '$meta' && fVal && typeof fVal === 'object') pushArr(fVal.effects, fName);
      }
    }
    pushArr(c?.['临时效果'], '临时效果');
    return groups;
  }

  function collectShortTags(c) {
    const tags = [];
    const norm = (raw) => Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(/[,，;；]+/) : []);
    for (const [n, it] of collectActiveItems(c)) {
      for (const t of norm(it['效果标签'] ?? it.fvttTags ?? it.effectTags)) {
        if (String(t || '').trim()) tags.push({ src: n, tag: String(t).trim() });
      }
    }
    for (const bucket of ['职业', '种族', '专长']) {
      for (const [n, f] of Object.entries(c?.['特性']?.[bucket] || {})) {
        if (n === '$meta' || !f || typeof f !== 'object') continue;
        for (const t of norm(f['效果标签'] ?? f.fvttTags ?? f.effectTags)) {
          if (String(t || '').trim()) tags.push({ src: n, tag: String(t).trim() });
        }
      }
    }
    const te = c?.['临时效应'] ?? c?.['临时增益'];
    if (te && typeof te === 'object' && !Array.isArray(te)) {
      for (const [n, v] of Object.entries(te)) {
        if (n === '$meta' || !v || v.enabled === false) continue;
        for (const t of norm(v['效果'] ?? v.tags ?? v)) {
          if (String(t || '').trim()) tags.push({ src: n, tag: String(t).trim() });
        }
      }
    } else if (Array.isArray(te)) {
      for (const v of te) {
        if (!v || v.enabled === false) continue;
        for (const t of norm(v['效果'] ?? v.tags)) {
          if (String(t || '').trim()) tags.push({ src: v.name || '临时效应', tag: String(t).trim() });
        }
      }
    }
    return tags;
  }

  async function readMvuParty() {
    try {
      const getVars = host.TavernHelper?.getVariables || globalThis.TavernHelper?.getVariables;
      const ctx = host.SillyTavern?.getContext?.();
      let rawVars = null;
      let sd = null;
      const pickRoster = (v) => {
        const s = v?.stat_data || v;
        if (s && typeof s === 'object' && (s['角色列表'] || s['角色'] || s.characters || s.party)) {
          rawVars = v;
          return s;
        }
        return null;
      };
      if (typeof getVars === 'function') {
        try { sd = pickRoster(await getVars({ type: 'message' })); } catch {}
      }
      if (!sd && Array.isArray(ctx?.chat)) {
        for (let i = ctx.chat.length - 1; i >= 0; i--) {
          const m = ctx.chat[i];
          const sw = Number.isInteger(m?.swipe_id) ? m.swipe_id : 0;
          const mv = Array.isArray(m?.variables) ? (m.variables[sw] || m.variables[0]) : m?.variables;
          sd = pickRoster(mv);
          if (sd) break;
        }
      }
      if (!sd && typeof getVars === 'function') {
        try { sd = pickRoster(await getVars({ type: 'chat' })); } catch {}
      }
      if (!sd) {
        sd = pickRoster(ctx?.chatMetadata?.variables) || {};
      }

      const uiMap = rawVars?.mvu_lite_ui || {};
      const charsObj = sd['角色列表'] || sd['角色'] || sd.characters || sd.party || {};
      const list = [];
      for (const [key, c] of Object.entries(charsObj)) {
        if (!c || typeof c !== 'object' || key === '$meta') continue;
        if (!c['属性'] && !c['职业'] && !c['熟练配置'] && !c.stats && !c.attributes) continue;
        const name = String(c['姓名'] || c.name || key);
        const classLevels = {};
        let cls = '';
        let inferredLevel = 0;
        if (c['职业'] && typeof c['职业'] === 'object' && !Array.isArray(c['职业'])) {
          const entries = Object.entries(c['职业']).filter(([k]) => k !== '$meta');
          for (const [k, v] of entries) classLevels[k] = Number(v) || 1;
          cls = entries.map(([k, v]) => (entries.length > 1 && Number(v) > 0 ? (k + v) : k)).join('/');
          inferredLevel = entries.reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
        } else {
          cls = String(c['职业'] || c.class || '');
          for (const part of cls.split(/[/、,，]+/)) {
            const m = part.trim().match(/^([^\d\s]+)\s*(\d+)?$/);
            if (m) {
              const lv = m[2] ? Number(m[2]) : 0;
              classLevels[m[1]] = lv;
              inferredLevel += lv;
            }
          }
        }
        const species = String(c['种族'] || c.species || c.race || '');
        const level = Number(c['等级'] ?? c.level ?? (inferredLevel || 1)) || 1;
        for (const k of Object.keys(classLevels)) {
          if (!classLevels[k]) classLevels[k] = level;
        }
        const profBonus = Number(c['熟练加值'] ?? c.proficiencyBonus) || (Math.floor((level - 1) / 4) + 2);
        const attrs = c['属性'] || c.attributes || c.stats || {};
        const baseAttrs = {};
        for (const a of ABILITIES) {
          const val = Number(attrs[a] ?? 10);
          baseAttrs[a] = Number.isFinite(val) ? val : 10;
        }
        const normAttrs = { ...baseAttrs };
        const effectGroups = collectActiveEffectGroups(c);
        const shortTags = collectShortTags(c);
        for (const g of effectGroups) {
          for (const ch of g.changes) {
            if (!ch || ch.enabled === false) continue;
            const m = String(ch.target || '').match(/^stat\.(str|dex|con|int|wis|cha)$/i);
            if (!m) continue;
            const abZh = ABILITIES.find((a) => AB_EN[a] === m[1].toLowerCase());
            if (!abZh) continue;
            const v = evalFormulaNum(ch.value, baseAttrs, profBonus, level);
            if (ch.mode === 'add') normAttrs[abZh] += v;
            else if (ch.mode === 'upgrade') normAttrs[abZh] = Math.max(normAttrs[abZh], v);
            else if (ch.mode === 'downgrade') normAttrs[abZh] = Math.min(normAttrs[abZh], v);
            else if (ch.mode === 'override') normAttrs[abZh] = v;
          }
        }
        for (const { tag } of shortTags) {
          const eqM = tag.match(/^(力量|敏捷|体质|智力|感知|魅力)\s*=\s*(\d{1,2})$/);
          if (eqM) normAttrs[eqM[1]] = Math.max(normAttrs[eqM[1]], Number(eqM[2]));
        }

        const blobText = JSON.stringify(c);
        const profCfg = c['熟练配置'] || c['熟练'] || c.proficiencies || {};
        const skillProfs = [];
        const expertProfs = [];
        const halfProfs = [];
        const rawSkills = profCfg['技能'] || c['熟练技能'];
        if (Array.isArray(rawSkills)) {
          skillProfs.push(...rawSkills);
        } else if (rawSkills && typeof rawSkills === 'object') {
          for (const [sk, lv] of Object.entries(rawSkills)) {
            if (sk === '$meta') continue;
            if (lv === '专精' || lv === 2 || lv === '2') expertProfs.push(sk);
            else if (lv === '熟练' || lv === 1 || lv === '1' || lv === true) skillProfs.push(sk);
            else if (lv === '半熟练' || lv === 0.5 || lv === '0.5') halfProfs.push(sk);
          }
        }
        if (Array.isArray(profCfg['专精'])) expertProfs.push(...profCfg['专精']);
        if (Array.isArray(c['专精技能'])) expertProfs.push(...c['专精技能']);

        const saveProfs = [];
        const rawSaves = profCfg['豁免'] || c['豁免熟练'];
        if (Array.isArray(rawSaves)) {
          saveProfs.push(...rawSaves);
        } else if (rawSaves && typeof rawSaves === 'object') {
          for (const [ab, ok] of Object.entries(rawSaves)) {
            if (ab !== '$meta' && ok) saveProfs.push(ab);
          }
        }

        const heroic = Boolean(c['英雄激励'] || c['激励'] || c.heroicInspiration || c.inspiration);
        const tagSummary = String(c['生效装备效果'] || '');
        const legacyPortrait = String(c['头像'] || uiMap?.[key]?.['头像'] || uiMap?.[name]?.['头像'] || '');
        list.push({
          id: key, name, cls, classLevels, species, level,
          baseAttrs, attrs: normAttrs, profBonus,
          skillProfs, expertProfs, halfProfs, saveProfs,
          heroic, tagSummary, effectGroups, shortTags,
          activeItems: collectActiveItems(c),
          extraBonuses: c['额外加值'] || {},
          legacyPortrait, blobText, raw: c
        });
      }
      return list;
    } catch {
      return [];
    }
  }

  function hasSkillMatch(arr, skillInfo) {
    if (!Array.isArray(arr)) return false;
    const aliases = SKILL_MAP[skillInfo.canon]?.aliases || [skillInfo.canon];
    return arr.some((item) => {
      const t = String(item || '').trim();
      return aliases.some((al) => t === al || t.includes(al));
    });
  }

  function parseNamedBonusString(raw) {
    const out = [];
    for (const part of String(raw || '').split(/[,，、;；]+/)) {
      const s = part.trim();
      if (!s || s === '0') continue;
      if (/^[+-]?\d+$/.test(s)) {
        const v = Number(s);
        if (v) out.push({ label: '额外', val: v });
        continue;
      }
      const m = s.match(/^(.*?)([+-]\d+)\s*$/);
      if (m && Number(m[2])) {
        out.push({ label: m[1].trim() || '额外', val: Number(m[2]) });
      }
    }
    return out;
  }

  function parseEquippedTagEffects(actor, skillInfo) {
    const out = { flat: 0, flatParts: [], advNotes: [] };
    if (!actor) return out;
    const aliases = SKILL_MAP[skillInfo.canon]?.aliases || [skillInfo.canon];
    const abEn = AB_EN[skillInfo.ability] || 'dex';
    const seen = new Set();
    const addFlat = (label, v) => {
      if (!v) return;
      const k = label + ':' + v;
      if (seen.has(k)) return;
      seen.add(k);
      out.flat += v;
      out.flatParts.push(label + '(' + (v >= 0 ? '+' : '') + v + ')');
    };

    // 1. Canonical structured effects (DndArmor compatible)
    for (const g of (actor.effectGroups || [])) {
      for (const ch of g.changes) {
        if (!ch || ch.enabled === false || ch.mode !== 'add') continue;
        const tgt = String(ch.target || '').trim();
        const v = evalFormulaNum(ch.value, actor.baseAttrs || actor.attrs, actor.profBonus, actor.level);
        if (!v) continue;
        if (skillInfo.isSave && (tgt === 'save.all' || tgt === 'save.' + abEn)) {
          addFlat(g.name, v);
        } else if (!skillInfo.isSave && (tgt === 'skill.all' || aliases.some((al) => tgt === 'skill.' + al))) {
          addFlat(g.name, v);
        }
      }
    }

    // Attuned Stone of Good Luck (幸运石) if not already in effects
    const luckstone = (actor.activeItems || []).find(([n, it]) => /幸运石|Stone of Good Luck|Luckstone/i.test(n) && Boolean(it['已同调'] ?? it.isAttuned));
    if (luckstone && !Array.isArray(luckstone[1]?.effects)) {
      addFlat('幸运石', 1);
    }

    // 2. Named extra bonuses (额外加值.全豁免)
    if (skillInfo.isSave && actor.extraBonuses?.['全豁免']) {
      for (const it of parseNamedBonusString(actor.extraBonuses['全豁免'])) {
        addFlat(it.label, it.val);
      }
    }

    // 3. Short FVTT tags (效果标签 / 临时效应)
    for (const { src, tag } of (actor.shortTags || [])) {
      if (/^优势[：:](.+)$/.test(tag)) {
        const val = RegExp.$1.trim();
        if ((skillInfo.isSave && (val.includes(skillInfo.ability + '豁免') || val.includes('全豁免')))
          || (!skillInfo.isSave && (val.includes('全技能') || aliases.some((al) => val.includes(al))))) {
          out.advNotes.push(src + '·' + tag);
        }
        continue;
      }
      const addM = tag.match(/^(.+?)([+-]\d+)$/);
      if (addM) {
        const tgt = addM[1].trim();
        const v = Number(addM[2]);
        if (skillInfo.isSave && (tgt === '全豁免' || tgt === skillInfo.ability + '豁免')) addFlat(src, v);
        else if (!skillInfo.isSave && (tgt === '全技能' || aliases.some((al) => tgt === al))) addFlat(src, v);
      }
    }

    // 4. Legacy summary string (生效装备效果)
    const text = String(actor.tagSummary || '');
    if (text) {
      const tokens = text.split(/[;；,，、|｜\n]+/).map((s) => s.trim()).filter(Boolean);
      for (const tok of tokens) {
        if (skillInfo.isSave) {
          const allSaveM = tok.match(/(?:全豁免|所有豁免|豁免)\s*([+-]\d+)/);
          if (allSaveM && !ABILITIES.some((a) => tok.includes(a + '豁免'))) {
            addFlat('装备', Number(allSaveM[1]));
          }
          const abSaveM = tok.match(new RegExp(skillInfo.ability + '豁免\\s*([+-]\\d+)'));
          if (abSaveM) addFlat('装备', Number(abSaveM[1]));
          if ((tok.includes(skillInfo.ability + '豁免') || tok.includes('全豁免')) && tok.includes('优势')) {
            out.advNotes.push(tok);
          }
        } else {
          const allSkillM = tok.match(/(?:全技能|所有技能|全检定)\s*([+-]\d+)/);
          if (allSkillM) addFlat('装备', Number(allSkillM[1]));
          for (const al of aliases) {
            if (!tok.includes(al)) continue;
            const m = tok.match(/([+-]\d+)/);
            if (m) addFlat('装备', Number(m[1]));
            if (tok.includes('优势')) out.advNotes.push(tok);
            break;
          }
        }
      }
    }
    return out;
  }

  function computeBaseMod(actor, skillInfo, overrideAbility) {
    if (!actor) return { mod: 0, breakdown: ['未在MVU找到角色卡(按+0估算)'] };
    const ab = overrideAbility || skillInfo.ability;
    const abScore = actor.attrs[ab] ?? 10;
    const abMod = Math.floor((abScore - 10) / 2);
    const parts = [ab + '(' + (abMod >= 0 ? '+' : '') + abMod + ')'];
    let total = abMod;
    if (skillInfo.isSave) {
      if (actor.saveProfs.some((s) => String(s).includes(ab))) {
        total += actor.profBonus;
        parts.push('熟练(+' + actor.profBonus + ')');
      }
    } else if (!skillInfo.isRawAbility) {
      if (hasSkillMatch(actor.expertProfs, skillInfo)) {
        total += actor.profBonus * 2;
        parts.push('专精(+' + (actor.profBonus * 2) + ')');
      } else if (hasSkillMatch(actor.skillProfs, skillInfo)) {
        total += actor.profBonus;
        parts.push('熟练(+' + actor.profBonus + ')');
      } else if (hasSkillMatch(actor.halfProfs, skillInfo) || getClassLevel(actor, /吟游诗人|诗人|Bard/i) >= 2) {
        const half = Math.floor(actor.profBonus / 2);
        if (half > 0) {
          total += half;
          parts.push('半熟练(+' + half + ')');
        }
      }
    }
    const tagFx = parseEquippedTagEffects(actor, skillInfo);
    if (tagFx.flat) {
      total += tagFx.flat;
      parts.push(...tagFx.flatParts);
    }
    const wisMod = Math.floor(((actor.attrs['感知'] ?? 10) - 10) / 2);
    const chaMod = Math.floor(((actor.attrs['魅力'] ?? 10) - 10) / 2);
    const alreadyInParts = (kw) => parts.some((p) => p.includes(kw));
    if (!skillInfo.isSave && ['奥秘', '宗教'].includes(skillInfo.canon) && /奇术使|Thaumaturge/i.test(actor.blobText) && !alreadyInParts('奇术使')) {
      const b = Math.max(1, wisMod);
      total += b;
      parts.push('奇术使(+' + b + ')');
    }
    if (!skillInfo.isSave && ['奥秘', '自然'].includes(skillInfo.canon) && ((getClassLevel(actor, /德鲁伊|Druid/i) >= 1 && /术师|Magician/i.test(actor.blobText)) || /原初职能.*术师|\bMagician\b/i.test(actor.blobText)) && !alreadyInParts('术师')) {
      const b = Math.max(1, wisMod);
      total += b;
      parts.push('术师(+' + b + ')');
    }
    if (!skillInfo.isSave && ['欺瞒', '威吓', '表演', '游说'].includes(skillInfo.canon) && /超凡魅力|妖精漫游者|Otherworldly Glamour|Fey Wanderer/i.test(actor.blobText) && !alreadyInParts('超凡魅力')) {
      const b = Math.max(1, wisMod);
      total += b;
      parts.push('超凡魅力(+' + b + ')');
    }
    if (skillInfo.isSave && (/守护灵光|Aura of Protection/i.test(actor.blobText) || getClassLevel(actor, /圣武士|Paladin/i) >= 6) && !alreadyInParts('守护灵光')) {
      const b = Math.max(1, chaMod);
      total += b;
      parts.push('守护灵光(+' + b + ')');
    }
    return { mod: total, breakdown: parts };
  }

  function scanPartyBuffs(actor, party, skillInfo) {
    const preBuffs = [];
    const postBuffs = [];
    const teammates = party.filter((p) => !actor || p.name !== actor.name);

    const tagFx = parseEquippedTagEffects(actor, skillInfo);
    if (tagFx.advNotes.length) {
      preBuffs.push({
        id: 'equip_tag_adv', label: '装备标签优势', source: actor?.name || '装备', badge: '优势',
        dice: 0, flat: 0, adv: true, note: '已装备生效：' + tagFx.advNotes.join('、'),
        costText: ''
      });
    }

    if (!skillInfo.isSave) {
      const caster = party.find((p) => /神导术|Guidance/i.test(p.blobText));
      if (caster) {
        preBuffs.push({
          id: 'guidance', label: '神导术', source: caster.name, badge: '+1d4',
          dice: 4, flat: 0, adv: false, note: '需专注 · ' + caster.name + ' 施放',
          costText: ''
        });
      }
    }

    if (skillInfo.isSave) {
      const caster = party.find((p) => /抵抗术|Resistance/i.test(p.blobText));
      if (caster) {
        preBuffs.push({
          id: 'resistance', label: '抵抗术', source: caster.name, badge: '+1d4',
          dice: 4, flat: 0, adv: false, note: '2024反应 · ' + caster.name + ' 施放',
          costText: ''
        });
      }
      const blessCaster = party.find((p) => /祝福术|Bless/i.test(p.blobText));
      if (blessCaster) {
        preBuffs.push({
          id: 'bless', label: '祝福术', source: blessCaster.name, badge: '+1d4',
          dice: 4, flat: 0, adv: false, note: '需专注 · ' + blessCaster.name,
          costText: '消耗1环法术位(若未开启)'
        });
      }
    }

    if (!skillInfo.isSave) {
      const enhCaster = party.find((p) => /强化属性|Enhance Ability/i.test(p.blobText));
      if (enhCaster) {
        preBuffs.push({
          id: 'enhance_ability', label: '强化属性', source: enhCaster.name, badge: '优势',
          dice: 0, flat: 0, adv: true, note: '2环专注 · ' + enhCaster.name,
          costText: enhCaster.name + '消耗2环法术位'
        });
      }
    }

    if (skillInfo.canon === '隐匿') {
      const pwtCaster = party.find((p) => /行动无踪|Pass without Trace/i.test(p.blobText));
      if (pwtCaster) {
        preBuffs.push({
          id: 'pass_without_trace', label: '行动无踪', source: pwtCaster.name, badge: '+10',
          dice: 0, flat: 10, adv: false, note: '2环专注 · ' + pwtCaster.name,
          costText: pwtCaster.name + '保持行动无踪'
        });
      }
    }

    for (const mate of teammates) {
      const bardLv = getClassLevel(mate, /吟游诗人|诗人|Bard/i);
      if (bardLv >= 1) {
        const die = bardLv >= 15 ? 12 : (bardLv >= 10 ? 10 : (bardLv >= 5 ? 8 : 6));
        preBuffs.push({
          id: 'bardic_' + mate.name, label: '诗人激励', source: mate.name, badge: '+1d' + die,
          dice: die, flat: 0, adv: false, note: mate.name + ' 赐予激励',
          costText: mate.name + '消耗1次诗人激励'
        });
      }
    }

    const barbLv = getClassLevel(actor, /野蛮人|Barbarian/i);
    if (actor && barbLv >= 1) {
      if (barbLv >= 3 && PRIMAL_KNOWLEDGE_SKILLS.has(skillInfo.canon)) {
        preBuffs.push({
          id: 'primal_knowledge', label: '原初学识+狂暴', source: actor.name, badge: '改力量+优势',
          dice: 0, flat: 0, adv: true, overrideAbility: '力量',
          note: '2024野蛮人3级特性：狂暴中改用力量检定并获优势',
          costText: '需处于狂暴状态'
        });
      } else if (skillInfo.ability === '力量') {
        preBuffs.push({
          id: 'rage_str', label: '狂暴力量优势', source: actor.name, badge: '优势',
          dice: 0, flat: 0, adv: true, note: '狂暴状态下力量检定/豁免优势',
          costText: '需处于狂暴状态'
        });
      }
    }

    if (actor && /战斗大师|战技|卓越骰|Battle Master/i.test(actor.blobText)) {
      const ftrLv = getClassLevel(actor, /战士|Fighter/i) || actor.level;
      const supDie = ftrLv >= 18 ? 12 : (ftrLv >= 10 ? 10 : 8);
      if (['游说', '威吓', '表演'].includes(skillInfo.canon) && /指挥官风度|Commanding Presence/i.test(actor.blobText)) {
        preBuffs.push({
          id: 'maneuver_cmd', label: '战技·指挥官风度', source: actor.name, badge: '+1d' + supDie,
          dice: supDie, flat: 0, adv: false, note: '消耗1颗卓越骰',
          costText: actor.name + '消耗1颗卓越骰'
        });
      }
      if (['调查', '历史', '洞察'].includes(skillInfo.canon) && /战术评估|Tactical Assessment/i.test(actor.blobText)) {
        preBuffs.push({
          id: 'maneuver_tac', label: '战技·战术评估', source: actor.name, badge: '+1d' + supDie,
          dice: supDie, flat: 0, adv: false, note: '消耗1颗卓越骰',
          costText: actor.name + '消耗1颗卓越骰'
        });
      }
      if (skillInfo.canon === '隐匿' && /伏击|Ambush/i.test(actor.blobText)) {
        preBuffs.push({
          id: 'maneuver_amb', label: '战技·伏击', source: actor.name, badge: '+1d' + supDie,
          dice: supDie, flat: 0, adv: false, note: '消耗1颗卓越骰',
          costText: actor.name + '消耗1颗卓越骰'
        });
      }
    }

    if (actor && /幸运|\bLucky\b/i.test(actor.blobText) && !/半身人幸运/i.test(actor.species)) {
      preBuffs.push({
        id: 'lucky_feat', label: '幸运专长', source: actor.name, badge: '优势',
        dice: 0, flat: 0, adv: true, note: '消耗1点幸运赋予优势',
        costText: actor.name + '消耗1点幸运'
      });
    } else if (actor && cHasLuckyFeat(actor.raw)) {
      preBuffs.push({
        id: 'lucky_feat', label: '幸运专长', source: actor.name, badge: '优势',
        dice: 0, flat: 0, adv: true, note: '消耗1点幸运赋予优势',
        costText: actor.name + '消耗1点幸运'
      });
    }

    if (!skillInfo.isSave && teammates.length) {
      const profHelper = teammates.find((m) => skillInfo.isRawAbility || hasSkillMatch(m.skillProfs, skillInfo) || hasSkillMatch(m.expertProfs, skillInfo));
      if (profHelper) {
        preBuffs.push({
          id: 'help_action', label: '队友协助(Help)', source: profHelper.name, badge: '优势',
          dice: 0, flat: 0, adv: true, note: profHelper.name + ' 具备熟练，提供协助优势',
          costText: ''
        });
      }
    }

    // ===== Post-roll Rescue Buffs =====
    if (actor && !skillInfo.isSave && getClassLevel(actor, /战士|Fighter/i) >= 2) {
      postBuffs.push({
        id: 'tactical_mind', label: '⚡ 战术思维 (+1d10)', source: actor.name,
        type: 'add_dice', dice: 10,
        note: '2024战士特性：仅当加上1d10后翻盘成功才消耗回气！',
        costText: actor.name + '消耗1次回气(战术思维翻盘)'
      });
    }
    const arti = party.find((p) => getClassLevel(p, /奇械师|Artificer/i) >= 7);
    if (arti) {
      const intMod = Math.max(1, Math.floor(((arti.attrs['智力'] ?? 10) - 10) / 2));
      postBuffs.push({
        id: 'flash_of_genius', label: '⚡ 灵光一闪 (+' + intMod + ')', source: arti.name,
        type: 'add_flat', flat: intMod,
        note: arti.name + ' 反应追加智力调整值',
        costText: arti.name + '消耗1次灵光一闪'
      });
    }
    if (actor && actor.heroic) {
      postBuffs.push({
        id: 'heroic_insp', label: '✨ 英雄激励 (重投d20)', source: actor.name,
        type: 'reroll',
        note: '消耗英雄激励重新投掷 d20',
        costText: actor.name + '消耗英雄激励'
      });
    }
    const hasHalflingLuck = Boolean(actor && /半身人|Halfling/i.test(actor.species));
    const hasReliableTalent = Boolean(actor && !skillInfo.isSave && !skillInfo.isRawAbility && getClassLevel(actor, /游荡者|Rogue/i) >= 7 && (hasSkillMatch(actor.skillProfs, skillInfo) || hasSkillMatch(actor.expertProfs, skillInfo)));

    return { preBuffs, postBuffs, hasHalflingLuck, hasReliableTalent };
  }

  function cHasLuckyFeat(raw) {
    const feats = raw?.['特性']?.['专长'];
    if (!feats || typeof feats !== 'object') return false;
    return Object.keys(feats).some((k) => /幸运|\bLucky\b/i.test(k));
  }

  function createModalD20(canvas) {
    const ctx = canvas.getContext('2d');
    const t = (1 + Math.sqrt(5)) / 2;
    const rawVerts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map((v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0]/l, v[1]/l, v[2]/l]; });
    const rawFaces = [
      [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
      [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
      [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];
    const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
    const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };

    const faces = rawFaces.map((idx, fIdx) => {
      const p0 = rawVerts[idx[0]], p1 = rawVerts[idx[1]], p2 = rawVerts[idx[2]];
      const c = [(p0[0]+p1[0]+p2[0])/3, (p0[1]+p1[1]+p2[1])/3, (p0[2]+p1[2]+p2[2])/3];
      let n = norm(cross(sub(p1, p0), sub(p2, p0)));
      let indices = [...idx];
      if (dot(n, c) < 0) { n = [-n[0], -n[1], -n[2]]; indices = [idx[0], idx[2], idx[1]]; }
      const v0 = rawVerts[indices[0]], v1 = rawVerts[indices[1]];
      const uAxis = norm(sub(v1, v0));
      const vAxis = norm(cross(uAxis, n));
      return { id: fIdx, indices, normal: n, center: c, uAxis, vAxis, label: 0 };
    });
    const assigned = new Array(20).fill(0);
    const pairs = [];
    for (let i = 0; i < 20; i++) {
      if (assigned[i]) continue;
      let opp = -1, bestD = 1;
      for (let j = i + 1; j < 20; j++) {
        const d = dot(faces[i].normal, faces[j].normal);
        if (d < bestD) { bestD = d; opp = j; }
      }
      assigned[i] = 1; assigned[opp] = 1;
      pairs.push([i, opp]);
    }
    const pairNums = [20, 18, 16, 14, 12, 19, 17, 15, 13, 11];
    pairs.forEach(([a, b], i) => {
      const val = pairNums[i] || (i + 11);
      faces[a].label = val;
      faces[b].label = 21 - val;
    });

    const qMul = (a, b) => [
      a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3],
      a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2],
      a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1],
      a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0]
    ];
    const qNorm = (q) => { const l = Math.hypot(q[0],q[1],q[2],q[3]) || 1; return [q[0]/l,q[1]/l,q[2]/l,q[3]/l]; };
    const qFromAxisAngle = (axis, ang) => {
      const s = Math.sin(ang * 0.5), n = norm(axis);
      return [Math.cos(ang * 0.5), n[0]*s, n[1]*s, n[2]*s];
    };
    const qRotVec = (q, v) => {
      const [w, x, y, z] = q;
      const tx = 2 * (y*v[2] - z*v[1]), ty = 2 * (z*v[0] - x*v[2]), tz = 2 * (x*v[1] - y*v[0]);
      return [v[0] + w*tx + (y*tz - z*ty), v[1] + w*ty + (z*tx - x*tz), v[2] + w*tz + (x*ty - y*tx)];
    };
    const qFromTwoVecs = (from, to) => {
      const a = norm(from), b = norm(to), d = dot(a, b);
      if (d > 0.9999) return [1, 0, 0, 0];
      if (d < -0.9999) {
        const ortho = Math.abs(a[0]) < 0.9 ? [1,0,0] : [0,1,0];
        const ax = norm(cross(a, ortho));
        return [0, ax[0], ax[1], ax[2]];
      }
      const c = cross(a, b);
      return qNorm([1 + d, c[0], c[1], c[2]]);
    };
    const qSlerp = (a, b, k) => {
      let d = a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3];
      let b2 = b;
      if (d < 0) { d = -d; b2 = [-b[0], -b[1], -b[2], -b[3]]; }
      if (d > 0.9995) return qNorm([a[0]+(b2[0]-a[0])*k, a[1]+(b2[1]-a[1])*k, a[2]+(b2[2]-a[2])*k, a[3]+(b2[3]-a[3])*k]);
      const theta = Math.acos(d), sinT = Math.sin(theta);
      const w1 = Math.sin((1 - k) * theta) / sinT, w2 = Math.sin(k * theta) / sinT;
      return [w1*a[0]+w2*b2[0], w1*a[1]+w2*b2[1], w1*a[2]+w2*b2[2], w1*a[3]+w2*b2[3]];
    };
    const orientFaceUpright = (face) => {
      const qt = qFromTwoVecs(face.normal, [0, 0, 1]);
      const rv = qRotVec(qt, face.vAxis);
      const ang = Math.atan2(-rv[0], -rv[1]);
      return qNorm(qMul(qFromAxisAngle([0, 0, 1], ang), qt));
    };
    const faceByNum = (num) => faces.find((f) => f.label === num) || faces[0];

    const lightDir = norm([-0.45, 0.55, 0.7]);
    const rimDir = norm([0.6, -0.5, 0.4]);

    function makeDie(seedPhase) {
      const f20 = faceByNum(20);
      return {
        q: orientFaceUpright(f20),
        targetQ: orientFaceUpright(f20),
        targetNum: 20,
        angVel: [0.35 + seedPhase * 0.15, 0.55 - seedPhase * 0.12, 0.15],
        startTime: 0,
        duration: 2350,
        phase: 'idle',
        chosenState: 'normal',
        offsetSeed: seedPhase,
        xJitter: 0,
        yJitter: 0,
        zHeight: 0,
      };
    }

    let dice = [makeDie(0)];
    let rollingCallback = null;
    let lastNow = 0;
    let rafId = 0;

    function drawOneDie(die, cx, cy, baseRadius) {
      const alpha = die.chosenState === 'dropped' ? 0.36 : 1.0;
      const heightScale = 1 + die.zHeight * 0.24;
      const radius = baseRadius * heightScale;
      const dieX = cx + die.xJitter * baseRadius;
      const dieY = cy + die.yJitter * baseRadius - die.zHeight * baseRadius * 0.48;
      const camDist = 3.8;

      ctx.save();
      ctx.globalAlpha = alpha;

      const shX = cx + die.xJitter * baseRadius + die.zHeight * baseRadius * 0.26;
      const shY = cy + die.yJitter * baseRadius + baseRadius * 0.2 + die.zHeight * baseRadius * 0.2;
      const shR = baseRadius * (1.04 + die.zHeight * 0.3);
      const shGrad = ctx.createRadialGradient(shX, shY, shR * 0.14, shX, shY, shR);
      shGrad.addColorStop(0, 'rgba(0,0,0,' + Math.max(0.14, 0.52 - die.zHeight * 0.16).toFixed(2) + ')');
      shGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shGrad;
      ctx.beginPath();
      ctx.arc(shX, shY, shR, 0, Math.PI * 2);
      ctx.fill();

      const auraR = radius * (die.chosenState === 'picked' ? 1.65 : 1.38);
      const aura = ctx.createRadialGradient(dieX, dieY, radius * 0.15, dieX, dieY, auraR);
      if (die.phase === 'settled' && die.targetNum === 20 && die.chosenState !== 'dropped') {
        aura.addColorStop(0, 'rgba(255,224,102,0.34)');
      } else if (die.phase === 'settled' && die.targetNum === 1 && die.chosenState !== 'dropped') {
        aura.addColorStop(0, 'rgba(255,107,107,0.32)');
      } else if (die.chosenState === 'picked') {
        aura.addColorStop(0, 'rgba(234,185,99,0.28)');
      } else {
        aura.addColorStop(0, 'rgba(216,183,123,0.10)');
      }
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(dieX, dieY, auraR, 0, Math.PI * 2);
      ctx.fill();

      const rotVerts = rawVerts.map((v) => qRotVec(die.q, v));
      const projVerts = rotVerts.map(([x, y, z]) => {
        const s = (camDist / (camDist - z)) * radius;
        return [dieX + x * s, dieY - y * s, z];
      });

      const visibleFaces = [];
      for (const f of faces) {
        const n = qRotVec(die.q, f.normal);
        if (n[2] <= -0.05) continue;
        const p0 = projVerts[f.indices[0]], p1 = projVerts[f.indices[1]], p2 = projVerts[f.indices[2]];
        visibleFaces.push({ f, n, p0, p1, p2, avgZ: (p0[2] + p1[2] + p2[2]) / 3 });
      }
      visibleFaces.sort((a, b) => a.avgZ - b.avgZ);

      for (const item of visibleFaces) {
        const { f, n, p0, p1, p2 } = item;
        const diff = Math.max(0, dot(n, lightDir));
        const rim = Math.max(0, dot(n, rimDir));
        const halfVec = norm([lightDir[0], lightDir[1], lightDir[2] + 1]);
        const spec = Math.pow(Math.max(0, dot(n, halfVec)), 18);

        const rCol = Math.round(14 + diff * 24 + rim * 28 + spec * 95);
        const gCol = Math.round(24 + diff * 36 + rim * 24 + spec * 82);
        const bCol = Math.round(23 + diff * 28 + rim * 14 + spec * 48);

        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath();
        ctx.fillStyle = 'rgba(' + rCol + ',' + gCol + ',' + bCol + ',0.96)';
        ctx.fill();

        const edgeAlpha = (0.42 + n[2] * 0.54 + spec * 0.22).toFixed(2);
        ctx.strokeStyle = die.chosenState === 'picked'
          ? ('rgba(255,216,120,' + edgeAlpha + ')')
          : ('rgba(216,183,123,' + edgeAlpha + ')');
        ctx.lineWidth = Math.max(1.4, baseRadius * 0.024);
        ctx.lineJoin = 'round';
        ctx.stroke();

        if (n[2] > 0.08) {
          const c3 = qRotVec(die.q, f.center);
          const u3 = qRotVec(die.q, f.uAxis);
          const v3 = qRotVec(die.q, f.vAxis);
          const projPt = (pt) => {
            const sc = (camDist / (camDist - pt[2])) * radius;
            return [dieX + pt[0] * sc, dieY - pt[1] * sc];
          };
          const pc = projPt(c3);
          const eps = 0.22;
          const pu = projPt([c3[0]+u3[0]*eps, c3[1]+u3[1]*eps, c3[2]+u3[2]*eps]);
          const pv = projPt([c3[0]+v3[0]*eps, c3[1]+v3[1]*eps, c3[2]+v3[2]*eps]);
          const ux = (pu[0] - pc[0]) / (eps * radius);
          const uy = (pu[1] - pc[1]) / (eps * radius);
          const vx = (pv[0] - pc[0]) / (eps * radius);
          const vy = (pv[1] - pc[1]) / (eps * radius);

          ctx.save();
          ctx.translate(pc[0], pc[1]);
          ctx.transform(ux * radius, uy * radius, vx * radius, vy * radius, 0, 0);
          const isNat20 = f.label === 20;
          const isNat1 = f.label === 1;
          const textAlpha = Math.min(1, 0.28 + n[2] * 0.85);
          ctx.fillStyle = isNat20
            ? ('rgba(255,232,148,' + textAlpha.toFixed(2) + ')')
            : (isNat1 ? ('rgba(255,135,135,' + textAlpha.toFixed(2) + ')') : ('rgba(238,216,168,' + textAlpha.toFixed(2) + ')'));
          ctx.font = '700 0.36px Georgia, "Times New Roman", serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(f.label), 0, 0.02);
          if (f.label === 6 || f.label === 9) {
            ctx.fillRect(-0.11, 0.19, 0.22, 0.028);
          }
          ctx.restore();
        }
      }

      ctx.restore();
    }

    function stepAndDraw(now) {
      const dt = lastNow ? Math.min(0.033, Math.max(0.004, (now - lastNow) / 1000)) : 0.016;
      lastNow = now;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      let anyRolling = false;
      for (const die of dice) {
        if (die.phase === 'idle') {
          const qStep = qMul(qFromAxisAngle([0, 1, 0], die.angVel[1] * dt), qFromAxisAngle([1, 0, 0], die.angVel[0] * dt));
          die.q = qNorm(qMul(qStep, die.q));
          die.zHeight = 0;
          die.xJitter = 0;
          die.yJitter = 0;
        } else if (die.phase === 'rolling') {
          const elapsed = now - die.startTime;
          const p = Math.max(0, Math.min(1, elapsed / die.duration));
          if (p < 0.72) {
            const spinFactor = Math.pow(1 - p / 0.72, 1.35) * 14 + 1.2;
            const wx = die.angVel[0] * spinFactor * dt;
            const wy = die.angVel[1] * spinFactor * dt;
            const wz = die.angVel[2] * spinFactor * dt;
            const wMag = Math.hypot(wx, wy, wz);
            if (wMag > 1e-6) {
              die.q = qNorm(qMul(qFromAxisAngle([wx/wMag, wy/wMag, wz/wMag], wMag), die.q));
            }
            const bounceEnv = Math.pow(1 - p / 0.72, 1.5);
            die.zHeight = Math.abs(Math.sin(p * Math.PI * 4.2 + die.offsetSeed)) * 0.95 * bounceEnv;
            die.xJitter = Math.sin(p * Math.PI * 3.1 + die.offsetSeed * 2.1) * 0.24 * bounceEnv;
            die.yJitter = Math.cos(p * Math.PI * 2.6 + die.offsetSeed * 1.4) * 0.16 * bounceEnv;
            anyRolling = true;
          } else if (p < 1) {
            const sp = (p - 0.72) / 0.28;
            const ease = 1 - Math.pow(1 - sp, 3);
            die.q = qSlerp(die.q, die.targetQ, Math.min(1, 0.18 + ease * 0.32));
            die.zHeight *= 0.75;
            die.xJitter *= 0.78;
            die.yJitter *= 0.78;
            anyRolling = true;
          } else {
            die.q = die.targetQ;
            die.zHeight = 0;
            die.xJitter = 0;
            die.yJitter = 0;
            die.phase = 'settled';
          }
        }
      }

      if (rollingCallback && !anyRolling) {
        const cb = rollingCallback;
        rollingCallback = null;
        cb();
      }

      if (dice.length === 1) {
        drawOneDie(dice[0], w * 0.5, h * 0.5, Math.min(w, h) * 0.37);
      } else {
        const r = Math.min(w * 0.2, h * 0.34);
        drawOneDie(dice[0], w * 0.30, h * 0.5, r);
        drawOneDie(dice[1], w * 0.70, h * 0.5, r);
      }

      rafId = host.requestAnimationFrame(stepAndDraw);
    }

    rafId = host.requestAnimationFrame(stepAndDraw);

    return {
      setMode(count) {
        const n = count === 2 ? 2 : 1;
        if (dice.length === n) return;
        dice = n === 2 ? [makeDie(0), makeDie(1.7)] : [makeDie(0)];
      },
      isRolling() {
        return dice.some((d) => d.phase === 'rolling');
      },
      rollTo(nums, chosenIdx, onDone) {
        const arr = Array.isArray(nums) ? nums : [nums];
        this.setMode(arr.length);
        const now = host.performance?.now?.() || Date.now();
        dice.forEach((die, idx) => {
          const target = Math.max(1, Math.min(20, Number(arr[idx]) || 1));
          die.targetNum = target;
          die.targetQ = orientFaceUpright(faceByNum(target));
          die.startTime = now;
          die.duration = idx === 0 ? 2350 : 2650;
          die.angVel = [
            (idx === 0 ? 1 : -1) * (1.2 + Math.random() * 0.8),
            (idx === 0 ? 1.5 : -1.4) + (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 1.4,
          ];
          die.phase = 'rolling';
          die.chosenState = arr.length === 2 ? (idx === chosenIdx ? 'picked' : 'dropped') : 'normal';
        });
        rollingCallback = onDone || null;
      },
      skipToResult() {
        if (!this.isRolling()) return false;
        for (const die of dice) {
          die.q = die.targetQ;
          die.zHeight = 0;
          die.xJitter = 0;
          die.yJitter = 0;
          die.phase = 'settled';
        }
        if (rollingCallback) {
          const cb = rollingCallback;
          rollingCallback = null;
          cb();
        }
        return true;
      },
      setNum(n) {
        this.setMode(1);
        const target = Math.max(1, Math.min(20, Number(n) || 20));
        dice[0].targetNum = target;
        dice[0].targetQ = orientFaceUpright(faceByNum(target));
        dice[0].q = dice[0].targetQ;
        dice[0].phase = 'settled';
        dice[0].chosenState = 'normal';
      },
      stop() { host.cancelAnimationFrame(rafId); }
    };
  }

  let modal = null;
  let activeD20 = null;

  function sendOrFillChat(text, autoSend) {
    const ta = doc.getElementById('send_textarea') || doc.querySelector('textarea#send_textarea');
    if (ta) {
      ta.value = text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      if (autoSend) {
        const sendBtn = doc.getElementById('send_but');
        if (sendBtn) sendBtn.click();
      }
    }
  }

  async function open(spec = {}) {
    const party = await readMvuParty();
    const actorName = String(spec.actor || party[0]?.name || '主角').trim();
    const actor = party.find((p) => p.name === actorName || p.id === actorName || p.name.includes(actorName) || actorName.includes(p.name)) || party[0] || null;
    const skillInfo = resolveSkillInfo(spec.skill || '属性检定');
    const dc = Math.max(5, Math.min(35, Number(spec.dc) || 12));
    const baseAdv = /优势|adv/i.test(String(spec.adv || '')) ? 'adv' : (/劣势|dis/i.test(String(spec.adv || '')) ? 'dis' : 'normal');
    const desc = String(spec.desc || '').trim();
    const { preBuffs, postBuffs, hasHalflingLuck, hasReliableTalent } = scanPartyBuffs(actor, party, skillInfo);
    const portraitUrl = host.__dndPortraitVault?.get?.(actor?.id || actorName, actor?.name || actorName) || actor?.legacyPortrait || '';

    if (activeD20) { activeD20.stop(); activeD20 = null; }
    if (modal) modal.remove();

    modal = doc.createElement('dialog');
    modal.id = 'dnd-bg3-check-modal';
    modal.innerHTML = `<style>
      #dnd-bg3-check-modal{--ink:#f1e6cf;--muted:#9ea5ad;--gold:#eab963;--line:rgba(234,185,99,.26);box-sizing:border-box;width:min(540px,calc(100vw - 16px));max-height:92dvh;margin:auto;padding:0;border:1px solid rgba(234,185,99,.45);border-radius:16px;background:radial-gradient(ellipse at 50% 0%,rgba(234,185,99,.12),transparent 55%),linear-gradient(160deg,#181c24,#0e1116);color:var(--ink);box-shadow:0 28px 90px rgba(0,0,0,.9);font:13.5px/1.5 'Noto Sans SC','Microsoft YaHei',sans-serif;color-scheme:dark;overflow:hidden;display:flex;flex-direction:column}
      #dnd-bg3-check-modal:not([open]){display:none!important}
      #dnd-bg3-check-modal::backdrop{background:rgba(5,7,10,.78);backdrop-filter:blur(5px)}
      #dnd-bg3-check-modal *{box-sizing:border-box}
      .bg3-hd{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.02)}
      .bg3-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);background:#1b202a;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--gold);flex-shrink:0}
      .bg3-dc-pill{margin-left:auto;text-align:center;padding:5px 12px;border-radius:10px;background:rgba(234,185,99,.14);border:1px solid rgba(234,185,99,.42)}
      .bg3-dc-pill small{display:block;font-size:10px;color:#cbb891;letter-spacing:.1em}
      .bg3-dc-pill b{font-size:18px;color:#ffe2a0;font-family:Georgia,serif}
      .bg3-body{flex:1 1 auto;overflow-y:auto;padding:12px 18px;display:flex;flex-direction:column;gap:10px;align-items:center}
      .bg3-desc{width:100%;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.03);border-left:3px solid var(--gold);font-size:12.5px;color:#dfd6c3}
      .bg3-stage{position:relative;width:min(360px,100%);height:198px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;user-select:none}
      .bg3-stage canvas{width:100%;height:178px;display:block}
      .bg3-stage-hint{font-size:11px;color:#cbb891;opacity:.85;margin-top:2px;letter-spacing:.04em}
      .bg3-mod-bar{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;width:100%}
      .bg3-chip{padding:3px 9px;border-radius:999px;font-size:11.5px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#e4dcc8}
      .bg3-chip.gold{background:rgba(234,185,99,.16);border-color:rgba(234,185,99,.45);color:#ffe4a3}
      .bg3-buffs{width:100%;display:flex;flex-direction:column;gap:6px}
      .bg3-buff-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      .bg3-buff-btn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:7px 9px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#dcd4c2;cursor:pointer;text-align:left;transition:all .15s}
      .bg3-buff-btn:hover{border-color:rgba(234,185,99,.45);background:rgba(234,185,99,.08)}
      .bg3-buff-btn[data-on="true"]{border-color:#eab963;background:rgba(234,185,99,.18);box-shadow:0 0 12px rgba(234,185,99,.16)}
      .bg3-buff-top{width:100%;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:600}
      .bg3-buff-badge{font-size:11px;padding:1px 6px;border-radius:999px;background:rgba(234,185,99,.22);color:#ffe29e}
      .bg3-buff-sub{font-size:10.5px;color:var(--muted)}
      .bg3-verdict{width:100%;padding:10px 14px;border-radius:10px;text-align:center;font-weight:600;font-size:14px;border:1px solid var(--line);background:rgba(255,255,255,.04)}
      .bg3-rescue{width:100%;display:flex;flex-wrap:wrap;justify-content:center;gap:6px}
      .bg3-ft{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:12px 18px;border-top:1px solid var(--line);background:#10141a}
      .bg3-btn{padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.05);color:#efe2c4;font-size:12.5px;cursor:pointer}
      .bg3-btn:hover{background:rgba(234,185,99,.16)}
      .bg3-btn-primary{background:linear-gradient(135deg,#d49c3d,#8e621c);border-color:#f0c36d;color:#fff9ec;font-weight:700}
      @media(max-width:520px){.bg3-buff-grid{grid-template-columns:1fr}}
    </style>
    <div class="bg3-hd">
      ${portraitUrl ? '<img class="bg3-avatar" src="' + esc(portraitUrl) + '" alt="">' : '<div class="bg3-avatar">' + esc(actorName.slice(0, 1)) + '</div>'}
      <div>
        <div style="font-size:15px;font-weight:700;color:#f5e2b5;">${esc(actorName)} · ${esc(skillInfo.name)}</div>
        <div style="font-size:11.5px;color:var(--muted);">${actor ? esc(actor.cls + ' Lv.' + actor.level) : '未匹配到MVU档案'} ${hasReliableTalent ? '· 🛡️可靠才能(保底10)' : ''}</div>
      </div>
      <div class="bg3-dc-pill"><small>目标 DC</small><b>${dc}</b></div>
    </div>
    <div class="bg3-body">
      ${desc ? '<div class="bg3-desc">' + esc(desc) + '</div>' : ''}
      <div class="bg3-stage" data-bg3-stage><canvas width="720" height="356" data-bg3-canvas></canvas><div class="bg3-stage-hint" data-bg3-hint></div></div>
      <div class="bg3-mod-bar" data-bg3-mods></div>
      <div class="bg3-verdict" data-bg3-verdict hidden></div>
      <div class="bg3-rescue" data-bg3-rescue hidden></div>
      <div class="bg3-buffs" data-bg3-buffs></div>
    </div>
    <div class="bg3-ft">
      <button type="button" class="bg3-btn" data-bg3-close>关闭</button>
      <div style="display:flex;gap:8px;margin-left:auto;flex-wrap:wrap;">
        <button type="button" class="bg3-btn bg3-btn-primary" data-bg3-roll>掷骰</button>
        <button type="button" class="bg3-btn" data-bg3-fill hidden>填入</button>
        <button type="button" class="bg3-btn bg3-btn-primary" data-bg3-send hidden>发送</button>
      </div>
    </div>`;

    doc.body.appendChild(modal);
    const canvas = modal.querySelector('[data-bg3-canvas]');
    activeD20 = createModalD20(canvas);

    const selectedPre = new Set();
    let rolled = null;

    function getEffectiveAdv() {
      let hasAdv = baseAdv === 'adv';
      let hasDis = baseAdv === 'dis';
      for (const b of preBuffs) {
        if (selectedPre.has(b.id) && b.adv) hasAdv = true;
      }
      if (hasAdv && hasDis) return 'normal';
      return hasAdv ? 'adv' : (hasDis ? 'dis' : 'normal');
    }

    function getOverrideAbility() {
      for (const b of preBuffs) {
        if (selectedPre.has(b.id) && b.overrideAbility) return b.overrideAbility;
      }
      return null;
    }

    function renderPreUi() {
      const ovAb = getOverrideAbility();
      const base = computeBaseMod(actor, skillInfo, ovAb);
      const effAdv = getEffectiveAdv();
      if (!rolled && activeD20) {
        activeD20.setMode(effAdv === 'normal' ? 1 : 2);
      }
      const hintEl = modal.querySelector('[data-bg3-hint]');
      if (hintEl && !rolled) hintEl.textContent = '';
      const modsEl = modal.querySelector('[data-bg3-mods]');
      const chips = [
        '<span class="bg3-chip">基础 ' + (base.mod >= 0 ? '+' : '') + base.mod + '（' + esc(base.breakdown.join(' + ')) + '）</span>',
        effAdv === 'adv' ? '<span class="bg3-chip gold">优势</span>' : (effAdv === 'dis' ? '<span class="bg3-chip" style="border-color:#ff7b7b;color:#ff9b9b;">劣势</span>' : '')
      ];
      for (const b of preBuffs) {
        if (selectedPre.has(b.id) && !b.adv) {
          chips.push('<span class="bg3-chip gold">' + esc(b.label) + ' ' + esc(b.badge) + '</span>');
        }
      }
      modsEl.innerHTML = chips.filter(Boolean).join('');

      const buffsEl = modal.querySelector('[data-bg3-buffs]');
      if (!preBuffs.length) {
        buffsEl.innerHTML = '';
      } else {
        buffsEl.innerHTML = '<div style="font-size:11.5px;color:#cbb891;font-weight:600;">可用加成</div><div class="bg3-buff-grid">' +
          preBuffs.map((b) => '<button type="button" class="bg3-buff-btn" data-buff-id="' + esc(b.id) + '" data-on="' + selectedPre.has(b.id) + '"><div class="bg3-buff-top"><span>' + esc(b.label) + ' · ' + esc(b.source) + '</span><span class="bg3-buff-badge">' + esc(b.badge) + '</span></div><div class="bg3-buff-sub">' + esc(b.note) + '</div></button>').join('') +
          '</div>';
        buffsEl.querySelectorAll('[data-buff-id]').forEach((btn) => {
          btn.onclick = () => {
            if (rolled) return;
            const id = btn.dataset.buffId;
            if (selectedPre.has(id)) selectedPre.delete(id);
            else selectedPre.add(id);
            renderPreUi();
          };
        });
      }
    }

    function computeVerdict(stateObj) {
      const diff = stateObj.total - dc;
      if (stateObj.chosen === 20) return { label: '🌟 天然 20 · 大成功', color: '#ffe066', ok: true };
      if (stateObj.chosen === 1) return { label: '💀 天然 1 · 大失败', color: '#ff7b7b', ok: false };
      if (diff >= 5) return { label: '✨ 大胜', color: '#8ce99a', ok: true };
      if (diff >= 0) return { label: '✅ 检定成功', color: '#69db7c', ok: true };
      if (diff <= -5) return { label: '❌ 严重失败（差 ' + Math.abs(diff) + ' 点）', color: '#ff7b7b', ok: false };
      return { label: '❌ 检定失败（差 ' + Math.abs(diff) + ' 点）', color: '#ff8787', ok: false };
    }

    function buildResultMessage() {
      const v = computeVerdict(rolled);
      const rollPart = rolled.r2 != null
        ? ((rolled.effectiveAdv === 'adv' ? '优势' : '劣势') + '[' + rolled.r1 + ',' + rolled.r2 + ']→取' + rolled.chosen)
        : ('d20=' + rolled.chosen);
      const relNote = rolled.reliableTriggered ? '(可靠才能保底10)' : '';
      const bonusStr = rolled.bonusRolls.map((br) => ' + ' + br.label + '(+' + br.val + ')').join('');
      const costList = rolled.costs.filter(Boolean);
      const costStr = costList.length ? ('｜资源消耗：' + costList.join('、')) : '';
      const strictFailNote = v.ok ? '' : '｜硬性裁决：失败就是失败，严禁以“带代价妥协/部分成功”名义把失败强行说成成功';
      const actionHeader = desc ? (actorName + '尝试【' + desc + '】\n') : '';
      return actionHeader + '[BG3真随机检定已锁定] ' + actorName + ' · ' + skillInfo.name + ' (DC ' + dc + ')：' +
        rollPart + relNote + ' + 基础(' + (rolled.baseMod >= 0 ? '+' : '') + rolled.baseMod + ')' + bonusStr +
        ' = 总计 ' + rolled.total + ' → ' + v.label + costStr + strictFailNote;
    }

    function renderRolledResult() {
      const hintEl = modal.querySelector('[data-bg3-hint]');
      if (hintEl) hintEl.textContent = '';
      const v = computeVerdict(rolled);
      const verdictEl = modal.querySelector('[data-bg3-verdict]');
      verdictEl.hidden = false;
      verdictEl.style.color = v.color;
      verdictEl.style.borderColor = v.color;
      const bonusDetail = rolled.bonusRolls.map((b) => esc(b.label) + '(+' + b.val + ')').join(' + ');
      verdictEl.innerHTML = '<div>' + esc(v.label) + '</div><div style="font-size:12px;color:#d6cebc;margin-top:4px;font-weight:400;">裸骰 ' + rolled.chosen + (rolled.r2 != null ? '（原双骰 ' + rolled.r1 + '/' + rolled.r2 + '）' : '') +
        (rolled.reliableTriggered ? ' [可靠才能→10]' : '') + ' + 基础 ' + (rolled.baseMod >= 0 ? '+' : '') + rolled.baseMod +
        (bonusDetail ? ' + ' + bonusDetail : '') + ' = <b style="color:' + v.color + ';font-size:15px;">' + rolled.total + '</b> / DC ' + dc + '</div>';

      const rescueEl = modal.querySelector('[data-bg3-rescue]');
      const availableRescues = [];
      if (hasHalflingLuck && rolled.rawChosen === 1 && !rolled.usedPost.has('halfling_luck')) {
        availableRescues.push({ id: 'halfling_luck', label: '🍀 半身人幸运（免费重投天然1）', type: 'reroll', costText: '' });
      }
      if (!v.ok) {
        for (const pb of postBuffs) {
          if (!rolled.usedPost.has(pb.id)) availableRescues.push(pb);
        }
      }
      if (availableRescues.length) {
        rescueEl.hidden = false;
        rescueEl.innerHTML = availableRescues.map((rb) => '<button type="button" class="bg3-btn" data-rescue-id="' + esc(rb.id) + '" style="border-color:#ffd43b;color:#ffe699;">' + esc(rb.label) + '</button>').join('');
        rescueEl.querySelectorAll('[data-rescue-id]').forEach((btn) => {
          btn.onclick = () => {
            const rb = availableRescues.find((x) => x.id === btn.dataset.rescueId);
            if (!rb) return;
            rolled.usedPost.add(rb.id);
            if (rb.type === 'reroll') {
              const nr = csprngInt(20);
              rolled.r1 = nr;
              rolled.r2 = null;
              rolled.rawChosen = nr;
              rolled.chosen = hasReliableTalent && nr < 10 ? 10 : nr;
              rolled.reliableTriggered = hasReliableTalent && nr < 10;
              rolled.total = rolled.chosen + rolled.baseMod + rolled.bonusRolls.reduce((s, x) => s + x.val, 0);
              if (rb.costText) rolled.costs.push(rb.costText);
              const hint = modal.querySelector('[data-bg3-hint]');
              if (hint) hint.textContent = '点击跳过';
              activeD20.rollTo([rolled.rawChosen], 0, () => {
                renderRolledResult();
              });
              return;
            } else if (rb.type === 'add_dice') {
              const add = csprngInt(rb.dice);
              rolled.bonusRolls.push({ label: rb.label.replace(/^⚡\s*/, ''), val: add });
              rolled.total += add;
              if (rb.id === 'tactical_mind') {
                if (rolled.total >= dc) rolled.costs.push(rb.costText);
                else rolled.costs.push(actorName + '战术思维未翻盘(不消耗回气)');
              } else if (rb.costText) {
                rolled.costs.push(rb.costText);
              }
            } else if (rb.type === 'add_flat') {
              rolled.bonusRolls.push({ label: rb.label.replace(/^⚡\s*/, ''), val: rb.flat });
              rolled.total += rb.flat;
              if (rb.costText) rolled.costs.push(rb.costText);
            }
            renderRolledResult();
          };
        });
      } else {
        rescueEl.hidden = true;
      }

      modal.querySelector('[data-bg3-roll]').hidden = true;
      modal.querySelector('[data-bg3-fill]').hidden = false;
      modal.querySelector('[data-bg3-send]').hidden = false;
    }

    function executeRoll() {
      if (activeD20?.isRolling?.()) {
        activeD20.skipToResult();
        return;
      }
      if (rolled) return;
      const rollBtn = modal.querySelector('[data-bg3-roll]');
      const hintEl = modal.querySelector('[data-bg3-hint]');
      rollBtn.textContent = '跳过';
      if (hintEl) hintEl.textContent = '点击跳过';

      const ovAb = getOverrideAbility();
      const base = computeBaseMod(actor, skillInfo, ovAb);
      const effAdv = getEffectiveAdv();
      const r1 = csprngInt(20);
      const r2 = effAdv === 'normal' ? null : csprngInt(20);
      const rawChosen = r2 == null ? r1 : (effAdv === 'adv' ? Math.max(r1, r2) : Math.min(r1, r2));
      const chosenIdx = r2 == null ? 0 : (effAdv === 'adv' ? (r1 >= r2 ? 0 : 1) : (r1 <= r2 ? 0 : 1));
      const reliableTriggered = hasReliableTalent && rawChosen < 10;
      const chosen = reliableTriggered ? 10 : rawChosen;

      const bonusRolls = [];
      const costs = [];
      for (const b of preBuffs) {
        if (!selectedPre.has(b.id)) continue;
        if (b.dice > 0) bonusRolls.push({ label: b.label + '[' + b.source + ']', val: csprngInt(b.dice) });
        if (b.flat > 0) bonusRolls.push({ label: b.label + '[' + b.source + ']', val: b.flat });
        if (b.costText) costs.push(b.costText);
      }
      const total = chosen + base.mod + bonusRolls.reduce((s, x) => s + x.val, 0);
      rolled = { r1, r2, rawChosen, chosen, reliableTriggered, effectiveAdv: effAdv, baseMod: base.mod, bonusRolls, total, costs, usedPost: new Set() };

      const rollNums = r2 == null ? [r1] : [r1, r2];
      activeD20.rollTo(rollNums, chosenIdx, () => {
        renderRolledResult();
      });
    }

    modal.querySelector('[data-bg3-roll]').onclick = executeRoll;
    modal.querySelector('[data-bg3-stage]').onclick = executeRoll;
    modal.querySelector('[data-bg3-fill]').onclick = () => {
      sendOrFillChat(buildResultMessage(), false);
      modal.close();
    };
    modal.querySelector('[data-bg3-send]').onclick = () => {
      sendOrFillChat(buildResultMessage(), true);
      modal.close();
    };
    modal.querySelector('[data-bg3-close]').onclick = () => modal.close();
    modal.addEventListener('close', () => {
      if (activeD20) { activeD20.stop(); activeD20 = null; }
    });

    renderPreUi();
    modal.showModal();
  }

  function startCombat(opts = {}) {
    const actorName = String(opts.actor || '主角').trim();
    const desc = String(opts.desc || '拔出武器发动攻击，立刻进入战斗').trim();
    const msg = '【行动宣言 · 直接开战】' + actorName + ' 选择直接开战：' + desc + '（请立刻进入战斗流程，投掷先攻并输出战斗面板！）';
    sendOrFillChat(msg, true);
  }

  function dispose() {
    if (activeD20) { activeD20.stop(); activeD20 = null; }
    modal?.remove();
    modal = null;
    if (host.__dndBg3Check?.dispose === dispose) delete host.__dndBg3Check;
    if (globalThis.__dndBg3Check?.dispose === dispose) delete globalThis.__dndBg3Check;
  }

  host.__dndBg3Check = { open, startCombat, readMvuParty, scanPartyBuffs, computeBaseMod, resolveSkillInfo, dispose };
  globalThis.__dndBg3Check = host.__dndBg3Check;
  if (typeof window !== 'undefined') window.addEventListener('pagehide', dispose, { once: true });
})();
