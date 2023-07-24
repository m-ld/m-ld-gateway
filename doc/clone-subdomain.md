---
layout: page.liquid
title: getting started
---
# Cloning a Subdomain

To connect a new clone to a Gateway subdomain, use the configuration provided in the domain creation response. For Socket.io messaging (the default), the configuration will look like this:

```json
{
  "@domain": "my-subdomain.my-account.my-gateway",
  "genesis": false,
  "io": {
    "uri": "https://my-gateway/",
    "opts": {
      "auth": {
        "user": "my-account",
        "key": "≪your-auth-key≫"
      }
    }
  }
}
```

Note that for [UUID subdomains](uuid-subdomains), the `genesis` flag defaults to `true`, as the Gateway does not know whether the subdomain already exists.

To use this config, augment it as follows:
1. Add an `"@id"` key with a unique clone identifier.
2. Replace the `"key"` placeholder (if it exists; it's always a placeholder, even if you used the account key to create the subdomain).
3. For UUID subdomains, if the domain already exists, set the `genesis` flag to `false`.

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

You will note that this requires the client to have access to the account key. If the current user is the account owner and their code is running in a secure environment, for example an operating system with a user login, this may be fine. Otherwise, it would be better to derive a user login token with restricted lifetime from the account key. ![coming soon](https://img.shields.io/badge/-🚧%20coming%20soon-grey)