import { clone, uuid } from 'https://edge.js.m-ld.org/ext/index.mjs';
import { MemoryLevel } from 'https://edge.js.m-ld.org/ext/memory-level.mjs';
import { IoRemotes } from 'https://edge.js.m-ld.org/ext/socket.io.mjs';

const domainId = uuid();

const meld = await clone(new MemoryLevel(), IoRemotes, {
  '@id': uuid(),
  '@domain': `${domainId}.public.{{ '{{ domain }}' }}`,
  genesis: true, // Other clones will have `false`
  io: { uri: "{{ '{{ origin }}' }}" }
});

// Tell other clones the domain ID so they can join!
