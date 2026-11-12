"""Check the source-only publication boundary and component round trip."""
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
config = json.loads((ROOT / 'components.json').read_bytes())
latest = json.loads((ROOT / 'latest.json').read_bytes())
assert latest['version'] == config['version']
expected = []
expected_empty = []
expected_added = []
ids = set()
for group, kind in [('scripts', 'script'), ('regexes', 'regex')]:
    for item in config[group]:
        assert item['id'] not in ids
        ids.add(item['id'])
        path = item['source']
        assert path.startswith('src/' + group + '/') and '..' not in path and '\\' not in path
        text = (ROOT / path).read_text(encoding='utf-8')
        assert '\ufffd' not in text, path
        if kind == 'script':
            assert text.strip(), path
            result = subprocess.run(['node', '--input-type=module', '--check'], input=text, text=True, encoding='utf-8', capture_output=True)
            assert result.returncode == 0, path + ': ' + result.stderr
        if item['id'] in ['dnd-clean-old-battlecheck', 'dnd-clean-old-battle-map', 'dnd-clean-old-map-marker']:
            assert kind == 'regex' and text == ''
            expected_added.append({k: v for k, v in item.items() if k != 'source'} | {'replaceString': text})
            continue
        dest = expected_empty if kind == 'regex' and text == '' else expected
        dest.append({'kind': kind, 'id': item['id'], 'name': item.get('name', item.get('scriptName')), 'path': path})
assert latest['components'] == expected
assert latest['empty_regexes'] == expected_empty
assert latest['added_regexes'] == expected_added
assert latest['worldbook_path'] == 'src/worldbook/updates.json'
patches = json.loads((ROOT / latest['worldbook_path']).read_bytes())
assert [p['uid'] for p in patches] == [18, 643316, 781421, 12, 207976, 6, 781420]
assert all(isinstance(p['previous'], str) and isinstance(p['content'], str) and p['content'].strip() for p in patches)
permitted_root = {'.gitignore', 'README.md', 'latest.json', 'components.json'}
for path in ROOT.rglob('*'):
    if not path.is_file() or '.git' in path.relative_to(ROOT).parts:
        continue
    relative = path.relative_to(ROOT)
    assert (len(relative.parts) == 1 and path.name in permitted_root) or relative.parts[0] in ['src', 'tools', 'tests'], str(relative)
    assert path.suffix.lower() in ['.md', '.json', '.js', '.cjs', '.html', '.txt', '.py', ''] or path.name == '.gitignore', str(relative)
    assert not path.name.startswith('DND-') and not path.name.startswith('.env'), str(relative)
    text = path.read_text(encoding='utf-8')
    assert not re.search(r'(?:github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{25,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)', text), 'Credential-like content in ' + str(relative)
    if path.suffix == '.json':
        value = json.loads(text)
        assert not (isinstance(value, dict) and (str(value.get('spec', '')).startswith('chara_card') or 'character_book' in value.get('data', {}))), 'Complete card is forbidden: ' + str(relative)
print(f'PASS: {len(config["scripts"])} scripts, {len(config["regexes"])} regex sources; valid syntax, metadata/source mapping, no whole card or credential file.')
