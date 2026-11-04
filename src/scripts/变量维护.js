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
        ['头像', '玩家名'].includes(key) && typeof value === 'string' && value.trim() &&
        value !== 'systems/dnd5e/icons/svg/actors/character.svg'));
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

function mountMvuMaintenance() {
  if (typeof eventOn !== 'function') return;
  eventOn('mag_command_parsed', (vars, commands, text) => {
    cleanMvuAuxiliaryData(vars);
    recoverMvuCommands(text, commands);
  });
  eventOn('mag_variable_update_ended', vars => { cleanMvuAuxiliaryData(vars); });
  eventOn('mag_variable_initialized', vars => { cleanMvuAuxiliaryData(vars); });
}
if (typeof $ === 'function') $(() => mountMvuMaintenance());
