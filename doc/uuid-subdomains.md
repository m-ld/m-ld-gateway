---
layout: doc.liquid
title: uuid subdomains
---

[//]: # (cURLs in this file are generated from the .http file using http-client.env.json)

# Using UUID Subdomains

UUID subdomains are _unmanaged_ by the Gateway, and are not backed up. The Gateway provides a message relay to allow clones on the subdomain to communicate.

To use UUID subdomains, you first need [an account](accounts).

- If you are using the **m-ld** cloud Gateway, you can get started with the `public` account, which is already enabled for UUID subdomains and anonymous authentication (so you can skip the following step).
- If your Gateway is self-hosted, you can get started with the _root_ account, which was created when the Gateway was first deployed.

## enabling UUID domains

By default, a Gateway account only allows [named subdomains](named-subdomains). To enable UUID subdomains for an account:

```bash
curl -X PATCH --location "https://≪gateway≫/api/v1/user/≪account name≫" \
    -H "Content-Type: application/json" \
    -d "{ \"@insert\": { \"naming\": \"uuid\" } }" \
    --basic --user ≪account name≫:≪account key≫
```

## creating a UUID domain

Because a UUID domain is not managed by the Gateway, you can create a UUID subdomain at any time in a client or server and connect its clones via the Gateway.

The domain name must take the form `≪uuid≫.my-account.my-gateway`, where `≪uuid≫` is a 25-character pseudo-random [CUID](https://github.com/paralleldrive/cuid#original-documentation-follows) (Collision Resistant Unique Identifier), starting with the character `c` and containing only lowercase US-English letters and digits. (Note that this is not an RFC 4122 UUID.)

For convenience, you can request suitable configuration for a new UUID subdomain from the Gateway, as follows. Note that this does not create anything new on the Gateway, but it will generate a compliant UUID for the domain name.

```bash
curl -X POST --location "https://≪gateway≫/api/v1/domain/≪account name≫" \
    -H "Accept: application/json"
```

With the resultant configuration (or one you have created from scratch) you can [clone the subdomain](clone-subdomain).