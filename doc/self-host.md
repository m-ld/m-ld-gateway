---
layout: page.liquid
title: self-hosting setup
---
# Hosting a Gateway

## build
```shell
npm run build
```

## start
The server needs at least the following environment variables:

| variable                  | example                                   | comments            |
|---------------------------|-------------------------------------------|---------------------|
| M_LD_GATEWAY_AUTH__KEY    | `rootacc.keyid:0gcsqgsib3dqebaquaa4gna`   | Root API access key |
| M_LD_GATEWAY_KEY__PUBLIC  | `MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKB...` | Root public key     |
| M_LD_GATEWAY_KEY__PRIVATE | `MIIC3TBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG...`  | Root private key    |
| M_LD_GATEWAY_GATEWAY      | `my-imac.local`                           | External hostname   |
| M_LD_GATEWAY_DATA_PATH    | `./local/edge/gw/data`                    | Path for data       |

[//]: # (@Petra: suggestion: Let's clarify what should be here. Is this a directory? A file?)

The root API access key must be of the form `rootacc.keyid:secret`, where `rootacc` and `keyid` are at least 5 characters of lowercase text. The `rootacc` will be the root account name. The `keyid` and `secret` should be random UTF-8 text; the `secret` should be at least 22 characters.

(Note the components are never used separately; once created, you always use the whole key.)

The external hostname is used for HTTPS and websocket connections to the Gateway from clients.

The data path can be omitted, in which case a local path will be used in an OS-specific application data area.

For convenience these variables can be specified in a `.env` file in the working directory.

```shell
npm run start -- --genesis true
```

The `genesis` flag indicates that this is the first gateway of a potential cluster and must be included for the first startup.
