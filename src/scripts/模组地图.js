// D&D 2024 Module Runner Core (5e.kiwee.top Parser, Smart Map Classifier, Topology Builder & 1-Step Lookahead Worldbook Engine)
function createModuleRunnerCore(options = {}) {
  const BASE_URL = options.baseUrl || 'https://5e.kiwee.top';

  const META_TITLE_RE = /^(?:运作冒险|比例和方格|罗盘玫瑰|扮演与激励|使用魔法物品|冒险模组测试员|制作组|地图|角色等级|经验值奖励|Running the Adventure|Scale and Grid|Compass Rose|Roleplaying and Inspiration|Maps|Character Advancement)$/i;
  const META_TEXT_RE = /本书内容为地下城主而设|与本书配套的另一本小册子|本冒险中出现的地图仅供地下城主查看|在这本书的页边空白处|就像奇幻小说或电影一样，冒险发生在一个更广阔的世界中|在国度的大道与河流上，旅行着吟游诗人|本系列中的每个角色都有两个个性特点|当玩家扮演负面个性特点或屈服于牵挂|查阅附录\s*B\s*中的.*资料卡。由于.*正在躲藏，你需要知道|使用规则书中的先攻规则来决定谁第一/;

  function isBoilerplateTitle(title) {
    return META_TITLE_RE.test(String(title || '').trim());
  }

  function isBoilerplateParagraph(text) {
    return META_TEXT_RE.test(String(text || '').trim());
  }

  function encodeImgPath(relPath) {
    if (!relPath) return '';
    if (/^https?:\/\//i.test(relPath)) return relPath;
    return BASE_URL + '/img/' + String(relPath).split('/').map(seg => encodeURIComponent(seg)).join('/');
  }

  function extractEntityRefs(node) {
    const raw = typeof node === 'string' ? node : JSON.stringify(node || {});
    const creatures = new Map();
    const areas = new Map();
    const items = new Set();
    const dcs = new Set();

    for (const m of raw.matchAll(/\{@creature\s+([^|}]+)(?:\|([^|}]+))?(?:\|([^}]*))?\}/gi)) {
      const name = m[1].trim();
      const source = (m[2] || 'MM').trim() || 'MM';
      const display = (m[3] || name).trim();
      const key = `${name.toLowerCase()}|${source.toUpperCase()}`;
      if (!creatures.has(key)) creatures.set(key, { name, source, display, key });
    }
    for (const m of raw.matchAll(/\{@area\s+([^|}]+)\|([^|}]+)(?:\|([^}]*))?\}/gi)) {
      const label = m[1].trim();
      const areaId = m[2].trim();
      if (areaId && !areas.has(areaId)) areas.set(areaId, { label, areaId });
    }
    for (const m of raw.matchAll(/\{@item\s+([^|}]+)(?:\|([^|}]+))?(?:\|([^}]*))?\}/gi)) {
      items.add((m[3] || m[1]).trim());
    }
    for (const m of raw.matchAll(/\{@dc\s+(\d+)\}/gi)) {
      dcs.add('DC ' + m[1]);
    }
    return {
      creatures: [...creatures.values()],
      areas: [...areas.values()],
      items: [...items],
      dcs: [...dcs],
    };
  }

  function strip5eTags(input) {
    if (!input) return '';
    let s = String(input);
    s = s.replace(/\{@creature\s+([^|}]+)(?:\|([^|}]+))?(?:\|([^|}]+))?(?:\|[^}]*)?\}/gi, (_, name, _src, disp) => `【生物:${(disp || name).trim()}】`);
    s = s.replace(/\{@area\s+([^|}]+)\|([^|}]+)(?:\|[^}]*)?\}/gi, (_, label, id) => `[区域${label.trim()}(#${id.trim()})]`);
    s = s.replace(/\{@item\s+([^|}]+)(?:\|([^|}]+))?(?:\|([^|}]+))?(?:\|[^}]*)?\}/gi, (_, name, _src, disp) => `【物品:${(disp || name).trim()}】`);
    s = s.replace(/\{@spell\s+([^|}]+)(?:\|([^|}]+))?(?:\|([^|}]+))?(?:\|[^}]*)?\}/gi, (_, name, _src, disp) => `《${(disp || name).trim()}》`);
    s = s.replace(/\{@(?:condition|status)\s+([^|}]+)(?:\|([^|}]+))?(?:\|([^|}]+))?(?:\|[^}]*)?\}/gi, (_, name, _src, disp) => `[状态:${(disp || name).trim()}]`);
    s = s.replace(/\{@skill\s+([^|}]+)(?:\|[^}]*)?\}/gi, (_, name) => `[技能:${name.trim()}]`);
    s = s.replace(/\{@action\s+([^|}]+)(?:\|[^}]*)?\}/gi, (_, name) => `[动作:${name.trim()}]`);
    s = s.replace(/\{@sense\s+([^|}]+)(?:\|[^}]*)?\}/gi, (_, name) => `[感官:${name.trim()}]`);
    s = s.replace(/\{@dc\s+([^|}]+)(?:\|[^}]*)?\}/gi, (_, dc) => `DC ${dc.trim()}`);
    s = s.replace(/\{@hit\s+([^|}]+)(?:\|[^}]*)?\}/gi, (_, n) => {
      const v = n.trim();
      return v.startsWith('+') || v.startsWith('-') ? v : `+${v}`;
    });
    s = s.replace(/\{@h\}/gi, '命中：');
    s = s.replace(/\{@atk\s+([^}]+)\}/gi, (_, t) => {
      const code = t.trim().toLowerCase();
      if (code === 'mw') return '近战武器攻击：';
      if (code === 'rw') return '远程武器攻击：';
      if (code === 'mw,rw' || code === 'rw,mw') return '近战或远程武器攻击：';
      if (code === 'ms') return '近战法术攻击：';
      if (code === 'rs') return '远程法术攻击：';
      return '攻击检定：';
    });
    s = s.replace(/\{@(?:dice|damage|scaledice|scaledamage|d20)\s+([^|}]+)(?:\|[^}]*)?\}/gi, (_, expr) => expr.trim());
    s = s.replace(/\{@quickref\s+([^|}]+)(?:\|[^|}]*){0,2}(?:\|([^|}]+))?(?:\|[^}]*)?\}/gi, (_, first, disp) => (disp || first).trim());
    s = s.replace(/\{@adventure\s+([^|}]+)\|([^|}]+)(?:\|([^|}]+))?(?:\|[^}]*)?\}/gi, (_, text, _adv, chap) => (chap || text).trim());
    s = s.replace(/\{@book\s+([^|}]+)(?:\|[^}]*)?\}/gi, (_, text) => `《${text.trim()}》`);
    s = s.replace(/\{@[a-zA-Z0-9_]+\s+([^|}]+)(?:\|([^|}]+))?(?:\|([^|}]+))?(?:\|[^}]*)?\}/g, (_, a, _b, c) => (c || a).trim());
    return s.replace(/\s+\n/g, '\n').trim();
  }

  function renderEntriesToText(node, opts = {}) {
    const includeReadAloud = opts.includeReadAloud !== false;
    const onlyReadAloud = opts.onlyReadAloud === true;
    const maxDepth = opts.maxDepth ?? 6;
    const lines = [];

    function walk(entry, depth) {
      if (entry == null || depth > maxDepth) return;
      if (typeof entry === 'string') {
        if (!onlyReadAloud && !isBoilerplateParagraph(entry)) {
          lines.push(strip5eTags(entry));
        }
        return;
      }
      if (typeof entry !== 'object') return;
      if (entry.type === 'image' || entry.type === 'gallery') return;
      if (entry.name && isBoilerplateTitle(entry.name)) return;

      const isReadAloud = entry.type === 'insetReadaloud';
      if (isReadAloud) {
        if (!includeReadAloud && !onlyReadAloud) return;
        const inner = (entry.entries || []).map(e => typeof e === 'string' ? strip5eTags(e) : renderEntriesToText(e, { includeReadAloud: true, onlyReadAloud: false })).filter(Boolean).join('\n');
        if (inner) lines.push(onlyReadAloud ? inner : `> 【朗读/初见描写】\n> ${inner.replace(/\n/g, '\n> ')}`);
        return;
      }

      if (onlyReadAloud) {
        if (Array.isArray(entry.entries)) entry.entries.forEach(c => walk(c, depth + 1));
        if (Array.isArray(entry.items)) entry.items.forEach(c => walk(c, depth + 1));
        return;
      }

      if (entry.type === 'list' && Array.isArray(entry.items)) {
        for (const item of entry.items) {
          if (typeof item === 'string') {
            if (!isBoilerplateParagraph(item)) lines.push(`- ${strip5eTags(item)}`);
          } else if (item && typeof item === 'object') {
            if (item.name && isBoilerplateTitle(item.name)) continue;
            const head = item.name ? `**${strip5eTags(item.name)}**：` : '';
            const body = item.entry ? strip5eTags(item.entry) : Array.isArray(item.entries) ? item.entries.map(x => typeof x === 'string' ? strip5eTags(x) : renderEntriesToText(x, opts)).join(' ') : '';
            if (!isBoilerplateParagraph(body)) lines.push(`- ${head}${body}`);
          }
        }
        return;
      }

      if (entry.type === 'table' && Array.isArray(entry.rows)) {
        if (entry.caption) lines.push(`【表：${strip5eTags(entry.caption)}】`);
        if (Array.isArray(entry.colLabels)) lines.push(`| ${entry.colLabels.map(strip5eTags).join(' | ')} |`);
        for (const row of entry.rows.slice(0, 15)) {
          if (Array.isArray(row)) {
            lines.push(`| ${row.map(cell => typeof cell === 'string' ? strip5eTags(cell) : renderEntriesToText(cell, opts).replace(/\n/g, ' ')).join(' | ')} |`);
          }
        }
        return;
      }

      if (entry.name && depth > 0) {
        const prefix = depth === 1 ? '#### ' : '##### ';
        lines.push(`${prefix}${strip5eTags(entry.name)}${entry.ENG_name && entry.ENG_name !== entry.name ? ` (${entry.ENG_name})` : ''}`);
      }
      if (entry.entry && !isBoilerplateParagraph(entry.entry)) lines.push(strip5eTags(entry.entry));
      if (Array.isArray(entry.entries)) {
        entry.entries.forEach(c => walk(c, depth + 1));
      }
    }

    walk(node, 0);
    return lines.filter(Boolean).join('\n');
  }

  function formatMonsterStatblock(m) {
    if (!m || typeof m !== 'object') return '';
    // Skip plot-only NPC entries that have no combat stats
    if (m.ac == null && m.hp == null && !Array.isArray(m.action) && !Array.isArray(m.trait)) {
      return '';
    }
    const mod = v => {
      const n = Math.floor(((Number(v) || 10) - 10) / 2);
      return n >= 0 ? `+${n}` : `${n}`;
    };
    const acVal = Array.isArray(m.ac)
      ? m.ac.map(x => typeof x === 'object' ? `${x.ac}${x.from ? ` (${x.from.map(strip5eTags).join(', ')})` : ''}` : x).join(', ')
      : (m.ac ?? '?');
    const hpVal = m.hp ? `${m.hp.average ?? '?'} (${m.hp.formula || ''})` : '?';
    const spdVal = m.speed
      ? Object.entries(m.speed).map(([k, v]) => `${k === 'walk' ? '步行' : k === 'fly' ? '飞行' : k === 'swim' ? '游泳' : k === 'climb' ? '攀爬' : k === 'burrow' ? '掘穴' : k} ${typeof v === 'object' ? v.number : v}尺`).join(', ')
      : '30尺';
    const crVal = typeof m.cr === 'object' ? (m.cr.cr || '?') : (m.cr ?? '?');
    const stats = m.str != null
      ? `力量${m.str}(${mod(m.str)}) 敏捷${m.dex}(${mod(m.dex)}) 体质${m.con}(${mod(m.con)}) 智力${m.int}(${mod(m.int)}) 感知${m.wis}(${mod(m.wis)}) 魅力${m.cha}(${mod(m.cha)})`
      : '';
    const parts = [
      `▸ **${m.name}${m.ENG_name ? ` (${m.ENG_name})` : ''}** [CR ${crVal} | AC: ${acVal} | HP: ${hpVal} | 速度: ${spdVal}]`,
    ];
    if (stats) parts.push(`  属性: ${stats}${m.passive != null ? ` | 被动察觉: ${m.passive}` : ''}`);
    if (m.skill) {
      parts.push(`  技能: ${Object.entries(m.skill).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
    if (Array.isArray(m.senses) && m.senses.length) {
      parts.push(`  感官: ${m.senses.map(strip5eTags).join(', ')}`);
    }
    for (const [secKey, label] of [['trait', '特质'], ['action', '动作'], ['bonus', '附赠动作'], ['reaction', '反应'], ['legendary', '传奇动作']]) {
      if (Array.isArray(m[secKey]) && m[secKey].length) {
        const items = m[secKey].map(item => `[${strip5eTags(item.name)}] ${(item.entries || []).map(e => typeof e === 'string' ? strip5eTags(e) : renderEntriesToText(e)).join(' ')}`).join('；');
        parts.push(`  ${label}: ${items}`);
      }
    }
    return parts.join('\n');
  }

  function distPtSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function polygonDistance(p1, p2) {
    if (!Array.isArray(p1) || !Array.isArray(p2) || !p1.length || !p2.length) return Infinity;
    let min = Infinity;
    for (let i = 0; i < p1.length; i++) {
      const [ax, ay] = p1[i];
      const [bx, by] = p1[(i + 1) % p1.length];
      for (let j = 0; j < p2.length; j++) {
        const [cx, cy] = p2[j];
        const [dx, dy] = p2[(j + 1) % p2.length];
        min = Math.min(min, distPtSeg(ax, ay, cx, cy, dx, dy), distPtSeg(cx, cy, ax, ay, bx, by));
      }
    }
    return Math.round(min);
  }

  function pointInPolygon(px, py, points) {
    if (!Array.isArray(points) || points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i][0], yi = points[i][1];
      const xj = points[j][0], yj = points[j][1];
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function computePolygonCentroid(points) {
    if (!Array.isArray(points) || !points.length) return { cx: 0, cy: 0 };
    let sx = 0, sy = 0;
    for (const [x, y] of points) {
      sx += Number(x) || 0;
      sy += Number(y) || 0;
    }
    return { cx: sx / points.length, cy: sy / points.length };
  }

  function compassDirection(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return '同处';
    const angle = Math.atan2(-dy, dx) * 180 / Math.PI;
    const dirs = ['东', '东北', '北', '西北', '西', '西南', '南', '东南'];
    return dirs[Math.round(((angle + 360) % 360) / 45) % 8];
  }

  function extractAreaContextNote(rawNode, targetAreaId) {
    const rawText = renderEntriesToText(rawNode, { includeReadAloud: true, maxDepth: 2 });
    const sentences = rawText.split(/[。！？\n]+/);
    const token = `#${targetAreaId}`;
    for (const s of sentences) {
      if (s.includes(token)) {
        const clean = s.replace(/^>\s*/, '').trim();
        return clean.length > 56 ? clean.slice(0, 56) + '…' : clean;
      }
    }
    return '';
  }

  function buildPublicRoomSummary(roomNode, readAloudText) {
    if (readAloudText) {
      const firstPara = readAloudText.split(/\n+/)[0].trim();
      return firstPara.length > 140 ? firstPara.slice(0, 140) + '…' : firstPara;
    }
    if (roomNode && Array.isArray(roomNode.entries)) {
      for (const e of roomNode.entries) {
        if (typeof e === 'string' && e.trim() && !isBoilerplateParagraph(e)) {
          const clean = strip5eTags(e.trim());
          const firstSentence = clean.split(/[。！？]/)[0];
          if (firstSentence) return firstSentence + '。';
        }
      }
    }
    return '尚未知晓内部详情，需靠近侦察或进入探索。';
  }

  function classifyMapKind(img, sectionName, rawRegionsCount) {
    const grid = img.grid || {};
    const title = `${img.title || ''} ${sectionName || ''}`;
    if (grid.units === 'miles' || grid.units === 'leagues' || /^hex/i.test(grid.type || '')) {
      return 'overworld';
    }
    if (grid.type === 'square') {
      return 'dungeon';
    }
    if (grid.type === 'none' || /小镇|城镇|城市|聚落|村庄|Phandalin|Town|City|Village/i.test(title)) {
      return 'settlement';
    }
    return rawRegionsCount > 0 ? 'dungeon' : 'overworld';
  }

  function compileAdventureData(advId, advMeta, rawJson) {
    const sections = rawJson?.adventureData?.[0]?.data || rawJson?.data || [];
    const nodeById = new Map();

    function indexTree(node, path = []) {
      if (!node || typeof node !== 'object') return;
      const curPath = node.name ? [...path, node.name] : path;
      if (node.id) {
        nodeById.set(node.id, { id: node.id, name: node.name || '', ENG_name: node.ENG_name || '', path: curPath, node });
      }
      if (Array.isArray(node.entries)) {
        node.entries.forEach(c => indexTree(c, curPath));
      }
    }
    sections.forEach(sec => indexTree(sec, []));

    // Extract global campaign foundation from Introduction (Sec 0) if it is an intro section
    const campaignBaseParts = [];
    const firstSec = sections[0];
    const isFirstSecIntro = firstSec && /^(?:简介|引言|导言|前言|Introduction|Prologue)$/i.test(firstSec.name || firstSec.ENG_name || '');
    if (isFirstSecIntro && Array.isArray(firstSec.entries)) {
      for (const item of firstSec.entries) {
        if (!item || typeof item !== 'object') continue;
        if (isBoilerplateTitle(item.name)) continue;
        if (/被遗忘的国度|The Forgotten Realms/i.test(item.name || '')) continue;
        const rendered = renderEntriesToText(item, { includeReadAloud: true, maxDepth: 3 });
        if (rendered) {
          campaignBaseParts.push(`##### 【${strip5eTags(item.name)}】\n${rendered}`);
        }
      }
    }
    const campaignBase = campaignBaseParts.join('\n\n');

    const rawMaps = [];
    const chapters = [];
    const mappedRoomIds = new Set();

    sections.forEach((sec, secIdx) => {
      const chapIntro = [];
      if (Array.isArray(sec.entries)) {
        for (const e of sec.entries) {
          if (typeof e === 'string') {
            if (!isBoilerplateParagraph(e)) chapIntro.push(strip5eTags(e));
          } else if (e && typeof e === 'object' && e.type !== 'section' && chapIntro.length < 4 && Array.isArray(e.entries)) {
            if (isBoilerplateTitle(e.name)) continue;
            const sub = e.entries.filter(x => typeof x === 'string' && !isBoilerplateParagraph(x)).slice(0, 2).map(strip5eTags).join(' ');
            if (sub) chapIntro.push(`${e.name ? `【${strip5eTags(e.name)}】` : ''}${sub}`);
          }
        }
      }
      chapters.push({
        index: secIdx,
        id: sec.id || `sec-${secIdx}`,
        name: sec.name || `第 ${secIdx + 1} 章`,
        ENG_name: sec.ENG_name || '',
        isIntro: secIdx === 0 && isFirstSecIntro,
        summary: chapIntro.slice(0, 4).join('\n'),
      });

      function scanMaps(node, path = [], enclosingSection = sec) {
        if (!node || typeof node !== 'object') return;
        const curPath = node.name ? [...path, node.name] : path;
        const nextSection = (node.type === 'section' || (node.type === 'entries' && Array.isArray(node.entries) && node.entries.some(c => c?.type === 'image' || c?.type === 'gallery')))
          ? node
          : enclosingSection;

        const processImg = (img) => {
          if (!img || typeof img !== 'object') return;
          const isMap = img.imageType === 'map' || (Array.isArray(img.mapRegions) && img.mapRegions.length > 0);
          if (!isMap) return;
          const mapId = img.id || `map-${rawMaps.length + 1}`;
          const rawRegions = Array.isArray(img.mapRegions) ? img.mapRegions : [];
          const mapKind = classifyMapKind(img, nextSection?.name || sec.name, rawRegions.length);
          const requiresFog = mapKind === 'dungeon';

          const generalNotes = [];
          if (nextSection && Array.isArray(nextSection.entries)) {
            for (const item of nextSection.entries) {
              if (typeof item === 'string') {
                if (!isBoilerplateParagraph(item)) generalNotes.push(strip5eTags(item));
              } else if (item && typeof item === 'object' && item.name && !/^[A-Z]?\d+[a-z]?[.\s、]/.test(item.name) && item.type !== 'gallery' && item.type !== 'image') {
                if (isBoilerplateTitle(item.name)) continue;
                const subText = renderEntriesToText(item, { maxDepth: 2 });
                if (subText && subText.length < 750 && !isBoilerplateParagraph(subText)) generalNotes.push(subText);
              }
            }
          }

          const roomMap = new Map();
          for (const reg of rawRegions) {
            if (!reg.area || !Array.isArray(reg.points) || reg.points.length < 3) continue;
            mappedRoomIds.add(reg.area);
            if (nextSection?.id) mappedRoomIds.add(nextSection.id);
            const info = nodeById.get(reg.area);
            const roomNode = info?.node || { id: reg.area, name: `区域 ${reg.area}`, entries: [] };
            if (!roomMap.has(reg.area)) {
              const readAloud = renderEntriesToText(roomNode, { onlyReadAloud: true });
              const fullText = renderEntriesToText(roomNode, { includeReadAloud: true, maxDepth: 4 });
              const dmDetails = renderEntriesToText(roomNode, { includeReadAloud: false, maxDepth: 4 });
              const refs = extractEntityRefs(roomNode);
              roomMap.set(reg.area, {
                id: reg.area,
                name: strip5eTags(roomNode.name || `区域 ${reg.area}`),
                ENG_name: roomNode.ENG_name || '',
                isStoryNode: false,
                polygons: [],
                readAloud,
                dmDetails: dmDetails || fullText,
                fullText,
                publicSummary: buildPublicRoomSummary(roomNode, readAloud),
                refs,
                rawNode: roomNode,
              });
            }
            roomMap.get(reg.area).polygons.push(reg.points);
          }

          const findSafeInteriorPoint = (poly, bbox, cxGuess, cyGuess) => {
            const minDistToEdges = (px, py) => {
              let best = Infinity;
              for (let i = 0; i < poly.length; i++) {
                const a = poly[i], b = poly[(i + 1) % poly.length];
                const abx = b[0] - a[0], aby = b[1] - a[1];
                const lenSq = abx * abx + aby * aby;
                const t = lenSq > 1e-6 ? Math.max(0, Math.min(1, ((px - a[0]) * abx + (py - a[1]) * aby) / lenSq)) : 0;
                const d = Math.hypot(px - (a[0] + abx * t), py - (a[1] + aby * t));
                if (d < best) best = d;
              }
              return best;
            };
            if (pointInPolygon(cxGuess, cyGuess, poly) && minDistToEdges(cxGuess, cyGuess) >= 24) {
              return [cxGuess, cyGuess];
            }
            let bestPt = [cxGuess, cyGuess];
            let bestClearance = -1;
            const steps = 9;
            for (let ix = 1; ix < steps; ix++) {
              const px = bbox.minX + (bbox.width * ix) / steps;
              for (let iy = 1; iy < steps; iy++) {
                const py = bbox.minY + (bbox.height * iy) / steps;
                if (!pointInPolygon(px, py, poly)) continue;
                const clearance = minDistToEdges(px, py);
                if (clearance > bestClearance) {
                  bestClearance = clearance;
                  bestPt = [Math.round(px), Math.round(py)];
                }
              }
            }
            return bestPt;
          };

          const rooms = [...roomMap.values()].map(r => {
            const allPts = r.polygons.flat();
            const xs = allPts.map(p => p[0]);
            const ys = allPts.map(p => p[1]);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const bbox = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
            const rawCx = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
            const rawCy = Math.round(ys.reduce((a, b) => a + b, 0) / ys.length);
            const [cx, cy] = findSafeInteriorPoint(r.polygons[0], bbox, rawCx, rawCy);
            return {
              ...r,
              points: r.polygons[0],
              cx,
              cy,
              bbox,
            };
          });

          rooms.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }));

          const grid = img.grid || { type: 'square', size: Math.round(Math.min(img.width || 3000, img.height || 3000) / 22) };
          const gridSize = grid.size || 150;
          const ftPerGrid = (grid.scale || 1) * 5;

          const roomById = new Map(rooms.map(r => [r.id, r]));
          for (const r1 of rooms) {
            const edgeMap = new Map();
            for (const areaRef of r1.refs.areas) {
              const r2 = roomById.get(areaRef.areaId);
              if (!r2 || r2.id === r1.id) continue;
              const dPx = polygonDistance(r1.points, r2.points);
              const dir = compassDirection(r1.cx, r1.cy, r2.cx, r2.cy);
              const note = extractAreaContextNote(r1.rawNode, r2.id);
              edgeMap.set(r2.id, {
                toId: r2.id,
                toName: r2.name,
                dir,
                distPx: dPx,
                distFt: Math.max(5, Math.round((dPx / gridSize) * ftPerGrid / 5) * 5),
                kind: 'text',
                note,
              });
            }
            for (const r2 of rooms) {
              if (r1.id === r2.id) continue;
              const dPx = polygonDistance(r1.points, r2.points);
              if (dPx <= gridSize * 1.6) {
                const existing = edgeMap.get(r2.id);
                if (existing) {
                  existing.kind = 'both';
                } else {
                  edgeMap.set(r2.id, {
                    toId: r2.id,
                    toName: r2.name,
                    dir: compassDirection(r1.cx, r1.cy, r2.cx, r2.cy),
                    distPx: dPx,
                    distFt: Math.max(5, Math.round((dPx / gridSize) * ftPerGrid / 5) * 5),
                    kind: 'geo',
                    note: '空间毗邻通道',
                  });
                }
              }
            }
            r1.edges = [...edgeMap.values()];
            delete r1.rawNode;
          }

          for (const r1 of rooms) {
            for (const e of r1.edges) {
              const r2 = roomById.get(e.toId);
              if (r2 && !r2.edges.some(x => x.toId === r1.id)) {
                r2.edges.push({
                  toId: r1.id,
                  toName: r1.name,
                  dir: compassDirection(r2.cx, r2.cy, r1.cx, r1.cy),
                  distPx: e.distPx,
                  distFt: e.distFt,
                  kind: e.kind,
                  note: e.note ? `连通自 ${r1.name}` : '空间毗邻通道',
                });
              }
            }
          }

          const hrefPath = img.href?.path || '';
          const hrefBase = hrefPath.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '').replace(/\s*\((?:player|dm)\)\s*$/i, '').trim() || '';
          const mapObj = {
            id: mapId,
            title: strip5eTags(img.title || nextSection?.name || sec.name || `地图 ${rawMaps.length + 1}`),
            engTitle: strip5eTags(nextSection?.ENG_name || hrefBase || img.title || ''),
            hrefPath,
            mapKind,
            requiresFog,
            chapterIndex: secIdx,
            chapterName: sec.name || `第 ${secIdx + 1} 章`,
            sectionName: nextSection?.name || sec.name || '',
            path: curPath.join(' > '),
            imageUrl: encodeImgPath(hrefPath),
            thumbnailUrl: encodeImgPath(img.hrefThumbnail?.path || hrefPath),
            width: img.width || 2048,
            height: img.height || 1536,
            grid,
            generalNotes: generalNotes.slice(0, 4).join('\n\n'),
            rooms,
            walls: [],
            wallSource: 'polygon',
          };
          mapObj.walls = buildMapWallNetwork(mapObj);
          rawMaps.push(mapObj);
        };

        if (node.type === 'image') processImg(node);
        if (node.type === 'gallery' && Array.isArray(node.images)) {
          node.images.forEach(processImg);
        }
        if (Array.isArray(node.entries)) {
          node.entries.forEach(c => scanMaps(c, curPath, nextSection));
        }
      }

      scanMaps(sec, [], sec);
    });

    // Attach chapter-level unmapped story/overland encounter sections cleanly
    // NOTE: Skip Sec 0 (Intro) so "背景/概述/冒险引子" are kept in campaignBase instead of becoming fake map rooms!
    const introOverworldMap = rawMaps.find(m => m.chapterIndex === 0 && m.mapKind === 'overworld');

    sections.forEach((sec, secIdx) => {
      if (secIdx === 0 && isFirstSecIntro) return;
      if (!Array.isArray(sec.entries)) return;
      if (/^附录|制作组|Appendix|Credits/i.test(sec.name || sec.ENG_name || '')) return;

      const chapterMaps = rawMaps.filter(m => m.chapterIndex === secIdx);
      const unmappedNodes = [];
      for (const e of sec.entries) {
        if (!e || typeof e !== 'object' || !e.id || !e.name) continue;
        if (mappedRoomIds.has(e.id)) continue;
        if (isBoilerplateTitle(e.name) || /后续？|结局|游荡怪物|通用特征/.test(e.name)) continue;
        const rawStr = JSON.stringify(e);
        if (chapterMaps.some(m => rawStr.includes(`"id":"${m.id}"`) || e.name === m.sectionName || e.name === m.title)) continue;
        unmappedNodes.push(e);
      }
      if (!unmappedNodes.length) return;

      // Case A: Chapter has an overworld map (e.g. Ch 3 Sword Coast #1b2) -> attach overland encounters as Story Nodes (no fake polygons on canvas!)
      const overworldMap = chapterMaps.find(m => m.mapKind === 'overworld');
      if (overworldMap) {
        unmappedNodes.forEach((node) => {
          const readAloud = renderEntriesToText(node, { onlyReadAloud: true });
          const fullText = renderEntriesToText(node, { includeReadAloud: true, maxDepth: 4 });
          const dmDetails = renderEntriesToText(node, { includeReadAloud: false, maxDepth: 4 });
          overworldMap.rooms.push({
            id: node.id,
            name: strip5eTags(node.name),
            ENG_name: node.ENG_name || '',
            isStoryNode: true,
            polygons: [],
            points: [],
            cx: null,
            cy: null,
            bbox: null,
            readAloud,
            dmDetails: dmDetails || fullText,
            fullText,
            publicSummary: buildPublicRoomSummary(node, readAloud),
            refs: extractEntityRefs(node),
            edges: [],
          });
        });
        for (let i = 0; i < overworldMap.rooms.length; i++) {
          const cur = overworldMap.rooms[i];
          if (i + 1 < overworldMap.rooms.length) {
            const nxt = overworldMap.rooms[i + 1];
            cur.edges.push({ toId: nxt.id, toName: nxt.name, dir: '下一阶段', distPx: 0, distFt: 0, kind: 'text', note: '章节荒野探索节点' });
            nxt.edges.push({ toId: cur.id, toName: cur.name, dir: '上一阶段', distPx: 0, distFt: 0, kind: 'text', note: '章节荒野探索节点' });
          }
        }
        return;
      }

      // Case B: Chapter 1 has an opening overland encounter (e.g. 地精伏击 #00e) before a dungeon map (克拉摩窝点 #1ab),
      // and Intro had the regional overworld map (剑湾 #1b0) -> Repurpose the Intro Overworld map as Chapter 1's Overworld Opening Scene!
      if (secIdx === 1 && introOverworldMap && introOverworldMap.rooms.length === 0) {
        introOverworldMap.chapterIndex = 1;
        introOverworldMap.chapterName = sec.name || '第 1 章';
        introOverworldMap.title = `${introOverworldMap.title} · ${unmappedNodes.map(n => strip5eTags(n.name)).join('/')}`;
        unmappedNodes.forEach((node) => {
          const readAloud = renderEntriesToText(node, { onlyReadAloud: true });
          const fullText = renderEntriesToText(node, { includeReadAloud: true, maxDepth: 4 });
          const dmDetails = renderEntriesToText(node, { includeReadAloud: false, maxDepth: 4 });
          introOverworldMap.rooms.push({
            id: node.id,
            name: strip5eTags(node.name),
            ENG_name: node.ENG_name || '',
            isStoryNode: true,
            polygons: [],
            points: [],
            cx: null,
            cy: null,
            bbox: null,
            readAloud,
            dmDetails: dmDetails || fullText,
            fullText,
            publicSummary: buildPublicRoomSummary(node, readAloud),
            refs: extractEntityRefs(node),
            edges: [],
          });
        });
        return;
      }

      // Case C: Settlement map (e.g. 凡达林 #1b1 has 凡达林的遭遇, 重要NPC, 红标帮恶霸) -> append to settlement generalNotes & story nodes
      const settlementMap = chapterMaps.find(m => m.mapKind === 'settlement') || chapterMaps[0];
      if (settlementMap) {
        const extraNotes = [];
        for (const node of unmappedNodes) {
          const readAloud = renderEntriesToText(node, { onlyReadAloud: true });
          const fullText = renderEntriesToText(node, { includeReadAloud: true, maxDepth: 4 });
          if (/重要NPC|遭遇/.test(node.name)) {
            extraNotes.push(`#### 【${strip5eTags(node.name)}】\n${fullText}`);
          } else {
            const firstRoom = settlementMap.rooms[0];
            const sRoom = {
              id: node.id,
              name: `★ ${strip5eTags(node.name)}`,
              ENG_name: node.ENG_name || '',
              isStoryNode: true,
              polygons: [],
              points: [],
              cx: null,
              cy: null,
              bbox: null,
              readAloud,
              dmDetails: fullText,
              fullText,
              publicSummary: buildPublicRoomSummary(node, readAloud),
              refs: extractEntityRefs(node),
              edges: firstRoom ? [{ toId: firstRoom.id, toName: firstRoom.name, dir: '关联地点', distPx: 0, distFt: 0, kind: 'text', note: '城镇事件节点' }] : [],
            };
            settlementMap.rooms.push(sRoom);
          }
        }
        if (extraNotes.length) {
          settlementMap.generalNotes = [settlementMap.generalNotes, ...extraNotes].filter(Boolean).join('\n\n');
        }
      }
    });

    // Establish cross-map progression links (nextMapId / nextEntryRoomId) so 1-Step Lookahead knows what scene comes next!
    const maps = rawMaps.filter(m => !(m.chapterIndex === 0 && isFirstSecIntro && m.rooms.length === 0 && rawMaps.length > 1));
    for (let i = 0; i < maps.length; i++) {
      const curMap = maps[i];
      const nextMap = maps[i + 1] || null;
      if (nextMap) {
        curMap.nextMapId = nextMap.id;
        curMap.nextMapTitle = nextMap.title;
        curMap.nextEntryRoomId = nextMap.rooms[0]?.id || '';
      }
    }

    return {
      id: advId,
      name: advMeta?.name || advId,
      ENG_name: advMeta?.ENG_name || '',
      level: advMeta?.level || null,
      storyline: advMeta?.storyline || '',
      campaignBase,
      chapters,
      maps,
    };
  }

  function formatFloorTopologyText(map, state = {}) {
    if (!map) return '';
    const explored = new Set(state.exploredRooms || []);
    const cleared = new Set(state.clearedRooms || []);
    const curId = state.currentRoomId || '';
    const kindLabel = map.mapKind === 'overworld' ? '🌍 区域大地图（无战争迷雾）' : map.mapKind === 'settlement' ? '🏘️ 城镇导览图（无战争迷雾）' : '🏰 探索地城（多边形迷雾）';

    if (!map.rooms || !map.rooms.length) {
      return `[当前场景：${map.title} (${map.chapterName}) | 类型：${kindLabel}]`;
    }
    const lines = [
      `[本场景结构：${map.title} (${map.chapterName}) | 类型：${kindLabel} | 共 ${map.rooms.length} 个节点]`,
    ];
    for (const r of map.rooms) {
      const tags = [];
      if (r.id === curId) tags.push('★当前位置');
      if (map.requiresFog) {
        if (cleared.has(r.id)) tags.push('✓已清理');
        else if (explored.has(r.id)) tags.push('✓已探索');
        else tags.push('?未探索');
      }
      const edgeStr = r.edges?.length
        ? r.edges.map(e => `[向${e.dir}]→#${e.toId} ${e.toName}`).join(' ； ')
        : (map.nextMapId ? `[后续转场]→地图 #${map.nextMapId} 《${map.nextMapTitle}》` : '独立节点');
      lines.push(`- [#${r.id}] ${r.name}${tags.length ? ` (${tags.join('/')})` : ''} ⟹ ${edgeStr}`);
    }
    if (map.nextMapId) {
      lines.push(`- [跨场景衔接] 完成本场景后可推进至下一场景地图：[#${map.nextMapId}] 《${map.nextMapTitle}》${map.nextEntryRoomId ? ` (起始节点 #${map.nextEntryRoomId})` : ''}`);
    }
    return lines.join('\n');
  }

  function collectMonsterStatblocks(rooms, monsterBank) {
    const seen = new Set();
    const lines = [];
    for (const room of rooms) {
      if (!room?.refs?.creatures?.length) continue;
      for (const c of room.refs.creatures) {
        const stat = monsterBank[c.key] || monsterBank[c.name.toLowerCase()];
        if (!stat) continue;
        const idKey = `${stat.name}|${stat.source || ''}`;
        if (seen.has(idKey)) continue;
        seen.add(idKey);
        const formatted = formatMonsterStatblock(stat);
        if (formatted) lines.push(formatted);
      }
    }
    return lines.join('\n');
  }

  function buildModuleWorldbookPrompt(compiledAdv, state = {}, monsterBank = {}) {
    if (!compiledAdv || state.enabled === false) return '';
    const map = compiledAdv.maps.find(m => m.id === state.currentMapId)
      || compiledAdv.maps.find(m => m.rooms.length > 0)
      || compiledAdv.maps[0];
    const chapter = compiledAdv.chapters[map?.chapterIndex ?? 0] || compiledAdv.chapters[0];
    const curRoom = map?.rooms?.find(r => r.id === state.currentRoomId) || map?.rooms?.[0] || null;
    const explored = new Set(state.exploredRooms || (curRoom ? [curRoom.id] : []));
    const cleared = new Set(state.clearedRooms || []);

    const sections = [];
    const kindLabel = map?.mapKind === 'overworld' ? '区域大地图与野外遭遇' : map?.mapKind === 'settlement' ? '城镇聚落导览' : '战术探索地城';

    sections.push(`### 🗺️ 【D&D 官方模组运行导航与原版地城引擎 (含提前一步预载)】
当前运行模组：《${compiledAdv.name}》${compiledAdv.ENG_name ? ` (${compiledAdv.ENG_name})` : ''}${compiledAdv.level ? ` [适用等级: ${compiledAdv.level.start}-${compiledAdv.level.end}级]` : ''}
当前章节：${chapter?.name || '第一章'} | 当前场景：${map?.title || ''} (#${map?.id || ''}, ${kindLabel})
队伍当前位置：${curRoom ? `[#${curRoom.id}] ${curRoom.name}${curRoom.ENG_name ? ` (${curRoom.ENG_name})` : ''}` : '场景入口'}`);

    // Section 1: Global Campaign Foundation + Current Chapter Overview
    const baseBlocks = [];
    if (compiledAdv.campaignBase) {
      baseBlocks.push(`【模组全局背景与开局引子】\n${compiledAdv.campaignBase}`);
    }
    if (chapter && !chapter.isIntro && chapter.summary) {
      baseBlocks.push(`【当前章节（${chapter.name}）提要】\n${chapter.summary}`);
    }
    if (map?.generalNotes) {
      baseBlocks.push(`【当前场景（${map.title}）通用特征与NPC】\n${map.generalNotes}`);
    }
    if (baseBlocks.length) {
      sections.push(`#### 【一、模组全局背景与当前章节设定】\n${baseBlocks.join('\n\n')}`);
    }

    // Section 2: Current Floor / Scene Topology
    if (map) {
      let battleCoordGuide = '';
      if (map.mapKind !== 'overworld' && map.imageUrl) {
        const { pxPerFt, offsetX: ox, offsetY: oy } = resolveMapScale(map);
        const wFt = Math.max(25, Math.round((((map.width || 1400) - ox) / pxPerFt) / 5) * 5);
        const hFt = Math.max(25, Math.round((((map.height || 1400) - oy) / pxPerFt) / 5) * 5);
        const roomAnchors = (map.rooms || [])
          .filter(r => !r.isStoryNode && r.cx != null && r.cy != null)
          .slice(0, 8)
          .map(r => {
            const rx = Math.max(0, Math.min(wFt - 5, Math.round(((r.cx - ox) / pxPerFt - 2.5) / 5) * 5));
            const ry = Math.max(0, Math.min(hFt - 5, Math.round(((r.cy - oy) / pxPerFt - 2.5) / 5) * 5));
            return `${r.name}(${rx},${ry})`;
          });
        const seeded = state.aiSeededMaps?.[map.id];
        const seededGuide = seeded?.units?.length
          ? `\n【本层已预置单位初始坐标】${seeded.units.slice(0, 24).map(u => `${u.id}(${u.pos?.[0] ?? 0},${u.pos?.[1] ?? 0}) HP${u.hp?.cur ?? 10}/${u.hp?.max ?? 10}`).join('；')}。`
          : '';
        battleCoordGuide = `\n官方战术图坐标系（5ft/格，左上角为 0,0）：总尺寸 ${wFt}ft × ${hFt}ft（合法范围 x: 0~${wFt - 5}, y: 0~${hFt - 5}）。战斗只需用 <battle-delta> 输出变化量（新增/移动/HP增减/状态/next/remove/@end），支持直接写 room:房间号 或 pos:x,y，勿每回合全量重发。${roomAnchors.length ? `关键地标参考：${roomAnchors.join('、')}。` : ''}${seededGuide}`;
      }
      sections.push(`#### 【二、当前场景空间拓扑图 (Scene & Floor Topology)】
主持要求：严格依据下方拓扑图的方位、连通关系与走廊连接裁定队伍移动、视线、声音传播与追击路线。禁止穿墙跳关或凭空捏造不存在的通道。${battleCoordGuide}
${formatFloorTopologyText(map, { ...state, currentRoomId: curRoom?.id, exploredRooms: [...explored], clearedRooms: [...cleared] })}`);
    }

    // Section 3: Current Node Full RAW Data (Step N)
    const lookaheadRooms = [];
    const lookaheadMapNotes = [];

    if (curRoom) {
      const roomStatus = cleared.has(curRoom.id) ? '（注：该区域此前已被标记为清理完毕，请勿重复刷新已击杀的固定守卫）' : '';
      const curMonsterText = collectMonsterStatblocks([curRoom], monsterBank);

      sections.push(`#### 【三、当前所在位置原版完整数据 (Step N — Current Area Full RAW Data)】
当前位置标识：[#${curRoom.id}] **${curRoom.name}**${curRoom.ENG_name ? ` (${curRoom.ENG_name})` : ''} ${roomStatus}
${curRoom.fullText || curRoom.dmDetails || '（无详细文本）'}${curMonsterText ? `\n\n##### 【当前位置关联生物原版数据卡】\n${curMonsterText}` : ''}`);

      // Gather 1-Step Lookahead Rooms (Step N+1):
      // 1) All direct 1-hop neighbors in current map
      for (const edge of curRoom.edges || []) {
        const target = map.rooms.find(r => r.id === edge.toId);
        if (target && !lookaheadRooms.some(x => x.room.id === target.id)) {
          lookaheadRooms.push({
            mapId: map.id,
            mapTitle: map.title,
            dir: `向${edge.dir}`,
            note: edge.note || '',
            room: target,
          });
        }
      }

      // 2) If current map is an Overworld / Story scene (or if curRoom has ≤ 1 in-map edge and there is a nextMapId),
      //    automatically pre-open the Next Map's general notes + first 2 entrance rooms!
      if (map.nextMapId && (map.mapKind === 'overworld' || lookaheadRooms.length === 0 || curRoom.id === map.rooms[map.rooms.length - 1]?.id)) {
        const nextMap = compiledAdv.maps.find(m => m.id === map.nextMapId);
        if (nextMap) {
          if (nextMap.generalNotes) {
            lookaheadMapNotes.push(`【下一场景预载：#${nextMap.id} 《${nextMap.title}》通用特征】\n${nextMap.generalNotes}`);
          }
          const entryRooms = nextMap.rooms.slice(0, 2);
          for (const er of entryRooms) {
            if (!lookaheadRooms.some(x => x.room.id === er.id)) {
              lookaheadRooms.push({
                mapId: nextMap.id,
                mapTitle: nextMap.title,
                dir: `跨场景转场 → #${nextMap.id}《${nextMap.title}》`,
                note: '下一阶段紧邻入口区域',
                room: er,
              });
            }
          }
        }
      }
    }

    // Section 4: 1-Step Lookahead Full RAW Data (Step N+1)
    if (lookaheadRooms.length || lookaheadMapNotes.length) {
      const lookBlocks = [...lookaheadMapNotes];
      for (const item of lookaheadRooms.slice(0, 4)) {
        const r = item.room;
        const rClr = cleared.has(r.id) ? ' [✓已清理]' : explored.has(r.id) ? ' [✓已探索]' : ' [?未探索/待进入]';
        const secondHop = (r.edges || [])
          .filter(e => e.toId !== curRoom?.id)
          .map(e => `[向${e.dir}]→#${e.toId} ${e.toName}`)
          .join('、');
        lookBlocks.push(`##### ⏭️ 预载区域：[${item.dir}] ➔ [#${r.id}] **${r.name}**${r.ENG_name ? ` (${r.ENG_name})` : ''}${rClr}${item.note ? ` (${item.note})` : ''}
${r.fullText || r.dmDetails || r.publicSummary}${secondHop ? `\n*（二跳远端连通提示：从 #${r.id} 可继续前往：${secondHop}）*` : ''}`);
      }

      const lookMonsterText = collectMonsterStatblocks(lookaheadRooms.slice(0, 4).map(x => x.room), monsterBank);
      if (lookMonsterText) {
        lookBlocks.push(`##### 【下一跳预载区域关联生物原版数据卡】\n${lookMonsterText}`);
      }

      sections.push(`#### 【四、提前一步开放：下一跳关联区域与下一幕原版完整数据 (Step N+1 Full Lookahead)】
DM 主持指引：以下为队伍当前位置**下一步可直接进入或触发的关联区域/下一幕原版完整数据**。
- 当玩家在当轮行动中侦察、偷听、交火引怪，或**直接宣布推进/踏入下列预载区域**时，你**无需等待下一轮**，直接在当轮回复中使用下方预载的原版朗读文本、地形、陷阱 DC 与生物数据卡进行无缝主持，并在回复末尾输出状态切换指令！
\n${lookBlocks.join('\n\n---\n\n')}`);
    }

    // Section 5: Available Maps Index & AI Autonomous Progression + Tactical Battle Map Protocol
    const allMapsSummary = compiledAdv.maps.map(m => `[#${m.id}] ${m.chapterName}·${m.title}(${m.rooms.length}节点)`).join('、');
    const battleMapHint = (map?.mapKind === 'overworld' || curRoom?.isStoryNode)
      ? `- **无官方战术网格图时的 LLM 动态 SVG 战场绘制协议**：
  当前节点为野外/无官方战术网格遭遇。当进入战斗时，用 \`<battle-delta>\`，第一行 \`@start\`，随后绘制当前场景的 **SVG 战术地形与视线阻挡墙体**（单位坐标以尺 ft 为单位，1格=5尺）：
  \`\`\`
  <battle-delta>
  @start
  @map | title:${curRoom?.name || map?.title || '战术遭遇'} | size:100,70 | theme:forest
  @path | road | 0,35 -> 50,35 -> 100,32 | width:15 | label:道路/小径
  @poly | foliage | 20,10 ; 80,10 ; 75,24 ; 20,24 | cover:half | los:block | label:茂密灌木/高地
  @wall | 22,22 -> 74,22 | type:ridge | blocksSight:true | blocksMove:false | label:陡坡视线阻挡线
  @prop | wagon | 50,35 | size:10,15 | cover:half | label:翻倒货车/掩体
  角色名 | att:0 | init:16 | hp:12/12 | pos:35,35 | next
  敌人1 | att:2 | init:14 | hp:7/7 | pos:40,18
  </battle-delta>
  \`\`\``
      : `- **官方地图实景战斗联动协议**：
  当前场景已挂载官方高清战术地图（《${map?.title || ''}》）。当在 \`[#${curRoom?.id || ''}] ${curRoom?.name || ''}\` 触发战斗并输出 \`<battle-delta>\` 块时，战斗面板将自动以当前房间的官方地图实景作为战场底图并加载物理墙壁与角色视线。若玩家在面板中拖拽移动了角色坐标，请严格依据其最新坐标裁定距离、视线遮挡与借机攻击。`;

    sections.push(`#### 【五、模组全场景索引、战斗地图联动与 AI 自主推进协议】
本模组场景索引：${allMapsSummary}
- **信息隔离原则**：对玩家严格保密尚未触发的暗门、陷阱 DC、埋伏与幕后黑手设定；仅在玩家抵达相应区域或通过检定时揭示。
${battleMapHint}
- **AI 自主切换世界书与地图推进指令**：
  当玩家在本次回复中**实际移动进入了新的区域/下一幕场景**、**通过侦察揭开了相邻迷雾区域**，或**清空了当前区域的敌人**时，必须在回复最末尾（在 \`</UpdateVariable>\` 之后）另起一行输出隐藏推进指令（将自动为您开放再下一步的关联世界书）：
  \`<!-- dnd-map: {"map":"目标地图ID","room":"目标区域ID","reveal":["新揭开的区域ID"],"clear":["已清理完毕的区域ID"]} -->\`
  （示例：队伍从地精伏击 #00e 追击抵达克拉摩窝点 1.洞口 #01b 时输出：\`<!-- dnd-map: {"map":"1ab","room":"01b","reveal":["01b"],"clear":["00e"]} -->\`）`);

    if (map && map.mapKind !== 'overworld' && !curRoom?.isStoryNode) {
      const seeded = state.aiSeededMaps?.[map.id];
      const liveUnits = Array.isArray(state.liveBattleUnits) && state.liveBattleUnits.length
        ? state.liveBattleUnits
        : (seeded?.units || []);
      const unitRoster = liveUnits.length
        ? `\n- **当前小地图单位实时坐标与HP**：${liveUnits.slice(0, 24).map(u => `${u.id}(${u.pos?.[0] ?? 0},${u.pos?.[1] ?? 0} HP:${u.hp?.cur ?? 10}/${u.hp?.max ?? 10}${u.faction === 'hostile' ? ' 敌' : ''})`).join(' | ')}`
        : '';
      const safeRooms = [curRoom, ...lookaheadRooms.filter(x => x.mapId === map.id).slice(0, 2).map(x => x.room)].filter(Boolean);
      const safeLines = [];
      for (const sr of safeRooms) {
        if (sr.isStoryNode || sr.cx == null || sr.cy == null) continue;
        const cells = getSafeWalkableCellsForRoom(sr, map, 10);
        if (cells.length) {
          safeLines.push(`  - \`[#${sr.id}] ${sr.name}\`：${cells.map(c => `(${c.xFt},${c.yFt})`).join('、')}`);
        }
      }
      const safeWhitelistBlock = safeLines.length
        ? `\n- **合法可行走落点白名单（严禁自编白名单外的坐标）**：\n${safeLines.join('\n')}\n  ⚠️ **防卡墙与同区刷怪铁律**：生成小怪或移动单位时，**必须从上述对应房间的白名单中挑选空闲坐标**（或直接写 \`room:房间号\`）；**严禁靠“玩家坐标 ±15ft”瞎猜坐标**，否则极易卡进岩壁或刷到隔壁房间！与玩家同处一场遭遇的敌人，必须从玩家当前所在房间的白名单中选点，多只怪物请依次错开选格。`
        : '';
      const tacticalSit = buildTacticalSituationText(map, state, liveUnits, null);
      const tacticalSitBlock = tacticalSit ? `\n- **战术空间与视线简报（距离与墙体遮挡）**：\n${tacticalSit}` : '';
      sections.push(`#### 【六、高优先级强制协议：小地图棋子移动、敌人死亡与战斗结算】
⚠️ **只要处于战术小地图中，以下规则优先级高于普通叙事，绝对不可遗漏！**
1. **角色/敌人移动必更**：只要任意角色或敌人在本轮发生了位置移动（含战斗走位、冲锋、探索跨房），**必须**在回复末尾输出 \`<battle-delta>\` 更新其 \`pos:x,y\` 或 \`room:房间号\`。
2. **敌人受伤/死亡必更**：只要敌人 HP 归零或被击杀，**必须**立即在 \`<battle-delta>\` 中写 \`敌人名 | remove\`（或 \`hp:0/7\`）将其退场；**禁止**只在正文或 \`<UpdateVariable>\` 里写“击杀/战斗结束”而漏掉 \`<battle-delta>\`！
3. **当前行动角色切换指令（控制地图可拖动权限与先攻栏 \`NOW\` 高亮）**：
   - 战斗中切换行动权时，必须在正文或 \`<battle-delta>\` 中输出标准化单行指令：\`下一个行动的角色是: 角色名\`（如：\`下一个行动的角色是: 蒂法\`），或在 \`<battle-delta>\` 中标注 \`蒂法 | next\` / \`@next: 蒂法\`。系统将据此把当前可移动权限与先攻栏 \`NOW\` 切换到该角色。
4. **预设结束指令（直接写在 \`<battle-delta>\` 第一行）**：
   - \`@战斗结束\`（或 \`@end\`）：**仅撤销先攻条**，保留所有角色与存活单位在地图上的当前站位（适合停战/脱战/休整）。
   - \`@敌人全歼\`（或 \`@wipe\`）：**撤销先攻条并自动删除所有敌方棋子**，仅保留我方队伍站位（适合杀光当前区域全部敌人时使用）。${unitRoster}${tacticalSitBlock}${safeWhitelistBlock}
5. **标准示例（冲锋斩杀最后一名敌人并结束战斗）**：
   \`\`\`
   <battle-delta>
   @敌人全歼
   马克 | pos:60,65
   </battle-delta>
   \`\`\``);
    }

    return sections.join('\n\n')+'\n新遭遇首次战场记录必须用 battle-delta，第一行 @start，并列全体已确认参战者、先攻、当前HP、位置和行动者。后续只写变化，结束显式 @end。不要恢复旧 battle 历史，不重结算伤害或资源。';
  }

  // ============================================================================
  // Wall Network, 2D Raycasting Line-of-Sight & Token Collision Engine
  // ============================================================================

  function segmentsIntersectParam(ax, ay, bx, by, cx, cy, dx, dy) {
    const rpx = bx - ax, rpy = by - ay;
    const spx = dx - cx, spy = dy - cy;
    const denom = rpx * spy - rpy * spx;
    if (Math.abs(denom) < 1e-8) return null;
    const qpx = cx - ax, qpy = cy - ay;
    const t = (qpx * spy - qpy * spx) / denom;
    const u = (qpx * rpy - qpy * rpx) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { t, u, x: ax + t * rpx, y: ay + t * rpy };
    }
    return null;
  }

  function intersectRaySegment(ox, oy, dx, dy, x1, y1, x2, y2) {
    const sx = x2 - x1, sy = y2 - y1;
    const denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-8) return null;
    const qx = x1 - ox, qy = y1 - oy;
    const t = (qx * sy - qy * sx) / denom;
    const u = (qx * dy - qy * dx) / denom;
    if (t >= 0 && u >= -1e-5 && u <= 1.00001) {
      return { t, x: ox + t * dx, y: oy + t * dy };
    }
    return null;
  }

  function closestPointsOnSegments(ax, ay, bx, by, cx, cy, dx, dy) {
    const abx = bx - ax, aby = by - ay;
    const cdx = dx - cx, cdy = dy - cy;
    const abLenSq = abx * abx + aby * aby;
    const cdLenSq = cdx * cdx + cdy * cdy;

    const candidates = [];
    const projectPoint = (px, py, sx, sy, ex, ey, sLenSq) => {
      if (sLenSq < 1e-6) return 0;
      const t = ((px - sx) * (ex - sx) + (py - sy) * (ey - sy)) / sLenSq;
      return Math.max(0, Math.min(1, t));
    };

    // Endpoint projections on both segments
    for (const t of [0, 1]) {
      const px = ax + abx * t, py = ay + aby * t;
      const u = projectPoint(px, py, cx, cy, dx, dy, cdLenSq);
      const qx = cx + cdx * u, qy = cy + cdy * u;
      candidates.push({ t, u, x1: px, y1: py, x2: qx, y2: qy, dist: Math.hypot(qx - px, qy - py) });
    }
    for (const u of [0, 1]) {
      const qx = cx + cdx * u, qy = cy + cdy * u;
      const t = projectPoint(qx, qy, ax, ay, bx, by, abLenSq);
      const px = ax + abx * t, py = ay + aby * t;
      candidates.push({ t, u, x1: px, y1: py, x2: qx, y2: qy, dist: Math.hypot(qx - px, qy - py) });
    }

    // Also compute overlap range when edges are roughly parallel so portal centers on shared face
    const abLen = Math.sqrt(abLenSq) || 1;
    const cdLen = Math.sqrt(cdLenSq) || 1;
    const ux1 = abx / abLen, uy1 = aby / abLen;
    const ux2 = cdx / cdLen, uy2 = cdy / cdLen;
    const dotAbs = Math.abs(ux1 * ux2 + uy1 * uy2);
    let overlapLen = 0;

    if (dotAbs >= 0.72) {
      // Project segment CD onto AB's unit axis
      const pC = (cx - ax) * ux1 + (cy - ay) * uy1;
      const pD = (dx - ax) * ux1 + (dy - ay) * uy1;
      const cMin = Math.min(pC, pD), cMax = Math.max(pC, pD);
      const oStart = Math.max(0, cMin);
      const oEnd = Math.min(abLen, cMax);
      overlapLen = Math.max(0, oEnd - oStart);
      if (overlapLen > 1) {
        const midOnAB = (oStart + oEnd) / 2;
        const t = Math.max(0, Math.min(1, midOnAB / abLen));
        const px = ax + abx * t, py = ay + aby * t;
        const u = projectPoint(px, py, cx, cy, dx, dy, cdLenSq);
        const qx = cx + cdx * u, qy = cy + cdy * u;
        return {
          t,
          u,
          x1: px,
          y1: py,
          x2: qx,
          y2: qy,
          dist: Math.hypot(qx - px, qy - py),
          overlapLen,
        };
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    return { ...candidates[0], overlapLen };
  }

  function subtractIntervals(totalLen, cuts) {
    if (!cuts || cuts.length === 0) return [[0, totalLen]];
    const sorted = cuts
      .map(([s, e]) => [Math.max(0, s), Math.min(totalLen, e)])
      .filter(([s, e]) => e > s)
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const iv of sorted) {
      if (!merged.length || iv[0] > merged[merged.length - 1][1]) {
        merged.push([...iv]);
      } else {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
      }
    }
    const kept = [];
    let cursor = 0;
    for (const [cs, ce] of merged) {
      if (cs > cursor) kept.push([cursor, cs]);
      cursor = Math.max(cursor, ce);
    }
    if (cursor < totalLen) kept.push([cursor, totalLen]);
    return kept;
  }

  const PLUTONIUM_SCENES_BASE = 'https://raw.githubusercontent.com/TheGiddyLimit/plutonium-scenes/main/data';
  const PLUTONIUM_MODULE_ALIASES = {
    kkw: 'ggr',
    'mot-nss': 'mot',
    'fraif-tllol': 'fraif',
  };

  function normalizeSceneMatchName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/\s*\((?:battlemap[^)]*|player|dm|players?|gridless|area\s*[^)]*)\)\s*/gi, ' ')
      .replace(/^(?:map\s*)?[a-z]?\d*(?:\.\d+)*\s*[:.]\s*/i, '')
      .replace(/\b(?:locations?|areas?\s+of)\b/gi, ' ')
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
  }

  function extractSceneMapNum(name) {
    const m = String(name || '').match(/(?:map|地图)\s*([a-z]?\d+(?:\.\d+)+)|(?:^|\b)([a-z]?\d+\.\d+)(?:\b|:|：)/i);
    if (!m) return '';
    return (m[1] || m[2] || '').toLowerCase();
  }

  function extractSceneAreaCode(name) {
    const s = String(name || '');
    const m1 = s.match(/(?:area|区域)\s*([a-z]\d*|\d+)/i);
    if (m1) return m1[1].toLowerCase();
    const m2 = s.match(/^([a-z]\d+)\./i);
    return m2 ? m2[1].toLowerCase() : '';
  }

  function extractSceneWords(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/['’]s\b/g, '')
      .replace(/\b(?:map|battlemap|dm|player|version|area|locations?|the|of|and|in|at|for|to)\b/gi, ' ')
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 2);
  }

  function makeAcronyms(words, rawName = '') {
    const all = words.map(w => w[0]).join('');
    const longOnly = words.filter(w => w.length >= 3).map(w => w[0]).join('');
    const rawWords = String(rawName || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/^(?:map\s*)?[a-z]?\d*(?:\.\d+)*\s*[:.]\s*/i, '')
      .replace(/['’]s\b/g, '')
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const rawAcr = rawWords.map(w => w[0]).join('');
    return [...new Set([all, longOnly, rawAcr].filter(Boolean))];
  }

  function extractHrefSlug(hrefPath) {
    const base = String(hrefPath || '').split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') || '';
    return base
      .toLowerCase()
      .replace(/^\d+-/, '')
      .replace(/^(?:map[-_]?)+/i, '')
      .replace(/^(?:[a-z]{2,6}\d{2,}[-_]?)+/i, '')
      .replace(/^\d+(?:\.\d+)*[-_]?/, '')
      .replace(/-(?:dm|player|players|gridless|revised|\d+)$/gi, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function convertPlutoniumWalls(rawWalls, map) {
    if (!Array.isArray(rawWalls) || rawWalls.length === 0 || !map) return [];
    let maxX = 0;
    let maxY = 0;
    for (const w of rawWalls) {
      if (!Array.isArray(w?.c) || w.c.length < 4) continue;
      maxX = Math.max(maxX, w.c[0], w.c[2]);
      maxY = Math.max(maxY, w.c[1], w.c[3]);
    }
    const mw = map.width || 2048;
    const mh = map.height || 1536;
    let scale = 1;
    if (maxX > mw * 1.15 || maxY > mh * 1.15) {
      const est = Math.max(maxX / mw, maxY / mh);
      const gridScale = Number(map.grid?.scale) || 1;
      if (gridScale > 1 && Math.abs(est - gridScale) <= 0.45) {
        scale = gridScale;
      } else {
        scale = Math.max(2, Math.round(est));
      }
    }

    const out = [];
    rawWalls.forEach((w, idx) => {
      if (!Array.isArray(w?.c) || w.c.length < 4) return;
      const x1 = Math.round(w.c[0] / scale);
      const y1 = Math.round(w.c[1] / scale);
      const x2 = Math.round(w.c[2] / scale);
      const y2 = Math.round(w.c[3] / scale);
      if (Math.hypot(x2 - x1, y2 - y1) < 2) return;

      const doorType = Number(w.door) || 0;
      const isSecret = doorType === 2;
      const isDoor = doorType === 1 || isSecret;
      const blocksSight = w.sight !== 0;
      const blocksMove = w.move !== 0;
      // Skip walls that block neither sight nor movement (unless it's a clickable door)
      if (!isDoor && !blocksSight && !blocksMove) return;

      out.push({
        id: `fvtt_${map.id}_${idx}`,
        x1,
        y1,
        x2,
        y2,
        kind: isSecret ? 'secret-door' : isDoor ? 'door' : 'wall',
        open: isDoor ? Number(w.ds) === 1 : false,
        blocksSight,
        blocksMove,
        label: isSecret ? '暗门' : isDoor ? (Number(w.ds) === 2 ? '门(锁)' : '门') : undefined,
      });
    });
    return out;
  }

  function scorePlutoniumSceneMatch(m, sc) {
    const scName = String(sc?.name || '');
    const scNorm = normalizeSceneMatchName(scName);
    const scNum = extractSceneMapNum(scName);
    const scArea = extractSceneAreaCode(scName);
    const scWords = extractSceneWords(scName.replace(/\([^)]*\)/g, ' '));
    const scAcronyms = makeAcronyms(scWords, scName);

    const hrefBase = String(m.hrefPath || '').split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') || '';
    const hrefSlug = extractHrefSlug(m.hrefPath);
    const hrefWords = extractSceneWords(hrefBase.replace(/^\d+-/, '').replace(/[-_]+/g, ' '));
    const mNum = extractSceneMapNum(m.title) || extractSceneMapNum(m.engTitle) || extractSceneMapNum(hrefBase);
    const mArea = extractSceneAreaCode(m.title) || extractSceneAreaCode(m.engTitle);
    const engNorm = normalizeSceneMatchName(m.engTitle);
    const titleNorm = normalizeSceneMatchName(m.title);
    const engWords = extractSceneWords(m.engTitle);

    let score = 0;
    if (engNorm && scNorm && engNorm === scNorm) score += 110;
    if (titleNorm && scNorm && titleNorm === scNorm) score += 110;
    if (mNum && scNum && mNum === scNum) score += 95;
    if (hrefSlug && scNorm && hrefSlug === scNorm) score += 90;
    if (hrefSlug && scNorm && hrefSlug.length >= 5 && (scNorm.includes(hrefSlug) || hrefSlug.includes(scNorm))) score += 65;
    if (mArea && scArea && mArea === scArea) score += 60;
    if (hrefSlug && hrefSlug.length >= 2 && scAcronyms.includes(hrefSlug)) score += 75;

    const mWordSet = new Set([...engWords, ...hrefWords].flatMap(w => [w, w.replace(/s$/, '')]));
    for (const w of scWords) {
      if (w.length >= 4 && (mWordSet.has(w) || mWordSet.has(w.replace(/s$/, '')))) score += 30;
    }
    return score;
  }

  function applyPlutoniumSceneData(compiled, plutData) {
    const scenes = (Array.isArray(plutData?.map)
      ? plutData.map
      : Array.isArray(plutData?.scene)
        ? plutData.scene
        : Array.isArray(plutData?.adventure)
          ? plutData.adventure
          : []).filter(sc => sc && Array.isArray(sc.walls) && sc.walls.length > 0);
    if (!compiled?.maps?.length || !scenes.length) return 0;

    const fogMaps = compiled.maps.filter(m => m.requiresFog);
    const candidates = [];
    for (const m of fogMaps) {
      for (const sc of scenes) {
        const score = scorePlutoniumSceneMatch(m, sc);
        if (score >= 60) candidates.push({ m, sc, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    const usedMaps = new Set();
    const usedScenes = new Set();
    let matched = 0;
    for (const { m, sc } of candidates) {
      if (usedMaps.has(m) || usedScenes.has(sc)) continue;
      const converted = convertPlutoniumWalls(sc.walls, m);
      if (converted.length > 0) {
        m.walls = converted;
        m.wallSource = 'plutonium';
        usedMaps.add(m);
        usedScenes.add(sc);
        matched++;
      }
    }
    return matched;
  }

  function buildMapWallNetwork(map) {
    if (!map || !map.requiresFog || !Array.isArray(map.rooms)) return [];
    const physRooms = map.rooms.filter(
      r => !r.isStoryNode && Array.isArray(r.polygons) && r.polygons.length > 0
    );
    if (physRooms.length === 0) return [];

    const gridSize = map.grid?.size || 150;
    const portalHalf = Math.max(gridSize * 0.52, Math.min(gridSize * 0.72, 110));

    // 1. Collect all polygon boundary edges for every physical room
    const edgesByRoom = new Map();
    const allPolyEdges = [];
    for (const r of physRooms) {
      const rEdges = [];
      r.polygons.forEach((poly, pIdx) => {
        if (!Array.isArray(poly) || poly.length < 3) return;
        for (let k = 0; k < poly.length; k++) {
          const p1 = poly[k];
          const p2 = poly[(k + 1) % poly.length];
          const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
          if (len < 8) continue;
          const edgeObj = {
            id: `${r.id}_p${pIdx}_e${k}`,
            roomId: r.id,
            x1: p1[0],
            y1: p1[1],
            x2: p2[0],
            y2: p2[1],
            len,
            ux: (p2[0] - p1[0]) / len,
            uy: (p2[1] - p1[1]) / len,
            cuts: [],
          };
          rEdges.push(edgeObj);
          allPolyEdges.push(edgeObj);
        }
      });
      edgesByRoom.set(r.id, rEdges);
    }

    // 2. Find best physical portal candidates between connected room pairs
    const pairCandidates = [];
    const seenPair = new Set();
    for (const r1 of physRooms) {
      const r1Edges = edgesByRoom.get(r1.id) || [];
      if (!r1Edges.length) continue;
      for (const edge of r1.edges || []) {
        const r2 = physRooms.find(x => x.id === edge.toId);
        if (!r2 || r2.id === r1.id) continue;
        const pairKey = r1.id < r2.id ? `${r1.id}::${r2.id}` : `${r2.id}::${r1.id}`;
        if (seenPair.has(pairKey)) continue;
        seenPair.add(pairKey);

        const r2Edges = edgesByRoom.get(r2.id) || [];
        if (!r2Edges.length) continue;

        let best = null;
        for (const e1 of r1Edges) {
          for (const e2 of r2Edges) {
            const cp = closestPointsOnSegments(e1.x1, e1.y1, e1.x2, e1.y2, e2.x1, e2.y1, e2.x2, e2.y2);
            const score = cp.dist - Math.min(gridSize * 0.65, cp.overlapLen * 0.5);
            if (!best || score < best.score) {
              best = { ...cp, score, e1, e2 };
            }
          }
        }
        if (!best || best.dist > gridSize * 2.5) continue;

        const reverseEdge = (r2.edges || []).find(e => e.toId === r1.id);
        const isExplicitTextLink = edge.kind === 'both' || edge.kind === 'text' || reverseEdge?.kind === 'both' || reverseEdge?.kind === 'text';
        const noteStr = `${edge.note || ''} ${reverseEdge?.note || ''}`;

        pairCandidates.push({
          r1,
          r2,
          edge,
          noteStr,
          isExplicitTextLink,
          best,
        });
      }
    }

    const walls = [];
    const portalCountByRoom = new Map(physRooms.map(r => [r.id, 0]));
    const ufParent = new Map(physRooms.map(r => [r.id, r.id]));
    const ufFind = (id) => {
      let cur = id;
      while (ufParent.get(cur) !== cur) cur = ufParent.get(cur);
      return cur;
    };
    const ufUnion = (a, b) => {
      const ra = ufFind(a), rb = ufFind(b);
      if (ra !== rb) ufParent.set(ra, rb);
    };

    const applyPortal = (cand) => {
      const { r1, r2, noteStr, best } = cand;
      const { e1, e2, t, u, x1, y1, x2, y2, dist } = best;

      const s1 = t * e1.len;
      const half1 = Math.min(portalHalf, Math.max(22, e1.len * 0.44));
      const c1Start = Math.max(0, Math.min(e1.len - half1 * 2, s1 - half1));
      const c1End = Math.min(e1.len, c1Start + half1 * 2);
      e1.cuts.push([c1Start, c1End]);

      const s2 = u * e2.len;
      const half2 = Math.min(portalHalf, Math.max(22, e2.len * 0.44));
      const c2Start = Math.max(0, Math.min(e2.len - half2 * 2, s2 - half2));
      const c2End = Math.min(e2.len, c2Start + half2 * 2);
      e2.cuts.push([c2Start, c2End]);

      portalCountByRoom.set(r1.id, (portalCountByRoom.get(r1.id) || 0) + 1);
      portalCountByRoom.set(r2.id, (portalCountByRoom.get(r2.id) || 0) + 1);
      ufUnion(r1.id, r2.id);

      const p1a = [e1.x1 + e1.ux * c1Start, e1.y1 + e1.uy * c1Start];
      const p1b = [e1.x1 + e1.ux * c1End, e1.y1 + e1.uy * c1End];
      const p2a = [e2.x1 + e2.ux * c2Start, e2.y1 + e2.uy * c2Start];
      const p2b = [e2.x1 + e2.ux * c2End, e2.y1 + e2.uy * c2End];

      // Add doorway side-jamb walls across stone thickness when there is a >20px gap between polygons
      if (dist > 20) {
        let j2a = p2a, j2b = p2b;
        // Pick pairing that does not cross into an X
        if (segmentsIntersectParam(p1a[0], p1a[1], p2a[0], p2a[1], p1b[0], p1b[1], p2b[0], p2b[1])) {
          j2a = p2b;
          j2b = p2a;
        }
        const isStrictlyInsideRoom = (px, py, room) => {
          for (const poly of room.polygons || []) {
            if (!pointInPolygon(px, py, poly)) continue;
            let minD = Infinity;
            for (let i = 0; i < poly.length; i++) {
              const a = poly[i], b = poly[(i + 1) % poly.length];
              const abx = b[0] - a[0], aby = b[1] - a[1];
              const lenSq = abx * abx + aby * aby;
              const tt = lenSq > 1e-6 ? Math.max(0, Math.min(1, ((px - a[0]) * abx + (py - a[1]) * aby) / lenSq)) : 0;
              minD = Math.min(minD, Math.hypot(px - (a[0] + abx * tt), py - (a[1] + aby * tt)));
            }
            if (minD > 14) return true;
          }
          return false;
        };
        const tryPushJamb = (jId, aPt, bPt) => {
          if (Math.hypot(bPt[0] - aPt[0], bPt[1] - aPt[1]) <= 8) return;
          for (const frac of [0.25, 0.5, 0.75]) {
            const sxJ = aPt[0] + (bPt[0] - aPt[0]) * frac;
            const syJ = aPt[1] + (bPt[1] - aPt[1]) * frac;
            if (isStrictlyInsideRoom(sxJ, syJ, r1) || isStrictlyInsideRoom(sxJ, syJ, r2)) return;
          }
          walls.push({
            id: jId,
            x1: Math.round(aPt[0]),
            y1: Math.round(aPt[1]),
            x2: Math.round(bPt[0]),
            y2: Math.round(bPt[1]),
            kind: 'wall',
            blocksSight: true,
            blocksMove: true,
          });
        };
        tryPushJamb(`jambA_${r1.id}_${r2.id}`, p1a, j2a);
        tryPushJamb(`jambB_${r1.id}_${r2.id}`, p1b, j2b);
      }

      // Add clickable door if text/note mentions a door, secret door, gate, or lock
      if (/门|暗门|door|secret|闸|锁/i.test(noteStr)) {
        const isSecret = /暗门|secret/i.test(noteStr);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const doorHalf = Math.min(portalHalf * 0.92, Math.max(24, (c1End - c1Start) / 2));
        walls.push({
          id: `door_${r1.id}_${r2.id}`,
          x1: Math.round(mx - e1.ux * doorHalf),
          y1: Math.round(my - e1.uy * doorHalf),
          x2: Math.round(mx + e1.ux * doorHalf),
          y2: Math.round(my + e1.uy * doorHalf),
          kind: isSecret ? 'secret-door' : 'door',
          open: false,
          blocksSight: true,
          blocksMove: true,
          label: isSecret ? '暗门' : '门',
        });
      }
    };

    // Pass A: Carve genuine portals (touching thresholds, explicit text links, or strong face-to-face proximity)
    const deferredCandidates = [];
    for (const cand of pairCandidates) {
      const { dist, overlapLen } = cand.best;
      const isTouching = dist <= gridSize * 0.6 && overlapLen >= gridSize * 0.15;
      const isTextLinkedPassage = cand.isExplicitTextLink && dist <= gridSize * 1.9 && (overlapLen >= gridSize * 0.18 || dist <= gridSize * 1.25);
      const isFaceToFaceGeoPassage = !cand.isExplicitTextLink && dist <= gridSize * 1.18 && overlapLen >= gridSize * 0.52;

      if (isTouching || isTextLinkedPassage || isFaceToFaceGeoPassage) {
        applyPortal(cand);
      } else if (dist <= gridSize * 2.5) {
        deferredCandidates.push(cand);
      }
    }

    // Pass B: Guarantee all connected rooms in the dungeon graph form connected walkable components
    deferredCandidates.sort((a, b) => a.best.score - b.best.score);
    for (const cand of deferredCandidates) {
      if (ufFind(cand.r1.id) !== ufFind(cand.r2.id)) {
        applyPortal(cand);
      }
    }

    // Pass C: ONLY for truly isolated standalone buildings with 0 graph edges (e.g. ruined cottages in #1ad),
    // carve an entrance door on the edge closest to the map centroid so players can enter/exit.
    const mapCenterX = (map.width || 3000) / 2;
    const mapCenterY = (map.height || 3000) / 2;
    for (const r of physRooms) {
      if ((portalCountByRoom.get(r.id) || 0) > 0) continue;
      if (Array.isArray(r.edges) && r.edges.length > 0) continue;
      const rEdges = edgesByRoom.get(r.id) || [];
      const suitable = rEdges.filter(e => e.len >= gridSize * 0.65);
      if (!suitable.length) continue;
      suitable.sort((a, b) => {
        const da = Math.hypot((a.x1 + a.x2) / 2 - mapCenterX, (a.y1 + a.y2) / 2 - mapCenterY);
        const db = Math.hypot((b.x1 + b.x2) / 2 - mapCenterX, (b.y1 + b.y2) / 2 - mapCenterY);
        return da - db;
      });
      const chosen = suitable[0];
      const mid = chosen.len / 2;
      const half = Math.min(portalHalf * 0.85, chosen.len * 0.3);
      chosen.cuts.push([mid - half, mid + half]);
      walls.push({
        id: `door_${r.id}_ext`,
        x1: Math.round(chosen.x1 + chosen.ux * (mid - half)),
        y1: Math.round(chosen.y1 + chosen.uy * (mid - half)),
        x2: Math.round(chosen.x1 + chosen.ux * (mid + half)),
        y2: Math.round(chosen.y1 + chosen.uy * (mid + half)),
        kind: 'door',
        open: false,
        blocksSight: true,
        blocksMove: true,
        label: '门',
      });
    }

    // 3. Emit remaining uncut polygon edge segments as solid walls (deduplicating near-identical shared walls)
    const wallBuckets = new Set();
    for (const e of allPolyEdges) {
      const kept = subtractIntervals(e.len, e.cuts);
      kept.forEach(([s, end], idx) => {
        if (end - s < 8) return;
        const x1 = Math.round(e.x1 + e.ux * s);
        const y1 = Math.round(e.y1 + e.uy * s);
        const x2 = Math.round(e.x1 + e.ux * end);
        const y2 = Math.round(e.y1 + e.uy * end);
        const kx1 = Math.round(x1 / 12), ky1 = Math.round(y1 / 12);
        const kx2 = Math.round(x2 / 12), ky2 = Math.round(y2 / 12);
        const sig = (kx1 < kx2 || (kx1 === kx2 && ky1 <= ky2))
          ? `${kx1},${ky1}-${kx2},${ky2}`
          : `${kx2},${ky2}-${kx1},${ky1}`;
        if (wallBuckets.has(sig)) return;
        wallBuckets.add(sig);
        walls.push({
          id: `poly_${e.id}_${idx}`,
          x1,
          y1,
          x2,
          y2,
          kind: 'wall',
          blocksSight: true,
          blocksMove: true,
        });
      });
    }

    return walls;
  }

  function computeVisibilityPolygon(ox, oy, radiusPx, walls = []) {
    if (!Number.isFinite(ox) || !Number.isFinite(oy) || !(radiusPx > 0)) return [];
    const activeWalls = (walls || []).filter(w => {
      if (!w || w.open || w.blocksSight === false) return false;
      const minX = Math.min(w.x1, w.x2) - radiusPx;
      const maxX = Math.max(w.x1, w.x2) + radiusPx;
      const minY = Math.min(w.y1, w.y2) - radiusPx;
      const maxY = Math.max(w.y1, w.y2) + radiusPx;
      return ox >= minX && ox <= maxX && oy >= minY && oy <= maxY;
    });

    const angles = [];
    const perimeterSteps = 60;
    for (let i = 0; i < perimeterSteps; i++) {
      angles.push((i / perimeterSteps) * Math.PI * 2 - Math.PI);
    }
    for (const w of activeWalls) {
      for (const [wx, wy] of [[w.x1, w.y1], [w.x2, w.y2]]) {
        const d = Math.hypot(wx - ox, wy - oy);
        if (d > 1e-4 && d <= radiusPx * 1.15) {
          const baseAng = Math.atan2(wy - oy, wx - ox);
          angles.push(baseAng - 0.00025, baseAng, baseAng + 0.00025);
        }
      }
    }
    angles.sort((a, b) => a - b);

    const poly = [];
    for (let i = 0; i < angles.length; i++) {
      const ang = angles[i];
      if (i > 0 && Math.abs(ang - angles[i - 1]) < 1e-6) continue;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let minT = radiusPx;
      for (const w of activeWalls) {
        const hit = intersectRaySegment(ox, oy, dx, dy, w.x1, w.y1, w.x2, w.y2);
        if (hit && hit.t < minT) {
          minT = hit.t;
        }
      }
      poly.push([ox + dx * minT, oy + dy * minT]);
    }
    return poly;
  }

  function hasLineOfSight(x1, y1, x2, y2, walls = []) {
    for (const w of walls || []) {
      if (!w || w.open || w.blocksSight === false) continue;
      const hit = segmentsIntersectParam(x1, y1, x2, y2, w.x1, w.y1, w.x2, w.y2);
      if (hit && hit.t > 0.02 && hit.t < 0.98) return false;
    }
    return true;
  }

  function clampMoveByWalls(x1, y1, x2, y2, walls = [], clearancePx = 6) {
    const totalDx = x2 - x1;
    const totalDy = y2 - y1;
    const totalDist = Math.hypot(totalDx, totalDy);
    if (totalDist < 1e-3) return { x: x2, y: y2, blocked: false, hitWall: null };

    const activeWalls = (walls || []).filter(w => w && !w.open && w.blocksMove !== false);
    if (!activeWalls.length) return { x: x2, y: y2, blocked: false, hitWall: null };

    const findFirstHit = (sx, sy, ex, ey) => {
      let bestT = 2;
      let hitWall = null;
      for (const w of activeWalls) {
        const hit = segmentsIntersectParam(sx, sy, ex, ey, w.x1, w.y1, w.x2, w.y2);
        if (hit && hit.t >= 0 && hit.t <= 1 && hit.t < bestT) {
          bestT = hit.t;
          hitWall = w;
        }
      }
      return hitWall ? { bestT, hitWall } : null;
    };

    const minDistToWalls = (px, py) => {
      let minD = Infinity;
      for (const w of activeWalls) {
        const d = pointToSegmentDist(px, py, w.x1, w.y1, w.x2, w.y2);
        if (d < minD) minD = d;
      }
      return minD;
    };

    // Sub-step long drags so fast movements cannot skip corners or thin gaps
    const maxStep = 14;
    const steps = Math.max(1, Math.ceil(totalDist / maxStep));
    let curX = x1;
    let curY = y1;
    let anyBlocked = false;
    let lastHitWall = null;

    for (let s = 1; s <= steps; s++) {
      const targetX = s === steps ? x2 : (x1 + (totalDx * s) / steps);
      const targetY = s === steps ? y2 : (y1 + (totalDy * s) / steps);
      const dx = targetX - curX;
      const dy = targetY - curY;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-3) continue;

      const first = findFirstHit(curX, curY, targetX, targetY);
      if (!first) {
        curX = targetX;
        curY = targetY;
        continue;
      }

      anyBlocked = true;
      lastHitWall = first.hitWall;
      const backoffT = Math.min(first.bestT, Math.max(0.02, clearancePx / dist));
      const safeT = Math.max(0, first.bestT - backoffT);
      const stopX = curX + dx * safeT;
      const stopY = curY + dy * safeT;

      // Try sliding along the hit wall with remaining movement, only if slide stays off walls
      const wx = first.hitWall.x2 - first.hitWall.x1;
      const wy = first.hitWall.y2 - first.hitWall.y1;
      const wLen = Math.hypot(wx, wy);
      let slid = false;
      if (wLen > 1e-3) {
        const remDx = dx * (1 - safeT);
        const remDy = dy * (1 - safeT);
        const ux = wx / wLen;
        const uy = wy / wLen;
        const proj = remDx * ux + remDy * uy;
        if (Math.abs(proj) > 1) {
          const slideX = stopX + ux * proj;
          const slideY = stopY + uy * proj;
          if (!findFirstHit(stopX, stopY, slideX, slideY) && minDistToWalls(slideX, slideY) >= 2) {
            curX = slideX;
            curY = slideY;
            slid = true;
          }
        }
      }
      if (!slid) {
        curX = stopX;
        curY = stopY;
        break;
      }
    }

    return { x: curX, y: curY, blocked: anyBlocked, hitWall: lastHitWall };
  }

  function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-8) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function getSafeWalkableCellsForRoom(room, map, limit = 10) {
    if (!room || room.cx == null || room.cy == null || !map) return [];
    const { pxPerFt, cellPx, offsetX: ox, offsetY: oy } = resolveMapScale(map);
    const mw = map.width || map.widthPx || 2048;
    const mh = map.height || map.heightPx || 1536;
    const walls = (Array.isArray(map.walls) ? map.walls : buildMapWallNetwork(map))
      .filter(w => w && !w.open && w.blocksMove !== false);

    const minWallDist = (px, py) => {
      let best = Infinity;
      for (const w of walls) {
        const d = pointToSegmentDist(px, py, w.x1, w.y1, w.x2, w.y2);
        if (d < best) best = d;
      }
      return best;
    };
    const isBlocked = (x1, y1, x2, y2) =>
      walls.some(w => segmentsIntersectParam(x1, y1, x2, y2, w.x1, w.y1, w.x2, w.y2));

    const startCol = Math.max(0, Math.floor((room.cx - ox) / cellPx));
    const startRow = Math.max(0, Math.floor((room.cy - oy) / cellPx));
    const centerPx = (c, r) => [ox + (c + 0.5) * cellPx, oy + (r + 0.5) * cellPx];
    const clearance = cellPx * 0.18;
    const results = [];
    const visited = new Set([`${startCol},${startRow}`]);
    const queue = [[startCol, startRow, 0]];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (queue.length && results.length < limit * 3) {
      const [c, r, dist] = queue.shift();
      const [px, py] = centerPx(c, r);
      if (px > 18 && px < mw - 18 && py > 18 && py < mh - 18) {
        if (dist === 0 || minWallDist(px, py) >= clearance) {
          results.push({ xFt: c * 5, yFt: r * 5, dist });
        }
      }
      if (dist >= 6) continue;
      for (const [dc, dr] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0) continue;
        const key = `${nc},${nr}`;
        if (visited.has(key)) continue;
        visited.add(key);
        const [npx, npy] = centerPx(nc, nr);
        if (npx <= 18 || npx >= mw - 18 || npy <= 18 || npy >= mh - 18) continue;
        if (isBlocked(px, py, npx, npy)) continue;
        if (minWallDist(npx, npy) < clearance) continue;
        queue.push([nc, nr, dist + 1]);
      }
    }
    return results.slice(0, limit).map(({ xFt, yFt }) => ({ xFt, yFt }));
  }

  function buildTacticalSituationText(map, state = {}, units = [], surface = null) {
    if (!map || !Array.isArray(units) || !units.length) return '';
    const { pxPerFt, offsetX: ox, offsetY: oy } = resolveMapScale(map, surface);
    const doorStates = state?.doorStates || {};
    const mapKey = surface?.mapKey || map.id;
    const rawWalls = surface?.walls || (Array.isArray(map.walls) ? map.walls : buildMapWallNetwork(map));
    const blockingWalls = rawWalls.filter(w => {
      if (!w || w.blocksMove === false) return false;
      if (w.kind === 'door' || w.kind === 'secret-door') {
        const dk = `${mapKey}:${w.id}`;
        const isOpen = doorStates[dk] != null ? !!doorStates[dk] : !!w.open;
        return !isOpen;
      }
      return !w.open;
    });

    const explored = new Set(state?.exploredRooms || []);
    const useFog = (map.requiresFog !== false) && !state?.dmView;
    const friendlies = units.filter(u => u && u.faction === 'friendly' && Array.isArray(u.pos));
    const hostiles = units.filter(u => {
      if (!u || u.faction !== 'hostile' || !Array.isArray(u.pos)) return false;
      if (u.hp?.cur != null && u.hp.cur <= 0) return false;
      if (useFog && u._seeded && u.roomId && !explored.has(u.roomId)) return false;
      return true;
    });

    const lines = [];
    for (const f of friendlies.slice(0, 6)) {
      const fx = ox + (f.pos[0] + 2.5) * pxPerFt;
      const fy = oy + (f.pos[1] + 2.5) * pxPerFt;
      for (const h of hostiles.slice(0, 10)) {
        const hx = ox + (h.pos[0] + 2.5) * pxPerFt;
        const hy = oy + (h.pos[1] + 2.5) * pxPerFt;
        const distFt = Math.round(Math.hypot(h.pos[0] - f.pos[0], h.pos[1] - f.pos[1]) / 5) * 5;
        const blocked = blockingWalls.some(w => segmentsIntersectParam(fx, fy, hx, hy, w.x1, w.y1, w.x2, w.y2));
        lines.push(`  - ${f.id}(${f.pos[0]},${f.pos[1]}) ↔ ${h.id}(${h.pos[0]},${h.pos[1]})：直线约 ${distFt}ft，${blocked ? '中间有墙体/关门阻挡（无法直视）' : '视线无阻挡'}`);
      }
    }
    return lines.join('\n');
  }

  // ============================================================================
  // LLM Dynamic SVG Tactical Battlefield Parser & Renderer
  // ============================================================================

  const PRESET_SVG_SPECS = {
    '00e': {
      title: '三猪小径 · 地精伏击 (Goblin Ambush)',
      widthFt: 110,
      heightFt: 75,
      theme: 'forest',
      paths: [
        { type: 'road', points: [[0, 38], [35, 38], [72, 36], [110, 34]], widthFt: 16, label: '三猪小径 (Triboar Trail)' },
        { type: 'trail', points: [[52, 36], [48, 16], [44, 0]], widthFt: 7, label: '北向地精隐秘小径 (往克拉摩窝点)' },
      ],
      polys: [
        { type: 'cliff', points: [[12, 8], [92, 8], [88, 25], [16, 25]], cover: 'half', los: 'open', label: '北侧陡坡高地' },
        { type: 'foliage', points: [[18, 12], [84, 12], [80, 23], [20, 23]], cover: 'half', los: 'block', label: '北侧茂密荆棘林 (地精埋伏点)' },
        { type: 'foliage', points: [[15, 50], [88, 48], [85, 64], [18, 64]], cover: 'half', los: 'block', label: '南侧密林灌木丛' },
      ],
      walls: [
        { id: 'ambush_north_thicket', x1: 20, y1: 22, x2: 44, y2: 22, type: 'thicket', blocksSight: true, blocksMove: false, label: '荆棘视线遮蔽' },
        { id: 'ambush_north_thicket2', x1: 54, y1: 22, x2: 80, y2: 22, type: 'thicket', blocksSight: true, blocksMove: false, label: '荆棘视线遮蔽' },
        { id: 'ambush_south_thicket', x1: 20, y1: 50, x2: 82, y2: 49, type: 'thicket', blocksSight: true, blocksMove: false, label: '南侧灌木遮蔽' },
      ],
      props: [
        { type: 'horse', x: 55, y: 37, w: 10, h: 7, cover: 'half', blocksSight: false, label: '两匹插满黑羽箭的死马' },
        { type: 'wagon', x: 32, y: 38, w: 12, h: 8, cover: 'half', blocksSight: false, label: '队伍护送的四轮货车' },
        { type: 'boulder', x: 74, y: 26, w: 6, h: 6, cover: 'half', blocksSight: true, label: '路边巨石' },
      ],
    },
  };

  function getPresetSvgMapForNode(room, map) {
    if (!room) return null;
    if (PRESET_SVG_SPECS[room.id]) return PRESET_SVG_SPECS[room.id];
    if (room.isStoryNode || map?.mapKind === 'overworld') {
      const isCave = /洞|矿|穴|墓|殿|堡/.test(room.name || '');
      return {
        title: `${room.name} · 战术遭遇地图`,
        widthFt: 100,
        heightFt: 70,
        theme: isCave ? 'cave' : 'forest',
        paths: [
          { type: isCave ? 'trail' : 'road', points: [[0, 35], [50, 35], [100, 35]], widthFt: 14, label: isCave ? '主通道' : '林间道路' },
        ],
        polys: [
          { type: isCave ? 'cliff' : 'foliage', points: [[18, 8], [82, 8], [78, 22], [22, 22]], cover: 'half', los: 'block', label: isCave ? '北侧岩台掩体' : '北侧密林掩体' },
          { type: isCave ? 'cliff' : 'foliage', points: [[20, 48], [80, 48], [76, 62], [24, 62]], cover: 'half', los: 'block', label: isCave ? '南侧乱石堆' : '南侧灌木丛' },
        ],
        walls: [
          { id: 'auto_wall_n', x1: 22, y1: 22, x2: 78, y2: 22, type: 'ridge', blocksSight: true, blocksMove: false, label: '北侧视线阻挡' },
          { id: 'auto_wall_s', x1: 24, y1: 48, x2: 76, y2: 48, type: 'ridge', blocksSight: true, blocksMove: false, label: '南侧视线阻挡' },
        ],
        props: [
          { type: 'boulder', x: 45, y: 28, w: 7, h: 7, cover: 'half', blocksSight: true, label: '掩体巨石' },
          { type: 'campfire', x: 55, y: 40, w: 5, h: 5, cover: 'none', blocksSight: false, label: '遭遇中心点' },
        ],
      };
    }
    return null;
  }

  function parseTacticalMapDirectives(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const rawSvgMatch = rawText.match(/<svg[\s\S]*?<\/svg>/i);
    const lines = rawText
      .replace(/<\/?battle[^>]*>/gi, '')
      .split(/\r?\n/)
      .map(l => l.replace(/^[-*>\s]+/, '').trim())
      .filter(Boolean);

    const spec = {
      title: '战术战场地图',
      widthFt: 100,
      heightFt: 70,
      theme: 'forest',
      rawSvg: rawSvgMatch ? rawSvgMatch[0] : '',
      paths: [],
      polys: [],
      walls: [],
      props: [],
    };
    let hasDirectives = !!rawSvgMatch;

    const parseKv = (strOrParts) => {
      const kv = {};
      const text = Array.isArray(strOrParts) ? strOrParts.join(' | ') : String(strOrParts || '');
      // 1. Parse pipe-separated key:value or key=value
      for (const p of text.split('|').map(s => s.trim()).filter(Boolean)) {
        const m = p.match(/^([a-zA-Z_]+)\s*[:=]\s*["']?([^"']+)["']?$/);
        if (m) kv[m[1].toLowerCase()] = m[2].trim();
      }
      // 2. Also parse space-separated key=value or key="value" tokens
      const re = /([a-zA-Z_]+)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^\s|]+))/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const k = m[1].toLowerCase();
        if (!(k in kv)) kv[k] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
      }
      return kv;
    };

    const parsePtList = (str) => {
      const cleaned = String(str || '')
        .replace(/[a-zA-Z_]+\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s|]+)/g, ' ')
        .replace(/^@[a-zA-Z_]+\s*/, ' ')
        .trim();
      const matches = [...cleaned.matchAll(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g)];
      return matches.map(m => [Number(m[1]), Number(m[2])]);
    };

    for (const line of lines) {
      if (!line.startsWith('@')) continue;
      const parts = line.split('|').map(s => s.trim()).filter(Boolean);
      const cmd = (line.match(/^@[a-zA-Z_]+/) || [parts[0]])[0].toLowerCase();
      const kv = parseKv(line.replace(/^@[a-zA-Z_]+\s*/, ''));

      if (cmd === '@map') {
        hasDirectives = true;
        if (kv.title) spec.title = kv.title;
        if (kv.theme) spec.theme = kv.theme.toLowerCase();
        if (kv.cols && kv.rows) {
          spec.widthFt = Math.max(20, Number(kv.cols) * 5);
          spec.heightFt = Math.max(20, Number(kv.rows) * 5);
        } else if (kv.size) {
          const [w, h] = kv.size.split(/[,\sxX]+/).map(Number);
          if (w > 10 && h > 10) {
            spec.widthFt = w;
            spec.heightFt = h;
          }
        }
      } else if (cmd === '@path') {
        const type = (parts[1] && !parts[1].includes(':') && !parts[1].includes('=') && !parts[1].includes(',')) ? parts[1].toLowerCase() : (kv.type || 'road');
        const pts = parsePtList(line);
        if (pts.length >= 2) {
          hasDirectives = true;
          spec.paths.push({
            type,
            points: pts,
            widthFt: Number(kv.width) || 12,
            label: kv.label || '',
          });
        }
      } else if (cmd === '@poly' || cmd === '@zone') {
        const type = (parts[1] && !parts[1].includes(':') && !parts[1].includes('=') && !parts[1].includes(',')) ? parts[1].toLowerCase() : (kv.type || 'foliage');
        const pts = parsePtList(line);
        if (pts.length >= 3) {
          hasDirectives = true;
          spec.polys.push({
            type,
            points: pts,
            cover: (kv.cover === '1' || kv.cover === 'true') ? 'half' : (kv.cover || 'half'),
            los: kv.los || 'open',
            label: kv.label || '',
          });
          if (kv.los === 'block') {
            for (let i = 0; i < pts.length; i++) {
              const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
              spec.walls.push({
                id: `poly_los_${spec.walls.length}`,
                x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
                type: 'foliage',
                blocksSight: true,
                blocksMove: false,
                label: kv.label || '视线阻挡',
              });
            }
          }
        }
      } else if (cmd === '@wall' || cmd === '@door') {
        const pts = parsePtList(line);
        if (pts.length >= 2) {
          hasDirectives = true;
          const isDoor = cmd === '@door' || kv.type === 'door' || kv.kind === 'door';
          for (let i = 0; i + 1 < pts.length; i++) {
            spec.walls.push({
              id: `${isDoor ? 'door' : 'wall'}_${spec.walls.length}`,
              x1: pts[i][0], y1: pts[i][1],
              x2: pts[i + 1][0], y2: pts[i + 1][1],
              kind: isDoor ? 'door' : 'wall',
              type: kv.type || kv.kind || (isDoor ? 'door' : 'stone'),
              open: kv.open === 'true' || kv.open === '1',
              blocksSight: kv.blockssight ? kv.blockssight !== 'false' : (kv.los !== 'open'),
              blocksMove: kv.blocksmove ? kv.blocksmove !== 'false' : true,
              label: kv.label || (isDoor ? '门' : '墙体'),
            });
          }
        }
      } else if (cmd === '@prop') {
        const type = (parts[1] && !parts[1].includes(':') && !parts[1].includes('=') && !parts[1].includes(',')) ? parts[1].toLowerCase() : (kv.type || 'boulder');
        const pts = parsePtList(line);
        if (pts.length >= 1) {
          const [x, y] = pts[0];
          hasDirectives = true;
          const [w, h] = kv.size ? kv.size.split(/[,\sxX]+/).map(Number) : [Number(kv.w) || 8, Number(kv.h) || 8];
          const prop = {
            type,
            x, y,
            w: w || 8,
            h: h || 8,
            cover: (kv.cover === '1' || kv.cover === 'true') ? 'half' : (kv.cover || 'half'),
            blocksSight: kv.blockssight === 'true' || kv.los === 'block',
            label: kv.label || '',
          };
          spec.props.push(prop);
          if (prop.blocksSight) {
            spec.walls.push({
              id: `prop_wall_${spec.walls.length}`,
              x1: x - prop.w / 2, y1: y, x2: x + prop.w / 2, y2: y,
              kind: 'wall',
              blocksSight: true,
              blocksMove: true,
              label: prop.label || type,
            });
          }
        }
      }
    }

    return hasDirectives ? spec : null;
  }

  function compileSvgTacticalMap(specInput, pxPerFt = 14) {
    const spec = typeof specInput === 'string' ? parseTacticalMapDirectives(specInput) : specInput;
    if (!spec) return null;

    const wFt = spec.widthFt || 100;
    const hFt = spec.heightFt || 70;
    const widthPx = Math.round(wFt * pxPerFt);
    const heightPx = Math.round(hFt * pxPerFt);
    const gridPx = 5 * pxPerFt;

    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const palettes = {
      forest: { bg1: '#23311f', bg2: '#182315', grid: 'rgba(220,235,195,0.09)', road1: '#6e583b', road2: '#524029' },
      cave: { bg1: '#24201c', bg2: '#161310', grid: 'rgba(235,215,180,0.08)', road1: '#453c33', road2: '#332c25' },
      dungeon: { bg1: '#1e2228', bg2: '#13161a', grid: 'rgba(190,215,240,0.09)', road1: '#383f47', road2: '#2a3036' },
      desert: { bg1: '#3b2c1d', bg2: '#291e13', grid: 'rgba(245,220,175,0.09)', road1: '#785c3c', road2: '#5c452b' },
    };
    const pal = palettes[spec.theme] || palettes.forest;

    const svgParts = [];
    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}">`);
    svgParts.push(`<defs>
      <radialGradient id="bgGrad" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="${pal.bg1}"/>
        <stop offset="100%" stop-color="${pal.bg2}"/>
      </radialGradient>
      <pattern id="gridPat" width="${gridPx}" height="${gridPx}" patternUnits="userSpaceOnUse">
        <path d="M ${gridPx} 0 L 0 0 0 ${gridPx}" fill="none" stroke="${pal.grid}" stroke-width="1"/>
      </pattern>
      <filter id="softShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.55"/>
      </filter>
    </defs>`);

    svgParts.push(`<rect width="${widthPx}" height="${heightPx}" fill="url(#bgGrad)"/>`);

    // 1. Paths (Roads, Streams, Trails)
    for (const p of spec.paths || []) {
      const pts = (p.points || []).map(([x, y]) => `${Math.round(x * pxPerFt)},${Math.round(y * pxPerFt)}`).join(' ');
      if (!pts) continue;
      const strokeW = Math.max(12, Math.round((p.widthFt || 12) * pxPerFt));
      const isWater = /stream|river|water/.test(p.type);
      const outerStroke = isWater ? '#1b3f4a' : pal.road2;
      const innerStroke = isWater ? '#2c6678' : pal.road1;
      svgParts.push(`<polyline points="${pts}" fill="none" stroke="${outerStroke}" stroke-width="${strokeW + 8}" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/>`);
      svgParts.push(`<polyline points="${pts}" fill="none" stroke="${innerStroke}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>`);
      if (p.label) {
        const mid = p.points[Math.floor(p.points.length / 2)];
        svgParts.push(`<text x="${Math.round(mid[0] * pxPerFt)}" y="${Math.round(mid[1] * pxPerFt + strokeW * 0.35)}" fill="rgba(242,226,196,0.68)" font-size="13" font-family="Microsoft YaHei, serif" text-anchor="middle">${esc(p.label)}</text>`);
      }
    }

    // 2. Polygons / Terrain Zones (Cliffs, Foliage, Water, Ruins)
    for (const z of spec.polys || []) {
      const pts = (z.points || []).map(([x, y]) => `${Math.round(x * pxPerFt)},${Math.round(y * pxPerFt)}`).join(' ');
      if (!pts) continue;
      let fill = 'rgba(46, 82, 42, 0.65)';
      let stroke = '#5a8f4e';
      let dash = '';
      if (/cliff|ridge|rock|ledge/.test(z.type)) {
        fill = 'rgba(78, 66, 52, 0.72)';
        stroke = '#a38968';
        dash = 'stroke-dasharray="8,5"';
      } else if (/water|pool|swamp/.test(z.type)) {
        fill = 'rgba(34, 84, 102, 0.72)';
        stroke = '#5ca4bd';
      } else if (/ruin|stone|building/.test(z.type)) {
        fill = 'rgba(64, 62, 60, 0.75)';
        stroke = '#9c968e';
      }
      svgParts.push(`<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2.5" ${dash} filter="url(#softShadow)"/>`);

      // Add organic foliage canopy circles if foliage/forest
      if (/foliage|forest|bush|thicket|tree/.test(z.type) && z.points.length >= 3) {
        const c = computePolygonCentroid(z.points);
        for (let i = 0; i < z.points.length; i++) {
          const [vx, vy] = z.points[i];
          const bx = Math.round(((vx * 2 + c.cx) / 3) * pxPerFt);
          const by = Math.round(((vy * 2 + c.cy) / 3) * pxPerFt);
          svgParts.push(`<circle cx="${bx}" cy="${by}" r="${Math.round(pxPerFt * 3.8)}" fill="rgba(34,68,30,0.58)" stroke="rgba(110,165,92,0.45)" stroke-width="1.5"/>`);
        }
      }
      if (z.label) {
        const c = computePolygonCentroid(z.points);
        const coverBadge = z.cover === 'full' ? ' [全身掩体]' : z.cover === 'half' ? ' [半身掩体+2AC]' : '';
        svgParts.push(`<text x="${Math.round(c.cx * pxPerFt)}" y="${Math.round(c.cy * pxPerFt)}" fill="#e9dec5" font-size="13" font-weight="600" font-family="Microsoft YaHei, sans-serif" text-anchor="middle" style="paint-order:stroke;stroke:#14120e;stroke-width:3px">${esc(z.label + coverBadge)}</text>`);
      }
    }

    // 3. Tactical Grid Overlay
    svgParts.push(`<rect width="${widthPx}" height="${heightPx}" fill="url(#gridPat)"/>`);

    // 4. Props (Wagons, Dead Horses, Boulders, Campfires, Pillars)
    for (const pr of spec.props || []) {
      const cx = Math.round(pr.x * pxPerFt);
      const cy = Math.round(pr.y * pxPerFt);
      const pw = Math.max(16, Math.round((pr.w || 8) * pxPerFt));
      const ph = Math.max(14, Math.round((pr.h || 8) * pxPerFt));
      if (/wagon|cart/.test(pr.type)) {
        svgParts.push(`<g transform="translate(${cx - pw / 2},${cy - ph / 2})" filter="url(#softShadow)">
          <rect width="${pw}" height="${ph}" rx="4" fill="#6b4c2b" stroke="#c49a62" stroke-width="2"/>
          <line x1="6" y1="4" x2="${pw - 6}" y2="4" stroke="#47311a" stroke-width="2"/>
          <line x1="6" y1="${ph - 4}" x2="${pw - 6}" y2="${ph - 4}" stroke="#47311a" stroke-width="2"/>
        </g>`);
      } else if (/horse/.test(pr.type)) {
        svgParts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${Math.round(pw / 2)}" ry="${Math.round(ph / 2)}" fill="#543b26" stroke="#b88655" stroke-width="2" filter="url(#softShadow)"/>`);
      } else if (/fire|campfire/.test(pr.type)) {
        svgParts.push(`<circle cx="${cx}" cy="${cy}" r="${Math.round(pw * 0.7)}" fill="rgba(245,155,55,0.22)"/>`);
        svgParts.push(`<circle cx="${cx}" cy="${cy}" r="${Math.round(pw * 0.32)}" fill="#f08c2b" stroke="#ffd27d" stroke-width="2"/>`);
      } else {
        svgParts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${Math.round(pw / 2)}" ry="${Math.round(ph / 2)}" fill="#595248" stroke="#9e9280" stroke-width="2" filter="url(#softShadow)"/>`);
      }
      if (pr.label) {
        svgParts.push(`<text x="${cx}" y="${cy - Math.round(ph / 2) - 6}" fill="#f5e4c3" font-size="12" font-family="Microsoft YaHei, sans-serif" text-anchor="middle" style="paint-order:stroke;stroke:#14110c;stroke-width:3px">${esc(pr.label)}</text>`);
      }
    }

    // 5. Physical Walls & Doors
    const wallsPx = [];
    const wallsFt = [];
    for (const w of spec.walls || []) {
      const x1 = Math.round(w.x1 * pxPerFt), y1 = Math.round(w.y1 * pxPerFt);
      const x2 = Math.round(w.x2 * pxPerFt), y2 = Math.round(w.y2 * pxPerFt);
      const isDoor = w.kind === 'door' || w.type === 'door';
      const isThicketOrRidge = /thicket|foliage|ridge/.test(w.type || '');
      const stroke = isDoor ? (w.open ? '#78c98a' : '#e09a48') : isThicketOrRidge ? 'rgba(185, 155, 95, 0.55)' : '#d9c398';
      const dash = isDoor ? 'stroke-dasharray="6,4"' : isThicketOrRidge ? 'stroke-dasharray="10,6"' : '';
      svgParts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${isDoor ? 4 : 5}" stroke-linecap="round" ${dash}/>`);

      wallsFt.push({
        id: w.id || `w_${wallsFt.length}`,
        x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
        kind: isDoor ? 'door' : 'wall',
        open: !!w.open,
        blocksSight: w.blocksSight !== false,
        blocksMove: w.blocksMove !== false,
        label: w.label || '',
      });
      wallsPx.push({
        id: w.id || `w_${wallsPx.length}`,
        x1, y1, x2, y2,
        kind: isDoor ? 'door' : 'wall',
        open: !!w.open,
        blocksSight: w.blocksSight !== false,
        blocksMove: w.blocksMove !== false,
        label: w.label || '',
      });
    }

    if (spec.rawSvg) {
      svgParts.push(spec.rawSvg);
    }

    svgParts.push(`</svg>`);
    const svgString = svgParts.join('\n');
    const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;

    return {
      title: spec.title,
      theme: spec.theme,
      widthFt: wFt,
      heightFt: hFt,
      cols: Math.round(wFt / 5),
      rows: Math.round(hFt / 5),
      widthPx,
      heightPx,
      pxPerFt,
      gridPx,
      svgString,
      svgMarkup: svgString,
      svgDataUrl,
      dataUri: svgDataUrl,
      wallsFt,
      wallsPx,
      props: spec.props || [],
      spec,
    };
  }

  function resolveRoomToken(token, compiledAdv, currentMapId) {
    if (!token || !compiledAdv) return null;
    const raw = String(token).trim().replace(/^#|^★\s*/, '');
    if (!raw) return null;

    const searchMaps = [];
    const curMap = compiledAdv.maps.find(m => m.id === currentMapId);
    if (curMap) searchMaps.push(curMap);
    for (const m of compiledAdv.maps) {
      if (m !== curMap) searchMaps.push(m);
    }

    for (const m of searchMaps) {
      const r = m.rooms.find(x => x.id.toLowerCase() === raw.toLowerCase());
      if (r) return { mapId: m.id, roomId: r.id, room: r };
    }
    const numMatch = raw.match(/^([A-Za-z]?\d+[a-z]?)(?:[.\s、]|$)/);
    for (const m of searchMaps) {
      for (const r of m.rooms) {
        const cleanName = r.name.replace(/^★\s*/, '');
        if (cleanName === raw || r.name === raw || r.ENG_name?.toLowerCase() === raw.toLowerCase()) {
          return { mapId: m.id, roomId: r.id, room: r };
        }
        if (numMatch) {
          const rNum = cleanName.match(/^([A-Za-z]?\d+[a-z]?)(?:[.\s、]|$)/);
          if (rNum && rNum[1].toLowerCase() === numMatch[1].toLowerCase()) {
            return { mapId: m.id, roomId: r.id, room: r };
          }
        }
      }
    }
    for (const m of searchMaps) {
      const r = m.rooms.find(x => {
        const cleanName = x.name.replace(/^★\s*/, '');
        return cleanName.includes(raw) || raw.includes(cleanName);
      });
      if (r) return { mapId: m.id, roomId: r.id, room: r };
    }
    return null;
  }

  function parseAiMapMarkers(messageText, compiledAdv, currentState = {}) {
    if (!messageText || !compiledAdv) return null;
    const text = String(messageText);
    const regex = /<!--\s*dnd-map\s*:\s*([\s\S]*?)\s*-->|<dnd-map>([\s\S]*?)<\/dnd-map>/gi;
    const matches = [...text.matchAll(regex)];
    if (!matches.length) return null;

    let nextMapId = currentState.currentMapId || compiledAdv.maps[0]?.id || '';
    let nextRoomId = currentState.currentRoomId || '';
    const explored = new Set(currentState.exploredRooms || []);
    const cleared = new Set(currentState.clearedRooms || []);
    const transitions = [...(currentState.transitions || [])];
    let changed = false;

    for (const m of matches) {
      const body = (m[1] ?? m[2] ?? '').trim();
      if (!body) continue;
      let parsed = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = { room: body.replace(/^["']|["']$/g, '') };
      }
      if (!parsed || typeof parsed !== 'object') continue;

      const mapToken = parsed.map || parsed.mapId;
      if (mapToken) {
        const cleanMapTok = String(mapToken).trim().replace(/^#/, '');
        const foundMap = compiledAdv.maps.find(x => x.id.toLowerCase() === cleanMapTok.toLowerCase() || x.title.includes(cleanMapTok));
        if (foundMap && foundMap.id !== nextMapId) {
          nextMapId = foundMap.id;
          if (foundMap.rooms[0] && !parsed.room && !parsed.currentRoom) {
            nextRoomId = foundMap.rooms[0].id;
            explored.add(nextRoomId);
          }
          changed = true;
        }
      }

      const roomToken = parsed.room || parsed.currentRoom || parsed.roomId || parsed.area;
      if (roomToken) {
        const resolved = resolveRoomToken(roomToken, compiledAdv, nextMapId);
        if (resolved) {
          const prevRoomId = nextRoomId;
          nextMapId = resolved.mapId;
          nextRoomId = resolved.roomId;
          if (!explored.has(resolved.roomId)) {
            explored.add(resolved.roomId);
            changed = true;
          }
          if (prevRoomId !== nextRoomId) {
            changed = true;
            if (prevRoomId) {
              transitions.push({ mapId: nextMapId, from: prevRoomId, to: nextRoomId, at: Date.now() });
            }
          }
        }
      }

      const revealList = Array.isArray(parsed.reveal) ? parsed.reveal : Array.isArray(parsed.unlock) ? parsed.unlock : parsed.reveal ? [parsed.reveal] : [];
      for (const token of revealList) {
        const resolved = resolveRoomToken(token, compiledAdv, nextMapId);
        if (resolved && !explored.has(resolved.roomId)) {
          explored.add(resolved.roomId);
          changed = true;
        }
      }

      const clearList = Array.isArray(parsed.clear) ? parsed.clear : Array.isArray(parsed.markCleared) ? parsed.markCleared : parsed.clear ? [parsed.clear] : [];
      for (const token of clearList) {
        const resolved = resolveRoomToken(token, compiledAdv, nextMapId);
        if (resolved && !cleared.has(resolved.roomId)) {
          cleared.add(resolved.roomId);
          explored.add(resolved.roomId);
          changed = true;
        }
      }
    }

    if (!changed) return null;
    return {
      ...currentState,
      enabled: true,
      moduleId: compiledAdv.id,
      moduleName: compiledAdv.name,
      currentMapId: nextMapId,
      currentRoomId: nextRoomId,
      exploredRooms: [...explored],
      clearedRooms: [...cleared],
      transitions: transitions.slice(-60),
    };
  }

  const OFFICIAL_MAP_PRESETS = {
    // LMoP (凡戴尔的失落矿坑)
    'Cragmaw Hideout.webp': { printedGridPx: 164.75, gridPx: 164.75, offsetX: 154, offsetY: 152, feetPerPrintedSquare: 5, entryPointFt: { x: 35, y: 70 } },
    'Redbrand Hideout.webp': { printedGridPx: 164.75, gridPx: 164.75, offsetX: 4, offsetY: 156.5, feetPerPrintedSquare: 5, entryPointFt: { x: 115, y: 70 } },
    'Ruins of Thundertree.webp': { printedGridPx: 164.75, gridPx: 164.75, offsetX: 22, offsetY: 4, feetPerPrintedSquare: 10, entryPointFt: { x: 25, y: 65 } },
    'Cragmaw Castle.webp': { printedGridPx: 157.5, gridPx: 157.5, offsetX: 107.5, offsetY: 68.5, feetPerPrintedSquare: 5, entryPointFt: { x: 15, y: 55 } },
    'Wave Echo Cave.webp': { printedGridPx: 132.75, gridPx: 132.75, offsetX: 20, offsetY: 20.5, feetPerPrintedSquare: 10, entryPointFt: { x: 80, y: 380 } },
    // DoSI (风骸岛之龙 - 5etools 错误标了 scale:2，图例实际均为 1 Square = 5 Feet)
    '004-map-1.01-dragons-rest.webp': { printedGridPx: 60.75, gridPx: 60.75, offsetX: 5, offsetY: 15.5, feetPerPrintedSquare: 5, entryPointFt: { x: 40, y: 60 } },
    '008-map-2.01-seagrow-caves.webp': { printedGridPx: 52.85, gridPx: 52.85, offsetX: 20.5, offsetY: 42, feetPerPrintedSquare: 5, entryPointFt: { x: 95, y: 85 } },
    '012-map-3.01-wreck-of-compass-rose.webp': { printedGridPx: 61.25, gridPx: 61.25, offsetX: 40.5, offsetY: 44, feetPerPrintedSquare: 5, entryPointFt: { x: 90, y: 40 } },
    '016-map-4.01-clifftop-observatory.webp': { printedGridPx: 76.75, gridPx: 76.75, offsetX: 6.5, offsetY: 6, feetPerPrintedSquare: 5, entryPointFt: { x: 10, y: 45 } },
  };

  function matchOfficialMapPreset(imageUrl) {
    if (!imageUrl) return null;
    let decoded = String(imageUrl);
    try { decoded = decodeURIComponent(decoded); } catch {}
    for (const [key, val] of Object.entries(OFFICIAL_MAP_PRESETS)) {
      if (decoded.includes(key)) return val;
    }
    return null;
  }

  /**
   * Single Source of Truth for map scale metrics across 5ft, 10ft, 20ft, and SVG maps.
   * Always returns:
   * - printedGridPx: pixel size of 1 square printed on the map artwork
   * - feetPerPrintedSquare: feet represented by 1 printed square (e.g. 5 or 10)
   * - pxPerFt: pixels per 1 foot
   * - cellPx: pixel size of 1 standard D&D 5ft tactical square (Medium creature footprint = 5 * pxPerFt)
   * - offsetX, offsetY: pixel origin offset of the grid
   */
  function resolveMapScale(map, surface = null) {
    if (surface?.isSvg) {
      const pxPerFt = surface.pxPerFt || 30;
      const cellPx = 5 * pxPerFt;
      return {
        printedGridPx: cellPx,
        feetPerPrintedSquare: 5,
        pxPerFt,
        cellPx,
        offsetX: surface.gridOffsetX || 0,
        offsetY: surface.gridOffsetY || 0,
      };
    }
    const preset = map?.imageUrl ? matchOfficialMapPreset(map.imageUrl) : null;
    const printedGridPx = preset?.printedGridPx || preset?.gridPx || surface?.gridSize || map?.grid?.size || 150;
    const distanceFt = map?.grid?.distance * (/^(mi|mile|miles)$/i.test(map?.grid?.units || '') ? 5280 : 1);
    const feetPerPrintedSquare = preset?.feetPerPrintedSquare
      || distanceFt
      || ((map?.grid?.scale || 1) * 5)
      || 5;
    const pxPerFt = surface?.pxPerFt || map?.pxPerFt || (printedGridPx / feetPerPrintedSquare) || 15;
    const cellPx = 5 * pxPerFt;
    const offsetX = surface?.gridOffsetX ?? preset?.offsetX ?? map?.grid?.offsetX ?? map?.offsetX ?? 0;
    const offsetY = surface?.gridOffsetY ?? preset?.offsetY ?? map?.grid?.offsetY ?? map?.offsetY ?? 0;
    return {
      printedGridPx,
      feetPerPrintedSquare,
      pxPerFt,
      cellPx,
      offsetX,
      offsetY,
    };
  }

  function compileBattleTimeline(messages = [], mapCtx = null, initialState = null) {
    let active = initialState?.active || false;
    let ended = initialState?.ended || false;
    let round = initialState?.round || 1;
    const unitMap = new Map((initialState?.units || []).map(u=>[u.id,{...u,hp:{...u.hp},pos:[...u.pos],status:[...u.status]}]));
    let svgRawBlock = initialState?.svgRawBlock || '';
    let lastDeltaCount = 0;

    const gridFt = 5;
    const snap5 = (v) => Math.round((Number(v) || 0) / gridFt) * gridFt;
    const resolveFaction = (att) => (att === 2 ? 'hostile' : att === 1 ? 'neutral' : 'friendly');

    const resolveRoomFt = (roomRef) => {
      const rooms = mapCtx?.rooms || [];
      if (!rooms.length) return null;
      const needle = String(roomRef || '').trim().toLowerCase();
      const hit = rooms.find(r =>
        String(r.id).toLowerCase() === needle
        || String(r.name || '').toLowerCase().includes(needle)
      );
      if (!hit || hit.cx == null || hit.cy == null) return null;
      const pxPerFt = mapCtx.pxPerFt || 14.4;
      const ox = mapCtx.offsetX || 0;
      const oy = mapCtx.offsetY || 0;
      return [snap5((hit.cx - ox) / pxPerFt - 2.5), snap5((hit.cy - oy) / pxPerFt - 2.5)];
    };

    const parseUnitFields = (parts, existing) => {
      const u = existing
        ? { ...existing, hp: { ...existing.hp }, pos: [...existing.pos], status: [...existing.status], _posExplicit: existing._posExplicit ?? true }
        : { id: '', att: 0, faction: 'friendly', init: 0, hp: { cur: 10, max: 10 }, pos: [0, 0], status: [], next: false, _posExplicit: false };

      for (const rawPart of parts) {
        const part = String(rawPart || '').trim();
        if (!part) continue;
        if (/^next\b/i.test(part)) { u.next = true; continue; }
        if (/^(remove|dead|out|退场)$/i.test(part)) { u._remove = true; continue; }
        const m = part.match(/^([a-zA-Z]+)\s*[:\s]\s*(.+)$/);
        if (!m) continue;
        const field = m[1].toLowerCase();
        const val = m[2].trim();
        if (field === 'att' || field === 'attitude') {
          const a = parseInt(val, 10);
          if (Number.isFinite(a)) { u.att = Math.max(0, Math.min(2, a)); u.faction = resolveFaction(u.att); }
        } else if (field === 'init') {
          const n = parseInt(val, 10);
          if (Number.isFinite(n)) u.init = n;
        } else if (field === 'hp') {
          if (/^[+-]\d+$/.test(val) && existing) {
            u.hp.cur = Math.max(0, Math.min(u.hp.max || 999, (u.hp.cur || 0) + parseInt(val, 10)));
          } else {
            const hm = val.match(/(-?\d+)\s*(?:\/\s*(-?\d+))?/);
            if (hm) {
              const c = parseInt(hm[1], 10);
              const mx = hm[2] ? parseInt(hm[2], 10) : (existing ? u.hp.max : c);
              u.hp.cur = Number.isFinite(c) ? c : 0;
              u.hp.max = Number.isFinite(mx) ? Math.max(1, mx) : Math.max(1, u.hp.cur);
            }
          }
        } else if (field === 'pos' || field === 'move') {
          const nums = val.split(/[,\s，]+/).map(Number).filter(Number.isFinite);
          if (nums.length >= 2) { u.pos = [snap5(nums[0]), snap5(nums[1])]; u._posExplicit = true; }
        } else if (field === 'room') {
          const rPos = resolveRoomFt(val);
          if (rPos) { u.pos = rPos; u._posExplicit = true; }
        } else if (field === 'status') {
          const tokens = val.split(/[\s,;|、]+/).map(s => s.trim()).filter(Boolean);
          for (const tk of tokens) {
            if (tk.startsWith('+')) {
              const s = tk.slice(1).trim();
              if (s && !u.status.includes(s)) u.status.push(s);
            } else if (tk.startsWith('-')) {
              const s = tk.slice(1).trim().toLowerCase();
              u.status = u.status.filter(x => x.toLowerCase() !== s);
            } else if (!existing) {
              if (!u.status.includes(tk)) u.status.push(tk);
            } else {
              u.status = tokens;
              break;
            }
          }
        }
      }
      return u;
    };

    for (const msg of messages || []) {
      const text = (typeof msg === 'string' ? msg : (msg?.mes || '')).replace(/<(think|thinking|reasoning|analysis|analyze)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
      if (!text) continue;

      const blocks = [...text.matchAll(/<(battle-delta|battle)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
      for (const blk of blocks) {
        const tag = blk[1].toLowerCase();
        const body = blk[2] || '';
        if (tag === 'battle' && !/^\s*@map\b/im.test(body) && !/<svg\b/i.test(body)) continue;
        const hasTerrain = /^\s*@map\b/im.test(body) || /<svg\b/i.test(body);
        if (hasTerrain) svgRawBlock = blk[0];
        else if (/^\s*@start(?:\s|$)/im.test(body)) svgRawBlock = '';
        if (tag === 'battle') {
          unitMap.clear();
          active = true;
          round = 1;
        }
        const lines = body.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
        let deltaCount = 0;
        let hasNextInBlock = false;
        let blockEnded = false;
        const parsedUpdates = [];

        for (const line of lines) {
          if (/^@start(?:\s|$)/i.test(line)) { unitMap.clear(); active=true; ended=false; blockEnded=false; round=1; deltaCount++; continue; }
          if (/^@(?:clear-all|reset)(?:\s|$)/i.test(line)) {
            active = false;
            ended = true;
            blockEnded = true;
            unitMap.clear();
            deltaCount++;
            continue;
          }
          if (/^@(?:wipe|clear-enemies|敌人全歼)(?:\s|$)/i.test(line)) {
            active = false;
            ended = true;
            blockEnded = true;
            for (const [k, u] of unitMap.entries()) {
              if (u.faction === 'hostile') unitMap.delete(k);
              else u.next = false;
            }
            deltaCount++;
            continue;
          }
          if (/^@(?:end|finish|clear|战斗结束)(?:\s|$)/i.test(line)) {
            active = false;
            ended = true;
            blockEnded = true;
            for (const [k, u] of unitMap.entries()) {
              if (u.faction === 'hostile' && u.hp?.cur != null && u.hp.cur <= 0) {
                unitMap.delete(k);
              } else {
                u.next = false;
              }
            }
            deltaCount++;
            continue;
          }
          if (/^@round\s*[:\s]\s*(\d+)/i.test(line)) {
            round = parseInt(line.match(/(\d+)/)[1], 10) || round;
            continue;
          }
          if (/^@next\s*[:：\s]\s*(.+)$/i.test(line)) {
            const targetRaw = line.match(/^@next\s*[:：\s]\s*(.+)$/i)[1].replace(/[`*]/g, '').trim();
            if (targetRaw) {
              for (const u of unitMap.values()) u.next = false;
              const hit = unitMap.get(targetRaw) || [...unitMap.values()].find(u => u.id.includes(targetRaw) || targetRaw.includes(u.id));
              if (hit) hit.next = true;
              for (const pu of parsedUpdates) {
                pu.next = !!(hit && pu.id === hit.id);
              }
              hasNextInBlock = true;
            }
            continue;
          }
          if (line.startsWith('@')) continue;
          if (/^(?:map|terrain)\s/i.test(line)) continue;
          if (!line.includes('|')) continue;
          const parts = line.split('|').map(p => p.trim()).filter(Boolean);
          const id = (parts[0] || '').replace(/[`*]/g, '').trim();
          if (!id || id.length > 36 || id.includes(':')) continue;
          if (/^(?:character\s*\d*\s*prompt|prompt|scene\s*prompt|image\s*prompt|negative\s*prompt|bg|background|style|camera|lighting)\b/i.test(id)) continue;
          const fieldsText = parts.slice(1).join('|');
          if (!/\b(?:att|attitude|init|hp|pos|move|room|status|next|remove|dead|out)\b|退场/i.test(fieldsText)) continue;
          if (!blockEnded) {
            active = true;
            ended = false;
          }
          const existing = unitMap.get(id) || null;
          if (!existing && parts.slice(1).every(p=>/^(next|remove|dead|out|退场)$/i.test(p))) continue;
          const nextUnit = parseUnitFields(parts.slice(1), existing);
          nextUnit.id = id;
          if (nextUnit.next) hasNextInBlock = true;
          parsedUpdates.push(nextUnit);
          deltaCount++;
        }

        if (hasNextInBlock) {
          for (const u of unitMap.values()) u.next = false;
        }
        for (const u of parsedUpdates) {
          if (u._remove) unitMap.delete(u.id);
          else unitMap.set(u.id, u);
        }
        if (deltaCount > 0) lastDeltaCount = deltaCount;
      }

      // Fallback: if AI emitted <!-- dnd-map: {"clear":[...]} --> without <battle-delta>,
      // remove hostile units in cleared rooms and end combat if no hostiles remain.
      if (blocks.length === 0 && active) {
        const dndMapMatch = text.match(/<!--\s*dnd-map\s*:\s*(\{[\s\S]*?\})\s*-->/i);
        if (dndMapMatch) {
          try {
            const payload = JSON.parse(dndMapMatch[1]);
            const clearedIds = Array.isArray(payload?.clear) ? payload.clear.map(String) : [];
            if (clearedIds.length) {
              const clearedSet = new Set(clearedIds);
              const curRoomInClear = payload?.room && clearedSet.has(String(payload.room));
              for (const [k, u] of unitMap.entries()) {
                if (u.faction === 'hostile' && ((u.roomId && clearedSet.has(String(u.roomId))) || curRoomInClear)) {
                  unitMap.delete(k);
                }
              }
              const anyHostileLeft = [...unitMap.values()].some(u => u.faction === 'hostile');
              if (!anyHostileLeft) {
                active = false;
                ended = true;
                for (const u of unitMap.values()) u.next = false;
              }
            }
          } catch {}
        }
      }

      // Standard turn-handoff directive in prose or delta: "下一个行动的角色是: 蒂法"
      if (unitMap.size > 0 && active) {
        const nextMatches = [...text.matchAll(/(?:^|\n)\s*(?:下一个行动的角色是|当前行动的角色是|下一位行动角色|下一个角色是|当前角色是|@next)\s*[:：]\s*([^\n\r<（(【\[]+)/gi)];
        if (nextMatches.length) {
          const targetRaw = String(nextMatches[nextMatches.length - 1][1] || '').replace(/[`*。.!！\s]+$/g, '').trim();
          if (targetRaw) {
            const hit = unitMap.get(targetRaw) || [...unitMap.values()].find(u => u.id === targetRaw || u.id.includes(targetRaw) || targetRaw.includes(u.id));
            if (hit) {
              for (const u of unitMap.values()) u.next = false;
              hit.next = true;
            }
          }
        }
      }
    }

    // Local encounter coordinates must never be fitted to an overworld's mile grid.
    if (mapCtx?.isOverworld) {
      const spec = parseTacticalMapDirectives(svgRawBlock);
      mapCtx = spec ? { pxPerFt: 15, widthPx: spec.widthFt * 15, heightPx: spec.heightFt * 15 } : null;
    }
    const units = [...unitMap.values()].sort((a, b) => (b.init - a.init));
    if (units.length && mapCtx?.widthPx && mapCtx?.heightPx && mapCtx?.pxPerFt) {
      const mapWFt = Math.max(25, (mapCtx.widthPx - (mapCtx.offsetX || 0)) / mapCtx.pxPerFt);
      const mapHFt = Math.max(25, (mapCtx.heightPx - (mapCtx.offsetY || 0)) / mapCtx.pxPerFt);
      const hasOob = units.some(u => u.pos[0] > mapWFt + 5 || u.pos[1] > mapHFt + 5);
      if (hasOob) {
        const legacyPx = mapCtx.legacyPxPerFt || 14.4;
        let ratioX = (legacyPx < mapCtx.pxPerFt * 0.85) ? (legacyPx / mapCtx.pxPerFt) : 1;
        let ratioY = ratioX;
        const maxScaledX = Math.max(...units.map(u => u.pos[0] * ratioX));
        const maxScaledY = Math.max(...units.map(u => u.pos[1] * ratioY));
        if (maxScaledX > mapWFt - 5 || maxScaledY > mapHFt - 5 || (ratioX === 1)) {
          const maxRawX = Math.max(1, ...units.map(u => u.pos[0]));
          const maxRawY = Math.max(1, ...units.map(u => u.pos[1]));
          if (maxRawX > mapWFt - 5) ratioX = (mapWFt - 10) / maxRawX;
          if (maxRawY > mapHFt - 5) ratioY = (mapHFt - 10) / maxRawY;
        }
        for (const u of units) {
          u.pos = [
            Math.max(0, Math.min(snap5(mapWFt - 5), snap5(u.pos[0] * ratioX))),
            Math.max(0, Math.min(snap5(mapHFt - 5), snap5(u.pos[1] * ratioY))),
          ];
        }
      }

      // Fallback placement: if any newly created unit omitted pos/room, place it in current room instead of [0, 0]
      if (mapCtx.curRoomId && units.some(u => u._posExplicit === false)) {
        const fallbackRoom = (mapCtx.rooms || []).find(r => r.id === mapCtx.curRoomId && !r.isStoryNode && r.cx != null && r.cy != null);
        if (fallbackRoom) {
          const pxPerFt = mapCtx.pxPerFt || 14.4;
          const ox = mapCtx.offsetX || 0;
          const oy = mapCtx.offsetY || 0;
          const bx = Math.max(0, snap5((fallbackRoom.cx - ox) / pxPerFt - 2.5));
          const by = Math.max(0, snap5((fallbackRoom.cy - oy) / pxPerFt - 2.5));
          let fIdx = 0;
          for (const u of units) {
            if (u._posExplicit === false) {
              u.pos = [bx + (fIdx % 3) * 5, by + Math.floor(fIdx / 3) * 5];
              u._posExplicit = true;
              fIdx++;
            }
          }
        }
      }

      // Local wall-overlap nudge: only when a unit center is literally clipped onto a wall line,
      // gently nudge 1-2 cells in its OWN local neighborhood without teleporting across rooms or stacking.
      if (Array.isArray(mapCtx.walls) && mapCtx.walls.length && units.length) {
        const activeWalls = mapCtx.walls.filter(w => w && !w.open && w.blocksMove !== false);
        if (activeWalls.length) {
          const pxPerFt = mapCtx.pxPerFt || 14.4;
          const cellPx = 5 * pxPerFt;
          const ox = mapCtx.offsetX || 0;
          const oy = mapCtx.offsetY || 0;
          const mw = mapCtx.widthPx || 2048;
          const mh = mapCtx.heightPx || 1536;
          const overlapThresh = cellPx * 0.14;
          const safeClear = cellPx * 0.22;
          const curRoom = mapCtx.curRoomId
            ? (mapCtx.rooms || []).find(r => r.id === mapCtx.curRoomId && !r.isStoryNode && r.cx != null && r.cy != null)
            : null;
          const occupied = new Set(units.map(u => `${Math.round(u.pos[0])},${Math.round(u.pos[1])}`));
          const minWallDist = (px, py) => {
            let minD = Infinity;
            for (const w of activeWalls) {
              const d = pointToSegmentDist(px, py, w.x1, w.y1, w.x2, w.y2);
              if (d < minD) minD = d;
            }
            return minD;
          };

          for (const u of units) {
            const px = ox + (u.pos[0] + 2.5) * pxPerFt;
            const py = oy + (u.pos[1] + 2.5) * pxPerFt;
            if (minWallDist(px, py) >= overlapThresh) continue;

            const baseCol = Math.max(0, Math.round(u.pos[0] / 5));
            const baseRow = Math.max(0, Math.round(u.pos[1] / 5));
            const nearCurRoom = curRoom && Math.hypot(px - curRoom.cx, py - curRoom.cy) <= cellPx * 6;
            let bestCand = null;
            let bestScore = Infinity;

            for (let dr = -2; dr <= 2; dr++) {
              for (let dc = -2; dc <= 2; dc++) {
                if (dc === 0 && dr === 0) continue;
                const nc = baseCol + dc;
                const nr = baseRow + dr;
                if (nc < 0 || nr < 0) continue;
                const candXFt = nc * 5;
                const candYFt = nr * 5;
                const npx = ox + (candXFt + 2.5) * pxPerFt;
                const npy = oy + (candYFt + 2.5) * pxPerFt;
                if (npx <= 18 || npx >= mw - 18 || npy <= 18 || npy >= mh - 18) continue;
                if (minWallDist(npx, npy) < safeClear) continue;
                if (occupied.has(`${candXFt},${candYFt}`)) continue;

                let score = Math.hypot(candXFt - u.pos[0], candYFt - u.pos[1]);
                if (nearCurRoom && !hasLineOfSight(npx, npy, curRoom.cx, curRoom.cy, activeWalls)) {
                  score += 12;
                }
                if (score < bestScore) {
                  bestScore = score;
                  bestCand = [candXFt, candYFt];
                }
              }
            }

            if (bestCand) {
              occupied.delete(`${Math.round(u.pos[0])},${Math.round(u.pos[1])}`);
              u.pos = bestCand;
              occupied.add(`${bestCand[0]},${bestCand[1]}`);
            }
          }
        }
      }
    }
    return { active, ended, round, units, svgRawBlock, lastDeltaCount };
  }

  function parseAiCorrectionResult(rawText, map, surface) {
    const str = String(rawText || '').trim();
    const jsonMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/i) || str.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) throw Error('AI 未返回有效 JSON 修正结果');
    const data = JSON.parse(jsonMatch[1]);
    if (!data || typeof data !== 'object') throw Error('AI 修正结果格式无效');

    const validRoomIds = new Set((map?.rooms || []).map(r => String(r.id)));
    const nextRoomId = (data.currentRoomId && validRoomIds.has(String(data.currentRoomId)))
      ? String(data.currentRoomId)
      : null;
    const exploredRooms = Array.isArray(data.exploredRooms)
      ? [...new Set(data.exploredRooms.map(String).filter(id => validRoomIds.has(id)))]
      : null;
    const clearedRooms = Array.isArray(data.clearedRooms)
      ? [...new Set(data.clearedRooms.map(String).filter(id => validRoomIds.has(id)))]
      : null;

    let partyPosPx = null;
    if (Array.isArray(data.partyPosFt) && data.partyPosFt.length >= 2) {
      const pxPerFt = surface?.pxPerFt || 15;
      const ox = surface?.gridOffsetX || 0;
      const oy = surface?.gridOffsetY || 0;
      const xFt = Number(data.partyPosFt[0]);
      const yFt = Number(data.partyPosFt[1]);
      if (Number.isFinite(xFt) && Number.isFinite(yFt)) {
        partyPosPx = {
          x: Math.max(18, Math.min((surface?.width || 2048) - 18, Math.round(ox + xFt * pxPerFt))),
          y: Math.max(18, Math.min((surface?.height || 1536) - 18, Math.round(oy + yFt * pxPerFt))),
        };
      }
    }

    let units = null;
    if (Array.isArray(data.units)) {
      const snap5 = (v) => Math.round((Number(v) || 0) / 5) * 5;
      units = data.units
        .filter(u => u && u.id)
        .map(u => {
          const att = Number.isFinite(Number(u.att)) ? Math.max(0, Math.min(2, Number(u.att))) : 0;
          const faction = att === 2 ? 'hostile' : att === 1 ? 'neutral' : 'friendly';
          let cur = 10, max = 10;
          if (u.hp && typeof u.hp === 'object') {
            cur = Number(u.hp.cur ?? 10);
            max = Math.max(1, Number(u.hp.max ?? cur ?? 10));
          } else if (typeof u.hp === 'string') {
            const hm = u.hp.match(/(-?\d+)\s*(?:\/\s*(-?\d+))?/);
            if (hm) {
              cur = parseInt(hm[1], 10);
              max = hm[2] ? Math.max(1, parseInt(hm[2], 10)) : Math.max(1, cur);
            }
          }
          const pos = Array.isArray(u.pos) && u.pos.length >= 2
            ? [snap5(u.pos[0]), snap5(u.pos[1])]
            : [0, 0];
          return {
            id: String(u.id).trim(),
            att,
            faction,
            init: Number(u.init) || 0,
            hp: { cur, max },
            pos,
            status: Array.isArray(u.status) ? u.status.map(String) : [],
            next: !!u.next,
          };
        });
    }

    return {
      currentRoomId: nextRoomId,
      exploredRooms,
      clearedRooms,
      partyPosPx,
      battleActive: typeof data.battleActive === 'boolean' ? data.battleActive : (units ? units.length > 0 : null),
      units,
      reason: String(data.reason || '').trim(),
    };
  }

  function buildLocalMapSeedUnits(map, surface, partyMembers = [], monsterBank = {}, currentRoomId = '') {
    if (!map) return [];
    const pxPerFt = surface?.pxPerFt || 15;
    const ox = surface?.gridOffsetX || 0;
    const oy = surface?.gridOffsetY || 0;
    const snap5 = (v) => Math.round((Number(v) || 0) / 5) * 5;
    const wFt = Math.max(25, snap5(((surface?.width || map.width || 2048) - ox) / pxPerFt));
    const hFt = Math.max(25, snap5(((surface?.height || map.height || 1536) - oy) / pxPerFt));
    const clampFt = (x, y) => [
      Math.max(0, Math.min(wFt - 5, snap5(x))),
      Math.max(0, Math.min(hFt - 5, snap5(y))),
    ];
    const units = [];
    const firstSpatialRoom = (map.rooms || []).find(r => !r.isStoryNode && r.cx != null && r.cy != null) || map.rooms?.[0];
    const entryRoom = (currentRoomId && (map.rooms || []).find(r => r.id === currentRoomId && !r.isStoryNode && r.cx != null && r.cy != null))
      || firstSpatialRoom;
    const preset = map.imageUrl ? matchOfficialMapPreset(map.imageUrl) : null;
    const partyList = partyMembers.length ? partyMembers : [{ id: '主角', hp: { cur: 12, max: 12 } }];
    if (entryRoom && entryRoom.cx != null && entryRoom.cy != null) {
      const usePresetSpawn = preset?.entryPointFt && (!currentRoomId || entryRoom.id === firstSpatialRoom?.id);
      const bx = usePresetSpawn ? preset.entryPointFt.x : ((entryRoom.cx - ox) / pxPerFt - 2.5);
      const by = usePresetSpawn ? preset.entryPointFt.y : ((entryRoom.cy - oy) / pxPerFt - 2.5);
      const safePool = getSafeWalkableCellsForRoom(entryRoom, map, partyList.length + 6);
      partyList.forEach((p, idx) => {
        const sp = safePool[idx];
        const pos = sp
          ? [sp.xFt, sp.yFt]
          : clampFt(bx + ((idx % 3) - 1) * 5, by + Math.floor(idx / 3) * 5);
        units.push({
          id: p.id || p.name || `队员${idx + 1}`,
          att: 0,
          faction: 'friendly',
          init: 0,
          hp: p.hp || { cur: 12, max: 12 },
          pos,
          status: [],
          next: idx === 0,
          roomId: entryRoom.id,
          _seeded: true,
        });
      });
    }

    for (const r of map.rooms || []) {
      if (r.isStoryNode || r.cx == null || r.cy == null) continue;
      const rx = (r.cx - ox) / pxPerFt - 2.5;
      const ry = (r.cy - oy) / pxPerFt - 2.5;
      const creatures = r.refs?.creatures || [];
      let mIdx = 0;
      for (const c of creatures) {
        const count = Math.max(1, Math.min(6, Number(c.count) || 1));
        const stat = monsterBank[c.key] || monsterBank[String(c.name || '').toLowerCase()];
        const hpAvg = Number(stat?.hp?.average || stat?.hp || 7) || 7;
        for (let k = 0; k < count; k++) {
          const ang = (Math.PI * 2 * mIdx) / Math.max(2, count + 1);
          const dist = 5 + Math.floor(mIdx / 4) * 5;
          const label = count > 1 ? `${c.name}${k + 1}` : c.name;
          units.push({
            id: label,
            att: 2,
            faction: 'hostile',
            init: 0,
            hp: { cur: hpAvg, max: hpAvg },
            pos: clampFt(rx + Math.cos(ang) * dist, ry + Math.sin(ang) * dist),
            status: [],
            next: false,
            roomId: r.id,
            _seeded: true,
          });
          mIdx++;
        }
      }
    }
    return units;
  }


  const MONSTER_TOKEN_FILES = ["aarakocra-aeromancer.webp","aarakocra-skirmisher.webp","aberrant-cultist.webp","aboleth.webp","abominable-yeti.webp","adult-black-dragon.webp","adult-blue-dragon.webp","adult-brass-dragon.webp","adult-copper-dragon.webp","adult-gold-dragon.webp","adult-red-dragon.webp","adult-silver-dragon.webp","adult-white-dragon.webp","air-elemental.webp","allosaurus.webp","ancient-black-dragon.webp","ancient-blue-dragon.webp","ancient-brass-dragon.webp","ancient-bronze-dragon.webp","ancient-gold-dragon.webp","ancient-green-dragon.webp","ancient-red-dragon.webp","ancient-silver-dragon.webp","ancient-white-dragon.webp","animal-lord-01.webp","animal-lord-02.webp","animated-armor.webp","animated-broom.webp","animated-flying-sword.webp","animated-rug-of-smothering.webp","ankheg.webp","ankylosaurus.webp","ape.webp","arcanaloth.webp","arch-hag-01.webp","arch-hag-02.webp","archelon.webp","archmage.webp","archpriest.webp","assassin.webp","awakened-shrub-01.webp","awakened-shrub-02.webp","awakened-shrub-03.webp","awakened-shrub-04.webp","awakened-shrub-05.webp","awakened-tree.webp","axe-beak.webp","azer-pyromancer.webp","azer-sentinel.webp","baboon.webp","badger.webp","balor.webp","bandit-captain.webp","bandit-crime-lord.webp","bandit-deceiver.webp","bandit.webp","banshee-01.webp","banshee-02.webp","barbed-devil.webp","barlgura.webp","basilisk.webp","bat.webp","bearded-devil.webp","behir.webp","beholder-zombie.webp","beholder.webp","berserker-01.webp","berserker-02.webp","berserker-03.webp","berserker-commander.webp","black-bear.webp","black-dragon-wyrmling.webp","black-pudding.webp","blink-dog.webp","blob-of-annihilation.webp","blood-hawk.webp","blue-dragon-wyrmling.webp","blue-slaad.webp","boar.webp","bone-devil.webp","bone-naga.webp","brass-dragon-wyrmling.webp","brazen-gorgon.webp","bronze-dragon-wyrmling.webp","brown-bear.webp","bugbear-stalker.webp","bugbear-warrior.webp","bulette-pup.webp","bulette.webp","bullywug-bog-sage.webp","bullywug-warrior.webp","cambion-01.webp","cambion-02.webp","camel.webp","carrion-crawler.webp","cat-01.webp","cat-02.webp","centaur-trooper.webp","centaur-warden.webp","chain-devil.webp","chasme.webp","chimera.webp","chuul.webp","clay-golem.webp","cloaker.webp","cloud-giant-01.webp","cloud-giant-02.webp","cockatrice-regent.webp","cockatrice.webp","colossus.webp","commoner-01.webp","commoner-02.webp","commoner-03.webp","constrictor-snake.webp","copper-dragon-wyrmling.webp","couatl.webp","crab.webp","crawling-claw.webp","crocodile.webp","cultist-fanatic-01.webp","cultist-fanatic-02.webp","cultist-hierophant.webp","cultist.webp","cyclops-oracle.webp","cyclops-sentry.webp","dao.webp","darkmantle.webp","death-cultist.webp","death-dog.webp","death-knight-aspirant.webp","death-knight.webp","death-slaad.webp","death-tyrant.webp","deer.webp","demilich.webp","deva.webp","dire-wolf.webp","dire-worg.webp","displacer-beast.webp","djinni.webp","doppelganger.webp","dracolich.webp","dragon-turtle.webp","dretch.webp","drider.webp","druid-01.webp","druid-02.webp","dryad-01.webp","dryad-02.webp","dust-mephit.webp","eagle.webp","earth-elemental.webp","efreeti.webp","elemental-cataclysm.webp","elemental-cultist.webp","elephant.webp","elk.webp","empyrean-iota.webp","empyrean.webp","erinyes.webp","ettercap.webp","ettin.webp","faerie-dragon-adult.webp","faerie-dragon-youth.webp","fiend-cultist-01.webp","fiend-cultist-02.webp","fire-elemental.webp","fire-giant-01.webp","fire-giant-02.webp","fire-salamander.webp","flameskull-01.webp","flameskull-02.webp","flameskull-03.webp","flaming-skeleton.webp","flesh-golem.webp","flumph.webp","flying-snake.webp","fomorian-01.webp","fomorian-02.webp","frog-01.webp","frost-giant-01.webp","frost-giant-02.webp","galeb-duhr.webp","gargoyle.webp","gas-spore-fungus.webp","gelatinous-cube.webp","ghast-gravecaller.webp","ghast.webp","ghost.webp","ghoul.webp","giant-ape.webp","giant-badger.webp","giant-bat.webp","giant-boar.webp","giant-centipede.webp","giant-constrictor-snake.webp","giant-crab.webp","giant-fire-beetle.webp","giant-frog.webp","giant-goat.webp","giant-lizard.webp","giant-rat.webp","giant-seahorse.webp","giant-shark.webp","giant-spider-01.webp","giant-spider-02.webp","giant-squid.webp","giant-toad.webp","giant-wasp.webp","giant-weasel.webp","giant-wolf-spider.webp","gibbering-mouther.webp","githyanki-dracomancer.webp","githyanki-knight.webp","githyanki-soldier.webp","githzerai-monk.webp","githzerai-psion.webp","githzerai-zerth.webp","glabrezu.webp","gladiator.webp","gnoll-demoniac.webp","gnoll-fang-of-yeenoghu.webp","gnoll-pack-lord.webp","gnoll-warrior.webp","goat.webp","goblin-boss.webp","goblin-hexer.webp","goblin-warrior.webp","gold-dragon-wyrmling.webp","gorgon.webp","goristro.webp","graveyard-revenant.webp","gray-ooze.webp","gray-slaad.webp","green-dragon-wyrmling.webp","green-hag.webp","green-slaad.webp","grell.webp","grick.webp","griffon.webp","grimlock.webp","guard-captain.webp","guard.webp","guardian-naga.webp","gulthias-blight.webp","half-dragon.webp","harpy.webp","haunting-revenant.webp","hawk.webp","hell-hound.webp","helmed-horror.webp","hezrou.webp","hill-giant-01.webp","hill-giant-02.webp","hippogriff.webp","hippopotamus.webp","hobgoblin-captain.webp","hobgoblin-warlord.webp","hobgoblin-warrior.webp","homunculus-01.webp","homunculus-02.webp","homunculus-03.webp","hook-horror.webp","horned-devil.webp","horse-01.webp","horse-02.webp","horse-03.webp","horse-04.webp","hydra.webp","hyena.webp","ice-devil.webp","ice-mephit.webp","imp.webp","incubus.webp","intellect-devourer.webp","invisible-stalker-01.webp","invisible-stalker-02.webp","iron-golem.webp","jackal.webp","jackalwere-01.webp","jackalwere-02.webp","kenku.webp","killer-whale.webp","knight.webp","kobold-warrior.webp","kraken.webp","kuo-toa-archpriest.webp","kuo-toa-monitor.webp","kuo-toa-whip.webp","kuo-toa.webp","lacedon-ghoul.webp","lamia.webp","larva-01.webp","larva-02.webp","lemure.webp","lich.webp","lion.webp","lizardfolk-geomancer.webp","lizardfolk-sovereign.webp","mage-apprentice.webp","mage.webp","magma-mephit.webp","magmin.webp","mammoth.webp","manes-vaporspawn.webp","manes.webp","manticore.webp","marid.webp","marilith.webp","mastiff.webp","medusa-01.webp","medusa-02.webp","merfolk-skirmisher.webp","merfolk-wavebender.webp","merrow.webp","mezzoloth.webp","mimic.webp","mind-flayer-arcanist.webp","mind-flayer.webp","minotaur-of-baphomet.webp","minotaur-skeleton.webp","modron-duodrone.webp","modron-monodrone.webp","modron-pentadrone.webp","modron-quadrone.webp","modron-tridrone.webp","mud-mephit.webp","mule.webp","mummy-lord.webp","mummy.webp","myconid-adult.webp","myconid-sovereign.webp","myconid-spore-servant-01.webp","myconid-spore-servant-02.webp","myconid-sprout-01.webp","myconid-sprout-02.webp","myconid-sprout-03.webp","myconid-sprout-04.webp","nalfeshnee.webp","needle-blight.webp","night-hag.webp","nightmare-01.webp","nightmare-02.webp","nightmare-03.webp","noble-prodigy.webp","noble.webp","nothic.webp","nycaloth.webp","ochre-jelly-01.webp","ochre-jelly-02.webp","octopus.webp","ogre-zombie.webp","ogre.webp","ogrillon-ogre.webp","oni.webp","otyugh.webp","owl-01.webp","owl-02.webp","owl-03.webp","owlbear.webp","panther.webp","pegasus.webp","performer-01.webp","performer-02.webp","performer-03.webp","performer-legend-01.webp","performer-legend-02.webp","performer-legend-03.webp","performer-maestro.webp","peryton.webp","phase-spider.webp","piercer.webp","piranha.webp","pirate-admiral.webp","pirate-captain.webp","pirate.webp","pit-fiend.webp","pixie-wonderbringer.webp","pixie.webp","planetar.webp","plesiosaurus.webp","polar-bear.webp","poltergeist.webp","priest-acolyte-01.webp","priest-acolyte-02.webp","priest.webp","pseudodragon.webp","psychic-gray-ooze.webp","pteranodon.webp","purple-worm.webp","quaggoth-thonot.webp","quaggoth.webp","quasit.webp","questing-knight.webp","rakshasa.webp","rat.webp","raven.webp","red-dragon-wyrmling.webp","red-slaad.webp","reef-shark.webp","remorhaz.webp","revenant.webp","rhinoceros.webp","roc.webp","roper.webp","rust-monster.webp","saber-toothed-tiger.webp","sahuagin-baron.webp","sahuagin-priest.webp","sahuagin-warrior.webp","salamander-fire-snake.webp","salamander-inferno-master.webp","salamander.webp","satyr-revelmaster.webp","satyr.webp","scarecrow.webp","scorpion.webp","scout-captain.webp","scout.webp","sea-hag.webp","shadow-demon.webp","shadow-dragon.webp","shadow.webp","shambling-mound.webp","shield-guardian.webp","shrieker-fungus.webp","silver-dragon-wyrmling.webp","skeleton-01.webp","skeleton-02.webp","slaad-tadpole.webp","smoke-mephit.webp","solar.webp","spectator.webp","specter-01.webp","specter-02.webp","sphinx-of-lore.webp","sphinx-of-secrets.webp","sphinx-of-valor.webp","sphinx-of-wonder.webp","spider.webp","spined-devil-01.webp","spined-devil-02.webp","spined-devil-03.webp","spirit-naga.webp","sprite-01.webp","sprite-02.webp","spy-master-01.webp","spy-master-02.webp","steam-mephit.webp","stirge.webp","stone-giant-01.webp","stone-giant-02.webp","stone-golem.webp","storm-giant.webp","succubus-003.webp","succubus-004.webp","succubus-01.webp","succubus-02.webp","swarm-of-bats.webp","swarm-of-crawling-claws.webp","swarm-of-dretches.webp","swarm-of-insects.webp","swarm-of-larvae.webp","swarm-of-lemures.webp","swarm-of-piranha.webp","swarm-of-rats.webp","swarm-of-ravens.webp","swarm-of-stirges.webp","swarm-of-venomous-snakes.webp","tarrasque-01.webp","tarrasque-02.webp","thri-kreen-marauder.webp","thri-kreen-psion.webp","tiger-01.webp","tiger-02.webp","tough.webp","treant.webp","tree-blight.webp","triceratops.webp","troglodyte.webp","troll-limb.webp","troll.webp","twig-blight.webp","tyrannosaurus-rex.webp","ultroloth.webp","umber-hulk.webp","unicorn.webp","vampire-01.webp","vampire-02.webp","vampire-familiar.webp","vampire-nightbringer.webp","vampire-spawn.webp","vampire-umbral-lord-01.webp","vampire-umbral-lord-02.webp","vampire-umbral-lord-03.webp","venomous-snake.webp","vine-blight.webp","violet-fungus-necrohulk.webp","violet-fungus.webp","vrock.webp","vulture.webp","warhorse-skeleton.webp","warhorse.webp","warrior-infantry.webp","warrior-veteran.webp","water-elemental.webp","water-weird.webp","weasel.webp","werebear.webp","wereboar.webp","wererat.webp","weretiger.webp","werewolf.webp","white-dragon-wyrmling.webp","wight.webp","will-o-wisp-01.webp","will-o-wisp-02.webp","will-o-wisp-03.webp","winged-kobold.webp","winter-wolf.webp","wolf-01.webp","wolf-02.webp","worg.webp","wraith.webp","wyvern.webp","xorn.webp","yeti.webp","yochlol.webp","yuan-ti-abomination.webp","yuan-ti-infiltrator-01.webp","yuan-ti-infiltrator-02.webp","yuan-ti-malison-01.webp","yuan-ti-malison-02.webp","yuan-ti-malison-03.webp","zombie-01.webp","zombie-02.webp"];
  const MONSTER_TOKEN_SET = new Set(MONSTER_TOKEN_FILES);

  const CN_TO_MONSTER_SLUG = {
    '地精头目': 'goblin-boss', '地精老大': 'goblin-boss', '地精巫师': 'goblin-hexer', '地精术士': 'goblin-hexer',
    '熊地精': 'bugbear-warrior', '熊地精潜行者': 'bugbear-stalker', '大地精': 'hobgoblin-warrior', '大地精队长': 'hobgoblin-captain',
    '地精': 'goblin-warrior', '恐狼': 'dire-wolf', '座狼': 'worg', '冬狼': 'winter-wolf', '狼': 'wolf-01',
    '狼人': 'werewolf', '鼠人': 'wererat', '熊人': 'werebear', '野猪人': 'wereboar', '虎人': 'weretiger',
    '骷髅': 'skeleton-01', '牛头人骷髅': 'minotaur-skeleton', '战马骷髅': 'warhorse-skeleton',
    '僵尸': 'zombie-01', '眼魔僵尸': 'beholder-zombie', '食尸鬼': 'ghoul', '妖鬼': 'ghast', '尸妖': 'wight', '恶灵': 'wraith', '怨灵': 'specter-01', '幽灵': 'ghost', '报丧女妖': 'banshee-01', '鬼火': 'will-o-wisp-01',
    '吸血鬼': 'vampire-01', '吸血鬼衍体': 'vampire-spawn', '巫妖': 'lich', '木乃伊': 'mummy',
    '枭熊': 'owlbear', '眼魔': 'beholder', '观察者': 'spectator', '诺斯': 'nothic', '夺心魔': 'mind-flayer', '底栖魔鱼': 'aboleth',
    '强盗头目': 'bandit-captain', '强盗': 'bandit', '匪徒': 'bandit', '邪教徒': 'cultist', '邪教狂热者': 'cultist-fanatic',
    '警卫': 'guard', '卫兵': 'guard', '刺客': 'assassin', '间谍': 'spy-master-01', '侦察兵': 'scout', '骑士': 'knight', '法师': 'mage', '大法师': 'archmage', '祭司': 'priest', '高阶祭司': 'archpriest', '平民': 'commoner-01', '暴徒': 'tough', '狂战士': 'berserker-01', '老兵': 'warrior-veteran', '步兵': 'warrior-infantry',
    '巨蜘蛛': 'giant-spider', '巨狼蜘蛛': 'giant-wolf-spider', '蜘蛛': 'spider', '巨鼠': 'giant-rat', '鼠群': 'swarm-of-rats', '鼠': 'rat', '巨蛙': 'giant-frog', '巨蛤蟆': 'giant-toad',
    '褐熊': 'brown-bear', '棕熊': 'brown-bear', '黑熊': 'black-bear', '野猪': 'boar', '黑豹': 'panther', '老虎': 'tiger-01', '狮子': 'lion',
    '食人魔': 'ogre', '巨魔': 'troll', '山丘巨人': 'hill-giant', '石巨人': 'stone-giant-01', '霜巨人': 'frost-giant', '火巨人': 'fire-giant', '云巨人': 'cloud-giant-01', '风暴巨人': 'storm-giant',
    '狗头人': 'kobold-warrior', '翼狗头人': 'winged-kobold', '蜥蜴人': 'lizardfolk-01', '穴居人': 'troglodyte', '恶鬼': 'oni', '石像鬼': 'gargoyle', '鬼婆': 'green-hag', '绿鬼婆': 'green-hag', '夜鬼婆': 'night-hag', '海鬼婆': 'sea-hag',
    '凝胶怪': 'gelatinous-cube', '拟形怪': 'mimic', '黑布丁': 'black-pudding', '赭冻怪': 'ochre-jelly', '灰泥怪': 'gray-ooze', '锈蚀怪': 'rust-monster', '腐肉虫': 'carrion-crawler', '钩恐怖': 'hook-horror', '移位兽': 'displacer-beast', '蛰伏伪怪': 'cloaker', '阴暗怪': 'darkmantle', '蚊蝠': 'stirge',
    '火元素': 'fire-elemental', '水元素': 'water-elemental', '土元素': 'earth-elemental', '气元素': 'air-elemental', '石魔像': 'stone-golem', '铁魔像': 'iron-golem', '血肉魔像': 'flesh-golem', '黏土魔像': 'clay-golem',
    '红龙雏龙': 'red-dragon-wyrmling', '绿龙雏龙': 'green-dragon-wyrmling', '黑龙雏龙': 'black-dragon-wyrmling', '蓝龙雏龙': 'blue-dragon-wyrmling', '白龙雏龙': 'white-dragon-wyrmling',
    '幼年红龙': 'young-red-dragon', '幼年绿龙': 'young-green-dragon', '幼年黑龙': 'young-black-dragon', '幼年蓝龙': 'young-blue-dragon', '幼年白龙': 'young-white-dragon',
    '成年红龙': 'adult-red-dragon', '成年绿龙': 'adult-green-dragon', '成年黑龙': 'adult-black-dragon', '成年蓝龙': 'adult-blue-dragon', '成年白龙': 'adult-white-dragon',
    '红龙': 'adult-red-dragon', '绿龙': 'young-green-dragon', '黑龙': 'adult-black-dragon', '蓝龙': 'adult-blue-dragon', '白龙': 'adult-white-dragon',
    '双足飞龙': 'wyvern', '奇美拉': 'chimera', '九头蛇': 'hydra', '蝎尾狮': 'manticore', '狮鹫': 'griffon', '蛇鸡': 'cockatrice', '美杜莎': 'medusa', '牛头人': 'minotaur', '半人马': 'centaur-trooper', '鲨蜥兽': 'bulette',
    '小魔鬼': 'imp', '魔鬼': 'bearded-devil', '恶魔': 'barlgura', '魅魔': 'succubus-01', '树人': 'treant', '枯萎病': 'twig-blight', '蕈人': 'myconid-adult', '枯萎树妖': 'vine-blight', '针刺枯萎': 'needle-blight',
  };

  function matchSlugToTokenFile(rawSlug) {
    const slug = String(rawSlug || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) return '';
    const candidates = [
      `${slug}.webp`,
      `${slug}-01.webp`,
      `${slug}-warrior.webp`,
      `${slug}-trooper.webp`,
      `${slug}-adult.webp`,
    ];
    for (const c of candidates) {
      if (MONSTER_TOKEN_SET.has(c)) return c;
    }
    const prefixHit = MONSTER_TOKEN_FILES.find(f => f.startsWith(`${slug}-`));
    if (prefixHit) return prefixHit;
    const partHit = MONSTER_TOKEN_FILES.find(f => f.includes(slug));
    return partHit || '';
  }

  function resolveMonsterTokenUrl(name, monsterBank = {}) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    // Direct English slug match first
    if (/^[a-zA-Z0-9\s_-]+$/.test(raw)) {
      const f = matchSlugToTokenFile(raw.replace(/\s*\d+$/, ''));
      if (f) return `/assets/monster-tokens/${f}`;
    }
    const cleaned = raw
      .replace(/^(?:北侧|南侧|东侧|西侧|左侧|右侧|暗哨|巡逻|受伤|精英|首领|守卫|头目)/, '')
      .replace(/[#\-\s]*\d+$/, '')
      .trim();

    // 1. Check monsterBank (5etools bestiary Chinese -> ENG_name)
    if (monsterBank && typeof monsterBank === 'object') {
      for (const m of Object.values(monsterBank)) {
        if (!m || typeof m !== 'object') continue;
        const cn = String(m.name || '').trim();
        const en = String(m.ENG_name || '').trim();
        if (!en) continue;
        if (cn === raw || cn === cleaned || (cn && raw.includes(cn)) || (cn && cleaned && cleaned.includes(cn))) {
          const f = matchSlugToTokenFile(en);
          if (f) return `/assets/monster-tokens/${f}`;
        }
      }
    }

    // 2. Longest-match Chinese -> Monster slug table
    const keys = Object.keys(CN_TO_MONSTER_SLUG).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      if (raw.includes(k) || (cleaned && cleaned.includes(k))) {
        const f = matchSlugToTokenFile(CN_TO_MONSTER_SLUG[k]);
        if (f) return `/assets/monster-tokens/${f}`;
      }
    }
    return '';
  }

  return {
    BASE_URL,
    OFFICIAL_MAP_PRESETS,
    matchOfficialMapPreset,
    resolveMapScale,
    compileBattleTimeline,
    getSafeWalkableCellsForRoom,
    buildTacticalSituationText,
    parseAiCorrectionResult,
    buildLocalMapSeedUnits,
    resolveMonsterTokenUrl,
    PLUTONIUM_SCENES_BASE,
    PLUTONIUM_MODULE_ALIASES,
    encodeImgPath,
    strip5eTags,
    extractEntityRefs,
    renderEntriesToText,
    formatMonsterStatblock,
    polygonDistance,
    pointInPolygon,
    compassDirection,
    compileAdventureData,
    convertPlutoniumWalls,
    applyPlutoniumSceneData,
    formatFloorTopologyText,
    buildModuleWorldbookPrompt,
    resolveRoomToken,
    parseAiMapMarkers,
    buildMapWallNetwork,
    computeVisibilityPolygon,
    hasLineOfSight,
    clampMoveByWalls,
    getPresetSvgMapForNode,
    parseTacticalMapDirectives,
    compileSvgTacticalMap,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createModuleRunnerCore };
}
if (typeof globalThis !== 'undefined') {
  globalThis.createModuleRunnerCore = createModuleRunnerCore;
}




// D&D 2024 Module Runner — Data Cache, Worldbook Sliding-Window Sync & AI Autonomous Progression
function createModuleRunnerSync(core, host, api) {
  const getBookName = () => api('getCharWorldbookNames')('current').primary;
  const STORE_KEY = 'dnd_module_state';
  const ENTRY_UID = 781499;
  const ENTRY_COMMENT = '[模组地图·战斗场景] 当前地城拓扑与原版房间数据';
  const DB_NAME = 'dnd_module_runner_cache_v1';
  const DB_STORE = 'kv';

  const memAdventures = new Map();
  const memMonsters = new Map();
  let catalogCache = null;
  let bestiaryIndexCache = null;

  function openDb() {
    return new Promise((resolve) => {
      try {
        const idb = host.indexedDB || globalThis.indexedDB;
        if (!idb) return resolve(null);
        const req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function dbGet(key) {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function dbSet(key, val) {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(val, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async function fetchJson(url) {
    const fetchFn = host.fetch?.bind(host) || globalThis.fetch;
    const res = await fetchFn(url);
    if (!res.ok) throw Error(`拉取数据失败 (${res.status}): ${url}`);
    return res.json();
  }

  async function loadCatalog(force = false) {
    if (!force && catalogCache) return catalogCache;
    if (!force) {
      const cached = await dbGet('catalog:adventures');
      if (Array.isArray(cached) && cached.length) {
        catalogCache = cached;
        return catalogCache;
      }
    }
    const data = await fetchJson(`${core.BASE_URL}/data/adventures.json`);
    const list = Array.isArray(data?.adventure) ? data.adventure : [];
    catalogCache = list;
    await dbSet('catalog:adventures', list);
    return list;
  }

  async function loadBestiarySource(sourceCode) {
    const src = String(sourceCode || 'MM').trim();
    const upper = src.toUpperCase();
    if (memMonsters.has(`__loaded_${upper}`)) return;
    const cached = await dbGet(`bestiary:${upper}`);
    if (Array.isArray(cached)) {
      for (const m of cached) {
        if (!m?.name) continue;
        memMonsters.set(`${m.name.toLowerCase()}|${upper}`, m);
        if (m.ENG_name) memMonsters.set(`${m.ENG_name.toLowerCase()}|${upper}`, m);
        if (!memMonsters.has(m.name.toLowerCase())) memMonsters.set(m.name.toLowerCase(), m);
      }
      memMonsters.set(`__loaded_${upper}`, true);
      return;
    }
    try {
      if (!bestiaryIndexCache) {
        bestiaryIndexCache = (await dbGet('bestiary:index')) || (await fetchJson(`${core.BASE_URL}/data/bestiary/index.json`));
        await dbSet('bestiary:index', bestiaryIndexCache);
      }
      const file = bestiaryIndexCache[src] || bestiaryIndexCache[upper] || Object.entries(bestiaryIndexCache).find(([k]) => k.toUpperCase() === upper)?.[1] || `bestiary-${src.toLowerCase()}.json`;
      const raw = await fetchJson(`${core.BASE_URL}/data/bestiary/${file}`);
      const list = Array.isArray(raw?.monster) ? raw.monster : [];
      await dbSet(`bestiary:${upper}`, list);
      for (const m of list) {
        if (!m?.name) continue;
        memMonsters.set(`${m.name.toLowerCase()}|${upper}`, m);
        if (m.ENG_name) memMonsters.set(`${m.ENG_name.toLowerCase()}|${upper}`, m);
        if (!memMonsters.has(m.name.toLowerCase())) memMonsters.set(m.name.toLowerCase(), m);
      }
      memMonsters.set(`__loaded_${upper}`, true);
    } catch {
      memMonsters.set(`__loaded_${upper}`, true);
    }
  }

  async function ensureRoomMonsters(compiledAdv, room, map = null) {
    if (!room) return;
    const sources = new Set(['MM']);
    if (compiledAdv?.id) sources.add(compiledAdv.id);

    const addRoomSources = (r) => {
      for (const c of r?.refs?.creatures || []) {
        if (c.source) sources.add(c.source);
      }
    };
    addRoomSources(room);

    const hostMap = map || compiledAdv?.maps?.find(m => m.rooms?.some(r => r.id === room.id));
    if (hostMap) {
      for (const edge of room.edges || []) {
        const neighbor = hostMap.rooms.find(r => r.id === edge.toId);
        if (neighbor) addRoomSources(neighbor);
      }
      if (hostMap.nextMapId && compiledAdv?.maps) {
        const nextMap = compiledAdv.maps.find(m => m.id === hostMap.nextMapId);
        for (const nr of (nextMap?.rooms || []).slice(0, 2)) {
          addRoomSources(nr);
        }
      }
    }

    await Promise.all([...sources].map(s => loadBestiarySource(s)));
  }

  async function loadAdventure(advId, force = false) {
    if (!advId) return null;
    const key = String(advId).trim();
    if (!force && memAdventures.has(key)) return memAdventures.get(key);

    const catalog = await loadCatalog().catch(() => []);
    const meta = catalog.find(a => a.id.toLowerCase() === key.toLowerCase()) || { id: key, name: key };
    const canonicalId = meta.id || key;

    let raw = !force ? await dbGet(`adventure:raw:${canonicalId}`) : null;
    if (!raw) {
      raw = await fetchJson(`${core.BASE_URL}/data/adventure/adventure-${canonicalId.toLowerCase()}.json`);
      await dbSet(`adventure:raw:${canonicalId}`, raw);
    }
    const compiled = core.compileAdventureData(canonicalId, meta, raw);
    if (typeof core.applyPlutoniumSceneData === 'function' && core.PLUTONIUM_SCENES_BASE) {
      let plutJson = null;
      const plutCacheKey = `dnd_mr_plutonium_v1_${canonicalId}`;
      if (!force) {
        plutJson = await dbGet(`plutonium:v1:${canonicalId}`).catch(() => null);
        if (!plutJson) {
          try {
            if (typeof localStorage !== 'undefined') {
              const cached = localStorage.getItem(plutCacheKey);
              if (cached) plutJson = JSON.parse(cached);
            }
          } catch (_) {}
        }
      }
      if (!plutJson) {
        try {
          const plutFileId = (core.PLUTONIUM_MODULE_ALIASES && core.PLUTONIUM_MODULE_ALIASES[canonicalId.toLowerCase()]) || canonicalId.toLowerCase();
          plutJson = await Promise.race([
            fetchJson(`${core.PLUTONIUM_SCENES_BASE}/foundry-maps-${plutFileId}.json`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Plutonium timeout')), 6000)),
          ]);
          if (plutJson) {
            await dbSet(`plutonium:v1:${canonicalId}`, plutJson).catch(() => {});
            try {
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem(plutCacheKey, JSON.stringify(plutJson));
              }
            } catch (_) {}
          }
        } catch (_) {
          // Graceful fallback to polygon walls if Plutonium lacks this module or network fails
        }
      }
      if (plutJson) {
        try {
          core.applyPlutoniumSceneData(compiled, plutJson);
        } catch (_) {}
      }
    }
    memAdventures.set(key, compiled);
    memAdventures.set(canonicalId, compiled);
    return compiled;
  }

  function getCachedAdventure(advId) {
    if (!advId) return null;
    return memAdventures.get(advId) || null;
  }

  function getMonsterBankObject() {
    const obj = {};
    for (const [k, v] of memMonsters.entries()) {
      if (!k.startsWith('__loaded_') && v && typeof v === 'object') obj[k] = v;
    }
    return obj;
  }

  function normalizeState(raw, compiledAdv = null) {
    if (!raw || typeof raw !== 'object' || !raw.moduleId) {
      return {
        enabled: false,
        moduleId: '',
        moduleName: '',
        currentMapId: '',
        currentRoomId: '',
        exploredRooms: [],
        clearedRooms: [],
        customReveals: {},
        customWalls: {},
        doorStates: {},
        tokenPos: {},
        svgViewMode: false,
        transitions: [],
        dmView: false,
      };
    }
    let currentMapId = String(raw.currentMapId || '');
    let currentRoomId = String(raw.currentRoomId || '');
    const explored = new Set(Array.isArray(raw.exploredRooms) ? raw.exploredRooms.map(String) : []);
    const cleared = new Set(Array.isArray(raw.clearedRooms) ? raw.clearedRooms.map(String) : []);
    const tokenPos = raw.tokenPos && typeof raw.tokenPos === 'object' ? { ...raw.tokenPos } : {};

    if (compiledAdv && compiledAdv.maps.length) {
      let map = compiledAdv.maps.find(m => m.id === currentMapId);
      if (!map) {
        map = compiledAdv.maps.find(m => m.rooms.length > 0) || compiledAdv.maps[0];
        currentMapId = map.id;
      }
      if (map.rooms.length && !map.rooms.some(r => r.id === currentRoomId)) {
        currentRoomId = map.rooms[0].id;
      }
      if (currentRoomId) explored.add(currentRoomId);
      const curRoom = map.rooms.find(r => r.id === currentRoomId);
      if (curRoom && curRoom.cx != null && curRoom.cy != null && !tokenPos[currentMapId]) {
        tokenPos[currentMapId] = { x: Math.round(curRoom.cx), y: Math.round(curRoom.cy) };
      }
    }

    return {
      enabled: raw.enabled !== false,
      moduleId: String(raw.moduleId),
      moduleName: String(raw.moduleName || compiledAdv?.name || raw.moduleId),
      currentMapId,
      currentRoomId,
      exploredRooms: [...explored],
      clearedRooms: [...cleared],
      customReveals: raw.customReveals && typeof raw.customReveals === 'object' ? raw.customReveals : {},
      customWalls: raw.customWalls && typeof raw.customWalls === 'object' ? raw.customWalls : {},
      doorStates: raw.doorStates && typeof raw.doorStates === 'object' ? raw.doorStates : {},
      tokenPos,
      svgViewMode: raw.svgViewMode === true,
      transitions: Array.isArray(raw.transitions) ? raw.transitions.slice(-60) : [],
      dmView: raw.dmView === true,
      autoAiSeed: raw.autoAiSeed !== false,
      aiSeededMaps: raw.aiSeededMaps && typeof raw.aiSeededMaps === 'object' ? { ...raw.aiSeededMaps } : {},
      battleOverride: raw.battleOverride && typeof raw.battleOverride === 'object' ? raw.battleOverride : null,
    };
  }

  function isModuleEntry(e) {
    const label = String(e?.comment || e?.name || '');
    return e?.uid === ENTRY_UID || label.startsWith('[模组地图·战斗场景]') || label.startsWith('[模组导航]');
  }

  function isPlayModuleRuleEntry(e) {
    const label = String(e?.comment || e?.name || '');
    return e?.uid === 12 || /^玩模组打开/.test(label);
  }

  async function syncNativeWorldbook(state, compiledAdv, checkGuard) {
    try {
      const BOOK_NAME = getBookName();
      const names = await api('getWorldbookNames')();
      checkGuard?.();
      if (!Array.isArray(names) || !names.includes(BOOK_NAME)) return;

      const active = !!(state?.enabled && state?.moduleId && compiledAdv);
      const promptContent = active ? core.buildModuleWorldbookPrompt(compiledAdv, state, getMonsterBankObject()) : '';

      const entries = await api('getWorldbook')(BOOK_NAME);
      checkGuard?.();

      const existingMod = entries.find(isModuleEntry);
      const existingRule12 = entries.find(isPlayModuleRuleEntry);

      const needRule12Update = existingRule12 && Boolean(existingRule12.enabled) !== active;
      const needModUpdate = active
        ? (!existingMod || !existingMod.enabled || existingMod.content !== promptContent || existingMod.name !== ENTRY_COMMENT)
        : (existingMod && existingMod.enabled);

      if (!needRule12Update && !needModUpdate) return;

      await api('updateWorldbookWith')(BOOK_NAME, (current) => {
        checkGuard?.();
        if (getBookName() !== BOOK_NAME) throw Error('绑定世界书已切换，停止旧世界书写入');
        const filtered = current.filter(e => !isModuleEntry(e)).map(e => {
          if (isPlayModuleRuleEntry(e)) {
            return { ...e, enabled: active };
          }
          return e;
        });
        if (active && promptContent) {
          filtered.push({
            ...(existingMod || {}),
            uid: existingMod?.uid ?? ENTRY_UID,
            name: ENTRY_COMMENT,
            comment: ENTRY_COMMENT,
            enabled: true,
            content: promptContent,
            strategy: { type: 'constant', keys: ['战斗', '模组', '地图'], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
            position: { type: 'at_depth', role: 'system', depth: 0, order: 6 },
            probability: 100,
            recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
            effect: { sticky: null, cooldown: null, delay: null },
          });
        }
        return filtered;
      }, { render: 'debounced' });
    } catch (err) {
      console.warn('[DND Module Runner] Worldbook native sync skipped:', err?.message || err);
    }
  }

  function applyWorldInfoPayload(payload, state, compiledAdv) {
    if (!payload || typeof payload !== 'object') return false;
    const BOOK_NAME = getBookName();
    if (!BOOK_NAME) return false;
    const active = !!(state?.enabled && state?.moduleId && compiledAdv);
    const promptContent = active ? core.buildModuleWorldbookPrompt(compiledAdv, state, getMonsterBankObject()) : '';

    let template = null;
    for (const list of Object.values(payload)) {
      if (!Array.isArray(list)) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (entry.world !== BOOK_NAME) continue;
        if (!template && entry) template = entry;
        if (isPlayModuleRuleEntry(entry)) {
          Object.assign(entry, { disable: !active, constant: true, selective: false });
        }
        if (isModuleEntry(entry)) {
          list.splice(i, 1);
        }
      }
    }

    if (active && promptContent) {
      const target = payload.characterLore || payload.chatLore || Object.values(payload).find(Array.isArray);
      if (!Array.isArray(target)) return false;
      target.push({
        ...(template || {}),
        uid: ENTRY_UID,
        world: BOOK_NAME,
        comment: ENTRY_COMMENT,
        content: promptContent,
        disable: false,
        constant: true,
        selective: false,
        key: ['战斗', '模组', '地图'],
        keysecondary: [],
        position: 4,
        depth: 0,
        role: 0,
        order: 6,
        probability: 100,
        useProbability: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        excludeRecursion: true,
        preventRecursion: true,
        ignoreBudget: true,
      });
      return true;
    }
    return false;
  }

  return {
    get BOOK_NAME() { return getBookName(); },
    STORE_KEY,
    ENTRY_UID,
    ENTRY_COMMENT,
    loadCatalog,
    loadAdventure,
    getCachedAdventure,
    ensureRoomMonsters,
    getMonsterBankObject,
    normalizeState,
    syncNativeWorldbook,
    applyWorldInfoPayload,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createModuleRunnerSync };
}
if (typeof globalThis !== 'undefined') {
  globalThis.createModuleRunnerSync = createModuleRunnerSync;
}


// D&D 2024 Module Runner — Interactive Fog-of-War Map UI & Runtime Host
function mountDndModuleRunner() {
  const host = window.top || window.parent || window;
  const doc = host.document;
  const NS = '__dndModuleRunner';
  host[NS]?.dispose?.();

  const ctx = () => host.SillyTavern?.getContext?.();
  const api = (name, optional = false) => {
    const fn = window[name] || window.TavernHelper?.[name] || host.TavernHelper?.[name];
    if (typeof fn === 'function') return fn;
    if (!optional) throw Error('缺少酒馆助手接口：' + name);
    return null;
  };

  const core = createModuleRunnerCore();
  const sync = createModuleRunnerSync(core, host, api);

  let disposed = false;
  let currentState = sync.normalizeState(null);
  let currentAdv = null;
  let inspectedRoomId = '';
  let activeTab = 'scene'; // 'scene' | 'topology' | 'prompt'
  let dmSpoilersOpen = false;
  let brushMode = false;
  let wallToolMode = false;
  let measureMode = false;
  let gridSnapMode = true;

  // Map Canvas Viewport & Token Vision State
  const view = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    dragMoved: false,
    startX: 0,
    startY: 0,
    hoveredRoomId: '',
    hoveredDoorId: '',
    hoveredWallId: '',
    hoveredToken: false,
    img: null,
    imgUrl: '',
    imgLoading: false,
    imgError: false,
    tokenDrag: null, // { startX, startY, curX, curY, blocked }
    unitDrag: null,  // { name, pointerId, startX, startY, curX, curY, downClientX, downClientY, speedFt, blocked, wallBlocked, distFt, dash, over }
    wallDraw: null,  // { x1, y1, x2, y2 }
    measureDrag: null, // { active, x1, y1, x2, y2 }
    cachedSvgKey: '',
    cachedSvgCompiled: null,
  };

  const removers = [];
  let modalEl = null;
  let styleEl = null;
  let toolbarBtn = null;
  let toolbarObserver = null;
  let toolbarQueued = false;
  const SCRIPT_ID = 'd5e20240-6d61-4700-9a11-7e5e20240001';
  const WIN_GEO_KEY = 'dnd_mr_win_geo_v1';

  let battleState = { active: false, round: 1, units: [], svgRawBlock: '', lastDeltaCount: 0 };
  let hoveredUnitName = '';
  let softWallMode = false;
  let pendingMoveDraft = null;
  let winMinimized = false;
  let winMaximized = false;

  function loadWinGeo() {
    try {
      const raw = host.localStorage?.getItem(WIN_GEO_KEY);
      if (!raw) return null;
      const g = JSON.parse(raw);
      return (g && typeof g === 'object') ? g : null;
    } catch { return null; }
  }

  function saveWinGeo(geo) {
    try {
      host.localStorage?.setItem(WIN_GEO_KEY, JSON.stringify(geo));
    } catch {}
  }

  function getMVUCharacterSpeed(name) {
    try {
      const c = ctx();
      const vars = c?.variables || c?.chatMetadata?.variables || {};
      const mvu = host.Mvu?.getMvuData?.({ type: 'chat' }) || vars?.stat_data || vars?.mvu || null;
      if (mvu && typeof mvu === 'object') {
        const chars = mvu.characters || mvu.队伍 || mvu.party || mvu;
        if (chars && typeof chars === 'object') {
          const entry = chars[name] || Object.values(chars).find(v => v && (v.name === name || v.姓名 === name));
          const spd = Number(entry?.speed ?? entry?.移动速度 ?? entry?.速度);
          if (Number.isFinite(spd) && spd > 0) return spd;
        }
      }
    } catch {}
    return 30;
  }

  function identity() {
    const c = ctx();
    if (!c) return '';
    return JSON.stringify([c.characterId ?? null, c.groupId ?? null, c.getCurrentChatId?.() || c.chatId || '']);
  }

  async function readChatState() {
    try {
      const vars = await api('getVariables')({ type: 'chat' });
      return vars?.[sync.STORE_KEY] || null;
    } catch {
      return null;
    }
  }

  async function saveChatState(nextState, syncBook = true) {
    const key = identity();
    const check = () => {
      if (disposed || identity() !== key) throw Error('聊天已切换，停止写入旧模组状态');
    };
    check();
    const normalized = sync.normalizeState(nextState, currentAdv);
    currentState = normalized;
    if (!inspectedRoomId || ! getCurrentMap()?.rooms?.some(r => r.id === inspectedRoomId)) {
      inspectedRoomId = normalized.currentRoomId;
    }
    await api('updateVariablesWith')((vars) => {
      check();
      return { ...vars, [sync.STORE_KEY]: normalized };
    }, { type: 'chat' });

    if (currentAdv && normalized.currentRoomId) {
      const map = getCurrentMap();
      const curRoom = map?.rooms?.find(r => r.id === normalized.currentRoomId);
      if (curRoom) await sync.ensureRoomMonsters(currentAdv, curRoom, map);
    }
    if (syncBook) {
      await sync.syncNativeWorldbook(normalized, currentAdv, check);
    }
    updateToolbarButton();
    renderModal();
    return normalized;
  }

  function getCurrentMap() {
    if (!currentAdv?.maps?.length) return null;
    return currentAdv.maps.find(m => m.id === currentState.currentMapId)
      || currentAdv.maps.find(m => m.rooms.length > 0)
      || currentAdv.maps[0];
  }

  function getAdjacentUnexploredMap(map) {
    const adj = new Map();
    if (!map?.rooms?.length) return adj;
    const explored = new Set(currentState.exploredRooms || []);
    const sources = map.rooms.filter(r => r.id === currentState.currentRoomId || explored.has(r.id));
    for (const src of sources) {
      for (const edge of src.edges || []) {
        if (!explored.has(edge.toId) && !adj.has(edge.toId)) {
          adj.set(edge.toId, { fromId: src.id, fromName: src.name, ...edge });
        }
      }
    }
    return adj;
  }

  function ensureToolbarButton() {
    toolbarQueued = false;
    if (disposed) return;
    const bar = doc.getElementById('dnd-script-toolbar');
    const frameId = String(window.frameElement?.id || '').split('--').pop() || SCRIPT_ID;
    const nativeContainer = doc.getElementById('script_container_' + frameId) || doc.getElementById('script_container_' + SCRIPT_ID);
    if (!bar) {
      if (nativeContainer && nativeContainer.classList.contains('dnd-native-script-buttons')) {
        nativeContainer.classList.remove('dnd-native-script-buttons');
      }
      return;
    }
    if (nativeContainer && !nativeContainer.classList.contains('dnd-native-script-buttons')) {
      nativeContainer.classList.add('dnd-native-script-buttons');
    }
    if (!toolbarBtn) {
      toolbarBtn = doc.createElement('button');
      toolbarBtn.type = 'button';
      toolbarBtn.dataset.dndModuleBtn = '1';
      toolbarBtn.addEventListener('click', () => openModal());
    }
    if (toolbarBtn.parentElement !== bar) {
      bar.appendChild(toolbarBtn);
    }
    updateToolbarButton();
  }

  function updateToolbarButton() {
    const active = !!(currentState?.enabled && currentState?.moduleId && currentAdv);
    const map = getCurrentMap();
    const curRoom = map?.rooms?.find(r => r.id === currentState.currentRoomId);
    let nextText = '🗺️ 模组地图';
    let nextTitle = '打开 D&D 官方模组运行器与可探索地城迷雾地图';
    let nextPressed = 'false';

    if (active && curRoom) {
      const shortRoom = curRoom.name.replace(/^★\s*/, '').slice(0, 8);
      nextText = `🗺️ ${shortRoom}`;
      nextTitle = `当前模组：《${currentAdv.name}》\n当前地图：${map.title}\n当前区域：${curRoom.name}\n点击打开可拖动迷雾地城地图`;
      nextPressed = 'true';
    } else if (active) {
      nextText = `🗺️ ${currentAdv.name.slice(0, 6)}`;
      nextTitle = `当前模组：《${currentAdv.name}》 (点击打开模组地图)`;
      nextPressed = 'true';
    }

    if (toolbarBtn) {
      if (toolbarBtn.textContent !== nextText) toolbarBtn.textContent = nextText;
      if (toolbarBtn.title !== nextTitle) toolbarBtn.title = nextTitle;
      if (toolbarBtn.getAttribute('aria-pressed') !== nextPressed) toolbarBtn.setAttribute('aria-pressed', nextPressed);
    }
  }

  function injectStyles() {
    if (styleEl?.isConnected) return;
    styleEl = doc.createElement('style');
    styleEl.id = 'dnd-module-runner-styles';
    styleEl.textContent = `
      #dnd-module-runner-modal{position:fixed;inset:0;z-index:10060;pointer-events:none;background:transparent;font:13px/1.5 'Inter','Noto Sans SC','Microsoft YaHei',sans-serif;color:#e6e8ee}
      #dnd-module-runner-modal[hidden]{display:none!important}
      .dmr-window{position:fixed;left:4vw;top:5vh;width:min(1220px,92vw);height:min(780px,88vh);min-width:400px;min-height:260px;pointer-events:auto;display:flex;flex-direction:column;background:#0d0f14;border:1px solid rgba(255,255,255,.15);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.85),inset 0 1px rgba(255,255,255,.06);overflow:hidden;resize:both}
      #dnd-module-runner-modal[data-maximized="true"] .dmr-window{left:8px!important;top:8px!important;width:calc(100vw - 16px)!important;height:calc(100vh - 16px)!important;resize:none}
      #dnd-module-runner-modal[data-minimized="true"] .dmr-window{height:auto!important;min-height:0!important;width:min(780px,92vw)!important;resize:none}
      #dnd-module-runner-modal[data-minimized="true"] .dmr-body{display:none!important}
      .dmr-topbar{flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;background:rgba(18,20,27,.97);border-bottom:1px solid rgba(255,255,255,.08);cursor:move;user-select:none}
      .dmr-topbar button,.dmr-topbar select,.dmr-topbar input{cursor:default}
      .dmr-init-strip{flex:0 0 250px;display:flex;flex-direction:column;background:rgba(15,17,24,.98);border-left:1px solid rgba(255,255,255,.09);min-height:0;overflow:hidden}
      .dmr-init-strip[hidden]{display:none!important}
      .dmr-init-header{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(20,23,32,.95)}
      .dmr-init-round{flex-shrink:0;padding:2px 8px;border-radius:6px;background:rgba(218,165,32,.14);border:1px solid rgba(218,165,32,.38);color:#f3d285;font-size:11.5px;font-weight:700}
      .dmr-init-actions{display:inline-flex;align-items:center;gap:4px}
      .dmr-init-actions .dmr-btn{min-height:24px;padding:2px 7px;font-size:11px;border-radius:6px}
      .dmr-init-list{flex:1 1 auto;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:4px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}
      .dmr-init-card{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;border:1px solid rgba(255,255,255,.06);border-left:3px solid transparent;background:rgba(255,255,255,.025);cursor:pointer;transition:background .14s,border-color .14s}
      .dmr-init-card:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14)}
      .dmr-init-card[data-active="true"]{border-color:rgba(243,200,103,.42);border-left-color:#f3c867;background:rgba(243,200,103,.12)}
      .dmr-init-card[data-dead="true"]{opacity:.42;filter:grayscale(.85)}
      .dmr-init-avatar{width:34px;height:34px;border-radius:6px;object-fit:cover;border:1px solid rgba(255,255,255,.2);background:#1b202b;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#e6e8ee;flex-shrink:0}
      .dmr-init-info{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;line-height:1.25}
      .dmr-init-name{font-size:12px;font-weight:600;color:#f3f4f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:4px}
      .dmr-init-hp{font-size:10.5px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dmr-init-now{font-size:9px;padding:1px 4px;border-radius:3px;background:#f3c867;color:#111827;font-weight:800;flex-shrink:0}
      .dmr-init-val{flex-shrink:0;min-width:24px;text-align:right;font-size:14px;font-weight:700;color:#f3f4f6;font-variant-numeric:tabular-nums}
      .dmr-move-draft-bar{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 12px;background:rgba(24,42,30,.92);border-bottom:1px solid rgba(107,224,148,.35);font-size:12px;color:#d1fae5}
      .dmr-move-draft-bar[hidden]{display:none!important}
      .dmr-title{font-weight:700;font-size:14px;color:#f3dfb6;letter-spacing:.03em;margin-right:2px;display:flex;align-items:center;gap:6px;white-space:nowrap}
      .dmr-select,.dmr-input{background:rgba(255,255,255,.05);color:#eceef4;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:5px 10px;font:inherit;font-size:12.5px;min-height:31px;box-sizing:border-box;transition:border-color .15s,background .15s}
      .dmr-select option{background:#181b22;color:#eceef4}
      .dmr-select:focus,.dmr-input:focus{outline:none;border-color:#eab963;background:rgba(255,255,255,.08)}
      .dmr-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:5px 10px;min-height:30px;border:1px solid rgba(255,255,255,.11);border-radius:8px;background:rgba(255,255,255,.05);color:#dce1eb;font:500 12px/1.2 inherit;cursor:pointer;white-space:nowrap;transition:all .16s cubic-bezier(.2,.8,.2,1);box-sizing:border-box}
      .dmr-btn:hover:not(:disabled){background:rgba(255,255,255,.11);border-color:rgba(234,185,99,.55);color:#fff}
      .dmr-btn:disabled{opacity:.4;cursor:not-allowed}
      .dmr-btn[data-active="true"]{background:rgba(234,185,99,.18);border-color:#eab963;color:#fde7b7;box-shadow:0 0 12px rgba(234,185,99,.18)}
      .dmr-btn-primary{background:linear-gradient(135deg,#c9943d,#8c611e);border-color:#eab963;color:#fff9ec}
      .dmr-btn-icon{width:32px;height:32px;padding:0}
      .dmr-spacer{flex:1 1 auto}
      .dmr-body{flex:1 1 auto;display:flex;min-height:0;overflow:hidden}
      .dmr-map-col{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;background:#090b0f;overflow:hidden;position:relative}
      .dmr-mode-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:600;background:rgba(234,185,99,.12);color:#f3d89e;border:1px solid rgba(234,185,99,.32);white-space:nowrap}
      .dmr-map-stage{flex:1 1 auto;position:relative;background:radial-gradient(circle at center,#141720 0%,#090b0f 100%);overflow:hidden;user-select:none;touch-action:none;display:flex;align-items:center;justify-content:center;min-height:0}
      .dmr-canvas{display:block;width:100%;height:100%;cursor:grab}

      .dmr-canvas{touch-action:none}
      @media (max-width: 768px){
        .dmr-window{left:4px!important;top:4px!important;width:calc(100vw - 8px)!important;height:calc(100dvh - 8px)!important;min-width:0!important;min-height:0!important;max-width:calc(100vw - 8px)!important;max-height:calc(100dvh - 8px)!important;border-radius:10px!important;resize:none!important}
        #dnd-module-runner-modal[data-minimized="true"] .dmr-window{height:auto!important;width:calc(100vw - 8px)!important}
        .dmr-topbar{padding:6px 8px;gap:5px;max-height:36dvh;overflow-y:auto;cursor:default}
        .dmr-title{font-size:13px}
        .dmr-select,.dmr-input{min-height:32px;padding:4px 8px;font-size:12px;max-width:44vw!important}
        .dmr-btn{min-height:32px;padding:4px 8px;font-size:11.5px}
        .dmr-btn-icon{width:32px;height:32px}
        .dmr-body{flex-direction:column!important}
        .dmr-init-strip{flex:0 0 auto!important;width:100%!important;max-height:112px;border-left:none!important;border-top:1px solid rgba(255,255,255,.1)}
        .dmr-init-header{padding:5px 8px}
        .dmr-init-list{flex-direction:row!important;overflow-x:auto!important;overflow-y:hidden!important;gap:6px!important;padding:6px!important}
        .dmr-init-card{min-width:148px;max-width:185px;padding:5px 7px}
        .dmr-dock{left:8px;top:8px;padding:4px;gap:4px}
        .dmr-dock .dmr-btn-icon{width:34px;height:34px}
        .dmr-legend{flex-wrap:wrap!important;gap:5px!important;padding:6px 8px!important}
        .dmr-move-draft-bar{flex-wrap:wrap!important;gap:6px!important;padding:6px 8px!important;font-size:11.5px}
      }

      .dmr-canvas:active{cursor:grabbing}
      .dmr-dock{position:absolute;left:12px;top:12px;z-index:5;display:flex;flex-direction:column;gap:5px;padding:6px;background:rgba(16,18,24,.84);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.1);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
      .dmr-dock-sep{height:1px;background:rgba(255,255,255,.09);margin:2px 4px}
      .dmr-dock-btn{width:34px;height:34px;padding:0;border-radius:8px;border:1px solid transparent;background:transparent;color:#aeb6c6;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s}
      .dmr-dock-btn:hover{background:rgba(255,255,255,.09);color:#fff}
      .dmr-dock-btn[data-active="true"]{background:rgba(234,185,99,.2);border-color:#eab963;color:#fde6b4;box-shadow:0 0 10px rgba(234,185,99,.22)}
      .dmr-dock-btn svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
      .dmr-bottom-hud{position:absolute;left:12px;right:12px;bottom:12px;z-index:5;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;pointer-events:none}
      .dmr-hud-pill{pointer-events:auto;display:inline-flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(16,18,24,.84);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.1);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.45)}
      .dmr-zoom-pct{min-width:42px;text-align:center;font-size:11.5px;font-weight:600;color:#cfd5e2;font-variant-numeric:tabular-nums}
      .dmr-status-chip{pointer-events:auto;max-width:520px;padding:5px 11px;background:rgba(16,18,24,.82);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.09);border-radius:10px;font-size:11.5px;color:#b7bfd0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dmr-side{display:flex;flex-direction:column;background:#12141b;border-left:1px solid rgba(255,255,255,.08);min-width:0;min-height:0;overflow:hidden;transition:opacity .18s ease}
      .dmr-tabs{flex-shrink:0;display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.07);background:#161922}
      .dmr-tab{flex:1;padding:6px 6px;text-align:center;font-size:12px;font-weight:600;color:#99a2b5;background:transparent;border:1px solid transparent;border-radius:8px;cursor:pointer;white-space:nowrap;transition:all .15s}
      .dmr-tab:hover{color:#e6e8ee;background:rgba(255,255,255,.04)}
      .dmr-tab[data-active="true"]{color:#fde7b7;background:rgba(234,185,99,.14);border-color:rgba(234,185,99,.38)}
      .dmr-panel{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:12px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}
      .dmr-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:11px 12px;box-sizing:border-box}
      .dmr-card-title{font-weight:700;font-size:13px;color:#f3dfb6;margin-bottom:7px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px}
      .dmr-readaloud{background:linear-gradient(90deg,rgba(234,185,99,.12),rgba(234,185,99,.02));border-left:3px solid #eab963;padding:8px 10px;border-radius:0 8px 8px 0;color:#f2ead8;font-style:italic;white-space:pre-wrap;line-height:1.6}
      .dmr-exit-list{display:flex;flex-direction:column;gap:7px}
      .dmr-exit-item{display:flex;flex-direction:column;gap:5px;padding:8px 10px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.07);border-radius:8px;box-sizing:border-box}
      .dmr-exit-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;font-weight:600;color:#ebdcc0}
      .dmr-exit-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
      .dmr-badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(255,255,255,.08);color:#d7dde8;border:1px solid rgba(255,255,255,.12);white-space:nowrap}
      .dmr-badge-cur{background:rgba(234,185,99,.22);color:#fff1cf;border-color:#eab963}
      .dmr-badge-ok{background:rgba(52,168,103,.18);color:#9fe8bb;border-color:rgba(52,168,103,.45)}
      .dmr-badge-unk{background:rgba(255,255,255,.05);color:#98a1b3;border-color:rgba(255,255,255,.1)}
      .dmr-pre{white-space:pre-wrap;word-break:break-word;font:12px/1.55 'JetBrains Mono',Consolas,'Microsoft YaHei',monospace;color:#cdd4e0;background:#090b0f;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;max-height:360px;overflow-y:auto}
      .dmr-room-item{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 9px;border-radius:8px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02);cursor:pointer;transition:all .14s}
      .dmr-room-item:hover{border-color:rgba(234,185,99,.45);background:rgba(255,255,255,.05)}
      .dmr-room-item[data-current="true"]{border-color:#eab963;background:rgba(234,185,99,.12)}
      @media(max-width:900px){
        .dmr-body{grid-template-columns:1fr;grid-template-rows:55% 45%}
        .dmr-body[data-side-collapsed="true"]{grid-template-rows:100% 0px}
        .dmr-side{border-left:none;border-top:1px solid rgba(255,255,255,.08)}
        .dmr-status-chip{display:none}
      }
    `;
    doc.head.appendChild(styleEl);
  }

  function expandPolygon(points, cx, cy, padPx) {
    if (!padPx) return points;
    return points.map(([x, y]) => {
      const dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * padPx, y + (dy / len) * padPx];
    });
  }

  function tracePolygon(ctx2d, points) {
    if (!Array.isArray(points) || points.length < 3) return;
    ctx2d.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx2d.lineTo(points[i][0], points[i][1]);
    }
    ctx2d.closePath();
  }

  function traceCorridorCapsule(ctx2d, x1, y1, x2, y2, radius) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) {
      ctx2d.moveTo(x1 + radius, y1);
      ctx2d.arc(x1, y1, radius, 0, Math.PI * 2);
      return;
    }
    const nx = (-dy / len) * radius;
    const ny = (dx / len) * radius;
    ctx2d.moveTo(x1 + nx, y1 + ny);
    ctx2d.lineTo(x2 + nx, y2 + ny);
    ctx2d.arc(x2, y2, radius, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
    ctx2d.lineTo(x1 - nx, y1 - ny);
    ctx2d.arc(x1, y1, radius, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
    ctx2d.closePath();
  }

  const tokenAvatarImgCache = new Map();
  function getTokenAvatarImage(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    if (tokenAvatarImgCache.has(dataUrl)) return tokenAvatarImgCache.get(dataUrl);
    const img = new Image();
    img.onload = () => { try { renderCanvas(); } catch {} };
    img.src = dataUrl;
    tokenAvatarImgCache.set(dataUrl, img);
    return img;
  }

  function getPartyLeaderInfo() {
    try {
      const vars = api('getVariables', true)?.({ type: 'chat' });
      const activeId = vars?.stat_data?.当前角色ID || '';
      const chars = vars?.stat_data?.角色列表;
      if (chars && typeof chars === 'object') {
        const entry = (activeId && chars[activeId]) ? [activeId, chars[activeId]] : Object.entries(chars)[0];
        if (entry) {
          const charId = entry[0];
          const charName = entry[1]?.姓名 || charId;
          const vaultAvatar = topWin.__dndPortraitVault?.getToken?.(charId, charName)
            || topWin.__dndPortraitVault?.get?.(charId, charName)
            || '';
          return {
            name: charName,
            avatar: vaultAvatar,
            visionFt: 60,
          };
        }
      }
      const fallbackAvatar = topWin.__dndPortraitVault?.get?.('default', '') || '';
      if (fallbackAvatar) return { name: '玩家视点', avatar: fallbackAvatar, visionFt: 60 };
    } catch {}
    return { name: '玩家视点', avatar: '', visionFt: 60 };
  }

  let cachedPartyChars = [];
  async function refreshPartyCharacters() {
    try {
      const vars = await api('getVariables', true)?.({ type: 'chat' });
      const chars = vars?.stat_data?.角色列表;
      const activeId = vars?.stat_data?.当前角色ID || '';
      if (chars && typeof chars === 'object') {
        const list = [];
        for (const [charId, ch] of Object.entries(chars)) {
          if (!ch || typeof ch !== 'object') continue;
          const name = String(ch.姓名 || charId).trim();
          const cur = Number(ch.生命值?.当前 ?? ch.生命?.当前 ?? ch.hp?.cur ?? 12);
          const max = Math.max(1, Number(ch.生命值?.上限 ?? ch.生命?.上限 ?? ch.hp?.max ?? cur ?? 12));
          const speed = Number(ch.速度 ?? ch.移动速度 ?? 30) || 30;
          list.push({
            id: name,
            charId,
            isActive: charId === activeId,
            hp: { cur: Number.isFinite(cur) ? cur : 12, max: Number.isFinite(max) ? max : 12 },
            speed,
          });
        }
        if (list.length) {
          cachedPartyChars = list;
          return list;
        }
      }
    } catch {}
    return cachedPartyChars;
  }

  function getActiveSurface(map) {
    if (!map) return null;
    const curRoom = map.rooms.find(r => r.id === currentState.currentRoomId) || map.rooms[0] || null;
    const encounterRaw = (map.mapKind === 'overworld' || curRoom?.isStoryNode) ? battleState.svgRawBlock : '';
    const presetSvgSpec = core.parseTacticalMapDirectives(encounterRaw) || core.getPresetSvgMapForNode(curRoom, map);
    const isSvgMode = !!(currentState.svgViewMode && presetSvgSpec);

    if (isSvgMode) {
      const cacheKey = `${map.id}:${curRoom?.id || ''}:svg:${encounterRaw}`;
      if (view.cachedSvgKey !== cacheKey || !view.cachedSvgCompiled) {
        view.cachedSvgKey = cacheKey;
        view.cachedSvgCompiled = core.compileSvgTacticalMap(presetSvgSpec, 15);
      }
      const compiled = view.cachedSvgCompiled;
      const mapKey = `svg_${curRoom?.id || map.id}`;
      const doorStates = currentState.doorStates || {};
      const customWalls = currentState.customWalls?.[mapKey] || [];
      const walls = [...(compiled.wallsPx || []), ...customWalls].map(w => {
        const doorKey = `${mapKey}:${w.id}`;
        const openVal = doorStates[doorKey] != null ? doorStates[doorKey] : doorStates[w.id];
        return {
          ...w,
          open: openVal != null ? !!openVal : !!w.open,
        };
      });
      return {
        isSvg: true,
        hasPresetSvg: true,
        mapKey,
        title: compiled.title,
        imageUrl: compiled.svgDataUrl,
        width: compiled.widthPx,
        height: compiled.heightPx,
        gridSize: compiled.gridPx,
        pxPerFt: compiled.pxPerFt,
        requiresFog: true,
        walls,
        defaultTokenPos: { x: Math.round(35 * compiled.pxPerFt), y: Math.round(38 * compiled.pxPerFt) },
      };
    }

    const mapKey = map.id;
    const doorStates = currentState.doorStates || {};
    const deletedSet = new Set(currentState.deletedWalls?.[mapKey] || []);
    const baseWalls = Array.isArray(map.walls) ? map.walls : (map.walls = core.buildMapWallNetwork(map));
    const customWalls = currentState.customWalls?.[mapKey] || [];
    const walls = [...baseWalls, ...customWalls]
      .filter(w => w && !deletedSet.has(w.id))
      .map(w => {
        const doorKey = `${mapKey}:${w.id}`;
        const openVal = doorStates[doorKey] != null ? doorStates[doorKey] : doorStates[w.id];
        return {
          ...w,
          open: openVal != null ? !!openVal : !!w.open,
        };
      });

    const preset = core.matchOfficialMapPreset?.(map.imageUrl) || null;
    const scaleMetrics = core.resolveMapScale ? core.resolveMapScale(map) : null;
    const gridSize = scaleMetrics?.printedGridPx || preset?.gridPx || map.grid?.size || 150;
    const gridOffsetX = scaleMetrics?.offsetX ?? preset?.offsetX ?? map.grid?.offsetX ?? 0;
    const gridOffsetY = scaleMetrics?.offsetY ?? preset?.offsetY ?? map.grid?.offsetY ?? 0;
    const pxPerFt = scaleMetrics?.pxPerFt || (gridSize / (preset?.feetPerPrintedSquare || ((map.grid?.scale || 1) * 5)));
    const firstSpatialRoom = map.rooms.find(r => !r.isStoryNode && r.cx != null && r.cy != null) || map.rooms.find(r => r.cx != null);
    const defaultRoom = curRoom && curRoom.cx != null ? curRoom : firstSpatialRoom;
    const usePresetEntry = preset?.entryPointFt && (!defaultRoom || defaultRoom.id === firstSpatialRoom?.id);
    const defaultTokenPos = usePresetEntry
      ? {
          x: Math.round(gridOffsetX + (preset.entryPointFt.x + 2.5) * pxPerFt),
          y: Math.round(gridOffsetY + (preset.entryPointFt.y + 2.5) * pxPerFt),
        }
      : defaultRoom
        ? { x: Math.round(defaultRoom.cx), y: Math.round(defaultRoom.cy) }
        : { x: Math.round((map.width || 2048) / 2), y: Math.round((map.height || 1536) / 2) };

    return {
      isSvg: false,
      hasPresetSvg: !!presetSvgSpec,
      presetMatched: !!preset,
      mapKey,
      title: map.title,
      imageUrl: map.imageUrl,
      width: view.img?.naturalWidth || map.width || 2048,
      height: view.img?.naturalHeight || map.height || 1536,
      gridSize,
      cellPx: pxPerFt * 5,
      gridOffsetX,
      gridOffsetY,
      pxPerFt,
      requiresFog: map.requiresFog !== false,
      walls,
      defaultTokenPos,
    };
  }

  function getTacticalCellPx(surface) {
    if (!surface) return 75;
    if (Number.isFinite(surface.pxPerFt) && surface.pxPerFt > 0) return surface.pxPerFt * 5;
    return surface.gridSize || 150;
  }

  function getTokenPosition(surface) {
    if (!surface) return { x: 0, y: 0 };
    if (view.tokenDrag?.active) {
      return { x: view.tokenDrag.curX, y: view.tokenDrag.curY };
    }
    const saved = currentState.tokenPos?.[surface.mapKey];
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      return { x: saved.x, y: saved.y };
    }
    return { ...surface.defaultTokenPos };
  }

  function fitMapToViewport() {
    const canvas = modalEl?.querySelector('.dmr-canvas');
    const map = getCurrentMap();
    const surface = getActiveSurface(map);
    if (!canvas || !surface) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 120) {
      host.requestAnimationFrame(fitMapToViewport);
      return;
    }
    const cw = rect.width, ch = rect.height;
    const mw = surface.width || 2048;
    const mh = surface.height || 1536;
    const scale = Math.min(cw / mw, ch / mh) * 0.94;
    view.scale = Math.max(0.05, Math.min(4, scale));
    view.offsetX = Math.round((cw - mw * view.scale) / 2);
    view.offsetY = Math.round((ch - mh * view.scale) / 2);
    drawMapCanvas();
  }

  function focusRoomOnCanvas(roomId) {
    const canvas = modalEl?.querySelector('.dmr-canvas');
    const map = getCurrentMap();
    const surface = getActiveSurface(map);
    if (!canvas || !map || !surface) return;
    if (surface.isSvg) return fitMapToViewport();
    if (map.mapKind === 'overworld') return fitMapToViewport();
    const room = map.rooms.find(r => r.id === (roomId || currentState.currentRoomId));
    if (!room || room.isStoryNode || room.cx == null || room.cy == null) return fitMapToViewport();
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 120) {
      host.requestAnimationFrame(() => focusRoomOnCanvas(roomId));
      return;
    }
    const cw = rect.width, ch = rect.height;
    const mw = surface.width || 2048;
    const mh = surface.height || 1536;
    const targetSpan = Math.max(room.bbox?.width || 400, room.bbox?.height || 400, surface.gridSize * 6.5);
    const desiredScale = Math.min(cw, ch) / (targetSpan * 1.35);
    const minFit = Math.min(cw / mw, ch / mh) * 0.90;
    view.scale = Math.max(minFit, Math.min(1.6, desiredScale));
    view.offsetX = Math.round(cw / 2 - room.cx * view.scale);
    view.offsetY = Math.round(ch / 2 - room.cy * view.scale);
    drawMapCanvas();
  }

  function ensureMapImageLoaded(surface) {
    const targetUrl = surface?.imageUrl || '';
    if (!targetUrl) {
      view.img = null;
      view.imgUrl = '';
      view.imgLoading = false;
      return;
    }
    if (view.imgUrl === targetUrl && (view.img || view.imgLoading)) return;
    view.imgUrl = targetUrl;
    view.img = null;
    view.imgLoading = true;
    view.imgError = false;
    const img = new host.Image();
    if (!targetUrl.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (view.imgUrl !== targetUrl) return;
      view.img = img;
      view.imgLoading = false;
      syncBattleFromChat();
      if (surface.isSvg || !currentState.currentRoomId) fitMapToViewport();
      else focusRoomOnCanvas(currentState.currentRoomId);
      maybeAutoSeedMap(getCurrentMap(), surface);
    };
    img.onerror = () => {
      if (view.imgUrl !== targetUrl) return;
      const fallback = new host.Image();
      fallback.onload = () => {
        view.img = fallback;
        view.imgLoading = false;
        fitMapToViewport();
      };
      fallback.onerror = () => {
        view.imgLoading = false;
        view.imgError = true;
        drawMapCanvas();
      };
      fallback.src = targetUrl;
    };
    img.src = targetUrl;
  }

  function buildExploredMemoryPath(ctx2d, map, surface, exploredSet) {
    const gridSize = surface.gridSize || 150;
    const roomRevealRadius = Math.round(gridSize * 4.5);
    const corridorRadius = Math.round(gridSize * 2.2);

    ctx2d.beginPath();
    if (!surface.isSvg && map?.rooms) {
      const roomById = new Map(map.rooms.map(r => [r.id, r]));

      // 1. Generous smooth circles around explored rooms (NEVER clip to jagged mapRegions polygons!)
      for (const roomId of exploredSet) {
        const room = roomById.get(roomId);
        if (!room || room.isStoryNode || room.cx == null || room.cy == null) continue;
        const rad = Math.max(roomRevealRadius, Math.hypot(room.bbox?.width || 0, room.bbox?.height || 0) * 0.85);
        ctx2d.moveTo(room.cx + rad, room.cy);
        ctx2d.arc(room.cx, room.cy, rad, 0, Math.PI * 2);
      }

      // 2. Smooth wide passages between connected explored rooms
      for (const r1 of map.rooms) {
        if (!exploredSet.has(r1.id) || r1.isStoryNode || r1.cx == null) continue;
        for (const edge of r1.edges || []) {
          if (!exploredSet.has(edge.toId)) continue;
          const r2 = roomById.get(edge.toId);
          if (r2 && !r2.isStoryNode && r2.cx != null && r1.id < r2.id) {
            traceCorridorCapsule(ctx2d, r1.cx, r1.cy, r2.cx, r2.cy, corridorRadius);
          }
        }
      }
    }

    // 3. Visited token trail & manual brush reveals
    const brushes = currentState.customReveals?.[surface.mapKey] || [];
    for (const [bx, by, br] of brushes) {
      const rad = br || Math.round(gridSize * 3.0);
      ctx2d.moveTo(bx + rad, by);
      ctx2d.arc(bx, by, rad, 0, Math.PI * 2);
    }
  }

  function drawMapCanvas() {
    const canvas = modalEl?.querySelector('.dmr-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = host.devicePixelRatio || 1;
    const cw = Math.max(300, Math.floor(rect.width));
    const ch = Math.max(240, Math.floor(rect.height));
    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
    }

    const c = canvas.getContext('2d');
    c.save();
    c.scale(dpr, dpr);
    c.fillStyle = '#0f0d0a';
    c.fillRect(0, 0, cw, ch);

    const map = getCurrentMap();
    const surface = getActiveSurface(map);
    if (!map || !surface) {
      c.fillStyle = '#a8977a';
      c.font = '15px "Microsoft YaHei", serif';
      c.textAlign = 'center';
      c.fillText('请在上方选择要运行的 D&D 官方模组', cw / 2, ch / 2);
      c.restore();
      return;
    }

    ensureMapImageLoaded(surface);
    const mw = surface.width;
    const mh = surface.height;
    const explored = new Set(currentState.exploredRooms || []);
    const cleared = new Set(currentState.clearedRooms || []);
    const useFog = surface.requiresFog && !currentState.dmView;
    const hasBattleUnits = battleState.units.length > 0 && (surface.isSvg || map.mapKind !== 'overworld');
    const showToken = (surface.requiresFog || surface.isSvg || map.mapKind !== 'overworld') && !hasBattleUnits;
    const showVision = surface.requiresFog || surface.isSvg || map.mapKind !== 'overworld';
    let tokenPos = getTokenPosition(surface);
    const visionSources = [];
    if (hasBattleUnits) {
      const cellPx = getTacticalCellPx(surface);
      const pxPerFt = surface.pxPerFt || (cellPx / 5) || 15;
      const halfCell = 0.5 * cellPx;
      const unitToPx = (u) => {
        if (view.unitDrag?.active && view.unitDrag.name === u.id) {
          return {
            x: Math.max(18, Math.min(mw - 18, view.unitDrag.curX)),
            y: Math.max(18, Math.min(mh - 18, view.unitDrag.curY)),
          };
        }
        return {
          x: Math.max(18, Math.min(mw - 18, (surface.gridOffsetX || 0) + u.pos[0] * pxPerFt + halfCell)),
          y: Math.max(18, Math.min(mh - 18, (surface.gridOffsetY || 0) + u.pos[1] * pxPerFt + halfCell)),
        };
      };
      const aliveFriendlies = battleState.units.filter(
        u => u.faction === 'friendly' && Array.isArray(u.pos) && (u.hp?.cur == null || u.hp.cur > 0)
      );
      for (const fu of aliveFriendlies) {
        visionSources.push(unitToPx(fu));
      }
      if (!visionSources.length) {
        const fallbackUnit = battleState.units.find(u => u.faction === 'friendly' && Array.isArray(u.pos))
          || battleState.units.find(u => Array.isArray(u.pos));
        if (fallbackUnit) visionSources.push(unitToPx(fallbackUnit));
      }
      if (visionSources.length) tokenPos = visionSources[0];
    } else {
      visionSources.push(tokenPos);
    }
    const visionRadiusPx = Math.round(getTacticalCellPx(surface) * 9.5);
    const visPolys = showVision
      ? visionSources
        .map(src => core.computeVisibilityPolygon(src.x, src.y, visionRadiusPx, surface.walls))
        .filter(poly => poly.length >= 3)
      : [];
    const nearAnyVision = (mx, my) =>
      visionSources.some(src => Math.hypot(mx - src.x, my - src.y) <= visionRadiusPx * 1.15);

    // World-space pass
    c.save();
    c.translate(view.offsetX, view.offsetY);
    c.scale(view.scale, view.scale);

    // 1. Base Unexplored Canvas Shroud
    c.fillStyle = '#120f0b';
    c.fillRect(0, 0, mw, mh);

    if (view.img) {
      if (!useFog) {
        // Full bright map (Overworld / Settlement / DM View)
        c.drawImage(view.img, 0, 0, mw, mh);
        // Optional subtle vision cone preview when dragging token even in open/DM view
        if (showVision && visPolys.length && (view.tokenDrag?.active || view.unitDrag?.active || surface.isSvg || currentState.dmView)) {
          c.save();
          c.beginPath();
          for (const poly of visPolys) tracePolygon(c, poly);
          c.fillStyle = 'rgba(255, 224, 150, 0.08)';
          c.fill('nonzero');
          c.strokeStyle = 'rgba(245, 202, 118, 0.48)';
          c.lineWidth = Math.max(1.5, 2 / view.scale);
          c.stroke();
          c.restore();
        }
      } else {
        // THREE-LAYER DYNAMIC FOG OF WAR (Multi-source party union!)
        // Layer A: Explored Memory Shroud (46% brightness original hand-drawn map)
        c.save();
        buildExploredMemoryPath(c, map, surface, explored);
        c.clip();
        c.globalAlpha = 0.46;
        c.drawImage(view.img, 0, 0, mw, mh);
        c.restore();

        // Layer B: Active 2D Raycast Vision Union from ALL Alive Friendly Tokens (100% brightness)
        if (visPolys.length) {
          c.save();
          c.beginPath();
          for (const poly of visPolys) tracePolygon(c, poly);
          c.clip('nonzero');
          c.globalAlpha = 1.0;
          c.drawImage(view.img, 0, 0, mw, mh);
          c.restore();

          // Warm torchlight rim along active Line-of-Sight boundaries
          c.save();
          c.beginPath();
          for (const poly of visPolys) tracePolygon(c, poly);
          c.strokeStyle = 'rgba(245, 202, 118, 0.42)';
          c.lineWidth = Math.max(1.8, 2.5 / view.scale);
          c.stroke();
          c.restore();
        }
      }
    } else if (view.imgLoading) {
      c.fillStyle = '#d1aa63';
      c.font = `${Math.round(26 / view.scale)}px "Microsoft YaHei", sans-serif`;
      c.textAlign = 'center';
      c.fillText('正在加载高清场景地图…', mw / 2, mh / 2);
    }

    // Draw Wall Segments & Doors (Visible in DM view, Wall Tool mode, SVG mode, or for doors near any party member)
    const showWalls = currentState.dmView || wallToolMode || surface.isSvg;
    for (const w of surface.walls || []) {
      const isDoor = w.kind === 'door' || w.kind === 'secret-door';
      const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
      const nearToken = nearAnyVision(mx, my);
      if (!showWalls && !(isDoor && nearToken)) continue;

      c.save();
      c.beginPath();
      c.moveTo(w.x1, w.y1);
      c.lineTo(w.x2, w.y2);
      if (isDoor) {
        c.strokeStyle = (wallToolMode && w.id === view.hoveredWallId)
          ? 'rgba(248, 113, 113, 0.96)'
          : w.open ? 'rgba(118, 214, 138, 0.88)' : 'rgba(235, 160, 72, 0.92)';
        c.lineWidth = Math.max(3, 5 / view.scale);
        if (w.open) c.setLineDash([6 / view.scale, 5 / view.scale]);
      } else {
        c.strokeStyle = (wallToolMode && w.id === view.hoveredWallId)
          ? 'rgba(248, 113, 113, 0.96)'
          : wallToolMode ? 'rgba(245, 195, 95, 0.85)' : 'rgba(215, 180, 118, 0.42)';
        c.lineWidth = (wallToolMode && w.id === view.hoveredWallId)
          ? Math.max(4, 6 / view.scale)
          : Math.max(2.5, 4 / view.scale);
      }
      c.stroke();
      c.restore();
    }

    // Active Wall-Drawing Preview Line
    if (view.wallDraw) {
      c.save();
      c.beginPath();
      c.moveTo(view.wallDraw.x1, view.wallDraw.y1);
      c.lineTo(view.wallDraw.x2, view.wallDraw.y2);
      c.strokeStyle = '#ffd470';
      c.lineWidth = Math.max(3, 4 / view.scale);
      c.setLineDash([8 / view.scale, 5 / view.scale]);
      c.stroke();
      c.restore();
    }

    // Active Token Drag Movement Path & Distance Ruler in World Space
    if (view.tokenDrag?.active) {
      c.save();
      c.beginPath();
      c.moveTo(view.tokenDrag.startX, view.tokenDrag.startY);
      c.lineTo(view.tokenDrag.curX, view.tokenDrag.curY);
      c.strokeStyle = view.tokenDrag.blocked ? '#f07868' : '#ffd875';
      c.lineWidth = Math.max(2.5, 3.5 / view.scale);
      c.setLineDash([8 / view.scale, 6 / view.scale]);
      c.stroke();
      c.restore();
    }

    c.restore(); // End World-Space Transform

    // Screen-Space Pass: Crisp Room Pins (NO ugly unknown wireframes!), Door Toggles & Draggable Player Token
    c.font = '600 12.5px "Microsoft YaHei", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    if (!surface.isSvg) {
      for (const room of map.rooms) {
        if (room.isStoryNode || room.cx == null || room.cy == null) continue;
        const isHov = room.id === view.hoveredRoomId;
        if (!isHov) continue;
        const isCur = room.id === currentState.currentRoomId;
        const isExp = explored.has(room.id);
        const isClr = cleared.has(room.id);

        if (useFog && !isExp && !isCur) continue;

        const sx = room.cx * view.scale + view.offsetX;
        const sy = room.cy * view.scale + view.offsetY;
        if (sx < -120 || sx > cw + 120 || sy < -60 || sy > ch + 60) continue;

        const label = isCur ? `📍 ${room.name}` : isClr ? `✓ ${room.name}` : room.name;
        const padX = 8, padY = 4;
        const textW = c.measureText(label).width;
        const boxW = textW + padX * 2;
        const boxH = 13 + padY * 2;

        c.fillStyle = 'rgba(20, 16, 16, 0.92)';
        c.strokeStyle = '#ef4444';
        c.lineWidth = 1.8;

        const rx = Math.round(sx - boxW / 2);
        const ry = Math.round(sy - boxH / 2 - 22);
        c.beginPath();
        c.roundRect(rx, ry, Math.round(boxW), Math.round(boxH), 5);
        c.fill();
        c.stroke();

        c.fillStyle = '#fff6dc';
        c.fillText(label, Math.round(sx), Math.round(ry + boxH / 2));
      }
    }

    // Interactive Door Vector Markers in Screen Space
    for (const w of surface.walls || []) {
      if (w.kind !== 'door' && w.kind !== 'secret-door') continue;
      const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
      const nearToken = nearAnyVision(mx, my);
      if (useFog && !nearToken) continue;
      const sx = mx * view.scale + view.offsetX;
      const sy = my * view.scale + view.offsetY;
      if (sx < -40 || sx > cw + 40 || sy < -40 || sy > ch + 40) continue;

      const isHovered = view.hoveredDoorId === w.id;
      const r = isHovered ? 12 : 10;
      c.save();
      c.beginPath();
      c.arc(Math.round(sx), Math.round(sy), r, 0, Math.PI * 2);
      c.fillStyle = w.open ? 'rgba(22, 58, 36, 0.92)' : 'rgba(68, 38, 16, 0.94)';
      c.fill();
      c.lineWidth = isHovered ? 2.2 : 1.5;
      c.strokeStyle = w.open ? '#6be094' : '#f2a44c';
      c.stroke();

      // Door icon inside circle
      c.strokeStyle = '#fff5df';
      c.lineWidth = 1.6;
      c.beginPath();
      if (w.open) {
        c.moveTo(sx - 4, sy + 4);
        c.lineTo(sx - 4, sy - 4);
        c.lineTo(sx + 4, sy - 2);
      } else {
        c.rect(Math.round(sx - 4), Math.round(sy - 5), 8, 10);
      }
      c.stroke();

      if (isHovered) {
        const tip = w.open ? '点击关门' : (w.kind === 'secret-door' ? '暗门 · 点击开启' : '门 · 点击开启');
        c.font = '600 11px "Inter","Microsoft YaHei",sans-serif';
        const tw = c.measureText(tip).width + 14;
        c.fillStyle = 'rgba(14, 16, 22, 0.94)';
        c.strokeStyle = w.open ? '#6be094' : '#f2a44c';
        c.lineWidth = 1.2;
        c.beginPath();
        c.roundRect(Math.round(sx - tw / 2), Math.round(sy - 32), Math.round(tw), 20, 6);
        c.fill();
        c.stroke();
        c.fillStyle = '#f8fafc';
        c.fillText(tip, Math.round(sx), Math.round(sy - 22));
      }
      c.restore();
    }

    // Render Draggable Player Token & Vision Origin in World-Locked Grid Scale
    if (showToken) {
      const leader = getPartyLeaderInfo();
      const tx = tokenPos.x * view.scale + view.offsetX;
      const ty = tokenPos.y * view.scale + view.offsetY;
      const tokenRadius = Math.max(4, getTacticalCellPx(surface) * 0.44 * view.scale);
      const isTokenHovered = !!(view.hoveredToken || view.tokenDrag?.active);

      c.save();
      // Token body
      c.beginPath();
      c.arc(tx, ty, tokenRadius, 0, Math.PI * 2);
      c.fillStyle = '#1e3a28';
      c.fill();
      const avatarImg = leader.avatar ? getTokenAvatarImage(leader.avatar) : null;
      if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
        c.save();
        c.beginPath();
        c.arc(tx, ty, Math.max(2, tokenRadius - 1), 0, Math.PI * 2);
        c.clip();
        c.drawImage(avatarImg, tx - tokenRadius, ty - tokenRadius, tokenRadius * 2, tokenRadius * 2);
        c.restore();
      } else {
        c.fillStyle = '#ffffff';
        c.font = `700 ${Math.max(8, Math.round(tokenRadius * 0.65))}px "Inter","Microsoft YaHei",sans-serif`;
        c.fillText(leader.name.slice(0, 2), Math.round(tx), Math.round(ty));
      }
      if (isTokenHovered) {
        c.beginPath();
        c.arc(tx, ty, tokenRadius, 0, Math.PI * 2);
        c.strokeStyle = '#ef4444';
        c.lineWidth = 2.5;
        c.stroke();
      }

      // Show pill only while dragging or hovering token to keep the map uncluttered
      if (view.tokenDrag?.active || view.hoveredToken) {
        let pillText = `${leader.name} · 拖拽移动`;
        if (view.tokenDrag?.active) {
          const distPx = Math.hypot(view.tokenDrag.curX - view.tokenDrag.startX, view.tokenDrag.curY - view.tokenDrag.startY);
          const distFt = Math.round((distPx / (surface.pxPerFt || (surface.gridSize / 5))) / 5) * 5;
          pillText = view.tokenDrag.blocked
            ? `撞墙受阻 · 已移 ${distFt} 尺（开DM透视/穿墙或Alt可穿墙）`
            : `移动 ${distFt} 尺`;
        }
        c.font = '600 11px "Inter","Microsoft YaHei",sans-serif';
        const pw = c.measureText(pillText).width + 14;
        c.fillStyle = view.tokenDrag?.blocked ? 'rgba(92, 28, 24, 0.95)' : 'rgba(14, 18, 24, 0.92)';
        c.strokeStyle = view.tokenDrag?.blocked ? '#f08070' : '#7ad68e';
        c.lineWidth = 1.2;
        c.beginPath();
        c.roundRect(Math.round(tx - pw / 2), Math.round(ty + tokenRadius + 6), Math.round(pw), 20, 10);
        c.fill();
        c.stroke();
        c.fillStyle = '#ecfff0';
        c.fillText(pillText, Math.round(tx), Math.round(ty + tokenRadius + 16));
      }
      c.restore();
    }

    // Render Tactical Battle Units (<battle-delta> / <battle> / exploration tokens) + Drag Ruler
    if (hasBattleUnits) {
      const cellPx = getTacticalCellPx(surface);
      const pxPerFt = surface.pxPerFt || (cellPx / 5) || 15;
      const offX = surface.gridOffsetX || 0;
      const offY = surface.gridOffsetY || 0;
      const uRadius = Math.max(4, cellPx * 0.44 * view.scale);

      if (view.unitDrag?.active) {
        const sx1 = view.unitDrag.startX * view.scale + view.offsetX;
        const sy1 = view.unitDrag.startY * view.scale + view.offsetY;
        const sx2 = view.unitDrag.curX * view.scale + view.offsetX;
        const sy2 = view.unitDrag.curY * view.scale + view.offsetY;
        const lineColor = view.unitDrag.wallBlocked || view.unitDrag.over
          ? '#f87171'
          : view.unitDrag.dash
            ? '#fbbf24'
            : '#6be094';
        c.save();
        c.strokeStyle = lineColor;
        c.lineWidth = 2.6;
        c.setLineDash([6, 4]);
        c.beginPath();
        c.moveTo(sx1, sy1);
        c.lineTo(sx2, sy2);
        c.stroke();
        c.setLineDash([]);
        const label = view.unitDrag.wallBlocked
          ? `撞墙受阻 · ${view.unitDrag.distFt}ft（开DM透视/穿墙或Alt可穿墙）`
          : view.unitDrag.over
            ? `超速 ${view.unitDrag.distFt}ft (上限 ${view.unitDrag.speedFt * 2}ft)`
            : view.unitDrag.dash
              ? `疾走 ${view.unitDrag.distFt}ft`
              : `移动 ${view.unitDrag.distFt}ft`;
        c.font = '700 11.5px "Inter","Microsoft YaHei",sans-serif';
        const lw = c.measureText(label).width + 14;
        const mx = (sx1 + sx2) / 2;
        const my = (sy1 + sy2) / 2 - 14;
        c.fillStyle = 'rgba(13,15,20,.92)';
        c.strokeStyle = lineColor;
        c.lineWidth = 1.3;
        c.beginPath();
        c.roundRect(Math.round(mx - lw / 2), Math.round(my - 10), Math.round(lw), 20, 8);
        c.fill();
        c.stroke();
        c.fillStyle = lineColor;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(label, Math.round(mx), Math.round(my));
        c.restore();
      }

      const cellBuckets = new Map();
      for (const u of battleState.units) {
        const key = Array.isArray(u.pos) ? `${u.pos[0]},${u.pos[1]}` : '0,0';
        const list = cellBuckets.get(key) || [];
        list.push(u.id);
        cellBuckets.set(key, list);
      }

      // Render turn-start ghost tokens (虚影) only while combat is active
      if (battleState.active) for (const u of battleState.units) {
        const startPos = Array.isArray(u._turnStartPos) ? u._turnStartPos : null;
        if (!startPos) continue;
        const isDragging = view.unitDrag?.active && view.unitDrag.name === u.id;
        const hasMoved = Array.isArray(u.pos) && (startPos[0] !== u.pos[0] || startPos[1] !== u.pos[1]);
        if (!isDragging && !hasMoved) continue;
        const halfCell = 0.5 * cellPx;
        const gwx = Math.max(18, Math.min(mw - 18, offX + startPos[0] * pxPerFt + halfCell));
        const gwy = Math.max(18, Math.min(mh - 18, offY + startPos[1] * pxPerFt + halfCell));
        const gx = gwx * view.scale + view.offsetX;
        const gy = gwy * view.scale + view.offsetY;

        c.save();
        c.globalAlpha = 0.36;
        c.beginPath();
        c.arc(gx, gy, uRadius, 0, Math.PI * 2);
        c.fillStyle = u.faction === 'friendly' ? '#173022' : '#361919';
        c.fill();
        const gUrl = getPortraitAvatarForUnit(u.id);
        const gImg = gUrl ? getTokenAvatarImage(gUrl) : null;
        if (gImg && gImg.complete && gImg.naturalWidth > 0) {
          c.save();
          c.beginPath();
          c.arc(gx, gy, Math.max(2, uRadius - 1), 0, Math.PI * 2);
          c.clip();
          c.drawImage(gImg, gx - uRadius, gy - uRadius, uRadius * 2, uRadius * 2);
          c.restore();
        } else {
          c.fillStyle = '#f8fafc';
          c.font = `700 ${Math.max(8, Math.round(uRadius * 0.62))}px "Inter","Microsoft YaHei",sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(String(u.id || '?').slice(0, 2), Math.round(gx), Math.round(gy));
        }
        c.globalAlpha = 0.78;
        c.setLineDash([4, 3]);
        c.beginPath();
        c.arc(gx, gy, uRadius, 0, Math.PI * 2);
        c.strokeStyle = '#eab963';
        c.lineWidth = 1.8;
        c.stroke();
        c.restore();
      }

      for (const u of battleState.units) {
        const uName = u.id;
        const uxFt = Array.isArray(u.pos) ? u.pos[0] : 0;
        const uyFt = Array.isArray(u.pos) ? u.pos[1] : 0;
        const isDragging = view.unitDrag?.active && view.unitDrag.name === uName;
        const halfCell = 0.5 * cellPx;
        const rawWx = isDragging ? view.unitDrag.curX : (offX + uxFt * pxPerFt + halfCell);
        const rawWy = isDragging ? view.unitDrag.curY : (offY + uyFt * pxPerFt + halfCell);
        const wx = Math.max(18, Math.min(mw - 18, rawWx));
        const wy = Math.max(18, Math.min(mh - 18, rawWy));
        if (useFog && u._seeded && u.faction === 'hostile') {
          const inExploredRoom = u.roomId && explored.has(u.roomId);
          const inVisCone = visPolys.some(poly => core.pointInPolygon(wx, wy, poly));
          if (!inExploredRoom && !inVisCone) continue;
        }
        const bucket = cellBuckets.get(`${uxFt},${uyFt}`) || [];
        const bIdx = bucket.indexOf(uName);
        let spreadX = 0, spreadY = 0;
        if (!isDragging && bucket.length > 1 && bIdx >= 0) {
          const ang = (Math.PI * 2 * bIdx) / bucket.length;
          const dist = Math.min(14, uRadius * 0.55);
          spreadX = Math.cos(ang) * dist;
          spreadY = Math.sin(ang) * dist;
        }
        const ux = wx * view.scale + view.offsetX + spreadX;
        const uy = wy * view.scale + view.offsetY + spreadY;
        const curHp = u.hp?.cur;
        const maxHp = u.hp?.max;
        const isDead = curHp != null && curHp <= 0;
        const isHovered = hoveredUnitName === uName;

        c.save();
        if (isDead) c.globalAlpha = 0.42;
        c.beginPath();
        c.arc(ux, uy, uRadius, 0, Math.PI * 2);
        c.fillStyle = u.faction === 'friendly' ? '#173022' : (u.faction === 'hostile' ? '#361919' : '#2f2818');
        c.fill();

        const portraitUrl = getPortraitAvatarForUnit(uName);
        const avImg = portraitUrl ? getTokenAvatarImage(portraitUrl) : null;
        if (avImg && avImg.complete && avImg.naturalWidth > 0) {
          c.save();
          c.beginPath();
          c.arc(ux, uy, Math.max(2, uRadius - 1), 0, Math.PI * 2);
          c.clip();
          c.drawImage(avImg, ux - uRadius, uy - uRadius, uRadius * 2, uRadius * 2);
          c.restore();
        } else {
          c.fillStyle = '#f8fafc';
          c.font = `700 ${Math.max(8, Math.round(uRadius * 0.62))}px "Inter","Microsoft YaHei",sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(String(uName || '?').slice(0, 2), Math.round(ux), Math.round(uy));
        }

        if (isHovered || isDragging) {
          c.beginPath();
          c.arc(ux, uy, uRadius, 0, Math.PI * 2);
          c.strokeStyle = '#ef4444';
          c.lineWidth = 2.5;
          c.stroke();
        }

        // Name & HP tag ONLY on hover or dragging
        if (isHovered || isDragging) {
          const tag = maxHp ? `${uName} ${curHp}/${maxHp}` : uName;
          c.font = '600 10.5px "Inter","Microsoft YaHei",sans-serif';
          const tw = c.measureText(tag).width + 10;
          c.fillStyle = 'rgba(13,15,20,.92)';
          c.strokeStyle = '#ef4444';
          c.lineWidth = 1.2;
          c.beginPath();
          c.roundRect(Math.round(ux - tw / 2), Math.round(uy + uRadius + 4), Math.round(tw), 16, 6);
          c.fill();
          c.stroke();
          c.fillStyle = '#f8fafc';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(tag, Math.round(ux), Math.round(uy + uRadius + 12));
        }
        c.restore();
      }
    }

    // Render Measure Ruler overlay when measuring
    if (view.measureDrag?.active) {
      const sx1 = view.measureDrag.x1 * view.scale + view.offsetX;
      const sy1 = view.measureDrag.y1 * view.scale + view.offsetY;
      const sx2 = view.measureDrag.x2 * view.scale + view.offsetX;
      const sy2 = view.measureDrag.y2 * view.scale + view.offsetY;
      const distPx = Math.hypot(view.measureDrag.x2 - view.measureDrag.x1, view.measureDrag.y2 - view.measureDrag.y1);
      const pxPerFt = surface.pxPerFt || (surface.gridSize / 5) || 30;
      const distFt = Math.round((distPx / pxPerFt) / 5) * 5;
      const squares = Math.round(distFt / 5);

      c.save();
      c.strokeStyle = '#eab963';
      c.lineWidth = 2.5;
      c.setLineDash([7, 5]);
      c.beginPath();
      c.moveTo(sx1, sy1);
      c.lineTo(sx2, sy2);
      c.stroke();
      c.setLineDash([]);

      for (const [px, py] of [[sx1, sy1], [sx2, sy2]]) {
        c.beginPath();
        c.arc(px, py, 4.5, 0, Math.PI * 2);
        c.fillStyle = '#eab963';
        c.fill();
      }

      const mx = (sx1 + sx2) / 2;
      const my = (sy1 + sy2) / 2;
      const label = `${distFt} ft (${squares}格)`;
      c.font = '700 12px "Inter","Microsoft YaHei",sans-serif';
      const lw = c.measureText(label).width + 16;
      c.fillStyle = 'rgba(14, 16, 22, 0.94)';
      c.strokeStyle = '#eab963';
      c.lineWidth = 1.4;
      c.beginPath();
      c.roundRect(Math.round(mx - lw / 2), Math.round(my - 12), Math.round(lw), 24, 8);
      c.fill();
      c.stroke();
      c.fillStyle = '#fde7b7';
      c.fillText(label, Math.round(mx), Math.round(my));
      c.restore();
    }

    const zoomEl = modalEl?.querySelector('[data-dmr-zoom-pct]');
    if (zoomEl) zoomEl.textContent = `${Math.round(view.scale * 100)}%`;

    c.restore();
  }

  function canvasCoordsToMap(clientX, clientY) {
    const canvas = modalEl?.querySelector('.dmr-canvas');
    if (!canvas) return { x: 0, y: 0, sx: 0, sy: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const x = (sx - view.offsetX) / view.scale;
    const y = (sy - view.offsetY) / view.scale;
    return { x, y, sx, sy };
  }

  function snapToGridCenter(wx, wy, surface) {
    const gs = getTacticalCellPx(surface);
    const ox = surface?.gridOffsetX || 0;
    const oy = surface?.gridOffsetY || 0;
    const col = Math.floor((wx - ox) / gs);
    const row = Math.floor((wy - oy) / gs);
    return {
      x: ox + (col + 0.5) * gs,
      y: oy + (row + 0.5) * gs,
    };
  }

  function isHitPlayerToken(sx, sy, surface) {
    if (!surface || battleState.units.length > 0) return false;
    const map = getCurrentMap();
    const showToken = surface.requiresFog || surface.isSvg || map?.mapKind !== 'overworld';
    if (!showToken) return false;
    const pos = getTokenPosition(surface);
    const tx = pos.x * view.scale + view.offsetX;
    const ty = pos.y * view.scale + view.offsetY;
    const tokenRadius = Math.max(8, getTacticalCellPx(surface) * 0.44 * view.scale);
    return Math.hypot(sx - tx, sy - ty) <= tokenRadius + 4;
  }

  function getPortraitAvatarForUnit(name) {
    if (!name) return '';
    try {
      const vault = host.__dndPortraitVault;
      const pc = cachedPartyChars.find(p => p.id === name || p.charId === name);
      if (vault?.getToken) {
        const tok = vault.getToken(pc?.charId || name, name);
        if (tok) return tok;
      }
      if (vault?.get) {
        const hit = vault.get(pc?.charId || name, name);
        if (hit) return hit;
      }
      if (vault?.getPortrait) {
        const hit = vault.getPortrait(name);
        if (hit) return hit;
      }
      const monsterUrl = core.resolveMonsterTokenUrl?.(name, sync.getMonsterBankObject?.() || {});
      if (monsterUrl) return monsterUrl;
      const c = ctx();
      const ch = c?.characters?.[c.characterId];
      if (ch?.avatar && (name === c?.name1 || name === '主角' || name === '玩家')) {
        return `/characters/${encodeURIComponent(ch.avatar)}`;
      }
    } catch {}
    return '';
  }

  function findBattleUnitAtPoint(sx, sy, surface) {
    if (!surface || !battleState.units.length || (!surface.isSvg && getCurrentMap()?.mapKind === 'overworld')) return null;
    const cellPx = getTacticalCellPx(surface);
    const pxPerFt = surface.pxPerFt || (cellPx / 5) || 15;
    const offX = surface.gridOffsetX || 0;
    const offY = surface.gridOffsetY || 0;
    const uRadius = Math.max(8, cellPx * 0.44 * view.scale);
    for (let i = battleState.units.length - 1; i >= 0; i--) {
      const u = battleState.units[i];
      const uxFt = Array.isArray(u.pos) ? u.pos[0] : 0;
      const uyFt = Array.isArray(u.pos) ? u.pos[1] : 0;
      const halfCell = 0.5 * cellPx;
      const wx = Math.max(18, Math.min((surface.width || 2048) - 18, offX + uxFt * pxPerFt + halfCell));
      const wy = Math.max(18, Math.min((surface.height || 1536) - 18, offY + uyFt * pxPerFt + halfCell));
      const ux = wx * view.scale + view.offsetX;
      const uy = wy * view.scale + view.offsetY;
      if (Math.hypot(sx - ux, sy - uy) <= uRadius + 4) return u;
    }
    return null;
  }

  function renderInitStrip() {
    if (!modalEl) return;
    const strip = modalEl.querySelector('[data-dmr-init-strip]');
    const draftBar = modalEl.querySelector('[data-dmr-move-draft]');
    if (strip) {
      if (!battleState.active || !battleState.units.length) {
        strip.hidden = true;
        strip.innerHTML = '';
      } else {
        strip.hidden = false;
        const headerHtml = `<div class="dmr-init-header">
          <span class="dmr-init-round">第 ${battleState.round} 轮</span>
          <span class="dmr-init-actions">
            <button type="button" class="dmr-btn" data-action="battle-end-keep" title="结束战斗（撤销先攻，保留棋子站位）">🕊️ 结束</button>
            <button type="button" class="dmr-btn" data-action="battle-wipe-enemies" title="敌人全歼（撤销先攻并删除所有敌方棋子）">💀 全歼</button>
          </span>
        </div>`;
        const cardsHtml = battleState.units.map(u => {
          const uName = u.id;
          const av = getPortraitAvatarForUnit(uName);
          const avHtml = av
            ? `<img class="dmr-init-avatar" src="${escapeHtml(av)}" alt="">`
            : `<span class="dmr-init-avatar">${escapeHtml(String(uName || '?').slice(0, 1))}</span>`;
          const curHp = u.hp?.cur;
          const maxHp = u.hp?.max;
          const hpTxt = maxHp ? `${curHp ?? 0}/${maxHp}` : (curHp != null ? `${curHp}` : '');
          const stTxt = u.status?.length ? ` · ${u.status.join(',')}` : '';
          const initVal = Number.isFinite(Number(u.init)) ? Number(u.init) : 0;
          return `<div class="dmr-init-card" data-unit-focus="${escapeHtml(uName)}" data-active="${!!u.next}" data-dead="${curHp != null && curHp <= 0}">
            ${avHtml}
            <div class="dmr-init-info">
              <span class="dmr-init-name">${escapeHtml(uName)} ${u.next ? '<span class="dmr-init-now">NOW</span>' : ''}</span>
              <span class="dmr-init-hp">${hpTxt ? `HP ${escapeHtml(hpTxt)}` : (u.faction === 'friendly' ? '友方' : '敌方')}${escapeHtml(stTxt)}</span>
            </div>
            <span class="dmr-init-val" title="先攻值">${initVal}</span>
          </div>`;
        }).join('');
        strip.innerHTML = `${headerHtml}<div class="dmr-init-list">${cardsHtml}</div>`;
      }
    }
    if (draftBar) {
      if (!pendingMoveDraft) {
        draftBar.hidden = true;
      } else {
        draftBar.hidden = false;
        const txtEl = draftBar.querySelector('[data-dmr-move-draft-text]');
        if (txtEl) {
          const d = pendingMoveDraft;
          const warn = d.wallBlocked ? ' ⚠️穿墙' : (d.over ? ' ⚠️超速' : (d.dash ? ' ⚡疾走' : ''));
          txtEl.textContent = `${d.unitName} 移动 ${d.distFt}ft → (${d.targetXFt}ft, ${d.targetYFt}ft)${warn}`;
        }
      }
    }
  }

  function findDoorAtPoint(sx, sy, surface) {
    if (!surface?.walls?.length) return null;
    for (const w of surface.walls) {
      if (w.kind !== 'door' && w.kind !== 'secret-door') continue;
      const mx = ((w.x1 + w.x2) / 2) * view.scale + view.offsetX;
      const my = ((w.y1 + w.y2) / 2) * view.scale + view.offsetY;
      if (Math.hypot(sx - mx, sy - my) <= 16) return w;
    }
    return null;
  }

  function findWallAtPoint(sx, sy, surface) {
    if (!surface?.walls?.length) return null;
    let best = null;
    let bestDist = 11;
    for (const w of surface.walls) {
      const ax = w.x1 * view.scale + view.offsetX;
      const ay = w.y1 * view.scale + view.offsetY;
      const bx = w.x2 * view.scale + view.offsetX;
      const by = w.y2 * view.scale + view.offsetY;
      const abx = bx - ax, aby = by - ay;
      const lenSq = abx * abx + aby * aby;
      const t = lenSq > 1e-6 ? Math.max(0, Math.min(1, ((sx - ax) * abx + (sy - ay) * aby) / lenSq)) : 0;
      const d = Math.hypot(sx - (ax + abx * t), sy - (ay + aby * t));
      if (d <= bestDist) {
        bestDist = d;
        best = w;
      }
    }
    return best;
  }

  function findRoomAtPoint(mx, my, sx = null, sy = null) {
    const map = getCurrentMap();
    const surface = getActiveSurface(map);
    if (!map?.rooms?.length || surface?.isSvg) return null;
    const explored = new Set(currentState.exploredRooms || []);
    const useFog = surface.requiresFog && !currentState.dmView;
    const showAllPins = !useFog;

    // 1. Check screen-space badge hit first
    const screenX = sx != null ? sx : (mx * view.scale + view.offsetX);
    const screenY = sy != null ? sy : (my * view.scale + view.offsetY);
    for (const r of map.rooms) {
      if (r.isStoryNode || r.cx == null || r.cy == null) continue;
      if (!showAllPins && !explored.has(r.id) && r.id !== currentState.currentRoomId) continue;
      const rx = r.cx * view.scale + view.offsetX;
      const ry = r.cy * view.scale + view.offsetY;
      if (Math.abs(screenX - rx) <= 58 && Math.abs(screenY - ry) <= 18) return r;
    }

    // 2. Check polygon containment in world coordinates (invisible trigger zones!)
    for (const r of map.rooms) {
      if (r.isStoryNode || r.cx == null || r.cy == null) continue;
      for (const poly of r.polygons || [r.points]) {
        if (Array.isArray(poly) && poly.length >= 3 && core.pointInPolygon(mx, my, poly)) return r;
      }
    }

    // 3. Check proximity to room centroid within 1.15 * gridSize
    const hitDist = (surface.gridSize || 150) * 1.15;
    for (const r of map.rooms) {
      if (r.isStoryNode || r.cx == null || r.cy == null) continue;
      if (Math.hypot(mx - r.cx, my - r.cy) <= hitDist) return r;
    }
    return null;
  }

  function buildProgressSnapshot(label = '') {
    return {
      label,
      currentMapId: currentState.currentMapId || '',
      currentRoomId: currentState.currentRoomId || '',
      exploredRooms: [...(currentState.exploredRooms || [])],
      clearedRooms: [...(currentState.clearedRooms || [])],
      tokenPos: structuredClone(currentState.tokenPos || {}),
      transitions: [...(currentState.transitions || [])],
      svgViewMode: !!currentState.svgViewMode,
      at: Date.now(),
    };
  }

  function nextStateHistory(label = '') {
    const prev = Array.isArray(currentState.stateHistory) ? currentState.stateHistory : [];
    const next = [...prev, buildProgressSnapshot(label)];
    return next.length > 20 ? next.slice(next.length - 20) : next;
  }

  function getUndoTargetLabel() {
    const hist = currentState.stateHistory;
    if (Array.isArray(hist) && hist.length > 0) {
      const snap = hist[hist.length - 1];
      const m = currentAdv?.maps?.find(x => x.id === snap.currentMapId);
      const r = m?.rooms?.find(x => x.id === snap.currentRoomId);
      if (m && r) return `${m.title} - [#${r.id}] ${r.name}`;
      if (m) return m.title;
      return snap.label || '上一个状态';
    }
    const trans = currentState.transitions;
    if (Array.isArray(trans) && trans.length > 0) {
      const last = trans[trans.length - 1];
      const m = currentAdv?.maps?.find(x => x.id === last.mapId);
      const r = m?.rooms?.find(x => x.id === last.from);
      if (m && r) return `${m.title} - [#${r.id}] ${r.name}`;
      return last.from ? `节点 #${last.from}` : '上一个节点';
    }
    return '';
  }

  async function undoLastProgress() {
    if (!currentAdv) return;
    const hist = Array.isArray(currentState.stateHistory) ? [...currentState.stateHistory] : [];
    if (hist.length > 0) {
      const snap = hist.pop();
      inspectedRoomId = snap.currentRoomId || '';
      await saveChatState({
        ...currentState,
        currentMapId: snap.currentMapId,
        currentRoomId: snap.currentRoomId,
        exploredRooms: snap.exploredRooms || [],
        clearedRooms: snap.clearedRooms || [],
        tokenPos: snap.tokenPos || {},
        transitions: snap.transitions || [],
        svgViewMode: !!snap.svgViewMode,
        stateHistory: hist,
      });
      if (snap.currentRoomId) focusRoomOnCanvas(snap.currentRoomId);
      else fitMapToViewport();
      return;
    }

    // Fallback for older saves that only recorded transitions
    const trans = Array.isArray(currentState.transitions) ? [...currentState.transitions] : [];
    if (trans.length === 0) return;
    const last = trans.pop();
    const map = currentAdv.maps.find(m => m.id === last.mapId) || getCurrentMap();
    const prevRoom = map?.rooms?.find(r => r.id === last.from);
    if (!map || !prevRoom) return;

    const explored = new Set(currentState.exploredRooms || []);
    const cleared = new Set(currentState.clearedRooms || []);
    if (last.to && last.to !== last.from && !cleared.has(last.to)) {
      const stillVisited = trans.some(t => t.to === last.to || t.from === last.to);
      if (!stillVisited) explored.delete(last.to);
    }
    explored.add(prevRoom.id);

    const tokenPos = { ...(currentState.tokenPos || {}) };
    if (prevRoom.cx != null && prevRoom.cy != null) {
      tokenPos[map.id] = { x: Math.round(prevRoom.cx), y: Math.round(prevRoom.cy) };
    }
    inspectedRoomId = prevRoom.id;
    await saveChatState({
      ...currentState,
      currentMapId: map.id,
      currentRoomId: prevRoom.id,
      exploredRooms: [...explored],
      tokenPos,
      transitions: trans,
      svgViewMode: false,
    });
    focusRoomOnCanvas(prevRoom.id);
  }

  async function movePartyToRoom(targetRoomId, targetMapId = null, sendChatPrompt = false) {
    if (!currentAdv) return;
    const mapId = targetMapId || currentState.currentMapId || getCurrentMap()?.id || '';
    const map = currentAdv.maps.find(m => m.id === mapId);
    const room = map?.rooms?.find(r => r.id === targetRoomId);
    if (!map || !room) return;

    const stateHistory = nextStateHistory(`推进至 ${map.title} - ${room.name}`);
    const explored = new Set(currentState.exploredRooms || []);
    explored.add(room.id);
    const transitions = [...(currentState.transitions || [])];
    if (currentState.currentRoomId && currentState.currentRoomId !== room.id && currentState.currentMapId === map.id) {
      transitions.push({ mapId: map.id, from: currentState.currentRoomId, to: room.id, at: Date.now() });
    }

    const tokenPos = { ...(currentState.tokenPos || {}) };
    if (room.cx != null && room.cy != null) {
      tokenPos[map.id] = { x: Math.round(room.cx), y: Math.round(room.cy) };
    }

    inspectedRoomId = room.id;
    await saveChatState({
      ...currentState,
      enabled: true,
      moduleId: currentAdv.id,
      moduleName: currentAdv.name,
      currentMapId: map.id,
      currentRoomId: room.id,
      exploredRooms: [...explored],
      tokenPos,
      svgViewMode: false,
      transitions,
      stateHistory,
    });
    focusRoomOnCanvas(room.id);

    if (sendChatPrompt) {
      const input = doc.querySelector('#send_textarea');
      if (input) {
        const cleanName = room.name.replace(/^★\s*/, '');
        const draft = `【模组推进】队伍前往并进入了「${map.title} - ${cleanName}」。请根据当前世界书中的原版房间数据进行场景描写与主持。`;
        if (!input.value.trim()) {
          input.value = draft;
          input.dispatchEvent(new host.Event('input', { bubbles: true }));
        }
        closeModal();
        input.focus();
      }
    }
  }

  async function toggleRoomState(roomId, field) {
    if (!currentAdv || !roomId) return;
    const set = new Set(currentState[field] || []);
    if (set.has(roomId)) set.delete(roomId);
    else set.add(roomId);
    const explored = new Set(currentState.exploredRooms || []);
    if (field === 'clearedRooms' && set.has(roomId)) explored.add(roomId);
    await saveChatState({
      ...currentState,
      exploredRooms: field === 'exploredRooms' ? [...set] : [...explored],
      clearedRooms: field === 'clearedRooms' ? [...set] : currentState.clearedRooms,
    });
  }

  function renderSidePanel() {
    const panel = modalEl?.querySelector('[data-dmr-panel]');
    if (!panel) return;
    const map = getCurrentMap();
    if (!currentAdv || !map) {
      panel.innerHTML = `<div class="dmr-card"><div class="dmr-card-title">尚未加载模组</div><div>请在顶部下拉框中选择一部 D&D 5e 官方模组（如《凡戴尔的失落矿坑》），即可自动生成每层地城拓扑图、按场景智能启用迷雾探索，并提前一步动态切换世界书。</div></div>`;
      return;
    }

    const explored = new Set(currentState.exploredRooms || []);
    const cleared = new Set(currentState.clearedRooms || []);
    const adjMap = getAdjacentUnexploredMap(map);
    const useFog = (map.requiresFog !== false) && !currentState.dmView;
    const showAll = !useFog;

    const curRoom = map.rooms.find(r => r.id === currentState.currentRoomId) || map.rooms[0] || null;
    const inspRoom = map.rooms.find(r => r.id === inspectedRoomId) || curRoom;

    if (activeTab === 'topology') {
      const rows = map.rooms.map(r => {
        const isCur = r.id === currentState.currentRoomId;
        const isExp = explored.has(r.id);
        const isClr = cleared.has(r.id);
        const adj = adjMap.get(r.id);
        const visibleName = (showAll || isExp) ? r.name : adj ? `？未知毗邻区域 [向${adj.dir}]` : '？？？未探索区域';
        const statusBadge = isCur
          ? `<span class="dmr-badge dmr-badge-cur">★当前节点</span>`
          : isClr
            ? `<span class="dmr-badge dmr-badge-ok">✓已完成</span>`
            : (isExp || !map.requiresFog)
              ? `<span class="dmr-badge dmr-badge-ok">✓已开放</span>`
              : `<span class="dmr-badge dmr-badge-unk">?未探索</span>`;
        return `<div class="dmr-room-item" data-room-pick="${r.id}" data-current="${isCur}">
          <span><strong>[#${r.id}]</strong> ${escapeHtml(visibleName)}</span>
          <span>${statusBadge}</span>
        </div>`;
      }).join('');

      panel.innerHTML = `
        <div class="dmr-card">
          <div class="dmr-card-title">
            <span>本层空间拓扑节点 (${map.rooms.length})</span>
            ${map.requiresFog ? `<button type="button" class="dmr-btn" data-action="reveal-all">${explored.size >= map.rooms.length ? '重置本层迷雾' : '一键点亮本层'}</button>` : `<span class="dmr-badge dmr-badge-ok">全图开放</span>`}
          </div>
          <div class="dmr-exit-list">${rows}</div>
        </div>
        <div class="dmr-card">
          <div class="dmr-card-title">AI 拓扑图谱结构化文本</div>
          <div class="dmr-pre">${escapeHtml(core.formatFloorTopologyText(map, currentState))}</div>
        </div>
      `;
      return;
    }

    if (activeTab === 'prompt') {
      const promptText = core.buildModuleWorldbookPrompt(currentAdv, currentState, sync.getMonsterBankObject());
      panel.innerHTML = `
        <div class="dmr-card">
          <div class="dmr-card-title">
            <span>实时注入世界书预览（含提前一步预载）</span>
            <span class="dmr-badge dmr-badge-ok">${promptText.length} 字符</span>
          </div>
          <div style="font-size:12px;color:#b8a78c;margin-bottom:8px">以下内容已动态写入世界书条目 <code>${escapeHtml(sync.ENTRY_COMMENT)}</code>（同时提供当前节点 + 提前一步预载的下一跳区域完整数据与怪物卡）：</div>
          <div class="dmr-pre">${escapeHtml(promptText || '（模组世界书注入当前已关闭）')}</div>
        </div>
      `;
      return;
    }

    // Default tab: 'scene'
    if (!inspRoom) {
      panel.innerHTML = `<div class="dmr-card"><div class="dmr-card-title">${escapeHtml(map.title)}</div><div>此地图为区域概览地图，您可自由拖动与缩放查看。</div></div>`;
      return;
    }

    const isCur = inspRoom.id === currentState.currentRoomId;
    const isExp = explored.has(inspRoom.id);
    const isClr = cleared.has(inspRoom.id);
    const canSeeDetails = showAll || isExp;
    const isStoryOrOverworld = !!(inspRoom.isStoryNode || !map.requiresFog);

    const exitsHtml = (inspRoom.edges || []).map(edge => {
      const target = map.rooms.find(r => r.id === edge.toId);
      if (!target) return '';
      const tExp = explored.has(target.id);
      const tClr = cleared.has(target.id);
      const title = (showAll || tExp) ? `[#${target.id}] ${target.name}` : `？未知区域 (向${edge.dir})`;
      const preview = (showAll || tExp) ? target.publicSummary : '通道延伸向迷雾深处，可点击前往探索或先点亮迷雾。';
      return `<div class="dmr-exit-item">
        <div class="dmr-exit-head">
          <span><span class="dmr-badge">向${escapeHtml(edge.dir)}</span> ${escapeHtml(title)}</span>
          <span class="dmr-badge ${tClr ? 'dmr-badge-ok' : (tExp || showAll) ? 'dmr-badge-ok' : 'dmr-badge-unk'}">${tClr ? '✓已完成' : (tExp || showAll) ? '✓已预载至世界书' : '已预载至世界书'}</span>
        </div>
        ${edge.note ? `<div style="font-size:11.5px;color:#c2ae8b">连接方式：${escapeHtml(edge.note)}</div>` : ''}
        <div style="font-size:12px;color:#b5a58b">${escapeHtml(preview)}</div>
        <div class="dmr-exit-actions">
          <button type="button" class="dmr-btn dmr-btn-primary" data-move-room="${target.id}">🚶 推进至此处</button>
          <button type="button" class="dmr-btn" data-move-chat="${target.id}">💬 推进并填入行动</button>
          ${(map.requiresFog && !tExp) ? `<button type="button" class="dmr-btn" data-reveal-room="${target.id}">🔦 仅开雾</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // Next-Scene Lookahead Card when on an Overworld / Story Map with nextMapId
    let nextMapCardHtml = '';
    if (map.nextMapId && currentAdv?.maps) {
      const nextMap = currentAdv.maps.find(m => m.id === map.nextMapId);
      const entryRoom = nextMap?.rooms?.[0];
      if (nextMap && entryRoom) {
        const previewRooms = nextMap.rooms.slice(0, 2).map(r => `[#${r.id}] ${r.name}`).join(' 、 ');
        nextMapCardHtml = `
          <div class="dmr-card" style="border-color:#7d6236;background:linear-gradient(180deg,#282117,#1d1811)">
            <div class="dmr-card-title">
              <span>⏭️ 提前一步已预载：${escapeHtml(nextMap.title)}</span>
              <span class="dmr-badge dmr-badge-ok">世界书已就绪</span>
            </div>
            <div style="font-size:12px;color:#cbb898;margin-bottom:8px">
              已同步预载下一幕「<strong>${escapeHtml(nextMap.title)}</strong>」的环境规则与入口区域（${escapeHtml(previewRooms)}）原版数据，队伍追查踪迹或抵达入口时 AI 可无缝衔接主持。
            </div>
            <div class="dmr-exit-actions">
              <button type="button" class="dmr-btn dmr-btn-primary" data-jump-map="${escapeHtml(nextMap.id)}" data-jump-room="${escapeHtml(entryRoom.id)}">🏰 切入下一场景：${escapeHtml(nextMap.title)}</button>
              <button type="button" class="dmr-btn" data-jump-map="${escapeHtml(nextMap.id)}" data-jump-room="${escapeHtml(entryRoom.id)}" data-jump-chat="1">💬 切入并填入行动</button>
            </div>
          </div>
        `;
      }
    }

    const monsterStats = (inspRoom.refs?.creatures || [])
      .map(c => sync.getMonsterBankObject()[c.key] || sync.getMonsterBankObject()[c.name.toLowerCase()])
      .filter(Boolean)
      .map(m => core.formatMonsterStatblock(m))
      .filter(Boolean)
      .join('\n\n');

    const undoLabel = getUndoTargetLabel();
    panel.innerHTML = `
      <div class="dmr-card">
        <div class="dmr-card-title">
          <span>${canSeeDetails ? `[#${inspRoom.id}] ${escapeHtml(inspRoom.name)}` : `[#${inspRoom.id}] ？未知待探索区域`}</span>
          <span style="display:flex;gap:6px;align-items:center">
            ${undoLabel ? `<button type="button" class="dmr-btn" data-action="undo-progress" title="回退至：${escapeHtml(undoLabel)}">↩️ 回退上一节点</button>` : ''}
            ${isCur
              ? `<span class="dmr-badge dmr-badge-cur">⚔️ 队伍当前所在</span>`
              : `<button type="button" class="dmr-btn dmr-btn-primary" data-move-room="${inspRoom.id}">📍 设为当前所在</button>`}
          </span>
        </div>
        <div class="dmr-exit-actions" style="margin-bottom:8px">
          ${map.requiresFog
            ? `<button type="button" class="dmr-btn" data-toggle-exp="${inspRoom.id}" data-active="${isExp}">${isExp ? '✓ 已揭开迷雾' : '🔦 揭开此房间迷雾'}</button>`
            : `<span class="dmr-badge dmr-badge-ok">${map.mapKind === 'overworld' ? '🌍 大地图章节遭遇（免迷雾）' : '🏘️ 城镇公开地标（免迷雾）'}</span>`}
          <button type="button" class="dmr-btn" data-toggle-clr="${inspRoom.id}" data-active="${isClr}">${isClr ? '✓ 已完成/已清理' : '☑️ 标记已完成'}</button>
          <button type="button" class="dmr-btn" data-move-chat="${inspRoom.id}">💬 ${isStoryOrOverworld ? '让DM主持此幕' : '让DM描写此房间'}</button>
        </div>
        ${canSeeDetails
          ? `<div class="dmr-readaloud">${escapeHtml(inspRoom.readAloud || inspRoom.publicSummary || '（本节点详情已注入世界书，可展开下方原版全文查阅）')}</div>`
          : `<div class="dmr-readaloud">此区域仍笼罩在战争迷雾中。点击上方「设为当前所在」或「揭开此房间迷雾」即可探索。</div>`}
      </div>

      ${nextMapCardHtml}

      <div class="dmr-card">
        <div class="dmr-card-title">🧭 ${isStoryOrOverworld ? '关联剧情与后续节点' : '相邻通道与可行进方向'} (${inspRoom.edges?.length || 0} · 均已提前预载)</div>
        ${exitsHtml ? `<div class="dmr-exit-list">${exitsHtml}</div>` : `<div style="color:#9e8e74">当前地图内无其他直接连通节点，可通过上方场景切换进入下一张地图。</div>`}
      </div>

      <div class="dmr-card">
        <div class="dmr-card-title">
          <span>📜 原版节点 DM 机密与怪物数据</span>
          <button type="button" class="dmr-btn" data-action="toggle-spoilers">${(!map.requiresFog || currentState.dmView || dmSpoilersOpen) ? '收起原版全文' : '👁️ 展开原版全文'}</button>
        </div>
        ${(!map.requiresFog || currentState.dmView || dmSpoilersOpen)
          ? `<div class="dmr-pre">${escapeHtml(inspRoom.fullText || inspRoom.dmDetails || '无详细记录')}${monsterStats ? `\n\n=== 关联生物数据卡 ===\n${monsterStats}` : ''}</div>`
          : `<div style="font-size:12px;color:#a8977c">为保障地城探索悬念，陷阱 DC、暗门与敌人埋伏细节默认折叠（已连同下一跳房间一起自动注入给 AI DM 与战斗副脑）。如需查阅可点击右上角展开。</div>`}
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderModal() {
    if (!modalEl || modalEl.hidden) return;
    const map = getCurrentMap();
    const modSelect = modalEl.querySelector('[data-dmr-module]');
    const mapSelect = modalEl.querySelector('[data-dmr-map]');
    const enableBtn = modalEl.querySelector('[data-action="toggle-enable"]');
    const dmViewBtn = modalEl.querySelector('[data-action="toggle-dmview"]');
    const brushBtn = modalEl.querySelector('[data-action="toggle-brush"]');
    const svgBtn = modalEl.querySelector('[data-action="toggle-svg"]');
    const wallBtn = modalEl.querySelector('[data-action="toggle-wall-tool"]');
    const modePill = modalEl.querySelector('[data-dmr-mode-pill]');
    const sceneTabBtn = modalEl.querySelector('[data-dmr-tab="scene"]');
    const surface = getActiveSurface(map);

    if (modSelect && modSelect.value !== (currentState.moduleId || '')) {
      modSelect.value = currentState.moduleId || '';
    }
    if (mapSelect) {
      const maps = currentAdv?.maps || [];
      const html = maps.length
        ? maps.map(m => {
            const tag = m.mapKind === 'overworld' ? '大地图' : m.mapKind === 'settlement' ? '城镇' : `${m.rooms.length}区域`;
            return `<option value="${escapeHtml(m.id)}">[${escapeHtml(m.chapterName)}] ${escapeHtml(m.title)} (${tag})</option>`;
          }).join('')
        : `<option value="">-- 请先选择模组 --</option>`;
      if (mapSelect.innerHTML !== html) mapSelect.innerHTML = html;
      if (currentState.currentMapId) mapSelect.value = currentState.currentMapId;
    }
    if (enableBtn) {
      const on = !!(currentState.enabled && currentState.moduleId);
      enableBtn.dataset.active = String(on);
      enableBtn.textContent = on ? '🟢 世界书同步：开启' : '⚪ 世界书同步：关闭';
    }
    const undoBtn = modalEl.querySelector('[data-action="undo-progress"]');
    if (undoBtn) {
      const undoLabel = getUndoTargetLabel();
      undoBtn.disabled = !undoLabel;
      undoBtn.title = undoLabel
        ? `回退至上一个剧情/地图节点：${undoLabel}（同步恢复迷雾与世界书）`
        : '暂无可回退的推进记录';
    }
    if (modePill) {
      if (!map) {
        modePill.textContent = '🗺️ 请选择模组';
      } else if (surface?.isSvg) {
        modePill.textContent = `⚔️ SVG 动态战术地图 · ${surface.title || '遭遇战场'}（含墙体遮挡与视锥）`;
      } else if (map.mapKind === 'overworld') {
        modePill.textContent = '🌍 区域大地图（无战争迷雾 · 全图清晰直览）';
      } else if (map.mapKind === 'settlement') {
        modePill.textContent = '🏘️ 城镇导览图（无战争迷雾 · 地点全开放）';
      } else {
        modePill.textContent = '🏰 战术地城（玩家视点射线视野 + 完整手绘地图）';
      }
    }
    const moveBtn = modalEl.querySelector('[data-action="tool-move"]');
    const measureBtn = modalEl.querySelector('[data-action="toggle-measure"]');
    const snapBtn = modalEl.querySelector('[data-action="toggle-grid-snap"]');
    if (snapBtn) {
      snapBtn.dataset.active = String(gridSnapMode);
      snapBtn.textContent = gridSnapMode ? '🧲 格点吸附' : '🔓 自由移动';
      snapBtn.title = gridSnapMode ? '当前：自动吸附5尺方格中心（点击解锁自由移动）' : '当前：自由移动（点击开启方格吸附）';
    }
    const softWallBtn = modalEl.querySelector('[data-action="toggle-softwall"]');
    if (softWallBtn) {
      softWallBtn.dataset.active = String(softWallMode);
      softWallBtn.textContent = softWallMode ? '👻 穿墙：开' : '👻 穿墙：关';
      softWallBtn.title = softWallMode ? '当前允许穿墙移动（点击恢复墙壁碰撞）' : '允许棋子穿墙移动（卡墙脱困用，也可开 DM 透视或按住 Alt 拖拽）';
    }
    if (moveBtn) moveBtn.dataset.active = String(!brushMode && !wallToolMode && !measureMode);
    if (measureBtn) measureBtn.dataset.active = String(measureMode);
    if (svgBtn) {
      const canToggleSvg = !!(surface?.hasPresetSvg);
      svgBtn.style.display = canToggleSvg ? '' : 'none';
      svgBtn.dataset.active = String(!!surface?.isSvg);
      svgBtn.title = surface?.isSvg ? '返回区域大图' : '切换 SVG 遭遇战术图';
    }
    if (dmViewBtn) {
      const hasFog = surface ? surface.requiresFog !== false : true;
      dmViewBtn.style.display = hasFog ? '' : 'none';
      dmViewBtn.dataset.active = String(!!currentState.dmView);
      dmViewBtn.title = currentState.dmView ? '当前：DM 全图透视（点击切回玩家视锥）' : '当前：玩家视锥（点击切换 DM 全图透视）';
    }
    if (brushBtn) {
      const hasFog = surface ? surface.requiresFog !== false : false;
      brushBtn.style.display = hasFog ? '' : 'none';
      brushBtn.dataset.active = String(brushMode);
    }
    if (wallBtn) {
      const showWallTool = !!(surface && (surface.requiresFog || surface.isSvg));
      wallBtn.style.display = showWallTool ? '' : 'none';
      wallBtn.dataset.active = String(wallToolMode);
    }

    const maxBtn = modalEl.querySelector('[data-action="toggle-maximize"]');
    if (maxBtn) maxBtn.dataset.active = String(winMaximized);
    modalEl.dataset.minimized = String(winMinimized);
    modalEl.dataset.maximized = String(winMaximized);

    renderInitStrip();
    drawMapCanvas();
  }

  async function selectModuleById(advId) {
    if (!advId) {
      currentAdv = null;
      await saveChatState({ ...currentState, enabled: false, moduleId: '', moduleName: '' });
      return;
    }
    const statusEl = modalEl?.querySelector('[data-dmr-legend-status]');
    if (statusEl) statusEl.textContent = `正在从 5e.kiwee.top 加载模组 ${advId} 数据与拓扑…`;
    try {
      const compiled = await sync.loadAdventure(advId);
      currentAdv = compiled;
      const firstMap = compiled.maps.find(m => m.rooms.length > 0) || compiled.maps[0] || null;
      const firstRoom = firstMap?.rooms?.[0] || null;
      inspectedRoomId = firstRoom?.id || '';
      const initTokenPos = {};
      for (const m of compiled.maps) {
        const r0 = m.rooms.find(r => !r.isStoryNode && r.cx != null && r.cy != null) || m.rooms[0];
        if (r0 && r0.cx != null && r0.cy != null) {
          initTokenPos[m.id] = { x: Math.round(r0.cx), y: Math.round(r0.cy) };
        }
      }
      await saveChatState({
        enabled: true,
        moduleId: compiled.id,
        moduleName: compiled.name,
        currentMapId: firstMap?.id || '',
        currentRoomId: firstRoom?.id || '',
        exploredRooms: firstRoom ? [firstRoom.id] : [],
        clearedRooms: [],
        customReveals: {},
        tokenPos: initTokenPos,
        customWalls: {},
        doorStates: {},
        svgViewMode: false,
        transitions: [],
        dmView: false,
      });
      if (statusEl) statusEl.textContent = `已加载《${compiled.name}》，共 ${compiled.maps.length} 张场景地图。`;
      if (firstRoom) focusRoomOnCanvas(firstRoom.id);
      else fitMapToViewport();
    } catch (err) {
      if (statusEl) statusEl.textContent = `加载模组失败：${err?.message || err}`;
    }
  }

  async function openModal() {
    injectStyles();
    if (!modalEl) {
      modalEl = doc.createElement('div');
      modalEl.id = 'dnd-module-runner-modal';
      modalEl.hidden = true;
      modalEl.innerHTML = `
        <div class="dmr-window" role="dialog" aria-label="D&D 模组地图与拓扑导航器">
          <div class="dmr-topbar">
            <span class="dmr-title">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#eab963" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
              战术地图
            </span>
            <input type="search" class="dmr-input" data-dmr-search placeholder="筛选模组..." style="width:140px" />
            <select class="dmr-select" data-dmr-module style="max-width:200px"><option value="">正在加载模组目录…</option></select>
            <select class="dmr-select" data-dmr-map style="max-width:200px"><option value="">-- 场景地图 --</option></select>
            <span class="dmr-spacer"></span>
            <button type="button" class="dmr-btn" data-action="undo-progress" disabled title="暂无可回退的推进记录">↩️ 回退</button>
            <button type="button" class="dmr-btn" data-action="open-tokenizer" title="FVTT Tokenizer 风格速制圆形边框 Token 并保存至《角色头像库》">🎨 Token</button>
            <button type="button" class="dmr-btn" data-action="ai-correct" title="将当前地图画面、状态数据与最近5楼对话发给酒馆当前AI，自动修正探索进度与角色位置">✨ AI修正</button>
            <button type="button" class="dmr-btn" data-action="toggle-grid-snap" data-active="true" title="自动吸附5尺方格中心（点击解锁自由移动）">🧲 格点吸附</button>
            <button type="button" class="dmr-btn" data-action="toggle-softwall" data-active="false" title="允许棋子穿墙移动（卡墙脱困用，也可开 DM 透视或按住 Alt 拖拽）">👻 穿墙：关</button>
            <button type="button" class="dmr-btn" data-action="toggle-enable">⚪ 世界书同步：关闭</button>
            <button type="button" class="dmr-btn dmr-btn-icon" data-action="toggle-maximize" data-active="false" title="最大化/还原">□</button>
            <button type="button" class="dmr-btn" data-action="close">✕</button>
          </div>
          <div class="dmr-move-draft-bar" data-dmr-move-draft hidden>
            <span data-dmr-move-draft-text></span>
            <span style="display:flex;gap:6px">
              <button type="button" class="dmr-btn dmr-btn-primary" data-action="apply-move-draft">📌 填入移动指令</button>
              <button type="button" class="dmr-btn" data-action="clear-move-draft">取消</button>
            </span>
          </div>
          <div class="dmr-body" data-side-collapsed="false">
            <div class="dmr-map-col">
              <div class="dmr-map-stage">
                <canvas class="dmr-canvas"></canvas>
                <div class="dmr-dock" role="toolbar" aria-label="战术地图工具栏">
                  <button type="button" class="dmr-dock-btn" data-action="tool-move" data-active="true" title="浏览与移动棋子（默认）">
                    <svg viewBox="0 0 24 24"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>
                  </button>
                  <button type="button" class="dmr-dock-btn" data-action="toggle-measure" data-active="false" title="测距尺：按住拖拽测量 5 尺格距离">
                    <svg viewBox="0 0 24 24"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z"/><path d="M14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/></svg>
                  </button>
                  <button type="button" class="dmr-dock-btn" data-action="toggle-brush" style="display:none" title="开雾笔刷：点击点亮任意区域记忆">
                    <svg viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/></svg>
                  </button>
                  <button type="button" class="dmr-dock-btn" data-action="toggle-wall-tool" style="display:none" title="墙体编辑：拖拽新增墙体 · 单击高亮墙体删除">
                    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 16h18M9 4v6M15 10v6M9 16v4"/></svg>
                  </button>
                  <div class="dmr-dock-sep"></div>
                  <button type="button" class="dmr-dock-btn" data-action="toggle-dmview" style="display:none" title="切换玩家视锥 / DM 全图透视">
                    <svg viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button type="button" class="dmr-dock-btn" data-action="toggle-svg" style="display:none" title="切换 SVG 动态遭遇战术图">
                    <svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                  </button>
                </div>
                <div class="dmr-bottom-hud">
                  <div class="dmr-hud-pill">
                    <button type="button" class="dmr-btn" data-action="focus-party" title="聚焦玩家棋子或当前区域">聚焦玩家</button>
                    <button type="button" class="dmr-btn" data-action="fit-map" title="缩放适应整张地图">适应全图</button>
                    <button type="button" class="dmr-btn dmr-btn-icon" data-action="zoom-out" title="缩小">－</button>
                    <span class="dmr-zoom-pct" data-dmr-zoom-pct>100%</span>
                    <button type="button" class="dmr-btn dmr-btn-icon" data-action="zoom-in" title="放大">＋</button>
                  </div>
                  <div class="dmr-status-chip" data-dmr-legend-status>拖拽玩家棋子移动探路 · 点击圆门开关视野 · 双击房间跳转</div>
                </div>
              </div>
            </div>
            <div class="dmr-init-strip" data-dmr-init-strip hidden></div>
          </div>
        </div>
      `;
      doc.body.appendChild(modalEl);
      const winEl = modalEl.querySelector('.dmr-window');
      const geo = loadWinGeo();
      if (winEl && geo) {
        if (geo.left != null) winEl.style.left = `${Math.max(0, Math.min(host.innerWidth - 160, geo.left))}px`;
        if (geo.top != null) winEl.style.top = `${Math.max(0, Math.min(host.innerHeight - 80, geo.top))}px`;
        if (geo.width) winEl.style.width = `${Math.max(400, Math.min(host.innerWidth - 16, geo.width))}px`;
        if (geo.height) winEl.style.height = `${Math.max(260, Math.min(host.innerHeight - 16, geo.height))}px`;
      }
      bindModalEvents();
    }

    modalEl.hidden = false;
    await populateCatalogSelect();
    await refreshPartyCharacters();
    syncBattleFromChat();
    renderModal();
    host.requestAnimationFrame(() => {
      if (currentState.currentRoomId) focusRoomOnCanvas(currentState.currentRoomId);
      else fitMapToViewport();
    });
  }

  function closeModal() {
    if (modalEl) modalEl.hidden = true;
  }

  const MODULE_POPULARITY_RANK = [
    'LMoP', 'CoS', 'DIP', 'WDH', 'ToA', 'BGDIA', 'WBtW', 'DoSI', 'IDRotF', 'SKT',
    'OotA', 'WDMM', 'GoS', 'KftGV', 'TftYP-TSC', 'CRCotN', 'PotA', 'HotDQ', 'RoT',
    'PaBTSO', 'DSotDQ', 'VEoR', 'JttRC', 'QftIS', 'HotB',
    'SCC-CK', 'SCC-HfMT', 'SCC-TMM', 'SCC-ARiR',
    'TftYP-TFoF', 'TftYP-THSoT', 'TftYP-WPM', 'TftYP-ToH', 'TftYP-DiT', 'TftYP-AtG',
    'SjA', 'LoX', 'ToFW', 'SLW', 'SDW', 'DC', 'CoA', 'GotSF', 'CM',
    'KKW', 'MOT-NSS', 'EFR', 'RMBRE', 'IMR', 'LR', 'LLK', 'TLK',
  ].reduce((acc, id, idx) => { acc[id.toLowerCase()] = idx; return acc; }, {});

  function sortCatalogByPopularity(list) {
    return [...(list || [])].sort((a, b) => {
      const ra = MODULE_POPULARITY_RANK[String(a?.id || '').toLowerCase()];
      const rb = MODULE_POPULARITY_RANK[String(b?.id || '').toLowerCase()];
      const hasA = ra !== undefined;
      const hasB = rb !== undefined;
      if (hasA && hasB) return ra - rb;
      if (hasA) return -1;
      if (hasB) return 1;
      const pa = String(a?.published || '');
      const pb = String(b?.published || '');
      if (pa !== pb) return pb.localeCompare(pa);
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN');
    });
  }

  let fullCatalog = [];
  async function populateCatalogSelect(filterText = '') {
    const modSelect = modalEl?.querySelector('[data-dmr-module]');
    if (!modSelect) return;
    try {
      if (!fullCatalog.length) {
        fullCatalog = sortCatalogByPopularity(await sync.loadCatalog());
      }
      const q = filterText.trim().toLowerCase();
      const filtered = q
        ? fullCatalog.filter(a => (a.name || '').toLowerCase().includes(q) || (a.ENG_name || '').toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q) || (a.storyline || '').toLowerCase().includes(q))
        : fullCatalog;

      const options = [`<option value="">-- 选择 D&D 官方模组 (${filtered.length}/${fullCatalog.length} · 按人气排序) --</option>`];
      for (const a of filtered) {
        const lvl = a.level ? ` [${a.level.start}-${a.level.end}级]` : '';
        const rank = MODULE_POPULARITY_RANK[String(a.id || '').toLowerCase()];
        const hot = rank !== undefined && rank < 10 ? '★ ' : '';
        options.push(`<option value="${escapeHtml(a.id)}">${hot}${escapeHtml(a.name)} (${escapeHtml(a.id)})${lvl}</option>`);
      }
      modSelect.innerHTML = options.join('');
      if (currentState.moduleId) modSelect.value = currentState.moduleId;
    } catch (err) {
      modSelect.innerHTML = `<option value="">加载目录失败: ${escapeHtml(err?.message || err)}</option>`;
    }
  }

  function bindModalEvents() {
    const winEl = modalEl.querySelector('.dmr-window');
    const topbarEl = modalEl.querySelector('.dmr-topbar');
    if (topbarEl && winEl) {
      let winDrag = null;
      topbarEl.addEventListener('pointerdown', (ev) => {
        if (winMaximized || host.innerWidth <= 768) return;
        if (ev.target.closest('button,select,input')) return;
        const rect = winEl.getBoundingClientRect();
        winDrag = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        topbarEl.setPointerCapture?.(ev.pointerId);
      });
      topbarEl.addEventListener('pointermove', (ev) => {
        if (!winDrag) return;
        const left = Math.max(0, Math.min(host.innerWidth - 160, ev.clientX - winDrag.offsetX));
        const top = Math.max(0, Math.min(host.innerHeight - 60, ev.clientY - winDrag.offsetY));
        winEl.style.left = `${Math.round(left)}px`;
        winEl.style.top = `${Math.round(top)}px`;
      });
      const endWinDrag = () => {
        if (!winDrag) return;
        winDrag = null;
        const rect = winEl.getBoundingClientRect();
        saveWinGeo({ left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) });
      };
      topbarEl.addEventListener('pointerup', endWinDrag);
      topbarEl.addEventListener('pointercancel', endWinDrag);
      if (host.ResizeObserver) {
        const ro = new host.ResizeObserver(() => {
          if (!modalEl.hidden && !winMinimized && !winMaximized) {
            drawMapCanvas();
          }
        });
        ro.observe(winEl);
        removers.push(() => ro.disconnect());
      }
    }

    modalEl.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button,[data-room-pick],[data-unit-focus]');
      if (!btn) return;

      if (btn.dataset.unitFocus) {
        const u = battleState.units.find(x => x.id === btn.dataset.unitFocus);
        const surface = getActiveSurface(getCurrentMap());
        if (u && surface) {
          const uxFt = Array.isArray(u.pos) ? u.pos[0] : 0;
          const uyFt = Array.isArray(u.pos) ? u.pos[1] : 0;
          const halfCell = 0.5 * getTacticalCellPx(surface);
          const wx = (surface.gridOffsetX || 0) + uxFt * (surface.pxPerFt || 15) + halfCell;
          const wy = (surface.gridOffsetY || 0) + uyFt * (surface.pxPerFt || 15) + halfCell;
          const canvas = modalEl.querySelector('.dmr-canvas');
          const rect = canvas?.getBoundingClientRect();
          if (rect) {
            view.offsetX = rect.width / 2 - wx * view.scale;
            view.offsetY = rect.height / 2 - wy * view.scale;
            hoveredUnitName = u.id;
            drawMapCanvas();
          }
        }
        return;
      }

      const act = btn.dataset.action;
      if (act === 'close') return closeModal();
      if (act === 'open-tokenizer') return openTokenMakerModal();
      if (act === 'ai-correct') return runAiMapCorrection(btn);
      if (act === 'toggle-auto-seed') {
        await saveChatState({ ...currentState, autoAiSeed: currentState.autoAiSeed === false }, false);
        return;
      }
      if (act === 'toggle-minimize') {
        winMinimized = !winMinimized;
        if (winMinimized) winMaximized = false;
        renderModal();
        if (!winMinimized) host.requestAnimationFrame(() => drawMapCanvas());
        return;
      }
      if (act === 'toggle-maximize') {
        winMaximized = !winMaximized;
        if (winMaximized) winMinimized = false;
        renderModal();
        host.requestAnimationFrame(() => drawMapCanvas());
        return;
      }
      if (act === 'toggle-softwall') {
        softWallMode = !softWallMode;
        return renderModal();
      }
      if (act === 'toggle-grid-snap') {
        gridSnapMode = !gridSnapMode;
        return renderModal();
      }
      if (act === 'battle-end-keep' || act === 'battle-wipe-enemies') {
        const wipeHostiles = act === 'battle-wipe-enemies';
        const nextUnits = battleState.units
          .filter(u => {
            if (wipeHostiles && u.faction === 'hostile') return false;
            if (!wipeHostiles && u.faction === 'hostile' && u.hp?.cur != null && u.hp.cur <= 0) return false;
            return true;
          })
          .map(u => {
            const copy = { ...u, next: false };
            delete copy._turnStartPos;
            return copy;
          });
        pendingMoveDraft = null;
        battleState = {
          ...battleState,
          active: false,
          ended: true,
          units: nextUnits,
        };
        const chatLen = Array.isArray(ctx()?.chat) ? ctx().chat.length : 0;
        await saveChatState({
          ...currentState,
          battleOverride: { chatLen, state: battleState },
        }, false);
        renderInitStrip();
        drawMapCanvas();
        return;
      }
      if (act === 'apply-move-draft' && pendingMoveDraft) {
        const d = pendingMoveDraft;
        const input = doc.querySelector('#send_textarea');
        if (input) {
          const msg = `【战术移动】${d.unitName} 移动 ${d.distFt}ft 至 (${d.targetXFt}ft, ${d.targetYFt}ft)${d.dash ? '（疾走 Dash）' : ''}${d.wallBlocked ? '（穿墙/越障）' : ''}`;
          input.value = input.value.trim() ? `${input.value.trim()}\n${msg}` : msg;
          input.dispatchEvent(new host.Event('input', { bubbles: true }));
          input.focus();
        }
        pendingMoveDraft = null;
        return renderInitStrip();
      }
      if (act === 'clear-move-draft') {
        pendingMoveDraft = null;
        syncBattleFromChat();
        return;
      }
      if (act === 'focus-party') return focusRoomOnCanvas(currentState.currentRoomId);
      if (act === 'fit-map') return fitMapToViewport();
      if (act === 'zoom-in' || act === 'zoom-out') {
        const canvas = modalEl.querySelector('.dmr-canvas');
        const rect = canvas.getBoundingClientRect();
        const factor = act === 'zoom-in' ? 1.25 : 0.8;
        const cx = rect.width / 2, cy = rect.height / 2;
        const nextScale = Math.max(0.05, Math.min(4, view.scale * factor));
        view.offsetX = cx - ((cx - view.offsetX) / view.scale) * nextScale;
        view.offsetY = cy - ((cy - view.offsetY) / view.scale) * nextScale;
        view.scale = nextScale;
        return drawMapCanvas();
      }
      if (act === 'toggle-svg') {
        await saveChatState({ ...currentState, svgViewMode: !currentState.svgViewMode }, false);
        fitMapToViewport();
        return;
      }
      if (act === 'toggle-side') {
        sideCollapsed = !sideCollapsed;
        renderModal();
        host.requestAnimationFrame(() => drawMapCanvas());
        return;
      }
      if (act === 'tool-move') {
        brushMode = false;
        wallToolMode = false;
        measureMode = false;
        view.measureDrag = null;
        return renderModal();
      }
      if (act === 'toggle-measure') {
        measureMode = !measureMode;
        if (measureMode) { brushMode = false; wallToolMode = false; }
        else view.measureDrag = null;
        return renderModal();
      }
      if (act === 'toggle-brush') {
        brushMode = !brushMode;
        if (brushMode) { wallToolMode = false; measureMode = false; view.measureDrag = null; }
        return renderModal();
      }
      if (act === 'toggle-wall-tool') {
        wallToolMode = !wallToolMode;
        if (wallToolMode) { brushMode = false; measureMode = false; view.measureDrag = null; }
        return renderModal();
      }
      if (act === 'toggle-enable') {
        if (!currentState.moduleId) return;
        await saveChatState({ ...currentState, enabled: !currentState.enabled });
        return;
      }
      if (act === 'toggle-dmview') {
        await saveChatState({ ...currentState, dmView: !currentState.dmView }, false);
        return;
      }
      if (act === 'toggle-spoilers') {
        dmSpoilersOpen = !dmSpoilersOpen;
        return renderSidePanel();
      }
      if (act === 'undo-progress') {
        await undoLastProgress();
        return;
      }
      if (act === 'reveal-all') {
        const map = getCurrentMap();
        if (!map) return;
        const stateHistory = nextStateHistory(`迷雾切换 ${map.title}`);
        const allRevealed = (currentState.exploredRooms || []).length >= map.rooms.length;
        const nextExplored = allRevealed ? (currentState.currentRoomId ? [currentState.currentRoomId] : []) : map.rooms.map(r => r.id);
        await saveChatState({ ...currentState, exploredRooms: nextExplored, stateHistory });
        return;
      }

      if (btn.dataset.dmrTab) {
        activeTab = btn.dataset.dmrTab;
        return renderModal();
      }
      if (btn.dataset.roomPick) {
        inspectedRoomId = btn.dataset.roomPick;
        activeTab = 'scene';
        renderModal();
        focusRoomOnCanvas(inspectedRoomId);
        return;
      }
      if (btn.dataset.jumpMap && btn.dataset.jumpRoom) {
        await movePartyToRoom(btn.dataset.jumpRoom, btn.dataset.jumpMap, btn.dataset.jumpChat === '1');
        return;
      }
      if (btn.dataset.moveRoom) {
        await movePartyToRoom(btn.dataset.moveRoom, null, false);
        return;
      }
      if (btn.dataset.moveChat) {
        await movePartyToRoom(btn.dataset.moveChat, null, true);
        return;
      }
      if (btn.dataset.revealRoom) {
        const stateHistory = nextStateHistory(`开雾 #${btn.dataset.revealRoom}`);
        const explored = new Set(currentState.exploredRooms || []);
        explored.add(btn.dataset.revealRoom);
        inspectedRoomId = btn.dataset.revealRoom;
        await saveChatState({ ...currentState, exploredRooms: [...explored], stateHistory });
        return;
      }
      if (btn.dataset.toggleExp) {
        await toggleRoomState(btn.dataset.toggleExp, 'exploredRooms');
        return;
      }
      if (btn.dataset.toggleClr) {
        await toggleRoomState(btn.dataset.toggleClr, 'clearedRooms');
        return;
      }
    });

    const searchInput = modalEl.querySelector('[data-dmr-search]');
    searchInput?.addEventListener('input', () => {
      populateCatalogSelect(searchInput.value);
    });

    const modSelect = modalEl.querySelector('[data-dmr-module]');
    modSelect?.addEventListener('change', () => {
      selectModuleById(modSelect.value);
    });

    const mapSelect = modalEl.querySelector('[data-dmr-map]');
    mapSelect?.addEventListener('change', async () => {
      if (!currentAdv) return;
      const nextMap = currentAdv.maps.find(m => m.id === mapSelect.value);
      if (!nextMap) return;
      const stateHistory = nextStateHistory(`切换场景 ${nextMap.title}`);
      const nextRoom = nextMap.rooms[0] || null;
      const explored = new Set(currentState.exploredRooms || []);
      if (nextRoom) explored.add(nextRoom.id);
      const tokenPos = { ...(currentState.tokenPos || {}) };
      if (nextRoom && nextRoom.cx != null && nextRoom.cy != null && !tokenPos[nextMap.id]) {
        tokenPos[nextMap.id] = { x: Math.round(nextRoom.cx), y: Math.round(nextRoom.cy) };
      }
      inspectedRoomId = nextRoom?.id || '';
      await saveChatState({
        ...currentState,
        currentMapId: nextMap.id,
        currentRoomId: nextRoom?.id || '',
        exploredRooms: [...explored],
        tokenPos,
        svgViewMode: false,
        stateHistory,
      });
      if (nextRoom) focusRoomOnCanvas(nextRoom.id);
      else fitMapToViewport();
    });

    const canvas = modalEl.querySelector('.dmr-canvas');
    canvas.addEventListener('pointerdown', async (ev) => {
      const map = getCurrentMap();
      const surface = getActiveSurface(map);
      const { x, y, sx, sy } = canvasCoordsToMap(ev.clientX, ev.clientY);

      if (measureMode && surface) {
        canvas.setPointerCapture(ev.pointerId);
        view.measureDrag = { active: true, x1: x, y1: y, x2: x, y2: y };
        drawMapCanvas();
        return;
      }

      // 0. Check Battle Unit Token (combat: only active u.next unit; exploration: friendly units; DM view: any)
      const hitUnit = findBattleUnitAtPoint(sx, sy, surface);
      if (hitUnit) {
        if (!canDragBattleUnit(hitUnit)) {
          const activeUnit = battleState.units.find(u => u.next);
          const statusEl = modalEl?.querySelector('[data-dmr-legend-status]');
          if (statusEl) {
            statusEl.textContent = battleState.active
              ? `当前为 ${activeUnit?.id || '其他单位'} 的回合，轮到 ${hitUnit.id} 时才可移动`
              : `${hitUnit.id} 当前不可移动`;
          }
          return;
        }
        canvas.setPointerCapture(ev.pointerId);
        const cellPx = getTacticalCellPx(surface);
        const pxPerFt = surface.pxPerFt || (cellPx / 5) || 15;
        const startPos = (battleState.active && Array.isArray(hitUnit._turnStartPos)) ? hitUnit._turnStartPos : hitUnit.pos;
        const sxFt = Array.isArray(startPos) ? startPos[0] : 0;
        const syFt = Array.isArray(startPos) ? startPos[1] : 0;
        const uxFt = Array.isArray(hitUnit.pos) ? hitUnit.pos[0] : 0;
        const uyFt = Array.isArray(hitUnit.pos) ? hitUnit.pos[1] : 0;
        const halfCell = 0.5 * cellPx;
        const swx = (surface.gridOffsetX || 0) + sxFt * pxPerFt + halfCell;
        const swy = (surface.gridOffsetY || 0) + syFt * pxPerFt + halfCell;
        const wx = (surface.gridOffsetX || 0) + uxFt * pxPerFt + halfCell;
        const wy = (surface.gridOffsetY || 0) + uyFt * pxPerFt + halfCell;
        view.unitDrag = {
          active: true,
          name: hitUnit.id,
          pointerId: ev.pointerId,
          startX: swx,
          startY: swy,
          curX: wx,
          curY: wy,
          downClientX: ev.clientX,
          downClientY: ev.clientY,
          speedFt: getMVUCharacterSpeed(hitUnit.id),
          wallBlocked: false,
          distFt: 0,
          dash: false,
          over: false,
        };
        canvas.style.cursor = 'grabbing';
        drawMapCanvas();
        return;
      }

      // 1 & 2. Check Draggable Player Token & Door Badge (allow dragging token even if overlapping a door, or clicking to toggle door)
      const doorHit = findDoorAtPoint(sx, sy, surface);
      const tokenHit = isHitPlayerToken(sx, sy, surface);
      if (tokenHit) {
        canvas.setPointerCapture(ev.pointerId);
        const pos = getTokenPosition(surface);
        view.tokenDrag = {
          active: true,
          pointerId: ev.pointerId,
          startX: pos.x,
          startY: pos.y,
          curX: pos.x,
          curY: pos.y,
          downClientX: ev.clientX,
          downClientY: ev.clientY,
          pendingDoorHit: doorHit || null,
          blocked: false,
          trail: [[Math.round(pos.x), Math.round(pos.y), Math.round(surface.gridSize * 2.8)]],
        };
        canvas.style.cursor = 'grabbing';
        drawMapCanvas();
        return;
      }

      if (doorHit) {
        const doorKey = `${surface.mapKey}:${doorHit.id}`;
        const nextDoors = { ...(currentState.doorStates || {}), [doorKey]: !doorHit.open };
        await saveChatState({ ...currentState, doorStates: nextDoors }, false);
        return;
      }

      // 3. Check custom wall drawing tool
      if (wallToolMode && surface) {
        canvas.setPointerCapture(ev.pointerId);
        view.wallDraw = {
          active: true,
          pointerId: ev.pointerId,
          x1: Math.round(x),
          y1: Math.round(y),
          x2: Math.round(x),
          y2: Math.round(y),
        };
        drawMapCanvas();
        return;
      }

      // 4. Default: pan canvas
      canvas.setPointerCapture(ev.pointerId);
      view.dragging = true;
      view.dragMoved = false;
      view.startX = ev.clientX - view.offsetX;
      view.startY = ev.clientY - view.offsetY;
    });

    canvas.addEventListener('pointermove', (ev) => {
      const map = getCurrentMap();
      const surface = getActiveSurface(map);
      const { x, y, sx, sy } = canvasCoordsToMap(ev.clientX, ev.clientY);

      if (view.unitDrag?.active && surface) {
        const cellPx = getTacticalCellPx(surface);
        const pxPerFt = surface.pxPerFt || (cellPx / 5) || 15;
        const rawTarget = gridSnapMode ? snapToGridCenter(x, y, surface) : { x, y };
        const bypassWalls = ev.altKey || softWallMode || currentState.dmView;
        const walls = surface.walls || [];
        // Smooth speed-limited stepping so fast cursor flicks walk steadily and stop cleanly at walls
        let aimX = rawTarget.x;
        let aimY = rawTarget.y;
        const dAim = Math.hypot(aimX - view.unitDrag.curX, aimY - view.unitDrag.curY);
        const maxStepPx = Math.max(14, cellPx * 0.75);
        if (!bypassWalls && dAim > maxStepPx) {
          aimX = view.unitDrag.curX + ((aimX - view.unitDrag.curX) / dAim) * maxStepPx;
          aimY = view.unitDrag.curY + ((aimY - view.unitDrag.curY) / dAim) * maxStepPx;
        }
        const clearancePx = Math.max(4, Math.min(8, cellPx * 0.12));
        const step = bypassWalls
          ? { x: rawTarget.x, y: rawTarget.y, blocked: false }
          : core.clampMoveByWalls(view.unitDrag.curX, view.unitDrag.curY, aimX, aimY, walls, clearancePx);
        const clampedX = Math.max(16, Math.min(surface.width - 16, step.x));
        const clampedY = Math.max(16, Math.min(surface.height - 16, step.y));
        view.unitDrag.curX = clampedX;
        view.unitDrag.curY = clampedY;
        view.unitDrag.wallBlocked = step.blocked;
        if (step.blocked) {
          const statusEl = modalEl?.querySelector('[data-dmr-legend-status]');
          if (statusEl) statusEl.textContent = '🚧 撞墙受阻：若棋子意外卡在墙外，可开「DM透视」或点顶部「👻 穿墙」/ 按住 Alt 拖出';
        }
        const distPx = Math.hypot(view.unitDrag.curX - view.unitDrag.startX, view.unitDrag.curY - view.unitDrag.startY);
        const distFt = Math.round((distPx / pxPerFt) / 5) * 5;
        view.unitDrag.distFt = distFt;
        view.unitDrag.dash = distFt > view.unitDrag.speedFt && distFt <= view.unitDrag.speedFt * 2;
        view.unitDrag.over = distFt > view.unitDrag.speedFt * 2;
        drawMapCanvas();
        return;
      }

      if (view.tokenDrag?.active && surface) {
        const cellPx = getTacticalCellPx(surface);
        const rawTarget = gridSnapMode ? snapToGridCenter(x, y, surface) : { x, y };
        const bypassWalls = ev.altKey || softWallMode || currentState.dmView;
        const walls = surface.walls || [];
        let aimX = rawTarget.x;
        let aimY = rawTarget.y;
        const dAim = Math.hypot(aimX - view.tokenDrag.curX, aimY - view.tokenDrag.curY);
        const maxStepPx = Math.max(14, cellPx * 0.75);
        if (!bypassWalls && dAim > maxStepPx) {
          aimX = view.tokenDrag.curX + ((aimX - view.tokenDrag.curX) / dAim) * maxStepPx;
          aimY = view.tokenDrag.curY + ((aimY - view.tokenDrag.curY) / dAim) * maxStepPx;
        }
        const clearancePx = Math.max(4, Math.min(8, cellPx * 0.12));
        const step = bypassWalls
          ? { x: rawTarget.x, y: rawTarget.y, blocked: false }
          : core.clampMoveByWalls(view.tokenDrag.curX, view.tokenDrag.curY, aimX, aimY, walls, clearancePx);
        view.tokenDrag.curX = Math.max(16, Math.min(surface.width - 16, step.x));
        view.tokenDrag.curY = Math.max(16, Math.min(surface.height - 16, step.y));
        view.tokenDrag.blocked = step.blocked;
        if (step.blocked) {
          const statusEl = modalEl?.querySelector('[data-dmr-legend-status]');
          if (statusEl) statusEl.textContent = '🚧 撞墙受阻：若棋子意外卡在墙外，可开「DM透视」或点顶部「👻 穿墙」/ 按住 Alt 拖出';
        }
        const lastTrail = view.tokenDrag.trail[view.tokenDrag.trail.length - 1];
        if (!lastTrail || Math.hypot(view.tokenDrag.curX - lastTrail[0], view.tokenDrag.curY - lastTrail[1]) > surface.gridSize * 0.75) {
          view.tokenDrag.trail.push([Math.round(view.tokenDrag.curX), Math.round(view.tokenDrag.curY), Math.round(surface.gridSize * 2.8)]);
        }
        drawMapCanvas();
        return;
      }

      if (view.wallDraw?.active) {
        view.wallDraw.x2 = Math.round(x);
        view.wallDraw.y2 = Math.round(y);
        drawMapCanvas();
        return;
      }

      if (view.measureDrag?.active) {
        view.measureDrag.x2 = x;
        view.measureDrag.y2 = y;
        drawMapCanvas();
        return;
      }

      if (view.dragging) {
        const nx = ev.clientX - view.startX;
        const ny = ev.clientY - view.startY;
        if (Math.hypot(nx - view.offsetX, ny - view.offsetY) > 4) view.dragMoved = true;
        view.offsetX = nx;
        view.offsetY = ny;
        drawMapCanvas();
        return;
      }

      const overUnit = findBattleUnitAtPoint(sx, sy, surface);
      const hun = overUnit?.id || '';
      const overToken = isHitPlayerToken(sx, sy, surface);
      const overDoor = findDoorAtPoint(sx, sy, surface);
      const overWall = wallToolMode ? findWallAtPoint(sx, sy, surface) : null;
      const hit = findRoomAtPoint(x, y, sx, sy);
      const hid = hit?.id || '';
      const hwid = overWall?.id || '';
      const hdid = overDoor?.id || '';
      canvas.style.cursor = measureMode
        ? 'crosshair'
        : overUnit
          ? (canDragBattleUnit(overUnit) ? 'grab' : 'not-allowed')
          : overToken
            ? 'grab'
            : overDoor
            ? 'pointer'
            : wallToolMode
              ? (hwid ? 'pointer' : 'crosshair')
              : hid
                ? 'pointer'
                : brushMode
                  ? 'crosshair'
                  : 'grab';
      if (hid !== view.hoveredRoomId || hwid !== view.hoveredWallId || hdid !== view.hoveredDoorId || overToken !== view.hoveredToken || hun !== hoveredUnitName) {
        view.hoveredRoomId = hid;
        view.hoveredWallId = hwid;
        view.hoveredDoorId = hdid;
        view.hoveredToken = overToken;
        hoveredUnitName = hun;
        drawMapCanvas();
      }
    });

    canvas.addEventListener('pointerup', async (ev) => {
      const map = getCurrentMap();
      const surface = getActiveSurface(map);

      if (view.measureDrag?.active) {
        view.measureDrag = null;
        drawMapCanvas();
        return;
      }

      if (view.unitDrag?.active && surface) {
        const pxPerFt = surface.pxPerFt || (surface.gridSize / 5) || 15;
        const offX = surface.gridOffsetX || 0;
        const offY = surface.gridOffsetY || 0;
        const drag = view.unitDrag;
        view.unitDrag = null;
        canvas.style.cursor = 'grab';
        const dragDistPx = Math.hypot(ev.clientX - (drag.downClientX ?? ev.clientX), ev.clientY - (drag.downClientY ?? ev.clientY));
        if (dragDistPx >= 5) {
          const gs = getTacticalCellPx(surface);
          const halfCell = 0.5 * gs;
          const bypassWalls = ev.altKey || softWallMode || currentState.dmView;
          const walls = surface.walls || [];
          let targetXFt;
          let targetYFt;
          if (gridSnapMode) {
            const baseCol = Math.max(0, Math.floor((drag.curX - offX) / gs));
            const baseRow = Math.max(0, Math.floor((drag.curY - offY) / gs));
            let chosenCol = null;
            let chosenRow = null;
            let bestDist = Infinity;
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const c = baseCol + dc;
                const r = baseRow + dr;
                if (c < 0 || r < 0) continue;
                const cx = offX + (c + 0.5) * gs;
                const cy = offY + (r + 0.5) * gs;
                if (cx < 16 || cx > surface.width - 16 || cy < 16 || cy > surface.height - 16) continue;
                if (!bypassWalls && core.clampMoveByWalls(drag.curX, drag.curY, cx, cy, walls, 2).blocked) continue;
                const d = Math.hypot(cx - drag.curX, cy - drag.curY);
                if (d < bestDist) {
                  bestDist = d;
                  chosenCol = c;
                  chosenRow = r;
                }
              }
            }
            if (chosenCol != null) {
              targetXFt = chosenCol * 5;
              targetYFt = chosenRow * 5;
            } else {
              targetXFt = Math.round(((drag.curX - offX - halfCell) / pxPerFt) * 10) / 10;
              targetYFt = Math.round(((drag.curY - offY - halfCell) / pxPerFt) * 10) / 10;
            }
          } else {
            targetXFt = Math.round(((drag.curX - offX - halfCell) / pxPerFt) * 10) / 10;
            targetYFt = Math.round(((drag.curY - offY - halfCell) / pxPerFt) * 10) / 10;
          }
          const unit = battleState.units.find(u => u.id === drag.name);
          if (unit) {
            unit.pos = [targetXFt, targetYFt];
            if (unit.faction === 'friendly' && !surface.isSvg) {
              const hitRoom = findRoomAtPoint(drag.curX, drag.curY);
              if (hitRoom && !hitRoom.isStoryNode) {
                const explored = new Set(currentState.exploredRooms || []);
                if (!explored.has(hitRoom.id)) {
                  explored.add(hitRoom.id);
                  const curReveals = [...(currentState.customReveals?.[surface.mapKey] || []), [Math.round(drag.curX), Math.round(drag.curY), Math.round(surface.gridSize * 3.0)]].slice(-120);
                  await saveChatState({
                    ...currentState,
                    exploredRooms: [...explored],
                    customReveals: { ...(currentState.customReveals || {}), [surface.mapKey]: curReveals },
                  }, false);
                }
              }
            }
          }
          pendingMoveDraft = {
            unitName: drag.name,
            targetXFt,
            targetYFt,
            distFt: drag.distFt,
            speedFt: drag.speedFt,
            dash: drag.dash,
            over: drag.over,
            wallBlocked: drag.wallBlocked,
          };
          renderInitStrip();
        }
        drawMapCanvas();
        return;
      }

      if (view.tokenDrag?.active && surface) {
        const dragDistPx = Math.hypot(ev.clientX - (view.tokenDrag.downClientX ?? ev.clientX), ev.clientY - (view.tokenDrag.downClientY ?? ev.clientY));
        const pendingDoor = view.tokenDrag.pendingDoorHit;
        const finalX = Math.round(view.tokenDrag.curX);
        const finalY = Math.round(view.tokenDrag.curY);
        const trail = view.tokenDrag.trail || [];
        view.tokenDrag = null;
        canvas.style.cursor = 'grab';

        if (pendingDoor && dragDistPx < 5) {
          const doorKey = `${surface.mapKey}:${pendingDoor.id}`;
          const nextDoors = { ...(currentState.doorStates || {}), [doorKey]: !pendingDoor.open };
          await saveChatState({ ...currentState, doorStates: nextDoors }, false);
          return;
        }

        const nextTokenPos = { ...(currentState.tokenPos || {}), [surface.mapKey]: { x: finalX, y: finalY } };
        const curReveals = [...(currentState.customReveals?.[surface.mapKey] || []), ...trail, [finalX, finalY, Math.round(surface.gridSize * 3.0)]].slice(-120);
        const nextReveals = { ...(currentState.customReveals || {}), [surface.mapKey]: curReveals };

        // Check if dropped inside a room trigger zone on an official map
        const hitRoom = !surface.isSvg ? findRoomAtPoint(finalX, finalY) : null;
        const explored = new Set(currentState.exploredRooms || []);
        let nextRoomId = currentState.currentRoomId;
        let syncWb = false;
        if (hitRoom && !hitRoom.isStoryNode) {
          if (!explored.has(hitRoom.id) || currentState.currentRoomId !== hitRoom.id) {
            syncWb = true;
          }
          explored.add(hitRoom.id);
          nextRoomId = hitRoom.id;
          inspectedRoomId = hitRoom.id;
        }
        await saveChatState({
          ...currentState,
          currentRoomId: nextRoomId,
          exploredRooms: [...explored],
          tokenPos: nextTokenPos,
          customReveals: nextReveals,
        }, syncWb);
        return;
      }

      if (view.wallDraw?.active && surface) {
        const { x1, y1, x2, y2 } = view.wallDraw;
        view.wallDraw = null;
        if (Math.hypot(x2 - x1, y2 - y1) >= 12) {
          const list = [...(currentState.customWalls?.[surface.mapKey] || []), {
            id: `cw-${Date.now()}`,
            x1, y1, x2, y2,
            kind: 'wall',
            blocksSight: true,
            blocksMove: true,
          }];
          await saveChatState({
            ...currentState,
            customWalls: { ...(currentState.customWalls || {}), [surface.mapKey]: list },
          }, false);
        } else {
          const { sx, sy } = canvasCoordsToMap(ev.clientX, ev.clientY);
          const hitWall = findWallAtPoint(sx, sy, surface);
          if (hitWall) {
            const curCustom = currentState.customWalls?.[surface.mapKey] || [];
            if (curCustom.some(w => w.id === hitWall.id)) {
              const nextCustom = curCustom.filter(w => w.id !== hitWall.id);
              await saveChatState({
                ...currentState,
                customWalls: { ...(currentState.customWalls || {}), [surface.mapKey]: nextCustom },
              }, false);
            } else {
              const delList = [...new Set([...(currentState.deletedWalls?.[surface.mapKey] || []), hitWall.id])];
              await saveChatState({
                ...currentState,
                deletedWalls: { ...(currentState.deletedWalls || {}), [surface.mapKey]: delList },
              }, false);
            }
          } else {
            drawMapCanvas();
          }
        }
        return;
      }

      if (!view.dragging) return;
      view.dragging = false;
      if (view.dragMoved) return;
      const { x, y, sx, sy } = canvasCoordsToMap(ev.clientX, ev.clientY);
      if (!map || !surface) return;

      if (brushMode) {
        const rad = Math.round((surface.gridSize || 150) * 1.35);
        const curList = [...(currentState.customReveals?.[surface.mapKey] || []), [Math.round(x), Math.round(y), rad]];
        await saveChatState({
          ...currentState,
          customReveals: { ...(currentState.customReveals || {}), [surface.mapKey]: curList.slice(-120) },
        }, false);
        return;
      }

      const hit = findRoomAtPoint(x, y, sx, sy);
      if (hit) {
        inspectedRoomId = hit.id;
        activeTab = 'scene';
        renderModal();
      }
    });

    canvas.addEventListener('dblclick', async (ev) => {
      const { x, y, sx, sy } = canvasCoordsToMap(ev.clientX, ev.clientY);
      const hit = findRoomAtPoint(x, y, sx, sy);
      if (hit) {
        await movePartyToRoom(hit.id, null, false);
      }
    });


    // Mobile two-finger pinch-to-zoom & pan (capture phase so single-finger drag stays untouched)
    const activeTouchPts = new Map();
    let pinchPrevDist = 0;
    let pinchPrevMid = null;
    canvas.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType !== 'touch') return;
      activeTouchPts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (activeTouchPts.size === 2) {
        view.unitDrag = null;
        view.measureDrag = null;
        if (view.drag) view.drag = null;
        if (view.pan) view.pan = null;
        const pts = Array.from(activeTouchPts.values());
        pinchPrevDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchPrevMid = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    }, true);
    canvas.addEventListener('pointermove', (ev) => {
      if (ev.pointerType !== 'touch' || !activeTouchPts.has(ev.pointerId)) return;
      activeTouchPts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (activeTouchPts.size >= 2 && pinchPrevMid) {
        const pts = Array.from(activeTouchPts.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const mid = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
        const rect = canvas.getBoundingClientRect();
        const cx = mid.x - rect.left;
        const cy = mid.y - rect.top;
        if (pinchPrevDist > 10 && dist > 10) {
          const factor = dist / pinchPrevDist;
          const nextScale = Math.max(0.05, Math.min(4.5, view.scale * factor));
          view.offsetX = cx - ((cx - view.offsetX) * nextScale / view.scale);
          view.offsetY = cy - ((cy - view.offsetY) * nextScale / view.scale);
          view.scale = nextScale;
        }
        view.offsetX += (mid.x - pinchPrevMid.x);
        view.offsetY += (mid.y - pinchPrevMid.y);
        pinchPrevDist = dist;
        pinchPrevMid = mid;
        drawMapCanvas();
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    }, true);
    const endTouchPinch = (ev) => {
      if (ev.pointerType !== 'touch') return;
      activeTouchPts.delete(ev.pointerId);
      if (activeTouchPts.size < 2) {
        pinchPrevDist = 0;
        pinchPrevMid = null;
      }
    };
    canvas.addEventListener('pointerup', endTouchPinch, true);
    canvas.addEventListener('pointercancel', endTouchPinch, true);

    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const factor = ev.deltaY < 0 ? 1.15 : 0.87;
      const nextScale = Math.max(0.05, Math.min(4.5, view.scale * factor));
      view.offsetX = cx - ((cx - view.offsetX) / view.scale) * nextScale;
      view.offsetY = cy - ((cy - view.offsetY) / view.scale) * nextScale;
      view.scale = nextScale;
      drawMapCanvas();
    }, { passive: false });
  }

  /**
   * Provides tactical map context to the inline `<battle>` panel (`dnnd-battle-panel`),
   * bridging Official High-Res Module Maps and LLM Dynamic SVG Tactical Maps!
   */
  function getBattleMapContext(rawBattleText = '', battleCenterFt = { x: 25, y: 25 }) {
    // 1. Prioritize Official Module Scene Map whenever active (and not explicitly toggled to SVG mode)
    const map = getCurrentMap();
    if (currentState?.enabled && currentAdv && map && !currentState.svgViewMode && map.imageUrl && map.mapKind !== 'overworld') {
      const curRoom = map.rooms.find(r => r.id === currentState.currentRoomId) || map.rooms[0] || null;
      const surface = getActiveSurface(map);
      const tokenPx = getTokenPosition(surface);
      const gridPx = getTacticalCellPx(surface);
      const pxPerFt = surface.pxPerFt || (gridPx / 5);
      const mapW = map.width || surface.width || 2048;
      const mapH = map.height || surface.height || 1536;
      const mapWidthFt = Math.max(25, Math.round((mapW / pxPerFt) / 5) * 5);
      const mapHeightFt = Math.max(25, Math.round((mapH / pxPerFt) / 5) * 5);
      const anchorPx = { x: 0, y: 0 };
      const centerFt = { x: 0, y: 0 };

      // Convert surface walls from map pixels into absolute battle feet coordinates (top-left = 0,0)
      const wallsFt = (surface.walls || []).map(w => ({
        ...w,
        x1: w.x1 / pxPerFt,
        y1: w.y1 / pxPerFt,
        x2: w.x2 / pxPerFt,
        y2: w.y2 / pxPerFt,
      }));

      const tokenFt = (tokenPx && Number.isFinite(tokenPx.x) && Number.isFinite(tokenPx.y))
        ? {
            x: Math.max(0, Math.min(mapWidthFt - 5, Math.round((tokenPx.x / pxPerFt - 2.5) / 5) * 5)),
            y: Math.max(0, Math.min(mapHeightFt - 5, Math.round((tokenPx.y / pxPerFt - 2.5) / 5) * 5)),
          }
        : null;

      const preset = core.matchOfficialMapPreset ? core.matchOfficialMapPreset(map.imageUrl) : null;
      return {
        mode: 'official',
        source: 'module-official-map',
        mapId: map.id,
        mapTitle: map.title,
        roomId: curRoom?.id || '',
        roomName: curRoom?.name || map.title,
        imageUrl: map.imageUrl,
        gridPx,
        pxPerFt,
        mapWidthFt,
        mapHeightFt,
        anchorPx,
        tokenPx,
        tokenFt,
        centerFt,
        wallsFt,
        entryPointFt: preset?.entryPointFt || null,
        excludedZones: preset?.excludedZones || [],
        terrainZones: preset?.terrainZones || [],
        feetPerPrintedSquare: preset?.feetPerPrintedSquare || 5,
        requiresFog: surface.requiresFog,
      };
    }

    // 2. Check if the <battle> block itself contains LLM SVG Tactical Map directives (@map/@wall/@poly/@path/@prop or <svg>)
    const parsedSvg = core.parseTacticalMapDirectives(rawBattleText || '');
    if (parsedSvg) {
      const compiled = core.compileSvgTacticalMap(parsedSvg, 8);
      return {
        mode: 'svg',
        source: 'llm-battle-directives',
        title: compiled.title,
        svgMarkup: compiled.svgMarkup,
        dataUri: compiled.dataUri,
        widthFt: compiled.widthFt,
        heightFt: compiled.heightFt,
        cols: compiled.cols,
        rows: compiled.rows,
        wallsFt: compiled.wallsFt,
        props: compiled.props,
      };
    }

    // 3. Fallback: Preset SVG Tactical Map for story/overworld encounters (e.g. #00e 地精伏击)
    if (currentState?.enabled && currentAdv && map) {
      const curRoom = map.rooms.find(r => r.id === currentState.currentRoomId) || map.rooms[0] || null;
      const presetSpec = core.getPresetSvgMapForNode(curRoom, map);
      if (presetSpec) {
        const compiled = core.compileSvgTacticalMap(presetSpec, 8);
        return {
          mode: 'svg',
          source: 'module-preset-svg',
          title: compiled.title,
          svgMarkup: compiled.svgMarkup,
          dataUri: compiled.dataUri,
          widthFt: compiled.widthFt,
          heightFt: compiled.heightFt,
          cols: compiled.cols,
          rows: compiled.rows,
          wallsFt: compiled.wallsFt,
          props: compiled.props,
        };
      }
    }

    return null;
  }

  async function syncBattleUnitPosition(unitId, posFt, battleCenterFt = { x: 25, y: 25 }) {
    const map = getCurrentMap();
    if (!currentState?.enabled || !map) return;
    const surface = getActiveSurface(map);
    if (!surface) return;
    const curRoom = map.rooms.find(r => r.id === currentState.currentRoomId) || map.rooms[0];
    if (!surface.isSvg) {
      const pxPerFt = surface.pxPerFt || (surface.gridSize / 5) || 14.4;
      const nx = Math.round((surface.gridOffsetX || 0) + ((posFt[0] || 0) + 2.5) * pxPerFt);
      const ny = Math.round((surface.gridOffsetY || 0) + ((posFt[1] || 0) + 2.5) * pxPerFt);
      const nextTokenPos = { ...(currentState.tokenPos || {}), [surface.mapKey]: { x: nx, y: ny } };
      await saveChatState({ ...currentState, tokenPos: nextTokenPos }, false);
    }
  }

  function canDragBattleUnit(unit) {
    if (!unit) return false;
    if (currentState.dmView) return true;
    if (unit.faction !== 'friendly') return false;
    if (battleState.active) return !!unit.next;
    return true;
  }

  function syncBattleFromChat() {
    if (disposed) return battleState;
    const c = ctx();
    const chat = Array.isArray(c?.chat) ? c.chat : [];
    const map = getCurrentMap();
    const surface = getActiveSurface(map);
    const mapCtx = {
      rooms: map?.rooms || [],
      pxPerFt: surface?.pxPerFt || 15,
      legacyPxPerFt: (map?.grid?.size || map?.gridSize || 72) / 5,
      widthPx: surface?.width || map?.width || 0,
      heightPx: surface?.height || map?.height || 0,
      offsetX: surface?.gridOffsetX || 0,
      offsetY: surface?.gridOffsetY || 0,
      walls: surface?.walls || [],
      curRoomId: currentState.currentRoomId || '',
      isOverworld: map?.mapKind === 'overworld' || !!map?.rooms.find(r => r.id === currentState.currentRoomId)?.isStoryNode,
    };
    const previousTerrain = battleState.svgRawBlock;
    const ov = currentState?.battleOverride;
    if (ov && ov.chatLen <= chat.length && ov.state) {
      battleState = core.compileBattleTimeline(chat.slice(ov.chatLen), mapCtx, ov.state);
    } else {
      battleState = core.compileBattleTimeline(chat, mapCtx);
      if (!battleState.active && !battleState.ended && !battleState.units.length && map?.id && currentState?.aiSeededMaps?.[map.id]?.units?.length) {
        battleState = {
          active: true,
          round: 1,
          units: currentState.aiSeededMaps[map.id].units,
          svgRawBlock: '',
          lastDeltaCount: 0,
        };
      }
      if (!battleState.active && !battleState.ended && !battleState.units.length && cachedPartyChars.length && surface) {
        const pxPerFt = surface.pxPerFt || 15;
        const ox = surface.gridOffsetX || 0;
        const oy = surface.gridOffsetY || 0;
        const tPos = getTokenPosition(surface);
        const snap5 = (v) => Math.round((Number(v) || 0) / 5) * 5;
        const baseX = Math.max(0, snap5((tPos.x - ox) / pxPerFt));
        const baseY = Math.max(0, snap5((tPos.y - oy) / pxPerFt));
        battleState = {
          active: true,
          round: 1,
          units: cachedPartyChars.map((p, idx) => ({
            id: p.id,
            charId: p.charId,
            att: 0,
            faction: 'friendly',
            init: 0,
            hp: p.hp,
            pos: [baseX + (idx % 3) * 5, baseY + Math.floor(idx / 3) * 5],
            status: [],
            next: p.isActive || idx === 0,
            _partyDefault: true,
          })),
          svgRawBlock: '',
          lastDeltaCount: 0,
        };
      }
    }
    if (mapCtx.isOverworld && battleState.svgRawBlock && battleState.svgRawBlock !== previousTerrain) {
      currentState.svgViewMode = true;
    }
    for (const u of battleState.units || []) {
      if (battleState.active) {
        if (!Array.isArray(u._turnStartPos) && Array.isArray(u.pos)) {
          u._turnStartPos = [...u.pos];
        }
      } else {
        delete u._turnStartPos;
      }
    }
    if (modalEl && !modalEl.hidden) {
      renderModal();
    }
    return battleState;
  }

  function captureMapSnapshotDataUrl() {
    const canvas = modalEl?.querySelector('.dmr-canvas');
    if (!canvas || !canvas.width || !canvas.height) return '';
    try {
      const maxW = 1280;
      const scale = canvas.width > maxW ? (maxW / canvas.width) : 1;
      if (scale === 1) return canvas.toDataURL('image/jpeg', 0.82);
      const tmp = doc.createElement('canvas');
      tmp.width = Math.round(canvas.width * scale);
      tmp.height = Math.round(canvas.height * scale);
      const tc = tmp.getContext('2d');
      tc.drawImage(canvas, 0, 0, tmp.width, tmp.height);
      return tmp.toDataURL('image/jpeg', 0.82);
    } catch {
      return '';
    }
  }

  function captureDmUnfoggedSnapshotDataUrl(map, surface) {
    if (!view.img || !surface) return captureMapSnapshotDataUrl();
    try {
      const mw = surface.width || view.img.naturalWidth || 2048;
      const mh = surface.height || view.img.naturalHeight || 1536;
      const scale = Math.min(1, 1280 / mw);
      const tmp = doc.createElement('canvas');
      tmp.width = Math.max(200, Math.round(mw * scale));
      tmp.height = Math.max(150, Math.round(mh * scale));
      const tc = tmp.getContext('2d');
      tc.drawImage(view.img, 0, 0, tmp.width, tmp.height);
      tc.font = '700 12px "Microsoft YaHei", sans-serif';
      tc.textAlign = 'center';
      tc.textBaseline = 'middle';
      for (const r of map?.rooms || []) {
        if (r.isStoryNode || r.cx == null || r.cy == null) continue;
        const rx = Math.round(r.cx * scale);
        const ry = Math.round(r.cy * scale);
        const label = String(r.name || r.id).slice(0, 14);
        const tw = tc.measureText(label).width + 10;
        tc.fillStyle = 'rgba(13,15,20,.82)';
        tc.fillRect(rx - tw / 2, ry - 9, tw, 18);
        tc.fillStyle = '#f3d285';
        tc.fillText(label, rx, ry);
      }
      return tmp.toDataURL('image/jpeg', 0.80);
    } catch {
      return captureMapSnapshotDataUrl();
    }
  }

  function collectPartyMembersForSeed() {
    if (cachedPartyChars.length) {
      return cachedPartyChars.map(p => ({ id: p.id, charId: p.charId, hp: p.hp }));
    }
    const out = [];
    try {
      const c = ctx();
      const vars = c?.variables || c?.chatMetadata?.variables || {};
      const mvu = host.Mvu?.getMvuData?.({ type: 'chat' }) || vars?.stat_data || vars?.mvu || null;
      const chars = mvu?.角色列表 || mvu?.characters || mvu?.队伍 || mvu?.party || null;
      if (chars && typeof chars === 'object') {
        for (const [k, v] of Object.entries(chars)) {
          if (!v || typeof v !== 'object') continue;
          const name = String(v.姓名 || v.name || k).trim();
          const cur = Number(v.生命值?.当前 ?? v.hp?.cur ?? v.hp ?? 12) || 12;
          const max = Math.max(1, Number(v.生命值?.上限 ?? v.hp?.max ?? cur) || cur);
          if (name) out.push({ id: name, charId: k, hp: { cur, max } });
        }
      }
      if (!out.length && c?.name1) out.push({ id: String(c.name1), hp: { cur: 12, max: 12 } });
    } catch {}
    return out;
  }

  const seedingMapIds = new Set();
  async function maybeAutoSeedMap(map, surface) {
    if (disposed || !currentAdv || !map || !surface) return;
    if (!currentState?.enabled || currentState.autoAiSeed === false) return;
    if (map.requiresFog === false || surface.isSvg) return;
    if (currentState.aiSeededMaps?.[map.id]?.units?.length) return;
    if (seedingMapIds.has(map.id)) return;
    seedingMapIds.add(map.id);

    const statusEl = modalEl?.querySelector('[data-dmr-legend-status]');
    const prevStatus = statusEl?.textContent || '';
    if (statusEl) statusEl.textContent = `⏳ 正在为《${map.title}》预布置初始站位…`;

    const partyMembers = collectPartyMembersForSeed();
    const monsterBank = sync.getMonsterBankObject?.() || {};
    let seededUnits = [];
    let usedAi = false;

    try {
      const pxPerFt = surface.pxPerFt || 15;
      const ox = surface.gridOffsetX || 0;
      const oy = surface.gridOffsetY || 0;
      const wFt = Math.round(((surface.width - ox) / pxPerFt) / 5) * 5;
      const hFt = Math.round(((surface.height - oy) / pxPerFt) / 5) * 5;
      const roomsPayload = (map.rooms || [])
        .filter(r => !r.isStoryNode && r.cx != null && r.cy != null)
        .map(r => ({
          id: r.id,
          name: r.name,
          posFt: [Math.round(((r.cx - ox) / pxPerFt) / 5) * 5, Math.round(((r.cy - oy) / pxPerFt) / 5) * 5],
          creatures: (r.refs?.creatures || []).map(c => `${c.name} x${c.count || 1}`),
        }));

      const sys = `你是 D&D 2024 模组地图初始站位预置助手。你会收到一张无迷雾的完整 DM 地图（含房间标号）、房间与原版怪物清单以及玩家队伍成员。
请提前把玩家队伍放在入口/当前房间合理位置，把各房间的原版敌人放在各自房间合理地形位置（门口、掩体后等）。
只输出 JSON：
{
  "currentRoomId": "${currentState.currentRoomId || roomsPayload[0]?.id || ''}",
  "units": [
    { "id": "单位名", "att": 0, "hp": "12/12", "pos": [xFt, yFt], "roomId": "房间id", "next": true }
  ],
  "reason": "预置说明"
}
注意：att 0=玩家/友方, 2=敌对；pos 为 5ft 倍数且在 0~${wFt - 5}, 0~${hFt - 5} 内；每个单位必须带 roomId。`;

      const usr = `队伍：${JSON.stringify(partyMembers)}\n房间与遭遇：${JSON.stringify(roomsPayload)}`;
      const dmImg = captureDmUnfoggedSnapshotDataUrl(map, surface);
      const raw = await callCurrentTavernAI(sys, usr, dmImg);
      const parsed = core.parseAiCorrectionResult(raw, map, surface);
      if (parsed.units?.length) {
        const rawList = (JSON.parse((raw.match(/```(?:json)?\s*([\s\S]*?)```/i) || raw.match(/(\{[\s\S]*\})/))?.[1] || '{}').units) || [];
        seededUnits = parsed.units.map((u, idx) => ({
          ...u,
          roomId: String(rawList[idx]?.roomId || currentState.currentRoomId || ''),
          _seeded: true,
        }));
        usedAi = true;
      }
    } catch (err) {
      console.warn('[DND Module Runner] Auto-seed AI fallback to local:', err);
    }

    if (!seededUnits.length) {
      seededUnits = core.buildLocalMapSeedUnits(map, surface, partyMembers, monsterBank, currentState.currentRoomId);
    }

    if (!disposed && seededUnits.length) {
      const nextSeeded = {
        ...(currentState.aiSeededMaps || {}),
        [map.id]: { at: Date.now(), units: seededUnits, mode: usedAi ? 'ai' : 'local' },
      };
      await saveChatState({ ...currentState, aiSeededMaps: nextSeeded }, true);
      syncBattleFromChat();
      if (statusEl) {
        statusEl.textContent = usedAi
          ? `🤖 已为《${map.title}》AI 预置 ${seededUnits.length} 个单位初始站位`
          : `🤖 已为《${map.title}》本地预置 ${seededUnits.length} 个单位初始站位`;
      }
    } else if (statusEl) {
      statusEl.textContent = prevStatus;
    }
    seedingMapIds.delete(map.id);
  }

  function openTokenMakerModal(defaultName = '') {
    const existing = doc.getElementById('dmr-tokenizer-modal');
    if (existing) existing.remove();

    const leader = getPartyLeaderInfo();
    const partyNames = [...new Set([
      defaultName,
      leader?.name,
      ...collectPartyMembersForSeed().map(p => p.id),
      ...(battleState.units || []).map(u => u.id),
    ].filter(Boolean))];

    const RING_PRESETS = [
      { id: 'gold', label: '经典暗金', color: '#d4a64a', inner: '#7a5418' },
      { id: 'emerald', label: '翡翠游侠', color: '#34a867', inner: '#144d2d' },
      { id: 'crimson', label: '绯红战意', color: '#c94242', inner: '#5c1818' },
      { id: 'arcane', label: '奥术秘紫', color: '#8b5cf6', inner: '#3b1d7a' },
      { id: 'silver', label: '白银圣武', color: '#cbd5e1', inner: '#475569' },
      { id: 'obsidian', label: '黑曜暗影', color: '#475569', inner: '#0f172a' },
    ];

    const overlay = doc.createElement('div');
    overlay.id = 'dmr-tokenizer-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10090;display:flex;align-items:center;justify-content:center;background:rgba(6,8,12,.72);backdrop-filter:blur(6px);font:13px/1.5 "Inter","Microsoft YaHei",sans-serif;color:#e6e8ee;';
    overlay.innerHTML = `
      <div style="width:min(560px,94vw);background:#12151e;border:1px solid rgba(255,255,255,.15);border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.85);overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#181c27;border-bottom:1px solid rgba(255,255,255,.08);">
          <strong style="font-size:14px;color:#f3d285;">🎨 FVTT Tokenizer 速制 Token（保存至角色头像库）</strong>
          <button type="button" data-tk-close class="dmr-btn">✕ 关闭</button>
        </div>
        <div style="display:grid;grid-template-columns:250px 1fr;gap:14px;padding:14px;align-items:start;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
            <canvas data-tk-canvas width="240" height="240" style="width:240px;height:240px;border-radius:12px;background:repeating-conic-gradient(#1e222e 0% 25%, #161922 0% 50%) 50%/16px 16px;cursor:grab;border:1px solid rgba(255,255,255,.1);"></canvas>
            <div style="font-size:11px;color:#9ca3af;">画布内拖拽平移 · 滚轮缩放构图</div>
            <div style="display:flex;gap:6px;width:100%;">
              <label style="flex:1;text-align:center;" class="dmr-btn dmr-btn-primary">
                📁 上传图片
                <input type="file" accept="image/*" data-tk-file style="display:none;">
              </label>
              <button type="button" class="dmr-btn" data-tk-load-cur>导入当前头像</button>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div>
              <div style="font-size:11.5px;color:#9ca3af;margin-bottom:4px;">绑定角色名（存入 Portrait Vault）</div>
              <div style="display:flex;gap:6px;">
                <input type="text" data-tk-name class="dmr-input" style="flex:1;" value="${escapeHtml(partyNames[0] || '主角')}" placeholder="输入角色名...">
                <select data-tk-pick class="dmr-select" style="max-width:110px;">
                  <option value="">快速选择</option>
                  ${partyNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div>
              <div style="font-size:11.5px;color:#9ca3af;margin-bottom:4px;">环形边框预设（Ring）</div>
              <div style="display:flex;flex-wrap:wrap;gap:5px;">
                ${RING_PRESETS.map((p, i) => `<button type="button" class="dmr-btn" data-tk-ring="${p.id}" data-active="${i === 0}" style="padding:4px 8px;font-size:11.5px;border-color:${p.color};">${p.label}</button>`).join('')}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:center;">
              <label style="font-size:11.5px;color:#cbd5e1;">缩放 <input type="range" data-tk-zoom min="0.4" max="3.5" step="0.05" value="1" style="width:100%;"></label>
              <label style="font-size:11.5px;color:#cbd5e1;">边框粗细 <input type="range" data-tk-width min="0" max="26" step="1" value="14" style="width:100%;"></label>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <label style="font-size:11.5px;color:#cbd5e1;display:flex;align-items:center;gap:5px;">边框色 <input type="color" data-tk-color value="#d4a64a"></label>
              <label style="font-size:11.5px;color:#cbd5e1;display:flex;align-items:center;gap:5px;">底色
                <select data-tk-bg class="dmr-select" style="padding:3px 6px;">
                  <option value="transparent">透明</option>
                  <option value="#141720" selected>深炭黑</option>
                  <option value="#2a1f12">暗古铜</option>
                  <option value="#112218">深林绿</option>
                </select>
              </label>
            </div>
            <div data-tk-status style="font-size:11.5px;color:#9ca3af;min-height:18px;"></div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
              <button type="button" class="dmr-btn" data-tk-close>取消</button>
              <button type="button" class="dmr-btn dmr-btn-primary" data-tk-save>💾 保存至角色头像库</button>
            </div>
          </div>
        </div>
      </div>
    `;
    doc.body.appendChild(overlay);

    const tkCanvas = overlay.querySelector('[data-tk-canvas]');
    const nameInput = overlay.querySelector('[data-tk-name]');
    const pickSel = overlay.querySelector('[data-tk-pick]');
    const fileInput = overlay.querySelector('[data-tk-file]');
    const zoomInput = overlay.querySelector('[data-tk-zoom]');
    const widthInput = overlay.querySelector('[data-tk-width]');
    const colorInput = overlay.querySelector('[data-tk-color]');
    const bgSel = overlay.querySelector('[data-tk-bg]');
    const statusEl = overlay.querySelector('[data-tk-status]');

    const state = { img: null, ox: 0, oy: 0, zoom: 1, ringColor: '#d4a64a', ringInner: '#7a5418', ringWidth: 14, bg: '#141720', drag: null };

    function renderTokenToCanvas(targetCanvas, size = 240) {
      const ctx2d = targetCanvas.getContext('2d');
      ctx2d.clearRect(0, 0, size, size);
      const cx = size / 2, cy = size / 2;
      const rw = (state.ringWidth / 240) * size;
      const outerR = size / 2 - 2;
      const innerR = Math.max(10, outerR - rw);

      // 1. Clip inner circle for background & portrait
      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, innerR + 1, 0, Math.PI * 2);
      ctx2d.clip();
      if (state.bg !== 'transparent') {
        ctx2d.fillStyle = state.bg;
        ctx2d.fillRect(0, 0, size, size);
      }
      if (state.img && state.img.complete && state.img.naturalWidth > 0) {
        const iw = state.img.naturalWidth, ih = state.img.naturalHeight;
        const baseScale = Math.max((innerR * 2) / iw, (innerR * 2) / ih);
        const s = baseScale * state.zoom;
        const dw = iw * s, dh = ih * s;
        const dx = cx - dw / 2 + (state.ox / 240) * size;
        const dy = cy - dh / 2 + (state.oy / 240) * size;
        ctx2d.drawImage(state.img, dx, dy, dw, dh);
      } else {
        ctx2d.fillStyle = '#9ca3af';
        ctx2d.font = `700 ${Math.round(size * 0.12)}px "Microsoft YaHei", sans-serif`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('请上传图片', cx, cy);
      }
      ctx2d.restore();

      // 2. Render FVTT-style metallic/beveled ring
      if (rw > 0.5) {
        const grad = ctx2d.createLinearGradient(0, 0, size, size);
        grad.addColorStop(0, '#fff7dc');
        grad.addColorStop(0.25, state.ringColor);
        grad.addColorStop(0.65, state.ringInner);
        grad.addColorStop(1, state.ringColor);

        ctx2d.save();
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, outerR - rw / 2, 0, Math.PI * 2);
        ctx2d.strokeStyle = grad;
        ctx2d.lineWidth = rw;
        ctx2d.stroke();

        // Outer & inner crisp rim lines
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx2d.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx2d.lineWidth = 1.5;
        ctx2d.stroke();

        ctx2d.beginPath();
        ctx2d.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx2d.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx2d.lineWidth = 1.2;
        ctx2d.stroke();
        ctx2d.restore();
      }
    }

    function loadImgUrl(url) {
      if (!url) return;
      const im = new host.Image();
      if (!url.startsWith('data:')) im.crossOrigin = 'anonymous';
      im.onload = () => { state.img = im; state.ox = 0; state.oy = 0; state.zoom = 1; zoomInput.value = '1'; renderTokenToCanvas(tkCanvas, 240); };
      im.src = url;
    }

    const curUrl = getPortraitAvatarForUnit(nameInput.value.trim());
    if (curUrl) loadImgUrl(curUrl);
    else renderTokenToCanvas(tkCanvas, 240);

    overlay.addEventListener('click', async (ev) => {
      if (ev.target === overlay || ev.target.closest('[data-tk-close]')) { overlay.remove(); return; }
      const ringBtn = ev.target.closest('[data-tk-ring]');
      if (ringBtn) {
        const preset = RING_PRESETS.find(r => r.id === ringBtn.dataset.tkRing);
        if (preset) {
          state.ringColor = preset.color;
          state.ringInner = preset.inner;
          colorInput.value = preset.color;
          for (const b of overlay.querySelectorAll('[data-tk-ring]')) b.dataset.active = String(b === ringBtn);
          renderTokenToCanvas(tkCanvas, 240);
        }
        return;
      }
      if (ev.target.closest('[data-tk-load-cur]')) {
        const u = getPortraitAvatarForUnit(nameInput.value.trim());
        if (u) loadImgUrl(u);
        else statusEl.textContent = '未找到该角色当前头像，请上传图片。';
        return;
      }
      if (ev.target.closest('[data-tk-save]')) {
        const targetName = nameInput.value.trim();
        if (!targetName) { statusEl.textContent = '请输入角色名称'; return; }
        const outCanvas = doc.createElement('canvas');
        outCanvas.width = 256;
        outCanvas.height = 256;
        renderTokenToCanvas(outCanvas, 256);
        try {
          const dataUrl = outCanvas.toDataURL('image/png');
          const vault = host.__dndPortraitVault || window.__dndPortraitVault;
          const saveFn = vault?.setToken ? vault.setToken.bind(vault) : vault?.set?.bind(vault);
          if (!saveFn) throw Error('未检测到角色头像库 (__dndPortraitVault.setToken)');
          const pc = cachedPartyChars.find(p => p.id === targetName || p.charId === targetName);
          await saveFn(pc?.charId || targetName, targetName, dataUrl);
          tokenAvatarImgCache.delete(dataUrl);
          renderInitStrip();
          drawMapCanvas();
          statusEl.style.color = '#6be094';
          statusEl.textContent = `✅ 已保存「${targetName}」专用 Token（不覆盖状态栏头像）！`;
          setTimeout(() => overlay.remove(), 650);
        } catch (err) {
          statusEl.style.color = '#f87171';
          statusEl.textContent = `保存失败：${err?.message || err}`;
        }
      }
    });

    pickSel.addEventListener('change', () => {
      if (pickSel.value) {
        nameInput.value = pickSel.value;
        const u = getPortraitAvatarForUnit(pickSel.value);
        if (u) loadImgUrl(u);
      }
    });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => loadImgUrl(String(reader.result || ''));
      reader.readAsDataURL(f);
    });
    zoomInput.addEventListener('input', () => { state.zoom = Number(zoomInput.value) || 1; renderTokenToCanvas(tkCanvas, 240); });
    widthInput.addEventListener('input', () => { state.ringWidth = Number(widthInput.value) || 0; renderTokenToCanvas(tkCanvas, 240); });
    colorInput.addEventListener('input', () => { state.ringColor = colorInput.value; state.ringInner = '#1f2937'; renderTokenToCanvas(tkCanvas, 240); });
    bgSel.addEventListener('change', () => { state.bg = bgSel.value; renderTokenToCanvas(tkCanvas, 240); });

    tkCanvas.addEventListener('pointerdown', (ev) => {
      tkCanvas.setPointerCapture(ev.pointerId);
      state.drag = { x: ev.clientX - state.ox, y: ev.clientY - state.oy };
      tkCanvas.style.cursor = 'grabbing';
    });
    tkCanvas.addEventListener('pointermove', (ev) => {
      if (!state.drag) return;
      state.ox = ev.clientX - state.drag.x;
      state.oy = ev.clientY - state.drag.y;
      renderTokenToCanvas(tkCanvas, 240);
    });
    tkCanvas.addEventListener('pointerup', () => { state.drag = null; tkCanvas.style.cursor = 'grab'; });
    tkCanvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      state.zoom = Math.max(0.4, Math.min(3.5, state.zoom + (ev.deltaY < 0 ? 0.1 : -0.1)));
      zoomInput.value = String(state.zoom.toFixed(2));
      renderTokenToCanvas(tkCanvas, 240);
    }, { passive: false });
  }

  async function callCurrentTavernAI(systemPrompt, userText, imageDataUrl) {
    const c = ctx();
    const s = c?.chatCompletionSettings || {};
    const service = c?.ChatCompletionService;
    if (service?.processRequest && imageDataUrl) {
      try {
        const model = c?.getChatCompletionModel?.(s) || s.model || '';
        const messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ];
        const res = await service.processRequest({
          messages,
          stream: false,
          max_tokens: 2048,
          model,
          chat_completion_source: s.chat_completion_source || 'custom',
          custom_url: s.custom_url,
          reverse_proxy: s.reverse_proxy,
          proxy_password: s.proxy_password,
        }, {}, true);
        const text = typeof res === 'string' ? res : (res?.content || res?.choices?.[0]?.message?.content || '');
        if (text && text.trim()) return text;
      } catch (err) {
        console.warn('[DND Module Runner] ChatCompletionService vision fallback to generateRaw:', err);
      }
    }
    const genRaw = api('generateRaw', true);
    if (!genRaw) throw Error('当前酒馆未提供 ChatCompletionService 或 generateRaw 接口');
    return await genRaw({
      generation_id: `dnd-map-ai-fix-${Date.now()}`,
      should_stream: false,
      should_silence: true,
      max_chat_history: 0,
      ordered_prompts: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    });
  }

  async function runAiMapCorrection(btnEl) {
    const map = getCurrentMap();
    const surface = getActiveSurface(map);
    const statusEl = modalEl?.querySelector('[data-dmr-legend-status]');
    if (!map || !surface) {
      if (statusEl) statusEl.textContent = '请先加载模组地图后再使用 AI 修正。';
      return;
    }
    const prevText = btnEl?.textContent || '✨ AI修正';
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = '⏳ AI分析中...';
    }
    if (statusEl) statusEl.textContent = '正在将地图截图、状态代码与前5楼上下文发送给酒馆当前 AI...';

    try {
      const c = ctx();
      const chat = Array.isArray(c?.chat) ? c.chat : [];
      const recent5 = chat.slice(-5).map((m, idx) => {
        const floor = Math.max(1, chat.length - 5 + idx + 1);
        const role = m?.is_user ? '玩家' : 'DM';
        const body = String(m?.mes || '').slice(0, 2200);
        return `[第${floor}楼 ${role}]\n${body}`;
      }).join('\n\n---\n\n');

      const pxPerFt = surface.pxPerFt || 15;
      const ox = surface.gridOffsetX || 0;
      const oy = surface.gridOffsetY || 0;
      const wFt = Math.round(((surface.width - ox) / pxPerFt) / 5) * 5;
      const hFt = Math.round(((surface.height - oy) / pxPerFt) / 5) * 5;
      const exploredSet = new Set(currentState.exploredRooms || []);
      const clearedSet = new Set(currentState.clearedRooms || []);

      const stateCodeSnapshot = {
        module: currentAdv?.name || '',
        mapId: map.id,
        mapTitle: map.title,
        coordSystem: {
          unit: 'ft (5ft/格)',
          widthFt: wFt,
          heightFt: hFt,
          pxPerFt: Number(pxPerFt.toFixed(2)),
          offsetPx: [ox, oy],
          formula: 'pixel = offsetPx + posFt * pxPerFt',
        },
        currentRoomId: currentState.currentRoomId,
        exploredRooms: [...exploredSet],
        clearedRooms: [...clearedSet],
        rooms: (map.rooms || []).map(r => ({
          id: r.id,
          name: r.name,
          posFt: (r.cx != null && r.cy != null)
            ? [Math.round(((r.cx - ox) / pxPerFt) / 5) * 5, Math.round(((r.cy - oy) / pxPerFt) / 5) * 5]
            : null,
          explored: exploredSet.has(r.id),
          cleared: clearedSet.has(r.id),
        })),
        battleState: {
          active: battleState.active,
          round: battleState.round,
          units: battleState.units,
        },
      };

      const systemPrompt = `你是 D&D 2024 模组地图状态校对助手。你会收到：
1. 当前战术地图截图（含房间编号、战争迷雾与当前棋子位置）；
2. 地图插件当前状态与房间坐标 JSON 代码；
3. 最近 5 楼聊天上下文。

请根据剧情进展与地图房间坐标，修正当前所在房间、已探索房间、已清理房间、队伍坐标与战斗单位位置/HP/状态。
只输出一个合法 JSON 代码块，不要输出多余解释。JSON 字段格式：
{
  "currentRoomId": "房间id",
  "exploredRooms": ["房间id1", "房间id2"],
  "clearedRooms": ["房间id1"],
  "partyPosFt": [xFt, yFt],
  "battleActive": true,
  "units": [
    { "id": "单位名", "att": 0, "hp": "12/12", "pos": [xFt, yFt], "status": [], "next": false }
  ],
  "reason": "简短说明修正依据"
}
注意：att 0=友方, 1=中立, 2=敌对；pos 为 5ft 整数倍且必须在 0~${wFt - 5}, 0~${hFt - 5} 合法范围内。`;

      const userText = `【地图插件当前代码与状态快照】\n\`\`\`json\n${JSON.stringify(stateCodeSnapshot, null, 2)}\n\`\`\`\n\n【最近5楼聊天上下文】\n${recent5 || '（暂无聊天记录）'}`;
      const imageDataUrl = captureMapSnapshotDataUrl();
      const rawReply = await callCurrentTavernAI(systemPrompt, userText, imageDataUrl);
      const parsed = core.parseAiCorrectionResult(rawReply, map, surface);

      const nextExplored = parsed.exploredRooms || [...(currentState.exploredRooms || [])];
      if (parsed.currentRoomId && !nextExplored.includes(parsed.currentRoomId)) {
        nextExplored.push(parsed.currentRoomId);
      }
      const nextTokenPos = { ...(currentState.tokenPos || {}) };
      if (parsed.partyPosPx) {
        nextTokenPos[surface.mapKey] = parsed.partyPosPx;
      } else if (parsed.currentRoomId) {
        const rm = map.rooms.find(r => r.id === parsed.currentRoomId);
        if (rm && rm.cx != null && rm.cy != null) {
          nextTokenPos[surface.mapKey] = { x: Math.round(rm.cx), y: Math.round(rm.cy) };
        }
      }

      let nextOverride = currentState.battleOverride || null;
      if (parsed.units !== null || parsed.battleActive !== null) {
        const nextBattle = {
          active: parsed.battleActive !== null ? parsed.battleActive : battleState.active,
          round: battleState.round || 1,
          units: parsed.units !== null ? parsed.units : battleState.units,
          svgRawBlock: '',
          lastDeltaCount: parsed.units ? parsed.units.length : 0,
        };
        nextOverride = { chatLen: chat.length, state: nextBattle };
        battleState = nextBattle;
      }

      if (parsed.currentRoomId) inspectedRoomId = parsed.currentRoomId;
      await saveChatState({
        ...currentState,
        currentRoomId: parsed.currentRoomId || currentState.currentRoomId,
        exploredRooms: nextExplored,
        clearedRooms: parsed.clearedRooms || currentState.clearedRooms || [],
        tokenPos: nextTokenPos,
        battleOverride: nextOverride,
      }, true);

      syncBattleFromChat();
      if (parsed.currentRoomId) focusRoomOnCanvas(parsed.currentRoomId);
      if (statusEl) {
        const summary = [
          parsed.currentRoomId ? `房间#${parsed.currentRoomId}` : '',
          parsed.units ? `${parsed.units.length}个单位` : '',
          parsed.reason || '',
        ].filter(Boolean).join(' · ');
        statusEl.textContent = `✅ AI修正完成：${summary || '已同步状态'}`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `❌ AI修正失败：${err?.message || err}`;
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = prevText;
      }
    }
  }

  async function restoreFromCurrentChat() {
    const key = identity();
    const raw = await readChatState();
    if (disposed || identity() !== key) return;
    if (raw?.moduleId) {
      try {
        currentAdv = await sync.loadAdventure(raw.moduleId);
      } catch {
        currentAdv = null;
      }
    } else {
      currentAdv = null;
    }
    if (disposed || identity() !== key) return;
    currentState = sync.normalizeState(raw, currentAdv);
    inspectedRoomId = currentState.currentRoomId;
    if (currentAdv && currentState.currentRoomId) {
      const map = getCurrentMap();
      const room = map?.rooms?.find(r => r.id === currentState.currentRoomId);
      if (room) await sync.ensureRoomMonsters(currentAdv, room, map);
    }
    await sync.syncNativeWorldbook(currentState, currentAdv, () => {
      if (disposed || identity() !== key) throw Error('chat changed');
    });
    await refreshPartyCharacters();
    syncBattleFromChat();
    updateToolbarButton();
    renderModal();
  }

  async function checkLatestAssistantMessageForMapMarkers() {
    if (disposed || !currentState?.enabled || !currentAdv) return;
    const c = ctx();
    const chat = c?.chat;
    if (!Array.isArray(chat) || !chat.length) return;
    for (let i = chat.length - 1; i >= Math.max(0, chat.length - 2); i--) {
      const msg = chat[i];
      if (!msg || msg.is_user || msg.is_system) continue;
      const next = core.parseAiMapMarkers(msg.mes || '', currentAdv, currentState);
      if (next) {
        inspectedRoomId = next.currentRoomId;
        await saveChatState(next, true);
        if (modalEl && !modalEl.hidden && next.currentRoomId) {
          focusRoomOnCanvas(next.currentRoomId);
        }
        break;
      }
    }
  }

  function observeEvent(name, handler) {
    const c = ctx();
    const ev = c?.event_types?.[name];
    if (!ev || !c?.eventSource?.on) return;
    const fn = (...args) => Promise.resolve().then(() => handler(...args)).catch(e => console.warn('[DND Module Runner]', e));
    c.eventSource.on(ev, fn);
    removers.push(() => c.eventSource.removeListener?.(ev, fn));
  }

  observeEvent('CHAT_CHANGED', () => restoreFromCurrentChat());
  observeEvent('MESSAGE_RECEIVED', () => { checkLatestAssistantMessageForMapMarkers(); syncBattleFromChat(); });
  observeEvent('GENERATION_ENDED', () => { checkLatestAssistantMessageForMapMarkers(); syncBattleFromChat(); });
  observeEvent('MESSAGE_EDITED', () => syncBattleFromChat());
  observeEvent('MESSAGE_DELETED', () => syncBattleFromChat());
  observeEvent('MESSAGE_SWIPED', () => syncBattleFromChat());
  observeEvent('WORLDINFO_ENTRIES_LOADED', async (payload) => {
    const key = identity();
    const raw = await readChatState();
    if (disposed || identity() !== key) return;
    const adv = raw?.moduleId ? (sync.getCachedAdventure(raw.moduleId) || await sync.loadAdventure(raw.moduleId).catch(() => null)) : null;
    if (disposed || identity() !== key) return;
    const st = sync.normalizeState(raw, adv);
    if (adv && st.currentRoomId) {
      const map = adv.maps.find(m => m.id === st.currentMapId) || adv.maps[0];
      const room = map?.rooms?.find(r => r.id === st.currentRoomId);
      if (room) await sync.ensureRoomMonsters(adv, room, map);
    }
    sync.applyWorldInfoPayload(payload, st, adv);
  });

  function handleNativeClick(ev) {
    const b = ev.target?.closest?.('button,.qr--button,.menu_button');
    if (!b || b.dataset?.dndModuleBtn === '1') return;
    if (b.textContent.trim() !== '模组地图') return;
    const frameId = String(window.frameElement?.id || '').split('--').pop() || SCRIPT_ID;
    const container = doc.getElementById('script_container_' + frameId) || doc.getElementById('script_container_' + SCRIPT_ID);
    if (!container?.contains(b)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    openModal();
  }
  doc.addEventListener('click', handleNativeClick, true);

  // Mount toolbar button and keep it attached via debounced MutationObserver
  ensureToolbarButton();
  toolbarObserver = new host.MutationObserver(() => {
    if (!toolbarQueued && !disposed) {
      toolbarQueued = true;
      host.requestAnimationFrame(ensureToolbarButton);
    }
  });
  if (doc?.body) {
    toolbarObserver.observe(doc.body, { childList: true, subtree: true });
  }

  restoreFromCurrentChat();

  const dispose = () => {
    disposed = true;
    doc.removeEventListener('click', handleNativeClick, true);
    toolbarObserver?.disconnect();
    toolbarBtn?.remove();
    modalEl?.remove();
    styleEl?.remove();
    removers.forEach(fn => fn());
    if (host[NS]?.dispose === dispose) delete host[NS];
  };

  function getTacticalContextForAi() {
    if (!currentAdv) return null;
    const map = getCurrentMap();
    if (!map) return null;
    const surface = getActiveSurface(map);
    const curRoom = map.rooms.find(r => r.id === currentState.currentRoomId) || map.rooms[0] || null;
    const units = (battleState.units || []).map(u => ({
      id: u.id,
      faction: u.faction,
      hp: u.hp,
      pos: u.pos,
      status: u.status,
      next: !!u.next,
    }));
    return {
      moduleId: currentAdv.id,
      moduleName: currentAdv.name,
      mapId: map.id,
      mapTitle: map.title,
      currentRoomId: curRoom?.id || '',
      currentRoomName: curRoom?.name || '',
      topologyText: core.formatFloorTopologyText(map, currentState),
      tacticalSituation: core.buildTacticalSituationText(map, currentState, units, surface),
      safeCells: curRoom ? core.getSafeWalkableCellsForRoom(curRoom, map, 10) : [],
      units,
    };
  }

  host[NS] = {
    open: openModal,
    close: closeModal,
    getState: () => ({ ...currentState }),
    getAdventure: () => currentAdv,
    setEnabled: enabled => {
      if (enabled && !currentState.moduleId) throw Error('请先在模组地图中选择模组');
      return saveChatState({ ...currentState, enabled });
    },
    selectModuleById,
    movePartyToRoom,
    getBattleMapContext,
    getTacticalContextForAi,
    syncBattleUnitPosition,
    syncBattleFromChat,
    getBattleState: () => battleState,
    core,
    sync,
    dispose,
  };
  window.addEventListener('pagehide', dispose, { once: true });
  return host[NS];
}


mountDndModuleRunner();
