// Posts GitHub pushes and releases to a Discord webhook.
// Env: DISCORD_WEBHOOK (secret), DISCORD_ROLE_ID (optional, pinged on releases), GITHUB_EVENT_PATH (set by Actions).
import fs from 'node:fs';

const e = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const role = process.env.DISCORD_ROLE_ID;
const app = e.repository.name;
let body;

if (e.release) {
  const r = e.release;
  const assets = r.assets.map((a) => `[${a.name}](${a.browser_download_url})`).join('\n');
  body = {
    content: `${role ? `<@&${role}> ` : ''}**${app} ${r.tag_name}** is out!`,
    allowed_mentions: { roles: role ? [role] : [] },
    embeds: [{
      title: r.name || r.tag_name, url: r.html_url, color: 0xffb347,
      description: (r.body || '').slice(0, 4000),
      fields: [{ name: 'Download', value: (assets || `[Release page](${r.html_url})`).slice(0, 1024) }],
      timestamp: r.published_at,
    }],
  };
} else if (e.commits?.length) {
  const n = e.commits.length;
  const lines = e.commits.slice(-10).map((c) => `[\`${c.id.slice(0, 7)}\`](${c.url}) ${c.message.split('\n')[0].slice(0, 100)}`);
  if (n > 10) lines.unshift(`…and ${n - 10} earlier`);
  body = {
    embeds: [{
      author: { name: e.sender.login, icon_url: e.sender.avatar_url, url: e.sender.html_url },
      title: `[${app}:${e.ref.replace('refs/heads/', '')}] ${n} new commit${n === 1 ? '' : 's'}`,
      url: e.compare, color: 0x3ddc97, description: lines.join('\n'), timestamp: e.head_commit?.timestamp,
    }],
  };
} else process.exit(0);

const res = await fetch(process.env.DISCORD_WEBHOOK + '?wait=true', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
if (!res.ok) { console.error(res.status, await res.text()); process.exit(1); }
