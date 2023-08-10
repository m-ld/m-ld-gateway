---
layout: doc.liquid
title: getting started
---
# Cloning a Subdomain

To connect a new clone to a Gateway subdomain, use the configuration provided in the domain creation response. For Socket.io messaging (the default), the configuration will look like this:

```json
{
  "@domain": "{{ subdomain }}.{{ account }}.{{ '{{ domain }}' }}",
  "genesis": false,
  "io": {
    "uri": "{{ '{{ origin }}' }}",
    "opts": {
      "auth": {
        "user": "{{ account }}",
        "key": "{{ accountKey }}"
      }
    }
  }
}
```

(Note that for [UUID subdomains](uuid-subdomains), the `genesis` flag will be missing, as the Gateway does not know whether the subdomain already exists.)

To use this config, augment it as follows:
1. Add an `"@id"` key with a unique clone identifier.
2. Replace the `"key"` placeholder (if it exists; it's always a placeholder, even if you used the account key to create the subdomain).
3. For UUID subdomains, if the domain does not already exist, set the `genesis` flag to `true`.

For example, using the [JavaScript engine](https://js.m-ld.org/):

```javascript
import { uuid, clone } from '@m-ld/m-ld';
import { IoRemotes } from '@m-ld/m-ld/ext/socket.io';
import { MemoryLevel } from 'memory-level';

function startClone(config) {
  config['@id'] = uuid();
  config.io.opts.auth.key = 'my-key';
  return clone(new MemoryLevel(), IoRemotes, config);
}
```

You will note that this requires the client to have access to the account key. If the current user is the account owner and their code is running in a secure environment, for example an operating system with a user login, this may be fine. Otherwise, it would be better to derive a user login token with restricted lifetime from the account key.

> 🚧 More detail on user tokens will be available here soon.