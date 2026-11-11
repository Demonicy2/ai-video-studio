import { prisma } from '../lib/db.ts';
import { hashPassword } from '../lib/auth.ts';

export async function ensureDemoUser() {
  const email = 'demo@aivideostudio.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  return await prisma.user.create({
    data: {
      email,
      name: 'Demo Creator',
      passwordHash: hashPassword('password123'),
    },
  });
}

if (process.argv[1]?.endsWith('seed.ts')) {
  ensureDemoUser().then((u) => {
    console.log('Seeded user:', u.email);
  });
}
