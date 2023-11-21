---
layout: doc.liquid
title: getting started
---
# Cloning a Subdomain

To connect a new clone to a Gateway subdomain, use the configuration provided in the domain creation response. For Socket.io messaging (the default), the configuration will look something like this:

```json
{
  "@domain": "{{ subdomain }}.{{ account }}.{{ '{{ domain }}' }}",
  "genesis": false,
  "io": {
    "uri": "{{ '{{ origin }}' }}",
    "opts": {}
  }
}
```

For a [UUID subdomain](uuid-subdomains):
- The `opts` object will be missing (no authorisation information is needed).
- The `genesis` flag will be missing, as the Gateway does not know whether the subdomain already exists. If the domain does not already exist according to your app, set the `genesis` flag to `true`.

For a [named subdomain](named-subdomains), the `opts` object will take one of the following two forms:
- If the account allows [JWT authentication](accounts#remotes-authentication-options), a JWT will be provided, signed by the account:
  ```json
  {
    "auth": {
      "jwt": "≪jwt≫"
    }
  }
  ```
- Otherwise, the account will be echoed, with a placeholder for the account key:
  ```json
  {
    "auth": {
      "user": "{{ account }}",
      "key": "{{ accountKey }}"
    }
  }
  ```
  It's up to the app to replace the `"key"` placeholder with the account key (it's always a placeholder, even if you used the account key to create the subdomain).

Finally, prior to using the config, you need to an `"@id"` key with a unique clone identifier for any new clone you create.

For example, using the [JavaScript engine](https://js.m-ld.org/):

```javascript
import { uuid, clone } from '@m-ld/m-ld';
import { IoRemotes } from '@m-ld/m-ld/ext/socket.io';
import { MemoryLevel } from 'memory-level';

function startClone(config) {
  config['@id'] = uuid();
  return clone(new MemoryLevel(), IoRemotes, config);
}
```
