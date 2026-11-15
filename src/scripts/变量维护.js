function normalizeMvuLiteralTags(text) {
  return String(text || '').replace(/`(<\/?(?:think|thinking|reasoning|analysis|analyze)\b[^>\r\n]*>)`/gi,
    (_, tag) => '`' + tag.replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '`');
}

function cleanMvuAuxiliaryData(vars) {
  if (!vars || typeof vars !== 'object') return false;
  let changed = false;
  for (const key of ['mvu_lite_backup', 'spell_metadata_backup']) {
    if (Object.hasOwn(vars, key)) { delete vars[key]; changed = true; }
  }
  if (vars.mvu_lite_ui && typeof vars.mvu_lite_ui === 'object') {
    const ui = {};
    for (const [name, prefs] of Object.entries(vars.mvu_lite_ui)) {
      if (!prefs || typeof prefs !== 'object') continue;
      const character = vars.stat_data?.角色列表?.[name];
      if (character && prefs.无甲防御 === false && !Object.hasOwn(character,'无甲防御')) {
        character.无甲防御 = false; changed = true;
      }
      const kept = Object.fromEntries(Object.entries(prefs).filter(([key, value]) =>
        ['头像', '玩家名'].includes(key) && typeof value === 'string' && value.trim()));
      if (Object.keys(kept).length) ui[name] = kept;
    }
    if (JSON.stringify(ui) !== JSON.stringify(vars.mvu_lite_ui)) changed = true;
    if (Object.keys(ui).length) vars.mvu_lite_ui = ui;
    else { delete vars.mvu_lite_ui; changed = true; }
  }
  // MVU needs initialized_lorebooks, schema and its snapshot markers for replay.
  return changed;
}

function recoverMvuCommands(text, commands) {
  if (commands.length || normalizeMvuLiteralTags(text) === text) return false;
  const normalized = normalizeMvuLiteralTags(text);
  const reasoning = [];
  let updateStart = -1, block = '';
  const tags = /<\/?(?:think|thinking|reasoning|analysis|analyze|UpdateVariable)\b[^>]*>/gi;
  for (const match of normalized.matchAll(tags)) {
    const tag = match[0], name = tag.match(/^<\/?([^\s>]+)/)[1].toLowerCase();
    const closing = tag.startsWith('</');
    if (name === 'updatevariable') {
      if (!reasoning.length && !closing) updateStart = match.index + tag.length;
      else if (!reasoning.length && closing && updateStart >= 0) {
        block = normalized.slice(updateStart, match.index); updateStart = -1;
      }
    } else if (!closing) reasoning.push(name);
    else if (reasoning.at(-1) === name) reasoning.pop();
  }
  const patch = block.match(/<JSONPatch>\s*([\s\S]*?)\s*<\/JSONPatch>/i);
  if (!patch) return false;
  let operations;
  try { operations = JSON.parse(patch[1]); } catch { return false; }
  if (!Array.isArray(operations)) return false;
  const path = value => {
    if (typeof value !== 'string' || !value.startsWith('/')) throw Error('Invalid patch path');
    const parts = value.slice(1).split('/').map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (parts.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) throw Error('Unsafe patch path');
    return parts;
  };
  const bracket = parts => parts.map(key => '[' + JSON.stringify(key) + ']').join('');
  const recovered = [];
  try {
    for (const op of operations) {
      const parts = path(op.path ?? op.to), target = bracket(parts);
      const command = {full_match: JSON.stringify(op), reason: 'json_patch'};
      if (['replace','delta'].includes(op.op)) {
        if (!Object.hasOwn(op,'value') || (op.op === 'delta' && !Number.isFinite(op.value))) return false;
        recovered.push({...command, type: op.op === 'replace' ? 'set' : 'add', args: [target, JSON.stringify(op.value)]});
      } else if (['insert','add'].includes(op.op)) {
        if (!Object.hasOwn(op,'value')) return false;
        const key = parts.pop();
        recovered.push({...command, type:'insert', args:[bracket(parts), /^\d+$/.test(key) ? key : JSON.stringify(key), JSON.stringify(op.value)]});
      } else if (op.op === 'remove') recovered.push({...command, type:'delete', args:[target]});
      else if (op.op === 'move') recovered.push({...command, type:'move', args:[bracket(path(op.from)), target]});
      else return false;
    }
  } catch { return false; }
  commands.push(...recovered);
  return recovered.length > 0;
}

function inferRuleTagsFromItem(item, kind, name = '') {
  if (!item || typeof item !== 'object') return [];
  const text = `${item.名称 || item.name || name} ${item.描述 || item.details || ''} ${item.属性特征 || ''}`;
  const tags = [];
  const plusMatch = text.match(/([+-]\d+)\s*(?:魔化|附魔|加值|长剑|短剑|匕首|弓|弩|法杖|法器|盾|护甲|皮甲|链甲|板甲)/i)
    || String(item.名称 || item.name || name).match(/^\s*([+-]\d+)\s+/);
  if (plusMatch && !Number(item.魔法加值 ?? item.magicBonus ?? 0)) {
    const n = parseInt(plusMatch[1], 10);
    if (Number.isFinite(n) && n !== 0) {
      const sign = n > 0 ? `+${n}` : `${n}`;
      if (kind === 'weapon') {
        tags.push(`武器命中 ${sign}`, `武器伤害 ${sign}`, '需装备');
      } else if (/盾|甲|armor|shield|防护/i.test(text)) {
        tags.push(`AC ${sign}`, '需装备');
      }
    }
  }
  if (/防护斗篷|cloak of protection/i.test(text)) tags.push('AC +1', '全豁免 +1', '需装备', '需同调');
  if (/防护戒指|ring of protection/i.test(text)) tags.push('AC +1', '全豁免 +1', '需装备', '需同调');
  if (/食人魔力量护手|gauntlets of ogre power/i.test(text)) tags.push('力量 = 19', '需装备', '需同调');
  for (const elem of ['火焰', '寒冷', '闪电', '强酸', '毒素', '暗蚀', '光耀', '心灵', '雷鸣', '力场']) {
    if (new RegExp(`${elem}(?:伤害)?抗性`).test(text)) tags.push(`${elem}抗性`, '需装备');
    if (new RegExp(`${elem}(?:伤害)?免疫`).test(text)) tags.push(`${elem}免疫`, '需装备');
  }
  if (/潜行(?:检定)?(?:具有)?劣势/.test(text)) tags.push('潜行劣势', '需装备');
  if (/潜行(?:检定)?(?:具有)?优势/.test(text)) tags.push('潜行优势', '需装备');
  return Array.from(new Set(tags));
}

function syncEquipmentRuleTagsInVars(vars) {
  const list = vars?.stat_data?.角色列表;
  if (!list || typeof list !== 'object') return false;
  let changed = false;
  for (const char of Object.values(list)) {
    if (!char || typeof char !== 'object') continue;
    const activeSummary = [];
    const scanItems = (entries, kind) => {
      for (const [name, item] of entries) {
        if (!item || typeof item !== 'object') continue;
        const existing = Array.isArray(item.规则标签) ? item.规则标签.filter(Boolean) : [];
        if (!existing.length && !(item.effects || item.效果 || []).length) {
          const inferred = inferRuleTagsFromItem(item, kind, name);
          if (inferred.length) {
            item.规则标签 = inferred;
            changed = true;
          }
        }
        const tags = Array.isArray(item.规则标签) ? item.规则标签 : [];
        if (tags.includes('需同调') && item.需要同调 !== true) {
          item.需要同调 = true;
          changed = true;
        }
        const equipped = (item.已装备 === true || item.isEquipped === true) && (!tags.includes('需同调') || item.已同调 === true || item.isAttuned === true);
        if (tags.length && equipped) {
          activeSummary.push(`${item.名称 || item.name || name}(${tags.join(', ')})`);
        }
      }
    };
    for (const [name, item] of Object.entries(char.物品 || {})) {
      if (['武器', '护甲', '奇物', '杂物'].includes(name) && item && !item.类别 && !item.描述) {
        scanItems(Object.entries(item), name === '武器' ? 'weapon' : 'equipment');
      } else {
        scanItems([[name, item]], item?.类别 === '武器' || item?.伤害公式 ? 'weapon' : 'equipment');
      }
    }
    const summaryText = activeSummary.join('；');
    if (summaryText && char.生效装备效果 !== summaryText) {
      char.生效装备效果 = summaryText;
      changed = true;
    } else if (!summaryText && Object.hasOwn(char, '生效装备效果')) {
      delete char.生效装备效果;
      changed = true;
    }
  }
  return changed;
}

function mountMvuMaintenance() {
  if (typeof eventOn !== 'function') return;
  eventOn('mag_command_parsed', (vars, commands, text) => {
    cleanMvuAuxiliaryData(vars);
    syncEquipmentRuleTagsInVars(vars);
    recoverMvuCommands(text, commands);
  });
  eventOn('mag_variable_update_ended', vars => { cleanMvuAuxiliaryData(vars); syncEquipmentRuleTagsInVars(vars); });
  eventOn('mag_variable_initialized', vars => { cleanMvuAuxiliaryData(vars); syncEquipmentRuleTagsInVars(vars); });
}
if (typeof $ === 'function') $(() => mountMvuMaintenance());
