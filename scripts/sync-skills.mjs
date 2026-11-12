#!/usr/bin/env node
/**
 * skills/ (원본) → .claude/skills (Claude Code) · .agents/skills (Codex 및 Agent Skills 표준을 읽는 도구)
 * 원본만 고치고 `npm run skills:sync` 를 실행합니다. {{COMMON}} 은 skills/_common.md 로 치환됩니다.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'skills');
const common = fs.readFileSync(path.join(src, '_common.md'), 'utf8').trim();
const targets = ['.claude/skills', '.agents/skills'];
const check = process.argv.includes('--check');
let diff = 0;

for (const t of targets) {
  const dir = path.join(root, t);
  if (!check) fs.rmSync(dir, { recursive: true, force: true });
  for (const name of fs.readdirSync(src)) {
    const file = path.join(src, name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const md = fs.readFileSync(file, 'utf8');
    const m = md.match(/^---\nname: ([a-z0-9-]+)\ndescription: .+\n---\n/);
    if (!m || m[1] !== name) throw new Error(`${name}: frontmatter 의 name 이 폴더명과 같아야 합니다`);
    const out = md.replace('{{COMMON}}', common);
    const dest = path.join(dir, name, 'SKILL.md');
    if (check) { if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) { console.error('동기화 필요:', path.relative(root, dest)); diff++; } continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out);
  }
}
if (check && diff) process.exit(1);
console.log(check ? '스킬 동기화 상태 정상' : `스킬 동기화 완료 → ${targets.join(', ')}`);
