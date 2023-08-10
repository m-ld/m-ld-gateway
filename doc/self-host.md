---
layout: doc.liquid
title: self-hosting setup
---
# Hosting a Gateway

## build
```
npm run build
```

## environment
The server needs the following environment variables.

| variable                   | example                                   | Default             | comments (see also below)  |
|----------------------------|-------------------------------------------|---------------------|----------------------------|
| M_LD_GATEWAY_GATEWAY       | `example.org`                             | ≪required≫          | External hostname or origin |
| M_LD_GATEWAY_AUTH__KEY     | `rootacc.keyid:0gcsqgsib3dqebaquaa4gna`   | ≪required≫          | Root API access key        |
| M_LD_GATEWAY_KEY__PUBLIC   | `MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKB...` | ≪required≫          | Root public key            |
| M_LD_GATEWAY_KEY__PRIVATE  | `MIIC3TBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG...` | ≪required≫          | Root private key           |
| M_LD_GATEWAY_KEY__TYPE     | `rsa`                                     | `rsa`               | Root key type              |
| M_LD_GATEWAY_DATA_PATH     | `./local/edge/gw/data`                    | OS-specific path    | Directory path for data    |
| M_LD_GATEWAY_ADDRESS__HOST | `localhost`                               | `127.0.0.1` or `::` | Local listen host          |
| M_LD_GATEWAY_ADDRESS__PORT | `3000`                                    | `3000`              | Local listen port          |
| LOG_LEVEL                  | `DEBUG`                                   | `INFO`              | Service stdout log level   |

**We provide a utility script for generating these environment variables:**

```
node ext/genenv.js
```
(For convenience the variables can be specified in a `.env` file in the working directory. You can pipe the output of the script to the file like this: `node ext/genenv.js | tee .env`.)

When using the script, or if you want to generate the variables manually, the following paragraphs provide further details.

The **external hostname or origin** is used for HTTP and websocket connections to the Gateway from clients. If no protocol is included, it will be `https`. The hostname will also be used as the root name for **m-ld** domains.

(Note that the Gateway needs to know a host and port to bind to when it starts up. If these are not the same as the external origin – for example because the Gateway is running behind a proxy – you can also set the [**local listen hostname** and port](https://nodejs.org/docs/latest-v16.x/api/net.html#serverlistenoptions-callback) using `M_LD_GATEWAY_ADDRESS__HOST` and `M_LD_GATEWAY_ADDRESS__PORT`.)

The **root API access key** will be of the form `rootacc.keyid:secret`, where `rootacc` and `keyid` are at least 5 characters of lowercase text. The `rootacc` will be the root account name. The `keyid` and `secret` should be random UTF-8 text; the `secret` should be at least 22 characters.

(Note the components are never used separately; once created, you always use the whole key, e.g. for HTTP Basic Authorization.)

The **root public key** is an RSA public key of type SPKI and encoded with DER and base64 (note: not PEM). The corresponding **root private key** is of type PKCS8, encrypted with AES-256-CBC using the root API access key, and encoded with DER and base64. Note that `rsa` is the only supported **root key type** at present (and can be omitted).

The **directory path for data** should point to a volume with capacity for the all the data managed by the Gateway. It can be omitted, in which case an OS-specific data area on the local file system will be used.

## start
```
npm run start -- --genesis true
```

The `genesis` flag indicates that this is the first gateway of a potential cluster, and must be included for the first startup.
