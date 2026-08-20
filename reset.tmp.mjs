import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
await p.sessionSlot.updateMany({ where: { sessionId: 'cmszfz7r60000gu3r0wy3oap1' }, data: { confirmedPitch: null } });
console.log('dev slots reset to no pitch');
await p.$disconnect();
