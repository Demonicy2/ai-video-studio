import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repoRoot);
const logFile = path.join(repoRoot, 'storage', 'github-push.log');
fs.mkdirSync(path.dirname(logFile), { recursive: true });

async function main() {
  // 1. Retrieve GitHub token from git credential manager
  const credInput = 'protocol=https\nhost=github.com\n\n';
  const credOut = execSync('git credential fill', {
    input: credInput,
    encoding: 'utf-8',
  });

  const lines = Object.fromEntries(
    credOut
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx), l.slice(idx + 1)];
      })
  );

  const token = lines.password;
  if (!token) {
    throw new Error('No GitHub token returned by git credential manager');
  }

  // 2. Get authenticated user login
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AI-Video-Studio-Uploader',
    },
  });
  if (!userRes.ok) {
    throw new Error(`GitHub /user failed with status ${userRes.status}`);
  }
  const userData = (await userRes.json()) as { login: string };
  const owner = userData.login;
  const repoName = 'ai-video-studio';

  // 3. Create repository if it does not exist yet
  const createRes = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'AI-Video-Studio-Uploader',
    },
    body: JSON.stringify({
      name: repoName,
      description: 'AI Video Studio — Web app tạo video ngắn AI từ kịch bản/prompt (Next.js, TypeScript, Prisma, FFmpeg)',
      private: false,
      auto_init: false,
    }),
  });

  if (createRes.status === 201) {
    console.log(`Created new GitHub repository: https://github.com/${owner}/${repoName}`);
  } else if (createRes.status === 422) {
    console.log(`Repository https://github.com/${owner}/${repoName} already exists; pushing updates...`);
  } else {
    const errText = await createRes.text();
    throw new Error(`Failed to create GitHub repo (${createRes.status}): ${errText}`);
  }

  // 4. Configure remote and push main branch
  const remoteUrl = `https://github.com/${owner}/${repoName}.git`;
  try {
    execSync('git remote remove origin', { stdio: 'ignore' });
  } catch {}
  execSync(`git remote add origin ${remoteUrl}`, { stdio: 'inherit' });
  execSync('git push -u origin main --force', { stdio: 'inherit' });

  const msg = `SUCCESS: Pushed to https://github.com/${owner}/${repoName}`;
  fs.writeFileSync(logFile, msg + '\n', 'utf-8');
  console.log(msg);
}

main().catch((err) => {
  fs.writeFileSync(logFile, `ERROR: ${err.message}\n`, 'utf-8');
  console.error('GitHub push error:', err.message);
  process.exit(1);
});
