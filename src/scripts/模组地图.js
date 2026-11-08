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
    if (rawRegionsCount === 0 || grid.units === 'miles' || /^hex/i.test(grid.type || '')) {
      return 'overworld';
    }
    if (grid.type === 'none' || /小镇|城镇|城市|聚落|村庄|Phandalin|Town|City|Village/i.test(title)) {
      return 'settlement';
    }
    return 'dungeon';
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

          const rooms = [...roomMap.values()].map(r => {
            const allPts = r.polygons.flat();
            const xs = allPts.map(p => p[0]);
            const ys = allPts.map(p => p[1]);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const cx = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
            const cy = Math.round(ys.reduce((a, b) => a + b, 0) / ys.length);
            return {
              ...r,
              points: r.polygons[0],
              cx,
              cy,
              bbox: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
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

          rawMaps.push({
            id: mapId,
            title: strip5eTags(img.title || nextSection?.name || sec.name || `地图 ${rawMaps.length + 1}`),
            mapKind,
            requiresFog,
            chapterIndex: secIdx,
            chapterName: sec.name || `第 ${secIdx + 1} 章`,
            sectionName: nextSection?.name || sec.name || '',
            path: curPath.join(' > '),
            imageUrl: encodeImgPath(img.href?.path),
            thumbnailUrl: encodeImgPath(img.hrefThumbnail?.path || img.href?.path),
            width: img.width || 2048,
            height: img.height || 1536,
            grid,
            generalNotes: generalNotes.slice(0, 4).join('\n\n'),
            rooms,
          });
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
      sections.push(`#### 【二、当前场景空间拓扑图 (Scene & Floor Topology)】
主持要求：严格依据下方拓扑图的方位、连通关系与走廊连接裁定队伍移动、视线、声音传播与追击路线。禁止穿墙跳关或凭空捏造不存在的通道。
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

    // Section 5: Available Maps Index & AI Autonomous Progression Tag
    const allMapsSummary = compiledAdv.maps.map(m => `[#${m.id}] ${m.chapterName}·${m.title}(${m.rooms.length}节点)`).join('、');
    sections.push(`#### 【五、模组全场景索引与 AI 自主推进协议】
本模组场景索引：${allMapsSummary}
- **信息隔离原则**：对玩家严格保密尚未触发的暗门、陷阱 DC、埋伏与幕后黑手设定；仅在玩家抵达相应区域或通过检定时揭示。
- **AI 自主切换世界书与地图推进指令**：
  当玩家在本次回复中**实际移动进入了新的区域/下一幕场景**、**通过侦察揭开了相邻迷雾区域**，或**清空了当前区域的敌人**时，必须在回复最末尾（在 \`</UpdateVariable>\` 之后）另起一行输出隐藏推进指令（将自动为您开放再下一步的关联世界书）：
  \`<!-- dnd-map: {"map":"目标地图ID","room":"目标区域ID","reveal":["新揭开的区域ID"],"clear":["已清理完毕的区域ID"]} -->\`
  （示例：队伍从地精伏击 #00e 追击抵达克拉摩窝点 1.洞口 #01b 时输出：\`<!-- dnd-map: {"map":"1ab","room":"01b","reveal":["01b"],"clear":["00e"]} -->\`）`);

    return sections.join('\n\n');
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

  return {
    BASE_URL,
    encodeImgPath,
    strip5eTags,
    extractEntityRefs,
    renderEntriesToText,
    formatMonsterStatblock,
    polygonDistance,
    pointInPolygon,
    compassDirection,
    compileAdventureData,
    formatFloorTopologyText,
    buildModuleWorldbookPrompt,
    resolveRoomToken,
    parseAiMapMarkers,
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
        transitions: [],
        dmView: false,
      };
    }
    let currentMapId = String(raw.currentMapId || '');
    let currentRoomId = String(raw.currentRoomId || '');
    const explored = new Set(Array.isArray(raw.exploredRooms) ? raw.exploredRooms.map(String) : []);
    const cleared = new Set(Array.isArray(raw.clearedRooms) ? raw.clearedRooms.map(String) : []);

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
      transitions: Array.isArray(raw.transitions) ? raw.transitions.slice(-60) : [],
      dmView: raw.dmView === true,
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

  // Map Canvas Viewport State
  const view = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    dragMoved: false,
    startX: 0,
    startY: 0,
    hoveredRoomId: '',
    img: null,
    imgUrl: '',
    imgLoading: false,
    imgError: false,
  };

  const removers = [];
  let modalEl = null;
  let styleEl = null;
  let toolbarBtn = null;
  let toolbarObserver = null;
  let toolbarQueued = false;
  const SCRIPT_ID = 'd5e20240-6d61-4700-9a11-7e5e20240001';

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
      #dnd-module-runner-modal{position:fixed;inset:0;z-index:10060;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(8,7,6,.76);backdrop-filter:blur(4px);box-sizing:border-box;font:13px/1.5 'Noto Serif SC','Microsoft YaHei',Georgia,serif;color:#e8dcc6}
      #dnd-module-runner-modal[hidden]{display:none!important}
      .dmr-window{display:flex;flex-direction:column;width:min(1340px,96vw);height:min(870px,92vh);background:linear-gradient(160deg,#1f1c18 0%,#151310 100%);border:1px solid #8a7048;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.85),inset 0 1px rgba(255,236,196,.12);overflow:hidden}
      .dmr-topbar{flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 14px;background:linear-gradient(180deg,#2a241c,#1d1914);border-bottom:1px solid #594933}
      .dmr-title{font-weight:700;font-size:15px;color:#f3dfb6;letter-spacing:.04em;margin-right:4px;display:flex;align-items:center;gap:6px;white-space:nowrap}
      .dmr-select,.dmr-input{background:#14120e;color:#e8dcc6;border:1px solid #69563a;border-radius:6px;padding:5px 9px;font:inherit;min-height:32px;box-sizing:border-box}
      .dmr-select:focus,.dmr-input:focus{outline:1px solid #d1aa63;border-color:#d1aa63}
      .dmr-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:5px 10px;min-height:30px;border:1px solid #735f40;border-radius:6px;background:linear-gradient(#383229,#26221c);color:#e8dcc6;font:500 12px/1.2 inherit;cursor:pointer;white-space:nowrap;transition:all .15s;box-sizing:border-box}
      .dmr-btn:hover:not(:disabled){background:#4a3f2f;border-color:#c6a15b;color:#fff4dc}
      .dmr-btn:disabled{opacity:.45;cursor:not-allowed}
      .dmr-btn[data-active="true"]{background:linear-gradient(#705327,#4f3918);border-color:#e0b96c;color:#fff6e0;box-shadow:0 0 10px rgba(209,170,99,.25)}
      .dmr-btn-primary{background:linear-gradient(#6b4f25,#4c3718);border-color:#c49d56;color:#ffefd0}
      .dmr-spacer{flex:1 1 auto}
      .dmr-body{flex:1 1 auto;display:grid;grid-template-columns:minmax(0,1fr) 410px;min-height:0;overflow:hidden}
      .dmr-map-col{display:flex;flex-direction:column;min-width:0;min-height:0;background:#0e0c0a;overflow:hidden}
      .dmr-canvas-bar{flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 12px;background:#181510;border-bottom:1px solid #463927}
      .dmr-mode-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:600;background:#2b2419;color:#e6c98a;border:1px solid #6b5636;white-space:nowrap}
      .dmr-map-stage{flex:1 1 auto;position:relative;background:#0e0c0a;overflow:hidden;user-select:none;touch-action:none;display:flex;align-items:center;justify-content:center;min-height:0}
      .dmr-canvas{display:block;width:100%;height:100%;cursor:grab}
      .dmr-canvas:active{cursor:grabbing}
      .dmr-legend{position:absolute;bottom:10px;left:12px;right:12px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;background:rgba(20,17,13,.88);border:1px solid rgba(138,112,72,.55);border-radius:8px;font-size:12px;color:#cbbba0;pointer-events:none}
      .dmr-side{display:flex;flex-direction:column;background:#191612;border-left:1px solid #52432e;min-width:0;min-height:0;overflow:hidden}
      .dmr-tabs{flex-shrink:0;display:flex;border-bottom:1px solid #4a3c29;background:#211d17}
      .dmr-tab{flex:1;padding:9px 6px;text-align:center;font-size:12.5px;font-weight:600;color:#b5a489;background:transparent;border:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap}
      .dmr-tab[data-active="true"]{color:#f3dfb6;border-bottom-color:#d1aa63;background:rgba(209,170,99,.08)}
      .dmr-panel{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:12px 14px;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin;scrollbar-color:#735f40 transparent}
      .dmr-card{background:#221e18;border:1px solid #4d3f2b;border-radius:8px;padding:10px 12px;box-sizing:border-box}
      .dmr-card-title{font-weight:700;font-size:13.5px;color:#efd8a7;margin-bottom:6px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px}
      .dmr-readaloud{background:linear-gradient(90deg,rgba(209,170,99,.12),rgba(209,170,99,.03));border-left:3px solid #d1aa63;padding:8px 10px;border-radius:0 6px 6px 0;color:#f2e6cf;font-style:italic;white-space:pre-wrap;line-height:1.6}
      .dmr-exit-list{display:flex;flex-direction:column;gap:8px}
      .dmr-exit-item{display:flex;flex-direction:column;gap:6px;padding:8px 10px;background:#181510;border:1px solid #463927;border-radius:7px;box-sizing:border-box}
      .dmr-exit-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;font-weight:600;color:#ead7b3}
      .dmr-exit-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
      .dmr-badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;background:#3a3022;color:#dfbe7f;border:1px solid #6e5839;white-space:nowrap}
      .dmr-badge-cur{background:#5f451e;color:#fff1cf;border-color:#d6ae60}
      .dmr-badge-ok{background:#233d29;color:#9fe0ad;border-color:#447a50}
      .dmr-badge-unk{background:#2d2823;color:#b3a48e;border-color:#574c3f}
      .dmr-pre{white-space:pre-wrap;word-break:break-word;font:12px/1.55 Consolas,'Microsoft YaHei',monospace;color:#d6c7ae;background:#13110d;border:1px solid #3d3223;border-radius:6px;padding:9px;max-height:360px;overflow-y:auto}
      .dmr-room-item{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px;border-radius:6px;border:1px solid #3c3122;background:#17140f;cursor:pointer}
      .dmr-room-item:hover{border-color:#8c7148;background:#241f17}
      .dmr-room-item[data-current="true"]{border-color:#d1aa63;background:#2f2619}
      @media(max-width:900px){
        .dmr-body{grid-template-columns:1fr;grid-template-rows:52% 48%}
        .dmr-side{border-left:none;border-top:1px solid #52432e}
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

  function fitMapToViewport() {
    const canvas = modalEl?.querySelector('.dmr-canvas');
    const map = getCurrentMap();
    if (!canvas || !map) return;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width || 720, ch = rect.height || 540;
    const mw = view.img?.naturalWidth || map.width || 2048;
    const mh = view.img?.naturalHeight || map.height || 1536;
    const scale = Math.min(cw / mw, ch / mh) * 0.94;
    view.scale = Math.max(0.05, Math.min(4, scale));
    view.offsetX = Math.round((cw - mw * view.scale) / 2);
    view.offsetY = Math.round((ch - mh * view.scale) / 2);
    drawMapCanvas();
  }

  function focusRoomOnCanvas(roomId) {
    const canvas = modalEl?.querySelector('.dmr-canvas');
    const map = getCurrentMap();
    if (!canvas || !map) return;
    if (map.mapKind === 'overworld') return fitMapToViewport();
    const room = map.rooms.find(r => r.id === (roomId || currentState.currentRoomId));
    if (!room || room.isStoryNode || room.cx == null || room.cy == null) return fitMapToViewport();
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width || 720, ch = rect.height || 540;
    const mw = view.img?.naturalWidth || map.width || 2048;
    const mh = view.img?.naturalHeight || map.height || 1536;
    const targetSpan = Math.max(room.bbox?.width || 400, room.bbox?.height || 400, (map.grid?.size || 150) * 6);
    const desiredScale = Math.min(cw, ch) / (targetSpan * 1.85);
    const minFit = Math.min(cw / mw, ch / mh) * 0.85;
    view.scale = Math.max(minFit, Math.min(1.6, desiredScale));
    view.offsetX = Math.round(cw / 2 - room.cx * view.scale);
    view.offsetY = Math.round(ch / 2 - room.cy * view.scale);
    drawMapCanvas();
  }

  function ensureMapImageLoaded(map) {
    if (!map?.imageUrl) {
      view.img = null;
      view.imgUrl = '';
      view.imgLoading = false;
      return;
    }
    if (view.imgUrl === map.imageUrl && (view.img || view.imgLoading)) return;
    view.imgUrl = map.imageUrl;
    view.img = null;
    view.imgLoading = true;
    view.imgError = false;
    const img = new host.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (view.imgUrl !== map.imageUrl) return;
      view.img = img;
      view.imgLoading = false;
      if (currentState.currentRoomId) focusRoomOnCanvas(currentState.currentRoomId);
      else fitMapToViewport();
    };
    img.onerror = () => {
      if (view.imgUrl !== map.imageUrl) return;
      // Retry without crossOrigin if needed
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
      fallback.src = map.imageUrl;
    };
    img.src = map.imageUrl;
  }

  function buildRevealedClipPath(ctx2d, map, exploredSet) {
    const gridSize = map.grid?.size || 150;
    const padPx = Math.round(gridSize * 0.22);
    const corridorRadius = Math.round(gridSize * 0.52);

    ctx2d.beginPath();
    const roomById = new Map(map.rooms.map(r => [r.id, r]));

    // 1. Explored room polygons + base visibility circle
    for (const roomId of exploredSet) {
      const room = roomById.get(roomId);
      if (!room || room.isStoryNode || room.cx == null || room.cy == null) continue;
      for (const poly of room.polygons || [room.points]) {
        if (!Array.isArray(poly) || poly.length < 3) continue;
        const expanded = expandPolygon(poly, room.cx, room.cy, padPx);
        tracePolygon(ctx2d, expanded);
      }
      ctx2d.moveTo(room.cx + gridSize * 0.95, room.cy);
      ctx2d.arc(room.cx, room.cy, gridSize * 0.95, 0, Math.PI * 2);
    }

    // 2. Corridor capsules between connected explored rooms
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

    // 3. Recorded move transitions on this map
    for (const tr of currentState.transitions || []) {
      if (tr.mapId !== map.id) continue;
      const r1 = roomById.get(tr.from);
      const r2 = roomById.get(tr.to);
      if (r1 && r2 && !r1.isStoryNode && !r2.isStoryNode && r1.cx != null && r2.cx != null) {
        traceCorridorCapsule(ctx2d, r1.cx, r1.cy, r2.cx, r2.cy, corridorRadius);
      }
    }

    // 4. Custom manual brush reveals
    const brushes = currentState.customReveals?.[map.id] || [];
    for (const [bx, by, br] of brushes) {
      const rad = br || gridSize * 1.2;
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
    if (!map) {
      c.fillStyle = '#a8977a';
      c.font = '15px "Microsoft YaHei", serif';
      c.textAlign = 'center';
      c.fillText('请在上方选择要运行的 D&D 官方模组', cw / 2, ch / 2);
      c.restore();
      return;
    }

    ensureMapImageLoaded(map);
    const mw = view.img?.naturalWidth || map.width || 2048;
    const mh = view.img?.naturalHeight || map.height || 1536;
    const explored = new Set(currentState.exploredRooms || []);
    const cleared = new Set(currentState.clearedRooms || []);
    const adjMap = getAdjacentUnexploredMap(map);
    const useFog = (map.requiresFog !== false) && !currentState.dmView;
    const showAllPins = !useFog;

    // World-space pass: map image, fog clipping, room polygons & topology lines
    c.save();
    c.translate(view.offsetX, view.offsetY);
    c.scale(view.scale, view.scale);

    // Map bounds background (unexplored fog parchment)
    c.fillStyle = '#18140f';
    c.fillRect(0, 0, mw, mh);

    if (useFog) {
      // Subtle tactical grid on fog only when Fog of War is active
      const gridStep = Math.max(80, map.grid?.size || 150);
      c.strokeStyle = 'rgba(180, 148, 92, 0.07)';
      c.lineWidth = Math.max(1, 1 / view.scale);
      c.beginPath();
      for (let x = 0; x <= mw; x += gridStep) {
        c.moveTo(x, 0);
        c.lineTo(x, mh);
      }
      for (let y = 0; y <= mh; y += gridStep) {
        c.moveTo(0, y);
        c.lineTo(mw, y);
      }
      c.stroke();
    }

    if (view.img) {
      if (!useFog) {
        c.drawImage(view.img, 0, 0, mw, mh);
      } else {
        // Fog of War Clip Reveal
        c.save();
        buildRevealedClipPath(c, map, explored);
        c.clip();
        c.drawImage(view.img, 0, 0, mw, mh);
        c.restore();

        // Soft golden border along revealed region
        c.save();
        buildRevealedClipPath(c, map, explored);
        c.strokeStyle = 'rgba(214, 172, 96, 0.48)';
        c.lineWidth = Math.max(2, 3 / view.scale);
        c.stroke();
        c.restore();
      }
    } else if (view.imgLoading) {
      c.fillStyle = '#d1aa63';
      c.font = `${Math.round(28 / view.scale)}px "Microsoft YaHei", sans-serif`;
      c.textAlign = 'center';
      c.fillText('正在加载高清模组地图…', mw / 2, mh / 2);
    }

    // Draw Topology Edges for physical dungeon/settlement rooms
    const roomById = new Map(map.rooms.map(r => [r.id, r]));
    if (map.mapKind !== 'overworld') {
      c.save();
      for (const r1 of map.rooms) {
        if (r1.isStoryNode || r1.cx == null || r1.cy == null) continue;
        const r1Visible = showAllPins || explored.has(r1.id);
        if (!r1Visible) continue;
        for (const edge of r1.edges || []) {
          const r2 = roomById.get(edge.toId);
          if (!r2 || r2.isStoryNode || r2.cx == null || r2.cy == null) continue;
          const r2Visible = showAllPins || explored.has(r2.id) || adjMap.has(r2.id);
          if (!r2Visible) continue;
          if (r1.id > r2.id && (showAllPins || explored.has(r2.id))) continue;
          c.beginPath();
          c.moveTo(r1.cx, r1.cy);
          c.lineTo(r2.cx, r2.cy);
          c.strokeStyle = (explored.has(r1.id) && explored.has(r2.id))
            ? 'rgba(218, 181, 106, 0.48)'
            : 'rgba(218, 155, 64, 0.36)';
          c.lineWidth = Math.max(1.2, 2 / view.scale);
          c.setLineDash(explored.has(r2.id) ? [] : [9 / view.scale, 7 / view.scale]);
          c.stroke();
        }
      }
      c.restore();
    }

    // Draw Room Polygons in World Space (skip story nodes & settlement non-fog maps unless hovered/current)
    for (const room of map.rooms) {
      if (room.isStoryNode || room.cx == null || room.cy == null) continue;
      const isCur = room.id === currentState.currentRoomId;
      const isInsp = room.id === inspectedRoomId;
      const isHov = room.id === view.hoveredRoomId;
      const isExp = explored.has(room.id);
      const isClr = cleared.has(room.id);
      const adjInfo = adjMap.get(room.id);

      if (!showAllPins && !isExp && !adjInfo) continue;
      if (!room.polygons?.length && !room.points?.length) continue;

      c.save();
      c.beginPath();
      for (const poly of room.polygons || [room.points]) {
        tracePolygon(c, poly);
      }

      if (isCur) {
        c.fillStyle = 'rgba(218, 174, 88, 0.16)';
        c.fill();
        c.strokeStyle = '#f5cb73';
        c.lineWidth = Math.max(2, 3 / view.scale);
        c.stroke();
      } else if (isExp || showAllPins) {
        if (isHov || isInsp) {
          c.fillStyle = 'rgba(209, 170, 99, 0.14)';
          c.fill();
        }
        if (useFog || isHov || isInsp) {
          c.strokeStyle = isInsp ? '#e5be70' : isClr ? 'rgba(116, 204, 138, 0.65)' : 'rgba(209, 170, 99, 0.38)';
          c.lineWidth = Math.max(1.2, 1.8 / view.scale);
          c.stroke();
        }
      } else if (adjInfo) {
        c.fillStyle = isHov || isInsp ? 'rgba(214, 150, 58, 0.22)' : 'rgba(38, 31, 21, 0.62)';
        c.fill();
        c.setLineDash([8 / view.scale, 6 / view.scale]);
        c.strokeStyle = isHov || isInsp ? '#f0b85a' : 'rgba(214, 162, 78, 0.72)';
        c.lineWidth = Math.max(1.5, 2.2 / view.scale);
        c.stroke();
      }
      c.restore();
    }
    c.restore(); // End World-Space Transform

    // Screen-Space Pass: Crisp, Constant-Size Room Pins & Labels
    c.font = '600 12.5px "Microsoft YaHei", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    for (const room of map.rooms) {
      if (room.isStoryNode || room.cx == null || room.cy == null) continue;
      const isCur = room.id === currentState.currentRoomId;
      const isInsp = room.id === inspectedRoomId;
      const isHov = room.id === view.hoveredRoomId;
      const isExp = explored.has(room.id);
      const isClr = cleared.has(room.id);
      const adjInfo = adjMap.get(room.id);

      if (!showAllPins && !isExp && !adjInfo) continue;

      const sx = room.cx * view.scale + view.offsetX;
      const sy = room.cy * view.scale + view.offsetY;
      if (sx < -120 || sx > cw + 120 || sy < -60 || sy > ch + 60) continue;

      let label = room.name;
      if (!showAllPins && !isExp && adjInfo) {
        label = `？未知 [${adjInfo.dir}]`;
      } else if (isCur) {
        label = `⚔️ ${room.name}`;
      } else if (isClr) {
        label = `✓ ${room.name}`;
      }

      const padX = 8;
      const padY = 4;
      const textW = c.measureText(label).width;
      const boxW = textW + padX * 2;
      const boxH = 13 + padY * 2;

      c.fillStyle = isCur
        ? 'rgba(104, 71, 20, 0.95)'
        : (isInsp || isHov)
          ? 'rgba(62, 49, 28, 0.94)'
          : (isExp || showAllPins)
            ? 'rgba(22, 18, 14, 0.88)'
            : 'rgba(42, 32, 18, 0.92)';
      c.strokeStyle = isCur
        ? '#ffd87d'
        : (isInsp || isHov)
          ? '#e8c274'
          : (isExp || showAllPins)
            ? '#9a7c4c'
            : '#d69940';
      c.lineWidth = isCur || isInsp ? 1.8 : 1.2;

      const rx = Math.round(sx - boxW / 2);
      const ry = Math.round(sy - boxH / 2);
      c.beginPath();
      c.roundRect(rx, ry, Math.round(boxW), Math.round(boxH), 5);
      c.fill();
      c.stroke();

      c.fillStyle = isCur ? '#fff6dc' : (isExp || showAllPins) ? '#f0e2c8' : '#f3c677';
      c.fillText(label, Math.round(sx), Math.round(sy));
    }

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

  function findRoomAtPoint(mx, my, sx = null, sy = null) {
    const map = getCurrentMap();
    if (!map?.rooms?.length) return null;
    const explored = new Set(currentState.exploredRooms || []);
    const adjMap = getAdjacentUnexploredMap(map);
    const useFog = (map.requiresFog !== false) && !currentState.dmView;
    const showAllPins = !useFog;

    // 1. Check screen-space badge hit first so labels are always easy to click at any zoom
    const screenX = sx != null ? sx : (mx * view.scale + view.offsetX);
    const screenY = sy != null ? sy : (my * view.scale + view.offsetY);
    for (const r of map.rooms) {
      if (r.isStoryNode || r.cx == null || r.cy == null) continue;
      if (!showAllPins && !explored.has(r.id) && !adjMap.has(r.id)) continue;
      const rx = r.cx * view.scale + view.offsetX;
      const ry = r.cy * view.scale + view.offsetY;
      if (Math.abs(screenX - rx) <= 58 && Math.abs(screenY - ry) <= 16) return r;
    }

    // 2. Check polygon containment in world coordinates
    for (const r of map.rooms) {
      if (r.isStoryNode || r.cx == null || r.cy == null) continue;
      if (!showAllPins && !explored.has(r.id) && !adjMap.has(r.id)) continue;
      for (const poly of r.polygons || [r.points]) {
        if (Array.isArray(poly) && poly.length >= 3 && core.pointInPolygon(mx, my, poly)) return r;
      }
    }
    return null;
  }

  async function movePartyToRoom(targetRoomId, targetMapId = null, sendChatPrompt = false) {
    if (!currentAdv) return;
    const mapId = targetMapId || currentState.currentMapId || getCurrentMap()?.id || '';
    const map = currentAdv.maps.find(m => m.id === mapId);
    const room = map?.rooms?.find(r => r.id === targetRoomId);
    if (!map || !room) return;

    const explored = new Set(currentState.exploredRooms || []);
    explored.add(room.id);
    const transitions = [...(currentState.transitions || [])];
    if (currentState.currentRoomId && currentState.currentRoomId !== room.id && currentState.currentMapId === map.id) {
      transitions.push({ mapId: map.id, from: currentState.currentRoomId, to: room.id, at: Date.now() });
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
      transitions,
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

    panel.innerHTML = `
      <div class="dmr-card">
        <div class="dmr-card-title">
          <span>${canSeeDetails ? `[#${inspRoom.id}] ${escapeHtml(inspRoom.name)}` : `[#${inspRoom.id}] ？未知待探索区域`}</span>
          ${isCur
            ? `<span class="dmr-badge dmr-badge-cur">⚔️ 队伍当前所在</span>`
            : `<button type="button" class="dmr-btn dmr-btn-primary" data-move-room="${inspRoom.id}">📍 设为当前所在</button>`}
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
    const modePill = modalEl.querySelector('[data-dmr-mode-pill]');
    const sceneTabBtn = modalEl.querySelector('[data-dmr-tab="scene"]');

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
    if (modePill) {
      if (!map) {
        modePill.textContent = '🗺️ 请选择模组';
      } else if (map.mapKind === 'overworld') {
        modePill.textContent = '🌍 区域大地图（无战争迷雾 · 全图清晰直览）';
      } else if (map.mapKind === 'settlement') {
        modePill.textContent = '🏘️ 城镇导览图（无战争迷雾 · 地点全开放）';
      } else {
        modePill.textContent = '🏰 战术探索地城（多边形战争迷雾）';
      }
    }
    if (dmViewBtn) {
      const hasFog = map ? map.requiresFog !== false : true;
      dmViewBtn.style.display = hasFog ? '' : 'none';
      dmViewBtn.dataset.active = String(!!currentState.dmView);
      dmViewBtn.textContent = currentState.dmView ? '👁️ 视角：DM全图' : '🌫️ 视角：玩家迷雾';
    }
    if (brushBtn) {
      const hasFog = map ? map.requiresFog !== false : false;
      brushBtn.style.display = hasFog ? '' : 'none';
      brushBtn.dataset.active = String(brushMode);
    }
    if (sceneTabBtn) {
      sceneTabBtn.textContent = (map && !map.requiresFog) ? '📖 剧情与地点' : '📍 房间与通道';
    }

    for (const tabBtn of modalEl.querySelectorAll('[data-dmr-tab]')) {
      tabBtn.dataset.active = String(tabBtn.dataset.dmrTab === activeTab);
    }

    renderSidePanel();
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
      await saveChatState({
        enabled: true,
        moduleId: compiled.id,
        moduleName: compiled.name,
        currentMapId: firstMap?.id || '',
        currentRoomId: firstRoom?.id || '',
        exploredRooms: firstRoom ? [firstRoom.id] : [],
        clearedRooms: [],
        customReveals: {},
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
            <span class="dmr-title">🗺️ D&D 模组运行器</span>
            <input type="search" class="dmr-input" data-dmr-search placeholder="搜索103部官方模组(如: 凡戴尔/冰塔峰/施特拉德)..." style="width:200px" />
            <select class="dmr-select" data-dmr-module style="max-width:240px"><option value="">正在加载模组目录…</option></select>
            <select class="dmr-select" data-dmr-map style="max-width:250px"><option value="">-- 场景地图 --</option></select>
            <button type="button" class="dmr-btn" data-action="toggle-enable">⚪ 世界书同步：关闭</button>
            <span class="dmr-spacer"></span>
            <button type="button" class="dmr-btn" data-action="close">✕ 关闭</button>
          </div>
          <div class="dmr-body">
            <div class="dmr-map-col">
              <div class="dmr-canvas-bar">
                <span class="dmr-mode-pill" data-dmr-mode-pill>🗺️ 模组场景地图</span>
                <button type="button" class="dmr-btn" data-action="focus-party" title="将视野聚焦到当前区域或适应大地图">🎯 聚焦当前</button>
                <button type="button" class="dmr-btn" data-action="fit-map" title="缩放适应整张地图">🖼️ 适应全图</button>
                <button type="button" class="dmr-btn" data-action="zoom-in" title="放大地图">➕</button>
                <button type="button" class="dmr-btn" data-action="zoom-out" title="缩小地图">➖</button>
                <button type="button" class="dmr-btn" data-action="toggle-dmview">🌫️ 视角：玩家迷雾</button>
                <button type="button" class="dmr-btn" data-action="toggle-brush" title="开启后可在地城地图上点击点亮任意走廊迷雾">🔦 迷雾笔刷</button>
              </div>
              <div class="dmr-map-stage">
                <canvas class="dmr-canvas"></canvas>
                <div class="dmr-legend">
                  <span data-dmr-legend-status>滚轮缩放 · 拖拽平移 · 单击地标查看详情 · 双击地标移动队伍</span>
                  <span>⚔️当前所在 &nbsp;|&nbsp; ✓已探索 &nbsp;|&nbsp; ⏭️下一跳世界书已预载</span>
                </div>
              </div>
            </div>
            <div class="dmr-side">
              <div class="dmr-tabs">
                <button type="button" class="dmr-tab" data-dmr-tab="scene" data-active="true">📍 房间与通道</button>
                <button type="button" class="dmr-tab" data-dmr-tab="topology" data-active="false">🕸️ 本层拓扑图</button>
                <button type="button" class="dmr-tab" data-dmr-tab="prompt" data-active="false">📖 世界书注入</button>
              </div>
              <div class="dmr-panel" data-dmr-panel></div>
            </div>
          </div>
        </div>
      `;
      doc.body.appendChild(modalEl);
      bindModalEvents();
    }

    modalEl.hidden = false;
    await populateCatalogSelect();
    renderModal();
    host.requestAnimationFrame(() => {
      if (currentState.currentRoomId) focusRoomOnCanvas(currentState.currentRoomId);
      else fitMapToViewport();
    });
  }

  function closeModal() {
    if (modalEl) modalEl.hidden = true;
  }

  let fullCatalog = [];
  async function populateCatalogSelect(filterText = '') {
    const modSelect = modalEl?.querySelector('[data-dmr-module]');
    if (!modSelect) return;
    try {
      if (!fullCatalog.length) {
        fullCatalog = await sync.loadCatalog();
      }
      const q = filterText.trim().toLowerCase();
      const filtered = q
        ? fullCatalog.filter(a => (a.name || '').toLowerCase().includes(q) || (a.ENG_name || '').toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q) || (a.storyline || '').toLowerCase().includes(q))
        : fullCatalog;

      const options = [`<option value="">-- 选择 D&D 官方模组 (${filtered.length}/${fullCatalog.length}) --</option>`];
      for (const a of filtered) {
        const lvl = a.level ? ` [${a.level.start}-${a.level.end}级]` : '';
        options.push(`<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} (${escapeHtml(a.id)})${lvl}</option>`);
      }
      modSelect.innerHTML = options.join('');
      if (currentState.moduleId) modSelect.value = currentState.moduleId;
    } catch (err) {
      modSelect.innerHTML = `<option value="">加载目录失败: ${escapeHtml(err?.message || err)}</option>`;
    }
  }

  function bindModalEvents() {
    modalEl.addEventListener('click', async (ev) => {
      if (ev.target === modalEl) return closeModal();
      const btn = ev.target.closest('button,[data-room-pick]');
      if (!btn) return;

      const act = btn.dataset.action;
      if (act === 'close') return closeModal();
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
      if (act === 'toggle-brush') {
        brushMode = !brushMode;
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
      if (act === 'reveal-all') {
        const map = getCurrentMap();
        if (!map) return;
        const allRevealed = (currentState.exploredRooms || []).length >= map.rooms.length;
        const nextExplored = allRevealed ? (currentState.currentRoomId ? [currentState.currentRoomId] : []) : map.rooms.map(r => r.id);
        await saveChatState({ ...currentState, exploredRooms: nextExplored });
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
        const explored = new Set(currentState.exploredRooms || []);
        explored.add(btn.dataset.revealRoom);
        inspectedRoomId = btn.dataset.revealRoom;
        await saveChatState({ ...currentState, exploredRooms: [...explored] });
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
      const nextRoom = nextMap.rooms[0] || null;
      const explored = new Set(currentState.exploredRooms || []);
      if (nextRoom) explored.add(nextRoom.id);
      inspectedRoomId = nextRoom?.id || '';
      await saveChatState({
        ...currentState,
        currentMapId: nextMap.id,
        currentRoomId: nextRoom?.id || '',
        exploredRooms: [...explored],
      });
      if (nextRoom) focusRoomOnCanvas(nextRoom.id);
      else fitMapToViewport();
    });

    const canvas = modalEl.querySelector('.dmr-canvas');
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture(ev.pointerId);
      view.dragging = true;
      view.dragMoved = false;
      view.startX = ev.clientX - view.offsetX;
      view.startY = ev.clientY - view.offsetY;
    });

    canvas.addEventListener('pointermove', (ev) => {
      if (view.dragging) {
        const nx = ev.clientX - view.startX;
        const ny = ev.clientY - view.startY;
        if (Math.hypot(nx - view.offsetX, ny - view.offsetY) > 4) view.dragMoved = true;
        view.offsetX = nx;
        view.offsetY = ny;
        drawMapCanvas();
        return;
      }
      const { x, y, sx, sy } = canvasCoordsToMap(ev.clientX, ev.clientY);
      const hit = findRoomAtPoint(x, y, sx, sy);
      const hid = hit?.id || '';
      if (hid !== view.hoveredRoomId) {
        view.hoveredRoomId = hid;
        canvas.style.cursor = hid ? 'pointer' : brushMode ? 'crosshair' : 'grab';
        drawMapCanvas();
      }
    });

    canvas.addEventListener('pointerup', async (ev) => {
      if (!view.dragging) return;
      view.dragging = false;
      if (view.dragMoved) return;
      const { x, y, sx, sy } = canvasCoordsToMap(ev.clientX, ev.clientY);
      const map = getCurrentMap();
      if (!map) return;

      if (brushMode) {
        const rad = Math.round((map.grid?.size || 150) * 1.15);
        const curList = [...(currentState.customReveals?.[map.id] || []), [Math.round(x), Math.round(y), rad]];
        await saveChatState({
          ...currentState,
          customReveals: { ...(currentState.customReveals || {}), [map.id]: curList.slice(-80) },
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
  observeEvent('MESSAGE_RECEIVED', () => checkLatestAssistantMessageForMapMarkers());
  observeEvent('GENERATION_ENDED', () => checkLatestAssistantMessageForMapMarkers());
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
    core,
    sync,
    dispose,
  };
  window.addEventListener('pagehide', dispose, { once: true });
  return host[NS];
}


mountDndModuleRunner();
